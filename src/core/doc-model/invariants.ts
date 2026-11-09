import { assertNever } from './assert-never';
import { isValidElement } from './elements';
import { idNumber, type IdKind } from './ids';
import type { Anchor, Doc, DrawObject, Point, Rect, TextRun } from './types';

/** Invariant numbers follow SPEC-doc-model.md "Invariants". */
export type InvariantCode =
  // 1
  | 'bond-missing-atom'
  | 'self-bond'
  // 2
  | 'duplicate-bond'
  // 3
  | 'zorder-unknown-object'
  | 'zorder-duplicate'
  | 'zorder-missing-object'
  // 4
  | 'unknown-anchor-target'
  | 'unknown-caption-target'
  // 5
  | 'attachment-not-arrow'
  // 6
  | 'unknown-group-member'
  | 'multiple-groups'
  // 7
  | 'non-finite'
  | 'charge-out-of-range'
  | 'invalid-color'
  | 'fill-opacity-out-of-range'
  | 'negative-rect-size'
  | 'anchor-t-out-of-range'
  // 8
  | 'invalid-next-id'
  | 'invalid-id'
  | 'id-key-mismatch'
  | 'id-out-of-range'
  | 'invalid-element';

export interface InvariantViolation {
  readonly invariant: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly code: InvariantCode;
  /** The offending item's id, when there is one. */
  readonly id?: string;
  readonly message: string;
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** All violations of the document invariants; `[]` means the doc is valid. */
export function checkInvariants(doc: Doc): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  const add = (
    invariant: InvariantViolation['invariant'],
    code: InvariantCode,
    message: string,
    id?: string,
  ): void => {
    out.push(id === undefined ? { invariant, code, message } : { invariant, code, message, id });
  };

  // 8 — ids and element symbols
  const nextIdValid = Number.isSafeInteger(doc.nextId) && doc.nextId >= 1;
  if (!nextIdValid) {
    add(8, 'invalid-next-id', `nextId must be a positive integer, got ${doc.nextId}`);
  }
  const checkIds = (kind: IdKind, record: Readonly<Record<string, { id: string }>>): void => {
    for (const [key, item] of Object.entries(record)) {
      if (item.id !== key) {
        add(8, 'id-key-mismatch', `${kind} stored under '${key}' has id '${item.id}'`, key);
      }
      const n = idNumber(kind, key);
      if (n === null) add(8, 'invalid-id', `'${key}' is not a valid ${kind} id`, key);
      else if (nextIdValid && n >= doc.nextId) {
        add(8, 'id-out-of-range', `'${key}' is not below nextId ${doc.nextId}`, key);
      }
    }
  };
  checkIds('atom', doc.atoms);
  checkIds('bond', doc.bonds);
  checkIds('object', doc.objects);
  checkIds('group', doc.groups);

  // Shared value checks (7)
  const finite = (id: string, what: string, ...values: number[]): void => {
    if (!values.every(Number.isFinite)) add(7, 'non-finite', `${what} is not finite`, id);
  };
  const point = (id: string, what: string, p: Point): void => finite(id, what, p.x, p.y);
  const rect = (id: string, r: Rect): void => {
    finite(id, 'rect', r.x, r.y, r.w, r.h);
    if (r.w < 0 || r.h < 0) add(7, 'negative-rect-size', 'rect has negative size', id);
  };
  const color = (id: string, c: string | undefined): void => {
    if (c !== undefined && !COLOR_RE.test(c)) {
      add(7, 'invalid-color', `'${c}' is not #rrggbb`, id);
    }
  };
  const runs = (id: string, rs: readonly TextRun[] | undefined): void => {
    for (const r of rs ?? []) color(id, r.color);
  };
  const anchor = (id: string, a: Anchor): void => {
    switch (a.kind) {
      case 'point':
        point(id, 'anchor', a.p);
        break;
      case 'atom':
        if (!(a.atom in doc.atoms)) {
          add(4, 'unknown-anchor-target', `anchor refers to unknown atom '${a.atom}'`, id);
        }
        if (a.offset) point(id, 'anchor offset', a.offset);
        break;
      case 'bond':
        if (!(a.bond in doc.bonds)) {
          add(4, 'unknown-anchor-target', `anchor refers to unknown bond '${a.bond}'`, id);
        }
        if (a.t !== undefined) {
          finite(id, 'anchor t', a.t);
          if (a.t < 0 || a.t > 1) add(7, 'anchor-t-out-of-range', 'anchor t not in [0,1]', id);
        }
        break;
      default:
        assertNever(a);
    }
  };

  // Atoms (7, 8)
  for (const atom of Object.values(doc.atoms)) {
    finite(atom.id, 'atom position', atom.x, atom.y);
    if (!(Number.isInteger(atom.charge) && atom.charge >= -4 && atom.charge <= 4)) {
      add(7, 'charge-out-of-range', `charge ${atom.charge} not an integer in [-4, 4]`, atom.id);
    }
    color(atom.id, atom.color);
    if (!isValidElement(atom.element)) {
      add(8, 'invalid-element', `unknown element '${atom.element}'`, atom.id);
    }
  }

  // Bonds (1, 2, 7)
  const pairs = new Map<string, string>();
  for (const bond of Object.values(doc.bonds)) {
    if (!(bond.a1 in doc.atoms) || !(bond.a2 in doc.atoms)) {
      add(1, 'bond-missing-atom', `bond refers to a missing atom`, bond.id);
    }
    if (bond.a1 === bond.a2) add(1, 'self-bond', `bond joins '${bond.a1}' to itself`, bond.id);
    const key = bond.a1 < bond.a2 ? `${bond.a1}|${bond.a2}` : `${bond.a2}|${bond.a1}`;
    const other = pairs.get(key);
    if (other !== undefined) {
      add(2, 'duplicate-bond', `bond duplicates '${other}' (same atom pair)`, bond.id);
    } else pairs.set(key, bond.id);
    color(bond.id, bond.color);
  }

  // zOrder (3)
  const seen = new Set<string>();
  for (const id of doc.zOrder) {
    if (!(id in doc.objects)) add(3, 'zorder-unknown-object', `zOrder has unknown '${id}'`, id);
    if (seen.has(id)) add(3, 'zorder-duplicate', `'${id}' appears in zOrder more than once`, id);
    seen.add(id);
  }
  for (const id of Object.keys(doc.objects)) {
    if (!seen.has(id)) add(3, 'zorder-missing-object', `'${id}' is missing from zOrder`, id);
  }

  // Objects (4, 5, 7)
  for (const obj of Object.values(doc.objects)) checkObject(obj);

  function checkObject(obj: DrawObject): void {
    const id = obj.id;
    switch (obj.type) {
      case 'arrow':
        point(id, 'arrow start', obj.from);
        point(id, 'arrow end', obj.to);
        break;
      case 'curved-arrow':
        anchor(id, obj.from);
        anchor(id, obj.to);
        finite(id, 'bend', obj.bend);
        break;
      case 'plus':
        point(id, 'position', obj.at);
        break;
      case 'text':
        point(id, 'position', obj.at);
        runs(id, obj.runs);
        if (obj.attachedTo && doc.objects[obj.attachedTo.arrow]?.type !== 'arrow') {
          add(
            5,
            'attachment-not-arrow',
            `attachedTo '${obj.attachedTo.arrow}' is not an arrow`,
            id,
          );
        }
        break;
      case 'caption':
        runs(id, obj.runs);
        for (const atom of obj.target) {
          if (!(atom in doc.atoms)) {
            add(4, 'unknown-caption-target', `caption targets unknown atom '${atom}'`, id);
          }
        }
        break;
      case 'callout':
        point(id, 'position', obj.at);
        runs(id, obj.runs);
        anchor(id, obj.anchor);
        break;
      case 'bracket':
        rect(id, obj.rect);
        runs(id, obj.corner);
        break;
      case 'shape':
        rect(id, obj.rect);
        color(id, obj.stroke);
        color(id, obj.fill);
        if (!(obj.fillOpacity >= 0 && obj.fillOpacity <= 1)) {
          add(7, 'fill-opacity-out-of-range', `fillOpacity ${obj.fillOpacity} not in [0,1]`, id);
        }
        break;
      default:
        assertNever(obj);
    }
  }

  // Groups (6)
  const owner = new Map<string, string>();
  for (const group of Object.values(doc.groups)) {
    const members = [
      ...group.members.atoms.map((m) => [m, m in doc.atoms] as const),
      ...group.members.objects.map((m) => [m, m in doc.objects] as const),
    ];
    for (const [member, exists] of members) {
      if (!exists) {
        add(6, 'unknown-group-member', `group has unknown member '${member}'`, group.id);
      }
      const prev = owner.get(member);
      if (prev !== undefined && prev !== group.id) {
        add(6, 'multiple-groups', `'${member}' is in groups '${prev}' and '${group.id}'`, member);
      } else if (prev === group.id) {
        add(6, 'multiple-groups', `'${member}' is listed twice in '${group.id}'`, member);
      }
      owner.set(member, group.id);
    }
  }

  return out;
}

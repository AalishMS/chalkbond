import fc from 'fast-check';
import { addAtom, updateAtom } from '../atoms';
import { addBond, updateBond } from '../bonds';
import { deleteItems } from '../delete';
import { DocError } from '../errors';
import { rotation, scaling, translation } from '../geometry';
import { redo, transact, undo, type History } from '../history';
import { mergeAtoms } from '../merge';
import { addObject, updateObject, type ObjectInit, type ObjectPatch } from '../objects';
import { extract, insert } from '../subdoc';
import { transformItems } from '../transform';
import type {
  Affine,
  Anchor,
  AtomId,
  BondId,
  Doc,
  ObjectId,
  Point,
  Selection,
  TextRun,
} from '../types';

// Random edit sequences for the property tests. Commands refer to items by index (resolved
// modulo the current count), so any command can run against any doc. A command that a doc
// rejects (DocError) is skipped, exactly as the editor would surface it to the user.

const coord = fc.double({ min: -20, max: 20, noNaN: true }).map((v) => v + 0);
const point = fc.record({ x: coord, y: coord });
const idx = fc.nat({ max: 1000 });
const color = fc.constantFrom('#ff0000', '#0000ff', '#33aa33') as fc.Arbitrary<`#${string}`>;
const runs: fc.Arbitrary<TextRun[]> = fc.array(
  fc.record(
    {
      text: fc.constantFrom('H', '2', 'SO', '4', 'Δ', 'hν', '1', '‡'),
      script: fc.constantFrom('sub' as const, 'sup' as const),
      bold: fc.boolean(),
      color,
    },
    { requiredKeys: ['text'] },
  ),
  { minLength: 1, maxLength: 3 },
);
const picks = fc.record({
  atoms: fc.array(idx, { maxLength: 4 }),
  bonds: fc.array(idx, { maxLength: 3 }),
  objects: fc.array(idx, { maxLength: 3 }),
});
const affine: fc.Arbitrary<Affine> = fc.oneof(
  fc.tuple(coord, coord).map(([dx, dy]) => translation(dx, dy)),
  fc
    .tuple(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), point)
    .map(([r, c]) => rotation(r, c)),
  fc
    .tuple(fc.constantFrom(0.5, 2, -1), fc.constantFrom(0.5, 1, -1), point)
    .map(([sx, sy, c]) => scaling(sx, sy, c)),
);
const anchorSpec = fc.oneof(
  point.map((p) => ({ kind: 'point' as const, p })),
  fc.record({
    kind: fc.constant('atom' as const),
    i: idx,
    offset: fc.option(point, { nil: undefined }),
  }),
  fc.record({
    kind: fc.constant('bond' as const),
    i: idx,
    t: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
  }),
);
type AnchorSpec =
  | { kind: 'point'; p: Point }
  | { kind: 'atom'; i: number; offset: Point | undefined }
  | { kind: 'bond'; i: number; t: number | undefined };

const objectSpec = fc.oneof(
  fc.record({
    type: fc.constant('arrow' as const),
    kind: fc.constantFrom('forward' as const, 'equilibrium' as const, 'retro' as const),
    from: point,
    to: point,
  }),
  fc.record({
    type: fc.constant('curved-arrow' as const),
    head: fc.constantFrom('full' as const, 'fishhook' as const),
    from: anchorSpec,
    to: anchorSpec,
    // `+ 0` like `coord`: callers never pass -0 (it can't survive save/open).
    bend: fc.double({ min: -1, max: 1, noNaN: true }).map((v) => v + 0),
  }),
  fc.record({ type: fc.constant('plus' as const), at: point }),
  fc.record({
    type: fc.constant('text' as const),
    at: point,
    runs,
    align: fc.constantFrom('left' as const, 'center' as const),
    arrow: fc.option(idx, { nil: undefined }),
    slot: fc.constantFrom('above' as const, 'below' as const),
  }),
  fc.record({
    type: fc.constant('caption' as const),
    runs,
    targets: fc.array(idx, { minLength: 1, maxLength: 3 }),
  }),
  fc.record({ type: fc.constant('callout' as const), at: point, runs, anchor: anchorSpec }),
  fc.record({
    type: fc.constant('bracket' as const),
    shape: fc.constantFrom('square' as const, 'round' as const),
    x: coord,
    y: coord,
    w: fc.double({ min: 0, max: 5, noNaN: true }),
    h: fc.double({ min: 0, max: 5, noNaN: true }),
  }),
  fc.record({
    type: fc.constant('shape' as const),
    shape: fc.constantFrom('rect' as const, 'ellipse' as const),
    x: coord,
    y: coord,
    w: fc.double({ min: 0, max: 5, noNaN: true }),
    h: fc.double({ min: 0, max: 5, noNaN: true }),
    fillOpacity: fc.double({ min: 0, max: 1, noNaN: true }),
    fill: fc.option(color, { nil: undefined }),
  }),
);

/** Edit commands: every public mutating op, plus coalesced drags. */
export const editCommand = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      op: fc.constant('addAtom' as const),
      at: point,
      element: fc.constantFrom('C', 'N', 'O', 'Cl', 'R'),
      charge: fc.integer({ min: -1, max: 1 }),
    }),
  },
  {
    weight: 5,
    arbitrary: fc.record({
      op: fc.constant('addBond' as const),
      i: idx,
      j: idx,
      order: fc.constantFrom(1 as const, 2 as const, 3 as const, 1.5 as const),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      op: fc.constant('updateAtom' as const),
      i: idx,
      element: fc.constantFrom('C', 'O', 'S'),
      label: fc.option(fc.constantFrom('OMe', 'Ph'), { nil: undefined }),
      color: fc.option(color, { nil: undefined }),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      op: fc.constant('updateBond' as const),
      i: idx,
      order: fc.constantFrom(1 as const, 2 as const, 1.5 as const),
      stereo: fc.constantFrom('none' as const, 'wedge' as const, 'hash' as const),
    }),
  },
  { weight: 4, arbitrary: fc.record({ op: fc.constant('addObject' as const), spec: objectSpec }) },
  {
    weight: 2,
    arbitrary: fc.record({ op: fc.constant('updateObject' as const), i: idx, to: point, runs }),
  },
  { weight: 2, arbitrary: fc.record({ op: fc.constant('delete' as const), picks }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant('merge' as const), i: idx, j: idx }) },
  { weight: 2, arbitrary: fc.record({ op: fc.constant('transform' as const), picks, m: affine }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant('paste' as const), picks, at: point }) },
  {
    weight: 1,
    arbitrary: fc.record({
      op: fc.constant('drag' as const),
      i: idx,
      key: fc.constantFrom('k1', 'k2'),
      moves: fc.array(fc.tuple(coord, coord), { minLength: 1, maxLength: 5 }),
    }),
  },
);
export type EditCommand = typeof editCommand extends fc.Arbitrary<infer C> ? C : never;

/** Edit commands interleaved with undo/redo. */
export const command = fc.oneof(
  { weight: 8, arbitrary: editCommand },
  { weight: 1, arbitrary: fc.constant({ op: 'undo' as const }) },
  { weight: 1, arbitrary: fc.constant({ op: 'redo' as const }) },
);
export type Command = typeof command extends fc.Arbitrary<infer C> ? C : never;

function nth<T>(items: readonly T[], i: number): T | undefined {
  return items.length === 0 ? undefined : items[i % items.length];
}

function ids<T extends string>(rec: Readonly<Record<T, unknown>>): T[] {
  return Object.keys(rec) as T[];
}

function select(doc: Doc, p: { atoms: number[]; bonds: number[]; objects: number[] }): Selection {
  const pick = <T extends string>(all: T[], is: number[]) =>
    new Set(is.map((i) => nth(all, i)).filter((x): x is T => x !== undefined));
  return {
    atoms: pick(ids(doc.atoms), p.atoms),
    bonds: pick(ids(doc.bonds), p.bonds),
    objects: pick(ids(doc.objects), p.objects),
  };
}

/** An anchor spec made concrete against a doc (falls back to a point if the target is missing). */
function anchorFor(doc: Doc, s: AnchorSpec): Anchor {
  if (s.kind === 'atom') {
    const atom = nth(ids(doc.atoms), s.i);
    if (atom) return s.offset ? { kind: 'atom', atom, offset: s.offset } : { kind: 'atom', atom };
  } else if (s.kind === 'bond') {
    const bond = nth(ids(doc.bonds), s.i);
    if (bond) return s.t === undefined ? { kind: 'bond', bond } : { kind: 'bond', bond, t: s.t };
  } else {
    return s;
  }
  return { kind: 'point', p: { x: 0, y: 0 } };
}

type ObjectSpec = typeof objectSpec extends fc.Arbitrary<infer S> ? S : never;

function objectFor(doc: Doc, s: ObjectSpec): ObjectInit {
  switch (s.type) {
    case 'curved-arrow':
      return { ...s, from: anchorFor(doc, s.from), to: anchorFor(doc, s.to) };
    case 'callout':
      return { ...s, anchor: anchorFor(doc, s.anchor) };
    case 'text': {
      const arrows = ids(doc.objects).filter((id) => doc.objects[id]?.type === 'arrow');
      const arrow = s.arrow === undefined ? undefined : nth(arrows, s.arrow);
      const base = { type: 'text' as const, at: s.at, runs: s.runs, align: s.align };
      return arrow ? { ...base, attachedTo: { arrow, slot: s.slot } } : base;
    }
    case 'caption':
      return {
        type: 'caption',
        runs: s.runs,
        target: [...new Set(s.targets.map((i) => nth(ids(doc.atoms), i)))].filter(
          (a): a is AtomId => a !== undefined,
        ),
      };
    case 'bracket':
      return { type: 'bracket', shape: s.shape, rect: { x: s.x, y: s.y, w: s.w, h: s.h } };
    case 'shape': {
      const base = {
        type: 'shape' as const,
        shape: s.shape,
        rect: { x: s.x, y: s.y, w: s.w, h: s.h },
        fillOpacity: s.fillOpacity,
      };
      return s.fill ? { ...base, fill: s.fill } : base;
    }
    default:
      return s;
  }
}

/** The transact recipe for an edit command (a no-op if the doc lacks the items it needs). */
function recipe(c: EditCommand): (d: Doc) => Doc {
  switch (c.op) {
    case 'addAtom':
      return (d) => addAtom(d, { ...c.at, element: c.element, charge: c.charge })[0];
    case 'addBond':
      return (d) => {
        const atoms = ids(d.atoms);
        const a1 = nth(atoms, c.i);
        const a2 = nth(atoms, c.j);
        return a1 && a2 ? addBond(d, a1, a2, { order: c.order })[0] : d;
      };
    case 'updateAtom':
      return (d) => {
        const id = nth(ids(d.atoms), c.i);
        return id ? updateAtom(d, id, { element: c.element, label: c.label, color: c.color }) : d;
      };
    case 'updateBond':
      return (d) => {
        const id = nth(ids<BondId>(d.bonds), c.i);
        return id ? updateBond(d, id, { order: c.order, stereo: c.stereo }) : d;
      };
    case 'addObject':
      return (d) => addObject(d, objectFor(d, c.spec))[0];
    case 'updateObject':
      return (d) => {
        const id = nth(ids<ObjectId>(d.objects), c.i);
        const obj = id && d.objects[id];
        if (!id || !obj) return d;
        const patch: ObjectPatch | null =
          obj.type === 'arrow'
            ? { to: c.to }
            : obj.type === 'text' || obj.type === 'caption' || obj.type === 'callout'
              ? { runs: c.runs }
              : obj.type === 'plus'
                ? { at: c.to }
                : null;
        return patch ? updateObject(d, id, patch) : d;
      };
    case 'delete':
      return (d) => deleteItems(d, select(d, c.picks));
    case 'merge':
      return (d) => {
        const atoms = ids(d.atoms);
        const keep = nth(atoms, c.i);
        const drop = nth(atoms, c.j);
        return keep && drop && keep !== drop ? mergeAtoms(d, keep, drop) : d;
      };
    case 'transform':
      return (d) => transformItems(d, select(d, c.picks), c.m);
    case 'paste':
      return (d) => insert(d, extract(d, select(d, c.picks)), c.at)[0];
    case 'drag':
      throw new Error('drag is applied as several transactions');
  }
}

/** Applies one command to a history; rejected edits (DocError) leave it unchanged. */
export function run(h: History, c: Command): History {
  if (c.op === 'undo') return undo(h);
  if (c.op === 'redo') return redo(h);
  try {
    if (c.op === 'drag') {
      for (const [dx, dy] of c.moves) {
        h = transact(
          h,
          'Move',
          (d) => {
            const id = nth(ids(d.atoms), c.i);
            const atom = id && d.atoms[id];
            return id && atom ? updateAtom(d, id, { x: atom.x + dx, y: atom.y + dy }) : d;
          },
          { coalesceKey: c.key },
        );
      }
      return h;
    }
    return transact(h, c.op, recipe(c));
  } catch (e) {
    if (e instanceof DocError) return h;
    throw e;
  }
}

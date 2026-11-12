// Reaction text in the name field (SPEC-editor.md N3, R14): `ethanol + acetic acid -> ethyl
// acetate + water` split into parts, plus signs and arrows, and the scheme built and laid out by
// the Tidy rules TR2-TR5. Pure: text in, a commit recipe out.
import {
  addObject,
  emptyDoc,
  insert,
  type ArrowKind,
  type AtomId,
  type Doc,
  type ObjectId,
  type Point,
  type SubDoc,
} from '@core/doc-model';
import { render, type Scene } from '@core/svg-render';
import { rectCenter, type Rect } from './geometry';
import { subInk } from './placement';
import { addArrow, addPlus } from './reaction-ops';
import { EMPTY_SELECTION } from '../state/editor-state';
import { applyTidy, planTidy } from './tidy';

/** R14: the arrow tokens, longest first, and what they draw. */
const ARROWS: readonly { token: string; kind: ArrowKind }[] = [
  { token: '<=>', kind: 'equilibrium' },
  { token: '⇌', kind: 'equilibrium' },
  { token: '->', kind: 'forward' },
  { token: '→', kind: 'forward' },
  { token: '=>', kind: 'forward' },
];

/** A compound of the scheme: its name as typed (after any coefficient) and where it stands. */
export interface SchemePart {
  readonly kind: 'part';
  readonly name: string;
  /** The integer in front (`2 H2O`), else null. */
  readonly coefficient: string | null;
  /** The name's span in the typed text: `text.slice(start, end) === name`. */
  readonly start: number;
  readonly end: number;
}

export type SchemeToken =
  SchemePart | { readonly kind: 'plus' } | { readonly kind: 'arrow'; readonly arrow: ArrowKind };

export type ParsedScheme =
  /** No arrow token: one name (N2). */
  | { readonly kind: 'single' }
  /** An arrow with a missing part or side: nothing to insert. */
  | { readonly kind: 'invalid' }
  | { readonly kind: 'scheme'; readonly items: readonly SchemeToken[] };

const isSpace = (c: string | undefined): boolean => c !== undefined && /\s/.test(c);

function arrowAt(text: string, i: number): { token: string; kind: ArrowKind } | undefined {
  return ARROWS.find((a) => text.startsWith(a.token, i));
}

/**
 * Whether the `+` at `i` is a charge sign (`NH4+`, `Fe3+`) rather than a separator: it touches
 * the character before it, and what follows is a space, the end of the text, an arrow or another
 * `+`. Every other `+` separates parts.
 */
function isCharge(text: string, i: number): boolean {
  const prev = text[i - 1];
  if (prev === undefined || isSpace(prev)) return false;
  const next = text[i + 1];
  return next === undefined || isSpace(next) || next === '+' || arrowAt(text, i + 1) !== undefined;
}

type Cut = { at: number; end: number; token: SchemeToken & { kind: 'plus' | 'arrow' } };

/** The arrow tokens and separating `+` outside brackets and parentheses, left to right. */
function cuts(text: string): Cut[] {
  const found: Cut[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const arrow = arrowAt(text, i);
      if (arrow !== undefined) {
        found.push({
          at: i,
          end: i + arrow.token.length,
          token: { kind: 'arrow', arrow: arrow.kind },
        });
        i += arrow.token.length - 1;
      } else if (c === '+' && !isCharge(text, i)) {
        found.push({ at: i, end: i + 1, token: { kind: 'plus' } });
      }
    }
  }
  return found;
}

/** R9: the text has an arrow token or a separating `+` (outside brackets and parentheses). */
export function hasSchemeSyntax(text: string): boolean {
  return cuts(text).length > 0;
}

/** N3: a coefficient is an integer and a space in front of the name. */
const COEFFICIENT = /^(\d+)\s+(\S[\s\S]*)$/;

function partOf(text: string, from: number, to: number): SchemePart | null {
  let start = from;
  let end = to;
  while (start < end && isSpace(text[start])) start++;
  while (end > start && isSpace(text[end - 1])) end--;
  if (start === end) return null;
  const m = COEFFICIENT.exec(text.slice(start, end));
  if (m === null)
    return { kind: 'part', name: text.slice(start, end), coefficient: null, start, end };
  const name = m[2] as string;
  return { kind: 'part', name, coefficient: m[1] as string, start: end - name.length, end };
}

/**
 * N3: split `text` at arrow tokens and at `+` that separates parts. Brackets and parentheses
 * protect what is inside; a `+` that touches a formula and is followed by a space, the end, an
 * arrow or another `+` is its charge (see `isCharge`).
 */
export function parseScheme(text: string): ParsedScheme {
  const all = cuts(text);
  if (!all.some((c) => c.token.kind === 'arrow')) return { kind: 'single' };
  const items: SchemeToken[] = [];
  let from = 0;
  for (const cut of [...all, null]) {
    const part = partOf(text, from, cut === null ? text.length : cut.at);
    if (part === null) return { kind: 'invalid' };
    items.push(part);
    if (cut === null) break;
    items.push(cut.token);
    from = cut.end;
  }
  return { kind: 'scheme', items };
}

// ---- building --------------------------------------------------------------------------------

/** One thing to put in the scheme, in reading order. */
export type SchemeItem =
  | { readonly kind: 'structure'; readonly sub: SubDoc }
  | { readonly kind: 'coefficient'; readonly text: string }
  | { readonly kind: 'plus' }
  | { readonly kind: 'arrow'; readonly arrow: ArrowKind };

/** N3: the ink box of the scheme sits 1.5 BLU below an existing drawing. */
export const SCHEME_BELOW_GAP = 1.5;
/** Centre spacing (BLU) of the scratch row; only the left-to-right order of centres matters. */
const ROUGH_STEP = 10;
const ROUGH_ARROW = 2.5;

type Placed =
  | { readonly kind: 'structure'; readonly sub: SubDoc; readonly atom: AtomId; readonly at: Point }
  | { readonly kind: 'coefficient'; readonly text: string; readonly id: ObjectId }
  | { readonly kind: 'plus'; readonly id: ObjectId }
  | { readonly kind: 'arrow'; readonly arrow: ArrowKind; readonly id: ObjectId };

const scaled = (r: Rect, k: number): Rect => ({ x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k });

/**
 * N3: the scheme as one commit recipe. It is built in a scratch document (items in a rough row),
 * laid out by TR2-TR5 (`planTidy` / `applyTidy`), shifted into place (empty document: ink box
 * centred on `canvasCentre`; else its left edge at the drawing's left and its top 1.5 BLU below
 * the drawing), and the recipe replays the final positions into the real document.
 */
export function buildScheme(
  doc: Doc,
  scene: Scene,
  items: readonly SchemeItem[],
  canvasCentre: Point,
): { readonly recipe: (doc: Doc) => Doc } {
  const now = doc.meta.created;
  let scratch: Doc = { ...emptyDoc(now), style: doc.style };
  const placed: Placed[] = [];
  items.forEach((item, i) => {
    const cx = i * ROUGH_STEP;
    if (item.kind === 'structure') {
      const ink = subInk(item.sub, doc.style, now) ?? { x: 0, y: 0, w: 0, h: 0 };
      const c = rectCenter(ink);
      const at = { x: cx - c.x, y: -c.y };
      const [next, sel] = insert(scratch, item.sub, at);
      scratch = next;
      placed.push({ kind: 'structure', sub: item.sub, atom: [...sel.atoms][0] as AtomId, at });
    } else if (item.kind === 'coefficient') {
      const [next, id] = addObject(scratch, {
        type: 'text',
        at: { x: cx, y: 0 },
        runs: [{ text: item.text }],
        align: 'center',
      });
      scratch = next;
      placed.push({ kind: 'coefficient', text: item.text, id });
    } else if (item.kind === 'plus') {
      const [next, id] = addPlus(scratch, { x: cx, y: 0 });
      scratch = next;
      placed.push({ kind: 'plus', id });
    } else {
      const ends = {
        from: { x: cx - ROUGH_ARROW / 2, y: 0 },
        to: { x: cx + ROUGH_ARROW / 2, y: 0 },
      };
      const [next, id] = addArrow(scratch, ends, item.arrow);
      scratch = next;
      placed.push({ kind: 'arrow', arrow: item.arrow, id });
    }
  });

  const untidy = scratch;
  const plan = planTidy(scratch, EMPTY_SELECTION);
  const final = plan === null ? scratch : applyTidy(scratch, plan);
  const finalScene = render(final);
  const k = 1 / finalScene.style.ptPerBlu;
  const ink = finalScene.bounds === null ? null : scaled(finalScene.bounds, k);

  let shift: Point = { x: 0, y: 0 };
  if (ink !== null) {
    const bounds = scene.bounds === null ? null : scaled(scene.bounds, 1 / scene.style.ptPerBlu);
    shift =
      bounds === null || Object.keys(doc.atoms).length + Object.keys(doc.objects).length === 0
        ? { x: canvasCentre.x - rectCenter(ink).x, y: canvasCentre.y - rectCenter(ink).y }
        : {
            x: bounds.x - ink.x,
            y: bounds.y + bounds.h + SCHEME_BELOW_GAP - ink.y,
          };
  }
  const moved = (p: Point): Point => ({ x: p.x + shift.x, y: p.y + shift.y });

  // The final positions, read once from the scratch document.
  const steps = placed.map((p): ((d: Doc) => Doc) => {
    switch (p.kind) {
      case 'structure': {
        const atom = final.atoms[p.atom];
        const start = untidy.atoms[p.atom];
        const at =
          atom === undefined || start === undefined
            ? p.at
            : { x: p.at.x + atom.x - start.x, y: p.at.y + atom.y - start.y };
        const to = moved(at);
        return (d) => insert(d, p.sub, to)[0];
      }
      case 'coefficient': {
        const obj = final.objects[p.id];
        const at = moved(obj?.type === 'text' ? obj.at : { x: 0, y: 0 });
        return (d) =>
          addObject(d, { type: 'text', at, runs: [{ text: p.text }], align: 'center' })[0];
      }
      case 'plus': {
        const obj = final.objects[p.id];
        const at = moved(obj?.type === 'plus' ? obj.at : { x: 0, y: 0 });
        return (d) => addPlus(d, at)[0];
      }
      case 'arrow': {
        const obj = final.objects[p.id];
        const ends =
          obj?.type === 'arrow'
            ? { from: moved(obj.from), to: moved(obj.to) }
            : { from: moved({ x: 0, y: 0 }), to: moved({ x: ROUGH_ARROW, y: 0 }) };
        return (d) => addArrow(d, ends, p.arrow)[0];
      }
    }
  });
  return { recipe: (d) => steps.reduce((acc, step) => step(acc), d) };
}

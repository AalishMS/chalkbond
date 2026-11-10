// The document edits of the Ring tool (SPEC-editor.md P3-P6): pure functions from a document to a
// document, run outside history for the ghost and inside `transact` for the commit.
import {
  addAtom,
  addBond,
  findBond,
  neighbors,
  type AtomId,
  type BondId,
  type BondOrder,
  type Doc,
  type Point,
} from '@core/doc-model';
import { distance, normalize, rotate } from './geometry';
import { awayDirection } from './placement';
import { apothem, circumradius, ringTemplate, type RingId } from './templates';

/** P6: a new atom within this many BLU of an existing atom is that atom. */
export const MERGE_BLU = 0.15;
/** P5: a pointer this close (BLU) to the bond's line does not choose a side. */
export const SIDE_TIE_BLU = 0.05;

/** Where a ring goes: empty canvas (P3), an atom (P4) or a bond, `p` the pointer in BLU (P5). */
export type RingTarget =
  | { readonly point: Point }
  | { readonly atom: AtomId }
  | { readonly bond: BondId; readonly p: Point };

/** A ring edit: the document it makes, the atom a vertex merged into and the ring's atoms. */
export interface RingEdit {
  readonly doc: Doc;
  readonly merge?: AtomId;
  /** The ring's atoms in order, shared and merged ones included. */
  readonly ring: readonly AtomId[];
}

/** The svg-render key of the circle of the ring through `atoms` (atom ids sorted by number). */
export function ringKey(atoms: readonly AtomId[]): string {
  const sorted = [...atoms].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return `ring:${sorted.join(',')}`;
}

/**
 * The vertices of a regular n-gon through `from` with centre `c`, going round so that `second`
 * (when given) is the next vertex.
 */
function around(n: number, from: Point, c: Point, second?: Point): Point[] {
  const step = 360 / n;
  let sign = 1;
  if (second !== undefined) {
    const forward = rotate(from, step, c);
    sign = distance(forward, second) <= distance(rotate(from, -step, c), second) ? 1 : -1;
  }
  return Array.from({ length: n }, (_, k) => rotate(from, sign * step * k, c));
}

/** P6: the atom of `doc` within 0.15 BLU of `p`, nearest first, that is not in `used`. */
export function mergeCandidate(doc: Doc, p: Point, used: ReadonlySet<AtomId>): AtomId | null {
  let near: AtomId | null = null;
  let best = MERGE_BLU;
  for (const atom of Object.values(doc.atoms)) {
    if (used.has(atom.id)) continue;
    const dist = distance(p, atom);
    if (dist <= best) {
      best = dist;
      near = atom.id;
    }
  }
  return near;
}

interface Fixed {
  readonly at: number;
  readonly atom: AtomId;
}

/**
 * Draws the ring through `vertices` with bond orders `orders` (`orders[i]` joins vertex i and
 * i + 1). A vertex in `fixed` is that existing atom; any other within 0.15 BLU of an existing
 * atom is merged into it (P6); a bond that exists already is kept as it is.
 */
function draw(
  doc: Doc,
  vertices: readonly Point[],
  orders: readonly BondOrder[],
  fixed: readonly Fixed[],
): RingEdit | null {
  let d = doc;
  const used = new Set<AtomId>(fixed.map((f) => f.atom));
  const ids: AtomId[] = [];
  let merge: AtomId | undefined;
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i] as Point;
    const pinned = fixed.find((f) => f.at === i);
    if (pinned !== undefined) {
      ids.push(pinned.atom);
      continue;
    }
    const near = mergeCandidate(doc, v, used);
    if (near !== null) {
      used.add(near);
      merge ??= near;
      ids.push(near);
    } else {
      let id: AtomId;
      [d, id] = addAtom(d, { element: 'C', x: v.x, y: v.y });
      ids.push(id);
    }
  }
  const bondsBefore = Object.keys(d.bonds).length;
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i] as AtomId;
    const b = ids[(i + 1) % ids.length] as AtomId;
    if (a === b || findBond(d, a, b) !== undefined) continue;
    d = addBond(d, a, b, { order: orders[i] ?? 1 })[0];
  }
  const grown = Object.keys(d.atoms).length > Object.keys(doc.atoms).length;
  if (!grown && Object.keys(d.bonds).length === bondsBefore) return null;
  return { doc: d, ring: ids, ...(merge === undefined ? {} : { merge }) };
}

/**
 * P5: which side of the bond a to b the ring goes: +1 is the side of the normal (u.y, -u.x), u the
 * unit vector from a to b. A pointer farther than 0.05 BLU from the line chooses; otherwise the
 * side with fewer neighbour atoms of the two ends, then the higher one, then the right-hand one.
 */
function fuseSide(doc: Doc, a: AtomId, b: AtomId, p: Point): 1 | -1 {
  const pa = doc.atoms[a] as Point;
  const pb = doc.atoms[b] as Point;
  const u = normalize({ x: pb.x - pa.x, y: pb.y - pa.y });
  const normal = { x: u.y, y: -u.x };
  const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  const along = (q: Point): number => (q.x - mid.x) * normal.x + (q.y - mid.y) * normal.y;
  const pointer = along(p);
  if (Math.abs(pointer) > SIDE_TIE_BLU) return pointer > 0 ? 1 : -1;
  let plus = 0;
  let minus = 0;
  for (const end of [a, b]) {
    for (const n of neighbors(doc, end)) {
      if (n === a || n === b) continue;
      if (along(doc.atoms[n] as Point) > 0) plus++;
      else minus++;
    }
  }
  if (plus !== minus) return plus < minus ? 1 : -1;
  if (Math.abs(normal.y) > 1e-9) return normal.y < 0 ? 1 : -1;
  return normal.x > 0 ? 1 : -1;
}

/** Bond orders of benzene fused onto a bond that is not part of an aromatic circle (P5). */
function kekule(n: number, shared: BondOrder): BondOrder[] {
  return Array.from({ length: n }, (_, i) => ((i % 2 === 0) === (shared === 2) ? 2 : 1));
}

/**
 * P3-P5: ring `id` placed on `target`. Null when nothing would be added (every vertex merged into
 * atoms that are already bonded as the ring is).
 */
export function placeRing(doc: Doc, id: RingId, target: RingTarget): RingEdit | null {
  const t = ringTemplate(id);
  const orders: BondOrder[] = Array(t.n).fill(t.aromatic ? 1.5 : 1);
  if ('point' in target) {
    const vertices = t.vertices.map((v) => ({ x: v.x + target.point.x, y: v.y + target.point.y }));
    return draw(doc, vertices, orders, []);
  }
  if ('atom' in target) {
    const origin = doc.atoms[target.atom];
    const dir = awayDirection(doc, target.atom);
    if (!origin || dir === null) return null;
    const r = circumradius(t.n);
    const c = { x: origin.x + dir.x * r, y: origin.y + dir.y * r };
    return draw(doc, around(t.n, origin, c), orders, [{ at: 0, atom: target.atom }]);
  }
  const bond = doc.bonds[target.bond];
  const pa = bond && doc.atoms[bond.a1];
  const pb = bond && doc.atoms[bond.a2];
  if (!bond || !pa || !pb) return null;
  const side = fuseSide(doc, bond.a1, bond.a2, target.p);
  const len = distance(pa, pb);
  const u = normalize({ x: pb.x - pa.x, y: pb.y - pa.y });
  const normal = { x: u.y * side, y: -u.x * side };
  const h = apothem(t.n, len);
  const c = { x: (pa.x + pb.x) / 2 + normal.x * h, y: (pa.y + pb.y) / 2 + normal.y * h };
  const fused = t.aromatic && bond.order !== 1.5 ? kekule(t.n, bond.order) : orders;
  return draw(doc, around(t.n, pa, c, pb), fused, [
    { at: 0, atom: bond.a1 },
    { at: 1, atom: bond.a2 },
  ]);
}

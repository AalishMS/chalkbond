// Ring finding for svg-render (SPEC-svg-render.md "Aromatic circles"). Rings are not stored in
// the document and chem-core exports none, so the smallest ring of each bond (size 3-8) is found
// here, on the stored bonds. Pure functions over doc-model data; deterministic whatever the
// record order of the document.
import type { AtomId, BondId, Doc, Point } from '../doc-model';
import { compareIds, sortedIds } from './order';

export const MIN_RING_SIZE = 3;
export const MAX_RING_SIZE = 8;

export interface Ring {
  /** The ring's atom ids sorted by id number. */
  readonly atoms: readonly AtomId[];
  /** The atoms in walking order around the ring. */
  readonly cycle: readonly AtomId[];
  /** The ring's bonds in walking order: `bonds[i]` joins `cycle[i]` and `cycle[i + 1]`. */
  readonly bonds: readonly BondId[];
}

interface Edge {
  readonly to: AtomId;
  readonly bond: BondId;
}
type Adjacency = ReadonlyMap<AtomId, readonly Edge[]>;

function adjacency(doc: Doc): Adjacency {
  const adj = new Map<AtomId, Edge[]>();
  for (const bondId of sortedIds(doc.bonds)) {
    const bond = doc.bonds[bondId];
    if (!bond || !(bond.a1 in doc.atoms) || !(bond.a2 in doc.atoms) || bond.a1 === bond.a2) {
      continue;
    }
    for (const [from, to] of [
      [bond.a1, bond.a2],
      [bond.a2, bond.a1],
    ] as const) {
      const list = adj.get(from);
      if (list) list.push({ to, bond: bondId });
      else adj.set(from, [{ to, bond: bondId }]);
    }
  }
  for (const list of adj.values()) list.sort((p, q) => compareIds(p.to, q.to));
  return adj;
}

/** Breadth-first distances from `start` without crossing `skip`, up to `maxDepth` edges. */
function distances(
  adj: Adjacency,
  start: AtomId,
  skip: BondId,
  maxDepth: number,
): Map<AtomId, number> {
  const dist = new Map<AtomId, number>([[start, 0]]);
  let frontier: AtomId[] = [start];
  for (let d = 1; d <= maxDepth && frontier.length > 0; d++) {
    const next: AtomId[] = [];
    for (const x of frontier) {
      for (const e of adj.get(x) ?? []) {
        if (e.bond === skip || dist.has(e.to)) continue;
        dist.set(e.to, d);
        next.push(e.to);
      }
    }
    frontier = next;
  }
  return dist;
}

function compareLists(p: readonly string[], q: readonly string[]): number {
  for (let i = 0; i < Math.min(p.length, q.length); i++) {
    const c = compareIds(p[i] as string, q[i] as string);
    if (c !== 0) return c;
  }
  return p.length - q.length;
}

/** Total order on rings: sorted atom ids, then the walking order (only matters on a tie). */
function compareRings(p: Ring, q: Ring): number {
  return compareLists(p.atoms, q.atoms) || compareLists(p.cycle, q.cycle);
}

/** Every shortest ring (size 3-8) through `bondId`: all the tied minimum cycles. */
function minimalRingsOf(doc: Doc, adj: Adjacency, bondId: BondId): Ring[] {
  const bond = doc.bonds[bondId];
  if (!bond) return [];
  const u = bond.a1;
  const v = bond.a2;
  const maxPath = MAX_RING_SIZE - 1;
  const fromU = distances(adj, u, bondId, maxPath);
  const total = fromU.get(v);
  if (total === undefined || total + 1 < MIN_RING_SIZE) return [];
  const fromV = distances(adj, v, bondId, maxPath);

  const rings: Ring[] = [];
  const walk: AtomId[] = [u];
  const walkBonds: BondId[] = [];
  const extend = (x: AtomId, depth: number): void => {
    if (depth === total) {
      if (x === v) {
        const cycle = [...walk];
        rings.push({
          atoms: [...cycle].sort(compareIds),
          cycle,
          bonds: [...walkBonds, bondId],
        });
      }
      return;
    }
    for (const e of adj.get(x) ?? []) {
      if (e.bond === bondId) continue;
      if (fromU.get(e.to) !== depth + 1 || fromV.get(e.to) !== total - depth - 1) continue;
      walk.push(e.to);
      walkBonds.push(e.bond);
      extend(e.to, depth + 1);
      walk.pop();
      walkBonds.pop();
    }
  };
  extend(u, 0);
  return rings;
}

/**
 * For each bond that lies in a ring of size 3-8, its smallest ring (shortest cycle; ties to the
 * lexicographically smallest sorted atom-id list). Entries are in ascending bond-id order.
 * This is the ring the double-bond side rule consults.
 */
export function ringsByBond(doc: Doc): Map<BondId, Ring> {
  const adj = adjacency(doc);
  const out = new Map<BondId, Ring>();
  for (const bondId of sortedIds(doc.bonds)) {
    let best: Ring | undefined;
    for (const ring of minimalRingsOf(doc, adj, bondId)) {
      if (!best || compareRings(ring, best) < 0) best = ring;
    }
    if (best) out.set(bondId, best);
  }
  return out;
}

/**
 * The distinct rings of a document: every ring that is a smallest ring of some bond (all tied
 * minimum rings count, so cubane gives its six faces; naphthalene its two 6-rings, never the
 * 10-ring). Sorted by their sorted atom-id lists.
 */
export function findRings(doc: Doc): Ring[] {
  const adj = adjacency(doc);
  const byKey = new Map<string, Ring>();
  for (const bondId of sortedIds(doc.bonds)) {
    for (const ring of minimalRingsOf(doc, adj, bondId)) {
      const key = ringKey(ring);
      const known = byKey.get(key);
      if (!known || compareRings(ring, known) < 0) byKey.set(key, ring);
    }
  }
  return [...byKey.values()].sort(compareRings);
}

/** Stable key of a ring: its atom ids sorted by number, joined by `,` (the `ring:` item key). */
export function ringKey(ring: Ring): string {
  return ring.atoms.join(',');
}

/** A ring is circled when every one of its own bonds has order 1.5. */
export function isCircled(doc: Doc, ring: Ring): boolean {
  return ring.bonds.every((id) => doc.bonds[id]?.order === 1.5);
}

/** Mean of the ring's atom positions (document units). */
export function ringCentroid(doc: Doc, ring: Ring): Point {
  let x = 0;
  let y = 0;
  for (const id of ring.atoms) {
    const atom = doc.atoms[id];
    x += atom?.x ?? 0;
    y += atom?.y ?? 0;
  }
  return { x: x / ring.atoms.length, y: y / ring.atoms.length };
}

// Ring membership for the structural formula display (SPEC-svg-render.md "Ring atoms",
// Decision 16 (b)): the atoms on a cycle of the bond graph, whatever the ring size or the bond
// orders. Independent of `rings.ts`, which keeps its own job (circles, double-bond sides).
import type { AtomId, BondId, Doc } from '../doc-model';
import { sortedIds } from './order';

interface Edge {
  readonly to: AtomId;
  readonly bond: BondId;
}

/**
 * The atoms that are an end of a bond that is not a bridge (equivalently, that lie on a cycle).
 * One iterative bridge-finding pass (no recursion, so a long chain cannot overflow the stack),
 * atoms and neighbours visited in ascending id order; the result is a set, so order cannot
 * change the output. A self-bond and a bond to a missing atom are ignored.
 */
export function ringAtoms(doc: Doc): ReadonlySet<AtomId> {
  const adjacency = new Map<AtomId, Edge[]>();
  const bonds: { a1: AtomId; a2: AtomId; id: BondId }[] = [];
  for (const id of sortedIds(doc.bonds)) {
    const bond = doc.bonds[id];
    if (!bond || bond.a1 === bond.a2 || !(bond.a1 in doc.atoms) || !(bond.a2 in doc.atoms)) {
      continue;
    }
    bonds.push({ a1: bond.a1, a2: bond.a2, id });
    for (const [from, to] of [
      [bond.a1, bond.a2],
      [bond.a2, bond.a1],
    ] as const) {
      const list = adjacency.get(from);
      if (list) list.push({ to, bond: id });
      else adjacency.set(from, [{ to, bond: id }]);
    }
  }

  const entered = new Map<AtomId, number>();
  const low = new Map<AtomId, number>();
  const bridges = new Set<BondId>();
  let clock = 0;
  interface Frame {
    readonly atom: AtomId;
    readonly via: BondId | null;
    next: number;
  }
  for (const root of sortedIds(doc.atoms)) {
    if (entered.has(root) || !adjacency.has(root)) continue;
    entered.set(root, clock);
    low.set(root, clock);
    clock += 1;
    const stack: Frame[] = [{ atom: root, via: null, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1] as Frame;
      const edges = adjacency.get(frame.atom) ?? [];
      if (frame.next < edges.length) {
        const edge = edges[frame.next] as Edge;
        frame.next += 1;
        if (edge.bond === frame.via) continue;
        const seen = entered.get(edge.to);
        if (seen === undefined) {
          entered.set(edge.to, clock);
          low.set(edge.to, clock);
          clock += 1;
          stack.push({ atom: edge.to, via: edge.bond, next: 0 });
        } else {
          low.set(frame.atom, Math.min(low.get(frame.atom) as number, seen));
        }
      } else {
        stack.pop();
        const parent = stack[stack.length - 1];
        if (parent && frame.via !== null) {
          const lowChild = low.get(frame.atom) as number;
          low.set(parent.atom, Math.min(low.get(parent.atom) as number, lowChild));
          if (lowChild > (entered.get(parent.atom) as number)) bridges.add(frame.via);
        }
      }
    }
  }

  const ring = new Set<AtomId>();
  for (const bond of bonds) {
    if (bridges.has(bond.id)) continue;
    ring.add(bond.a1);
    ring.add(bond.a2);
  }
  return ring;
}

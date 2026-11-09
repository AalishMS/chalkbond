// Cached perception (SPEC-chem-core.md "Perception and caching").
import { fragments, type AtomId, type Bond, type Doc } from '../doc-model/index';
import { combine, perceiveFragment, type FragmentResult } from './perceive';
import type { Perception } from './types';

/** Fragments kept by one perceiver (least recently used dropped first). */
export const PERCEIVER_CACHE_SIZE = 256;

/**
 * A `perceive` that memoises each fragment under its chemistry signature — atoms (id, element,
 * charge, isotope, explicitH, radical, label) and bonds (id, endpoints, order) in id order, no
 * coordinates, stereo or styling. Dragging, recolouring or adding arrows never recomputes; an
 * edit recomputes only the fragment it touched. Same result as `perceive`.
 */
export function createPerceiver(): (doc: Doc) => Perception {
  const cache = new Map<string, FragmentResult>();
  return (doc) => {
    const frags = fragments(doc);
    const fragmentOf = new Map<AtomId, number>();
    frags.forEach((atoms, i) => {
      for (const a of atoms) fragmentOf.set(a, i);
    });
    const bondsOf: Bond[][] = frags.map(() => []);
    for (const bond of Object.values(doc.bonds)) {
      bondsOf[fragmentOf.get(bond.a1) as number]?.push(bond);
    }

    const results = frags.map((atoms, i) => {
      const key = signature(doc, atoms, bondsOf[i] as Bond[]);
      let result = cache.get(key);
      if (result) {
        cache.delete(key); // re-insert: Map order doubles as LRU order
      } else {
        result = perceiveFragment(doc, atoms);
        if (cache.size >= PERCEIVER_CACHE_SIZE) cache.delete(cache.keys().next().value as string);
      }
      cache.set(key, result);
      return result;
    });
    return combine(results);
  };
}

const byIdNumber = (p: Bond, q: Bond): number => Number(p.id.slice(1)) - Number(q.id.slice(1));

function signature(doc: Doc, atoms: readonly AtomId[], bonds: Bond[]): string {
  const parts: string[] = [];
  for (const id of atoms) {
    const a = doc.atoms[id];
    if (!a) continue;
    parts.push(
      `${id},${a.element},${a.charge},${a.isotope ?? ''},${a.explicitH ?? ''},${a.radical},${a.label ?? ''}`,
    );
  }
  parts.push('|');
  for (const b of bonds.sort(byIdNumber)) parts.push(`${b.id},${b.a1},${b.a2},${b.order}`);
  // JSON-quote so a label containing separators can't collide with another signature.
  return JSON.stringify(parts);
}

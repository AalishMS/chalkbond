import { bounds } from '../transform';
import type { Doc, Selection } from '../types';

const byIdNumber = (p: string, q: string) => Number(p.slice(1)) - Number(q.slice(1));

/**
 * Every number in the selected atoms and objects, in id order, with absolute positions taken
 * relative to the selection's bounds centre (relative ones — anchor offsets, sizes — as-is).
 * Two selections with the same signature have the same relative geometry.
 */
export function geometrySignature(doc: Doc, s: Selection): number[] {
  const box = bounds(doc, s);
  const cx = box ? box.x + box.w / 2 : 0;
  const cy = box ? box.y + box.h / 2 : 0;
  const nums: number[] = [];
  const walk = (v: unknown, relative = false): void => {
    if (typeof v === 'number') nums.push(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const x = o['x'];
      const y = o['y'];
      const isPos = typeof x === 'number' && typeof y === 'number';
      if (isPos) nums.push(relative ? x : x - cx, relative ? y : y - cy);
      for (const [k, val] of Object.entries(o)) {
        if (k === 'id' || (isPos && (k === 'x' || k === 'y'))) continue;
        walk(val, k === 'offset');
      }
    }
  };
  for (const id of [...s.atoms].sort(byIdNumber)) walk(doc.atoms[id]);
  for (const id of [...s.objects].sort(byIdNumber)) walk(doc.objects[id]);
  return nums;
}

/** True if both signatures have the same length and agree to `tol` (absolute + relative). */
export function sameGeometry(p: readonly number[], q: readonly number[], tol = 1e-9): boolean {
  return (
    p.length === q.length &&
    p.every((v, i) => Math.abs(v - (q[i] as number)) <= tol * Math.max(1, Math.abs(v)))
  );
}

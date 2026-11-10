// Aromatic circles (SPEC-svg-render.md "Aromatic circles"): one circle per ring whose bonds are
// all stored as order 1.5. The stored order rules; perception's aromatic flag is not consulted.
import type { Doc, Point, Rect } from '../doc-model';
import { dist, growRect } from './geom';
import { findRings, isCircled, ringCentroid, ringKey, type Ring } from './rings';
import { el } from './svg-write';
import { bluToPt, INK, type ResolvedStyle } from './style';

export interface RingCircle {
  /** `ring:` + the ring's atom ids sorted by number, joined by commas. */
  readonly key: `ring:${string}`;
  readonly svg: string;
  /** Ink box, pt (the circle grown by half the stroke width). */
  readonly ink: Rect;
}

/** The rings of the document whose bonds are all order 1.5, sorted by their atom ids. */
export function circledRings(doc: Doc): Ring[] {
  return findRings(doc).filter((ring) => isCircled(doc, ring));
}

/** The bonds' common colour when they all share one, else ink. */
function circleColour(doc: Doc, ring: Ring): string {
  const colours = ring.bonds.map((id) => doc.bonds[id]?.color);
  const first = colours[0];
  return first !== undefined && colours.every((c) => c === first) ? first : INK;
}

/**
 * The circle of a circled ring: centred on the ring centroid, radius `circleRatio` times the mean
 * distance from the centroid to the bond midpoints. `null` when a coordinate is not finite (the
 * caller reports the skipped item).
 */
export function ringCircle(doc: Doc, ring: Ring, style: ResolvedStyle): RingCircle | null {
  const centre = bluToPt(ringCentroid(doc, ring), style);
  let total = 0;
  for (const id of ring.bonds) {
    const bond = doc.bonds[id];
    const a = bond ? doc.atoms[bond.a1] : undefined;
    const b = bond ? doc.atoms[bond.a2] : undefined;
    if (!a || !b) return null;
    const mid: Point = bluToPt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, style);
    total += dist(centre, mid);
  }
  const r = (style.circleRatio * total) / ring.bonds.length;
  if (!Number.isFinite(centre.x) || !Number.isFinite(centre.y) || !Number.isFinite(r)) return null;
  return {
    key: `ring:${ringKey(ring)}`,
    svg: el('circle', {
      cx: centre.x,
      cy: centre.y,
      r,
      stroke: circleColour(doc, ring),
      'stroke-width': style.lineWidth,
    }),
    ink: growRect({ x: centre.x - r, y: centre.y - r, w: 2 * r, h: 2 * r }, style.lineWidth / 2),
  };
}

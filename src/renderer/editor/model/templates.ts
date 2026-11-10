// The five ring templates (SPEC-editor.md "Ring templates"): regular polygons of bond length 1.0
// BLU centred on the origin, y down. A ring tool places one by moving and turning its vertices.
import type { Point } from '@core/doc-model';

export const RING_IDS = [
  'benzene',
  'cyclohexane',
  'cyclopentane',
  'cyclobutane',
  'cyclopropane',
] as const;

export type RingId = (typeof RING_IDS)[number];

export interface RingTemplate {
  readonly id: RingId;
  /** Ring size. */
  readonly n: number;
  /** All bonds 1.5, drawn with a circle (benzene only). */
  readonly aromatic: boolean;
  /** The n vertices in order, centred on the origin; vertex up (the square axis-aligned). */
  readonly vertices: readonly Point[];
}

const SIZES: Readonly<Record<RingId, number>> = {
  benzene: 6,
  cyclohexane: 6,
  cyclopentane: 5,
  cyclobutane: 4,
  cyclopropane: 3,
};

/** Distance from the centre of a regular n-gon of side 1.0 to a vertex. */
export const circumradius = (n: number): number => 1 / (2 * Math.sin(Math.PI / n));

/** Distance from the centre of a regular n-gon of side `side` to the middle of a side. */
export const apothem = (n: number, side = 1): number => side / (2 * Math.tan(Math.PI / n));

/** True for the ids of `RING_IDS`. */
export function isRingId(id: string): id is RingId {
  return (RING_IDS as readonly string[]).includes(id);
}

/** The template for `id`. */
export function ringTemplate(id: RingId): RingTemplate {
  const n = SIZES[id];
  const r = circumradius(n);
  // Angles measured with y up: vertex up is 90 degrees; the square starts at 45 degrees.
  const first = n === 4 ? 45 : 90;
  const vertices: Point[] = [];
  for (let k = 0; k < n; k++) {
    const a = ((first + (360 / n) * k) * Math.PI) / 180;
    vertices.push({ x: r * Math.cos(a), y: -r * Math.sin(a) });
  }
  return { id, n, aromatic: id === 'benzene', vertices };
}

import type { Affine, Point, Rect } from './types';

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

/** x' = a·x + c·y + e ; y' = b·x + d·y + f */
export function applyAffine(m: Affine, p: Point): Point {
  const [a, b, c, d, e, f] = m;
  return { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f };
}

export function translation(dx: number, dy: number): Affine {
  return [1, 0, 0, 1, dx, dy];
}

/** Rotation by `radians` (positive = clockwise on screen, since +y is down) about `center`. */
export function rotation(radians: number, center: Point = { x: 0, y: 0 }): Affine {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    cos,
    sin,
    -sin,
    cos,
    center.x - cos * center.x + sin * center.y,
    center.y - sin * center.x - cos * center.y,
  ];
}

/** Scale about `center`; negative factors flip (`scaling(-1, 1, c)` = flip horizontal). */
export function scaling(sx: number, sy: number = sx, center: Point = { x: 0, y: 0 }): Affine {
  return [sx, 0, 0, sy, center.x - sx * center.x, center.y - sy * center.y];
}

/** Determinant; negative means the transform mirrors. */
export function determinant(m: Affine): number {
  return m[0] * m[3] - m[1] * m[2];
}

/**
 * Axis-aligned image of a rect under `m`: the centre maps exactly; the size becomes the bounding
 * box of the transformed inscribed ellipse — exact for 90° rotations (w/h swap), flips and
 * scales, size-preserving for circles under any rotation, and stable under repeated rotation.
 */
export function transformRect(m: Affine, r: Rect): Rect {
  const [a, b, c, d] = m;
  const center = applyAffine(m, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const w = Math.hypot(a * r.w, c * r.h);
  const h = Math.hypot(b * r.w, d * r.h);
  return { x: center.x - w / 2, y: center.y - h / 2, w, h };
}

/** Smallest rect containing all points and rects, or `null` if there are none. */
export function boundingRect(points: readonly Point[], rects: readonly Rect[] = []): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const p of points) add(p.x, p.y);
  for (const r of rects) {
    add(r.x, r.y);
    add(r.x + r.w, r.y + r.h);
  }
  return minX === Infinity ? null : { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Test helper: reads numbers back out of the renderer's own markup (paths made of M/L, polygons,
// text elements) so tests can assert geometry without a DOM.
import type { Point } from '../../doc-model';

const numbers = (s: string): number[] => (s.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

function toPoints(nums: readonly number[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.push({ x: nums[i] as number, y: nums[i + 1] as number });
  }
  return out;
}

/** The coordinate pairs of every `<path d>`, one list per path (control points included). */
export function pathPoints(svg: string): Point[][] {
  return [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => toPoints(numbers(m[1] as string)));
}

/** The vertices of every `<polygon points>`. */
export function polygonPoints(svg: string): Point[][] {
  return [...svg.matchAll(/<polygon points="([^"]+)"/g)].map((m) =>
    toPoints(numbers(m[1] as string)),
  );
}

export interface TextEl {
  x: number;
  y: number;
  size: number;
  fill: string;
  weight: string | undefined;
  style: string | undefined;
  text: string;
}

/** Every `<text>` element in order. */
export function textElements(svg: string): TextEl[] {
  return [...svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)].map((m) => {
    const attr = (name: string): string | undefined =>
      new RegExp(`${name}="([^"]*)"`).exec(m[1] as string)?.[1];
    return {
      x: Number(attr('x')),
      y: Number(attr('y')),
      size: Number(attr('font-size')),
      fill: attr('fill') as string,
      weight: attr('font-weight'),
      style: attr('font-style'),
      text: m[2] as string,
    };
  });
}

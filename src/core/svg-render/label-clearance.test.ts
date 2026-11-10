import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../doc-model';
import { goldenScenes, PRESETS } from './__fixtures__/golden-scenes';
import { polygonPoints, textElements } from './__fixtures__/markup';
import { render } from './render';
import { resolveStyle } from './style';
import { advanceWidth } from './text-measure';

// SPEC-svg-render.md success criterion 7: "no bond line crosses its label's text". Checked on
// the markup of every golden scene in both presets, independently of the layout code: each
// straight bond line (and wedge edge) is thickened by half the stroke width and tested against
// the cap-height box of every `<text>` glyph run of every atom (labels, subscripts, charge signs).
const CAP_EM = 0.716;

function segmentHits(a: Point, b: Point, box: Rect, half: number): boolean {
  const g = { x: box.x - half, y: box.y - half, w: box.w + 2 * half, h: box.h + 2 * half };
  let t0 = 0;
  let t1 = 1;
  const d = { x: b.x - a.x, y: b.y - a.y };
  for (const [p, q] of [
    [-d.x, a.x - g.x],
    [d.x, g.x + g.w - a.x],
    [-d.y, a.y - g.y],
    [d.y, g.y + g.h - a.y],
  ] as const) {
    if (p === 0) {
      if (q <= 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
    }
  }
  return t0 < t1;
}

/** Straight segments of the M/L paths and polygon edges in `svg` (curves are skipped). */
function segments(svg: string): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (const m of svg.matchAll(/<path d="([^"]+)"/g)) {
    const d = m[1] as string;
    if (/[QCAZHVSTqcazhvst]/.test(d)) continue;
    for (const sub of d.split('M').filter((s) => s !== '')) {
      const nums = (sub.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      for (let i = 0; i + 3 < nums.length; i += 2) {
        out.push([
          { x: nums[i] as number, y: nums[i + 1] as number },
          { x: nums[i + 2] as number, y: nums[i + 3] as number },
        ]);
      }
    }
  }
  for (const poly of polygonPoints(svg)) {
    poly.forEach((p, i) => out.push([p, poly[(i + 1) % poly.length] as Point]));
  }
  return out;
}

const cases = goldenScenes().flatMap((s) => PRESETS.map((preset) => ({ ...s, preset })));

describe('success criterion 7: no bond line crosses label text', () => {
  it.each(cases)('$name ($preset)', (c) => {
    const doc = { ...c.doc, style: { ...c.doc.style, preset: c.preset } };
    const scene = render(doc, c.only ? { only: c.only } : {});
    const half = resolveStyle(doc.style).lineWidth / 2;
    const glyphs: { key: string; box: Rect }[] = [];
    for (const part of scene.parts.filter((p) => p.key.startsWith('atom:'))) {
      for (const t of textElements(part.svg)) {
        const units = [...t.text].reduce(
          (sum, ch) => sum + advanceWidth(ch.codePointAt(0) ?? 0, t.weight === 'bold').width,
          0,
        );
        glyphs.push({
          key: part.key,
          box: { x: t.x, y: t.y - CAP_EM * t.size, w: (units * t.size) / 1000, h: CAP_EM * t.size },
        });
      }
    }
    for (const part of scene.parts.filter((p) => p.key.startsWith('bond:'))) {
      for (const [a, b] of segments(part.svg)) {
        for (const g of glyphs) {
          expect(segmentHits(a, b, g.box, half), `${part.key} crosses ${g.key}`).toBe(false);
        }
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { resolveStyle } from './style';
import { measureRuns } from './text-measure';
import { placeRuns } from './text-run';

const style = resolveStyle({ preset: 'slides', overrides: { fontSize: 200 } });

describe('Liberation Sans bold glyph ink regressions', () => {
  it.each(['|', '¦', 'A|B', 'A¦B'])('%s includes ink 45 px below its baseline', (text) => {
    const measured = measureRuns([{ text, bold: true }], style);
    expect(measured.inkDescent).toBe(45);
    const placed = placeRuns([{ text, bold: true }], style, { x: 0, y: 0 })!;
    expect(placed.ink.y + placed.ink.h).toBeCloseTo(45, 9);
    expect(measureRuns([{ text }], style).inkDescent).toBe(42.4);
  });

  it.each(['¼', '¾'])(
    '%s includes the bold fraction right overhang without changing advance',
    (text) => {
      const placed = placeRuns([{ text, bold: true }], style, { x: 0, y: 0 })!;
      expect(placed.box.w).toBe(166.8);
      expect(placed.ink.x).toBe(-10);
      expect(placed.ink.x + placed.ink.w).toBeCloseTo(181.8, 9);
      const regular = placeRuns([{ text }], style, { x: 0, y: 0 })!;
      expect(regular.ink.x + regular.ink.w).toBeCloseTo(176.8, 9);
    },
  );

  it.each(['A¼', 'A¾'])('%s keeps its advance while including the fraction ink', (text) => {
    const placed = placeRuns([{ text, bold: true }], style, { x: 0, y: 0 })!;
    expect(placed.box.w).toBeCloseTo(311.2, 9);
    expect(placed.ink.x + placed.ink.w).toBeCloseTo(326.2, 9);
  });

  it('a mixed run reserves fraction ink without shifting the next run', () => {
    const placed = placeRuns([{ text: 'A¼', bold: true }, { text: 'B' }], style, { x: 0, y: 0 })!;
    expect(placed.svg).toContain('x="311.2"');
    expect(placed.box.w).toBeCloseTo(444.6, 9);
    expect(placed.ink.x + placed.ink.w).toBeCloseTo(454.6, 9);
  });
});

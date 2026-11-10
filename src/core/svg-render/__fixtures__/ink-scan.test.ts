import { describe, expect, it } from 'vitest';
import { inkScan } from './ink-scan';

const near = (actual: number, expected: number, digits = 6) =>
  expect(actual).toBeCloseTo(expected, digits);

describe('inkScan', () => {
  it('is null for no ink', () => {
    expect(inkScan('')).toBeNull();
  });

  it('a stroked line is grown by half the stroke width on every side (round caps)', () => {
    const box = inkScan('<path d="M10 20L50 20" stroke="#000000" stroke-width="2"/>')!;
    expect(box).toEqual({ x: 9, y: 19, w: 42, h: 2 });
  });

  it('a polygon with no stroke is its vertex box', () => {
    const box = inkScan('<polygon points="0,0 40,-2.8 40,2.8" fill="#000000" stroke="none"/>')!;
    expect(box).toEqual({ x: 0, y: -2.8, w: 40, h: 5.6 });
  });

  it('a stroked polygon grows by the half-width', () => {
    const box = inkScan('<polygon points="0,0 10,0 10,10" stroke="#000000" stroke-width="4"/>')!;
    expect(box).toEqual({ x: -2, y: -2, w: 14, h: 14 });
  });

  it('circle, rect and ellipse', () => {
    expect(inkScan('<circle cx="5" cy="5" r="3" stroke="#000000" stroke-width="2"/>')).toEqual({
      x: 1,
      y: 1,
      w: 8,
      h: 8,
    });
    expect(
      inkScan('<rect x="1" y="2" width="10" height="4" fill="#000000" stroke="none"/>'),
    ).toEqual({ x: 1, y: 2, w: 10, h: 4 });
    expect(inkScan('<ellipse cx="0" cy="0" rx="6" ry="2" fill="#ff0000" stroke="none"/>')).toEqual({
      x: -6,
      y: -2,
      w: 12,
      h: 4,
    });
  });

  it('samples a quadratic at its true extremum, not at the control point', () => {
    // Control point at y = 20: the curve peaks at y = 10.
    const box = inkScan('<path d="M0 0Q10 20 20 0" stroke="#000000" stroke-width="0.5"/>')!;
    near(box.y, -0.25);
    near(box.y + box.h, 10.25);
    near(box.x, -0.25);
    near(box.w, 20.5);
  });

  it('samples a cubic', () => {
    const box = inkScan('<path d="M0 0C0 40 40 40 40 0" stroke="#000000" stroke-width="2"/>')!;
    near(box.y + box.h, 30 + 1, 6); // peak of this cubic is 0.75 * 40
  });

  it('text: width from the advance table, the font ascent above the baseline', () => {
    // W is 944/1000 em: 94.4 wide at 100 pt; the box is the font's 0.905 em ascent and 0.212 em
    // descent, whatever the glyph.
    const box = inkScan(
      '<text x="10" y="200" font-family="Arial" font-size="100" fill="#000000">W</text>',
    )!;
    // The box grows 0.05 em (5 pt here) on each side for glyphs that overhang their advance.
    near(box.x, 10 - 5);
    near(box.w, 94.4 + 10);
    near(box.y, 200 - 90.5);
    near(box.h, 90.5 + 21.2);
  });

  it('text: a descending glyph extends the box below the baseline; bold uses the bold table', () => {
    const box = inkScan(
      '<text x="0" y="100" font-size="100" font-weight="bold" fill="#000000">g</text>',
    )!;
    near(box.y + box.h, 100 + 21.2);
    near(box.w, 61.1 + 10, 1); // Arial bold g = 611, plus the overhang
  });

  it('text: an uncovered glyph uses the fallback width', () => {
    const box = inkScan('<text x="0" y="10" font-size="100" fill="#000000">日</text>')!;
    near(box.w, 55.6 + 10);
  });

  it('unions every element and accepts a whole <svg>', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="1pt" height="1pt" viewBox="0 0 1 1">\n<g>\n' +
      '<path d="M0 0L10 0" stroke="#000000" stroke-width="2"/>\n' +
      '<circle cx="50" cy="50" r="5" stroke="#000000" stroke-width="2"/>\n</g>\n</svg>\n';
    expect(inkScan(svg)).toEqual({ x: -1, y: -1, w: 57, h: 57 });
  });

  it('rejects elements outside the allow-list and unsupported path commands', () => {
    expect(() => inkScan('<use x="0"/>')).toThrow(/unexpected element/);
    expect(() => inkScan('<path d="M0 0Z" stroke="#000000" stroke-width="1"/>')).toThrow(
      /unsupported path command/,
    );
  });
});

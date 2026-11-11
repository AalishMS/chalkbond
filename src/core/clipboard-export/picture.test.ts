import { expect, test } from 'vitest';
import { pngPixelSize, groupDigits } from './index';
test('ordinary size and grouping', () => {
  expect(pngPixelSize(800, 200, 300)).toEqual({
    width: 3334,
    height: 834,
    dpi: 300,
    reduced: false,
  });
  expect([999, 2984, 1234567].map(groupDigits)).toEqual(['999', '2,984', '1,234,567']);
});
test.each([
  [720001, 1],
  [720000, 720000],
  [1e308, 1e308],
  [4000, 4000],
])('caps %s × %s', (w, h) => {
  const s = pngPixelSize(w, h, 300);
  expect(s.dpi).toBeGreaterThan(0);
  expect(s.reduced).toBe(true);
  expect(s.width).toBe(Math.max(1, Math.ceil((w * s.dpi) / 72)));
  expect(s.height).toBe(Math.max(1, Math.ceil((h * s.dpi) / 72)));
  expect(s.width).toBeLessThanOrEqual(10000);
  expect(s.height).toBeLessThanOrEqual(10000);
  expect(s.width * s.height).toBeLessThanOrEqual(50000000);
  if (w >= 720000) expect(s.dpi).toBeLessThan(1);
});

import { expect, it } from 'vitest';
import { firstWindowBounds } from './window-bounds';
it('centres content plus measured frame when it fits', () => {
  expect(firstWindowBounds({ x: 0, y: 0, width: 1920, height: 1040 }, [16, 51])).toEqual({
    x: 312,
    y: 94,
    width: 1296,
    height: 851,
    maximized: false,
  });
});
it('clips normal bounds and maximizes when content does not fit', () => {
  expect(firstWindowBounds({ x: 100, y: 40, width: 1366, height: 728 }, [16, 51])).toEqual({
    x: 135,
    y: 40,
    width: 1296,
    height: 728,
    maximized: true,
  });
});

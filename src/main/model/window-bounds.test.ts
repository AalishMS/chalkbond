import { describe, expect, it } from 'vitest';
import { firstWindowBounds, restoredWindowBounds } from './window-bounds';
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

describe('W2 restoredWindowBounds', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const stored = { x: 100, y: 80, width: 1100, height: 760, maximized: false };

  it('restores a rectangle inside the work area as stored', () => {
    expect(restoredWindowBounds(stored, area)).toEqual(stored);
    expect(restoredWindowBounds({ ...stored, maximized: true }, area)).toEqual({
      ...stored,
      maximized: true,
    });
  });

  it('restores when exactly half lies inside (horizontal and vertical)', () => {
    const half = { x: 1920 - 550, y: 80, width: 1100, height: 760, maximized: false };
    expect(restoredWindowBounds(half, area)).toEqual(half);
    const halfUp = { x: 100, y: -380, width: 1100, height: 760, maximized: false };
    expect(restoredWindowBounds(halfUp, area)).toEqual(halfUp);
  });

  it('gives null (W1) when less than half lies inside', () => {
    expect(restoredWindowBounds({ ...stored, x: 1920 - 549 }, area)).toBeNull();
    expect(restoredWindowBounds({ ...stored, x: -551 }, area)).toBeNull();
    // A corner: half the width and half the height inside is a quarter of the area.
    expect(restoredWindowBounds({ ...stored, x: 1920 - 550, y: 1040 - 380 }, area)).toBeNull();
  });

  it('a rectangle on a removed display (the matching display is elsewhere) gives null', () => {
    expect(restoredWindowBounds({ ...stored, x: 10_000 }, area)).toBeNull();
    expect(restoredWindowBounds({ ...stored, x: -3000, y: 2000 }, area)).toBeNull();
  });

  it('uses the work area of the second display when it matches', () => {
    const right = { x: 1920, y: 0, width: 1280, height: 984 };
    const there = { x: 2000, y: 100, width: 1100, height: 760, maximized: true };
    expect(restoredWindowBounds(there, right)).toEqual(there);
    expect(restoredWindowBounds(there, area)).toBeNull();
  });

  it('nothing stored, an empty rectangle or no work area gives null', () => {
    expect(restoredWindowBounds(null, area)).toBeNull();
    expect(restoredWindowBounds({ ...stored, width: 0 }, area)).toBeNull();
    expect(restoredWindowBounds(stored, { ...area, width: 0 })).toBeNull();
  });
});

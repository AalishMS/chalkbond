import { describe, expect, it } from 'vitest';
import { snapMove, SNAP_PX } from './snap';

// A 100 x 40 pt moving box centred at (50, 20); one other box centred at (300, 120).
const ink = { x: 0, y: 0, w: 100, h: 40 };
const other = { x: 250, y: 100, w: 100, h: 40 };
const K = 2; // px per pt
const FREE = { x: false, y: false };

describe('S3 snapping', () => {
  it('pulls the centre x onto another centre within 6 px and reports a vertical guide', () => {
    // Centre x would land at 50 + 249 = 299: 1 pt = 2 px from 300.
    const r = snapMove(ink, [other], { x: 249, y: 7 }, K, FREE);
    expect(r.d.x).toBe(250);
    expect(r.guides).toContainEqual({ axis: 'x', pt: 300 });
  });

  it('pulls the centre y the same way, independently of x', () => {
    const r = snapMove(ink, [other], { x: 10, y: 101 }, K, FREE);
    expect(r.d.y).toBe(100);
    expect(r.d.x).toBe(10);
    expect(r.guides).toEqual([{ axis: 'y', pt: 120 }]);
  });

  it('snaps both axes at once with two guides', () => {
    const r = snapMove(ink, [other], { x: 251, y: 99 }, K, FREE);
    expect(r.d).toEqual({ x: 250, y: 100 });
    expect(r.guides).toHaveLength(2);
  });

  it('does not snap beyond 6 px, and snaps exactly at 6 px', () => {
    expect(SNAP_PX).toBe(6);
    const far = snapMove(ink, [other], { x: 250 - 3.1, y: 0 }, K, FREE); // 6.2 px
    expect(far.d.x).toBeCloseTo(246.9, 9);
    expect(far.guides).toEqual([]);
    const edge = snapMove(ink, [other], { x: 250 - 3, y: 0 }, K, FREE); // 6 px
    expect(edge.d.x).toBe(250);
  });

  it('the pull is the same in screen px at any zoom', () => {
    const r = snapMove(ink, [other], { x: 249, y: 0 }, 8, FREE); // 8 px away at 8 px/pt
    expect(r.guides).toEqual([]);
  });

  it('the nearest centre wins', () => {
    const near = { x: 240, y: 100, w: 100, h: 40 }; // centre x 290
    const r = snapMove(ink, [other, near], { x: 241, y: 0 }, K, FREE);
    expect(r.guides).toContainEqual({ axis: 'x', pt: 290 });
  });

  it('a locked axis (Shift constraint) is never snapped', () => {
    const r = snapMove(ink, [other], { x: 249, y: 99 }, K, { x: false, y: true });
    expect(r.d.y).toBe(99);
    expect(r.guides).toEqual([{ axis: 'x', pt: 300 }]);
  });

  it('nothing to snap to: the move is unchanged', () => {
    expect(snapMove(ink, [], { x: 5, y: 6 }, K, FREE)).toEqual({ d: { x: 5, y: 6 }, guides: [] });
  });
});

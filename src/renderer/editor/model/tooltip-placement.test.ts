import { describe, expect, it } from 'vitest';
import { placeTooltip, TOOLTIP_GAP, TOOLTIP_MARGIN } from './tooltip-placement';

const bounds = { width: 1280, height: 800 };
const tip = { width: 120, height: 40 };

describe('placeTooltip', () => {
  it('uses an 8 px gap and an 8 px window margin', () => {
    expect(TOOLTIP_GAP).toBe(8);
    expect(TOOLTIP_MARGIN).toBe(8);
  });

  it('puts a rail tooltip right of the anchor, centred vertically', () => {
    const anchor = { x: 4, y: 200, width: 56, height: 48 };
    expect(placeTooltip(anchor, tip, bounds, 'right')).toEqual({ x: 68, y: 204, side: 'right' });
  });

  it('puts a top-bar tooltip below the anchor, centred horizontally', () => {
    const anchor = { x: 400, y: 8, width: 32, height: 32 };
    expect(placeTooltip(anchor, tip, bounds, 'below')).toEqual({ x: 356, y: 48, side: 'below' });
  });

  it('puts a status-bar tooltip above the anchor', () => {
    const anchor = { x: 1000, y: 772, width: 24, height: 24 };
    expect(placeTooltip(anchor, tip, bounds, 'above')).toEqual({ x: 952, y: 724, side: 'above' });
  });

  it('shifts left near the right edge to keep the margin', () => {
    const anchor = { x: 1250, y: 8, width: 24, height: 32 };
    const p = placeTooltip(anchor, tip, bounds, 'below');
    expect(p.x + tip.width).toBe(bounds.width - TOOLTIP_MARGIN);
    expect(p.side).toBe('below');
  });

  it('shifts right near the left edge to keep the margin', () => {
    const anchor = { x: 0, y: 8, width: 24, height: 32 };
    expect(placeTooltip(anchor, tip, bounds, 'below').x).toBe(TOOLTIP_MARGIN);
  });

  it('clamps a rail tooltip vertically at the bottom edge', () => {
    const anchor = { x: 4, y: 770, width: 56, height: 48 };
    const p = placeTooltip(anchor, tip, bounds, 'right');
    expect(p.y + tip.height).toBe(bounds.height - TOOLTIP_MARGIN);
  });

  it('flips below to above when there is no room underneath', () => {
    const anchor = { x: 400, y: 740, width: 32, height: 32 };
    const p = placeTooltip(anchor, tip, bounds, 'below');
    expect(p.side).toBe('above');
    expect(p.y).toBe(740 - TOOLTIP_GAP - tip.height);
  });

  it('flips above to below when there is no room above', () => {
    const anchor = { x: 400, y: 10, width: 32, height: 32 };
    expect(placeTooltip(anchor, tip, bounds, 'above').side).toBe('below');
  });

  it('flips right to left when the right side is clipped', () => {
    const anchor = { x: 1200, y: 300, width: 56, height: 48 };
    const p = placeTooltip(anchor, tip, bounds, 'right');
    expect(p.side).toBe('left');
    expect(p.x).toBe(1200 - TOOLTIP_GAP - tip.width);
  });

  it('keeps the preferred side when neither side fits, and stays inside the margin', () => {
    const small = { width: 100, height: 60 };
    const anchor = { x: 10, y: 10, width: 40, height: 40 };
    const p = placeTooltip(anchor, { width: 90, height: 50 }, small, 'below');
    expect(p.side).toBe('below');
    expect(p.y).toBeGreaterThanOrEqual(TOOLTIP_MARGIN);
  });

  it('returns whole pixels', () => {
    const anchor = { x: 400.5, y: 8, width: 31, height: 32 };
    const p = placeTooltip(anchor, { width: 101, height: 41 }, bounds, 'below');
    expect(Number.isInteger(p.x)).toBe(true);
    expect(Number.isInteger(p.y)).toBe(true);
  });
});

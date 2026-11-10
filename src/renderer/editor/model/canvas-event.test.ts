import { describe, expect, it } from 'vitest';
import { canvasEvent, type RawPointer } from './canvas-event';
import { bluToScreen, type Viewport } from './viewport';

const view: Viewport = { zoom: 1.5, pan: { x: 500, y: 300 }, size: { w: 1000, h: 600 } };
const raw = (over: Partial<RawPointer> = {}): RawPointer => ({
  clientX: 664,
  clientY: 372,
  button: 0,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  ...over,
});

describe('canvasEvent', () => {
  it('converts the client point to canvas px and to BLU at the edge', () => {
    // canvas origin at client (64, 48); one BLU = 40 pt = 80 px at 150 %
    const ev = canvasEvent('down', raw(), { x: 64, y: 48 }, view, 40);
    expect(ev.type).toBe('down');
    if (ev.type !== 'down') throw new Error('type');
    expect(ev.screen).toEqual({ x: 600, y: 324 });
    expect(ev.p.x).toBeCloseTo(1.25, 9);
    expect(ev.p.y).toBeCloseTo(0.3, 9);
    expect(bluToScreen(view, ev.p, 40).x).toBeCloseTo(ev.screen.x, 9);
  });

  it('carries the button and the modifiers', () => {
    const ev = canvasEvent(
      'move',
      raw({ button: 2, shiftKey: true, altKey: true, ctrlKey: true }),
      { x: 0, y: 0 },
      view,
      40,
    );
    expect(ev).toMatchObject({
      type: 'move',
      button: 2,
      mods: { shift: true, alt: true, ctrl: true },
    });
  });

  it('maps unknown buttons to 0', () => {
    const ev = canvasEvent('up', raw({ button: 4 }), { x: 0, y: 0 }, view, 40);
    expect(ev).toMatchObject({ type: 'up', button: 0 });
    expect(canvasEvent('up', raw({ button: 1 }), { x: 0, y: 0 }, view, 40)).toMatchObject({
      button: 1,
    });
  });
});

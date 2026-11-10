import { addObject, emptyDoc, type ObjectId } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { at, context, NOW, rig, screenOf } from './testing';
import { textTool } from './text';

const press = (x: number, y: number) => screenOf({ x, y });

describe('Text tool (T1)', () => {
  it('a click on empty canvas opens a new left-aligned text at the press point, on release', () => {
    const r = rig(textTool);
    const p = press(3, 2);
    const down = textTool.step(null, at(p, 'down'), context(r, null));
    expect(down.edit).toBeUndefined();
    expect(down.gesture?.kind).toBe('text-press');
    const up = textTool.step(down.gesture, at(p, 'up'), context(r, null));
    expect(up.gesture).toBeNull();
    expect(up.commit).toBeUndefined();
    expect(up.edit?.kind).toBe('new');
    if (up.edit?.kind !== 'new') throw new Error('not new');
    expect(up.edit.fresh.align).toBe('left');
    expect(up.edit.fresh.at.x).toBeCloseTo(3, 9);
    expect(up.edit.fresh.at.y).toBeCloseTo(2, 9);
  });

  it('a click on a text opens that text', () => {
    const [doc, id] = addObject(emptyDoc(NOW), {
      type: 'text',
      at: { x: 1, y: 1 },
      runs: [{ text: 'heat' }],
      align: 'left',
    });
    const r = rig(textTool, doc);
    const p = press(1, 1);
    const hit = { kind: 'object', id, type: 'text' } as const;
    const down = textTool.step(null, at(p, 'down'), context(r, hit));
    const up = textTool.step(down.gesture, at(p, 'up'), context(r, null));
    expect(up.edit).toEqual({ kind: 'existing', object: id });
  });

  it('a click on a non-text object (an arrow) is a click on empty canvas', () => {
    const r = rig(textTool);
    const hit = { kind: 'object', id: 'o1' as ObjectId, type: 'arrow' } as const;
    const p = press(1, 1);
    const down = textTool.step(null, at(p, 'down'), context(r, hit));
    const up = textTool.step(down.gesture, at(p, 'up'), context(r, null));
    expect(up.edit?.kind).toBe('new');
  });

  it('a drag opens nothing', () => {
    const r = rig(textTool);
    const down = textTool.step(null, at(press(1, 1), 'down'), context(r, null));
    const moved = textTool.step(down.gesture, at(press(3, 1), 'move'), context(r, null));
    expect(moved.gesture).toBeNull();
    const up = textTool.step(moved.gesture, at(press(3, 1), 'up'), context(r, null));
    expect(up.edit).toBeUndefined();
  });

  it('a right press and Esc do nothing', () => {
    const r = rig(textTool);
    expect(
      textTool.step(null, at(press(1, 1), 'down', undefined, 2), context(r, null)).gesture,
    ).toBeNull();
    const down = textTool.step(null, at(press(1, 1), 'down'), context(r, null));
    expect(textTool.step(down.gesture, { type: 'cancel' }, context(r, null)).gesture).toBeNull();
  });
});

describe('Text tool condition slots (T1)', () => {
  const arrowDoc = () => {
    const [doc, arrow] = addObject(emptyDoc(NOW), {
      type: 'arrow',
      kind: 'forward',
      from: { x: 0, y: 0 },
      to: { x: 4, y: 0 },
    });
    return { doc, arrow };
  };

  it('a click on the slot opens a new centred text attached to the arrow, placed above it', () => {
    const { doc, arrow } = arrowDoc();
    const r = rig(textTool, doc);
    const p = press(2, -0.7);
    const hit = { kind: 'slot', arrow, slot: 'above' } as const;
    const down = textTool.step(null, at(p, 'down'), context(r, hit));
    const up = textTool.step(down.gesture, at(p, 'up'), context(r, null));
    if (up.edit?.kind !== 'new') throw new Error('not new');
    expect(up.edit.fresh.align).toBe('center');
    expect(up.edit.fresh.attachedTo).toEqual({ arrow, slot: 'above' });
    expect(up.edit.fresh.at.x).toBeCloseTo(2, 6);
    expect(up.edit.fresh.at.y).toBeLessThan(0);
  });

  it('a click on a slot that already holds a text edits that text', () => {
    const { doc, arrow } = arrowDoc();
    const [withText, text] = addObject(doc, {
      type: 'text',
      at: { x: 2, y: -0.7 },
      runs: [{ text: 'heat' }],
      align: 'center',
      attachedTo: { arrow, slot: 'above' },
    });
    const r = rig(textTool, withText);
    const hit = { kind: 'slot', arrow, slot: 'above' } as const;
    const down = textTool.step(null, at(press(1, -0.5), 'down'), context(r, hit));
    const up = textTool.step(down.gesture, at(press(1, -0.5), 'up'), context(r, null));
    expect(up.edit).toEqual({ kind: 'existing', object: text });
    // The other slot is still free.
    const below = textTool.step(
      null,
      at(press(1, 0.5), 'down'),
      context(r, { ...hit, slot: 'below' }),
    );
    const upBelow = textTool.step(below.gesture, at(press(1, 0.5), 'up'), context(r, null));
    expect(upBelow.edit?.kind).toBe('new');
  });
});

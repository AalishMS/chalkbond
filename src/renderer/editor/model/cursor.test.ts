import type { AtomId, BondId, ObjectId } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import type { ToolId } from '../state/editor-state';
import { cursorFor } from './cursor';
import type { Hit } from './hit-test';

const atom: Hit = { kind: 'atom', id: 'a1' as AtomId };
const bond: Hit = { kind: 'bond', id: 'b1' as BondId };
const arrow: Hit = { kind: 'object', id: 'o1' as ObjectId, type: 'arrow' };
const text: Hit = { kind: 'object', id: 'o2' as ObjectId, type: 'text' };

describe('cursorFor (Canvas appearance, Cursors)', () => {
  it('Select: default on empty canvas, move over an item, text over a text', () => {
    expect(cursorFor('select', null, false)).toBe('default');
    for (const hit of [atom, bond, arrow]) expect(cursorFor('select', hit, false)).toBe('move');
    expect(cursorFor('select', text, false)).toBe('text');
  });

  it('the drawing tools use the crosshair, hit or not', () => {
    const tools: ToolId[] = ['bond', 'chain', 'ring', 'atom', 'arrow', 'plus', 'curved'];
    for (const tool of tools) {
      expect(cursorFor(tool, null, false)).toBe('crosshair');
      expect(cursorFor(tool, atom, false)).toBe('crosshair');
    }
  });

  it('Erase has its own cursor and Text the text cursor', () => {
    expect(cursorFor('erase', atom, false)).toBe('erase');
    expect(cursorFor('text', null, false)).toBe('text');
  });

  it('Space held shows the grab hand with every tool', () => {
    for (const tool of ['select', 'erase', 'bond', 'text'] as const) {
      expect(cursorFor(tool, atom, true)).toBe('grab');
    }
  });

  it('Select over a handle: grab on the rotate handle, pointer on the arrow handles', () => {
    const handle = (h: 'rotate' | 'arrow-to' | 'curve-bend'): Hit => ({
      kind: 'handle',
      handle: h,
    });
    expect(cursorFor('select', handle('rotate'), false)).toBe('grab');
    expect(cursorFor('select', handle('arrow-to'), false)).toBe('pointer');
    expect(cursorFor('select', handle('curve-bend'), false)).toBe('pointer');
  });

  it('turning the rotate handle shows grabbing; other handle drags keep the pointer', () => {
    expect(cursorFor('select', null, false, 'select-rotate')).toBe('grabbing');
    expect(cursorFor('select', null, false, 'select-arrow')).toBe('pointer');
    expect(cursorFor('select', null, false, 'select-curve')).toBe('pointer');
    expect(cursorFor('select', null, false, 'select-move')).toBe('default');
  });
});

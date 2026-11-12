import type { AtomId, BondId, ObjectId } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { TOOLS } from '../state/catalog';
import type { Hit, ToolId } from '../state/editor-state';
import { canvasKey, fieldCommand, globalCommand, hoverKeys, type KeyInfo } from './keymap';

const key = (k: string, over: Partial<KeyInfo> = {}): KeyInfo => ({
  key: k,
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...over,
});

describe('K1 focus-name-field', () => {
  it('Ctrl+F focuses the name field, with Ctrl alone', () => {
    expect(globalCommand(key('f'), 'all')).toBe('focus-name-field');
    expect(globalCommand(key('F', { shiftKey: true }), 'all')).toBeNull();
    expect(globalCommand(key('f', { ctrlKey: false }), 'all')).toBeNull();
    expect(globalCommand(key('f'), 'canvas-only')).toBeNull();
  });
});

describe('K1 undo and redo keys', () => {
  it('Ctrl+Z undoes; Ctrl+Y and Ctrl+Shift+Z redo', () => {
    expect(globalCommand(key('z'), 'all')).toBe('undo');
    expect(globalCommand(key('y'), 'all')).toBe('redo');
    expect(globalCommand(key('Z', { shiftKey: true }), 'all')).toBe('redo');
  });

  it('needs Ctrl alone: plain, Alt and Meta presses do nothing', () => {
    expect(globalCommand(key('z', { ctrlKey: false }), 'all')).toBeNull();
    expect(globalCommand(key('z', { altKey: true }), 'all')).toBeNull();
    expect(globalCommand(key('z', { metaKey: true }), 'all')).toBeNull();
    expect(globalCommand(key('y', { shiftKey: true }), 'all')).toBeNull();
    expect(globalCommand(key('q'), 'all')).toBeNull();
  });

  it('leaves the Ctrl rows to the host in canvas-only mode', () => {
    expect(globalCommand(key('z'), 'canvas-only')).toBeNull();
  });
});

describe('K1 clipboard keys', () => {
  it('Ctrl+C / X / V copy, cut and paste; Ctrl+D duplicates', () => {
    expect(globalCommand(key('c'), 'all')).toBe('copy');
    expect(globalCommand(key('x'), 'all')).toBe('cut');
    expect(globalCommand(key('v'), 'all')).toBe('paste');
    expect(globalCommand(key('d'), 'all')).toBe('duplicate');
    expect(globalCommand(key('C'), 'all')).toBe('copy');
  });

  it('need Ctrl alone, and are left to the host in canvas-only mode', () => {
    for (const k of ['c', 'x', 'v', 'd']) {
      expect(globalCommand(key(k, { ctrlKey: false }), 'all')).toBeNull();
      expect(globalCommand(key(k, { shiftKey: true }), 'all')).toBeNull();
      expect(globalCommand(key(k, { altKey: true }), 'all')).toBeNull();
      expect(globalCommand(key(k), 'canvas-only')).toBeNull();
    }
  });

  it('never reach the document from the name field', () => {
    for (const k of ['c', 'x', 'v', 'd']) expect(fieldCommand(key(k), 'all', '')).toBeNull();
  });
});

describe('K1 zoom keys', () => {
  it('Ctrl+= and Ctrl++ zoom in; Ctrl+- zooms out', () => {
    expect(globalCommand(key('='), 'all')).toBe('zoom-in');
    expect(globalCommand(key('+', { shiftKey: true }), 'all')).toBe('zoom-in');
    expect(globalCommand(key('-'), 'all')).toBe('zoom-out');
    expect(globalCommand(key('_', { shiftKey: true }), 'all')).toBe('zoom-out');
  });

  it('Ctrl+0 fits and Ctrl+1 resets', () => {
    expect(globalCommand(key('0'), 'all')).toBe('zoom-fit');
    expect(globalCommand(key('1'), 'all')).toBe('zoom-reset');
  });

  it('are left to the host in canvas-only mode and need Ctrl alone', () => {
    expect(globalCommand(key('='), 'canvas-only')).toBeNull();
    expect(globalCommand(key('0', { ctrlKey: false }), 'all')).toBeNull();
    expect(globalCommand(key('0', { altKey: true }), 'all')).toBeNull();
  });
});

describe('K1 undo and redo in the name field (R23)', () => {
  it('act on the document while the field is empty', () => {
    expect(fieldCommand(key('z'), 'all', '')).toBe('undo');
    expect(fieldCommand(key('y'), 'all', '')).toBe('redo');
    expect(fieldCommand(key('Z', { shiftKey: true }), 'all', '')).toBe('redo');
  });

  it('are the fields own text undo while it holds text', () => {
    expect(fieldCommand(key('z'), 'all', 'e')).toBeNull();
    expect(fieldCommand(key('y'), 'all', 'ethanol')).toBeNull();
  });

  it('no other shortcut is taken from the field, and canvas-only leaves them to the host', () => {
    expect(fieldCommand(key('f'), 'all', '')).toBeNull();
    expect(fieldCommand(key('='), 'all', '')).toBeNull();
    expect(fieldCommand(key('z'), 'canvas-only', '')).toBeNull();
  });
});

describe('K1 select all and the plain keys', () => {
  it('Ctrl+A selects all', () => {
    expect(globalCommand(key('a'), 'all')).toBe('select-all');
    expect(globalCommand(key('A', { shiftKey: true }), 'all')).toBeNull();
    expect(globalCommand(key('a'), 'canvas-only')).toBeNull();
  });

  it('Delete and Backspace delete; Escape steps the ladder', () => {
    const plain = (k: string, over: Partial<KeyInfo> = {}) => key(k, { ctrlKey: false, ...over });
    expect(canvasKey(plain('Delete'))).toEqual({ type: 'delete' });
    expect(canvasKey(plain('Backspace'))).toEqual({ type: 'delete' });
    expect(canvasKey(plain('Escape'))).toEqual({ type: 'escape' });
  });

  it('they need no modifier, and are not left to the host with canvas-only shortcuts', () => {
    const plain = (k: string, over: Partial<KeyInfo> = {}) => key(k, { ctrlKey: false, ...over });
    expect(canvasKey(plain('Delete', { ctrlKey: true }))).toBeNull();
    expect(canvasKey(plain('Delete', { altKey: true }))).toBeNull();
    expect(canvasKey(plain('Escape', { metaKey: true }))).toBeNull();
    expect(canvasKey(plain('x'))).toBeNull();
  });
});

describe('K1 nudge keys', () => {
  const arrow = (k: string, over: Partial<KeyInfo> = {}) => key(k, { ctrlKey: false, ...over });

  it('arrow keys nudge by 0.1 BLU, Shift+arrow by 1.0; y points down', () => {
    expect(canvasKey(arrow('ArrowRight'))).toEqual({ type: 'nudge', dx: 0.1, dy: 0 });
    expect(canvasKey(arrow('ArrowLeft'))).toEqual({ type: 'nudge', dx: -0.1, dy: 0 });
    expect(canvasKey(arrow('ArrowUp'))).toEqual({ type: 'nudge', dx: 0, dy: -0.1 });
    expect(canvasKey(arrow('ArrowDown', { shiftKey: true }))).toEqual({
      type: 'nudge',
      dx: 0,
      dy: 1,
    });
  });

  it('Ctrl, Alt or Meta with an arrow is not a nudge', () => {
    expect(canvasKey(arrow('ArrowUp', { ctrlKey: true }))).toBeNull();
    expect(canvasKey(arrow('ArrowUp', { altKey: true }))).toBeNull();
  });
});

// R50: the digits 1..9, 0 pick the ten rail tools in rail order; 1/2/3 keep R5 over an atom or bond.
describe('R50 number keys', () => {
  const plain = (k: string, over: Partial<KeyInfo> = {}): KeyInfo =>
    key(k, { ctrlKey: false, ...over });
  const ATOM: Hit = { kind: 'atom', id: 'a1' as AtomId };
  const BOND: Hit = { kind: 'bond', id: 'b3' as BondId };
  const OBJECT: Hit = { kind: 'object', id: 'o1' as ObjectId, type: 'arrow' };
  const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const pick = (t: ToolId): object => ({ type: 'select-tool', tool: t });
  const toolOf = (digit: string): ToolId => {
    const tool = TOOLS[DIGITS.indexOf(digit)];
    if (!tool) throw new Error('no tool');
    return tool.id;
  };

  it('with no hover and over an object, each digit picks its tool', () => {
    for (const d of DIGITS) {
      expect(hoverKeys(plain(d), null, 'bond')).toEqual(pick(toolOf(d)));
      expect(hoverKeys(plain(d), OBJECT, 'bond')).toEqual(pick(toolOf(d)));
    }
  });

  it('under Erase and Text a digit over an atom or a bond picks a tool', () => {
    for (const t of ['erase', 'text'] as const) {
      for (const hit of [ATOM, BOND]) {
        for (const d of DIGITS) {
          expect(hoverKeys(plain(d), hit, t)).toEqual(pick(toolOf(d)));
        }
      }
    }
  });

  it('1 2 3 keep R5 over an atom or a bond with each of the other eight tools', () => {
    for (const t of TOOLS.map((x) => x.id).filter((x) => x !== 'erase' && x !== 'text')) {
      for (const n of [1, 2, 3] as const) {
        expect(hoverKeys(plain(String(n)), ATOM, t)).toEqual({
          type: 'hover-edit',
          edit: { kind: 'sprout', order: n },
        });
        expect(hoverKeys(plain(String(n)), BOND, t)).toEqual({
          type: 'hover-edit',
          edit: { kind: 'order', order: n },
        });
      }
    }
  });

  it('4 .. 0 over an atom or a bond pick their tool, whatever tool is active', () => {
    for (const t of TOOLS.map((x) => x.id)) {
      for (const d of DIGITS.slice(3)) {
        expect(hoverKeys(plain(d), ATOM, t)).toEqual(pick(toolOf(d)));
        expect(hoverKeys(plain(d), BOND, t)).toEqual(pick(toolOf(d)));
      }
    }
  });

  it('Ctrl+1 and Ctrl+0 stay zoom; Ctrl, Alt or Meta make hoverKeys ignore a digit', () => {
    expect(globalCommand(key('1'), 'all')).toBe('zoom-reset');
    expect(globalCommand(key('0'), 'all')).toBe('zoom-fit');
    for (const over of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      for (const d of DIGITS) expect(hoverKeys(plain(d, over), null, 'bond')).toBeNull();
    }
  });

  it('Shift is ignored', () => {
    expect(hoverKeys(plain('1', { shiftKey: true }), null, 'bond')).toEqual(pick('select'));
  });
});

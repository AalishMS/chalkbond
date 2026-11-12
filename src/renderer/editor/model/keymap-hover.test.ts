import type { AtomId, BondId, ObjectId } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import type { Hit, ToolId } from '../state/editor-state';
import { globalCommand, hoverKeys, type KeyInfo } from './keymap';

const key = (k: string, over: Partial<KeyInfo> = {}): KeyInfo => ({
  key: k,
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...over,
});

describe('K1 Ctrl+Shift rows', () => {
  it('Ctrl+Shift+K toggles Kekule, Ctrl+Shift+L cleans up, Ctrl+Shift+R tidies the reaction', () => {
    expect(globalCommand(key('K', { shiftKey: true }), 'all')).toBe('toggle-kekulé');
    expect(globalCommand(key('L', { shiftKey: true }), 'all')).toBe('clean-up');
    expect(globalCommand(key('R', { shiftKey: true }), 'all')).toBe('tidy-reaction');
  });

  it('they need Ctrl and Shift together, and are left to the host in canvas-only mode', () => {
    for (const k of ['k', 'l', 'r']) {
      expect(globalCommand(key(k), 'all')).toBeNull();
      expect(globalCommand(key(k, { ctrlKey: false, shiftKey: true }), 'all')).toBeNull();
      expect(globalCommand(key(k, { shiftKey: true }), 'canvas-only')).toBeNull();
      expect(globalCommand(key(k, { shiftKey: true, altKey: true }), 'all')).toBeNull();
    }
  });
});

// K2: hover keys first, then tool keys, else nothing (R3, R5, R6).
const plain = (k: string, over: Partial<KeyInfo> = {}): KeyInfo =>
  key(k, { ctrlKey: false, ...over });
const ATOM: Hit = { kind: 'atom', id: 'a1' as AtomId };
const BOND: Hit = { kind: 'bond', id: 'b3' as BondId };
const press = (k: string, hover: Hit | null, tool: ToolId = 'bond', over: Partial<KeyInfo> = {}) =>
  hoverKeys(plain(k, over), hover, tool);
const edit = (e: object) => ({ type: 'hover-edit', edit: e });
const tool = (t: ToolId) => ({ type: 'select-tool', tool: t });

describe('K2 hover keys on an atom', () => {
  it('C H N O S P F I set the element, in either case', () => {
    for (const el of ['C', 'H', 'N', 'O', 'S', 'P', 'F', 'I']) {
      expect(press(el, ATOM)).toEqual(edit({ kind: 'element', element: el }));
      expect(press(el.toLowerCase(), ATOM)).toEqual(edit({ kind: 'element', element: el }));
    }
  });

  it('L sets Cl and B sets Br', () => {
    expect(press('L', ATOM)).toEqual(edit({ kind: 'element', element: 'Cl' }));
    expect(press('b', ATOM)).toEqual(edit({ kind: 'element', element: 'Br' }));
  });

  it('+ and = add a charge (Shift ignored), - removes one', () => {
    const up = edit({ kind: 'charge', delta: 1 });
    expect(press('+', ATOM, 'bond', { shiftKey: true })).toEqual(up);
    expect(press('=', ATOM)).toEqual(up);
    expect(press('+', ATOM)).toEqual(up);
    expect(press('-', ATOM)).toEqual(edit({ kind: 'charge', delta: -1 }));
  });

  it('1 2 3 sprout a single, double or triple bond (R5)', () => {
    for (const n of [1, 2, 3]) {
      expect(press(String(n), ATOM)).toEqual(edit({ kind: 'sprout', order: n }));
    }
  });

  it('Enter over an atom opens the label editor (L1)', () => {
    expect(press('Enter', ATOM)).toEqual({ type: 'hover-edit', edit: { kind: 'label' } });
  });

  it('Enter over a bond, or over nothing, does nothing', () => {
    expect(press('Enter', BOND)).toBeNull();
    expect(press('Enter', null)).toBeNull();
  });

  it('a letter that is not a hover key falls through to its tool (R3)', () => {
    expect(press('v', ATOM)).toEqual(tool('select'));
    expect(press('e', ATOM)).toEqual(tool('erase'));
    expect(press('z', ATOM)).toEqual(tool('chain'));
    expect(press('r', ATOM)).toEqual(tool('ring'));
    expect(press('a', ATOM)).toEqual(tool('arrow'));
    expect(press('m', ATOM)).toEqual(tool('curved'));
    expect(press('t', ATOM)).toEqual(tool('text'));
  });

  it('other keys do nothing', () => {
    for (const k of ['q', 'x', 'y', 'ArrowLeft', 'Tab', ' ']) {
      expect(press(k, ATOM)).toBeNull();
    }
  });
});

describe('K2 hover keys on a bond', () => {
  it('1 2 3 set the order', () => {
    for (const n of [1, 2, 3]) {
      expect(press(String(n), BOND)).toEqual(edit({ kind: 'order', order: n }));
    }
  });

  it('W and H make a wedge and a hash', () => {
    expect(press('w', BOND)).toEqual(edit({ kind: 'stereo', stereo: 'wedge' }));
    expect(press('H', BOND)).toEqual(edit({ kind: 'stereo', stereo: 'hash' }));
  });

  it('B over a bond is the Bond tool, not bromine', () => {
    expect(press('b', BOND)).toEqual(tool('bond'));
  });

  it('element and charge keys are tool keys or nothing over a bond', () => {
    expect(press('o', BOND)).toBeNull();
    expect(press('-', BOND)).toBeNull();
    expect(press('l', BOND)).toEqual(tool('atom'));
    expect(press('+', BOND)).toEqual(tool('plus'));
  });
});

describe('K2 tool keys with nothing hovered', () => {
  const tools: [string, ToolId][] = [
    ['v', 'select'],
    ['e', 'erase'],
    ['b', 'bond'],
    ['z', 'chain'],
    ['r', 'ring'],
    ['l', 'atom'],
    ['a', 'arrow'],
    ['+', 'plus'],
    ['m', 'curved'],
    ['t', 'text'],
  ];

  it('V E B Z R L A + M T select that tool', () => {
    for (const [k, id] of tools) {
      expect(press(k, null)).toEqual(tool(id));
      expect(press(k.toUpperCase(), null)).toEqual(tool(id));
    }
  });

  it('L with nothing hovered is the Atom tool; with an atom hovered it is chlorine', () => {
    expect(press('l', null)).toEqual(tool('atom'));
    expect(press('l', ATOM)).toEqual(edit({ kind: 'element', element: 'Cl' }));
  });

  it('a hovered object (not an atom or bond) leaves the tool keys alone', () => {
    const arrow: Hit = { kind: 'object', id: 'o1' as ObjectId, type: 'arrow' };
    expect(press('o', arrow)).toBeNull();
    expect(press('b', arrow)).toEqual(tool('bond'));
  });

  it('= and element letters do nothing with nothing hovered (digits pick tools, R50)', () => {
    for (const k of ['=', '-', 'o', 'n']) expect(press(k, null)).toBeNull();
  });
});

describe('K2 hover keys are off with Erase and Text, but tool keys still work', () => {
  it('B over an atom with Erase or Text goes to the Bond tool', () => {
    for (const id of ['erase', 'text'] as ToolId[]) {
      expect(press('b', ATOM, id)).toEqual(tool('bond'));
      expect(press('o', ATOM, id)).toBeNull();
      expect(press('1', BOND, id)).toEqual(tool('select'));
    }
  });

  it('they work with every other tool', () => {
    const others = ['select', 'bond', 'chain', 'ring', 'atom', 'arrow', 'plus', 'curved'] as const;
    for (const id of others) {
      expect(press('o', ATOM, id)).toEqual(edit({ kind: 'element', element: 'O' }));
    }
  });
});

describe('K2 modifiers (R6)', () => {
  it('no hover or tool key fires with Ctrl, Alt or Meta down', () => {
    for (const over of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      for (const k of ['o', 'b', 'l', '1', '+', '=', 'v', 'w']) {
        expect(press(k, ATOM, 'bond', over)).toBeNull();
        expect(press(k, BOND, 'bond', over)).toBeNull();
        expect(press(k, null, 'bond', over)).toBeNull();
      }
    }
  });

  it('Ctrl+= is zoom, never a charge', () => {
    const e = key('=');
    expect(globalCommand(e, 'all')).toBe('zoom-in');
    expect(hoverKeys(e, ATOM, 'bond')).toBeNull();
  });

  it('Shift is ignored: Shift+O is still oxygen', () => {
    expect(press('O', ATOM, 'bond', { shiftKey: true })).toEqual(
      edit({ kind: 'element', element: 'O' }),
    );
  });
});

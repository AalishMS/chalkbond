// K1 host keys (SPEC-app-shell.md "Keyboard (host keys)"): the full table (C8: Ctrl+C, C9:
// Ctrl+V, A8: Ctrl+N / O / S / Shift+S, C10: Ctrl+E, A11: F1, Ctrl+F), the K2 conflict check
// against the editor's keymap and the K3 Alt rule.
import { describe, expect, it } from 'vitest';
import { canvasKey, globalCommand, hoverKeys } from '../../editor/model/keymap';
import { altGuard, hostKey, type HostKeyContext, type KeyInput } from './keys';

const ctrl = (key: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key,
  ctrlKey: true,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});
const canvas: HostKeyContext = {
  textTarget: false,
  selectionEmpty: true,
  idle: true,
  modal: false,
  fileBusy: false,
  empty: false,
  insideEditor: true,
};

describe('hostKey', () => {
  it('Ctrl+C on a non-text target with nothing selected copies the whole drawing (CB-K)', () => {
    expect(hostKey(ctrl('c'), canvas)).toBe('copy-whole');
    expect(hostKey(ctrl('C'), canvas)).toBe('copy-whole'); // Caps Lock
  });

  it('leaves Ctrl+C with a selection to the editor, which calls onCopy', () => {
    expect(hostKey(ctrl('c'), { ...canvas, selectionEmpty: false })).toBeNull();
    expect(globalCommand(ctrl('c'), 'all')).toBe('copy');
  });

  it('never handles Ctrl+C in a text target (R4: native text copy)', () => {
    expect(hostKey(ctrl('c'), { ...canvas, textTarget: true })).toBeNull();
    expect(hostKey(ctrl('c'), { ...canvas, textTarget: true, selectionEmpty: false })).toBeNull();
  });

  it('handles no other chord: Ctrl+X stays the editor cut, modifiers rule out Ctrl+C', () => {
    expect(hostKey(ctrl('x'), canvas)).toBeNull();
    expect(hostKey(ctrl('c', { shiftKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('c', { altKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('c', { metaKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('c', { ctrlKey: false }), canvas)).toBeNull();
    expect(hostKey(ctrl('Control'), canvas)).toBeNull();
  });

  it('Ctrl+V on a non-text target while idle pastes (CB-K: the editor paste is not reached)', () => {
    expect(hostKey(ctrl('v'), canvas)).toBe('paste');
    expect(hostKey(ctrl('V'), canvas)).toBe('paste'); // Caps Lock
    expect(hostKey(ctrl('v'), { ...canvas, selectionEmpty: false })).toBe('paste');
  });

  it('leaves Ctrl+V in a text target to native text paste (R4), and while busy', () => {
    expect(hostKey(ctrl('v'), { ...canvas, textTarget: true })).toBeNull();
    expect(hostKey(ctrl('v'), { ...canvas, textTarget: true, selectionEmpty: false })).toBeNull();
    expect(hostKey(ctrl('v'), { ...canvas, idle: false })).toBeNull();
    expect(hostKey(ctrl('v', { shiftKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('v', { altKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('v', { ctrlKey: false }), canvas)).toBeNull();
  });
});

describe('file keys (A8: F1 New, F2 Open, F5 Save, F6 Save as)', () => {
  const rows = [
    ['n', false, 'new'],
    ['o', false, 'open'],
    ['s', false, 'save'],
    ['s', true, 'save-as'],
  ] as const;

  it('idle on the canvas, with a selection, and in the name field (a text target)', () => {
    for (const [key, shiftKey, action] of rows) {
      expect(hostKey(ctrl(key, { shiftKey }), canvas)).toBe(action);
      expect(hostKey(ctrl(key.toUpperCase(), { shiftKey }), canvas)).toBe(action); // Caps Lock
      expect(hostKey(ctrl(key, { shiftKey }), { ...canvas, selectionEmpty: false })).toBe(action);
      expect(hostKey(ctrl(key, { shiftKey }), { ...canvas, textTarget: true })).toBe(action);
    }
  });

  it('ignored while busy (gesture, label or text editor), a flow runs, or a dialog is open', () => {
    for (const [key, shiftKey] of rows) {
      expect(hostKey(ctrl(key, { shiftKey }), { ...canvas, idle: false })).toBeNull();
      expect(
        hostKey(ctrl(key, { shiftKey }), { ...canvas, idle: false, textTarget: true }),
      ).toBeNull();
      expect(hostKey(ctrl(key, { shiftKey }), { ...canvas, fileBusy: true })).toBeNull();
      expect(hostKey(ctrl(key, { shiftKey }), { ...canvas, modal: true })).toBeNull();
    }
    expect(hostKey(ctrl('v'), { ...canvas, modal: true })).toBeNull();
    expect(hostKey(ctrl('c'), { ...canvas, modal: true })).toBeNull();
  });

  it('needs Ctrl alone (Shift only for Save as): Alt, Meta and Ctrl+Shift+N/O do nothing', () => {
    for (const key of ['n', 'o', 's']) {
      expect(hostKey(ctrl(key, { altKey: true }), canvas)).toBeNull();
      expect(hostKey(ctrl(key, { metaKey: true }), canvas)).toBeNull();
      expect(hostKey(ctrl(key, { ctrlKey: false }), canvas)).toBeNull();
    }
    expect(hostKey(ctrl('n', { shiftKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('o', { shiftKey: true }), canvas)).toBeNull();
  });

  it('K2: the editor has no command for them', () => {
    for (const [key, shiftKey] of rows) {
      expect(globalCommand(ctrl(key, { shiftKey }), 'all')).toBeNull();
      expect(canvasKey(ctrl(key, { shiftKey }))).toBeNull();
    }
  });
});

describe('Ctrl+E (C10: the Export dialog)', () => {
  it('opens the dialog when idle and the drawing is not empty, from the canvas or the name field', () => {
    expect(hostKey(ctrl('e'), canvas)).toBe('export');
    expect(hostKey(ctrl('E'), canvas)).toBe('export'); // Caps Lock
    expect(hostKey(ctrl('e'), { ...canvas, selectionEmpty: false })).toBe('export');
    expect(hostKey(ctrl('e'), { ...canvas, textTarget: true })).toBe('export');
  });

  it('does nothing on an empty drawing, while busy, or while a dialog is open', () => {
    expect(hostKey(ctrl('e'), { ...canvas, empty: true })).toBeNull();
    expect(hostKey(ctrl('e'), { ...canvas, idle: false })).toBeNull();
    expect(hostKey(ctrl('e'), { ...canvas, modal: true })).toBeNull();
  });

  it('needs Ctrl alone', () => {
    expect(hostKey(ctrl('e', { shiftKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('e', { altKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('e', { metaKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('e', { ctrlKey: false }), canvas)).toBeNull();
  });

  it('while a dialog is open no host key acts (K1)', () => {
    for (const key of ['n', 'o', 's', 'e', 'c', 'v'])
      expect(hostKey(ctrl(key), { ...canvas, modal: true })).toBeNull();
  });

  it('K2: the editor has no command for Ctrl+E', () => {
    expect(globalCommand(ctrl('e'), 'all')).toBeNull();
    expect(canvasKey(ctrl('e'))).toBeNull();
  });
});

const plain = (key: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  ...ctrl(key, mods),
  ctrlKey: mods.ctrlKey ?? false,
});

describe('F1 (A11: the Keyboard shortcuts dialog)', () => {
  it('opens the list when idle, from the canvas, the name field or outside the editor', () => {
    expect(hostKey(plain('F1'), canvas)).toBe('shortcuts');
    expect(hostKey(plain('F1'), { ...canvas, textTarget: true })).toBe('shortcuts');
    expect(hostKey(plain('F1'), { ...canvas, insideEditor: false })).toBe('shortcuts');
    expect(hostKey(plain('F1'), { ...canvas, empty: true, fileBusy: true })).toBe('shortcuts');
  });

  it('does nothing while busy (a label or text editor is open) or a dialog is open', () => {
    expect(hostKey(plain('F1'), { ...canvas, idle: false })).toBeNull();
    expect(hostKey(plain('F1'), { ...canvas, idle: false, textTarget: true })).toBeNull();
    expect(hostKey(plain('F1'), { ...canvas, modal: true })).toBeNull();
  });

  it('needs F1 alone', () => {
    for (const mods of [{ ctrlKey: true }, { altKey: true }, { shiftKey: true }, { metaKey: true }])
      expect(hostKey(plain('F1', mods), canvas)).toBeNull();
    expect(hostKey(plain('F2'), canvas)).toBeNull();
  });
});

describe('Ctrl+F outside the editor root (A11)', () => {
  it('asks the editor to focus the name field when the target is outside it (e.g. body)', () => {
    expect(hostKey(ctrl('f'), { ...canvas, insideEditor: false })).toBe('focus-name');
    expect(hostKey(ctrl('F'), { ...canvas, insideEditor: false })).toBe('focus-name');
  });

  it('inside the editor its own Ctrl+F acts; modifiers and dialogs rule it out', () => {
    expect(hostKey(ctrl('f'), canvas)).toBeNull();
    expect(globalCommand(ctrl('f'), 'all')).toBe('focus-name-field');
    const outside = { ...canvas, insideEditor: false };
    expect(hostKey(ctrl('f'), { ...outside, modal: true })).toBeNull();
    expect(hostKey(ctrl('f', { shiftKey: true }), outside)).toBeNull();
    expect(hostKey(ctrl('f', { altKey: true }), outside)).toBeNull();
    expect(hostKey(ctrl('f', { metaKey: true }), outside)).toBeNull();
  });
});

describe('K1 complete: every row and nothing else', () => {
  it('claims exactly the K1 keys on a ready canvas', () => {
    const keys = [
      ...'abcdefghijklmnopqrstuvwxyz0123456789=-+',
      'F1',
      'F2',
      'F10',
      'Delete',
      'Escape',
      'Enter',
      'ArrowLeft',
      'Alt',
    ];
    const claimed: string[] = [];
    for (const key of keys)
      for (const ctrlKey of [false, true])
        for (const shiftKey of [false, true])
          for (const insideEditor of [true, false]) {
            const action = hostKey(plain(key, { ctrlKey, shiftKey }), {
              ...canvas,
              insideEditor,
            });
            if (action !== null)
              claimed.push(
                `${ctrlKey ? 'Ctrl+' : ''}${shiftKey ? 'Shift+' : ''}${key}${insideEditor ? '' : ' (outside)'}=${action}`,
              );
          }
    expect(claimed.sort()).toEqual(
      [
        'Ctrl+n=new',
        'Ctrl+n (outside)=new',
        'Ctrl+o=open',
        'Ctrl+o (outside)=open',
        'Ctrl+s=save',
        'Ctrl+s (outside)=save',
        'Ctrl+Shift+s=save-as',
        'Ctrl+Shift+s (outside)=save-as',
        'Ctrl+e=export',
        'Ctrl+e (outside)=export',
        'Ctrl+c=copy-whole',
        'Ctrl+c (outside)=copy-whole',
        'Ctrl+v=paste',
        'Ctrl+v (outside)=paste',
        'Ctrl+f (outside)=focus-name',
        'F1=shortcuts',
        'F1 (outside)=shortcuts',
      ].sort(),
    );
  });
});

describe('K2 conflict check against the editor keymap', () => {
  /** SPEC-editor.md K3: the label and text editor keys. */
  const EDITOR_K3 = [
    ctrl('b'),
    ctrl('i'),
    ctrl('='),
    ctrl('=', { shiftKey: true }),
    ctrl('+', { shiftKey: true }),
    ctrl('d', { shiftKey: true }),
    ctrl('h', { shiftKey: true }),
  ];
  const HOST = [
    ctrl('n'),
    ctrl('o'),
    ctrl('s'),
    ctrl('s', { shiftKey: true }),
    ctrl('e'),
    plain('F1'),
  ];
  const same = (a: KeyInput, b: KeyInput) =>
    a.key.toLowerCase() === b.key.toLowerCase() &&
    a.ctrlKey === b.ctrlKey &&
    a.shiftKey === b.shiftKey &&
    a.altKey === b.altKey &&
    a.metaKey === b.metaKey;

  it("the host's keys have no editor command: globalCommand, canvasKey, hover or tool keys", () => {
    for (const key of HOST) {
      expect(globalCommand(key, 'all'), key.key).toBeNull();
      expect(canvasKey(key), key.key).toBeNull();
      expect(hoverKeys(key, null, 'select'), key.key).toBeNull();
      expect(hoverKeys(key, { kind: 'atom', id: 'a1' } as never, 'bond'), key.key).toBeNull();
      expect(hoverKeys(key, { kind: 'bond', id: 'b1' } as never, 'bond'), key.key).toBeNull();
    }
  });

  it('none of them is an editor K3 key', () => {
    for (const host of HOST)
      for (const k3 of EDITOR_K3) expect(same(host, k3), `${host.key} vs ${k3.key}`).toBe(false);
  });

  it('menu access keys need Alt, which every editor key requires up', () => {
    for (const key of 'fevhn') {
      const alt = plain(key, { altKey: true });
      expect(globalCommand(alt, 'all')).toBeNull();
      expect(canvasKey(alt)).toBeNull();
      expect(hoverKeys(alt, null, 'select')).toBeNull();
      expect(hostKey(alt, canvas)).toBeNull();
    }
  });
});

describe('K3 Alt after Alt+click (R4)', () => {
  it('an Alt+pointerdown arms; the next Alt key-up is prevented and disarms', () => {
    let s = altGuard(false, { type: 'pointerdown', altKey: true });
    expect(s).toEqual({ armed: true, prevent: false });
    s = altGuard(s.armed, { type: 'keydown', key: 'Alt', repeat: true }); // Alt still held
    expect(s).toEqual({ armed: true, prevent: false });
    s = altGuard(s.armed, { type: 'keyup', key: 'Alt' });
    expect(s).toEqual({ armed: false, prevent: true });
    expect(altGuard(s.armed, { type: 'keyup', key: 'Alt' })).toEqual({
      armed: false,
      prevent: false,
    });
  });

  it('a standalone Alt press is untouched, armed or not', () => {
    expect(altGuard(false, { type: 'keyup', key: 'Alt' })).toEqual({
      armed: false,
      prevent: false,
    });
    const pressed = altGuard(true, { type: 'keydown', key: 'Alt', repeat: false });
    expect(pressed).toEqual({ armed: false, prevent: false });
    expect(altGuard(pressed.armed, { type: 'keyup', key: 'Alt' }).prevent).toBe(false);
  });

  it('any other keydown disarms; a plain click leaves the flag', () => {
    expect(altGuard(true, { type: 'keydown', key: 'b', repeat: false })).toEqual({
      armed: false,
      prevent: false,
    });
    expect(altGuard(true, { type: 'pointerdown', altKey: false })).toEqual({
      armed: true,
      prevent: false,
    });
    expect(altGuard(true, { type: 'keyup', key: 'b' })).toEqual({ armed: true, prevent: false });
  });
});

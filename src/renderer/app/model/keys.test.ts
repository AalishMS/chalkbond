// K1 host keys (SPEC-app-shell.md "Keyboard (host keys)"): the rows built so far (C8: Ctrl+C,
// C9: Ctrl+V, A8: Ctrl+N / O / S / Shift+S) and the K2 conflict check for them.
import { describe, expect, it } from 'vitest';
import { canvasKey, globalCommand } from '../../editor/model/keymap';
import { hostKey, type HostKeyContext, type KeyInput } from './keys';

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

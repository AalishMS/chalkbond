// K1 host keys (SPEC-app-shell.md "Keyboard (host keys)"): the rows built so far (C8: Ctrl+C).
import { describe, expect, it } from 'vitest';
import { globalCommand } from '../../editor/model/keymap';
import { hostKey, type HostKeyContext, type KeyInput } from './keys';

const ctrl = (key: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key,
  ctrlKey: true,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});
const canvas: HostKeyContext = { textTarget: false, selectionEmpty: true };

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
    expect(hostKey(ctrl('c'), { textTarget: true, selectionEmpty: true })).toBeNull();
    expect(hostKey(ctrl('c'), { textTarget: true, selectionEmpty: false })).toBeNull();
  });

  it('handles no other chord: Ctrl+X stays the editor cut, modifiers rule out Ctrl+C', () => {
    expect(hostKey(ctrl('x'), canvas)).toBeNull();
    expect(hostKey(ctrl('v'), canvas)).toBeNull();
    expect(hostKey(ctrl('c', { shiftKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('c', { altKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('c', { metaKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('c', { ctrlKey: false }), canvas)).toBeNull();
    expect(hostKey(ctrl('Control'), canvas)).toBeNull();
  });
});

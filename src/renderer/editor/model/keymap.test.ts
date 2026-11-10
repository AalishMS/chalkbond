import { describe, expect, it } from 'vitest';
import { globalCommand, type KeyInfo } from './keymap';

const key = (k: string, over: Partial<KeyInfo> = {}): KeyInfo => ({
  key: k,
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...over,
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

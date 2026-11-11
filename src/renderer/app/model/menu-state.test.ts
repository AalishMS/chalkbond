// MenuState from the controller (SPEC-app-shell.md "Process split and IPC"), at most once per
// frame, and the renderer side of every menu command (M1, R19).
import { describe, expect, it, vi } from 'vitest';
import { emptyDoc, setStyle, type Doc } from '@core/doc-model';
import { APP_COMMANDS, type MenuState } from '../../../shared/menu';
import type { EditorCommand } from '../../editor';
import {
  createMenuScheduler,
  deriveMenuState,
  runAppCommand,
  sameMenuState,
  type AppActions,
  type MenuController,
} from './menu-state';

const NOW = '2026-11-11T00:00:00.000Z';
const withAtom = (doc: Doc): Doc => ({
  ...doc,
  atoms: { a1: { id: 'a1', element: 'C', x: 0, y: 0 } } as unknown as Doc['atoms'],
});

function fakeController(
  change: Partial<{
    doc: Doc;
    selected: boolean;
    allowed: (cmd: EditorCommand) => boolean;
    undo: string | undefined;
    redo: string | undefined;
  }> = {},
): MenuController & { calls: EditorCommand[] } {
  const doc = change.doc ?? withAtom(emptyDoc(NOW));
  const set = (on: boolean) => new Set(on ? ['a1'] : []);
  return {
    calls: [],
    getDoc: () => doc,
    getSelection: () =>
      ({ atoms: set(change.selected ?? false), bonds: new Set(), objects: new Set() }) as never,
    canRun: (cmd) => (change.allowed ?? (() => true))(cmd),
    undoLabel: () => change.undo,
    redoLabel: () => change.redo,
  };
}

describe('deriveMenuState', () => {
  it('reads every field from the controller, the focus and the dialog', () => {
    const c = fakeController({ selected: true, undo: 'Add bond' });
    expect(deriveMenuState(c, { textFocus: false, modal: false })).toEqual({
      idle: true,
      modal: false,
      textFocus: false,
      empty: false,
      hasSelection: true,
      canUndo: true,
      canRedo: true,
      undoLabel: 'Add bond',
      redoLabel: null,
      canCut: true,
      canDuplicate: true,
      canDelete: true,
      canSelectAll: true,
      canZoomIn: true,
      canZoomOut: true,
      preset: 'slides',
    } satisfies MenuState);
    const s = deriveMenuState(c, { textFocus: true, modal: true });
    expect([s.textFocus, s.modal]).toEqual([true, true]);
  });

  it('maps each flag to its own editor command', () => {
    const flags: [keyof MenuState, EditorCommand][] = [
      ['idle', { type: 'set-preset', preset: 'slides' }],
      ['canUndo', 'undo'],
      ['canRedo', 'redo'],
      ['canCut', 'cut'],
      ['canDuplicate', 'duplicate'],
      ['canDelete', 'delete'],
      ['canSelectAll', 'select-all'],
      ['canZoomIn', 'zoom-in'],
      ['canZoomOut', 'zoom-out'],
    ];
    for (const [flag, command] of flags) {
      const key = JSON.stringify(command);
      const c = fakeController({ allowed: (cmd) => JSON.stringify(cmd) !== key });
      const s = deriveMenuState(c, { textFocus: false, modal: false });
      for (const [other] of flags) expect(s[other], `${flag} → ${other}`).toBe(other !== flag);
    }
  });

  it('an empty drawing, nothing selected, the Handout preset', () => {
    const doc = setStyle(emptyDoc(NOW), { preset: 'journal' });
    const s = deriveMenuState(fakeController({ doc }), { textFocus: false, modal: false });
    expect([s.empty, s.hasSelection, s.preset]).toEqual([true, false, 'journal']);
    const objects = { ...emptyDoc(NOW), objects: { o1: {} } } as unknown as Doc;
    expect(
      deriveMenuState(fakeController({ doc: objects }), { textFocus: false, modal: false }).empty,
    ).toBe(false);
  });
});

describe('sameMenuState', () => {
  it('compares every field', () => {
    const a = deriveMenuState(fakeController(), { textFocus: false, modal: false });
    expect(sameMenuState(a, { ...a })).toBe(true);
    expect(sameMenuState(undefined, a)).toBe(false);
    for (const key of Object.keys(a) as (keyof MenuState)[]) {
      const value = a[key];
      const changed = typeof value === 'boolean' ? !value : value === 'slides' ? 'journal' : 'x';
      expect(sameMenuState(a, { ...a, [key]: changed }), key).toBe(false);
    }
  });
});

describe('createMenuScheduler', () => {
  it('runs at most once per frame however many changes arrive', () => {
    const frames: (() => void)[] = [];
    const publish = vi.fn();
    const scheduler = createMenuScheduler({
      requestFrame: (fn) => {
        frames.push(fn);
        return frames.length;
      },
      cancelFrame: () => undefined,
      publish,
    });
    scheduler.invalidate();
    scheduler.invalidate();
    scheduler.invalidate();
    expect(frames).toHaveLength(1);
    expect(publish).not.toHaveBeenCalled();
    frames.shift()?.();
    expect(publish).toHaveBeenCalledTimes(1);
    scheduler.invalidate();
    expect(frames).toHaveLength(1);
    frames.shift()?.();
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('cancel drops a pending frame; a later change schedules a new one', () => {
    const cancel = vi.fn();
    const frames: (() => void)[] = [];
    const publish = vi.fn();
    const scheduler = createMenuScheduler({
      requestFrame: (fn) => frames.push(fn),
      cancelFrame: cancel,
      publish,
    });
    scheduler.cancel();
    expect(cancel).not.toHaveBeenCalled();
    scheduler.invalidate();
    scheduler.cancel();
    expect(cancel).toHaveBeenCalledWith(1);
    scheduler.invalidate();
    expect(frames).toHaveLength(2);
    frames[1]?.();
    expect(publish).toHaveBeenCalledTimes(1);
  });
});

describe('runAppCommand', () => {
  const ready = deriveMenuState(fakeController({ selected: true }), {
    textFocus: false,
    modal: false,
  });
  const actions = () => {
    const log: unknown[] = [];
    const a: AppActions = {
      newDrawing: () => log.push('new'),
      open: () => log.push('open'),
      save: () => log.push('save'),
      saveAs: () => log.push('save-as'),
      exportDialog: () => log.push('export'),
      copy: () => log.push('copy'),
      paste: () => log.push('paste'),
      shortcuts: () => log.push('shortcuts'),
      run: (cmd) => log.push(cmd),
    };
    return { a, log };
  };

  it('routes every M1 renderer command to its flow or editor command', () => {
    const expected: Record<(typeof APP_COMMANDS)[number], unknown> = {
      'file.new': 'new',
      'file.open': 'open',
      'file.save': 'save',
      'file.save-as': 'save-as',
      'file.export': 'export',
      'edit.undo': 'undo',
      'edit.redo': 'redo',
      'edit.cut': 'cut',
      'edit.copy': 'copy',
      'edit.paste': 'paste',
      'edit.duplicate': 'duplicate',
      'edit.delete': 'delete',
      'edit.select-all': 'select-all',
      'view.zoom-in': 'zoom-in',
      'view.zoom-out': 'zoom-out',
      'view.zoom-fit': 'zoom-fit',
      'view.zoom-reset': 'zoom-reset',
      'view.style-slides': { type: 'set-preset', preset: 'slides' },
      'view.style-handout': { type: 'set-preset', preset: 'journal' },
      'help.shortcuts': 'shortcuts',
    };
    for (const command of APP_COMMANDS) {
      const { a, log } = actions();
      expect(runAppCommand(command, ready, a), command).toBe(true);
      expect(log, command).toEqual([expected[command]]);
    }
  });

  it('re-checks the current state: a disabled or modal command does nothing', () => {
    const { a, log } = actions();
    expect(runAppCommand('file.save', { ...ready, idle: false }, a)).toBe(false);
    expect(runAppCommand('edit.undo', { ...ready, canUndo: false }, a)).toBe(false);
    for (const command of APP_COMMANDS)
      expect(runAppCommand(command, { ...ready, modal: true }, a), command).toBe(false);
    expect(log).toEqual([]);
  });

  it('never runs an Edit command while a text field has focus (main acts on the text, M3)', () => {
    const { a, log } = actions();
    const text = { ...ready, textFocus: true };
    for (const command of APP_COMMANDS.filter((c) => c.startsWith('edit.')))
      expect(runAppCommand(command, text, a), command).toBe(false);
    expect(runAppCommand('view.zoom-in', text, a)).toBe(true);
    expect(log).toEqual(['zoom-in']);
  });

  it('ignores ids that are not renderer commands', () => {
    const { a, log } = actions();
    for (const id of ['file.exit', 'help.about', 'file.recent.0', 'nope', ''])
      expect(runAppCommand(id, ready, a), id).toBe(false);
    expect(log).toEqual([]);
  });
});

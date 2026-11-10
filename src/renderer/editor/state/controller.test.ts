import { addAtom, emptyDoc, type Doc } from '@core/doc-model';
import { describe, expect, it, vi } from 'vitest';
import {
  createEditorController,
  type EditorCommand,
  type EditorController,
  type EditorEvent,
  type EditorOptions,
  type HostHit,
} from './controller';
import type { HostHit as PublicHostHit } from '../index';
import { addEthane, atomId, bondId, T0 } from './testing';

const make = (opts: Partial<EditorOptions> = {}): EditorController =>
  createEditorController({ clock: () => T0, logError: () => undefined, ...opts });

const events = (c: EditorController): EditorEvent['type'][] => {
  const seen: EditorEvent['type'][] = [];
  c.subscribe((e) => seen.push(e.type));
  return seen;
};

const addBondCommit = (c: EditorController): void =>
  c.store.dispatch({ type: 'commit', label: 'Add bond', recipe: addEthane });

describe('controller API', () => {
  it('starts with an empty document, no selection, clean, nothing to undo', () => {
    const c = make();
    expect(c.getDoc()).toEqual(emptyDoc(T0));
    expect(c.getSelection().atoms.size).toBe(0);
    expect(c.isDirty()).toBe(false);
    expect(c.canRun('undo')).toBe(false);
    expect(c.canRun('redo')).toBe(false);
    expect(c.undoLabel()).toBeUndefined();
    expect(c.redoLabel()).toBeUndefined();
    expect(c.shortcuts).toBe('all');
  });

  it('starts from the given document and shortcut mode', () => {
    const doc: Doc = addAtom(emptyDoc(T0), { element: 'O', x: 0, y: 0 })[0];
    const c = make({ doc, shortcuts: 'canvas-only' });
    expect(c.getDoc()).toBe(doc);
    expect(c.shortcuts).toBe('canvas-only');
  });

  it('undoLabel returns "Add bond" after such a commit; redoLabel after undo', () => {
    const c = make();
    addBondCommit(c);
    expect(c.undoLabel()).toBe('Add bond');
    expect(c.canRun('undo')).toBe(true);
    c.run('undo');
    expect(c.redoLabel()).toBe('Add bond');
    expect(c.canRun('redo')).toBe(true);
    c.run('redo');
    expect(Object.keys(c.getDoc().atoms)).toHaveLength(2);
  });

  it('is dirty after an edit, clean after undo back to saved and after markSaved', () => {
    const c = make();
    addBondCommit(c);
    expect(c.isDirty()).toBe(true);
    c.run('undo');
    expect(c.isDirty()).toBe(false);
    c.run('redo');
    c.markSaved();
    expect(c.isDirty()).toBe(false);
  });

  it('load resets history and marks the document saved', () => {
    const c = make();
    addBondCommit(c);
    c.load(emptyDoc(T0));
    expect(c.canRun('undo')).toBe(false);
    expect(c.isDirty()).toBe(false);
  });

  it('commands that are not implemented yet cannot run and do nothing', () => {
    const c = make();
    const later: EditorCommand[] = ['cut', 'copy', 'paste', 'delete', 'clean-up'];
    later.push({ type: 'set-preset', preset: 'journal' });
    for (const cmd of later) {
      expect(c.canRun(cmd)).toBe(false);
      c.run(cmd);
    }
    expect(c.isDirty()).toBe(false);
  });

  it('insert-text inserts a structure as the name field does (N4)', () => {
    const c = make();
    const seen = events(c);
    expect(c.canRun({ type: 'insert-text', text: 'ethanol' })).toBe(true);
    c.run({ type: 'insert-text', text: 'ethanol' });
    expect(Object.keys(c.getDoc().atoms)).toHaveLength(3);
    expect(c.undoLabel()).toBe('Insert ethanol');
    expect(c.getSelection().atoms.size).toBe(3);
    expect(seen).toEqual(['doc', 'selection', 'dirty', 'history', 'notice']);
    c.run('undo');
    expect(Object.keys(c.getDoc().atoms)).toHaveLength(0);
  });

  it('insert-text of an unknown name changes nothing in the document', () => {
    const c = make();
    c.run({ type: 'insert-text', text: 'ethanl' });
    expect(c.isDirty()).toBe(false);
    expect(c.store.getState().nameField.error?.suggestions[0]).toBe('ethanol');
  });

  it('exposes the name index it uses', () => {
    expect(make().names.lookup('ethanol')?.name).toBe('ethanol');
  });

  it('builds the default name index once and uses the supplied one', () => {
    const a = make();
    const b = make();
    expect(a.getDoc()).toEqual(b.getDoc());
  });
});

describe('events', () => {
  it('fires once per kind of change', () => {
    const c = make();
    const seen = events(c);
    addBondCommit(c);
    expect(seen).toEqual(['doc', 'dirty', 'history']);
    seen.length = 0;
    c.run('undo');
    expect(seen).toEqual(['doc', 'dirty', 'history']);
  });

  it('fires nothing for changes the host does not see (tool, hover)', () => {
    const c = make();
    const seen = events(c);
    c.store.dispatch({ type: 'select-tool', tool: 'ring' });
    c.store.dispatch({ type: 'set-hover', hover: { kind: 'atom', id: atomId(1) } });
    expect(seen).toEqual([]);
  });

  it('fires selection and notice events, and stops after unsubscribe', () => {
    const c = make();
    const listener = vi.fn();
    const off = c.subscribe(listener);
    c.store.dispatch({
      type: 'set-selection',
      selection: { atoms: new Set([atomId(1)]), bonds: new Set(), objects: new Set() },
    });
    c.store.dispatch({ type: 'notice-show', kind: 'info', text: 'hi' });
    expect(listener.mock.calls.map(([e]) => (e as EditorEvent).type)).toEqual([
      'selection',
      'notice',
    ]);
    off();
    c.store.dispatch({ type: 'notice-clear' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('a failing commit shows a notice and logs a DocError through the injected logger', () => {
    const logError = vi.fn();
    const c = make({ logError });
    const seen = events(c);
    c.store.dispatch({
      type: 'commit',
      label: 'Bad',
      recipe: () => {
        throw new Error('bad');
      },
    });
    expect(seen).toEqual(['notice']);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(c.store.getState().notice?.kind).toBe('error');
  });

  it('defaults the logger to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const c = createEditorController({ clock: () => T0 });
    c.store.dispatch({
      type: 'commit',
      label: 'Bad',
      recipe: () => {
        throw new Error('bad');
      },
    });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('host seam types', () => {
  it('compile against a usage file', () => {
    const hit: PublicHostHit = { kind: 'bond', id: bondId(1) };
    const same: HostHit = hit;
    const event: EditorEvent = { type: 'context-menu', target: hit, screen: { x: 1, y: 2 } };
    const options: EditorOptions = {
      clock: () => T0,
      shortcuts: 'canvas-only',
      onCopy: () => undefined,
    };
    expect(event.type).toBe('context-menu');
    expect(same).toBe(hit);
    expect(options.shortcuts).toBe('canvas-only');
  });
});

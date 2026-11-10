import { extract, type Doc, type Selection, type SubDoc } from '@core/doc-model';
import { describe, expect, it, vi } from 'vitest';
import { selectionHandles } from '../model/handles';
import { bluToScreen } from '../model/viewport';
import {
  createEditorController,
  type EditorController,
  type EditorEvent,
  type EditorOptions,
} from './controller';
import { drawn, T0 } from './testing';

const BL = 40;

const make = (opts: Partial<EditorOptions> = {}): EditorController => {
  const c = createEditorController({
    clock: () => T0,
    logError: () => undefined,
    doc: drawn({ name: 'ethanol', x: 0, y: 0 }),
    ...opts,
  });
  c.store.dispatch({ type: 'canvas-resized', size: { w: 1200, h: 700 } });
  c.store.dispatch({ type: 'select-tool', tool: 'select' });
  return c;
};

const selectAll = (c: EditorController): void => c.run('select-all');
const atomCount = (c: EditorController): number => Object.keys(c.getDoc().atoms).length;

describe('clipboard commands (CB1)', () => {
  it('copy and cut need a selection; paste needs something copied', () => {
    const c = make();
    for (const cmd of ['copy', 'cut', 'duplicate'] as const) expect(c.canRun(cmd)).toBe(false);
    expect(c.canRun('paste')).toBe(false);
    selectAll(c);
    for (const cmd of ['copy', 'cut', 'duplicate'] as const) expect(c.canRun(cmd)).toBe(true);
    expect(c.canRun('paste')).toBe(false);
    c.run('copy');
    expect(c.canRun('paste')).toBe(true);
  });

  it('canRun(paste) is false until something is copied, even with a selection', () => {
    const c = make();
    selectAll(c);
    expect(c.canRun('paste')).toBe(false);
  });

  it('copy gives onCopy the extracted sub-document, the document and the selection', () => {
    const onCopy = vi.fn<(sub: SubDoc, doc: Doc, selection: Selection) => void>();
    const c = make({ onCopy });
    selectAll(c);
    c.run('copy');
    expect(onCopy).toHaveBeenCalledTimes(1);
    const [sub, doc, selection] = onCopy.mock.calls[0] ?? [];
    expect(doc).toBe(c.getDoc());
    expect(selection).toBe(c.getSelection());
    expect(sub).toEqual(extract(c.getDoc(), c.getSelection()));
  });

  it('cut calls onCopy with what was cut, and leaves the document empty in one step', () => {
    const onCopy = vi.fn<(sub: SubDoc, doc: Doc, selection: Selection) => void>();
    const c = make({ onCopy });
    selectAll(c);
    const before = c.getDoc();
    c.run('cut');
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onCopy.mock.calls[0]?.[1]).toBe(before);
    expect(atomCount(c)).toBe(0);
    expect(c.undoLabel()).toBe('Cut');
    c.run('undo');
    expect(atomCount(c)).toBe(3);
  });

  it('paste lands 1 BLU right and down of the source, wherever the pointer is', () => {
    const c = make();
    selectAll(c);
    const xs0 = Object.values(c.getDoc().atoms).map((a) => a.x);
    c.run('copy');
    c.setPointer({ x: 900, y: 500 });
    c.run('paste');
    expect(atomCount(c)).toBe(6);
    const fresh = [...c.getSelection().atoms];
    const xs = fresh.map((id) => c.getDoc().atoms[id]?.x ?? 0);
    const mid = (v: number[]): number => (Math.min(...v) + Math.max(...v)) / 2;
    expect(mid(xs)).toBeCloseTo(mid(xs0) + 1, 9);
    c.run('paste');
    const again = [...c.getSelection().atoms].map((id) => c.getDoc().atoms[id]?.x ?? 0);
    expect(mid(again)).toBeCloseTo(mid(xs0) + 2, 9);
  });

  it('paste-sub pastes a host fragment and can always run', () => {
    const c = make();
    const sub = extract(c.getDoc(), {
      atoms: new Set(Object.keys(c.getDoc().atoms) as never[]),
      bonds: new Set(),
      objects: new Set(),
    });
    expect(c.canRun({ type: 'paste-sub', sub })).toBe(true);
    c.run({ type: 'paste-sub', sub });
    expect(atomCount(c)).toBe(6);
    expect(c.undoLabel()).toBe('Paste');
  });

  it('duplicate adds a copy and selects it', () => {
    const c = make();
    selectAll(c);
    c.run('duplicate');
    expect(atomCount(c)).toBe(6);
    expect(c.getSelection().atoms.size).toBe(3);
    expect(c.undoLabel()).toBe('Duplicate');
  });

  it('select-all and delete work as host commands', () => {
    const c = make();
    c.run('select-all');
    expect(c.getSelection().atoms.size).toBe(3);
    c.run('delete');
    expect(atomCount(c)).toBe(0);
  });
});

describe('context menu (CM1)', () => {
  const eventsOf = (c: EditorController): EditorEvent[] => {
    const seen: EditorEvent[] = [];
    c.subscribe((e) => seen.push(e));
    return seen;
  };

  it('over an atom the event carries the atom and the screen point; the selection is untouched', () => {
    const c = make();
    const seen = eventsOf(c);
    const doc = c.getDoc();
    const atom = Object.values(doc.atoms)[1];
    if (!atom) throw new Error('no atom');
    const screen = bluToScreen(c.store.getState().viewport, atom, BL);
    const selection = c.getSelection();
    c.contextMenuAt(screen);
    expect(seen).toEqual([{ type: 'context-menu', target: { kind: 'atom', id: atom.id }, screen }]);
    expect(c.getSelection()).toBe(selection);
    expect(c.getDoc()).toBe(doc);
  });

  it('over a bond the target is the bond', () => {
    const c = make();
    const seen = eventsOf(c);
    const doc = c.getDoc();
    const bond = Object.values(doc.bonds)[0];
    if (!bond) throw new Error('no bond');
    const a = doc.atoms[bond.a1];
    const b = doc.atoms[bond.a2];
    if (!a || !b) throw new Error('no atoms');
    const v = c.store.getState().viewport;
    const screen = bluToScreen(v, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, BL);
    c.contextMenuAt(screen);
    expect(seen[0]).toMatchObject({ type: 'context-menu', target: { kind: 'bond', id: bond.id } });
  });

  it('on empty canvas the target is null', () => {
    const c = make();
    const seen = eventsOf(c);
    c.contextMenuAt({ x: 40, y: 650 });
    expect(seen).toEqual([{ type: 'context-menu', target: null, screen: { x: 40, y: 650 } }]);
  });

  it('over a handle the target is null (handles are not items)', () => {
    const c = make();
    c.run('select-all');
    const seen = eventsOf(c);
    const state = c.store.getState();
    const doc = c.getDoc();
    const { scene } = c.derive.committed(doc);
    const handle = selectionHandles(doc, scene, state.viewport, state.selection)[0];
    if (!handle) throw new Error('no handle');
    c.contextMenuAt(handle.at);
    expect(seen).toEqual([{ type: 'context-menu', target: null, screen: handle.at }]);
  });

  it('a gesture in progress is cancelled and nothing is emitted', () => {
    const c = make();
    const seen = eventsOf(c);
    const atom = Object.values(c.getDoc().atoms)[0];
    if (!atom) throw new Error('no atom');
    const screen = bluToScreen(c.store.getState().viewport, atom, BL);
    c.store.dispatch({
      type: 'pointer',
      event: {
        type: 'down',
        screen,
        p: { x: atom.x, y: atom.y },
        button: 0,
        mods: { shift: false, alt: false, ctrl: false },
      },
    });
    expect(c.store.getState().gesture).not.toBeNull();
    c.contextMenuAt(screen);
    expect(c.store.getState().gesture).toBeNull();
    expect(seen.filter((e) => e.type === 'context-menu')).toEqual([]);
  });
});

describe('factory', () => {
  it('still builds with only a clock', () => {
    expect(createEditorController({ clock: () => T0 }).getDoc().atoms).toEqual({});
  });
});

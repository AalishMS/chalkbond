// SPEC-editor.md R57: the per-tab state seam on the controller (takeState, putState, newState,
// snapshotState) and the `view` event. App-shell's switch (T11), timer record (SS4) and shutdown
// flush (SS10) depend on these.
import { emptyDoc, everything, type Doc } from '@core/doc-model';
import { resolveStyle } from '@core/svg-render';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CanvasEvent } from '../model/canvas-event';
import type { Point, Size } from '../model/geometry';
import { insertText } from '../model/text-edit';
import { bluToScreen, screenToBlu } from '../model/viewport';
import {
  createEditorController,
  type EditorController,
  type EditorEvent,
  type EditorOptions,
} from './controller';
import { tabStateDoc, tabStateView } from './tab-state';
import { addEthane, atomId, drawn, T0 } from './testing';

const SIZE: Size = { w: 1000, h: 600 };

const make = (opts: Partial<EditorOptions> = {}, size: Size | null = SIZE): EditorController => {
  const c = createEditorController({ clock: () => T0, logError: () => undefined, ...opts });
  if (size !== null) c.store.dispatch({ type: 'canvas-resized', size });
  return c;
};

const events = (c: EditorController): EditorEvent['type'][] => {
  const seen: EditorEvent['type'][] = [];
  c.subscribe((e) => seen.push(e.type));
  return seen;
};

const ptPerBlu = (c: EditorController): number => resolveStyle(c.getDoc().style).ptPerBlu;

/** The BLU point at the centre of the canvas. */
const centreBlu = (c: EditorController): Point => {
  const v = c.store.getState().viewport;
  return screenToBlu(v, { x: v.size.w / 2, y: v.size.h / 2 }, ptPerBlu(c));
};

const near = (a: Point, b: Point, tol = 1e-9): void => {
  expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(tol);
};

const pointerEvent = (
  c: EditorController,
  type: 'down' | 'move' | 'up',
  screen: Point,
): CanvasEvent => ({
  type,
  screen,
  p: screenToBlu(c.store.getState().viewport, screen, ptPerBlu(c)),
  button: 0,
  mods: { shift: false, alt: false, ctrl: false },
});

const send = (c: EditorController, type: 'down' | 'move' | 'up', screen: Point): void =>
  c.store.dispatch({ type: 'pointer', event: pointerEvent(c, type, screen) });

/** A Bond-tool drag from empty canvas, pressed and moved, not released. */
function startDrag(c: EditorController): void {
  c.store.dispatch({ type: 'select-tool', tool: 'bond' });
  send(c, 'down', { x: 200, y: 200 });
  send(c, 'move', { x: 260, y: 230 });
  expect(c.store.getState().gesture).not.toBeNull();
  expect(c.store.getState().preview).not.toBeNull();
}

const atomScreen = (c: EditorController, n: number): Point => {
  const atom = c.getDoc().atoms[atomId(n)];
  if (atom === undefined) throw new Error(`no atom a${n}`);
  return bluToScreen(c.store.getState().viewport, atom, ptPerBlu(c));
};

const ethanol = (): Doc => drawn({ name: 'ethanol', x: 0, y: 0 });
const benzene = (): Doc => drawn({ name: 'benzene', x: 2, y: 1 });

/** Tab A: ethanol, one bond added and undone and redone twice, a selection, zoomed and panned. */
function tabA(c: EditorController): void {
  c.load(ethanol());
  c.store.dispatch({ type: 'commit', label: 'Add bond', recipe: addEthane });
  c.store.dispatch({ type: 'commit', label: 'Add chain', recipe: addEthane });
  c.run('undo');
  c.store.dispatch({ type: 'select-tool', tool: 'select' });
  c.store.dispatch({
    type: 'set-selection',
    selection: { atoms: new Set([atomId(1)]), bonds: new Set(), objects: new Set() },
  });
  c.run('zoom-in');
  c.store.dispatch({ type: 'pan-by', dx: 30, dy: -12 });
}

describe('takeState and putState: two tabs', () => {
  it("take A, put B: B's drawing and history; put A back: A's undo, redo, selection and view", () => {
    const c = make();
    tabA(c);
    const docA = c.getDoc();
    const selectionA = c.getSelection();
    const zoomA = c.store.getState().viewport.zoom;
    const centreA = centreBlu(c);
    const a = c.takeState();

    const docB = benzene();
    c.putState(c.newState(docB));
    expect(c.getDoc()).toBe(docB);
    expect(c.canRun('undo')).toBe(false);
    expect(c.canRun('redo')).toBe(false);
    expect(c.getSelection().atoms.size).toBe(0);
    expect(c.isDirty()).toBe(false);
    c.store.dispatch({ type: 'commit', label: 'Add ring', recipe: addEthane });
    const b = c.takeState();
    expect(c.undoLabel()).toBe('Add ring');

    c.putState(a);
    expect(c.getDoc()).toBe(docA);
    expect(c.undoLabel()).toBe('Add bond');
    expect(c.redoLabel()).toBe('Add chain');
    expect(c.getSelection()).toBe(selectionA);
    expect(c.isDirty()).toBe(true);
    expect(c.store.getState().viewport.zoom).toBe(zoomA);
    near(centreBlu(c), centreA);
    c.run('redo');
    expect(c.undoLabel()).toBe('Add chain');

    c.putState(b);
    expect(c.undoLabel()).toBe('Add ring');
    c.run('undo');
    expect(c.getDoc()).toEqual(docB);
  });

  it('takeState during a drag cancels it: nothing is committed and no preview is kept', () => {
    const c = make();
    c.load(ethanol());
    const committed = c.getDoc();
    startDrag(c);
    const s = c.takeState();
    const after = c.store.getState();
    expect(after.gesture).toBeNull();
    expect(after.preview).toBeNull();
    expect(c.getDoc()).toBe(committed);
    expect(c.canRun('undo')).toBe(false);
    expect(tabStateDoc(s)).toBe(committed);
    c.putState(s);
    expect(c.store.getState().preview).toBeNull();
    expect(c.getDoc()).toBe(committed);
  });

  it('takeState has a precondition: no label or text editor open', () => {
    const c = make();
    c.load(ethanol());
    c.store.dispatch({ type: 'open-label', atom: atomId(1) });
    expect(c.canRun('focus-name-field')).toBe(false);
    expect(() => c.takeState()).toThrow(/label or text editor/);
    expect(c.store.getState().editing).not.toBeNull();
  });

  it('putState clears hover, gesture, preview, editing and notice', () => {
    const c = make();
    c.load(ethanol());
    const s = c.snapshotState();
    c.notify('info', 'Copied');
    c.store.dispatch({ type: 'set-hover', hover: { kind: 'atom', id: atomId(1) } });
    c.store.dispatch({ type: 'open-label', atom: atomId(1) });
    c.store.dispatch({ type: 'set-gesture', gesture: { kind: 'bond-press' } });
    c.putState(s);
    const after = c.store.getState();
    expect(after.hover).toBeNull();
    expect(after.gesture).toBeNull();
    expect(after.preview).toBeNull();
    expect(after.editing).toBeNull();
    expect(after.notice).toBeNull();
  });

  it('putState keeps the tool, variants, name-field text and the in-app clipboard', () => {
    const c = make();
    c.load(ethanol());
    c.store.dispatch({ type: 'select-tool', tool: 'select' });
    c.store.dispatch({ type: 'set-selection', selection: everything(c.getDoc()) });
    c.run('copy');
    const clipboard = c.store.getState().clipboard;
    expect(clipboard).not.toBeNull();
    c.store.dispatch({ type: 'select-tool', tool: 'ring' });
    c.store.dispatch({ type: 'select-variant', tool: 'ring', variant: 'cyclohexane' });
    c.store.dispatch({ type: 'select-variant', tool: 'bond', variant: 'double' });
    c.store.dispatch({ type: 'name-text', text: 'aspi' });
    const before = c.store.getState();

    c.putState(c.newState(benzene()));
    const after = c.store.getState();
    expect(after.tool).toBe('ring');
    expect(after.variants).toBe(before.variants);
    expect(after.variants.ring).toBe('cyclohexane');
    expect(after.nameField.text).toBe('aspi');
    expect(after.clipboard).toBe(clipboard);
    expect(after.clipboardSource).toBe(before.clipboardSource);
  });

  it('putState on a different canvas size keeps the zoom and puts the stored centre in the middle', () => {
    const c = make();
    tabA(c);
    const zoom = c.store.getState().viewport.zoom;
    const centre = centreBlu(c);
    const a = c.takeState();
    c.putState(c.newState(benzene()));
    const bigger: Size = { w: 1280, h: 722 };
    c.store.dispatch({ type: 'canvas-resized', size: bigger });
    c.putState(a);
    const v = c.store.getState().viewport;
    expect(v.size).toEqual(bigger);
    expect(v.zoom).toBe(zoom);
    near(centreBlu(c), centre);
  });

  it('a structural drawing keeps its centre (BLU through ptPerBlu, R53)', () => {
    const c = make();
    c.load(ethanol());
    c.run('toggle-formula');
    c.store.dispatch({ type: 'pan-by', dx: 25, dy: 15 });
    const centre = centreBlu(c);
    const s = c.takeState();
    c.putState(c.newState(benzene()));
    c.putState(s);
    near(centreBlu(c), centre);
    near(tabStateView(s).centre, centre);
  });
});

describe('putState events: doc, selection, history, dirty only for what changed', () => {
  it('a different tab sends doc, selection, history and dirty', () => {
    const c = make();
    tabA(c);
    const b = c.newState(benzene());
    const seen = events(c);
    c.putState(b);
    expect(seen).toEqual(expect.arrayContaining(['doc', 'selection', 'history', 'dirty']));
    expect(seen).not.toContain('view');
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('putting back the state just taken sends nothing', () => {
    const c = make();
    tabA(c);
    const a = c.takeState();
    const seen = events(c);
    c.putState(a);
    expect(seen).toEqual([]);
  });

  it('a state that differs only in selection sends only selection', () => {
    const c = make();
    tabA(c);
    const a = c.snapshotState();
    c.store.dispatch({ type: 'set-selection', selection: everything(c.getDoc()) });
    const seen = events(c);
    c.putState(a);
    expect(seen).toEqual(['selection']);
  });

  it('a clean state after a dirty one with the same history position sends dirty', () => {
    const c = make();
    c.store.dispatch({ type: 'commit', label: 'Add bond', recipe: addEthane });
    const dirty = c.snapshotState();
    c.markSaved();
    const seen = events(c);
    c.putState(dirty);
    expect(seen).toEqual(['dirty']);
  });
});

describe('snapshotState is read-only (SS4, SS10; spec item (2))', () => {
  const unchanged = (c: EditorController, setUp: () => void): void => {
    setUp();
    const before = c.store.getState();
    const seen = events(c);
    const s = c.snapshotState();
    expect(c.store.getState()).toBe(before);
    expect(seen).toEqual([]);
    expect(tabStateDoc(s)).toBe(c.getDoc());
  };

  it('during a drag: gesture and preview stay, the snapshot holds the committed drawing', () => {
    const c = make();
    c.load(ethanol());
    unchanged(c, () => startDrag(c));
    expect(c.store.getState().gesture).not.toBeNull();
  });

  it('with a label editor open', () => {
    const c = make();
    c.load(ethanol());
    unchanged(c, () => {
      c.store.dispatch({ type: 'open-label', atom: atomId(1) });
      const editing = c.store.getState().editing;
      if (editing === null) throw new Error('no editor');
      c.store.dispatch({ type: 'edit-set', edit: insertText(editing.edit, 'N') });
    });
    expect(c.store.getState().editing).not.toBeNull();
  });

  it('during an IME composition in a text editor (typed text not yet committed)', () => {
    const c = make();
    c.load(ethanol());
    unchanged(c, () => {
      c.store.dispatch({ type: 'select-tool', tool: 'text' });
      c.store.dispatch({
        type: 'open-text',
        target: { kind: 'new', fresh: { at: { x: 3, y: 3 }, align: 'left' } },
      });
      const editing = c.store.getState().editing;
      if (editing === null) throw new Error('no editor');
      c.store.dispatch({ type: 'edit-set', edit: insertText(editing.edit, 'क') });
      c.notify('info', 'Copied');
    });
    expect(c.store.getState().editing?.kind).toBe('text');
    expect(Object.keys(c.getDoc().objects)).toHaveLength(0);
  });

  it('with a hover ghost and a notice', () => {
    const c = make();
    c.load(ethanol());
    unchanged(c, () => {
      c.store.dispatch({ type: 'select-tool', tool: 'bond' });
      c.setPointer(atomScreen(c, 1));
      c.refreshHover();
      expect(c.store.getState().preview?.hovering).toBe(true);
      c.notify('error', 'That edit is not possible here.');
    });
  });

  it('property: after any reachable sequence, snapshotState changes nothing', () => {
    type Op =
      | { kind: 'commit' }
      | { kind: 'undo' }
      | { kind: 'redo' }
      | { kind: 'zoom'; dir: 1 | -1 }
      | { kind: 'pan'; dx: number; dy: number }
      | { kind: 'tool'; tool: 'bond' | 'select' | 'text' }
      | { kind: 'pointer'; type: 'down' | 'move' | 'up'; x: number; y: number }
      | { kind: 'label' }
      | { kind: 'escape' }
      | { kind: 'resize'; w: number; h: number };
    const op: fc.Arbitrary<Op> = fc.oneof(
      fc.constant<Op>({ kind: 'commit' }),
      fc.constant<Op>({ kind: 'undo' }),
      fc.constant<Op>({ kind: 'redo' }),
      fc.constantFrom<1 | -1>(1, -1).map<Op>((dir) => ({ kind: 'zoom', dir })),
      fc
        .record({
          dx: fc.integer({ min: -200, max: 200 }),
          dy: fc.integer({ min: -200, max: 200 }),
        })
        .map<Op>((d) => ({ kind: 'pan', ...d })),
      fc.constantFrom('bond', 'select', 'text').map<Op>((tool) => ({ kind: 'tool', tool })),
      fc
        .record({
          type: fc.constantFrom<'down' | 'move' | 'up'>('down', 'move', 'up'),
          x: fc.integer({ min: 0, max: 1000 }),
          y: fc.integer({ min: 0, max: 600 }),
        })
        .map<Op>((p) => ({ kind: 'pointer', ...p })),
      fc.constant<Op>({ kind: 'label' }),
      fc.constant<Op>({ kind: 'escape' }),
      fc
        .record({ w: fc.integer({ min: 300, max: 1600 }), h: fc.integer({ min: 200, max: 900 }) })
        .map<Op>((s) => ({ kind: 'resize', ...s })),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 25 }), (ops) => {
        const c = make();
        c.load(ethanol());
        for (const o of ops) {
          switch (o.kind) {
            case 'commit':
              c.store.dispatch({ type: 'commit', label: 'Add bond', recipe: addEthane });
              break;
            case 'undo':
            case 'redo':
              c.run(o.kind);
              break;
            case 'zoom':
              c.store.dispatch({ type: 'zoom-step', dir: o.dir });
              break;
            case 'pan':
              c.store.dispatch({ type: 'pan-by', dx: o.dx, dy: o.dy });
              break;
            case 'tool':
              c.store.dispatch({ type: 'select-tool', tool: o.tool });
              break;
            case 'pointer':
              send(c, o.type, { x: o.x, y: o.y });
              break;
            case 'label':
              if (atomId(1) in c.getDoc().atoms) {
                c.store.dispatch({ type: 'open-label', atom: atomId(1) });
              }
              break;
            case 'escape':
              c.store.dispatch({ type: 'escape' });
              break;
            case 'resize':
              c.store.dispatch({ type: 'canvas-resized', size: { w: o.w, h: o.h } });
              break;
          }
        }
        const before = c.store.getState();
        const seen = events(c);
        const s = c.snapshotState();
        expect(c.store.getState()).toBe(before);
        expect(seen).toEqual([]);
        expect(tabStateDoc(s)).toBe(c.getDoc());
      }),
      { numRuns: 60 },
    );
  });
});

describe('newState and load', () => {
  it('newState touches nothing: the same store state and no events', () => {
    const c = make();
    tabA(c);
    startDrag(c);
    const before = c.store.getState();
    const seen = events(c);
    const s = c.newState(benzene());
    expect(c.store.getState()).toBe(before);
    expect(seen).toEqual([]);
    expect(tabStateDoc(s)).not.toBe(c.getDoc());
  });

  it('load(doc) and putState(newState(doc)) give the same editor state', () => {
    const doc = benzene();
    const viaLoad = make();
    tabA(viaLoad);
    viaLoad.load(doc);
    const viaPut = make();
    tabA(viaPut);
    viaPut.putState(viaPut.newState(doc));
    const a = viaLoad.store.getState();
    const b = viaPut.store.getState();
    expect(b.viewport).toEqual(a.viewport);
    expect(b.saved).toBe(a.saved);
    expect(b.selection).toEqual(a.selection);
    expect(b.history.doc).toBe(a.history.doc);
    expect(b.history.past).toEqual([]);
    expect(viaPut.isDirty()).toBe(false);
  });

  it('a new state put before the canvas is measured opens at V2 when it is', () => {
    const doc = benzene();
    const early = make({}, null);
    early.putState(early.newState(doc));
    early.store.dispatch({ type: 'canvas-resized', size: SIZE });
    const late = make();
    late.load(doc);
    expect(early.store.getState().viewport).toEqual(late.store.getState().viewport);
  });

  it('a shown state put before the canvas is measured keeps its zoom and centre (restore at start)', () => {
    const c = make();
    tabA(c);
    const zoom = c.store.getState().viewport.zoom;
    const centre = centreBlu(c);
    const a = c.takeState();
    const fresh = make({}, null);
    fresh.putState(a);
    fresh.store.dispatch({ type: 'canvas-resized', size: { w: 900, h: 500 } });
    expect(fresh.store.getState().viewport.zoom).toBe(zoom);
    near(centreBlu(fresh), centre);
  });

  it('a state taken before the canvas is measured still opens at V2 once put on a canvas', () => {
    const doc = benzene();
    const unmeasured = make({ doc }, null);
    const s = unmeasured.takeState();
    const c = make();
    c.putState(s);
    const reference = make();
    reference.load(doc);
    expect(c.store.getState().viewport).toEqual(reference.store.getState().viewport);
  });
});

describe('the view event (zoom or pan changed; never a resize)', () => {
  const viewEvents = (c: EditorController, act: () => void): number => {
    const seen = events(c);
    act();
    return seen.filter((t) => t === 'view').length;
  };

  it('fires on wheel zoom, pan, zoom-fit, zoom-reset and a key zoom', () => {
    const c = make({ doc: ethanol() });
    expect(
      viewEvents(c, () =>
        c.store.dispatch({ type: 'zoom-wheel', deltaY: -120, anchor: { x: 100, y: 80 } }),
      ),
    ).toBe(1);
    expect(viewEvents(c, () => c.store.dispatch({ type: 'pan-by', dx: 12, dy: 5 }))).toBe(1);
    expect(viewEvents(c, () => c.run('zoom-fit'))).toBe(1);
    expect(viewEvents(c, () => c.run('zoom-reset'))).toBe(1);
    expect(viewEvents(c, () => c.run('zoom-in'))).toBe(1);
    expect(viewEvents(c, () => c.run('zoom-out'))).toBe(1);
  });

  it('does not fire when nothing moves', () => {
    const c = make({ doc: ethanol() });
    c.run('zoom-reset');
    expect(viewEvents(c, () => c.run('zoom-reset'))).toBe(0);
    expect(viewEvents(c, () => c.store.dispatch({ type: 'select-tool', tool: 'ring' }))).toBe(0);
  });

  it('never fires on a canvas resize, the first measurement included', () => {
    const c = make({ doc: ethanol() }, null);
    expect(viewEvents(c, () => c.store.dispatch({ type: 'canvas-resized', size: SIZE }))).toBe(0);
    expect(
      viewEvents(c, () => c.store.dispatch({ type: 'canvas-resized', size: { w: 700, h: 500 } })),
    ).toBe(0);
  });

  it('does not fire on putState or load (the host knows the view it puts)', () => {
    const c = make();
    tabA(c);
    const a = c.takeState();
    expect(viewEvents(c, () => c.putState(c.newState(benzene())))).toBe(0);
    expect(viewEvents(c, () => c.putState(a))).toBe(0);
    expect(viewEvents(c, () => c.load(emptyDoc(T0)))).toBe(0);
  });
});

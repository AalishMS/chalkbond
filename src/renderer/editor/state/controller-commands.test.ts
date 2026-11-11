// Every host command has a canRun and a run that agree (SPEC-editor.md "Seam to the host"):
// when canRun is false, run changes nothing; when it is true, run has the documented effect.
import { addAtom, addBond, everything, extract, type AtomId, type Doc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { messyScheme } from '../model/tidy-fixtures';
import { createEditorController, type EditorCommand, type EditorController } from './controller';
import { addEthane, T0 } from './testing';

const make = (doc?: Doc): EditorController =>
  createEditorController({
    clock: () => T0,
    logError: () => undefined,
    ...(doc === undefined ? {} : { doc }),
  });

const sized = (): EditorController => {
  const c = make();
  c.store.dispatch({ type: 'canvas-resized', size: { w: 1200, h: 700 } });
  return c;
};

const ethane = (): EditorController => {
  const c = sized();
  c.store.dispatch({ type: 'commit', label: 'Add bond', recipe: addEthane });
  return c;
};

const selectAll = (c: EditorController): EditorController => {
  c.run('select-all');
  return c;
};

const withEditorOpen = (c: EditorController): EditorController => {
  c.store.dispatch({ type: 'open-label', atom: Object.keys(c.getDoc().atoms)[0] as AtomId });
  return c;
};

const withGesture = (c: EditorController): EditorController => {
  c.store.dispatch({ type: 'set-gesture', gesture: { kind: 'test' } });
  return c;
};

const atomCount = (c: EditorController): number => Object.keys(c.getDoc().atoms).length;
const zoomOf = (c: EditorController): number => c.store.getState().viewport.zoom;

const zoomedAll = (dir: 1 | -1): EditorController => {
  const c = sized();
  const cmd = dir === 1 ? 'zoom-in' : 'zoom-out';
  for (let i = 0; i < 100 && c.canRun(cmd); i++) c.run(cmd);
  return c;
};

const tilted = (): EditorController => {
  const c = sized();
  c.store.dispatch({
    type: 'commit',
    label: 'Add bond',
    recipe: (d) => {
      const [d1, a] = addAtom(d, { element: 'C', x: 0, y: 0 });
      const [d2, b] = addAtom(d1, { element: 'C', x: 0.3, y: 0.7 });
      return addBond(d2, a, b)[0];
    },
  });
  return selectAll(c);
};

const withArrow = (): EditorController => make(messyScheme().doc);

const benzene = (): EditorController => {
  const c = sized();
  c.run({ type: 'insert-text', text: 'benzene' });
  return c;
};

const copied = (): EditorController => {
  const c = selectAll(ethane());
  c.run('copy');
  return c;
};

const afterUndo = (): EditorController => {
  const c = ethane();
  c.run('undo');
  return c;
};

const afterZoomIn = (): EditorController => {
  const c = sized();
  c.run('zoom-in');
  return c;
};

const fragment = (() => {
  const doc = ethane().getDoc();
  return extract(doc, everything(doc));
})();

interface CommandCase {
  readonly name: string;
  readonly cmd: EditorCommand;
  /** A controller where `canRun(cmd)` must be false; null when no state blocks the command. */
  readonly blocked: (() => EditorController) | null;
  /** A controller where `canRun(cmd)` must be true. */
  readonly ready: () => EditorController;
  /** The documented effect of `run(cmd)`; `before` is the document as it was. */
  readonly effect: (c: EditorController, before: Doc) => void;
}

const COMMAND_CASES: readonly CommandCase[] = [
  {
    name: 'focus-name-field',
    cmd: 'focus-name-field',
    blocked: () => withEditorOpen(ethane()),
    ready: sized,
    effect: (c) => expect(c.store.getState().focusRequest).toBe(1),
  },
  {
    name: 'undo',
    cmd: 'undo',
    blocked: sized,
    ready: ethane,
    effect: (c) => {
      expect(atomCount(c)).toBe(0);
      expect(c.canRun('redo')).toBe(true);
    },
  },
  {
    name: 'undo (editor open)',
    cmd: 'undo',
    blocked: () => withEditorOpen(ethane()),
    ready: ethane,
    effect: (c) => expect(atomCount(c)).toBe(0),
  },
  {
    name: 'redo',
    cmd: 'redo',
    blocked: ethane,
    ready: afterUndo,
    effect: (c) => expect(atomCount(c)).toBe(2),
  },
  {
    name: 'cut',
    cmd: 'cut',
    blocked: ethane,
    ready: () => selectAll(ethane()),
    effect: (c) => {
      expect(atomCount(c)).toBe(0);
      expect(c.canRun('paste')).toBe(true);
    },
  },
  {
    name: 'copy',
    cmd: 'copy',
    blocked: ethane,
    ready: () => selectAll(ethane()),
    effect: (c, before) => {
      expect(c.getDoc()).toBe(before);
      expect(c.store.getState().clipboard).not.toBeNull();
    },
  },
  {
    name: 'paste',
    cmd: 'paste',
    blocked: () => selectAll(ethane()),
    ready: copied,
    effect: (c) => expect(atomCount(c)).toBe(4),
  },
  {
    name: 'duplicate',
    cmd: 'duplicate',
    blocked: ethane,
    ready: () => selectAll(ethane()),
    effect: (c) => expect(atomCount(c)).toBe(4),
  },
  {
    name: 'delete',
    cmd: 'delete',
    blocked: ethane,
    ready: () => selectAll(ethane()),
    effect: (c) => expect(atomCount(c)).toBe(0),
  },
  {
    name: 'select-all',
    cmd: 'select-all',
    blocked: () => withEditorOpen(ethane()),
    ready: ethane,
    effect: (c) => {
      expect(c.getSelection().atoms.size).toBe(2);
      expect(c.getSelection().bonds.size).toBe(1);
    },
  },
  {
    name: 'zoom-in',
    cmd: 'zoom-in',
    blocked: () => zoomedAll(1),
    ready: sized,
    effect: (c) => expect(zoomOf(c)).toBeGreaterThan(zoomOf(sized())),
  },
  {
    name: 'zoom-out',
    cmd: 'zoom-out',
    blocked: () => zoomedAll(-1),
    ready: sized,
    effect: (c) => expect(zoomOf(c)).toBeLessThan(zoomOf(sized())),
  },
  {
    name: 'zoom-fit',
    cmd: 'zoom-fit',
    blocked: null,
    ready: afterZoomIn,
    effect: (c) => expect(zoomOf(c)).toBeLessThanOrEqual(1.5),
  },
  {
    name: 'zoom-reset',
    cmd: 'zoom-reset',
    blocked: null,
    ready: afterZoomIn,
    effect: (c) => expect(zoomOf(c)).toBe(1),
  },
  {
    name: 'clean-up',
    cmd: 'clean-up',
    blocked: sized,
    ready: tilted,
    effect: (c, before) => {
      expect(c.undoLabel()).toBe('Clean up');
      expect(c.getDoc()).not.toBe(before);
    },
  },
  {
    name: 'toggle-kekulé',
    cmd: 'toggle-kekulé',
    blocked: sized,
    ready: benzene,
    effect: (c) => expect(c.undoLabel()).toBe('Show Kekulé'),
  },
  {
    name: 'tidy-reaction',
    cmd: 'tidy-reaction',
    blocked: () => withEditorOpen(ethane()),
    ready: withArrow,
    effect: (c, before) => {
      expect(c.undoLabel()).toBe('Tidy reaction');
      expect(c.getDoc()).not.toBe(before);
    },
  },
  {
    name: 'tidy-reaction (gesture running)',
    cmd: 'tidy-reaction',
    blocked: () => withGesture(withArrow()),
    ready: withArrow,
    effect: (c) => expect(c.undoLabel()).toBe('Tidy reaction'),
  },
  {
    name: 'set-preset',
    cmd: { type: 'set-preset', preset: 'journal' },
    blocked: () => withEditorOpen(ethane()),
    ready: sized,
    effect: (c) => {
      expect(c.getDoc().style.preset).toBe('journal');
      expect(c.undoLabel()).toBe('Switch to Handout style');
    },
  },
  {
    name: 'set-preset (gesture running)',
    cmd: { type: 'set-preset', preset: 'journal' },
    blocked: () => withGesture(sized()),
    ready: sized,
    effect: (c) => expect(c.getDoc().style.preset).toBe('journal'),
  },
  {
    name: 'paste-sub',
    cmd: { type: 'paste-sub', sub: fragment },
    blocked: () => withEditorOpen(ethane()),
    ready: sized,
    effect: (c) => expect(atomCount(c)).toBe(2),
  },
  {
    name: 'insert-text',
    cmd: { type: 'insert-text', text: 'ethanol' },
    blocked: null,
    ready: sized,
    effect: (c) => {
      expect(atomCount(c)).toBe(3);
      expect(c.undoLabel()).toBe('Insert ethanol');
    },
  },
];

const HOST_COMMANDS = [
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'duplicate',
  'delete',
  'select-all',
  'zoom-in',
  'zoom-out',
  'zoom-fit',
  'zoom-reset',
  'clean-up',
  'toggle-kekulé',
  'tidy-reaction',
  'focus-name-field',
  'set-preset',
  'paste-sub',
  'insert-text',
];

describe('every host command has a canRun and a run that agree', () => {
  it('the table covers every command of the host seam', () => {
    const named = new Set(
      COMMAND_CASES.map((x) => (typeof x.cmd === 'string' ? x.cmd : x.cmd.type)),
    );
    expect([...named].sort()).toEqual([...HOST_COMMANDS].sort());
  });

  for (const row of COMMAND_CASES) {
    if (row.blocked !== null) {
      const blocked = row.blocked;
      it(`${row.name}: when canRun is false, run changes nothing`, () => {
        const c = blocked();
        expect(c.canRun(row.cmd)).toBe(false);
        const before = c.store.getState();
        c.run(row.cmd);
        expect(c.store.getState()).toBe(before);
      });
    }
    it(`${row.name}: when canRun is true, run has the documented effect`, () => {
      const c = row.ready();
      expect(c.canRun(row.cmd)).toBe(true);
      const before = c.getDoc();
      c.run(row.cmd);
      row.effect(c, before);
    });
  }

  it('focus-name-field records repeated requests only while no editor is open', () => {
    const c = ethane();
    expect(c.canRun('focus-name-field')).toBe(true);
    c.run('focus-name-field');
    c.run('focus-name-field');
    expect(c.store.getState().focusRequest).toBe(2);
    withEditorOpen(c);
    expect(c.canRun('focus-name-field')).toBe(false);
    const before = c.store.getState();
    c.run('focus-name-field');
    expect(c.store.getState()).toBe(before);
    c.store.dispatch({ type: 'edit-cancel' });
    c.store.dispatch({
      type: 'open-text',
      target: {
        kind: 'new',
        fresh: { at: { x: 3, y: 3 }, align: 'left' },
      },
    });
    expect(c.canRun('focus-name-field')).toBe(false);
    c.run('focus-name-field');
    expect(c.store.getState().focusRequest).toBe(2);
  });

  it('set-preset to the preset the document has can run and records nothing (PR1)', () => {
    const c = sized();
    const cmd: EditorCommand = { type: 'set-preset', preset: 'slides' };
    expect(c.canRun(cmd)).toBe(true);
    const before = c.store.getState();
    c.run(cmd);
    expect(c.store.getState().history).toBe(before.history);
  });

  it('insert-text of text that names nothing runs, shows the not-found row and changes no document', () => {
    const c = sized();
    c.run({ type: 'insert-text', text: 'ethanl' });
    expect(atomCount(c)).toBe(0);
    expect(c.store.getState().nameField.error).not.toBeNull();
  });
});

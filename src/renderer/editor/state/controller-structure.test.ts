import { describe, expect, it } from 'vitest';
import { createEditorController, type EditorController } from './controller';
import { drawn, T0 } from './testing';

const make = (name?: string): EditorController =>
  createEditorController({
    clock: () => T0,
    logError: () => undefined,
    ...(name === undefined ? {} : { doc: drawn({ name, x: 0, y: 0 }) }),
  });

describe('the structure commands of the host and the shortcuts (C1, C3)', () => {
  it('cannot run on an empty document', () => {
    const c = make();
    expect(c.canRun('clean-up')).toBe(false);
    expect(c.canRun('toggle-kekulé')).toBe(false);
    c.run('clean-up');
    c.run('toggle-kekulé');
    expect(c.isDirty()).toBe(false);
  });

  it('clean-up runs on a molecule as one undo step', () => {
    const c = make('pentane');
    expect(c.canRun('clean-up')).toBe(true);
    c.run('clean-up');
    expect(c.undoLabel()).toBe('Clean up');
  });

  it('toggle-kekulé flips benzene to Kekulé and back', () => {
    const c = make('benzene');
    expect(c.canRun('toggle-kekulé')).toBe(true);
    c.run('toggle-kekulé');
    expect(c.undoLabel()).toBe('Show Kekulé');
    expect(Object.values(c.getDoc().bonds).filter((b) => b.order === 2)).toHaveLength(3);
    c.run('toggle-kekulé');
    expect(c.undoLabel()).toBe('Show circle');
  });

  it('cannot run while an editor is open', () => {
    const c = make('benzene');
    const atom = Object.keys(c.getDoc().atoms)[0] as never;
    c.store.dispatch({ type: 'open-label', atom });
    expect(c.canRun('clean-up')).toBe(false);
    expect(c.canRun('toggle-kekulé')).toBe(false);
  });

  it('tidy-reaction runs when idle; without an arrow it says so and records nothing (TR1)', () => {
    const c = make('benzene');
    expect(c.canRun('tidy-reaction')).toBe(true);
    c.run('tidy-reaction');
    expect(c.store.getState().notice?.text).toContain('Nothing to tidy');
    expect(c.isDirty()).toBe(false);
  });
});

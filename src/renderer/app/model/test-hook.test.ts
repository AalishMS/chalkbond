import { addAtom, emptyDoc, type Doc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { createEditorController, type EditorController } from '../../editor';
import { createTestHook } from './test-hook';

const T0 = '2026-01-01T00:00:00.000Z';

const ethane = (): Doc => {
  const [d1] = addAtom(emptyDoc(T0), { element: 'C', x: 0, y: 0 });
  const [d2] = addAtom(d1, { element: 'C', x: 1, y: 0 });
  return d2;
};

const make = (): { controller: EditorController; hook: ReturnType<typeof createTestHook> } => {
  const controller = createEditorController({ clock: () => T0 });
  return { controller, hook: createTestHook(controller) };
};

describe('createTestHook', () => {
  it('loads a document and reads it back unchanged', () => {
    const { hook } = make();
    const doc = ethane();
    hook.load(doc);
    expect(hook.getDoc()).toEqual(doc);
  });

  it('reports the selection as arrays of ids', () => {
    const { controller, hook } = make();
    expect(hook.getSelection()).toEqual({ atoms: [], bonds: [], objects: [] });
    hook.load(ethane());
    controller.run('select-all');
    const selection = hook.getSelection();
    expect(selection.atoms).toHaveLength(2);
    expect(selection.bonds).toEqual([]);
    expect(selection.objects).toEqual([]);
    expect(selection.atoms).toEqual([...controller.getSelection().atoms]);
  });

  it('collects editor events since the start and forgets them on clearEvents', () => {
    const { controller, hook } = make();
    hook.load(ethane());
    controller.run('select-all');
    const types = hook.events().map((e) => e.type);
    expect(types).toContain('doc');
    expect(types).toContain('selection');
    hook.clearEvents();
    expect(hook.events()).toEqual([]);
    controller.run('delete');
    expect(hook.events().length).toBeGreaterThan(0);
  });

  it('returns a copy of the events', () => {
    const { controller, hook } = make();
    controller.load(ethane());
    const before = hook.events().length;
    expect(before).toBeGreaterThan(0);
    hook.events().pop();
    expect(hook.events()).toHaveLength(before);
  });

  it('has empty notices and commands until the shell produces some', () => {
    const { hook } = make();
    expect(hook.notices()).toEqual([]);
    expect(hook.commands()).toEqual([]);
  });

  it('stops listening after dispose', () => {
    const { controller, hook } = make();
    hook.dispose();
    controller.load(ethane());
    expect(hook.events()).toEqual([]);
  });
});

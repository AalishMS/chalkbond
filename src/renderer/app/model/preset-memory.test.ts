// ST1 (SPEC-app-shell.md "Settings"): a document change that switches the preset (status-bar
// switch, View menu, undo or redo of a switch) is remembered for new drawings; a load (New, Open,
// recover, test hook) never is. Run against the real editor controller.
import { describe, expect, it } from 'vitest';
import { addAtom, emptyDoc, setStyle, type Doc } from '@core/doc-model';
import { createEditorController } from '../../editor';
import { createPresetMemory } from './preset-memory';

const NOW = '2026-11-11T09:00:00.000Z';
const clock = (): string => NOW;
const doc = (preset: 'slides' | 'journal', atoms = 0): Doc => {
  let d = setStyle(emptyDoc(NOW), { preset });
  for (let i = 0; i < atoms; i++) [d] = addAtom(d, { element: 'C', x: i, y: 0 });
  return d;
};

function rig(start: Doc = doc('slides')) {
  const controller = createEditorController({ clock, doc: start });
  const stored: string[] = [];
  const memory = createPresetMemory({ controller, remember: (style) => stored.push(style) });
  return { controller, stored, memory };
}

describe('createPresetMemory', () => {
  it('a switch through the controller is stored', () => {
    const { controller, stored } = rig();
    controller.run({ type: 'set-preset', preset: 'journal' });
    expect(controller.getDoc().style.preset).toBe('journal');
    expect(stored).toEqual(['journal']);
  });

  it('undo and redo of a switch are switches too, even back to a clean drawing', () => {
    const { controller, stored } = rig();
    controller.run({ type: 'set-preset', preset: 'journal' });
    controller.run('undo');
    expect(controller.isDirty()).toBe(false);
    controller.run('redo');
    expect(stored).toEqual(['journal', 'slides', 'journal']);
  });

  it('a load through the memory is never stored, whatever its preset', () => {
    const { controller, stored, memory } = rig();
    memory.load(doc('journal', 2));
    expect(controller.getDoc().style.preset).toBe('journal');
    memory.load(doc('slides'));
    memory.load(doc('journal'));
    expect(stored).toEqual([]);
  });

  it('after a load, a switch is compared with the loaded preset', () => {
    const { controller, stored, memory } = rig();
    memory.load(doc('journal', 1));
    controller.run({ type: 'set-preset', preset: 'slides' });
    expect(stored).toEqual(['slides']);
  });

  it('edits that keep the preset store nothing', () => {
    const { controller, stored } = rig(doc('journal', 2));
    controller.run('select-all');
    controller.run('delete');
    controller.run('undo');
    expect(stored).toEqual([]);
  });

  it('a switch on a dirty drawing is stored (dirty is not the signal)', () => {
    const { controller, stored, memory } = rig();
    memory.load(doc('slides', 2));
    controller.run('select-all');
    controller.run('delete');
    expect(controller.isDirty()).toBe(true);
    controller.run({ type: 'set-preset', preset: 'journal' });
    expect(stored).toEqual(['journal']);
  });

  it('a load that throws still ends the suppression', () => {
    const { controller, stored, memory } = rig();
    const broken = { ...doc('journal'), atoms: null } as unknown as Doc;
    try {
      memory.load(broken);
    } catch {
      // the editor may reject it; the memory must not stay suppressed
    }
    memory.load(doc('slides'));
    controller.run({ type: 'set-preset', preset: 'journal' });
    expect(stored).toEqual(['journal']);
  });

  it('dispose stops listening', () => {
    const { controller, stored, memory } = rig();
    memory.dispose();
    controller.run({ type: 'set-preset', preset: 'journal' });
    expect(stored).toEqual([]);
  });
});

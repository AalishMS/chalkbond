import { formulaOf, perceive } from '@core/chem-core';
import {
  addAtom,
  addBond,
  current,
  emptyDoc,
  updateAtom,
  undoLabel,
  type AtomId,
  type Doc,
} from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { formulaText } from '../model/formula';
import { selectionScope } from '../model/scope';
import type { EditorState } from './editor-state';
import { EMPTY_SELECTION } from './editor-state';
import { reduce, type EditorAction } from './reducer';
import { drawn, freshState, testContext, wholeOf } from './testing';

const ctx = testContext();
const run = (s: EditorState, a: EditorAction): EditorState => reduce(s, a, ctx);
const docOf = (s: EditorState): Doc => current(s.history);
const ids = (d: Doc): AtomId[] => Object.keys(d.atoms) as AtomId[];
const formula = (d: Doc): string => formulaText(formulaOf(d, ids(d)));
const orders = (d: Doc): number[] =>
  Object.values(d.bonds)
    .map((b) => b.order)
    .sort();

const ready = (doc: Doc, tool: EditorState['tool'] = 'select'): EditorState => {
  let s = run(freshState(doc), { type: 'canvas-resized', size: { w: 1200, h: 700 } });
  s = run(s, { type: 'select-tool', tool });
  return s;
};

const centroid = (d: Doc): { x: number; y: number } => {
  const atoms = Object.values(d.atoms);
  return {
    x: atoms.reduce((n, a) => n + a.x, 0) / atoms.length,
    y: atoms.reduce((n, a) => n + a.y, 0) / atoms.length,
  };
};

describe('Clean up (C1)', () => {
  const distorted = (): Doc => {
    const pentane = drawn({ name: 'pentane', x: 0, y: 0 });
    let doc = pentane;
    ids(pentane).forEach((id, i) => {
      doc = updateAtom(doc, id, {
        x: (pentane.atoms[id]?.x ?? 0) + 0.4 * Math.sin(i * 7),
        y: i * 0.3,
      });
    });
    return doc;
  };

  it('is one "Clean up" undo step and the drawing stays where it was', () => {
    const doc = distorted();
    const s = run(ready(doc), { type: 'clean-up' });
    expect(s.history.past).toHaveLength(1);
    expect(undoLabel(s.history)).toBe('Clean up');
    const after = docOf(s);
    expect(after).not.toEqual(doc);
    const a = centroid(doc);
    const b = centroid(after);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.2);
    // Every bond is one bond length again.
    for (const bond of Object.values(after.bonds)) {
      const p = after.atoms[bond.a1] as { x: number; y: number };
      const q = after.atoms[bond.a2] as { x: number; y: number };
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeCloseTo(1, 1);
    }
    const undone = run(s, { type: 'undo' });
    expect(docOf(undone)).toEqual(doc);
  });

  it('acts on the selection only when there is one', () => {
    const doc = reduceTwo();
    const first = wholeOf(doc, ids(doc).slice(0, 5));
    const s = run({ ...ready(doc), selection: first }, { type: 'clean-up' });
    // The second molecule is untouched.
    for (const id of ids(doc).slice(5)) expect(docOf(s).atoms[id]).toEqual(doc.atoms[id]);
  });

  it('does nothing without a fragment', () => {
    const s = ready(emptyDoc('2026-01-01T00:00:00.000Z'));
    expect(run(s, { type: 'clean-up' })).toBe(s);
  });

  it('does nothing while an editor is open', () => {
    const doc = distorted();
    const s = run(ready(doc), { type: 'open-label', atom: ids(doc)[0] as AtomId });
    expect(run(s, { type: 'clean-up' })).toBe(s);
  });
});

function reduceTwo(): Doc {
  const doc = drawn({ name: 'pentane', x: 0, y: 0 }, { name: 'ethanol', x: 10, y: 4 });
  return doc;
}

describe('Show Kekulé / Show circle (C3, R11)', () => {
  it('benzene: Show Kekulé gives three double bonds, then Show circle gives the circle back', () => {
    const doc = drawn({ name: 'benzene', x: 0, y: 0 });
    expect(orders(doc)).toEqual([1.5, 1.5, 1.5, 1.5, 1.5, 1.5]);
    let s = run(ready(doc), { type: 'toggle-kekule' });
    expect(orders(docOf(s))).toEqual([1, 1, 1, 2, 2, 2]);
    expect(undoLabel(s.history)).toBe('Show Kekulé');
    expect(formula(docOf(s))).toBe(formula(doc));
    s = run(s, { type: 'toggle-kekule' });
    expect(orders(docOf(s))).toEqual([1.5, 1.5, 1.5, 1.5, 1.5, 1.5]);
    expect(undoLabel(s.history)).toBe('Show circle');
    expect(s.history.past).toHaveLength(2);
  });

  it('cyclohexene offers neither: the button is disabled (R11) and the action does nothing', () => {
    const doc = drawn({ name: 'cyclohexene', x: 0, y: 0 });
    const { perception } = ctx.derive.committed(doc);
    const scope = selectionScope(doc, perception, EMPTY_SELECTION);
    expect(scope.hasAromatic15 || scope.hasAromaticNon15).toBe(false);
    const s = ready(doc);
    expect(run(s, { type: 'toggle-kekule' })).toBe(s);
  });

  it('a 1.5 system with no Kekulé structure shows the notice and changes nothing', () => {
    let doc = emptyDoc('2026-01-01T00:00:00.000Z');
    const ring: AtomId[] = [];
    for (let i = 0; i < 5; i += 1) {
      const angle = (i * 2 * Math.PI) / 5;
      const [d, id] = addAtom(doc, { element: 'C', x: Math.cos(angle), y: Math.sin(angle) });
      doc = d;
      ring.push(id);
    }
    ring.forEach((id, i) => {
      doc = addBond(doc, id, ring[(i + 1) % 5] as AtomId, { order: 1.5 })[0];
    });
    const s = run(ready(doc), { type: 'toggle-kekule' });
    expect(s.notice).toMatchObject({
      kind: 'error',
      text: "This ring can't be shown with alternating double bonds.",
    });
    expect(s.history.past).toHaveLength(0);
  });

  it('Show circle with nothing to change records nothing and says so (info)', () => {
    // chem-core reads every bond as aromatic here, but the drawing is a plain cyclohexane that
    // aromatize leaves alone: the notice, no undo step.
    const doc = drawn({ name: 'cyclohexane', x: 0, y: 0 });
    const real = ctx.derive;
    const lying = {
      ...ctx,
      derive: {
        ...real,
        committed: (d: Doc) => {
          const x = real.committed(d);
          const bonds = Object.fromEntries(
            Object.keys(d.bonds).map((id) => [id, { aromatic: true }]),
          );
          return { ...x, perception: { ...x.perception, bonds } };
        },
      },
    };
    const s = reduce(ready(doc), { type: 'toggle-kekule' }, lying);
    expect(s.notice).toMatchObject({
      kind: 'info',
      text: 'No benzene ring here to show as a circle.',
    });
    expect(s.history.past).toHaveLength(0);
  });

  it('acts on the selected ring only', () => {
    const doc = drawn({ name: 'benzene', x: 0, y: 0 }, { name: 'benzene', x: 8, y: 0 });
    const first = wholeOf(doc, ids(doc).slice(0, 6));
    const s = run({ ...ready(doc), selection: first }, { type: 'toggle-kekule' });
    expect(orders(docOf(s)).filter((o) => o === 2)).toHaveLength(3);
    expect(orders(docOf(s)).filter((o) => o === 1.5)).toHaveLength(6);
  });
});

describe('Expand (C2)', () => {
  /** Ethanol with Ph on the oxygen: ethylbenzene as an abbreviation. */
  const phenylEthane = (): { doc: Doc; ph: AtomId } => {
    const doc = drawn({ name: 'ethanol', x: 0, y: 0 });
    const o = ids(doc).find((id) => doc.atoms[id]?.element === 'O') as AtomId;
    return { doc: updateAtom(doc, o, { element: 'C', label: 'Ph' }), ph: o };
  };

  it('replaces the abbreviation with its atoms: six more carbons, same formula, one step', () => {
    const { doc, ph } = phenylEthane();
    const before = formula(doc);
    const s0 = { ...ready(doc), selection: wholeOf(doc, [ph]) };
    const s = run(s0, { type: 'expand' });
    expect(ids(docOf(s)).length).toBe(ids(doc).length + 5);
    expect(formula(docOf(s))).toBe(before);
    expect(s.history.past).toHaveLength(1);
    expect(undoLabel(s.history)).toBe('Expand label');
    expect(perceive(docOf(s)).warnings).toEqual([]);
  });

  it('does nothing without an abbreviation in the selection', () => {
    const { doc } = phenylEthane();
    const plain = ids(doc).find((id) => doc.atoms[id]?.label === undefined) as AtomId;
    const s = { ...ready(doc), selection: wholeOf(doc, [plain]) };
    expect(run(s, { type: 'expand' })).toBe(s);
    const none = ready(doc);
    expect(run(none, { type: 'expand' })).toBe(none);
  });
});

describe('the warnings button (C6)', () => {
  const twoBad = (): Doc => {
    let doc = drawn({ name: 'ethanol', x: 0, y: 0 });
    const [a, b] = ids(doc).filter((id) => doc.atoms[id]?.element === 'C') as [AtomId, AtomId];
    doc = updateAtom(doc, a, { element: '*', label: 'H20' });
    doc = updateAtom(doc, b, { element: '*', label: 'Q9' });
    return doc;
  };

  it('does nothing without warnings', () => {
    const s = ready(drawn({ name: 'ethanol', x: 0, y: 0 }));
    expect(run(s, { type: 'show-warning' })).toBe(s);
  });

  it('selects the first warning (Select becomes the tool), then cycles', () => {
    const doc = twoBad();
    const warnings = ctx.derive.committed(doc).perception.warnings;
    expect(warnings).toHaveLength(2);
    let s = run(ready(doc, 'bond'), { type: 'show-warning' });
    expect(s.tool).toBe('select');
    expect([...s.selection.atoms]).toEqual([...(warnings[0]?.atoms ?? [])]);
    s = run(s, { type: 'show-warning' });
    expect([...s.selection.atoms]).toEqual([...(warnings[1]?.atoms ?? [])]);
    s = run(s, { type: 'show-warning' });
    expect([...s.selection.atoms]).toEqual([...(warnings[0]?.atoms ?? [])]);
    expect(s.history.past).toHaveLength(0);
  });

  it('brings a warning that is off screen into view', () => {
    let doc = twoBad();
    const [far] = addAtom(doc, { element: 'C', x: 80, y: 60 });
    doc = far;
    const id = ids(doc).at(-1) as AtomId;
    doc = updateAtom(doc, id, { element: '*', label: 'Zz9' });
    const base = ready(doc);
    let s = base;
    for (let i = 0; i < 3; i += 1) s = run(s, { type: 'show-warning' });
    expect([...s.selection.atoms]).toEqual([id]);
    expect(s.viewport.pan).not.toEqual(base.viewport.pan);
  });
});

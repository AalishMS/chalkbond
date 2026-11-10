import { formulaOf } from '@core/chem-core';
import { addAtom, addBond, emptyDoc, type AtomId, type Doc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { addLoneAtom, applyMark, atomMode, dragAtom, setElement, type AtomMark } from './atom-ops';
import { formulaText } from './formula';

const NOW = '2026-01-01T00:00:00.000Z';
const lone = (): { doc: Doc; a: AtomId } => {
  const [doc, a] = addAtom(emptyDoc(NOW), { element: 'C', x: 0, y: 0 });
  return { doc, a };
};
const formula = (d: Doc): string => formulaText(formulaOf(d, Object.keys(d.atoms) as AtomId[]));

describe('atomMode', () => {
  it('element options are element symbols, the rest are marks', () => {
    expect(atomMode('Cl')).toEqual({ kind: 'element', element: 'Cl' });
    expect(atomMode('C')).toEqual({ kind: 'element', element: 'C' });
    for (const m of ['plus', 'minus', 'lone-pair', 'radical', 'delta-plus', 'delta-minus']) {
      expect(atomMode(m)).toEqual({ kind: 'mark', mark: m });
    }
  });

  it('an unknown option is carbon', () => {
    expect(atomMode('')).toEqual({ kind: 'element', element: 'C' });
  });
});

describe('A2 setElement', () => {
  it('sets the element, clears label and explicit H, keeps charge and marks', () => {
    const { doc, a } = lone();
    const marked = applyMark(applyMark(doc, a, 'plus', false) as Doc, a, 'lone-pair', false) as Doc;
    const out = setElement(marked, a, 'O') as Doc;
    expect(out.atoms[a]).toMatchObject({ element: 'O', charge: 1, lonePairs: 1 });
    expect(out.atoms[a]?.label).toBeUndefined();
    expect(out.atoms[a]?.explicitH).toBeUndefined();
  });

  it('the element it already has: nothing', () => {
    const { doc, a } = lone();
    expect(setElement(doc, a, 'C')).toBeNull();
  });
});

describe('A1 addLoneAtom', () => {
  it('a lone N is NH3, a lone O is H2O, a lone C is CH4', () => {
    const point = { x: 2, y: 3 };
    const n = addLoneAtom(emptyDoc(NOW), point, 'N');
    expect(formula(n)).toBe('H3N · 17.03 g/mol');
    expect(Object.values(n.atoms)[0]).toMatchObject({ element: 'N', x: 2, y: 3 });
    expect(formula(addLoneAtom(emptyDoc(NOW), point, 'O'))).toBe('H2O · 18.02 g/mol');
    expect(formula(addLoneAtom(emptyDoc(NOW), point, 'C'))).toBe('CH4 · 16.04 g/mol');
  });
});

describe('A1 dragAtom', () => {
  it('a drag from an atom bonds a new atom of that element, 1.0 BLU away', () => {
    const { doc, a } = lone();
    const edit = dragAtom(doc, a, { x: 3, y: 0 }, false, null, 'Cl');
    const out = edit?.doc as Doc;
    expect(Object.keys(out.atoms)).toHaveLength(2);
    const fresh = Object.values(out.atoms).find((x) => x.id !== a);
    expect(fresh).toMatchObject({ element: 'Cl' });
    expect(fresh?.x).toBeCloseTo(1, 9);
    expect(Object.keys(out.bonds)).toHaveLength(1);
  });

  it('a drag that ends on another atom only bonds the two, the element of neither changes', () => {
    const { doc, a } = lone();
    const [d2, b] = addAtom(doc, { element: 'C', x: 1, y: 0 });
    const edit = dragAtom(d2, a, { x: 1, y: 0 }, false, b, 'Cl');
    expect(edit?.merge).toBe(b);
    expect(edit?.doc.atoms[b]?.element).toBe('C');
    expect(Object.keys(edit?.doc.bonds ?? {})).toHaveLength(1);
  });

  it('nothing to add: null', () => {
    const { doc, a } = lone();
    expect(dragAtom(doc, a, { x: 0, y: 0 }, false, null, 'Cl')).toBeNull();
    const [d2, b] = addAtom(doc, { element: 'C', x: 1, y: 0 });
    const d3 = addBond(d2, a, b)[0];
    expect(dragAtom(d3, a, { x: 1, y: 0 }, false, b, 'Cl')).toBeNull();
  });
});

describe('A3 marks', () => {
  const go = (doc: Doc, a: AtomId, mark: AtomMark, reverse = false): Doc =>
    applyMark(doc, a, mark, reverse) ?? doc;

  it('positive charge steps +1, Shift reverses it, clamped to -4..4 (no step at the limit)', () => {
    const { doc, a } = lone();
    let d = go(go(doc, a, 'plus'), a, 'plus');
    expect(d.atoms[a]?.charge).toBe(2);
    d = go(d, a, 'plus', true);
    expect(d.atoms[a]?.charge).toBe(1);
    d = go(d, a, 'minus');
    expect(d.atoms[a]?.charge).toBe(0);
    d = go(go(go(go(d, a, 'minus'), a, 'minus'), a, 'minus'), a, 'minus');
    expect(d.atoms[a]?.charge).toBe(-4);
    expect(applyMark(d, a, 'minus', false)).toBeNull();
    d = go(d, a, 'minus', true);
    expect(d.atoms[a]?.charge).toBe(-3);
  });

  it('lone pairs cycle 0, 1, 2, 3, 4, 0; Shift goes backwards', () => {
    const { doc, a } = lone();
    const seen: (number | undefined)[] = [];
    let d = doc;
    for (let i = 0; i < 5; i++) {
      d = go(d, a, 'lone-pair');
      seen.push(d.atoms[a]?.lonePairs);
    }
    expect(seen).toEqual([1, 2, 3, 4, 0]);
    expect(go(doc, a, 'lone-pair', true).atoms[a]?.lonePairs).toBe(4);
  });

  it('a radical toggles 0 and 1', () => {
    const { doc, a } = lone();
    const on = go(doc, a, 'radical');
    expect(on.atoms[a]?.radical).toBe(1);
    expect(go(on, a, 'radical').atoms[a]?.radical).toBe(0);
  });

  it('delta+ and delta- are set, or cleared if already that value; Shift swaps them', () => {
    const { doc, a } = lone();
    const plus = go(doc, a, 'delta-plus');
    expect(plus.atoms[a]?.partialCharge).toBe('δ+');
    expect(go(plus, a, 'delta-plus').atoms[a]?.partialCharge).toBeUndefined();
    expect(go(plus, a, 'delta-minus').atoms[a]?.partialCharge).toBe('δ-');
    expect(go(doc, a, 'delta-plus', true).atoms[a]?.partialCharge).toBe('δ-');
  });

  it('an unknown atom changes nothing', () => {
    expect(applyMark(lone().doc, 'a9' as AtomId, 'plus', false)).toBeNull();
  });
});

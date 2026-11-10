import { addAtom, addBond, emptyDoc, type AtomId, type Doc, type Selection } from '@core/doc-model';
import { createPerceiver, type Formula } from '@core/chem-core';
import { describe, expect, it } from 'vitest';
import { formulaRuns, formulaText, statusFormula } from './formula';

describe('formulaRuns', () => {
  it('subscripts the digits of a Hill string', () => {
    expect(formulaRuns('C2H6O')).toEqual([
      { text: 'C', kind: 'text' },
      { text: '2', kind: 'sub' },
      { text: 'H', kind: 'text' },
      { text: '6', kind: 'sub' },
      { text: 'O', kind: 'text' },
    ]);
  });

  it('H2O has one subscript', () => {
    expect(formulaRuns('H2O')).toEqual([
      { text: 'H', kind: 'text' },
      { text: '2', kind: 'sub' },
      { text: 'O', kind: 'text' },
    ]);
  });

  it('puts the charge in a superscript with a real minus sign', () => {
    expect(formulaRuns('C2H3O2', -1)).toEqual([
      { text: 'C', kind: 'text' },
      { text: '2', kind: 'sub' },
      { text: 'H', kind: 'text' },
      { text: '3', kind: 'sub' },
      { text: 'O', kind: 'text' },
      { text: '2', kind: 'sub' },
      { text: '−', kind: 'sup' },
    ]);
    expect(formulaRuns('NH4', 2).at(-1)).toEqual({ text: '2+', kind: 'sup' });
    expect(formulaRuns('NH4', 1).at(-1)).toEqual({ text: '+', kind: 'sup' });
  });

  it('reads a trailing sign of a dictionary formula as a charge of one', () => {
    expect(formulaRuns('C3H6N+')).toEqual([
      { text: 'C', kind: 'text' },
      { text: '3', kind: 'sub' },
      { text: 'H', kind: 'text' },
      { text: '6', kind: 'sub' },
      { text: 'N', kind: 'text' },
      { text: '+', kind: 'sup' },
    ]);
  });
});

const formula = (hill: string, mw: number | null, charge = 0): Formula => ({
  counts: {},
  charge,
  hill,
  text: hill,
  mw,
  exactMass: null,
});

describe('formulaText', () => {
  it('joins the formula and the mass', () => {
    expect(formulaText(formula('C2H6O', 46.069))).toBe('C2H6O · 46.07 g/mol');
  });
  it('leaves the mass out when unknown', () => {
    expect(formulaText(formula('C2H6OR', null))).toBe('C2H6OR');
  });
});

function twoFragments(): Doc {
  let d = emptyDoc('2026-01-01T00:00:00.000Z');
  const ids: AtomId[] = [];
  for (const [x, y] of [
    [0, 0],
    [1, 0],
    [5, 0],
    [6, 0],
  ] as const) {
    const [d2, id] = addAtom(d, { element: 'C', x, y });
    d = d2;
    ids.push(id);
  }
  d = addBond(d, ids[0] as AtomId, ids[1] as AtomId)[0];
  d = addBond(d, ids[2] as AtomId, ids[3] as AtomId)[0];
  return d;
}

describe('statusFormula (C5)', () => {
  const sel = (atoms: string[] = []): Selection => ({
    atoms: new Set(atoms as AtomId[]),
    bonds: new Set(),
    objects: new Set(),
  });

  it('is the single fragment (methanol) when nothing is selected', () => {
    let d = emptyDoc('2026-01-01T00:00:00.000Z');
    const [d1, a] = addAtom(d, { element: 'C', x: 0, y: 0 });
    const [d2, b] = addAtom(d1, { element: 'O', x: 1, y: 0 });
    d = addBond(d2, a, b)[0];
    const f = statusFormula(d, createPerceiver()(d), sel());
    expect(f?.hill).toBe('CH4O');
  });

  it('is nothing for two fragments and no selection', () => {
    const d = twoFragments();
    expect(statusFormula(d, createPerceiver()(d), sel())).toBeNull();
  });

  it('is the selection when something is selected', () => {
    const d = twoFragments();
    expect(statusFormula(d, createPerceiver()(d), sel(['a1']))?.hill).toBe('C2H6');
  });

  it('sums every fragment the selection touches', () => {
    const d = twoFragments();
    expect(statusFormula(d, createPerceiver()(d), sel(['a1', 'a3']))?.hill).toBe('C4H12');
  });

  it('is nothing for an empty document', () => {
    const d = emptyDoc('2026-01-01T00:00:00.000Z');
    expect(statusFormula(d, createPerceiver()(d), sel())).toBeNull();
  });
});

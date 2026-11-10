import { formulaOf, perceive } from '@core/chem-core';
import { addAtom, addBond, emptyDoc, updateAtom, type AtomId, type Doc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { formulaText } from './formula';
import { labelCommit, labelPrefill, labelWarning } from './label-edit';

const NOW = '2026-01-01T00:00:00.000Z';

/** C-C-O: the oxygen is the chain end of ethanol's skeleton. */
function ethanol(): { doc: Doc; c1: AtomId; o: AtomId } {
  const [d1, c1] = addAtom(emptyDoc(NOW), { element: 'C', x: 0, y: 0 });
  const [d2, c2] = addAtom(d1, { element: 'C', x: 1, y: 0 });
  const [d3, o] = addAtom(d2, { element: 'O', x: 2, y: 0 });
  const [d4] = addBond(d3, c1, c2);
  return { doc: addBond(d4, c2, o)[0], c1, o };
}

const lone = (element: 'C' | 'O'): { doc: Doc; id: AtomId } => {
  const [doc, id] = addAtom(emptyDoc(NOW), { element, x: 0, y: 0 });
  return { doc, id };
};

const commit = (doc: Doc, id: AtomId, text: string): Doc | null => labelCommit(doc, id, text);
const formula = (d: Doc): string => formulaText(formulaOf(d, Object.keys(d.atoms) as AtomId[]));

describe('labelPrefill (L1)', () => {
  it('is the label when there is one', () => {
    const { doc, id } = lone('C');
    expect(labelPrefill(updateAtom(doc, id, { label: 'Ph' }).atoms[id] as never)).toBe('Ph');
  });

  it('is the element, with the H count when explicit', () => {
    const { doc, id } = lone('O');
    const atom = doc.atoms[id] as never;
    expect(labelPrefill(atom)).toBe('O');
    expect(labelPrefill(updateAtom(doc, id, { explicitH: 1 }).atoms[id] as never)).toBe('OH');
    expect(labelPrefill(updateAtom(doc, id, { explicitH: 2 }).atoms[id] as never)).toBe('OH2');
  });

  it('writes the charge after the element', () => {
    const { doc, id } = lone('O');
    expect(labelPrefill(updateAtom(doc, id, { charge: -1 }).atoms[id] as never)).toBe('O-');
    expect(labelPrefill(updateAtom(doc, id, { charge: 2 }).atoms[id] as never)).toBe('O+2');
  });

  it('a bare carbon reads C', () => {
    expect(labelPrefill(lone('C').doc.atoms['a1' as AtomId] as never)).toBe('C');
  });
});

describe('labelCommit (L3)', () => {
  it('OH on a chain end: element O, explicitH left automatic', () => {
    const { doc, o } = ethanol();
    expect(commit(doc, o, 'OH')).toBeNull();
    const nh = commit(doc, o, 'NH2') as Doc;
    expect(nh.atoms[o]).toMatchObject({ element: 'N' });
    expect(nh.atoms[o]?.explicitH).toBeUndefined();
    expect(formula(nh)).toBe('C2H7N · 45.08 g/mol');
  });

  it('OH on a bare oxygen records explicitH 1 because the automatic count is 2', () => {
    const { doc, id } = lone('C');
    const out = commit(doc, id, 'OH') as Doc;
    expect(out.atoms[id]).toMatchObject({ element: 'O', explicitH: 1 });
  });

  it('OH2 is explicit only when it differs from the automatic count', () => {
    const { doc, id } = lone('C');
    expect((commit(doc, id, 'OH2') as Doc).atoms[id]?.explicitH).toBeUndefined();
    const { doc: e, o } = ethanol();
    expect((commit(e, o, 'OH2') as Doc).atoms[o]?.explicitH).toBe(2);
  });

  it('a typed charge sets the charge, none clears it', () => {
    const { doc, o } = ethanol();
    const minus = commit(doc, o, 'O-') as Doc;
    expect(minus.atoms[o]).toMatchObject({ element: 'O', charge: -1 });
    const back = commit(minus, o, 'OH') as Doc;
    expect(back.atoms[o]?.charge).toBe(0);
  });

  it('Ph is a label on carbon', () => {
    const { doc, o } = ethanol();
    const out = commit(doc, o, 'Ph') as Doc;
    expect(out.atoms[o]).toMatchObject({ element: 'C', label: 'Ph', charge: 0 });
  });

  it('an abbreviation with an O attachment keeps that element', () => {
    const { doc, c1 } = ethanol();
    expect(commit(doc, c1, 'OMe')?.atoms[c1]).toMatchObject({ element: 'O', label: 'OMe' });
  });

  it('an unknown text is kept as the label on a pseudo-atom, with a warning', () => {
    const { doc, o } = ethanol();
    const out = commit(doc, o, 'H20') as Doc;
    expect(out.atoms[o]).toMatchObject({ element: '*', label: 'H20' });
    expect(perceive(out).warnings.map((w) => w.message)).toContain('Unknown label "H20".');
  });

  it('empty text makes a plain carbon', () => {
    const { doc, o } = ethanol();
    const out = commit(doc, o, '   ') as Doc;
    expect(out.atoms[o]).toMatchObject({ element: 'C', charge: 0 });
    expect(out.atoms[o]?.label).toBeUndefined();
  });

  it('typing the same thing again changes nothing (null: no undo step)', () => {
    const { doc, c1 } = ethanol();
    expect(commit(doc, c1, 'C')).toBeNull();
  });

  it('keeps the other fields of the atom', () => {
    const { doc, o } = ethanol();
    const marked = updateAtom(doc, o, { lonePairs: 2, radical: 1 });
    expect(commit(marked, o, 'N')?.atoms[o]).toMatchObject({ lonePairs: 2, radical: 1 });
  });
});

describe('labelWarning (L2)', () => {
  it('only text that interprets as unknown warns', () => {
    expect(labelWarning('H20')).toBe(true);
    expect(labelWarning('OH')).toBe(false);
    expect(labelWarning('Ph')).toBe(false);
    expect(labelWarning('')).toBe(false);
    expect(labelWarning('  ')).toBe(false);
  });
});

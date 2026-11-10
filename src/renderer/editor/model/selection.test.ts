import { addAtom, addBond, emptyDoc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { insertedSelection } from './selection';

describe('insertedSelection', () => {
  it('is every item whose id was issued at or after the old nextId', () => {
    const base = emptyDoc('2026-01-01T00:00:00.000Z');
    const [d1, a] = addAtom(base, { element: 'C', x: 0, y: 0 });
    const [d2, b] = addAtom(d1, { element: 'C', x: 1, y: 0 });
    const d3 = addBond(d2, a, b)[0];
    const before = d3;
    const [d4, c] = addAtom(before, { element: 'O', x: 2, y: 0 });
    const [d5, bc] = addBond(d4, b, c);
    const sel = insertedSelection(before.nextId, d5);
    expect([...sel.atoms]).toEqual([c]);
    expect([...sel.bonds]).toEqual([bc]);
    expect(sel.objects.size).toBe(0);
    expect(sel.atoms.has(a)).toBe(false);
  });

  it('is empty when nothing was added', () => {
    const d = emptyDoc('2026-01-01T00:00:00.000Z');
    const sel = insertedSelection(d.nextId, d);
    expect(sel.atoms.size + sel.bonds.size + sel.objects.size).toBe(0);
  });
});

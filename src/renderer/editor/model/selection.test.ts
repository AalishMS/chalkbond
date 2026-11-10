import {
  addAtom,
  addBond,
  addObject,
  emptyDoc,
  fragments,
  type AtomId,
  type BondId,
  type ObjectId,
} from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION } from '../state/editor-state';
import { drawn, wholeOf } from '../state/testing';
import type { Hit } from './hit-test';
import {
  clickSelection,
  expandSelection,
  insertedSelection,
  isEmptySelection,
  selectAll,
} from './selection';

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

describe('S1 clickSelection (Decision 6)', () => {
  const doc = drawn({ name: 'benzene', x: 0, y: 0 }, { name: 'ethanol', x: 6, y: 0 });
  const benzene = fragments(doc).find((f) => f.length === 6) as AtomId[];
  const ethanol = fragments(doc).find((f) => f.length === 3) as AtomId[];
  const ring = wholeOf(doc, benzene);
  const eth = wholeOf(doc, ethanol);
  const atom = (id: AtomId): Hit => ({ kind: 'atom', id });
  const none = { shift: false, alt: false };
  const ids = (s: { atoms: ReadonlySet<string>; bonds: ReadonlySet<string> }) =>
    [...s.atoms, ...s.bonds].sort();

  it('a click on an atom of an unselected fragment selects the whole fragment', () => {
    const s = clickSelection(doc, EMPTY_SELECTION, atom(benzene[0] as AtomId), none);
    expect(s.atoms.size).toBe(6);
    expect(s.bonds.size).toBe(6);
  });

  it('a click on a bond selects the whole fragment too', () => {
    const bond = [...ring.bonds][0] as BondId;
    const s = clickSelection(doc, EMPTY_SELECTION, { kind: 'bond', id: bond }, none);
    expect(ids(s)).toEqual(ids(ring));
  });

  it('a second click on an atom of the fully selected fragment narrows to that atom', () => {
    const a = benzene[2] as AtomId;
    const s = clickSelection(doc, ring, atom(a), none);
    expect([...s.atoms]).toEqual([a]);
    expect(s.bonds.size).toBe(0);
  });

  it('a second click on a bond narrows to that bond alone', () => {
    const b = [...ring.bonds][3] as BondId;
    const s = clickSelection(doc, ring, { kind: 'bond', id: b }, none);
    expect([...s.bonds]).toEqual([b]);
    expect(s.atoms.size).toBe(0);
  });

  it('narrowing drops every other selected item', () => {
    const both = {
      atoms: new Set([...ring.atoms, ...eth.atoms]),
      bonds: new Set([...ring.bonds, ...eth.bonds]),
      objects: new Set<ObjectId>(),
    };
    const a = ethanol[0] as AtomId;
    const s = clickSelection(doc, both, atom(a), none);
    expect([...s.atoms]).toEqual([a]);
    expect(s.bonds.size).toBe(0);
  });

  it('a third click selects the whole fragment again', () => {
    const a = benzene[2] as AtomId;
    const narrowed = clickSelection(doc, ring, atom(a), none);
    const again = clickSelection(doc, narrowed, atom(a), none);
    expect(ids(again)).toEqual(ids(ring));
  });

  it('Alt+click picks one atom or bond directly', () => {
    const a = benzene[1] as AtomId;
    const s = clickSelection(doc, EMPTY_SELECTION, atom(a), { shift: false, alt: true });
    expect([...s.atoms]).toEqual([a]);
    expect(s.bonds.size).toBe(0);
    const b = [...ring.bonds][0] as BondId;
    const t = clickSelection(doc, ring, { kind: 'bond', id: b }, { shift: false, alt: true });
    expect([...t.bonds]).toEqual([b]);
    expect(t.atoms.size).toBe(0);
  });

  it('Shift+click adds a second fragment, and a second Shift+click removes it', () => {
    const shift = { shift: true, alt: false };
    const added = clickSelection(doc, ring, atom(ethanol[0] as AtomId), shift);
    expect(added.atoms.size).toBe(9);
    expect(added.bonds.size).toBe(8);
    const removed = clickSelection(doc, added, atom(ethanol[0] as AtomId), shift);
    expect(ids(removed)).toEqual(ids(ring));
  });

  it('Shift+Alt+click toggles one atom in and out', () => {
    const mods = { shift: true, alt: true };
    const a = ethanol[0] as AtomId;
    const added = clickSelection(doc, ring, atom(a), mods);
    expect(added.atoms.has(a)).toBe(true);
    expect(added.atoms.size).toBe(7);
    expect(clickSelection(doc, added, atom(a), mods).atoms.has(a)).toBe(false);
  });

  it('a click on an object selects it; Shift toggles it', () => {
    const [withArrow, id] = addObject(doc, {
      type: 'arrow',
      kind: 'forward',
      from: { x: 0, y: 3 },
      to: { x: 2, y: 3 },
    });
    const hit: Hit = { kind: 'object', id, type: 'arrow' };
    const s = clickSelection(withArrow, ring, hit, none);
    expect([...s.objects]).toEqual([id]);
    expect(s.atoms.size).toBe(0);
    const t = clickSelection(withArrow, ring, hit, { shift: true, alt: false });
    expect(t.atoms.size).toBe(6);
    expect(t.objects.has(id)).toBe(true);
    expect(clickSelection(withArrow, t, hit, { shift: true, alt: false }).objects.size).toBe(0);
  });

  it('a click on empty canvas clears the selection', () => {
    expect(clickSelection(doc, ring, null, none)).toBe(EMPTY_SELECTION);
  });

  it('R24: Shift+click on empty canvas keeps the selection', () => {
    expect(clickSelection(doc, ring, null, { shift: true, alt: false })).toBe(ring);
  });
});

describe('selectAll and expandSelection', () => {
  const doc = drawn({ name: 'ethanol', x: 0, y: 0 });
  it('selectAll holds every atom, bond and object', () => {
    const s = selectAll(doc);
    expect(s.atoms.size).toBe(3);
    expect(s.bonds.size).toBe(2);
  });

  it('expandSelection adds the endpoints of selected bonds', () => {
    const bond = Object.keys(doc.bonds)[0] as BondId;
    const e = expandSelection(doc, {
      atoms: new Set(),
      bonds: new Set([bond]),
      objects: new Set(),
    });
    expect(e.atoms.size).toBe(2);
  });

  it('isEmptySelection', () => {
    expect(isEmptySelection(EMPTY_SELECTION)).toBe(true);
    expect(isEmptySelection(selectAll(doc))).toBe(false);
  });
});

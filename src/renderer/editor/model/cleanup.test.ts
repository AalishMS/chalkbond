import {
  addAtom,
  addObject,
  deleteItems,
  updateAtom,
  type AtomId,
  type BondId,
  type Doc,
  type Selection,
} from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { drawn } from '../state/testing';
import { deleteWithOrphans } from './cleanup';

/** Ethanol C1-C2-O as drawn by the dictionary: the carbon far from the O, the next one, the O. */
function ethanol(): { doc: Doc; c1: AtomId; c2: AtomId; o: AtomId; b12: BondId; b2o: BondId } {
  const doc = drawn({ name: 'ethanol', x: 0, y: 0 });
  const atoms = Object.values(doc.atoms);
  const o = atoms.find((a) => a.element === 'O')?.id as AtomId;
  const bondOf = (id: AtomId) => Object.values(doc.bonds).find((b) => b.a1 === id || b.a2 === id);
  const b2o = bondOf(o)?.id as BondId;
  const bond2o = doc.bonds[b2o];
  const c2 = (bond2o?.a1 === o ? bond2o.a2 : bond2o?.a1) as AtomId;
  const c1 = atoms.find((a) => a.element === 'C' && a.id !== c2)?.id as AtomId;
  const b12 = Object.values(doc.bonds).find((b) => b.id !== b2o)?.id as BondId;
  return { doc, c1, c2, o, b12, b2o };
}

const sel = (over: Partial<Selection>): Selection => ({
  atoms: new Set(),
  bonds: new Set(),
  objects: new Set(),
  ...over,
});

describe('E2 orphan rule', () => {
  it('deleting the C1-C2 bond removes the now bondless plain C1 and keeps C2-O', () => {
    const { doc, c1, c2, o, b12, b2o } = ethanol();
    const next = deleteWithOrphans(doc, sel({ bonds: new Set([b12]) }));
    expect(Object.keys(next.atoms).sort()).toEqual([c2, o].sort());
    expect(Object.keys(next.bonds)).toEqual([b2o]);
    expect(c1 in next.atoms).toBe(false);
  });

  it('deleting the C-O bond keeps the lone O (not a carbon)', () => {
    const { doc, c1, c2, o, b2o } = ethanol();
    const next = deleteWithOrphans(doc, sel({ bonds: new Set([b2o]) }));
    expect(Object.keys(next.atoms).sort()).toEqual([c1, c2, o].sort());
    expect(Object.keys(next.bonds)).toHaveLength(1);
  });

  it('deleting the middle carbon removes the end carbon it orphans and keeps the O', () => {
    const { doc, c1, c2, o } = ethanol();
    const next = deleteWithOrphans(doc, sel({ atoms: new Set([c2]) }));
    expect(Object.keys(next.atoms)).toEqual([o]);
    expect(c1 in next.atoms).toBe(false);
    expect(Object.keys(next.bonds)).toHaveLength(0);
  });

  it('keeps a bondless carbon with a charge', () => {
    const { doc, c1, b12 } = ethanol();
    const charged = updateAtom(doc, c1, { charge: 1 });
    const next = deleteWithOrphans(charged, sel({ bonds: new Set([b12]) }));
    expect(c1 in next.atoms).toBe(true);
  });

  it('keeps a bondless carbon with a lone pair, a label, an isotope or a colour', () => {
    const { doc, c1, b12 } = ethanol();
    for (const patch of [
      { lonePairs: 1 },
      { label: 'Me' },
      { isotope: 13 },
      { radical: 1 as const },
    ]) {
      const next = deleteWithOrphans(updateAtom(doc, c1, patch), sel({ bonds: new Set([b12]) }));
      expect(c1 in next.atoms, JSON.stringify(patch)).toBe(true);
    }
  });

  it('keeps a bondless carbon that a curved arrow refers to (the anchor exception)', () => {
    const { doc, c1, b12 } = ethanol();
    const [withArrow] = addObject(doc, {
      type: 'curved-arrow',
      head: 'full',
      from: { kind: 'atom', atom: c1 },
      to: { kind: 'point', p: { x: 3, y: 3 } },
      bend: 0.3,
    });
    const next = deleteWithOrphans(withArrow, sel({ bonds: new Set([b12]) }));
    expect(c1 in next.atoms).toBe(true);
  });

  it('keeps a bondless carbon that a caption or a callout refers to', () => {
    const { doc, c1, b12 } = ethanol();
    const [withCaption] = addObject(doc, { type: 'caption', runs: [{ text: '1' }], target: [c1] });
    expect(c1 in deleteWithOrphans(withCaption, sel({ bonds: new Set([b12]) })).atoms).toBe(true);
    const [withCallout] = addObject(doc, {
      type: 'callout',
      at: { x: 4, y: 4 },
      runs: [{ text: 'x' }],
      anchor: { kind: 'atom', atom: c1 },
    });
    expect(c1 in deleteWithOrphans(withCallout, sel({ bonds: new Set([b12]) })).atoms).toBe(true);
  });

  it('does not touch an atom that already had no bond', () => {
    const { doc, c1, b12 } = ethanol();
    const [withLone, lone] = addAtom(doc, { element: 'C', x: 8, y: 8 });
    const next = deleteWithOrphans(withLone, sel({ bonds: new Set([b12]) }));
    expect(lone in next.atoms).toBe(true);
    expect(c1 in next.atoms).toBe(false);
  });

  it('equals deleteItems when nothing is orphaned', () => {
    const { doc, o } = ethanol();
    const only = sel({ atoms: new Set([o]) });
    expect(deleteWithOrphans(doc, only)).toEqual(deleteItems(doc, only));
  });

  it('deletes objects like deleteItems does', () => {
    const { doc } = ethanol();
    const [withPlus, plus] = addObject(doc, { type: 'plus', at: { x: 5, y: 5 } });
    const next = deleteWithOrphans(withPlus, sel({ objects: new Set([plus]) }));
    expect(Object.keys(next.objects)).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  DocError,
  createHistory,
  current,
  transact,
  undo,
  type AtomId,
  type Doc,
} from '../doc-model/index';
import { AROMATICS, NOW, build, ringBonds } from './__fixtures__/build';
import { aromatize, kekulize } from './aromatic';
import { ChemError } from './errors';
import { perceive } from './perceive';

const hills = (doc: Doc) => perceive(doc).fragments.map((f) => f.formula.hill);
const orders = (doc: Doc) => Object.values(doc.bonds).map((b) => b.order);

describe('kekulize / aromatize', () => {
  it.each(Object.entries(AROMATICS))('%s: kekulize(aromatize(x)) keeps the formula', (_, sys) => {
    const { doc } = build(sys.atoms, sys.bonds);
    const kek = kekulize(doc);
    expect(orders(kek)).not.toContain(1.5);
    expect(hills(kek)).toEqual([sys.formula]);
    expect(perceive(kek).warnings).toEqual([]);
    const aro = aromatize(kek);
    expect(hills(aro)).toEqual([sys.formula]);
    expect(hills(kekulize(aro))).toEqual([sys.formula]);
    // aromatize is idempotent
    expect(aromatize(aro)).toEqual(aro);
  });

  it('aromatize turns a Kekulé benzene into all-1.5, leaving substituent bonds alone', () => {
    const toluene = build(
      [...Array(6).fill('C'), 'C'],
      [
        ...ringBonds([0, 1, 2, 3, 4, 5]).map(([i, j], k) => [i, j, k % 2 ? 1 : 2] as const),
        [0, 6, 1],
      ],
    );
    const aro = aromatize(toluene.doc);
    expect(orders(aro)).toEqual([1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1]);
    expect(hills(aro)).toEqual(['C7H8']);
  });

  it('leaves non-aromatic rings and a carboxylate (1.5, not aromatic) as drawn', () => {
    const cyclohexene = build(
      Array(6).fill('C'),
      ringBonds([0, 1, 2, 3, 4, 5], 1).map(([i, j], k) => [i, j, k === 0 ? 2 : 1] as const),
    );
    expect(aromatize(cyclohexene.doc)).toBe(cyclohexene.doc);
    const acetate = build(AROMATICS.carboxylate!.atoms, AROMATICS.carboxylate!.bonds);
    expect(aromatize(acetate.doc)).toBe(acetate.doc);
  });

  it('works on a subset: only bonds with both atoms selected change', () => {
    const b = build(AROMATICS.naphthalene!.atoms, AROMATICS.naphthalene!.bonds);
    const firstRing = b.atoms.slice(0, 6);
    const kek = kekulize(b.doc, firstRing);
    const changed = b.bonds.filter((id) => kek.bonds[id]!.order !== 1.5);
    expect(changed).toHaveLength(6);
    expect(hills(kek)).toEqual(['C10H8']);
    const back = aromatize(kek, firstRing);
    expect(orders(back).every((o) => o === 1.5)).toBe(true);
  });

  it('is one undo step inside transact', () => {
    const { doc } = build(AROMATICS.pyridine!.atoms, AROMATICS.pyridine!.bonds);
    let h = createHistory(doc, { clock: () => NOW });
    h = transact(h, 'Kekulé', (d) => kekulize(d));
    expect(orders(current(h))).not.toContain(1.5);
    h = transact(h, 'Circle', (d) => aromatize(d));
    expect(orders(current(h)).every((o) => o === 1.5)).toBe(true);
    h = undo(h);
    expect(orders(current(h))).not.toContain(1.5);
    h = undo(h);
    expect(current(h)).toEqual(doc);
  });

  it('kekulize throws cannot-kekulize and changes nothing for an impossible system', () => {
    const chain = build(
      ['C', 'C', 'C'],
      [
        [0, 1, 1.5],
        [1, 2, 1.5],
      ],
    );
    const both = build(AROMATICS.benzene!.atoms, AROMATICS.benzene!.bonds, {
      doc: chain.doc,
      at: { x: 5, y: 0 },
    });
    expect(() => kekulize(both.doc)).toThrow(ChemError);
    try {
      kekulize(both.doc);
    } catch (e) {
      expect((e as ChemError).code).toBe('cannot-kekulize');
    }
    // The benzene alone still kekulizes.
    expect(hills(kekulize(both.doc, both.atoms))).toEqual(['C3H8', 'C6H6']);
  });

  it('rejects unknown atoms', () => {
    const { doc } = build(['C'], []);
    expect(() => aromatize(doc, ['a99' as AtomId])).toThrow(DocError);
    expect(() => kekulize(doc, ['a99' as AtomId])).toThrow(DocError);
  });
});

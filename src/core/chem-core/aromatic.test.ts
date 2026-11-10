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

  // Review of Checkpoint G: a partial toggle leaves 1.5 bonds next to existing double bonds.
  it('a partial aromatize next to existing double bonds keeps the formula, without warnings', () => {
    const kek = build(
      Array(6).fill('C'),
      ringBonds([0, 1, 2, 3, 4, 5]).map(([i, j], k) => [i, j, k % 2 ? 1 : 2] as const),
    );
    // bond 1–2 is single; both of its atoms already carry a ring double bond
    for (const sel of [
      [kek.atoms[1]!, kek.atoms[2]!],
      [kek.atoms[0]!, kek.atoms[1]!, kek.atoms[2]!],
      kek.atoms.slice(0, 4),
    ]) {
      const aro = aromatize(kek.doc, sel);
      expect(orders(aro)).toContain(1.5);
      expect(hills(aro)).toEqual(['C6H6']);
      expect(perceive(aro).warnings).toEqual([]);
      expect(hills(kekulize(aro))).toEqual(['C6H6']);
      expect(perceive(kekulize(aro)).warnings).toEqual([]);
    }
  });

  it('a partial toggle in pyrrole and pyridine keeps the formula', () => {
    for (const name of ['pyrrole', 'pyridine', 'indole', 'furan'] as const) {
      const sys = AROMATICS[name]!;
      const kek = kekulize(build(sys.atoms, sys.bonds).doc);
      const ids = Object.keys(kek.atoms) as AtomId[];
      for (let i = 0; i + 1 < ids.length; i++) {
        const aro = aromatize(kek, [ids[i]!, ids[i + 1]!]);
        expect(hills(aro), `${name} ${i}`).toEqual([sys.formula]);
        expect(perceive(aro).warnings, `${name} ${i}`).toEqual([]);
      }
    }
  });

  it('a 1.5 bond between atoms that cannot take part in any π system is still reported', () => {
    // 1.5 between two CH3-like carbons that are saturated by their other bonds
    const sat = build(
      ['C', 'C', 'C', 'C', 'C', 'C', 'C', 'C'],
      [
        [0, 1, 1.5],
        [0, 2],
        [0, 3],
        [0, 4],
        [1, 5],
        [1, 6],
        [1, 7],
      ],
    );
    expect(perceive(sat.doc).warnings.map((w) => w.code)).toContain('cannot-kekulize');
  });

  it('leaves a ring as drawn when its 1.5 form would read back as different chemistry', () => {
    // borirene, C=C–B in a 3-ring: aromatic for OCL and toggles normally...
    const plain = build(
      ['C', 'C', 'B'],
      [
        [0, 1, 2],
        [1, 2],
        [2, 0],
      ],
    );
    const aro = aromatize(plain.doc);
    expect(orders(aro)).toEqual([1.5, 1.5, 1.5]);
    expect(hills(aro)).toEqual(hills(plain.doc));
    // ...but drawn with a fixed CH2 (over-valence) its 1.5 form would change the formula
    const odd = build(
      [{ element: 'C', explicitH: 2 }, 'C', 'B'],
      [
        [0, 1, 2],
        [1, 2],
        [2, 0],
      ],
    );
    expect(aromatize(odd.doc)).toBe(odd.doc);
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

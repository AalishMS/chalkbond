import { describe, expect, it } from 'vitest';
import { DocError, addObject, emptyDoc, type AtomId } from '../doc-model/index';
import {
  AROMATICS,
  NOW,
  build,
  ringBonds,
  type AtomSpec,
  type BondSpec,
} from './__fixtures__/build';
import { formulaOf, perceive } from './perceive';

const mol = (atoms: AtomSpec[], bonds: BondSpec[] = []) => build(atoms, bonds);
/** A centre atom with n methyl neighbours (bond order per neighbour). */
const star = (centre: AtomSpec, orders: (1 | 2 | 3)[], ligand: AtomSpec = 'C') =>
  mol(
    [centre, ...orders.map(() => ligand)],
    orders.map((o, i) => [0, i + 1, o] as const),
  );

describe('perceive', () => {
  it('benzene drawn with 1.5 bonds: C6H6, all aromatic, one H per carbon', () => {
    const b = mol(AROMATICS.benzene!.atoms, AROMATICS.benzene!.bonds);
    const p = perceive(b.doc);
    expect(p.fragments).toHaveLength(1);
    expect(p.fragments[0]!.formula).toMatchObject({ hill: 'C6H6', text: 'C6H6', charge: 0 });
    expect(p.fragments[0]!.formula.mw).toBeCloseTo(78.11, 2);
    for (const a of b.atoms)
      expect(p.atoms[a]).toEqual({ implicitH: 1, aromatic: true, valence: 'ok' });
    for (const id of b.bonds) expect(p.bonds[id]).toEqual({ aromatic: true });
    expect(p.warnings).toEqual([]);
  });

  it('benzene drawn as Kekulé is aromatic too', () => {
    const b = mol(
      Array(6).fill('C'),
      ringBonds([0, 1, 2, 3, 4, 5], 1).map(([i, j], k) => [i, j, k % 2 ? 1 : 2] as const),
    );
    const p = perceive(b.doc);
    expect(b.atoms.every((a) => p.atoms[a]!.aromatic)).toBe(true);
    expect(p.fragments[0]!.formula.hill).toBe('C6H6');
  });

  it('ethanol: C2H6O, MW 46.07, H counts 3/2/1', () => {
    const e = mol(
      ['C', 'C', 'O'],
      [
        [0, 1],
        [1, 2],
      ],
    );
    const p = perceive(e.doc);
    const f = p.fragments[0]!.formula;
    expect(f.hill).toBe('C2H6O');
    expect(f.counts).toEqual({ C: 2, H: 6, O: 1 });
    expect(f.mw).toBeCloseTo(46.07, 2);
    expect(f.exactMass).toBeCloseTo(46.0419, 3);
    expect(e.atoms.map((a) => p.atoms[a]!.implicitH)).toEqual([3, 2, 1]);
  });

  it('acetate (charge −1): text C2H3O2⁻', () => {
    const a = mol(
      ['C', 'C', 'O', { element: 'O', charge: -1 }],
      [
        [0, 1],
        [1, 2, 2],
        [1, 3],
      ],
    );
    const f = perceive(a.doc).fragments[0]!.formula;
    expect(f).toMatchObject({ hill: 'C2H3O2', text: 'C2H3O2⁻', charge: -1 });
    expect(f.mw).toBeCloseTo(59.04, 2);
  });

  it('acetate drawn with 1.5 bonds and the charge on one O', () => {
    const sys = AROMATICS.carboxylate!;
    const p = perceive(mol(sys.atoms, sys.bonds).doc);
    expect(p.fragments[0]!.formula.text).toBe('C2H3O2⁻');
    expect(p.warnings).toEqual([]);
  });

  it('pyrrole: N gets the H, ring aromatic', () => {
    const r = mol(AROMATICS.pyrrole!.atoms, AROMATICS.pyrrole!.bonds);
    const p = perceive(r.doc);
    expect(p.fragments[0]!.formula.hill).toBe('C4H5N');
    expect(p.atoms[r.atoms[0]!]).toEqual({ implicitH: 1, aromatic: true, valence: 'ok' });
  });

  it('drawn H atoms count as atoms (OCL reorders them internally)', () => {
    const m = mol(
      ['H', 'C', 'O', 'H'],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    );
    const p = perceive(m.doc);
    expect(p.fragments[0]!.formula.hill).toBe('CH4O');
    expect(m.atoms.map((a) => p.atoms[a]!.implicitH)).toEqual([0, 2, 0, 0]);
    expect(p.warnings).toEqual([]);
  });

  // Review of Checkpoint G: OCL only moves an H with one bond to a non-H atom; an H with two
  // bonds stays put, which used to break the adapter's index maps and throw.
  it.each([
    [
      'H–C–H–O',
      ['H', 'C', 'H', 'O'],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    ],
    ['H–H', ['H', 'H'], [[0, 1]]],
    [
      'C–H–C with a lone H',
      ['C', 'H', 'C', 'H'],
      [
        [0, 1],
        [1, 2],
      ],
    ],
  ] as [string, AtomSpec[], BondSpec[]][])(
    'drawn H in unusual bonding (%s) gives over-valence warnings, never throws',
    (_, atoms, bonds) => {
      const m = mol(atoms, bonds);
      const p = perceive(m.doc);
      expect(p.fragments.length).toBeGreaterThan(0);
      for (const id of m.atoms) expect(p.atoms[id]).toBeDefined();
    },
  );

  it('H bonded to two atoms is over-valence', () => {
    const m = mol(
      ['H', 'C', 'H', 'O'],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    );
    const p = perceive(m.doc);
    expect(p.atoms[m.atoms[2]!]!.valence).toBe('over');
    expect(p.warnings.map((w) => w.code)).toContain('over-valence');
  });

  // Review of Checkpoint G: the formula must use the same H count as AtomInfo.
  it.each([
    ['C', 3, 'CH3', 15.035],
    ['C', 0, 'C', 12.011],
    ['N', 4, 'H4N', 18.039],
    ['O', 1, 'HO', 17.007],
  ] as const)('explicitH is honoured by formula and MW: %s with %i H', (el, h, hill, mw) => {
    const m = mol([{ element: el, explicitH: h }]);
    const p = perceive(m.doc);
    expect(p.atoms[m.atoms[0]!]!.implicitH).toBe(h);
    const f = p.fragments[0]!.formula;
    expect(f.hill).toBe(hill);
    expect(f.mw).toBeCloseTo(mw, 2);
  });

  it('a fixed H count OCL cannot hold (bare N⁺) still drives formula and both masses', () => {
    const m = mol([{ element: 'N', charge: 1, explicitH: 0 }]);
    const f = perceive(m.doc).fragments[0]!.formula;
    expect(f.counts).toEqual({ N: 1 });
    expect(f.mw).toBeCloseTo(14.007, 3);
    expect(f.exactMass).toBeCloseTo(14.003074, 5);
  });

  it('pseudo-atom: symbol counted, no H, mw null', () => {
    const r = mol(['C', 'R'], [[0, 1]]);
    const p = perceive(r.doc);
    expect(p.fragments[0]!.formula).toMatchObject({ hill: 'CH3R', mw: null, exactMass: null });
    expect(p.atoms[r.atoms[1]!]!.implicitH).toBe(0);
    expect(p.warnings).toEqual([]);
  });

  describe('valence', () => {
    it.each([
      ['pentavalent C', star('C', [1, 1, 1, 1, 1])],
      ['neutral 4-bonded N', star('N', [1, 1, 1, 1])],
      ['divalent Cl', star('Cl', [1, 1])],
      ['C with explicit H over 4', star({ element: 'C', explicitH: 2 }, [1, 1, 1])],
      ['O with a triple bond', star('O', [3])],
      ['Na with three bonds (OCL decides)', star('Na', [1, 1, 1])],
      ['S with three bonds', star('S', [1, 1, 1])],
      ['SH with two bonds (explicit H)', star({ element: 'S', explicitH: 1 }, [1, 1])],
    ])('%s → over-valence warning on that atom', (_, m) => {
      const p = perceive(m.doc);
      const centre = m.doc.atoms[m.atoms[0]!]!;
      expect(p.atoms[m.atoms[0]!]!.valence).toBe('over');
      // implicitH reports explicitH when set; computed H never pushes an atom further over.
      expect(p.atoms[m.atoms[0]!]!.implicitH).toBe(centre.explicitH ?? 0);
      expect(p.warnings).toEqual([
        expect.objectContaining({ code: 'over-valence', atoms: [m.atoms[0]], bonds: [] }),
      ]);
      for (const a of m.atoms.slice(1)) expect(p.atoms[a]!.valence).toBe('ok');
    });

    it.each([
      ['NH4⁺', mol([{ element: 'N', charge: 1 }]), 'H4N', '⁺'],
      ['SF6', star('S', [1, 1, 1, 1, 1, 1], 'F'), 'F6S', ''],
      ['H3PO4', star('P', [2, 1, 1, 1], 'O'), 'H3O4P', ''],
      [
        'DMSO',
        mol(
          ['S', 'C', 'C', 'O'],
          [
            [0, 1],
            [0, 2],
            [0, 3, 2],
          ],
        ),
        'C2H6OS',
        '',
      ],
      [
        'nitromethane with charges',
        mol(
          ['C', { element: 'N', charge: 1 }, 'O', { element: 'O', charge: -1 }],
          [
            [0, 1],
            [1, 2, 2],
            [1, 3],
          ],
        ),
        'CH3NO2',
        '',
      ],
      ['methyl radical', mol([{ element: 'C', radical: 1 }]), 'CH3', ''],
      ['carbene (triplet)', mol([{ element: 'C', radical: 2 }]), 'CH2', ''],
      ['FeCl3 (outside the table)', star('Fe', [1, 1, 1], 'Cl'), 'Cl3Fe', ''],
      [
        'HClO4',
        mol(
          ['Cl', 'O', 'O', 'O', 'O'],
          [
            [0, 1, 2],
            [0, 2, 2],
            [0, 3, 2],
            [0, 4],
          ],
        ),
        'ClHO4', // Hill without carbon is alphabetical (PubChem writes it so too)
        '',
      ],
      ['ClF3', star('Cl', [1, 1, 1], 'F'), 'ClF3', ''],
      [
        'PH with four bond-valences (explicit H)',
        mol(
          [{ element: 'P', explicitH: 1 }, 'O', 'C', 'C'],
          [
            [0, 1, 2],
            [0, 2],
            [0, 3],
          ],
        ),
        'C2H7OP',
        '',
      ],
    ])('%s is ok', (_, m, hill, charge) => {
      const p = perceive(m.doc);
      expect(p.warnings).toEqual([]);
      expect(Object.values(p.atoms).every((a) => a.valence === 'ok')).toBe(true);
      expect(p.fragments[0]!.formula.text).toBe(hill + charge);
    });

    it('explicit H is reported as is and fixes the formula', () => {
      const m = mol(['C', { element: 'O', explicitH: 0 }], [[0, 1]]);
      const p = perceive(m.doc);
      expect(p.atoms[m.atoms[1]!]!.implicitH).toBe(0);
      expect(p.fragments[0]!.formula.hill).toBe('CH3O');
    });
  });

  describe('labels', () => {
    it('expands abbreviations for the formula; the label atom shows no H', () => {
      const t = mol(['C', { element: 'C', label: 'Ph' }], [[0, 1]]);
      const p = perceive(t.doc);
      expect(p.fragments[0]!.formula.hill).toBe('C7H8');
      expect(p.fragments[0]!.formula.mw).toBeCloseTo(92.14, 2);
      expect(p.atoms[t.atoms[1]!]).toEqual({ implicitH: 0, aromatic: false, valence: 'ok' });
      expect(p.warnings).toEqual([]);
    });

    it.each([
      ['OMe', 'C2H6O'],
      ['CO2H', 'C2H4O2'],
      ['NO2', 'CH3NO2'],
      ['tBu', 'C5H12'],
      ['CN', 'C2H3N'],
    ])('CH3–%s → %s', (label, hill) => {
      const m = mol(['C', { element: 'C', label }], [[0, 1]]);
      expect(perceive(m.doc).fragments[0]!.formula.hill).toBe(hill);
    });

    it('warns when an abbreviation has ≠ 1 bond (0 bonds: capped with H)', () => {
      const two = mol(
        ['C', { label: 'Ph' }, 'C'],
        [
          [0, 1],
          [1, 2],
        ],
      );
      expect(perceive(two.doc).warnings).toEqual([
        expect.objectContaining({ code: 'abbreviation-bonds', atoms: [two.atoms[1]] }),
      ]);
      const none = mol([{ label: 'Ph' }]);
      const p = perceive(none.doc);
      expect(p.warnings.map((w) => w.code)).toEqual(['abbreviation-bonds']);
      expect(p.fragments[0]!.formula.hill).toBe('C6H6');
    });

    // The v1 groups are monovalent: a double or triple bond is a bond the group can't take
    // (seed -543139787: C–C=OMe gave a trivalent O whose hidden methyl decided its "E/Z").
    it.each([
      [2, 'double'],
      [3, 'triple'],
    ] as const)('warns when an abbreviation has one %s bond (%s)', (order, kind) => {
      const m = mol(['C', { label: 'OMe' }], [[0, 1, order]]);
      expect(perceive(m.doc).warnings).toEqual([
        {
          code: 'abbreviation-bonds',
          atoms: [m.atoms[1]],
          bonds: [],
          message: `"OMe" needs exactly one single bond (it has a ${kind} bond).`,
        },
      ]);
    });

    it('takes one single bond to an abbreviation without a warning', () => {
      const m = mol(['C', { label: 'OMe' }], [[0, 1, 1]]);
      expect(perceive(m.doc).warnings).toEqual([]);
    });

    it('treats unknown labels as pseudo-atoms with a warning', () => {
      const m = mol(['C', { label: 'Boc' }], [[0, 1]]);
      const p = perceive(m.doc);
      expect(p.warnings).toEqual([
        expect.objectContaining({
          code: 'unknown-label',
          atoms: [m.atoms[1]],
          message: 'Unknown label "Boc".',
        }),
      ]);
      expect(p.fragments[0]!.formula).toMatchObject({ hill: 'CH3Boc', mw: null });
    });

    it('ignores a label that reads as element + H (the atom fields rule)', () => {
      const m = mol(['C', { element: 'O', label: 'OH' }], [[0, 1]]);
      const p = perceive(m.doc);
      expect(p.warnings).toEqual([]);
      expect(p.fragments[0]!.formula.hill).toBe('CH4O');
      expect(p.atoms[m.atoms[1]!]!.implicitH).toBe(1);
    });
  });

  it('isotopes: CDCl3 counts D; ¹³C changes the mass', () => {
    const cdcl3 = mol(
      ['C', { element: 'H', isotope: 2 }, 'Cl', 'Cl', 'Cl'],
      [
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
      ],
    );
    const f = perceive(cdcl3.doc).fragments[0]!.formula;
    expect(f.counts).toEqual({ C: 1, D: 1, Cl: 3 });
    expect(f.mw).toBeCloseTo(120.38, 2);
    const c13 = perceive(mol([{ element: 'C', isotope: 13 }, 'O'], [[0, 1]]).doc).fragments[0]!
      .formula;
    expect(c13.hill).toBe('CH4O');
    expect(c13.mw).toBeCloseTo(33.03, 2);
  });

  it('reports cannot-kekulize with its bonds and atoms', () => {
    const m = mol(
      ['C', 'C', 'C'],
      [
        [0, 1, 1.5],
        [1, 2, 1.5],
      ],
    );
    const p = perceive(m.doc);
    expect(p.warnings).toEqual([
      expect.objectContaining({ code: 'cannot-kekulize', atoms: m.atoms, bonds: m.bonds }),
    ]);
  });

  it('one entry per fragment in fragments() order; isolated atoms are fragments', () => {
    let doc = mol(
      ['C', 'C', 'O'],
      [
        [0, 1],
        [1, 2],
      ],
    ).doc;
    doc = build(['O'], [], { doc, at: { x: 5, y: 0 } }).doc;
    [doc] = addObject(doc, { type: 'plus', at: { x: 3, y: 0 } });
    const p = perceive(doc);
    expect(p.fragments.map((f) => f.formula.hill)).toEqual(['C2H6O', 'H2O']);
    expect(p.fragments.map((f) => f.atoms)).toEqual([['a1', 'a2', 'a3'], ['a6']]);
  });

  it('perceives an empty doc', () => {
    expect(perceive(emptyDoc(NOW))).toEqual({ atoms: {}, bonds: {}, fragments: [], warnings: [] });
  });
});

describe('formulaOf', () => {
  it('sums the whole fragments touched by the atoms', () => {
    const ethanol = mol(
      ['C', 'C', 'O'],
      [
        [0, 1],
        [1, 2],
      ],
    );
    const both = build(['O'], [], { doc: ethanol.doc, at: { x: 5, y: 0 } });
    const water = both.atoms[0]!;
    expect(formulaOf(both.doc, [ethanol.atoms[2]!]).hill).toBe('C2H6O');
    const sum = formulaOf(both.doc, [ethanol.atoms[0]!, ethanol.atoms[1]!, water]);
    expect(sum.hill).toBe('C2H8O2');
    expect(sum.mw).toBeCloseTo(46.069 + 18.015, 2);
  });

  it('is empty for no atoms and null-mass with a pseudo-atom', () => {
    const r = mol(['C', 'R'], [[0, 1]]);
    expect(formulaOf(r.doc, [])).toMatchObject({ hill: '', text: '', mw: 0, exactMass: 0 });
    expect(formulaOf(r.doc, r.atoms).mw).toBeNull();
  });

  it('throws DocError for unknown atoms', () => {
    expect(() => formulaOf(emptyDoc(NOW), ['a9' as AtomId])).toThrow(DocError);
  });
});

// One test per row of SPEC-chem-core.md "Verified library facts" (openchemlib 9.25.2), plus the
// facts found while building the adapter. If an OpenChemLib upgrade changes one of these, the
// design that rests on it must be revisited — see the spec before "fixing" a test here.
import { Molecule } from 'openchemlib';
import { describe, expect, it } from 'vitest';

declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> };

/** Timings are meaningless under coverage instrumentation (vitest.config.mts sets this). */
const budget = it.skipIf(process.env['CHALKBOND_COVERAGE'] === '1');

function bondLengths(m: Molecule): number[] {
  const out: number[] = [];
  for (let b = 0; b < m.getAllBonds(); b++) {
    const a1 = m.getBondAtom(0, b);
    const a2 = m.getBondAtom(1, b);
    out.push(Math.hypot(m.getAtomX(a1) - m.getAtomX(a2), m.getAtomY(a1) - m.getAtomY(a2)));
  }
  return out;
}

describe('openchemlib library facts', () => {
  it('loads and works without a DOM', () => {
    expect('document' in globalThis).toBe(false);
    expect('window' in globalThis).toBe(false);
    expect(Molecule.fromSmiles('CCO').getAllAtoms()).toBe(3);
  });

  it('invents SMILES coordinates with average bond length 1.0 (doc-model BLU)', () => {
    const m = Molecule.fromSmiles('CC(=O)Oc1ccccc1C(O)=O');
    expect(m.getAverageBondLength(false)).toBeCloseTo(1.0, 6);
    for (const len of bondLengths(m)) expect(len).toBeCloseTo(1.0, 1);
  });

  it('has y pointing down: the atom with larger y depicts lower', () => {
    const m = new Molecule(2, 1);
    const o = m.addAtom(8);
    const n = m.addAtom(7);
    m.setAtomX(o, 0);
    m.setAtomY(o, 0);
    m.setAtomX(n, 0);
    m.setAtomY(n, 1);
    m.addBond(o, n);
    const svg = m.toSVG(200, 200);
    const textY = (label: string): number => {
      const match = new RegExp(`<text[^>]*\\sy="([\\d.]+)"[^>]*>${label}</text>`).exec(svg);
      return Number(match?.[1]);
    };
    expect(textY('N')).toBeGreaterThan(textY('O'));
  });

  it('kekulizes aromatic SMILES input and flags the ring bonds aromatic', () => {
    const m = Molecule.fromSmiles('c1ccccc1');
    m.ensureHelperArrays(Molecule.cHelperRings);
    const orders = [];
    for (let b = 0; b < m.getAllBonds(); b++) {
      orders.push(m.getBondOrder(b));
      expect(m.isAromaticBond(b)).toBe(true);
      expect(m.getBondType(b)).not.toBe(Molecule.cBondTypeDelocalized);
    }
    expect(orders.sort()).toEqual([1, 1, 1, 2, 2, 2]);
  });

  it('does not resolve a ring of delocalized bonds (benzene comes out C6H12)', () => {
    const m = new Molecule(6, 6);
    for (let i = 0; i < 6; i++) {
      m.addAtom(6);
      m.setAtomX(i, Math.cos((i * Math.PI) / 3));
      m.setAtomY(i, Math.sin((i * Math.PI) / 3));
    }
    for (let i = 0; i < 6; i++)
      m.setBondType(m.addBond(i, (i + 1) % 6), Molecule.cBondTypeDelocalized);
    expect(m.getMolecularFormula().formula).toBe('C6H12');
  });

  it('reads SMILES `*` as an ordinary carbon (and flags the molecule a fragment: no H)', () => {
    const m = Molecule.fromSmiles('*c1ccccc1');
    expect(m.getMolecularFormula().formula).toBe('C7');
    expect(m.isFragment()).toBe(true);
    expect(m.getAtomicNo(0)).toBe(6);
    expect(m.getAtomCustomLabel(0)).toBeNull();
  });

  it('reports negative free valence for pentavalent carbon; H counts and formula/weights', () => {
    const m = Molecule.fromSmiles('C(C)(C)(C)(C)C');
    m.ensureHelperArrays(Molecule.cHelperNeighbours);
    expect(m.getFreeValence(0)).toBeLessThan(0);
    expect(m.getImplicitHydrogens(1)).toBe(3);
    const f = Molecule.fromSmiles('CCO').getMolecularFormula();
    expect(f.formula).toBe('C2H6O');
    expect(f.relativeWeight).toBeCloseTo(46.069, 2);
    expect(f.absoluteWeight).toBeCloseTo(46.0419, 3);
  });

  it('knows no names: fromText("ethanol") is null', () => {
    expect(Molecule.fromText('ethanol')).toBeNull();
  });

  budget('parses and computes the formula of aspirin quickly (≈0.4 ms; budget 5 ms median)', () => {
    const run = () => Molecule.fromSmiles('CC(=O)Oc1ccccc1C(O)=O').getMolecularFormula();
    for (let i = 0; i < 20; i++) run();
    const samples = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      run();
      samples.push(performance.now() - t0);
    }
    samples.sort((p, q) => p - q);
    expect(samples[25]).toBeLessThan(5);
  });
});

describe('openchemlib facts found while building the adapter', () => {
  const freeValences = (smiles: string): number[] => {
    const m = Molecule.fromSmiles(smiles);
    m.ensureHelperArrays(Molecule.cHelperNeighbours);
    return Array.from({ length: m.getAllAtoms() }, (_, i) => m.getFreeValence(i));
  };

  // SPEC-chem-core.md requires both to be over-valence, so chem-core keeps its own valence table.
  it('accepts a neutral 4-bonded N and a divalent Cl (hypervalence-tolerant)', () => {
    expect(freeValences('C[N](C)(C)C')[1]).toBe(0);
    expect(freeValences('[Cl](C)C')[0]).toBeGreaterThanOrEqual(0);
  });

  it('derives the implicit H count from the abnormal valence, monotonically', () => {
    const counts = [];
    for (let v = 1; v <= 6; v++) {
      const m = new Molecule(2, 1);
      const o = m.addAtom(8);
      m.addBond(o, m.addAtom(6));
      m.setAtomAbnormalValence(o, v);
      m.ensureHelperArrays(Molecule.cHelperNeighbours);
      counts.push(m.getImplicitHydrogens(o));
    }
    expect(counts).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('gives a pseudo-atom (atomic number 0) no mass and no hydrogens, and writes it as [?]', () => {
    const m = new Molecule(2, 1);
    const c = m.addAtom(6);
    const r = m.addAtom(0);
    m.setAtomCustomLabel(r, 'R');
    m.addBond(c, r);
    m.ensureHelperArrays(Molecule.cHelperNeighbours);
    expect(m.getImplicitHydrogens(r)).toBe(0);
    expect(m.getMolecularFormula().formula).toBe('CH3');
    expect(m.toIsomericSmiles()).toBe('[?]C');
  });

  it('writes deuterium as D in formulas and weighs isotopes', () => {
    const f = Molecule.fromSmiles('[2H]C(Cl)(Cl)Cl').getMolecularFormula();
    expect(f.formula).toBe('CCl3D');
    expect(f.relativeWeight).toBeCloseTo(120.38, 2);
  });

  it('returns an empty molecule (no error) for unreadable Molfile text and empty SMILES', () => {
    expect(Molecule.fromMolfile('garbage').getAllAtoms()).toBe(0);
    expect(Molecule.fromSmiles('').getAllAtoms()).toBe(0);
    expect(() => Molecule.fromSmiles('C1CC')).toThrow(/ring closure/);
  });

  it('wedge from SMILES is an up/down bond whose first atom is the stereo centre', () => {
    const m = Molecule.fromSmiles('C[C@@H](N)C(O)=O');
    const stereo = [];
    for (let b = 0; b < m.getAllBonds(); b++) {
      const t = m.getBondType(b);
      if (t === Molecule.cBondTypeUp || t === Molecule.cBondTypeDown) stereo.push(b);
    }
    expect(stereo).toHaveLength(1);
    expect(m.getBondAtom(0, stereo[0]!)).toBe(1);
  });

  // A double bond at a neutral trivalent O (what a double bond to an expanded OMe builds)
  // gets E/Z from the coordinates of every substituent, hidden group atoms included.
  it('assigns E/Z to a C=O double bond at a neutral trivalent O from the coordinates', () => {
    const smiles = (methylY: number): string => {
      const m = new Molecule(4, 3);
      const xy = [
        [-1, 0.5],
        [0, 0],
        [1, 0],
        [2, methylY],
      ] as const;
      for (const [i, [x, y]] of xy.entries()) {
        const a = m.addAtom(i === 2 ? 8 : 6);
        m.setAtomX(a, x);
        m.setAtomY(a, y);
      }
      m.setBondType(m.addBond(0, 1), Molecule.cBondTypeSingle);
      m.setBondType(m.addBond(1, 2), Molecule.cBondTypeDouble);
      m.setBondType(m.addBond(2, 3), Molecule.cBondTypeSingle);
      return m.toIsomericSmiles();
    };
    expect(smiles(0.5)).toBe('C/C=O\\C'); // methyl on the same side: Z
    expect(smiles(-0.5)).toBe('C/C=O/C');
  });

  it('uses older atomic weights (iodine 126.9, sulfur 32.066) than PubChem', () => {
    expect(Molecule.fromSmiles('[I]').getMolecularFormula().relativeWeight).toBe(126.9);
    expect(Molecule.fromSmiles('[S]').getMolecularFormula().relativeWeight).toBeCloseTo(32.066, 6);
  });

  it('reads [HH] as a single H atom without its hydrogen', () => {
    const m = Molecule.fromSmiles('[HH]');
    expect(m.getAllAtoms()).toBe(1);
    expect(m.getMolecularFormula().formula).toBe('H');
  });

  it('moves only H with one bond to a non-H atom last; an H with two bonds stays (by swapping)', () => {
    const m = new Molecule(4, 3);
    [1, 6, 1, 8].forEach((no, i) => m.setAtomX(m.addAtom(no), i));
    m.addBond(0, 1);
    m.addBond(1, 2);
    m.addBond(2, 3);
    m.ensureHelperArrays(Molecule.cHelperNeighbours);
    expect([0, 1, 2, 3].map((k) => m.getAtomX(k))).toEqual([3, 1, 2, 0]);
  });

  it('makes a carbon a carbene at abnormal valence 2, and a later valence keeps the radical', () => {
    const m = new Molecule(1, 1);
    const c = m.addAtom(6);
    m.setAtomAbnormalValence(c, 2);
    expect(m.getAtomRadical(c)).not.toBe(0);
    m.setAtomAbnormalValence(c, 3);
    m.ensureHelperArrays(Molecule.cHelperNeighbours);
    expect(m.getAtomRadical(c)).not.toBe(0);
    expect(m.getImplicitHydrogens(c)).toBe(1);
  });
});

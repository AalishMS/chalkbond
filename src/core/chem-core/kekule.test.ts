import { describe, expect, it } from 'vitest';
import { PERIODIC_SYMBOLS, type AtomId, type Doc } from '../doc-model/index';
import { AROMATICS, build, ringBonds, type Built } from './__fixtures__/build';
import { assignKekule, piRole, type KekuleResult } from './kekule';
import { buildMol, molFormula, readMol } from './ocl';

/** OCL formula and aromatic flags of the doc with 1.5 bonds replaced by the assignment. */
function viaOcl(doc: Doc, result: KekuleResult): { formula: string; aromatic: boolean[] } {
  const ids = Object.keys(doc.atoms) as AtomId[];
  const index = new Map(ids.map((id, i) => [id, i]));
  const mol = buildMol({
    atoms: ids.map((id) => {
      const a = doc.atoms[id]!;
      return {
        atomicNo: PERIODIC_SYMBOLS.indexOf(a.element) + 1,
        x: a.x,
        y: a.y,
        charge: a.charge,
        mass: 0,
        radical: a.radical,
        customLabel: null,
        ...(a.explicitH === undefined ? {} : { hCount: a.explicitH }),
      };
    }),
    bonds: Object.values(doc.bonds).map((b) => {
      const order = b.order === 1.5 ? result.orders.get(b.id)! : b.order;
      return {
        a1: index.get(b.a1)!,
        a2: index.get(b.a2)!,
        kind: order === 1 ? 'single' : order === 2 ? 'double' : 'triple',
      };
    }),
  });
  return { formula: molFormula(mol).formula, aromatic: readMol(mol).bonds.map((b) => b.aromatic) };
}

/** Number of double bonds the assignment gives each atom. */
function doublesPerAtom(built: Built, result: KekuleResult): number[] {
  return built.atoms.map(
    (a) =>
      [...result.orders].filter(([id, o]) => {
        const b = built.doc.bonds[id]!;
        return o === 2 && (b.a1 === a || b.a2 === a);
      }).length,
  );
}

describe('assignKekule', () => {
  it.each(Object.entries(AROMATICS))('%s: valid Kekulé structure, right formula', (name, sys) => {
    const built = build(sys.atoms, sys.bonds);
    const result = assignKekule(built.doc);
    expect(result.failures).toEqual([]);
    const aromaticBonds = built.bonds.filter((id) => built.doc.bonds[id]!.order === 1.5);
    expect([...result.orders.keys()].sort()).toEqual([...aromaticBonds].sort());
    // No atom gets two double bonds; every carbon gets exactly one.
    const doubles = doublesPerAtom(built, result);
    built.atoms.forEach((a, i) => {
      const atom = built.doc.atoms[a]!;
      const touches1p5 = aromaticBonds.some((b) =>
        [built.doc.bonds[b]!.a1, built.doc.bonds[b]!.a2].includes(a),
      );
      expect(doubles[i]).toBeLessThanOrEqual(1);
      if (atom.element === 'C' && touches1p5 && atom.charge === 0)
        expect(doubles[i], `${name} C${i}`).toBe(1);
    });
    const ocl = viaOcl(built.doc, result);
    expect(ocl.formula).toBe(sys.formula);
    // OCL sees azulene as a peripheral 10π system: its fusion bond (6–0, index 6) is not aromatic.
    const expected = built.bonds.map(
      (_, i) => name !== 'carboxylate' && !(name === 'azulene' && i === 6),
    );
    expect(ocl.aromatic, `${name} aromatic bonds`).toEqual(expected);
  });

  it('leaves the pyrrole-type N unmatched (it takes the H)', () => {
    for (const name of ['pyrrole', 'indole']) {
      const sys = AROMATICS[name]!;
      const built = build(sys.atoms, sys.bonds);
      const n = sys.atoms.indexOf('N');
      expect(doublesPerAtom(built, assignKekule(built.doc))[n]).toBe(0);
    }
  });

  it('matches every N of pyrazine and the N=N of pyridazine (no dihydro forms)', () => {
    const pyrazine = build(['N', 'C', 'C', 'N', 'C', 'C'], ringBonds([0, 1, 2, 3, 4, 5]));
    expect(doublesPerAtom(pyrazine, assignKekule(pyrazine.doc))).toEqual([1, 1, 1, 1, 1, 1]);
    const pyridazine = build(['N', 'N', 'C', 'C', 'C', 'C'], ringBonds([0, 1, 2, 3, 4, 5]));
    const result = assignKekule(pyridazine.doc);
    expect(doublesPerAtom(pyridazine, result)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(viaOcl(pyridazine.doc, result).formula).toBe('C4H4N2');
  });

  it('gives the carboxylate C=O to the neutral oxygen', () => {
    const sys = AROMATICS.carboxylate!;
    const built = build(sys.atoms, sys.bonds);
    const result = assignKekule(built.doc);
    expect(result.orders.get(built.bonds[1]!)).toBe(2);
    expect(result.orders.get(built.bonds[2]!)).toBe(1);
  });

  it('handles N-substituted pyrrole and an explicit-H pyrrole N', () => {
    const nMethyl = build(
      ['N', 'C', 'C', 'C', 'C', 'C'],
      [...ringBonds([0, 1, 2, 3, 4]), [0, 5, 1]],
    );
    const r1 = assignKekule(nMethyl.doc);
    expect(r1.failures).toEqual([]);
    expect(viaOcl(nMethyl.doc, r1).formula).toBe('C5H7N');
    const nh = build(
      [{ element: 'N', explicitH: 1 }, 'C', 'C', 'C', 'C'],
      ringBonds([0, 1, 2, 3, 4]),
    );
    expect(viaOcl(nh.doc, assignKekule(nh.doc)).formula).toBe('C4H5N');
  });

  it('handles charged rings: pyridinium, tropylium, cyclopentadienide', () => {
    const pyridinium = build(
      [{ element: 'N', charge: 1 }, 'C', 'C', 'C', 'C', 'C'],
      ringBonds([0, 1, 2, 3, 4, 5]),
    );
    const r1 = assignKekule(pyridinium.doc);
    expect(r1.failures).toEqual([]);
    expect(viaOcl(pyridinium.doc, r1).formula).toBe('C5H6N');
    const tropylium = build(
      [{ element: 'C', charge: 1 }, 'C', 'C', 'C', 'C', 'C', 'C'],
      ringBonds([0, 1, 2, 3, 4, 5, 6]),
    );
    const r2 = assignKekule(tropylium.doc);
    expect(r2.failures).toEqual([]);
    expect(doublesPerAtom(tropylium, r2)[0]).toBe(0);
    const cp = build(
      [{ element: 'C', charge: -1 }, 'C', 'C', 'C', 'C'],
      ringBonds([0, 1, 2, 3, 4]),
    );
    const r3 = assignKekule(cp.doc);
    expect(r3.failures).toEqual([]);
    expect(doublesPerAtom(cp, r3)[0]).toBe(0);
  });

  it('reports cannot-kekulize systems with their bonds, without affecting other systems', () => {
    // propane drawn C–C–C with two 1.5 bonds (odd chain), next to a benzene
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
    const result = assignKekule(both.doc);
    expect(result.failures).toEqual([chain.bonds]);
    expect(chain.bonds.map((b) => result.orders.get(b))).toEqual([1, 1]);
    expect(both.bonds.filter((b) => result.orders.get(b) === 2)).toHaveLength(3);
  });

  it('fails when a ring atom cannot take a π bond (CH2 in a 1.5 ring, furan-style O in benzene)', () => {
    const ch2 = build(
      [{ element: 'C', explicitH: 2 }, 'C', 'C', 'C', 'C', 'C'],
      ringBonds([0, 1, 2, 3, 4, 5]),
    );
    expect(assignKekule(ch2.doc).failures).toHaveLength(1);
    const pseudo = build(['R', 'C', 'C', 'C', 'C', 'C'], ringBonds([0, 1, 2, 3, 4, 5]));
    expect(assignKekule(pseudo.doc).failures).toHaveLength(1);
  });

  it('fails a system that would get no double bond at all', () => {
    // every ring carbon already saturated by explicit H: a "1.5" ring that is just cyclohexane
    const sat = build(Array(6).fill({ element: 'C', explicitH: 2 }), ringBonds([0, 1, 2, 3, 4, 5]));
    expect(assignKekule(sat.doc).failures).toEqual([sat.bonds]);
    // a lone 1.5 bond between two pseudo-atoms
    const rr = build(['R', 'R'], [[0, 1, 1.5]]);
    expect(assignKekule(rr.doc).failures).toEqual([rr.bonds]);
  });

  it('is deterministic and restricted to the scope', () => {
    const sys = AROMATICS.naphthalene!;
    const a = build(sys.atoms, sys.bonds);
    const b = build(sys.atoms, sys.bonds);
    expect([...assignKekule(a.doc).orders]).toEqual([...assignKekule(b.doc).orders]);
    const two = build(sys.atoms, sys.bonds, { doc: a.doc, at: { x: 9, y: 0 } });
    const scoped = assignKekule(two.doc, two.atoms);
    expect([...scoped.orders.keys()].sort()).toEqual([...two.bonds].sort());
  });

  it('counts bonds that leave the scope in the σ valence', () => {
    // benzene with an exocyclic C=C: the ring carbon is already at valence 4 with it
    const sys = build([...Array(6).fill('C'), 'C'], [...ringBonds([0, 1, 2, 3, 4, 5]), [0, 6, 2]]);
    const inner = sys.atoms.slice(0, 6);
    expect(assignKekule(sys.doc, inner).failures).toHaveLength(1);
  });

  it('solves a large fused system quickly', () => {
    // a ladder of 80 fused four-membered rings (162 atoms, all bonds 1.5)
    const atoms = Array(162).fill('C');
    const bonds: [number, number, 1.5][] = [];
    const top = (k: number) => 2 * k;
    const bottom = (k: number) => 2 * k + 1;
    for (let k = 0; k <= 80; k++) {
      bonds.push([top(k), bottom(k), 1.5]);
      if (k < 80) bonds.push([top(k), top(k + 1), 1.5], [bottom(k), bottom(k + 1), 1.5]);
    }
    const built = build(atoms, bonds);
    const result = assignKekule(built.doc);
    expect(result.failures).toEqual([]);
    expect([...result.orders.values()].filter((o) => o === 2)).toHaveLength(81);
  });
});

describe('piRole', () => {
  const role = (spec: Parameters<typeof build>[0][number], sigma: number) =>
    piRole(build([spec], []).doc.atoms['a1' as AtomId]!, sigma);

  it.each([
    ['C', 2, true, true],
    ['C', 3, true, true],
    ['C', 4, false, false],
    ['N', 2, true, false],
    ['N', 3, false, false],
    ['O', 2, false, false],
    ['S', 2, false, false],
    ['O', 1, true, false],
    [{ element: 'N', charge: 1 }, 3, true, true],
    [{ element: 'O', charge: 1 }, 2, true, false],
    [{ element: 'O', charge: -1 }, 1, false, false],
    [{ element: 'N', explicitH: 1 }, 2, false, false],
    [{ element: 'C', label: 'Ph' }, 1, false, false],
    ['R', 1, false, false],
    ['Fe', 2, false, false],
  ] as const)('%o with σ valence %d → canPi %s, required %s', (spec, sigma, canPi, required) => {
    expect(role(spec, sigma)).toEqual({ canPi, required });
  });
});

import { describe, expect, it } from 'vitest';
import {
  atomCount,
  buildMol,
  freeValence,
  molfileToMol,
  molFormula,
  molIdCode,
  molToMolfile,
  molToSmiles,
  readMol,
  smilesToMol,
  withInventedCoordinates,
  type MolAtom,
  type MolSpec,
} from './ocl';

const atom = (atomicNo: number, x: number, y: number, extra: Partial<MolAtom> = {}) => ({
  atomicNo,
  x,
  y,
  charge: 0,
  mass: 0,
  radical: 0 as const,
  customLabel: null,
  ...extra,
});

const ethanol: MolSpec = {
  atoms: [atom(6, 0, 0), atom(6, 0.866, -0.5), atom(8, 1.732, 0)],
  bonds: [
    { a1: 0, a2: 1, kind: 'single' },
    { a1: 1, a2: 2, kind: 'single' },
  ],
};

describe('ocl adapter', () => {
  it('builds and reads back a molecule with the same indexes', () => {
    const data = readMol(buildMol(ethanol));
    expect(data.atoms.map((a) => [a.atomicNo, a.x, a.y, a.implicitH])).toEqual([
      [6, 0, 0, 3],
      [6, 0.866, -0.5, 2],
      [8, 1.732, 0, 1],
    ]);
    expect(data.bonds.map((b) => [b.a1, b.a2, b.kind])).toEqual([
      [0, 1, 'single'],
      [1, 2, 'single'],
    ]);
    expect(molFormula(buildMol(ethanol)).formula).toBe('C2H6O');
  });

  it('keeps caller indexes although OCL moves plain hydrogen atoms last', () => {
    // H–C–O drawn with an explicit H first: OCL's helper perception reorders to O, C, H.
    const spec: MolSpec = {
      atoms: [atom(1, 0, 0), atom(6, 1, 0), atom(8, 2, 0), atom(1, 3, 0, { mass: 2 })],
      bonds: [
        { a1: 0, a2: 1, kind: 'single' },
        { a1: 1, a2: 2, kind: 'single' },
        { a1: 2, a2: 3, kind: 'single' },
      ],
    };
    const mol = buildMol(spec);
    const data = readMol(mol);
    expect(data.atoms.map((a) => [a.atomicNo, a.x, a.mass])).toEqual([
      [1, 0, 0],
      [6, 1, 0],
      [8, 2, 0],
      [1, 3, 2],
    ]);
    expect(data.bonds.map((b) => [b.a1, b.a2])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    expect(data.atoms.map((a) => a.implicitH)).toEqual([0, 2, 0, 0]);
    expect(freeValence(mol, 1)).toBe(2); // max 4 − 2 explicit bonds (implicit H not counted)
    expect(readMol(withInventedCoordinates(mol)).atoms.map((a) => a.atomicNo)).toEqual([
      1, 6, 8, 1,
    ]);
  });

  it('carries charge, isotope, radicals and pseudo-atom labels both ways', () => {
    const mol = buildMol({
      atoms: [
        atom(6, 0, 0, { mass: 13, radical: 1 }),
        atom(8, 1, 0, { charge: -1 }),
        atom(0, 2, 0, { customLabel: 'R' }),
        atom(6, 3, 0, { radical: 2 }),
      ],
      bonds: [
        { a1: 0, a2: 1, kind: 'single' },
        { a1: 1, a2: 2, kind: 'single' },
        { a1: 2, a2: 3, kind: 'single' },
      ],
    });
    const data = readMol(mol);
    expect(data.atoms.map((a) => [a.mass, a.charge, a.radical, a.customLabel])).toEqual([
      [13, 0, 1, null],
      [0, -1, 0, null],
      [0, 0, 0, 'R'],
      [0, 0, 2, null],
    ]);
    expect(data.atoms.map((a) => a.implicitH)).toEqual([2, 0, 0, 1]);
  });

  it('fixes a hydrogen count through the abnormal valence', () => {
    const fixed = (hCount: number, extra: Partial<MolAtom> = {}) =>
      readMol(
        buildMol({
          atoms: [atom(6, 0, 0), { ...atom(8, 1, 0, extra), hCount }],
          bonds: [{ a1: 0, a2: 1, kind: 'single' }],
        }),
      ).atoms[1]?.implicitH;
    expect(fixed(1)).toBe(1); // default already: no abnormal valence needed
    expect(fixed(0)).toBe(0);
    expect(fixed(2)).toBe(2);
    expect(fixed(1, { charge: 1 })).toBe(1);
    expect(fixed(0, { charge: -1 })).toBe(0);
  });

  it('keeps the closest H count when the target is unreachable', () => {
    // OCL gives an isolated N⁺ at least one H for any abnormal valence.
    const data = readMol(
      buildMol({ atoms: [{ ...atom(7, 0, 0, { charge: 1 }), hCount: 0 }], bonds: [] }),
    );
    expect(data.atoms[0]?.implicitH).toBe(1);
  });

  it('maps bond kinds both ways, incl. stereo and delocalized', () => {
    const kinds = ['single', 'double', 'triple', 'up', 'down', 'delocalized'] as const;
    for (const kind of kinds) {
      const mol = buildMol({
        atoms: [atom(6, 0, 0), atom(6, 1, 0)],
        bonds: [{ a1: 0, a2: 1, kind }],
      });
      expect(readMol(mol).bonds[0]?.kind).toBe(kind);
    }
  });

  it('reports aromaticity and free valence', () => {
    const benzene = readMol(smilesToMol('c1ccccc1', { coordinates: true }));
    expect(benzene.atoms.every((a) => a.aromatic && a.implicitH === 1)).toBe(true);
    expect(benzene.bonds.every((b) => b.aromatic)).toBe(true);
    const neo = smilesToMol('C(C)(C)(C)(C)C', { coordinates: false });
    expect(freeValence(neo, 0)).toBeLessThan(0);
    expect(freeValence(neo, 1)).toBe(3);
  });

  it('parses SMILES with or without a layout', () => {
    const bare = readMol(smilesToMol('CCO', { coordinates: false }));
    expect(bare.atoms.every((a) => a.x === 0 && a.y === 0)).toBe(true);
    const laid = readMol(smilesToMol('CCO', { coordinates: true }));
    expect(laid.atoms.some((a) => a.x !== 0 || a.y !== 0)).toBe(true);
    expect(() => smilesToMol('C1CC', { coordinates: false })).toThrow();
    expect(atomCount(smilesToMol('', { coordinates: false }))).toBe(0);
  });

  it('invents a fresh layout on a copy, keeping the stereo configuration', () => {
    const mol = smilesToMol('C[C@@H](N)C(O)=O', { coordinates: true });
    const scrambled = buildMol({
      atoms: readMol(mol).atoms.map((a, i) => ({ ...a, x: a.x + (i % 2) * 0.3, y: a.y })),
      bonds: readMol(mol).bonds,
    });
    const fresh = withInventedCoordinates(scrambled);
    expect(molIdCode(fresh)).toBe(molIdCode(mol));
    expect(readMol(scrambled).atoms[1]?.x).not.toBe(readMol(fresh).atoms[1]?.x);
  });

  it('writes SMILES, Molfile V2000/V3000 and IDCodes that round-trip', () => {
    const mol = smilesToMol('C[C@@H](N)C(O)=O', { coordinates: true });
    const id = molIdCode(mol);
    expect(molIdCode(smilesToMol(molToSmiles(mol), { coordinates: true }))).toBe(id);
    const v2 = molToMolfile(mol, 'V2000');
    const v3 = molToMolfile(mol, 'V3000');
    expect(v2).toContain('V2000');
    expect(v3).toContain('V3000');
    expect(molIdCode(molfileToMol(v2))).toBe(id);
    expect(molIdCode(molfileToMol(v3))).toBe(id);
    expect(atomCount(molfileToMol('not a molfile'))).toBe(0);
    const mirror = smilesToMol('C[C@H](N)C(O)=O', { coordinates: true });
    expect(molIdCode(mirror)).not.toBe(id);
    expect(molIdCode(mirror, { stereo: false })).toBe(molIdCode(mol, { stereo: false }));
  });
});

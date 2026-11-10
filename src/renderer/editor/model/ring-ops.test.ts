import { formulaOf } from '@core/chem-core';
import {
  addAtom,
  addBond,
  emptyDoc,
  type AtomId,
  type BondId,
  type Doc,
  type Point,
} from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { formulaText } from './formula';
import { distance } from './geometry';
import { placeRing, type RingTarget } from './ring-ops';
import { circumradius, type RingId } from './templates';

const NOW = '2026-01-01T00:00:00.000Z';
const empty = (): Doc => emptyDoc(NOW);
const C30 = Math.cos(Math.PI / 6);

function ring(doc: Doc, id: RingId, target: RingTarget): Doc {
  const edit = placeRing(doc, id, target);
  if (edit === null) throw new Error('no ring');
  return edit.doc;
}
const atomsOf = (d: Doc): AtomId[] => Object.keys(d.atoms) as AtomId[];
const bondsOf = (d: Doc): BondId[] => Object.keys(d.bonds) as BondId[];
const at = (d: Doc, id: AtomId): Point => d.atoms[id] as Point;
const formula = (d: Doc): string => formulaText(formulaOf(d, atomsOf(d)));
const orders = (d: Doc, ids: BondId[]): number[] => ids.map((b) => d.bonds[b]?.order ?? 0);
const orderOf = (d: Doc, id: BondId): number => d.bonds[id]?.order ?? 0;
const centroid = (d: Doc, ids: AtomId[]): Point => ({
  x: ids.reduce((s, id) => s + at(d, id).x, 0) / ids.length,
  y: ids.reduce((s, id) => s + at(d, id).y, 0) / ids.length,
});

describe('P3 ring onto empty canvas', () => {
  it('benzene: six atoms centred on the click, vertex up, six 1.5 bonds of length 1.0', () => {
    const d = ring(empty(), 'benzene', { point: { x: 4, y: 3 } });
    expect(atomsOf(d)).toHaveLength(6);
    expect(bondsOf(d)).toHaveLength(6);
    expect(orders(d, bondsOf(d))).toEqual([1.5, 1.5, 1.5, 1.5, 1.5, 1.5]);
    const c = centroid(d, atomsOf(d));
    expect(c.x).toBeCloseTo(4, 9);
    expect(c.y).toBeCloseTo(3, 9);
    const top = atomsOf(d)
      .map((a) => at(d, a))
      .reduce((m, q) => (q.y < m.y ? q : m));
    expect(top.x).toBeCloseTo(4, 9);
    for (const b of Object.values(d.bonds)) {
      expect(Math.abs(distance(at(d, b.a1), at(d, b.a2)) - 1)).toBeLessThan(1e-9);
    }
    expect(formula(d)).toBe('C6H6 · 78.11 g/mol');
  });

  it.each([
    ['cyclohexane', 6, 'C6H12'],
    ['cyclopentane', 5, 'C5H10'],
    ['cyclobutane', 4, 'C4H8'],
    ['cyclopropane', 3, 'C3H6'],
  ] as const)('%s: n single bonds, formula %s', (id, n, hill) => {
    const d = ring(empty(), id, { point: { x: 0, y: 0 } });
    expect(atomsOf(d)).toHaveLength(n);
    expect(orders(d, bondsOf(d))).toEqual(Array(n).fill(1));
    expect(formula(d).startsWith(hill)).toBe(true);
  });

  it('atoms within 0.15 BLU of existing atoms are merged (P6)', () => {
    const [base, only] = addAtom(empty(), { element: 'C', x: 0, y: 0 });
    // A hexagon whose top vertex lies 0.1 BLU from that atom: the vertex is that atom.
    const t = placeRing(base, 'cyclohexane', { point: { x: 0.1, y: circumradius(6) } });
    expect(t).not.toBeNull();
    expect(atomsOf(t?.doc as Doc)).toHaveLength(6);
    expect(t?.merge).toBe(only);
    // Farther than 0.15 BLU: nothing merges.
    const far = placeRing(base, 'cyclohexane', { point: { x: 0.2, y: circumradius(6) } });
    expect(atomsOf(far?.doc as Doc)).toHaveLength(7);
    expect(far?.merge).toBeUndefined();
  });

  it('a ring that coincides with an existing one changes nothing: no edit', () => {
    const base = ring(empty(), 'cyclohexane', { point: { x: 0, y: 0 } });
    expect(placeRing(base, 'cyclohexane', { point: { x: 0, y: 0 } })).toBeNull();
  });
});

describe('P4 ring onto an atom', () => {
  it('a lone atom: the ring shares it, centre 30 degrees up-right at the circumradius', () => {
    const [d0, a] = addAtom(empty(), { element: 'C', x: 1, y: 1 });
    const d = ring(d0, 'cyclohexane', { atom: a });
    expect(atomsOf(d)).toHaveLength(6);
    const c = centroid(d, atomsOf(d));
    expect(c.x).toBeCloseTo(1 + circumradius(6) * C30, 9);
    expect(c.y).toBeCloseTo(1 - circumradius(6) * 0.5, 9);
    expect(d.atoms[a]).toEqual(d0.atoms[a]);
  });

  it('an atom with one neighbour: the existing bond leaves the ring straight away from its centre', () => {
    const [d1, a] = addAtom(empty(), { element: 'C', x: 0, y: 0 });
    const [d2, b] = addAtom(d1, { element: 'C', x: 1, y: 0 });
    let d = d2;
    d = addBond(d, a, b)[0];
    const out = ring(d, 'cyclopentane', { atom: b });
    expect(atomsOf(out)).toHaveLength(2 + 4);
    const c = centroid(
      out,
      atomsOf(out).filter((id) => id !== a),
    );
    expect(c.x).toBeCloseTo(1 + circumradius(5), 9);
    expect(c.y).toBeCloseTo(0, 9);
  });

  it('spiro onto a ring atom adds exactly n - 1 atoms', () => {
    const base = ring(empty(), 'cyclohexane', { point: { x: 0, y: 0 } });
    const out = ring(base, 'cyclopentane', { atom: atomsOf(base)[2] as AtomId });
    expect(atomsOf(out)).toHaveLength(6 + 4);
    expect(bondsOf(out)).toHaveLength(6 + 5);
  });

  it('benzene onto an atom keeps its circle bonds 1.5', () => {
    const [d0, a] = addAtom(empty(), { element: 'C', x: 0, y: 0 });
    const out = ring(d0, 'benzene', { atom: a });
    expect(orders(out, bondsOf(out))).toEqual(Array(6).fill(1.5));
  });
});

describe('P5 ring fused onto a bond', () => {
  const benzene = (): Doc => ring(empty(), 'benzene', { point: { x: 0, y: 0 } });
  /** The midpoint of a bond and its outward normal (away from the ring centre at the origin). */
  function outside(d: Doc, id: BondId): { mid: Point; out: Point } {
    const bond = d.bonds[id] as Doc['bonds'][BondId];
    const a = at(d, bond.a1);
    const b = at(d, bond.a2);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const len = Math.hypot(mid.x, mid.y);
    return { mid, out: { x: mid.x / len, y: mid.y / len } };
  }
  const chainBond = (order: 1 | 2): { doc: Doc; id: BondId; a: AtomId; b: AtomId } => {
    const [d1, a] = addAtom(empty(), { element: 'C', x: 0, y: 0 });
    const [d2, b] = addAtom(d1, { element: 'C', x: 1, y: 0 });
    let d = d2;
    d = addBond(d, a, b, { order })[0];
    return { doc: d, id: bondsOf(d)[0] as BondId, a, b };
  };

  it('benzene onto a benzene bond is naphthalene: C10H8, every new bond 1.5', () => {
    const base = benzene();
    const id = bondsOf(base)[0] as BondId;
    const out = ring(base, 'benzene', { bond: id, p: outside(base, id).mid });
    expect(atomsOf(out)).toHaveLength(10);
    expect(bondsOf(out)).toHaveLength(11);
    expect(orders(out, bondsOf(out))).toEqual(Array(11).fill(1.5));
    expect(formula(out)).toBe('C10H8 · 128.17 g/mol');
  });

  it('a click on the bond line goes to the emptier side, never over the existing ring', () => {
    const base = benzene();
    for (const id of bondsOf(base)) {
      const { mid, out: dir } = outside(base, id);
      const edit = placeRing(base, 'benzene', { bond: id, p: mid });
      const doc = edit?.doc as Doc;
      const added = atomsOf(doc).filter((a) => !(a in base.atoms));
      expect(added).toHaveLength(4);
      for (const a of added) {
        const q = at(doc, a);
        expect((q.x - mid.x) * dir.x + (q.y - mid.y) * dir.y).toBeGreaterThan(0.5);
      }
    }
  });

  it('a pointer clearly on one side picks that side', () => {
    const { doc, id, a, b } = chainBond(1);
    const ys = (p: Point): number[] => {
      const out = placeRing(doc, 'cyclohexane', { bond: id, p })?.doc as Doc;
      return atomsOf(out)
        .filter((x) => x !== a && x !== b)
        .map((x) => at(out, x).y);
    };
    expect(ys({ x: 0.5, y: -0.3 }).every((y) => y < 0)).toBe(true);
    expect(ys({ x: 0.5, y: 0.3 }).every((y) => y > 0)).toBe(true);
  });

  it('benzene onto a cyclohexane bond is Kekule: alternating, the shared bond stays single', () => {
    const base = ring(empty(), 'cyclohexane', { point: { x: 0, y: 0 } });
    const id = bondsOf(base)[0] as BondId;
    const out = ring(base, 'benzene', { bond: id, p: outside(base, id).mid });
    expect(orderOf(out, id)).toBe(1);
    const fresh = bondsOf(out).filter((b) => !(b in base.bonds));
    expect(orders(out, fresh)).toEqual([2, 1, 2, 1, 2]);
  });

  it('benzene onto a double bond keeps the shared bond double and alternates', () => {
    const { doc, id } = chainBond(2);
    const out = ring(doc, 'benzene', { bond: id, p: { x: 0.5, y: -0.3 } });
    expect(orderOf(out, id)).toBe(2);
    expect(
      orders(
        out,
        bondsOf(out).filter((x) => x !== id),
      ),
    ).toEqual([1, 2, 1, 2, 1]);
  });

  it('cyclopentane onto a bond: five atoms sharing the bond, the shared bond unchanged', () => {
    const base = benzene();
    const id = bondsOf(base)[0] as BondId;
    const out = ring(base, 'cyclopentane', { bond: id, p: outside(base, id).mid });
    expect(atomsOf(out)).toHaveLength(6 + 3);
    expect(
      orders(
        out,
        bondsOf(out).filter((b) => !(b in base.bonds)),
      ),
    ).toEqual([1, 1, 1, 1]);
    expect(orderOf(out, id)).toBe(1.5);
  });

  it('reports the ring it drew, for the ghost of its circle', () => {
    const base = benzene();
    const id = bondsOf(base)[0] as BondId;
    const edit = placeRing(base, 'benzene', { bond: id, p: outside(base, id).mid });
    expect(edit?.ring).toHaveLength(6);
  });
});

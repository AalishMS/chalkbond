import { describe, expect, it } from 'vitest';
import {
  DocError,
  createHistory,
  current,
  transact,
  undo,
  updateAtom,
  type AtomId,
  type Doc,
  type Point,
} from '../doc-model/index';
import { AROMATICS, NOW, build, type BondSpec } from './__fixtures__/build';
import { cleanStructure, fitRigid } from './clean';
import { canonicalId } from './convert';
import { perceive } from './perceive';

const centroid = (doc: Doc, ids: readonly AtomId[]) => ({
  x: ids.reduce((s, id) => s + doc.atoms[id]!.x, 0) / ids.length,
  y: ids.reduce((s, id) => s + doc.atoms[id]!.y, 0) / ids.length,
});
const dist = (doc: Doc, p: AtomId, q: AtomId) =>
  Math.hypot(doc.atoms[p]!.x - doc.atoms[q]!.x, doc.atoms[p]!.y - doc.atoms[q]!.y);

/** Benzene with every atom pushed off the hexagon. */
function distortedBenzene() {
  const b = build(AROMATICS.benzene!.atoms, AROMATICS.benzene!.bonds);
  let doc = b.doc;
  const jitter = [
    [0.2, -0.1],
    [-0.15, 0.25],
    [0.1, 0.1],
    [-0.3, 0],
    [0.05, -0.2],
    [0.2, 0.3],
  ];
  b.atoms.forEach((id, i) => {
    const a = doc.atoms[id]!;
    doc = updateAtom(doc, id, { x: a.x + jitter[i]![0]!, y: a.y + jitter[i]![1]! });
  });
  return { ...b, doc };
}

const ALANINE_BONDS = (stereoBond: number, stereo: 'wedge' | 'hash'): BondSpec[] =>
  [
    [0, 1],
    [0, 2],
    [0, 3],
    [2, 4, 2],
    [2, 5],
  ].map((b, i) =>
    i === stereoBond ? [b[0]!, b[1]!, 1, stereo] : [b[0]!, b[1]!, (b[2] ?? 1) as 1 | 2],
  );

/** (R)-alanine with a wedge to CH3, drawn distorted. */
function distortedAlanine(mirror = false) {
  const s = mirror ? -1 : 1;
  return build(
    [
      { element: 'C', x: 0, y: 0 },
      { element: 'N', x: s * 0.3, y: -1.4 },
      { element: 'C', x: s * 0.6, y: 0.4 },
      { element: 'C', x: s * -1.2, y: 0.9 },
      { element: 'O', x: s * 1.9, y: -0.3 },
      { element: 'O', x: s * 0.5, y: 1.9 },
    ],
    ALANINE_BONDS(2, 'wedge'),
  );
}

describe('cleanStructure', () => {
  it('turns a distorted benzene into a regular hexagon with the same centroid', () => {
    const b = distortedBenzene();
    const before = centroid(b.doc, b.atoms);
    const out = cleanStructure(b.doc, [b.atoms[0]!]);
    for (const id of b.bonds) {
      const bond = out.bonds[id]!;
      expect(Math.abs(dist(out, bond.a1, bond.a2) - 1)).toBeLessThan(1e-6);
    }
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(dist(out, b.atoms[i]!, b.atoms[i + 3]!) - 2)).toBeLessThan(1e-6);
    }
    const after = centroid(out, b.atoms);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(perceive(out)).toEqual(perceive(b.doc));
  });

  it('leaves untouched fragments (and single atoms) alone', () => {
    const b = distortedBenzene();
    const other = build(
      ['C', 'C', 'O'],
      [
        [0, 1],
        [1, 2],
      ],
      { doc: b.doc, at: { x: 6, y: 0 } },
    );
    const lone = build(['O'], [], { doc: other.doc, at: { x: 9, y: 9 } });
    const out = cleanStructure(lone.doc, [...b.atoms, ...lone.atoms]);
    for (const id of [...other.atoms, ...lone.atoms])
      expect(out.atoms[id]).toBe(lone.doc.atoms[id]);
    expect(out.atoms[b.atoms[0]!]).not.toEqual(lone.doc.atoms[b.atoms[0]!]);
  });

  it('preserves the stereo configuration (canonical IDCode unchanged), mirror included', () => {
    const ala = distortedAlanine();
    const id = canonicalId(ala.doc);
    const out = cleanStructure(ala.doc, ala.atoms);
    expect(canonicalId(out)).toBe(id);
    expect(Object.values(out.bonds).filter((b) => b.stereo !== 'none')).toHaveLength(1);
    const mirror = distortedAlanine(true);
    const mirrorId = canonicalId(mirror.doc);
    expect(mirrorId).not.toBe(id);
    expect(canonicalId(cleanStructure(mirror.doc, mirror.atoms))).toBe(mirrorId);
  });

  it.each([0, 1, 2])('keeps the configuration whichever bond carries the wedge (bond %d)', (b) => {
    for (const stereo of ['wedge', 'hash'] as const) {
      const ala = build(
        [
          { element: 'C', x: 0, y: 0 },
          { element: 'N', x: 0, y: -1 },
          { element: 'C', x: 0.866, y: 0.5 },
          { element: 'C', x: -0.866, y: 0.5 },
          { element: 'O', x: 1.732, y: 0 },
          { element: 'O', x: 0.866, y: 1.5 },
        ],
        ALANINE_BONDS(b, stereo),
      );
      const id = canonicalId(ala.doc);
      expect(canonicalId(cleanStructure(ala.doc, ala.atoms))).toBe(id);
    }
  });

  it('is one undo step inside transact', () => {
    const b = distortedBenzene();
    let h = createHistory(b.doc, { clock: () => NOW });
    h = transact(h, 'Clean', (d) => cleanStructure(d, b.atoms));
    expect(current(h)).not.toEqual(b.doc);
    h = undo(h);
    expect(current(h)).toEqual(b.doc);
  });

  it('cleans structures with abbreviations and drawn H atoms', () => {
    const m = build(
      [
        { element: 'C', x: 0, y: 0 },
        { element: 'C', x: 0.4, y: 1.3, label: 'Ph' },
        { element: 'H', x: -0.9, y: 0.2 },
      ],
      [
        [0, 1],
        [0, 2],
      ],
    );
    const out = cleanStructure(m.doc, m.atoms);
    expect(perceive(out)).toEqual(perceive(m.doc));
    expect(Math.abs(dist(out, m.atoms[0]!, m.atoms[2]!) - 1)).toBeLessThan(1e-6);
  });

  it('rejects unknown atoms', () => {
    expect(() => cleanStructure(build(['C'], []).doc, ['a99' as AtomId])).toThrow(DocError);
  });
});

describe('fitRigid', () => {
  const from: Point[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 2 },
  ];
  const signedArea = (ps: Point[]) =>
    (ps[1]!.x - ps[0]!.x) * (ps[2]!.y - ps[0]!.y) - (ps[2]!.x - ps[0]!.x) * (ps[1]!.y - ps[0]!.y);

  it('recovers a pure rotation + translation exactly', () => {
    const angle = 0.7;
    const to = from.map((p) => ({
      x: Math.cos(angle) * p.x - Math.sin(angle) * p.y + 5,
      y: Math.sin(angle) * p.x + Math.cos(angle) * p.y - 3,
    }));
    fitRigid(from, to).forEach((p, i) => {
      expect(p.x).toBeCloseTo(to[i]!.x, 9);
      expect(p.y).toBeCloseTo(to[i]!.y, 9);
    });
  });

  it('never reflects (handedness is kept against a mirror image)', () => {
    const mirrored = from.map((p) => ({ x: -p.x, y: p.y }));
    expect(Math.sign(signedArea(fitRigid(from, mirrored)))).toBe(Math.sign(signedArea(from)));
  });
});

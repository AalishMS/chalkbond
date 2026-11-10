import { describe, expect, it } from 'vitest';
import { updateAtom, updateBond, type Doc } from '../doc-model';
import { benzene, molecule, naphthalene } from './__fixtures__/molecules';
import { circledRings, ringCircle } from './circles';
import { findRings } from './rings';
import { resolveStyle } from './style';

const style = resolveStyle({ preset: 'slides', overrides: {} } as Doc['style']);
const L = 40;
const near = (actual: number, expected: number, digits = 2) =>
  expect(actual).toBeCloseTo(expected, digits);

function circles(doc: Doc) {
  return circledRings(doc).map((ring) => ringCircle(doc, ring, style));
}

describe('circledRings', () => {
  it('benzene with stored 1.5 orders has one circled ring', () => {
    expect(circledRings(benzene().doc)).toHaveLength(1);
  });

  it('naphthalene has two circled rings, not three', () => {
    expect(circledRings(naphthalene().doc)).toHaveLength(2);
  });

  it('a Kekule ring has no circle', () => {
    expect(circledRings(benzene('kekule').doc)).toHaveLength(0);
  });

  it('a partly Kekule ring has no circle', () => {
    const m = benzene();
    const doc = updateBond(m.doc, m.bonds[0]!, { order: 2 });
    expect(circledRings(doc)).toHaveLength(0);
  });

  it('a 1.5 pair outside any ring (carboxylate) has no circle', () => {
    const m = molecule(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0, element: 'O' },
        { x: -1, y: 0, element: 'O' },
      ],
      [
        [0, 1, { order: 1.5 }],
        [0, 2, { order: 1.5 }],
      ],
    );
    expect(circledRings(m.doc)).toHaveLength(0);
  });

  it('returns the same rings as findRings, filtered', () => {
    const doc = naphthalene().doc;
    expect(circledRings(doc)).toEqual(findRings(doc));
  });
});

describe('ringCircle', () => {
  it('benzene: centred on the ring, radius circleRatio x apothem, lineWidth stroke', () => {
    const c = circles(benzene().doc)[0]!;
    expect(c).not.toBeNull();
    const apothem = (Math.sqrt(3) / 2) * L;
    expect(c!.svg).toMatch(/^<circle cx="0" cy="0" r="[\d.]+"/);
    const r = Number(/ r="([^"]+)"/.exec(c!.svg)![1]);
    near(r, 0.65 * apothem, 2);
    expect(c!.svg).toContain('stroke-width="2"');
    expect(c!.svg).toContain('stroke="#000000"');
    expect(c!.svg).not.toMatch(/\sfill="#/);
  });

  it('key is the ring atoms sorted by number, joined by commas', () => {
    const m = benzene();
    const c = circles(m.doc)[0]!;
    expect(c!.key).toBe(`ring:${m.atoms.join(',')}`);
  });

  it('ink is the circle grown by half the stroke width', () => {
    const c = circles(benzene().doc)[0]!;
    const r = 0.65 * (Math.sqrt(3) / 2) * L;
    near(c!.ink.x, -r - 1, 2);
    near(c!.ink.w, 2 * r + 2, 2);
    near(c!.ink.y, -r - 1, 2);
    near(c!.ink.h, 2 * r + 2, 2);
  });

  it('naphthalene: two circles with different centres', () => {
    const cs = circles(naphthalene().doc);
    expect(cs).toHaveLength(2);
    expect(cs[0]!.svg).not.toBe(cs[1]!.svg);
  });

  it('colour: shared bond colour is used, mixed or partly set falls back to ink', () => {
    const m = benzene();
    let shared = m.doc;
    for (const b of m.bonds) shared = updateBond(shared, b, { color: '#FF0000' });
    expect(circles(shared)[0]!.svg).toContain('stroke="#ff0000"');

    let mixed = shared;
    mixed = updateBond(mixed, m.bonds[0]!, { color: '#0000FF' });
    expect(circles(mixed)[0]!.svg).toContain('stroke="#000000"');

    const partly = updateBond(m.doc, m.bonds[0]!, { color: '#FF0000' });
    expect(circles(partly)[0]!.svg).toContain('stroke="#000000"');
  });

  it('does not use atom colours', () => {
    const m = benzene();
    const doc = updateAtom(m.doc, m.atoms[0]!, { color: '#FF0000' });
    expect(circles(doc)[0]!.svg).toContain('stroke="#000000"');
  });

  it('is null when a ring atom has a non-finite coordinate', () => {
    const m = benzene();
    const doc = {
      ...m.doc,
      atoms: { ...m.doc.atoms, [m.atoms[0]!]: { ...m.doc.atoms[m.atoms[0]!]!, x: NaN } },
    };
    expect(ringCircle(doc, findRings(doc)[0]!, style)).toBeNull();
  });

  it('scales with the style', () => {
    const big = resolveStyle({ preset: 'slides', overrides: { bondLength: 80 } } as Doc['style']);
    const doc = benzene().doc;
    const c = ringCircle(doc, circledRings(doc)[0]!, big)!;
    near(Number(/ r="([^"]+)"/.exec(c.svg)![1]), 0.65 * (Math.sqrt(3) / 2) * 80, 2);
  });
});

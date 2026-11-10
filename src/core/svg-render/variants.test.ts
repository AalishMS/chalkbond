import { describe, expect, it } from 'vitest';
import type {
  ArrowKind,
  BondOrder,
  BondStereo,
  DoublePlacement,
  DrawObjectType,
  Doc,
} from '../doc-model';
import { goldenScenes } from './__fixtures__/golden-scenes';

// SPEC-svg-render.md success criterion 2: every item type and every variant has a rendering
// rule and appears in a golden input. The `Record` types make a new union member a compile
// error here until it is listed (and then until a scene uses it).
const ORDERS: Record<`${BondOrder}`, true> = { '1': true, '1.5': true, '2': true, '3': true };
const STEREO: Record<BondStereo, true> = {
  none: true,
  wedge: true,
  hash: true,
  wavy: true,
  bold: true,
};
const PLACEMENTS: Record<DoublePlacement, true> = {
  auto: true,
  center: true,
  left: true,
  right: true,
};
const ARROWS: Record<ArrowKind, true> = {
  forward: true,
  equilibrium: true,
  retro: true,
  resonance: true,
  'no-go': true,
};
const OBJECTS: Record<DrawObjectType, true> = {
  arrow: true,
  'curved-arrow': true,
  plus: true,
  text: true,
  caption: true,
  callout: true,
  bracket: true,
  shape: true,
};
const HEADS = ['full', 'fishhook'];
const BRACKETS = ['square', 'round', 'curly'];
const SHAPES = ['rect', 'ellipse'];
const ALIGNS = ['left', 'center', 'right'];
const SCRIPTS = ['sub', 'sup'];

const docs: Doc[] = goldenScenes().map((s) => s.doc);
const objects = docs.flatMap((d) => Object.values(d.objects));
const bonds = docs.flatMap((d) => Object.values(d.bonds));
const runs = objects.flatMap((o) =>
  o.type === 'text' || o.type === 'caption' || o.type === 'callout'
    ? o.runs
    : o.type === 'bracket'
      ? (o.corner ?? [])
      : [],
);

const seen = <T>(values: Iterable<T>): Set<T> => new Set(values);

describe('golden inputs cover every variant', () => {
  it.each([
    ['BondOrder', Object.keys(ORDERS), seen(bonds.map((b) => String(b.order)))],
    ['BondStereo', Object.keys(STEREO), seen(bonds.map((b) => b.stereo))],
    ['DoublePlacement', Object.keys(PLACEMENTS), seen(bonds.map((b) => b.doublePlacement))],
    [
      'ArrowKind',
      Object.keys(ARROWS),
      seen(objects.flatMap((o) => (o.type === 'arrow' ? [o.kind] : []))),
    ],
    [
      'curved-arrow head',
      HEADS,
      seen(objects.flatMap((o) => (o.type === 'curved-arrow' ? [o.head] : []))),
    ],
    [
      'bracket shape',
      BRACKETS,
      seen(objects.flatMap((o) => (o.type === 'bracket' ? [o.shape] : []))),
    ],
    ['shape shape', SHAPES, seen(objects.flatMap((o) => (o.type === 'shape' ? [o.shape] : [])))],
    ['text align', ALIGNS, seen(objects.flatMap((o) => (o.type === 'text' ? [o.align] : [])))],
    ['run script', SCRIPTS, seen(runs.flatMap((r) => (r.script ? [r.script] : [])))],
    ['object type', Object.keys(OBJECTS), seen(objects.map((o) => o.type))],
  ])('%s: every value occurs', (_name, expected, actual) => {
    expect([...expected].filter((v) => !actual.has(v))).toEqual([]);
  });

  it('covers bold and italic runs, colours and the pseudo-atom, isotope and partial-charge atoms', () => {
    expect(runs.some((r) => r.bold)).toBe(true);
    expect(runs.some((r) => r.italic)).toBe(true);
    const atoms = docs.flatMap((d) => Object.values(d.atoms));
    expect(atoms.some((a) => a.element === 'R')).toBe(true);
    expect(atoms.some((a) => a.isotope !== undefined)).toBe(true);
    expect(atoms.some((a) => a.partialCharge !== undefined)).toBe(true);
    expect(atoms.some((a) => a.radical === 1)).toBe(true);
    expect(atoms.some((a) => a.radical === 2)).toBe(true);
    expect(atoms.some((a) => a.charge < 0 && (a.lonePairs ?? 0) > 0)).toBe(true);
    expect(atoms.some((a) => a.color !== undefined)).toBe(true);
    expect(bonds.some((b) => b.color !== undefined)).toBe(true);
  });
});

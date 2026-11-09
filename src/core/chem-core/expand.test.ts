import { describe, expect, it } from 'vitest';
import {
  DocError,
  addObject,
  createHistory,
  current,
  neighbors,
  transact,
  undo,
  type AtomId,
  type Doc,
} from '../doc-model/index';
import { NOW, build } from './__fixtures__/build';
import { ChemError } from './errors';
import { expandLabel } from './expand';
import { formulaOf, perceive } from './perceive';

/** CH3–CH2–X with the label atom at (2, 0), its neighbour at (1, 0). */
function withLabel(label: string) {
  return build(
    [
      { element: 'C', x: 0, y: 0 },
      { element: 'C', x: 1, y: 0 },
      { element: 'C', x: 2, y: 0, label },
    ],
    [
      [0, 1],
      [1, 2],
    ],
  );
}
const hill = (doc: Doc) => perceive(doc).fragments.map((f) => f.formula.hill);

describe('expandLabel', () => {
  it.each([
    ['Ph', 'C8H10', 'C'],
    ['CO2H', 'C3H6O2', 'C'],
    ['OMe', 'C3H8O', 'O'],
    ['NO2', 'C2H5NO2', 'N'],
    ['tBu', 'C6H14', 'C'],
  ])('%s keeps the formula (%s) and bonds the group to the old neighbour', (label, formula, el) => {
    const m = withLabel(label);
    expect(hill(m.doc)).toEqual([formula]);
    const out = expandLabel(m.doc, m.atoms[2]!);
    expect(out.atoms[m.atoms[2]!]).toBeUndefined();
    expect(hill(out)).toEqual([formula]);
    expect(perceive(out).warnings).toEqual([]);
    const attached = neighbors(out, m.atoms[1]!).filter((a) => a !== m.atoms[0]);
    expect(attached).toHaveLength(1);
    const a = out.atoms[attached[0]!]!;
    expect([a.element, a.x, a.y, a.label]).toEqual([el, 2, 0, undefined]);
    // the rest of the group lies away from the neighbour (to the right)
    const others = Object.values(out.atoms).filter((x) => !m.atoms.includes(x.id) && x.id !== a.id);
    for (const o of others) expect(o.x).toBeGreaterThan(1.5);
  });

  it('draws an expanded phenyl as a circle ring (1.5 bonds)', () => {
    const m = withLabel('Ph');
    const out = expandLabel(m.doc, m.atoms[2]!);
    expect(Object.values(out.bonds).filter((b) => b.order === 1.5)).toHaveLength(6);
  });

  it('is one undo step inside transact and moves anchors to the attachment atom', () => {
    const m = withLabel('Ph');
    const [doc] = addObject(m.doc, {
      type: 'curved-arrow',
      head: 'full',
      from: { kind: 'atom', atom: m.atoms[2]! },
      to: { kind: 'point', p: { x: 0, y: 2 } },
      bend: 0.3,
    });
    let h = createHistory(doc, { clock: () => NOW });
    h = transact(h, 'Expand', (d) => expandLabel(d, m.atoms[2]!));
    const after = current(h);
    const arrow = Object.values(after.objects)[0]!;
    const from = arrow.type === 'curved-arrow' ? arrow.from : null;
    expect(from?.kind).toBe('atom');
    expect(from?.kind === 'atom' && after.atoms[from.atom]?.x).toBe(2);
    h = undo(h);
    expect(current(h)).toEqual(doc);
  });

  it('carries the label colour and works with no neighbour', () => {
    const lone = build([{ label: 'OMe', color: '#ff0000' }], []);
    const out = expandLabel(lone.doc, lone.atoms[0]!);
    expect(hill(out)).toEqual(['CH4O']);
    expect(Object.values(out.atoms).every((a) => a.color === '#ff0000')).toBe(true);
  });

  it('keeps the formula of the whole fragment (formulaOf)', () => {
    const m = withLabel('CO2Et');
    const before = formulaOf(m.doc, [m.atoms[0]!]);
    const out = expandLabel(m.doc, m.atoms[2]!);
    expect(formulaOf(out, [m.atoms[0]!])).toEqual(before);
  });

  it('throws unknown-label for a non-abbreviation, DocError for an unknown atom', () => {
    const plain = build(['C'], []);
    const unknown = build([{ label: 'Boc' }], []);
    for (const [doc, id] of [
      [plain.doc, plain.atoms[0]!],
      [unknown.doc, unknown.atoms[0]!],
    ] as const) {
      expect(() => expandLabel(doc, id)).toThrow(ChemError);
      try {
        expandLabel(doc, id);
      } catch (e) {
        expect((e as ChemError).code).toBe('unknown-label');
      }
    }
    expect(() => expandLabel(plain.doc, 'a99' as AtomId)).toThrow(DocError);
  });
});

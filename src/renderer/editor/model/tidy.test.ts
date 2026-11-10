import {
  addObject,
  createHistory,
  fragments,
  transact,
  type ArrowObject,
  type Doc,
  type ObjectId,
  type PlusObject,
  type Selection,
  type TextObject,
} from '@core/doc-model';
import { render, type ItemKey } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION } from '../state/editor-state';
import { drawn } from '../state/testing';
import { messyScheme, rounded, tidied } from './tidy-fixtures';
import { itemBoxes } from './move';
import {
  applyTidy,
  planTidy,
  TIDY_ARROW_PAD,
  TIDY_GAP,
  TIDY_MIN_ARROW,
  TIDY_PLUS_GAP,
} from './tidy';

const BL = 40;
const NOW = '2026-01-01T00:00:00.000Z';

const inkOf = (doc: Doc, id: ObjectId) => {
  const r = render(doc).extents[`obj:${id}` as ItemKey];
  if (r === undefined) throw new Error('no ink');
  return r;
};

/** The ink boxes of the row, BLU, left to right. */
function rowOf(doc: Doc) {
  const scene = render(doc);
  return itemBoxes(doc, scene)
    .filter((i) => i.object === undefined || doc.objects[i.object]?.type !== 'text')
    .map((i) => ({
      kind: i.object === undefined ? 'fragment' : (doc.objects[i.object]?.type ?? ''),
      id: i.object,
      x: i.box.x / BL,
      y: i.box.y / BL,
      w: i.box.w / BL,
      h: i.box.h / BL,
    }))
    .sort((a, b) => a.x - b.x);
}

describe('TR1-TR6 tidy reaction on a hand-placed esterification', () => {
  const { doc, arrow, text, pluses } = messyScheme();
  const after = tidied(doc) as Doc;

  it('TR4: the arrow is horizontal and every ink box is centred on one line', () => {
    const a = after.objects[arrow] as ArrowObject;
    expect(a.from.y).toBe(a.to.y);
    const row = rowOf(after);
    expect(row).toHaveLength(7);
    const line = a.from.y;
    for (const item of row) {
      const centre = item.kind === 'arrow' ? line : item.y + item.h / 2;
      expect(Math.abs(centre - line)).toBeLessThan(0.01);
    }
  });

  it('TR2, TR5: left to right, 0.6 BLU between ink boxes and 0.4 beside a plus', () => {
    const row = rowOf(after);
    expect(row.map((r) => r.kind)).toEqual([
      'fragment',
      'plus',
      'fragment',
      'arrow',
      'fragment',
      'plus',
      'fragment',
    ]);
    for (let i = 1; i < row.length; i += 1) {
      const prev = row[i - 1];
      const item = row[i];
      if (prev === undefined || item === undefined) throw new Error('row');
      const want = prev.kind === 'plus' || item.kind === 'plus' ? TIDY_PLUS_GAP : TIDY_GAP;
      expect(item.x - (prev.x + prev.w)).toBeCloseTo(want, 6);
    }
  });

  it("TR3: the text becomes the arrow's condition above it; the arrow fits it with 0.6 BLU", () => {
    const t = after.objects[text] as TextObject;
    expect(t.attachedTo).toEqual({ arrow, slot: 'above' });
    expect(t.align).toBe('center');
    const a = after.objects[arrow] as ArrowObject;
    const ink = inkOf(after, text);
    const length = Math.abs(a.to.x - a.from.x);
    expect(length).toBeCloseTo(Math.max(TIDY_MIN_ARROW, ink.w / BL + TIDY_ARROW_PAD), 6);
    expect(a.to.x).toBeGreaterThan(a.from.x);
  });

  it('TR6, T3: the condition is centred above the arrow, 0.2 bondLength clear of its ink', () => {
    const a = after.objects[arrow] as ArrowObject;
    const ink = inkOf(after, text);
    const arrowInk = inkOf(after, arrow);
    expect(ink.x + ink.w / 2).toBeCloseTo(((a.from.x + a.to.x) / 2) * BL, 2);
    expect(arrowInk.y - (ink.y + ink.h)).toBeCloseTo(0.2 * BL, 2);
  });

  it('keeps the molecules as they are: only moved', () => {
    for (const frag of fragments(doc)) {
      const id = frag[0];
      if (id === undefined) continue;
      const before = doc.atoms[id];
      const next = after.atoms[id];
      expect(next?.element).toBe(before?.element);
    }
    expect(Object.keys(after.atoms)).toEqual(Object.keys(doc.atoms));
    for (const id of pluses) expect((after.objects[id] as PlusObject).type).toBe('plus');
  });

  it('one transaction is one history step', () => {
    const plan = planTidy(doc, EMPTY_SELECTION);
    if (plan === null) throw new Error('no plan');
    const h = transact(createHistory(doc, { clock: () => NOW }), 'Tidy reaction', (d) =>
      applyTidy(d, plan),
    );
    expect(h.past).toHaveLength(1);
    expect(h.past[0]?.label).toBe('Tidy reaction');
  });

  it('TR6: tidy twice is tidy once', () => {
    const twice = tidied(after) as Doc;
    expect(rounded(twice.atoms)).toBe(rounded(after.atoms));
    expect(rounded(twice.objects)).toBe(rounded(after.objects));
  });
});

describe('TR1 scope', () => {
  it('no arrow: nothing to tidy', () => {
    const doc = drawn({ name: 'ethanol', x: 0, y: 0 }, { name: 'water', x: 5, y: 1 });
    expect(planTidy(doc, EMPTY_SELECTION)).toBeNull();
  });

  it('a selection without an arrow has nothing to tidy even if the document has one', () => {
    const { doc } = messyScheme();
    const first = fragments(doc)[0] ?? [];
    const sel: Selection = { atoms: new Set(first), bonds: new Set(), objects: new Set() };
    expect(planTidy(doc, sel)).toBeNull();
  });

  it('with no selection only items near the arrows join the row (the band, 1.5 BLU)', () => {
    const base = drawn(
      { name: 'ethanol', x: 0, y: 0.4 },
      { name: 'water', x: 7, y: 0 },
      { name: 'ethanol', x: 0, y: 12 },
    );
    const [doc] = addObject(base, {
      type: 'arrow',
      kind: 'forward',
      from: { x: 3, y: 0.5 },
      to: { x: 5.5, y: 0.7 },
    });
    const out = tidied(doc) as Doc;
    const far = fragments(doc).find((f) => (doc.atoms[f[0] as never]?.y ?? 0) > 10) ?? [];
    expect(far.length).toBeGreaterThan(0);
    for (const id of far) expect(out.atoms[id]).toEqual(doc.atoms[id]);
    const near = fragments(doc).find((f) => (doc.atoms[f[0] as never]?.y ?? 0) < 5) ?? [];
    expect(near.length).toBeGreaterThan(0);
  });

  it('a selection tidies only what is selected, the first selected item staying put', () => {
    const { doc, arrow, pluses } = messyScheme();
    const left = fragments(doc).slice(0, 2).flat();
    const sel: Selection = {
      atoms: new Set(left),
      bonds: new Set(),
      objects: new Set([arrow, pluses[0] as ObjectId]),
    };
    const plan = planTidy(doc, sel);
    expect(plan).not.toBeNull();
    const movedAtoms = new Set(plan?.moves.flatMap((m) => m.atoms));
    for (const id of movedAtoms) expect(left).toContain(id);
  });

  it('keeps an arrow leftward when it was drawn leftward (TR3)', () => {
    const [d1, arrow] = addObject(drawn({ name: 'water', x: 0, y: 0 }), {
      type: 'arrow',
      kind: 'forward',
      from: { x: 6, y: 0.4 },
      to: { x: 3, y: 0.7 },
    });
    const out = tidied(d1) as Doc;
    const a = out.objects[arrow] as ArrowObject;
    expect(a.to.x).toBeLessThan(a.from.x);
    expect(a.from.y).toBe(a.to.y);
  });

  it('a lone arrow with a text far from it leaves the text a free row item', () => {
    const [d1] = addObject(drawn(), {
      type: 'arrow',
      kind: 'forward',
      from: { x: 0, y: 0 },
      to: { x: 3, y: 0 },
    });
    const [d2, text] = addObject(d1, {
      type: 'text',
      at: { x: 1.5, y: 1.4 },
      runs: [{ text: 'far' }],
      align: 'left',
    });
    const out = tidied(d2) as Doc;
    expect((out.objects[text] as TextObject).attachedTo).toBeUndefined();
  });
});

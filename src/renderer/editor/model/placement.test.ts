import { createNameIndex, structureFromText } from '@core/chem-core';
import { emptyDoc, insert, type Doc, type SubDoc } from '@core/doc-model';
import { render } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import { insertPosition, subInk } from './placement';

const names = createNameIndex({
  format: 'chalkbond-compounds',
  version: 1,
  source: 'test',
  entries: [
    { name: 'ethanol', synonyms: [], smiles: 'CCO', formula: 'C2H6O', mw: 46.07 },
    { name: 'benzene', synonyms: [], smiles: 'c1ccccc1', formula: 'C6H6', mw: 78.11 },
    {
      name: 'acetic acid',
      synonyms: [],
      smiles: 'CC(=O)O',
      formula: 'C2H4O2',
      mw: 60.05,
    },
  ],
});

function sub(name: string): SubDoc {
  const r = structureFromText(name, names);
  if (!r.ok) throw new Error(name);
  return r.value.sub;
}

const empty = (): Doc => emptyDoc('2026-01-01T00:00:00.000Z');

/** Inserts `name` by P7 and returns the document and the ink box of what was inserted (BLU). */
function place(doc: Doc, name: string, centre = { x: 3, y: 2 }): { doc: Doc; ink: Rect } {
  const s = sub(name);
  const scene = render(doc);
  const at = insertPosition(doc, scene, s, centre);
  const [next, selection] = insert(doc, s, at);
  const after = render(next);
  const boxes = [...selection.atoms, ...selection.bonds]
    .map((id) => after.extents[(id.startsWith('a') ? `atom:${id}` : `bond:${id}`) as never])
    .filter((r): r is Rect => r !== undefined);
  const b = after.style.bondLength;
  const x0 = Math.min(...boxes.map((r) => r.x));
  const y0 = Math.min(...boxes.map((r) => r.y));
  const x1 = Math.max(...boxes.map((r) => r.x + r.w));
  const y1 = Math.max(...boxes.map((r) => r.y + r.h));
  return { doc: next, ink: { x: x0 / b, y: y0 / b, w: (x1 - x0) / b, h: (y1 - y0) / b } };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

describe('P7 placement', () => {
  it('centres the ink box on the canvas centre in an empty document', () => {
    const { ink } = place(empty(), 'ethanol');
    expect(ink.x + ink.w / 2).toBeCloseTo(3, 1);
    expect(ink.y + ink.h / 2).toBeCloseTo(2, 1);
  });

  it('puts the next structure 1.0 BLU right of the ink box, centred on the rightmost fragment', () => {
    const first = place(empty(), 'ethanol');
    const before = render(first.doc);
    const bl = before.style.bondLength;
    const right = ((before.bounds?.x ?? 0) + (before.bounds?.w ?? 0)) / bl;
    const second = place(first.doc, 'benzene', { x: 40, y: 40 });
    expect(second.ink.x).toBeCloseTo(right + 1, 2);
    expect(second.ink.y + second.ink.h / 2).toBeCloseTo(first.ink.y + first.ink.h / 2, 1);
  });

  it('does not overlap and keeps going right', () => {
    const one = place(empty(), 'benzene');
    const two = place(one.doc, 'acetic acid');
    const three = place(two.doc, 'ethanol');
    expect(two.ink.x).toBeGreaterThan(one.ink.x + one.ink.w);
    expect(three.ink.x).toBeGreaterThan(two.ink.x + two.ink.w);
  });

  it('measures the ink of a sub-document, labels included', () => {
    const ink = subInk(sub('ethanol'), empty().style, '2026-01-01T00:00:00.000Z');
    expect(ink).not.toBeNull();
    expect(ink?.w).toBeGreaterThan(1.5);
  });
});

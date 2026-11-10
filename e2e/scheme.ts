// A hand-placed esterification scheme for the Tidy reaction tests and shots: four molecules inserted
// by name, then moved a little off the line, two plus signs, a tilted arrow and two condition
// texts roughly in place.
import type { Page } from '@playwright/test';
import {
  addObject,
  fragments,
  transformItems,
  translation,
  type AtomId,
  type Doc,
  type ObjectId,
} from '../src/core/doc-model';
import { render, type ItemKey } from '../src/core/svg-render';
import { insertName, loadDocument, readDocument } from './harness';

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };
export const BL = 40;

/** Inserts `name` and takes the focus to the canvas; the Select tool is active afterwards. */
export async function insert(page: Page, name: string): Promise<Doc> {
  await insertName(page, name);
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Escape');
  return readDocument(page);
}

export const union = (boxes: Box[]): Box => {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/** The ink box (pt) of a molecule: its vertices, labels and bonds. */
export function fragmentInk(doc: Doc, atoms: readonly AtomId[]): Box {
  const scene = render(doc);
  const set = new Set(atoms);
  const boxes: Box[] = [];
  for (const id of atoms) {
    const a = doc.atoms[id];
    if (a) boxes.push({ x: a.x * BL, y: a.y * BL, w: 0, h: 0 });
    const ink = scene.extents[`atom:${id}` as ItemKey];
    if (ink) boxes.push(ink);
  }
  for (const b of Object.values(doc.bonds)) {
    if (set.has(b.a1) && set.has(b.a2)) {
      const ink = scene.extents[`bond:${b.id}` as ItemKey];
      if (ink) boxes.push(ink);
    }
  }
  return union(boxes);
}

export const objInk = (doc: Doc, id: ObjectId): Box => {
  const r = render(doc).extents[`obj:${id}` as ItemKey];
  if (r === undefined) throw new Error(`no ink for ${id}`);
  return r;
};

/** Moves a molecule so its ink box centre is at BLU `to`. */
export function place(doc: Doc, atoms: readonly AtomId[], to: Pt): Doc {
  const ink = fragmentInk(doc, atoms);
  const dx = to.x - (ink.x + ink.w / 2) / BL;
  const dy = to.y - (ink.y + ink.h / 2) / BL;
  const sel = {
    atoms: new Set(atoms),
    bonds: new Set(
      Object.values(doc.bonds)
        .filter((b) => atoms.includes(b.a1) && atoms.includes(b.a2))
        .map((b) => b.id),
    ),
    objects: new Set<ObjectId>(),
  };
  return transformItems(doc, sel, translation(dx, dy));
}

/** Builds the messy scheme in the running editor (Select tool active); returns its ids. */
export async function messyScheme(
  page: Page,
): Promise<{ doc: Doc; arrow: ObjectId; above: ObjectId; below: ObjectId }> {
  let doc: Doc = await insert(page, 'ethanol');
  for (const name of ['acetic acid', 'ethyl acetate', 'water']) doc = await insert(page, name);
  const frags = fragments(doc);
  if (frags.length !== 4) throw new Error(`expected four molecules, got ${frags.length}`);
  // Messy: each molecule a little off the line, pluses and a tilted arrow roughly in place.
  const spots: Pt[] = [
    { x: 0, y: 0.4 },
    { x: 5.2, y: -0.3 },
    { x: 14, y: 0.6 },
    { x: 20, y: -0.2 },
  ];
  frags.forEach((f, i) => {
    doc = place(doc, f, spots[i] as Pt);
  });
  [doc] = addObject(doc, { type: 'plus', at: { x: 2.6, y: 1 } });
  [doc] = addObject(doc, { type: 'plus', at: { x: 17.4, y: 0.2 } });
  const [withArrow, arrow] = addObject(doc, {
    type: 'arrow',
    kind: 'forward',
    from: { x: 8.2, y: 1 },
    to: { x: 11.4, y: 0.5 },
  });
  const [withAbove, above] = addObject(withArrow, {
    type: 'text',
    at: { x: 9.8, y: 0 },
    runs: [
      { text: 'conc. H' },
      { text: '2', script: 'sub' },
      { text: 'SO' },
      { text: '4', script: 'sub' },
    ],
    align: 'center',
  });
  const [withBelow, below] = addObject(withAbove, {
    type: 'text',
    at: { x: 9.8, y: 1.6 },
    runs: [{ text: 'heat' }],
    align: 'center',
  });
  doc = withBelow;
  await loadDocument(page, doc);
  await page.getByTestId('tool-select').click();
  return { doc, arrow, above, below };
}

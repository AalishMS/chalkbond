import { expect, test } from 'vitest';
import {
  addAtom,
  addBond,
  addObject,
  emptyDoc,
  everything,
  parse,
  setStyle,
  type AtomId,
  type BondId,
  type Doc,
} from '../doc-model';
import { renderSvg } from '../svg-render';
import {
  CLIPBOARD_MARGIN,
  clipboardBitmapPadding,
  drawingPayload,
  exportSvg,
  groupDigits,
  pasteAction,
  pictureDoc,
  pngPixelSize,
} from './index';

const objectIds = (d: Doc): Doc['objects'][keyof Doc['objects']]['id'][] =>
  Object.values(d.objects).map((o) => o.id);
/** The payload of `structuralDoc` made skeletal, as written before F2 (schema v1, no `formula`). */
const SKELETAL_PAYLOAD =
  '{"format":"chalkbond","schemaVersion":1,"doc":{"schemaVersion":1,"atoms":{"a1":{"id":"a1","x":-2.5,"y":0,"charge":0,"element":"C","radical":0},"a2":{"id":"a2","x":-1.5,"y":0,"charge":0,"element":"C","radical":0}},"bonds":{"b3":{"id":"b3","a1":"a1","a2":"a2","doublePlacement":"auto","order":1,"stereo":"none"}},"groups":{},"meta":{"created":"2026-11-12T00:00:00.000Z","modified":"2026-11-12T00:00:00.000Z"},"nextId":5,"objects":{"o4":{"id":"o4","type":"arrow","kind":"forward","from":{"x":-0.5,"y":0},"to":{"x":2.5,"y":0}}},"style":{"overrides":{},"preset":"slides"},"zOrder":["o4"]}}';
const NOW = '2026-11-12T00:00:00.000Z';
/** A document with some ink: one forward arrow. */
const withArrow = (doc: Doc): Doc =>
  addObject(doc, { type: 'arrow', kind: 'forward', from: { x: 0, y: 0 }, to: { x: 3, y: 0 } })[0];

test('exportSvg padding (R10): equals renderSvg with that padding; the default stays tight', () => {
  const doc = withArrow(emptyDoc(NOW));
  const payload = drawingPayload(pictureDoc(doc, null));
  expect(exportSvg(doc, null, { padding: 10 }).svg).toBe(
    renderSvg(doc, { padding: 10, metadata: payload }).svg,
  );
  expect(exportSvg(doc, null, { embed: false, padding: 10 }).svg).toBe(
    renderSvg(doc, { padding: 10 }).svg,
  );
  expect(exportSvg(doc, null).svg).toBe(renderSvg(doc, { padding: 0, metadata: payload }).svg);
  const tight = exportSvg(doc, null);
  const padded = exportSvg(doc, null, { embed: false, padding: 10 });
  expect(padded.width).toBeCloseTo(tight.width + 20, 3);
  expect(padded.height).toBeCloseTo(tight.height + 20, 3);
  expect(padded.origin).toEqual({ x: tight.origin.x - 10, y: tight.origin.y - 10 });
});

test('exportSvg with embed: false does not serialise the drawing again (SC12): no <metadata>, same output', () => {
  const doc = withArrow(emptyDoc(NOW));
  const svg = exportSvg(doc, null, { embed: false, padding: 3.6 }).svg;
  expect(svg).not.toContain('<metadata');
  expect(svg).toBe(renderSvg(doc, { padding: 3.6 }).svg);
});

test('clipboardBitmapPadding is 0.25 x the bond length: Slides 10, Handout 3.6, an override', () => {
  expect(CLIPBOARD_MARGIN).toBe(0.25);
  const slides = emptyDoc(NOW);
  expect(slides.style.preset).toBe('slides');
  expect(clipboardBitmapPadding(slides)).toBe(10);
  expect(clipboardBitmapPadding(setStyle(slides, { preset: 'journal' }))).toBeCloseTo(3.6, 10);
  expect(clipboardBitmapPadding(setStyle(slides, { overrides: { bondLength: 80 } }))).toBe(20);
});
test('ordinary size and grouping', () => {
  expect(pngPixelSize(800, 200, 300)).toEqual({
    width: 3334,
    height: 834,
    dpi: 300,
    reduced: false,
  });
  expect([999, 2984, 1234567].map(groupDigits)).toEqual(['999', '2,984', '1,234,567']);
});
test.each([
  [720001, 1],
  [720000, 720000],
  [1e308, 1e308],
  [4000, 4000],
])('caps %s × %s', (w, h) => {
  const s = pngPixelSize(w, h, 300);
  expect(s.dpi).toBeGreaterThan(0);
  expect(s.reduced).toBe(true);
  expect(s.width).toBe(Math.max(1, Math.ceil((w * s.dpi) / 72)));
  expect(s.height).toBe(Math.max(1, Math.ceil((h * s.dpi) / 72)));
  expect(s.width).toBeLessThanOrEqual(10000);
  expect(s.height).toBeLessThanOrEqual(10000);
  expect(s.width * s.height).toBeLessThanOrEqual(50000000);
  if (w >= 720000) expect(s.dpi).toBeLessThan(1);
});

// N9 (R11, R12, SC15): the formula setting travels with a picture; the margin and true size hold.
const structuralDoc = (): Doc => {
  const [d1, a] = addAtom(setStyle(emptyDoc(NOW), { formula: 'structural' }), {
    element: 'C',
    x: 0,
    y: 0,
  });
  const [d2, b] = addAtom(d1, { element: 'C', x: 1, y: 0 });
  return addObject(addBond(d2, a, b)[0], {
    type: 'arrow',
    kind: 'forward',
    from: { x: 2, y: 0 },
    to: { x: 5, y: 0 },
  })[0];
};

test('pictureDoc keeps the structural setting; its payload parses to a structural document', () => {
  const doc = structuralDoc();
  const sel = everything(doc);
  const taken = pictureDoc(doc, sel);
  expect(taken.style.formula).toBe('structural');
  const parsed = parse(drawingPayload(taken));
  expect(parsed.ok && parsed.value.style.formula).toBe('structural');
  expect(exportSvg(doc, sel).svg).toContain('&quot;schemaVersion&quot;:2');
  // A selection of part of it, too.
  const part = {
    atoms: new Set<AtomId>(),
    bonds: new Set<BondId>(),
    objects: new Set(objectIds(doc)),
  };
  expect(pictureDoc(doc, part).style.formula).toBe('structural');
});

test('a skeletal selection stays a v1 payload, byte for byte (D1)', () => {
  const skeletal = setStyle(structuralDoc(), { formula: 'skeletal' });
  const taken = pictureDoc(skeletal, everything(skeletal));
  expect('formula' in taken.style).toBe(false);
  const payload = drawingPayload(taken);
  expect(payload).toContain('"schemaVersion":1');
  expect(payload).not.toContain('formula');
  expect(payload).toBe(SKELETAL_PAYLOAD);
});

test('pasting a structural payload gives a fragment that carries no style (the target applies)', () => {
  const doc = structuralDoc();
  const payload = drawingPayload(pictureDoc(doc, everything(doc)));
  const action = pasteAction(
    { drawing: payload, text: null, textTooLong: false, image: false },
    null,
    false,
  );
  expect(action.kind).toBe('fragment');
  if (action.kind !== 'fragment') return;
  expect('style' in action.sub).toBe(false);
});

// R12 guards (no RED expected: they pass once the factor is in and fail the day the margin or the
// true size drifts).
test('R12: the clipboard margin is the skeletal one for a structural document', () => {
  const doc = structuralDoc();
  expect(clipboardBitmapPadding(doc)).toBe(10);
  expect(clipboardBitmapPadding(setStyle(doc, { preset: 'journal' }))).toBeCloseTo(3.6, 10);
});

test('R12: a structural picture is the doubled render at true size, larger than the skeletal one', () => {
  const doc = structuralDoc();
  const skeletal = setStyle(doc, { formula: 'skeletal' });
  const picture = exportSvg(doc, null);
  const scene = renderSvg(doc);
  expect(picture.width).toBe(scene.width);
  expect(picture.height).toBe(scene.height);
  expect(picture.width).toBeGreaterThan(exportSvg(skeletal, null).width);
  expect(picture.svg).toContain(`width="${String(picture.width)}pt"`);
});

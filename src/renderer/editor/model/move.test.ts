import { addObject, fragments, type AtomId, type Doc, type Selection } from '@core/doc-model';
import { render } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION } from '../state/editor-state';
import { drawn, wholeOf } from '../state/testing';
import { itemBoxes, movedInk, movePlan } from './move';

const doc2 = (): Doc => drawn({ name: 'benzene', x: 0, y: 0 }, { name: 'ethanol', x: 6, y: 0 });
const ring = (d: Doc): AtomId[] => fragments(d).find((f) => f.length === 6) as AtomId[];
const eth = (d: Doc): AtomId[] => fragments(d).find((f) => f.length === 3) as AtomId[];
const one = (id: AtomId): Selection => ({ ...EMPTY_SELECTION, atoms: new Set([id]) });

function withArrowOnRing(): { doc: Doc; arrow: string } {
  const doc = doc2();
  const [withArrow, arrow] = addObject(doc, {
    type: 'curved-arrow',
    head: 'full',
    from: { kind: 'atom', atom: ring(doc)[0] as AtomId },
    to: { kind: 'point', p: { x: 3, y: -2 } },
    bend: 0.3,
  });
  return { doc: withArrow, arrow };
}

describe('drag fast path decision (Rendering rule 4)', () => {
  it('whole fragments translate; the plan lists the parts that move, rings included', () => {
    const doc = doc2();
    const plan = movePlan(doc, render(doc), wholeOf(doc, ring(doc)));
    expect(plan.translate).toBe(true);
    expect(plan.keys.filter((k) => k.startsWith('atom:'))).toHaveLength(6);
    expect(plan.keys.filter((k) => k.startsWith('bond:'))).toHaveLength(6);
    expect(plan.keys.filter((k) => k.startsWith('ring:'))).toHaveLength(1);
    expect(plan.keys.some((k) => eth(doc).some((id) => k === `atom:${id}`))).toBe(false);
  });

  it('one atom of a fragment is a full preview (its bonds change length)', () => {
    const doc = doc2();
    expect(movePlan(doc, render(doc), one(ring(doc)[0] as AtomId)).translate).toBe(false);
  });

  it('a lone atom translates', () => {
    const doc = drawn({ name: 'methane', x: 0, y: 0 });
    const id = Object.keys(doc.atoms)[0] as AtomId;
    expect(movePlan(doc, render(doc), one(id)).translate).toBe(true);
  });

  it('a curved arrow anchored to the moved fragment but unselected: full preview', () => {
    const { doc } = withArrowOnRing();
    expect(movePlan(doc, render(doc), wholeOf(doc, ring(doc))).translate).toBe(false);
  });

  it('selected together with the curved arrow anchored to it: translate', () => {
    const { doc, arrow } = withArrowOnRing();
    const sel = { ...wholeOf(doc, ring(doc)), objects: new Set([arrow as never]) };
    expect(movePlan(doc, render(doc), sel).translate).toBe(true);
  });

  it('a selected curved arrow anchored to an atom that stays: full preview', () => {
    const { doc, arrow } = withArrowOnRing();
    const sel = { ...EMPTY_SELECTION, objects: new Set([arrow as never]) };
    expect(movePlan(doc, render(doc), sel).translate).toBe(false);
  });

  it('a plain object moves by translation, with the texts attached to an arrow', () => {
    const [d1, arrow] = addObject(drawn(), {
      type: 'arrow',
      kind: 'forward',
      from: { x: 0, y: 0 },
      to: { x: 3, y: 0 },
    });
    const [d2, text] = addObject(d1, {
      type: 'text',
      at: { x: 1.5, y: -0.6 },
      runs: [{ text: 'H2O' }],
      align: 'center',
      attachedTo: { arrow, slot: 'above' },
    });
    const plan = movePlan(d2, render(d2), { ...EMPTY_SELECTION, objects: new Set([arrow]) });
    expect(plan.translate).toBe(true);
    expect(plan.keys).toContain(`obj:${arrow}`);
    expect(plan.keys).toContain(`obj:${text}`);
  });

  it('a caption that refers to an unmoved atom is a full preview', () => {
    const doc = doc2();
    const [withCaption, caption] = addObject(doc, {
      type: 'caption',
      runs: [{ text: '1' }],
      target: [eth(doc)[0] as AtomId],
    });
    const sel = { ...wholeOf(withCaption, ring(withCaption)), objects: new Set([caption]) };
    expect(movePlan(withCaption, render(withCaption), sel).translate).toBe(false);
  });
});

describe('ink boxes for snapping', () => {
  it('has one box per fragment and per object, in pt', () => {
    const doc = doc2();
    const [withPlus] = addObject(doc, { type: 'plus', at: { x: 3, y: 0 } });
    const boxes = itemBoxes(withPlus, render(withPlus));
    expect(boxes).toHaveLength(3);
    expect(boxes.filter((b) => b.atoms.length > 0)).toHaveLength(2);
  });

  it('the moved ink covers the vertices and label extents of the moved atoms only', () => {
    const doc = doc2();
    const scene = render(doc);
    const ink = movedInk(doc, scene, wholeOf(doc, eth(doc)));
    if (ink === null) throw new Error('no ink');
    for (const id of eth(doc)) {
      const a = doc.atoms[id] as { x: number; y: number };
      expect(a.x * 40).toBeGreaterThanOrEqual(ink.x - 1e-9);
      expect(a.x * 40).toBeLessThanOrEqual(ink.x + ink.w + 1e-9);
    }
    const ringX = (doc.atoms[ring(doc)[0] as AtomId] as { x: number }).x * 40;
    expect(ringX).toBeLessThan(ink.x);
  });

  it('nothing moved has no ink', () => {
    const doc = doc2();
    expect(movedInk(doc, render(doc), EMPTY_SELECTION)).toBeNull();
  });
});

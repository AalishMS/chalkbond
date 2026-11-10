import {
  fragments,
  type AtomId,
  type BondId,
  type CurvedArrowObject,
  type Doc,
} from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { distance } from '../model/geometry';
import { drawn } from '../state/testing';
import { curvedTool } from './curved';
import { at, click, drag, rig, screenOf, screenPos, send, type Rig } from './testing';

const curvedRig = (doc: Doc, variant = 'full'): Rig => rig(curvedTool, doc, variant);
const curves = (d: Doc): CurvedArrowObject[] =>
  Object.values(d.objects).filter((o): o is CurvedArrowObject => o.type === 'curved-arrow');

const acetic = (): Doc => drawn({ name: 'acetic acid', x: 0, y: 0 });
function carbonyl(doc: Doc): { bond: BondId; oxygen: AtomId; mid: { x: number; y: number } } {
  for (const b of Object.values(doc.bonds)) {
    if (b.order !== 2) continue;
    const oxygen = [b.a1, b.a2].find((id) => doc.atoms[id]?.element === 'O');
    const p1 = doc.atoms[b.a1];
    const p2 = doc.atoms[b.a2];
    if (oxygen !== undefined && p1 && p2) {
      return { bond: b.id, oxygen, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
    }
  }
  throw new Error('no C=O');
}

describe('Curved arrow (R3)', () => {
  it('from the C=O bond to its O atom: bond anchor at 0.5, atom anchor, full head', () => {
    const doc = acetic();
    const { bond, oxygen, mid } = carbonyl(doc);
    const r = curvedRig(doc);
    drag(r, screenOf(mid), screenPos(doc, oxygen));
    expect(r.commits).toHaveLength(1);
    expect(r.commits[0]?.label).toBe('Add curved arrow');
    const [c] = curves(r.doc);
    expect(c).toMatchObject({
      head: 'full',
      from: { kind: 'bond', bond, t: 0.5 },
      to: { kind: 'atom', atom: oxygen },
    });
    expect(Math.abs(c?.bend ?? 0)).toBe(0.4);
  });

  it('the option picks the head', () => {
    const doc = acetic();
    const { oxygen, mid } = carbonyl(doc);
    const r = curvedRig(doc, 'fishhook');
    drag(r, screenOf(mid), screenPos(doc, oxygen));
    expect(curves(r.doc)[0]?.head).toBe('fishhook');
  });

  it('ends on empty canvas as a point anchor', () => {
    const doc = acetic();
    const { oxygen } = carbonyl(doc);
    const r = curvedRig(doc);
    const end = screenOf({ x: 6, y: 1 });
    drag(r, screenPos(doc, oxygen), end);
    const [c] = curves(r.doc);
    expect(c?.from).toEqual({ kind: 'atom', atom: oxygen });
    expect(c?.to.kind).toBe('point');
    if (c?.to.kind === 'point') expect(distance(c.to.p, { x: 6, y: 1 })).toBeLessThan(1e-9);
  });

  it('between two molecules the bend bulges away from both fragments', () => {
    const doc = drawn({ name: 'water', x: 0, y: 0 }, { name: 'chloromethane', x: 4, y: 0 });
    const [water, ch3cl] = fragments(doc);
    const o = water?.[0];
    const c = ch3cl?.find((id) => doc.atoms[id]?.element === 'C');
    if (!o || !c) throw new Error('atoms');
    const r = curvedRig(doc);
    drag(r, screenPos(doc, o), screenPos(doc, c));
    const [arrow] = curves(r.doc);
    expect(arrow?.from).toEqual({ kind: 'atom', atom: o });
    expect(arrow?.to).toEqual({ kind: 'atom', atom: c });
    expect(Math.abs(arrow?.bend ?? 0)).toBe(0.4);
  });

  it('start on empty canvas: an info notice, no gesture, no step', () => {
    const r = curvedRig(acetic());
    const step = send(r, at(screenOf({ x: 9, y: 9 }), 'down'));
    expect(step.notice).toEqual({ kind: 'info', text: 'Start on an atom or a bond.' });
    expect(r.gesture).toBeNull();
    send(r, at(screenOf({ x: 9, y: 9 }), 'up'));
    expect(r.commits).toHaveLength(0);
  });

  it('same start and end cancel', () => {
    const doc = acetic();
    const { oxygen } = carbonyl(doc);
    const r = curvedRig(doc);
    click(r, screenPos(doc, oxygen));
    drag(r, screenPos(doc, oxygen), screenPos(doc, oxygen));
    expect(r.commits).toHaveLength(0);
    expect(curves(r.doc)).toHaveLength(0);
  });

  it('the ghost and both anchor highlights show while dragging', () => {
    const doc = acetic();
    const { bond, oxygen, mid } = carbonyl(doc);
    const r = curvedRig(doc);
    send(r, at(screenOf(mid), 'down'));
    expect(r.gesture?.overlay?.anchors).toEqual([{ kind: 'bond', id: bond }]);
    send(r, at(screenPos(doc, oxygen), 'move'));
    expect(curves(r.preview?.doc ?? doc)).toHaveLength(1);
    expect(r.gesture?.overlay?.anchors).toEqual([
      { kind: 'bond', id: bond },
      { kind: 'atom', id: oxygen },
    ]);
    expect(r.doc.objects).toEqual({});
    send(r, at(screenPos(doc, oxygen), 'up'));
    expect(r.preview).toBeNull();
  });

  it('Escape drops the gesture without a step', () => {
    const doc = acetic();
    const { oxygen, mid } = carbonyl(doc);
    const r = curvedRig(doc);
    send(r, at(screenOf(mid), 'down'));
    send(r, at(screenPos(doc, oxygen), 'move'));
    send(r, { type: 'cancel' });
    expect(r.gesture).toBeNull();
    expect(r.preview).toBeNull();
    expect(r.commits).toHaveLength(0);
  });
});

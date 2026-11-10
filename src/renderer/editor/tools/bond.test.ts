import { perceive } from '@core/chem-core';
import {
  addAtom,
  addBond,
  addObject,
  createHistory,
  current,
  emptyDoc,
  transact,
  type AtomId,
  type BondId,
  type Doc,
} from '@core/doc-model';
import { render } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import type { CanvasEvent } from '../model/canvas-event';
import type { Point } from '../model/geometry';
import { hitTest, hoverFilter } from '../model/hit-test';
import { bluToScreen, screenToBlu, type Viewport } from '../model/viewport';
import { EMPTY_SELECTION, type GestureState, type Preview } from '../state/editor-state';
import { bondTool } from './bond';
import { DRAG_PX, type ToolContext, type ToolStep } from './tool';

const BL = 40;
const viewport: Viewport = { zoom: 1.5, pan: { x: 400, y: 300 }, size: { w: 1200, h: 700 } };
const NONE = { shift: false, alt: false, ctrl: false };
const SHIFT = { shift: true, alt: false, ctrl: false };
const C30 = Math.cos(Math.PI / 6);
/** One bond is 80 screen px at this viewport. */
const BOND_PX = 80;

const screenOf = (p: Point): Point => bluToScreen(viewport, p, BL);

interface Rig {
  doc: Doc;
  variant: string;
  gesture: GestureState | null;
  preview: Preview | null;
  commits: { label: string; doc: Doc }[];
  last: ToolStep | null;
}

const rig = (doc: Doc = emptyDoc('2026-01-01T00:00:00.000Z'), variant = 'single'): Rig => ({
  doc,
  variant,
  gesture: null,
  preview: null,
  commits: [],
  last: null,
});

function context(r: Rig, hit: ToolContext['hit']): ToolContext {
  const scene = render(r.doc);
  return {
    doc: r.doc,
    scene,
    perception: perceive(r.doc),
    selection: EMPTY_SELECTION,
    viewport,
    hit,
    variant: r.variant,
  };
}

/** Sends an event as the reducer does: the hit is looked up on a press. The commit is applied. */
function send(r: Rig, ev: CanvasEvent): ToolStep {
  const scene = render(r.doc);
  const hit =
    ev.type === 'down' ? hitTest(r.doc, scene, viewport, ev.screen, hoverFilter('bond')) : null;
  const step = bondTool.step(r.gesture, ev, context(r, hit));
  r.gesture = step.gesture;
  if (step.preview !== undefined) r.preview = step.preview;
  if (step.commit !== undefined) {
    const h = transact(
      createHistory(r.doc, { clock: () => '2026-01-01T00:00:00.000Z' }),
      step.commit.label,
      step.commit.recipe,
    );
    r.commits.push({ label: step.commit.label, doc: current(h) });
    r.doc = current(h);
  }
  r.last = step;
  return step;
}

const at = (screen: Point, type: 'down' | 'move' | 'up', mods = NONE, button: 0 | 1 | 2 = 0) =>
  ({
    type,
    p: screenToBlu(viewport, screen, BL),
    screen,
    button,
    mods,
  }) satisfies CanvasEvent;

function click(r: Rig, screen: Point, mods = NONE): void {
  send(r, at(screen, 'down', mods));
  send(r, at(screen, 'up', mods));
}

/** Press at `from`, move to `to` (in two steps), release. Returns the preview seen before release. */
function drag(r: Rig, from: Point, to: Point, mods = NONE): Preview | null {
  send(r, at(from, 'down', mods));
  send(r, at({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, 'move', mods));
  send(r, at(to, 'move', mods));
  const seen = r.preview;
  send(r, at(to, 'up', mods));
  return seen;
}

const atomsOf = (d: Doc): AtomId[] => Object.keys(d.atoms) as AtomId[];
const pos = (d: Doc, id: AtomId): Point => ({ x: d.atoms[id]?.x ?? NaN, y: d.atoms[id]?.y ?? NaN });
const screenPos = (d: Doc, id: AtomId): Point => screenOf(pos(d, id));
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
/** Direction of a bond from its first to its second atom, degrees counter-clockwise (y up). */
const angleOf = (d: Doc, bond: BondId): number => {
  const b = d.bonds[bond];
  if (!b) return NaN;
  const [p, q] = [pos(d, b.a1), pos(d, b.a2)];
  return Math.round((Math.atan2(-(q.y - p.y), q.x - p.x) * 180) / Math.PI) || 0;
};
const lastBond = (d: Doc): BondId => Object.keys(d.bonds).at(-1) as BondId;
const CLICK = screenOf({ x: 0, y: 0 });

describe('B1 click on empty canvas', () => {
  it('draws two carbons joined by one 80 px bond, the first at the click, 30 degrees up-right', () => {
    const r = rig();
    click(r, CLICK);
    expect(r.commits).toHaveLength(1);
    expect(r.commits[0]?.label).toBe('Add bond');
    const [a, b] = atomsOf(r.doc);
    expect(dist(screenPos(r.doc, a as AtomId), CLICK)).toBeLessThan(1e-9);
    expect(dist(screenPos(r.doc, a as AtomId), screenPos(r.doc, b as AtomId))).toBeCloseTo(
      BOND_PX,
      9,
    );
    expect(angleOf(r.doc, lastBond(r.doc))).toBe(30);
    expect(Object.keys(r.doc.bonds)).toHaveLength(1);
    expect(r.gesture).toBeNull();
    expect(r.preview).toBeNull();
  });

  it('the option decides the order: double and triple', () => {
    for (const [variant, order] of [
      ['double', 2],
      ['triple', 3],
    ] as const) {
      const r = rig(undefined, variant);
      click(r, CLICK);
      expect(Object.values(r.doc.bonds)[0]?.order).toBe(order);
    }
  });

  it('a wedge starts at the first atom', () => {
    const r = rig(undefined, 'wedge');
    click(r, CLICK);
    const bond = Object.values(r.doc.bonds)[0];
    expect(bond).toMatchObject({ stereo: 'wedge', a1: atomsOf(r.doc)[0] });
  });

  it('a press that moves less than 4 px is still a click', () => {
    const r = rig();
    send(r, at(CLICK, 'down'));
    send(r, at({ x: CLICK.x + DRAG_PX - 1, y: CLICK.y }, 'move'));
    send(r, at({ x: CLICK.x + DRAG_PX - 1, y: CLICK.y }, 'up'));
    expect(r.commits).toHaveLength(1);
    expect(Object.keys(r.doc.atoms)).toHaveLength(2);
  });

  it('a right-button press does nothing', () => {
    const r = rig();
    send(r, at(CLICK, 'down', NONE, 2));
    expect(r.gesture).toBeNull();
    expect(r.commits).toHaveLength(0);
  });
});

describe('B3 click on an atom: propane, butane (P1)', () => {
  it('the zig-zag continues from the right-hand end atom, every bond 80 px', () => {
    const r = rig();
    click(r, CLICK);
    const end = atomsOf(r.doc)[1] as AtomId;
    click(r, screenPos(r.doc, end));
    expect(r.commits).toHaveLength(2);
    expect(atomsOf(r.doc)).toHaveLength(3);
    // Propane: the third carbon is down-right of the second, at the same height as the first.
    const [a, b, c] = atomsOf(r.doc) as AtomId[];
    expect(pos(r.doc, c as AtomId).x).toBeCloseTo(2 * C30, 9);
    expect(pos(r.doc, c as AtomId).y).toBeCloseTo(pos(r.doc, a as AtomId).y, 9);
    expect(angleOf(r.doc, lastBond(r.doc))).toBe(-30);
    click(r, screenPos(r.doc, c as AtomId));
    const d = atomsOf(r.doc)[3] as AtomId;
    // Butane: up-right again, never back onto A, never a straight 180 degree continuation.
    expect(pos(r.doc, d).x).toBeCloseTo(3 * C30, 9);
    expect(pos(r.doc, d).y).toBeCloseTo(pos(r.doc, b as AtomId).y, 9);
    for (const id of Object.keys(r.doc.bonds) as BondId[]) {
      const bond = r.doc.bonds[id];
      expect(
        dist(screenPos(r.doc, bond?.a1 as AtomId), screenPos(r.doc, bond?.a2 as AtomId)),
      ).toBeCloseTo(BOND_PX, 9);
    }
    // Every angle between consecutive bonds is 120 degrees.
    const ids = atomsOf(r.doc);
    for (let i = 1; i + 1 < ids.length; i++) {
      const [p, q, s] = [
        pos(r.doc, ids[i - 1] as AtomId),
        pos(r.doc, ids[i] as AtomId),
        pos(r.doc, ids[i + 1] as AtomId),
      ];
      const u = { x: p.x - q.x, y: p.y - q.y };
      const v = { x: s.x - q.x, y: s.y - q.y };
      const cos = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
      expect((Math.acos(cos) * 180) / Math.PI).toBeCloseTo(120, 6);
    }
    expect(r.commits.map((c) => c.label)).toEqual(['Add bond', 'Add bond', 'Add bond']);
  });

  it('click on a one-neighbour atom picks the more rightward/upward way per P1 (first atom: up-left)', () => {
    const r = rig();
    click(r, CLICK);
    click(r, CLICK);
    const third = atomsOf(r.doc)[2] as AtomId;
    expect(pos(r.doc, third).x).toBeCloseTo(-C30, 9);
    expect(pos(r.doc, third).y).toBeCloseTo(-0.5, 9);
  });

  it('an atom with two or more neighbours sprouts into the largest gap', () => {
    const r = rig();
    click(r, CLICK);
    click(r, screenPos(r.doc, atomsOf(r.doc)[1] as AtomId));
    const middle = atomsOf(r.doc)[1] as AtomId;
    click(r, screenPos(r.doc, middle));
    const fresh = atomsOf(r.doc)[3] as AtomId;
    expect(pos(r.doc, fresh).x).toBeCloseTo(C30, 9);
    expect(pos(r.doc, fresh).y).toBeCloseTo(-1.5, 9);
  });

  it('ring closure: a sprout that lands within 0.25 BLU of an unbonded atom joins it', () => {
    const [d1, a] = addAtom(emptyDoc('2026-01-01T00:00:00.000Z'), { element: 'C', x: 0, y: 0 });
    const [d2, b] = addAtom(d1, { element: 'C', x: C30, y: -0.5 });
    const d3 = addBond(d2, a, b)[0];
    const [d4, x] = addAtom(d3, { element: 'C', x: 2 * C30 + 0.1, y: 0 });
    const r = rig(d4);
    click(r, screenPos(r.doc, b));
    expect(atomsOf(r.doc)).toHaveLength(3);
    expect(Object.values(r.doc.bonds).some((bd) => bd.a1 === b && bd.a2 === x)).toBe(true);
  });
});

describe('B2 / B4 drag', () => {
  it('from empty canvas: the first atom at the press, the bond 80 px long, 30 degree steps', () => {
    const r = rig();
    const preview = drag(r, CLICK, { x: CLICK.x + 300, y: CLICK.y - 40 });
    expect(preview).not.toBeNull();
    expect(r.commits).toHaveLength(1);
    const [a, b] = atomsOf(r.doc) as AtomId[];
    expect(dist(screenPos(r.doc, a as AtomId), CLICK)).toBeLessThan(1e-9);
    expect(dist(screenPos(r.doc, a as AtomId), screenPos(r.doc, b as AtomId))).toBeCloseTo(
      BOND_PX,
      9,
    );
    // The pointer is at about 7.6 degrees: snaps to 0.
    expect(angleOf(r.doc, lastBond(r.doc))).toBe(0);
  });

  it('snaps to multiples of 30 degrees however far the pointer is', () => {
    for (const [dx, dy] of [
      [200, -50],
      [200, -140],
      [100, -170],
      [10, -200],
      [-160, -150],
      [-200, 100],
      [60, 90],
    ] as const) {
      const r = rig();
      drag(r, CLICK, { x: CLICK.x + dx, y: CLICK.y + dy });
      const pointer = (Math.atan2(-dy, dx) * 180) / Math.PI;
      const want = Math.round(pointer / 30) * 30;
      const got = angleOf(r.doc, lastBond(r.doc));
      expect((((got - want) % 360) + 360) % 360).toBe(0);
      const [a, b] = atomsOf(r.doc) as AtomId[];
      expect(dist(screenPos(r.doc, a as AtomId), screenPos(r.doc, b as AtomId))).toBeCloseTo(
        BOND_PX,
        9,
      );
    }
  });

  it('a pointer at 37 degrees snaps to 30; with Shift it stays 37', () => {
    const to = {
      x: CLICK.x + 300 * Math.cos((37 * Math.PI) / 180),
      y: CLICK.y - 300 * Math.sin((37 * Math.PI) / 180),
    };
    const snapped = rig();
    drag(snapped, CLICK, to);
    expect(angleOf(snapped.doc, lastBond(snapped.doc))).toBe(30);
    const free = rig();
    drag(free, CLICK, to, SHIFT);
    expect(angleOf(free.doc, lastBond(free.doc))).toBe(37);
  });

  it('from an atom (B4): the bond starts at that atom', () => {
    const r = rig();
    click(r, CLICK);
    const start = atomsOf(r.doc)[1] as AtomId;
    const from = screenPos(r.doc, start);
    drag(r, from, { x: from.x + 20, y: from.y + 200 });
    expect(atomsOf(r.doc)).toHaveLength(3);
    const bond = r.doc.bonds[lastBond(r.doc)];
    expect(bond?.a1).toBe(start);
    expect(angleOf(r.doc, lastBond(r.doc))).toBe(-90);
  });

  it('shows the ghost while dragging: only the new parts are marked, ids match the commit', () => {
    const r = rig();
    send(r, at(CLICK, 'down'));
    send(r, at({ x: CLICK.x + 100, y: CLICK.y - 60 }, 'move'));
    const preview = r.preview as Preview;
    expect(preview).not.toBeNull();
    expect(preview.hovering).toBeUndefined();
    expect([...preview.added].sort()).toEqual(['atom:a1', 'atom:a2', 'bond:b3']);
    expect(Object.keys(preview.doc.atoms)).toEqual(['a1', 'a2']);
    // The committed document has the very same ids.
    send(r, at({ x: CLICK.x + 100, y: CLICK.y - 60 }, 'up'));
    expect(Object.keys(r.doc.atoms)).toEqual(['a1', 'a2']);
    expect(Object.keys(r.doc.bonds)).toEqual(['b3']);
    expect(r.doc).toEqual(preview.doc);
    expect(r.preview).toBeNull();
  });

  it('nothing changes in the document while dragging (no commit before release)', () => {
    const r = rig();
    send(r, at(CLICK, 'down'));
    send(r, at({ x: CLICK.x + 100, y: CLICK.y - 60 }, 'move'));
    expect(r.commits).toHaveLength(0);
    expect(Object.keys(r.doc.atoms)).toHaveLength(0);
  });

  it('released over an existing atom, it joins it (ring closure) instead of adding an atom', () => {
    const r = rig();
    click(r, CLICK);
    const [a, b] = atomsOf(r.doc) as AtomId[];
    click(r, screenPos(r.doc, b as AtomId));
    const c = atomsOf(r.doc)[2] as AtomId;
    // Drag from c to a (they are 2 x cos30 apart: not bonded).
    const preview = drag(r, screenPos(r.doc, c), screenPos(r.doc, a as AtomId));
    expect(preview?.mergeTarget).toBe(a);
    expect(atomsOf(r.doc)).toHaveLength(3);
    expect(Object.values(r.doc.bonds).some((bd) => bd.a1 === c && bd.a2 === a)).toBe(true);
    expect(r.commits.at(-1)?.label).toBe('Add bond');
  });

  it('released over an atom it is already bonded to commits nothing', () => {
    const r = rig();
    click(r, CLICK);
    const [a, b] = atomsOf(r.doc) as AtomId[];
    const before = r.doc;
    drag(r, screenPos(r.doc, a as AtomId), screenPos(r.doc, b as AtomId));
    expect(r.commits).toHaveLength(1);
    expect(r.doc).toBe(before);
    expect(r.preview).toBeNull();
    expect(r.gesture).toBeNull();
  });

  it('Esc (cancel) leaves nothing behind', () => {
    const r = rig();
    send(r, at(CLICK, 'down'));
    send(r, at({ x: CLICK.x + 100, y: CLICK.y - 60 }, 'move'));
    expect(r.preview).not.toBeNull();
    send(r, { type: 'cancel' });
    expect(r.gesture).toBeNull();
    expect(r.preview).toBeNull();
    expect(r.commits).toHaveLength(0);
    expect(Object.keys(r.doc.atoms)).toHaveLength(0);
  });
});

describe('B5 click on a bond', () => {
  function oneBond(variant: string): { r: Rig; mid: Point; a: AtomId; b: AtomId } {
    const [d1, a] = addAtom(emptyDoc('2026-01-01T00:00:00.000Z'), { element: 'C', x: 0, y: 0 });
    const [d2, b] = addAtom(d1, { element: 'C', x: C30, y: -0.5 });
    const r = rig(addBond(d2, a, b)[0], variant);
    return { r, mid: screenOf({ x: C30 / 2, y: -0.25 }), a, b };
  }

  it('single: 1 -> 2 -> 3 -> 1, each click one "Change bond" commit', () => {
    const { r, mid } = oneBond('single');
    const orders: number[] = [];
    for (let i = 0; i < 3; i++) {
      click(r, mid);
      orders.push(Object.values(r.doc.bonds)[0]?.order ?? 0);
    }
    expect(orders).toEqual([2, 3, 1]);
    expect(r.commits.map((c) => c.label)).toEqual(['Change bond', 'Change bond', 'Change bond']);
    expect(Object.keys(r.doc.atoms)).toHaveLength(2);
  });

  it('a press on a bond never drags: a drag from a bond makes no atom', () => {
    const { r, mid } = oneBond('single');
    send(r, at(mid, 'down'));
    send(r, at({ x: mid.x + 100, y: mid.y + 100 }, 'move'));
    expect(r.preview).toBeNull();
    send(r, at({ x: mid.x + 100, y: mid.y + 100 }, 'up'));
    expect(r.commits).toHaveLength(0);
    expect(Object.keys(r.doc.atoms)).toHaveLength(2);
  });

  it('double sets 2 then cycles the placement; triple sets 3', () => {
    const d = oneBond('double');
    click(d.r, d.mid);
    expect(Object.values(d.r.doc.bonds)[0]?.order).toBe(2);
    click(d.r, d.mid);
    expect(Object.values(d.r.doc.bonds)[0]?.doublePlacement).toBe('left');
    const t = oneBond('triple');
    click(t.r, t.mid);
    expect(Object.values(t.r.doc.bonds)[0]?.order).toBe(3);
  });

  it('wedge: narrow end at the atom nearer the click; a second click reverses it', () => {
    const { r, a, b } = oneBond('wedge');
    const nearB = screenOf({ x: C30 * 0.8, y: -0.4 });
    click(r, nearB);
    expect(Object.values(r.doc.bonds)[0]).toMatchObject({ stereo: 'wedge', a1: b, a2: a });
    click(r, nearB);
    expect(Object.values(r.doc.bonds)[0]).toMatchObject({ stereo: 'wedge', a1: a, a2: b });
  });

  it('a second wedge click re-anchors a curved arrow: t 0.3 becomes 0.7 on the new bond', () => {
    const { r, a, b } = oneBond('wedge');
    const bond = Object.keys(r.doc.bonds)[0] as BondId;
    const [d, arrow] = addObject(r.doc, {
      type: 'curved-arrow',
      head: 'full',
      from: { kind: 'bond', bond, t: 0.3 },
      to: { kind: 'atom', atom: a },
      bend: 0.4,
    });
    r.doc = d;
    const nearA = screenOf({ x: C30 * 0.2, y: -0.1 });
    click(r, nearA);
    expect(Object.values(r.doc.bonds)[0]).toMatchObject({ a1: a, a2: b, stereo: 'wedge' });
    const first = Object.keys(r.doc.bonds)[0] as BondId;
    click(r, nearA);
    const obj = r.doc.objects[arrow] as unknown as { from: { bond: BondId; t: number } };
    expect(Object.keys(r.doc.bonds)[0]).not.toBe(first);
    expect(obj.from.bond).toBe(Object.keys(r.doc.bonds)[0]);
    expect(obj.from.t).toBeCloseTo(0.7, 9);
  });
});

describe('B6 hover ghost', () => {
  const move = (screen: Point) => at(screen, 'move') as Extract<CanvasEvent, { type: 'move' }>;

  it('over empty canvas: the ghost of the two-atom bond a click would add', () => {
    const r = rig();
    const ghost = bondTool.hover?.(move(CLICK), context(r, null)) as Preview;
    expect(ghost.hovering).toBe(true);
    expect([...ghost.added].sort()).toEqual(['atom:a1', 'atom:a2', 'bond:b3']);
    expect(Object.keys(ghost.doc.atoms)).toHaveLength(2);
    // And it is exactly what the click commits.
    click(r, CLICK);
    expect(r.doc).toEqual(ghost.doc);
  });

  it('over an atom: the ghost of the sprouted bond, ids equal to the commit', () => {
    const r = rig();
    click(r, CLICK);
    const end = atomsOf(r.doc)[1] as AtomId;
    const ghost = bondTool.hover?.(
      move(screenPos(r.doc, end)),
      context(r, { kind: 'atom', id: end }),
    ) as Preview;
    expect([...ghost.added].sort()).toEqual(['atom:a4', 'bond:b5']);
    click(r, screenPos(r.doc, end));
    expect(r.doc).toEqual(ghost.doc);
  });

  it('over a ring-closing atom the ghost marks it as the merge target', () => {
    const [d1, a] = addAtom(emptyDoc('2026-01-01T00:00:00.000Z'), { element: 'C', x: 0, y: 0 });
    const [d2, b] = addAtom(d1, { element: 'C', x: C30, y: -0.5 });
    const d3 = addBond(d2, a, b)[0];
    const [d4, x] = addAtom(d3, { element: 'C', x: 2 * C30 + 0.1, y: 0 });
    const r = rig(d4);
    const ghost = bondTool.hover?.(move(screenPos(d4, b)), context(r, { kind: 'atom', id: b }));
    expect(ghost?.mergeTarget).toBe(x);
  });

  it('over a bond: no ghost', () => {
    const [d1, a] = addAtom(emptyDoc('2026-01-01T00:00:00.000Z'), { element: 'C', x: 0, y: 0 });
    const [d2, b] = addAtom(d1, { element: 'C', x: 1, y: 0 });
    const d3 = addBond(d2, a, b)[0];
    const r = rig(d3);
    const hit = { kind: 'bond', id: Object.keys(d3.bonds)[0] as BondId } as const;
    expect(bondTool.hover?.(move(screenOf({ x: 0.5, y: 0 })), context(r, hit))).toBeNull();
  });
});

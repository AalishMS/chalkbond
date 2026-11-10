import { perceive } from '@core/chem-core';
import { fragments, type AtomId, type BondId, type Doc, type Selection } from '@core/doc-model';
import { render } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import type { CanvasEvent } from '../model/canvas-event';
import type { Point } from '../model/geometry';
import { hitTest } from '../model/hit-test';
import { bluToScreen, screenToBlu, type Viewport } from '../model/viewport';
import { EMPTY_SELECTION, type GestureState } from '../state/editor-state';
import { drawn, wholeOf } from '../state/testing';
import { DRAG_PX, type ToolContext, type ToolStep } from './tool';
import { selectTool } from './select';

const BL = 40;
const viewport: Viewport = { zoom: 1.5, pan: { x: 400, y: 300 }, size: { w: 1200, h: 700 } };
const NONE = { shift: false, alt: false, ctrl: false };

/** A benzene ring at the origin and ethanol 6 BLU to its right. */
const doc = (): Doc => drawn({ name: 'benzene', x: 0, y: 0 }, { name: 'ethanol', x: 6, y: 0 });

const screenOf = (p: Point): Point => bluToScreen(viewport, p, BL);

interface Rig {
  doc: Doc;
  selection: Selection;
  gesture: GestureState | null;
  last: ToolStep | null;
}

function rig(d: Doc = doc(), selection: Selection = EMPTY_SELECTION): Rig {
  return { doc: d, selection, gesture: null, last: null };
}

function send(r: Rig, ev: CanvasEvent): ToolStep {
  const scene = render(r.doc);
  const hit = ev.type === 'down' ? hitTest(r.doc, scene, viewport, ev.screen) : null;
  const ctx: ToolContext = {
    doc: r.doc,
    scene,
    perception: perceive(r.doc),
    selection: r.selection,
    viewport,
    hit,
  };
  const step = selectTool.step(r.gesture, ev, ctx);
  r.gesture = step.gesture;
  if (step.selection !== undefined) r.selection = step.selection;
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

/** Press and release at `screen` with no movement. */
function click(r: Rig, screen: Point, mods = NONE): void {
  send(r, at(screen, 'down', mods));
  send(r, at(screen, 'up', mods));
}

const ringAtoms = (d: Doc): AtomId[] => fragments(d).find((f) => f.length === 6) as AtomId[];
const ethanolAtoms = (d: Doc): AtomId[] => fragments(d).find((f) => f.length === 3) as AtomId[];
const atomScreen = (d: Doc, id: AtomId): Point => screenOf(d.atoms[id] as Point);

describe('S1 clicks', () => {
  it('click an atom: the whole fragment is selected', () => {
    const r = rig();
    click(r, atomScreen(r.doc, ringAtoms(r.doc)[0] as AtomId));
    expect(r.selection.atoms.size).toBe(6);
    expect(r.selection.bonds.size).toBe(6);
    expect(r.gesture).toBeNull();
  });

  it('second click on the same atom: just that atom; third click: the fragment again', () => {
    const r = rig();
    const a = ringAtoms(r.doc)[0] as AtomId;
    click(r, atomScreen(r.doc, a));
    click(r, atomScreen(r.doc, a));
    expect([...r.selection.atoms]).toEqual([a]);
    expect(r.selection.bonds.size).toBe(0);
    click(r, atomScreen(r.doc, a));
    expect(r.selection.atoms.size).toBe(6);
  });

  it('second click on a bond: just that bond', () => {
    const r = rig();
    const atoms = ringAtoms(r.doc);
    click(r, atomScreen(r.doc, atoms[0] as AtomId));
    const bond = Object.values(r.doc.bonds).find((b) => atoms.includes(b.a1)) as {
      id: BondId;
      a1: AtomId;
      a2: AtomId;
    };
    const a = atomScreen(r.doc, bond.a1);
    const b = atomScreen(r.doc, bond.a2);
    click(r, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    expect([...r.selection.bonds]).toEqual([bond.id]);
    expect(r.selection.atoms.size).toBe(0);
  });

  it('Alt+click selects one atom directly', () => {
    const r = rig();
    const a = ringAtoms(r.doc)[3] as AtomId;
    click(r, atomScreen(r.doc, a), { shift: false, alt: true, ctrl: false });
    expect([...r.selection.atoms]).toEqual([a]);
    expect(r.selection.bonds.size).toBe(0);
  });

  it('Shift+click adds a second fragment, and again removes it', () => {
    const r = rig();
    const shift = { shift: true, alt: false, ctrl: false };
    click(r, atomScreen(r.doc, ringAtoms(r.doc)[0] as AtomId));
    const eth = atomScreen(r.doc, ethanolAtoms(r.doc)[0] as AtomId);
    click(r, eth, shift);
    expect(r.selection.atoms.size).toBe(9);
    click(r, eth, shift);
    expect(r.selection.atoms.size).toBe(6);
  });

  it('a click on empty canvas clears the selection', () => {
    const r = rig();
    click(r, atomScreen(r.doc, ringAtoms(r.doc)[0] as AtomId));
    click(r, { x: 40, y: 650 });
    expect(r.selection).toBe(EMPTY_SELECTION);
  });

  it('R24: Shift+click on empty canvas keeps the selection', () => {
    const r = rig();
    click(r, atomScreen(r.doc, ringAtoms(r.doc)[0] as AtomId));
    const before = r.selection;
    click(r, { x: 40, y: 650 }, { shift: true, alt: false, ctrl: false });
    expect(r.selection).toBe(before);
  });

  it('R24: Shift+drag from empty canvas adds the marquee result to the selection', () => {
    const r = rig();
    click(r, atomScreen(r.doc, ringAtoms(r.doc)[0] as AtomId));
    const shift = { shift: true, alt: false, ctrl: false };
    const eth = ethanolAtoms(r.doc).map((id) => r.doc.atoms[id] as Point);
    const left = Math.min(...eth.map((p) => p.x));
    const right = Math.max(...eth.map((p) => p.x));
    send(r, at(screenOf({ x: left - 1, y: -3 }), 'down', shift));
    send(r, at(screenOf({ x: right + 1, y: 3 }), 'move', shift));
    const up = send(r, at(screenOf({ x: right + 1, y: 3 }), 'up', shift));
    expect(up.selection?.atoms.size).toBe(9);
    expect(up.selection?.bonds.size).toBe(8);
  });

  it('a press that moves within 4 px is still a click', () => {
    const r = rig();
    const s = atomScreen(r.doc, ringAtoms(r.doc)[0] as AtomId);
    send(r, at(s, 'down'));
    send(r, at({ x: s.x + DRAG_PX - 1, y: s.y }, 'move'));
    expect(r.gesture).not.toBeNull();
    send(r, at({ x: s.x + DRAG_PX - 1, y: s.y }, 'up'));
    expect(r.selection.atoms.size).toBe(6);
    expect(r.gesture).toBeNull();
  });

  it('a press changes nothing until it is released, and never commits', () => {
    const r = rig();
    const step = send(r, at(atomScreen(r.doc, ringAtoms(r.doc)[0] as AtomId), 'down'));
    expect(step.selection).toBeUndefined();
    expect(step.commit).toBeUndefined();
    expect(r.gesture).not.toBeNull();
  });

  it('only the primary button presses; a right button press does nothing', () => {
    const r = rig();
    const s = atomScreen(r.doc, ringAtoms(r.doc)[0] as AtomId);
    send(r, at(s, 'down', NONE, 2));
    expect(r.gesture).toBeNull();
    expect(r.selection).toBe(EMPTY_SELECTION);
  });

  it('cancel returns to idle and keeps the selection', () => {
    const r = rig();
    const s = atomScreen(r.doc, ringAtoms(r.doc)[0] as AtomId);
    send(r, at(s, 'down'));
    const step = send(r, { type: 'cancel' });
    expect(step.gesture).toBeNull();
    expect(step.selection).toBeUndefined();
  });

  it('events with no gesture running do nothing', () => {
    const r = rig();
    const step = send(r, at({ x: 100, y: 100 }, 'move'));
    expect(step).toEqual({ gesture: null });
    expect(send(r, at({ x: 100, y: 100 }, 'up'))).toEqual({ gesture: null });
    expect(send(r, { type: 'leave' })).toEqual({ gesture: null });
  });
});

describe('H4 marquee', () => {
  const ringTopLeft = (): Point => ({ x: -1.5, y: -2 });

  it('a drag from empty canvas draws a marquee gesture with its corners', () => {
    const r = rig();
    const start = screenOf(ringTopLeft());
    send(r, at(start, 'down'));
    send(r, at({ x: start.x + 30, y: start.y + 20 }, 'move'));
    expect(r.gesture?.kind).toBe('select-marquee');
    const marquee = r.gesture?.overlay?.marquee;
    expect(marquee?.from.x).toBeCloseTo(ringTopLeft().x, 9);
    expect(marquee?.to.x).toBeCloseTo(screenToBlu(viewport, { x: start.x + 30, y: 0 }, BL).x, 9);
  });

  it('on release it selects the atoms inside, bonds with both atoms inside', () => {
    const r = rig();
    send(r, at(screenOf({ x: -2, y: -2 }), 'down'));
    send(r, at(screenOf({ x: 2, y: 2 }), 'move'));
    const up = send(r, at(screenOf({ x: 2, y: 2 }), 'up'));
    expect(up.selection?.atoms.size).toBe(6);
    expect(up.selection?.bonds.size).toBe(6);
    expect(r.gesture).toBeNull();
  });

  it('a marquee over half of ethanol selects only what is entirely inside', () => {
    const r = rig();
    const eth = ethanolAtoms(r.doc).map((id) => r.doc.atoms[id] as Point);
    const left = Math.min(...eth.map((p) => p.x));
    const right = Math.max(...eth.map((p) => p.x));
    const mid = (left + right) / 2 + 0.01;
    send(r, at(screenOf({ x: left - 1, y: -3 }), 'down'));
    send(r, at(screenOf({ x: mid, y: 3 }), 'move'));
    const up = send(r, at(screenOf({ x: mid, y: 3 }), 'up'));
    expect(up.selection?.atoms.size).toBe(2);
    expect(up.selection?.bonds.size).toBe(1);
  });

  it('a marquee over nothing clears the selection', () => {
    const r = rig(doc(), wholeOf(doc(), ringAtoms(doc())));
    send(r, at({ x: 100, y: 600 }, 'down'));
    send(r, at({ x: 160, y: 660 }, 'move'));
    send(r, at({ x: 160, y: 660 }, 'up'));
    expect(r.selection.atoms.size + r.selection.bonds.size).toBe(0);
  });

  it('Shift+drag adds to the selection', () => {
    const d = doc();
    const r = rig(d, wholeOf(d, ringAtoms(d)));
    const shift = { shift: true, alt: false, ctrl: false };
    const eth = ethanolAtoms(d).map((id) => d.atoms[id] as Point);
    const minX = Math.min(...eth.map((p) => p.x)) - 1;
    const maxX = Math.max(...eth.map((p) => p.x)) + 1;
    send(r, at(screenOf({ x: minX, y: -3 }), 'down', shift));
    send(r, at(screenOf({ x: maxX, y: 3 }), 'move', shift));
    const up = send(r, at(screenOf({ x: maxX, y: 3 }), 'up', shift));
    expect(up.selection?.atoms.size).toBe(9);
  });

  it('cancel drops the marquee and keeps the old selection', () => {
    const d = doc();
    const r = rig(d, wholeOf(d, ringAtoms(d)));
    send(r, at({ x: 100, y: 600 }, 'down'));
    send(r, at({ x: 160, y: 660 }, 'move'));
    send(r, { type: 'cancel' });
    expect(r.gesture).toBeNull();
    expect(r.selection.atoms.size).toBe(6);
  });
});

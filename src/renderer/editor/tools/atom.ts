// The Atom tool (SPEC-editor.md A1-A3): an element option sets the element of the atom clicked, adds
// a lone atom on empty canvas, or bonds a new atom of that element when dragged from an atom; a
// mark option adds a charge, lone pair, radical or partial charge to the atom clicked.
import type { AtomId, Doc, ElementSymbol } from '@core/doc-model';
import { addLoneAtom, applyMark, atomMode, dragAtom, setElement } from '../model/atom-ops';
import type { CanvasEvent } from '../model/canvas-event';
import { distance, type Point } from '../model/geometry';
import { mergeTarget } from '../model/hit-test';
import type { GestureState, Hit } from '../state/editor-state';
import { commitOf, ghostOf } from './ghost';
import { DRAG_PX, type Tool, type ToolContext, type ToolStep } from './tool';

/** The pointer is down; a release within 4 px is the click. */
interface Press extends GestureState {
  readonly kind: 'atom-press';
  readonly screen: Point;
  readonly p: Point;
  /** The atom under the pointer, or null on empty canvas or a bond. */
  readonly atom: AtomId | null;
  /** True when a bond (not empty canvas) was under it: a click there does nothing. */
  readonly onBond: boolean;
}

/** An element drag from an atom (A1). */
interface Drag extends GestureState {
  readonly kind: 'atom-drag';
  readonly from: AtomId;
}

type PointerEv = Extract<CanvasEvent, { type: 'down' | 'move' | 'up' }>;

const IDLE: ToolStep = { gesture: null };
const MARK_NOTICE = 'Click an atom to add this.';

const asPress = (g: GestureState | null): Press | null =>
  g !== null && g.kind === 'atom-press' ? (g as Press) : null;
const asDrag = (g: GestureState | null): Drag | null =>
  g !== null && g.kind === 'atom-drag' ? (g as Drag) : null;

/** The element of the option, or null when the option is a mark. */
function elementOf(variant: string): ElementSymbol | null {
  const mode = atomMode(variant);
  return mode.kind === 'element' ? mode.element : null;
}

function down(ev: PointerEv, ctx: ToolContext): ToolStep {
  if (ev.button !== 0) return IDLE;
  const hit: Hit | null = ctx.hit;
  const press: Press = {
    kind: 'atom-press',
    screen: ev.screen,
    p: ev.p,
    atom: hit?.kind === 'atom' ? (hit.id as AtomId) : null,
    onBond: hit?.kind === 'bond',
  };
  return { gesture: press, preview: null };
}

/** The drag of element `element` from `from` to the pointer at `ev` (A1, B4 geometry). */
function dragEdit(from: AtomId, element: ElementSymbol, ev: PointerEv, ctx: ToolContext) {
  const target = mergeTarget(ctx.doc, ctx.viewport, ev.screen, new Set([from]));
  return dragAtom(ctx.doc, from, ev.p, ev.mods.shift, target, element);
}

function move(g: Press | Drag, ev: PointerEv, ctx: ToolContext): ToolStep {
  const press = asPress(g);
  const element = elementOf(ctx.variant);
  if (press === null) {
    const drag = g as Drag;
    const edit = element === null ? null : dragEdit(drag.from, element, ev, ctx);
    return { gesture: drag, preview: ghostOf(ctx.doc, edit, false) };
  }
  if (distance(ev.screen, press.screen) <= DRAG_PX) return { gesture: press };
  // Only an element option dragged from an atom does anything; the rest wait for the release.
  if (press.atom === null || element === null) return { gesture: press };
  const drag: Drag = { kind: 'atom-drag', from: press.atom };
  return {
    gesture: drag,
    preview: ghostOf(ctx.doc, dragEdit(press.atom, element, ev, ctx), false),
  };
}

/** A click: A1 with an element option, A3 with a mark option. */
function click(g: Press, ev: PointerEv, ctx: ToolContext): ToolStep {
  const done: ToolStep = { gesture: null, preview: null };
  if (g.onBond) return done;
  const mode = atomMode(ctx.variant);
  const atom = g.atom;
  if (mode.kind === 'mark') {
    if (atom === null) return { ...done, notice: { kind: 'info', text: MARK_NOTICE } };
    const { mark } = mode;
    const reverse = ev.mods.shift;
    if (applyMark(ctx.doc, atom, mark, reverse) === null) return done;
    return {
      ...done,
      commit: commitOf('Change atom', (doc) => applyMark(doc, atom, mark, reverse)),
    };
  }
  const { element } = mode;
  if (atom !== null) {
    if (setElement(ctx.doc, atom, element) === null) return done;
    return { ...done, commit: commitOf('Change atom', (doc) => setElement(doc, atom, element)) };
  }
  const at = g.p;
  return {
    ...done,
    commit: commitOf('Add atom', (doc: Doc) => addLoneAtom(doc, at, element)),
  };
}

function up(g: Press | Drag, ev: PointerEv, ctx: ToolContext): ToolStep {
  const press = asPress(g);
  if (press !== null) {
    return distance(ev.screen, press.screen) > DRAG_PX
      ? { gesture: null, preview: null }
      : click(press, ev, ctx);
  }
  const { from } = g as Drag;
  const element = elementOf(ctx.variant);
  if (element === null || dragEdit(from, element, ev, ctx) === null) {
    return { gesture: null, preview: null };
  }
  const exclude = new Set([from]);
  return {
    gesture: null,
    preview: null,
    commit: commitOf('Add bond', (doc) => {
      const target = mergeTarget(doc, ctx.viewport, ev.screen, exclude);
      return dragAtom(doc, from, ev.p, ev.mods.shift, target, element)?.doc ?? null;
    }),
  };
}

export const atomTool: Tool = {
  id: 'atom',
  step(gesture, ev, ctx) {
    if (ev.type === 'cancel') return { gesture: null, preview: null };
    if (ev.type === 'down') return down(ev, ctx);
    const g = asPress(gesture) ?? asDrag(gesture);
    if (g === null) return IDLE;
    if (ev.type === 'move') return move(g, ev, ctx);
    if (ev.type === 'up') return up(g, ev, ctx);
    return { gesture: g };
  },
};

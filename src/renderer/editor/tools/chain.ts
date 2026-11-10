// The Chain tool (SPEC-editor.md P2, P6): drag to grow a zig-zag of carbons, one bond for every
// cos 30 BLU of travel, shown as a ghost with a count label at the pointer. A click is one bond.
import type { AtomId } from '@core/doc-model';
import { newBond, sprout, bondSpec, type BondStart } from '../model/bond-ops';
import type { CanvasEvent } from '../model/canvas-event';
import { chainEdit } from '../model/chain-ops';
import { distance, type Point } from '../model/geometry';
import type { GestureState, Hit } from '../state/editor-state';
import { commitOf, ghostOf } from './ghost';
import { DRAG_PX, type Tool, type ToolContext, type ToolStep } from './tool';

/** The pointer is down and has not moved past the drag threshold. */
interface Press extends GestureState {
  readonly kind: 'chain-press';
  readonly screen: Point;
  readonly p: Point;
  /** The atom under the pointer, or null on empty canvas. */
  readonly atom: AtomId | null;
}

/** A drag from an atom or empty canvas. */
interface Drag extends GestureState {
  readonly kind: 'chain-drag';
  readonly start: BondStart;
}

type PointerEv = Extract<CanvasEvent, { type: 'down' | 'move' | 'up' }>;

const IDLE: ToolStep = { gesture: null };
const LABEL = 'Add chain';
/** The count label sits this many px below and right of the pointer. */
const COUNT_OFFSET = 12;
const SINGLE = bondSpec('single');

const asPress = (g: GestureState | null): Press | null =>
  g !== null && g.kind === 'chain-press' ? (g as Press) : null;
const asDrag = (g: GestureState | null): Drag | null =>
  g !== null && g.kind === 'chain-drag' ? (g as Drag) : null;

/** The drag gesture and its ghost for a pointer at `ev`; the label follows the pointer. */
function dragStep(start: BondStart, ev: PointerEv, ctx: ToolContext): ToolStep {
  const edit = chainEdit(ctx.doc, start, ev.p, ev.mods.shift);
  const overlay =
    edit === null
      ? undefined
      : {
          count: {
            at: { x: ev.screen.x + COUNT_OFFSET, y: ev.screen.y + COUNT_OFFSET },
            n: edit.count,
          },
        };
  const drag: Drag = { kind: 'chain-drag', start, ...(overlay === undefined ? {} : { overlay }) };
  return { gesture: drag, preview: ghostOf(ctx.doc, edit, false) };
}

function down(ev: PointerEv, ctx: ToolContext): ToolStep {
  if (ev.button !== 0) return IDLE;
  const hit: Hit | null = ctx.hit;
  // A press on a bond starts nothing: a chain needs an atom or empty canvas to grow from.
  if (hit?.kind === 'bond') return IDLE;
  const atom = hit?.kind === 'atom' ? (hit.id as AtomId) : null;
  const press: Press = { kind: 'chain-press', screen: ev.screen, p: ev.p, atom };
  return { gesture: press, preview: null };
}

function move(g: Press | Drag, ev: PointerEv, ctx: ToolContext): ToolStep {
  const press = asPress(g);
  if (press === null) return dragStep((g as Drag).start, ev, ctx);
  if (distance(ev.screen, press.screen) <= DRAG_PX) return { gesture: press };
  const start: BondStart = press.atom !== null ? { atom: press.atom } : { point: press.p };
  return dragStep(start, ev, ctx);
}

/** A click: one bond, as B1 on empty canvas or B3 on an atom. */
function click(g: Press, ctx: ToolContext): ToolStep {
  const atom = g.atom;
  const at = g.p;
  const edit = (doc: typeof ctx.doc) =>
    (atom === null ? newBond(doc, at, SINGLE) : sprout(doc, atom, SINGLE))?.doc ?? null;
  if (edit(ctx.doc) === null) return { gesture: null, preview: null };
  return { gesture: null, preview: null, commit: commitOf(LABEL, edit) };
}

function up(g: Press | Drag, ev: PointerEv, ctx: ToolContext): ToolStep {
  const press = asPress(g);
  if (press !== null) {
    return distance(ev.screen, press.screen) > DRAG_PX
      ? { gesture: null, preview: null }
      : click(press, ctx);
  }
  const { start } = g as Drag;
  if (chainEdit(ctx.doc, start, ev.p, ev.mods.shift) === null) {
    return { gesture: null, preview: null };
  }
  const { p } = ev;
  const free = ev.mods.shift;
  return {
    gesture: null,
    preview: null,
    commit: commitOf(LABEL, (doc) => chainEdit(doc, start, p, free)?.doc ?? null),
  };
}

export const chainTool: Tool = {
  id: 'chain',
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

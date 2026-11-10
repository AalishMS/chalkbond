// The Select tool (SPEC-editor.md S1-S4, H4): a state machine over canvas events. Idle -> press ->
// click (selection by S1) or marquee (H4).
import type { Selection } from '@core/doc-model';
import type { CanvasEvent } from '../model/canvas-event';
import { distance, type Point } from '../model/geometry';
import { marqueeSelection } from '../model/hit-test';
import { clickSelection, unionSelection } from '../model/selection';
import {
  EMPTY_SELECTION,
  type GestureOverlay,
  type GestureState,
  type Hit,
} from '../state/editor-state';
import { DRAG_PX, type Tool, type ToolContext, type ToolStep } from './tool';

interface Mods {
  readonly shift: boolean;
  readonly alt: boolean;
}

/** Pointer is down and has not moved past the drag threshold. */
interface Press extends GestureState {
  readonly kind: 'select-press';
  /** Canvas px and BLU of the press. */
  readonly screen: Point;
  readonly p: Point;
  /** What was under the pointer; null on empty canvas. */
  readonly hit: Hit | null;
  readonly mods: Mods;
}

/** A rubber band from an empty-canvas press. */
interface Marquee extends GestureState {
  readonly kind: 'select-marquee';
  readonly overlay: GestureOverlay;
  /** Held when Shift was down at the press: the marquee adds to it. */
  readonly base: Selection;
}

type SelectGesture = Press | Marquee;

function asSelect(g: GestureState | null): SelectGesture | null {
  return g !== null && (g.kind === 'select-press' || g.kind === 'select-marquee')
    ? (g as SelectGesture)
    : null;
}

/** A pointer event: down, move or up. */
type PointerEv = Extract<CanvasEvent, { type: 'down' | 'move' | 'up' }>;

const IDLE: ToolStep = { gesture: null };

function down(ev: PointerEv, ctx: ToolContext): ToolStep {
  // Only the primary button presses. Handles and slots arrive with E17 and the Text tool.
  if (ev.button !== 0) return IDLE;
  if (ctx.hit?.kind === 'handle' || ctx.hit?.kind === 'slot') return IDLE;
  const press: Press = {
    kind: 'select-press',
    screen: ev.screen,
    p: ev.p,
    hit: ctx.hit,
    mods: { shift: ev.mods.shift, alt: ev.mods.alt },
  };
  return { gesture: press };
}

function move(g: SelectGesture, ev: PointerEv, ctx: ToolContext): ToolStep {
  if (g.kind === 'select-marquee') {
    const marquee = g.overlay.marquee;
    if (marquee === undefined) return { gesture: g };
    return { gesture: { ...g, overlay: { marquee: { from: marquee.from, to: ev.p } } } };
  }
  if (distance(g.screen, ev.screen) <= DRAG_PX) return { gesture: g };
  if (g.hit === null) {
    const base = g.mods.shift ? ctx.selection : EMPTY_SELECTION;
    const marquee: Marquee = {
      kind: 'select-marquee',
      overlay: { marquee: { from: g.p, to: ev.p } },
      base,
    };
    return { gesture: marquee };
  }
  // A drag from an item applies S1 first, then moves it (E16 adds the move).
  return { gesture: null, selection: clickSelection(ctx.doc, ctx.selection, g.hit, g.mods) };
}

function up(g: SelectGesture, ev: PointerEv, ctx: ToolContext): ToolStep {
  if (g.kind === 'select-press') {
    return { gesture: null, selection: clickSelection(ctx.doc, ctx.selection, g.hit, g.mods) };
  }
  const marquee = g.overlay.marquee;
  const found =
    marquee === undefined
      ? EMPTY_SELECTION
      : marqueeSelection(ctx.doc, ctx.scene, {
          x: Math.min(marquee.from.x, ev.p.x),
          y: Math.min(marquee.from.y, ev.p.y),
          w: Math.abs(ev.p.x - marquee.from.x),
          h: Math.abs(ev.p.y - marquee.from.y),
        });
  return { gesture: null, selection: unionSelection(g.base, found) };
}

export const selectTool: Tool = {
  id: 'select',
  step(gesture, ev, ctx) {
    if (ev.type === 'cancel') return { gesture: null, preview: null };
    if (ev.type === 'down') return down(ev, ctx);
    const g = asSelect(gesture);
    if (g === null) return IDLE;
    if (ev.type === 'move') return move(g, ev, ctx);
    if (ev.type === 'up') return up(g, ev, ctx);
    return { gesture: g };
  },
};

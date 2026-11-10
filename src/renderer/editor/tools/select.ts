// The Select tool (SPEC-editor.md S1-S4, H4): a state machine over canvas events. Idle -> press ->
// click (selection by S1), marquee (H4) or move (S2-S4). A move previews without touching history
// and commits once on release.
import {
  mergeAtoms,
  transformItems,
  translation,
  type AtomId,
  type Selection,
} from '@core/doc-model';
import type { CanvasEvent } from '../model/canvas-event';
import { distance, type Point, type Rect } from '../model/geometry';
import { marqueeSelection, mergeTarget } from '../model/hit-test';
import { itemBoxes, movedInk, movePlan, type MovePlan } from '../model/move';
import {
  clickSelection,
  isEmptySelection,
  selectionHolds,
  unionSelection,
} from '../model/selection';
import { snapMove } from '../model/snap';
import { bluToScreen, PX_PER_PT } from '../model/viewport';
import {
  EMPTY_SELECTION,
  type GestureOverlay,
  type GestureState,
  type Hit,
  type Preview,
} from '../state/editor-state';
import { isHandleGesture, startHandle, stepHandle, type HandleGesture } from './select-handles';
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

/** A drag of the selection (S2, S3). */
interface Move extends GestureState {
  readonly kind: 'select-move';
  readonly overlay: GestureOverlay;
  /** BLU position of the press. */
  readonly start: Point;
  /** What moves: the selection after S2. */
  readonly moving: Selection;
  readonly plan: MovePlan;
  /** Ink box of what moves, and of every other fragment and object (pt), for snapping. */
  readonly ink: Rect | null;
  readonly others: readonly Rect[];
  /** The one atom being moved (S4), when the moving set is exactly one atom. */
  readonly single: AtomId | null;
  /** Translation so far, BLU, after the Shift constraint and snapping. */
  readonly delta: Point;
  /** S4: the atom the single atom would join. */
  readonly target: AtomId | null;
}

type SelectGesture = Press | Marquee | Move | HandleGesture;

function asSelect(g: GestureState | null): SelectGesture | null {
  return g !== null &&
    (g.kind === 'select-press' ||
      g.kind === 'select-marquee' ||
      g.kind === 'select-move' ||
      isHandleGesture(g))
    ? (g as SelectGesture)
    : null;
}

/** A pointer event: down, move or up. */
type PointerEv = Extract<CanvasEvent, { type: 'down' | 'move' | 'up' }>;

const IDLE: ToolStep = { gesture: null };

function down(ev: PointerEv, ctx: ToolContext): ToolStep {
  // Only the primary button presses. A handle starts its own gesture (S5, S6); slots belong to
  // the Text tool.
  if (ev.button !== 0) return IDLE;
  if (ctx.hit?.kind === 'handle') {
    const started = startHandle(ctx.hit, ev, ctx);
    return started === null ? IDLE : { gesture: started };
  }
  if (ctx.hit?.kind === 'slot') return IDLE;
  const press: Press = {
    kind: 'select-press',
    screen: ev.screen,
    p: ev.p,
    hit: ctx.hit,
    mods: { shift: ev.mods.shift, alt: ev.mods.alt },
  };
  return { gesture: press };
}

/** S2: the moving set, the parts that depend on it and the ink boxes to snap to. */
function startMove(g: Press, ctx: ToolContext): Move | null {
  if (g.hit === null) return null;
  const moving = selectionHolds(ctx.selection, g.hit)
    ? ctx.selection
    : clickSelection(ctx.doc, ctx.selection, g.hit, g.mods);
  if (isEmptySelection(moving)) return null;
  const plan = movePlan(ctx.doc, ctx.scene, moving);
  const others = itemBoxes(ctx.doc, ctx.scene)
    .filter(
      (b) =>
        !b.atoms.some((id) => plan.atoms.has(id)) &&
        (b.object === undefined || !plan.objects.has(b.object)),
    )
    .map((b) => b.box);
  const alone = moving.atoms.size === 1 && moving.bonds.size === 0 && moving.objects.size === 0;
  return {
    kind: 'select-move',
    overlay: {},
    start: g.p,
    moving,
    plan,
    ink: movedInk(ctx.doc, ctx.scene, moving),
    others,
    single: alone ? ([...moving.atoms][0] ?? null) : null,
    delta: { x: 0, y: 0 },
    target: null,
  };
}

/** The move for the pointer at `ev`: Shift constraint, merge target or centre snapping. */
function dragged(g: Move, ev: PointerEv, ctx: ToolContext): Move {
  const bl = ctx.scene.style.bondLength;
  const pxPerPt = ctx.viewport.zoom * PX_PER_PT;
  let dx = (ev.p.x - g.start.x) * bl;
  let dy = (ev.p.y - g.start.y) * bl;
  const lock = { x: false, y: false };
  if (ev.mods.shift) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      dy = 0;
      lock.y = true;
    } else {
      dx = 0;
      lock.x = true;
    }
  }
  let target: AtomId | null = null;
  const atom = g.single === null ? undefined : ctx.doc.atoms[g.single];
  if (g.single !== null && atom !== undefined) {
    // The atom itself, not the pointer, is what lands on the target.
    const at = bluToScreen(ctx.viewport, { x: atom.x + dx / bl, y: atom.y + dy / bl }, bl);
    target = mergeTarget(ctx.doc, ctx.viewport, at, new Set([g.single]));
  }
  let guides: GestureOverlay['guides'] = [];
  if (target === null && g.ink !== null) {
    const snapped = snapMove(g.ink, g.others, { x: dx, y: dy }, pxPerPt, lock);
    dx = snapped.d.x;
    dy = snapped.d.y;
    guides = snapped.guides;
  }
  return { ...g, overlay: { guides }, delta: { x: dx / bl, y: dy / bl }, target };
}

/** The preview of a move: a translation of the moving parts, or the moved document. */
function movePreview(g: Move, ctx: ToolContext): Preview {
  const bl = ctx.scene.style.bondLength;
  const merge = g.target === null ? {} : { mergeTarget: g.target };
  if (g.plan.translate) {
    return {
      doc: ctx.doc,
      added: new Set<string>(),
      translate: { keys: g.plan.keys, dx: g.delta.x * bl, dy: g.delta.y * bl },
      ...merge,
    };
  }
  return {
    doc: transformItems(ctx.doc, g.moving, translation(g.delta.x, g.delta.y)),
    added: new Set<string>(),
    ...merge,
  };
}

function move(g: Exclude<SelectGesture, HandleGesture>, ev: PointerEv, ctx: ToolContext): ToolStep {
  if (g.kind === 'select-marquee') {
    const marquee = g.overlay.marquee;
    if (marquee === undefined) return { gesture: g };
    return { gesture: { ...g, overlay: { marquee: { from: marquee.from, to: ev.p } } } };
  }
  if (g.kind === 'select-move') {
    const next = dragged(g, ev, ctx);
    return { gesture: next, preview: movePreview(next, ctx) };
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
  // S2: a drag from an item applies S1 first (unless it is already selected), then moves.
  const started = startMove(g, ctx);
  if (started === null) return { gesture: null };
  const next = dragged(started, ev, ctx);
  return {
    gesture: next,
    preview: movePreview(next, ctx),
    ...(next.moving === ctx.selection ? {} : { selection: next.moving }),
  };
}

function up(g: Exclude<SelectGesture, HandleGesture>, ev: PointerEv, ctx: ToolContext): ToolStep {
  if (g.kind === 'select-press') {
    return { gesture: null, selection: clickSelection(ctx.doc, ctx.selection, g.hit, g.mods) };
  }
  if (g.kind === 'select-move') {
    const { delta, target, single, moving } = dragged(g, ev, ctx);
    if (delta.x === 0 && delta.y === 0) return { gesture: null, preview: null };
    const shift = translation(delta.x, delta.y);
    if (target !== null && single !== null) {
      return {
        gesture: null,
        preview: null,
        commit: {
          label: 'Join atoms',
          recipe: (doc) => mergeAtoms(transformItems(doc, moving, shift), target, single),
        },
      };
    }
    return {
      gesture: null,
      preview: null,
      commit: { label: 'Move', recipe: (doc) => transformItems(doc, moving, shift) },
    };
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
    if (isHandleGesture(g)) {
      return ev.type === 'move' || ev.type === 'up' ? stepHandle(g, ev, ctx) : { gesture: g };
    }
    if (ev.type === 'move') return move(g, ev, ctx);
    if (ev.type === 'up') return up(g, ev, ctx);
    return { gesture: g };
  },
};

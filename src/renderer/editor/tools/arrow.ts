// The Arrow tool (SPEC-editor.md R1): a drag draws an arrow of the option's kind with its angle
// snapped to 15 degrees (Shift: free); a click makes the default arrow, or sets the kind of the
// arrow under it. The ghost and the commit run the same recipe.
import type { Doc, ObjectId } from '@core/doc-model';
import type { CanvasEvent } from '../model/canvas-event';
import { distance, type Point } from '../model/geometry';
import { ARROWS_ONLY, hitTest } from '../model/hit-test';
import {
  addArrow,
  arrowFromDrag,
  arrowKindOf,
  defaultArrowEnds,
  setArrowKind,
  type ArrowEnds,
} from '../model/reaction-ops';
import type { GestureState } from '../state/editor-state';
import { commitOf, ghostOf } from './ghost';
import { DRAG_PX, type Tool, type ToolContext, type ToolStep } from './tool';

/** The pointer is down: a release within 4 px, or after a drag under 0.5 BLU, is a click. */
interface Press extends GestureState {
  readonly kind: 'arrow-press';
  /** Canvas px and BLU of the press. */
  readonly screen: Point;
  readonly p: Point;
  /** The arrow under the press, if any: a click sets its kind. */
  readonly arrow: ObjectId | null;
}

type PointerEv = Extract<CanvasEvent, { type: 'down' | 'move' | 'up' }>;

const IDLE: ToolStep = { gesture: null };

const asPress = (g: GestureState | null): Press | null =>
  g !== null && g.kind === 'arrow-press' ? (g as Press) : null;

/** The arrow a drag to `ev` draws, or null while it is a click. */
function dragEnds(g: Press, ev: PointerEv): ArrowEnds | null {
  if (distance(ev.screen, g.screen) <= DRAG_PX) return null;
  return arrowFromDrag(g.p, ev.p, ev.mods.shift);
}

function down(ev: PointerEv, ctx: ToolContext): ToolStep {
  if (ev.button !== 0) return IDLE;
  const hit = hitTest(ctx.doc, ctx.scene, ctx.viewport, ev.screen, ARROWS_ONLY);
  const press: Press = {
    kind: 'arrow-press',
    screen: ev.screen,
    p: ev.p,
    arrow: hit?.kind === 'object' ? hit.id : null,
  };
  return { gesture: press, preview: null };
}

function move(g: Press, ev: PointerEv, ctx: ToolContext): ToolStep {
  const ends = dragEnds(g, ev);
  if (ends === null) return { gesture: g, preview: null };
  const kind = arrowKindOf(ctx.variant);
  const [doc, id] = addArrow(ctx.doc, ends, kind);
  return { gesture: g, preview: ghostOf(ctx.doc, { doc }, false, [`obj:${id}`]) };
}

function up(g: Press, ev: PointerEv, ctx: ToolContext): ToolStep {
  const kind = arrowKindOf(ctx.variant);
  const ends = dragEnds(g, ev);
  const done = { gesture: null, preview: null } as const;
  if (ends !== null) {
    return { ...done, commit: commitOf('Add arrow', (doc: Doc) => addArrow(doc, ends, kind)[0]) };
  }
  const target = g.arrow;
  if (target !== null) {
    if (setArrowKind(ctx.doc, target, kind) === null) return done;
    return { ...done, commit: commitOf('Change arrow', (doc) => setArrowKind(doc, target, kind)) };
  }
  const click = defaultArrowEnds(g.p);
  return { ...done, commit: commitOf('Add arrow', (doc) => addArrow(doc, click, kind)[0]) };
}

export const arrowTool: Tool = {
  id: 'arrow',
  step(gesture, ev, ctx) {
    if (ev.type === 'cancel') return { gesture: null, preview: null };
    if (ev.type === 'down') return down(ev, ctx);
    const g = asPress(gesture);
    if (g === null) return IDLE;
    if (ev.type === 'move') return move(g, ev, ctx);
    if (ev.type === 'up') return up(g, ev, ctx);
    return { gesture: g };
  },
};

// The Ring tool (SPEC-editor.md P3-P6): a click places the option's ring on empty canvas, attaches
// it to an atom or fuses it onto a bond; before the click a ghost of it follows the pointer.
import type { AtomId, BondId, Doc } from '@core/doc-model';
import type { CanvasEvent } from '../model/canvas-event';
import { distance, type Point } from '../model/geometry';
import { atomDrawsLabel } from '../model/overlay';
import { placeRing, ringKey, type RingEdit, type RingTarget } from '../model/ring-ops';
import { isRingId, type RingId } from '../model/templates';
import type { GestureState, Hit } from '../state/editor-state';
import { commitOf, ghostOf } from './ghost';
import { DRAG_PX, type Tool, type ToolContext, type ToolStep } from './tool';

/** The pointer is down; a release within 4 px is the click. */
interface Press extends GestureState {
  readonly kind: 'ring-press';
  readonly screen: Point;
  readonly p: Point;
  readonly hit: Hit | null;
}

type PointerEv = Extract<CanvasEvent, { type: 'down' | 'move' | 'up' }>;

const IDLE: ToolStep = { gesture: null };

const asPress = (g: GestureState | null): Press | null =>
  g !== null && g.kind === 'ring-press' ? (g as Press) : null;

/** The ring option as a template id (Benzene when the option is unknown). */
const ringOf = (variant: string): RingId => (isRingId(variant) ? variant : 'benzene');

/** Where a click at `p` on `hit` puts the ring (P3-P5). */
function targetOf(hit: Hit | null, p: Point): RingTarget {
  if (hit?.kind === 'atom') return { atom: hit.id as AtomId };
  if (hit?.kind === 'bond') return { bond: hit.id as BondId, p };
  return { point: p };
}

function ghost(doc: Doc, edit: RingEdit | null, hovering: boolean) {
  return ghostOf(doc, edit, hovering, edit === null ? [] : [ringKey(edit.ring)]);
}

function down(ev: PointerEv, ctx: ToolContext): ToolStep {
  if (ev.button !== 0) return IDLE;
  const hit = ctx.hit?.kind === 'atom' || ctx.hit?.kind === 'bond' ? ctx.hit : null;
  const press: Press = { kind: 'ring-press', screen: ev.screen, p: ev.p, hit };
  // The hover ghost gives way to the press.
  return { gesture: press, preview: null };
}

function up(g: Press, ev: PointerEv, ctx: ToolContext): ToolStep {
  if (distance(ev.screen, g.screen) > DRAG_PX) return { gesture: null, preview: null };
  const id = ringOf(ctx.variant);
  const target = targetOf(g.hit, g.p);
  if (placeRing(ctx.doc, id, target) === null) return { gesture: null, preview: null };
  return {
    gesture: null,
    preview: null,
    commit: commitOf('Add ring', (doc) => placeRing(doc, id, target)?.doc ?? null),
  };
}

export const ringTool: Tool = {
  id: 'ring',
  step(gesture, ev, ctx) {
    if (ev.type === 'cancel') return { gesture: null, preview: null };
    if (ev.type === 'down') return down(ev, ctx);
    const g = asPress(gesture);
    if (g === null) return IDLE;
    if (ev.type === 'up') return up(g, ev, ctx);
    return { gesture: g };
  },
  hover(ev, ctx) {
    const hit = ctx.hit?.kind === 'atom' || ctx.hit?.kind === 'bond' ? ctx.hit : null;
    if (ctx.hit !== null && hit === null) return null;
    // HV4: no ghost through the letters of a label.
    if (hit?.kind === 'atom' && atomDrawsLabel(ctx.scene, hit.id as AtomId)) return null;
    const edit = placeRing(ctx.doc, ringOf(ctx.variant), targetOf(hit, ev.p));
    return ghost(ctx.doc, edit, true);
  },
};

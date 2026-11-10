// The Curved-arrow tool (SPEC-editor.md R3): press on an atom or a bond, drag to an atom, a bond
// or free canvas, release. The start and the end the pointer is over are highlighted like a hover
// and a ghost of the arrow follows the pointer; the commit repeats the ghost's recipe.
import type { Anchor, AtomId, BondId } from '@core/doc-model';
import type { CanvasEvent } from '../model/canvas-event';
import { hitTest, hoverFilter, type Hit } from '../model/hit-test';
import { addCurved, curvedHeadOf } from '../model/reaction-ops';
import type { GestureState } from '../state/editor-state';
import { commitOf, ghostOf } from './ghost';
import type { Tool, ToolContext, ToolStep } from './tool';

/** The pointer is down on an atom or a bond. */
interface Drag extends GestureState {
  readonly kind: 'curved-drag';
  readonly from: Anchor;
  readonly start: Hit;
}

type PointerEv = Extract<CanvasEvent, { type: 'down' | 'move' | 'up' }>;

const IDLE: ToolStep = { gesture: null };

const asDrag = (g: GestureState | null): Drag | null =>
  g !== null && g.kind === 'curved-drag' ? (g as Drag) : null;

/** R3: the anchor of an atom (itself) or a bond (its middle); null for anything else. */
function anchorOf(hit: Hit | null): Anchor | null {
  if (hit?.kind === 'atom') return { kind: 'atom', atom: hit.id as AtomId };
  if (hit?.kind === 'bond') return { kind: 'bond', bond: hit.id as BondId, t: 0.5 };
  return null;
}

/** What the pointer at `ev` ends the arrow on: an atom, a bond, or the point itself. */
function endAt(ev: PointerEv, ctx: ToolContext): { hit: Hit | null; anchor: Anchor } {
  const hit = hitTest(ctx.doc, ctx.scene, ctx.viewport, ev.screen, hoverFilter('curved'));
  return { hit, anchor: anchorOf(hit) ?? { kind: 'point', p: { x: ev.p.x + 0, y: ev.p.y + 0 } } };
}

function down(ev: PointerEv, ctx: ToolContext): ToolStep {
  if (ev.button !== 0) return IDLE;
  const from = anchorOf(ctx.hit);
  if (from === null || ctx.hit === null) {
    return {
      gesture: null,
      preview: null,
      notice: { kind: 'info', text: 'Start on an atom or a bond.' },
    };
  }
  const drag: Drag = { kind: 'curved-drag', from, start: ctx.hit, overlay: { anchors: [ctx.hit] } };
  return { gesture: drag, preview: null };
}

function move(g: Drag, ev: PointerEv, ctx: ToolContext): ToolStep {
  const { hit, anchor } = endAt(ev, ctx);
  const edit = addCurved(ctx.doc, g.from, anchor, curvedHeadOf(ctx.variant));
  const anchors = hit === null ? [g.start] : [g.start, hit];
  const next: Drag = { ...g, overlay: { anchors } };
  if (edit === null) return { gesture: next, preview: null };
  return {
    gesture: next,
    preview: ghostOf(ctx.doc, { doc: edit[0] }, false, [`obj:${edit[1]}`]),
  };
}

function up(g: Drag, ev: PointerEv, ctx: ToolContext): ToolStep {
  const { anchor } = endAt(ev, ctx);
  const head = curvedHeadOf(ctx.variant);
  const done = { gesture: null, preview: null } as const;
  if (addCurved(ctx.doc, g.from, anchor, head) === null) return done;
  return {
    ...done,
    commit: commitOf(
      'Add curved arrow',
      (doc) => addCurved(doc, g.from, anchor, head)?.[0] ?? null,
    ),
  };
}

export const curvedTool: Tool = {
  id: 'curved',
  step(gesture, ev, ctx) {
    if (ev.type === 'cancel') return { gesture: null, preview: null };
    if (ev.type === 'down') return down(ev, ctx);
    const g = asDrag(gesture);
    if (g === null) return IDLE;
    if (ev.type === 'move') return move(g, ev, ctx);
    if (ev.type === 'up') return up(g, ev, ctx);
    return { gesture: g };
  },
};

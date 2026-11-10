// The Erase tool (SPEC-editor.md E1, E2): a click erases the item under the pointer, a drag erases
// everything the pointer crosses. While the pointer is down the items are ghosted; the erase is
// one "Erase" commit on release, with the orphan rule.
import type { AtomId, BondId, ObjectId, Selection } from '@core/doc-model';
import type { CanvasEvent } from '../model/canvas-event';
import { deleteWithOrphans } from '../model/cleanup';
import { erasedKeys } from '../model/erase';
import { distance, lerp, type Point } from '../model/geometry';
import { hitTest, hoverFilter, type Hit } from '../model/hit-test';
import { isEmptySelection } from '../model/selection';
import { EMPTY_SELECTION, type GestureState, type Preview } from '../state/editor-state';
import type { Tool, ToolContext, ToolStep } from './tool';

/** The pointer is sampled at least this often (screen px) along a move, so a fast drag skips nothing. */
const SAMPLE_PX = 3;

/** The pointer is down: what it has crossed so far. */
interface Sweep extends GestureState {
  readonly kind: 'erase-sweep';
  readonly hits: Selection;
  /** Where the pointer was last, canvas px. */
  readonly last: Point;
}

type PointerEv = Extract<CanvasEvent, { type: 'down' | 'move' | 'up' }>;

const IDLE: ToolStep = { gesture: null };

function asSweep(g: GestureState | null): Sweep | null {
  return g !== null && g.kind === 'erase-sweep' ? (g as Sweep) : null;
}

/** `hits` plus the item under `hit`; the same object when there is nothing new. */
function withHit(hits: Selection, hit: Hit | null): Selection {
  if (hit === null) return hits;
  switch (hit.kind) {
    case 'atom':
      return hits.atoms.has(hit.id as AtomId)
        ? hits
        : { ...hits, atoms: new Set([...hits.atoms, hit.id as AtomId]) };
    case 'bond':
      return hits.bonds.has(hit.id as BondId)
        ? hits
        : { ...hits, bonds: new Set([...hits.bonds, hit.id as BondId]) };
    case 'object':
      return hits.objects.has(hit.id as ObjectId)
        ? hits
        : { ...hits, objects: new Set([...hits.objects, hit.id as ObjectId]) };
    default:
      return hits;
  }
}

/** Everything under the straight path from `from` to `to`. */
function sweepPath(hits: Selection, from: Point, to: Point, ctx: ToolContext): Selection {
  const steps = Math.max(1, Math.ceil(distance(from, to) / SAMPLE_PX));
  let next = hits;
  for (let i = 1; i <= steps; i++) {
    const at = lerp(from, to, i / steps);
    next = withHit(next, hitTest(ctx.doc, ctx.scene, ctx.viewport, at, hoverFilter('erase')));
  }
  return next;
}

/** The ghosts of what the sweep would erase: nothing re-renders, the parts only fade. */
function preview(hits: Selection, ctx: ToolContext): Preview | null {
  if (isEmptySelection(hits)) return null;
  return {
    doc: ctx.doc,
    added: new Set<string>(),
    faded: erasedKeys(ctx.doc, ctx.scene, hits),
  };
}

function down(ev: PointerEv, ctx: ToolContext): ToolStep {
  if (ev.button !== 0) return IDLE;
  const hits = withHit(EMPTY_SELECTION, ctx.hit);
  const sweep: Sweep = { kind: 'erase-sweep', hits, last: ev.screen };
  return { gesture: sweep, preview: preview(hits, ctx) };
}

function move(g: Sweep, ev: PointerEv, ctx: ToolContext): ToolStep {
  const hits = sweepPath(g.hits, g.last, ev.screen, ctx);
  const next: Sweep = { ...g, hits, last: ev.screen };
  return hits === g.hits ? { gesture: next } : { gesture: next, preview: preview(hits, ctx) };
}

function up(g: Sweep, ev: PointerEv, ctx: ToolContext): ToolStep {
  const hits = sweepPath(g.hits, g.last, ev.screen, ctx);
  if (isEmptySelection(hits)) return { gesture: null, preview: null };
  return {
    gesture: null,
    preview: null,
    commit: {
      label: 'Erase',
      recipe: (doc) => deleteWithOrphans(doc, hits),
      selection: EMPTY_SELECTION,
    },
  };
}

export const eraseTool: Tool = {
  id: 'erase',
  step(gesture, ev, ctx) {
    if (ev.type === 'cancel') return { gesture: null, preview: null };
    if (ev.type === 'down') return down(ev, ctx);
    const g = asSweep(gesture);
    if (g === null) return IDLE;
    if (ev.type === 'move') return move(g, ev, ctx);
    if (ev.type === 'up') return up(g, ev, ctx);
    return { gesture: g };
  },
};

// The Bond tool (SPEC-editor.md B1-B6, P1, G4): a click adds a bond or changes one, a drag aims a
// new one. Every drawn bond is 1.0 BLU long. The tool runs the same recipe for the ghost preview
// and for the commit, so the ids the ghost shows are the ids the commit issues.
import type { AtomId, BondId, Doc } from '@core/doc-model';
import {
  addedKeys,
  bondSpec,
  clickBond,
  dragBond,
  newBond,
  sprout,
  type BondEdit,
  type BondSpec,
  type BondStart,
} from '../model/bond-ops';
import type { CanvasEvent } from '../model/canvas-event';
import { distance, type Point } from '../model/geometry';
import { mergeTarget } from '../model/hit-test';
import { atomDrawsLabel } from '../model/overlay';
import type { GestureState, Hit, Preview } from '../state/editor-state';
import { DRAG_PX, type Tool, type ToolCommit, type ToolContext, type ToolStep } from './tool';

/** The pointer is down and has not moved past the drag threshold. */
interface Press extends GestureState {
  readonly kind: 'bond-press';
  /** Canvas px and BLU of the press. */
  readonly screen: Point;
  readonly p: Point;
  /** What was under the pointer: an atom, a bond, or null on empty canvas. */
  readonly hit: Hit | null;
}

/** A drag from an atom or empty canvas (B2, B4). */
interface Drag extends GestureState {
  readonly kind: 'bond-drag';
  readonly start: BondStart;
}

type PointerEv = Extract<CanvasEvent, { type: 'down' | 'move' | 'up' }>;

const IDLE: ToolStep = { gesture: null };

function asPress(g: GestureState | null): Press | null {
  return g !== null && g.kind === 'bond-press' ? (g as Press) : null;
}

function asDrag(g: GestureState | null): Drag | null {
  return g !== null && g.kind === 'bond-drag' ? (g as Drag) : null;
}

/** The ghost of an edit: the document it makes, the new parts and the atom it joins. */
function ghostOf(before: Doc, edit: BondEdit | null, hovering: boolean): Preview | null {
  if (edit === null) return null;
  return {
    doc: edit.doc,
    added: addedKeys(before, edit.doc),
    ...(edit.merge === undefined ? {} : { mergeTarget: edit.merge }),
    ...(hovering ? { hovering: true } : {}),
  };
}

/** The ghost bond of a click at `p` on `hit` (null: nothing to show). B6. */
function clickEdit(doc: Doc, hit: Hit | null, p: Point, spec: BondSpec): BondEdit | null {
  if (hit === null) return newBond(doc, p, spec);
  if (hit.kind === 'atom') return sprout(doc, hit.id, spec);
  return null;
}

/** B2 / B4: what a drag to `ev` makes. */
function dragEdit(g: Drag, ev: PointerEv, ctx: ToolContext): BondEdit | null {
  const exclude = new Set<AtomId>('atom' in g.start ? [g.start.atom] : []);
  const target = mergeTarget(ctx.doc, ctx.viewport, ev.screen, exclude);
  return dragBond(ctx.doc, g.start, ev.p, ev.mods.shift, target, bondSpec(ctx.variant));
}

/** The commit of an edit: it is recomputed on the document the transaction gives. */
function commitOf(label: string, edit: (doc: Doc) => Doc | null): ToolCommit {
  return { label, recipe: (doc) => edit(doc) ?? doc };
}

function down(ev: PointerEv, ctx: ToolContext): ToolStep {
  if (ev.button !== 0) return IDLE;
  const hit = ctx.hit?.kind === 'atom' || ctx.hit?.kind === 'bond' ? ctx.hit : null;
  const press: Press = { kind: 'bond-press', screen: ev.screen, p: ev.p, hit };
  // The hover ghost gives way to the press.
  return { gesture: press, preview: null };
}

function move(g: Press | Drag, ev: PointerEv, ctx: ToolContext): ToolStep {
  const press = asPress(g);
  if (press !== null) {
    // A press on a bond never drags (B5); a press elsewhere becomes a drag past 4 px.
    if (press.hit?.kind === 'bond' || distance(ev.screen, press.screen) <= DRAG_PX) {
      return { gesture: press };
    }
    const start: BondStart =
      press.hit?.kind === 'atom' ? { atom: press.hit.id as AtomId } : { point: press.p };
    const drag: Drag = { kind: 'bond-drag', start };
    return { gesture: drag, preview: ghostOf(ctx.doc, dragEdit(drag, ev, ctx), false) };
  }
  const drag = g as Drag;
  return { gesture: drag, preview: ghostOf(ctx.doc, dragEdit(drag, ev, ctx), false) };
}

/** A press released within 4 px: B1, B3 or B5. */
function click(g: Press, ctx: ToolContext): ToolStep {
  const spec = bondSpec(ctx.variant);
  const hit = g.hit;
  if (hit?.kind === 'bond') {
    const id = hit.id as BondId;
    if (clickBond(ctx.doc, id, ctx.variant, g.p) === null) return { gesture: null, preview: null };
    return {
      gesture: null,
      preview: null,
      commit: commitOf('Change bond', (doc) => clickBond(doc, id, ctx.variant, g.p)),
    };
  }
  if (clickEdit(ctx.doc, hit, g.p, spec) === null) return { gesture: null, preview: null };
  const at = g.p;
  const atom = hit?.kind === 'atom' ? (hit.id as AtomId) : null;
  return {
    gesture: null,
    preview: null,
    commit: commitOf(
      'Add bond',
      (doc) => (atom === null ? newBond(doc, at, spec) : sprout(doc, atom, spec))?.doc ?? null,
    ),
  };
}

function up(g: Press | Drag, ev: PointerEv, ctx: ToolContext): ToolStep {
  const press = asPress(g);
  if (press !== null) {
    // A press on a bond released away from it is not a click on it.
    if (distance(ev.screen, press.screen) > DRAG_PX) return { gesture: null, preview: null };
    return click(press, ctx);
  }
  const drag = g as Drag;
  const spec = bondSpec(ctx.variant);
  if (dragEdit(drag, ev, ctx) === null) return { gesture: null, preview: null };
  const exclude = new Set<AtomId>('atom' in drag.start ? [drag.start.atom] : []);
  return {
    gesture: null,
    preview: null,
    commit: commitOf('Add bond', (doc) => {
      const target = mergeTarget(doc, ctx.viewport, ev.screen, exclude);
      return dragBond(doc, drag.start, ev.p, ev.mods.shift, target, spec)?.doc ?? null;
    }),
  };
}

export const bondTool: Tool = {
  id: 'bond',
  step(gesture, ev, ctx) {
    if (ev.type === 'cancel') return { gesture: null, preview: null };
    if (ev.type === 'down') return down(ev, ctx);
    const g = asPress(gesture) ?? asDrag(gesture);
    if (g === null) return IDLE;
    if (ev.type === 'move') return move(g, ev, ctx);
    if (ev.type === 'up') return up(g, ev, ctx);
    return { gesture: g };
  },
  hover(ev, ctx) {
    const hit = ctx.hit?.kind === 'atom' ? ctx.hit : null;
    if (ctx.hit !== null && hit === null) return null;
    // HV4: no ghost through the letters of a label.
    if (hit !== null && atomDrawsLabel(ctx.scene, hit.id as AtomId)) return null;
    return ghostOf(ctx.doc, clickEdit(ctx.doc, hit, ev.p, bondSpec(ctx.variant)), true);
  },
};

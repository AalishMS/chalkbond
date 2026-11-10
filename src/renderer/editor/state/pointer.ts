// Applying a tool's step to the editor state (SPEC-editor.md "Tools and gestures").
import { current, type Selection } from '@core/doc-model';
import type { CanvasEvent, MoveEvent } from '../model/canvas-event';
import { handleHit } from '../model/handles';
import { hoverFilter, hitTest } from '../model/hit-test';
import { toolFor } from '../tools';
import { isVariantTool } from './catalog';
import { isEmptyDoc } from './empty-doc';
import { openLabelEditor } from './editing';
import { hoverAt, sameHit } from './hover';
import type { ToolContext } from '../tools/tool';
import type { EditorState, Hit } from './editor-state';
import type { EditorAction, ReducerContext } from './reducer';

type Commit = Extract<EditorAction, { type: 'commit' }>;

/** The pointer's hit on a press: the selection's handles first (H2), then the items. */
function hitForPress(
  state: EditorState,
  ctx: ReducerContext,
  screen: { x: number; y: number },
): Hit | null {
  const doc = current(state.history);
  const { scene } = ctx.derive.committed(doc);
  const handle =
    state.tool === 'select' ? handleHit(doc, scene, state.viewport, state.selection, screen) : null;
  return handle ?? hitTest(doc, scene, state.viewport, screen, hoverFilter(state.tool));
}

/** What the active tool sees: the document, the options bar's choice and `hit`. */
function toolContext(state: EditorState, ctx: ReducerContext, hit: Hit | null): ToolContext {
  const doc = current(state.history);
  const { scene, perception } = ctx.derive.committed(doc);
  return {
    doc,
    scene,
    perception,
    selection: state.selection,
    viewport: state.viewport,
    hit,
    variant: isVariantTool(state.tool) ? state.variants[state.tool] : '',
  };
}

/**
 * HV1, B6: the pointer moved with no gesture running. What it hovers is stored, and the tool
 * shows the ghost of what a click would do (a hover preview; it never touches history).
 */
export function hoverMove(state: EditorState, ev: MoveEvent, ctx: ReducerContext): EditorState {
  if (state.gesture !== null) return state;
  const hover = hoverAt(state, ctx.derive, ev.screen);
  const tool = toolFor(state.tool);
  const keep = state.preview !== null && state.preview.hovering !== true;
  const ghost =
    keep ||
    tool?.hover === undefined ||
    state.spaceHeld ||
    state.editing !== null ||
    isEmptyDoc(current(state.history))
      ? null
      : tool.hover(ev, toolContext(state, ctx, hover));
  const preview = keep ? state.preview : ghost;
  if (sameHit(state.hover, hover) && preview === null && state.preview === null) return state;
  return { ...state, hover, preview };
}

/**
 * R2, S7: a double-click opens the label editor on the atom under it, and only with Select; with
 * a drawing tool it is two clicks and nothing else.
 */
function doubleClick(
  state: EditorState,
  screen: { x: number; y: number },
  ctx: ReducerContext,
): EditorState {
  if (state.tool !== 'select' || state.gesture !== null) return state;
  const hit = hitForPress(state, ctx, screen);
  return hit?.kind === 'atom' ? openLabelEditor(state, hit.id) : state;
}

/**
 * Runs the active tool on a canvas event and applies its step: the gesture, the preview, the
 * selection and, on release, one commit. A press clears the notice. Previews never reach history.
 */
export function pointer(
  state: EditorState,
  ev: CanvasEvent,
  ctx: ReducerContext,
  commit: (state: EditorState, action: Commit) => EditorState,
): EditorState {
  const tool = toolFor(state.tool);
  if (tool === null || state.spaceHeld || state.editing !== null) return state;
  if (ev.type === 'dblclick') return doubleClick(state, ev.screen, ctx);
  const toolCtx = toolContext(
    state,
    ctx,
    ev.type === 'down' ? hitForPress(state, ctx, ev.screen) : null,
  );
  const step = tool.step(state.gesture, ev, toolCtx);
  const idle = step.gesture === null;
  let next: EditorState = {
    ...state,
    gesture: step.gesture,
    hover: idle ? state.hover : null,
    preview: step.preview !== undefined ? step.preview : idle ? null : state.preview,
    notice: ev.type === 'down' ? null : state.notice,
  };
  if (step.selection !== undefined) next = { ...next, selection: step.selection as Selection };
  if (step.notice !== undefined) {
    const id = next.noticeSeq + 1;
    next = { ...next, notice: { id, ...step.notice }, noticeSeq: id };
  }
  if (step.commit !== undefined) {
    const c = step.commit;
    next = commit(next, {
      type: 'commit',
      label: c.label,
      recipe: c.recipe,
      ...(c.selection === undefined ? {} : { selection: c.selection }),
      ...(c.coalesceKey === undefined ? {} : { coalesceKey: c.coalesceKey }),
    });
  }
  // A release ends the gesture under the pointer: what it rests on is hovered again at once, so
  // a hover key or the next ghost does not wait for the pointer to move.
  if (ev.type === 'up' && next.gesture === null && next.editing === null) {
    next = hoverMove(next, { ...ev, type: 'move' }, ctx);
  }
  return next;
}

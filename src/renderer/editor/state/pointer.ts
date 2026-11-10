// Applying a tool's step to the editor state (SPEC-editor.md "Tools and gestures").
import { current, type Selection } from '@core/doc-model';
import type { CanvasEvent } from '../model/canvas-event';
import { hoverFilter, hitTest } from '../model/hit-test';
import { toolFor } from '../tools';
import type { ToolContext } from '../tools/tool';
import type { EditorState, Hit } from './editor-state';
import type { EditorAction, ReducerContext } from './reducer';

type Commit = Extract<EditorAction, { type: 'commit' }>;

/**
 * The pointer's hit on a press. The seam for handles: E17 tests the selection's handles here
 * before the items (H2).
 */
function hitForPress(
  state: EditorState,
  ctx: ReducerContext,
  screen: { x: number; y: number },
): Hit | null {
  const doc = current(state.history);
  const { scene } = ctx.derive.committed(doc);
  return hitTest(doc, scene, state.viewport, screen, hoverFilter(state.tool));
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
  const doc = current(state.history);
  const { scene, perception } = ctx.derive.committed(doc);
  const toolCtx: ToolContext = {
    doc,
    scene,
    perception,
    selection: state.selection,
    viewport: state.viewport,
    hit: ev.type === 'down' ? hitForPress(state, ctx, ev.screen) : null,
  };
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
  return next;
}

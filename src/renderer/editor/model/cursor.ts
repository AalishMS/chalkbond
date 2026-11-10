// Canvas cursors per tool (SPEC-editor.md "Canvas appearance", Cursors).
import type { ToolId } from '../state/editor-state';
import type { Hit } from './hit-test';

/** `erase` is the 20 x 20 `data:` cursor the view builds; the rest are CSS cursor names. */
export type CanvasCursor = 'default' | 'move' | 'crosshair' | 'text' | 'grab' | 'erase';

/**
 * The cursor over the canvas. Handles (pointer, grab/grabbing) and the selection frame (move)
 * join with the selection tasks; a pan in progress (grabbing) is styled by the view.
 */
export function cursorFor(tool: ToolId, hit: Hit | null, spaceHeld: boolean): CanvasCursor {
  if (spaceHeld) return 'grab';
  switch (tool) {
    case 'select':
      if (hit === null) return 'default';
      return hit.kind === 'object' && hit.type === 'text' ? 'text' : 'move';
    case 'erase':
      return 'erase';
    case 'text':
      return 'text';
    default:
      return 'crosshair';
  }
}

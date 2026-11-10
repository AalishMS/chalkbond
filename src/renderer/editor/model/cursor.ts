// Canvas cursors per tool (SPEC-editor.md "Canvas appearance", Cursors).
import type { ToolId } from '../state/editor-state';
import type { Hit } from './hit-test';

/** `erase` is the 20 x 20 `data:` cursor the view builds; the rest are CSS cursor names. */
export type CanvasCursor =
  'default' | 'move' | 'crosshair' | 'text' | 'grab' | 'grabbing' | 'pointer' | 'erase';

/**
 * The cursor over the canvas. `gesture` is the kind of the running gesture: while the rotate
 * handle turns the hand closes (grabbing) and the other handles keep the pointer. A pan in
 * progress (grabbing) is styled by the view.
 */
export function cursorFor(
  tool: ToolId,
  hit: Hit | null,
  spaceHeld: boolean,
  gesture: string | null = null,
): CanvasCursor {
  if (spaceHeld) return 'grab';
  switch (tool) {
    case 'select':
      if (gesture === 'select-rotate') return 'grabbing';
      if (gesture === 'select-arrow' || gesture === 'select-curve') return 'pointer';
      if (hit === null) return 'default';
      if (hit.kind === 'handle') return hit.handle === 'rotate' ? 'grab' : 'pointer';
      return hit.kind === 'object' && hit.type === 'text' ? 'text' : 'move';
    case 'erase':
      return 'erase';
    case 'text':
      return 'text';
    default:
      return 'crosshair';
  }
}

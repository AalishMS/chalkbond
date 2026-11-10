// The Text tool (SPEC-editor.md T1): a click on empty canvas opens the text editor on a new text
// at that point, a click on a text opens it. The editor opens on release, not on the press: the
// browser moves focus to the canvas after the press, which would close the new box at once.
import type { ObjectId } from '@core/doc-model';
import type { CanvasEvent } from '../model/canvas-event';
import { distance, type Point } from '../model/geometry';
import type { GestureState } from '../state/editor-state';
import { DRAG_PX, type Tool, type ToolStep } from './tool';

interface Press extends GestureState {
  readonly kind: 'text-press';
  /** Canvas px and BLU of the press. */
  readonly screen: Point;
  readonly p: Point;
  /** The text under the press, if any. */
  readonly object: ObjectId | null;
}

type PointerEv = Extract<CanvasEvent, { type: 'down' | 'move' | 'up' }>;

const IDLE: ToolStep = { gesture: null };

const asPress = (g: GestureState | null): Press | null =>
  g !== null && g.kind === 'text-press' ? (g as Press) : null;

export const textTool: Tool = {
  id: 'text',
  step(gesture, ev: CanvasEvent, ctx) {
    if (ev.type === 'cancel') return { gesture: null, preview: null };
    if (ev.type === 'down') {
      if (ev.button !== 0) return IDLE;
      const object = ctx.hit?.kind === 'object' && ctx.hit.type === 'text' ? ctx.hit.id : null;
      const press: Press = { kind: 'text-press', screen: ev.screen, p: ev.p, object };
      return { gesture: press, preview: null };
    }
    const press = asPress(gesture);
    if (press === null || (ev.type !== 'move' && ev.type !== 'up')) return { gesture };
    const e = ev as PointerEv;
    // A drag is not a click: nothing opens.
    if (distance(e.screen, press.screen) > DRAG_PX) return IDLE;
    if (e.type === 'move') return { gesture: press };
    return {
      gesture: null,
      preview: null,
      edit:
        press.object !== null
          ? { kind: 'existing', object: press.object }
          : { kind: 'new', fresh: { at: press.p, align: 'left' } },
    };
  },
};

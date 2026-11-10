// The Plus tool (SPEC-editor.md R2): a click puts a plus sign centred on the point, its centre
// pulled onto the centre line of a neighbouring molecule or object within 6 px (S3). While the
// button is down a ghost of the plus follows the pointer and the guide shows.
import type { CanvasEvent } from '../model/canvas-event';
import type { Point } from '../model/geometry';
import { addPlus, snapPlus } from '../model/reaction-ops';
import { PX_PER_PT } from '../model/viewport';
import type { GestureState } from '../state/editor-state';
import { commitOf, ghostOf } from './ghost';
import type { Tool, ToolContext, ToolStep } from './tool';

interface Press extends GestureState {
  readonly kind: 'plus-press';
}

type PointerEv = Extract<CanvasEvent, { type: 'down' | 'move' | 'up' }>;

const IDLE: ToolStep = { gesture: null };

const isPress = (g: GestureState | null): g is Press => g !== null && g.kind === 'plus-press';

/** Where the plus for a pointer at `ev` goes, and the guides that show why. */
function placed(ev: PointerEv, ctx: ToolContext): ReturnType<typeof snapPlus> {
  return snapPlus(ctx.doc, ctx.scene, ev.p, ctx.viewport.zoom * PX_PER_PT);
}

function show(ev: PointerEv, ctx: ToolContext): ToolStep {
  const { at, guides } = placed(ev, ctx);
  const [doc, id] = addPlus(ctx.doc, at as Point);
  return {
    gesture: { kind: 'plus-press', overlay: { guides } } satisfies Press,
    preview: ghostOf(ctx.doc, { doc }, false, [`obj:${id}`]),
  };
}

export const plusTool: Tool = {
  id: 'plus',
  step(gesture, ev, ctx) {
    if (ev.type === 'cancel') return { gesture: null, preview: null };
    if (ev.type === 'down') return ev.button === 0 ? show(ev, ctx) : IDLE;
    if (!isPress(gesture)) return IDLE;
    if (ev.type === 'move') return show(ev, ctx);
    if (ev.type === 'up') {
      const { at } = placed(ev, ctx);
      return {
        gesture: null,
        preview: null,
        commit: commitOf('Add plus', (doc) => addPlus(doc, at)[0]),
      };
    }
    return { gesture };
  },
};

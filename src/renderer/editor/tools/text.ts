// The Text tool (SPEC-editor.md T1): a click on empty canvas opens the text editor on a new text
// at that point, a click on a text opens it. The editor opens on release, not on the press: the
// browser moves focus to the canvas after the press, which would close the new box at once.
import type { Doc, ObjectId } from '@core/doc-model';
import type { CanvasEvent } from '../model/canvas-event';
import { NOMINAL_RUNS, placeCondition } from '../model/conditions';
import { distance, type Point } from '../model/geometry';
import type { Slot, TextTarget } from '../model/text-ops';
import type { GestureState } from '../state/editor-state';
import { DRAG_PX, type Tool, type ToolStep } from './tool';

interface Press extends GestureState {
  readonly kind: 'text-press';
  /** Canvas px and BLU of the press. */
  readonly screen: Point;
  readonly p: Point;
  /** The text under the press, if any. */
  readonly object: ObjectId | null;
  /** The condition slot under the press, if no text is (T1). */
  readonly slot: { readonly arrow: ObjectId; readonly slot: Slot } | null;
}

/** T1: the text attached to `slot` of `arrow`, if any. */
function attachedText(doc: Doc, arrow: ObjectId, slot: Slot): ObjectId | null {
  const found = Object.values(doc.objects).find(
    (o) => o.type === 'text' && o.attachedTo?.arrow === arrow && o.attachedTo.slot === slot,
  );
  return found?.id ?? null;
}

/** What a click on a condition slot opens: the text already there, else a new centred one. */
function slotTarget(doc: Doc, arrow: ObjectId, slot: Slot): TextTarget | null {
  const there = attachedText(doc, arrow, slot);
  if (there !== null) return { kind: 'existing', object: there };
  const shaft = doc.objects[arrow];
  if (shaft?.type !== 'arrow') return null;
  const at = placeCondition(doc, shaft, slot, NOMINAL_RUNS)?.at;
  if (at === undefined) return null;
  return { kind: 'new', fresh: { at, align: 'center', attachedTo: { arrow, slot } } };
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
      const slot =
        object === null && ctx.hit?.kind === 'slot'
          ? { arrow: ctx.hit.arrow, slot: ctx.hit.slot }
          : null;
      const press: Press = { kind: 'text-press', screen: ev.screen, p: ev.p, object, slot };
      return { gesture: press, preview: null };
    }
    const press = asPress(gesture);
    if (press === null || (ev.type !== 'move' && ev.type !== 'up')) return { gesture };
    const e = ev as PointerEv;
    // A drag is not a click: nothing opens.
    if (distance(e.screen, press.screen) > DRAG_PX) return IDLE;
    if (e.type === 'move') return { gesture: press };
    const edit: TextTarget | null =
      press.object !== null
        ? { kind: 'existing', object: press.object }
        : press.slot !== null
          ? slotTarget(ctx.doc, press.slot.arrow, press.slot.slot)
          : { kind: 'new', fresh: { at: press.p, align: 'left' } };
    return { gesture: null, preview: null, ...(edit === null ? {} : { edit }) };
  },
};

// What opening and committing the text editor do to the document (SPEC-editor.md T1, T2, T4):
// pure functions from values to a document. The editor's model is `TextEditState`; the stored
// form is `TextRun[]`.
import {
  addObject,
  deleteItems,
  updateObject,
  type Doc,
  type ObjectId,
  type TextObject,
  type TextRun,
} from '@core/doc-model';
import { finishText } from './chem-text';
import { placeCondition } from './conditions';
import type { Point } from './geometry';
import { fromStored, fromText, textOf, type TextEditState } from './text-edit';

/** The slot of a condition text: above or below its arrow (T1). */
export type Slot = 'above' | 'below';

/** A text that does not exist yet: where it will be and what it is attached to. */
export interface NewText {
  /** BLU: `at` of the text. */
  readonly at: Point;
  readonly align: 'left' | 'center';
  readonly attachedTo?: { readonly arrow: ObjectId; readonly slot: Slot };
}

/** What the text editor is open on: a stored text, or one the commit will add (T1). */
export type TextTarget =
  | { readonly kind: 'existing'; readonly object: ObjectId }
  | { readonly kind: 'new'; readonly fresh: NewText };

/** B / I act on the whole object: bold or italic when every run is. */
export function textStyleOf(runs: readonly TextRun[]): { bold: boolean; italic: boolean } {
  return {
    bold: runs.length > 0 && runs.every((r) => r.bold === true),
    italic: runs.length > 0 && runs.every((r) => r.italic === true),
  };
}

export interface OpenedText {
  readonly edit: TextEditState;
  readonly bold: boolean;
  readonly italic: boolean;
}

/** T2: a stored text loads with every character explicit; a new one is empty. Null: no such text. */
export function openText(doc: Doc, target: TextTarget): OpenedText | null {
  if (target.kind === 'new') return { edit: fromText(''), bold: false, italic: false };
  const obj = doc.objects[target.object];
  if (obj?.type !== 'text') return null;
  return { edit: fromStored(obj.runs), ...textStyleOf(obj.runs) };
}

/** The stored text this target is, if any. */
export function textObjectOf(doc: Doc, target: TextTarget): TextObject | null {
  if (target.kind === 'new') return null;
  const obj = doc.objects[target.object];
  return obj?.type === 'text' ? obj : null;
}

/**
 * T2: closing the editor by Enter or a click elsewhere. The runs go through `finishText`. An
 * empty result adds nothing, or deletes the stored text; a text that did not change is no step
 * (null). The label is "Add text" or "Edit text".
 */
export function textCommit(
  doc: Doc,
  target: TextTarget,
  edit: TextEditState,
  style: { readonly bold: boolean; readonly italic: boolean },
): { readonly label: string; readonly recipe: (doc: Doc) => Doc } | null {
  const runs = finishText(edit.runs, style);
  const empty = textOf(edit).trim() === '';
  if (target.kind === 'new') {
    if (empty) return null;
    const fresh = target.fresh;
    // T3: an attached text is centred on its arrow by what it says, not where it was clicked.
    const arrow = fresh.attachedTo === undefined ? undefined : doc.objects[fresh.attachedTo.arrow];
    const at =
      fresh.attachedTo !== undefined && arrow?.type === 'arrow'
        ? (placeCondition(doc, arrow, fresh.attachedTo.slot, runs)?.at ?? fresh.at)
        : fresh.at;
    return {
      label: 'Add text',
      recipe: (d) =>
        addObject(d, {
          type: 'text',
          at,
          runs,
          align: fresh.align,
          ...(fresh.attachedTo === undefined ? {} : { attachedTo: fresh.attachedTo }),
        })[0],
    };
  }
  const stored = textObjectOf(doc, target);
  if (stored === null) return null;
  const id = stored.id;
  if (empty) {
    return {
      label: 'Edit text',
      recipe: (d) => deleteItems(d, { atoms: new Set(), bonds: new Set(), objects: new Set([id]) }),
    };
  }
  if (JSON.stringify(runs) === JSON.stringify(stored.runs)) return null;
  // T3: a condition text is placed again by its new width.
  const arrow = stored.attachedTo === undefined ? undefined : doc.objects[stored.attachedTo.arrow];
  const at =
    stored.attachedTo !== undefined && arrow?.type === 'arrow'
      ? placeCondition(doc, arrow, stored.attachedTo.slot, runs)?.at
      : undefined;
  return {
    label: 'Edit text',
    recipe: (d) => updateObject(d, id, at === undefined ? { runs } : { runs, at }),
  };
}

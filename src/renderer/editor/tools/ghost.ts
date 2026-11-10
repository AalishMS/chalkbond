// What the drawing tools share: the ghost of an edit and the commit that repeats it.
import type { Doc, AtomId } from '@core/doc-model';
import { addedKeys } from '../model/bond-ops';
import type { Preview } from '../state/editor-state';
import type { ToolCommit } from './tool';

/**
 * The ghost of an edit: the document it makes, the keys of the parts it adds (`extra`: more keys,
 * such as the circle of a new ring) and the atom it joins. `hovering` marks the ghost of a click
 * that has not happened (B6). Null when there is no edit.
 */
export function ghostOf(
  before: Doc,
  edit: { readonly doc: Doc; readonly merge?: AtomId } | null,
  hovering: boolean,
  extra: readonly string[] = [],
): Preview | null {
  if (edit === null) return null;
  return {
    doc: edit.doc,
    added: new Set([...addedKeys(before, edit.doc), ...extra]),
    ...(edit.merge === undefined ? {} : { mergeTarget: edit.merge }),
    ...(hovering ? { hovering: true } : {}),
  };
}

/**
 * The commit of an edit: it is recomputed on the document the transaction gives, so the ids it
 * issues are the ids the ghost showed. An edit that turns out to do nothing leaves the document.
 */
export function commitOf(label: string, edit: (doc: Doc) => Doc | null): ToolCommit {
  return { label, recipe: (doc) => edit(doc) ?? doc };
}

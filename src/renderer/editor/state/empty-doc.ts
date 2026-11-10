import type { Doc } from '@core/doc-model';
import type { GestureState, Preview } from './editor-state';

/** True when the document has no atoms and no objects (the empty state is shown). */
export function isEmptyDoc(doc: Doc): boolean {
  return Object.keys(doc.atoms).length === 0 && Object.keys(doc.objects).length === 0;
}

/**
 * R30: the empty state shows for an empty document with no gesture running and no preview (a
 * ghost, hover ghosts included): nothing the user is drawing may overlap its block.
 */
export function emptyStateVisible(
  doc: Doc,
  gesture: GestureState | null,
  preview: Preview | null,
): boolean {
  return isEmptyDoc(doc) && gesture === null && preview === null;
}

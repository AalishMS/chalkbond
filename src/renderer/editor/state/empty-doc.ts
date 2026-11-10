import type { Doc } from '@core/doc-model';

/** True when the document has no atoms and no objects (the empty state is shown). */
export function isEmptyDoc(doc: Doc): boolean {
  return Object.keys(doc.atoms).length === 0 && Object.keys(doc.objects).length === 0;
}

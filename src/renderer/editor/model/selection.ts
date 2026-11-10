// Selections derived from what a commit added (SPEC-editor.md "Tools and gestures").
import type { AtomId, BondId, Doc, ObjectId, Selection } from '@core/doc-model';

const number = (id: string): number => Number(id.slice(1));

/**
 * The items `doc` gained since the document's `nextId` was `firstNewId`: ids are never reused
 * within a document, so every id at or above it was issued by that commit.
 */
export function insertedSelection(firstNewId: number, doc: Doc): Selection {
  const fresh = (ids: string[]): string[] => ids.filter((id) => number(id) >= firstNewId);
  return {
    atoms: new Set(fresh(Object.keys(doc.atoms)) as AtomId[]),
    bonds: new Set(fresh(Object.keys(doc.bonds)) as BondId[]),
    objects: new Set(fresh(Object.keys(doc.objects)) as ObjectId[]),
  };
}

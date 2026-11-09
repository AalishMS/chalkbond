import type { DocDraft } from './edit';
import type { Doc, DrawObject, ObjectId } from './types';

/**
 * Inserts a new object into `zOrder`. `zOrder` always lists `shape` highlights first (they
 * paint beneath structures), then every other object; a new object goes on top of its layer.
 */
export function addToZOrder(d: DocDraft, obj: DrawObject): void {
  if (obj.type !== 'shape') {
    d.zOrder.push(obj.id);
    return;
  }
  const firstOverlay = d.zOrder.findIndex((id) => d.objects[id]?.type !== 'shape');
  d.zOrder.splice(firstOverlay === -1 ? d.zOrder.length : firstOverlay, 0, obj.id);
}

/** Removes ids from `zOrder`, keeping the order of the rest. */
export function removeFromZOrder(d: DocDraft, ids: ReadonlySet<string>): void {
  const kept = d.zOrder.filter((id) => !ids.has(id));
  if (kept.length !== d.zOrder.length) d.zOrder = kept;
}

/** Paint layers: highlights beneath structures, everything else above them. */
export function paintLayers(doc: Doc): { beneath: ObjectId[]; above: ObjectId[] } {
  const beneath: ObjectId[] = [];
  const above: ObjectId[] = [];
  for (const id of doc.zOrder) (doc.objects[id]?.type === 'shape' ? beneath : above).push(id);
  return { beneath, above };
}

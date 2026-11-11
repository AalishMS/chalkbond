import {
  serialize,
  emptyDoc,
  extract,
  insert,
  setStyle,
  type Doc,
  type Selection,
} from '../doc-model';
export function drawingPayload(doc: Doc): string {
  return JSON.stringify(JSON.parse(serialize(doc))).replace(
    /[\u007f-\uffff]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}
export function pictureSelection(doc: Doc, selection: Selection): Selection {
  const objects = new Set(selection.objects);
  for (const o of Object.values(doc.objects)) {
    if (o.type === 'text' && o.attachedTo && selection.objects.has(o.attachedTo.arrow))
      objects.add(o.id);
  }
  return { ...selection, objects };
}
export function pictureDoc(doc: Doc, selection: Selection | null): Doc {
  if (selection === null) return doc;
  const [taken] = insert(emptyDoc(doc.meta.created), extract(doc, selection), { x: 0, y: 0 });
  return { ...setStyle(taken, doc.style), meta: { ...doc.meta } };
}

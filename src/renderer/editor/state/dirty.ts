import type { Doc } from '@core/doc-model';

/** Structural equality; shared (identical) subtrees, which Immer keeps across edits, are free. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every(
    (key) =>
      Object.hasOwn(b, key) &&
      same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

const withoutModified = (doc: Doc): Doc => ({ ...doc, meta: { ...doc.meta, modified: '' } });

/** True when `doc` differs from `saved`, ignoring `meta.modified` (an edit and its undo agree). */
export function differs(doc: Doc, saved: Doc): boolean {
  return doc !== saved && !same(withoutModified(doc), withoutModified(saved));
}

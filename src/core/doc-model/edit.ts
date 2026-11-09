import { castDraft, isDraft, produce, type Draft } from 'immer';
import { makeId, type IdKind } from './ids';
import type { AtomId, BondId, Doc, GroupId, ObjectId } from './types';

export type DocDraft = Draft<Doc>;

/**
 * Runs a mutating recipe as a pure op. On a frozen `Doc` it produces a new doc; on an Immer
 * draft (inside `History.transact`) it mutates the draft in place and returns it, so the
 * transaction records fine-grained patches instead of one whole-document replacement.
 */
export function edit<R>(doc: Doc, recipe: (d: DocDraft) => R): [Doc, R] {
  if (isDraft(doc)) {
    return [doc, recipe(castDraft(doc))];
  }
  let result: R | undefined;
  const next = produce(doc, (d) => {
    result = recipe(d);
  });
  return [next, result as R];
}

interface IdOf {
  atom: AtomId;
  bond: BondId;
  object: ObjectId;
  group: GroupId;
}

/** Takes the next id from the doc's counter. */
export function allocId<K extends IdKind>(d: DocDraft, kind: K): IdOf[K] {
  const n = d.nextId;
  d.nextId = n + 1;
  return makeId(kind, n);
}

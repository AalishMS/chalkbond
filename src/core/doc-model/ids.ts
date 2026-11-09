import type { AtomId, BondId, GroupId, ObjectId } from './types';

/** Id prefix per item kind. Ids share one counter (`Doc.nextId`): 'a1', 'b2', 'o3', 'g4'. */
export const ID_PREFIX = { atom: 'a', bond: 'b', object: 'o', group: 'g' } as const;
export type IdKind = keyof typeof ID_PREFIX;

interface IdOf {
  atom: AtomId;
  bond: BondId;
  object: ObjectId;
  group: GroupId;
}

export function makeId<K extends IdKind>(kind: K, n: number): IdOf[K] {
  return `${ID_PREFIX[kind]}${n}` as IdOf[K];
}

/**
 * Numeric suffix of an id of the given kind, or `null` if the id is not of the form
 * `<prefix><positive integer>` without leading zeros.
 */
export function idNumber(kind: IdKind, id: string): number | null {
  const m = /^([a-z])([1-9]\d*)$/.exec(id);
  if (!m || m[1] !== ID_PREFIX[kind]) return null;
  return Number(m[2]);
}

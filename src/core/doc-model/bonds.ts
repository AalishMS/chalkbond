import { castDraft } from 'immer';
import { allocId, edit } from './edit';
import { DocError } from './errors';
import type { AtomId, Bond, BondId, Doc } from './types';
import { applyPatch, checkBond, settable } from './validate';

export type BondInit = Partial<Omit<Bond, 'id' | 'a1' | 'a2'>>;
export type BondPatch = BondInit;

const REQUIRED = ['order', 'stereo', 'doublePlacement'];
// Endpoints change only through mergeAtoms.
const IMMUTABLE = ['id', 'a1', 'a2'];

/** The bond joining two atoms (either direction), if any. */
export function findBond(doc: Doc, a1: AtomId, a2: AtomId): BondId | undefined {
  for (const bond of Object.values(doc.bonds)) {
    if ((bond.a1 === a1 && bond.a2 === a2) || (bond.a1 === a2 && bond.a2 === a1)) return bond.id;
  }
  return undefined;
}

/** Bonds a1–a2 (default: single, no stereo). Rejects self-bonds and duplicate pairs. */
export function addBond(doc: Doc, a1: AtomId, a2: AtomId, init: BondInit = {}): [Doc, BondId] {
  if (!(a1 in doc.atoms)) throw new DocError('unknown-atom', a1);
  if (!(a2 in doc.atoms)) throw new DocError('unknown-atom', a2);
  if (a1 === a2) throw new DocError('self-bond', a1);
  const existing = findBond(doc, a1, a2);
  if (existing !== undefined) throw new DocError('duplicate-bond', `${a1}-${a2} is ${existing}`);
  const bond = {
    order: 1,
    stereo: 'none',
    doublePlacement: 'auto',
    ...settable(init, IMMUTABLE, true),
    a1,
    a2,
  } as Omit<Bond, 'id'>;
  checkBond(bond);
  return edit(doc, (d) => {
    const id = allocId(d, 'bond');
    d.bonds[id] = castDraft({ ...bond, id });
    return id;
  });
}

/** Changes bond fields (not its endpoints); `undefined` clears an optional field. */
export function updateBond(doc: Doc, id: BondId, patch: BondPatch): Doc {
  const current = doc.bonds[id];
  if (!current) throw new DocError('unknown-bond', id);
  const clean = settable(patch, IMMUTABLE, false);
  const next = { ...current };
  applyPatch(next, clean, REQUIRED);
  checkBond(next);
  return edit(doc, (d) => applyPatch(d.bonds[id] ?? {}, clean, REQUIRED))[0];
}

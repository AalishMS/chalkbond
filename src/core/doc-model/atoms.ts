import { castDraft } from 'immer';
import { allocId, edit } from './edit';
import { DocError } from './errors';
import type { Atom, AtomId, Doc, Point } from './types';
import { applyPatch, checkAtom, settable } from './validate';

export type AtomInit = Partial<Omit<Atom, 'id'>> & Point;
export type AtomPatch = Partial<Omit<Atom, 'id'>>;

const REQUIRED = ['x', 'y', 'element', 'charge', 'radical'];
const IMMUTABLE = ['id'];

/** Adds an atom (default: neutral carbon, no radical) and returns its id. */
export function addAtom(doc: Doc, init: AtomInit): [Doc, AtomId] {
  const atom = {
    element: 'C',
    charge: 0,
    radical: 0,
    ...settable(init, IMMUTABLE, true),
  } as Omit<Atom, 'id'>;
  checkAtom(atom);
  return edit(doc, (d) => {
    const id = allocId(d, 'atom');
    d.atoms[id] = castDraft({ ...atom, id });
    return id;
  });
}

/** Changes atom fields; `undefined` clears an optional field. */
export function updateAtom(doc: Doc, id: AtomId, patch: AtomPatch): Doc {
  const current = doc.atoms[id];
  if (!current) throw new DocError('unknown-atom', id);
  const clean = settable(patch, IMMUTABLE, false);
  const next = { ...current };
  applyPatch(next, clean, REQUIRED);
  checkAtom(next);
  return edit(doc, (d) => applyPatch(d.atoms[id] ?? {}, clean, REQUIRED))[0];
}

/** Atoms bonded to `atomId`, sorted by id number. */
export function neighbors(doc: Doc, atomId: AtomId): AtomId[] {
  if (!(atomId in doc.atoms)) throw new DocError('unknown-atom', atomId);
  const out: AtomId[] = [];
  for (const bond of Object.values(doc.bonds)) {
    if (bond.a1 === atomId) out.push(bond.a2);
    else if (bond.a2 === atomId) out.push(bond.a1);
  }
  return out.sort(byIdNumber);
}

/** Orders ids by numeric suffix: 'a2' before 'a10'. */
export function byIdNumber(p: string, q: string): number {
  return Number(p.slice(1)) - Number(q.slice(1));
}

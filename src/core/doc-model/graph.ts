import { byIdNumber } from './atoms';
import type { AtomId, Doc } from './types';

/**
 * Connected components of the atom/bond graph (a "molecule" each). Deterministic: atoms in a
 * component are sorted by id number, components by their lowest atom id.
 */
export function fragments(doc: Doc): AtomId[][] {
  const parent = new Map<AtomId, AtomId>();
  for (const id of Object.keys(doc.atoms) as AtomId[]) parent.set(id, id);

  const find = (x: AtomId): AtomId => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as AtomId;
    while (x !== root) {
      const next = parent.get(x) as AtomId;
      parent.set(x, root);
      x = next;
    }
    return root;
  };

  for (const bond of Object.values(doc.bonds)) {
    const r1 = find(bond.a1);
    const r2 = find(bond.a2);
    if (r1 !== r2) parent.set(r1, r2);
  }

  const groups = new Map<AtomId, AtomId[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const list = groups.get(root);
    if (list) list.push(id);
    else groups.set(root, [id]);
  }
  const out = [...groups.values()].map((g) => g.sort(byIdNumber));
  return out.sort((p, q) => byIdNumber(p[0] as string, q[0] as string));
}

// Kekulé assignment for order-1.5 bonds. OpenChemLib leaves rings of delocalized bonds
// unresolved (benzene → C6H12), so chem-core picks single/double itself before building a
// molecule. Pure TS; see SPEC-chem-core.md "Mapping doc-model ↔ OpenChemLib".
import type { Atom, AtomId, BondId, Doc } from '../doc-model/index';
import { allowedValences, isoelectronicSymbol } from './valence';

export interface KekuleResult {
  /** Single (1) or double (2) for every order-1.5 bond in scope; 1 in unsolvable systems. */
  readonly orders: ReadonlyMap<BondId, 1 | 2>;
  /** The bonds of each 1.5-bond system that admits no Kekulé structure. */
  readonly failures: readonly (readonly BondId[])[];
}

/** How an atom touching 1.5 bonds may take part in the π matching. */
export interface PiRole {
  /** It can take one double bond without exceeding its normal valence. */
  readonly canPi: boolean;
  /** It must take one (neutral carbon and its isoelectronic kin, e.g. pyridinium N⁺). */
  readonly required: boolean;
}

/** Search-step budget per system; beyond it the best assignment found so far is used. */
const STEP_BUDGET = 200_000;

const byIdNumber = (p: string, q: string): number => Number(p.slice(1)) - Number(q.slice(1));

/**
 * The π role of an atom given its bonds counted with every 1.5 bond as single. An atom can
 * take a double bond if that stays within its *normal* (lowest allowed) valence: pyridine N
 * (2 bonds, normal 3) can, furan O and thiophene S (2, normal 2) can't, pyrrole N with an
 * explicit H or a third neighbour (3, normal 3) can't. Abbreviation or
 * unknown labels and pseudo-atoms never take part. Nor does an atom that already has a double
 * or triple bond outside the 1.5 system (`hasPi`): its π bond is drawn, e.g. next to a partial
 * Kekulé → circle toggle, or an exocyclic C=O.
 */
export function piRole(atom: Atom, sigmaValence: number, hasPi = false): PiRole {
  const none = { canPi: false, required: false };
  if (atom.label !== undefined || hasPi) return none;
  const allowed = allowedValences(atom.element, atom.charge, atom.radical);
  if (!allowed) return none;
  const used = sigmaValence + (atom.explicitH ?? 0);
  const normal = allowed[0];
  if (normal === undefined || used + 1 > normal) return none;
  return { canPi: true, required: isoelectronicSymbol(atom.element, atom.charge) === 'C' };
}

/**
 * Chooses single/double for the order-1.5 bonds among `scope` atoms (default: all). For each
 * connected system, every atom whose role is `required` gets exactly one double bond; optional
 * atoms (pyridine-type N, pyrylium O⁺, C⁻, …) are matched where possible, the rest keep a lone
 * pair or H (pyrrole N). Exact search: most-constrained atom first (forced choices propagate),
 * then backtracking, maximising matched atoms. Deterministic: atoms and bonds are tried in id
 * order.
 */
export function assignKekule(doc: Doc, scope?: Iterable<AtomId>): KekuleResult {
  const inScope = scope ? new Set(scope) : null;
  const sigma = new Map<AtomId, number>();
  const pi = new Set<AtomId>();
  const aromatic: BondId[] = [];
  for (const bond of Object.values(doc.bonds)) {
    const in1 = !inScope || inScope.has(bond.a1);
    const in2 = !inScope || inScope.has(bond.a2);
    if (!in1 && !in2) continue;
    // σ valence counts every bond of a scope atom, 1.5 as single (bonds leaving the scope too).
    const order = bond.order === 1.5 ? 1 : bond.order;
    sigma.set(bond.a1, (sigma.get(bond.a1) ?? 0) + order);
    sigma.set(bond.a2, (sigma.get(bond.a2) ?? 0) + order);
    if (bond.order === 2 || bond.order === 3) pi.add(bond.a1).add(bond.a2);
    if (bond.order === 1.5 && in1 && in2) aromatic.push(bond.id);
  }
  aromatic.sort(byIdNumber);

  const orders = new Map<BondId, 1 | 2>();
  const failures: BondId[][] = [];
  for (const system of systems(doc, aromatic)) {
    const solved = solveSystem(doc, system, sigma, pi);
    for (const id of system) orders.set(id, solved?.has(id) ? 2 : 1);
    if (!solved) failures.push(system);
  }
  return { orders, failures };
}

/** Connected components of the 1.5-bond graph, each a sorted bond list, in first-bond order. */
function systems(doc: Doc, aromatic: readonly BondId[]): BondId[][] {
  const byAtom = new Map<AtomId, BondId[]>();
  for (const id of aromatic) {
    const bond = doc.bonds[id];
    if (!bond) continue;
    for (const a of [bond.a1, bond.a2]) byAtom.set(a, [...(byAtom.get(a) ?? []), id]);
  }
  const seen = new Set<BondId>();
  const out: BondId[][] = [];
  for (const start of aromatic) {
    if (seen.has(start)) continue;
    const system: BondId[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const id = stack.pop() as BondId;
      system.push(id);
      const bond = doc.bonds[id];
      if (!bond) continue;
      for (const a of [bond.a1, bond.a2]) {
        for (const next of byAtom.get(a) ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
    }
    out.push(system.sort(byIdNumber));
  }
  return out;
}

/** The set of bonds made double, or null when no assignment covers every required atom. */
function solveSystem(
  doc: Doc,
  system: readonly BondId[],
  sigma: ReadonlyMap<AtomId, number>,
  pi: ReadonlySet<AtomId>,
): Set<BondId> | null {
  const atomIds = new Set<AtomId>();
  for (const id of system) {
    const bond = doc.bonds[id];
    if (bond) atomIds.add(bond.a1).add(bond.a2);
  }
  const atoms = [...atomIds].sort(byIdNumber);
  const index = new Map(atoms.map((a, i) => [a, i]));
  const roles = atoms.map((a) => piRole(doc.atoms[a] as Atom, sigma.get(a) ?? 0, pi.has(a)));

  // Edges usable for a double bond: both ends can take one. adj[v] = [neighbour, bond index].
  const adj: [number, number][][] = atoms.map(() => []);
  system.forEach((id, e) => {
    const bond = doc.bonds[id];
    if (!bond) return;
    const u = index.get(bond.a1) as number;
    const v = index.get(bond.a2) as number;
    if (roles[u]?.canPi && roles[v]?.canPi) {
      adj[u]?.push([v, e]);
      adj[v]?.push([u, e]);
    }
  });
  for (const list of adj) list.sort((p, q) => p[0] - q[0]);

  const n = atoms.length;
  const candidates = roles.filter((r) => r.canPi).length;
  const mate = new Int32Array(n).fill(-1); // bond index of the atom's double bond, or -1
  const excluded = new Uint8Array(n); // optional atom decided to stay unmatched
  let best: Int32Array | null = null;
  let bestScore = -1;
  let steps = 0;

  const free = (v: number): boolean => roles[v]?.canPi === true && mate[v] === -1 && !excluded[v];
  const partners = (v: number): [number, number][] => (adj[v] ?? []).filter(([u]) => free(u));

  const search = (score: number): void => {
    if (++steps > STEP_BUDGET || bestScore === candidates) return;
    // Bound: every free atom that still has a free partner could at best be matched.
    let open = 0;
    for (let v = 0; v < n; v++) if (free(v) && partners(v).length > 0) open++;
    if (score + open <= bestScore) return;

    // Most-constrained required atom first; one with no partner left is a dead end.
    let pick = -1;
    let pickOptions: [number, number][] = [];
    for (let v = 0; v < n; v++) {
      if (!roles[v]?.required || mate[v] !== -1) continue;
      const options = partners(v);
      if (options.length === 0) return;
      if (pick === -1 || options.length < pickOptions.length) {
        pick = v;
        pickOptions = options;
      }
    }
    if (pick !== -1) {
      for (const [u, e] of pickOptions) {
        mate[pick] = e;
        mate[u] = e;
        search(score + 2);
        mate[pick] = -1;
        mate[u] = -1;
      }
      return;
    }

    // Every required atom is matched: match optional atoms where possible, maximising.
    let opt = -1;
    for (let v = 0; v < n && opt === -1; v++) if (free(v) && partners(v).length > 0) opt = v;
    if (opt === -1) {
      if (score > bestScore) {
        bestScore = score;
        best = mate.slice();
      }
      return;
    }
    for (const [u, e] of partners(opt)) {
      mate[opt] = e;
      mate[u] = e;
      search(score + 2);
      mate[opt] = -1;
      mate[u] = -1;
    }
    excluded[opt] = 1;
    search(score);
    excluded[opt] = 0;
  };
  search(0);

  if (best === null) return null;
  const doubles = new Set<BondId>();
  for (const e of best as Int32Array) if (e !== -1) doubles.add(system[e] as BondId);
  // A delocalized system with no double bond at all is not one (e.g. 1.5 bonds between
  // saturated atoms): report it rather than silently drawing single bonds. Unless it touches a
  // drawn π bond: then it is part of a conjugated system (a partly toggled ring).
  return doubles.size > 0 || atoms.some((a) => pi.has(a)) ? doubles : null;
}

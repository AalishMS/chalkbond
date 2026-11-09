// Clean Structure: OCL coordinate invention, fitted back onto the drawing.
import {
  DocError,
  addBond,
  deleteItems,
  fragments,
  updateAtom,
  updateBond,
  type AtomId,
  type Bond,
  type BondId,
  type BondStereo,
  type Doc,
  type Point,
} from '../doc-model/index';
import { canonicalId } from './convert';
import { buildMolecule } from './molecule';
import { readMol, withInventedCoordinates } from './ocl';

/**
 * Re-lays out every fragment touched by `atoms` with OCL coordinate invention (bond length
 * 1.0), then fits the result onto the old positions with the best rigid rotation + translation
 * (no reflection), so the structure tidies in place and its centroid stays put. Stereo
 * configuration is preserved: the drawn wedges are kept if they still mean the same thing in the
 * new layout, otherwise OCL's choice of wedge/hash bonds replaces them.
 */
export function cleanStructure(doc: Doc, atoms: Iterable<AtomId>): Doc {
  const wanted = new Set(atoms);
  for (const id of wanted) if (!doc.atoms[id]) throw new DocError('unknown-atom', id);
  let out = doc;
  for (const frag of fragments(doc)) {
    if (frag.length > 1 && frag.some((a) => wanted.has(a))) out = cleanFragment(out, frag);
  }
  return out;
}

function cleanFragment(doc: Doc, frag: readonly AtomId[]): Doc {
  const configuration = canonicalId(doc, frag);
  const built = buildMolecule(doc, frag, { stereo: true });
  const fresh = readMol(withInventedCoordinates(built.mol));

  const old: Point[] = [];
  const raw: Point[] = [];
  for (const id of frag) {
    const a = doc.atoms[id] as { x: number; y: number };
    const p = fresh.atoms[built.atomIndex.get(id) as number] as Point;
    old.push({ x: a.x, y: a.y });
    raw.push({ x: p.x, y: p.y });
  }
  const placed = fitRigid(raw, old);
  let out = doc;
  frag.forEach((id, i) => {
    const p = placed[i] as Point;
    out = updateAtom(out, id, { x: p.x, y: p.y });
  });
  if (canonicalId(out, frag) === configuration) return out;

  // The drawn wedges mean something else in the new layout: use the ones OCL chose for it.
  const docAtomAt = new Map<number, AtomId>();
  for (const [id, k] of built.atomIndex)
    if (built.kinds.get(id) !== 'abbreviation') docAtomAt.set(k, id);
  for (const [id, k] of built.bondIndex) {
    const bond = out.bonds[id] as Bond;
    const ocl = fresh.bonds[k];
    const stereo: BondStereo =
      ocl?.kind === 'up' ? 'wedge' : ocl?.kind === 'down' ? 'hash' : 'none';
    if (stereo === 'none') {
      if (bond.stereo === 'wedge' || bond.stereo === 'hash') out = updateBond(out, id, { stereo });
      continue;
    }
    const centre = docAtomAt.get(ocl?.a1 as number);
    if (centre === bond.a1 || centre === undefined) {
      out = updateBond(out, id, { stereo });
    } else {
      out = reverseBond(out, id, stereo);
    }
  }
  return out;
}

/** Re-creates a bond with its ends swapped (a1 is the wedge's narrow end and is immutable). */
function reverseBond(doc: Doc, id: BondId, stereo: BondStereo): Doc {
  const bond = doc.bonds[id] as Bond;
  const removed = deleteItems(doc, {
    atoms: new Set(),
    bonds: new Set([id]),
    objects: new Set(),
  });
  return addBond(removed, bond.a2, bond.a1, {
    order: bond.order,
    stereo,
    doublePlacement: bond.doublePlacement,
    ...(bond.color === undefined ? {} : { color: bond.color }),
  })[0];
}

/**
 * `from` rotated and translated (no reflection) to best match `to` in the least-squares sense
 * (2D Kabsch): centroids coincide, rotation angle from the cross/dot sums.
 */
export function fitRigid(from: readonly Point[], to: readonly Point[]): Point[] {
  const n = from.length;
  const centroid = (ps: readonly Point[]): Point => ({
    x: ps.reduce((s, p) => s + p.x, 0) / n,
    y: ps.reduce((s, p) => s + p.y, 0) / n,
  });
  const cf = centroid(from);
  const ct = centroid(to);
  let dot = 0;
  let cross = 0;
  for (let i = 0; i < n; i++) {
    const f = from[i] as Point;
    const t = to[i] as Point;
    const fx = f.x - cf.x;
    const fy = f.y - cf.y;
    const tx = t.x - ct.x;
    const ty = t.y - ct.y;
    dot += fx * tx + fy * ty;
    cross += fx * ty - fy * tx;
  }
  const angle = Math.atan2(cross, dot);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return from.map((p) => {
    const x = p.x - cf.x;
    const y = p.y - cf.y;
    return { x: cos * x - sin * y + ct.x + 0, y: sin * x + cos * y + ct.y + 0 };
  });
}

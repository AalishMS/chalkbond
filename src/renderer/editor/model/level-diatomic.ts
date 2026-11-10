// N2 / N3: a structure of exactly two atoms joined by one bond is inserted lying flat.
import type { SubDoc } from '@core/doc-model';

/**
 * A fragment with exactly two atoms and one bond between them (H2, O2, Cl2, ...) is rotated about
 * its centre so the bond is horizontal, the first atom (in the order chem-core returned them) on
 * the left. Any other fragment is returned unchanged (the same object).
 */
export function levelDiatomic(sub: SubDoc): SubDoc {
  const atoms = Object.values(sub.atoms);
  const bonds = Object.values(sub.bonds);
  if (atoms.length !== 2 || bonds.length !== 1 || Object.keys(sub.objects).length > 0) return sub;
  const [first, second] = atoms;
  if (first === undefined || second === undefined) return sub;
  const half = Math.sqrt((second.x - first.x) ** 2 + (second.y - first.y) ** 2) / 2;
  const cx = (first.x + second.x) / 2;
  const cy = (first.y + second.y) / 2;
  const moved = { ...sub.atoms };
  for (const [id, atom] of Object.entries(sub.atoms)) {
    const left = atom === first;
    moved[id as keyof typeof moved] = { ...atom, x: cx + (left ? -half : half), y: cy };
  }
  return { ...sub, atoms: moved };
}

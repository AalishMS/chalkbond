// Abbreviation expansion: 'Ph' → a real phenyl ring bonded where the label was.
import {
  DocError,
  insert,
  mergeAtoms,
  neighbors,
  type Atom,
  type AtomId,
  type Doc,
  type Point,
  type SubDoc,
} from '../doc-model/index';
import { ABBREVIATIONS } from './abbreviations';
import { parseSmiles } from './convert';
import { ChemError } from './errors';
import { interpretLabel } from './labels';

/**
 * Replaces an abbreviation atom by the group's real atoms: the attachment atom takes the label
 * atom's place (and its bonds, anchors and captions, via doc-model `mergeAtoms`), and the rest
 * of the group points away from its neighbours. Aromatic groups come as circles. The label's
 * colour carries over. Throws ChemError('unknown-label') unless the atom is an abbreviation.
 */
export function expandLabel(doc: Doc, atomId: AtomId): Doc {
  const atom = doc.atoms[atomId];
  if (!atom) throw new DocError('unknown-atom', atomId);
  const interp = atom.label === undefined ? null : interpretLabel(atom.label);
  if (interp?.kind !== 'abbreviation') {
    throw new ChemError(
      'unknown-label',
      atom.label === undefined
        ? 'The atom has no label to expand.'
        : `"${atom.label}" is not an abbreviation.`,
    );
  }
  // Parsed with a '*' neighbour in front, so OCL lays the group out around a real bond.
  const smiles = (ABBREVIATIONS[interp.key] as { smiles: string }).smiles;
  const parsed = parseSmiles(`*${smiles}`);
  if (!parsed.ok) throw parsed.error;

  const group = orient(parsed.value, awayFrom(doc, atom), atom);
  const [inserted, sel] = insert(doc, group, { x: atom.x, y: atom.y });
  const attachment = sel.atoms.values().next().value as AtomId; // the group's first atom
  return mergeAtoms(inserted, attachment, atomId);
}

/** Unit vector from the atom's neighbours towards it ((1, 0) if it has none). */
function awayFrom(doc: Doc, atom: Atom): Point {
  let x = 0;
  let y = 0;
  for (const id of neighbors(doc, atom.id)) {
    const n = doc.atoms[id] as Atom;
    const len = Math.hypot(atom.x - n.x, atom.y - n.y) || 1;
    x += (atom.x - n.x) / len;
    y += (atom.y - n.y) / len;
  }
  const len = Math.hypot(x, y);
  return len < 1e-9 ? { x: 1, y: 0 } : { x: x / len, y: y / len };
}

/**
 * The group without its '*' stand-in neighbour (atom 1 of the parse), with the attachment atom
 * (atom 2) at the origin, rotated so the bond to the stand-in points back along `-dir` (towards
 * the real neighbours). The label's colour applies to every group atom.
 */
function orient(sub: SubDoc, dir: Point, label: Atom): SubDoc {
  const [star, first, ...rest] = Object.values(sub.atoms) as Atom[];
  if (!star || !first) throw new Error('abbreviation group has no atoms');
  const angle = Math.atan2(-dir.y, -dir.x) - Math.atan2(star.y - first.y, star.x - first.x);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const atoms: Record<string, Atom> = {};
  for (const a of [first, ...rest]) {
    const dx = a.x - first.x;
    const dy = a.y - first.y;
    atoms[a.id] = {
      ...a,
      x: cos * dx - sin * dy + 0,
      y: sin * dx + cos * dy + 0,
      ...(label.color === undefined ? {} : { color: label.color }),
    };
  }
  const bonds = Object.fromEntries(
    Object.entries(sub.bonds).filter(([, b]) => b.a1 !== star.id && b.a2 !== star.id),
  );
  return { ...sub, atoms, bonds };
}

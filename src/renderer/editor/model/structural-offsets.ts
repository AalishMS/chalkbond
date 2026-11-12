// R54 (svg-render S2, answered B): in structural mode an atom anchor's `offset` and the offset of
// a condition text from its arrow are drawn at the style's scale (`x bondLength`), not at
// `x ptPerBlu`. These two helpers keep the canvas where the renderer draws: an anchor is resolved
// to the BLU point that, times `ptPerBlu`, is its drawn position, and a text attached to an arrow
// that stays is moved by `r` times the pointer's delta. When skeletal, `r = 1` and both are
// exactly `resolveAnchor` and a plain translation.
import {
  resolveAnchor,
  transformItems,
  translation,
  updateObject,
  type Anchor,
  type Doc,
  type Point,
  type Selection,
} from '@core/doc-model';
import { resolveStyle, type ResolvedStyle } from '@core/svg-render';
import { expandSelection } from './selection';

type Scale = Pick<ResolvedStyle, 'bondLength' | 'ptPerBlu'>;

/** `ptPerBlu / bondLength`: 1 when skeletal, 2 in structural mode. */
const ratio = (style: Scale): number => style.ptPerBlu / style.bondLength;

/**
 * Where `anchor` is, in BLU, such that `x ptPerBlu` is where svg-render draws it: the same as
 * `resolveAnchor`, except an atom anchor's `offset` is divided by `ptPerBlu / bondLength`.
 */
export function anchorBlu(doc: Doc, anchor: Anchor, style: Scale): Point {
  const r = ratio(style);
  const atom = anchor.kind === 'atom' ? doc.atoms[anchor.atom] : undefined;
  if (r === 1 || anchor.kind !== 'atom' || atom === undefined || anchor.offset === undefined) {
    return resolveAnchor(doc, anchor);
  }
  return { x: atom.x + anchor.offset.x / r, y: atom.y + anchor.offset.y / r };
}

/**
 * `sel` translated by (`dx`, `dy`) BLU, as the pointer moved it. A text attached to an arrow that
 * does not move is drawn at its arrow's midpoint plus its offset at `bondLength`, so its stored
 * `at` moves by `r` times the delta to keep up with the pointer. Works on a draft as on a document.
 */
export function moveItems(doc: Doc, sel: Selection, dx: number, dy: number): Doc {
  const moved = transformItems(doc, sel, translation(dx, dy));
  const r = ratio(resolveStyle(doc.style));
  if (r === 1) return moved;
  const { objects } = expandSelection(doc, sel);
  let next = moved;
  for (const id of sel.objects) {
    const o = next.objects[id];
    if (o?.type !== 'text' || o.attachedTo === undefined || objects.has(o.attachedTo.arrow)) {
      continue;
    }
    next = updateObject(next, id, {
      at: { x: o.at.x + dx * (r - 1), y: o.at.y + dy * (r - 1) },
    });
  }
  return next;
}

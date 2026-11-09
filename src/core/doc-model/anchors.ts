import { assertNever } from './assert-never';
import { DocError } from './errors';
import type { Anchor, Doc } from './types';
import { checkFinite, checkPoint, invalid } from './validate';

/** Throws if the anchor refers to an unknown atom/bond or has invalid numbers. */
export function checkAnchor(doc: Doc, what: string, a: Anchor): void {
  switch (a.kind) {
    case 'point':
      checkPoint(what, a.p);
      return;
    case 'atom':
      if (!(a.atom in doc.atoms)) throw new DocError('unknown-atom', a.atom);
      if (a.offset) checkPoint(`${what} offset`, a.offset);
      return;
    case 'bond':
      if (!(a.bond in doc.bonds)) throw new DocError('unknown-bond', a.bond);
      if (a.t !== undefined) {
        checkFinite(`${what} t`, a.t);
        if (a.t < 0 || a.t > 1) invalid(`${what} t must be in [0, 1]`);
      }
      return;
    default:
      assertNever(a);
  }
}

import { assertNever } from './assert-never';
import { DocError } from './errors';
import type { Anchor, Doc, DrawObject, Point } from './types';
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

/** Where an anchor currently is: atom position + offset, or the point at `t` along a bond. */
export function resolveAnchor(doc: Doc, a: Anchor): Point {
  switch (a.kind) {
    case 'point':
      return { x: a.p.x, y: a.p.y };
    case 'atom': {
      const atom = doc.atoms[a.atom];
      if (!atom) throw new DocError('unknown-atom', a.atom);
      return { x: atom.x + (a.offset?.x ?? 0), y: atom.y + (a.offset?.y ?? 0) };
    }
    case 'bond': {
      const bond = doc.bonds[a.bond];
      if (!bond) throw new DocError('unknown-bond', a.bond);
      const p = doc.atoms[bond.a1];
      const q = doc.atoms[bond.a2];
      if (!p) throw new DocError('unknown-atom', bond.a1);
      if (!q) throw new DocError('unknown-atom', bond.a2);
      const t = a.t ?? 0.5;
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    }
    default:
      return assertNever(a);
  }
}

export type AnchorField = 'from' | 'to' | 'anchor';

/** The anchors an object holds, as [field name, anchor] pairs. */
export function anchorsOf(obj: DrawObject): [AnchorField, Anchor][] {
  switch (obj.type) {
    case 'curved-arrow':
      return [
        ['from', obj.from],
        ['to', obj.to],
      ];
    case 'callout':
      return [['anchor', obj.anchor]];
    default:
      return [];
  }
}

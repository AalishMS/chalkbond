// Valence warnings on the canvas (SPEC-editor.md "Canvas appearance", HV2, C6): shapes, the
// warning under the pointer and the cycle of the warnings button. They come from chem-core's
// `Perception.warnings` and exist only in the overlay, never in exported output (SC8).
import type { ChemWarning, Perception } from '@core/chem-core';
import type { Doc, Selection } from '@core/doc-model';
import type { Scene } from '@core/svg-render';
import { screenRect } from './frame';
import { growRect, type Rect } from './geometry';
import type { Hit } from './hit-test';
import type { OverlayGroup, OverlayShape } from './overlay';
import { bluToScreen, type Viewport } from './viewport';

/** A warned skeleton atom: circle radius, px. */
export const WARNING_CIRCLE_R = 13;
/** A warned label: px its `extents` box is grown by, and the corner radius. */
export const WARNING_LABEL_GROW = 4;
export const WARNING_RADIUS = 4;

/**
 * The warning shapes: a circle on each warned skeleton atom, a box round each warned label, and
 * a dashed line along each bond of a `cannot-kekulize` warning (its atoms get no circle).
 */
export function warningGroups(
  doc: Doc,
  perception: Perception,
  scene: Scene,
  viewport: Viewport,
): OverlayGroup[] {
  const ppb = scene.style.ptPerBlu;
  const atomShapes: OverlayShape[] = [];
  const bondShapes: OverlayShape[] = [];
  const seenAtoms = new Set<string>();
  const seenBonds = new Set<string>();
  for (const warning of perception.warnings) {
    if (warning.code !== 'cannot-kekulize') {
      for (const id of warning.atoms) {
        const atom = doc.atoms[id];
        if (!atom || seenAtoms.has(id)) continue;
        seenAtoms.add(id);
        const ink = scene.extents[`atom:${id}`];
        atomShapes.push(
          ink === undefined
            ? { kind: 'circle', c: bluToScreen(viewport, atom, ppb), r: WARNING_CIRCLE_R }
            : {
                kind: 'box',
                rect: growRect(screenRect(viewport, ink), WARNING_LABEL_GROW),
                radius: WARNING_RADIUS,
              },
        );
      }
    }
    for (const id of warning.bonds) {
      const bond = doc.bonds[id];
      const a1 = bond && doc.atoms[bond.a1];
      const a2 = bond && doc.atoms[bond.a2];
      if (!a1 || !a2 || seenBonds.has(id)) continue;
      seenBonds.add(id);
      bondShapes.push({
        kind: 'line',
        from: bluToScreen(viewport, a1, ppb),
        to: bluToScreen(viewport, a2, ppb),
      });
    }
  }
  const groups: OverlayGroup[] = [];
  if (bondShapes.length > 0) groups.push({ kind: 'warning-bond', shapes: bondShapes });
  if (atomShapes.length > 0) groups.push({ kind: 'warning', shapes: atomShapes });
  return groups;
}

/** HV2: the first warning that names the hovered atom or bond. */
export function warningAt(perception: Perception, hit: Hit | null): ChemWarning | null {
  if (hit?.kind === 'atom') {
    return perception.warnings.find((w) => w.atoms.includes(hit.id)) ?? null;
  }
  if (hit?.kind === 'bond') {
    return perception.warnings.find((w) => w.bonds.includes(hit.id)) ?? null;
  }
  return null;
}

const asSelection = (w: ChemWarning): Selection => ({
  atoms: new Set(w.atoms),
  bonds: new Set(w.bonds),
  objects: new Set(),
});

const sameSet = (a: ReadonlySet<string>, b: readonly string[]): boolean =>
  a.size === b.length && b.every((x) => a.has(x));

/**
 * C6: what the warnings button selects: the atoms and bonds of the warning after the one that is
 * selected now (the first when none is), cycling; null without warnings.
 */
export function nextWarning(perception: Perception, selection: Selection): Selection | null {
  const all = perception.warnings;
  if (all.length === 0) return null;
  const at = all.findIndex(
    (w) => sameSet(selection.atoms, w.atoms) && sameSet(selection.bonds, w.bonds),
  );
  const next = all[(at + 1) % all.length] as ChemWarning;
  return asSelection(next);
}

/**
 * Where a warning's tooltip points (HV2), canvas px: the warning box of a label, the circle's
 * bounding box of a skeleton atom, the bounding box of a bond.
 */
export function warningAnchor(
  doc: Doc,
  scene: Scene,
  viewport: Viewport,
  hit: Hit | null,
): Rect | null {
  const ppb = scene.style.ptPerBlu;
  if (hit?.kind === 'atom') {
    const atom = doc.atoms[hit.id];
    if (!atom) return null;
    const ink = scene.extents[`atom:${hit.id}`];
    if (ink !== undefined) return growRect(screenRect(viewport, ink), WARNING_LABEL_GROW);
    const c = bluToScreen(viewport, atom, ppb);
    return {
      x: c.x - WARNING_CIRCLE_R,
      y: c.y - WARNING_CIRCLE_R,
      w: 2 * WARNING_CIRCLE_R,
      h: 2 * WARNING_CIRCLE_R,
    };
  }
  if (hit?.kind === 'bond') {
    const bond = doc.bonds[hit.id];
    const a1 = bond && doc.atoms[bond.a1];
    const a2 = bond && doc.atoms[bond.a2];
    if (!a1 || !a2) return null;
    const p = bluToScreen(viewport, a1, ppb);
    const q = bluToScreen(viewport, a2, ppb);
    return {
      x: Math.min(p.x, q.x),
      y: Math.min(p.y, q.y),
      w: Math.abs(p.x - q.x),
      h: Math.abs(p.y - q.y),
    };
  }
  return null;
}

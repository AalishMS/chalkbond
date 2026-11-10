import { perceive, type Perception } from '@core/chem-core';
import {
  addAtom,
  addBond,
  emptyDoc,
  updateAtom,
  type AtomId,
  type BondId,
  type Doc,
  type ObjectId,
} from '@core/doc-model';
import { render, renderSvg } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import { canvasOverlay } from './overlay';
import { EMPTY_SELECTION } from '../state/editor-state';
import { initialViewport } from './viewport';
import { nextWarning, warningAnchor, warningAt, warningGroups } from './warnings';

const NOW = '2026-01-01T00:00:00.000Z';

/** A carbon with five single bonds: over-valent. */
function overValent(): { doc: Doc; centre: AtomId } {
  let doc = emptyDoc(NOW);
  const [d0, centre] = addAtom(doc, { element: 'C', x: 0, y: 0 });
  doc = d0;
  for (let i = 0; i < 5; i += 1) {
    const angle = (i * 2 * Math.PI) / 5;
    let leaf: AtomId;
    [doc, leaf] = addAtom(doc, { element: 'C', x: Math.cos(angle), y: Math.sin(angle) });
    [doc] = addBond(doc, centre, leaf);
  }
  return { doc, centre };
}

/** Water drawn with an `H20` label on the oxygen. */
function h20(): { doc: Doc; o: AtomId } {
  const [d1, o] = addAtom(emptyDoc(NOW), { element: 'O', x: 3, y: 2 });
  const [d2, c] = addAtom(d1, { element: 'C', x: 2, y: 2 });
  const [d3] = addBond(d2, o, c);
  return { doc: updateAtom(d3, o, { element: '*', label: 'H20' }), o };
}

/** Five 1.5 bonds round a ring: no Kekulé structure. */
function fiveRing(): { doc: Doc; bonds: BondId[] } {
  let doc = emptyDoc(NOW);
  const ids: AtomId[] = [];
  for (let i = 0; i < 5; i += 1) {
    const angle = (i * 2 * Math.PI) / 5;
    let id: AtomId;
    [doc, id] = addAtom(doc, { element: 'C', x: Math.cos(angle), y: Math.sin(angle) });
    ids.push(id);
  }
  const bonds: BondId[] = [];
  for (let i = 0; i < 5; i += 1) {
    let b: BondId;
    [doc, b] = addBond(doc, ids[i] as AtomId, ids[(i + 1) % 5] as AtomId, { order: 1.5 });
    bonds.push(b);
  }
  return { doc, bonds };
}

const view = (doc: Doc, perception: Perception) => {
  const scene = render(doc, { perception });
  const viewport = initialViewport(scene.bounds, { w: 1200, h: 700 }, scene.style.bondLength);
  return { scene, viewport, perception };
};

describe('warningGroups (E24)', () => {
  it('draws nothing for a document without warnings', () => {
    const [doc] = addAtom(emptyDoc(NOW), { element: 'C', x: 0, y: 0 });
    const v = view(doc, perceive(doc));
    expect(warningGroups(doc, v.perception, v.scene, v.viewport)).toEqual([]);
  });

  it('an over-valent skeleton carbon gets a dashed circle of r 13 on it', () => {
    const { doc, centre } = overValent();
    const p = perceive(doc);
    expect(p.warnings.map((w) => w.code)).toContain('over-valence');
    const v = view(doc, p);
    const groups = warningGroups(doc, p, v.scene, v.viewport);
    const atoms = groups.find((g) => g.kind === 'warning');
    expect(atoms?.shapes).toHaveLength(1);
    const shape = atoms?.shapes[0];
    expect(shape).toMatchObject({ kind: 'circle', r: 13 });
    expect(centre).toBeDefined();
  });

  it('an atom that draws a label gets a box round its extents plus 4 px, radius 4', () => {
    const { doc, o } = h20();
    const p = perceive(doc);
    expect(p.warnings.map((w) => w.code)).toEqual(['unknown-label']);
    const v = view(doc, p);
    const ink = v.scene.extents[`atom:${o}`];
    expect(ink).toBeDefined();
    const shape = warningGroups(doc, p, v.scene, v.viewport)[0]?.shapes[0];
    expect(shape?.kind).toBe('box');
    if (shape?.kind !== 'box') return;
    expect(shape.radius).toBe(4);
    // Wider than the ink by 8 px (4 each side) at this zoom.
    const k = v.viewport.zoom * (4 / 3);
    expect(shape.rect.w).toBeCloseTo((ink?.w ?? 0) * k + 8, 6);
    expect(shape.rect.h).toBeCloseTo((ink?.h ?? 0) * k + 8, 6);
  });

  it('cannot-kekulize marks its bonds with 3 px dashed lines, and no circle on the atoms', () => {
    const { doc, bonds } = fiveRing();
    const p = perceive(doc);
    expect(p.warnings.map((w) => w.code)).toContain('cannot-kekulize');
    const v = view(doc, p);
    const groups = warningGroups(doc, p, v.scene, v.viewport);
    const lines = groups.find((g) => g.kind === 'warning-bond');
    expect(lines?.shapes).toHaveLength(bonds.length);
    expect(lines?.shapes.every((s) => s.kind === 'line')).toBe(true);
    expect(groups.find((g) => g.kind === 'warning')).toBeUndefined();
  });

  it('is part of the canvas overlay', () => {
    const { doc } = h20();
    const p = perceive(doc);
    const v = view(doc, p);
    const groups = canvasOverlay({
      hover: null,
      selection: EMPTY_SELECTION,
      gesture: null,
      preview: null,
      doc,
      scene: v.scene,
      viewport: v.viewport,
      perception: p,
    });
    expect(groups.map((g) => g.kind)).toContain('warning');
  });
});

describe('warnings never reach the output (SC8)', () => {
  it('renderSvg of a document with an H20 label and an over-valent carbon has no warning colour', () => {
    for (const { doc } of [h20(), overValent(), fiveRing()]) {
      expect(renderSvg(doc).svg.toLowerCase()).not.toContain('#b42318');
    }
  });
});

describe('warningAt (HV2)', () => {
  it("finds the warning of a hovered atom, with chem-core's message", () => {
    const { doc, o } = h20();
    const w = warningAt(perceive(doc), { kind: 'atom', id: o });
    expect(w?.message).toBe('Unknown label "H20".');
  });

  it('finds the warning of a hovered bond (cannot-kekulize)', () => {
    const { doc, bonds } = fiveRing();
    const w = warningAt(perceive(doc), { kind: 'bond', id: bonds[0] as BondId });
    expect(w?.code).toBe('cannot-kekulize');
  });

  it('is null for an item without one, for a null hover and for an object', () => {
    const { doc, o } = h20();
    const p = perceive(doc);
    const other = Object.keys(doc.atoms).find((id) => id !== o) as AtomId;
    expect(warningAt(p, { kind: 'atom', id: other })).toBeNull();
    expect(warningAt(p, null)).toBeNull();
  });
});

describe('nextWarning (C6)', () => {
  const twoWarnings = (): { doc: Doc; p: Perception } => {
    const { doc } = h20();
    const [d2, a] = addAtom(doc, { element: 'C', x: 8, y: 8 });
    const d3 = updateAtom(d2, a, { element: '*', label: 'Q9' });
    return { doc: d3, p: perceive(d3) };
  };

  it('is null without warnings', () => {
    expect(nextWarning(perceive(emptyDoc(NOW)), EMPTY_SELECTION)).toBeNull();
  });

  it('the first press takes the first warning, later presses cycle in order', () => {
    const { p } = twoWarnings();
    expect(p.warnings).toHaveLength(2);
    const first = nextWarning(p, EMPTY_SELECTION);
    expect([...(first?.atoms ?? [])]).toEqual([...(p.warnings[0]?.atoms ?? [])]);
    const second = nextWarning(p, first as never);
    expect([...(second?.atoms ?? [])]).toEqual([...(p.warnings[1]?.atoms ?? [])]);
    const third = nextWarning(p, second as never);
    expect([...(third?.atoms ?? [])]).toEqual([...(p.warnings[0]?.atoms ?? [])]);
  });

  it('a selection of something else starts again at the first warning', () => {
    const { doc, p } = twoWarnings();
    const warned = new Set(p.warnings.flatMap((w) => w.atoms));
    const other = Object.keys(doc.atoms).find((id) => !warned.has(id as AtomId)) as AtomId;
    const sel = { atoms: new Set([other]), bonds: new Set<BondId>(), objects: new Set<ObjectId>() };
    expect([...(nextWarning(p, sel)?.atoms ?? [])]).toEqual([...(p.warnings[0]?.atoms ?? [])]);
  });
});

describe('warningAnchor (HV2)', () => {
  it('is the box of a warned label, the circle of a skeleton atom, the segment of a bond, in canvas px', () => {
    const { doc, o } = h20();
    const p = perceive(doc);
    const v = view(doc, p);
    const label = warningAnchor(doc, v.scene, v.viewport, { kind: 'atom', id: o });
    const group = warningGroups(doc, p, v.scene, v.viewport)[0]?.shapes[0];
    expect(group?.kind === 'box' && label).toEqual(group?.kind === 'box' ? group.rect : null);

    const bad = overValent();
    const bp = perceive(bad.doc);
    const bv = view(bad.doc, bp);
    const circle = warningAnchor(bad.doc, bv.scene, bv.viewport, { kind: 'atom', id: bad.centre });
    expect(circle?.w).toBe(26);
    expect(circle?.h).toBe(26);

    const ring = fiveRing();
    const rp = perceive(ring.doc);
    const rv = view(ring.doc, rp);
    const seg = warningAnchor(ring.doc, rv.scene, rv.viewport, {
      kind: 'bond',
      id: ring.bonds[0] as BondId,
    });
    expect(seg?.w).toBeGreaterThan(0);
    expect(warningAnchor(ring.doc, rv.scene, rv.viewport, null)).toBeNull();
  });
});

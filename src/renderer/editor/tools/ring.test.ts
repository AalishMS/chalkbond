import { formulaOf } from '@core/chem-core';
import {
  addAtom,
  addBond,
  emptyDoc,
  updateAtom,
  type AtomId,
  type BondId,
  type Doc,
} from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { formulaText } from '../model/formula';
import type { Preview } from '../state/editor-state';
import { ringTool } from './ring';
import { DRAG_PX } from './tool';
import { at, atomsOf, click, context, moveAt, NOW, rig, screenOf, send, type Rig } from './testing';

const ringRig = (doc: Doc = emptyDoc(NOW), variant = 'benzene'): Rig => rig(ringTool, doc, variant);
const CLICK = screenOf({ x: 2, y: 2 });
const formula = (d: Doc): string => formulaText(formulaOf(d, atomsOf(d)));
const hover = (r: Rig, screen: { x: number; y: number }, hit = null as never): Preview | null =>
  ringTool.hover?.(moveAt(screen), context(r, hit)) ?? null;

describe('Ring click', () => {
  it('benzene on empty canvas: one Add ring step, C6H6', () => {
    const r = ringRig();
    click(r, CLICK);
    expect(r.commits).toHaveLength(1);
    expect(r.commits[0]?.label).toBe('Add ring');
    expect(formula(r.doc)).toBe('C6H6 · 78.11 g/mol');
  });

  it('the option picks the template', () => {
    for (const [variant, n] of [
      ['cyclohexane', 6],
      ['cyclopentane', 5],
      ['cyclobutane', 4],
      ['cyclopropane', 3],
    ] as const) {
      const r = ringRig(emptyDoc(NOW), variant);
      click(r, CLICK);
      expect(atomsOf(r.doc)).toHaveLength(n);
    }
  });

  it('a second benzene clicked on a bond of the first makes naphthalene, C10H8', () => {
    const r = ringRig();
    click(r, CLICK);
    const [a1, a2] = Object.values(r.doc.bonds)[0]
      ? [Object.values(r.doc.bonds)[0]?.a1, Object.values(r.doc.bonds)[0]?.a2]
      : [];
    const pa = r.doc.atoms[a1 as AtomId] as { x: number; y: number };
    const pb = r.doc.atoms[a2 as AtomId] as { x: number; y: number };
    click(r, screenOf({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }));
    expect(r.commits).toHaveLength(2);
    expect(formula(r.doc)).toBe('C10H8 · 128.17 g/mol');
  });

  it('a click on an atom attaches the ring there', () => {
    const [d, a] = addAtom(emptyDoc(NOW), { element: 'C', x: 2, y: 2 });
    const r = ringRig(d, 'cyclohexane');
    click(r, CLICK);
    expect(atomsOf(r.doc)).toHaveLength(6);
    expect(r.doc.atoms[a]).toEqual(d.atoms[a]);
  });

  it('a press released more than 4 px away adds nothing', () => {
    const r = ringRig();
    send(r, at(CLICK, 'down'));
    send(r, at({ x: CLICK.x + DRAG_PX + 5, y: CLICK.y }, 'move'));
    send(r, at({ x: CLICK.x + DRAG_PX + 5, y: CLICK.y }, 'up'));
    expect(r.commits).toHaveLength(0);
    expect(r.gesture).toBeNull();
  });

  it('Esc cancels a press', () => {
    const r = ringRig();
    send(r, at(CLICK, 'down'));
    send(r, { type: 'cancel' });
    expect(r.gesture).toBeNull();
    expect(r.commits).toHaveLength(0);
  });
});

describe('Ring hover ghost', () => {
  it('over empty canvas: the ring centred on the pointer, with its circle, as the click commits', () => {
    const r = ringRig();
    const ghost = hover(r, CLICK) as Preview;
    expect(ghost.hovering).toBe(true);
    expect([...ghost.added].filter((k) => k.startsWith('atom:'))).toHaveLength(6);
    expect([...ghost.added].filter((k) => k.startsWith('bond:'))).toHaveLength(6);
    expect([...ghost.added].some((k) => k.startsWith('ring:'))).toBe(true);
    click(r, CLICK);
    expect(r.doc).toEqual(ghost.doc);
  });

  it('over a bond: the ghost is the fused ring', () => {
    const r = ringRig(emptyDoc(NOW), 'cyclohexane');
    click(r, CLICK);
    const bond = Object.values(r.doc.bonds)[0] as Doc['bonds'][BondId];
    const pa = r.doc.atoms[bond.a1] as { x: number; y: number };
    const pb = r.doc.atoms[bond.a2] as { x: number; y: number };
    const mid = screenOf({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 });
    const ghost = hover(r, mid, { kind: 'bond', id: bond.id } as never) as Preview;
    expect([...ghost.added].filter((k) => k.startsWith('atom:'))).toHaveLength(4);
  });

  it('over an atom that draws a label: no ghost (HV4)', () => {
    const [d, a] = addAtom(emptyDoc(NOW), { element: 'O', x: 2, y: 2 });
    const r = ringRig(d);
    expect(hover(r, CLICK, { kind: 'atom', id: a } as never)).toBeNull();
  });

  it('over a skeleton atom: the ghost shares it', () => {
    const [d1, a] = addAtom(emptyDoc(NOW), { element: 'C', x: 2, y: 2 });
    const [d2, b] = addAtom(d1, { element: 'C', x: 3, y: 2 });
    let d = d2;
    d = addBond(d, a, b)[0];
    d = updateAtom(d, b, { charge: 0 });
    const r = ringRig(d, 'cyclopentane');
    const ghost = hover(r, CLICK, { kind: 'atom', id: a } as never) as Preview;
    expect([...ghost.added].filter((k) => k.startsWith('atom:'))).toHaveLength(4);
  });
});

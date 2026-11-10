import { describe, expect, it } from 'vitest';
import { perceive } from '@core/chem-core';
import { addAtom, addBond, emptyDoc, type Doc } from '@core/doc-model';
import { render } from '@core/svg-render';
import { createDerive } from './derive';

const base = emptyDoc('2026-01-01T00:00:00.000Z');

function ethane(): Doc {
  const [d1, a] = addAtom(base, { element: 'C', x: 0, y: 0 });
  const [d2, b] = addAtom(d1, { element: 'C', x: 1, y: 0 });
  const [d3] = addBond(d2, a, b, { order: 1 });
  return d3;
}

describe('createDerive', () => {
  it('derives perception and scene of a document', () => {
    const doc = ethane();
    const derived = createDerive().committed(doc);
    expect(derived.doc).toBe(doc);
    expect(derived.perception).toEqual(perceive(doc));
    expect(derived.scene).toEqual(render(doc));
    expect(derived.scene.parts.length).toBeGreaterThan(0);
  });

  it('the same doc object gives the same derived object', () => {
    const derive = createDerive();
    const doc = ethane();
    expect(derive.committed(doc)).toBe(derive.committed(doc));
    expect(derive.committed(doc).scene).toBe(derive.committed(doc).scene);
  });

  it('a changed doc gives a new scene; an equal-looking copy is a different doc', () => {
    const derive = createDerive();
    const doc = ethane();
    const first = derive.committed(doc);
    const [moved] = addAtom(doc, { element: 'O', x: 2, y: 0 });
    const second = derive.committed(moved);
    expect(second).not.toBe(first);
    expect(second.scene).not.toBe(first.scene);
    expect(second.scene.parts.length).toBeGreaterThan(first.scene.parts.length);
    // One entry only: going back recomputes.
    expect(derive.committed(doc)).not.toBe(first);
  });

  it('the preview has its own one-entry cache that committed docs do not evict', () => {
    const derive = createDerive();
    const doc = ethane();
    const [ghost] = addAtom(doc, { element: 'N', x: 0, y: 1 });
    const p = derive.preview(ghost);
    const c = derive.committed(doc);
    expect(derive.preview(ghost)).toBe(p);
    expect(derive.committed(doc)).toBe(c);
    expect(p.scene).not.toBe(c.scene);
    const [other] = addAtom(doc, { element: 'S', x: 0, y: 1 });
    expect(derive.preview(other)).not.toBe(p);
    expect(derive.committed(doc)).toBe(c);
  });

  it('two derivers do not share caches', () => {
    const doc = ethane();
    expect(createDerive().committed(doc)).not.toBe(createDerive().committed(doc));
  });

  it('shares one perceiver: perception of a preview equals a fresh perceive', () => {
    const derive = createDerive();
    const doc = ethane();
    derive.committed(doc);
    const [ghost] = addAtom(doc, { element: 'O', x: 3, y: 0 });
    expect(derive.preview(ghost).perception).toEqual(perceive(ghost));
  });
});

import { enablePatches, produceWithPatches } from 'immer';
import { describe, expect, it } from 'vitest';
import { addAtom, neighbors, updateAtom } from './atoms';
import { addBond, findBond, updateBond } from './bonds';
import { emptyDoc } from './doc';
import { DocError, type DocErrorCode } from './errors';
import { checkInvariants } from './invariants';
import type { AtomId, BondId, Doc } from './types';

const NOW = '2026-11-09T00:00:00.000Z';

function expectDocError(fn: () => unknown, code: DocErrorCode): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DocError);
    expect((e as DocError).code).toBe(code);
    return;
  }
  throw new Error(`expected DocError '${code}'`);
}

/** Two bonded carbons: a1–a2 via b3. */
function ethane(): Doc {
  let doc = emptyDoc(NOW);
  [doc] = addAtom(doc, { x: 0, y: 0 });
  [doc] = addAtom(doc, { x: 1, y: 0 });
  [doc] = addBond(doc, 'a1' as AtomId, 'a2' as AtomId);
  return doc;
}

function hexagon(): Doc {
  let doc = emptyDoc(NOW);
  const atoms: AtomId[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    let id: AtomId;
    [doc, id] = addAtom(doc, { x: Math.cos(angle), y: Math.sin(angle) });
    atoms.push(id);
  }
  for (let i = 0; i < 6; i++) {
    [doc] = addBond(doc, atoms[i]!, atoms[(i + 1) % 6]!, { order: i % 2 === 0 ? 1 : 2 });
  }
  return doc;
}

describe('addAtom', () => {
  it('adds a neutral carbon by default, with an id from nextId', () => {
    const [doc, id] = addAtom(emptyDoc(NOW), { x: 1.5, y: -2 });
    expect(id).toBe('a1');
    expect(doc.nextId).toBe(2);
    expect(doc.atoms[id]).toEqual({ id: 'a1', x: 1.5, y: -2, element: 'C', charge: 0, radical: 0 });
  });

  it('keeps given fields and ignores a caller-supplied id', () => {
    const init = { x: 0, y: 0, element: 'O', charge: -1, label: 'OMe', id: 'a99' as AtomId };
    const [doc, id] = addAtom(emptyDoc(NOW), init);
    expect(id).toBe('a1');
    expect(doc.atoms[id]).toMatchObject({ id: 'a1', element: 'O', charge: -1, label: 'OMe' });
  });

  it('drops undefined optional fields instead of storing them', () => {
    const [doc, id] = addAtom(emptyDoc(NOW), { x: 0, y: 0, label: undefined });
    expect('label' in doc.atoms[id]!).toBe(false);
  });

  it('does not change the input doc and returns a frozen doc', () => {
    const before = emptyDoc(NOW);
    const [after] = addAtom(before, { x: 0, y: 0 });
    expect(before.atoms).toEqual({});
    expect(before.nextId).toBe(1);
    expect(Object.isFrozen(after)).toBe(true);
  });

  it.each([
    ['unknown element', { x: 0, y: 0, element: 'Q' }],
    ['charge +5', { x: 0, y: 0, charge: 5 }],
    ['fractional charge', { x: 0, y: 0, charge: 0.5 }],
    ['NaN position', { x: NaN, y: 0 }],
    ['bad colour', { x: 0, y: 0, color: 'red' as `#${string}` }],
  ])('rejects %s', (_name, init) => {
    expectDocError(() => addAtom(emptyDoc(NOW), init), 'invalid-value');
  });
});

describe('updateAtom', () => {
  it('patches fields and leaves the rest', () => {
    const doc = updateAtom(ethane(), 'a1' as AtomId, { element: 'N', charge: 1 });
    expect(doc.atoms['a1' as AtomId]).toEqual({
      id: 'a1',
      x: 0,
      y: 0,
      element: 'N',
      charge: 1,
      radical: 0,
    });
  });

  it('clears an optional field when patched with undefined', () => {
    let doc = updateAtom(ethane(), 'a1' as AtomId, { label: 'Ph' });
    doc = updateAtom(doc, 'a1' as AtomId, { label: undefined });
    expect('label' in doc.atoms['a1' as AtomId]!).toBe(false);
  });

  it('cannot remove a required field or change the id', () => {
    expectDocError(() => updateAtom(ethane(), 'a1' as AtomId, { x: undefined }), 'invalid-value');
    const patch = { id: 'a7' } as unknown as { x: number };
    expect(updateAtom(ethane(), 'a1' as AtomId, patch).atoms['a1' as AtomId]?.id).toBe('a1');
  });

  it('rejects invalid values and unknown atoms', () => {
    expectDocError(() => updateAtom(ethane(), 'a1' as AtomId, { charge: -5 }), 'invalid-value');
    expectDocError(() => updateAtom(ethane(), 'a9' as AtomId, { charge: 0 }), 'unknown-atom');
  });
});

describe('addBond', () => {
  it('adds a single bond with defaults', () => {
    const doc = ethane();
    expect(doc.bonds['b3' as BondId]).toEqual({
      id: 'b3',
      a1: 'a1',
      a2: 'a2',
      order: 1,
      stereo: 'none',
      doublePlacement: 'auto',
    });
  });

  it('rejects self-bonds', () => {
    expectDocError(() => addBond(ethane(), 'a1' as AtomId, 'a1' as AtomId), 'self-bond');
  });

  it.each([
    ['same direction', 'a1', 'a2'],
    ['reverse direction', 'a2', 'a1'],
  ])('rejects a duplicate pair (%s)', (_name, p, q) => {
    expectDocError(() => addBond(ethane(), p as AtomId, q as AtomId), 'duplicate-bond');
  });

  it('rejects unknown atoms on either end', () => {
    expectDocError(() => addBond(ethane(), 'a9' as AtomId, 'a1' as AtomId), 'unknown-atom');
    expectDocError(() => addBond(ethane(), 'a1' as AtomId, 'a9' as AtomId), 'unknown-atom');
  });

  it('rejects an invalid order or colour', () => {
    let doc = ethane();
    [doc] = addAtom(doc, { x: 2, y: 0 });
    const a3 = 'a4' as AtomId;
    expectDocError(() => addBond(doc, 'a2' as AtomId, a3, { order: 4 as 1 }), 'invalid-value');
    expectDocError(() => addBond(doc, 'a2' as AtomId, a3, { color: '#12' }), 'invalid-value');
  });

  it('ignores caller-supplied endpoints or id in init', () => {
    let doc = ethane();
    [doc] = addAtom(doc, { x: 2, y: 0 });
    const init = { a1: 'a1', id: 'b1' } as unknown as { order: 1 };
    const [next, id] = addBond(doc, 'a2' as AtomId, 'a4' as AtomId, init);
    expect(next.bonds[id]).toMatchObject({ id: 'b5', a1: 'a2', a2: 'a4' });
  });
});

describe('updateBond', () => {
  it('patches order/stereo but never endpoints', () => {
    const patch = { order: 2, stereo: 'wedge', a1: 'a2' } as unknown as { order: 2 };
    const doc = updateBond(ethane(), 'b3' as BondId, patch);
    expect(doc.bonds['b3' as BondId]).toMatchObject({
      a1: 'a1',
      a2: 'a2',
      order: 2,
      stereo: 'wedge',
    });
  });

  it('clears an optional colour and rejects removing a required field', () => {
    let doc = updateBond(ethane(), 'b3' as BondId, { color: '#ff0000' });
    doc = updateBond(doc, 'b3' as BondId, { color: undefined });
    expect('color' in doc.bonds['b3' as BondId]!).toBe(false);
    expectDocError(() => updateBond(doc, 'b3' as BondId, { order: undefined }), 'invalid-value');
  });

  it('rejects unknown bonds and invalid values', () => {
    expectDocError(() => updateBond(ethane(), 'b9' as BondId, { order: 2 }), 'unknown-bond');
    expectDocError(() => updateBond(ethane(), 'b3' as BondId, { order: 0 as 1 }), 'invalid-value');
  });
});

describe('neighbors / findBond', () => {
  it('returns bonded atoms sorted by id number', () => {
    const doc = hexagon();
    expect(neighbors(doc, 'a1' as AtomId)).toEqual(['a2', 'a6']);
    expect(neighbors(doc, 'a4' as AtomId)).toEqual(['a3', 'a5']);
  });

  it('sorts numerically, not lexically', () => {
    let doc = emptyDoc(NOW);
    const ids: AtomId[] = [];
    for (let i = 0; i < 11; i++) {
      let id: AtomId;
      [doc, id] = addAtom(doc, { x: i, y: 0 });
      ids.push(id);
    }
    [doc] = addBond(doc, ids[0]!, ids[10]!); // a1–a11
    [doc] = addBond(doc, ids[0]!, ids[1]!); // a1–a2
    expect(neighbors(doc, ids[0]!)).toEqual(['a2', 'a11']);
  });

  it('isolated atom has no neighbours; unknown atom throws', () => {
    const [doc, id] = addAtom(emptyDoc(NOW), { x: 0, y: 0 });
    expect(neighbors(doc, id)).toEqual([]);
    expectDocError(() => neighbors(doc, 'a5' as AtomId), 'unknown-atom');
  });

  it('findBond works in both directions', () => {
    const doc = ethane();
    expect(findBond(doc, 'a1' as AtomId, 'a2' as AtomId)).toBe('b3');
    expect(findBond(doc, 'a2' as AtomId, 'a1' as AtomId)).toBe('b3');
    expect(findBond(doc, 'a1' as AtomId, 'a1' as AtomId)).toBeUndefined();
  });
});

describe('six-membered ring with alternating bonds', () => {
  it('has 6 atoms a1…a6, 6 bonds b7…b12 and no invariant violations', () => {
    const doc = hexagon();
    expect(Object.keys(doc.atoms)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
    expect(Object.keys(doc.bonds)).toEqual(['b7', 'b8', 'b9', 'b10', 'b11', 'b12']);
    expect(Object.values(doc.bonds).map((b) => b.order)).toEqual([1, 2, 1, 2, 1, 2]);
    expect(doc.nextId).toBe(13);
    expect(checkInvariants(doc)).toEqual([]);
  });
});

describe('ops on an Immer draft (as inside transact)', () => {
  it('mutate the draft in place and yield fine-grained patches', () => {
    enablePatches();
    const base = ethane();
    const [next, patches, inverse] = produceWithPatches(base, (draft) => {
      const d = draft as unknown as Doc;
      const [d2, id] = addAtom(d, { x: 2, y: 0 });
      expect(d2).toBe(d);
      const [d3] = addBond(d2, 'a2' as AtomId, id);
      updateAtom(d3, 'a1' as AtomId, { element: 'O' });
    });
    expect(Object.keys(next.atoms)).toEqual(['a1', 'a2', 'a4']);
    expect(next.atoms['a1' as AtomId]?.element).toBe('O');
    expect(patches.every((p) => p.path.length > 0)).toBe(true);
    expect(patches.map((p) => p.path.join('.'))).toEqual(
      expect.arrayContaining(['atoms.a4', 'bonds.b5', 'atoms.a1.element', 'nextId']),
    );
    expect(inverse.length).toBeGreaterThan(0);
  });
});

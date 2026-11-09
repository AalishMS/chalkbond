import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addBond,
  addObject,
  transformItems,
  translation,
  updateAtom,
  updateBond,
  type AtomId,
  type Doc,
} from '../doc-model/index';
import { AROMATICS, build } from './__fixtures__/build';
import * as ocl from './ocl';

type OclModule = typeof ocl;
import { perceive } from './perceive';
import { PERCEIVER_CACHE_SIZE, createPerceiver } from './perceiver';

// Count OCL molecule builds: one per fragment actually (re)perceived.
vi.mock('./ocl', async (importOriginal) => {
  const actual = await importOriginal<OclModule>();
  return { ...actual, buildMol: vi.fn((spec: ocl.MolSpec) => actual.buildMol(spec)) };
});
const builds = () => vi.mocked(ocl.buildMol).mock.calls.length;

/** Ten fragments: benzene, ethanol, water ×8 — laid out on a row. */
function tenFragments(): { doc: Doc; benzene: AtomId[]; ethanol: AtomId[] } {
  const b = build(AROMATICS.benzene!.atoms, AROMATICS.benzene!.bonds);
  const e = build(
    ['C', 'C', 'O'],
    [
      [0, 1],
      [1, 2],
    ],
    { doc: b.doc, at: { x: 4, y: 0 } },
  );
  let doc = e.doc;
  for (let i = 0; i < 8; i++) doc = build(['O'], [], { doc, at: { x: 8 + 2 * i, y: 0 } }).doc;
  return { doc, benzene: b.atoms, ethanol: e.atoms };
}

describe('createPerceiver', () => {
  // Braces matter: a function returned from beforeEach is run as a cleanup hook.
  beforeEach(() => {
    vi.mocked(ocl.buildMol).mockClear();
  });

  it('gives the same result as perceive', () => {
    const { doc } = tenFragments();
    expect(createPerceiver()(doc)).toEqual(perceive(doc));
  });

  it('rebuilds nothing when atoms move or draw objects are added or recoloured', () => {
    const { doc, benzene } = tenFragments();
    const perceiver = createPerceiver();
    perceiver(doc);
    expect(builds()).toBe(10);

    const moved = transformItems(
      doc,
      { atoms: new Set(benzene), bonds: new Set(), objects: new Set() },
      translation(3, 1),
    );
    const [withArrow] = addObject(moved, {
      type: 'arrow',
      kind: 'forward',
      from: { x: 0, y: 5 },
      to: { x: 3, y: 5 },
    });
    const recoloured = updateAtom(withArrow, benzene[0]!, { color: '#ff0000' });
    const wedged = updateBond(recoloured, Object.keys(doc.bonds)[0] as never, { stereo: 'wedge' });
    const p = perceiver(wedged);
    expect(builds()).toBe(10);
    expect(p).toEqual(perceive(wedged));
  });

  it('rebuilds only the fragment an edit touched', () => {
    const { doc, ethanol } = tenFragments();
    const perceiver = createPerceiver();
    perceiver(doc);
    const edited = updateAtom(doc, ethanol[2]!, { element: 'N' });
    const p = perceiver(edited);
    expect(builds()).toBe(11);
    expect(p.fragments[1]!.formula.hill).toBe('C2H7N');
    // A label change counts as chemistry too.
    perceiver(updateAtom(edited, ethanol[0]!, { label: 'Ph' }));
    expect(builds()).toBe(12);
  });

  it('re-perceives when bonds join two fragments, and on bond-order changes', () => {
    const { doc, benzene, ethanol } = tenFragments();
    const perceiver = createPerceiver();
    perceiver(doc);
    const [joined] = addBond(doc, benzene[0]!, ethanol[0]!);
    const p = perceiver(joined);
    expect(builds()).toBe(11); // the new combined fragment only
    expect(p.fragments[0]!.formula.hill).toBe('C8H10O');
    expect(p).toEqual(perceive(joined));
  });

  it('keeps the cache bounded, dropping the least recently used fragment', () => {
    const perceiver = createPerceiver();
    const base = build(['C'], []);
    const withIsotope = (n: number) => updateAtom(base.doc, base.atoms[0]!, { isotope: n });
    // One fragment whose chemistry differs every call: one new cache entry each time.
    for (let n = 1; n <= PERCEIVER_CACHE_SIZE + 44; n++) perceiver(withIsotope(n));
    vi.mocked(ocl.buildMol).mockClear();
    perceiver(withIsotope(PERCEIVER_CACHE_SIZE + 44)); // most recent: cached
    expect(builds()).toBe(0);
    perceiver(withIsotope(1)); // oldest: evicted
    expect(builds()).toBe(1);
  });
});

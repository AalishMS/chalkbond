// Fixed counterexample from fast-check seed -543139787 (chem-core.prop.test.ts, the
// cleanStructure property) during C8 coverage. The doc is CH3–CH=OMe: a double bond to the
// monovalent OMe group. Expanded, its O is trivalent and the C=O "E/Z" is decided by the hidden
// methyl, whose position follows the group's own layout, not the drawing; so cleaning twice
// flipped it. That is invalid chemistry the drawing does not define (SPEC-chem-core.md C9),
// and perception now says so with an `abbreviation-bonds` warning, which the property's
// valid-chemistry guard reads. The guard-free assertions still hold.
import { expect, it } from 'vitest';
import { run } from '../doc-model/__fixtures__/arbitraries';
import { createHistory, current, emptyDoc, type AtomId } from '../doc-model';
import { cleanStructure } from './clean';
import { canonicalId } from './convert';
import { perceive } from './perceive';

it('flags a double bond to OMe and keeps formula and structure through cleaning', () => {
  const now = '2026-11-11T00:00:00Z';
  let history = createHistory(emptyDoc(now), { clock: () => now });
  const commands: Parameters<typeof run>[1][] = [
    { op: 'addAtom', at: { x: 0, y: 0 }, element: 'C', charge: 0 },
    { op: 'updateAtom', i: 0, element: 'C', label: 'OMe', color: undefined },
    { op: 'addAtom', at: { x: 0, y: 0 }, element: 'C', charge: 0 },
    { op: 'delete', picks: { atoms: [0], bonds: [], objects: [] } },
    { op: 'undo' },
    { op: 'addBond', i: 0, j: 381, order: 2 },
    { op: 'addAtom', at: { x: 0, y: 0 }, element: 'C', charge: 0 },
    { op: 'addBond', i: 20, j: 0, order: 1 },
    { op: 'redo' },
  ];
  for (const command of commands) history = run(history, command);
  const doc = current(history);
  const ome = Object.values(doc.atoms).find((a) => a.label === 'OMe');
  expect(perceive(doc).warnings).toEqual([
    expect.objectContaining({ code: 'abbreviation-bonds', atoms: [ome?.id] }),
  ]);
  const ids = Object.keys(doc.atoms) as AtomId[];
  const hills = (d: typeof doc) => perceive(d).fragments.map((f) => f.formula.text);
  const cleaned = cleanStructure(doc, ids);
  expect(hills(cleaned)).toEqual(hills(doc));
  expect(canonicalId(cleaned, undefined, { stereo: false })).toBe(
    canonicalId(doc, undefined, { stereo: false }),
  );
});

it('keeps a cleaned configuration stable with a single-bonded OMe next to a C=C', () => {
  // CH3–CH=CH–OMe: E/Z is defined by the drawn O, so a second clean changes nothing.
  const now = '2026-11-11T00:00:00Z';
  let history = createHistory(emptyDoc(now), { clock: () => now });
  const commands: Parameters<typeof run>[1][] = [
    { op: 'addAtom', at: { x: 0, y: 0 }, element: 'C', charge: 0 },
    { op: 'addAtom', at: { x: 1, y: 0 }, element: 'C', charge: 0 },
    { op: 'addAtom', at: { x: 1.5, y: 0.8 }, element: 'C', charge: 0 },
    { op: 'addAtom', at: { x: 2.5, y: 0.8 }, element: 'C', charge: 0 },
    { op: 'updateAtom', i: 3, element: 'C', label: 'OMe', color: undefined },
    { op: 'addBond', i: 0, j: 1, order: 1 },
    { op: 'addBond', i: 1, j: 2, order: 2 },
    { op: 'addBond', i: 2, j: 3, order: 1 },
  ];
  for (const command of commands) history = run(history, command);
  const doc = current(history);
  expect(perceive(doc).warnings).toEqual([]);
  const ids = Object.keys(doc.atoms) as AtomId[];
  const cleaned = cleanStructure(doc, ids);
  expect(canonicalId(cleaned)).toBe(canonicalId(doc));
  expect(canonicalId(cleanStructure(cleaned, ids))).toBe(canonicalId(cleaned));
});

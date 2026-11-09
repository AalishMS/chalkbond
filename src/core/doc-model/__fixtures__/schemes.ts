import { addAtom } from '../atoms';
import { addBond } from '../bonds';
import { emptyDoc } from '../doc';
import { addObject } from '../objects';
import type { AtomId, BondId, BondOrder, Doc, ObjectId, TextRun } from '../types';

// Builders for the golden fixtures in this folder (benzene.chalk, two-step-reaction.chalk,
// mechanism.chalk). The .chalk files are `serialize` output of these docs.

export const FIXTURE_TIME = '2026-11-09T00:00:00.000Z';
const S = 0.866; // cos 30°, rounded so the files stay readable

type AtomSpec = [
  x: number,
  y: number,
  extra?: Parameters<typeof addAtom>[1] extends infer I ? Partial<I> : never,
];

/** Adds atoms then bonds ([i, j, order] by index into `atoms`); returns the new atom ids. */
function molecule(
  doc: Doc,
  atoms: AtomSpec[],
  bonds: [number, number, BondOrder?][],
): [Doc, AtomId[], BondId[]] {
  const atomIds: AtomId[] = [];
  const bondIds: BondId[] = [];
  for (const [x, y, extra] of atoms) {
    let id: AtomId;
    [doc, id] = addAtom(doc, { ...extra, x, y });
    atomIds.push(id);
  }
  for (const [i, j, order] of bonds) {
    let id: BondId;
    [doc, id] = addBond(doc, atomIds[i] as AtomId, atomIds[j] as AtomId, { order: order ?? 1 });
    bondIds.push(id);
  }
  return [doc, atomIds, bondIds];
}

const sub = (text: string): TextRun => ({ text, script: 'sub' });
const sup = (text: string): TextRun => ({ text, script: 'sup' });

export function benzeneDoc(): Doc {
  let doc: Doc = {
    ...emptyDoc(FIXTURE_TIME),
    meta: { title: 'Benzene', created: FIXTURE_TIME, modified: FIXTURE_TIME },
  };
  [doc] = molecule(
    doc,
    [
      [0, -1],
      [S, -0.5],
      [S, 0.5],
      [0, 1],
      [-S, 0.5],
      [-S, -0.5],
    ],
    [
      [0, 1, 1.5],
      [1, 2, 1.5],
      [2, 3, 1.5],
      [3, 4, 1.5],
      [4, 5, 1.5],
      [5, 0, 1.5],
    ],
  );
  return doc;
}

/** Ethanol → acetaldehyde → acetic acid, conditions above/below each arrow, compound numbers. */
export function twoStepReactionDoc(): Doc {
  let doc = emptyDoc(FIXTURE_TIME);
  const steps: [AtomSpec[], [number, number, BondOrder?][]][] = [
    [
      [
        [0, 0],
        [S, -0.5],
        [2 * S, 0, { element: 'O', label: 'OH' }],
      ],
      [
        [0, 1],
        [1, 2],
      ],
    ],
    [
      [
        [6, 0],
        [6 + S, -0.5],
        [6 + S, -1.5, { element: 'O' }],
      ],
      [
        [0, 1],
        [1, 2, 2],
      ],
    ],
    [
      [
        [12, 0],
        [12 + S, -0.5],
        [12 + S, -1.5, { element: 'O' }],
        [12 + 2 * S, 0, { element: 'O', label: 'OH' }],
      ],
      [
        [0, 1],
        [1, 2, 2],
        [1, 3],
      ],
    ],
  ];
  const molecules: AtomId[][] = [];
  for (const [atoms, bonds] of steps) {
    let ids: AtomId[];
    [doc, ids] = molecule(doc, atoms, bonds);
    molecules.push(ids);
  }
  const conditions: [number, TextRun[], TextRun[]][] = [
    [2.5, [{ text: 'PCC' }], [{ text: 'CH' }, sub('2'), { text: 'Cl' }, sub('2')]],
    [8.5, [{ text: 'KMnO' }, sub('4')], [{ text: 'H' }, sub('3'), { text: 'O' }, sup('+')]],
  ];
  for (const [x, above, below] of conditions) {
    let arrow: ObjectId;
    [doc, arrow] = addObject(doc, {
      type: 'arrow',
      kind: 'forward',
      from: { x, y: -0.25 },
      to: { x: x + 2, y: -0.25 },
    });
    [doc] = addObject(doc, {
      type: 'text',
      at: { x: x + 1, y: -0.75 },
      runs: above,
      align: 'center',
      attachedTo: { arrow, slot: 'above' },
    });
    [doc] = addObject(doc, {
      type: 'text',
      at: { x: x + 1, y: 0.35 },
      runs: below,
      align: 'center',
      attachedTo: { arrow, slot: 'below' },
    });
  }
  molecules.forEach((target, i) => {
    [doc] = addObject(doc, {
      type: 'caption',
      runs: [{ text: String(i + 1), bold: true }],
      target,
    });
  });
  return doc;
}

/** SN2: hydroxide attacks bromomethane; curved arrows anchored to a lone pair, an atom and a bond. */
export function mechanismDoc(): Doc {
  const [withO, o] = molecule(
    emptyDoc(FIXTURE_TIME),
    [[0, 0, { element: 'O', label: 'HO', charge: -1, lonePairs: 3 }]],
    [],
  );
  const [withCBr, cbr, cbrBond] = molecule(
    withO,
    [
      [2, 0, { partialCharge: 'δ+' }],
      [3, 0, { element: 'Br', partialCharge: 'δ-', lonePairs: 3 }],
    ],
    [[0, 1]],
  );
  let doc = withCBr;
  [doc] = addObject(doc, {
    type: 'curved-arrow',
    head: 'full',
    from: { kind: 'atom', atom: o[0] as AtomId, offset: { x: 0.3, y: -0.3 } },
    to: { kind: 'atom', atom: cbr[0] as AtomId },
    bend: 0.4,
  });
  [doc] = addObject(doc, {
    type: 'curved-arrow',
    head: 'full',
    from: { kind: 'bond', bond: cbrBond[0] as BondId },
    to: { kind: 'atom', atom: cbr[1] as AtomId, offset: { x: 0.3, y: -0.3 } },
    bend: -0.4,
  });
  [doc] = addObject(doc, {
    type: 'arrow',
    kind: 'forward',
    from: { x: 4, y: 0 },
    to: { x: 6, y: 0 },
  });
  [doc] = molecule(
    doc,
    [
      [7, 0, { element: 'O', label: 'HO' }],
      [8, 0],
    ],
    [[0, 1]],
  );
  [doc] = addObject(doc, { type: 'plus', at: { x: 9, y: 0 } });
  [doc] = molecule(doc, [[10, 0, { element: 'Br', charge: -1, lonePairs: 4 }]], []);
  return doc;
}

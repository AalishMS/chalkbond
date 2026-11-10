import { createNameIndex } from '@core/chem-core';
import { structureFromText } from '@core/chem-core';
import {
  addAtom,
  addBond,
  emptyDoc,
  insert,
  type AtomId,
  type BondId,
  type Doc,
  type Selection,
} from '@core/doc-model';
import compounds from '../../../../resources/compounds/compounds.json';
import { createDerive } from '../model/derive';
import { fromText } from '../model/text-edit';
import { initialState, type Editing, type EditorState } from './editor-state';
import { reduce, type EditorAction, type ReducerContext } from './reducer';
import { createStore, type Store } from './store';

/** Fixtures shared by the state and view tests. */
export const T0 = '2026-01-01T00:00:00.000Z';

export const testDoc = (): Doc => emptyDoc(T0);

export const freshState = (doc: Doc = testDoc()): EditorState => initialState(doc, () => T0);

export interface TestContext extends ReducerContext {
  readonly logged: unknown[];
}

export function testContext(): TestContext {
  const logged: unknown[] = [];
  return {
    derive: createDerive(),
    names: createNameIndex({
      format: 'chalkbond-compounds',
      version: 1,
      source: 'test',
      entries: [],
    }),
    logError: (error) => {
      logged.push(error);
    },
    logged,
  };
}

export function testStore(doc: Doc = testDoc()): { store: Store; ctx: TestContext } {
  const ctx = testContext();
  return { store: createStore(freshState(doc), ctx), ctx };
}

/** `reduce` with a throwaway context, for tests that only need the next state. */
export const reduceTest = (state: EditorState, action: EditorAction): EditorState =>
  reduce(state, action, testContext());

/** A recipe that adds two bonded carbons (an "Add bond" commit). */
export const addEthane = (doc: Doc): Doc => {
  const [d1, a] = addAtom(doc, { element: 'C', x: 0, y: 0 });
  const [d2, b] = addAtom(d1, { element: 'C', x: 1, y: 0 });
  return addBond(d2, a, b)[0];
};

/** Ids as the editor sees them (branded strings). */
export const atomId = (n: number): AtomId => `a${n}` as AtomId;
export const bondId = (n: number): BondId => `b${n}` as BondId;

const dictionary = createNameIndex(compounds);

/** A document of named compounds from the dictionary, each inserted at its BLU position. */
export function drawn(...parts: readonly { name: string; x: number; y: number }[]): Doc {
  let doc = testDoc();
  for (const part of parts) {
    const result = structureFromText(part.name, dictionary);
    if (!result.ok) throw new Error(`unknown compound ${part.name}`);
    doc = insert(doc, result.value.sub, { x: part.x, y: part.y })[0];
  }
  return doc;
}

/** The ids of a whole fragment (atoms and the bonds between them), as a click would select. */
export function wholeOf(doc: Doc, atoms: readonly AtomId[]): Selection {
  const set = new Set(atoms);
  return {
    atoms: set,
    bonds: new Set(
      Object.values(doc.bonds)
        .filter((b) => set.has(b.a1) && set.has(b.a2))
        .map((b) => b.id),
    ),
    objects: new Set(),
  };
}

/** A label editor open on `atom`, holding `text` all selected. */
export const labelEditing = (atom: AtomId, text = ''): Editing => ({
  kind: 'label',
  atom,
  edit: fromText(text),
});

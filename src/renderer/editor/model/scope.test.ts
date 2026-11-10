import { perceive } from '@core/chem-core';
import {
  addObject,
  fragments,
  updateAtom,
  updateBond,
  type AtomId,
  type BondId,
  type ObjectId,
} from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION } from '../state/editor-state';
import { EMPTY_SCOPE } from '../state/selection-actions';
import { drawn, wholeOf } from '../state/testing';
import { selectionScope } from './scope';

const benzeneEthanol = () =>
  drawn({ name: 'benzene', x: 0, y: 0 }, { name: 'ethanol', x: 6, y: 0 });

describe('selectionScope (the options bar enablement)', () => {
  it('an empty document has the empty scope', () => {
    const doc = drawn();
    expect(selectionScope(doc, perceive(doc), EMPTY_SELECTION)).toEqual(EMPTY_SCOPE);
  });

  it('with nothing selected the scope is the whole document', () => {
    const doc = benzeneEthanol();
    const scope = selectionScope(doc, perceive(doc), EMPTY_SELECTION);
    expect(scope).toMatchObject({
      hasFragment: true,
      hasAromatic15: true,
      hasSelection: false,
      hasAbbreviation: false,
    });
  });

  it('selecting only ethanol removes the aromatic bonds from the scope', () => {
    const doc = benzeneEthanol();
    const ethanol = fragments(doc).find((f) => f.length === 3) as AtomId[];
    const scope = selectionScope(doc, perceive(doc), wholeOf(doc, ethanol));
    expect(scope.hasAromatic15).toBe(false);
    expect(scope.hasAromaticNon15).toBe(false);
    expect(scope.hasFragment).toBe(true);
    expect(scope.hasSelection).toBe(true);
  });

  it('a Kekulé ring (aromatic, not order 1.5) offers "Show circle" (R11)', () => {
    let doc = drawn({ name: 'benzene', x: 0, y: 0 });
    const bonds = Object.keys(doc.bonds) as BondId[];
    bonds.forEach((id, i) => {
      doc = updateBond(doc, id, { order: i % 2 === 0 ? 2 : 1 });
    });
    const scope = selectionScope(doc, perceive(doc), EMPTY_SELECTION);
    expect(scope.hasAromatic15).toBe(false);
    expect(scope.hasAromaticNon15).toBe(true);
  });

  it('a straight arrow anywhere in the document enables Tidy', () => {
    const [doc] = addObject(drawn(), {
      type: 'arrow',
      kind: 'forward',
      from: { x: 0, y: 0 },
      to: { x: 2, y: 0 },
    });
    expect(selectionScope(doc, perceive(doc), EMPTY_SELECTION).hasArrow).toBe(true);
  });

  it('a selected abbreviation atom shows Expand; an unselected one does not', () => {
    let doc = drawn({ name: 'ethanol', x: 0, y: 0 });
    const atom = Object.keys(doc.atoms)[0] as AtomId;
    doc = updateAtom(doc, atom, { label: 'Ph' });
    const perception = perceive(doc);
    expect(selectionScope(doc, perception, EMPTY_SELECTION).hasAbbreviation).toBe(false);
    const selected = {
      atoms: new Set([atom]),
      bonds: new Set<BondId>(),
      objects: new Set<ObjectId>(),
    };
    expect(selectionScope(doc, perception, selected).hasAbbreviation).toBe(true);
  });

  it('a single selected atom still counts the fragment it belongs to', () => {
    const doc = drawn({ name: 'ethanol', x: 0, y: 0 });
    const atom = Object.keys(doc.atoms)[0] as AtomId;
    const one = { atoms: new Set([atom]), bonds: new Set<BondId>(), objects: new Set<ObjectId>() };
    expect(selectionScope(doc, perceive(doc), one).hasFragment).toBe(true);
  });

  it('a lone atom is not a fragment of two or more atoms', () => {
    const doc = drawn({ name: 'methane', x: 0, y: 0 });
    expect(selectionScope(doc, perceive(doc), EMPTY_SELECTION).hasFragment).toBe(false);
  });
});

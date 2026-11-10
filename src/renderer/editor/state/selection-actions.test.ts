import { describe, expect, it } from 'vitest';
import { EMPTY_SCOPE, selectionActions, type SelectionScope } from './selection-actions';

const scope = (over: Partial<SelectionScope>): SelectionScope => ({ ...EMPTY_SCOPE, ...over });

describe('selectionActions', () => {
  it('disables everything and offers Show Kekulé for an empty scope', () => {
    const a = selectionActions(EMPTY_SCOPE);
    expect(a.cleanUp).toEqual({ enabled: false, help: 'Draw a molecule first.' });
    expect(a.kekule).toEqual({ mode: 'kekule', enabled: false, help: 'No benzene ring here.' });
    expect(a.tidy).toEqual({ enabled: false, help: 'Draw an arrow first.' });
    expect(a.flip).toEqual({ enabled: false, help: 'Select a molecule first.' });
    expect(a.expand).toBe(false);
  });

  it('enables Clean up with a fragment of two or more atoms', () => {
    expect(selectionActions(scope({ hasFragment: true })).cleanUp.enabled).toBe(true);
  });

  it('offers Show Kekulé for an order-1.5 bond, Show circle for other aromatic bonds (R11)', () => {
    expect(selectionActions(scope({ hasAromatic15: true })).kekule).toMatchObject({
      mode: 'kekule',
      enabled: true,
    });
    expect(selectionActions(scope({ hasAromaticNon15: true })).kekule).toMatchObject({
      mode: 'circle',
      enabled: true,
    });
    const both = scope({ hasAromatic15: true, hasAromaticNon15: true });
    expect(selectionActions(both).kekule.mode).toBe('kekule');
  });

  it('enables Tidy with an arrow and Flip with a selection', () => {
    expect(selectionActions(scope({ hasArrow: true })).tidy.enabled).toBe(true);
    expect(selectionActions(scope({ hasSelection: true })).flip.enabled).toBe(true);
  });

  it('shows Expand only when the selection has an abbreviation', () => {
    expect(selectionActions(scope({ hasAbbreviation: true })).expand).toBe(true);
  });
});

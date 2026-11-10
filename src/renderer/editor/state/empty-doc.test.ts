import { addAtom, emptyDoc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { emptyStateVisible, isEmptyDoc } from './empty-doc';

describe('isEmptyDoc', () => {
  it('is true for a new document', () => {
    expect(isEmptyDoc(emptyDoc('2026-01-01T00:00:00.000Z'))).toBe(true);
  });

  it('is false once there is an atom', () => {
    const [doc] = addAtom(emptyDoc('2026-01-01T00:00:00.000Z'), { element: 'C', x: 0, y: 0 });
    expect(isEmptyDoc(doc)).toBe(false);
  });
});

describe('emptyStateVisible (R30)', () => {
  const empty = emptyDoc('2026-01-01T00:00:00.000Z');
  const [full] = addAtom(empty, { element: 'C', x: 0, y: 0 });
  const gesture = { kind: 'chain-drag' };
  const preview = { doc: empty, added: new Set<string>() };

  it('shows only for an empty document with no gesture and no preview', () => {
    expect(emptyStateVisible(empty, null, null)).toBe(true);
  });

  it('hides while a gesture runs, while a preview (a hover ghost) exists, or once not empty', () => {
    expect(emptyStateVisible(empty, gesture, null)).toBe(false);
    expect(emptyStateVisible(empty, null, preview)).toBe(false);
    expect(emptyStateVisible(empty, gesture, preview)).toBe(false);
    expect(emptyStateVisible(full, null, null)).toBe(false);
  });
});

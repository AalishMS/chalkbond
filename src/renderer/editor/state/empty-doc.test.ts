import { addAtom, emptyDoc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { isEmptyDoc } from './empty-doc';

describe('isEmptyDoc', () => {
  it('is true for a new document', () => {
    expect(isEmptyDoc(emptyDoc('2026-01-01T00:00:00.000Z'))).toBe(true);
  });

  it('is false once there is an atom', () => {
    const [doc] = addAtom(emptyDoc('2026-01-01T00:00:00.000Z'), { element: 'C', x: 0, y: 0 });
    expect(isEmptyDoc(doc)).toBe(false);
  });
});

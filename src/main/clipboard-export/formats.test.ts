import { expect, test } from 'vitest';
import { preferredFormats, selectFormats } from './formats';

test('preferred and every named fallback share the selection interface', () => {
  expect(selectFormats()).toEqual(preferredFormats);
  expect(selectFormats({ png: 'omit', svg: 'mime', drawing: 'web' })).toEqual({
    bitmap: 'image/png',
    png: null,
    svg: 'image/svg+xml',
    drawing: 'web application/x-chalkbond',
  });
  expect(selectFormats({ svg: 'omit' }).svg).toBeNull();
});

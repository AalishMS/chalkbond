import { type Doc } from '@core/doc-model';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { messyScheme, rounded, tidied } from './tidy-fixtures';

describe('Tidy reaction is idempotent (TR6, property)', () => {
  it('tidy twice = tidy once, over jittered layouts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -0.6, max: 0.6, noNaN: true }), { minLength: 7, maxLength: 7 }),
        (jitter) => {
          const { doc } = messyScheme((i) => jitter[i] ?? 0);
          const once = tidied(doc) as Doc;
          const twice = tidied(once) as Doc;
          expect(rounded(twice.atoms)).toBe(rounded(once.atoms));
          expect(rounded(twice.objects)).toBe(rounded(once.objects));
        },
      ),
    );
  });
});

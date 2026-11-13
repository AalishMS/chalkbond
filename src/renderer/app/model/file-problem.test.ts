// F14: every doc-model parse code maps to a file problem (SPEC-app-shell.md "Files").
import { describe, expect, it } from 'vitest';
import type { ParseErrorCode } from '@core/doc-model';
import type { FileProblem } from '../../../shared/ipc-types';
import { parseProblem } from './file-problem';

describe('parseProblem (F14)', () => {
  it('maps newer-version, too-large, and every other code to damaged', () => {
    const expected: Record<ParseErrorCode, FileProblem> = {
      'too-large': 'too-large',
      'invalid-json': 'damaged',
      'not-chalkbond': 'damaged',
      'newer-version': 'newer-version',
      'unsupported-version': 'damaged',
      'migration-failed': 'damaged',
      schema: 'damaged',
      invariants: 'damaged',
    };
    for (const [code, problem] of Object.entries(expected))
      expect(parseProblem(code as ParseErrorCode)).toBe(problem);
  });
});

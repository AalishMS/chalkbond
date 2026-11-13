// F14 (SPEC-app-shell.md "Files"): the problem a file that does not parse is reported as. Used by
// the tab flows (T17 opens, SS11 restores) and by auto-save's AS5 check. Pure.
import type { ParseErrorCode } from '@core/doc-model';
import type { FileProblem } from '../../../shared/ipc-types';

/** doc-model `parse` codes → F14 (every other code is a damaged file). */
export function parseProblem(code: ParseErrorCode): FileProblem {
  if (code === 'newer-version') return 'newer-version';
  if (code === 'too-large') return 'too-large';
  return 'damaged';
}

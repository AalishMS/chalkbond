// errno → the F14 problem (SPEC-app-shell.md "Files"). Pure.
import type { ReadProblem, WriteProblem } from '../../shared/ipc-types';

/** A failed write or rename. */
export function writeProblem(code: string | undefined): WriteProblem {
  switch (code) {
    case 'EACCES':
    case 'EPERM':
    case 'EROFS':
      return 'write-denied';
    case 'ENOSPC':
      return 'disk-full';
    case 'EBUSY':
      return 'busy';
    case 'ENOENT':
      return 'folder-gone';
    default:
      return 'write-failed';
  }
}

/** A failed `stat` or read (I2): gone, else unreadable (permission, lock, I/O). */
export function readProblem(
  code: string | undefined,
): Extract<ReadProblem, 'missing' | 'unreadable'> {
  return code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'unreadable';
}

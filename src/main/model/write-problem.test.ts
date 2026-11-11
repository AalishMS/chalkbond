// errno → problem (SPEC-app-shell.md F14): write problems and read problems.
import { describe, expect, it } from 'vitest';
import { readProblem, writeProblem } from './write-problem';

describe('writeProblem', () => {
  it.each([
    ['EACCES', 'write-denied'],
    ['EPERM', 'write-denied'],
    ['EROFS', 'write-denied'],
    ['ENOSPC', 'disk-full'],
    ['EBUSY', 'busy'],
    ['ENOENT', 'folder-gone'],
    ['EIO', 'write-failed'],
    ['EISDIR', 'write-failed'],
    [undefined, 'write-failed'],
  ] as const)('%s → %s', (code, problem) => {
    expect(writeProblem(code)).toBe(problem);
  });
});

describe('readProblem', () => {
  it.each([
    ['ENOENT', 'missing'],
    ['ENOTDIR', 'missing'],
    ['EACCES', 'unreadable'],
    ['EPERM', 'unreadable'],
    ['EBUSY', 'unreadable'],
    ['EIO', 'unreadable'],
    [undefined, 'unreadable'],
  ] as const)('%s → %s', (code, problem) => {
    expect(readProblem(code)).toBe(problem);
  });
});

import { expect, it } from 'vitest';
import { logLine, shouldRotate } from './log-line';

it('formats one line and rotates at exactly 1 MiB', () => {
  expect(logLine('time', 'main', 'first\nsecond\rthird')).toBe('time main first second third\n');
  expect(shouldRotate(1048575)).toBe(false);
  expect(shouldRotate(1048576)).toBe(true);
});

import { expect, it } from 'vitest';
import { radioIndex } from './radio-keys';
it('wraps arrows and handles endpoints without consuming other keys', () => {
  expect(radioIndex(0, 3, 'ArrowLeft')).toBe(2);
  expect(radioIndex(2, 3, 'ArrowRight')).toBe(0);
  expect(radioIndex(1, 3, 'ArrowUp')).toBe(0);
  expect(radioIndex(1, 3, 'ArrowDown')).toBe(2);
  expect(radioIndex(1, 3, 'Home')).toBe(0);
  expect(radioIndex(1, 3, 'End')).toBe(2);
  expect(radioIndex(1, 3, 'Tab')).toBe(null);
  expect(radioIndex(0, 0, 'End')).toBe(null);
});

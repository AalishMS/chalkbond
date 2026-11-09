import { expect, it } from 'vitest';
import { assertNever } from './assert-never';

it('assertNever throws on an unexpected variant', () => {
  expect(() => assertNever({ type: 'mystery' } as never)).toThrow(/unexpected variant.*mystery/);
});

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validateRequest } from './ipc';

describe('IPC trust boundary', () => {
  const frame = { url: 'file:///app/index.html?testHooks=1' };
  it('accepts only the main frame, exact app URL and valid payload', () => {
    const logs: string[] = [];
    const validate = (senderFrame: typeof frame | null, payload: unknown) =>
      validateRequest(
        { senderFrame },
        frame,
        'file:///app/index.html',
        z.object({ message: z.string() }).strict(),
        payload,
        (m) => logs.push(m),
      );
    expect(validate(frame, { message: 'ok' })).toEqual({ message: 'ok' });
    for (const sender of [null, { url: frame.url }]) {
      expect(() => validate(sender, { message: 'ok' })).toThrow();
    }
    frame.url = 'https://example.com';
    expect(() => validate(frame, { message: 'ok' })).toThrow();
    frame.url = 'file:///app/index.html';
    expect(() => validate(frame, { message: 3 })).toThrow();
    expect(logs).toHaveLength(4);
  });
});

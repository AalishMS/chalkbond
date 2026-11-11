import { expect, it, vi } from 'vitest';
import { createClipboard } from './clipboard';
import { preferredFormats } from './formats';
import { clipboardWriteSchema } from '../ipc-schemas';
import { validateRequest } from '../ipc';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const request = { png, svg: '<svg/>', drawing: '{}' };
it('validates every field through the central sender check', () => {
  const frame = { url: 'file:///app' };
  for (const value of [
    { ...request, png: [] },
    { ...request, png: new Uint8Array(8) },
    { ...request, png: new Uint8Array(64 * 1024 * 1024 + 1) },
    { ...request, svg: 'bad' },
    { ...request, svg: '<svg' + 'a'.repeat(64 * 1024 * 1024 - 3) },
    // 32 Mi + 1 characters, but 64 MiB + 2 UTF-8 bytes: the cap counts bytes.
    { ...request, svg: '<svg' + 'é'.repeat(32 * 1024 * 1024 - 1) },
    { ...request, drawing: '[]' },
    { ...request, drawing: '{é' },
    { ...request, drawing: '{\n}' },
    { ...request, drawing: '{' + 'a'.repeat(20 * 1024 * 1024) },
    { ...request, extra: true },
  ])
    expect(() =>
      validateRequest(
        { senderFrame: frame },
        frame,
        frame.url,
        clipboardWriteSchema,
        value,
        vi.fn(),
      ),
    ).toThrow();
  expect(clipboardWriteSchema.parse({ ...request, drawing: null }).drawing).toBeNull();
  // C9: the SVG carrier may be over 20 MiB, up to 64 MiB of UTF-8; the drawing stays at 20 MiB.
  for (const svg of [
    '<svg' + 'a'.repeat(20 * 1024 * 1024),
    '<svg' + 'a'.repeat(64 * 1024 * 1024 - 4),
  ])
    expect(clipboardWriteSchema.parse({ ...request, svg }).svg).toBe(svg);
  expect(
    clipboardWriteSchema.parse({ ...request, drawing: '{' + 'a'.repeat(20 * 1024 * 1024 - 1) })
      .drawing,
  ).toHaveLength(20 * 1024 * 1024);
  expect(() =>
    validateRequest(
      { senderFrame: { ...frame } },
      frame,
      frame.url,
      clipboardWriteSchema,
      request,
      vi.fn(),
    ),
  ).toThrow();
});
it('writes the three CB-W1 entries atomically and omits a null drawing', async () => {
  const write = vi.fn(async (_items: Item[]) => {});
  class Item {
    constructor(readonly entries: Record<string, Blob>) {}
  }
  const port = createClipboard(
    { write, read: async () => [], readText: async () => '', has: async () => false },
    Item,
    vi.fn(),
  );
  expect(await port.write(request)).toEqual({ ok: true });
  expect(write).toHaveBeenCalledTimes(1);
  const entries = write.mock.calls[0]?.[0][0]?.entries;
  expect(Object.keys(entries ?? {})).toEqual([
    preferredFormats.bitmap,
    preferredFormats.svg,
    preferredFormats.drawing,
  ]);
  expect(entries?.[preferredFormats.bitmap]?.type).toBe('image/png');
  expect(
    Buffer.from(await (entries?.[preferredFormats.bitmap]?.arrayBuffer() ?? new ArrayBuffer(0))),
  ).toEqual(Buffer.from(png));
  expect(await entries?.[preferredFormats.svg]?.text()).toBe('<svg/>');
  expect(await entries?.[preferredFormats.drawing]?.text()).toBe('{}');
  await port.write({ ...request, drawing: null });
  expect(Object.keys(write.mock.calls[1]?.[0][0]?.entries ?? {})).toEqual([
    preferredFormats.bitmap,
    preferredFormats.svg,
  ]);
});
it('bounds readers and catches errors without retrying writes', async () => {
  const log = vi.fn();
  const write = vi.fn(async () => {
    throw Error('rejected');
  });
  class Item {
    constructor(readonly entries: Record<string, Blob>) {}
  }
  const read = vi.fn(async () => [
    {
      types: [preferredFormats.drawing, 'image/svg+xml'],
      getType: async () => new Blob(['a'.repeat(21 * 1024 * 1024)]),
    },
  ]);
  const port = createClipboard(
    { write, read, readText: async () => 'a'.repeat(70000), has: async () => false },
    Item,
    log,
  );
  expect(await port.read()).toEqual({ drawing: null, text: null, textTooLong: true, image: true });
  expect(await port.write(request)).toEqual({ ok: false });
  expect(write).toHaveBeenCalledTimes(1);
  read.mockRejectedValueOnce(Error('read'));
  expect(await port.read()).toEqual({
    drawing: null,
    text: null,
    textTooLong: false,
    image: false,
  });
  expect(log).toHaveBeenCalledTimes(2);
});

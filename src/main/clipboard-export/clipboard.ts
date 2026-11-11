import type { ClipboardWriteRequest, ClipboardReadResponse } from '../../shared/ipc-types';
import { preferredFormats, type FormatSelection } from './formats';

interface ReadItem {
  types: readonly string[];
  getType(key: string): Promise<Blob | object>;
}
interface ClipboardPort<T> {
  write(items: T[]): Promise<void>;
  read(): Promise<ReadItem[]>;
  readText(): Promise<string>;
  has(key: string): Promise<boolean>;
}
export function createClipboard<T>(
  clipboard: ClipboardPort<T>,
  Item: new (entries: Record<string, Blob>) => T,
  log: (message: string) => void,
  formats: FormatSelection = preferredFormats,
) {
  return {
    async write(value: ClipboardWriteRequest): Promise<{ ok: boolean }> {
      try {
        const entries: Record<string, Blob> = {
          [formats.bitmap]: new Blob([new Uint8Array(value.png)], { type: 'image/png' }),
        };
        if (formats.png) entries[formats.png] = new Blob([new Uint8Array(value.png)]);
        if (formats.svg) entries[formats.svg] = new Blob([value.svg]);
        if (value.drawing !== null) entries[formats.drawing] = new Blob([value.drawing]);
        await clipboard.write([new Item(entries)]);
        return { ok: true };
      } catch {
        log('Clipboard write failed');
        return { ok: false };
      }
    },
    async read(): Promise<ClipboardReadResponse> {
      try {
        const items = await clipboard.read();
        const item = items.find((entry) => entry.types.includes(formats.drawing));
        const blob = item ? await item.getType(formats.drawing) : null;
        const drawing =
          blob instanceof Blob && blob.size <= 20 * 1024 * 1024 ? await blob.text() : null;
        const text = await clipboard.readText();
        return {
          drawing,
          text: text.length > 0 && text.length <= 65536 ? text : null,
          textTooLong: text.length > 65536,
          image:
            (await clipboard.has('image/png')) ||
            (items[0]?.types.some((t) => t.startsWith('image/')) ?? false),
        };
      } catch {
        log('Clipboard read failed');
        return { drawing: null, text: null, textTooLong: false, image: false };
      }
    },
  };
}

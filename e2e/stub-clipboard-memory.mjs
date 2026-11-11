// UI/model-success shots only (e2e/shots/C9.shot.ts), never Windows clipboard verification: main's
// clipboard becomes a deterministic in-memory store behind the real adapter, flow and rasteriser.
// Production never loads this; launch.ts preloads it for `clipboardMemory`. A test sets contents
// in main with `globalThis.__chalkbondClipboardStub.set(entries, text)`.
import { clipboard, ClipboardItem } from 'electron';

const state = { items: [], text: '' };
clipboard.write = async (items) => {
  state.items = [...items];
  state.text = '';
};
clipboard.read = async () => state.items;
clipboard.readText = async () => state.text;
clipboard.has = async (key) => state.items.some((item) => item.types.includes(key));
globalThis.__chalkbondClipboardStub = {
  /** Replaces the contents: `entries` maps a key to a string (bytes for `image/png` are base64). */
  set(entries, text = '') {
    const blobs = {};
    for (const [key, value] of Object.entries(entries)) {
      blobs[key] = key.startsWith('image/')
        ? new Blob([Buffer.from(value, 'base64')], { type: key })
        : new Blob([value]);
    }
    state.items = Object.keys(blobs).length > 0 ? [new ClipboardItem(blobs)] : [];
    state.text = text;
  },
};

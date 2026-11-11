// UI/model-success shots only (e2e/shots/C9.shot.ts), never Windows clipboard verification: main's
// clipboard becomes a deterministic in-memory store behind the real adapter, flow and rasteriser.
// Production never loads this; launch.ts preloads it for `clipboardMemory`. A test sets contents
// in main with `globalThis.__chalkbondClipboardStub.set(entries, text)`; `failNextWrite()` makes
// the next write reject (as a refused system write) and leaves the contents as they were.
import { clipboard, ClipboardItem } from 'electron';

const state = { items: [], text: '', failNext: false };
clipboard.write = async (items) => {
  if (state.failNext) {
    state.failNext = false;
    throw new Error('stubbed write failure');
  }
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
  failNextWrite() {
    state.failNext = true;
  },
};

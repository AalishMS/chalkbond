// Preloaded into the Electron main process when a test passes `probe: true` to `launchApp` (`-r`,
// see launch.ts), before the app's code runs. TB31 (SPEC-app-shell.md SS8, T11): the perf probe
// needs two things the production code does not offer, and this file adds neither to it.
//
// 1. A count of the calls of every `ipcMain.handle` channel, on `globalThis.__chalkbondProbe.calls`.
//    LG1's main log holds errors only, so a successful `readTabRecord` leaves no log line; the
//    count is what shows that a normal start reads one record (SS8).
// 2. A renderer preload, registered on the default session before the window is created, that
//    watches the page from its first byte: when the strip shows its tabs and when the restored
//    drawing is first painted. Its source is the string below (a sandboxed preload must be a
//    CommonJS file, and a file of its own would be linted as Node code); it is written to the OS
//    temp folder for the run and removed when the app quits.
//
// Production never loads this file.
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app, ipcMain, session } from 'electron';

// Records, on one clock (`performance.now()`, the page's own), when the tab strip first shows its
// tabs and when the drawing's first parts are painted. "Painted" is the frame after the parts
// appear: a `requestAnimationFrame` callback, then a task posted from inside it (the task runs once
// the frame's style, layout and paint work on the main thread is done).
const PRELOAD = `
const { contextBridge } = require('electron');

const events = [];
let painted = null;
let paintPending = false;
let last = '';

function look() {
  const tabs = document.querySelectorAll('[data-testid="tab"]').length;
  const parts = document.querySelectorAll('[data-layer="content"] [data-key]').length;
  const key = tabs + '/' + parts;
  if (key === last) return;
  last = key;
  events.push({ t: performance.now(), tabs, parts });
  if (parts > 0 && !paintPending && painted === null) {
    paintPending = true;
    requestAnimationFrame(() => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        painted = performance.now();
      };
      channel.port2.postMessage(0);
    });
  }
}

new MutationObserver(look).observe(document, { childList: true, subtree: true, attributes: true });

contextBridge.exposeInMainWorld('__chalkbondRestoreProbe', {
  events: () => events.slice(),
  painted: () => painted,
});
`;

const probe = { calls: {} };
globalThis.__chalkbondProbe = probe;

const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) =>
  handle(channel, (event, ...args) => {
    probe.calls[channel] = (probe.calls[channel] ?? 0) + 1;
    return listener(event, ...args);
  });

// Registered before the app's own `whenReady` callback, so before its window exists.
void app.whenReady().then(() => {
  const filePath = join(tmpdir(), `chalkbond-probe-preload-${process.pid}.cjs`);
  writeFileSync(filePath, PRELOAD);
  app.once('quit', () => rmSync(filePath, { force: true }));
  session.defaultSession.registerPreloadScript({ type: 'frame', filePath });
});

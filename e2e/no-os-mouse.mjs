// Preloaded into the Electron main process of every test launch (`-r`, see launch.ts).
//
// Test windows are real OS windows. When one lies under the physical mouse cursor, the OS
// delivers real mouse events at the cursor's position (as the window appears, is raised or the
// cursor moves) in between Playwright's synthetic ones, so a pending hover is lost. Each test
// window is made click-through for OS mouse input as it is created, before it is shown.
// Playwright's input goes through the DevTools protocol straight to the page and is unaffected.
//
// The ids of the windows it has guarded are kept on `globalThis.__chalkbondNoOsMouse`, so
// `e2e/no-os-mouse.spec.ts` can assert the guard without touching the real cursor.
import { app } from 'electron';

const guard = { ids: [] };
globalThis.__chalkbondNoOsMouse = guard;

app.on('browser-window-created', (_event, win) => {
  win.setIgnoreMouseEvents(true);
  guard.ids.push(win.id);
});

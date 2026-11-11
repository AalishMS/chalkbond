// Preloaded into the Electron main process when a test passes `dialogs` to `launchApp` (`-r`,
// see launch.ts), before the app's code runs, so boxes shown during startup are scripted too.
//
// `dialog.showMessageBox`, `showOpenDialog` and `showSaveDialog` are replaced. Each call takes the
// next answer from the JSON array in `CHALKBOND_TEST_DIALOGS` (whatever the method: the answer is
// the value the promise resolves to, e.g. `{ response: 1, checkboxChecked: false }` or
// `{ canceled: false, filePaths: [...] }`) and records `{ method, options }` on
// `globalThis.__chalkbondDialogLog`. A call with no answer left rejects, so an unexpected box
// fails the test instead of hanging it. An answer with `hold: true` is held: its promise resolves
// (without `hold`) only when the test calls `globalThis.__chalkbondReleaseDialog()`, so a test can
// act while a box is open. Production never loads this file.
import { dialog } from 'electron';

const answers = JSON.parse(process.env.CHALKBOND_TEST_DIALOGS ?? '[]');
const log = [];
globalThis.__chalkbondDialogLog = log;

let next = 0;
for (const method of ['showMessageBox', 'showOpenDialog', 'showSaveDialog']) {
  dialog[method] = (...args) => {
    // The window is optional and comes first: the options are the last plain-object argument.
    const options =
      [...args]
        .reverse()
        .find((a) => a !== null && typeof a === 'object' && !('webContents' in a)) ?? {};
    log.push({ method, options: JSON.parse(JSON.stringify(options)) });
    if (next >= answers.length) {
      return Promise.reject(new Error(`stub-dialogs: no scripted answer left for ${method}`));
    }
    const answer = answers[next++];
    if (answer === null || typeof answer !== 'object' || answer.hold !== true) {
      return Promise.resolve(answer);
    }
    const { hold: _hold, ...value } = answer;
    return new Promise((resolve) => {
      globalThis.__chalkbondReleaseDialog = () => resolve(value);
    });
  };
}

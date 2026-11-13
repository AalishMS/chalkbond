// Native box texts (SPEC-app-shell.md F14 with mock-up A10, the A09 prompt,
// the F8 replace box). Main builds every text from a problem code and a base name (SEC15). Pure.
import type {
  AutoSaveProblem,
  FileErrorRequest,
  FileProblem,
  KeepProblem,
} from '../../shared/ipc-types';

/** The options main passes to `dialog.showMessageBox`. */
export interface BoxOptions {
  type: 'error' | 'warning' | 'info';
  title: 'Chalkbond';
  message: string;
  detail: string;
  buttons: string[];
  defaultId?: number;
  cancelId?: number;
  noLink?: boolean;
}

export const FILE_PROBLEMS = [
  'missing',
  'too-large',
  'unsupported',
  'no-drawing',
  'newer-version',
  'damaged',
  'unreadable',
  'write-denied',
  'disk-full',
  'busy',
  'folder-gone',
  'write-failed',
  'open-in-tab',
] as const satisfies readonly FileProblem[];

const UNCHANGED = 'The file has not been changed.';

/** F14: message and detail for `{ problem, name }`. */
function fileError(problem: FileProblem, name: string): [string, string] {
  const q = `“${name}”`;
  switch (problem) {
    case 'missing':
      return [`${q} can't be found.`, 'It may have been moved, renamed or deleted.'];
    case 'too-large':
      return [
        `${q} is too large to open.`,
        'Drawings can be up to 20 MB. Pictures made in Chalkbond can be up to 64 MB.',
      ];
    case 'unsupported':
      return [
        `Chalkbond can't open ${q}.`,
        // PDF-A applies (clipboard-export C4), so .pdf is listed.
        'It opens Chalkbond drawings (.chalk) and pictures made in Chalkbond (.png, .svg, .pdf).',
      ];
    case 'no-drawing':
      return [
        `${q} has no Chalkbond drawing inside.`,
        'Only pictures exported or copied from Chalkbond can be opened and changed.',
      ];
    case 'newer-version':
      return [
        `${q} was made with a newer version of Chalkbond.`,
        `Install the newer Chalkbond to open it. ${UNCHANGED}`,
      ];
    case 'damaged':
      return [
        `Chalkbond can't open ${q}.`,
        `The file is damaged or is not a Chalkbond drawing. ${UNCHANGED}`,
      ];
    case 'unreadable':
      return [
        `Chalkbond can't read ${q}.`,
        'It may be open in another program, or you may not have permission to open it.',
      ];
    case 'write-denied':
      return [
        `Couldn't save ${q}.`,
        "Chalkbond isn't allowed to save in this folder. Choose another folder.",
      ];
    case 'disk-full':
      return [`Couldn't save ${q}.`, 'The disk is full. Free some space or choose another drive.'];
    case 'busy':
      return [
        `Couldn't save ${q}.`,
        'The file is open in another program. Close it and try again.',
      ];
    case 'folder-gone':
      return [`Couldn't save ${q}.`, 'The folder no longer exists. Choose another folder.'];
    case 'write-failed':
      return [
        `Couldn't save ${q}.`,
        'Something went wrong while saving. Try again, or choose another folder.',
      ];
    case 'open-in-tab':
      return [`${q} is open in another tab.`, 'Close that tab first, or choose another name.'];
  }
}

/** I5: the F14 error box. */
export function fileErrorBox(problem: FileProblem, name: string): BoxOptions {
  const [message, detail] = fileError(problem, name);
  return { type: 'error', title: 'Chalkbond', message, detail, buttons: ['OK'] };
}

/** I4 `save-changes` (T9, A20): Save · Don't save · Cancel, for an unsaved tab being closed. */
export function saveChangesBox(name: string): BoxOptions {
  return {
    type: 'warning',
    title: 'Chalkbond',
    message: `Do you want to save “${name}”?`,
    detail: "If you don't save, your drawing will be lost.",
    buttons: ['Save', "Don't save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  };
}

const warningBox = (message: string, detail: string): BoxOptions => ({
  type: 'warning',
  title: 'Chalkbond',
  message,
  detail,
  buttons: ['OK'],
});

const TRY_AGAIN = 'Chalkbond keeps your drawing and will try again. You can also use Save as.';

/** The tab a file's unwritten changes move to (AS7(c), T3): the base name without `.chalk`. */
const yourChangesTab = (name: string): string =>
  `“${name.replace(/\.chalk$/i, '')} (your changes)”`;

/** The auto-save boxes (AS6, AS7), built from `{ problem, name }` like F14. */
export function autoSaveBox(problem: AutoSaveProblem, name: string): BoxOptions {
  const q = `“${name}”`;
  switch (problem) {
    case 'changed-outside':
      return warningBox(
        `${q} was changed outside Chalkbond.`,
        `Your changes are in the tab ${yourChangesTab(name)}. The changed file is open in the tab next to it.`,
      );
    case 'changed-outside-unopenable':
      return warningBox(
        `${q} was changed outside Chalkbond.`,
        `Chalkbond can't open the changed file. Your changes are in the tab ${yourChangesTab(name)}.`,
      );
    case 'missing':
      return warningBox(
        `Couldn't save ${q}.`,
        `It may have been moved, renamed or deleted, or its USB drive was removed. ${TRY_AGAIN}`,
      );
    default:
      return warningBox(`Couldn't save ${q}.`, `${fileError(problem, name)[1]} ${TRY_AGAIN}`);
  }
}

/** SS6: a session record that cannot be written for a drawing that exists only in the store. */
export function keepBox(problem: KeepProblem, name: string): BoxOptions {
  const detail =
    problem === 'disk-full' ? 'The disk is full. Free some space.' : fileError(problem, name)[1];
  return warningBox(
    `Chalkbond couldn't keep “${name}”.`,
    `${detail} Until it can, save this drawing with Save as.`,
  );
}

/** I5: the box for a request, by its context. */
export function errorBox(request: FileErrorRequest): BoxOptions {
  if (!('context' in request)) return fileErrorBox(request.problem, request.name);
  return request.context === 'auto-save'
    ? autoSaveBox(request.problem, request.name)
    : keepBox(request.problem, request.name);
}

/** F8 / R6: the appended name exists. Replace · Cancel. */
export function replaceBox(name: string): BoxOptions {
  return {
    type: 'warning',
    title: 'Chalkbond',
    message: `“${name}” already exists.`,
    detail: 'Do you want to replace it?',
    buttons: ['Replace', 'Cancel'],
    cancelId: 1,
    noLink: true,
  };
}

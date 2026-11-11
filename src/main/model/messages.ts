// Native box texts (SPEC-app-shell.md F14 with mock-up A10, the A09 prompt, RC3 recover with A11,
// the F8 replace box). Main builds every text from a problem code and a base name (SEC15). Pure.
import type { FileProblem } from '../../shared/ipc-types';

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
  }
}

/** I5: the F14 error box. */
export function fileErrorBox(problem: FileProblem, name: string): BoxOptions {
  const [message, detail] = fileError(problem, name);
  return { type: 'error', title: 'Chalkbond', message, detail, buttons: ['OK'] };
}

/** I4 `save-changes` (A09): Save · Don't save · Cancel. */
export function saveChangesBox(name: string): BoxOptions {
  return {
    type: 'warning',
    title: 'Chalkbond',
    message: `Do you want to save changes to “${name}”?`,
    detail: "If you don't save, your changes will be lost.",
    buttons: ['Save', "Don't save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  };
}

/** I4 `recover` (RC3, A11): Recover · Delete; closing the box recovers. */
export function recoverBox(): BoxOptions {
  return {
    type: 'info',
    title: 'Chalkbond',
    message: 'Chalkbond closed before your drawing was saved.',
    detail: "Do you want to recover it? If you delete it, it can't be brought back.",
    buttons: ['Recover', 'Delete'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
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

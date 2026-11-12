// Native box texts (SPEC-app-shell.md F14, A09 prompt, RC3 recover, F8 replace; SEC15).
import { describe, expect, it } from 'vitest';
import {
  autoSaveBox,
  errorBox,
  FILE_PROBLEMS,
  fileErrorBox,
  keepBox,
  recoverBox,
  replaceBox,
  saveChangesBox,
} from './messages';

const box = (message: string, detail: string) => ({
  type: 'error',
  title: 'Chalkbond',
  message,
  detail,
  buttons: ['OK'],
});

describe('fileErrorBox (F14, every row)', () => {
  it.each([
    ['missing', "“ethanol.chalk” can't be found.", 'It may have been moved, renamed or deleted.'],
    [
      'too-large',
      '“ethanol.chalk” is too large to open.',
      'Drawings can be up to 20 MB. Pictures made in Chalkbond can be up to 64 MB.',
    ],
    [
      'unsupported',
      "Chalkbond can't open “ethanol.chalk”.",
      'It opens Chalkbond drawings (.chalk) and pictures made in Chalkbond (.png, .svg, .pdf).',
    ],
    [
      'no-drawing',
      '“ethanol.chalk” has no Chalkbond drawing inside.',
      'Only pictures exported or copied from Chalkbond can be opened and changed.',
    ],
    [
      'newer-version',
      '“ethanol.chalk” was made with a newer version of Chalkbond.',
      'Install the newer Chalkbond to open it. The file has not been changed.',
    ],
    [
      'damaged',
      "Chalkbond can't open “ethanol.chalk”.",
      'The file is damaged or is not a Chalkbond drawing. The file has not been changed.',
    ],
    [
      'unreadable',
      "Chalkbond can't read “ethanol.chalk”.",
      'It may be open in another program, or you may not have permission to open it.',
    ],
    [
      'write-denied',
      "Couldn't save “ethanol.chalk”.",
      "Chalkbond isn't allowed to save in this folder. Choose another folder.",
    ],
    [
      'disk-full',
      "Couldn't save “ethanol.chalk”.",
      'The disk is full. Free some space or choose another drive.',
    ],
    [
      'busy',
      "Couldn't save “ethanol.chalk”.",
      'The file is open in another program. Close it and try again.',
    ],
    [
      'folder-gone',
      "Couldn't save “ethanol.chalk”.",
      'The folder no longer exists. Choose another folder.',
    ],
    [
      'write-failed',
      "Couldn't save “ethanol.chalk”.",
      'Something went wrong while saving. Try again, or choose another folder.',
    ],
    [
      'open-in-tab',
      '“ethanol.chalk” is open in another tab.',
      'Close that tab first, or choose another name.',
    ],
  ] as const)('%s', (problem, message, detail) => {
    expect(fileErrorBox(problem, 'ethanol.chalk')).toEqual(box(message, detail));
  });

  it('covers exactly the F14 problems', () => {
    expect([...FILE_PROBLEMS].sort()).toEqual(
      [
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
      ].sort(),
    );
  });

  it('uses the name it is given, as in A10', () => {
    expect(fileErrorBox('no-drawing', 'photo.png').message).toBe(
      '“photo.png” has no Chalkbond drawing inside.',
    );
  });
});

describe('the question boxes', () => {
  it('save changes (T9, A20, I4)', () => {
    expect(saveChangesBox('Untitled 2')).toEqual({
      type: 'warning',
      title: 'Chalkbond',
      message: 'Do you want to save “Untitled 2”?',
      detail: "If you don't save, your drawing will be lost.",
      buttons: ['Save', "Don't save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    expect(saveChangesBox('toluene.png').message).toBe('Do you want to save “toluene.png”?');
  });

  it('recover (A11, RC3): closing the box recovers', () => {
    expect(recoverBox()).toEqual({
      type: 'info',
      title: 'Chalkbond',
      message: 'Chalkbond closed before your drawing was saved.',
      detail: "Do you want to recover it? If you delete it, it can't be brought back.",
      buttons: ['Recover', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
  });

  it('replace (F8, R6)', () => {
    expect(replaceBox('notes.png.chalk')).toEqual({
      type: 'warning',
      title: 'Chalkbond',
      message: '“notes.png.chalk” already exists.',
      detail: 'Do you want to replace it?',
      buttons: ['Replace', 'Cancel'],
      cancelId: 1,
      noLink: true,
    });
  });
});

const warning = (message: string, detail: string) => ({
  type: 'warning',
  title: 'Chalkbond',
  message,
  detail,
  buttons: ['OK'],
});
const TRY_AGAIN = 'Chalkbond keeps your drawing and will try again. You can also use Save as.';

describe('the auto-save boxes (AS6, AS7)', () => {
  it.each([
    ['write-denied', "Chalkbond isn't allowed to save in this folder. Choose another folder."],
    ['disk-full', 'The disk is full. Free some space or choose another drive.'],
    ['busy', 'The file is open in another program. Close it and try again.'],
    ['folder-gone', 'The folder no longer exists. Choose another folder.'],
    ['write-failed', 'Something went wrong while saving. Try again, or choose another folder.'],
    ['missing', 'It may have been moved, renamed or deleted, or its USB drive was removed.'],
  ] as const)('a failed auto-save: %s', (problem, detail) => {
    expect(autoSaveBox(problem, 'ethanol.chalk')).toEqual(
      warning("Couldn't save “ethanol.chalk”.", `${detail} ${TRY_AGAIN}`),
    );
  });

  it('changed outside with unwritten changes, the changed file open next to it', () => {
    expect(autoSaveBox('changed-outside', 'ethanol.chalk')).toEqual(
      warning(
        '“ethanol.chalk” was changed outside Chalkbond.',
        'Your changes are in the tab “ethanol (your changes)”. The changed file is open in the tab next to it.',
      ),
    );
  });

  it('changed outside, the changed file can not be opened', () => {
    expect(autoSaveBox('changed-outside-unopenable', 'ethanol.chalk')).toEqual(
      warning(
        '“ethanol.chalk” was changed outside Chalkbond.',
        "Chalkbond can't open the changed file. Your changes are in the tab “ethanol (your changes)”.",
      ),
    );
  });

  it('the tab name drops only a .chalk extension, in any case', () => {
    expect(autoSaveBox('changed-outside', 'A.b.CHALK').detail).toContain('“A.b (your changes)”');
    expect(autoSaveBox('changed-outside', 'noext').detail).toContain('“noext (your changes)”');
  });
});

describe('the keep box (SS6)', () => {
  it.each([
    ['disk-full', 'The disk is full. Free some space.'],
    ['write-denied', "Chalkbond isn't allowed to save in this folder. Choose another folder."],
    ['write-failed', 'Something went wrong while saving. Try again, or choose another folder.'],
  ] as const)('%s', (problem, detail) => {
    expect(keepBox(problem, 'Untitled 2')).toEqual(
      warning(
        "Chalkbond couldn't keep “Untitled 2”.",
        `${detail} Until it can, save this drawing with Save as.`,
      ),
    );
  });
});

describe('errorBox (I5 dispatch)', () => {
  it('routes by context', () => {
    expect(errorBox({ problem: 'missing', name: 'a.chalk' })).toEqual(
      fileErrorBox('missing', 'a.chalk'),
    );
    expect(errorBox({ context: 'auto-save', problem: 'busy', name: 'a.chalk' })).toEqual(
      autoSaveBox('busy', 'a.chalk'),
    );
    expect(errorBox({ context: 'keep', problem: 'disk-full', name: 'Untitled' })).toEqual(
      keepBox('disk-full', 'Untitled'),
    );
  });
});

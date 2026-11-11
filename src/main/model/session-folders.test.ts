// N2 and F2 / F6 folders (SPEC-app-shell.md): main keeps the session file the renderer named by
// ref, the last open folder and the last save folder for this run (A10 persists them).
import { describe, expect, it } from 'vitest';
import { createFileRefs } from './file-refs';
import { createSessionFolders, folderOf } from './session-folders';

const DOCS = 'C:\\Users\\T\\Documents';
function rig() {
  let n = 0;
  const refs = createFileRefs(() => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`);
  const folders = createSessionFolders(() => DOCS);
  return { refs, folders };
}

describe('folderOf', () => {
  it('keeps everything before the last separator, either kind', () => {
    expect(folderOf('C:\\Lessons\\toluene.png')).toBe('C:\\Lessons');
    expect(folderOf('/home/t/Lessons/toluene.png')).toBe('/home/t/Lessons');
    expect(folderOf('C:\\a/b\\c.chalk')).toBe('C:\\a/b');
    expect(folderOf('/x.chalk')).toBe('/');
    expect(folderOf('x.chalk')).toBe('');
  });
});

describe('createSessionFolders', () => {
  it('starts in Documents for Open and Save of every format', () => {
    const { folders } = rig();
    expect(folders.openFolder()).toBe(DOCS);
    for (const f of ['chalk', 'png', 'svg', 'pdf'] as const)
      expect(folders.saveFolder(f)).toBe(DOCS);
  });

  it('an opened ref sets the open folder; a saved ref sets the save folder', () => {
    const { refs, folders } = rig();
    folders.sessionFile(refs.get(refs.add('C:\\Open\\a.chalk', 'chalk', 'opened').id) ?? null);
    expect(folders.openFolder()).toBe('C:\\Open');
    expect(folders.saveFolder('chalk')).toBe(DOCS);
    folders.sessionFile(refs.get(refs.add('C:\\Save\\b.chalk', 'chalk', 'saved').id) ?? null);
    expect(folders.saveFolder('chalk')).toBe('C:\\Save');
    expect(folders.openFolder()).toBe('C:\\Open');
  });

  it("A6: a picture session's Save as (chalk) starts in the picture's folder", () => {
    const { refs, folders } = rig();
    folders.sessionFile(refs.get(refs.add('C:\\Save\\b.chalk', 'chalk', 'saved').id) ?? null);
    for (const kind of ['png', 'svg', 'pdf'] as const) {
      folders.sessionFile(refs.get(refs.add(`C:\\Pics\\t.${kind}`, kind, 'opened').id) ?? null);
      expect(folders.saveFolder('chalk')).toBe('C:\\Pics');
      // Export keeps its own rule (last save folder), not the picture's.
      expect(folders.saveFolder('png')).toBe('C:\\Save');
    }
  });

  it('a .chalk session or no session (New) uses the last save folder', () => {
    const { refs, folders } = rig();
    folders.sessionFile(refs.get(refs.add('/pics/t.png', 'png', 'opened').id) ?? null);
    folders.sessionFile(null);
    expect(folders.saveFolder('chalk')).toBe(DOCS);
    folders.sessionFile(refs.get(refs.add('/pics/t.png', 'png', 'opened').id) ?? null);
    folders.sessionFile(refs.get(refs.add('/d/e.chalk', 'chalk', 'opened').id) ?? null);
    expect(folders.saveFolder('chalk')).toBe(DOCS);
    expect(folders.openFolder()).toBe('/d');
  });
});

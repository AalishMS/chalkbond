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
      // Export keeps its own rule (export folder, else last save folder), not the picture's.
      expect(folders.saveFolder('png')).toBe('C:\\Save');
      expect(folders.saveFolder(kind)).toBe('C:\\Save');
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

describe('A10: remembered folders (ST2)', () => {
  function persisted(initial: Parameters<typeof createSessionFolders>[1]) {
    let n = 0;
    const refs = createFileRefs(() => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`);
    const changes: unknown[] = [];
    const folders = createSessionFolders(
      () => DOCS,
      initial,
      (f) => changes.push(f),
    );
    const entry = (path: string, kind: 'chalk' | 'png' | 'svg' | 'pdf', how: 'opened' | 'saved') =>
      refs.get(refs.add(path, kind, how).id) ?? null;
    return { folders, changes, entry };
  }

  it('starts from the stored folders', () => {
    const { folders } = persisted({ open: 'C:\\O', save: 'C:\\S', export: 'C:\\E' });
    expect(folders.openFolder()).toBe('C:\\O');
    expect(folders.saveFolder('chalk')).toBe('C:\\S');
    for (const f of ['png', 'svg', 'pdf'] as const) expect(folders.saveFolder(f)).toBe('C:\\E');
  });

  it('export falls back to the last save folder, then Documents', () => {
    expect(persisted({ open: null, save: 'C:\\S', export: null }).folders.saveFolder('png')).toBe(
      'C:\\S',
    );
    expect(persisted({ open: null, save: null, export: null }).folders.saveFolder('svg')).toBe(
      DOCS,
    );
  });

  it('an export choice sets the export folder only; New does not clear it', () => {
    const { folders, changes, entry } = persisted({ open: null, save: 'C:\\S', export: null });
    const chosen = entry('C:\\Slides\\t.png', 'png', 'saved');
    if (chosen) folders.exported(chosen);
    expect(folders.saveFolder('pdf')).toBe('C:\\Slides');
    expect(folders.saveFolder('chalk')).toBe('C:\\S');
    expect(folders.openFolder()).toBe(DOCS);
    folders.sessionFile(null);
    expect(folders.saveFolder('svg')).toBe('C:\\Slides');
    expect(changes).toEqual([{ open: null, save: 'C:\\S', export: 'C:\\Slides' }]);
  });

  it('reports open and save changes for persistence; a picture session keeps the A6 rule', () => {
    const { folders, changes, entry } = persisted({ open: null, save: null, export: 'C:\\E' });
    folders.sessionFile(entry('C:\\Pics\\t.png', 'png', 'opened'));
    folders.sessionFile(entry('C:\\Work\\t.chalk', 'chalk', 'saved'));
    expect(changes).toEqual([
      { open: 'C:\\Pics', save: null, export: 'C:\\E' },
      { open: 'C:\\Pics', save: 'C:\\Work', export: 'C:\\E' },
    ]);
    folders.sessionFile(entry('C:\\Pics\\u.svg', 'svg', 'opened'));
    expect(folders.saveFolder('chalk')).toBe('C:\\Pics');
    expect(folders.saveFolder('png')).toBe('C:\\E');
  });

  it('an unchanged folder reports nothing', () => {
    const { folders, changes, entry } = persisted({ open: 'C:\\O', save: null, export: null });
    folders.sessionFile(entry('C:\\O\\a.chalk', 'chalk', 'opened'));
    folders.sessionFile(null);
    expect(changes).toEqual([]);
  });
});

describe('F6 with tabs (TB20): the active tab decides, never the last N2', () => {
  it("a picture tab starts in its picture's folder", () => {
    const { folders } = rig();
    expect(
      folders.tabSaveFolder({ kind: 'picture', path: 'C:\\Pics\\t.png', folderExists: true }),
    ).toBe('C:\\Pics');
  });

  it("a kept tab starts in its former file's folder only while that folder exists", () => {
    const { refs, folders } = rig();
    folders.sessionFile(refs.get(refs.add('C:\\Save\\b.chalk', 'chalk', 'saved').id) ?? null);
    const former = { kind: 'former' as const, path: 'D:\\Stick\\ester.chalk' };
    expect(folders.tabSaveFolder({ ...former, folderExists: true })).toBe('D:\\Stick');
    expect(folders.tabSaveFolder({ ...former, folderExists: false })).toBe('C:\\Save');
  });

  it('a file tab or an unbound tab: the last save folder, else Documents (an opened picture does not leak)', () => {
    const { refs, folders } = rig();
    folders.sessionFile(refs.get(refs.add('C:\\Pics\\t.png', 'png', 'opened').id) ?? null);
    expect(folders.tabSaveFolder(null)).toBe(DOCS);
    expect(
      folders.tabSaveFolder({ kind: 'chalk', path: 'C:\\Open\\a.chalk', folderExists: true }),
    ).toBe(DOCS);
    folders.sessionFile(refs.get(refs.add('C:\\Save\\b.chalk', 'chalk', 'saved').id) ?? null);
    expect(folders.tabSaveFolder(null)).toBe('C:\\Save');
  });
});

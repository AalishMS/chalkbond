// I1 Open, C3 Save (F8, R6 replace box), I4 questions and I5 file errors over a fake dialog port.
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createDialogs, type DialogPort } from './dialogs';
import { createFileRefs } from './model/file-refs';
import { replaceBox, saveChangesBox, recoverBox, fileErrorBox } from './model/messages';

function rig(answers: { open?: string[]; save?: string; box?: number[]; exists?: string[] } = {}) {
  let n = 0;
  const refs = createFileRefs(() => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`);
  const boxes = [...(answers.box ?? [])];
  const port = {
    open: vi.fn(async () => ({
      canceled: answers.open === undefined,
      filePaths: answers.open ?? [],
    })),
    save: vi.fn(async () => ({
      canceled: answers.save === undefined,
      filePath: answers.save ?? '',
    })),
    box: vi.fn(async () => ({ response: boxes.shift() ?? 0 })),
  } satisfies DialogPort;
  const exists = vi.fn(async (path: string) => (answers.exists ?? []).includes(path));
  const dialogs = createDialogs({
    port,
    refs,
    exists,
    folders: { open: () => join('D', 'Documents'), save: () => join('D', 'Saves') },
  });
  return { dialogs, port, refs, exists };
}

describe('chooseOpen (I1, F2)', () => {
  it('shows the Open dialog with the Chalkbond drawings filter in the open folder', async () => {
    const r = rig();
    expect(await r.dialogs.chooseOpen()).toBeNull();
    expect(r.port.open).toHaveBeenCalledWith({
      defaultPath: join('D', 'Documents'),
      properties: ['openFile'],
      filters: [{ name: 'Chalkbond drawings', extensions: ['chalk', 'png', 'svg', 'pdf'] }],
    });
  });

  it('returns a ref: opened .chalk writable, opened picture read-only, no path', async () => {
    const r = rig({ open: [join('D', 'ethanol.chalk')] });
    const ref = await r.dialogs.chooseOpen();
    expect(ref).toEqual({ id: expect.any(String), name: 'ethanol.chalk', kind: 'chalk' });
    expect(r.refs.get(ref?.id ?? '')).toEqual({
      path: join('D', 'ethanol.chalk'),
      kind: 'chalk',
      writable: true,
    });
    const pic = await rig({ open: [join('D', 'Photo.PNG')] }).dialogs.chooseOpen();
    expect(pic?.kind).toBe('png');
  });

  it('opened pictures are read-only', async () => {
    const r = rig({ open: [join('D', 'slide.pdf')] });
    const ref = await r.dialogs.chooseOpen();
    expect(r.refs.get(ref?.id ?? '')?.writable).toBe(false);
  });

  it('a typed name without an Open extension shows the F14 unsupported box and gives no ref', async () => {
    const r = rig({ open: [join('D', 'Lessons', 'notes.docx')] });
    expect(await r.dialogs.chooseOpen()).toBeNull();
    // Main builds the box from the base name only; no ref is registered, nothing is read.
    expect(r.port.box.mock.calls).toEqual([[fileErrorBox('unsupported', 'notes.docx')]]);
    expect(fileErrorBox('unsupported', 'notes.docx')).toMatchObject({
      type: 'error',
      message: "Chalkbond can't open “notes.docx”.",
      detail:
        'It opens Chalkbond drawings (.chalk) and pictures made in Chalkbond (.png, .svg, .pdf).',
    });
    expect(r.refs.get('00000000-0000-4000-8000-000000000001')).toBeUndefined();
  });

  it('a supported name is not judged here: missing or unreadable files answer at I2', async () => {
    // A name with an Open extension gets a ref and no box; a missing file, a directory or a read
    // error is reported later by readFile with its own F14 problem (files.test.ts).
    const r = rig({ open: [join('D', 'gone.chalk')] });
    expect(await r.dialogs.chooseOpen()).toEqual({
      id: expect.any(String),
      name: 'gone.chalk',
      kind: 'chalk',
    });
    expect(r.port.box).not.toHaveBeenCalled();
  });

  it('a cancelled Open shows no box', async () => {
    const r = rig();
    expect(await r.dialogs.chooseOpen()).toBeNull();
    expect(r.port.box).not.toHaveBeenCalled();
  });
});

describe('chooseSave (C3, F8)', () => {
  it('shows one filter for the format and the suggested name in the save folder', async () => {
    for (const [format, name] of [
      ['chalk', 'Chalkbond drawing'],
      ['png', 'PNG picture'],
      ['svg', 'SVG drawing'],
      ['pdf', 'PDF document'],
    ] as const) {
      const r = rig();
      expect(await r.dialogs.chooseSave(format, `esterification.${format}`)).toBeNull();
      expect(r.port.save).toHaveBeenCalledWith({
        defaultPath: join('D', 'Saves', `esterification.${format}`),
        filters: [{ name, extensions: [format] }],
      });
    }
  });

  it('returns a writable ref of the format; the name the teacher typed is kept', async () => {
    const r = rig({
      save: join('E', 'esterification.chalk'),
      exists: [join('E', 'esterification.chalk')],
    });
    const ref = await r.dialogs.chooseSave('chalk', 'Untitled.chalk');
    expect(ref).toEqual({ id: expect.any(String), name: 'esterification.chalk', kind: 'chalk' });
    expect(r.refs.get(ref?.id ?? '')).toEqual({
      path: join('E', 'esterification.chalk'),
      kind: 'chalk',
      writable: true,
    });
    expect(r.port.box).not.toHaveBeenCalled(); // Windows already asked about the typed name
  });

  it('R6: appends the extension; a.CHALK is kept; notes.png → notes.png.chalk', async () => {
    for (const [typed, saved] of [
      ['notes', 'notes.chalk'],
      ['notes.png', 'notes.png.chalk'],
      ['a.CHALK', 'a.CHALK'],
    ] as const) {
      const r = rig({ save: join('E', typed) });
      expect((await r.dialogs.chooseSave('chalk', 'x.chalk'))?.name).toBe(saved);
      expect(r.port.box).not.toHaveBeenCalled();
    }
  });

  it('R6: when the appended name exists, asks Replace / Cancel before any write', async () => {
    const target = join('E', 'notes.png.chalk');
    const cancel = rig({ save: join('E', 'notes.png'), exists: [target], box: [1] });
    expect(await cancel.dialogs.chooseSave('chalk', 'x.chalk')).toBeNull();
    expect(cancel.exists).toHaveBeenCalledWith(target);
    expect(cancel.port.box).toHaveBeenCalledWith(replaceBox('notes.png.chalk'));

    const replace = rig({ save: join('E', 'notes.png'), exists: [target], box: [0] });
    const ref = await replace.dialogs.chooseSave('chalk', 'x.chalk');
    expect(replace.refs.get(ref?.id ?? '')?.path).toBe(target);
  });
});

describe('ask (I4) and showFileError (I5)', () => {
  it("save changes: Save / Don't save / Cancel", async () => {
    for (const [response, answer] of [
      [0, 'save'],
      [1, 'discard'],
      [2, 'cancel'],
    ] as const) {
      const r = rig({ box: [response] });
      expect(await r.dialogs.ask({ kind: 'save-changes', name: 'esterification' })).toBe(answer);
      expect(r.port.box).toHaveBeenCalledWith(saveChangesBox('esterification'));
    }
  });

  it('recover: Recover / Delete (closing recovers)', async () => {
    for (const [response, answer] of [
      [0, 'recover'],
      [1, 'delete'],
    ] as const) {
      const r = rig({ box: [response] });
      expect(await r.dialogs.ask({ kind: 'recover' })).toBe(answer);
      expect(r.port.box).toHaveBeenCalledWith(recoverBox());
    }
  });

  it('file error: the F14 box built in main from problem and name', async () => {
    const r = rig();
    await r.dialogs.showFileError('folder-gone', 'esterification.chalk');
    expect(r.port.box).toHaveBeenCalledWith(fileErrorBox('folder-gone', 'esterification.chalk'));
  });
});

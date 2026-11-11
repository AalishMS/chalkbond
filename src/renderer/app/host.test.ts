// A10 host wiring (SPEC-app-shell.md ST1, ST2, CO1): startup settings, preset tracking through the
// one controller, loads not stored, New uses the remembered style. Fake preload API.
import { describe, expect, it, vi } from 'vitest';
import { emptyDoc, serialize, setStyle, addAtom, type AtomId, type Doc } from '@core/doc-model';
import type { ChalkbondApi } from '../../preload/api';
import type { FileRef, RendererSettings } from '../../shared/ipc-types';
import { createWindowHost, type WindowHost } from './host';

const NOW = '2026-11-11T09:00:00.000Z';
const REF: FileRef = { id: '00000000-0000-4000-8000-000000000001', name: 'a.chalk', kind: 'chalk' };
const drawing = (preset: 'slides' | 'journal'): Doc => {
  const [d] = addAtom(setStyle(emptyDoc(NOW), { preset }), { element: 'C', x: 0, y: 0 });
  return d;
};

function fakeMain(settings: RendererSettings, fileText = serialize(drawing('slides'))) {
  const setSettings = vi.fn<ChalkbondApi['setSettings']>(() => Promise.resolve());
  const main = {
    startup: () => Promise.resolve({ settings, recovery: null, open: null }),
    setSettings,
    readFile: () =>
      Promise.resolve({ ok: true as const, bytes: new TextEncoder().encode(fileText) }),
    ask: () => Promise.resolve('discard'),
    sessionFile: vi.fn(),
    updateSession: vi.fn(),
    logError: vi.fn(),
    chooseOpen: () => Promise.resolve(REF),
    chooseSave: () => Promise.resolve(null),
    writeFile: () => Promise.resolve({ ok: true as const }),
    showFileError: () => Promise.resolve(),
    closeOk: vi.fn(),
    writeRecovery: vi.fn(),
    clearRecovery: vi.fn(),
    clipboardWrite: () => Promise.resolve({ ok: true }),
    clipboardRead: () =>
      Promise.resolve({ drawing: null, text: null, textTooLong: false, image: false }),
    platform: 'linux',
    onMainEvent: () => () => undefined,
  } as unknown as ChalkbondApi;
  return { main, setSettings };
}

const DEFAULTS: RendererSettings = {
  newDrawingStyle: 'slides',
  export: { format: 'png', pngDpi: 300, pngWhite: false },
};

describe('A10 host settings', () => {
  it('starts with the startup style and export choices', async () => {
    const remembered = { ...DEFAULTS, newDrawingStyle: 'journal' as const };
    const { main } = fakeMain(remembered);
    const host = await createWindowHost(main);
    expect(host.controller.getDoc().style.preset).toBe('journal');
    expect(host.settings()).toEqual(remembered);
  });

  it('a preset switch through the controller stores newDrawingStyle (I8)', async () => {
    const { main, setSettings } = fakeMain(DEFAULTS);
    const host = await createWindowHost(main);
    host.controller.run({ type: 'set-preset', preset: 'journal' });
    expect(setSettings).toHaveBeenLastCalledWith({ newDrawingStyle: 'journal' });
    expect(host.settings().newDrawingStyle).toBe('journal');
    host.controller.run('undo');
    expect(setSettings).toHaveBeenLastCalledWith({ newDrawingStyle: 'slides' });
  });

  it('loads (test hook, Open, New) are never stored; New uses the remembered style', async () => {
    const { main, setSettings } = fakeMain(DEFAULTS);
    const host = await createWindowHost(main);
    host.controller.run({ type: 'set-preset', preset: 'journal' });
    setSettings.mockClear();
    host.loadUntitled(drawing('slides'));
    await host.fileFlows.openRef(REF); // a slides drawing
    expect(host.controller.getDoc().style.preset).toBe('slides');
    await host.fileFlows.newDrawing();
    expect(host.controller.getDoc().style.preset).toBe('journal');
    expect(setSettings).not.toHaveBeenCalled();
    expect(host.settings().newDrawingStyle).toBe('journal');
  });

  it('remember(export) updates the settings and sends I8', async () => {
    const { main, setSettings } = fakeMain(DEFAULTS);
    const host = await createWindowHost(main);
    const choices = { format: 'svg', pngDpi: 600, pngWhite: true } as const;
    await host.remember({ export: choices });
    expect(setSettings).toHaveBeenCalledWith({ export: choices });
    expect(host.settings().export).toEqual(choices);
  });
});

describe('A11 host menu (N1 menu state, commands re-checked)', () => {
  it('N1 carries the menu state and is sent again only when title, dirty or menu changed', async () => {
    const { main } = fakeMain(DEFAULTS);
    const send = vi.mocked(main.updateSession);
    let text = false;
    const host = await createWindowHost(main, () => text);
    host.publishSession();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.lastCall?.[0]).toMatchObject({
      title: 'Untitled - Chalkbond',
      dirty: false,
      menu: { idle: true, empty: true, textFocus: false, modal: false, preset: 'slides' },
    });
    host.publishSession();
    expect(send).toHaveBeenCalledTimes(1);
    text = true;
    host.publishSession();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.lastCall?.[0].menu.textFocus).toBe(true);
    host.loadUntitled(drawing('slides'));
    expect(send.mock.lastCall?.[0].menu.empty).toBe(false);
  });

  it('runs a menu command only when the state now allows it', async () => {
    const { main } = fakeMain(DEFAULTS);
    let text = false;
    const host = await createWindowHost(main, () => text);
    expect(host.runCommand('file.export')).toBe(false); // an empty drawing has nothing to export
    host.loadUntitled(drawing('slides'));
    expect(host.runCommand('edit.select-all')).toBe(true);
    expect(host.controller.getSelection().atoms.size).toBe(1);
    expect(host.runCommand('view.zoom-reset')).toBe(true);
    expect(host.runCommand('view.style-handout')).toBe(true);
    expect(host.controller.getDoc().style.preset).toBe('journal');
    text = true;
    expect(host.runCommand('edit.delete')).toBe(false); // main acts on the text (M3)
    expect(host.controller.getSelection().atoms.size).toBe(1);
    expect(host.runCommand('file.exit')).toBe(false);
  });

  it('while the Export dialog is open no menu command runs (M1 modal)', async () => {
    const { main } = fakeMain(DEFAULTS);
    const host = await createWindowHost(main, () => false);
    host.loadUntitled(drawing('slides'));
    host.exportFlow.open();
    expect(host.modal()).toBe(true);
    expect(host.runCommand('edit.select-all')).toBe(false);
    expect(host.runCommand('view.zoom-fit')).toBe(false);
    host.exportFlow.cancel();
    expect(host.runCommand('view.zoom-fit')).toBe(true);
  });
});

describe('A12 one in-window dialog at a time (Export, Keyboard shortcuts)', () => {
  it('the shortcuts dialog is modal; Export cannot open over it, nor it over Export', async () => {
    const { main } = fakeMain(DEFAULTS);
    const host = await createWindowHost(main, () => false);
    host.loadUntitled(drawing('slides'));
    const heard: boolean[] = [];
    host.shortcutsDialog.subscribe(() => heard.push(host.shortcutsDialog.open()));
    expect(host.runCommand('help.shortcuts')).toBe(true);
    expect(host.shortcutsDialog.open()).toBe(true);
    expect(host.modal()).toBe(true);
    host.actions.exportDialog();
    expect(host.exportFlow.state()).toBeNull();
    expect(host.runCommand('file.export')).toBe(false);
    host.actions.shortcuts(); // already open: nothing new
    host.shortcutsDialog.close();
    host.shortcutsDialog.close();
    expect(heard).toEqual([true, false]);
    expect(host.modal()).toBe(false);

    host.actions.exportDialog();
    expect(host.exportFlow.state()).not.toBeNull();
    host.actions.shortcuts();
    expect(host.shortcutsDialog.open()).toBe(false);
    expect(host.runCommand('help.shortcuts')).toBe(false);
  });
});

describe('A13 canvas context menu (CM1, CM2; I6)', () => {
  type Shown = { onItem: boolean; state: { textFocus: boolean; hasSelection: boolean } };
  function rig(answers: (string | null)[], start: { text: boolean } = { text: false }) {
    const { main } = fakeMain(DEFAULTS);
    const shown: Shown[] = [];
    const pending: ((value: string | null) => void)[] = [];
    const view = { text: start.text, focused: 0 };
    Object.assign(main, {
      showContextMenu: vi.fn(
        (request: Shown) =>
          new Promise<string | null>((resolve) => {
            shown.push(request);
            if (answers.length > 0) resolve(answers.shift() ?? null);
            else pending.push(resolve);
          }),
      ),
    });
    return { main, shown, pending, view };
  }
  const ethanol = (): Doc => {
    let d = setStyle(emptyDoc(NOW), { preset: 'slides' });
    [d] = addAtom(d, { element: 'C', x: 0, y: 0 });
    [d] = addAtom(d, { element: 'O', x: 1, y: 0 });
    return d;
  };
  const target = (host: WindowHost) => {
    const [id] = Object.keys(host.controller.getDoc().atoms) as AtomId[];
    if (id === undefined) throw new Error('no atom');
    return { kind: 'atom' as const, id };
  };

  it('on an item: I6 with onItem and the state now, then the chosen command runs (Delete)', async () => {
    const r = rig(['edit.delete']);
    const host = await createWindowHost(r.main, () => r.view.text);
    host.loadUntitled(ethanol());
    host.controller.run('select-all');
    await host.contextMenu({ target: target(host), screen: { x: 1, y: 1 } });
    expect(r.shown).toEqual([
      expect.objectContaining({
        onItem: true,
        state: expect.objectContaining({ hasSelection: true, textFocus: false }),
      }),
    ]);
    expect(Object.keys(host.controller.getDoc().atoms)).toHaveLength(0);
  });

  it('empty canvas: onItem false; dismissed (null) changes nothing', async () => {
    const r = rig([null]);
    const host = await createWindowHost(r.main, () => r.view.text);
    host.loadUntitled(ethanol());
    const before = host.controller.getDoc();
    await host.contextMenu({ target: null, screen: { x: 1, y: 1 } });
    expect(r.shown[0]?.onItem).toBe(false);
    expect(host.controller.getDoc()).toBe(before);
    expect(host.controller.getSelection().atoms.size).toBe(0);
    expect(host.controller.canRun('undo')).toBe(false);
  });

  it('name field focused before: the canvas takes focus first, so Delete acts on the drawing', async () => {
    const r = rig(['edit.delete'], { text: true });
    const host = await createWindowHost(
      r.main,
      () => r.view.text,
      () => {
        r.view.focused++;
        r.view.text = false;
      },
    );
    host.loadUntitled(ethanol());
    host.controller.run('select-all');
    await host.contextMenu({ target: target(host), screen: { x: 1, y: 1 } });
    expect(r.view.focused).toBe(1);
    expect(r.shown[0]?.state.textFocus).toBe(false);
    expect(Object.keys(host.controller.getDoc().atoms)).toHaveLength(0);
  });

  it('the chosen command is re-checked: text focus regained meanwhile → Delete does nothing', async () => {
    const r = rig([]);
    const host = await createWindowHost(
      r.main,
      () => r.view.text,
      () => {
        r.view.text = false;
      },
    );
    host.loadUntitled(ethanol());
    host.controller.run('select-all');
    const done = host.contextMenu({ target: target(host), screen: { x: 1, y: 1 } });
    r.view.text = true;
    r.pending.shift()?.('edit.delete');
    await done;
    expect(Object.keys(host.controller.getDoc().atoms)).toHaveLength(2);
  });

  it('Paste runs the clipboard flow (CB-P1), the same function as Edit > Paste', async () => {
    const r = rig(['edit.paste']);
    const read = vi.fn(() =>
      Promise.resolve({ drawing: null, text: null, textTooLong: false, image: false }),
    );
    Object.assign(r.main, { clipboardRead: read });
    const host = await createWindowHost(r.main, () => false);
    await host.contextMenu({ target: null, screen: { x: 1, y: 1 } });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('one menu at a time; none while an in-window dialog is open', async () => {
    const r = rig([]);
    const host = await createWindowHost(r.main, () => false);
    host.loadUntitled(ethanol());
    const first = host.contextMenu({ target: null, screen: { x: 1, y: 1 } });
    await host.contextMenu({ target: null, screen: { x: 2, y: 2 } });
    expect(r.shown).toHaveLength(1);
    r.pending.shift()?.(null);
    await first;
    host.actions.shortcuts();
    await host.contextMenu({ target: null, screen: { x: 1, y: 1 } });
    expect(r.shown).toHaveLength(1);
  });

  it('an unknown answer is ignored and a failing I6 is logged', async () => {
    const r = rig(['app.quit']);
    const host = await createWindowHost(r.main, () => false);
    host.loadUntitled(ethanol());
    const before = host.controller.getDoc();
    await host.contextMenu({ target: null, screen: { x: 1, y: 1 } });
    expect(host.controller.getDoc()).toBe(before);
    Object.assign(r.main, { showContextMenu: () => Promise.reject(new Error('gone')) });
    await host.contextMenu({ target: null, screen: { x: 1, y: 1 } });
    expect(vi.mocked(r.main.logError)).toHaveBeenCalledWith(
      expect.stringContaining('Context menu'),
    );
  });
});

describe('A14 host recovery wiring (RC1, RC3, RC5; CO5)', () => {
  const recoveryMain = (recovery: { text: string; name: string } | null, answer = 'recover') => {
    const { main } = fakeMain(DEFAULTS);
    Object.assign(main, {
      startup: () => Promise.resolve({ settings: DEFAULTS, recovery, open: null }),
      ask: vi.fn(() => Promise.resolve(answer)),
    });
    return main;
  };

  it('start offers the recovery once, loads it as Recovered drawing, then focuses the canvas', async () => {
    const main = recoveryMain({ text: serialize(drawing('journal')), name: 'a.chalk' });
    const focused = vi.fn();
    const host = await createWindowHost(main, () => false, focused);
    await Promise.all([host.start(), host.start()]);
    expect(main.ask).toHaveBeenCalledTimes(1);
    expect(Object.keys(host.controller.getDoc().atoms)).toHaveLength(1);
    expect(host.session).toMatchObject({
      kind: 'recovered',
      forcedDirty: true,
      saveName: 'a.chalk',
    });
    expect(vi.mocked(main.updateSession).mock.lastCall?.[0].title).toBe(
      '*Recovered drawing - Chalkbond',
    );
    expect(focused).toHaveBeenCalledTimes(1);
    expect(main.clearRecovery).not.toHaveBeenCalled();
  });

  it('a normal launch (no recovery, no file) never loads: a test-hook drawing stays', async () => {
    const main = recoveryMain(null);
    const focused = vi.fn();
    const host = await createWindowHost(main, () => false, focused);
    host.loadUntitled(drawing('journal'));
    const loaded = host.controller.getDoc();
    await host.start();
    expect(host.controller.getDoc()).toBe(loaded);
    expect(main.ask).not.toHaveBeenCalled();
    expect(focused).not.toHaveBeenCalled();
  });

  it('an edit writes N3 2 s later with the committed drawing; flush writes at once', async () => {
    vi.useFakeTimers();
    try {
      const main = recoveryMain(null);
      const host = await createWindowHost(main, () => false);
      host.controller.run({ type: 'insert-text', text: 'ethanol' });
      expect(main.writeRecovery).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2000);
      expect(main.writeRecovery).toHaveBeenCalledTimes(1);
      expect(vi.mocked(main.writeRecovery).mock.lastCall?.[0]).toEqual({
        text: serialize(host.controller.getDoc()),
        name: 'Untitled',
      });
      host.flushRecovery();
      expect(main.writeRecovery).toHaveBeenCalledTimes(2);
      host.controller.run('undo');
      expect(main.clearRecovery).toHaveBeenCalledTimes(1);
      host.flushRecovery();
      expect(main.writeRecovery).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('A15 incoming opens (F11, R22) and drops (F12, SEC14)', () => {
  const B: FileRef = { id: '00000000-0000-4000-8000-000000000002', name: 'b.chalk', kind: 'chalk' };
  const fileMain = () => {
    const { main } = fakeMain(DEFAULTS);
    const readFile = vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        bytes: new TextEncoder().encode(serialize(drawing('journal'))),
      }),
    );
    const showFileError = vi.fn(() => Promise.resolve());
    const openDroppedFile = vi.fn<ChalkbondApi['openDroppedFile']>();
    Object.assign(main, { readFile, showFileError, openDroppedFile });
    return { main, readFile, showFileError, openDroppedFile };
  };

  it('no dialog open: an incoming open runs F3 at once', async () => {
    const { main, readFile } = fileMain();
    const host = await createWindowHost(main, () => false);
    await host.openRequested(REF);
    expect(readFile).toHaveBeenCalledWith(REF);
    expect(host.session).toMatchObject({ kind: 'chalk', name: 'a.chalk' });
  });

  it('while Export is open an incoming open waits (latest wins), leaves the dialog, runs after it closes', async () => {
    const { main, readFile } = fileMain();
    const host = await createWindowHost(main, () => false);
    host.loadUntitled(drawing('slides'));
    host.exportFlow.open();
    const dialog = host.exportFlow.state();
    await host.openRequested(REF);
    await host.openRequested(B);
    expect(readFile).not.toHaveBeenCalled();
    expect(host.exportFlow.state()).toEqual(dialog);
    host.exportFlow.cancel();
    await vi.waitFor(() => expect(host.session.name).toBe('b.chalk'));
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith(B);
  });

  it('while Keyboard shortcuts is open an incoming open waits until it closes', async () => {
    const { main, readFile } = fileMain();
    const host = await createWindowHost(main, () => false);
    host.actions.shortcuts();
    await host.openRequested(REF);
    expect(readFile).not.toHaveBeenCalled();
    expect(host.shortcutsDialog.open()).toBe(true);
    host.shortcutsDialog.close();
    await vi.waitFor(() => expect(readFile).toHaveBeenCalledWith(REF));
  });

  it('a drop asks I3 through the preload; the ref opens (F3)', async () => {
    const { main, readFile, openDroppedFile } = fileMain();
    openDroppedFile.mockResolvedValue({ ok: true, ref: REF });
    const host = await createWindowHost(main, () => false);
    const file = new File(['x'], 'a.chalk');
    await host.openDropped(file);
    expect(openDroppedFile).toHaveBeenCalledWith(file);
    expect(readFile).toHaveBeenCalledWith(REF);
  });

  it("a refused drop shows the F14 box with main's name (the file's name when main has none)", async () => {
    const { main, readFile, showFileError, openDroppedFile } = fileMain();
    openDroppedFile
      .mockResolvedValueOnce({ ok: false, problem: 'unsupported', name: 'notes.docx' })
      .mockResolvedValueOnce({ ok: false, problem: 'unsupported', name: '' })
      .mockRejectedValueOnce(new Error('ipc'));
    const host = await createWindowHost(main, () => false);
    await host.openDropped(new File(['x'], 'notes.docx'));
    await host.openDropped(new File(['x'], 'made.chalk'));
    await host.openDropped(new File(['x'], 'boom.chalk'));
    expect(showFileError.mock.calls).toEqual([
      ['unsupported', 'notes.docx'],
      ['unsupported', 'made.chalk'],
    ]);
    expect(readFile).not.toHaveBeenCalled();
    expect(main.logError).toHaveBeenCalledWith(expect.stringMatching(/^Drop failed: /));
  });

  it('a drop while a dialog is open opens nothing and asks nothing', async () => {
    const { main, openDroppedFile } = fileMain();
    const host = await createWindowHost(main, () => false);
    host.actions.shortcuts();
    await host.openDropped(new File(['x'], 'a.chalk'));
    expect(openDroppedFile).not.toHaveBeenCalled();
  });
});

describe('A15 RC7: recovery tracking waits for the startup offer (R23)', () => {
  it('an edit before the answer writes nothing and clears nothing; after Delete it is written', async () => {
    vi.useFakeTimers();
    try {
      const { main } = fakeMain(DEFAULTS);
      let answer!: (value: string) => void;
      Object.assign(main, {
        startup: () =>
          Promise.resolve({
            settings: DEFAULTS,
            recovery: { text: serialize(drawing('journal')), name: 'a.chalk' },
            open: null,
          }),
        ask: vi.fn(() => new Promise<string>((resolve) => (answer = resolve))),
      });
      const host = await createWindowHost(
        main,
        () => false,
        () => undefined,
      );
      host.controller.run({ type: 'insert-text', text: 'ethanol' });
      const starting = host.start();
      vi.advanceTimersByTime(20_000);
      host.flushRecovery();
      host.controller.run('undo');
      host.controller.run('redo');
      vi.advanceTimersByTime(20_000);
      expect(main.writeRecovery).not.toHaveBeenCalled();
      expect(main.clearRecovery).not.toHaveBeenCalled();
      answer('delete');
      await vi.waitFor(() => expect(main.clearRecovery).toHaveBeenCalledTimes(1));
      await starting;
      vi.advanceTimersByTime(2000);
      expect(main.writeRecovery).toHaveBeenCalledTimes(1);
      expect(vi.mocked(main.writeRecovery).mock.lastCall?.[0].text).toBe(
        serialize(host.controller.getDoc()),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

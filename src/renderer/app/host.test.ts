// A10 host wiring (SPEC-app-shell.md ST1, ST2, CO1): startup settings, preset tracking through the
// one controller, loads not stored, New uses the remembered style. Fake preload API.
import { describe, expect, it, vi } from 'vitest';
import { emptyDoc, serialize, setStyle, addAtom, type Doc } from '@core/doc-model';
import type { ChalkbondApi } from '../../preload/api';
import type { FileRef, RendererSettings } from '../../shared/ipc-types';
import { createWindowHost } from './host';

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

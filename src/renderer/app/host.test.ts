// Host wiring (SPEC-app-shell.md ST1, ST2, CO1, CO5, M1, CM1, CM2, W3, N1; TB20: the tabs, their
// flows and the SS4 write schedule over the preload's functions). The preload API is the shared
// fake-port harness of the tab flows (an in-memory session store, files by ref, main's bindings)
// plus the host's own channels; timers are vitest's fake timers.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDoc, parse, setStyle, addAtom, type AtomId, type Doc } from '@core/doc-model';
import type { ChalkbondApi } from '../../preload/api';
import type {
  FileRef,
  MainEvent,
  RendererSettings,
  StartupResponse,
  TabMenuAnswer,
} from '../../shared/ipc-types';
import { exportSvg } from '@core/clipboard-export';
import {
  createTabFlowHarness,
  encodeUtf8,
  type TabFlowHarness,
} from './model/__fixtures__/tab-flows-ports';
import { createWindowHost, type WindowHost } from './host';
import { installHostKeys } from './host-keys';

const NOW = '2026-11-11T09:00:00.000Z';
const drawing = (preset: 'slides' | 'journal', n = 1): Doc => {
  let d = setStyle(emptyDoc(NOW), { preset });
  for (let i = 0; i < n; i++) [d] = addAtom(d, { element: 'C', x: i, y: 0 });
  return d;
};

const DEFAULTS: RendererSettings = {
  newDrawingStyle: 'slides',
  export: { format: 'png', pngDpi: 300, pngWhite: false },
};

function rig(settings: RendererSettings = DEFAULTS, startup: Partial<StartupResponse> = {}) {
  const h = createTabFlowHarness();
  const setSettings = vi.fn<ChalkbondApi['setSettings']>(() => Promise.resolve());
  const updateSession = vi.fn<ChalkbondApi['updateSession']>();
  const ask = vi.fn(() => Promise.resolve('discard'));
  const showTabMenu = vi.fn<ChalkbondApi['showTabMenu']>(() => Promise.resolve(null));
  const showAppMenu = vi.fn<ChalkbondApi['showAppMenu']>(() => Promise.resolve(null));
  const openDroppedFile = vi.fn<ChalkbondApi['openDroppedFile']>();
  const closeOk = vi.fn();
  const main = {
    ...h.main,
    closeOk: () => {
      closeOk();
      h.main.closeOk();
    },
    startup: () => Promise.resolve({ settings, session: null, open: null, ...startup }),
    setSettings,
    updateSession,
    ask,
    showTabMenu,
    showAppMenu,
    openDroppedFile,
    showContextMenu: vi.fn(() => Promise.resolve(null)),
    clipboardWrite: () => Promise.resolve({ ok: true }),
    clipboardRead: () =>
      Promise.resolve({ drawing: null, text: null, textTooLong: false, image: false }),
    platform: 'linux',
    onMainEvent: () => () => undefined,
  } as unknown as ChalkbondApi;
  return {
    h,
    main,
    setSettings,
    updateSession,
    ask,
    showTabMenu,
    showAppMenu,
    openDroppedFile,
    closeOk,
  };
}

/** A host over `rig`, started (SS7), the canvas focus counted. */
async function started(r: ReturnType<typeof rig>, text = () => false) {
  const focus = vi.fn();
  const host = await createWindowHost(r.main, text, focus);
  await host.start();
  return { host, focus };
}

const count = (h: TabFlowHarness, name: string): number => h.names([name]).length;
/** An open waits in the queue while another flow runs (T17): wait until nothing runs. */
const settled = (host: WindowHost): Promise<void> =>
  vi.waitFor(() => expect(host.tabFlows.busy()).toBe(false));
const tabIds = (host: WindowHost): string[] => host.tabFlows.state().list.tabs.map((t) => t.id);
const activeId = (host: WindowHost): string => host.tabFlows.state().list.active;
const lastTitle = (r: ReturnType<typeof rig>): string | undefined =>
  r.updateSession.mock.lastCall?.[0].title;
/** The drawing in the record main last stored for `tabId`. */
function recordDoc(h: TabFlowHarness, tabId: string): Doc {
  const text = h.records.get(tabId);
  if (text === undefined) throw new Error(`no record for ${tabId}`);
  const parsed = parse((JSON.parse(text) as { editor: { file: string } }).editor.file);
  if (!parsed.ok) throw new Error('record drawing does not parse');
  return parsed.value;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('A10 host settings', () => {
  it('starts with the startup style and export choices', async () => {
    const remembered = { ...DEFAULTS, newDrawingStyle: 'journal' as const };
    const r = rig(remembered);
    const { host } = await started(r);
    expect(host.controller.getDoc().style.preset).toBe('journal');
    expect(host.settings()).toEqual(remembered);
  });

  it('a preset switch through the controller stores newDrawingStyle (I8)', async () => {
    const r = rig();
    const { host } = await started(r);
    host.controller.run({ type: 'set-preset', preset: 'journal' });
    expect(r.setSettings).toHaveBeenLastCalledWith({ newDrawingStyle: 'journal' });
    expect(host.settings().newDrawingStyle).toBe('journal');
    host.controller.run('undo');
    expect(r.setSettings).toHaveBeenLastCalledWith({ newDrawingStyle: 'slides' });
  });

  it('loads (test hook, Open, a tab switch) are never stored; a new tab uses the remembered style', async () => {
    const r = rig();
    const { host } = await started(r);
    host.controller.run({ type: 'set-preset', preset: 'journal' });
    const first = activeId(host);
    r.setSettings.mockClear();
    host.loadIntoActive(drawing('slides'));
    await host.openRequested(r.h.file('a.chalk', drawing('slides'))); // a new tab
    await settled(host);
    expect(host.controller.getDoc().style.preset).toBe('slides');
    await host.tabs.activate(first);
    await host.tabs.newTab();
    expect(host.controller.getDoc().style.preset).toBe('journal');
    expect(r.setSettings).not.toHaveBeenCalled();
    expect(host.settings().newDrawingStyle).toBe('journal');
  });

  it('remember(export) updates the settings and sends I8', async () => {
    const r = rig();
    const { host } = await started(r);
    const choices = { format: 'svg', pngDpi: 600, pngWhite: true } as const;
    await host.remember({ export: choices });
    expect(r.setSettings).toHaveBeenCalledWith({ export: choices });
    expect(host.settings().export).toEqual(choices);
  });
});

describe('A11 host menu (commands re-checked), R32 N1 title only', () => {
  it('N1 carries the title only and is sent again only when it changed (R32)', async () => {
    const r = rig();
    const { host } = await started(r);
    await host.refresh();
    const sent = r.updateSession.mock.calls.length;
    expect(r.updateSession.mock.lastCall?.[0]).toEqual({ title: 'Untitled - Chalkbond' });
    host.publishSession();
    expect(r.updateSession).toHaveBeenCalledTimes(sent);
    host.controller.run({ type: 'insert-text', text: 'ethanol' });
    await host.refresh();
    expect(r.updateSession).toHaveBeenCalledTimes(sent + 1);
    expect(r.updateSession.mock.lastCall?.[0]).toEqual({ title: '*Untitled - Chalkbond' });
    // A change the menu used to follow (selection, zoom, focus) sends nothing now.
    host.controller.run('select-all');
    await host.refresh();
    expect(r.updateSession).toHaveBeenCalledTimes(sent + 1);
  });

  it('runs a menu command only when the state now allows it', async () => {
    const r = rig();
    let text = false;
    const { host } = await started(r, () => text);
    expect(host.runCommand('file.export')).toBe(false); // an empty drawing has nothing to export
    host.loadIntoActive(drawing('slides'));
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
    const r = rig();
    const { host } = await started(r);
    host.loadIntoActive(drawing('slides'));
    host.exportFlow.open();
    expect(host.modal()).toBe(true);
    expect(host.runCommand('edit.select-all')).toBe(false);
    expect(host.runCommand('view.zoom-fit')).toBe(false);
    host.exportFlow.cancel();
    expect(host.runCommand('view.zoom-fit')).toBe(true);
  });

  it("File > New (the menu's file.new) adds a tab (T7), never asks", async () => {
    const r = rig();
    const { host } = await started(r);
    host.loadIntoActive(drawing('slides'));
    expect(host.runCommand('file.new')).toBe(true);
    await vi.waitFor(() => expect(tabIds(host)).toHaveLength(2));
    expect(r.ask).not.toHaveBeenCalled();
  });
});

describe('W3, N1: the title follows the active tab and F7 unsaved', () => {
  it('Untitled, *Untitled after a drawing, a file by its label, back to *Untitled on a switch', async () => {
    const r = rig();
    const { host } = await started(r);
    await host.refresh();
    expect(lastTitle(r)).toBe('Untitled - Chalkbond');
    const first = activeId(host);
    host.controller.run({ type: 'insert-text', text: 'ethanol' });
    await host.refresh();
    expect(lastTitle(r)).toBe('*Untitled - Chalkbond');
    await host.openRequested(r.h.file('esterification.chalk', drawing('slides', 2)));
    await settled(host);
    await host.refresh();
    expect(lastTitle(r)).toBe('esterification - Chalkbond');
    // An edit of a named file is no `*` (auto-save is due, not unsaved; R41).
    host.controller.run({ type: 'insert-text', text: 'water' });
    await host.refresh();
    expect(lastTitle(r)).toBe('esterification - Chalkbond');
    await host.tabs.activate(first);
    await host.refresh();
    expect(lastTitle(r)).toBe('*Untitled - Chalkbond');
  });

  it('the strip view: labels and markers, the active id', async () => {
    const r = rig();
    const { host } = await started(r);
    host.controller.run({ type: 'insert-text', text: 'ethanol' });
    await host.openRequested(
      r.h.file('toluene.svg', encodeUtf8(exportSvg(drawing('slides'), null).svg)),
    );
    await settled(host);
    await host.refresh();
    const view = host.tabsView.get();
    expect(view.tabs.map((t) => [t.label, t.marker])).toEqual([
      ['Untitled', 'dot'],
      ['toluene.svg', 'none'],
    ]);
    expect(view.activeId).toBe(activeId(host));
    expect(await host.hookTabs.read()).toEqual([
      expect.objectContaining({ label: 'Untitled', kind: 'untitled', active: false }),
      expect.objectContaining({ label: 'toluene.svg', kind: 'picture', active: true }),
    ]);
  });
});

describe('TB20 start-up (SS7, CO5): nothing is offered, nothing asked', () => {
  it('no session: one empty Untitled tab, nothing asked, the canvas focused, a second start does nothing', async () => {
    const r = rig();
    const { host, focus } = await started(r);
    await host.start();
    expect(tabIds(host)).toHaveLength(1);
    expect(r.ask).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(count(r.h, 'readTabRecord')).toBe(0);
    // Main knows the tabs and the active one at once (F6's folder reads it).
    expect(r.h.indexes.at(-1)).toEqual({
      tabs: [expect.objectContaining({ id: activeId(host), kind: 'untitled' })],
      active: activeId(host),
      discarded: [],
    });
  });

  it('a session: the strip shows every tab, only the active record is read; I7 open after it', async () => {
    const r = rig();
    const stored = createTabFlowHarness();
    stored.editor.run({ type: 'replace-doc', doc: drawing('slides', 3), label: 'Draw' });
    r.h.storeRecord(
      { id: 'b', kind: 'untitled', name: 'Untitled 2' },
      stored.editor.snapshotState(),
    );
    const ref = r.h.file('c.chalk', drawing('slides'));
    const session = r.h.session(
      [
        { id: 'a', kind: 'untitled', name: 'Untitled', unsaved: true },
        { id: 'b', kind: 'untitled', name: 'Untitled 2', unsaved: true },
      ],
      'b',
    );
    const r2 = {
      ...r,
      main: Object.assign(r.main, {
        startup: () => Promise.resolve({ settings: DEFAULTS, session, open: ref }),
      }),
    };
    const { host } = await started(r2);
    expect(r.h.argsOf('readTabRecord')).toEqual(['b']);
    expect(tabIds(host).slice(0, 2)).toEqual(['a', 'b']);
    expect(host.tabFlows.state().list.tabs.map((t) => t.name)).toEqual([
      'Untitled',
      'Untitled 2',
      'c.chalk',
    ]);
    expect(r.ask).not.toHaveBeenCalled();
    await host.refresh();
    expect(host.tabsView.get().tabs[0]?.marker).toBe('dot'); // from the index, not loaded
  });
});

describe('TB20 SS4 write schedule wiring', () => {
  it('a doc event writes the active record on AS2: 2 s after the last change, not before', async () => {
    vi.useFakeTimers();
    const r = rig();
    const { host } = await started(r);
    await vi.advanceTimersByTimeAsync(1000);
    const before = count(r.h, 'writeTabRecord');
    host.controller.run({ type: 'insert-text', text: 'ethanol' });
    await vi.advanceTimersByTimeAsync(1999);
    expect(count(r.h, 'writeTabRecord')).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(count(r.h, 'writeTabRecord')).toBe(before + 1);
    expect(recordDoc(r.h, activeId(host)).atoms).toEqual(host.controller.getDoc().atoms);
  });

  it('a view event writes the index after 2 s and no record', async () => {
    vi.useFakeTimers();
    const r = rig();
    const { host } = await started(r);
    await vi.advanceTimersByTimeAsync(3000);
    const records = count(r.h, 'writeTabRecord');
    const indexes = r.h.indexes.length;
    host.controller.store.dispatch({ type: 'canvas-resized', size: { w: 1000, h: 600 } });
    host.controller.run('zoom-in');
    await vi.advanceTimersByTimeAsync(1999);
    expect(r.h.indexes.length).toBe(indexes);
    await vi.advanceTimersByTimeAsync(1);
    expect(r.h.indexes.length).toBe(indexes + 1);
    expect(count(r.h, 'writeTabRecord')).toBe(records);
  });

  it('a switch writes the outgoing record itself; the put-in state schedules nothing', async () => {
    vi.useFakeTimers();
    const r = rig();
    const { host } = await started(r);
    const first = activeId(host);
    host.controller.run({ type: 'insert-text', text: 'ethanol' });
    await host.tabs.newTab();
    const second = activeId(host);
    expect(recordDoc(r.h, first).atoms).not.toEqual({});
    const records = count(r.h, 'writeTabRecord');
    await host.tabs.activate(first);
    await vi.advanceTimersByTimeAsync(20_000);
    // The switch wrote `second` once; no timer wrote anything after it.
    expect(count(r.h, 'writeTabRecord')).toBe(records + 1);
    expect(r.h.argsOf('writeTabRecord').at(-1)).toMatchObject({ tabId: second });
  });

  it('a tab-list change writes the index 500 ms later', async () => {
    vi.useFakeTimers();
    const r = rig();
    const { host } = await started(r);
    await host.tabs.newTab();
    await vi.advanceTimersByTimeAsync(3000);
    const indexes = r.h.indexes.length;
    host.tabs.move(0, 1);
    await vi.advanceTimersByTimeAsync(499);
    expect(r.h.indexes.length).toBe(indexes);
    await vi.advanceTimersByTimeAsync(1);
    expect(r.h.indexes.length).toBe(indexes + 1);
    expect(r.h.indexes.at(-1)?.tabs.map((t) => t.id)).toEqual(tabIds(host));
  });
});

describe('TB20 main events', () => {
  const send = (host: WindowHost, event: MainEvent): void => host.handleMainEvent(event);

  it('focus-tab activates that tab; an unknown id changes nothing', async () => {
    const r = rig();
    const { host } = await started(r);
    const first = activeId(host);
    await host.tabs.newTab();
    send(host, { type: 'focus-tab', tabId: first });
    await vi.waitFor(() => expect(activeId(host)).toBe(first));
    send(host, { type: 'focus-tab', tabId: 'nobody' });
    await vi.waitFor(() => expect(host.tabFlows.busy()).toBe(false));
    expect(activeId(host)).toBe(first);
  });

  it('open opens the ref in the empty Untitled tab (T17); a command runs', async () => {
    const r = rig();
    const { host } = await started(r);
    const ref = r.h.file('a.chalk', drawing('slides', 2));
    send(host, { type: 'open', ref });
    await vi.waitFor(() => expect(host.tabFlows.state().list.tabs[0]?.name).toBe('a.chalk'));
    expect(tabIds(host)).toHaveLength(1);
    send(host, { type: 'command', command: 'edit.select-all' });
    expect(host.commands).toEqual(['edit.select-all']);
    expect(host.controller.getSelection().atoms.size).toBe(2);
  });

  it('flush-session writes the record and the index at once', async () => {
    const r = rig();
    const { host } = await started(r);
    host.controller.run({ type: 'insert-text', text: 'ethanol' });
    const records = count(r.h, 'writeTabRecord');
    send(host, { type: 'flush-session' });
    await vi.waitFor(() => expect(count(r.h, 'writeTabRecord')).toBe(records + 1));
    expect(recordDoc(r.h, activeId(host)).atoms).toEqual(host.controller.getDoc().atoms);
  });

  it('close-requested: no box, the record, then N5; after N5 the schedule writes nothing', async () => {
    vi.useFakeTimers();
    const r = rig();
    const { host } = await started(r);
    host.controller.run({ type: 'insert-text', text: 'ethanol' });
    send(host, { type: 'close-requested' });
    await vi.waitFor(() => expect(r.closeOk).toHaveBeenCalledTimes(1));
    expect(r.ask).not.toHaveBeenCalled();
    expect(recordDoc(r.h, activeId(host)).atoms).toEqual(host.controller.getDoc().atoms);
    const calls = r.h.calls.length;
    host.controller.run({ type: 'insert-text', text: 'water' });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(r.h.names().slice(calls)).toEqual([]);
  });
});

describe('TB20 host actions (K1 tab keys, the strip, the tab menu)', () => {
  it('next, previous, tab n, last, close and reopen act on the tabs', async () => {
    const r = rig();
    const { host } = await started(r);
    await host.tabs.newTab();
    await host.tabs.newTab();
    const [a, b, c] = tabIds(host);
    const keys = host.hostActions;
    keys['tab-1']?.();
    await vi.waitFor(() => expect(activeId(host)).toBe(a));
    keys['next-tab']?.();
    await vi.waitFor(() => expect(activeId(host)).toBe(b));
    keys['previous-tab']?.();
    await vi.waitFor(() => expect(activeId(host)).toBe(a));
    keys['previous-tab']?.(); // wraps
    await vi.waitFor(() => expect(activeId(host)).toBe(c));
    keys['tab-8']?.(); // no tab 8: nothing
    await settled(host);
    expect(activeId(host)).toBe(c);
    keys['tab-1']?.();
    await vi.waitFor(() => expect(activeId(host)).toBe(a));
    keys['last-tab']?.();
    await vi.waitFor(() => expect(activeId(host)).toBe(c));
    expect(host.canReopen()).toBe(false);
    keys['close-tab']?.();
    await vi.waitFor(() => expect(tabIds(host)).toEqual([a, b]));
    expect(host.canReopen()).toBe(true);
    keys['reopen-tab']?.();
    await vi.waitFor(() => expect(tabIds(host)).toHaveLength(3));
    expect(r.ask).not.toHaveBeenCalled();
  });

  it('the menu key is counted until TB26 opens the ☰ menu', async () => {
    const r = rig();
    const { host } = await started(r);
    host.hostActions.menu?.();
    host.hostActions.menu?.();
    expect(host.hookTabs.menuRequests()).toBe(2);
  });

  it('a click activation focuses the canvas; a key activation does not', async () => {
    const r = rig();
    const { host, focus } = await started(r);
    const first = activeId(host);
    await host.tabs.newTab(true);
    expect(focus).toHaveBeenCalledTimes(2);
    await host.tabs.activate(first, false);
    expect(focus).toHaveBeenCalledTimes(2);
    await host.tabs.activate(tabIds(host)[1] ?? '', true);
    expect(focus).toHaveBeenCalledTimes(3);
  });

  it('the tab menu acts on the right-clicked tab, not the active one', async () => {
    const r = rig();
    const { host } = await started(r);
    await host.tabs.newTab();
    const [a, b] = tabIds(host);
    const answers: TabMenuAnswer[] = ['close', 'reopen', 'new-tab', null];
    r.showTabMenu.mockImplementation(() => Promise.resolve(answers.shift() ?? null));
    await host.tabs.menu(a ?? '', null);
    expect(r.showTabMenu).toHaveBeenLastCalledWith({
      tabId: a,
      state: { canReopenTab: false },
      at: null,
    });
    expect(tabIds(host)).toEqual([b]);
    await host.tabs.menu(b ?? '', { x: 10, y: 20 });
    expect(r.showTabMenu.mock.lastCall?.[0].state).toEqual({ canReopenTab: true });
    expect(tabIds(host)).toHaveLength(2);
    await host.tabs.menu(b ?? '', null);
    expect(tabIds(host)).toHaveLength(3);
    await host.tabs.menu(b ?? '', null);
    expect(tabIds(host)).toHaveLength(3);
  });

  it('a failing tab menu is logged; none opens while a dialog is open', async () => {
    const r = rig();
    const { host } = await started(r);
    r.showTabMenu.mockRejectedValueOnce(new Error('gone'));
    await host.tabs.menu(activeId(host), null);
    expect(r.h.errors).toContainEqual(expect.stringContaining('Tab menu failed'));
    host.actions.shortcuts();
    await host.tabs.menu(activeId(host), null);
    expect(r.showTabMenu).toHaveBeenCalledTimes(1);
  });

  it('M4 (I9): the ☰ press sends the state now; the chosen command runs, re-checked, and is heard', async () => {
    const r = rig();
    const { host } = await started(r);
    host.loadIntoActive(drawing('slides'));
    r.showAppMenu.mockResolvedValueOnce('edit.select-all');
    await host.appMenu.open();
    const request = r.showAppMenu.mock.lastCall?.[0];
    expect(request).toMatchObject({
      x: 0,
      y: 0,
      state: { idle: true, empty: false, modal: false, canReopenTab: false },
    });
    expect(host.controller.getSelection().atoms.size).toBe(1);
    expect(host.commands).toEqual(['edit.select-all']);
    expect(host.appMenu.isOpen()).toBe(false);
  });

  it('M4: aria-expanded follows the popup; the listeners hear it open and close', async () => {
    const r = rig();
    const { host } = await started(r);
    const seen: boolean[] = [];
    host.appMenu.subscribe(() => seen.push(host.appMenu.isOpen()));
    let answer: (command: null) => void = () => undefined;
    r.showAppMenu.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const opening = host.appMenu.open();
    expect(host.appMenu.isOpen()).toBe(true);
    answer(null);
    await opening;
    expect(seen).toEqual([true, false]);
  });

  it('M5: a second press while the popup is open, a tab menu or a dialog sends nothing', async () => {
    const r = rig();
    const { host } = await started(r);
    let answer: (command: null) => void = () => undefined;
    r.showAppMenu.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const first = host.appMenu.open();
    await host.appMenu.open();
    await host.tabs.menu(activeId(host), null);
    expect(r.showAppMenu).toHaveBeenCalledTimes(1);
    expect(r.showTabMenu).not.toHaveBeenCalled();
    answer(null);
    await first;
    host.actions.shortcuts();
    await host.appMenu.open();
    expect(r.showAppMenu).toHaveBeenCalledTimes(1);
  });

  it('M4: Alt and F10 (hostActions.menu) open the popup and are counted for the test hook', async () => {
    const r = rig();
    const { host } = await started(r);
    host.hostActions.menu?.();
    await vi.waitFor(() => expect(r.showAppMenu).toHaveBeenCalledTimes(1));
    expect(host.hookTabs.menuRequests()).toBe(1);
  });

  it('M6: canReopenTab follows the reopen list; File > Close tab and Reopen closed tab run (R47)', async () => {
    const r = rig();
    const { host } = await started(r);
    await host.tabs.newTab();
    await host.appMenu.open();
    expect(r.showAppMenu.mock.lastCall?.[0].state.canReopenTab).toBe(false);
    expect(host.runCommand('file.reopen-tab')).toBe(false);
    expect(host.runCommand('file.close-tab')).toBe(true);
    await vi.waitFor(() => expect(tabIds(host)).toHaveLength(1));
    await host.appMenu.open();
    expect(r.showAppMenu.mock.lastCall?.[0].state.canReopenTab).toBe(true);
    expect(host.runCommand('file.reopen-tab')).toBe(true);
    await vi.waitFor(() => expect(tabIds(host)).toHaveLength(2));
  });

  it('a failing popup is logged and leaves the button usable', async () => {
    const r = rig();
    const { host } = await started(r);
    r.showAppMenu.mockRejectedValueOnce(new Error('gone'));
    await host.appMenu.open();
    expect(r.h.errors).toContainEqual(expect.stringContaining('Menu failed'));
    expect(host.appMenu.isOpen()).toBe(false);
    await host.appMenu.open();
    expect(r.showAppMenu).toHaveBeenCalledTimes(2);
  });

  it('Export suggests the active tab name; an untitled tab has none', async () => {
    const r = rig();
    const { host } = await started(r);
    host.loadIntoActive(drawing('slides'));
    host.exportFlow.open();
    await host.exportFlow.save();
    await host.openRequested(r.h.file('a.chalk', drawing('slides')));
    await settled(host);
    host.exportFlow.open();
    await host.exportFlow.save();
    expect(r.h.calls.filter((c) => c.name === 'chooseSave').map((c) => c.args[1])).toEqual([
      'Untitled.png',
      'a.png',
    ]);
  });
});

describe('A12 one in-window dialog at a time (Export, Keyboard shortcuts)', () => {
  it('the shortcuts dialog is modal; Export cannot open over it, nor it over Export', async () => {
    const r = rig();
    const { host } = await started(r);
    host.loadIntoActive(drawing('slides'));
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
  function menuRig(answers: (string | null)[], start: { text: boolean } = { text: false }) {
    const r = rig();
    const shown: Shown[] = [];
    const pending: ((value: string | null) => void)[] = [];
    const view = { text: start.text, focused: 0 };
    Object.assign(r.main, {
      showContextMenu: vi.fn(
        (request: Shown) =>
          new Promise<string | null>((resolve) => {
            shown.push(request);
            if (answers.length > 0) resolve(answers.shift() ?? null);
            else pending.push(resolve);
          }),
      ),
    });
    return { ...r, shown, pending, view };
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
    const r = menuRig(['edit.delete']);
    const { host } = await started(r, () => r.view.text);
    host.loadIntoActive(ethanol());
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
    const r = menuRig([null]);
    const { host } = await started(r, () => r.view.text);
    host.loadIntoActive(ethanol());
    const before = host.controller.getDoc();
    await host.contextMenu({ target: null, screen: { x: 1, y: 1 } });
    expect(r.shown[0]?.onItem).toBe(false);
    expect(host.controller.getDoc()).toBe(before);
    expect(host.controller.getSelection().atoms.size).toBe(0);
    expect(host.controller.canRun('undo')).toBe(false);
  });

  it('name field focused before: the canvas takes focus first, so Delete acts on the drawing', async () => {
    const r = menuRig(['edit.delete'], { text: true });
    const host = await createWindowHost(
      r.main,
      () => r.view.text,
      () => {
        r.view.focused++;
        r.view.text = false;
      },
    );
    host.loadIntoActive(ethanol());
    host.controller.run('select-all');
    await host.contextMenu({ target: target(host), screen: { x: 1, y: 1 } });
    expect(r.view.focused).toBe(1);
    expect(r.shown[0]?.state.textFocus).toBe(false);
    expect(Object.keys(host.controller.getDoc().atoms)).toHaveLength(0);
  });

  it('the chosen command is re-checked: text focus regained meanwhile → Delete does nothing', async () => {
    const r = menuRig([]);
    const host = await createWindowHost(
      r.main,
      () => r.view.text,
      () => {
        r.view.text = false;
      },
    );
    host.loadIntoActive(ethanol());
    host.controller.run('select-all');
    const done = host.contextMenu({ target: target(host), screen: { x: 1, y: 1 } });
    r.view.text = true;
    r.pending.shift()?.('edit.delete');
    await done;
    expect(Object.keys(host.controller.getDoc().atoms)).toHaveLength(2);
  });

  it('Paste runs the clipboard flow (CB-P1), the same function as Edit > Paste', async () => {
    const r = menuRig(['edit.paste']);
    const read = vi.fn(() =>
      Promise.resolve({ drawing: null, text: null, textTooLong: false, image: false }),
    );
    Object.assign(r.main, { clipboardRead: read });
    const host = await createWindowHost(r.main, () => false);
    await host.contextMenu({ target: null, screen: { x: 1, y: 1 } });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('one menu at a time; none while an in-window dialog is open', async () => {
    const r = menuRig([]);
    const host = await createWindowHost(r.main, () => false);
    host.loadIntoActive(ethanol());
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
    const r = menuRig(['app.quit']);
    const host = await createWindowHost(r.main, () => false);
    host.loadIntoActive(ethanol());
    const before = host.controller.getDoc();
    await host.contextMenu({ target: null, screen: { x: 1, y: 1 } });
    expect(host.controller.getDoc()).toBe(before);
    Object.assign(r.main, { showContextMenu: () => Promise.reject(new Error('gone')) });
    await host.contextMenu({ target: null, screen: { x: 1, y: 1 } });
    expect(r.h.errors).toContainEqual(expect.stringContaining('Context menu'));
  });
});

describe('A15 incoming opens (F11, R22, R37) and drops (F12, SEC14)', () => {
  it('no dialog open: an incoming open runs T17 at once', async () => {
    const r = rig();
    const { host } = await started(r);
    const ref = r.h.file('a.chalk', drawing('journal'));
    await host.openRequested(ref);
    expect(r.h.argsOf('readFile')).toEqual([ref]);
    expect(host.tabFlows.state().list.tabs.map((t) => t.name)).toEqual(['a.chalk']);
  });

  it('while Export is open opens and focuses wait in order, leave the dialog, run after it closes', async () => {
    const r = rig();
    const { host } = await started(r);
    const first = activeId(host);
    host.loadIntoActive(drawing('slides'));
    const a = r.h.file('a.chalk', drawing('journal'));
    const b = r.h.file('b.chalk', drawing('journal'));
    host.exportFlow.open();
    const dialog = host.exportFlow.state();
    await host.openRequested(a);
    await host.openRequested(b);
    await host.focusRequested(first);
    expect(count(r.h, 'readFile')).toBe(0);
    expect(host.exportFlow.state()).toEqual(dialog);
    host.exportFlow.cancel();
    await vi.waitFor(() => expect(activeId(host)).toBe(first));
    await vi.waitFor(() => expect(host.tabFlows.busy()).toBe(false));
    expect(host.tabFlows.state().list.tabs.map((t) => t.name)).toEqual([
      'Untitled',
      'a.chalk',
      'b.chalk',
    ]);
    expect(activeId(host)).toBe(first);
  });

  it('while Keyboard shortcuts is open an incoming open waits until it closes', async () => {
    const r = rig();
    const { host } = await started(r);
    const ref = r.h.file('a.chalk', drawing('journal'));
    host.actions.shortcuts();
    await host.openRequested(ref);
    expect(count(r.h, 'readFile')).toBe(0);
    expect(host.shortcutsDialog.open()).toBe(true);
    host.shortcutsDialog.close();
    await vi.waitFor(() => expect(r.h.argsOf('readFile')).toEqual([ref]));
  });

  it('a drop asks I3 for each file through the preload; each opens in its own tab in order', async () => {
    const r = rig();
    const { host } = await started(r);
    host.loadIntoActive(drawing('slides'));
    const a = r.h.file('a.chalk', drawing('slides'));
    const b = r.h.file('b.chalk', drawing('slides'));
    const refs: Record<string, FileRef> = { 'a.chalk': a, 'b.chalk': b };
    r.openDroppedFile.mockImplementation((file) =>
      Promise.resolve({ ok: true, ref: refs[file.name] as FileRef }),
    );
    const files = [
      new File(['x'], 'a.chalk'),
      new File(['x'], 'notes.docx'),
      new File(['x'], 'b.chalk'),
    ];
    await host.openDropped(files);
    await vi.waitFor(() => expect(host.tabFlows.busy()).toBe(false));
    expect(r.openDroppedFile.mock.calls.map(([f]) => f.name)).toEqual(['a.chalk', 'b.chalk']);
    expect(host.tabFlows.state().list.tabs.map((t) => t.name)).toEqual([
      'Untitled',
      'a.chalk',
      'b.chalk',
    ]);
  });

  it("a refused drop shows the F14 box with main's name (the file's name when main has none)", async () => {
    const r = rig();
    const { host } = await started(r);
    r.openDroppedFile
      .mockResolvedValueOnce({ ok: false, problem: 'unsupported', name: 'notes.docx' })
      .mockResolvedValueOnce({ ok: false, problem: 'unsupported', name: '' })
      .mockRejectedValueOnce(new Error('ipc'));
    await host.openDropped([new File(['x'], 'notes.docx')]);
    await host.openDropped([new File(['x'], 'made.chalk')]);
    await host.openDropped([new File(['x'], 'boom.chalk')]);
    await vi.waitFor(() => expect(host.tabFlows.busy()).toBe(false));
    expect(r.h.calls.filter((c) => c.name === 'showFileError').map((c) => c.args)).toEqual([
      ['unsupported', 'notes.docx'],
      ['unsupported', 'made.chalk'],
    ]);
    expect(count(r.h, 'readFile')).toBe(0);
    expect(r.h.errors).toContainEqual(expect.stringMatching(/^Tab flow failed: /));
  });

  it('a drop while a dialog is open opens nothing and asks nothing; an empty drop nothing', async () => {
    const r = rig();
    const { host } = await started(r);
    await host.openDropped([]);
    host.actions.shortcuts();
    await host.openDropped([new File(['x'], 'a.chalk')]);
    expect(r.openDroppedFile).not.toHaveBeenCalled();
  });
});

describe('TB22 host key listener (K1, K3)', () => {
  class FakeElement extends EventTarget {
    isContentEditable = false;
    closest = (): null => null;
  }
  class FakeInput extends FakeElement {}

  function setup(opts: { idle?: boolean; modal?: boolean; canReopen?: boolean } = {}) {
    // Node's `removeEventListener` ignores a boolean `capture`; browsers do not.
    class FakeWindow extends EventTarget {
      override removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
      ): void {
        super.removeEventListener(
          type,
          listener,
          typeof options === 'boolean' ? { capture: options } : options,
        );
      }
    }
    const win = new FakeWindow();
    vi.stubGlobal('window', win);
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLTextAreaElement', class extends FakeElement {});
    const controller = {
      getSelection: () => ({ atoms: new Set(), bonds: new Set(), objects: new Set() }),
      canRun: () => opts.idle ?? true,
      getDoc: () => ({ atoms: {}, objects: {} }),
    };
    const calls: string[] = [];
    const record = (name: string) => () => void calls.push(name);
    const actions = {
      'copy-whole': record('copy-whole'),
      paste: record('paste'),
      new: record('new'),
      open: record('open'),
      save: record('save'),
      'save-as': record('save-as'),
      export: record('export'),
      shortcuts: record('shortcuts'),
      'focus-name': record('focus-name'),
      menu: record('menu'),
      'close-tab': record('close-tab'),
      'tab-2': record('tab-2'),
      'last-tab': record('last-tab'),
      'reopen-tab': record('reopen-tab'),
    };
    const stop = installHostKeys(
      controller as never,
      { busy: () => false },
      actions as never,
      () => opts.modal ?? false,
      () => opts.canReopen ?? false,
    );
    const send = (
      type: string,
      init: Record<string, unknown>,
      target?: EventTarget,
    ): { prevented: boolean; stopped: boolean } => {
      const event = new Event(type, { cancelable: true, bubbles: true });
      Object.assign(
        event,
        { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
        init,
      );
      if (target) Object.defineProperty(event, 'target', { value: target });
      const stopped = vi.spyOn(event, 'stopPropagation');
      win.dispatchEvent(event);
      return { prevented: event.defaultPrevented, stopped: stopped.mock.calls.length > 0 };
    };
    return { calls, send, stop, win };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes code: Ctrl+2 and Ctrl+9 match by the physical key with a Devanagari key', () => {
    const { calls, send, stop } = setup();
    const two = send('keydown', { key: '२', code: 'Digit2', ctrlKey: true });
    expect(two).toEqual({ prevented: true, stopped: true });
    send('keydown', { key: '9', code: 'Numpad9', ctrlKey: true });
    send('keydown', { key: '2', ctrlKey: true }); // no code: not a tab key
    expect(calls).toEqual(['tab-2', 'last-tab']);
    stop();
  });

  it('handled keys are prevented and stopped; unhandled keys reach the editor untouched', () => {
    const { calls, send, stop } = setup();
    expect(send('keydown', { key: 'w', ctrlKey: true })).toEqual({
      prevented: true,
      stopped: true,
    });
    expect(send('keydown', { key: 'z', ctrlKey: true })).toEqual({
      prevented: false,
      stopped: false,
    });
    // A tab key with no handler (next-tab here) is left alone.
    expect(send('keydown', { key: 'Tab', ctrlKey: true })).toEqual({
      prevented: false,
      stopped: false,
    });
    expect(calls).toEqual(['close-tab']);
    stop();
  });

  it('Ctrl+Shift+T follows the reopen list; the name field still gets the tab keys', () => {
    const empty = setup();
    empty.send('keydown', { key: 'T', shiftKey: true, ctrlKey: true });
    expect(empty.calls).toEqual([]);
    empty.stop();
    const full = setup({ canReopen: true });
    full.send('keydown', { key: 'T', shiftKey: true, ctrlKey: true });
    full.send('keydown', { key: 'w', ctrlKey: true }, new FakeInput());
    expect(full.calls).toEqual(['reopen-tab', 'close-tab']);
    full.stop();
  });

  it('busy (a label or text editor) stops the tab keys but not F10; a dialog stops both', () => {
    const busy = setup({ idle: false });
    busy.send('keydown', { key: 'w', ctrlKey: true });
    busy.send('keydown', { key: 'F10' });
    expect(busy.calls).toEqual(['menu']);
    busy.stop();
    const modal = setup({ modal: true });
    modal.send('keydown', { key: 'w', ctrlKey: true });
    modal.send('keydown', { key: 'F10' });
    modal.send('keydown', { key: 'Alt', repeat: false });
    modal.send('keyup', { key: 'Alt' });
    expect(modal.calls).toEqual([]);
    modal.stop();
  });

  it('a lone Alt opens the menu on the key-up and prevents it', () => {
    const { calls, send, stop } = setup();
    expect(send('keydown', { key: 'Alt', altKey: true, repeat: false }).prevented).toBe(false);
    expect(send('keyup', { key: 'Alt' }).prevented).toBe(true);
    expect(calls).toEqual(['menu']);
    stop();
  });

  it('Alt+click, Alt+Tab, Alt+Shift and a blur open nothing; the Alt+click key-up is prevented', () => {
    const { calls, send, stop, win } = setup();
    send('keydown', { key: 'Alt', altKey: true, repeat: false });
    send('pointerdown', { altKey: true });
    expect(send('keyup', { key: 'Alt' }).prevented).toBe(true);
    send('keydown', { key: 'Alt', altKey: true, repeat: false });
    send('keydown', { key: 'Tab', altKey: true });
    send('keyup', { key: 'Alt' });
    send('keydown', { key: 'Shift', shiftKey: true });
    send('keydown', { key: 'Alt', altKey: true, shiftKey: true, repeat: false });
    send('keyup', { key: 'Alt', shiftKey: true });
    send('keydown', { key: 'Alt', altKey: true, repeat: false });
    win.dispatchEvent(new Event('blur'));
    send('keyup', { key: 'Alt' });
    expect(calls).toEqual([]);
    stop();
  });

  it('the cleanup removes every listener, the blur one too', () => {
    const { calls, send, stop } = setup();
    stop();
    send('keydown', { key: 'w', ctrlKey: true });
    send('keydown', { key: 'F10' });
    expect(calls).toEqual([]);
  });
});

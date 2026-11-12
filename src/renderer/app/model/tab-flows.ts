// Tab flows (SPEC-app-shell.md "Tabs, auto-save and session"): T7 new tab, T11 switch, T12 reopen,
// T17 opening into tabs (with its open queue), SS7 restore and SS11's renderer half. TB18 adds
// auto-save and Save, TB19 the full close. Pure: DOM-free, no timers; every effect goes through an
// injected port (`main` is the preload's functions, `controller` the one editor controller).
//
// One in-progress flag for every flow. While a flow runs, keys, clicks and the + button are ignored
// (T11: input waits for the incoming state) and opens wait in a first-in-first-out queue of at most
// `OPEN_QUEUE_LIMIT` (T17, R37). The active tab's truth is the controller: its `Tab.state` in the
// list is only refreshed when a flow needs it (`snapshotState`). A tab never holds a path (R8).
import { emptyDoc, parse, setStyle, type Doc } from '@core/doc-model';
import { extractDrawing, fileKindOf } from '@core/clipboard-export';
import {
  tabStateDoc,
  tabStateMarkSaved,
  tabStateView,
  type EditorController,
  type EditorTabState,
} from '../../editor';
import type {
  BindTabRequest,
  BindTabResponse,
  CheckTabFileResponse,
  FileDroppedResponse,
  FileProblem,
  FileRef,
  OpenTarget,
  ReadFileResponse,
  ReadTabRecordResponse,
  SessionIndexUpdate,
  SessionTab,
  SessionTabView,
  StartupSession,
  WriteTabRecordRequest,
  WriteTabRecordResponse,
} from '../../../shared/ipc-types';
import { parseProblem } from './file-flows';
import { buildRecord, loadTabRecord } from './session-record';
import {
  drawingHash,
  hasUnwrittenChanges,
  indexFlags,
  markerOf,
  recordFailedAfter,
  tabFacts,
  type Sha256,
  type TabFacts,
  type TabMarker,
} from './tab-status';
import {
  activate,
  activeTab,
  canOpenInto,
  close,
  createTabs,
  findTab,
  indexOfTab,
  initialTabs,
  newUntitled,
  open,
  openInto,
  reopen,
  update,
  type NewDrawingStyle,
  type Tab,
  type TabList,
  type TabPorts,
} from './tabs';

/** T17 (R37): opens waiting while a flow runs; later ones are dropped and logged. */
export const OPEN_QUEUE_LIMIT = 20;
/** N-A5 (SS11). */
export const DAMAGED_NOTICE = 'A drawing kept by Chalkbond could not be read.';

/** The preload functions the tab flows use (`window.chalkbond`); TB18 and TB19 add theirs. */
export interface TabFlowMain {
  /** I1: a ref, `{ focus }` when the file is open in a tab (T17), or null when cancelled. */
  chooseOpen(): Promise<OpenTarget | null>;
  /** I2. */
  readFile(ref: FileRef): Promise<ReadFileResponse>;
  /** I5: the F14 box. */
  showFileError(problem: FileProblem, name: string): Promise<void>;
  /** I11. */
  readTabRecord(tabId: string): Promise<ReadTabRecordResponse>;
  /** N7 (an invoke: SS6 reads its answer). */
  writeTabRecord(value: WriteTabRecordRequest): Promise<WriteTabRecordResponse>;
  /** N10. */
  damagedTabRecord(tabId: string): void;
  /** N8. */
  updateSessionIndex(value: SessionIndexUpdate): void;
  /** I12. */
  bindTab(request: BindTabRequest): Promise<BindTabResponse>;
  /** I14. */
  checkTabFile(tabId: string): Promise<CheckTabFileResponse>;
  /**
   * SS11 "a file tab whose record is damaged opens from its file": the bytes of the file bound to
   * a file tab, by tab id (a restored tab has no ref). No IPC row yet (TB17 report): until main has
   * one, the host may answer `{ ok: false, problem: 'unreadable' }`, and the tab is lost with N-A5.
   */
  readTabFile(tabId: string): Promise<ReadFileResponse>;
  /** N6. */
  logError(message: string): void;
}

export type TabFlowController = Pick<
  EditorController,
  'getDoc' | 'takeState' | 'putState' | 'newState' | 'snapshotState'
>;

export interface TabFlowOptions {
  readonly main: TabFlowMain;
  readonly controller: TabFlowController;
  readonly sha256: Sha256;
  /** ISO timestamps (new drawings, restored histories). */
  clock(): string;
  /** `crypto.randomUUID()` in the host. */
  newId(): string;
  /** The status-bar notice (`controller.notify` in the host). */
  notify(kind: 'info' | 'error', text: string): void;
  /** F4a: finishes an open label or text editor through its commit path (at once when none). */
  finishEditing(): Promise<void>;
  /** I4 `save-changes` (T9); used by TB19. */
  ask(request: { kind: 'save-changes'; name: string }): Promise<'save' | 'discard' | 'cancel'>;
  /** ST1 / T18. */
  newDrawingStyle(): NewDrawingStyle;
  /** Strict UTF-8; null on a malformed sequence. */
  decodeUtf8(bytes: Uint8Array): string | null;
  /**
   * T11, AS2: writes file tab `tabId`'s drawing now (AS1) and applies the result (AS3). Called for
   * the outgoing tab of a switch while it is still active, only when it has unwritten changes and
   * is available. TB18's; the flows refresh the tab's stored state from `snapshotState` after it.
   */
  flushTab(tabId: string): Promise<void>;
  /** Called after every change of `state()` (the host re-renders the strip, N1, schedules N8). */
  changed(): void;
}

/** What the flows keep per tab beyond `Tab` (by tab id; a closed tab's entry stays for T12). */
export interface TabMeta {
  /** A file tab's written hash (I12 `open`, I14, AS1); null when unknown (counts as unwritten). */
  readonly written: string | null;
  /** SS6: the tab's last record write failed (`recordFailedAfter`); the next success clears it. */
  readonly recordFailed: boolean;
  /** T6 from the index, for a tab not loaded in this run (SS3). */
  readonly stored: { readonly unsaved: boolean; readonly warning: boolean };
  /** The index's view for a tab not loaded yet (SS3; null: V2's default view). */
  readonly view: SessionTabView | null;
  /** AS5 answered `changed` with these bytes; AS7 applies them when the host is idle (TB18). */
  readonly outside: Uint8Array | null;
}

export interface TabFlowState {
  readonly list: TabList;
  readonly meta: Readonly<Record<string, TabMeta>>;
}

/** An open waiting in the queue: a ref (I7 `open`, the `open` event), a focus, or a dropped file. */
export type OpenRequest =
  | { readonly kind: 'ref'; readonly ref: FileRef }
  | { readonly kind: 'focus'; readonly tabId: string }
  /** F12: `resolve` asks main (I3) when the request runs, so T17's focus check sees the tabs then. */
  | {
      readonly kind: 'drop';
      readonly name: string;
      readonly resolve: () => Promise<FileDroppedResponse>;
    };

/** A dropped file as the host hands it over (it builds `resolve` from the preload's I3). */
export interface DroppedFile {
  readonly name: string;
  resolve(): Promise<FileDroppedResponse>;
}

export interface StartupTabs {
  readonly session: StartupSession | null;
  readonly open: OpenTarget | null;
}

export interface TabFlows {
  /** SS7: the strip at once, the active tab loaded, then I7's `open` and the queued opens. */
  start(startup: StartupTabs): Promise<void>;
  /** T7. Ignored while a flow runs. */
  newTab(): Promise<void>;
  /** F2 then T17 (Ctrl+O). Ignored while a flow runs. */
  open(): Promise<void>;
  /** T17: queued while a flow runs (at most 20), else at once. */
  request(request: OpenRequest): Promise<void>;
  /** The `open` event (F10, F11, the second instance). */
  openRef(ref: FileRef): Promise<void>;
  /** The `focus-tab` event and `{ focus }` answers. */
  focusTab(tabId: string): Promise<void>;
  /** F12: every file with an Open extension, each in its own tab in order (else the first file). */
  drop(files: readonly DroppedFile[]): Promise<void>;
  /** T11. Ignored while a flow runs. */
  activate(tabId: string): Promise<void>;
  /** T12. Ignored while a flow runs. */
  reopen(): Promise<void>;
  /**
   * T8, the list part only (TB19 adds loading, the close-time write and T9): closes `tabId` with no
   * question. Ignored while a flow runs.
   */
  close(tabId: string): Promise<void>;
  state(): TabFlowState;
  busy(): boolean;
  /** The facts of a loaded tab (the active one from `snapshotState`); null when not loaded. */
  facts(tabId: string): Promise<TabFacts | null>;
  /** T6: the marker of a tab (a tab not loaded in this run shows its stored flags). */
  marker(tabId: string): Promise<TabMarker>;
  /** N8: the renderer's part of the index. */
  index(): Promise<SessionIndexUpdate>;
}

const OPEN_NAME = /\.(chalk|png|svg|pdf)$/i;

const freshMeta = (written: string | null = null): TabMeta => ({
  written,
  recordFailed: false,
  stored: { unsaved: false, warning: false },
  view: null,
  outside: null,
});

export function createTabFlows(o: TabFlowOptions): TabFlows {
  const { main, controller, sha256 } = o;
  const tabPorts: TabPorts = { newId: o.newId, newState: controller.newState, clock: o.clock };
  let list: TabList = initialTabs(tabPorts, o.newDrawingStyle());
  let meta: Record<string, TabMeta> = {};
  let running = false;
  const queue: OpenRequest[] = [];

  const metaOf = (id: string): TabMeta => meta[id] ?? freshMeta();
  const setMeta = (id: string, patch: Partial<TabMeta>): void => {
    meta = { ...meta, [id]: { ...metaOf(id), ...patch } };
  };

  /** The active tab's state in the list made current (before a decision that reads it). */
  function syncActive(): void {
    list = update(list, list.active, { state: controller.snapshotState() });
  }

  const stateOf = (tab: Tab): EditorTabState | null =>
    tab.id === list.active ? controller.snapshotState() : tab.state;

  /** Removes a tab that could not be loaded; not discarded, so its record (if any) is kept. */
  function lose(id: string): void {
    const at = indexOfTab(list, id);
    const rest = list.tabs.filter((t) => t.id !== id);
    if (rest.length === 0) {
      const fresh = initialTabs(tabPorts, o.newDrawingStyle());
      list = { ...fresh, closed: list.closed, discarded: list.discarded };
      return;
    }
    const active = id !== list.active ? list.active : ((rest[at] ?? rest[at - 1]) as Tab).id;
    list = { ...list, tabs: rest, active };
  }

  // ---- store and file ports ----------------------------------------------------------------

  /** N7 with SS6's flag: a failed (or rejected) write marks the tab, the next success clears it. */
  async function writeRecord(tab: Tab, state: EditorTabState): Promise<void> {
    const { text } = buildRecord(tab, state);
    let response: WriteTabRecordResponse;
    try {
      response = await main.writeTabRecord({ tabId: tab.id, text });
    } catch (error) {
      main.logError(`Tab record write failed: ${String(error)}`);
      response = { ok: false, problem: 'write-failed' };
    }
    setMeta(tab.id, { recordFailed: recordFailedAfter(response) });
  }

  async function writeIndex(): Promise<void> {
    main.updateSessionIndex(await index());
  }

  /**
   * AS5 (b): the file check of a file tab. It gives the written hash and the availability; a
   * `changed` answer is kept for AS7 (TB18), which also owns AS6's notices and boxes.
   */
  async function check(id: string): Promise<void> {
    let response: CheckTabFileResponse;
    try {
      response = await main.checkTabFile(id);
    } catch (error) {
      main.logError(`Tab file check failed: ${String(error)}`);
      list = update(list, id, { available: false });
      return;
    }
    setMeta(id, {
      written: response.written,
      outside: response.state === 'changed' ? response.bytes : null,
    });
    if (response.state !== 'changed') {
      list = update(list, id, { available: response.state === 'same' });
    }
  }

  /** SS11: a file tab whose record is damaged (or missing) opens from its file, history lost. */
  async function fromFile(id: string): Promise<EditorTabState | null> {
    let read: ReadFileResponse;
    try {
      read = await main.readTabFile(id);
    } catch {
      return null;
    }
    if (!read.ok) return null;
    const text = extractDrawing('chalk', read.bytes, o.decodeUtf8);
    if (!text.ok) return null;
    const parsed = parse(text.text);
    return parsed.ok ? controller.newState(parsed.value) : null;
  }

  /**
   * SS7, T11: reads a tab not loaded in this run (I11, the strict parse, a file tab's AS5 check).
   * Null: the tab is lost (SS11: damaged, or missing while it had content) and N-A5 was shown;
   * a missing record of an untitled tab that had no content gives an empty drawing.
   */
  async function load(tab: Tab): Promise<EditorTabState | null> {
    const m = metaOf(tab.id);
    const loaded = await loadTabRecord(tab.id, main, {
      clock: o.clock,
      view: m.view,
      saved: 'unknown',
    });
    let state: EditorTabState | null = null;
    if (tab.kind === 'chalk') {
      await check(tab.id);
      state = loaded.ok ? loaded.state : await fromFile(tab.id);
      if (state !== null) {
        const doc = tabStateDoc(state);
        // SS7: compared with the written hash I14 returned, never an older copy.
        if (!(await hasUnwrittenChanges(doc, metaOf(tab.id).written, sha256))) {
          state = tabStateMarkSaved(state, doc);
        }
      }
    } else if (loaded.ok) {
      const edited = tab.kind === 'picture' && loaded.record.edited;
      state = edited ? loaded.state : tabStateMarkSaved(loaded.state, tabStateDoc(loaded.state));
    } else if (loaded.problem === 'missing' && tab.kind === 'untitled' && !m.stored.unsaved) {
      state = controller.newState(setStyle(emptyDoc(o.clock()), { preset: o.newDrawingStyle() }));
    }
    if (state === null) {
      main.logError(`Tab not restored: ${loaded.ok ? 'file' : loaded.problem}`);
      o.notify('error', DAMAGED_NOTICE);
    }
    return state;
  }

  // ---- T11 switch ---------------------------------------------------------------------------

  /**
   * T11: the outgoing tab taken out, its record and (with unwritten changes) its file written,
   * then the incoming state put in, from memory or the store. Until then the outgoing drawing stays
   * on screen and `list.active` stays the outgoing tab. `id` must be in the list (an added tab is
   * put in, not activated, before). False when the incoming tab was lost.
   */
  async function switchTo(id: string): Promise<boolean> {
    if (id === list.active || findTab(list, id) === undefined) return false;
    await o.finishEditing();
    const outgoing = activeTab(list);
    const taken = controller.takeState();
    list = update(list, outgoing.id, { state: taken });
    await writeRecord(outgoing, taken);
    if (
      outgoing.kind === 'chalk' &&
      outgoing.available &&
      (await hasUnwrittenChanges(tabStateDoc(taken), metaOf(outgoing.id).written, sha256))
    ) {
      await o.flushTab(outgoing.id);
      // AS3 may have marked it saved while it was still active.
      list = update(list, outgoing.id, { state: controller.snapshotState() });
    }

    const incoming = findTab(list, id) as Tab;
    let state = incoming.state;
    if (state === null) {
      state = await load(incoming);
      if (state === null) {
        lose(id);
        o.changed();
        return false;
      }
    } else if (incoming.kind === 'chalk') {
      await check(id); // AS5 (b): a file tab becomes active
    }
    controller.putState(state);
    list = activate(update(list, id, { state }), id);
    o.changed();
    await writeIndex();
    return true;
  }

  // ---- T17 open -----------------------------------------------------------------------------

  function drawingOf(
    ref: FileRef,
    bytes: Uint8Array,
  ): { ok: true; doc: Doc } | { ok: false; problem: FileProblem } {
    const kind = fileKindOf(ref.name);
    if (kind === null) return { ok: false, problem: 'unsupported' };
    const text = extractDrawing(kind, bytes, o.decodeUtf8);
    if (!text.ok) return { ok: false, problem: text.problem };
    const parsed = parse(text.text);
    if (!parsed.ok) return { ok: false, problem: parseProblem(parsed.error.code) };
    return { ok: true, doc: parsed.value };
  }

  /**
   * T17 for a ref main handed out: F3 validates the bytes (a failure changes no tab), then the
   * drawing opens in a new tab at the end or in the empty untitled active tab; I12 binds the ref
   * (sent before the tab appears, so an `openIn` answer opens nothing and focuses that tab), with
   * the SHA-256 of `serialize(drawing)` as the written hash. The new tab's record is written at once.
   */
  async function openNow(ref: FileRef): Promise<void> {
    const read = await main.readFile(ref);
    if (!read.ok) return main.showFileError(read.problem, ref.name);
    const drawing = drawingOf(ref, read.bytes);
    if (!drawing.ok) return main.showFileError(drawing.problem, ref.name);
    const doc = drawing.doc;

    await o.finishEditing();
    syncActive();
    const into = canOpenInto(list);
    const id = into ? list.active : o.newId();
    const kind = ref.kind === 'chalk' ? 'chalk' : 'picture';
    const written = kind === 'chalk' ? await drawingHash(doc, sha256) : null;
    const bound = await main.bindTab({
      tabId: id,
      ref: ref.id,
      reason: 'open',
      ...(written === null ? {} : { written }),
    });
    if (!bound.ok) {
      await switchTo(bound.openIn);
      return;
    }
    const state = controller.newState(doc);
    setMeta(id, freshMeta(written));
    const opened = { id, kind, name: ref.name, ref, state } as const;
    if (into) {
      list = openInto(list, opened);
      controller.putState(state);
      o.changed();
    } else {
      list = { ...open(list, opened), active: list.active };
      if (!(await switchTo(id))) return;
    }
    await writeRecord(findTab(list, id) as Tab, state);
  }

  async function perform(request: OpenRequest): Promise<void> {
    switch (request.kind) {
      case 'ref':
        return openNow(request.ref);
      case 'focus':
        await switchTo(request.tabId);
        return;
      case 'drop': {
        const answer = await request.resolve();
        if (!answer.ok) return main.showFileError(answer.problem, answer.name);
        if ('focus' in answer) {
          await switchTo(answer.focus);
          return;
        }
        return openNow(answer.ref);
      }
    }
  }

  const requestOf = (target: OpenTarget): OpenRequest =>
    'focus' in target ? { kind: 'focus', tabId: target.focus } : { kind: 'ref', ref: target };

  // ---- flow runner --------------------------------------------------------------------------

  /** Runs one flow under the flag, then the queued opens in order. */
  async function run(flow: () => Promise<void>): Promise<void> {
    running = true;
    try {
      await flow();
    } catch (error) {
      main.logError(`Tab flow failed: ${String(error)}`);
    } finally {
      running = false;
    }
    const next = queue.shift();
    if (next !== undefined) await run(() => perform(next));
  }

  /** A flow started by her (a key, a click, a menu item): ignored while another runs. */
  const idle = (flow: () => Promise<void>): Promise<void> =>
    running ? Promise.resolve() : run(flow);

  function request(r: OpenRequest): Promise<void> {
    if (!running) return run(() => perform(r));
    if (queue.length < OPEN_QUEUE_LIMIT) queue.push(r);
    else main.logError('Open request dropped: the queue is full');
    return Promise.resolve();
  }

  // ---- SS7 restore --------------------------------------------------------------------------

  async function startNow({ session, open: target }: StartupTabs): Promise<void> {
    if (target !== null) queue.unshift(requestOf(target)); // SS7: before the opens queued meanwhile
    if (session === null || session.tabs.length === 0) {
      controller.putState(activeTab(list).state as EditorTabState);
      o.changed();
      return;
    }
    meta = {};
    for (const t of session.tabs) {
      meta[t.id] = {
        ...freshMeta(),
        stored: { unsaved: t.unsaved, warning: t.warning },
        view: t.view,
      };
    }
    list = createTabs(
      session.tabs.map((t): Tab => ({
        id: t.id,
        kind: t.kind,
        name: t.name,
        ref: null,
        available: true,
        state: null,
      })),
      session.active,
    );
    o.changed(); // the strip at once
    for (;;) {
      const tab = activeTab(list);
      const state = tab.state ?? (await load(tab));
      if (state !== null) {
        controller.putState(state);
        list = update(list, tab.id, { state });
        break;
      }
      lose(tab.id);
    }
    o.changed();
  }

  // ---- T12 reopen and the T8 list part -------------------------------------------------------

  async function reopenNow(): Promise<void> {
    syncActive();
    const entry = list.closed[0];
    const result = reopen(list, o.newId);
    if (entry === undefined || result.tab === null) return;
    const dropEntry = (): void => {
      list = { ...list, closed: result.list.closed };
    };
    if (result.outcome === 'focused') {
      dropEntry();
      if (!(await switchTo(result.tab.id))) o.changed();
      return;
    }
    const tab = result.tab;
    if (tab.kind === 'chalk' || tab.kind === 'picture') {
      // I12 first: a file open in another tab meanwhile focuses that tab and writes no record.
      const bound = await main.bindTab({
        tabId: tab.id,
        ref: null,
        reason: 'reopen',
        from: entry.oldId,
      });
      if (!bound.ok) {
        dropEntry();
        if (!(await switchTo(bound.openIn))) o.changed();
        return;
      }
    }
    setMeta(tab.id, { ...metaOf(entry.oldId) });
    list = { ...result.list, active: list.active };
    if (tab.state !== null) await writeRecord(tab, tab.state);
    await switchTo(tab.id);
  }

  async function closeNow(id: string): Promise<void> {
    const tab = findTab(list, id);
    if (tab === undefined) return;
    if (id === list.active) {
      await o.finishEditing();
      list = update(list, id, { state: controller.takeState() });
    }
    const before = list;
    list = close(list, id, tabPorts, o.newDrawingStyle());
    if (list === before) return;
    if (list.active !== before.active) {
      for (;;) {
        const next = activeTab(list);
        const state = next.state ?? (await load(next));
        if (state !== null) {
          controller.putState(state);
          list = update(list, next.id, { state });
          if (next.kind === 'chalk' && next.state !== null) await check(next.id);
          break;
        }
        lose(next.id);
      }
    }
    o.changed();
    await writeIndex();
  }

  // ---- reading ------------------------------------------------------------------------------

  async function facts(id: string): Promise<TabFacts | null> {
    const tab = findTab(list, id);
    if (tab === undefined) return null;
    const state = stateOf(tab);
    if (state === null) return null;
    const m = metaOf(id);
    const unwritten =
      tab.kind === 'chalk' && (await hasUnwrittenChanges(tabStateDoc(state), m.written, sha256));
    return tabFacts({ ...tab, state }, { unwritten, recordFailed: m.recordFailed });
  }

  async function index(): Promise<SessionIndexUpdate> {
    const tabs = await Promise.all(
      list.tabs.map(async (tab): Promise<SessionTab> => {
        const f = await facts(tab.id);
        const state = stateOf(tab);
        const m = metaOf(tab.id);
        const flags = f === null ? m.stored : indexFlags(f);
        return {
          id: tab.id,
          kind: tab.kind,
          name: tab.name,
          view: state === null ? m.view : tabStateView(state),
          unsaved: flags.unsaved,
          warning: flags.warning,
        };
      }),
    );
    return { tabs, active: list.active, discarded: [...list.discarded] };
  }

  return {
    start: (startup) => run(() => startNow(startup)),
    newTab: () =>
      idle(async () => {
        const added = newUntitled(list, tabPorts, o.newDrawingStyle());
        const tab = activeTab(added);
        list = { ...added, active: list.active };
        await switchTo(tab.id);
      }),
    open: () =>
      idle(async () => {
        const target = await main.chooseOpen();
        if (target !== null) await perform(requestOf(target));
      }),
    request,
    openRef: (ref) => request({ kind: 'ref', ref }),
    focusTab: (tabId) => request({ kind: 'focus', tabId }),
    async drop(files) {
      const openable = files.filter((f) => OPEN_NAME.test(f.name));
      const chosen = openable.length > 0 ? openable : files.slice(0, 1);
      // The first runs at once (or queues) and its run drains the queue; the rest queue behind it.
      await Promise.all(
        chosen.map((f) => request({ kind: 'drop', name: f.name, resolve: () => f.resolve() })),
      );
    },
    activate: (tabId) =>
      idle(async () => {
        await switchTo(tabId);
      }),
    reopen: () => idle(reopenNow),
    close: (tabId) => idle(() => closeNow(tabId)),
    state: () => ({ list, meta }),
    busy: () => running,
    facts,
    async marker(id) {
      const m = metaOf(id);
      const tab = findTab(list, id);
      return markerOf(await facts(id), { kind: tab?.kind ?? 'untitled', ...m.stored });
    },
    index,
  };
}

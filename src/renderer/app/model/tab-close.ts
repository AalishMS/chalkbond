// Tab flows 3 (SPEC-app-shell.md T8, T9, R39, SS6's unkept tab and its box, SS10 with R51, and the
// shutdown flush of RC5 / R24 / R25 as amended by R35, `flush-session`): closing a tab, closing the
// window and flushing at a Windows session end. Pure: every effect goes through the ports of
// `tab-flows.ts`, whose state this module reads and changes through `CloseCore`; the flow flag, the
// queue and idle are `tab-flows.ts`'s.
//
// Nothing that exists only in the store is dropped without T9's box (R34), except by Don't save: an
// unsaved tab (F7) asks when it is closed, and an unkept one (SS6) also when the window closes (R51).
import { tabStateDoc, type EditorTabState } from '../../editor';
import type {
  KeepProblem,
  SessionIndexUpdate,
  WriteTabRecordResponse,
} from '../../../shared/ipc-types';
import type { TabAutosave } from './tab-autosave';
import type { TabFlowOptions, TabMeta } from './tab-flows';
import { hasUnwrittenChanges, isUnkept, isUnsaved, tabFacts, type TabFacts } from './tab-status';
import {
  activeTab,
  close,
  findTab,
  label,
  update,
  type ClosedTab,
  type Tab,
  type TabList,
  type TabPorts,
} from './tabs';

/** SS6: the "Couldn't keep" box of a failed record write (`busy`, `folder-gone`: `write-failed`). */
export function keepProblem(response: WriteTabRecordResponse): KeepProblem {
  if (response.ok) return 'write-failed';
  const { problem } = response;
  return problem === 'disk-full' || problem === 'write-denied' ? problem : 'write-failed';
}

/** What `tab-flows.ts` lends this module: its options, its auto-save and its state. */
export interface CloseCore {
  readonly o: TabFlowOptions;
  readonly auto: TabAutosave;
  readonly tabPorts: TabPorts;
  list(): TabList;
  setList(list: TabList): void;
  meta(id: string): TabMeta;
  setMeta(id: string, patch: Partial<TabMeta>): void;
  /** N7 with SS6's flag (and this module's `recordWritten`). */
  writeRecord(tab: Tab, state: EditorTabState): Promise<void>;
  writeIndex(): Promise<void>;
  index(): Promise<SessionIndexUpdate>;
  /** SS7: reads a tab not loaded in this run; null when it is lost (SS11, N-A5 shown). */
  load(tab: Tab): Promise<EditorTabState | null>;
  /** Removes a lost tab (not discarded). */
  lose(id: string): void;
  /** T11; false when the incoming tab was lost. */
  switchTo(id: string): Promise<boolean>;
  facts(id: string): Promise<TabFacts | null>;
  /** SS10: N5 is next; from now on the flows send nothing. */
  stop(): void;
}

export interface TabClose {
  /** T8 with T9 (the flow body; `tab-flows.ts` runs it under its flag). */
  closeTab(id: string): Promise<void>;
  /** SS10 with R51 (the flow body): N5 unless a box was cancelled. */
  closeWindow(): Promise<void>;
  /** RC5 / R25 (`flush-session`): best effort, no answer of main awaited. Not a flow. */
  flushSession(): Promise<void>;
  /** SS6: after every record write: the flag, and the box due for a tab that became unkept. */
  recordWritten(tab: Tab, state: EditorTabState, response: WriteTabRecordResponse): Promise<void>;
  /** SS6: a "Couldn't keep" box waits for the host to be idle. */
  keepPending(): boolean;
  /** SS6: the due boxes, once per tab. Runs as a flow while the host is idle. */
  keepWork(): Promise<void>;
}

type Answer = 'saved' | 'discard' | 'cancel' | 'gone';

export function createTabClose(core: CloseCore): TabClose {
  const { o, auto } = core;
  const { main, controller, sha256 } = o;

  const isActive = (id: string): boolean => core.list().active === id;

  /** A file tab has unwritten changes (Terms); false for every other tab. */
  async function unwritten(id: string): Promise<boolean> {
    const tab = findTab(core.list(), id);
    if (tab?.kind !== 'chalk') return false;
    const state = isActive(id) ? controller.snapshotState() : tab.state;
    if (state === null) return false;
    return hasUnwrittenChanges(tabStateDoc(state), core.meta(id).written, sha256);
  }

  // ---- SS6 ------------------------------------------------------------------------------------

  async function recordWritten(
    tab: Tab,
    state: EditorTabState,
    response: WriteTabRecordResponse,
  ): Promise<void> {
    if (response.ok) {
      core.setMeta(tab.id, { recordFailed: false, keepDue: null });
      return;
    }
    core.setMeta(tab.id, { recordFailed: true });
    const m = core.meta(tab.id);
    if (m.keepShown || m.keepDue !== null) return;
    const now = findTab(core.list(), tab.id) ?? tab;
    const pending =
      now.kind === 'chalk' && (await hasUnwrittenChanges(tabStateDoc(state), m.written, sha256));
    const facts = tabFacts({ ...now, state }, { unwritten: pending, recordFailed: true });
    if (facts !== null && isUnkept(facts)) core.setMeta(tab.id, { keepDue: keepProblem(response) });
  }

  const keepPending = (): boolean => core.list().tabs.some((t) => core.meta(t.id).keepDue !== null);

  async function keepWork(): Promise<void> {
    for (const t of core.list().tabs) {
      const due = core.meta(t.id).keepDue;
      if (due === null) continue;
      core.setMeta(t.id, { keepDue: null, keepShown: true });
      await main.showFileError(due, label(t), 'keep');
    }
  }

  // ---- T8's list part ---------------------------------------------------------------------------

  /** The active tab put in after a close, loaded from the store when needed (a lost one is skipped). */
  async function putActive(): Promise<void> {
    for (;;) {
      const next = activeTab(core.list());
      const state = next.state ?? (await core.load(next));
      if (state !== null) {
        controller.putState(state);
        core.setList(update(core.list(), next.id, { state }));
        if (next.kind === 'chalk' && next.state !== null) await auto.check(next.id, false);
        return;
      }
      core.lose(next.id);
    }
  }

  /**
   * T8 (5): the tab leaves the strip for the reopen list and `discarded`; its right neighbour, else
   * its left, becomes active. R39: the last tab gives way to a new empty Untitled, and an empty
   * untitled last tab with no undo step stays.
   */
  async function drop(id: string): Promise<void> {
    const wasActive = isActive(id);
    let list = core.list();
    if (wasActive) list = update(list, id, { state: controller.snapshotState() });
    let next = close(list, id, core.tabPorts, o.newDrawingStyle());
    if (next === list) return;
    if (wasActive) {
      // T12: the reopen list keeps what the editor hands over (a gesture is cancelled, R57).
      const [entry, ...rest] = next.closed;
      next = {
        ...next,
        closed: [{ ...(entry as ClosedTab), state: controller.takeState() }, ...rest],
      };
    }
    core.setList(next);
    if (next.active !== list.active) await putActive();
    o.changed();
    await core.writeIndex();
    await auto.settle(core.list().active);
  }

  // ---- T9 ---------------------------------------------------------------------------------------

  /** F6, then R14: true only when the write succeeded and the drawing is unchanged since. */
  async function saveUnchanged(): Promise<boolean> {
    if (!(await auto.saveAs())) return false;
    await o.finishEditing();
    const id = core.list().active;
    return !(await hasUnwrittenChanges(controller.getDoc(), core.meta(id).written, sha256));
  }

  /** T9 for tab `id`, activated first. `gone`: it was lost on activation (SS11). */
  async function ask(id: string): Promise<Answer> {
    if (!isActive(id) && !(await core.switchTo(id))) return 'gone';
    const answer = await o.ask({ kind: 'save-changes', name: label(activeTab(core.list())) });
    if (answer === 'save') return (await saveUnchanged()) ? 'saved' : 'cancel';
    return answer;
  }

  // ---- T8 ---------------------------------------------------------------------------------------

  /**
   * T8 (3): a file tab with unwritten changes is written now (an unavailable one is checked again
   * first, AS6); a `changed` file (now or found earlier) is applied by AS7 with the tab active, which
   * may make it `kept`. A failure leaves it unavailable with unwritten changes: unsaved.
   */
  async function settleFile(id: string): Promise<void> {
    if (core.meta(id).outside === null && (await unwritten(id))) {
      if (!(findTab(core.list(), id) as Tab).available) await auto.check(id, false);
      const tab = findTab(core.list(), id) as Tab;
      if (tab.available && core.meta(id).outside === null) await auto.writeNow(id);
    }
    if (core.meta(id).outside === null) return;
    if (!isActive(id) && !(await core.switchTo(id))) return;
    await auto.applyOutside();
  }

  async function closeTab(id: string): Promise<void> {
    const tab = findTab(core.list(), id);
    if (tab === undefined) return;
    if (isActive(id)) await o.finishEditing(); // (1) F4a
    if (tab.state === null) {
      // (2) Read first; a record that cannot be read or parsed is SS11's: closed without asking.
      const state = await core.load(tab);
      if (state === null) {
        core.lose(id);
        o.changed();
        await core.writeIndex();
        return;
      }
      core.setList(update(core.list(), id, { state }));
    }
    if (tab.kind === 'chalk') await settleFile(id); // (3)
    if (findTab(core.list(), id) === undefined) return; // lost while activated (SS11)
    const facts = await core.facts(id);
    if (facts !== null && isUnsaved(facts)) {
      // (4) T9 (unkept implies unsaved).
      const answer = await ask(id);
      if (answer === 'cancel' || answer === 'gone') return;
    }
    await drop(id); // (5)
  }

  // ---- SS10 -------------------------------------------------------------------------------------

  async function writeActiveRecord(): Promise<void> {
    const tab = activeTab(core.list());
    const state = controller.snapshotState();
    core.setList(update(core.list(), tab.id, { state }));
    await core.writeRecord(tab, state);
  }

  /**
   * SS10: F4a and the active tab's record first (so a record that cannot be written now counts),
   * then R51's box for each unkept tab in strip order, each activated first (Save: F6 and R14;
   * Don't save: dropped; Cancel, or a Save that did not write the very drawing: the close stops);
   * after a box F4a and the record again; then AS1 if the active file tab has unwritten changes,
   * the index with `discarded`, and N5 last.
   */
  async function closeWindow(): Promise<void> {
    await o.finishEditing();
    await writeActiveRecord();
    let asked = false;
    for (const id of core.list().tabs.map((t) => t.id)) {
      const facts = await core.facts(id);
      if (facts === null || !isUnkept(facts)) continue;
      asked = true;
      const answer = await ask(id);
      if (answer === 'cancel') return;
      if (answer === 'discard') await drop(id);
    }
    if (asked) {
      await o.finishEditing();
      await writeActiveRecord();
    }
    const tab = activeTab(core.list());
    if (tab.available && core.meta(tab.id).outside === null && (await unwritten(tab.id))) {
      await auto.writeNow(tab.id);
    }
    await core.writeIndex();
    core.stop();
    main.closeOk();
  }

  // ---- RC5 / R25 --------------------------------------------------------------------------------

  /**
   * `flush-session`: an open label or text editor is finished through its commit path unless an IME
   * composition runs (the host's port decides, R25); then the record of `snapshotState()` is sent
   * before this returns its promise, the AS1 write (after the local SHA-256 only) and the index.
   * No answer of main is awaited; the editor is otherwise untouched (no take, no put).
   */
  async function flushSession(): Promise<void> {
    o.finishEditingNow();
    const tab = activeTab(core.list());
    if (tab.state !== null) {
      const state = controller.snapshotState();
      void core.writeRecord(tab, state);
      const m = core.meta(tab.id);
      if (
        tab.kind === 'chalk' &&
        tab.available &&
        m.outside === null &&
        (await hasUnwrittenChanges(tabStateDoc(state), m.written, sha256))
      ) {
        void auto.writeNow(tab.id);
      }
    }
    main.updateSessionIndex(await core.index());
  }

  return { closeTab, closeWindow, flushSession, recordWritten, keepPending, keepWork };
}

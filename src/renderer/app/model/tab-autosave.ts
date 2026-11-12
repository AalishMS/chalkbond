// Tab flows 2 (SPEC-app-shell.md "Auto-save": AS1-AS9 renderer half; F5 / F6 as amended for tabs):
// the AS1 write of a file tab and AS3's routing of its result by tab id, the AS5 checks and what
// they lead to (AS6 unavailable, AS7 changed outside), Ctrl+S (AS4) and Save as (F6, AS9). Pure:
// every effect goes through the ports of `tab-flows.ts`, whose state this module reads and changes
// through `AutosaveCore`; the flow flag, the queue and idle are `tab-flows.ts`'s.
//
// Results are matched to their tab, never to "the active tab" (AS3): `ok` marks the active tab
// saved only if `getDoc()` is still the very `doc` written, an inactive tab's stored state gets that
// `doc` as its saved baseline, and a result older than one already applied to the tab is ignored.
import { parse, serialize, type Doc } from '@core/doc-model';
import { extractDrawing } from '@core/clipboard-export';
import { tabStateDoc, tabStateMarkSaved, type EditorTabState } from '../../editor';
import type {
  AutoSaveProblem,
  AutoSaveResponse,
  CheckTabFileResponse,
  WriteProblem,
} from '../../../shared/ipc-types';
import { parseProblem } from './file-flows';
import { drawingHash, hasUnwrittenChanges } from './tab-status';
import {
  activeTab,
  findTab,
  indexOfTab,
  label,
  markKept,
  update,
  type Tab,
  type TabList,
} from './tabs';
import type { TabFlowOptions, TabMeta } from './tab-flows';

/** AS7(a): the undo step of a drawing replaced from its changed file (editor `replace-doc`). */
export const OUTSIDE_CHANGE_LABEL = 'Changed outside Chalkbond';

/** Why a file tab is unavailable (AS6): a check, a failed write, or changed bytes that do not open. */
export type Trouble = WriteProblem | 'missing' | 'unreadable' | 'unopenable';

/** N-A1 (F5, R41): after an explicit Save or Save as only. */
export const savedNotice = (name: string): string => `Saved ${name}.`;

/** N-A4 (AS7(a)). */
export const outsideNotice = (name: string): string =>
  `${name} was changed outside Chalkbond. Press Ctrl+Z to see your earlier version.`;

/** N-A3 (`missing`) or N-A7 (anything else) when a tab becomes unavailable with nothing unwritten. */
export function unavailableNotice(trouble: Trouble, name: string): string {
  return trouble === 'missing'
    ? `Can't find ${name} right now. Chalkbond keeps your drawing.`
    : `Couldn't read ${name}. Chalkbond keeps your drawing and will try again.`;
}

/** The "Couldn't save" box of a trouble (AS6; TB18: no `unreadable` row, so `write-failed`). */
function boxProblem(trouble: Trouble | null): AutoSaveProblem {
  if (trouble === null || trouble === 'unreadable' || trouble === 'unopenable')
    return 'write-failed';
  return trouble;
}

const OPEN_EXTENSION = /\.(chalk|png|svg|pdf)$/i;

/**
 * F6 (2026-11-12): the tab's label without an Open extension, plus `.chalk` (`Untitled 2.chalk`,
 * `ethanol.chalk` for `ethanol.png`, `esterification (your changes).chalk`).
 */
export function suggestedSaveName(tab: Pick<Tab, 'kind' | 'name'>): string {
  const shown = label(tab);
  return `${shown.replace(OPEN_EXTENSION, '') || shown}.chalk`;
}

/** What `tab-flows.ts` lends this module: its options and its state. */
export interface AutosaveCore {
  readonly o: TabFlowOptions;
  list(): TabList;
  setList(list: TabList): void;
  meta(id: string): TabMeta;
  setMeta(id: string, patch: Partial<TabMeta>): void;
  writeRecord(tab: Tab, state: EditorTabState): Promise<void>;
  writeIndex(): Promise<void>;
  /** A new tab's meta with this written hash. */
  freshMeta(written: string | null): TabMeta;
}

export interface TabAutosave {
  /** AS5: the file check of a file tab (I14; `wantBytes` for SS11). Null when the call failed. */
  check(id: string, wantBytes: boolean): Promise<CheckTabFileResponse | null>;
  /** After a check point of the active tab: AS6's report, or AS1 at once when it has unwritten changes. */
  settle(id: string): Promise<void>;
  /** T11: writes the outgoing tab now unless the very drawing is already being written. */
  flushTab(id: string): Promise<void>;
  /**
   * T8 step 3, SS10 (TB19): AS1 for a file tab now, also when the same drawing is in flight, and its
   * result applied (AS3); null when it is not a loaded file tab or the answer was for another tab.
   */
  writeNow(id: string): Promise<AutoSaveResponse | null>;
  /** AS2: the timer of the active tab (a write, or a retry check while unavailable). */
  tick(): Promise<void>;
  /** AS4: Ctrl+S (a file tab written now, N-A1; any other kind F6). */
  save(): Promise<boolean>;
  /** F6: Save as; true when written (the tab is then a file tab bound to the new file). */
  saveAs(): Promise<boolean>;
  /** AS7 for the active tab now (T8 step 3 applies a `changed` result before deciding, TB19). */
  applyOutside(): Promise<void>;
  /** AS7 is waiting for the active tab, or a box is due (both wait for the host to be idle). */
  idlePending(): boolean;
  /** AS7 for the active tab, then the due boxes. Runs as a flow while the host is idle. */
  idleWork(): Promise<void>;
}

const encoder = new TextEncoder();

export function createTabAutosave(core: AutosaveCore): TabAutosave {
  const { o } = core;
  const { main, controller, sha256 } = o;
  /** Per tab: the last write sent, the last result applied, and the drawing still in flight. */
  const issued = new Map<string, number>();
  const applied = new Map<string, number>();
  const inFlight = new Map<string, Doc>();

  const isActive = (id: string): boolean => core.list().active === id;
  const stateOf = (tab: Tab): EditorTabState | null =>
    isActive(tab.id) ? controller.snapshotState() : tab.state;
  const fileTab = (id: string): Tab | null => {
    const tab = findTab(core.list(), id);
    return tab?.kind === 'chalk' ? tab : null;
  };

  async function unwritten(id: string): Promise<boolean> {
    const tab = fileTab(id);
    const state = tab === null ? null : stateOf(tab);
    if (state === null) return false;
    return hasUnwrittenChanges(tabStateDoc(state), core.meta(id).written, sha256);
  }

  // ---- AS6 ----------------------------------------------------------------------------------

  /**
   * AS6's report: with unwritten changes the "Couldn't save" box (once per tab, when the host is
   * next idle); else N-A3 / N-A7 once per episode, for the active tab only.
   */
  async function report(id: string): Promise<void> {
    const tab = fileTab(id);
    if (tab === null) return;
    const m = core.meta(id);
    if (await unwritten(id)) {
      if (!m.boxShown && m.boxDue === null) core.setMeta(id, { boxDue: boxProblem(m.trouble) });
    } else if (!m.reported && isActive(id)) {
      core.setMeta(id, { reported: true });
      o.notify('info', unavailableNotice(m.trouble ?? 'unreadable', tab.name));
    }
  }

  async function becomeUnavailable(id: string, trouble: Trouble): Promise<void> {
    if (fileTab(id) === null) return;
    core.setList(update(core.list(), id, { available: false }));
    core.setMeta(id, { trouble });
    o.changed();
    await report(id);
  }

  // ---- AS1, AS3 -----------------------------------------------------------------------------

  /** AS3 `ok`: the active tab marked saved only if its drawing is still `doc`. */
  function markWritten(id: string, doc: Doc): void {
    const list = core.list();
    const tab = findTab(list, id);
    if (tab === undefined) {
      // A closed tab on the reopen list (T12) keeps the result in its state.
      const closed = list.closed.map((c) =>
        c.oldId === id && c.state !== null ? { ...c, state: tabStateMarkSaved(c.state, doc) } : c,
      );
      core.setList({ ...list, closed });
      return;
    }
    if (isActive(id)) {
      if (controller.getDoc() === doc) controller.markSaved();
      if (!tab.available) core.setList(update(list, id, { available: true }));
    } else {
      const state = tab.state === null ? {} : { state: tabStateMarkSaved(tab.state, doc) };
      core.setList(update(list, id, { available: true, ...state }));
    }
    o.changed();
  }

  async function apply(id: string, doc: Doc, response: AutoSaveResponse): Promise<void> {
    if (response.ok) {
      core.setMeta(id, { written: response.sha256, trouble: null, reported: false });
      markWritten(id, doc);
    } else if (response.problem === 'changed') {
      core.setMeta(id, { outside: response.bytes });
    } else {
      await becomeUnavailable(id, response.problem);
    }
  }

  /** AS1: `serialize(doc)` of a file tab (the committed drawing), then AS3 for its result. */
  async function writeTab(id: string): Promise<AutoSaveResponse | null> {
    const tab = fileTab(id);
    const state = tab === null ? null : stateOf(tab);
    if (state === null) return null;
    const doc = tabStateDoc(state);
    const seq = (issued.get(id) ?? 0) + 1;
    issued.set(id, seq);
    inFlight.set(id, doc);
    let response: AutoSaveResponse;
    try {
      response = await main.autoSave({ tabId: id, text: serialize(doc) });
    } catch (error) {
      main.logError(`Auto-save failed: ${String(error)}`);
      response = { tabId: id, ok: false, problem: 'write-failed' };
    }
    if (issued.get(id) === seq) inFlight.delete(id);
    if (response.tabId !== id) {
      main.logError('Auto-save answer for another tab ignored');
      return null;
    }
    if (seq < (applied.get(id) ?? 0)) return response; // stale: a newer result is applied
    applied.set(id, seq);
    await apply(id, doc, response);
    return response;
  }

  // ---- AS5 ----------------------------------------------------------------------------------

  async function check(id: string, wantBytes: boolean): Promise<CheckTabFileResponse | null> {
    let response: CheckTabFileResponse;
    try {
      response = await main.checkTabFile(id, wantBytes);
    } catch (error) {
      main.logError(`Tab file check failed: ${String(error)}`);
      core.setList(update(core.list(), id, { available: false }));
      core.setMeta(id, { trouble: 'unreadable' });
      return null;
    }
    core.setMeta(id, {
      written: response.written,
      outside: response.state === 'changed' ? response.bytes : null,
    });
    if (response.state === 'same') {
      core.setList(update(core.list(), id, { available: true }));
      core.setMeta(id, { trouble: null, reported: false });
    } else if (response.state !== 'changed') {
      core.setList(update(core.list(), id, { available: false }));
      core.setMeta(id, { trouble: response.state });
    }
    return response;
  }

  async function settle(id: string): Promise<void> {
    const tab = fileTab(id);
    if (tab === null || !isActive(id) || core.meta(id).outside !== null) return;
    if (!tab.available) return report(id);
    if (await unwritten(id)) await writeTab(id);
  }

  async function flushTab(id: string): Promise<void> {
    const tab = fileTab(id);
    const state = tab === null ? null : stateOf(tab);
    if (state === null || inFlight.get(id) === tabStateDoc(state)) return;
    await writeTab(id);
  }

  async function tick(): Promise<void> {
    const tab = activeTab(core.list());
    // AS8: never written while its changed file waits for AS7 (main would refuse it anyway).
    if (tab.kind !== 'chalk' || tab.state === null || core.meta(tab.id).outside !== null) return;
    if (!tab.available) {
      await check(tab.id, false); // AS6: the next change's timer tries again
      return settle(tab.id);
    }
    if (await unwritten(tab.id)) await flushTab(tab.id);
  }

  // ---- AS4, F6 ------------------------------------------------------------------------------

  async function saveAs(): Promise<boolean> {
    await o.finishEditing();
    const tab = activeTab(core.list());
    const ref = await main.chooseSave('chalk', suggestedSaveName(tab));
    if (ref === null) return false;
    const doc = tabStateDoc(controller.snapshotState());
    const text = serialize(doc);
    const written = await sha256(text);
    // I12 `save-as` before the C4 write; AS9: a path bound to another tab is refused.
    const bound = await main.bindTab({ tabId: tab.id, ref: ref.id, reason: 'save-as', written });
    if (!bound.ok) {
      await main.showFileError('open-in-tab', ref.name);
      return false;
    }
    const result = await main.writeFile(ref, encoder.encode(text));
    if (!result.ok) {
      await main.showFileError(result.problem, ref.name);
      return false;
    }
    core.setList(
      update(core.list(), tab.id, { kind: 'chalk', name: ref.name, ref, available: true }),
    );
    core.setMeta(tab.id, {
      written,
      outside: null,
      trouble: null,
      reported: false,
      boxDue: null,
    });
    if (isActive(tab.id) && controller.getDoc() === doc) controller.markSaved(); // R7
    o.notify('info', savedNotice(ref.name));
    o.changed();
    await core.writeRecord(findTab(core.list(), tab.id) as Tab, controller.snapshotState());
    await core.writeIndex();
    return true;
  }

  async function save(): Promise<boolean> {
    await o.finishEditing();
    const tab = activeTab(core.list());
    if (tab.kind !== 'chalk') return saveAs();
    await core.writeRecord(tab, controller.snapshotState());
    const response = await writeTab(tab.id);
    if (response?.ok === true) o.notify('info', savedNotice(tab.name));
    else if (response !== null && !response.ok && response.problem !== 'changed') {
      // The F14 box at once (AS4); it counts as this tab's AS6 box.
      core.setMeta(tab.id, { boxShown: true, boxDue: null });
      await main.showFileError(response.problem, tab.name);
    }
    await core.writeIndex();
    return response?.ok === true;
  }

  // ---- AS7 ----------------------------------------------------------------------------------

  function drawingOf(bytes: Uint8Array): Doc | null {
    const text = extractDrawing('chalk', bytes, o.decodeUtf8);
    if (!text.ok) return null;
    const parsed = parse(text.text);
    if (!parsed.ok) {
      main.logError(`Changed file does not open: ${parseProblem(parsed.error.code)}`);
      return null;
    }
    return parsed.value;
  }

  /** AS7(a): replaced in place as one undo step; N9; saved; N-A4. */
  async function acceptOutside(tab: Tab, theirs: Doc): Promise<void> {
    const before = controller.getDoc();
    controller.run({ type: 'replace-doc', doc: theirs, label: OUTSIDE_CHANGE_LABEL });
    const now = controller.getDoc();
    if (now === before) {
      main.logError('Changed file not loaded: the editor was busy');
      return;
    }
    const written = await drawingHash(now, sha256);
    main.acceptOutsideChange({ tabId: tab.id, written });
    core.setMeta(tab.id, { written, trouble: null, reported: false });
    controller.markSaved();
    core.setList(update(core.list(), tab.id, { available: true }));
    o.notify('info', outsideNotice(tab.name));
    o.changed();
  }

  /**
   * AS7(c): her tab becomes `kept` "(your changes)" and is unbound; the changed file, when it
   * opens, takes over the path in a new file tab right after hers (not activated).
   */
  async function keepHers(tab: Tab, theirs: Doc | null): Promise<void> {
    let opened = false;
    if (theirs !== null) {
      const id = o.newId();
      const written = await drawingHash(theirs, sha256);
      const bound = await main.bindTab({
        tabId: id,
        ref: null,
        reason: 'take-over',
        from: tab.id,
        written,
      });
      if (bound.ok) {
        const state = controller.newState(theirs);
        const added: Tab = {
          id,
          kind: 'chalk',
          name: tab.name,
          ref: tab.ref,
          available: true,
          state,
        };
        const list = core.list();
        const at = indexOfTab(list, tab.id) + 1;
        core.setList({ ...list, tabs: [...list.tabs.slice(0, at), added, ...list.tabs.slice(at)] });
        core.setMeta(id, core.freshMeta(written));
        await core.writeRecord(added, state);
        opened = true;
      }
    }
    if (!opened) await main.bindTab({ tabId: tab.id, ref: null, reason: 'unbind' });
    core.setList(update(markKept(core.list(), tab.id), tab.id, { available: true }));
    core.setMeta(tab.id, {
      written: null,
      outside: null,
      trouble: null,
      reported: false,
      boxDue: null,
    });
    o.changed();
    await core.writeRecord(findTab(core.list(), tab.id) as Tab, controller.snapshotState());
    await core.writeIndex();
    const problem = opened ? 'changed-outside' : 'changed-outside-unopenable';
    await main.showFileError(problem, tab.name, 'auto-save');
  }

  async function applyOutside(): Promise<void> {
    const tab = activeTab(core.list());
    const bytes = tab.kind === 'chalk' ? core.meta(tab.id).outside : null;
    if (bytes === null) return;
    core.setMeta(tab.id, { outside: null });
    const theirs = drawingOf(bytes);
    if (await unwritten(tab.id)) return keepHers(tab, theirs);
    if (theirs !== null) return acceptOutside(tab, theirs);
    await becomeUnavailable(tab.id, 'unopenable'); // AS7(b): AS6, nothing unbound, retried
  }

  function idlePending(): boolean {
    const list = core.list();
    const tab = activeTab(list);
    if (tab.kind === 'chalk' && core.meta(tab.id).outside !== null) return true;
    return list.tabs.some((t) => core.meta(t.id).boxDue !== null);
  }

  async function idleWork(): Promise<void> {
    await applyOutside();
    for (const t of core.list().tabs) {
      const due = core.meta(t.id).boxDue;
      if (due === null) continue;
      core.setMeta(t.id, { boxDue: null, boxShown: true });
      await main.showFileError(due, t.name, 'auto-save');
    }
  }

  return {
    check,
    settle,
    flushTab,
    writeNow: writeTab,
    tick,
    save,
    saveAs,
    applyOutside,
    idlePending,
    idleWork,
  };
}

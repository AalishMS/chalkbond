// TB19: tab flows 3 (T8 close a tab with T9's box, R39, SS6's unkept tab and its box, SS10's window
// close with R51, and the `flush-session` shutdown flush) over the fake ports of
// `__fixtures__/tab-flows-ports.ts`.
import { describe, expect, it } from 'vitest';
import { addAtom, emptyDoc, serialize, type Doc } from '@core/doc-model';
import { exportSvg } from '@core/clipboard-export';
import { tabStateCanUndo, tabStateDoc, type EditorTabState } from '../../editor';
import type { FileRef, SessionIndexUpdate } from '../../../shared/ipc-types';
import {
  NOW,
  createTabFlowHarness,
  decodeUtf8,
  encodeUtf8,
  sha256,
  type TabFlowHarness,
} from './__fixtures__/tab-flows-ports';
import { parseRecord, restoreRecord } from './session-record';
import type { TabFlowOptions, TabFlows } from './tab-flows';
import { findTab, label, type Tab } from './tabs';

const withAtoms = (n = 1): Doc => {
  let doc = emptyDoc(NOW);
  for (let i = 0; i < n; i++) doc = addAtom(doc, { element: 'C', x: i, y: 0 })[0];
  return doc;
};
const atoms = (doc: Doc): number => Object.keys(doc.atoms).length;

/** Draws on the active tab: one undo step, `n` atoms. */
function draw(h: TabFlowHarness, n = 1): Doc {
  h.editor.run({ type: 'replace-doc', doc: withAtoms(n), label: 'Draw' });
  return h.editor.getDoc();
}

const TIMER = { record: true, index: false } as const;
const MAIN = ['writeTabRecord', 'autoSave', 'updateSessionIndex', 'closeOk', 'ask'] as const;
const tabIds = (f: TabFlows): string[] => f.state().list.tabs.map((t) => t.id);
const active = (f: TabFlows): string => f.state().list.active;
const labels = (f: TabFlows): string[] => f.state().list.tabs.map((t) => label(t));
const tabOf = (f: TabFlows, id: string): Tab => findTab(f.state().list, id) as Tab;
const asked = (h: TabFlowHarness): string[] =>
  (h.argsOf('ask') as { name: string }[]).map((a) => a.name);
const lastIndex = (h: TabFlowHarness): SessionIndexUpdate => h.indexes.at(-1) as SessionIndexUpdate;
const errorBoxes = (h: TabFlowHarness): unknown[][] =>
  h.calls.filter((c) => c.name === 'showFileError').map((c) => [...c.args]);
const fileText = (h: TabFlowHarness, ref: FileRef): string | null =>
  decodeUtf8(h.files.get(ref.id) ?? new Uint8Array());

async function started(h: TabFlowHarness, patch: Partial<TabFlowOptions> = {}): Promise<TabFlows> {
  const f = h.flows(patch);
  await f.start({ session: null, open: null });
  return f;
}

/** A started flow with `a.chalk` (3 atoms) open in tab-1. */
async function withFile(
  h: TabFlowHarness,
  patch: Partial<TabFlowOptions> = {},
): Promise<{ f: TabFlows; ref: FileRef }> {
  const f = await started(h, patch);
  const ref = h.file('a.chalk', withAtoms(3));
  await f.openRef(ref);
  return { f, ref };
}

/** A state holding `doc` with one undo step (an earlier run's tab). */
function stateWith(doc: Doc): EditorTabState {
  const other = createTabFlowHarness();
  other.editor.run({ type: 'replace-doc', doc, label: 'Draw' });
  return other.editor.snapshotState();
}

/** The drawing in a record's text. */
function docOf(text: string): Doc {
  const parsed = parseRecord(text);
  if (!parsed.ok) throw new Error('record does not parse');
  const restored = restoreRecord(parsed.record, { clock: () => NOW, view: null, saved: 'unknown' });
  if (!restored.ok) throw new Error('record does not restore');
  return tabStateDoc(restored.state);
}
const recordDoc = (h: TabFlowHarness, id: string): Doc => docOf(h.records.get(id) as string);

const failRecords = (h: TabFlowHarness): void =>
  h.override('writeTabRecord', async () => ({ ok: false, problem: 'disk-full' }));
const keepRecords = (h: TabFlowHarness): void =>
  h.override('writeTabRecord', async ({ tabId, text }) => {
    h.records.set(tabId, text);
    return { ok: true };
  });

const saveRef = (name = 'mine.chalk'): FileRef => ({ id: `ref-${name}`, name, kind: 'chalk' });

describe('T8: what closes without a question', () => {
  it('an empty Untitled and an unedited picture close silently', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h);
    await f.newTab();
    await f.close('tab-2');
    expect(tabIds(f)).toEqual(['tab-1']);
    await f.openRef(h.file('ethanol.svg', encodeUtf8(exportSvg(withAtoms(2), null).svg)));
    expect(labels(f)).toEqual(['Untitled', 'ethanol.svg']);
    await f.close('tab-3');
    expect(tabIds(f)).toEqual(['tab-1']);
    expect(h.names(['ask'])).toEqual([]);
    expect(lastIndex(h).discarded).toEqual(['tab-2', 'tab-3']);
    expect(f.state().list.closed.map((c) => c.oldId)).toEqual(['tab-3', 'tab-2']);
  });

  it('a named file closes silently after its pending write (AS1 first)', async () => {
    const h = createTabFlowHarness();
    const { f, ref } = await withFile(h);
    await f.newTab();
    await f.activate('tab-1');
    const doc = draw(h, 5);
    h.calls.length = 0;
    await f.close('tab-1');
    expect(h.names(['autoSave', 'takeState', 'ask'])).toEqual(['autoSave', 'takeState']);
    expect(fileText(h, ref)).toBe(serialize(doc));
    expect(tabIds(f)).toEqual(['tab-2']);
    expect(f.state().list.closed[0]?.kind).toBe('chalk');
  });

  it('a file tab with nothing unwritten is not written again', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    await f.newTab();
    h.calls.length = 0;
    await f.close('tab-1');
    expect(h.names(['autoSave', 'ask'])).toEqual([]);
    expect(tabIds(f)).toEqual(['tab-2']);
  });

  it('R39: the last tab is replaced by an empty Untitled; the last empty Untitled with no undo step stays', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h, 2);
    h.answers.push('discard');
    await f.close('tab-1');
    expect(tabIds(f)).toEqual(['tab-2']);
    expect(labels(f)).toEqual(['Untitled']);
    expect(atoms(h.editor.getDoc())).toBe(0);
    await f.close('tab-2');
    expect(tabIds(f)).toEqual(['tab-2']);
    expect(asked(h)).toEqual(['Untitled']);
    // Empty but with an undo step: closes silently and a fresh Untitled takes its place.
    draw(h, 1);
    h.editor.run({ type: 'replace-doc', doc: emptyDoc(NOW), label: 'Clear' });
    expect(tabStateCanUndo(h.editor.snapshotState())).toBe(true);
    await f.close('tab-2');
    expect(tabIds(f)).toEqual(['tab-3']);
    expect(asked(h)).toEqual(['Untitled']);
  });
});

describe('T9: the close box (every answer)', () => {
  it('the tab is activated first and named as the title does', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h, 2);
    await f.newTab();
    h.calls.length = 0;
    await f.close('tab-1');
    expect(h.names(['putState', 'ask'])).toEqual(['putState', 'ask']);
    expect(h.argsOf('ask')).toEqual([{ kind: 'save-changes', name: 'Untitled' }]);
  });

  it('Cancel does nothing: the tab stays (now active), nothing closed or discarded', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h, 2);
    await f.newTab();
    h.answers.push('cancel');
    await f.close('tab-1');
    expect(tabIds(f)).toEqual(['tab-1', 'tab-2']);
    expect(active(f)).toBe('tab-1');
    expect(atoms(h.editor.getDoc())).toBe(2);
    expect(f.state().list.closed).toEqual([]);
    expect(f.state().list.discarded).toEqual([]);
  });

  it("Don't save closes it and it is reopenable with a fresh id, its record written at once (R40)", async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h, 2);
    await f.newTab();
    h.answers.push('discard');
    await f.close('tab-1');
    expect(tabIds(f)).toEqual(['tab-2']);
    expect(active(f)).toBe('tab-2');
    expect(lastIndex(h).discarded).toEqual(['tab-1']);
    h.calls.length = 0;
    await f.reopen();
    expect(tabIds(f)).toEqual(['tab-3', 'tab-2']);
    expect((h.argsOf('writeTabRecord')[0] as { tabId: string }).tabId).toBe('tab-3');
    expect(atoms(h.editor.getDoc())).toBe(2);
  });

  it('Save succeeded and the drawing is unchanged: the tab closes as a file tab', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    const doc = draw(h, 2);
    await f.newTab();
    await f.activate('tab-1');
    const ref = saveRef();
    h.saveDialogs.push(ref);
    h.answers.push('save');
    await f.close('tab-1');
    expect(fileText(h, ref)).toBe(serialize(doc));
    expect(tabIds(f)).toEqual(['tab-2']);
    const entry = f.state().list.closed[0];
    expect([entry?.kind, entry?.name]).toEqual(['chalk', 'mine.chalk']);
    expect(asked(h)).toEqual(['Untitled']);
  });

  it('Save, but the drawing changed during the write: the tab stays open with the newer drawing (R14)', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h, 2);
    await f.newTab();
    await f.activate('tab-1');
    h.saveDialogs.push(saveRef());
    h.answers.push('save');
    const held = h.hold('writeFile');
    const closing = f.close('tab-1');
    await held.reached;
    const later = draw(h, 5);
    held.release();
    await closing;
    expect(tabIds(f)).toEqual(['tab-1', 'tab-2']);
    expect(active(f)).toBe('tab-1');
    expect(h.editor.getDoc()).toBe(later);
    expect(asked(h)).toEqual(['Untitled']);
    expect(h.names(['takeState'])).toEqual(['takeState', 'takeState']); // the two switches only
  });

  it('a cancelled or failed Save as keeps the tab', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h, 2);
    h.answers.push('save');
    await f.close('tab-1'); // the Save dialog is cancelled
    expect(tabIds(f)).toEqual(['tab-1']);
    const ref = saveRef();
    h.saveDialogs.push(ref);
    h.answers.push('save');
    h.override('writeFile', async () => ({ ok: false, problem: 'disk-full' }));
    await f.close('tab-1');
    expect(tabIds(f)).toEqual(['tab-1']);
    expect(errorBoxes(h)).toEqual([['disk-full', 'mine.chalk']]);
    expect(asked(h)).toEqual(['Untitled', 'Untitled']);
  });

  it('an edited picture tab and a kept tab ask, named by their labels', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h);
    await f.openRef(h.file('ethanol.svg', encodeUtf8(exportSvg(withAtoms(2), null).svg)));
    draw(h, 4);
    await f.close('tab-2');
    expect(asked(h)).toEqual(['ethanol.svg']);
    expect(tabIds(f)).toEqual(['tab-1', 'tab-2']);
  });
});

describe('item (3): a tab not loaded in this run is read first', () => {
  async function restored(h: TabFlowHarness): Promise<{ f: TabFlows; ref: FileRef; newer: Doc }> {
    h.storeRecord({ id: 'a', kind: 'untitled', name: 'Untitled' }, stateWith(withAtoms(1)));
    h.storeRecord({ id: 'b', kind: 'untitled', name: 'Untitled 2' }, stateWith(withAtoms(3)));
    const old = withAtoms(2);
    const ref = h.file('acid.chalk', old);
    h.bind('c', ref, await sha256(serialize(old)));
    const newer = withAtoms(4);
    h.storeRecord({ id: 'c', kind: 'chalk', name: 'acid.chalk' }, stateWith(newer));
    h.records.set('d', '{ broken');
    const f = h.flows();
    await f.start({
      session: h.session(
        [
          { id: 'a', kind: 'untitled', name: 'Untitled', unsaved: true },
          { id: 'b', kind: 'untitled', name: 'Untitled 2', unsaved: true },
          { id: 'c', kind: 'chalk', name: 'acid.chalk' },
          { id: 'd', kind: 'kept', name: 'x (your changes)', unsaved: true },
        ],
        'a',
      ),
      open: null,
    });
    return { f, ref, newer };
  }

  it('an Untitled with content asks, after its record was read', async () => {
    const h = createTabFlowHarness();
    const { f } = await restored(h);
    h.calls.length = 0;
    await f.close('b');
    expect(h.names(['readTabRecord', 'ask'])).toEqual(['readTabRecord', 'ask']);
    expect(asked(h)).toEqual(['Untitled 2']);
    expect(active(f)).toBe('b');
    expect(atoms(h.editor.getDoc())).toBe(3);
  });

  it('a file tab whose record is newer than its file is written first, then closes silently', async () => {
    const h = createTabFlowHarness();
    const { f, ref, newer } = await restored(h);
    h.calls.length = 0;
    await f.close('c');
    expect(h.names(['readTabRecord', 'checkTabFile', 'autoSave', 'ask'])).toEqual([
      'readTabRecord',
      'checkTabFile',
      'autoSave',
    ]);
    expect(fileText(h, ref)).toBe(serialize(newer));
    expect(tabIds(f)).toEqual(['a', 'b', 'd']);
    expect(active(f)).toBe('a');
  });

  it('a record that does not parse is SS11: moved aside, closed without asking, not reopenable', async () => {
    const h = createTabFlowHarness();
    const { f } = await restored(h);
    await f.close('d');
    expect(h.damaged).toEqual(['d']);
    expect(h.names(['ask'])).toEqual([]);
    expect(tabIds(f)).toEqual(['a', 'b', 'c']);
    expect(f.state().list.closed).toEqual([]);
  });
});

describe('T8 (2): a record that cannot be read keeps the tab (TB19, never discarded)', () => {
  const NOTICE = "Couldn't read Untitled 2. Chalkbond keeps your drawing and will try again.";

  /** Tabs `a` (active) and `b` restored; I11 answers `unreadable` for `b` until `lock.on` is false. */
  async function locked(h: TabFlowHarness): Promise<{ f: TabFlows; lock: { on: boolean } }> {
    h.storeRecord({ id: 'a', kind: 'untitled', name: 'Untitled' }, stateWith(withAtoms(1)));
    h.storeRecord({ id: 'b', kind: 'untitled', name: 'Untitled 2' }, stateWith(withAtoms(3)));
    const lock = { on: true };
    h.override('readTabRecord', async (tabId: string) => {
      if (tabId === 'b' && lock.on) return { ok: false, problem: 'unreadable' };
      const text = h.records.get(tabId);
      return text === undefined ? { ok: false, problem: 'missing' } : { ok: true, text };
    });
    const f = h.flows();
    await f.start({
      session: h.session(
        [
          { id: 'a', kind: 'untitled', name: 'Untitled', unsaved: true },
          { id: 'b', kind: 'untitled', name: 'Untitled 2', unsaved: true },
        ],
        'a',
      ),
      open: null,
    });
    return { f, lock };
  }

  it('the tab stays, nothing is discarded or reopenable, N-A7 says it will try again', async () => {
    const h = createTabFlowHarness();
    const { f } = await locked(h);
    h.notices.length = 0;
    h.calls.length = 0;
    await f.close('b');
    expect(tabIds(f)).toEqual(['a', 'b']);
    expect(active(f)).toBe('a');
    expect(f.state().list.discarded).toEqual([]);
    expect(f.state().list.closed).toEqual([]);
    expect(h.damaged).toEqual([]);
    expect(h.names(['ask'])).toEqual([]);
    expect(h.notices).toEqual([{ kind: 'info', text: NOTICE }]);
    expect(h.names(['updateSessionIndex'])).toEqual([]);
  });

  it('a later close, once the record can be read, proceeds normally (T9 asks for the content)', async () => {
    const h = createTabFlowHarness();
    const { f, lock } = await locked(h);
    await f.close('b');
    expect(tabIds(f)).toEqual(['a', 'b']);
    lock.on = false;
    h.notices.length = 0;
    h.answers.push('discard');
    await f.close('b');
    expect(asked(h)).toEqual(['Untitled 2']);
    expect(tabIds(f)).toEqual(['a']);
    expect(h.notices).toEqual([]);
  });

  it('a file tab whose record is locked is kept too (its file is not read instead)', async () => {
    const h = createTabFlowHarness();
    const old = withAtoms(2);
    const ref = h.file('acid.chalk', old);
    h.bind('c', ref, await sha256(serialize(old)));
    h.storeRecord({ id: 'c', kind: 'chalk', name: 'acid.chalk' }, stateWith(withAtoms(4)));
    h.storeRecord({ id: 'a', kind: 'untitled', name: 'Untitled' }, stateWith(withAtoms(1)));
    h.override('readTabRecord', async (tabId: string) =>
      tabId === 'c'
        ? { ok: false, problem: 'unreadable' }
        : { ok: true, text: h.records.get(tabId) as string },
    );
    const f = h.flows();
    await f.start({
      session: h.session(
        [
          { id: 'a', kind: 'untitled', name: 'Untitled', unsaved: true },
          { id: 'c', kind: 'chalk', name: 'acid.chalk' },
        ],
        'a',
      ),
      open: null,
    });
    await f.close('c');
    expect(tabIds(f)).toEqual(['a', 'c']);
    expect(f.state().list.discarded).toEqual([]);
    expect(f.state().list.closed).toEqual([]);
    expect(fileText(h, ref)).toBe(serialize(old));
    expect(h.notices.map((n) => n.text)).toEqual([
      "Couldn't read acid.chalk. Chalkbond keeps your drawing and will try again.",
    ]);
  });

  it('a read that throws is the same: the tab stays', async () => {
    const h = createTabFlowHarness();
    const { f } = await locked(h);
    h.override('readTabRecord', async () => {
      throw new Error('ipc');
    });
    await f.close('b');
    expect(tabIds(f)).toEqual(['a', 'b']);
    expect(f.state().list.discarded).toEqual([]);
  });

  it('a missing record closes the same way as a damaged one: no question, not reopenable', async () => {
    const h = createTabFlowHarness();
    const { f, lock } = await locked(h);
    lock.on = false;
    h.records.delete('b');
    await f.close('b');
    expect(tabIds(f)).toEqual(['a']);
    expect(f.state().list.closed).toEqual([]);
    expect(h.names(['ask'])).toEqual([]);
  });

  it('closeWindow leaves an unreadable unloaded tab alone: not discarded, still in the index', async () => {
    const h = createTabFlowHarness();
    const { f } = await locked(h);
    await f.closeWindow();
    expect(f.closed()).toBe(true);
    expect(h.names(['closeOk'])).toEqual(['closeOk']);
    expect(h.names(['ask'])).toEqual([]);
    expect(lastIndex(h).discarded).toEqual([]);
    expect(lastIndex(h).tabs.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('closeWindow after a refused close of that tab still discards nothing', async () => {
    const h = createTabFlowHarness();
    const { f } = await locked(h);
    await f.close('b');
    await f.closeWindow();
    expect(lastIndex(h).discarded).toEqual([]);
    expect(lastIndex(h).tabs.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('item (4): a close-time write that is not ok makes the tab unsaved, so T9 asks', () => {
  it('a failed write (AS6): the box asks; Cancel keeps it, unavailable', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    draw(h, 5);
    h.override('autoSave', async ({ tabId }) => ({ tabId, ok: false, problem: 'disk-full' }));
    await f.close('tab-1');
    expect(asked(h)).toEqual(['a']);
    expect(tabIds(f)).toEqual(['tab-1']);
    expect(await f.marker('tab-1')).toBe('unavailable');
  });

  it('an unavailable file tab is checked again first; available again, it is written and closes', async () => {
    const h = createTabFlowHarness();
    const { f, ref } = await withFile(h);
    await f.newTab();
    await f.activate('tab-1');
    const doc = draw(h, 5);
    h.override('autoSave', async ({ tabId }) => ({ tabId, ok: false, problem: 'folder-gone' }));
    await f.write(TIMER);
    expect(tabOf(f, 'tab-1').available).toBe(false);
    h.override('autoSave', async ({ tabId, text }) => {
      h.files.set(ref.id, encodeUtf8(text));
      return { tabId, ok: true, sha256: await sha256(text) };
    });
    h.calls.length = 0;
    await f.close('tab-1');
    expect(h.names(['checkTabFile', 'autoSave', 'ask'])).toEqual(['checkTabFile', 'autoSave']);
    expect(fileText(h, ref)).toBe(serialize(doc));
    expect(tabIds(f)).toEqual(['tab-2']);
  });

  it('`changed` (AS7): her tab becomes kept, the changed file opens beside it, then T9 asks', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    draw(h, 5);
    const theirs = withAtoms(9);
    h.override('autoSave', async ({ tabId }) => ({
      tabId,
      ok: false,
      problem: 'changed',
      bytes: encodeUtf8(serialize(theirs)),
    }));
    h.answers.push('discard');
    await f.close('tab-1');
    expect(h.names(['showFileError', 'ask'])).toEqual(['showFileError', 'ask']);
    expect(errorBoxes(h)).toEqual([['changed-outside', 'a.chalk', 'auto-save']]);
    expect(asked(h)).toEqual(['a (your changes)']);
    expect(labels(f)).toEqual(['a']);
    expect(atoms(h.editor.getDoc())).toBe(9);
  });

  it('a changed file found earlier on an inactive tab is applied (activated) before deciding', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    draw(h, 5);
    const theirs = withAtoms(9);
    h.override('autoSave', async ({ tabId }) => ({
      tabId,
      ok: false,
      problem: 'changed',
      bytes: encodeUtf8(serialize(theirs)),
    }));
    h.override('checkTabFile', async (tabId) => ({
      tabId,
      written: h.written.get(tabId) ?? null,
      state: 'changed',
      bytes: encodeUtf8(serialize(theirs)),
    }));
    await f.newTab(); // the switch's write answers `changed`: AS7 waits for tab-1
    expect(f.state().meta['tab-1']?.outside).not.toBeNull();
    h.answers.push('cancel');
    await f.close('tab-1');
    expect(asked(h)).toEqual(['a (your changes)']);
    expect(active(f)).toBe('tab-1');
    expect(tabOf(f, 'tab-1').kind).toBe('kept');
  });
});

describe('item (7): SS6 unkept tabs', () => {
  it('a failing record write makes a store-only tab unkept; one box when idle; T8 asks; a success clears it', async () => {
    const h = createTabFlowHarness();
    let idle = false;
    const f = await started(h, { hostIdle: () => idle });
    draw(h, 2);
    failRecords(h);
    await f.write(TIMER);
    expect(f.state().meta['tab-1']?.recordFailed).toBe(true);
    expect(await f.marker('tab-1')).toBe('unkept');
    expect(errorBoxes(h)).toEqual([]);
    idle = true;
    await f.settleIdle();
    expect(errorBoxes(h)).toEqual([['disk-full', 'Untitled', 'keep']]);
    draw(h, 3);
    await f.write(TIMER);
    expect(errorBoxes(h)).toHaveLength(1);
    await f.close('tab-1');
    expect(asked(h)).toEqual(['Untitled']);
    keepRecords(h);
    draw(h, 4);
    await f.write(TIMER);
    expect(f.state().meta['tab-1']?.recordFailed).toBe(false);
    expect(await f.marker('tab-1')).toBe('dot');
    expect(errorBoxes(h)).toHaveLength(1);
  });

  it('a box still due when the write succeeds is dropped; an unusual problem is write-failed', async () => {
    const h = createTabFlowHarness();
    let idle = false;
    const f = await started(h, { hostIdle: () => idle });
    draw(h, 2);
    h.override('writeTabRecord', async () => ({ ok: false, problem: 'busy' }));
    await f.write(TIMER);
    keepRecords(h);
    await f.write(TIMER);
    idle = true;
    await f.settleIdle();
    expect(errorBoxes(h)).toEqual([]);
    h.override('writeTabRecord', async () => ({ ok: false, problem: 'folder-gone' }));
    await f.write(TIMER);
    await f.settleIdle();
    expect(errorBoxes(h)).toEqual([['write-failed', 'Untitled', 'keep']]);
  });

  it('a written file tab is not unkept: no box, closes silently', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    draw(h, 4);
    failRecords(h);
    await f.write(TIMER);
    expect(f.state().meta['tab-1']?.recordFailed).toBe(true);
    expect(await f.marker('tab-1')).toBe('none');
    expect(errorBoxes(h)).toEqual([]);
    await f.newTab();
    await f.close('tab-1');
    expect(h.names(['ask'])).toEqual([]);
  });
});

describe('SS10: the window close (R51)', () => {
  it('no unkept tab: no box; F4a, the record, AS1, the index with discarded, then N5; nothing after', async () => {
    const h = createTabFlowHarness();
    const { f, ref } = await withFile(h);
    await f.newTab();
    draw(h, 2); // an unsaved Untitled is kept in the store: no box
    await f.newTab();
    await f.close('tab-3');
    await f.activate('tab-1');
    const doc = draw(h, 5);
    h.calls.length = 0;
    await f.closeWindow();
    expect(h.names(['ask', 'showFileError'])).toEqual([]);
    expect(h.names(['finishEditing', ...MAIN])).toEqual([
      'finishEditing',
      'writeTabRecord',
      'autoSave',
      'updateSessionIndex',
      'closeOk',
    ]);
    expect(lastIndex(h).discarded).toEqual(['tab-3']);
    expect(fileText(h, ref)).toBe(serialize(doc));
    expect(f.closed()).toBe(true);
    // After N5 the renderer sends nothing more.
    h.calls.length = 0;
    draw(h, 6);
    await f.write({ record: true, index: true });
    await f.newTab();
    await f.closeWindow();
    await f.flushSession();
    await f.settleIdle();
    expect(h.names([...MAIN, 'takeState'])).toEqual([]);
  });

  it("an unkept tab: T9 for that tab only, activated first; Don't save drops it, then N5", async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h, 2);
    failRecords(h);
    await f.newTab(); // tab-1's record fails on the switch: unkept
    keepRecords(h);
    draw(h, 1); // tab-2 is unsaved but kept
    h.answers.push('discard');
    h.calls.length = 0;
    await f.closeWindow();
    expect(asked(h)).toEqual(['Untitled']);
    expect(h.names(['putState', 'ask'])[0]).toBe('putState');
    expect(h.names(['closeOk'])).toEqual(['closeOk']);
    expect(tabIds(f)).toEqual(['tab-2']);
    expect(lastIndex(h).discarded).toEqual(['tab-1']);
    expect(h.names(['updateSessionIndex', 'closeOk']).slice(-2)).toEqual([
      'updateSessionIndex',
      'closeOk',
    ]);
  });

  it('Cancel stops the close: no N5, the window stays and the flows go on', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h, 2);
    failRecords(h);
    await f.newTab();
    keepRecords(h);
    h.answers.push('cancel');
    await f.closeWindow();
    expect(h.names(['closeOk'])).toEqual([]);
    expect(f.closed()).toBe(false);
    expect(active(f)).toBe('tab-1');
    await f.newTab();
    expect(tabIds(f)).toEqual(['tab-1', 'tab-2', 'tab-3']);
  });

  it('Save: Save as, then N5; a cancelled Save as stops the close', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    const doc = draw(h, 2);
    failRecords(h); // the disk stays full: the record is never written
    await f.newTab();
    h.answers.push('save');
    await f.closeWindow(); // no Save dialog answer: cancelled
    expect(h.names(['closeOk'])).toEqual([]);
    const ref = saveRef();
    h.saveDialogs.push(ref);
    h.answers.push('save');
    await f.closeWindow();
    expect(fileText(h, ref)).toBe(serialize(doc));
    expect(tabOf(f, 'tab-1').kind).toBe('chalk');
    expect(h.names(['closeOk'])).toEqual(['closeOk']);
  });

  it('several unkept tabs are asked in strip order', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h, 2);
    failRecords(h);
    await f.newTab();
    draw(h, 3);
    await f.newTab();
    keepRecords(h);
    h.answers.push('discard', 'discard');
    await f.closeWindow();
    expect(asked(h)).toEqual(['Untitled', 'Untitled 2']);
    expect(tabIds(f)).toEqual(['tab-3']);
    expect(lastIndex(h).discarded).toEqual(['tab-1', 'tab-2']);
    expect(h.names(['closeOk'])).toEqual(['closeOk']);
  });

  it('the close-time record write failing makes the active tab unkept, so it asks', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h, 2);
    failRecords(h);
    h.answers.push('discard');
    await f.closeWindow();
    expect(asked(h)).toEqual(['Untitled']);
    expect(h.names(['closeOk'])).toEqual(['closeOk']);
  });

  it('a close request while a flow runs waits, then runs', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    const held = h.hold('chooseOpen');
    const opening = f.open();
    await held.reached;
    await f.closeWindow();
    expect(h.names(['closeOk'])).toEqual([]);
    held.release();
    await opening;
    expect(h.names(['closeOk'])).toEqual(['closeOk']);
  });

  it('a write in flight when the close sends N5 sends nothing after it', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    draw(h, 4);
    const held = h.hold('writeTabRecord');
    const writing = f.write({ record: true, index: true });
    await held.reached;
    await f.closeWindow();
    h.calls.length = 0;
    held.release();
    await writing;
    expect(h.names([...MAIN])).toEqual([]);
  });
});

describe('item (2), shutdown half: flush-session', () => {
  const startDrag = (h: TabFlowHarness): void => {
    h.editor.store.dispatch({ type: 'select-tool', tool: 'bond' });
    const event = (type: 'down' | 'move', x: number) => ({
      type,
      screen: { x, y: 200 },
      p: { x: x / 40, y: 5 },
      button: 0 as const,
      mods: { shift: false, alt: false, ctrl: false },
    });
    h.editor.store.dispatch({ type: 'pointer', event: event('down', 200) });
    h.editor.store.dispatch({ type: 'pointer', event: event('move', 300) });
    expect(h.editor.store.getState().gesture).not.toBeNull();
  };
  const openLabel = (h: TabFlowHarness): void => {
    const atom = Object.keys(h.editor.getDoc().atoms)[0] as string;
    h.editor.store.dispatch({ type: 'open-label', atom: atom as never });
    expect(h.editor.store.getState().editing?.kind).toBe('label');
  };
  const openText = (h: TabFlowHarness): void => {
    h.editor.store.dispatch({ type: 'select-tool', tool: 'text' });
    h.editor.store.dispatch({
      type: 'open-text',
      target: { kind: 'new', fresh: { at: { x: 3, y: 3 }, align: 'left' } },
    });
    h.editor.store.dispatch({ type: 'edit-insert', text: 'draft' });
    expect(h.editor.store.getState().editing?.kind).toBe('text');
  };

  /** R25's port as the host builds it: commits an open editor unless a composition runs. */
  const finishUnless = (h: TabFlowHarness, composing: boolean) => (): void => {
    h.calls.push({ name: 'finishEditingNow', args: [] });
    if (!composing && h.editor.store.getState().editing !== null) {
      h.editor.store.dispatch({ type: 'edit-commit' });
    }
  };

  it('during a drag: the committed drawing is sent, the store untouched, nothing awaited', async () => {
    const h = createTabFlowHarness();
    const f = await started(h, { finishEditingNow: finishUnless(h, false) });
    const doc = draw(h, 2);
    startDrag(h);
    const before = h.editor.store.getState();
    const held = h.hold('writeTabRecord');
    h.calls.length = 0;
    await f.flushSession();
    expect(h.editor.store.getState()).toBe(before);
    expect(h.names(['finishEditingNow', ...MAIN])).toEqual([
      'finishEditingNow',
      'writeTabRecord',
      'updateSessionIndex',
    ]);
    expect(h.names(['takeState', 'putState', 'finishEditing'])).toEqual([]);
    const sent = h.argsOf('writeTabRecord')[0] as { text: string };
    held.release();
    expect(serialize(docOf(sent.text))).toBe(serialize(doc));
  });

  it('a label editor open during a composition is left alone; the committed drawing is sent', async () => {
    const h = createTabFlowHarness();
    const f = await started(h, { finishEditingNow: finishUnless(h, true) });
    const doc = draw(h, 2);
    openLabel(h);
    const before = h.editor.store.getState();
    await f.flushSession();
    expect(h.editor.store.getState()).toBe(before);
    expect(serialize(recordDoc(h, 'tab-1'))).toBe(serialize(doc));
  });

  it('a text editor with no composition is finished through its commit path first', async () => {
    const h = createTabFlowHarness();
    const f = await started(h, { finishEditingNow: finishUnless(h, false) });
    const doc = draw(h, 2);
    openText(h);
    await f.flushSession();
    expect(h.editor.store.getState().editing).toBeNull();
    const finished = h.editor.getDoc();
    expect(finished).not.toBe(doc);
    expect(serialize(recordDoc(h, 'tab-1'))).toBe(serialize(finished));
  });

  it('during an IME composition the editor is left alone; the record holds the committed drawing', async () => {
    const h = createTabFlowHarness();
    const f = await started(h, { finishEditingNow: finishUnless(h, true) });
    const doc = draw(h, 2);
    openText(h);
    const before = h.editor.store.getState();
    await f.flushSession();
    expect(h.editor.store.getState()).toBe(before);
    expect(serialize(recordDoc(h, 'tab-1'))).toBe(serialize(doc));
  });

  it('a file tab with unwritten changes: record, AS1 and index sent at once, no answer awaited', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    const doc = draw(h, 6);
    const record = h.hold('writeTabRecord');
    const write = h.hold('autoSave');
    h.calls.length = 0;
    await f.flushSession();
    expect(h.names([...MAIN])).toEqual(['writeTabRecord', 'autoSave', 'updateSessionIndex']);
    expect(h.argsOf('autoSave')).toEqual([{ tabId: 'tab-1', text: serialize(doc) }]);
    record.release();
    write.release();
  });

  it('a file tab with nothing unwritten sends no AS1', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    h.calls.length = 0;
    await f.flushSession();
    expect(h.names([...MAIN])).toEqual(['writeTabRecord', 'updateSessionIndex']);
  });
});

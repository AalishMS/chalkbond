// TB18: tab flows 2 (AS1-AS9 renderer half, F5 / F6 in tabs, SS11's open from the file through
// I14 `wantBytes`) over the fake ports of `__fixtures__/tab-flows-ports.ts`.
import { describe, expect, it } from 'vitest';
import { addAtom, emptyDoc, serialize, type Doc } from '@core/doc-model';
import { exportSvg } from '@core/clipboard-export';
import { tabStateDirty, tabStateDoc, type EditorTabState } from '../../editor';
import type {
  AutoSaveResponse,
  CheckTabFileResponse,
  FileRef,
  WriteFileResponse,
} from '../../../shared/ipc-types';
import {
  NOW,
  createTabFlowHarness,
  decodeUtf8,
  encodeUtf8,
  sha256,
  type TabFlowHarness,
} from './__fixtures__/tab-flows-ports';
import { createWriteSchedule } from './write-schedule';
import {
  OUTSIDE_CHANGE_LABEL,
  outsideNotice,
  savedNotice,
  suggestedSaveName,
  unavailableNotice,
} from './tab-autosave';
import type { TabFlowOptions, TabFlows } from './tab-flows';
import { activeTab, findTab, label, type Tab } from './tabs';

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
const active = (f: TabFlows): string => f.state().list.active;
const tabOf = (f: TabFlows, id: string): Tab => findTab(f.state().list, id) as Tab;
const labels = (f: TabFlows): string[] => f.state().list.tabs.map((t) => label(t));
const texts = (h: TabFlowHarness): string[] => h.notices.map((n) => n.text);
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

/** What `checkTabFile` answers next: `changed` with these bytes and main's written hash. */
function changedOnce(h: TabFlowHarness, bytes: Uint8Array): void {
  h.override('checkTabFile', async (tabId) => {
    h.override('checkTabFile', async (id) => ({
      tabId: id,
      written: h.written.get(id) ?? null,
      state: 'same',
    }));
    return { tabId, written: h.written.get(tabId) ?? null, state: 'changed', bytes };
  });
}

/** A state holding `doc` with one undo step (an earlier run's tab). */
function stateWith(doc: Doc): EditorTabState {
  const other = createTabFlowHarness();
  other.editor.run({ type: 'replace-doc', doc, label: 'Draw' });
  return other.editor.snapshotState();
}

/** A fake clock and scheduler driving the real SS4 write schedule, wired as the host will. */
function scheduled(h: TabFlowHarness, f: TabFlows) {
  let now = 0;
  const timers: { at: number; fn: () => void; live: boolean }[] = [];
  const writes: Promise<void>[] = [];
  const schedule = createWriteSchedule({
    now: () => now,
    schedule: (fn, ms) => {
      const t = { at: now + ms, fn, live: true };
      timers.push(t);
      return () => {
        t.live = false;
      };
    },
    write: (due) => {
      writes.push(f.write(due));
    },
  });
  h.editor.subscribe((e) => {
    if (e.type === 'doc') schedule.event('doc');
  });
  return {
    schedule,
    async advance(ms: number): Promise<void> {
      const end = now + ms;
      for (;;) {
        const due = timers.filter((t) => t.live && t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (due === undefined) break;
        due.live = false;
        now = due.at;
        due.fn();
        await Promise.all(writes);
      }
      now = end;
    },
  };
}

describe('AS1, AS2: the timer write', () => {
  it('writes serialize(doc) of the active file tab, marks it saved, shows nothing (R41)', async () => {
    const h = createTabFlowHarness();
    const { f, ref } = await withFile(h);
    const doc = draw(h, 5);
    expect((await f.facts('tab-1'))?.unwritten).toBe(true);
    await f.write(TIMER);
    expect(h.argsOf('autoSave')).toEqual([{ tabId: 'tab-1', text: serialize(doc) }]);
    expect(fileText(h, ref)).toBe(serialize(doc));
    expect(h.names(['writeTabRecord', 'autoSave']).slice(-2)).toEqual([
      'writeTabRecord',
      'autoSave',
    ]);
    expect(h.names(['markSaved'])).toEqual(['markSaved']);
    expect(h.editor.isDirty()).toBe(false);
    expect(f.state().meta['tab-1']?.written).toBe(await sha256(serialize(doc)));
    expect((await f.facts('tab-1'))?.unwritten).toBe(false);
    expect(h.notices).toEqual([]);
    expect(await f.marker('tab-1')).toBe('none');
  });

  it('a tab with nothing unwritten, an untitled and a picture tab are never written outside the store', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    await f.write(TIMER);
    await f.newTab();
    draw(h, 2);
    await f.write(TIMER);
    const svg = exportSvg(withAtoms(1), null).svg;
    await f.openRef(h.file('ethanol.svg', encodeUtf8(svg)));
    draw(h, 4);
    await f.write(TIMER);
    await f.write({ record: false, index: true });
    expect(h.argsOf('autoSave')).toEqual([]);
    expect(h.records.has('tab-2')).toBe(true);
    expect(h.indexes.length).toBeGreaterThan(0);
  });

  it('item (K): a file not in serialize form, 15 s of fake time on the real schedule: nothing written', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    const doc = withAtoms(3);
    const pretty = JSON.stringify(JSON.parse(serialize(doc)), null, 2);
    expect(pretty).not.toBe(serialize(doc));
    const ref = h.file('pretty.chalk', encodeUtf8(pretty));
    const timer = scheduled(h, f);
    await f.openRef(ref);
    await timer.advance(15_000);
    expect(h.argsOf('autoSave')).toEqual([]);
    expect(fileText(h, ref)).toBe(pretty);
    // Control: a change is written by the same timer, 2 s after it.
    draw(h, 4);
    await timer.advance(1_999);
    expect(h.argsOf('autoSave')).toEqual([]);
    await timer.advance(1);
    expect(h.argsOf('autoSave')).toHaveLength(1);
    expect(fileText(h, ref)).toBe(serialize(h.editor.getDoc()));
  });

  it('a tick before the active tab is loaded writes nothing for it', async () => {
    const h = createTabFlowHarness();
    h.storeRecord({ id: 't0', kind: 'untitled', name: 'Untitled' }, stateWith(withAtoms(1)));
    const held = h.hold('readTabRecord');
    const f = h.flows();
    const starting = f.start({
      session: h.session([{ id: 't0', kind: 'untitled', name: 'Untitled', unsaved: true }], 't0'),
      open: null,
    });
    await held.reached;
    await f.write(TIMER);
    expect(h.argsOf('writeTabRecord')).toEqual([]);
    held.release();
    await starting;
    expect(atoms(h.editor.getDoc())).toBe(1);
  });
});

describe('item (2), timer half: the timer record and write change no editor state', () => {
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
    expect(h.editor.store.getState().editing?.kind).toBe('text');
  };

  for (const [name, setUp] of [
    ['during a drag', startDrag],
    ['with a label editor open', openLabel],
    ['with a text editor open (an IME composition in progress)', openText],
  ] as const) {
    it(`an untitled tab ${name}: the record is the committed state and the store is untouched`, async () => {
      const h = createTabFlowHarness();
      const f = await started(h);
      draw(h, 2);
      setUp(h);
      const before = h.editor.store.getState();
      await f.write(TIMER);
      expect(h.editor.store.getState()).toBe(before);
      const record = JSON.parse(h.records.get('tab-1') as string) as { name: string };
      expect(record.name).toBe('Untitled');
      expect(h.names(['takeState', 'finishEditing', 'putState', 'markSaved'])).toEqual([
        'putState',
      ]);
    });

    it(`a file tab ${name}: the committed drawing is written; gesture and editor stay`, async () => {
      const h = createTabFlowHarness();
      const { f, ref } = await withFile(h);
      const doc = draw(h, 4);
      setUp(h);
      const { gesture, editing, preview } = h.editor.store.getState();
      await f.write(TIMER);
      expect(fileText(h, ref)).toBe(serialize(doc));
      const after = h.editor.store.getState();
      expect([after.gesture, after.editing, after.preview]).toEqual([gesture, editing, preview]);
      expect(h.editor.getDoc()).toBe(doc);
      expect(h.names(['takeState', 'finishEditing'])).toEqual(['finishEditing']);
    });
  }
});

describe('AS3: a result goes to the tab in its tabId', () => {
  it('item (1): a result for A after a switch to an edited picture tab B marks A saved, B stays unsaved', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    const doc = draw(h, 5);
    const held = h.hold('autoSave');
    const writing = f.write(TIMER);
    await held.reached;
    const svg = exportSvg(withAtoms(1), null).svg;
    await f.openRef(h.file('ethanol.svg', encodeUtf8(svg)));
    expect(active(f)).toBe('tab-2');
    // The switch did not send the very drawing again: its write is in flight.
    expect(h.argsOf('autoSave')).toHaveLength(1);
    draw(h, 2);
    expect(await f.marker('tab-2')).toBe('dot');
    const markedBefore = h.names(['markSaved']).length;
    held.release();
    await writing;
    const a = tabOf(f, 'tab-1').state as EditorTabState;
    expect(tabStateDoc(a)).toBe(doc);
    expect(tabStateDirty(a)).toBe(false);
    expect((await f.facts('tab-1'))?.unwritten).toBe(false);
    expect(h.names(['markSaved'])).toHaveLength(markedBefore);
    expect(h.editor.isDirty()).toBe(true);
    expect(await f.marker('tab-2')).toBe('dot');
    expect((await f.facts('tab-2'))?.edited).toBe(true);
  });

  it('a result for the active tab whose drawing changed meanwhile marks nothing (R7)', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    draw(h, 5);
    const held = h.hold('autoSave');
    const writing = f.write(TIMER);
    await held.reached;
    draw(h, 6);
    held.release();
    await writing;
    expect(h.names(['markSaved'])).toEqual([]);
    expect(h.editor.isDirty()).toBe(true);
    expect((await f.facts('tab-1'))?.unwritten).toBe(true);
  });

  it('an inactive tab whose drawing is not the doc written gets that doc as baseline only (still dirty)', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    draw(h, 5);
    const held = h.hold('autoSave');
    const writing = f.write(TIMER);
    await held.reached;
    const later = draw(h, 6);
    await f.newTab(); // the switch writes `later` (a different drawing) at once
    expect(h.argsOf('autoSave')).toHaveLength(2);
    held.release();
    await writing;
    const a = tabOf(f, 'tab-1').state as EditorTabState;
    expect(tabStateDoc(a)).toBe(later);
    // The older result is stale (the newer one was applied): nothing changes.
    expect(tabStateDirty(a)).toBe(false);
    expect(f.state().meta['tab-1']?.written).toBe(await sha256(serialize(later)));
  });

  it('a result never touches another tab: active, inactive and closed targets', async () => {
    for (const target of ['active', 'inactive', 'closed'] as const) {
      const h = createTabFlowHarness();
      const { f } = await withFile(h);
      await f.openRef(h.file('b.chalk', withAtoms(2)));
      await f.newTab();
      draw(h, 1);
      await f.activate('tab-1');
      draw(h, 7);
      const held = h.hold('autoSave');
      const writing = f.write(TIMER);
      await held.reached;
      if (target === 'inactive') await f.activate('tab-2');
      if (target === 'closed') await f.close('tab-1');
      const others = f.state().list.tabs.filter((t) => t.id !== 'tab-1');
      const otherMeta = others.map((t) => f.state().meta[t.id]);
      const docBefore = h.editor.getDoc();
      held.release();
      await writing;
      const after = f.state().list.tabs.filter((t) => t.id !== 'tab-1');
      expect(after).toHaveLength(others.length);
      after.forEach((t, i) => expect(t).toBe(others[i]));
      expect(after.map((t) => f.state().meta[t.id])).toEqual(otherMeta);
      if (target !== 'active') expect(h.editor.getDoc()).toBe(docBefore);
      if (target === 'closed') {
        const entry = f.state().list.closed[0];
        expect(entry?.oldId).toBe('tab-1');
        expect(tabStateDirty(entry?.state as EditorTabState)).toBe(false);
      }
    }
  });

  it('a rejected I13 call is a failed write (AS6), logged', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    draw(h, 5);
    h.override('autoSave', async () => {
      throw new Error('refused');
    });
    await f.write(TIMER);
    expect(tabOf(f, 'tab-1').available).toBe(false);
    expect(h.errors.some((e) => e.startsWith('Auto-save failed'))).toBe(true);
    expect(h.argsOf('showFileError')).toEqual(['write-failed']);
  });
});

describe('AS4 Save and F6 Save as', () => {
  it('Ctrl+S on a file tab writes now and shows N-A1; a timer write never does', async () => {
    const h = createTabFlowHarness();
    const { f, ref } = await withFile(h);
    const doc = draw(h, 5);
    await f.save();
    expect(h.names(['finishEditing', 'writeTabRecord', 'autoSave']).slice(-3)).toEqual([
      'finishEditing',
      'writeTabRecord',
      'autoSave',
    ]);
    expect(fileText(h, ref)).toBe(serialize(doc));
    expect(texts(h)).toEqual([savedNotice('a.chalk')]);
    expect(savedNotice('a.chalk')).toBe('Saved a.chalk.');
    expect(h.editor.isDirty()).toBe(false);
    draw(h, 6);
    await f.write(TIMER);
    expect(texts(h)).toEqual(['Saved a.chalk.']);
    expect(h.argsOf('chooseSave')).toEqual([]);
  });

  it('Ctrl+S on an Untitled is Save as: bound before the write, then a file tab that auto-saves', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    const doc = draw(h, 2);
    const ref: FileRef = { id: 'ref-new', name: 'ester.chalk', kind: 'chalk' };
    h.saveDialogs.push(ref);
    await f.save();
    expect(h.calls.find((c) => c.name === 'chooseSave')?.args).toEqual(['chalk', 'Untitled.chalk']);
    const hash = await sha256(serialize(doc));
    expect(h.argsOf('bindTab')).toEqual([
      { tabId: 'tab-1', ref: 'ref-new', reason: 'save-as', written: hash },
    ]);
    expect(h.names(['bindTab', 'writeFile'])).toEqual(['bindTab', 'writeFile']);
    expect(fileText(h, ref)).toBe(serialize(doc));
    const tab = activeTab(f.state().list);
    expect([tab.kind, tab.name, tab.ref, tab.available]).toEqual([
      'chalk',
      'ester.chalk',
      ref,
      true,
    ]);
    expect(texts(h)).toEqual(['Saved ester.chalk.']);
    expect(h.editor.isDirty()).toBe(false);
    expect(JSON.parse(h.records.get('tab-1') as string)).toMatchObject({
      kind: 'chalk',
      name: 'ester.chalk',
    });
    expect(h.indexes.at(-1)?.tabs[0]).toMatchObject({ kind: 'chalk', name: 'ester.chalk' });
    const next = draw(h, 3);
    await f.write(TIMER);
    expect(h.argsOf('autoSave')).toEqual([{ tabId: 'tab-1', text: serialize(next) }]);
  });

  it('F6 suggested names', () => {
    expect(suggestedSaveName({ kind: 'untitled', name: 'Untitled 2' })).toBe('Untitled 2.chalk');
    expect(suggestedSaveName({ kind: 'chalk', name: 'ethanol.chalk' })).toBe('ethanol.chalk');
    expect(suggestedSaveName({ kind: 'picture', name: 'ethanol.png' })).toBe('ethanol.chalk');
    expect(suggestedSaveName({ kind: 'picture', name: 'toluene.SVG' })).toBe('toluene.chalk');
    expect(suggestedSaveName({ kind: 'kept', name: 'esterification (your changes)' })).toBe(
      'esterification (your changes).chalk',
    );
    expect(suggestedSaveName({ kind: 'kept', name: 'acid.pdf' })).toBe('acid.chalk');
  });

  it("Save as on a picture tab suggests its name; the folder is main's (no path is sent)", async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    const svg = exportSvg(withAtoms(1), null).svg;
    await f.openRef(h.file('ethanol.svg', encodeUtf8(svg)));
    await f.save();
    expect(h.calls.find((c) => c.name === 'chooseSave')?.args).toEqual(['chalk', 'ethanol.chalk']);
    // Cancelled: nothing changed.
    expect(activeTab(f.state().list).kind).toBe('picture');
    expect(h.names(['bindTab', 'writeFile']).filter((n) => n === 'writeFile')).toEqual([]);
  });

  it('Save as on a file tab binds the new file; the old file keeps its last auto-saved bytes', async () => {
    const h = createTabFlowHarness();
    const { f, ref } = await withFile(h);
    const first = draw(h, 4);
    await f.write(TIMER);
    const second = draw(h, 5);
    const copy: FileRef = { id: 'ref-copy', name: 'b.chalk', kind: 'chalk' };
    h.saveDialogs.push(copy);
    await f.saveAs();
    expect(h.calls.find((c) => c.name === 'chooseSave')?.args).toEqual(['chalk', 'a.chalk']);
    expect(fileText(h, ref)).toBe(serialize(first));
    expect(fileText(h, copy)).toBe(serialize(second));
    expect(activeTab(f.state().list)).toMatchObject({ kind: 'chalk', name: 'b.chalk', ref: copy });
    expect(h.bindings.get('tab-1')).toBe('ref-copy');
    const third = draw(h, 6);
    await f.write(TIMER);
    expect(fileText(h, copy)).toBe(serialize(third));
    expect(fileText(h, ref)).toBe(serialize(first));
  });

  it('a cancelled or failed Save as changes nothing; a failure shows the F14 box', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h, 2);
    await f.saveAs();
    const ref: FileRef = { id: 'ref-x', name: 'x.chalk', kind: 'chalk' };
    h.saveDialogs.push(ref);
    h.override('writeFile', async (): Promise<WriteFileResponse> => ({
      ok: false,
      problem: 'disk-full',
    }));
    await f.saveAs();
    expect(h.calls.filter((c) => c.name === 'showFileError').map((c) => c.args)).toEqual([
      ['disk-full', 'x.chalk'],
    ]);
    expect(activeTab(f.state().list)).toMatchObject({ kind: 'untitled', name: 'Untitled' });
    expect(texts(h)).toEqual([]);
    expect(h.editor.isDirty()).toBe(true);
  });

  it('AS9: a path open in another tab shows the open-in-tab box and writes nothing', async () => {
    const h = createTabFlowHarness();
    const { f, ref } = await withFile(h);
    await f.newTab();
    draw(h, 2);
    h.saveDialogs.push({ ...ref });
    await f.save();
    expect(h.calls.filter((c) => c.name === 'showFileError').map((c) => c.args)).toEqual([
      ['open-in-tab', 'a.chalk'],
    ]);
    expect(h.names(['writeFile'])).toEqual([]);
    expect(activeTab(f.state().list)).toMatchObject({ kind: 'untitled', id: 'tab-2' });
  });

  it('a drawing changed during the Save-as write is not marked saved (R7)', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h, 2);
    h.saveDialogs.push({ id: 'ref-x', name: 'x.chalk', kind: 'chalk' });
    const held = h.hold('writeFile');
    const saving = f.saveAs();
    await held.reached;
    draw(h, 3);
    held.release();
    await saving;
    expect(activeTab(f.state().list).kind).toBe('chalk');
    expect(h.names(['markSaved'])).toEqual([]);
    expect((await f.facts('tab-1'))?.unwritten).toBe(true);
  });

  it('Ctrl+S on a file tab that fails shows the F14 box at once and no auto-save box later', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    draw(h, 5);
    h.override('autoSave', async ({ tabId }): Promise<AutoSaveResponse> => ({
      tabId,
      ok: false,
      problem: 'disk-full',
    }));
    await f.save();
    expect(h.calls.filter((c) => c.name === 'showFileError').map((c) => c.args)).toEqual([
      ['disk-full', 'a.chalk'],
    ]);
    expect(tabOf(f, 'tab-1').available).toBe(false);
    expect(await f.marker('tab-1')).toBe('unavailable');
    await f.write(TIMER);
    await f.settleIdle();
    expect(h.argsOf('showFileError')).toHaveLength(1);
    expect(texts(h)).toEqual([]);
  });

  it('save and saveAs are ignored while a flow runs', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    const held = h.hold('writeTabRecord');
    const adding = f.newTab();
    await held.reached;
    await f.save();
    await f.saveAs();
    held.release();
    await adding;
    expect(h.names(['chooseSave'])).toEqual([]);
  });
});

describe('AS5, AS6: checks and the unavailable state', () => {
  it('missing with nothing unwritten: N-A3 once, no box; unavailable, still bound', async () => {
    const h = createTabFlowHarness();
    const { f, ref } = await withFile(h);
    await f.newTab();
    h.files.delete(ref.id);
    await f.activate('tab-1');
    expect(texts(h)).toEqual([unavailableNotice('missing', 'a.chalk')]);
    expect(unavailableNotice('missing', 'a.chalk')).toBe(
      "Can't find a.chalk right now. Chalkbond keeps your drawing.",
    );
    await f.windowFocused();
    await f.settleIdle();
    expect(texts(h)).toHaveLength(1);
    expect(h.argsOf('showFileError')).toEqual([]);
    expect(h.argsOf('bindTab').filter((b) => (b as { reason: string }).reason !== 'open')).toEqual(
      [],
    );
    expect(await f.marker('tab-1')).toBe('unavailable');
  });

  it('missing with unwritten changes: the box once, when the host is next idle', async () => {
    const h = createTabFlowHarness();
    let idle = false;
    const { f, ref } = await withFile(h, { hostIdle: () => idle });
    draw(h, 5);
    h.files.delete(ref.id);
    h.override('autoSave', async ({ tabId }): Promise<AutoSaveResponse> => ({
      tabId,
      ok: false,
      problem: 'missing',
    }));
    await f.write(TIMER);
    expect(tabOf(f, 'tab-1').available).toBe(false);
    expect(await f.marker('tab-1')).toBe('unavailable');
    await f.settleIdle();
    expect(h.names(['showFileError'])).toEqual([]);
    idle = true;
    await f.settleIdle();
    expect(h.calls.filter((c) => c.name === 'showFileError').map((c) => c.args)).toEqual([
      ['missing', 'a.chalk', 'auto-save'],
    ]);
    draw(h, 6);
    await f.write(TIMER); // a retry: still missing
    await f.settleIdle();
    expect(h.names(['showFileError'])).toHaveLength(1);
    expect(texts(h)).toEqual([]);
    // Unsaved now: an unavailable file tab with unwritten changes (F7).
    expect(await f.marker('tab-1')).toBe('unavailable');
    expect((await f.index()).tabs[0]).toMatchObject({ unsaved: true, warning: true });
  });

  it('a failed write with unwritten changes shows its own problem; unreadable shows write-failed', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    draw(h, 5);
    h.override('autoSave', async ({ tabId }): Promise<AutoSaveResponse> => ({
      tabId,
      ok: false,
      problem: 'busy',
    }));
    await f.write(TIMER);
    expect(h.calls.filter((c) => c.name === 'showFileError').map((c) => c.args)).toEqual([
      ['busy', 'a.chalk', 'auto-save'],
    ]);

    const h2 = createTabFlowHarness();
    const second = await withFile(h2);
    draw(h2, 5);
    h2.override('autoSave', async ({ tabId }): Promise<AutoSaveResponse> => ({
      tabId,
      ok: false,
      problem: 'unreadable',
    }));
    await second.f.write(TIMER);
    expect(h2.calls.filter((c) => c.name === 'showFileError').map((c) => c.args)).toEqual([
      ['write-failed', 'a.chalk', 'auto-save'],
    ]);
  });

  it('unreadable with nothing unwritten shows N-A7', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    await f.newTab();
    h.override('checkTabFile', async (tabId): Promise<CheckTabFileResponse> => ({
      tabId,
      written: h.written.get(tabId) ?? null,
      state: 'unreadable',
    }));
    await f.activate('tab-1');
    expect(texts(h)).toEqual([
      "Couldn't read a.chalk. Chalkbond keeps your drawing and will try again.",
    ]);
  });

  it('every check point retries; when the file is back with unwritten changes AS1 writes at once', async () => {
    const h = createTabFlowHarness();
    const { f, ref } = await withFile(h);
    const bytes = h.files.get(ref.id) as Uint8Array;
    draw(h, 5);
    h.files.delete(ref.id);
    h.override('autoSave', async ({ tabId }): Promise<AutoSaveResponse> => ({
      tabId,
      ok: false,
      problem: 'missing',
    }));
    await f.write(TIMER);
    expect(tabOf(f, 'tab-1').available).toBe(false);
    // The timer of the next change retries with a check, not a write.
    await f.write(TIMER);
    expect(h.argsOf('autoSave')).toHaveLength(1);
    expect(h.argsOf('checkTabFile')).toContain('tab-1');
    h.files.set(ref.id, bytes); // the USB stick is back
    h.override('autoSave', defaultAutoSave(h));
    await f.windowFocused();
    expect(tabOf(f, 'tab-1').available).toBe(true);
    expect(fileText(h, ref)).toBe(serialize(h.editor.getDoc()));
    expect((await f.facts('tab-1'))?.unwritten).toBe(false);
    expect(await f.marker('tab-1')).toBe('none');
  });

  it('item (5), renderer half: a record written before its file gives no false conflict after a restart', async () => {
    const h = createTabFlowHarness();
    const doc = withAtoms(4);
    const ref = h.file('n0.chalk', doc); // the file holds the in-flight text
    h.bind('t0', ref, await sha256(serialize(doc))); // AS5 promoted it to the written hash
    h.storeRecord({ id: 't0', kind: 'chalk', name: 'n0.chalk' }, stateWith(doc));
    const f = h.flows();
    await f.start({
      session: h.session([{ id: 't0', kind: 'chalk', name: 'n0.chalk' }], 't0'),
      open: null,
    });
    expect((await f.facts('t0'))?.unwritten).toBe(false);
    expect(h.argsOf('autoSave')).toEqual([]);
    expect(labels(f)).toEqual(['n0']);
    expect(h.notices).toEqual([]);
  });

  it('item (5): a record newer than its file is written after the restart (SS5)', async () => {
    const h = createTabFlowHarness();
    const old = withAtoms(2);
    const ref = h.file('n0.chalk', old);
    h.bind('t0', ref, await sha256(serialize(old)));
    const newer = withAtoms(5);
    h.storeRecord({ id: 't0', kind: 'chalk', name: 'n0.chalk' }, stateWith(newer));
    const f = h.flows();
    await f.start({
      session: h.session([{ id: 't0', kind: 'chalk', name: 'n0.chalk' }], 't0'),
      open: null,
    });
    expect(fileText(h, ref)).toBe(serialize(h.editor.getDoc()));
    expect(atoms(h.editor.getDoc())).toBe(5);
    expect((await f.facts('t0'))?.unwritten).toBe(false);
  });

  it('item (5): an outside edit with nothing unwritten after a restart is AS7(a), never a copy', async () => {
    const h = createTabFlowHarness();
    const mine = withAtoms(2);
    const ref = h.file('n0.chalk', mine);
    h.bind('t0', ref, await sha256(serialize(mine)));
    h.storeRecord({ id: 't0', kind: 'chalk', name: 'n0.chalk' }, stateWith(mine));
    const theirs = encodeUtf8(serialize(withAtoms(6)));
    changedOnce(h, theirs);
    const f = h.flows();
    await f.start({
      session: h.session([{ id: 't0', kind: 'chalk', name: 'n0.chalk' }], 't0'),
      open: null,
    });
    expect(labels(f)).toEqual(['n0']);
    expect(atoms(h.editor.getDoc())).toBe(6);
    expect(texts(h)).toEqual([outsideNotice('n0.chalk')]);
    expect(h.argsOf('bindTab')).toEqual([]);
  });

  it('item (6): unparsable bytes with nothing unwritten: AS6, still bound; it recovers when the file parses', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    await f.newTab();
    changedOnce(h, encodeUtf8('{ half a copy'));
    await f.activate('tab-1');
    expect(tabOf(f, 'tab-1').available).toBe(false);
    expect(tabOf(f, 'tab-1').kind).toBe('chalk');
    expect(texts(h)).toEqual([
      "Couldn't read a.chalk. Chalkbond keeps your drawing and will try again.",
    ]);
    expect(h.argsOf('bindTab')).toHaveLength(1); // the open only: nothing unbound
    expect(h.argsOf('showFileError')).toEqual([]);
    expect(atoms(h.editor.getDoc())).toBe(3);
    // The copy finished: the next check point opens it (AS7(a)).
    changedOnce(h, encodeUtf8(serialize(withAtoms(8))));
    await f.windowFocused();
    expect(tabOf(f, 'tab-1').available).toBe(true);
    expect(atoms(h.editor.getDoc())).toBe(8);
    expect(texts(h).at(-1)).toBe(outsideNotice('a.chalk'));
  });

  it('a window-focus check is only for the active file tab and is ignored while a flow runs', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    await f.windowFocused();
    expect(h.argsOf('checkTabFile')).toEqual([]);
    const held = h.hold('writeTabRecord');
    const adding = f.newTab();
    await held.reached;
    await f.windowFocused();
    held.release();
    await adding;
    expect(h.argsOf('checkTabFile')).toEqual([]);
  });
});

describe('AS7: changed outside', () => {
  it('(a) waits for idle after a window-focus check, then one undo step, N9, saved, N-A4', async () => {
    const h = createTabFlowHarness();
    let idle = true;
    const { f } = await withFile(h, { hostIdle: () => idle });
    const mine = h.editor.getDoc();
    idle = false;
    const theirs = withAtoms(6);
    changedOnce(h, encodeUtf8(serialize(theirs)));
    await f.windowFocused();
    expect(h.editor.getDoc()).toBe(mine);
    expect(f.state().meta['tab-1']?.outside).not.toBeNull();
    await f.settleIdle();
    expect(h.editor.getDoc()).toBe(mine);
    idle = true;
    await f.settleIdle();
    expect(atoms(h.editor.getDoc())).toBe(6);
    expect(h.editor.undoLabel()).toBe(OUTSIDE_CHANGE_LABEL);
    expect(OUTSIDE_CHANGE_LABEL).toBe('Changed outside Chalkbond');
    const hash = await sha256(serialize(h.editor.getDoc()));
    expect(h.argsOf('acceptOutsideChange')).toEqual([{ tabId: 'tab-1', written: hash }]);
    expect(f.state().meta['tab-1']).toMatchObject({ written: hash, outside: null });
    expect(h.editor.isDirty()).toBe(false);
    expect(texts(h)).toEqual([
      'a.chalk was changed outside Chalkbond. Press Ctrl+Z to see your earlier version.',
    ]);
    // Ctrl+Z gives her version back, which then has unwritten changes (AS1 writes it: her choice).
    h.editor.run('undo');
    expect(h.editor.getDoc()).toBe(mine);
    expect((await f.facts('tab-1'))?.unwritten).toBe(true);
  });

  it('(c) unwritten changes: her tab is kept "(your changes)", the changed file opens beside it', async () => {
    const h = createTabFlowHarness();
    const { f, ref } = await withFile(h);
    await f.newTab();
    await f.activate('tab-1');
    const mine = draw(h, 5);
    const theirs = withAtoms(7);
    h.files.set(ref.id, encodeUtf8(serialize(theirs))); // edited in another program
    changedOnce(h, encodeUtf8(serialize(theirs)));
    await f.windowFocused();
    expect(labels(f)).toEqual(['a (your changes)', 'a', 'Untitled']);
    const kept = tabOf(f, 'tab-1');
    expect([kept.kind, kept.name, kept.ref]).toEqual(['kept', 'a (your changes)', null]);
    expect(active(f)).toBe('tab-1');
    expect(h.editor.getDoc()).toBe(mine);
    const opened = f.state().list.tabs[1] as Tab;
    expect(opened).toMatchObject({ id: 'tab-3', kind: 'chalk', name: 'a.chalk', ref });
    expect(atoms(tabStateDoc(opened.state as EditorTabState))).toBe(7);
    const hash = await sha256(serialize(tabStateDoc(opened.state as EditorTabState)));
    expect(h.argsOf('bindTab').at(-1)).toEqual({
      tabId: 'tab-3',
      ref: null,
      reason: 'take-over',
      from: 'tab-1',
      written: hash,
    });
    expect(h.bindings.get('tab-3')).toBe(ref.id);
    expect(h.bindings.has('tab-1')).toBe(false);
    expect(h.calls.filter((c) => c.name === 'showFileError').map((c) => c.args)).toEqual([
      ['changed-outside', 'a.chalk', 'auto-save'],
    ]);
    expect(JSON.parse(h.records.get('tab-1') as string)).toMatchObject({
      kind: 'kept',
      name: 'a (your changes)',
    });
    expect(h.records.has('tab-3')).toBe(true);
    expect(await f.marker('tab-1')).toBe('dot');
    expect(await f.marker('tab-3')).toBe('none');
    expect((await f.index()).tabs.map((t) => t.kind)).toEqual(['kept', 'chalk', 'untitled']);
    // The file was never written over; her kept tab is never auto-saved.
    await f.write(TIMER);
    expect(h.argsOf('autoSave')).toEqual([]);
    expect(fileText(h, ref)).toBe(serialize(theirs));
    expect(suggestedSaveName(kept)).toBe('a (your changes).chalk');
  });

  it('(c) and the changed file does not open: unbound, no new tab, the unopenable box', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    draw(h, 5);
    changedOnce(h, encodeUtf8('{ broken'));
    await f.windowFocused();
    expect(labels(f)).toEqual(['a (your changes)']);
    expect(h.argsOf('bindTab').at(-1)).toEqual({ tabId: 'tab-1', ref: null, reason: 'unbind' });
    expect(h.calls.filter((c) => c.name === 'showFileError').map((c) => c.args)).toEqual([
      ['changed-outside-unopenable', 'a.chalk', 'auto-save'],
    ]);
  });

  it('(c) a refused take-over still keeps her tab and unbinds it', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    draw(h, 5);
    changedOnce(h, encodeUtf8(serialize(withAtoms(2))));
    h.override('bindTab', async (request) => {
      if (request.reason === 'take-over') return { ok: false, openIn: 'tab-9' };
      return { ok: true };
    });
    await f.windowFocused();
    expect(labels(f)).toEqual(['a (your changes)']);
    expect(h.argsOf('bindTab').map((b) => (b as { reason: string }).reason)).toEqual([
      'open',
      'take-over',
      'unbind',
    ]);
    expect(h.argsOf('showFileError').at(-1)).toBe('changed-outside-unopenable');
  });

  it('a `changed` answer to a write is AS7 too (a timer write with unwritten changes keeps hers)', async () => {
    const h = createTabFlowHarness();
    const { f, ref } = await withFile(h);
    const before = fileText(h, ref);
    draw(h, 5);
    const theirs = encodeUtf8(serialize(withAtoms(9)));
    h.override('autoSave', async ({ tabId }): Promise<AutoSaveResponse> => ({
      tabId,
      ok: false,
      problem: 'changed',
      bytes: theirs,
    }));
    await f.write(TIMER);
    expect(labels(f)).toEqual(['a (your changes)', 'a']);
    expect(fileText(h, ref)).toBe(before);
  });

  it('nothing outside: settleIdle does nothing', async () => {
    const h = createTabFlowHarness();
    const { f } = await withFile(h);
    const count = h.calls.length;
    await f.settleIdle();
    expect(h.calls.length).toBe(count);
  });
});

describe('SS11 through I14 wantBytes (TB18)', () => {
  it('a damaged record asks I14 for the bytes; a changed file is accepted by N9, not copied', async () => {
    const h = createTabFlowHarness();
    const old = withAtoms(2);
    const ref = h.file('n0.chalk', old);
    h.bind('t0', ref, await sha256(serialize(old)));
    h.records.set('t0', '{ broken');
    const theirs = withAtoms(5);
    h.override('checkTabFile', async (tabId, wantBytes) => {
      expect(wantBytes).toBe(true);
      return {
        tabId,
        written: h.written.get(tabId) ?? null,
        state: 'changed',
        bytes: encodeUtf8(serialize(theirs)),
      };
    });
    const f = h.flows();
    await f.start({
      session: h.session([{ id: 't0', kind: 'chalk', name: 'n0.chalk' }], 't0'),
      open: null,
    });
    expect(atoms(h.editor.getDoc())).toBe(5);
    expect(labels(f)).toEqual(['n0']);
    const hash = await sha256(serialize(h.editor.getDoc()));
    expect(h.argsOf('acceptOutsideChange')).toEqual([{ tabId: 't0', written: hash }]);
    expect((await f.facts('t0'))?.unwritten).toBe(false);
    expect(h.argsOf('autoSave')).toEqual([]);
    expect(h.notices).toEqual([]);
  });

  it('a readable record does not ask for the bytes', async () => {
    const h = createTabFlowHarness();
    const doc = withAtoms(2);
    const ref = h.file('n0.chalk', doc);
    h.bind('t0', ref, await sha256(serialize(doc)));
    h.storeRecord({ id: 't0', kind: 'chalk', name: 'n0.chalk' }, stateWith(doc));
    const f = h.flows();
    await f.start({
      session: h.session([{ id: 't0', kind: 'chalk', name: 'n0.chalk' }], 't0'),
      open: null,
    });
    expect(h.calls.filter((c) => c.name === 'checkTabFile').map((c) => c.args)).toEqual([
      ['t0', false],
    ]);
  });
});

/** The harness's own I13 again (after an override). */
function defaultAutoSave(h: TabFlowHarness) {
  return async ({ tabId, text }: { tabId: string; text: string }): Promise<AutoSaveResponse> => {
    const hash = await sha256(text);
    const refId = h.bindings.get(tabId);
    if (refId !== undefined) h.files.set(refId, encodeUtf8(text));
    h.written.set(tabId, hash);
    return { tabId, ok: true, sha256: hash };
  };
}

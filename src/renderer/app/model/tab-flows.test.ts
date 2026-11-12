// TB17: tab flows 1 (T7 new tab, T17 opening into tabs, T11 switch, T12 reopen, SS7 restore,
// SS11's renderer half) over the fake ports of `__fixtures__/tab-flows-ports.ts`.
import { describe, expect, it } from 'vitest';
import { addAtom, emptyDoc, serialize, type Doc } from '@core/doc-model';
import { exportSvg } from '@core/clipboard-export';
import {
  tabStateCanUndo,
  tabStateDirty,
  tabStateDoc,
  tabStateView,
  type EditorTabState,
} from '../../editor';
import type { FileDroppedResponse, FileRef, SessionIndexUpdate } from '../../../shared/ipc-types';
import {
  NOW,
  createTabFlowHarness,
  encodeUtf8,
  sha256,
  type TabFlowHarness,
} from './__fixtures__/tab-flows-ports';
import { DAMAGED_NOTICE, OPEN_QUEUE_LIMIT, type TabFlows } from './tab-flows';
import { activeTab, label } from './tabs';

const withAtoms = (n = 1): Doc => {
  let doc = emptyDoc(NOW);
  for (let i = 0; i < n; i++) doc = addAtom(doc, { element: 'C', x: i, y: 0 })[0];
  return doc;
};
const atoms = (doc: Doc): number => Object.keys(doc.atoms).length;

/** Draws on the active tab: one undo step, `n` atoms. */
function draw(h: TabFlowHarness, n = 1): Doc {
  const doc = withAtoms(n);
  h.editor.run({ type: 'replace-doc', doc, label: 'Draw' });
  return h.editor.getDoc();
}

const tabIds = (f: TabFlows): string[] => f.state().list.tabs.map((t) => t.id);
const active = (f: TabFlows): string => f.state().list.active;
const labels = (f: TabFlows): string[] => f.state().list.tabs.map((t) => label(t));

async function started(h: TabFlowHarness): Promise<TabFlows> {
  const f = h.flows();
  await f.start({ session: null, open: null });
  return f;
}

/** A state holding `doc` with one undo step (an earlier run's tab). */
function stateWith(doc: Doc): EditorTabState {
  const other = createTabFlowHarness();
  other.editor.run({ type: 'replace-doc', doc, label: 'Draw' });
  return other.editor.snapshotState();
}

const dropped = (name: string, answer: FileDroppedResponse) => ({
  name,
  resolve: async () => answer,
});

describe('T7 new tab', () => {
  it('always adds, also when the active tab is an empty Untitled', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    expect(labels(f)).toEqual(['Untitled']);
    await f.newTab();
    expect(labels(f)).toEqual(['Untitled', 'Untitled 2']);
    expect(active(f)).toBe('tab-2');
    expect(atoms(h.editor.getDoc())).toBe(0);
    // T11: the outgoing tab's record is written before the incoming state is put in.
    expect(h.names(['takeState', 'writeTabRecord', 'putState'])).toEqual([
      'putState',
      'takeState',
      'writeTabRecord',
      'putState',
    ]);
    expect(h.records.has('tab-1')).toBe(true);
  });

  it('the new tab is skeletal in the remembered style (T18)', async () => {
    const h = createTabFlowHarness();
    const f = h.flows({ newDrawingStyle: () => 'journal' });
    await f.start({ session: null, open: null });
    await f.newTab();
    expect(h.editor.getDoc().style.preset).toBe('journal');
    expect(h.editor.getDoc().style.formula).toBeUndefined();
  });
});

describe('T17 opening into tabs', () => {
  it('a path bound to a tab activates that tab and reads nothing (I1, focus-tab, I3)', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    await f.newTab();
    h.openDialogs.push({ focus: 'tab-1' });
    await f.open();
    expect(active(f)).toBe('tab-1');
    await f.focusTab('tab-2');
    expect(active(f)).toBe('tab-2');
    await f.drop([dropped('a.chalk', { ok: true, focus: 'tab-1' })]);
    expect(active(f)).toBe('tab-1');
    expect(h.names(['readFile', 'bindTab'])).toEqual([]);
  });

  it('a failed validation changes no tab and binds nothing', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h);
    const before = f.state().list;
    const bad = h.file('broken.chalk', encodeUtf8('{ not a drawing'));
    await f.openRef(bad);
    const missing: FileRef = { id: 'ref-gone', name: 'gone.chalk', kind: 'chalk' };
    await f.openRef(missing);
    const notChalk = h.file('notes.txt', withAtoms(1));
    await f.openRef(notChalk);
    expect(f.state().list).toBe(before);
    expect(h.argsOf('showFileError')).toEqual(['damaged', 'missing', 'unsupported']);
    expect(h.names(['bindTab', 'takeState'])).toEqual([]);
  });

  it('the empty untitled active tab takes the file and keeps its id', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    const doc = withAtoms(2);
    const ref = h.file('esterification.chalk', doc);
    await f.openRef(ref);
    expect(tabIds(f)).toEqual(['tab-1']);
    expect(labels(f)).toEqual(['esterification']);
    const tab = activeTab(f.state().list);
    expect(tab.kind).toBe('chalk');
    expect(tab.ref).toEqual(ref);
    expect(atoms(h.editor.getDoc())).toBe(2);
    // I12 `open` with the written hash = SHA-256 of serialize(drawing).
    const hash = await sha256(serialize(h.editor.getDoc()));
    expect(h.argsOf('bindTab')).toEqual([
      { tabId: 'tab-1', ref: ref.id, reason: 'open', written: hash },
    ]);
    expect(f.state().meta['tab-1']?.written).toBe(hash);
    expect(h.records.has('tab-1')).toBe(true);
    expect(h.names(['takeState'])).toEqual([]);
    // A file in serialize's exact form has no unwritten changes and shows nothing (T6).
    expect(await f.marker('tab-1')).toBe('none');
    expect((await f.facts('tab-1'))?.unwritten).toBe(false);
  });

  it('opens in a new tab at the end when the active tab has content; a picture is a picture tab', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h);
    const picture = h.file('ethanol.png', encodeUtf8('not a png'));
    await f.openRef(picture);
    expect(h.argsOf('showFileError')).toEqual(['damaged']);
    const chalk = h.file('acid.chalk', withAtoms(3));
    await f.openRef(chalk);
    expect(labels(f)).toEqual(['Untitled', 'acid']);
    expect(active(f)).toBe('tab-2');
    expect(atoms(h.editor.getDoc())).toBe(3);
    // The outgoing Untitled keeps its drawing in memory.
    expect(atoms(tabStateDoc(f.state().list.tabs[0]?.state as EditorTabState))).toBe(1);
    expect(h.records.has('tab-2')).toBe(true);
  });

  it('a picture tab is bound without a written hash', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    // An SVG carrying the drawing: the payload clipboard-export writes into <metadata>.
    const svg = exportSvg(withAtoms(1), null).svg;
    const ref = h.file('ethanol.svg', encodeUtf8(svg));
    await f.openRef(ref);
    const tab = activeTab(f.state().list);
    expect(tab.kind).toBe('picture');
    expect(label(tab)).toBe('ethanol.svg');
    expect(h.argsOf('bindTab')).toEqual([{ tabId: 'tab-1', ref: ref.id, reason: 'open' }]);
  });

  it('a bind answered `openIn` opens nothing and focuses that tab', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h);
    await f.newTab();
    draw(h);
    h.override('bindTab', async () => ({ ok: false, openIn: 'tab-1' }));
    await f.openRef(h.file('a.chalk', withAtoms(1)));
    expect(tabIds(f)).toEqual(['tab-1', 'tab-2']);
    expect(active(f)).toBe('tab-1');
  });

  it(`opens wait in a queue of at most ${OPEN_QUEUE_LIMIT}, first in first out`, async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    const first = h.file('first.chalk', withAtoms(1));
    const refs = Array.from({ length: 25 }, (_, i) => h.file(`f${i + 1}.chalk`, withAtoms(1)));
    const held = h.hold('readFile');
    const running = f.openRef(first);
    await held.reached;
    expect(f.busy()).toBe(true);
    for (const ref of refs) void f.openRef(ref);
    held.release();
    await running;
    const read = h.argsOf('readFile') as FileRef[];
    expect(read.map((r) => r.name)).toEqual([
      'first.chalk',
      ...refs.slice(0, OPEN_QUEUE_LIMIT).map((r) => r.name),
    ]);
    expect(labels(f)).toEqual(['first', ...refs.slice(0, 20).map((r) => r.name.slice(0, -6))]);
    expect(h.errors.filter((e) => e.includes('queue is full'))).toHaveLength(5);
    expect(f.busy()).toBe(false);
  });

  it('a drop opens every file with an Open extension, each in its own tab, in order', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    const a = h.file('a.chalk', withAtoms(1));
    const b = h.file('b.chalk', withAtoms(2));
    let asked = 0;
    const ask = (ref: FileRef) => ({
      name: ref.name,
      resolve: async (): Promise<FileDroppedResponse> => {
        asked++;
        return { ok: true, ref };
      },
    });
    await f.drop([
      ask(a),
      { name: 'notes.txt', resolve: async () => ({ ok: true, ref: a }) },
      ask(b),
    ]);
    expect(asked).toBe(2);
    expect(labels(f)).toEqual(['a', 'b']);
    expect(active(f)).toBe(f.state().list.tabs[1]?.id);
  });

  it('a drop with no Open file sends the first one; its problem is the F14 box', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    await f.drop([
      dropped('notes.txt', { ok: false, problem: 'unsupported', name: 'notes.txt' }),
      dropped('more.txt', { ok: false, problem: 'unsupported', name: 'more.txt' }),
    ]);
    expect(h.calls.filter((c) => c.name === 'showFileError').map((c) => c.args)).toEqual([
      ['unsupported', 'notes.txt'],
    ]);
  });

  it('Open cancelled does nothing', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    await f.open();
    expect(labels(f)).toEqual(['Untitled']);
  });
});

describe('T11 switch', () => {
  it('writes the outgoing record before the incoming state is put in', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h, 2);
    await f.newTab();
    h.calls.length = 0;
    await f.activate('tab-1');
    expect(
      h.names(['finishEditing', 'takeState', 'writeTabRecord', 'putState', 'updateSessionIndex']),
    ).toEqual(['finishEditing', 'takeState', 'writeTabRecord', 'putState', 'updateSessionIndex']);
    expect((h.argsOf('writeTabRecord')[0] as { tabId: string }).tabId).toBe('tab-2');
    expect(atoms(h.editor.getDoc())).toBe(2);
    expect(tabStateCanUndo(h.editor.snapshotState())).toBe(true); // its history came back
    const index = h.indexes.at(-1) as SessionIndexUpdate;
    expect(index.active).toBe('tab-1');
    expect(index.tabs.map((t) => [t.id, t.unsaved])).toEqual([
      ['tab-1', true],
      ['tab-2', false],
    ]);
  });

  it('ignores input while in flight; the outgoing drawing stays until the incoming is in place', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    await f.newTab();
    await f.newTab();
    draw(h, 4);
    const outgoing = h.editor.getDoc();
    const held = h.hold('writeTabRecord');
    const switching = f.activate('tab-1');
    await held.reached;
    expect(f.busy()).toBe(true);
    expect(h.editor.getDoc()).toBe(outgoing);
    expect(active(f)).toBe('tab-3');
    await f.activate('tab-2');
    await f.newTab();
    await f.reopen();
    await f.close('tab-2');
    held.release();
    await switching;
    expect(active(f)).toBe('tab-1');
    expect(tabIds(f)).toEqual(['tab-1', 'tab-2', 'tab-3']);
    expect(f.busy()).toBe(false);
  });

  it('a file tab with unwritten changes is written (AS1, TB18) before the switch; one without is not', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    await f.openRef(h.file('a.chalk', withAtoms(1)));
    await f.newTab();
    await f.activate('tab-1');
    expect(h.argsOf('autoSave')).toEqual([]);
    const doc = draw(h, 3);
    await f.activate('tab-2');
    expect(h.argsOf('autoSave')).toEqual([{ tabId: 'tab-1', text: serialize(doc) }]);
    expect(h.names(['writeTabRecord', 'autoSave', 'putState']).slice(-3)).toEqual([
      'writeTabRecord',
      'autoSave',
      'putState',
    ]);
    // AS3: marked saved while still active, so the stored state is clean.
    expect(tabStateDirty(f.state().list.tabs[0]?.state as EditorTabState)).toBe(false);
  });

  it('a file tab is checked (AS5) when it becomes active; missing makes it unavailable', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    const ref = h.file('a.chalk', withAtoms(1));
    await f.openRef(ref);
    await f.newTab();
    h.files.delete(ref.id);
    await f.activate('tab-1');
    expect(h.argsOf('checkTabFile')).toEqual(['tab-1']);
    expect(activeTab(f.state().list).available).toBe(false);
    expect(await f.marker('tab-1')).toBe('unavailable');
  });

  it('a changed file is kept for AS7 while the host is busy; a failed check makes the tab unavailable', async () => {
    const h = createTabFlowHarness();
    const f = h.flows({ hostIdle: () => false });
    await f.start({ session: null, open: null });
    await f.openRef(h.file('a.chalk', withAtoms(1)));
    await f.newTab();
    const bytes = encodeUtf8(serialize(withAtoms(5)));
    h.override('checkTabFile', async (tabId) => ({ tabId, written: 'w', state: 'changed', bytes }));
    await f.activate('tab-1');
    expect(f.state().meta['tab-1']?.outside).toBe(bytes);
    expect(f.state().meta['tab-1']?.written).toBe('w');
    expect(activeTab(f.state().list).available).toBe(true);
    await f.activate('tab-2');
    h.override('checkTabFile', async () => {
      throw new Error('refused');
    });
    await f.activate('tab-1');
    expect(activeTab(f.state().list).available).toBe(false);
  });

  it('activating the active tab or an unknown tab does nothing', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    h.calls.length = 0;
    await f.activate('tab-1');
    await f.activate('nope');
    expect(h.names(['takeState', 'putState'])).toEqual([]);
  });
});

describe('SS6 (c): the per-tab record flag', () => {
  it('a failed record write sets recordFailed; the next success clears it', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h);
    h.override('writeTabRecord', async () => ({ ok: false, problem: 'disk-full' }));
    await f.newTab();
    expect(f.state().meta['tab-1']?.recordFailed).toBe(true);
    expect(await f.marker('tab-1')).toBe('unkept');
    expect((h.indexes.at(-1) as SessionIndexUpdate).tabs[0]?.warning).toBe(true);
    h.override('writeTabRecord', async () => {
      throw new Error('gone');
    });
    await f.activate('tab-1');
    expect(f.state().meta['tab-2']?.recordFailed).toBe(true);
    h.override('writeTabRecord', async () => ({ ok: true }));
    await f.activate('tab-2');
    expect(f.state().meta['tab-1']?.recordFailed).toBe(false);
    expect(await f.marker('tab-1')).toBe('dot');
  });
});

describe('T12 reopen', () => {
  it('item (A): a fresh id, its record written at once, and it survives a restart after the old id was discarded', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h, 2);
    await f.newTab();
    await f.close('tab-1');
    expect(tabIds(f)).toEqual(['tab-2']);
    expect((h.indexes.at(-1) as SessionIndexUpdate).discarded).toEqual(['tab-1']);
    h.calls.length = 0;
    await f.reopen();
    expect(tabIds(f)).toEqual(['tab-3', 'tab-2']);
    expect(active(f)).toBe('tab-3');
    expect(labels(f)).toEqual(['Untitled', 'Untitled 2']);
    // The record under the fresh id is written before the switch takes the outgoing tab out.
    const written = h.argsOf('writeTabRecord') as { tabId: string }[];
    expect(written[0]?.tabId).toBe('tab-3');
    expect(h.names(['writeTabRecord', 'takeState'])[0]).toBe('writeTabRecord');
    expect(atoms(h.editor.getDoc())).toBe(2);
    expect(tabStateCanUndo(h.editor.snapshotState())).toBe(true);
    const index = h.indexes.at(-1) as SessionIndexUpdate;
    expect(index.tabs.map((t) => t.id)).toEqual(['tab-3', 'tab-2']);
    expect(index.discarded).toEqual(['tab-1']);

    // Main deletes the discarded record; a restart restores the reopened tab from its own record.
    h.records.delete('tab-1');
    const again = createTabFlowHarness({ records: h.records, idPrefix: 'run2' });
    const g = again.flows();
    await g.start({
      session: { tabs: index.tabs, active: index.active },
      open: null,
    });
    expect(tabIds(g)).toEqual(['tab-3', 'tab-2']);
    expect(atoms(again.editor.getDoc())).toBe(2);
    expect(again.argsOf('readTabRecord')).toEqual(['tab-3']);
  });

  it('a file tab is rebound with I12 reopen and re-checked; a file open elsewhere focuses that tab', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h);
    const ref = h.file('a.chalk', withAtoms(1));
    await f.openRef(ref);
    await f.newTab();
    await f.close('tab-2');
    h.calls.length = 0;
    await f.reopen();
    expect(h.argsOf('bindTab')).toEqual([
      { tabId: 'tab-4', ref: null, reason: 'reopen', from: 'tab-2' },
    ]);
    expect(h.argsOf('checkTabFile')).toEqual(['tab-4']);
    expect(labels(f)).toEqual(['Untitled', 'a', 'Untitled 2']);
    expect(active(f)).toBe('tab-4');

    await f.close('tab-4');
    await f.openRef(ref); // opened again meanwhile: a new tab holds the file
    const holder = active(f);
    await f.activate('tab-1');
    h.calls.length = 0;
    await f.reopen();
    expect(active(f)).toBe(holder);
    expect(f.state().list.closed).toHaveLength(0);
    expect(h.records.has('tab-6')).toBe(false);
    expect(h.argsOf('writeTabRecord').map((r) => (r as { tabId: string }).tabId)).toEqual([
      'tab-1',
    ]);
  });

  it('the list knows the file (same ref): that tab is focused without asking main', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h);
    const ref = h.file('a.chalk', withAtoms(1));
    await f.openRef(ref);
    await f.close('tab-2');
    // A second binding of the same ref (the fake accepts it: the discarded tab binds nothing).
    await f.openRef(ref);
    h.calls.length = 0;
    await f.activate('tab-1');
    await f.reopen();
    expect(active(f)).toBe('tab-3');
    expect(h.names(['bindTab'])).toEqual([]);
  });

  it('main answering `openIn` to I12 reopen focuses that tab, drops the entry and writes no record', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h);
    await f.openRef(h.file('a.chalk', withAtoms(1)));
    await f.close('tab-2');
    h.override('bindTab', async () => ({ ok: false, openIn: 'tab-1' }));
    h.calls.length = 0;
    await f.reopen();
    expect(tabIds(f)).toEqual(['tab-1']);
    expect(f.state().list.closed).toHaveLength(0);
    expect(h.names(['writeTabRecord', 'takeState', 'putState'])).toEqual([]);
  });

  it('nothing to reopen does nothing', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    await f.reopen();
    expect(tabIds(f)).toEqual(['tab-1']);
  });
});

describe('T8 list part (close without a question)', () => {
  it('closing the last empty Untitled does nothing (R39); closing an inactive tab keeps the active one', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    await f.close('tab-1');
    expect(tabIds(f)).toEqual(['tab-1']);
    await f.close('nope');
    await f.newTab();
    await f.close('tab-1');
    expect(tabIds(f)).toEqual(['tab-2']);
    expect(active(f)).toBe('tab-2');
  });

  it('closing the active tab puts in its neighbour, loading it from the store when needed', async () => {
    const h = createTabFlowHarness();
    const b = stateWith(withAtoms(3));
    h.storeRecord({ id: 'b', kind: 'untitled', name: 'Untitled 2' }, b);
    h.storeRecord({ id: 'a', kind: 'untitled', name: 'Untitled' }, stateWith(withAtoms(1)));
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
    await f.close('a');
    expect(tabIds(f)).toEqual(['b']);
    expect(atoms(h.editor.getDoc())).toBe(3);
    expect(h.argsOf('readTabRecord')).toEqual(['a', 'b']);
  });

  it('a neighbour that cannot be loaded is lost (SS11) and the next one is put in', async () => {
    const h = createTabFlowHarness();
    h.storeRecord({ id: 'a', kind: 'untitled', name: 'Untitled' }, stateWith(withAtoms(1)));
    h.records.set('b', '{ broken');
    h.storeRecord({ id: 'c', kind: 'untitled', name: 'Untitled 3' }, stateWith(withAtoms(5)));
    const f = h.flows();
    await f.start({
      session: h.session(
        [
          { id: 'a', kind: 'untitled', name: 'Untitled', unsaved: true },
          { id: 'b', kind: 'kept', name: 'x (your changes)', unsaved: true },
          { id: 'c', kind: 'untitled', name: 'Untitled 3', unsaved: true },
        ],
        'a',
      ),
      open: null,
    });
    await f.close('a');
    expect(tabIds(f)).toEqual(['c']);
    expect(atoms(h.editor.getDoc())).toBe(5);
    expect(h.damaged).toEqual(['b']);
  });
});

describe('SS7 restore', () => {
  it('no index and no records: one empty Untitled, no record read', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    expect(labels(f)).toEqual(['Untitled']);
    expect(atoms(h.editor.getDoc())).toBe(0);
    expect(h.names(['readTabRecord'])).toEqual([]);
    expect(h.names(['putState'])).toEqual(['putState']);
  });

  it('SS8: the strip at once, only the active tab read before the canvas is usable', async () => {
    const h = createTabFlowHarness();
    h.storeRecord({ id: 'b', kind: 'untitled', name: 'Untitled 2' }, stateWith(withAtoms(2)));
    const f = h.flows();
    const held = h.hold('readTabRecord');
    const starting = f.start({
      session: h.session(
        [
          { id: 'a', kind: 'untitled', name: 'Untitled', unsaved: true },
          { id: 'b', kind: 'untitled', name: 'Untitled 2', unsaved: true },
          { id: 'c', kind: 'kept', name: 'acid (your changes)', unsaved: true },
        ],
        'b',
      ),
      open: null,
    });
    await held.reached;
    expect(labels(f)).toEqual(['Untitled', 'Untitled 2', 'acid (your changes)']);
    expect(f.busy()).toBe(true);
    expect(h.changes()).toBeGreaterThan(0);
    expect(h.names(['putState'])).toEqual([]);
    held.release();
    await starting;
    expect(h.argsOf('readTabRecord')).toEqual(['b']);
    expect(atoms(h.editor.getDoc())).toBe(2);
    expect(active(f)).toBe('b');
  });

  it('item (B): an unloaded Untitled with content and an edited picture tab show their dot from the index', async () => {
    // First run: an Untitled with content and an edited picture tab; the index stores their flags.
    const h = createTabFlowHarness();
    const f = await started(h);
    draw(h);
    const svg = exportSvg(withAtoms(1), null).svg;
    await f.openRef(h.file('ethanol.svg', encodeUtf8(svg)));
    draw(h, 4);
    await f.newTab();
    const index = await f.index();
    expect(index.tabs.map((t) => [t.kind, t.unsaved, t.warning])).toEqual([
      ['untitled', true, false],
      ['picture', true, false],
      ['untitled', false, false],
    ]);

    // Restart with the third (empty) tab active: the other two are not loaded but show the dot.
    const again = createTabFlowHarness({ records: h.records, files: h.files, idPrefix: 'run2' });
    const g = again.flows();
    await g.start({ session: { tabs: index.tabs, active: 'tab-3' }, open: null });
    expect(again.argsOf('readTabRecord')).toEqual(['tab-3']);
    expect(await g.facts('tab-1')).toBeNull();
    expect(await g.marker('tab-1')).toBe('dot');
    expect(await g.marker('tab-2')).toBe('dot');
    expect(await g.marker('tab-3')).toBe('none');
    // The next index keeps the stored flags and views of the unloaded tabs.
    const next = await g.index();
    expect(next.tabs.map((t) => t.unsaved)).toEqual([true, true, false]);
    expect(next.tabs[0]?.view).toEqual(index.tabs[0]?.view);
    // Its first activation reads it: the picture is edited (dirty), so it stays unsaved.
    await g.activate('tab-2');
    expect(again.argsOf('readTabRecord')).toEqual(['tab-3', 'tab-2']);
    expect(atoms(again.editor.getDoc())).toBe(4);
    expect(tabStateDirty(again.editor.snapshotState())).toBe(true);
    expect(await g.marker('tab-2')).toBe('dot');
  });

  it("the index's view is the restored view; a null view is V2's default", async () => {
    const h = createTabFlowHarness();
    const doc = withAtoms(2);
    h.storeRecord({ id: 'a', kind: 'untitled', name: 'Untitled' }, stateWith(doc));
    h.storeRecord({ id: 'b', kind: 'untitled', name: 'Untitled 2' }, stateWith(doc));
    const view = { zoom: 2, centre: { x: 1.5, y: -0.5 } };
    const f = h.flows();
    await f.start({
      session: h.session(
        [
          { id: 'a', kind: 'untitled', name: 'Untitled', unsaved: true, view },
          { id: 'b', kind: 'untitled', name: 'Untitled 2', unsaved: true, view: null },
        ],
        'a',
      ),
      open: null,
    });
    const restored = tabStateView(h.editor.snapshotState());
    expect(restored.zoom).toBe(2);
    expect(restored.centre.x).toBeCloseTo(1.5, 9);
    await f.activate('b');
    const fitted = tabStateView(h.editor.snapshotState());
    h.editor.putState(h.editor.newState(h.editor.getDoc())); // V2 on the same canvas
    expect(fitted).toEqual(tabStateView(h.editor.snapshotState()));
    expect(fitted).not.toEqual(view);
  });

  it('a restored file tab compares its drawing with the written hash I14 returns', async () => {
    const h = createTabFlowHarness();
    const doc = withAtoms(2);
    const ref = h.file('a.chalk', doc);
    const state = stateWith(doc);
    h.storeRecord({ id: 'a', kind: 'chalk', name: 'a.chalk' }, state);
    h.storeRecord({ id: 'b', kind: 'chalk', name: 'b.chalk' }, state);
    h.bind('a', ref, await sha256(serialize(tabStateDoc(state))));
    h.bind('b', h.file('b.chalk', withAtoms(1)), 'older');
    const f = h.flows();
    await f.start({
      session: h.session(
        [
          { id: 'a', kind: 'chalk', name: 'a.chalk' },
          { id: 'b', kind: 'chalk', name: 'b.chalk' },
        ],
        'a',
      ),
      open: null,
    });
    expect(h.argsOf('checkTabFile')).toEqual(['a']);
    expect(tabStateDirty(h.editor.snapshotState())).toBe(false);
    expect((await f.facts('a'))?.unwritten).toBe(false);
    expect(h.argsOf('autoSave')).toEqual([]);
    await f.activate('b');
    // b's drawing differs from the written hash I14 returned: unwritten (pending, not unsaved, F7),
    // so AS1 writes it at once (TB18; SS5: a record newer than its file).
    expect(h.argsOf('autoSave')).toEqual([{ tabId: 'b', text: serialize(tabStateDoc(state)) }]);
    expect((await f.facts('b'))?.unwritten).toBe(false);
    expect(await f.marker('b')).toBe('none');
  });

  it("I7's open runs after the restore, before the opens queued meanwhile", async () => {
    const h = createTabFlowHarness();
    h.storeRecord({ id: 'a', kind: 'untitled', name: 'Untitled' }, stateWith(withAtoms(1)));
    const launch = h.file('launch.chalk', withAtoms(1));
    const later = h.file('later.chalk', withAtoms(1));
    const f = h.flows();
    const held = h.hold('readTabRecord');
    const starting = f.start({
      session: h.session([{ id: 'a', kind: 'untitled', name: 'Untitled', unsaved: true }], 'a'),
      open: launch,
    });
    await held.reached;
    void f.openRef(later);
    held.release();
    await starting;
    expect((h.argsOf('readFile') as FileRef[]).map((r) => r.name)).toEqual([
      'launch.chalk',
      'later.chalk',
    ]);
    expect(labels(f)).toEqual(['Untitled', 'launch', 'later']);
  });

  it("I7's `{ focus }` activates that tab", async () => {
    const h = createTabFlowHarness();
    h.storeRecord({ id: 'a', kind: 'untitled', name: 'Untitled' }, stateWith(withAtoms(1)));
    h.storeRecord({ id: 'b', kind: 'untitled', name: 'Untitled 2' }, stateWith(withAtoms(3)));
    const f = h.flows();
    await f.start({
      session: h.session(
        [
          { id: 'a', kind: 'untitled', name: 'Untitled', unsaved: true },
          { id: 'b', kind: 'untitled', name: 'Untitled 2', unsaved: true },
        ],
        'a',
      ),
      open: { focus: 'b' },
    });
    expect(active(f)).toBe('b');
    expect(atoms(h.editor.getDoc())).toBe(3);
  });
});

describe("SS11's renderer half", () => {
  const session = (
    h: TabFlowHarness,
    kinds: readonly ('untitled' | 'chalk' | 'picture' | 'kept')[],
  ) =>
    h.session(
      kinds.map((kind, i) => ({ id: `t${i}`, kind, name: `n${i}.chalk`, unsaved: true })),
      't0',
    );

  it('a record that does not parse is sent to damaged/ (N10); an untitled tab is lost with N-A5', async () => {
    const h = createTabFlowHarness();
    h.records.set('t0', '{"format":"chalkbond-tab"}');
    h.storeRecord({ id: 't1', kind: 'untitled', name: 'Untitled 2' }, stateWith(withAtoms(2)));
    const f = h.flows();
    await f.start({ session: session(h, ['untitled', 'untitled']), open: null });
    expect(h.damaged).toEqual(['t0']);
    expect(h.notices).toEqual([{ kind: 'error', text: DAMAGED_NOTICE }]);
    expect(tabIds(f)).toEqual(['t1']);
    expect(atoms(h.editor.getDoc())).toBe(2);
    // A lost tab is not discarded: its record is moved aside, never deleted.
    expect((await f.index()).discarded).toEqual([]);
  });

  it('a damaged record on first activation: the outgoing tab stays and the tab is lost', async () => {
    const h = createTabFlowHarness();
    h.storeRecord({ id: 't0', kind: 'untitled', name: 'Untitled' }, stateWith(withAtoms(1)));
    h.records.set('t1', 'not json');
    const f = h.flows();
    await f.start({ session: session(h, ['untitled', 'picture']), open: null });
    await f.activate('t1');
    expect(h.damaged).toEqual(['t1']);
    expect(tabIds(f)).toEqual(['t0']);
    expect(active(f)).toBe('t0');
    expect(atoms(h.editor.getDoc())).toBe(1);
    expect(h.notices.map((n) => n.text)).toEqual([DAMAGED_NOTICE]);
  });

  it('a file tab whose record is damaged opens from its file (I14 wantBytes), history lost', async () => {
    const h = createTabFlowHarness();
    const doc = withAtoms(3);
    const ref = h.file('n0.chalk', doc);
    h.bind('t0', ref, await sha256(serialize(doc)));
    h.records.set('t0', '{ broken');
    const f = h.flows();
    await f.start({ session: session(h, ['chalk']), open: null });
    expect(h.damaged).toEqual(['t0']);
    expect(h.notices).toEqual([]);
    expect(atoms(h.editor.getDoc())).toBe(3);
    expect(tabStateCanUndo(h.editor.snapshotState())).toBe(false);
    expect((await f.facts('t0'))?.unwritten).toBe(false);
    expect(h.calls.filter((c) => c.name === 'checkTabFile').map((c) => c.args)).toEqual([
      ['t0', true],
    ]);
  });

  it('a file tab whose record and file are both unreadable is lost; every tab lost leaves one Untitled', async () => {
    const h = createTabFlowHarness();
    h.records.set('t0', '{ broken');
    h.bind('t0', { id: 'ref-gone', name: 'n0.chalk', kind: 'chalk' }, null);
    h.records.set('t1', '{ broken');
    const f = h.flows();
    await f.start({ session: session(h, ['chalk', 'kept']), open: null });
    expect(labels(f)).toEqual(['Untitled']);
    expect(h.notices).toHaveLength(2);
    expect(atoms(h.editor.getDoc())).toBe(0);
  });

  it('a check that throws or gives no bytes, or a file that does not parse, loses the file tab', async () => {
    const h = createTabFlowHarness();
    h.records.set('t0', '{ broken');
    h.records.set('t1', '{ broken');
    h.records.set('t2', '{ broken');
    h.bind('t0', h.file('n0.chalk', withAtoms(1)), null);
    h.bind('t1', h.file('n1.chalk', encodeUtf8('{ not chalk')), null);
    h.bind('t2', h.file('n2.chalk', withAtoms(1)), null);
    h.override('checkTabFile', async (tabId, wantBytes) => {
      if (tabId === 't0') throw new Error('refused');
      if (tabId === 't2') return { tabId, written: null, state: 'same' };
      expect(wantBytes).toBe(true);
      return { tabId, written: null, state: 'same', bytes: encodeUtf8('{ not chalk') };
    });
    const f = h.flows();
    await f.start({ session: session(h, ['chalk', 'chalk', 'chalk']), open: null });
    expect(labels(f)).toEqual(['Untitled']);
    expect(h.notices).toHaveLength(3);
  });

  it('a missing record: an empty Untitled opens empty, a tab that had content is lost', async () => {
    const h = createTabFlowHarness();
    const f = h.flows();
    await f.start({
      session: h.session(
        [
          { id: 'a', kind: 'untitled', name: 'Untitled' },
          { id: 'b', kind: 'untitled', name: 'Untitled 2', unsaved: true },
        ],
        'a',
      ),
      open: null,
    });
    expect(tabIds(f)).toEqual(['a', 'b']);
    expect(h.notices).toEqual([]);
    await f.activate('b');
    expect(tabIds(f)).toEqual(['a']);
    expect(h.notices.map((n) => n.text)).toEqual([DAMAGED_NOTICE]);
    expect(h.damaged).toEqual([]);
  });

  it('a record read that throws is unreadable: the tab is lost but nothing is moved', async () => {
    const h = createTabFlowHarness();
    h.override('readTabRecord', async () => {
      throw new Error('io');
    });
    const f = h.flows();
    await f.start({ session: session(h, ['kept']), open: null });
    expect(labels(f)).toEqual(['Untitled']);
    expect(h.damaged).toEqual([]);
  });

  it('an orphan (main lists it as kept) opens as a kept tab', async () => {
    const h = createTabFlowHarness();
    h.storeRecord({ id: 'o', kind: 'untitled', name: 'Untitled' }, stateWith(withAtoms(2)));
    const f = h.flows();
    await f.start({
      session: h.session([{ id: 'o', kind: 'kept', name: 'Untitled', unsaved: true }], 'o'),
      open: null,
    });
    expect(activeTab(f.state().list).kind).toBe('kept');
    expect(atoms(h.editor.getDoc())).toBe(2);
    expect(await f.marker('o')).toBe('dot');
  });
});

describe('robustness', () => {
  it('a flow that throws is logged and the flag is cleared', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    h.override('bindTab', async () => {
      throw new Error('refused');
    });
    await f.openRef(h.file('a.chalk', withAtoms(1)));
    expect(h.errors.some((e) => e.startsWith('Tab flow failed'))).toBe(true);
    expect(f.busy()).toBe(false);
    expect(labels(f)).toEqual(['Untitled']);
  });

  it('facts and marker of an unknown tab', async () => {
    const h = createTabFlowHarness();
    const f = await started(h);
    expect(await f.facts('nope')).toBeNull();
    expect(await f.marker('nope')).toBe('none');
  });
});

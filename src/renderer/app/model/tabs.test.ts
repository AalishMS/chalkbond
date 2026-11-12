// TB14: the tab list model (T1, T3, T4, T7, T8, T11, T12, T13, T17, T18, R39), run against the real
// editor controller for the opaque `EditorTabState`.
import { describe, expect, it } from 'vitest';
import { addAtom, emptyDoc, type Doc } from '@core/doc-model';
import { createEditorController, tabStateDoc, type EditorTabState } from '../../editor';
import type { FileRef } from '../../../shared/ipc-types';
import {
  REOPEN_LIMIT,
  activate,
  activeTab,
  byNumber,
  canOpenInto,
  clearDiscarded,
  close,
  createTabs,
  findTab,
  freeUntitledName,
  indexOfTab,
  initialTabs,
  keptName,
  label,
  last,
  markKept,
  move,
  newUntitled,
  next,
  open,
  openInto,
  previous,
  reopen,
  update,
  type Tab,
  type TabList,
  type TabPorts,
} from './tabs';

const NOW = '2026-11-12T09:00:00.000Z';
const controller = createEditorController({ clock: () => NOW });

/** Deep-freezes what the model must not touch (the editor's opaque states are left alone). */
function freeze(list: TabList): TabList {
  Object.freeze(list.tabs);
  Object.freeze(list.closed);
  Object.freeze(list.discarded);
  for (const t of list.tabs) Object.freeze(t);
  for (const c of list.closed) Object.freeze(c);
  return Object.freeze(list);
}

let counter = 0;
const ports = (): TabPorts => ({
  newId: () => `id-${++counter}`,
  newState: (doc) => controller.newState(doc),
  clock: () => NOW,
});

const withAtom = (): Doc => addAtom(emptyDoc(NOW), { element: 'C', x: 0, y: 0 })[0];

/** A state whose drawing is empty but that has one undo step (a preset switch). */
function emptyWithUndo(): EditorTabState {
  const c = createEditorController({ clock: () => NOW });
  c.run({ type: 'set-preset', preset: 'journal' });
  return c.takeState();
}

/** A state with an empty drawing and one redo step (an atom added, then undone). */
function emptyWithRedo(): EditorTabState {
  const c = createEditorController({ clock: () => NOW, doc: withAtom() });
  c.run({ type: 'set-preset', preset: 'journal' });
  c.run('undo');
  return c.takeState();
}

/** What the editor makes for `doc`: a new history, no undo or redo step. */
const fresh = (doc: Doc = emptyDoc(NOW)): EditorTabState => controller.newState(doc);

const ref = (id: string, name = `${id}.chalk`, kind: FileRef['kind'] = 'chalk'): FileRef => ({
  id,
  name,
  kind,
});

const tab = (id: string, extra: Partial<Tab> = {}): Tab => ({
  id,
  kind: 'untitled',
  name: id,
  ref: null,
  available: true,
  state: fresh(),
  ...extra,
});

const ids = (list: TabList): string[] => list.tabs.map((t) => t.id);
const names = (list: TabList): string[] => list.tabs.map((t) => t.name);

/** A list of file tabs a, b, c ... with `active` active. */
function fileList(idList: string[], active = idList[0]): TabList {
  return freeze(
    createTabs(
      idList.map((id) => tab(id, { kind: 'chalk', name: `${id}.chalk`, ref: ref(id) })),
      active,
    ),
  );
}

const STYLE = 'slides' as const;

describe('createTabs and reading', () => {
  it('is never empty', () => {
    expect(() => createTabs([])).toThrow();
  });

  it('activates the given tab, else the first', () => {
    const tabs = [tab('a'), tab('b')];
    expect(createTabs(tabs, 'b').active).toBe('b');
    expect(createTabs(tabs, 'zzz').active).toBe('a');
    expect(createTabs(tabs).active).toBe('a');
  });

  it('reads the active tab and finds tabs', () => {
    const list = fileList(['a', 'b'], 'b');
    expect(activeTab(list).id).toBe('b');
    expect(indexOfTab(list, 'b')).toBe(1);
    expect(indexOfTab(list, 'x')).toBe(-1);
    expect(findTab(list, 'a')?.id).toBe('a');
    expect(findTab(list, 'x')).toBeUndefined();
  });

  it('initialTabs holds one empty Untitled in the given style (T18)', () => {
    const list = initialTabs(ports(), 'journal');
    expect(list.tabs).toHaveLength(1);
    expect(list.tabs[0]).toMatchObject({ kind: 'untitled', name: 'Untitled', ref: null });
    const doc = tabStateDoc(activeTab(list).state as EditorTabState);
    expect(doc.style.preset).toBe('journal');
    expect(doc.style.formula).toBeUndefined();
  });
});

describe('T4 untitled names', () => {
  it('Untitled counts as 1, then the smallest free number', () => {
    expect(freeUntitledName([])).toBe('Untitled');
    expect(freeUntitledName([{ name: 'Untitled' }])).toBe('Untitled 2');
    expect(freeUntitledName([{ name: 'Untitled' }, { name: 'Untitled 2' }])).toBe('Untitled 3');
    expect(freeUntitledName([{ name: 'Untitled 2' }])).toBe('Untitled');
  });

  it('ignores names that only look similar', () => {
    expect(
      freeUntitledName([{ name: 'Untitled.chalk' }, { name: 'Untitled 2 (your changes)' }]),
    ).toBe('Untitled');
  });

  it('a gap is filled: close 2 of 1, 2, 3, then new gives 2', () => {
    let list = initialTabs(ports(), STYLE);
    list = newUntitled(list, ports(), STYLE);
    list = newUntitled(list, ports(), STYLE);
    expect(names(list)).toEqual(['Untitled', 'Untitled 2', 'Untitled 3']);
    const second = list.tabs[1] as Tab;
    list = close(list, second.id, ports(), STYLE);
    expect(names(list)).toEqual(['Untitled', 'Untitled 3']);
    list = newUntitled(list, ports(), STYLE);
    expect(names(list)).toEqual(['Untitled', 'Untitled 3', 'Untitled 2']);
  });

  it('names survive a state round trip (a switch away and back)', () => {
    let list = newUntitled(initialTabs(ports(), STYLE), ports(), STYLE);
    const second = activeTab(list);
    const taken = second.state;
    list = update(list, second.id, { state: null });
    list = update(list, second.id, { state: taken });
    expect(names(list)).toEqual(['Untitled', 'Untitled 2']);
  });
});

describe('T7 new tab, T18', () => {
  it('adds at the end and activates, also when the active tab is an empty untitled one', () => {
    const start = freeze(initialTabs(ports(), STYLE));
    const list = newUntitled(start, ports(), STYLE);
    expect(list.tabs).toHaveLength(2);
    expect(list.active).toBe((list.tabs[1] as Tab).id);
    expect(start.tabs).toHaveLength(1);
  });

  it('uses the remembered preset for the new drawing', () => {
    const list = newUntitled(initialTabs(ports(), STYLE), ports(), 'journal');
    const doc = tabStateDoc(activeTab(list).state as EditorTabState);
    expect(doc.style.preset).toBe('journal');
  });
});

describe('T3 labels', () => {
  it('a .chalk file shows its base name, a picture its name with the extension', () => {
    expect(label({ kind: 'chalk', name: 'esterification.chalk' })).toBe('esterification');
    expect(label({ kind: 'chalk', name: 'ESTER.CHALK' })).toBe('ESTER');
    expect(label({ kind: 'chalk', name: 'a.b.chalk' })).toBe('a.b');
    expect(label({ kind: 'picture', name: 'ethanol.png' })).toBe('ethanol.png');
    expect(label({ kind: 'untitled', name: 'Untitled 2' })).toBe('Untitled 2');
  });

  it('a kept tab shows its former label or "<label> (your changes)"', () => {
    expect(keptName({ kind: 'chalk', name: 'esterification.chalk' })).toBe(
      'esterification (your changes)',
    );
    expect(keptName({ kind: 'untitled', name: 'Untitled 2' })).toBe('Untitled 2');
    expect(keptName({ kind: 'picture', name: 'ethanol.png' })).toBe('ethanol.png');
    expect(label({ kind: 'kept', name: 'esterification (your changes)' })).toBe(
      'esterification (your changes)',
    );
  });

  it('markKept unbinds the tab and renames it', () => {
    const list = markKept(fileList(['a', 'b'], 'a'), 'a');
    expect(findTab(list, 'a')).toMatchObject({
      kind: 'kept',
      name: 'a (your changes)',
      ref: null,
    });
    const same = fileList(['a']);
    expect(markKept(same, 'zzz')).toBe(same);
  });
});

describe('T17 open and the replace-empty rule', () => {
  const opened = (id = 'file', state = fresh(withAtom())) => ({
    id,
    kind: 'chalk' as const,
    name: 'esterification.chalk',
    ref: ref('r1', 'esterification.chalk'),
    state,
  });

  it('open appends at the end and activates', () => {
    const start = fileList(['a', 'b'], 'a');
    const list = open(start, opened('c'));
    expect(ids(list)).toEqual(['a', 'b', 'c']);
    expect(list.active).toBe('c');
    expect(findTab(list, 'c')).toMatchObject({ kind: 'chalk', available: true });
  });

  it('opens into an empty untitled active tab, which keeps its id', () => {
    const start = freeze(initialTabs(ports(), STYLE));
    expect(canOpenInto(start)).toBe(true);
    const list = openInto(start, opened('ignored'));
    expect(list.tabs).toHaveLength(1);
    expect(list.active).toBe(start.active);
    expect(list.tabs[0]).toMatchObject({
      id: start.active,
      kind: 'chalk',
      name: 'esterification.chalk',
      ref: ref('r1', 'esterification.chalk'),
    });
    expect(label(list.tabs[0] as Tab)).toBe('esterification');
  });

  it('opens a picture into the empty tab with the picture kind', () => {
    const start = initialTabs(ports(), STYLE);
    const list = openInto(start, {
      id: 'x',
      kind: 'picture',
      name: 'ethanol.png',
      ref: ref('p', 'ethanol.png', 'png'),
      state: fresh(withAtom()),
    });
    expect(list.tabs[0]).toMatchObject({ kind: 'picture', name: 'ethanol.png' });
  });

  const replaceCases: [string, Tab, boolean][] = [
    ['empty untitled', tab('t'), true],
    ['untitled with content', tab('t', { state: fresh(withAtom()) }), false],
    ['empty drawing but one undo step', tab('t', { state: emptyWithUndo() }), false],
    ['empty drawing but one redo step', tab('t', { state: emptyWithRedo() }), false],
    ['chalk tab, empty', tab('t', { kind: 'chalk', ref: ref('t') }), false],
    ['picture tab, empty', tab('t', { kind: 'picture', ref: ref('t') }), false],
    ['kept tab, empty', tab('t', { kind: 'kept' }), false],
    ['untitled not loaded', tab('t', { state: null }), false],
  ];

  it.each(replaceCases)('%s: replaces = %s', (_name, t, replaces) => {
    const start = freeze(createTabs([t]));
    expect(canOpenInto(start)).toBe(replaces);
    const list = openInto(start, opened('new'));
    if (replaces) {
      expect(ids(list)).toEqual(['t']);
    } else {
      expect(ids(list)).toEqual(['t', 'new']);
      expect(list.active).toBe('new');
    }
  });

  it('only the active tab counts', () => {
    const start = createTabs([tab('blank'), tab('full', { state: fresh(withAtom()) })], 'full');
    expect(canOpenInto(start)).toBe(false);
  });
});

describe('update', () => {
  it('changes one tab and leaves the rest', () => {
    const start = freeze(fileList(['a', 'b']));
    const list = update(start, 'b', { available: false });
    expect(findTab(list, 'b')?.available).toBe(false);
    expect(findTab(list, 'a')).toBe(findTab(start, 'a'));
  });

  it('an unknown id changes nothing', () => {
    const start = fileList(['a']);
    expect(update(start, 'zzz', { name: 'x' })).toBe(start);
  });

  it('Save as binds an untitled tab', () => {
    const start = initialTabs(ports(), STYLE);
    const list = update(start, start.active, {
      kind: 'chalk',
      name: 'n.chalk',
      ref: ref('n'),
    });
    expect(activeTab(list)).toMatchObject({ kind: 'chalk', name: 'n.chalk' });
  });
});

describe('T11 switching', () => {
  const list = fileList(['a', 'b', 'c'], 'b');

  it('activate', () => {
    expect(activate(list, 'c').active).toBe('c');
    expect(activate(list, 'b')).toBe(list);
    expect(activate(list, 'zzz')).toBe(list);
  });

  it('next and previous wrap', () => {
    expect(next(list).active).toBe('c');
    expect(next(next(list)).active).toBe('a');
    expect(previous(list).active).toBe('a');
    expect(previous(previous(list)).active).toBe('c');
  });

  it('next and previous with one tab change nothing', () => {
    const one = fileList(['a']);
    expect(next(one)).toBe(one);
    expect(previous(one)).toBe(one);
  });

  it('byNumber goes to tab n, nothing when there is none', () => {
    const three = fileList(['a', 'b', 'c'], 'a');
    expect(byNumber(three, 1)).toBe(three);
    expect(byNumber(three, 2).active).toBe('b');
    expect(byNumber(three, 3).active).toBe('c');
    expect(byNumber(three, 4)).toBe(three);
    expect(byNumber(three, 8)).toBe(three);
  });

  it('byNumber 9 and 0 are not tab numbers (Ctrl+9 is `last`)', () => {
    const three = fileList(['a', 'b', 'c'], 'a');
    expect(byNumber(three, 9)).toBe(three);
    expect(byNumber(three, 0)).toBe(three);
    expect(byNumber(three, 1.5)).toBe(three);
  });

  it('byNumber and last on 12 tabs', () => {
    const idList = Array.from({ length: 12 }, (_, i) => `t${i + 1}`);
    const twelve = fileList(idList, 't1');
    expect(byNumber(twelve, 8).active).toBe('t8');
    expect(byNumber(twelve, 4).active).toBe('t4');
    expect(last(twelve).active).toBe('t12');
  });

  it('last on 1 and 3 tabs', () => {
    const one = fileList(['a']);
    expect(last(one)).toBe(one);
    expect(last(fileList(['a', 'b', 'c'], 'a')).active).toBe('c');
  });
});

describe('T13 move', () => {
  const list = fileList(['a', 'b', 'c', 'd'], 'b');

  it('moves to both ends, keeping the active tab', () => {
    const toEnd = move(list, 0, 3);
    expect(ids(toEnd)).toEqual(['b', 'c', 'd', 'a']);
    expect(toEnd.active).toBe('b');
    expect(ids(move(list, 3, 0))).toEqual(['d', 'a', 'b', 'c']);
  });

  it('moves in the middle', () => {
    expect(ids(move(list, 1, 2))).toEqual(['a', 'c', 'b', 'd']);
  });

  it('to itself, or outside the list, changes nothing', () => {
    expect(move(list, 2, 2)).toBe(list);
    expect(move(list, -1, 2)).toBe(list);
    expect(move(list, 1, 4)).toBe(list);
    expect(move(list, 0.5, 2)).toBe(list);
  });
});

describe('T8 close: the list part', () => {
  const four = fileList(['a', 'b', 'c', 'd'], 'a');

  it('closing the first tab activates its right neighbour', () => {
    const list = close(four, 'a', ports(), STYLE);
    expect(ids(list)).toEqual(['b', 'c', 'd']);
    expect(list.active).toBe('b');
  });

  it('closing a middle tab activates its right neighbour', () => {
    const list = close(activate(four, 'b'), 'b', ports(), STYLE);
    expect(ids(list)).toEqual(['a', 'c', 'd']);
    expect(list.active).toBe('c');
  });

  it('closing the last tab activates its left neighbour', () => {
    const list = close(activate(four, 'd'), 'd', ports(), STYLE);
    expect(ids(list)).toEqual(['a', 'b', 'c']);
    expect(list.active).toBe('c');
  });

  it('closing an inactive tab keeps the active one', () => {
    const list = close(activate(four, 'c'), 'a', ports(), STYLE);
    expect(list.active).toBe('c');
  });

  it('an unknown id changes nothing', () => {
    expect(close(four, 'zzz', ports(), STYLE)).toBe(four);
  });

  it('the closed tab goes to the reopen list and to discarded', () => {
    const list = close(four, 'b', ports(), STYLE);
    expect(list.closed).toHaveLength(1);
    expect(list.closed[0]).toMatchObject({ oldId: 'b', kind: 'chalk', index: 1 });
    expect(list.closed[0]?.ref).toEqual(ref('b'));
    expect(list.discarded).toEqual(['b']);
  });

  it('R39: closing the only tab leaves one new empty Untitled', () => {
    const only = freeze(fileList(['a']));
    const list = close(only, 'a', ports(), 'journal');
    expect(list.tabs).toHaveLength(1);
    const t = list.tabs[0] as Tab;
    expect(t).toMatchObject({ kind: 'untitled', name: 'Untitled', ref: null });
    expect(t.id).not.toBe('a');
    expect(list.active).toBe(t.id);
    expect(tabStateDoc(t.state as EditorTabState).style.preset).toBe('journal');
    expect(list.closed[0]?.oldId).toBe('a');
  });

  it('R39: an untitled drawing with content closes into a fresh Untitled, not Untitled 2', () => {
    const only = freeze(createTabs([tab('u', { name: 'Untitled 2', state: fresh(withAtom()) })]));
    const list = close(only, 'u', ports(), STYLE);
    expect(names(list)).toEqual(['Untitled']);
    expect(list.closed).toHaveLength(1);
  });

  it('R39: an empty untitled last tab with no undo step: nothing happens', () => {
    const only = freeze(initialTabs(ports(), STYLE));
    expect(close(only, only.active, ports(), STYLE)).toBe(only);
  });

  it('R39: the last tab with an undo step is replaced', () => {
    const only = freeze(createTabs([tab('u', { state: emptyWithUndo() })]));
    const list = close(only, 'u', ports(), STYLE);
    expect(list.tabs[0]?.id).not.toBe('u');
    expect(list.closed).toHaveLength(1);
  });

  it('an empty untitled tab among others closes like any other', () => {
    const list = close(createTabs([tab('u'), tab('v')]), 'v', ports(), STYLE);
    expect(ids(list)).toEqual(['u']);
  });

  it('an unloaded last untitled tab is not known to be empty: it is replaced', () => {
    const only = createTabs([tab('u', { state: null })]);
    expect(close(only, 'u', ports(), STYLE).tabs[0]?.id).not.toBe('u');
  });
});

describe('T12 reopen', () => {
  it('the list holds 10 entries, newest first, the oldest dropped', () => {
    const idList = Array.from({ length: 13 }, (_, i) => `t${i}`);
    let list = fileList([...idList, 'keep'], 'keep');
    for (const id of idList) list = close(list, id, ports(), STYLE);
    expect(list.closed).toHaveLength(REOPEN_LIMIT);
    expect(list.closed.map((c) => c.oldId)).toEqual(idList.slice(3).reverse());
    expect(list.discarded).toHaveLength(13);
  });

  it('nothing to reopen', () => {
    const list = fileList(['a']);
    expect(reopen(list, () => 'x')).toEqual({ list, outcome: 'none', tab: null });
  });

  it('puts the newest back at its old position under a fresh id, active', () => {
    let list = fileList(['a', 'b', 'c'], 'a');
    list = close(list, 'b', ports(), STYLE);
    const result = reopen(list, () => 'fresh');
    expect(result.outcome).toBe('reopened');
    expect(ids(result.list)).toEqual(['a', 'fresh', 'c']);
    expect(result.list.active).toBe('fresh');
    expect(result.tab).toBe(findTab(result.list, 'fresh'));
    expect(result.tab).toMatchObject({ kind: 'chalk', name: 'b.chalk', ref: ref('b') });
    expect(result.list.closed).toHaveLength(0);
    expect(result.list.discarded).toEqual(['b']);
  });

  it('keeps the state, so history and drawing come back', () => {
    const state = fresh(withAtom());
    let list = createTabs([tab('a'), tab('u', { state })], 'a');
    list = close(list, 'u', ports(), STYLE);
    const result = reopen(list, () => 'fresh');
    expect(result.tab?.state).toBe(state);
  });

  it('puts the old id in discarded, never reused', () => {
    let list = createTabs([tab('a'), tab('u')]);
    list = clearDiscarded(close(list, 'u', ports(), STYLE), ['u']);
    expect(list.discarded).toEqual([]);
    const result = reopen(list, () => 'fresh');
    expect(result.list.discarded).toEqual(['u']);
  });

  it('clamps the position after tabs were closed', () => {
    let list = fileList(['a', 'b', 'c', 'd'], 'a');
    list = close(list, 'd', ports(), STYLE);
    list = close(list, 'c', ports(), STYLE);
    list = close(list, 'b', ports(), STYLE);
    expect(ids(list)).toEqual(['a']);
    const result = reopen(list, () => 'r1');
    expect(ids(result.list)).toEqual(['a', 'r1']);
    const second = reopen(result.list, () => 'r2');
    expect(ids(second.list)).toEqual(['a', 'r1', 'r2']);
  });

  it('keeps an untitled name when free, else the smallest free one', () => {
    let list = createTabs([tab('a', { name: 'Untitled' }), tab('b', { name: 'Untitled 2' })]);
    list = close(list, 'b', ports(), STYLE);
    expect(reopen(list, () => 'r').tab?.name).toBe('Untitled 2');

    const taken = newUntitled(list, ports(), STYLE);
    expect(names(taken)).toEqual(['Untitled', 'Untitled 2']);
    expect(reopen(taken, () => 'r').tab?.name).toBe('Untitled 3');
  });

  it('a name of another kind is kept as it is', () => {
    let list = createTabs([
      tab('a', { name: 'Untitled' }),
      tab('k', { kind: 'kept', name: 'esterification (your changes)' }),
    ]);
    list = close(list, 'k', ports(), STYLE);
    expect(reopen(list, () => 'r').tab?.name).toBe('esterification (your changes)');
  });

  it('an entry whose file is open in another tab is dropped and that tab focused', () => {
    let list = fileList(['a', 'b'], 'b');
    list = close(list, 'a', ports(), STYLE);
    // The same file opened again meanwhile (the host binds it under a new tab id, same ref id).
    list = open(list, {
      id: 'again',
      kind: 'chalk',
      name: 'a.chalk',
      ref: ref('a'),
      state: fresh(),
    });
    list = activate(list, 'b');
    const result = reopen(list, () => 'fresh');
    expect(result.outcome).toBe('focused');
    expect(result.tab?.id).toBe('again');
    expect(result.list.active).toBe('again');
    expect(result.list.closed).toHaveLength(0);
    expect(ids(result.list)).toEqual(['b', 'again']);
  });

  it('a picture entry is bound by its picture ref the same way', () => {
    const picture = tab('p', { kind: 'picture', name: 'e.png', ref: ref('pic', 'e.png', 'png') });
    let list = createTabs([tab('a'), picture]);
    list = close(list, 'p', ports(), STYLE);
    const result = reopen(list, () => 'fresh');
    expect(result.outcome).toBe('reopened');
    expect(result.tab).toMatchObject({ kind: 'picture', ref: ref('pic', 'e.png', 'png') });
  });

  it('an untitled entry never matches a tab by ref', () => {
    let list = createTabs([tab('a'), tab('u')]);
    list = close(list, 'u', ports(), STYLE);
    expect(reopen(list, () => 'fresh').outcome).toBe('reopened');
  });

  it("Don't save of an untitled tab, then reopen: a fresh id, the drawing back, still untitled", () => {
    const state = fresh(withAtom());
    let list = createTabs([tab('u', { name: 'Untitled 2', state })]);
    list = close(list, 'u', ports(), STYLE);
    expect(names(list)).toEqual(['Untitled']);
    const result = reopen(list, () => 'fresh');
    expect(result.outcome).toBe('reopened');
    expect(result.tab).toMatchObject({ id: 'fresh', kind: 'untitled', name: 'Untitled 2' });
    expect(result.tab?.state).toBe(state);
    expect(result.list.discarded).toContain('u');
  });
});

describe('clearDiscarded', () => {
  it('drops only the ids main deleted', () => {
    let list = fileList(['a', 'b', 'c'], 'c');
    list = close(close(list, 'a', ports(), STYLE), 'b', ports(), STYLE);
    expect(list.discarded).toEqual(['a', 'b']);
    expect(clearDiscarded(list, ['a']).discarded).toEqual(['b']);
    expect(clearDiscarded(list, ['zzz'])).toBe(list);
  });
});

describe('purity', () => {
  it('no operation changes its input (frozen lists)', () => {
    const start = fileList(['a', 'b', 'c'], 'b');
    next(start);
    previous(start);
    byNumber(start, 3);
    last(start);
    move(start, 0, 2);
    close(start, 'b', ports(), STYLE);
    newUntitled(start, ports(), STYLE);
    update(start, 'a', { name: 'x' });
    markKept(start, 'a');
    expect(ids(start)).toEqual(['a', 'b', 'c']);
    expect(start.active).toBe('b');
  });
});

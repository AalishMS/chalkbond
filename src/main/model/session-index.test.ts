// SS3 (the session index), N8's merge, SS4's `discarded` rules, SS7's renderer projection and
// SS11's classification of the store folder (SPEC-app-shell.md "Session store").
import { describe, expect, it } from 'vitest';
import {
  classifyRecords,
  emptyIndex,
  mergeRendererIndex,
  parseRecordEnvelope,
  parseSessionIndex,
  recordFileName,
  recordIdOf,
  rendererSession,
  serializeSessionIndex,
  withMainFields,
  withOrphans,
  withoutDiscarded,
  type IndexTab,
  type MainTabFields,
  type RendererIndexUpdate,
  type SessionIndex,
} from './session-index';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';
const E = '55555555-5555-4555-8555-555555555555';
const hash = (c: string): string => c.repeat(64);

const CHALK: IndexTab = {
  id: A,
  kind: 'chalk',
  name: 'esterification',
  path: 'C:\\Lessons\\esterification.chalk',
  fileHash: hash('a'),
  written: hash('b'),
  writing: null,
  unsaved: false,
  warning: false,
  view: { zoom: 1.5, centre: { x: 2, y: -3.5 } },
};
const UNTITLED: IndexTab = {
  id: B,
  kind: 'untitled',
  name: 'Untitled 2',
  path: null,
  fileHash: null,
  written: null,
  writing: null,
  unsaved: true,
  warning: false,
  view: null,
};
const PICTURE: IndexTab = {
  id: C,
  kind: 'picture',
  name: 'ethanol.png',
  path: 'C:\\Lessons\\ethanol.png',
  fileHash: null,
  written: null,
  writing: null,
  unsaved: true,
  warning: true,
  view: { zoom: 0.5, centre: { x: 0, y: 0 } },
};
const FULL: SessionIndex = {
  version: 1,
  tabs: [CHALK, UNTITLED, PICTURE],
  active: B,
  discarded: [D],
};

/** The index as text, with one tab's fields overridden (an unknown value goes through JSON). */
function withTab(overrides: Record<string, unknown>, index: SessionIndex = FULL): string {
  const [first, ...rest] = index.tabs;
  return JSON.stringify({ ...index, tabs: [{ ...first, ...overrides }, ...rest] });
}
const firstTab = (text: string): IndexTab | undefined => parseSessionIndex(text).index.tabs[0];

describe('SS3: parse and serialize', () => {
  it('a missing file is the empty index and needs no rewrite', () => {
    expect(parseSessionIndex(null)).toEqual({ index: emptyIndex(), problem: null });
    expect(emptyIndex()).toEqual({ version: 1, tabs: [], active: null, discarded: [] });
  });

  it('a valid index round-trips unchanged, needing no rewrite', () => {
    const text = serializeSessionIndex(FULL);
    expect(text.endsWith('\n')).toBe(true);
    expect(parseSessionIndex(text)).toEqual({ index: FULL, problem: null });
  });

  it('key order alone is no repair', () => {
    const reordered = JSON.stringify({
      discarded: FULL.discarded,
      active: FULL.active,
      tabs: FULL.tabs.map((t) => Object.fromEntries(Object.entries(t).reverse())),
      version: 1,
    });
    expect(parseSessionIndex(reordered)).toEqual({ index: FULL, problem: null });
  });

  it.each([
    ['not JSON', '{ "version": 1, '],
    ['an array', '[]'],
    ['a string', '"index"'],
    ['null', 'null'],
    ['another version', JSON.stringify({ ...FULL, version: 2 })],
    ['no version', JSON.stringify({ tabs: [], active: null, discarded: [] })],
    ['tabs not a list', JSON.stringify({ ...FULL, tabs: { 0: CHALK } })],
    ['no tabs', JSON.stringify({ version: 1, active: A, discarded: [] })],
  ])('%s is a damaged index, replaced by the empty one', (_name, text) => {
    expect(parseSessionIndex(text)).toEqual({ index: emptyIndex(), problem: 'damaged' });
  });

  it('an unknown top-level key or tab key is dropped (repaired)', () => {
    const top = parseSessionIndex(JSON.stringify({ ...FULL, extra: true }));
    expect(top).toEqual({ index: FULL, problem: 'repaired' });
    const inTab = parseSessionIndex(withTab({ colour: 'red' }));
    expect(inTab).toEqual({ index: FULL, problem: 'repaired' });
  });

  describe('each invalid tab field is replaced by its default', () => {
    it.each([
      ['kind', { kind: 'folder' }, { kind: 'kept', fileHash: null, written: null }],
      ['name too long', { name: 'x'.repeat(256) }, { name: 'Untitled' }],
      ['name not text', { name: 7 }, { name: 'Untitled' }],
      ['unsaved', { unsaved: 'yes' }, { unsaved: false }],
      ['warning', { warning: 1 }, { warning: false }],
      ['fileHash', { fileHash: 'abc' }, { fileHash: null }],
      ['written upper case', { written: 'B'.repeat(64) }, { written: null }],
      ['writing', { writing: 42 }, { writing: null }],
    ])('%s', (_name, overrides, expected) => {
      const result = parseSessionIndex(withTab(overrides));
      expect(result.problem).toBe('repaired');
      expect(result.index.tabs[0]).toEqual({ ...CHALK, ...expected });
      expect(result.index.tabs.slice(1)).toEqual([UNTITLED, PICTURE]);
    });

    it('a 255-character name is kept', () => {
      expect(firstTab(withTab({ name: 'x'.repeat(255) }))?.name).toBe('x'.repeat(255));
    });

    it('a missing field is its default', () => {
      const { unsaved: _u, view: _v, writing: _w, ...rest } = CHALK;
      expect(parseSessionIndex(withTab({}, { ...FULL, tabs: [rest as IndexTab] }))).toEqual({
        index: {
          ...FULL,
          tabs: [{ ...CHALK, unsaved: false, view: null, writing: null }],
          active: A,
        },
        problem: 'repaired',
      });
    });

    it('a write in flight is kept for a chalk tab', () => {
      expect(firstTab(withTab({ writing: hash('c') }))?.writing).toBe(hash('c'));
    });
  });

  describe('path and kind agree', () => {
    it.each([
      ['empty', ''],
      ['too long', `C:\\${'x'.repeat(4096)}`],
      ['not text', 5],
    ])('a chalk tab whose path is %s becomes kept, without hashes', (_name, path) => {
      expect(firstTab(withTab({ path }))).toEqual({
        ...CHALK,
        kind: 'kept',
        path: null,
        fileHash: null,
        written: null,
      });
    });

    it('a picture tab without a path becomes kept', () => {
      const text = withTab({ path: null }, { ...FULL, tabs: [PICTURE] });
      expect(firstTab(text)).toEqual({ ...PICTURE, kind: 'kept', path: null });
    });

    it('an untitled tab never has a path', () => {
      const text = withTab({ path: 'C:\\a.chalk' }, { ...FULL, tabs: [UNTITLED] });
      expect(firstTab(text)).toEqual(UNTITLED);
    });

    it('a kept tab keeps its former file (F6 folder) but no hashes', () => {
      const text = withTab({ kind: 'kept' });
      expect(firstTab(text)).toEqual({ ...CHALK, kind: 'kept', fileHash: null, written: null });
    });

    it('a picture tab carries no hashes', () => {
      const text = withTab(
        { fileHash: hash('a'), writing: hash('b') },
        { ...FULL, tabs: [PICTURE] },
      );
      expect(parseSessionIndex(text)).toEqual({
        index: { ...FULL, tabs: [PICTURE], active: C },
        problem: 'repaired',
      });
    });
  });

  describe('view', () => {
    it.each([
      [0.1, 0.25],
      [0.25, 0.25],
      [8, 8],
      [12, 8],
    ])('zoom %d is clamped to %d', (zoom, expected) => {
      expect(firstTab(withTab({ view: { zoom, centre: { x: 1, y: 2 } } }))?.view).toEqual({
        zoom: expected,
        centre: { x: 1, y: 2 },
      });
    });

    it.each([
      ['a zoom that is not a number', { zoom: '2', centre: { x: 0, y: 0 } }],
      ['a zoom of 0', { zoom: 0, centre: { x: 0, y: 0 } }],
      ['a negative zoom', { zoom: -1, centre: { x: 0, y: 0 } }],
      ['no centre', { zoom: 1 }],
      ['a centre without y', { zoom: 1, centre: { x: 0 } }],
      ['a centre with text', { zoom: 1, centre: { x: '0', y: 0 } }],
      ['a list', [1, 0, 0]],
      ['a number', 1],
    ])('%s drops the view', (_name, view) => {
      const result = parseSessionIndex(withTab({ view }));
      expect(result.problem).toBe('repaired');
      expect(result.index.tabs[0]?.view).toBeNull();
    });

    it('non-finite numbers (written as null by JSON) drop the view', () => {
      const text = withTab({ view: { zoom: 1, centre: { x: Number.NaN, y: 0 } } });
      expect(firstTab(text)?.view).toBeNull();
    });

    it('an unknown key in the view is dropped', () => {
      const text = withTab({ view: { zoom: 2, centre: { x: 1, y: 1, z: 3 }, rot: 1 } });
      expect(parseSessionIndex(text)).toEqual({
        index: {
          ...FULL,
          tabs: [{ ...CHALK, view: { zoom: 2, centre: { x: 1, y: 1 } } }, UNTITLED, PICTURE],
        },
        problem: 'repaired',
      });
    });
  });

  describe('tab ids, active, discarded', () => {
    it.each([
      ['not a uuid', { id: 'tab-1' }],
      ['missing', { id: undefined }],
    ])('a tab whose id is %s is dropped (its record becomes an orphan)', (_name, overrides) => {
      const result = parseSessionIndex(withTab(overrides));
      expect(result).toEqual({
        index: { ...FULL, tabs: [UNTITLED, PICTURE] },
        problem: 'repaired',
      });
    });

    it('a tab entry that is not an object is dropped', () => {
      const text = JSON.stringify({ ...FULL, tabs: ['x', null, CHALK] });
      expect(parseSessionIndex(text)).toEqual({
        index: { ...FULL, tabs: [CHALK], active: A },
        problem: 'repaired',
      });
    });

    it('a repeated id keeps its first tab only', () => {
      const text = JSON.stringify({ ...FULL, tabs: [CHALK, { ...UNTITLED, id: A }, PICTURE] });
      expect(parseSessionIndex(text).index.tabs).toEqual([CHALK, PICTURE]);
    });

    it.each([
      ['not listed', E],
      ['not a uuid', 'x'],
      ['missing', undefined],
    ])('an active id that is %s becomes the first tab', (_name, active) => {
      expect(parseSessionIndex(JSON.stringify({ ...FULL, active }))).toEqual({
        index: { ...FULL, active: A },
        problem: 'repaired',
      });
    });

    it('with no tabs, active is null', () => {
      const text = JSON.stringify({ version: 1, tabs: [], active: A, discarded: [] });
      expect(parseSessionIndex(text)).toEqual({ index: emptyIndex(), problem: 'repaired' });
    });

    it('discarded keeps unique uuids only, never a listed tab', () => {
      const text = JSON.stringify({ ...FULL, discarded: [D, 'x', 3, D, A, E] });
      expect(parseSessionIndex(text)).toEqual({
        index: { ...FULL, discarded: [D, E] },
        problem: 'repaired',
      });
    });

    it('discarded that is not a list is empty', () => {
      const text = JSON.stringify({ ...FULL, discarded: D });
      expect(parseSessionIndex(text).index.discarded).toEqual([]);
    });
  });
});

describe('N8: merge of the renderer fields with main fields', () => {
  const fields: Record<string, MainTabFields> = {
    [A]: {
      path: 'C:\\Lessons\\esterification.chalk',
      fileHash: hash('a'),
      written: hash('b'),
      writing: null,
    },
    [C]: { path: 'C:\\Lessons\\ethanol.png', fileHash: null, written: null, writing: null },
  };
  const NONE: MainTabFields = { path: null, fileHash: null, written: null, writing: null };
  const mainFieldsOf = (id: string): MainTabFields => fields[id] ?? NONE;
  const UPDATE: RendererIndexUpdate = {
    tabs: [
      { id: C, kind: 'picture', name: 'ethanol.png', view: null, unsaved: true, warning: false },
      {
        id: A,
        kind: 'chalk',
        name: 'esterification',
        view: { zoom: 2, centre: { x: 1, y: 1 } },
        unsaved: false,
        warning: false,
      },
      { id: B, kind: 'untitled', name: 'Untitled 2', view: null, unsaved: true, warning: false },
    ],
    active: A,
    discarded: [],
  };

  it('takes order, names, kinds, views, markers and active from the renderer', () => {
    const merged = mergeRendererIndex(emptyIndex(), UPDATE, mainFieldsOf, new Set());
    expect(merged).toEqual({
      version: 1,
      tabs: [
        { ...UPDATE.tabs[0], ...fields[C] },
        { ...UPDATE.tabs[1], ...fields[A] },
        { ...UPDATE.tabs[2], ...NONE },
      ],
      active: A,
      discarded: [],
    });
  });

  it('never lets the renderer set a path or a hash', () => {
    const sneaky = {
      id: B,
      kind: 'chalk' as const,
      name: 'evil',
      view: null,
      unsaved: false,
      warning: false,
      path: 'C:\\Windows\\system.ini',
      fileHash: hash('f'),
      written: hash('f'),
      writing: hash('f'),
    };
    const merged = mergeRendererIndex(
      FULL,
      { tabs: [sneaky], active: B, discarded: [] },
      mainFieldsOf,
      new Set(),
    );
    expect(merged.tabs).toEqual([
      { id: B, kind: 'chalk', name: 'evil', view: null, unsaved: false, warning: false, ...NONE },
    ]);
  });

  it('ignores main fields of the previous index (main fields come from the registry)', () => {
    const merged = mergeRendererIndex(FULL, UPDATE, () => NONE, new Set());
    expect(merged.tabs.map((t) => t.path)).toEqual([null, null, null]);
  });

  it('keeps the first of repeated ids and repairs an unknown active id and a view', () => {
    const update: RendererIndexUpdate = {
      tabs: [
        { ...UPDATE.tabs[1]!, view: { zoom: 20, centre: { x: 0, y: 0 } } },
        { ...UPDATE.tabs[2]!, id: A },
      ],
      active: E,
      discarded: [],
    };
    const merged = mergeRendererIndex(emptyIndex(), update, mainFieldsOf, new Set());
    expect(merged.tabs.map((t) => t.id)).toEqual([A]);
    expect(merged.tabs[0]?.view).toEqual({ zoom: 8, centre: { x: 0, y: 0 } });
    expect(merged.active).toBe(A);
  });

  it('an empty tab list has no active tab', () => {
    const merged = mergeRendererIndex(
      emptyIndex(),
      { tabs: [], active: A, discarded: [] },
      mainFieldsOf,
      new Set(),
    );
    expect(merged.active).toBeNull();
  });

  describe('discarded lifecycle (SS3, SS4, T12)', () => {
    it('a closed tab joins discarded, together with ids not yet deleted', () => {
      const merged = mergeRendererIndex(
        FULL,
        { ...UPDATE, discarded: [E] },
        mainFieldsOf,
        new Set(),
      );
      expect(merged.discarded).toEqual([D, E]);
    });

    it('an id stays in discarded although the renderer no longer sends it', () => {
      const merged = mergeRendererIndex(FULL, UPDATE, mainFieldsOf, new Set());
      expect(merged.discarded).toEqual([D]);
    });

    it('an id leaves the list once its record is deleted and never comes back', () => {
      const after = withoutDiscarded(FULL, [D]);
      expect(after.discarded).toEqual([]);
      expect(after.tabs).toEqual(FULL.tabs);
      const merged = mergeRendererIndex(
        after,
        { ...UPDATE, discarded: [D, E] },
        mainFieldsOf,
        new Set([D]),
      );
      expect(merged.discarded).toEqual([E]);
    });

    it('a listed tab is never discarded (its record would be lost)', () => {
      const merged = mergeRendererIndex(
        FULL,
        { ...UPDATE, discarded: [A, D] },
        mainFieldsOf,
        new Set(),
      );
      expect(merged.discarded).toEqual([D]);
    });

    it('a reopened tab has a fresh id; the old id stays discarded', () => {
      const reopened = { ...UPDATE.tabs[1]!, id: E };
      const merged = mergeRendererIndex(
        FULL,
        { tabs: [reopened], active: E, discarded: [A] },
        mainFieldsOf,
        new Set(),
      );
      expect(merged.tabs.map((t) => t.id)).toEqual([E]);
      expect(merged.discarded).toEqual([D, A]);
    });

    it('withoutDiscarded returns a fresh index and ignores unknown ids', () => {
      const after = withoutDiscarded(FULL, [E]);
      expect(after).toEqual(FULL);
      expect(after).not.toBe(FULL);
    });
  });

  it('withMainFields refreshes paths and hashes from main and keeps the renderer fields', () => {
    const changed: MainTabFields = {
      ...fields[A]!,
      written: hash('c'),
      fileHash: hash('c'),
      writing: null,
    };
    const lookup = (id: string): MainTabFields => (id === A ? changed : mainFieldsOf(id));
    const refreshed = withMainFields(FULL, lookup);
    expect(refreshed).toEqual({
      ...FULL,
      tabs: [{ ...CHALK, fileHash: hash('c'), written: hash('c') }, UNTITLED, PICTURE],
    });
  });
});

describe('SS7: what the renderer may see', () => {
  it('hides paths and hashes', () => {
    expect(rendererSession(FULL)).toEqual({
      tabs: [
        {
          id: A,
          kind: 'chalk',
          name: 'esterification',
          view: CHALK.view,
          unsaved: false,
          warning: false,
        },
        { id: B, kind: 'untitled', name: 'Untitled 2', view: null, unsaved: true, warning: false },
        {
          id: C,
          kind: 'picture',
          name: 'ethanol.png',
          view: PICTURE.view,
          unsaved: true,
          warning: true,
        },
      ],
      active: B,
    });
    const text = JSON.stringify(rendererSession(FULL));
    expect(text).not.toContain('Lessons');
    expect(text).not.toContain(hash('a'));
    expect(text).not.toContain(D);
  });

  it('a fresh copy: changing it leaves the index alone', () => {
    const seen = rendererSession(FULL)!;
    seen.tabs[0]!.view!.centre.x = 99;
    seen.tabs.pop();
    expect(FULL.tabs[0]?.view?.centre.x).toBe(2);
    expect(FULL.tabs).toHaveLength(3);
  });

  it('no tabs (first run) is null', () => {
    expect(rendererSession(emptyIndex())).toBeNull();
  });
});

describe('SS11: classification of the store folder', () => {
  const names = [recordFileName(A), recordFileName(D), recordFileName(E)];

  it('record names are <uuid>.json', () => {
    expect(recordFileName(A)).toBe(`${A}.json`);
    expect(recordIdOf(`${A}.json`)).toBe(A);
    expect(recordIdOf(`${A}.json.3f2a9c.tmp`)).toBeNull();
    expect(recordIdOf('notes.json')).toBeNull();
    expect(recordIdOf(A)).toBeNull();
    expect(recordIdOf(`${A}.JSON`)).toBeNull();
  });

  it('a listed record, a discarded one, an unlisted one (orphan)', () => {
    expect(classifyRecords(names, FULL)).toEqual({
      listed: [A],
      discarded: [D],
      orphans: [E],
      missing: [B, C],
      staleDiscarded: [],
      ignored: [],
    });
  });

  it('temp files and other names are ignored; orphans sorted; stale discarded ids reported', () => {
    const files = [`${E}.json`, `${A}.json.abc123.tmp`, 'desktop.ini', `${C}.json`, `${B}.json`];
    const index: SessionIndex = { ...FULL, tabs: [CHALK], active: A, discarded: [D] };
    expect(classifyRecords(files, index)).toEqual({
      listed: [],
      discarded: [],
      orphans: [B, C, E],
      missing: [A],
      staleDiscarded: [D],
      ignored: [`${A}.json.abc123.tmp`, 'desktop.ini'],
    });
  });

  it('listed records follow the strip order', () => {
    const files = [recordFileName(C), recordFileName(A), recordFileName(B)];
    expect(classifyRecords(files, FULL).listed).toEqual([A, B, C]);
  });

  it('a damaged index lists and discards nothing: every record is an orphan, none deleted', () => {
    const { index, problem } = parseSessionIndex('{ broken');
    expect(problem).toBe('damaged');
    const result = classifyRecords(names, index);
    expect(result.discarded).toEqual([]);
    expect(result.orphans).toEqual([A, D, E]);
  });

  describe('orphans open as kept tabs at the end', () => {
    it('appends kept tabs named from their records, unsaved, without paths', () => {
      const index = withOrphans(FULL, [{ id: E, name: 'Untitled 3' }]);
      expect(index.tabs.slice(0, 3)).toEqual(FULL.tabs);
      expect(index.tabs[3]).toEqual({
        id: E,
        kind: 'kept',
        name: 'Untitled 3',
        path: null,
        fileHash: null,
        written: null,
        writing: null,
        unsaved: true,
        warning: false,
        view: null,
      });
      expect(index.active).toBe(B);
    });

    it('into an empty (damaged) index: the first orphan is active', () => {
      const index = withOrphans(emptyIndex(), [
        { id: D, name: 'esterification' },
        { id: E, name: '' },
      ]);
      expect(index.tabs.map((t) => [t.id, t.name])).toEqual([
        [D, 'esterification'],
        [E, 'Untitled'],
      ]);
      expect(index.active).toBe(D);
    });

    it('an orphan already listed, discarded or repeated is not added again', () => {
      const index = withOrphans(FULL, [
        { id: A, name: 'x' },
        { id: D, name: 'y' },
        { id: E, name: 'z' },
        { id: E, name: 'z2' },
      ]);
      expect(index.tabs.map((t) => t.id)).toEqual([A, B, C, E]);
    });
  });

  describe('record envelope (main reads only name and kind)', () => {
    const envelope = {
      format: 'chalkbond-tab',
      version: 1,
      name: 'Untitled 3',
      kind: 'untitled',
      edited: false,
      editor: { doc: '{}', steps: [] },
    };

    it('a record envelope answers its name and kind', () => {
      expect(parseRecordEnvelope(JSON.stringify(envelope))).toEqual({
        name: 'Untitled 3',
        kind: 'untitled',
      });
    });

    it.each([
      ['not JSON', '{ "format":'],
      ['an array', '[]'],
      ['another format', JSON.stringify({ ...envelope, format: 'chalk' })],
      ['another version', JSON.stringify({ ...envelope, version: 2 })],
      ['a long name', JSON.stringify({ ...envelope, name: 'x'.repeat(256) })],
      ['a name that is not text', JSON.stringify({ ...envelope, name: 3 })],
      ['an unknown kind', JSON.stringify({ ...envelope, kind: 'folder' })],
      ['no editor', JSON.stringify({ ...envelope, editor: undefined })],
      ['an editor that is not an object', JSON.stringify({ ...envelope, editor: 'x' })],
    ])('%s is not an envelope (moved to damaged/)', (_name, text) => {
      expect(parseRecordEnvelope(text)).toBeNull();
    });
  });
});

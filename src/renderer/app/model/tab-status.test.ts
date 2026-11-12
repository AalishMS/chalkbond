// TB15: what a tab's status is (SPEC-app-shell.md Terms of "Tabs, auto-save and session"; F7 as
// amended by R33 and R41; SS6 unkept; T6 markers; T16 names; W3 title; N8's flags).
import { describe, expect, it } from 'vitest';
import { addAtom, emptyDoc, serialize, setStyle, type Doc } from '@core/doc-model';
import { createEditorController, tabStateDoc, type EditorTabState } from '../../editor';
import type { Tab, TabKind } from './tabs';
import {
  accessibleName,
  drawingHash,
  hasUnwrittenChanges,
  indexFlags,
  isPending,
  isUnkept,
  isUnsaved,
  markerOf,
  recordFailedAfter,
  storedMarker,
  tabFacts,
  tabMarker,
  windowTitleOf,
  type Sha256,
  type TabFacts,
  type TabMarker,
} from './tab-status';

const NOW = '2026-11-12T09:00:00.000Z';

const sha256: Sha256 = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const withAtom = (): Doc => addAtom(emptyDoc(NOW), { element: 'C', x: 0, y: 0 })[0];

const fresh = (doc: Doc = emptyDoc(NOW)): EditorTabState =>
  createEditorController({ clock: () => NOW }).newState(doc);

/** Opened with `doc`, then edited once (an atom added by replace-doc). */
function edited(doc: Doc = emptyDoc(NOW)): EditorTabState {
  const c = createEditorController({ clock: () => NOW, doc });
  c.run({ type: 'replace-doc', doc: addAtom(doc, { element: 'O', x: 3, y: 0 })[0], label: 'x' });
  return c.snapshotState();
}

/** An empty drawing with one undo step (a preset switch). */
function emptyWithUndo(): EditorTabState {
  const c = createEditorController({ clock: () => NOW });
  c.run({ type: 'set-preset', preset: 'journal' });
  return c.snapshotState();
}

/** Opened with `doc`, edited once, then undone: the drawing is the opened one again. */
function editedAndUndone(doc: Doc): EditorTabState {
  const c = createEditorController({ clock: () => NOW, doc });
  c.run({ type: 'replace-doc', doc: emptyDoc(NOW), label: 'x' });
  c.run('undo');
  return c.snapshotState();
}

const NAMES: Record<TabKind, string> = {
  untitled: 'Untitled 2',
  chalk: 'esterification.chalk',
  picture: 'ethanol.png',
  kept: 'esterification (your changes)',
};

const tab = (kind: TabKind, extra: Partial<Tab> = {}): Tab => ({
  id: 't1',
  kind,
  name: NAMES[kind],
  ref: null,
  available: true,
  state: fresh(),
  ...extra,
});

const facts = (t: Tab, extra: { unwritten?: boolean; recordFailed?: boolean } = {}): TabFacts => {
  const f = tabFacts(t, { unwritten: false, recordFailed: false, ...extra });
  if (f === null) throw new Error('expected a loaded tab');
  return f;
};

interface Row {
  readonly what: string;
  readonly f: TabFacts;
  readonly pending: boolean;
  readonly unsaved: boolean;
  readonly unkept: boolean;
  readonly marker: TabMarker;
}

const row = (
  what: string,
  f: TabFacts,
  pending: boolean,
  unsaved: boolean,
  unkept: boolean,
  marker: TabMarker,
): Row => ({ what, f, pending, unsaved, unkept, marker });

// Every kind x {empty, content, edited, unavailable, unkept}.
const TABLE: Row[] = [
  row('untitled empty', facts(tab('untitled')), false, false, false, 'none'),
  row(
    'untitled empty, undo step',
    facts(tab('untitled', { state: emptyWithUndo() })),
    false,
    false,
    false,
    'none',
  ),
  row(
    'untitled content',
    facts(tab('untitled', { state: fresh(withAtom()) })),
    false,
    true,
    false,
    'dot',
  ),
  row('untitled edited', facts(tab('untitled', { state: edited() })), false, true, false, 'dot'),
  row(
    'untitled empty, record failed',
    facts(tab('untitled'), { recordFailed: true }),
    false,
    false,
    false,
    'none',
  ),
  row(
    'untitled content, record failed',
    facts(tab('untitled', { state: edited() }), { recordFailed: true }),
    false,
    true,
    true,
    'unkept',
  ),
  row('chalk empty', facts(tab('chalk')), false, false, false, 'none'),
  row(
    'chalk content, written',
    facts(tab('chalk', { state: fresh(withAtom()) })),
    false,
    false,
    false,
    'none',
  ),
  row(
    'chalk edited, unwritten',
    facts(tab('chalk', { state: edited() }), { unwritten: true }),
    true,
    false,
    false,
    'none',
  ),
  row(
    'chalk unwritten, record failed, available',
    facts(tab('chalk', { state: edited() }), { unwritten: true, recordFailed: true }),
    true,
    false,
    false,
    'none',
  ),
  row(
    'chalk unavailable, nothing unwritten',
    facts(tab('chalk', { available: false })),
    false,
    false,
    false,
    'unavailable',
  ),
  row(
    'chalk unavailable, unwritten',
    facts(tab('chalk', { available: false, state: edited() }), { unwritten: true }),
    true,
    true,
    false,
    'unavailable',
  ),
  row(
    'chalk unavailable, unwritten, record failed',
    facts(tab('chalk', { available: false, state: edited() }), {
      unwritten: true,
      recordFailed: true,
    }),
    true,
    true,
    true,
    'unkept',
  ),
  row(
    'chalk unavailable, written, record failed',
    facts(tab('chalk', { available: false }), { recordFailed: true }),
    false,
    false,
    false,
    'unavailable',
  ),
  row(
    'picture opened',
    facts(tab('picture', { state: fresh(withAtom()) })),
    false,
    false,
    false,
    'none',
  ),
  row('picture empty', facts(tab('picture')), false, false, false, 'none'),
  row(
    'picture edited',
    facts(tab('picture', { state: edited(withAtom()) })),
    false,
    true,
    false,
    'dot',
  ),
  row(
    'picture edited, record failed',
    facts(tab('picture', { state: edited(withAtom()) }), { recordFailed: true }),
    false,
    true,
    true,
    'unkept',
  ),
  row(
    'picture opened, record failed',
    facts(tab('picture', { state: fresh(withAtom()) }), { recordFailed: true }),
    false,
    false,
    false,
    'none',
  ),
  row('kept empty', facts(tab('kept')), false, true, false, 'dot'),
  row('kept content', facts(tab('kept', { state: edited() })), false, true, false, 'dot'),
  row(
    'kept, record failed',
    facts(tab('kept', { state: edited() }), { recordFailed: true }),
    false,
    true,
    true,
    'unkept',
  ),
];

describe('the status table (Terms, F7, SS6, T6)', () => {
  for (const r of TABLE) {
    it(r.what, () => {
      expect(isPending(r.f)).toBe(r.pending);
      expect(isUnsaved(r.f)).toBe(r.unsaved);
      expect(isUnkept(r.f)).toBe(r.unkept);
      expect(tabMarker(r.f)).toBe(r.marker);
      expect(indexFlags(r.f)).toEqual({
        unsaved: r.unsaved,
        warning: r.marker === 'unavailable' || r.marker === 'unkept',
      });
    });
  }

  it('unwritten changes count only for a file tab', () => {
    for (const kind of ['untitled', 'picture', 'kept'] as const) {
      const f = facts(tab(kind), { unwritten: true });
      expect(f.unwritten).toBe(false);
      expect(isPending(f)).toBe(false);
    }
  });

  it('an unavailable state of a non-file tab is ignored (only a file tab is bound)', () => {
    expect(tabMarker(facts(tab('untitled', { available: false })))).toBe('none');
    expect(tabMarker(facts(tab('kept', { available: false })))).toBe('dot');
  });

  it('a picture edited and undone back to what was opened is not edited', () => {
    expect(isUnsaved(facts(tab('picture', { state: editedAndUndone(withAtom()) })))).toBe(false);
  });

  it('a tab not loaded in this run has no facts', () => {
    expect(
      tabFacts(tab('untitled', { state: null }), { unwritten: false, recordFailed: false }),
    ).toBe(null);
  });
});

describe('unwritten changes (Terms: the hash of serialize(drawing) against the written hash)', () => {
  it('drawingHash is the SHA-256 of serialize(drawing)', async () => {
    const doc = withAtom();
    expect(await drawingHash(doc, sha256)).toBe(await sha256(serialize(doc)));
  });

  it("item (K): a file not in serialize's exact form, written hash equal: nothing unwritten", async () => {
    const doc = withAtom();
    const fileText = JSON.stringify(JSON.parse(serialize(doc)), null, 2); // what is on disk
    expect(fileText).not.toBe(serialize(doc));
    const written = await sha256(serialize(doc)); // T17: the renderer sends this as the written hash
    expect(await hasUnwrittenChanges(doc, written, sha256)).toBe(false);
  });

  it('a changed drawing has unwritten changes; undoing back to it has none', async () => {
    const doc = withAtom();
    const written = await drawingHash(doc, sha256);
    const state = edited(doc);
    expect(await hasUnwrittenChanges(tabStateDoc(state), written, sha256)).toBe(true);
    const back = editedAndUndone(doc);
    expect(await hasUnwrittenChanges(tabStateDoc(back), written, sha256)).toBe(false);
  });

  it('only meta.modified differs: still unwritten (isDirty would ignore it)', async () => {
    const doc = withAtom();
    const written = await drawingHash(doc, sha256);
    const touched: Doc = { ...doc, meta: { ...doc.meta, modified: '2026-11-13T00:00:00.000Z' } };
    expect(await hasUnwrittenChanges(touched, written, sha256)).toBe(true);
  });

  it('a style change is unwritten too', async () => {
    const doc = withAtom();
    const written = await drawingHash(doc, sha256);
    expect(await hasUnwrittenChanges(setStyle(doc, { preset: 'journal' }), written, sha256)).toBe(
      true,
    );
  });

  it('no written hash (never known): unwritten, so nothing is taken as written', async () => {
    expect(await hasUnwrittenChanges(withAtom(), null, sha256)).toBe(true);
  });
});

describe('SS6: unkept from the N7 answer', () => {
  it('a failed record write marks it, a successful one clears it', () => {
    expect(recordFailedAfter({ ok: true })).toBe(false);
    for (const problem of [
      'disk-full',
      'write-denied',
      'write-failed',
      'busy',
      'folder-gone',
    ] as const) {
      expect(recordFailedAfter({ ok: false, problem })).toBe(true);
    }
  });
});

describe('T6 for a tab not loaded in this run: the index flags', () => {
  const cases: [TabKind, boolean, boolean, TabMarker][] = [
    ['untitled', false, false, 'none'],
    ['untitled', true, false, 'dot'],
    ['untitled', true, true, 'unkept'],
    ['picture', true, false, 'dot'],
    ['picture', true, true, 'unkept'],
    ['kept', true, false, 'dot'],
    ['kept', true, true, 'unkept'],
    ['chalk', false, false, 'none'],
    ['chalk', false, true, 'unavailable'],
    ['chalk', true, true, 'unavailable'],
  ];
  for (const [kind, unsaved, warning, marker] of cases) {
    it(`${kind} unsaved=${String(unsaved)} warning=${String(warning)} -> ${marker}`, () => {
      expect(storedMarker({ kind, unsaved, warning })).toBe(marker);
    });
  }

  it('items (B): after a restart an unloaded Untitled with content and an edited picture show their dot', () => {
    expect(markerOf(null, { kind: 'untitled', unsaved: true, warning: false })).toBe('dot');
    expect(markerOf(null, { kind: 'picture', unsaved: true, warning: false })).toBe('dot');
  });

  it('a loaded tab shows its own state, not the stored flags', () => {
    const f = facts(tab('untitled'));
    expect(markerOf(f, { kind: 'untitled', unsaved: true, warning: true })).toBe('none');
  });

  it('the flags round-trip through storedMarker for every row of the table', () => {
    for (const r of TABLE) {
      const stored = storedMarker({ kind: r.f.kind, ...indexFlags(r.f) });
      // A file tab's unkept shows as unavailable once stored: both are the warning icon.
      const expected = r.f.kind === 'chalk' && r.marker === 'unkept' ? 'unavailable' : r.marker;
      expect(stored, r.what).toBe(expected);
    }
  });
});

describe('T16 names and the W3 title', () => {
  it('the accessible name carries the marker', () => {
    expect(accessibleName('Untitled 2', 'none')).toBe('Untitled 2');
    expect(accessibleName('Untitled 2', 'dot')).toBe('Untitled 2, not saved as a file yet');
    expect(accessibleName('esterification', 'unavailable')).toBe("esterification, couldn't save");
    expect(accessibleName('Untitled 3', 'unkept')).toBe("Untitled 3, couldn't keep");
  });

  it('the title: *Untitled 2, esterification while it saves, *esterification (your changes)', () => {
    const untitled = tab('untitled', { state: edited() });
    expect(windowTitleOf(untitled, facts(untitled))).toBe('*Untitled 2 - Chalkbond');
    const saving = tab('chalk', { state: edited() });
    expect(windowTitleOf(saving, facts(saving, { unwritten: true }))).toBe(
      'esterification - Chalkbond',
    );
    const kept = tab('kept', { state: edited() });
    expect(windowTitleOf(kept, facts(kept))).toBe('*esterification (your changes) - Chalkbond');
  });

  it('the title of a picture keeps its extension; an unavailable file with changes gets *', () => {
    const picture = tab('picture', { state: fresh(withAtom()) });
    expect(windowTitleOf(picture, facts(picture))).toBe('ethanol.png - Chalkbond');
    const gone = tab('chalk', { available: false, state: edited() });
    expect(windowTitleOf(gone, facts(gone, { unwritten: true }))).toBe(
      '*esterification - Chalkbond',
    );
  });

  it('a tab not loaded yet takes its * from the stored flag', () => {
    const t = tab('untitled', { state: null });
    expect(windowTitleOf(t, null, { kind: 'untitled', unsaved: true, warning: false })).toBe(
      '*Untitled 2 - Chalkbond',
    );
    expect(windowTitleOf(t, null, { kind: 'untitled', unsaved: false, warning: false })).toBe(
      'Untitled 2 - Chalkbond',
    );
    expect(windowTitleOf(t, null)).toBe('Untitled 2 - Chalkbond');
  });
});

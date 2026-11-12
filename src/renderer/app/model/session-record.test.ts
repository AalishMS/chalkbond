// TB15: a tab's session record (SPEC-app-shell.md SS3, SS11; R50: 100 stored steps; SS2: 64 MiB).
// Run against the real editor controller for the opaque `EditorTabState`.
import { describe, expect, it } from 'vitest';
import { addAtom, emptyDoc, type Doc } from '@core/doc-model';
import { createEditorController, tabStateDoc, type EditorTabState } from '../../editor';
import {
  MAX_RECORD_BYTES,
  RECORD_FORMAT,
  RECORD_VERSION,
  STORED_STEPS,
  buildRecord,
  loadTabRecord,
  parseRecord,
  restoreRecord,
  utf8Length,
  type TabRecord,
} from './session-record';
import type { ReadTabRecordResponse } from '../../../shared/ipc-types';

const NOW = '2026-11-12T09:00:00.000Z';
const VIEW = { zoom: 1.5, centre: { x: 2, y: -1 } };

const atoms = (n: number): Doc => {
  let doc = emptyDoc(NOW);
  for (let i = 0; i < n; i++) doc = addAtom(doc, { element: 'C', x: i, y: 0 })[0];
  return doc;
};

/** A state with `steps` labelled undo steps (step i draws i + 1 atoms). */
function withSteps(steps: number): EditorTabState {
  const c = createEditorController({ clock: () => NOW });
  for (let i = 0; i < steps; i++) c.run({ type: 'replace-doc', doc: atoms(i + 1), label: `s${i}` });
  return c.snapshotState();
}

const fresh = (doc: Doc = emptyDoc(NOW)): EditorTabState =>
  createEditorController({ clock: () => NOW }).newState(doc);

const untitled = { kind: 'untitled' as const, name: 'Untitled 2' };

function parsed(text: string): TabRecord {
  const r = parseRecord(text);
  if (!r.ok) throw new Error(`expected a record, got ${r.damage}`);
  return r.record;
}

/** The labels of the stored undo steps, oldest first. */
const labels = (record: TabRecord): string[] =>
  (record.editor as { past: { label: string }[] }).past.map((s) => s.label);

const valid = (): Record<string, unknown> =>
  JSON.parse(buildRecord(untitled, withSteps(2)).text) as Record<string, unknown>;

describe('buildRecord (SS3, R50)', () => {
  it('holds format, version, name, kind, edited and the editor record; the text starts "{"', () => {
    const built = buildRecord(untitled, withSteps(2));
    expect(built.text.startsWith('{')).toBe(true);
    expect(built.maxSteps).toBe(STORED_STEPS);
    const record = JSON.parse(built.text) as Record<string, unknown>;
    expect(Object.keys(record).sort()).toEqual(
      ['editor', 'edited', 'format', 'kind', 'name', 'version'].sort(),
    );
    expect(record).toMatchObject({
      format: RECORD_FORMAT,
      version: RECORD_VERSION,
      name: 'Untitled 2',
      kind: 'untitled',
      edited: false,
    });
    expect(labels(parsed(built.text))).toEqual(['s0', 's1']);
  });

  it('keeps the newest 100 undo steps (R50)', () => {
    const record = parsed(buildRecord(untitled, withSteps(105)).text);
    expect(labels(record)).toHaveLength(100);
    expect(labels(record)[0]).toBe('s5');
    expect(labels(record).at(-1)).toBe('s104');
  });

  it('edited is true only for a picture tab edited since it was opened', () => {
    const picture = { kind: 'picture' as const, name: 'ethanol.png' };
    expect(parsed(buildRecord(picture, fresh(atoms(1))).text).edited).toBe(false);
    expect(parsed(buildRecord(picture, withSteps(1)).text).edited).toBe(true);
    // Other kinds never carry it, even when their drawing changed.
    expect(parsed(buildRecord(untitled, withSteps(1)).text).edited).toBe(false);
    const kept = { kind: 'kept' as const, name: 'ester (your changes)' };
    expect(parsed(buildRecord(kept, withSteps(1)).text).edited).toBe(false);
  });

  it('a record over the cap halves maxSteps until it fits; the oldest steps go first', () => {
    const state = withSteps(40);
    const full = buildRecord(untitled, state).text;
    const twelve = buildRecord(untitled, state, { maxSteps: 12 }).text;
    // A cap the 25-step record misses and the 12-step record meets.
    const cap = utf8Length(twelve);
    expect(utf8Length(full)).toBeGreaterThan(cap);
    const built = buildRecord(untitled, state, { maxBytes: cap });
    expect(built.maxSteps).toBe(12);
    expect(utf8Length(built.text)).toBeLessThanOrEqual(cap);
    const kept = labels(parsed(built.text));
    expect(kept).toEqual(Array.from({ length: 12 }, (_, i) => `s${28 + i}`));
    expect(tabStateDoc(restored(built.text))).toEqual(tabStateDoc(state));
  });

  it('is never refused: when even no step fits, the drawing alone is the record', () => {
    const state = withSteps(5);
    const built = buildRecord(untitled, state, { maxBytes: 10 });
    expect(built.maxSteps).toBe(0);
    expect(labels(parsed(built.text))).toEqual([]);
    expect(tabStateDoc(restored(built.text))).toEqual(tabStateDoc(state));
  });

  it('the default cap is 64 MiB of UTF-8 (SS2)', () => {
    expect(MAX_RECORD_BYTES).toBe(64 * 1024 * 1024);
  });
});

function restored(text: string): EditorTabState {
  const r = restoreRecord(parsed(text), { clock: () => NOW, view: VIEW, saved: 'current' });
  if (!r.ok) throw new Error(`expected a state, got ${r.damage}`);
  return r.state;
}

describe('utf8Length', () => {
  it('counts UTF-8 bytes: ASCII, two-byte, three-byte, a surrogate pair and a lone surrogate', () => {
    for (const text of [
      '',
      'abc',
      'é',
      'Ω→',
      'न',
      '😀',
      'a😀b',
      '\ud800',
      '\udc00x',
      'x\ud800',
      '\ud800x',
    ]) {
      expect(utf8Length(text), JSON.stringify(text)).toBe(new TextEncoder().encode(text).length);
    }
  });
});

describe('parseRecord (SS3 strict; SS11 renderer half)', () => {
  it('reads back what buildRecord wrote', () => {
    const record = parsed(buildRecord({ kind: 'chalk', name: 'ester.chalk' }, withSteps(3)).text);
    expect(record.kind).toBe('chalk');
    expect(record.name).toBe('ester.chalk');
    expect(labels(record)).toEqual(['s0', 's1', 's2']);
  });

  const damaged = (value: unknown): string => {
    const r = parseRecord(typeof value === 'string' ? value : JSON.stringify(value));
    expect(r.ok).toBe(false);
    return r.ok ? '' : r.damage;
  };

  it('text that is not JSON is damage, never a throw', () => {
    for (const text of ['', '{', '{"format":"chalkbond-tab", broken', 'PK\u0003\u0004']) {
      expect(damaged(text)).toBe('not-json');
    }
  });

  it('a wrong shape is damage: extra key, wrong format or version, bad kind, bad types', () => {
    const cases: Record<string, unknown>[] = [
      { ...valid(), extra: 1 },
      { ...valid(), format: 'chalkbond-history' },
      { ...valid(), version: 2 },
      { ...valid(), kind: 'recovered' },
      { ...valid(), name: 7 },
      { ...valid(), name: 'x'.repeat(256) },
      { ...valid(), edited: 'yes' },
      { ...valid(), editor: null },
      { ...valid(), editor: [] },
      { ...valid(), editor: { format: 'other', version: 1, file: '{}', past: [] } },
    ];
    const missing = valid();
    delete missing['edited'];
    cases.push(missing);
    for (const c of cases) expect(damaged(c), JSON.stringify(c).slice(0, 80)).toBe('not-a-record');
    for (const v of [null, 1, '"x"', [valid()]]) expect(damaged(v)).toBe('not-a-record');
  });

  it('a name of 255 characters is fine', () => {
    expect(parseRecord(JSON.stringify({ ...valid(), name: 'x'.repeat(255) })).ok).toBe(true);
  });
});

describe('restoreRecord (D2 through the editor)', () => {
  it('gives the state with its view; saved: current is clean, unknown is dirty', () => {
    const text = buildRecord(untitled, withSteps(3)).text;
    const clean = restoreRecord(parsed(text), { clock: () => NOW, view: VIEW, saved: 'current' });
    expect(clean.ok && clean.droppedSteps).toBe(0);
    const dirty = restoreRecord(parsed(text), { clock: () => NOW, view: VIEW, saved: 'unknown' });
    expect(dirty.ok).toBe(true);
  });

  it("a record whose drawing does not parse is damage ('history'), never a throw", () => {
    const record = valid();
    const editor = record['editor'] as Record<string, unknown>;
    for (const file of ['', 'not json', '{"format":"chalk","schemaVersion":99}']) {
      const r = restoreRecord(parsed(JSON.stringify({ ...record, editor: { ...editor, file } })), {
        clock: () => NOW,
        view: VIEW,
        saved: 'current',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.damage).toBe('history');
    }
  });

  it('a damaged undo step keeps the drawing and reports the dropped steps', () => {
    const record = valid();
    const editor = record['editor'] as { past: { patches: unknown[]; inverse: unknown[] }[] };
    const broken = [{ op: 'replace', path: ['atoms', 'nope', 'x'], value: 1 }];
    const oldest = editor.past[0] as { patches: unknown[]; inverse: unknown[] };
    oldest.patches = broken;
    oldest.inverse = broken;
    const r = restoreRecord(parsed(JSON.stringify(record)), {
      clock: () => NOW,
      view: VIEW,
      saved: 'current',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.droppedSteps).toBeGreaterThan(0);
      expect(Object.keys(tabStateDoc(r.state).atoms)).toHaveLength(2);
    }
  });
});

describe('loadTabRecord: I11, then the strict parse; damage sends N10 (SS7, SS11)', () => {
  const ID = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
  const OPTIONS = { clock: () => NOW, view: VIEW, saved: 'current' as const };

  function ports(answer: ReadTabRecordResponse | Error) {
    const reads: string[] = [];
    const damaged: string[] = [];
    return {
      reads,
      damaged,
      readTabRecord: (tabId: string): Promise<ReadTabRecordResponse> => {
        reads.push(tabId);
        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
      },
      damagedTabRecord: (tabId: string): void => {
        damaged.push(tabId);
      },
    };
  }

  it('a good record gives its record and state; nothing is moved', async () => {
    const p = ports({ ok: true, text: buildRecord(untitled, withSteps(2)).text });
    const r = await loadTabRecord(ID, p, OPTIONS);
    expect(p.reads).toEqual([ID]);
    expect(p.damaged).toEqual([]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.name).toBe('Untitled 2');
      expect(r.droppedSteps).toBe(0);
      expect(Object.keys(tabStateDoc(r.state).atoms)).toHaveLength(2);
    }
  });

  it('not JSON, not a record, or a drawing that does not parse: N10, damaged', async () => {
    const record = valid();
    const editor = record['editor'] as Record<string, unknown>;
    const texts: [string, string][] = [
      ['{ broken', 'not-json'],
      [JSON.stringify({ ...record, kind: 'recovered' }), 'not-a-record'],
      [JSON.stringify({ ...record, editor: { ...editor, file: 'nope' } }), 'history'],
    ];
    for (const [text, damage] of texts) {
      const p = ports({ ok: true, text });
      expect(await loadTabRecord(ID, p, OPTIONS)).toEqual({
        ok: false,
        problem: 'damaged',
        damage,
      });
      expect(p.damaged).toEqual([ID]);
    }
  });

  it('a record over 64 MiB is damage too (main moves it aside, as it does at start)', async () => {
    const p = ports({ ok: false, problem: 'too-large' });
    expect(await loadTabRecord(ID, p, OPTIONS)).toEqual({
      ok: false,
      problem: 'damaged',
      damage: 'too-large',
    });
    expect(p.damaged).toEqual([ID]);
  });

  it('missing and unreadable are not damage: nothing is moved', async () => {
    for (const problem of ['missing', 'unreadable'] as const) {
      const p = ports({ ok: false, problem });
      expect(await loadTabRecord(ID, p, OPTIONS)).toEqual({ ok: false, problem });
      expect(p.damaged).toEqual([]);
    }
  });

  it('a refused or failed read is unreadable and never throws', async () => {
    const p = ports(new Error('Refused session request'));
    expect(await loadTabRecord(ID, p, OPTIONS)).toEqual({ ok: false, problem: 'unreadable' });
    expect(p.damaged).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { kitchenSinkDoc } from './__fixtures__/kitchen-sink';
import v0Ethanol from './__fixtures__/v0-ethanol.chalk?raw';
import { emptyDoc } from './doc';
import type { Migrations } from './migrations';
import { MAX_FILE_BYTES, parse, parseWith, serialize, type ParseErrorCode } from './serialize';
import type { Doc } from './types';

const NOW = '2026-11-09T00:00:00.000Z';

/** Same doc, every record and object rebuilt with keys in reverse insertion order. */
function reversedKeys<T>(v: T): T {
  if (Array.isArray(v)) return v.map(reversedKeys) as T;
  if (v === null || typeof v !== 'object') return v;
  return Object.fromEntries(
    Object.entries(v)
      .reverse()
      .map(([k, x]) => [k, reversedKeys(x)]),
  ) as T;
}

function parseError(text: string): {
  code: ParseErrorCode;
  message: string;
  details?: readonly string[];
} {
  const r = parse(text);
  if (r.ok) throw new Error('expected a parse error');
  return r.error;
}

/** `.chalk` text for an arbitrary (possibly invalid) doc value. */
function file(doc: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ format: 'chalkbond', schemaVersion: 1, doc, ...extra });
}

describe('serialize', () => {
  it('writes the envelope with stable key order, 2-space JSON and a trailing newline', () => {
    expect(serialize(emptyDoc(NOW))).toBe(
      [
        '{',
        '  "format": "chalkbond",',
        '  "schemaVersion": 1,',
        '  "doc": {',
        '    "schemaVersion": 1,',
        '    "atoms": {},',
        '    "bonds": {},',
        '    "groups": {},',
        '    "meta": {',
        `      "created": "${NOW}",`,
        `      "modified": "${NOW}"`,
        '    },',
        '    "nextId": 1,',
        '    "objects": {},',
        '    "style": {',
        '      "overrides": {},',
        '      "preset": "slides"',
        '    },',
        '    "zOrder": []',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('is byte-identical for equal docs regardless of key insertion order', () => {
    const doc = kitchenSinkDoc();
    const shuffled = reversedKeys(doc);
    expect(shuffled).toEqual(doc);
    expect(Object.keys(shuffled.atoms)).not.toEqual(Object.keys(doc.atoms));
    expect(serialize(shuffled)).toBe(serialize(doc));
  });

  it('orders records by id number and leads items with id/type', () => {
    const text = serialize(kitchenSinkDoc());
    expect(text.indexOf('"o9": {')).toBeLessThan(text.indexOf('"o10": {'));
    expect(text).toContain('"o6": {\n        "id": "o6",\n        "type": "arrow",');
    expect(text).toContain(
      '"rect": {\n          "x": -0.5,\n          "y": -1,\n          "w": 2.7,',
    );
  });

  it('writes -0 as 0', () => {
    const doc = {
      ...emptyDoc(NOW),
      nextId: 2,
      atoms: { a1: { id: 'a1', x: -0, y: 0, element: 'C', charge: 0, radical: 0 } },
    } as unknown as Doc;
    expect(serialize(doc)).toContain('"x": 0,');
  });
});

describe('parse', () => {
  it('round-trips a doc using every item kind', () => {
    const doc = kitchenSinkDoc();
    const r = parse(serialize(doc));
    expect(r).toEqual({ ok: true, value: doc });
    expect(r.ok && Object.isFrozen(r.value.atoms)).toBe(true);
  });

  it('round-trips through its own output byte-for-byte', () => {
    const text = serialize(kitchenSinkDoc());
    const r = parse(text);
    expect(r.ok && serialize(r.value)).toBe(text);
  });

  it.each<[string, string, ParseErrorCode]>([
    ['malformed JSON', '{ "format": "chalkbond", ', 'invalid-json'],
    ['empty text', '', 'invalid-json'],
    ['JSON that is not an object', '[1, 2]', 'not-chalkbond'],
    [
      'wrong format',
      JSON.stringify({ format: 'something-else', schemaVersion: 1, doc: {} }),
      'not-chalkbond',
    ],
    ['missing doc', JSON.stringify({ format: 'chalkbond', schemaVersion: 1 }), 'not-chalkbond'],
    [
      'non-integer version',
      JSON.stringify({ format: 'chalkbond', schemaVersion: '1', doc: {} }),
      'unsupported-version',
    ],
    [
      'negative version',
      JSON.stringify({ format: 'chalkbond', schemaVersion: -1, doc: {} }),
      'unsupported-version',
    ],
    [
      'version with no migration path',
      JSON.stringify({ format: 'chalkbond', schemaVersion: 0, doc: {} }),
      'unsupported-version',
    ],
    [
      'newer schemaVersion',
      JSON.stringify({ format: 'chalkbond', schemaVersion: 2, doc: {} }),
      'newer-version',
    ],
  ])('rejects %s', (_name, text, code) => {
    expect(parseError(text).code).toBe(code);
  });

  it('says a newer file was created by a newer version of Chalkbond', () => {
    expect(parseError(file({}, { schemaVersion: 7 })).message).toMatch(
      /newer version of Chalkbond/,
    );
  });

  it('rejects schema violations with readable details', () => {
    const doc = JSON.parse(JSON.stringify(kitchenSinkDoc()));
    delete doc.atoms.a1.element;
    doc.bonds.b4.order = 4;
    doc.objects.o6.colour = '#000000'; // unknown key
    const err = parseError(file(doc));
    expect(err.code).toBe('schema');
    expect(err.details).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^atoms\.a1\.element:/),
        expect.stringMatching(/^bonds\.b4\.order:/),
        expect.stringMatching(/^objects\.o6:.*colour/),
      ]),
    );
  });

  it('lists at most 10 schema issues', () => {
    const doc = JSON.parse(JSON.stringify(emptyDoc(NOW)));
    for (let i = 1; i <= 15; i++) doc.atoms[`a${i}`] = { id: `a${i}` };
    expect(parseError(file(doc)).details).toHaveLength(10);
  });

  it('rejects invariant violations, listing the first 10', () => {
    const doc = JSON.parse(JSON.stringify(emptyDoc(NOW)));
    doc.nextId = 100;
    for (let i = 1; i <= 12; i++) {
      doc.bonds[`b${i}`] = {
        id: `b${i}`,
        a1: 'a90',
        a2: 'a91',
        order: 1,
        stereo: 'none',
        doublePlacement: 'auto',
      };
    }
    const err = parseError(file(doc));
    expect(err.code).toBe('invariants');
    expect(err.message).toMatch(/\d+ problems/);
    expect(err.details).toHaveLength(10);
    expect(err.details?.[0]).toMatch(/^bond-missing-atom:/);
  });

  it(`rejects files over ${MAX_FILE_BYTES / 1024 / 1024} MB (counting UTF-8 bytes)`, () => {
    expect(parseError(' '.repeat(MAX_FILE_BYTES + 1)).code).toBe('too-large');
    // 7M three-byte characters = 21 MB of UTF-8 in a 7M-character string.
    expect(parseError('€'.repeat(7 * 1024 * 1024)).code).toBe('too-large');
    // 4-byte characters (surrogate pairs) count as 4.
    expect(parseError('😀'.repeat(5.5 * 1024 * 1024)).code).toBe('too-large');
    // Just under the limit is fine size-wise (then fails as JSON).
    expect(parseError(' '.repeat(MAX_FILE_BYTES)).code).toBe('invalid-json');
  });
});

describe('migrations', () => {
  // A synthetic v0 format: arrays instead of records, optional fields omitted, no counter.
  type V0 = {
    atoms: { id: string; x: number; y: number; element: string; charge?: number }[];
    bonds: { id: string; a1: string; a2: string; order: number }[];
    title?: string;
    created: string;
  };
  const v0ToV1 = (raw: unknown): unknown => {
    const d = raw as V0;
    const ids = [...d.atoms, ...d.bonds].map((x) => Number(x.id.slice(1)));
    return {
      schemaVersion: 1,
      atoms: Object.fromEntries(d.atoms.map((a) => [a.id, { charge: 0, radical: 0, ...a }])),
      bonds: Object.fromEntries(
        d.bonds.map((b) => [b.id, { stereo: 'none', doublePlacement: 'auto', ...b }]),
      ),
      objects: {},
      zOrder: [],
      groups: {},
      nextId: Math.max(0, ...ids) + 1,
      style: { preset: 'slides', overrides: {} },
      meta: { ...(d.title ? { title: d.title } : {}), created: d.created, modified: d.created },
    };
  };

  it('runs a v0 file through v0 → v1 and parses it', () => {
    const r = parseWith(v0Ethanol, { 0: v0ToV1 }, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.value.atoms)).toEqual(['a1', 'a2', 'a3']);
    expect(r.value.bonds['b5' as keyof Doc['bonds']]).toMatchObject({
      a1: 'a2',
      a2: 'a3',
      stereo: 'none',
    });
    expect(r.value.nextId).toBe(6);
    expect(r.value.meta.title).toBe('Ethanol (v0)');
  });

  it('applies migrations in sequence', () => {
    const calls: number[] = [];
    const chain: Migrations = {
      0: (d) => (calls.push(0), d),
      1: (d) => (calls.push(1), d),
    };
    const text = JSON.stringify({ format: 'chalkbond', schemaVersion: 0, doc: kitchenSinkDoc() });
    expect(parseWith(text, chain, 2).ok).toBe(true);
    expect(calls).toEqual([0, 1]);
  });

  it('reports a migration that throws', () => {
    const r = parseWith(
      v0Ethanol,
      {
        0: () => {
          throw new Error('boom');
        },
      },
      1,
    );
    expect(r.ok === false && r.error).toMatchObject({
      code: 'migration-failed',
      message: expect.stringMatching(/boom/),
    });
  });

  it('validates the migrated result against the current schema', () => {
    const r = parseWith(v0Ethanol, { 0: (d) => d }, 1);
    expect(r.ok === false && r.error.code).toBe('schema');
  });

  it('the shipped v0 fixture is rejected by this build (no real v0 migration)', () => {
    expect(parseError(v0Ethanol).code).toBe('unsupported-version');
  });
});

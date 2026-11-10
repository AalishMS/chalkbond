import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addAtom,
  addBond,
  addObject,
  bounds as docBounds,
  createHistory,
  current,
  emptyDoc,
  everything,
  parse,
  serialize,
  transformItems,
  translation,
  type AtomId,
  type BondId,
  type Doc,
  type ObjectId,
  type Rect,
  type Selection,
} from '../doc-model';
import { command, run } from '../doc-model/__fixtures__/arbitraries';
import { checkXml } from './__fixtures__/xml-check';
import { unionAll } from './geom';
import { render } from './render';
import { ALLOWED_ATTRIBUTES, ALLOWED_ELEMENTS } from './svg-write';
import { renderSvg, toSvg } from './to-svg';
import type { Scene } from './types';

// SPEC-svg-render.md "Testing": the seven properties over docs reached by random doc-model edit
// sequences (the same command generator as doc-model's own property suite).
const RUNS = 1000;
const LIGHT_RUNS = 300;
const TIMEOUT = 120_000;
const NOW = '2026-11-09T00:00:00.000Z';
const sequence = fc.array(command, { minLength: 1, maxLength: 50, size: 'max' });

function build(cmds: readonly Parameters<typeof run>[1][]): Doc {
  let n = 0;
  const clock = () => `2026-11-09T00:00:00.${String(++n % 1000).padStart(3, '0')}Z`;
  return current(cmds.reduce(run, createHistory(emptyDoc(NOW), { clock })));
}

const docOf = sequence.map(build);
const L = 40;

const joined = (scene: Scene): string => scene.parts.map((p) => p.svg).join('\n');
const wrap = (scene: Scene): string => `<g>\n${joined(scene)}\n</g>`;
const allowedElements: ReadonlySet<string> = new Set(ALLOWED_ELEMENTS);

/** Every element and attribute name is on the allow-list. */
function expectAllowListed(xml: string): void {
  for (const e of checkXml(xml).elements) {
    expect(allowedElements.has(e.name) || e.name === 'g').toBe(true);
    const allowed: readonly string[] =
      ALLOWED_ATTRIBUTES[e.name as keyof typeof ALLOWED_ATTRIBUTES] ?? [];
    for (const a of e.attrNames) expect(allowed).toContain(a);
  }
}

/**
 * No two distinct anchor points of the doc (atoms, arrow ends, text positions) lie within 0.01
 * BLU of each other. The renderer skips a segment shorter than an absolute 1e-9 pt, so a pair
 * 1e-164 BLU apart is drawn or skipped depending on the float rounding of a translation or of a
 * scale: a property about invariance cannot hold there, and the doc-model generator does
 * produce such pairs.
 */
function wellSeparated(doc: Doc): boolean {
  const pts: { x: number; y: number }[] = Object.values(doc.atoms).map((a) => ({ x: a.x, y: a.y }));
  for (const o of Object.values(doc.objects)) {
    if (o.type === 'arrow') pts.push(o.from, o.to);
    else if (o.type === 'curved-arrow') {
      for (const end of [o.from, o.to]) if (end.kind === 'point') pts.push(end.p);
    } else if (o.type === 'plus' || o.type === 'text' || o.type === 'callout') pts.push(o.at);
  }
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.abs(pts[i]!.x - pts[j]!.x) + Math.abs(pts[i]!.y - pts[j]!.y);
      if (d !== 0 && d < 0.01) return false;
    }
  }
  return true;
}

function reversed<T>(rec: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(Object.entries(rec).reverse());
}

describe('property 1: render never throws and writes well-formed, allow-listed markup', () => {
  it('holds on random docs', { timeout: TIMEOUT }, () => {
    fc.assert(
      fc.property(docOf, (doc) => {
        const scene = render(doc);
        expectAllowListed(wrap(scene));
        const out = toSvg(scene, { metadata: 'm' });
        expectAllowListed(out.svg);
      }),
      { numRuns: LIGHT_RUNS },
    );
  });
});

describe('property 2: determinism', () => {
  it(
    'same input twice, parse(serialize(doc)) and reversed record order give the same bytes',
    {
      timeout: TIMEOUT,
    },
    () => {
      fc.assert(
        fc.property(docOf, (doc) => {
          const first = renderSvg(doc).svg;
          expect(renderSvg(doc).svg).toBe(first);
          const parsed = parse(serialize(doc));
          expect(parsed).toMatchObject({ ok: true });
          if (parsed.ok) expect(renderSvg(parsed.value).svg).toBe(first);
          const flipped: Doc = {
            ...doc,
            atoms: reversed(doc.atoms),
            bonds: reversed(doc.bonds),
            objects: reversed(doc.objects),
          };
          expect(renderSvg(flipped).svg).toBe(first);
        }),
        { numRuns: RUNS },
      );
    },
  );
});

describe('property 3: numeric attribute tokens are plain decimals', () => {
  const NOT_NUMERIC = new Set([
    'xmlns',
    'fill',
    'stroke',
    'font-family',
    'font-weight',
    'font-style',
    'stroke-linecap',
    'stroke-linejoin',
    'xml:space',
    'id',
  ]);
  it('holds on random docs', { timeout: TIMEOUT }, () => {
    fc.assert(
      fc.property(docOf, (doc) => {
        const svg = renderSvg(doc, { metadata: 'm 1e-7' }).svg;
        for (const e of checkXml(svg).elements) {
          for (const [name, value] of Object.entries(e.attrs)) {
            if (NOT_NUMERIC.has(name)) continue;
            const tokens = value
              .replace(/translate|scale/g, ' ')
              .replace(/[MLQCZ]/g, ' ')
              .replace(/pt\b/g, '')
              .split(/[\s,()]+/)
              .filter((t) => t !== '');
            for (const t of tokens) expect(t).toMatch(/^-?\d+(\.\d{1,3})?$/);
            for (const t of tokens) expect(t).not.toBe('-0');
          }
        }
      }),
      { numRuns: LIGHT_RUNS },
    );
  });
});

const picks = fc.record({
  atoms: fc.array(fc.nat({ max: 1000 }), { maxLength: 6 }),
  bonds: fc.array(fc.nat({ max: 1000 }), { maxLength: 6 }),
  objects: fc.array(fc.nat({ max: 1000 }), { maxLength: 6 }),
});

function pick<T extends string>(all: readonly T[], is: readonly number[]): Set<T> {
  return new Set(all.length === 0 ? [] : is.map((i) => all[i % all.length] as T));
}

describe('property 4: a subset renders as the matching slice of the whole', () => {
  it('each part equals the same-key part of the full render', { timeout: TIMEOUT }, () => {
    fc.assert(
      fc.property(docOf, picks, (doc, p) => {
        const only: Selection = {
          atoms: pick(Object.keys(doc.atoms) as AtomId[], p.atoms),
          bonds: pick(Object.keys(doc.bonds) as BondId[], p.bonds),
          objects: pick(Object.keys(doc.objects) as ObjectId[], p.objects),
        };
        const full = new Map(render(doc).parts.map((x) => [x.key, x.svg]));
        for (const part of render(doc, { only }).parts) {
          expect(full.get(part.key)).toBe(part.svg);
        }
      }),
      { numRuns: LIGHT_RUNS },
    );
  });
});

describe('property 5: bounds', () => {
  const TOL = 0.002;
  const near = (a: number, b: number, tol = TOL) =>
    expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

  /**
   * The pt image of doc-model's bounds of the keys that produced parts lies inside `bounds`
   * (within TOL). Two kinds of key are left out because their geometry legitimately is not ink:
   * - a callout whose anchor lies inside the padded text box draws no leader, so its anchor
   *   (which doc-model's bounds count) need not be ink;
   * - a hash bond draws its rungs at the centres of `count` equal slices, so its ink stops short
   *   of the end atoms by up to half a rung spacing minus half the line width (0.002 pt for the
   *   shortest bond, 6.012 pt, in the regression below; seed 901270341).
   */
  function expectContainsDrawn(doc: Doc, scene: Scene): void {
    const b = scene.bounds;
    if (!b) return;
    const drawn = (prefix: string) =>
      scene.parts.filter((x) => x.key.startsWith(prefix)).map((x) => x.key.slice(prefix.length));
    const sel: Selection = {
      atoms: new Set(drawn('atom:') as AtomId[]),
      bonds: new Set((drawn('bond:') as BondId[]).filter((id) => doc.bonds[id]?.stereo !== 'hash')),
      objects: new Set(
        (drawn('obj:') as ObjectId[]).filter((id) => doc.objects[id]?.type !== 'callout'),
      ),
    };
    const inner = docBounds(doc, sel);
    if (!inner) return;
    expect(b.x).toBeLessThanOrEqual(inner.x * L + TOL);
    expect(b.y).toBeLessThanOrEqual(inner.y * L + TOL);
    expect(b.x + b.w).toBeGreaterThanOrEqual((inner.x + inner.w) * L - TOL);
    expect(b.y + b.h).toBeGreaterThanOrEqual((inner.y + inner.h) * L - TOL);
  }

  it('contains the drawn items for a short hash bond (shrunk counterexample)', () => {
    // Narrow end at the origin atom, wide end at y = -0.1503 BLU (6.012 pt): below three rungs of
    // spacing the first rung sits 1.002 pt from the end atom, its ink 0.002 pt short of it.
    const [d1, from] = addAtom(emptyDoc(NOW), { x: 0, y: 0 });
    const [d2, to] = addAtom(d1, { x: 0, y: -0.15030000000000007 });
    const [doc] = addBond(d2, from, to, { stereo: 'hash' });
    expectContainsDrawn(doc, render(doc));
  });

  it('equals the union of extents and contains the drawn items', { timeout: TIMEOUT }, () => {
    fc.assert(
      fc.property(docOf, (doc) => {
        const scene = render(doc);
        const union = unionAll(Object.values(scene.extents));
        if (!scene.bounds) {
          expect(union).toBeNull();
          return;
        }
        expect(union).not.toBeNull();
        for (const k of ['x', 'y', 'w', 'h'] as const) near(scene.bounds[k], union![k], 1e-9);
        expectContainsDrawn(doc, scene);
      }),
      { numRuns: LIGHT_RUNS },
    );
  });

  it('translating the document translates the bounds', { timeout: TIMEOUT }, () => {
    const shift = fc.record({
      dx: fc.integer({ min: -40, max: 40 }).map((n) => n / 4),
      dy: fc.integer({ min: -40, max: 40 }).map((n) => n / 4),
    });
    fc.assert(
      fc.property(docOf, shift, (doc, { dx, dy }) => {
        fc.pre(wellSeparated(doc));
        const before = render(doc).bounds as Rect | null;
        const moved = transformItems(doc, everything(doc), translation(dx, dy));
        const after = render(moved).bounds as Rect | null;
        expect(after === null).toBe(before === null);
        if (!before || !after) return;
        near(after.x, before.x + dx * L);
        near(after.y, before.y + dy * L);
        near(after.w, before.w);
        near(after.h, before.h);
      }),
      { numRuns: LIGHT_RUNS },
    );
  });
});

describe('property 6: uniform scale by a power of two scales the bounds', () => {
  it('holds for bondLength, lineWidth and fontSize scaled together', { timeout: TIMEOUT }, () => {
    const k = fc.constantFrom(0.25, 0.5, 2, 4);
    fc.assert(
      fc.property(docOf, k, (doc, f) => {
        fc.pre(wellSeparated(doc));
        const withStyle = (scale: number): Doc => ({
          ...doc,
          style: {
            ...doc.style,
            overrides: {
              bondLength: 40 * scale,
              lineWidth: 2 * scale,
              fontSize: 24 * scale,
            },
          },
        });
        const base = render(withStyle(1)).bounds;
        const scaled = render(withStyle(f)).bounds;
        expect(scaled === null).toBe(base === null);
        if (!base || !scaled) return;
        const tol = 0.005 * f;
        for (const key of ['x', 'y', 'w', 'h'] as const) {
          expect(Math.abs(scaled[key] - base[key] * f)).toBeLessThanOrEqual(tol);
        }
      }),
      { numRuns: LIGHT_RUNS },
    );
  });
});

describe('property 7: arbitrary Unicode in runs, labels, numbers and metadata is safe', () => {
  const nasty = fc.oneof(
    fc.string({ unit: 'binary', maxLength: 12 }),
    fc.string({ maxLength: 12 }),
    fc.constantFrom(
      '<script>alert(1)</script>',
      '"onload=alert(1)',
      ']]>',
      '\ud800',
      '\udfff x',
      '😀 emoji',
      '& &amp; &#x41;',
      '\u0000\u0008￾￿',
      'a\r\nb\rc',
    ),
  );

  /** What the writer must emit for `s`: illegal characters become U+FFFD, CR and CRLF become LF. */
  function legal(s: string): string {
    let out = '';
    for (const ch of s.replace(/\r\n?/g, '\n')) {
      const cp = ch.codePointAt(0) as number;
      const ok =
        cp === 9 ||
        cp === 10 ||
        (cp >= 0x20 && cp <= 0xd7ff) ||
        (cp >= 0xe000 && cp <= 0xfffd) ||
        (cp >= 0x10000 && cp <= 0x10ffff);
      out += ok ? ch : '�';
    }
    return out;
  }
  const bare = (s: string): string => s.replace(/\s+/g, '');
  const sortedChars = (s: string): string[] => [...bare(s)].sort();
  const textOf = (xml: string): string =>
    checkXml(xml)
      .elements.filter((e) => e.name === 'text')
      .map((e) => e.text)
      .join('');

  it('keeps every document well-formed, with no new elements', { timeout: TIMEOUT }, () => {
    fc.assert(
      fc.property(docOf, nasty, nasty, nasty, nasty, (doc, label, number, runText, meta) => {
        const atoms = Object.fromEntries(
          Object.entries(doc.atoms).map(([id, a]) => [id, { ...a, label, number }]),
        );
        const objects = Object.fromEntries(
          Object.entries(doc.objects).map(([id, o]) => {
            switch (o.type) {
              case 'text':
              case 'caption':
              case 'callout':
                return [id, { ...o, runs: [{ text: runText, script: 'sup' as const }] }];
              case 'bracket':
                return [id, { ...o, corner: [{ text: runText }] }];
              default:
                return [id, o];
            }
          }),
        );
        const out = renderSvg({ ...doc, atoms, objects } as Doc, { metadata: meta });
        expectAllowListed(out.svg);
        const parsed = checkXml(out.svg);
        const metadata = parsed.elements.filter((e) => e.name === 'metadata');
        expect(metadata).toHaveLength(1);
        expect(metadata[0]?.text).toBe(legal(meta));
      }),
      { numRuns: LIGHT_RUNS },
    );
  });

  it('round-trips text object runs, atom labels and atom numbers', { timeout: TIMEOUT }, () => {
    fc.assert(
      fc.property(nasty, nasty, nasty, (s, label, number) => {
        const empty = emptyDoc(NOW);
        const [textDoc] = addObject(empty, {
          type: 'text',
          at: { x: 0, y: 0 },
          runs: [{ text: s }],
          align: 'left',
        });
        const text = textOf(renderSvg(textDoc).svg);
        expect(bare(text)).toBe(bare(legal(s.replace(/[\r\n]+/g, ' '))));

        // A bare atom with a typed label: the glyphs are the label's, in any order.
        const [atomDoc] = addAtom(empty, { x: 0, y: 0, element: 'He', charge: 0 });
        const id = Object.keys(atomDoc.atoms)[0] as AtomId;
        const a = atomDoc.atoms[id]!;
        const noLabel = textOf(renderSvg({ ...atomDoc, atoms: { [id]: { ...a, number } } }).svg);
        expect(sortedChars(noLabel)).toEqual(sortedChars(`He${legal(number)}`));
        const labelled = textOf(renderSvg({ ...atomDoc, atoms: { [id]: { ...a, label } } }).svg);
        const typed = legal(label.replace(/[\r\n]+/g, ' '));
        if (bare(typed) !== '') expect(sortedChars(labelled)).toEqual(sortedChars(typed));
      }),
      { numRuns: LIGHT_RUNS },
    );
  });
});

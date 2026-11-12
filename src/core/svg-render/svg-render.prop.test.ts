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
  setStyle,
  transformItems,
  translation,
  type Anchor,
  type AtomId,
  type BondId,
  type Doc,
  type ObjectId,
  type Rect,
  type Selection,
} from '../doc-model';
import { command, run } from '../doc-model/__fixtures__/arbitraries';
import { structuralOracle } from './__fixtures__/structural-oracle';
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
   *   shortest bond, 6.012 pt, in the regression below; seed 901270341);
   * - in structural mode, an object whose position the S2 rule moves off `at x ptPerBlu` (a
   *   curved arrow or callout with an atom-anchor offset, a text attached to an arrow, and the
   *   arrow it is attached to, whose selection brings the text in): the offset is drawn at the
   *   style's scale, so the pt image of doc-model's point is not ink there
   *   (the picture is checked against the oracle and by the S2 tests in render.test.ts);
   * - a caption whose target atom has no ink (no label, no satellite and no bond that drew
   *   anything, e.g. only a zero-length bond): doc-model's bounds count the atom's point, but the
   *   caption sits below ink that is not there (seed -1130545056). The scene's `extents` say
   *   which atoms have ink.
   */
  function expectContainsDrawn(doc: Doc, scene: Scene): void {
    const b = scene.bounds;
    if (!b) return;
    const drawn = (prefix: string) =>
      scene.parts.filter((x) => x.key.startsWith(prefix)).map((x) => x.key.slice(prefix.length));
    const hasInk = (id: AtomId): boolean =>
      `atom:${id}` in scene.extents ||
      Object.values(doc.bonds).some(
        (bond) => (bond.a1 === id || bond.a2 === id) && `bond:${bond.id}` in scene.extents,
      );
    const captionOnInk = (id: ObjectId): boolean => {
      const o = doc.objects[id];
      return o?.type !== 'caption' || o.target.every(hasInk);
    };
    const structural = scene.style.ptPerBlu !== scene.style.bondLength;
    const hasOffset = (a: Anchor): boolean => a.kind === 'atom' && a.offset !== undefined;
    const offStandard = (id: ObjectId): boolean => {
      const o = doc.objects[id];
      if (!structural || !o) return false;
      if (o.type === 'curved-arrow') return hasOffset(o.from) || hasOffset(o.to);
      if (o.type === 'callout') return hasOffset(o.anchor);
      if (o.type === 'text') return o.attachedTo !== undefined;
      // doc-model's selection brings an arrow's attached texts into its bounds, so such an
      // arrow carries the same offset.
      return (
        o.type === 'arrow' &&
        Object.values(doc.objects).some((t) => t.type === 'text' && t.attachedTo?.arrow === id)
      );
    };
    const sel: Selection = {
      atoms: new Set(drawn('atom:') as AtomId[]),
      bonds: new Set((drawn('bond:') as BondId[]).filter((id) => doc.bonds[id]?.stereo !== 'hash')),
      objects: new Set(
        (drawn('obj:') as ObjectId[]).filter(
          (id) => doc.objects[id]?.type !== 'callout' && captionOnInk(id) && !offStandard(id),
        ),
      ),
    };
    const inner = docBounds(doc, sel);
    if (!inner) return;
    const k = scene.style.ptPerBlu;
    expect(b.x).toBeLessThanOrEqual(inner.x * k + TOL);
    expect(b.y).toBeLessThanOrEqual(inner.y * k + TOL);
    expect(b.x + b.w).toBeGreaterThanOrEqual((inner.x + inner.w) * k - TOL);
    expect(b.y + b.h).toBeGreaterThanOrEqual((inner.y + inner.h) * k - TOL);
  }

  it('contains the drawn items for a short hash bond (shrunk counterexample)', () => {
    // Narrow end at the origin atom, wide end at y = -0.1503 BLU (6.012 pt): below three rungs of
    // spacing the first rung sits 1.002 pt from the end atom, its ink 0.002 pt short of it.
    const [d1, from] = addAtom(emptyDoc(NOW), { x: 0, y: 0 });
    const [d2, to] = addAtom(d1, { x: 0, y: -0.15030000000000007 });
    const [doc] = addBond(d2, from, to, { stereo: 'hash' });
    expectContainsDrawn(doc, render(doc));
  });

  it('contains the drawn items for a caption on atoms joined by a zero-length bond (seed -1130545056)', () => {
    // Two unlabelled carbons at one point, a zero-length bond (no ink) and a caption on the first:
    // the only ink is the caption, half a bond length below the target point.
    const [d1, a1] = addAtom(emptyDoc(NOW), { x: 0, y: 0 });
    const [d2, a3] = addAtom(d1, { x: 0, y: 0 });
    const [d3] = addBond(d2, a1, a3);
    const [doc] = addObject(d3, { type: 'caption', runs: [{ text: 'H' }], target: [a1] });
    const scene = render(doc);
    expect(Object.keys(scene.extents)).toEqual([`obj:${Object.keys(doc.objects)[0]}`]);
    expectContainsDrawn(doc, scene);
  });

  it('contains the drawn items for a structural arrow with an attached text (seed 1094994601)', () => {
    // doc-model's selection of the arrow brings its attached text into the hull, but in structural
    // mode that text lies at the arrow's midpoint plus the offset at the style's scale (S2), so
    // neither the text nor the arrow is compared; the other, plain text still is.
    const [d1, arrow] = addObject(setStyle(emptyDoc(NOW), { formula: 'structural' }), {
      type: 'arrow',
      kind: 'forward',
      from: { x: 0, y: 0 },
      to: { x: 2, y: 0 },
    });
    const text = (at: { x: number; y: number }) =>
      ({ type: 'text', at, runs: [{ text: 'H' }], align: 'left' }) as const;
    const [d2] = addObject(d1, {
      ...text({ x: 1, y: -2.7 }),
      attachedTo: { arrow, slot: 'above' },
    });
    const [doc] = addObject(d2, text({ x: 5, y: 3 }));
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
        const scene = render(doc);
        const before = scene.bounds as Rect | null;
        const moved = transformItems(doc, everything(doc), translation(dx, dy));
        const after = render(moved).bounds as Rect | null;
        expect(after === null).toBe(before === null);
        if (!before || !after) return;
        const k = scene.style.ptPerBlu;
        near(after.x, before.x + dx * k);
        near(after.y, before.y + dy * k);
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

describe('property 8: the structural render equals the render of its oracle', () => {
  it('pins the H of the labelled atoms around an acyclic 1.5 chain (seed 3343550)', () => {
    // C–N–N⁺ joined by 1.5 bonds (all at the origin, plus two lone carbons): the end carbon and
    // the N⁺ both need the one π bond the middle N can give, so the system cannot be kekulized and
    // every atom is filled as if singly bonded (CH3, NH, NH3⁺, as the skeletal render shows them).
    // Pinning only the written carbon (CH3 is saturated, so it leaves the π matching) would let
    // N=N⁺ resolve and draw N and NH2⁺ in the oracle: the heteroatoms' H must be pinned too.
    let doc = emptyDoc(NOW);
    const ids: AtomId[] = [];
    for (const [element, charge] of [
      ['C', 0],
      ['N', 1],
      ['C', 0],
      ['N', 0],
      ['C', 0],
    ] as const) {
      const [next, id] = addAtom(doc, { element, charge, x: 0, y: 0 });
      doc = next;
      ids.push(id);
    }
    const [c1, n2, , n4] = ids as [AtomId, AtomId, AtomId, AtomId, AtomId];
    [doc] = addBond(doc, c1, n4, { order: 1.5 });
    [doc] = addBond(doc, n4, n2, { order: 1.5 });
    const structural = setStyle(doc, { formula: 'structural' });
    const got = render(structural);
    const want = render(structuralOracle(structural));
    expect(got.parts).toEqual(want.parts);
    expect(got.extents).toEqual(want.extents);
    expect(got.bounds).toEqual(want.bounds);
    expect(got.notices).toEqual(want.notices);
    // Structural mode draws the heteroatoms as the skeletal render does (Decision 15 (b)); at the
    // origin doubling moves nothing, so their parts are byte-identical.
    const skeletal = render(doc).parts;
    for (const id of [n2, n4]) {
      const part = (parts: Scene['parts']) => parts.find((p) => p.key === `atom:${id}`)?.svg;
      expect(part(got.parts)).toBeDefined();
      expect(part(got.parts)).toEqual(part(skeletal));
    }
  });

  it(
    'same parts, extents, bounds and notices as the skeletal document with the written carbons given explicit H',
    { timeout: TIMEOUT },
    () => {
      fc.assert(
        fc.property(docOf, (doc) => {
          const structural = setStyle(doc, { formula: 'structural' });
          const got = render(structural);
          const want = render(structuralOracle(structural));
          expect(got.parts).toEqual(want.parts);
          expect(got.extents).toEqual(want.extents);
          expect(got.bounds).toEqual(want.bounds);
          expect(got.notices).toEqual(want.notices);
        }),
        { numRuns: RUNS },
      );
    },
  );
});

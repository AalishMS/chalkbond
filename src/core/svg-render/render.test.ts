import { describe, expect, it } from 'vitest';
import { perceive } from '../chem-core';
import {
  addObject,
  type Atom,
  type AtomId,
  type BondId,
  type Doc,
  type ObjectId,
  type Point,
  type Rect,
  type Selection,
} from '../doc-model';
import { kitchenSinkDoc } from '../doc-model/__fixtures__/kitchen-sink';
import { mechanismDoc, twoStepReactionDoc } from '../doc-model/__fixtures__/schemes';
import { inkScan } from './__fixtures__/ink-scan';
import { polygonPoints, textElements } from './__fixtures__/markup';
import {
  aceticAcid,
  benzene,
  ethanol,
  molecule,
  naphthalene,
  stereoCentre,
  type Molecule,
} from './__fixtures__/molecules';
import { checkXml } from './__fixtures__/xml-check';
import { ADVANCE_REGULAR } from './font-metrics';
import { render } from './render';
import { resolveStyle } from './style';
import type { ItemKey, Scene } from './types';

const near = (actual: number, expected: number, digits = 2) =>
  expect(actual).toBeCloseTo(expected, digits);

const joined = (scene: Scene) => scene.parts.map((p) => p.svg).join('\n');
const keys = (scene: Scene) => scene.parts.map((p) => p.key);
const only = (
  atoms: readonly AtomId[] = [],
  bonds: readonly BondId[] = [],
  objects: readonly ObjectId[] = [],
): Selection => ({
  atoms: new Set(atoms),
  bonds: new Set(bonds),
  objects: new Set(objects),
});

/** The strings inside `<text>` elements, in document order, joined. */
const textOf = (svg: string): string =>
  [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join('');

interface PathLine {
  pts: Point[];
  dashed: boolean;
}
function pathLines(svg: string): PathLine[] {
  return [...svg.matchAll(/<path d="([^"]+)"([^>]*)\/>/g)].map((m) => {
    const nums = (m[1]!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const pts: Point[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i]!, y: nums[i + 1]! });
    return { pts, dashed: m[2]!.includes('stroke-dasharray') };
  });
}

const norm = (x: number, y: number) => Math.sqrt(x * x + y * y);
const part = (scene: Scene, key: string) => scene.parts.find((p) => p.key === key)!;

const scenes: [string, Molecule][] = [
  ['benzene', benzene()],
  ['Kekule benzene', benzene('kekule')],
  ['naphthalene', naphthalene()],
  ['ethanol', ethanol()],
  ['mirrored ethanol', ethanol(true)],
  ['acetic acid', aceticAcid()],
  ['stereo centre', stereoCentre()],
  [
    'carboxylate',
    molecule(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0.4, element: 'O', charge: -1 },
        { x: -1, y: 0.4, element: 'O' },
      ],
      [
        [0, 1, { order: 1.5 }],
        [0, 2, { order: 1.5 }],
      ],
    ),
  ],
  [
    'abbreviations',
    molecule(
      [
        { x: 0, y: 0, label: 'CO2H' },
        { x: 1, y: 0.3 },
        { x: 2, y: 0, label: 'Ph' },
        { x: 1, y: 1.3, element: 'N', label: 'NO2' },
      ],
      [
        [0, 1],
        [1, 2],
        [1, 3],
      ],
    ),
  ],
  [
    'bare atoms',
    molecule(
      [
        { x: 0, y: 0, element: 'O' },
        { x: 3, y: 0, element: 'Cl' },
      ],
      [],
    ),
  ],
  [
    'carbanion',
    molecule(
      [
        { x: 0, y: 0, charge: -1, lonePairs: 1 },
        { x: 1, y: 0.4 },
        { x: -1, y: 0.4 },
      ],
      [
        [0, 1],
        [0, 2],
      ],
    ),
  ],
  [
    'radical',
    molecule(
      [
        { x: 0, y: 0, radical: 1 },
        { x: 1, y: 0.4 },
        { x: -1, y: 0.4, element: 'O', radical: 2, number: '3' },
      ],
      [
        [0, 1],
        [0, 2],
      ],
    ),
  ],
  [
    'HCl delta',
    molecule(
      [
        { x: 0, y: 0, element: 'H', partialCharge: 'δ+' },
        { x: 1, y: 0, element: 'Cl', partialCharge: 'δ-', lonePairs: 3 },
      ],
      [[0, 1]],
    ),
  ],
];

describe('render: empty', () => {
  it('an empty document draws nothing', () => {
    const doc = molecule([], []).doc;
    const scene = render(doc);
    expect(scene.parts).toEqual([]);
    expect(scene.bounds).toBeNull();
    expect(scene.extents).toEqual({});
    expect(scene.notices).toEqual([]);
    expect(scene.style).toEqual(resolveStyle(doc.style));
  });

  it('an empty subset draws nothing', () => {
    const scene = render(benzene().doc, { only: only() });
    expect(scene.parts).toEqual([]);
    expect(scene.bounds).toBeNull();
    expect(scene.extents).toEqual({});
  });
});

describe('render: benzene (stored 1.5 orders)', () => {
  const m = benzene();
  const scene = render(m.doc);

  it('draws one ring circle first, then the six bonds in id order, and no atoms', () => {
    expect(keys(scene)).toEqual([`ring:${m.atoms.join(',')}`, ...m.bonds.map((b) => `bond:${b}`)]);
  });

  it('every bond is one plain line (the circle carries the aromaticity)', () => {
    for (const b of m.bonds) {
      const lines = pathLines(part(scene, `bond:${b}`).svg);
      expect(lines).toHaveLength(1);
      expect(lines[0]!.dashed).toBe(false);
    }
  });

  it('the circle is centred on the ring', () => {
    expect(part(scene, `ring:${m.atoms.join(',')}`).svg).toMatch(/^<circle cx="0" cy="0" /);
  });

  it('is well-formed with only allow-listed elements', () => {
    const { elements } = checkXml(`<g>\n${joined(scene)}\n</g>`);
    expect(new Set(elements.slice(1).map((e) => e.name))).toEqual(new Set(['circle', 'path']));
  });

  it('has an extents entry for every part, and none for the skeleton atoms', () => {
    expect(Object.keys(scene.extents)).toEqual(keys(scene));
  });
});

describe('render: Kekule and fused rings', () => {
  it('Kekule benzene: every double bond has its second line inside the ring', () => {
    const m = benzene('kekule');
    const scene = render(m.doc);
    expect(keys(scene).some((k) => k.startsWith('ring:'))).toBe(false);
    m.bonds.forEach((b, i) => {
      const lines = pathLines(part(scene, `bond:${b}`).svg);
      if (i % 2 === 1) {
        expect(lines).toHaveLength(1);
        return;
      }
      expect(lines).toHaveLength(2);
      const len = (l: PathLine) => norm(l.pts[1]!.x - l.pts[0]!.x, l.pts[1]!.y - l.pts[0]!.y);
      const mid = (l: PathLine) => ({
        x: (l.pts[0]!.x + l.pts[1]!.x) / 2,
        y: (l.pts[0]!.y + l.pts[1]!.y) / 2,
      });
      const [short, long] = [...lines].sort((p, q) => len(p) - len(q)) as [PathLine, PathLine];
      expect(norm(mid(short).x, mid(short).y)).toBeLessThan(norm(mid(long).x, mid(long).y));
      near(len(short), 40 - 2 * 0.104 * 40, 1); // shortened by 0.104 L at both ends
      near(len(long), 40, 2);
    });
  });

  it('naphthalene: two circles, every bond a single plain line', () => {
    const m = naphthalene();
    const scene = render(m.doc);
    expect(keys(scene).filter((k) => k.startsWith('ring:'))).toHaveLength(2);
    for (const b of m.bonds) expect(pathLines(part(scene, `bond:${b}`).svg)).toHaveLength(1);
  });

  it('a 1.5 pair that is not a circled ring is solid plus dashed', () => {
    const [, m] = scenes.find(([name]) => name === 'carboxylate')!;
    const scene = render(m.doc);
    for (const b of m.bonds) {
      const lines = pathLines(part(scene, `bond:${b}`).svg);
      expect(lines).toHaveLength(2);
      expect(lines.filter((l) => l.dashed)).toHaveLength(1);
    }
  });
});

describe('render: ethanol and acetic acid', () => {
  it('ethanol: two bonds then the O label, drawn OH with the bond on the left', () => {
    const m = ethanol();
    const scene = render(m.doc);
    expect(keys(scene)).toEqual([...m.bonds.map((b) => `bond:${b}`), `atom:${m.atoms[2]}`]);
    expect(textOf(part(scene, `atom:${m.atoms[2]}`).svg)).toBe('OH');
  });

  it('mirrored ethanol reads HO', () => {
    const m = ethanol(true);
    const scene = render(m.doc);
    expect(textOf(part(scene, `atom:${m.atoms[2]}`).svg)).toBe('HO');
  });

  it('the bond to O stops on the edge of the O label box grown by labelMargin', () => {
    const m = ethanol();
    const scene = render(m.doc);
    const style = scene.style;
    const line = pathLines(part(scene, `bond:${m.bonds[1]}`).svg)[0]!;
    const o = { x: 2 * (Math.sqrt(3) / 2) * 40, y: 0 };
    const stop = line.pts[1]!;
    const halfW = (ADVANCE_REGULAR[0x4f]! / 1000) * style.fontSize * 0.5 + style.labelMargin;
    const halfH = style.capHeight / 2 + style.labelMargin;
    // The bond arrives from the lower left and leaves the box through its left edge.
    near(o.x - stop.x, halfW);
    expect(o.y - stop.y).toBeGreaterThan(-halfH);
    expect(stop.y - o.y).toBeLessThanOrEqual(halfH);
  });

  it('acetic acid: bonds C-C, C=O (centred), C-O, then both O labels', () => {
    const m = aceticAcid();
    const scene = render(m.doc);
    expect(keys(scene)).toEqual([
      ...m.bonds.map((b) => `bond:${b}`),
      `atom:${m.atoms[2]}`,
      `atom:${m.atoms[3]}`,
    ]);
    expect(textOf(part(scene, `atom:${m.atoms[2]}`).svg)).toBe('O');
    expect(textOf(part(scene, `atom:${m.atoms[3]}`).svg)).toBe('OH');
    const lines = pathLines(part(scene, `bond:${m.bonds[1]}`).svg);
    expect(lines).toHaveLength(2);
    const cx = (Math.sqrt(3) / 2) * 40;
    const xsOf = lines.map((l) => l.pts[0]!.x).sort((a, b) => a - b);
    near(xsOf[0]!, cx - 3.6);
    near(xsOf[1]!, cx + 3.6);
  });

  it('acetic acid: the C=O lines stop at the top of the O label box', () => {
    const m = aceticAcid();
    const scene = render(m.doc);
    const lines = pathLines(part(scene, `bond:${m.bonds[1]}`).svg);
    const style = scene.style;
    const oY = 1.5 * 40;
    for (const l of lines)
      near(Math.max(...l.pts.map((p) => p.y)), oY - style.capHeight / 2 - style.labelMargin);
  });

  it('draws a stereo centre: polygon, hash lines, bold polygon and a wavy path', () => {
    const m = stereoCentre();
    const scene = render(m.doc);
    expect(part(scene, `bond:${m.bonds[0]}`).svg).toContain('<polygon');
    expect(part(scene, `bond:${m.bonds[1]}`).svg).not.toContain('<polygon');
    expect(part(scene, `bond:${m.bonds[2]}`).svg).toContain('<polygon');
    expect(part(scene, `bond:${m.bonds[3]}`).svg).toContain('Q');
  });
});

describe('render: extents and bounds', () => {
  it.each(scenes)('%s: bounds equal the independent ink scan within 0.01 pt', (_name, m) => {
    const scene = render(m.doc);
    const scan = inkScan(joined(scene))!;
    expect(scene.bounds).not.toBeNull();
    const b = scene.bounds as Rect;
    expect(Math.abs(b.x - scan.x)).toBeLessThan(0.01);
    expect(Math.abs(b.y - scan.y)).toBeLessThan(0.01);
    expect(Math.abs(b.w - scan.w)).toBeLessThan(0.01);
    expect(Math.abs(b.h - scan.h)).toBeLessThan(0.01);
  });

  it.each(scenes)('%s: each extents entry equals the scan of its own part', (_name, m) => {
    const scene = render(m.doc);
    for (const p of scene.parts) {
      const own = scene.extents[p.key]!;
      const scan = inkScan(p.svg)!;
      expect(Math.abs(own.x - scan.x)).toBeLessThan(0.01);
      expect(Math.abs(own.y - scan.y)).toBeLessThan(0.01);
      expect(Math.abs(own.w - scan.w)).toBeLessThan(0.01);
      expect(Math.abs(own.h - scan.h)).toBeLessThan(0.01);
    }
  });

  it.each(scenes)('%s: bounds is the union of the extents', (_name, m) => {
    const scene = render(m.doc);
    const rects = Object.values(scene.extents);
    const x0 = Math.min(...rects.map((r) => r.x));
    const y0 = Math.min(...rects.map((r) => r.y));
    const x1 = Math.max(...rects.map((r) => r.x + r.w));
    const y1 = Math.max(...rects.map((r) => r.y + r.h));
    const b = scene.bounds!;
    near(b.x, x0, 9);
    near(b.y, y0, 9);
    near(b.w, x1 - x0, 9);
    near(b.h, y1 - y0, 9);
  });

  it('an atom with no ink has no extents entry, but its bonds still count', () => {
    const m = ethanol();
    const scene = render(m.doc);
    expect(scene.extents[`atom:${m.atoms[0]}`]).toBeUndefined();
    expect(scene.extents[`bond:${m.bonds[0]}`]).toBeDefined();
  });

  it('a bare atom label has extents and the label box is its text box', () => {
    const m = molecule([{ x: 0, y: 0, element: 'O' }], []);
    const scene = render(m.doc);
    const e = scene.extents[`atom:${m.atoms[0]}`]!;
    // "H2O": the O sits at the origin; the box extends left over H2.
    expect(e.x).toBeLessThan(0);
    expect(e.x + e.w).toBeGreaterThan(0);
  });
});

describe('render: satellites', () => {
  const carbanion = scenes.find(([n]) => n === 'carbanion')![1];
  const radical = scenes.find(([n]) => n === 'radical')![1];
  const carbKey: ItemKey = `atom:${carbanion.atoms[0]}`;

  it('a vertex with satellites gets an atom part; one without still has none', () => {
    const scene = render(carbanion.doc);
    expect(keys(scene)).toContain(carbKey);
    expect(keys(scene)).not.toContain(`atom:${carbanion.atoms[1]}`);
  });

  it('the carbanion puts the pair farthest from the bonds (above) and the sign in the next free slot', () => {
    const svg = part(render(carbanion.doc), carbKey).svg;
    expect(textOf(svg)).toBe('−');
    const ys = [...svg.matchAll(/<circle cx="[^"]+" cy="([^"]+)"/g)].map((m) => Number(m[1]));
    expect(ys).toHaveLength(2);
    // Bonds go down-left and down-right: the pair is the farthest cardinal from them, N, above
    // the atom; the sign is not on top of it.
    for (const y of ys) expect(y).toBeLessThan(0);
  });

  it('a labelled atom keeps the label and adds its satellites after it', () => {
    const svg = part(render(radical.doc), `atom:${radical.atoms[2]}`).svg;
    expect(textOf(svg)).toMatch(/^OH?3$/);
    expect((svg.match(/<circle/g) ?? []).length).toBe(2);
  });

  it('extents of an atom part include its satellites', () => {
    const scene = render(carbanion.doc);
    const e = scene.extents[carbKey]!;
    for (const m of part(scene, carbKey).svg.matchAll(/cy="([^"]+)"/g)) {
      expect(e.y).toBeLessThan(Number(m[1]));
    }
  });

  it('satellites see bonds to atoms outside a subset', () => {
    const full = render(carbanion.doc);
    const sub = render(carbanion.doc, { only: only([carbanion.atoms[0]!]) });
    expect(part(sub, carbKey).svg).toBe(part(full, carbKey).svg);
  });

  it('satellite glyphs outside the table are reported as unmeasured', () => {
    const m = molecule(
      [
        { x: 0, y: 0, number: '中' },
        { x: 1, y: 0 },
      ],
      [[0, 1]],
    );
    expect(render(m.doc).notices).toEqual([{ code: 'unmeasured-glyph', chars: '中' }]);
  });
});

describe('render: arrows, plus signs, shapes and brackets', () => {
  const scheme = (): { doc: Doc; ids: Record<string, ObjectId>; m: Molecule } => {
    const m = ethanol();
    let doc = m.doc;
    const ids: Record<string, ObjectId> = {};
    const add = (name: string, init: Parameters<typeof addObject>[1]) => {
      [doc, ids[name]] = addObject(doc, init) as [Doc, ObjectId];
    };
    add('arrow', { type: 'arrow', kind: 'equilibrium', from: { x: 3, y: 0 }, to: { x: 5, y: 0 } });
    add('plus', { type: 'plus', at: { x: 2, y: 0 } });
    add('shape', {
      type: 'shape',
      shape: 'ellipse',
      rect: { x: -1, y: -1, w: 4, h: 3 },
      fill: '#ffee00',
      fillOpacity: 0.3,
    });
    add('bracket', {
      type: 'bracket',
      shape: 'square',
      rect: { x: 6, y: -1, w: 2, h: 2 },
      corner: [{ text: 'n' }],
    });
    return { doc, ids, m };
  };

  it('draws each type under its obj key, with an extents entry', () => {
    const { doc, ids } = scheme();
    const scene = render(doc);
    for (const id of Object.values(ids)) {
      expect(keys(scene)).toContain(`obj:${id}`);
      expect(scene.extents[`obj:${id}`]).toBeDefined();
    }
    expect(scene.notices).toEqual([]);
  });

  it('shapes paint beneath structures; other objects paint above them, by zOrder', () => {
    const { doc, ids } = scheme();
    const order = keys(render(doc));
    const k = (name: string) => order.indexOf(`obj:${ids[name]}`);
    const firstAtomOrBond = order.findIndex((x) => x.startsWith('atom:') || x.startsWith('bond:'));
    const lastAtomOrBond = order.map((x) => /^(atom|bond):/.test(x)).lastIndexOf(true);
    expect(k('shape')).toBe(0);
    expect(k('shape')).toBeLessThan(firstAtomOrBond);
    expect(k('arrow')).toBeGreaterThan(lastAtomOrBond);
    expect(k('arrow')).toBeLessThan(k('plus'));
    expect(k('plus')).toBeLessThan(k('bracket'));
  });

  it('bounds equal the independent ink scan of the whole scene', () => {
    const { doc } = scheme();
    const scene = render(doc);
    const scan = inkScan(joined(scene))!;
    const b = scene.bounds as Rect;
    expect(Math.abs(b.x - scan.x)).toBeLessThan(0.01);
    expect(Math.abs(b.y - scan.y)).toBeLessThan(0.01);
    expect(Math.abs(b.w - scan.w)).toBeLessThan(0.01);
    expect(Math.abs(b.h - scan.h)).toBeLessThan(0.01);
  });

  it('extents include arrowheads and stroke half-widths', () => {
    const m = ethanol();
    const [doc, id] = addObject(m.doc, {
      type: 'arrow',
      kind: 'forward',
      from: { x: 0, y: 5 },
      to: { x: 2, y: 5 },
    });
    const e = render(doc).extents[`obj:${id}`]!;
    const s = resolveStyle(doc.style);
    near(e.x, -s.lineWidth / 2);
    near(e.w, 2 * s.bondLength + s.lineWidth / 2);
    near(e.h, 2 * s.arrowHeadHalfWidth);
  });

  it('a selected object draws alone, byte-identical to the full render', () => {
    const { doc, ids } = scheme();
    const full = render(doc);
    const sub = render(doc, { only: only([], [], [ids.arrow!, ids.shape!]) });
    expect(keys(sub)).toEqual([`obj:${ids.shape}`, `obj:${ids.arrow}`]);
    for (const p of sub.parts) expect(p.svg).toBe(part(full, p.key).svg);
  });

  it('bracket corner text reports unmeasured glyphs with the other notices', () => {
    const m = ethanol();
    const [doc] = addObject(m.doc, {
      type: 'bracket',
      shape: 'round',
      rect: { x: 0, y: 5, w: 1, h: 1 },
      corner: [{ text: '中' }],
    });
    expect(render(doc).notices).toEqual([{ code: 'unmeasured-glyph', chars: '中' }]);
  });

  it('skips with a notice instead of throwing: zero-length arrow, empty shape, bad coordinates', () => {
    const m = ethanol();
    let doc = m.doc;
    const ids: ObjectId[] = [];
    const valid = [
      { type: 'arrow', kind: 'forward', from: { x: 1, y: 1 }, to: { x: 1, y: 1 } },
      { type: 'shape', shape: 'rect', rect: { x: 0, y: 0, w: 1, h: 1 }, fillOpacity: 1 },
      { type: 'plus', at: { x: 0, y: 0 } },
      { type: 'arrow', kind: 'forward', from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
      { type: 'bracket', shape: 'curly', rect: { x: 0, y: 0, w: 1, h: 1 } },
      {
        type: 'shape',
        shape: 'rect',
        rect: { x: 0, y: 0, w: 1, h: 1 },
        fill: '#000000',
        fillOpacity: 1,
      },
    ] as Parameters<typeof addObject>[1][];
    for (const init of valid) {
      let id: ObjectId;
      [doc, id] = addObject(doc, init);
      ids.push(id);
    }
    // A hand-edited file can hold what addObject refuses: patch the stored objects directly.
    const patches: Record<number, object> = {
      2: { at: { x: Number.NaN, y: 0 } },
      3: { to: { x: Infinity, y: 0 } },
      4: { rect: { x: 0, y: 0, w: Number.NaN, h: 1 } },
      5: { rect: { x: 0, y: Infinity, w: 1, h: 1 } },
    };
    const objects = { ...doc.objects };
    for (const [i, patch] of Object.entries(patches)) {
      const id = ids[Number(i)]!;
      objects[id] = { ...objects[id]!, ...patch } as (typeof objects)[ObjectId];
    }
    const scene = render({ ...doc, objects });
    // Shapes are visited first (beneath layer), so compare as sets.
    expect(scene.notices.map((n) => (n.code === 'skipped-item' ? n.key : n.code)).sort()).toEqual(
      ids.map((id) => `obj:${id}`).sort(),
    );
    expect(keys(scene).some((x) => x.startsWith('obj:'))).toBe(false);
  });

  it('every object part is well-formed with only allow-listed elements', () => {
    const { doc } = scheme();
    expect(() => checkXml(`<g>\n${joined(render(doc))}\n</g>`)).not.toThrow();
  });
});

describe('render: subsets', () => {
  const m = ethanol();
  const full = render(m.doc);

  it('every part of a subset is byte-identical to the same-key full part', () => {
    for (const sel of [
      only([m.atoms[2]!]),
      only([], [m.bonds[0]!]),
      only([m.atoms[1]!, m.atoms[2]!]),
      only(m.atoms),
    ]) {
      const sub = render(m.doc, { only: sel });
      expect(sub.parts.length).toBeGreaterThan(0);
      for (const p of sub.parts) expect(p.svg).toBe(part(full, p.key).svg);
      for (const [k, r] of Object.entries(sub.extents)) {
        expect(r).toEqual(full.extents[k as keyof typeof full.extents]);
      }
    }
  });

  it('a selected atom without its neighbours draws only its label (no bond)', () => {
    const sub = render(m.doc, { only: only([m.atoms[2]!]) });
    expect(keys(sub)).toEqual([`atom:${m.atoms[2]}`]);
    expect(textOf(sub.parts[0]!.svg)).toBe('OH'); // layout saw the whole neighbourhood
  });

  it('a selected bond brings its two atoms; unselected bonds between them are drawn too', () => {
    const sub = render(m.doc, { only: only([], [m.bonds[1]!]) });
    expect(keys(sub)).toEqual([`bond:${m.bonds[1]}`, `atom:${m.atoms[2]}`]);
    const both = render(m.doc, { only: only([m.atoms[0]!, m.atoms[1]!]) });
    expect(keys(both)).toEqual([`bond:${m.bonds[0]}`]);
  });

  it('the subset bounds are the union of its own extents', () => {
    const sub = render(m.doc, { only: only([m.atoms[2]!]) });
    expect(sub.bounds).toEqual(sub.extents[`atom:${m.atoms[2]}`]);
  });

  it('ring circle iff every ring atom is in the closure', () => {
    const b = benzene();
    const ringKey: ItemKey = `ring:${b.atoms.join(',')}`;
    const five = render(b.doc, { only: only(b.atoms.slice(0, 5)) });
    expect(keys(five).includes(ringKey)).toBe(false);
    expect(keys(five)).toHaveLength(4); // the four bonds between the five atoms
    const six = render(b.doc, { only: only(b.atoms) });
    expect(keys(six)[0]).toBe(ringKey);
    const viaBonds = render(b.doc, { only: only([], [...b.bonds]) });
    expect(keys(viaBonds)[0]).toBe(ringKey);
    // The circle is the same markup as in the full render.
    expect(six.parts[0]!.svg).toBe(render(b.doc).parts[0]!.svg);
  });

  it('a naphthalene half keeps only its own circle', () => {
    const n = naphthalene();
    const ringA = n.atoms.slice(0, 6);
    const sub = render(n.doc, { only: only(ringA) });
    expect(keys(sub).filter((k) => k.startsWith('ring:'))).toHaveLength(1);
  });

  it('bonds draw with the full document neighbourhood (double-bond side)', () => {
    const k = benzene('kekule');
    const fullScene = render(k.doc);
    const sub = render(k.doc, { only: only([], [k.bonds[0]!]) });
    expect(sub.parts[0]!.svg).toBe(part(fullScene, `bond:${k.bonds[0]}`).svg);
  });

  it('unknown ids in the selection are ignored', () => {
    const sub = render(m.doc, {
      only: only(['a999' as AtomId], ['b999' as BondId], ['o999' as ObjectId]),
    });
    expect(sub.parts).toEqual([]);
  });
});

describe('render: options and purity', () => {
  it('an explicit perception equals the default', () => {
    for (const [, m] of scenes) {
      expect(render(m.doc, { perception: perceive(m.doc) })).toEqual(render(m.doc));
    }
  });

  it('does not mutate the document', () => {
    const m = aceticAcid();
    const frozen = JSON.stringify(m.doc);
    const deep = <T>(o: T): T => {
      if (o && typeof o === 'object') {
        Object.values(o).forEach(deep);
        Object.freeze(o);
      }
      return o;
    };
    deep(m.doc);
    render(m.doc);
    render(m.doc, { only: only(m.atoms) });
    expect(JSON.stringify(m.doc)).toBe(frozen);
  });

  it('is deterministic, whatever the record order of the document', () => {
    const m = aceticAcid();
    const reversed: Doc = {
      ...m.doc,
      atoms: Object.fromEntries(Object.entries(m.doc.atoms).reverse()) as Doc['atoms'],
      bonds: Object.fromEntries(Object.entries(m.doc.bonds).reverse()) as Doc['bonds'],
    };
    const a = render(m.doc);
    expect(render(m.doc)).toEqual(a);
    expect(render(reversed)).toEqual(a);
  });

  it('uses the document style: journal is a uniformly smaller drawing', () => {
    const m = ethanol();
    const slides = render(m.doc).bounds!;
    const journal = render({ ...m.doc, style: { preset: 'journal', overrides: {} } }).bounds!;
    expect(journal.w).toBeLessThan(slides.w);
    expect(journal.h).toBeLessThan(slides.h);
    const doubled = render({
      ...m.doc,
      style: { preset: 'slides', overrides: { bondLength: 80 } },
    }).bounds!;
    expect(doubled.w).toBeGreaterThan(1.5 * slides.w);
  });
});

describe('render: notices', () => {
  const withAtom = (m: Molecule, id: AtomId, over: Partial<Atom>): Doc => ({
    ...m.doc,
    atoms: { ...m.doc.atoms, [id]: { ...m.doc.atoms[id]!, ...over } },
  });

  it('a non-finite coordinate skips the atom and its bonds with a notice, never throws', () => {
    const m = ethanol();
    const doc = withAtom(m, m.atoms[2]!, { x: Number.NaN });
    const scene = render(doc);
    expect(scene.notices).toEqual([
      { code: 'skipped-item', key: `bond:${m.bonds[1]}`, reason: expect.any(String) as string },
      { code: 'skipped-item', key: `atom:${m.atoms[2]}`, reason: expect.any(String) as string },
    ]);
    expect(keys(scene)).toEqual([`bond:${m.bonds[0]}`]);
  });

  it('an infinite coordinate after scaling is skipped too', () => {
    const m = ethanol();
    const doc = withAtom(m, m.atoms[0]!, { x: 1e308 });
    expect(() => render(doc)).not.toThrow();
    expect(render(doc).notices.length).toBeGreaterThan(0);
  });

  it('skipped items outside the subset give no notice', () => {
    const m = ethanol();
    const doc = withAtom(m, m.atoms[2]!, { y: Number.POSITIVE_INFINITY });
    expect(render(doc, { only: only([m.atoms[0]!]) }).notices).toEqual([]);
  });

  it('unmeasured glyphs are reported once, deduplicated and sorted by code point', () => {
    const m = molecule(
      [
        { x: 0, y: 0, label: '本日' },
        { x: 1, y: 0, label: '日' },
      ],
      [[0, 1]],
    );
    const scene = render(m.doc);
    expect(scene.notices).toEqual([{ code: 'unmeasured-glyph', chars: '日本' }]);
  });

  it('a coincident-atom bond is skipped with a notice', () => {
    const m = molecule(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      [[0, 1]],
    );
    const scene = render(m.doc);
    expect(scene.notices).toEqual([
      { code: 'skipped-item', key: `bond:${m.bonds[0]}`, reason: expect.any(String) as string },
    ]);
  });

  it('an object with nothing to draw gives a skipped-item notice', () => {
    const m = ethanol();
    const [doc, id] = addObject(m.doc, {
      type: 'text',
      at: { x: 0, y: 3 },
      runs: [{ text: '' }],
      align: 'left',
    });
    expect(render(doc).notices).toEqual([
      { code: 'skipped-item', key: `obj:${id}`, reason: expect.any(String) as string },
    ]);
    expect(render(doc).parts.some((p) => p.key.startsWith('obj:'))).toBe(false);
    expect(render(doc, { only: only(m.atoms) }).notices).toEqual([]);
    expect(render(doc, { only: only([], [], [id]) }).notices).toHaveLength(1);
  });
});

describe('render: text, caption, callout and curved arrows', () => {
  const S = Math.sqrt(3) / 2;
  const skipped = (scene: Scene) => scene.notices.filter((n) => n.code === 'skipped-item');
  const sameBox = (a: Rect, b: Rect) => {
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.01);
    expect(Math.abs(a.y - b.y)).toBeLessThan(0.01);
    expect(Math.abs(a.w - b.w)).toBeLessThan(0.01);
    expect(Math.abs(a.h - b.h)).toBeLessThan(0.01);
  };
  const docs: [string, () => Doc][] = [
    ['kitchen-sink', kitchenSinkDoc],
    ['mechanism', mechanismDoc],
    ['two-step reaction', twoStepReactionDoc],
  ];
  type Init = Parameters<typeof addObject>[1];

  /** Adds objects to a doc through doc-model; returns the ids in order. */
  function withObjects(base: Doc, inits: Init[]): [Doc, ObjectId[]] {
    let doc = base;
    const ids: ObjectId[] = [];
    for (const init of inits) {
      let id: ObjectId;
      [doc, id] = addObject(doc, init);
      ids.push(id);
    }
    return [doc, ids];
  }

  /** Replaces fields of stored objects (a hand-edited file can hold what addObject refuses). */
  function patched(doc: Doc, patches: Record<string, object>): Doc {
    const objects = { ...doc.objects };
    for (const [id, patch] of Object.entries(patches)) {
      objects[id as ObjectId] = {
        ...objects[id as ObjectId]!,
        ...patch,
      } as (typeof objects)[ObjectId];
    }
    return { ...doc, objects };
  }

  const straight = (y: number, bend = 0): Init => ({
    type: 'curved-arrow',
    head: 'full',
    from: { kind: 'point', p: { x: 0, y } },
    to: { kind: 'point', p: { x: 2, y } },
    bend,
  });

  it.each(docs)('%s renders with no skipped-item notice', (_name, make) => {
    expect(skipped(render(make()))).toEqual([]);
  });

  it.each(docs)('%s: bounds equal the independent ink scan within 0.01 pt', (_name, make) => {
    const scene = render(make());
    sameBox(scene.bounds as Rect, inkScan(joined(scene))!);
  });

  it.each(docs)('%s: each object extents entry equals the scan of its own part', (_name, make) => {
    const scene = render(make());
    for (const p of scene.parts.filter((x) => x.key.startsWith('obj:'))) {
      sameBox(scene.extents[p.key]!, inkScan(p.svg)!);
    }
  });

  it.each(docs)('%s is well-formed with only allow-listed elements', (_name, make) => {
    expect(() => checkXml(`<g>\n${joined(render(make()))}\n</g>`)).not.toThrow();
  });

  describe('text', () => {
    it('is drawn at `at` in pt, under its key, with extents', () => {
      const m = ethanol();
      const [doc, [id]] = withObjects(m.doc, [
        {
          type: 'text',
          at: { x: 2, y: 3 },
          runs: [
            { text: 'H' },
            { text: '2', script: 'sub' },
            { text: 'SO' },
            { text: '4', script: 'sub' },
          ],
          align: 'left',
        },
      ]);
      const scene = render(doc);
      const t = textElements(part(scene, `obj:${id}`).svg);
      expect(t.map((e) => e.text)).toEqual(['H', '2', 'SO', '4']);
      near(t[0]!.x, 80);
      near(t[0]!.y, 120 + scene.style.capHeight / 2);
      expect(scene.extents[`obj:${id}`]).toBeDefined();
      expect(scene.notices).toEqual([]);
    });

    it('reports glyphs outside the table together with the other notices', () => {
      const [doc] = withObjects(ethanol().doc, [
        { type: 'text', at: { x: 0, y: 3 }, runs: [{ text: '中' }], align: 'center' },
      ]);
      expect(render(doc).notices).toEqual([{ code: 'unmeasured-glyph', chars: '中' }]);
    });

    it('a non-finite position is skipped with a notice, never a throw', () => {
      const [base, [id]] = withObjects(ethanol().doc, [
        { type: 'text', at: { x: 0, y: 3 }, runs: [{ text: 'x' }], align: 'left' },
      ]);
      const doc = patched(base, { [id!]: { at: { x: Number.NaN, y: 0 } } });
      expect(render(doc).notices).toEqual([
        { code: 'skipped-item', key: `obj:${id}`, reason: expect.any(String) as string },
      ]);
    });
  });

  describe('caption', () => {
    it('sits captionGap below the union of the target atoms ink, centred on it', () => {
      const m = ethanol();
      const [doc, [id]] = withObjects(m.doc, [
        { type: 'caption', runs: [{ text: '1', bold: true }], target: m.atoms },
      ]);
      const scene = render(doc);
      const o = scene.extents[`atom:${m.atoms[2]}`]!;
      // Skeleton atoms count as points: the lowest is the middle carbon, 20 pt below the axis.
      const cap = scene.extents[`obj:${id}`]!;
      near(cap.y, 20 + scene.style.captionGap);
      near(cap.x + cap.w / 2, (0 + o.x + o.w) / 2, 1);
    });

    it('a labelled atom counts with its whole label and satellites', () => {
      const m = molecule([{ x: 0, y: 0, element: 'N', charge: 1, lonePairs: 1 }], []);
      const [doc, [id]] = withObjects(m.doc, [
        { type: 'caption', runs: [{ text: '2' }], target: m.atoms },
      ]);
      const scene = render(doc);
      const n = scene.extents[`atom:${m.atoms[0]}`]!;
      near(scene.extents[`obj:${id}`]!.y, n.y + n.h + scene.style.captionGap);
    });

    it('targets missing from the document are skipped; the rest still counts', () => {
      const m = ethanol();
      const [base, [id]] = withObjects(m.doc, [
        { type: 'caption', runs: [{ text: '1' }], target: [m.atoms[2]!] },
      ]);
      const doc = patched(base, { [id!]: { target: ['a999', m.atoms[2]!] } });
      const scene = render(doc);
      expect(skipped(scene)).toEqual([]);
      const o = scene.extents[`atom:${m.atoms[2]}`]!;
      const cap = scene.extents[`obj:${id}`]!;
      near(cap.x + cap.w / 2, o.x + o.w / 2, 1);
    });

    it('nothing left to caption: skipped with a notice', () => {
      const m = ethanol();
      const [base, [id]] = withObjects(m.doc, [
        { type: 'caption', runs: [{ text: '1' }], target: [m.atoms[0]!] },
      ]);
      for (const target of [['a999'], []]) {
        const scene = render(patched(base, { [id!]: { target } }));
        expect(skipped(scene)).toEqual([
          { code: 'skipped-item', key: `obj:${id}`, reason: expect.any(String) as string },
        ]);
        expect(keys(scene)).not.toContain(`obj:${id}`);
      }
    });

    it('a selected caption draws alone, byte-identical to the full render', () => {
      const m = ethanol();
      const [doc, [id]] = withObjects(m.doc, [
        { type: 'caption', runs: [{ text: '1' }], target: m.atoms },
      ]);
      const sub = render(doc, { only: only([], [], [id!]) });
      expect(keys(sub)).toEqual([`obj:${id}`]);
      expect(sub.parts[0]!.svg).toBe(part(render(doc), `obj:${id}`).svg);
    });
  });

  describe('callout', () => {
    it('draws the text and a leader to a point anchor', () => {
      const [doc, [id]] = withObjects(ethanol().doc, [
        {
          type: 'callout',
          at: { x: 1, y: 3 },
          runs: [{ text: 'nucleophile', italic: true }],
          anchor: { kind: 'point', p: { x: 4, y: 3 } },
        },
      ]);
      const svg = part(render(doc), `obj:${id}`).svg;
      const [leader] = pathLines(svg);
      expect(leader!.pts[1]).toEqual({ x: 160, y: 120 });
      expect(svg).toContain('font-style="italic"');
    });

    it('a leader to an atom stops outside its label box', () => {
      const m = ethanol();
      const [doc, [id]] = withObjects(m.doc, [
        {
          type: 'callout',
          at: { x: 2 * S, y: 3 },
          runs: [{ text: 'alcohol' }],
          anchor: { kind: 'atom', atom: m.atoms[2]! },
        },
      ]);
      const scene = render(doc);
      const [leader] = pathLines(part(scene, `obj:${id}`).svg);
      const end = leader!.pts[1]!;
      // Straight up into the O: it stops under the anchor box grown by curvedGap.
      near(end.x, 2 * S * 40, 2);
      near(end.y, scene.style.capHeight / 2 + scene.style.curvedGap, 2);
    });

    it('an unresolvable anchor is skipped with a notice', () => {
      const [base, [id]] = withObjects(ethanol().doc, [
        {
          type: 'callout',
          at: { x: 1, y: 3 },
          runs: [{ text: 'x' }],
          anchor: { kind: 'point', p: { x: 4, y: 3 } },
        },
      ]);
      const doc = patched(base, { [id!]: { anchor: { kind: 'atom', atom: 'a999' } } });
      expect(skipped(render(doc))).toEqual([
        { code: 'skipped-item', key: `obj:${id}`, reason: expect.any(String) as string },
      ]);
    });
  });

  describe('curved arrows', () => {
    const tipOf = (scene: Scene, id: ObjectId): Point =>
      polygonPoints(part(scene, `obj:${id}`).svg)[0]![0]!;

    it('an atom anchor without offset on a labelled atom stops outside its anchor box', () => {
      const m = ethanol();
      const [doc, [id]] = withObjects(m.doc, [
        {
          type: 'curved-arrow',
          head: 'full',
          from: { kind: 'point', p: { x: 2 * S - 2.5, y: 0 } },
          to: { kind: 'atom', atom: m.atoms[2]! },
          bend: 0,
        },
      ]);
      const scene = render(doc);
      const halfW = (ADVANCE_REGULAR[0x4f]! / 1000) * scene.style.fontSize * 0.5;
      near(tipOf(scene, id!).x, 2 * S * 40 - halfW - scene.style.curvedGap, 2);
      near(tipOf(scene, id!).y, 0, 2);
    });

    it('an offset (lone pair) end is used as given, even inside the label box', () => {
      const m = ethanol();
      const [doc, [id]] = withObjects(m.doc, [
        {
          type: 'curved-arrow',
          head: 'full',
          from: { kind: 'point', p: { x: 2 * S - 2.5, y: 0 } },
          to: { kind: 'atom', atom: m.atoms[2]!, offset: { x: -0.1, y: 0 } },
          bend: 0,
        },
      ]);
      near(tipOf(render(doc), id!).x, 2 * S * 40 - 4, 2);
    });

    it('a skeleton vertex end is used as given', () => {
      const m = ethanol();
      const [doc, [id]] = withObjects(m.doc, [
        {
          type: 'curved-arrow',
          head: 'fishhook',
          from: { kind: 'point', p: { x: S - 2, y: 0.5 } },
          to: { kind: 'atom', atom: m.atoms[1]! },
          bend: 0,
        },
      ]);
      const scene = render(doc);
      near(tipOf(scene, id!).x, S * 40, 2);
      near(tipOf(scene, id!).y, 20, 2);
    });

    it('a bond anchor ends at the point along the bond', () => {
      const m = ethanol();
      const [doc, [id]] = withObjects(m.doc, [
        {
          type: 'curved-arrow',
          head: 'full',
          from: { kind: 'point', p: { x: 0.5, y: 2 } },
          to: { kind: 'bond', bond: m.bonds[0]!, t: 0.25 },
          bend: 0.3,
        },
      ]);
      const tip = tipOf(render(doc), id!);
      near(tip.x, 0.25 * S * 40, 2);
      near(tip.y, 0.25 * 0.5 * 40, 2);
    });

    it('bend 0 is a straight line, a bend is a curve', () => {
      const [flat, [a]] = withObjects(ethanol().doc, [straight(2)]);
      const [bent, [b]] = withObjects(ethanol().doc, [straight(2, 0.4)]);
      expect(part(render(flat), `obj:${a}`).svg).not.toContain('Q');
      expect(part(render(bent), `obj:${b}`).svg).toContain('Q');
    });

    it('unresolvable anchors and bad numbers are skipped with a notice, never a throw', () => {
      const [base, ids] = withObjects(ethanol().doc, [
        straight(2, 0.2),
        straight(2, 0.2),
        straight(2, 0.2),
        straight(2, 0.2),
        straight(2, 0.2),
        {
          type: 'curved-arrow',
          head: 'full',
          from: { kind: 'point', p: { x: 1, y: 1 } },
          to: { kind: 'point', p: { x: 1, y: 1 } },
          bend: 0.2,
        },
      ]);
      const doc = patched(base, {
        [ids[0]!]: { from: { kind: 'atom', atom: 'a999' } },
        [ids[1]!]: { to: { kind: 'bond', bond: 'b999' } },
        [ids[2]!]: { to: { kind: 'point', p: { x: Number.NaN, y: 0 } } },
        [ids[3]!]: { bend: Number.NaN },
        [ids[4]!]: { bend: 1e308 },
      });
      const scene = render(doc);
      expect(skipped(scene).map((n) => (n.code === 'skipped-item' ? n.key : ''))).toEqual(
        ids.map((id) => `obj:${id}`),
      );
      expect(keys(scene).some((k) => k.startsWith('obj:'))).toBe(false);
    });

    it('an atom anchor outside a subset still clips against its label', () => {
      const m = ethanol();
      const [doc, [id]] = withObjects(m.doc, [
        {
          type: 'curved-arrow',
          head: 'full',
          from: { kind: 'point', p: { x: 2 * S - 2.5, y: 0 } },
          to: { kind: 'atom', atom: m.atoms[2]! },
          bend: 0.2,
        },
      ]);
      const sub = render(doc, { only: only([], [], [id!]) });
      expect(keys(sub)).toEqual([`obj:${id}`]);
      expect(sub.parts[0]!.svg).toBe(part(render(doc), `obj:${id}`).svg);
      expect(sub.extents[`obj:${id}`]).toEqual(render(doc).extents[`obj:${id}`]);
    });

    it('paints above structures, by zOrder', () => {
      const [doc, [first, second]] = withObjects(ethanol().doc, [
        { type: 'text', at: { x: 0, y: 3 }, runs: [{ text: 'a' }], align: 'left' },
        straight(2, 0.2),
      ]);
      const order = keys(render(doc));
      const lastStructure = order.map((k) => /^(atom|bond):/.test(k)).lastIndexOf(true);
      expect(order.indexOf(`obj:${first}`)).toBeGreaterThan(lastStructure);
      expect(order.indexOf(`obj:${first}`)).toBeLessThan(order.indexOf(`obj:${second}`));
    });
  });
});

describe('render: nitro group', () => {
  it('draws the bond from N+ to a lower-left O- (the charge does not swallow it)', () => {
    const m = molecule(
      [
        { x: 0, y: 0, element: 'N', charge: 1 },
        { x: -0.866, y: 0.5, element: 'O', charge: -1 },
        { x: 0.866, y: 0.5, element: 'O' },
        { x: 0, y: -1, element: 'O' },
      ],
      [
        [0, 1],
        [0, 2, { order: 2 }],
        [0, 3, { order: 2 }],
      ],
    );
    const scene = render(m.doc);
    expect(scene.notices).toEqual([]);
    const bond = part(scene, `bond:${m.bonds[0]}`);
    const [line] = pathLines(bond.svg);
    const [a, b] = line!.pts as [Point, Point];
    // Between two labels the visible part of a 40 pt bond is about 6 pt (before: 0).
    expect(norm(b.x - a.x, b.y - a.y)).toBeGreaterThan(4);
  });
});

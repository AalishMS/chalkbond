import { describe, expect, it } from 'vitest';
import type { Atom, AtomId, Doc } from '../doc-model';
import { goldenScenes, PRESETS } from './__fixtures__/golden-scenes';
import { render } from './render';
import { ringAtoms } from './ring-atoms';
import { advanceWidth } from './text-measure';
import type { RenderPart, Scene } from './types';

// SPEC-svg-render.md "The layout (Decision 16)", legibility criteria L1-L3 (SC14): in structural
// mode every bond with a labelled end keeps a visible segment, no two labels touch, nothing is
// skipped, and no ring carbon is written. Asserted for every structural golden scene in both
// presets. The method is the spec's: "visible" = the longest straight segment of the bond's drawn
// part; a label's box = its advance width by `0.716 x font-size` above the baseline.
const CAP_HEIGHT_EM = 0.716;
const L1_MIN_PER_PTPERBLU = 0.25;
const L2_MIN_PER_FONT = 0.5;

const structural = goldenScenes().filter((s) => s.name.endsWith('-structural'));
const cases = structural.flatMap((s) => PRESETS.map((preset) => ({ ...s, preset })));

interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The cap-height glyph boxes of every `<text>` in a part. */
function labelBoxes(part: RenderPart): Box[] {
  const out: Box[] = [];
  for (const m of part.svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)) {
    const attrs = m[1] as string;
    const num = (name: string): number => Number(new RegExp(`${name}="([^"]+)"`).exec(attrs)?.[1]);
    const fontSize = num('font-size');
    const bold = /font-weight="bold"/.test(attrs);
    const text = (m[2] as string).replace(/&amp;/g, '&').replace(/&lt;/g, '<');
    let units = 0;
    for (const ch of text) units += advanceWidth(ch.codePointAt(0) as number, bold).width;
    const width = (units / 1000) * fontSize;
    const anchor = /text-anchor="(\w+)"/.exec(attrs)?.[1] ?? 'start';
    const x = num('x');
    const x0 = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
    const y = num('y');
    out.push({ x0, y0: y - CAP_HEIGHT_EM * fontSize, x1: x0 + width, y1: y });
  }
  return out;
}

const boxGap = (a: Box, b: Box): number => {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
  return Math.sqrt(dx * dx + dy * dy);
};

/** The longest straight segment of a bond part (its main line, for a double bond). */
function longestSegment(part: RenderPart): number {
  let longest = 0;
  for (const m of part.svg.matchAll(/<path d="([^"]+)"/g)) {
    const nums = ((m[1] as string).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    for (let i = 2; i + 1 < nums.length; i += 2) {
      const dx = (nums[i] as number) - (nums[i - 2] as number);
      const dy = (nums[i + 1] as number) - (nums[i - 1] as number);
      longest = Math.max(longest, Math.sqrt(dx * dx + dy * dy));
    }
  }
  return longest;
}

function build(c: (typeof cases)[number]): { doc: Doc; scene: Scene } {
  const doc: Doc = { ...c.doc, style: { ...c.doc.style, preset: c.preset } };
  return { doc, scene: render(doc) };
}

describe('structural golden scenes: legibility (L1-L3)', () => {
  it('has the 13 scenes of the spec, all structural', () => {
    expect(structural.map((s) => s.name).sort()).toEqual(
      [
        'acetic-acid',
        'acetic-acid-co2h',
        'alkene-trans',
        'benzene',
        'carbocation',
        'cyclohexanol',
        'esterification',
        'ethanol',
        'isobutane',
        'methyl-radical',
        'methylcyclohexane',
        'propane',
        'toluene',
      ]
        .map((n) => `${n}-structural`)
        .sort(),
    );
    for (const s of structural) expect(s.doc.style.formula).toBe('structural');
  });

  it.each(cases)('$name ($preset): L1, every labelled bond end keeps a visible segment', (c) => {
    const { doc, scene } = build(c);
    const minimum = L1_MIN_PER_PTPERBLU * scene.style.ptPerBlu;
    const labelled = new Set(
      scene.parts.filter((p) => p.key.startsWith('atom:')).map((p) => p.key),
    );
    for (const bond of Object.values(doc.bonds)) {
      if (!labelled.has(`atom:${bond.a1}`) && !labelled.has(`atom:${bond.a2}`)) continue;
      const part = scene.parts.find((p) => p.key === `bond:${bond.id}`);
      expect(part, `bond ${bond.id} is drawn`).toBeDefined();
      expect(longestSegment(part as RenderPart)).toBeGreaterThanOrEqual(minimum);
    }
  });

  it.each(cases)('$name ($preset): L2, no two labels closer than half a font size', (c) => {
    const { scene } = build(c);
    const minimum = L2_MIN_PER_FONT * scene.style.fontSize;
    const labels = scene.parts.filter((p) => p.key.startsWith('atom:')).map((p) => labelBoxes(p));
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        for (const a of labels[i] as Box[]) {
          for (const b of labels[j] as Box[]) {
            expect(boxGap(a, b)).toBeGreaterThanOrEqual(minimum);
          }
        }
      }
    }
  });

  it.each(cases)('$name ($preset): L3, nothing is skipped', (c) => {
    const { scene } = build(c);
    expect(scene.notices.filter((n) => n.code === 'skipped-item')).toEqual([]);
  });

  it.each(cases)('$name ($preset): no ring carbon is written', (c) => {
    const { doc, scene } = build(c);
    const drawn = new Set(scene.parts.map((p) => p.key));
    for (const id of ringAtoms(doc)) {
      const atom = doc.atoms[id as AtomId] as Atom;
      const plain =
        atom.element === 'C' &&
        (atom.label === undefined || atom.label === '') &&
        atom.isotope === undefined &&
        atom.explicitH === undefined;
      if (plain) expect(drawn.has(`atom:${id}`)).toBe(false);
    }
  });
});

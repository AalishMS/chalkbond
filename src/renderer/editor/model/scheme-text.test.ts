import { createNameIndex, structureFromText } from '@core/chem-core';
import { emptyDoc, type Doc, type SubDoc } from '@core/doc-model';
import { render } from '@core/svg-render';
import { EMPTY_SELECTION } from '../state/editor-state';
import { itemBoxes } from './move';
import { describe, expect, it } from 'vitest';
import compounds from '../../../../resources/compounds/compounds.json';
import { buildScheme, hasSchemeSyntax, parseScheme, type SchemeItem } from './scheme-text';
import { planTidy } from './tidy';

const NOW = '2026-01-01T00:00:00.000Z';
const names = createNameIndex(compounds);

/** The parse as compact strings: parts `[coef ]name`, `+`, `->` / `<->` for the arrows. */
function shape(text: string): string[] | null {
  const p = parseScheme(text);
  if (p.kind !== 'scheme') return null;
  return p.items.map((i) => {
    if (i.kind === 'plus') return '+';
    if (i.kind === 'arrow') return i.arrow === 'forward' ? '->' : '<=>';
    return i.coefficient === null ? i.name : `${i.coefficient}x ${i.name}`;
  });
}

describe('parseScheme (N3, R14)', () => {
  it('splits the esterification scheme', () => {
    expect(shape('ethanol + acetic acid -> ethyl acetate + water')).toEqual([
      'ethanol',
      '+',
      'acetic acid',
      '->',
      'ethyl acetate',
      '+',
      'water',
    ]);
  });

  it('needs no spaces around the separators', () => {
    expect(shape('A+B->C')).toEqual(['A', '+', 'B', '->', 'C']);
    expect(shape('  ethanol   +   water   ->   x  ')).toEqual(['ethanol', '+', 'water', '->', 'x']);
  });

  it.each([
    ['->', 'forward'],
    ['→', 'forward'],
    ['=>', 'forward'],
    ['<=>', 'equilibrium'],
    ['⇌', 'equilibrium'],
  ] as const)('reads %s as a %s arrow', (token, kind) => {
    const p = parseScheme(`A ${token} B`);
    expect(p.kind).toBe('scheme');
    if (p.kind === 'scheme') {
      expect(p.items.filter((i) => i.kind === 'arrow')).toEqual([{ kind: 'arrow', arrow: kind }]);
      expect(p.items.filter((i) => i.kind === 'part').map((i) => i.name)).toEqual(['A', 'B']);
    }
  });

  it('is a single name without an arrow token', () => {
    expect(parseScheme('ethanol').kind).toBe('single');
    expect(parseScheme('ethanol + water').kind).toBe('single');
    expect(parseScheme('').kind).toBe('single');
  });

  it('reads a leading integer and a space as a coefficient', () => {
    expect(shape('2 H2 + O2 -> 2 H2O')).toEqual(['2x H2', '+', 'O2', '->', '2x H2O']);
    expect(shape('2H2 + O2 -> 2H2O')).toEqual(['2H2', '+', 'O2', '->', '2H2O']);
    expect(shape('12  H2O -> x')).toEqual(['12x H2O', '->', 'x']);
  });

  it('does not split at a + inside brackets or parentheses, or at an arrow inside them', () => {
    expect(shape('[NH4+] + OH- -> NH3 + H2O')).toEqual([
      '[NH4+]',
      '+',
      'OH-',
      '->',
      'NH3',
      '+',
      'H2O',
    ]);
    expect(shape('(CH3)2CO + [Cu(NH3)4]2+ -> x')).toEqual([
      '(CH3)2CO',
      '+',
      '[Cu(NH3)4]2+',
      '->',
      'x',
    ]);
    expect(shape('[A->B] -> C')).toEqual(['[A->B]', '->', 'C']);
  });

  describe('charge sign or separator', () => {
    // A + is a charge sign when it touches the formula before it and what follows it is a space,
    // the end of the text, an arrow or another +; any other + is a separator.
    it('keeps a trailing charge on a formula', () => {
      expect(shape('NH4+ + OH- -> NH3 + H2O')).toEqual([
        'NH4+',
        '+',
        'OH-',
        '->',
        'NH3',
        '+',
        'H2O',
      ]);
      expect(shape('Na+ + Cl- -> NaCl')).toEqual(['Na+', '+', 'Cl-', '->', 'NaCl']);
      expect(shape('H+ + OH- -> H2O')).toEqual(['H+', '+', 'OH-', '->', 'H2O']);
      expect(shape('Fe3+ -> Fe2+')).toEqual(['Fe3+', '->', 'Fe2+']);
      expect(shape('Ca2+ + 2 OH- -> Ca(OH)2')).toEqual(['Ca2+', '+', '2x OH-', '->', 'Ca(OH)2']);
      expect(shape('Na+->x')).toEqual(['Na+', '->', 'x']);
    });

    it('splits at a + that is spaced or followed by a letter or digit', () => {
      expect(shape('A+B -> C')).toEqual(['A', '+', 'B', '->', 'C']);
      expect(shape('A +B -> C')).toEqual(['A', '+', 'B', '->', 'C']);
      expect(shape('A+ B -> C')).toEqual(['A+ B', '->', 'C']);
      expect(shape('NH4++OH- -> x')).toEqual(['NH4+', '+', 'OH-', '->', 'x']);
    });
  });

  it('chains arrows into several steps', () => {
    expect(shape('A -> B <=> C')).toEqual(['A', '->', 'B', '<=>', 'C']);
  });

  it('is invalid with a missing part or side', () => {
    expect(parseScheme('ethanol ->').kind).toBe('invalid');
    expect(parseScheme('-> ethanol').kind).toBe('invalid');
    expect(parseScheme('A + -> B').kind).toBe('invalid');
    expect(parseScheme('A -> + B').kind).toBe('invalid');
    expect(parseScheme('A -> B ->').kind).toBe('invalid');
  });

  it('gives each part the span of its name in the typed text', () => {
    const text = 'ethanol  +  2 acetic acd  ->  water';
    const p = parseScheme(text);
    if (p.kind !== 'scheme') throw new Error('not a scheme');
    const parts = p.items.filter((i) => i.kind === 'part');
    expect(parts.map((i) => text.slice(i.start, i.end))).toEqual([
      'ethanol',
      'acetic acd',
      'water',
    ]);
    expect(parts[1]?.coefficient).toBe('2');
  });
});

describe('hasSchemeSyntax (R9)', () => {
  it('is true for an arrow or a separating +, false for a charge or a bracketed +', () => {
    expect(hasSchemeSyntax('ethanol + water')).toBe(true);
    expect(hasSchemeSyntax('A+B')).toBe(true);
    expect(hasSchemeSyntax('ethanol ->')).toBe(true);
    expect(hasSchemeSyntax('ethanol')).toBe(false);
    expect(hasSchemeSyntax('NH4+')).toBe(false);
    expect(hasSchemeSyntax('[NH4+]')).toBe(false);
    expect(hasSchemeSyntax('tetraammine (copper+) sulfate')).toBe(false);
  });
});

// ---- layout ----------------------------------------------------------------------------------

function sub(name: string): SubDoc {
  const r = structureFromText(name, names);
  if (!r.ok) throw new Error(`no structure for ${name}`);
  return r.value.sub;
}

const ethanol: SchemeItem[] = [
  { kind: 'structure', sub: sub('ethanol') },
  { kind: 'plus' },
  { kind: 'structure', sub: sub('acetic acid') },
  { kind: 'arrow', arrow: 'forward' },
  { kind: 'structure', sub: sub('ethyl acetate') },
  { kind: 'plus' },
  { kind: 'structure', sub: sub('water') },
];

function built(items: SchemeItem[], doc: Doc = emptyDoc(NOW), centre = { x: 0, y: 0 }): Doc {
  const { recipe } = buildScheme(doc, render(doc), items, centre);
  return recipe(doc);
}

/** Ink boxes (BLU) of the items of `doc` that are not in `old`, left to right. */
function newBoxes(
  doc: Doc,
  old: Doc,
): { kind: string; x: number; y: number; w: number; h: number }[] {
  const scene = render(doc);
  const k = 1 / scene.style.bondLength;
  return itemBoxes(doc, scene)
    .filter((i) =>
      i.object === undefined ? !((i.atoms[0] as string) in old.atoms) : !(i.object in old.objects),
    )
    .map((i) => ({
      kind: i.object === undefined ? 'fragment' : (doc.objects[i.object]?.type ?? '?'),
      x: i.box.x * k,
      y: i.box.y * k,
      w: i.box.w * k,
      h: i.box.h * k,
    }))
    .sort((a, b) => a.x + a.w / 2 - (b.x + b.w / 2));
}

describe('buildScheme (N3, TR2-TR5)', () => {
  const start = emptyDoc(NOW);
  const doc = built(ethanol);

  it('adds four structures, two pluses and a forward arrow', () => {
    const objs = Object.values(doc.objects);
    expect(objs.filter((o) => o.type === 'plus')).toHaveLength(2);
    expect(objs.filter((o) => o.type === 'arrow')).toMatchObject([{ kind: 'forward' }]);
    expect(objs).toHaveLength(3);
    // ethanol 3 + acetic acid 4 + ethyl acetate 6 + water 1
    expect(Object.keys(doc.atoms)).toHaveLength(14);
  });

  it('lays the items out in order with the spec gaps on one baseline (TR3-TR5)', () => {
    const boxes = newBoxes(doc, start);
    expect(boxes.map((b) => b.kind)).toEqual([
      'fragment',
      'plus',
      'fragment',
      'arrow',
      'fragment',
      'plus',
      'fragment',
    ]);
    for (let i = 1; i < boxes.length; i++) {
      const a = boxes[i - 1] as (typeof boxes)[number];
      const b = boxes[i] as (typeof boxes)[number];
      const gap = b.x - (a.x + a.w);
      const expected = a.kind === 'plus' || b.kind === 'plus' ? 0.4 : 0.6;
      expect(gap).toBeCloseTo(expected, 6);
    }
    const arrow = Object.values(doc.objects).find((o) => o.type === 'arrow');
    if (arrow?.type !== 'arrow') throw new Error('no arrow');
    expect(arrow.from.y).toBe(arrow.to.y);
    expect(arrow.to.x - arrow.from.x).toBeCloseTo(2.5, 9);
    // every non-arrow item's ink centre is on the arrow's shaft line
    for (const b of boxes.filter((x) => x.kind !== 'arrow')) {
      expect(b.y + b.h / 2).toBeCloseTo(arrow.from.y, 6);
    }
  });

  it('centres the ink box on the canvas centre of an empty document', () => {
    const centre = { x: 3, y: -2 };
    const d = built(ethanol, start, centre);
    const boxes = newBoxes(d, start);
    const left = Math.min(...boxes.map((b) => b.x));
    const right = Math.max(...boxes.map((b) => b.x + b.w));
    const top = Math.min(...boxes.map((b) => b.y));
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    expect((left + right) / 2).toBeCloseTo(3, 6);
    expect((top + bottom) / 2).toBeCloseTo(-2, 6);
  });

  it('puts the scheme under an existing drawing: same left edge, 1.5 BLU below', () => {
    const base = built([{ kind: 'structure', sub: sub('benzene') }], start, { x: 40, y: 40 });
    const baseScene = render(base);
    const k = 1 / baseScene.style.bondLength;
    const b0 = baseScene.bounds;
    if (b0 === null) throw new Error('empty');
    const next = built(ethanol, base, { x: 0, y: 0 });
    const boxes = newBoxes(next, base);
    expect(Math.min(...boxes.map((b) => b.x))).toBeCloseTo(b0.x * k, 6);
    expect(Math.min(...boxes.map((b) => b.y))).toBeCloseTo((b0.y + b0.h) * k + 1.5, 6);
  });

  it('adds a coefficient text before its structure, an equilibrium arrow after it', () => {
    const d = built([
      { kind: 'coefficient', text: '2' },
      { kind: 'structure', sub: sub('water') },
      { kind: 'arrow', arrow: 'equilibrium' },
      { kind: 'structure', sub: sub('ethanol') },
    ]);
    const boxes = newBoxes(d, start);
    expect(boxes.map((b) => b.kind)).toEqual(['text', 'fragment', 'arrow', 'fragment']);
    expect(Object.values(d.objects).find((o) => o.type === 'text')).toMatchObject({
      runs: [{ text: '2' }],
    });
    expect(Object.values(d.objects).find((o) => o.type === 'arrow')).toMatchObject({
      kind: 'equilibrium',
    });
    expect(
      (boxes[1] as (typeof boxes)[number]).x -
        ((boxes[0] as (typeof boxes)[number]).x + (boxes[0] as (typeof boxes)[number]).w),
    ).toBeCloseTo(0.6, 6);
  });

  it('is tidy: planning a tidy of the result moves nothing', () => {
    const plan = planTidy(doc, EMPTY_SELECTION);
    expect(plan).toEqual({ arrows: [], attach: [], moves: [], conditions: [] });
  });
});

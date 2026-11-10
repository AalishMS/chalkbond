import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(resolve(process.cwd(), rel), 'utf8');

const MOCK = 'docs/mockups/editor';
const VIEW = 'src/renderer/editor/view';

const afterLeadingComment = (css: string): string => css.replace(/^\s*\/\*[\s\S]*?\*\//, '');

describe('lifted editor assets equal the approved mock-ups', () => {
  it('tokens.css is identical after its leading comment block', () => {
    expect(afterLeadingComment(read(`${VIEW}/tokens.css`))).toBe(
      afterLeadingComment(read(`${MOCK}/tokens.css`)),
    );
  });

  it('icons.svg is byte-identical', () => {
    expect(read(`${VIEW}/icons.svg`)).toBe(read(`${MOCK}/icons.svg`));
  });
});

function tokens(): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of read(`${VIEW}/tokens.css`).matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    map.set(m[1] as string, (m[2] as string).toLowerCase());
  }
  return map;
}

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// SPEC-editor.md "Visual language", contrast pairs. --text-disabled is exempt.
const PAIRS: [string[], string[], number][] = [
  [['--text'], ['--chrome-bg', '--canvas-bg', '--hover-bg', '--pressed-bg', '--warning-bg'], 4.5],
  [['--text-muted'], ['--chrome-bg', '--canvas-bg', '--hover-bg', '--pressed-bg'], 4.5],
  [['--active-fg'], ['--active-bg', '--active-hover-bg'], 4.5],
  [['--warning'], ['--canvas-bg', '--chrome-bg', '--warning-bg'], 4.5],
  [['--tooltip-fg', '--tooltip-muted'], ['--tooltip-bg'], 4.5],
  [['--accent'], ['--canvas-bg', '--chrome-bg', '--active-bg'], 3],
  [['--border-control'], ['--canvas-bg', '--chrome-bg'], 3],
];

describe('contrast pairs (SC6)', () => {
  const t = tokens();
  const cases = PAIRS.flatMap(([fgs, bgs, min]) =>
    fgs.flatMap((fg) => bgs.map((bg) => [fg, bg, min] as const)),
  );
  it.each(cases)('%s on %s is at least %d : 1', (fg, bg, min) => {
    const f = t.get(fg);
    const b = t.get(bg);
    expect(f, fg).toBeDefined();
    expect(b, bg).toBeDefined();
    expect(contrast(f as string, b as string)).toBeGreaterThanOrEqual(min);
  });
});

describe('editor.css uses tokens only', () => {
  const css = read(`${VIEW}/editor.css`).replace(/\/\*[\s\S]*?\*\//g, '');

  it('has no raw colour', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/g) ?? []).toEqual([]);
  });

  it('has no px value other than the 1 px borders', () => {
    const raw = [...css.matchAll(/(?<![\w.-])(\d*\.?\d+)px\b/g)]
      .map((m) => m[0])
      .filter((v) => v !== '1px');
    expect(raw).toEqual([]);
  });
});

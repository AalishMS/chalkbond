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
  // The text editor on the canvas (editor.css .textbox-edit) is black on white, like canvas text.
  [['--ink'], ['--canvas-bg'], 4.5],
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

// ---- Every colour pair editor.css actually uses (E33) ---------------------------------------

interface Rule {
  selector: string;
  decls: Map<string, string>;
}

function rules(): Rule[] {
  const css = read(`${VIEW}/editor.css`).replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = new Map<string, string>();
    for (const d of (m[2] as string).split(';')) {
      const i = d.indexOf(':');
      if (i > 0) decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
    out.push({ selector: (m[1] as string).trim().replace(/\s+/g, ' '), decls });
  }
  return out;
}

const tokenIn = (value: string | undefined): string | null =>
  value === undefined ? null : (/var\((--[\w-]+)\)/.exec(value)?.[1] ?? null);

// Tokens used for text that the spec exempts: disabled text (WCAG 1.4.3) and the empty-state
// artwork, which is decorative (`aria-hidden`).
const EXEMPT_TEXT = new Set(['--text-disabled', '--empty-art']);

describe('every colour pair used in editor.css is checked', () => {
  const t = tokens();
  const all = rules();

  it('every text colour token is in the contrast table or exempt', () => {
    const tableFg = new Set(PAIRS.flatMap(([fgs]) => fgs));
    const used = new Set(
      all.map((r) => tokenIn(r.decls.get('color'))).filter((x): x is string => x !== null),
    );
    expect([...used].filter((u) => !tableFg.has(u) && !EXEMPT_TEXT.has(u))).toEqual([]);
  });

  it('text on the background set in the same rule is at least 4.5 : 1', () => {
    const pairs = all.flatMap((r) => {
      const fg = tokenIn(r.decls.get('color'));
      const bg = tokenIn(r.decls.get('background') ?? r.decls.get('background-color'));
      return fg !== null && bg !== null && !EXEMPT_TEXT.has(fg)
        ? [[r.selector, fg, bg] as const]
        : [];
    });
    expect(pairs.length).toBeGreaterThan(3);
    for (const [selector, fg, bg] of pairs) {
      expect(
        contrast(t.get(fg) as string, t.get(bg) as string),
        `${selector}: ${fg} on ${bg}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Surfaces a control can sit on in its states (rest, hover, pressed, selected, warning band).
  const SURFACES = [
    '--chrome-bg',
    '--canvas-bg',
    '--hover-bg',
    '--pressed-bg',
    '--active-bg',
    '--active-hover-bg',
    '--warning-bg',
  ];

  it('--text and --warning stay at 4.5 : 1 on every surface they can meet, hover and pressed included', () => {
    for (const fg of ['--text', '--warning']) {
      for (const bg of SURFACES.filter((s) => !s.startsWith('--active') || fg === '--text')) {
        expect(
          contrast(t.get(fg) as string, t.get(bg) as string),
          `${fg} on ${bg}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('--text-muted stays at 4.5 : 1 on every surface it can meet', () => {
    for (const bg of SURFACES) {
      expect(
        contrast(t.get('--text-muted') as string, t.get(bg) as string),
        bg,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('--accent (focus ring, selection bar, underline, caret) is at least 3 : 1 on every surface it can meet', () => {
    for (const bg of SURFACES) {
      expect(contrast(t.get('--accent') as string, t.get(bg) as string), bg).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it('--border-control is at least 3 : 1 on the bars and the canvas, and on hover', () => {
    // Pressed (2.96 : 1) is transient and the border's outer neighbour is the canvas; the spec
    // asks for the bars and the canvas only.
    for (const bg of ['--chrome-bg', '--canvas-bg', '--hover-bg']) {
      expect(
        contrast(t.get('--border-control') as string, t.get(bg) as string),
        bg,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('keyboard-key text in the tooltip is at least 4.5 : 1', () => {
    expect(
      contrast(t.get('--tooltip-fg') as string, t.get('--tooltip-bg') as string),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(t.get('--tooltip-muted') as string, t.get('--tooltip-bg') as string),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

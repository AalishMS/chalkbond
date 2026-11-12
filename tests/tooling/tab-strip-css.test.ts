// TB24: the tab strip's CSS contract (SPEC-app-shell.md T2, T14, T16; mock-up A18, A21). Tokens
// only, A18's sizes, no hit target under 24 px, the cross hidden but its room kept. A tooling test
// because the unit project has no file access in the renderer's TypeScript project.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const css = strip(readFileSync('src/renderer/app/tab-strip.css', 'utf8'));
const tokens = new Map(
  [
    ...strip(readFileSync('src/renderer/app/shell-tokens.css', 'utf8')).matchAll(
      /(--[\w-]+)\s*:\s*(\d+)px/g,
    ),
  ].map((m) => [m[1]!, Number(m[2])]),
);

describe('tab-strip.css (tokens only)', () => {
  it('has no raw colour', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? []).toEqual([]);
  });
  it('has no length but 1 px, 2 px and the media query bound', () => {
    const lengths = [...css.matchAll(/(?<![\w.-])(-?\d*\.?\d+)(px|rem|em)\b/g)].map((m) => m[0]);
    expect(lengths.length).toBeGreaterThan(0);
    for (const l of lengths) expect(['1px', '2px', '1099.98px'], l).toContain(l.replace('-', ''));
  });
  it('sizes the tab, its cross, the + button and the dot from the A18 tokens', () => {
    expect(css).toMatch(
      /\.tab\s*{[^}]*width:\s*var\(--tab-max-w\)[^}]*min-width:\s*var\(--tab-min-w\)[^}]*max-width:\s*var\(--tab-max-w\)[^}]*height:\s*var\(--tab-h\)/,
    );
    expect(css).toMatch(
      /\.tab-close\s*{[^}]*width:\s*var\(--tab-close\)[^}]*height:\s*var\(--tab-close\)/,
    );
    expect(css).toMatch(
      /\.tab-add\s*{[^}]*width:\s*var\(--tab-add\)[^}]*height:\s*var\(--tab-add\)/,
    );
    expect(css).toMatch(
      /\.tab-dot\s*{[^}]*width:\s*var\(--dot-size\)[^}]*height:\s*var\(--dot-size\)/,
    );
  });
  it('no hit target is below 24 x 24 px by token value', () => {
    for (const name of ['--tab-h', '--tab-min-w', '--tab-close', '--tab-add', '--tab-scroll-w'])
      expect(tokens.get(name), name).toBeGreaterThanOrEqual(24);
  });
  it('cuts a long label with an ellipsis', () => {
    expect(css).toMatch(
      /\.tab-title\s*{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/,
    );
  });
  it('hides the cross but keeps its room; shown on the active, hovered and focused tab', () => {
    expect(css).toMatch(/\.tab-close\s*{[^}]*visibility:\s*hidden/);
    expect(css).toMatch(
      /\.tab\[aria-selected='true'\] \.tab-close,[^{]*\.tab:hover \.tab-close,[^{]*\.tab:focus-visible \.tab-close\s*{[^}]*visibility:\s*visible/,
    );
  });
  it('narrows the option buttons below 1100 px when a strip is present (A21)', () => {
    expect(css).toMatch(
      /@media \(max-width: 1099\.98px\)\s*{\s*\.editor\.has-tabs \.btn-opt\s*{\s*min-width:\s*var\(--option-btn-compact\);?\s*}\s*}/,
    );
  });
  it('marks the active tab by more than colour (a 2 px accent line)', () => {
    expect(css).toMatch(
      /\.tab\[aria-selected='true'\]\s*{[^}]*border-top:\s*2px solid var\(--accent\)/,
    );
  });
});

describe('tab-strip.css reorder and overflow (TB25: T13, T14)', () => {
  it('makes room at the motion token speed and turns the motion off under reduced motion', () => {
    expect(css).toMatch(
      /\.tabs\.is-reordering \.tab:not\(\.is-dragging\)\s*{[^}]*transition:\s*transform var\(--motion-pan\)/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*{\s*\.tabs\.is-reordering \.tab:not\(\.is-dragging\)\s*{\s*transition:\s*none;?\s*}\s*}/,
    );
  });
  it('lifts the dragged tab with the elevation token and draws a 2 px accent drop line', () => {
    expect(css).toMatch(/\.tab\.is-dragging\s*{[^}]*box-shadow:\s*var\(--shadow-2\)/);
    expect(css).toMatch(
      /\.tab-drop\s*{[^}]*width:\s*2px[^}]*height:\s*var\(--tab-close\)[^}]*background:\s*var\(--accent\)/,
    );
  });
  it('the strip is the offset parent of the tabs (the drag measures offsetLeft)', () => {
    expect(css).toMatch(/\.tabs\s*{[^}]*position:\s*relative/);
  });
  it('the scroll buttons are the A18 size', () => {
    expect(css).toMatch(
      /\.tab-scroll\s*{[^}]*width:\s*var\(--tab-scroll-w\)[^}]*height:\s*var\(--tab-add\)/,
    );
  });
});

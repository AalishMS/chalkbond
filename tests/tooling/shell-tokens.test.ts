import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { expect, it } from 'vitest';
const read = (p: string): string => readFileSync(p, 'utf8');
const base = 'src/renderer/app/';
const strip = (s: string): string => s.replace(/^\s*\/\*[\s\S]*?\*\//, '');
const editor = read('src/renderer/editor/view/tokens.css');
const names = (s: string): string[] => [...s.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!);
it('lifts normative tokens and sprite without collisions', () => {
  const shell = read(base + 'shell-tokens.css');
  expect(strip(shell)).toBe(strip(read('docs/mockups/shell/shell-tokens.css')));
  expect(names(shell).filter((n) => names(editor).includes(n))).toEqual([]);
  const sprite = read(base + 'shell-icons.svg');
  expect(sprite).toBe(read('docs/mockups/shell/shell-icons.svg'));
  const ids = (s: string): string[] => [...s.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]!);
  expect(
    ids(sprite).filter((n) => ids(read('src/renderer/editor/view/icons.svg')).includes(n)),
  ).toEqual([]);
});
it('uses defined tokens and no raw colours in consumer styles', () => {
  const defined = new Set([...names(editor), ...names(read(base + 'shell-tokens.css'))]);
  const walk = (p: string): string[] =>
    existsSync(p)
      ? readdirSync(p, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory()
            ? walk(p + '/' + e.name)
            : e.name.endsWith('.css') && e.name !== 'shell-tokens.css'
              ? [p + '/' + e.name]
              : [],
        )
      : [];
  for (const path of [...walk(base), ...walk('src/renderer/clipboard-export')]) {
    const css = read(path).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/g) ?? [], path).toEqual([]);
    for (const m of css.matchAll(/var\((--[\w-]+)/g)) expect(defined.has(m[1]!), m[1]).toBe(true);
  }
});
it('meets all V2 contrast pairs including the composited drop surface', () => {
  const css = editor + read(base + 'shell-tokens.css');
  const tokens = new Map(
    [...css.matchAll(/(--[\w-]+)\s*:\s*(#[\da-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!]),
  );
  const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (channels: number[]): number =>
    channels
      .map((c) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
  const pairs: [string, string, number][] = [
    ...['--primary-bg', '--primary-hover-bg', '--primary-pressed-bg'].map(
      (bg) => ['--primary-fg', bg, 4.5] as [string, string, number],
    ),
    ['--text-muted', '--active-bg', 4.5],
    ['--text', '--canvas-bg', 4.5],
    ['--accent', '--canvas-bg', 3],
    ['--border-control', '--canvas-bg', 3],
    ['--active-fg', '--drop-bg', 4.5],
  ];
  const drop = /--drop-bg:\s*rgba\(([^)]+)\)/.exec(css)![1]!.split(',').map(Number);
  const canvas = rgb(tokens.get('--canvas-bg')!);
  for (const [fg, bg, min] of pairs) {
    const background =
      bg === '--drop-bg'
        ? drop.slice(0, 3).map((c, i) => c * drop[3]! + canvas[i]! * (1 - drop[3]!))
        : rgb(tokens.get(bg)!);
    const values = [lum(rgb(tokens.get(fg)!)), lum(background)].sort((a, b) => b - a);
    expect((values[0]! + 0.05) / (values[1]! + 0.05), fg + ' on ' + bg).toBeGreaterThanOrEqual(min);
  }
});

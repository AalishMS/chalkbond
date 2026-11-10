#!/usr/bin/env node
// Golden contact sheet. Reads the committed goldens (src/core/svg-render/__golden__/*.svg, named
// `<scene>.<preset>.svg`) and writes out/golden-sheet.html, one section per style preset, every
// scene in a labelled cell at one common scale per preset, so line weights and label spacing can
// be judged by eye. DEV-TIME ONLY: `npm run check` never runs this; the sheets are build output.
//
//   npm run golden:sheet                          write out/golden-sheet.html
//   npm run golden:sheet -- --png out/sheet.png   also screenshot it with Playwright's Chromium:
//                                                 out/sheet-slides.png, out/sheet-journal.png
//                                                 (-1, -2, ... when a preset needs several
//                                                 pages of at most 1600 x 2400 px)
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, parse, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const goldenDir = join(root, 'src', 'core', 'svg-render', '__golden__');
const htmlFile = join(root, 'out', 'golden-sheet.html');

/** Screen px per pt in each section: the journal preset is drawn small, so it is enlarged. */
const PRESETS = [
  { name: 'slides', scale: 1.5 },
  { name: 'journal', scale: 2.5 },
];
const SHEET_WIDTH = 1600;
const SHEET_MAX_HEIGHT = 2400;
const PAD = 14;

export const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function parseArgs(argv) {
  const png = argv.indexOf('--png');
  if (png >= 0 && !argv[png + 1]) throw new Error('--png needs a file name');
  return { png: png >= 0 ? resolve(argv[png + 1]) : null };
}

function readGoldens() {
  const files = readdirSync(goldenDir).filter((f) => f.endsWith('.svg'));
  const byPreset = new Map(PRESETS.map((p) => [p.name, []]));
  for (const file of files.sort()) {
    const m = /^(.*)\.(slides|journal)\.svg$/.exec(file);
    if (!m) continue;
    const text = readFileSync(join(goldenDir, file), 'utf8');
    const size = /<svg [^>]*width="([\d.]+)pt" height="([\d.]+)pt"/.exec(text);
    byPreset.get(m[2]).push({
      name: m[1],
      file,
      width: size ? Number(size[1]) : 0,
      height: size ? Number(size[2]) : 0,
    });
  }
  return byPreset;
}

function buildHtml(byPreset) {
  const sections = PRESETS.map(({ name, scale }) => {
    const cells = byPreset.get(name).map((g) => {
      const w = Math.max(Math.ceil(g.width * scale), 1);
      const h = Math.max(Math.ceil(g.height * scale), 1);
      const src = relative(dirname(htmlFile), join(goldenDir, g.file)).split('\\').join('/');
      return (
        `<figure class="cell" style="width:${w}px">` +
        `<img src="${escapeHtml(src)}" width="${w}" height="${h}" alt="${escapeHtml(g.name)}">` +
        `<figcaption>${escapeHtml(g.name)}</figcaption></figure>`
      );
    });
    return (
      `<section id="${name}"><h2>${escapeHtml(name)} (${scale} px per pt)</h2>` +
      `<div class="grid">${cells.join('\n')}</div></section>`
    );
  });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Golden sheet</title>
<style>
  body { margin: 0; padding: 0; background: #fff; color: #000; font: 13px/1.3 Consolas, monospace; }
  section { width: ${SHEET_WIDTH}px; box-sizing: border-box; padding: 8px; }
  h2 { margin: 6px 0 8px; font: bold 18px Arial, sans-serif; }
  .grid { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; }
  .cell { margin: 0; padding: ${PAD}px; min-width: 150px; box-sizing: content-box; border: 1px solid #bbb; }
  .cell img { display: block; margin: 0 auto 8px; }
  figcaption { color: #333; text-align: center; font-size: 12px; }
</style></head><body>
${sections.join('\n')}
</body></html>
`;
}

async function screenshots(pngFile) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: SHEET_WIDTH, height: 1000 } });
    await page.goto(pathToFileURL(htmlFile).href);
    await page.waitForLoadState('load');
    const { dir, name } = parse(pngFile);
    const written = [];
    for (const { name: preset } of PRESETS) {
      // Rows of cells, measured; greedy pages of whole rows, the heading on the first.
      const rows = await page.evaluate((id) => {
        const section = globalThis.document.getElementById(id);
        const top = section.getBoundingClientRect().top + globalThis.scrollY;
        const bottom = section.getBoundingClientRect().bottom + globalThis.scrollY;
        const byTop = new Map();
        for (const c of section.querySelectorAll('.cell')) {
          const r = c.getBoundingClientRect();
          const y = Math.round(r.top + globalThis.scrollY);
          byTop.set(y, Math.max(byTop.get(y) ?? 0, Math.ceil(r.bottom + globalThis.scrollY)));
        }
        return { top, bottom, rows: [...byTop].sort((a, b) => a[0] - b[0]) };
      }, preset);
      const pages = [];
      let start = rows.top;
      let last = rows.top;
      for (const [y, bottom] of rows.rows) {
        if (bottom + 6 - start > SHEET_MAX_HEIGHT && last > start) {
          pages.push([start, last]);
          start = y - 6;
        }
        last = bottom + 6;
      }
      pages.push([start, Math.max(last, rows.bottom)]);
      let n = 0;
      for (const [from, to] of pages) {
        n += 1;
        const file = join(dir, `${name}-${preset}${pages.length > 1 ? `-${n}` : ''}.png`);
        await page.screenshot({
          path: file,
          fullPage: true,
          clip: {
            x: 0,
            y: from,
            width: SHEET_WIDTH,
            height: Math.min(to - from, SHEET_MAX_HEIGHT),
          },
        });
        written.push(file);
      }
    }
    return written;
  } finally {
    await browser.close();
  }
}

async function main() {
  const { png } = parseArgs(process.argv.slice(2));
  const byPreset = readGoldens();
  const count = [...byPreset.values()].reduce((n, list) => n + list.length, 0);
  if (count === 0) throw new Error(`no goldens found in ${goldenDir}`);
  mkdirSync(dirname(htmlFile), { recursive: true });
  writeFileSync(htmlFile, buildHtml(byPreset));
  console.log(`wrote ${relative(root, htmlFile)} (${count} goldens)`);
  if (png) {
    mkdirSync(dirname(png), { recursive: true });
    for (const file of await screenshots(png)) console.log(`wrote ${file}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

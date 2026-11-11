// `npm run icons` (SPEC-app-shell.md IC1–IC3; dev-time only, no network, no new dependency):
// renders the normative SVGs in docs/mockups/shell with Playwright's Chromium (16–32 px from the
// `-small` sources, 40 px and up from the regular ones) and writes build/icon.ico (app),
// build/chalk-file.ico (the .chalk association), build/icon.png (256, the About box) and the PNGs
// in out/icons/ for review. Run it twice on one machine: the outputs are byte-identical.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeIco } from './ico.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = join(ROOT, 'docs', 'mockups', 'shell');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 256];
const SMALL_MAX = 32;
const ICONS = [
  { name: 'app', small: 'app-icon-small.svg', regular: 'app-icon.svg', ico: 'icon.ico' },
  { name: 'file', small: 'file-icon-small.svg', regular: 'file-icon.svg', ico: 'chalk-file.ico' },
];

const { chromium } = await import('@playwright/test');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 256, height: 256 },
    deviceScaleFactor: 1,
  });
  /** One size of one SVG as PNG bytes, transparent around the art. */
  const render = async (svgFile, size) => {
    const svg = readFileSync(join(SOURCES, svgFile));
    const src = `data:image/svg+xml;base64,${svg.toString('base64')}`;
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">` +
        `<img id="icon" src="${src}" width="${size}" height="${size}" style="display:block"></body></html>`,
    );
    // A string predicate: it runs in the page (this script's lint has no DOM globals).
    await page.waitForFunction(
      "(() => { const i = document.getElementById('icon'); return i.complete && i.naturalWidth > 0; })()",
    );
    const png = await page.screenshot({
      clip: { x: 0, y: 0, width: size, height: size },
      omitBackground: true,
    });
    return new Uint8Array(png);
  };
  mkdirSync(join(ROOT, 'build'), { recursive: true });
  mkdirSync(join(ROOT, 'out', 'icons'), { recursive: true });
  for (const icon of ICONS) {
    const images = [];
    for (const size of SIZES) {
      const bytes = await render(size <= SMALL_MAX ? icon.small : icon.regular, size);
      writeFileSync(join(ROOT, 'out', 'icons', `${icon.name}-${size}.png`), bytes);
      images.push({ size, bytes });
    }
    writeFileSync(join(ROOT, 'build', icon.ico), writeIco(images));
    if (icon.name === 'app') writeFileSync(join(ROOT, 'build', 'icon.png'), images.at(-1).bytes);
    console.log(`build/${icon.ico}: ${SIZES.join(', ')}`);
  }
} finally {
  await browser.close();
}

#!/usr/bin/env node
// Static shell and export mock-ups (docs/mockups/shell). DEV-TIME ONLY: `npm run check` never
// runs this.
//
//   node docs/mockups/shell/build.mjs              regenerate canvas/*.svg and the A*.html pages
//   node docs/mockups/shell/build.mjs --png <dir>  also screenshot every page into <dir>
//   node docs/mockups/shell/build.mjs --serve      serve docs/mockups on 127.0.0.1 to look around
//
// Same approach as ../editor/build.mjs: canvas layers are real svg-render output mounted under one
// `matrix(k 0 0 k panX panY)` group, overlays in screen px. The window here has a native title
// bar (31 px) and menu bar (20 px) above the page, so the canvas is 51 px shorter than in the
// editor mock-ups. Pages are served over HTTP from docs/mockups so `../editor/*` links and
// `<use href="…svg#…">` work (Chromium blocks both on file://).
import { createServer as createHttpServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPages } from './pages.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const mockups = resolve(here, '..');
const root = resolve(here, '..', '..', '..');

/** Native chrome above the page (px): Windows 11 title bar 31, menu bar 19 + 1 border. */
const NATIVE = 31 + 20;
/** Editor chrome around the canvas (px): rail 64 + 1, top bar 48 + 1, status bar 28 + 1. */
const RAIL = 65;
const TOP = 49;
const STATUS = 29;
const PT = 4 / 3;
const DEFAULT_ZOOM = 150;
const FIT_MARGIN = 48;
const ACCENT = '#1F5FD1';
const SELECTION = { alpha: 0.24, r: 12, band: 12 };

const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;
const scaleOf = (zoom) => r4((PT * zoom) / 100);

/** Canvas size inside a window of the given outer size (or client size when `client`). */
const canvasOf = (w, h, { client = false } = {}) => ({
  width: w - RAIL,
  height: h - (client ? 0 : NATIVE) - TOP - STATUS,
});

function fitZoom(core, doc, { width, height }) {
  const b = core.sr.render(doc).bounds;
  const z = Math.min((width - 2 * FIT_MARGIN) / (b.w * PT), (height - 2 * FIT_MARGIN) / (b.h * PT));
  return Math.min(DEFAULT_ZOOM, Math.floor(z * 100));
}

async function loadCore() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    resolve: { alias: { '@core': resolve(root, 'src/core') } },
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  const [dm, cc, sr] = await Promise.all([
    server.ssrLoadModule('/src/core/doc-model/index.ts'),
    server.ssrLoadModule('/src/core/chem-core/index.ts'),
    server.ssrLoadModule('/src/core/svg-render/index.ts'),
  ]);
  const json = JSON.parse(readFileSync(join(root, 'resources', 'compounds', 'compounds.json')));
  return { dm, cc, sr, names: cc.createNameIndex(json), close: () => server.close() };
}

/** Document building on the real core (as ../editor/build.mjs). */
function builder(core) {
  const { dm, cc, sr, names } = core;
  const empty = () => dm.emptyDoc('2026-01-01T00:00:00.000Z');
  const sub = (name) => {
    const r = cc.structureFromText(name, names);
    if (!r.ok) throw new Error(`not found: ${name}`);
    return r.value.sub;
  };
  const inkOf = (make) => {
    const b = sr.render(make(empty())).bounds;
    return { x: b.x / 40, y: b.y / 40, w: b.w / 40, h: b.h / 40 };
  };
  const add = (doc, name, at) => dm.insert(doc, sub(name), at);
  const object = (doc, init) => dm.addObject(doc, init);

  /** A reaction row laid out by TR2-TR5 and T3 (see ../editor/build.mjs). */
  function scheme(doc, items, baseline) {
    let x = 0;
    let prev = null;
    for (const item of items) {
      x += prev === null ? 0 : prev === 'plus' || item.kind === 'plus' ? 0.4 : 0.6;
      if (item.kind === 'mol') {
        const s = sub(item.name);
        const b = inkOf((d) => dm.insert(d, s, { x: 0, y: 0 })[0]);
        [doc] = dm.insert(doc, s, { x: x - b.x, y: baseline - (b.y + b.h / 2) });
        x += b.w;
      } else if (item.kind === 'plus') {
        const b = inkOf((d) => object(d, { type: 'plus', at: { x: 0, y: 0 } })[0]);
        [doc] = object(doc, { type: 'plus', at: { x: x - b.x, y: baseline - (b.y + b.h / 2) } });
        x += b.w;
      } else {
        const text = inkOf(
          (d) =>
            object(d, { type: 'text', at: { x: 0, y: 0 }, runs: item.above, align: 'center' })[0],
        );
        const len = Math.max(2.5, text.w + 0.6);
        const arrowAt = (d, from) =>
          object(d, { type: 'arrow', kind: 'forward', from, to: { x: from.x + len, y: from.y } });
        const b = inkOf((d) => arrowAt(d, { x: 0, y: 0 })[0]);
        let id;
        const from = { x: x - b.x, y: baseline };
        [doc, id] = arrowAt(doc, from);
        const at = { x: from.x + len / 2, y: baseline + b.y - 0.2 - (text.y + text.h) };
        [doc] = object(doc, {
          type: 'text',
          at,
          runs: item.above,
          align: 'center',
          attachedTo: { arrow: id, slot: 'above' },
        });
        x += b.w;
      }
      prev = item.kind;
    }
    return doc;
  }
  return { empty, add, scheme };
}

const CONDITIONS = [
  { text: 'conc. H' },
  { script: 'sub', text: '2' },
  { text: 'SO' },
  { script: 'sub', text: '4' },
  { text: ', Δ' },
];

function schemeDoc(b) {
  return b.scheme(
    b.empty(),
    [
      { kind: 'mol', name: 'ethanol' },
      { kind: 'plus' },
      { kind: 'mol', name: 'acetic acid' },
      { kind: 'arrow', above: CONDITIONS },
      { kind: 'mol', name: 'ethyl acetate' },
      { kind: 'plus' },
      { kind: 'mol', name: 'water' },
    ],
    0,
  );
}

/** One canvas layer: parts under the view transform, overlay shapes in screen px. */
function canvasSvg(core, { width, height, doc, zoom = DEFAULT_ZOOM, center, overlay = () => '' }) {
  const K = scaleOf(zoom);
  const scene = core.sr.render(doc);
  const b = scene.bounds;
  const c = center ?? { x: width / 2, y: height / 2 };
  const px = Math.round(c.x - (b.x + b.w / 2) * K);
  const py = Math.round(c.y - (b.y + b.h / 2) * K);
  const view = {
    scene,
    doc,
    pt: (p) => ({ x: p.x * 40 * K + px, y: p.y * 40 * K + py }),
    atom: (id) => view.pt(doc.atoms[id]),
    box: (key, grow = 0) => {
      const e = scene.extents[key];
      if (!e) return null;
      return {
        x: e.x * K + px - grow,
        y: e.y * K + py - grow,
        w: e.w * K + 2 * grow,
        h: e.h * K + 2 * grow,
      };
    },
  };
  const parts = scene.parts.map((p) => `<g data-key="${p.key}">${p.svg}</g>`).join('\n');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n` +
    `<rect width="${width}" height="${height}" fill="#FFFFFF"/>\n` +
    `<g data-layer="content" transform="matrix(${K} 0 0 ${K} ${px} ${py})" fill="none" stroke-linecap="round" stroke-linejoin="round">\n` +
    `${parts}\n</g>\n<g data-layer="overlay">\n${overlay(view)}\n</g>\n</svg>\n`
  );
}

// ---- Selection overlay (SPEC-editor.md "Canvas appearance"), screen px ----

const rect = (b, attrs) =>
  `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" ${attrs}/>`;

function exitT(p, d, b) {
  const ts = [];
  if (d.x > 0) ts.push((b.x + b.w - p.x) / d.x);
  if (d.x < 0) ts.push((b.x - p.x) / d.x);
  if (d.y > 0) ts.push((b.y + b.h - p.y) / d.y);
  if (d.y < 0) ts.push((b.y - p.y) / d.y);
  return Math.min(...ts);
}

function bondSegment(view, bondId) {
  const bond = view.doc.bonds[bondId];
  let p = view.atom(bond.a1);
  let q = view.atom(bond.a2);
  const d = { x: q.x - p.x, y: q.y - p.y };
  const bp = view.box(`atom:${bond.a1}`, 2);
  const bq = view.box(`atom:${bond.a2}`, 2);
  const p0 = p;
  if (bp) {
    const t = exitT(p0, d, bp);
    p = { x: p0.x + d.x * t, y: p0.y + d.y * t };
  }
  if (bq) {
    const back = { x: -d.x, y: -d.y };
    const t = exitT(q, back, bq);
    q = { x: q.x + back.x * t, y: q.y + back.y * t };
  }
  return [p, q];
}

function marks(view, { atoms = [], bonds = [] }, { alpha, r, band }) {
  const banded = new Set(bonds.flatMap((id) => [view.doc.bonds[id].a1, view.doc.bonds[id].a2]));
  const out = [];
  for (const id of bonds) {
    const [p, q] = bondSegment(view, id);
    out.push(
      `<line x1="${r2(p.x)}" y1="${r2(p.y)}" x2="${r2(q.x)}" y2="${r2(q.y)}" stroke="${ACCENT}" stroke-width="${band}" stroke-linecap="round"/>`,
    );
  }
  for (const id of atoms) {
    const b = view.box(`atom:${id}`, 3);
    if (b) out.push(rect(b, `rx="4" fill="${ACCENT}"`));
    else if (!banded.has(id)) {
      const c = view.atom(id);
      out.push(`<circle cx="${r2(c.x)}" cy="${r2(c.y)}" r="${r}" fill="${ACCENT}"/>`);
    }
  }
  return `<g opacity="${alpha}">${out.join('')}</g>`;
}

function union(boxes) {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

function frame(view, keys) {
  const f = union(keys.map((k) => view.box(k, 8)).filter(Boolean));
  const s = {
    x: Math.round(f.x) + 0.5,
    y: Math.round(f.y) + 0.5,
    w: Math.round(f.w),
    h: Math.round(f.h),
  };
  const cx = Math.round(s.x + s.w / 2) + 0.5;
  return (
    rect(s, `fill="none" stroke="${ACCENT}" stroke-width="1" stroke-dasharray="4 3"`) +
    `<line x1="${cx}" y1="${s.y}" x2="${cx}" y2="${s.y - 19}" stroke="${ACCENT}" stroke-width="1"/>` +
    `<circle cx="${cx}" cy="${s.y - 24}" r="5" fill="#FFFFFF" stroke="${ACCENT}" stroke-width="1.5"/>`
  );
}

/** Selection marks and frame for one inserted molecule. */
function selected(view, sel, { rings = false } = {}) {
  const keys = [...sel.atoms]
    .map((id) => `atom:${id}`)
    .concat([...sel.bonds].map((id) => `bond:${id}`));
  const ringKeys = rings
    ? Object.keys(view.scene.extents).filter((k) => k.startsWith('ring:'))
    : [];
  return (
    marks(view, { atoms: [...sel.atoms], bonds: [...sel.bonds] }, SELECTION) +
    frame(
      view,
      keys.concat(ringKeys).filter((k) => view.scene.extents[k]),
    )
  );
}

// ---- Screens ----

const FULL = canvasOf(1280, 800);
const MIN = canvasOf(960, 640);
const MIN_PROPOSAL = canvasOf(960, 640, { client: true });
const CTX = { width: 600, height: 400 };

function screens(core) {
  const { dm } = core;
  const b = builder(core);
  const out = {};
  const info = {};

  const scheme = schemeDoc(b);
  info.zoom = fitZoom(core, scheme, FULL);
  out.scheme = canvasSvg(core, { ...FULL, doc: scheme, zoom: info.zoom });
  out['min-proposal'] = canvasSvg(core, {
    ...MIN_PROPOSAL,
    doc: scheme,
    zoom: fitZoom(core, scheme, MIN_PROPOSAL),
  });
  // Export size at 300 dpi: svg-render units are pt (Slides preset), 1 pt = 300 / 72 px.
  const bounds = core.sr.render(scheme).bounds;
  info.px300 = { w: Math.ceil((bounds.w * 300) / 72), h: Math.ceil((bounds.h * 300) / 72) };

  // Benzene beside ethanol (as editor screen 03).
  let pair = b.empty();
  let ring;
  let eth;
  [pair, ring] = b.add(pair, 'benzene', { x: 0, y: 0 });
  [pair, eth] = b.add(pair, 'ethanol', { x: 4.2, y: 0.4 });
  out.min = canvasSvg(core, {
    ...MIN,
    doc: pair,
    overlay: (v) => selected(v, ring, { rings: true }),
  });

  const ch2 = [...eth.atoms].find(
    (id) => pair.atoms[id].element === 'C' && dm.neighbors(pair, id).length === 2,
  );
  info.ctx = { ...CTX, empty: { x: 330, y: 296 } };
  out['ctx-mol'] = canvasSvg(core, {
    ...CTX,
    doc: pair,
    center: { x: CTX.width / 2, y: CTX.height / 2 - 40 },
    overlay: (v) => {
      const c = v.atom(ch2);
      info.ctx.mol = { x: Math.round(c.x) + 2, y: Math.round(c.y) + 6 };
      return selected(v, eth);
    },
  });
  out['ctx-empty'] = canvasSvg(core, {
    ...CTX,
    doc: pair,
    center: { x: CTX.width / 2, y: CTX.height / 2 - 40 },
  });
  return { out, info };
}

// ---- Screenshots ----

const TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
};

function serve() {
  const server = createHttpServer((req, res) => {
    const path = normalize(
      join(mockups, decodeURIComponent(new URL(req.url, 'http://x').pathname)),
    );
    if (!path.startsWith(mockups + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = readFileSync(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function screenshots(dir, sizes) {
  const { chromium } = await import('@playwright/test');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/shell/`;
  const browser = await chromium.launch();
  try {
    mkdirSync(dir, { recursive: true });
    for (const [name, { width, height }] of Object.entries(sizes)) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      await page.goto(`${base}${name}.html`);
      await page.waitForLoadState('load');
      await page.evaluate(() => globalThis.document.fonts.ready);
      const file = join(dir, `${name}.png`);
      await page.screenshot({ path: file });
      await page.close();
      console.log(`wrote ${file}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--serve')) {
    const server = await serve();
    const port = server.address().port;
    console.log(`serving http://127.0.0.1:${port}/shell/A01-main.html (Ctrl+C stops)`);
    return;
  }
  const core = await loadCore();
  let sizes;
  try {
    const { out, info } = screens(core);
    mkdirSync(join(here, 'canvas'), { recursive: true });
    for (const [name, svg] of Object.entries(out)) {
      writeFileSync(join(here, 'canvas', `${name}.svg`), svg);
    }
    const pages = buildPages(info);
    const prettier = await import('prettier');
    sizes = {};
    for (const [name, { html, width, height }] of Object.entries(pages)) {
      const file = join(here, `${name}.html`);
      const options = await prettier.resolveConfig(file);
      writeFileSync(file, await prettier.format(html, { ...options, filepath: file }));
      sizes[name] = { width, height };
    }
    console.log(
      `wrote ${Object.keys(out).length} canvas layers, ${Object.keys(pages).length} pages`,
    );
  } finally {
    await core.close();
  }
  const png = argv.indexOf('--png');
  if (png >= 0) {
    if (!argv[png + 1]) throw new Error('--png needs a directory');
    await screenshots(resolve(argv[png + 1]), sizes);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});

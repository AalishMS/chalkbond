#!/usr/bin/env node
// Static editor mock-ups (docs/mockups/editor). DEV-TIME ONLY: `npm run check` never runs this.
//
//   node docs/mockups/editor/build.mjs              regenerate canvas/*.svg from the real core
//   node docs/mockups/editor/build.mjs --png <dir>  also screenshot every NN-*.html into <dir>
//   node docs/mockups/editor/build.mjs --serve      serve the folder on 127.0.0.1 to look around
//
// The canvas layers are real svg-render output (Slides preset, zoom 100 %, so 1 pt = 4/3 px)
// mounted the way SPEC-editor.md "Rendering" describes: one `matrix(k 0 0 k panX panY)` group of
// parts, then an overlay drawn in screen px (hover, selection, ghost, warnings, pointer). Pages
// are served over HTTP because Chromium refuses `<use href="icons.svg#…">` across file:// URLs.
import { createServer as createHttpServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPages } from './screens.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');

/** Chrome around the canvas (px): rail 56 + 1 border, top bar 48 + 1, status bar 28 + 1. */
const RAIL = 57;
const TOP = 49;
const STATUS = 29;
const K = 4 / 3;
const ACCENT = '#1F5FD1';
const WARNING = '#B42318';

const r2 = (v) => Math.round(v * 100) / 100;

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

/** Document building on top of the real core. */
function builder(core) {
  const { dm, cc, sr, names } = core;
  const empty = () => dm.emptyDoc('2026-01-01T00:00:00.000Z');
  const sub = (name) => {
    const r = cc.structureFromText(name, names);
    if (!r.ok) throw new Error(`not found: ${name}`);
    return r.value.sub;
  };
  /** Ink box in BLU of a lone thing built by `make(emptyDoc)`. */
  const inkOf = (make) => {
    const b = sr.render(make(empty())).bounds;
    return { x: b.x / 40, y: b.y / 40, w: b.w / 40, h: b.h / 40 };
  };
  const add = (doc, name, at) => dm.insert(doc, sub(name), at);
  const object = (doc, init) => dm.addObject(doc, init);

  /**
   * A reaction row laid out by TR2-TR5 and T3: gaps 0.6 BLU, 0.4 beside a plus, arrows
   * max(2.5, text + 0.6) long, condition text 0.2 BLU above the arrow ink.
   */
  function scheme(doc, items, start, baseline) {
    let x = start;
    let prev = null;
    const ids = { mols: [], arrows: [], texts: [] };
    for (const item of items) {
      const gap = prev === null ? 0 : prev === 'plus' || item.kind === 'plus' ? 0.4 : 0.6;
      x += gap;
      if (item.kind === 'mol') {
        const s = sub(item.name);
        const b = inkOf((d) => dm.insert(d, s, { x: 0, y: 0 })[0]);
        let sel;
        [doc, sel] = dm.insert(doc, s, { x: x - b.x, y: baseline - (b.y + b.h / 2) });
        ids.mols.push({ name: item.name, atoms: [...sel.atoms], bonds: [...sel.bonds] });
        x += b.w;
      } else if (item.kind === 'plus') {
        const b = inkOf((d) => object(d, { type: 'plus', at: { x: 0, y: 0 } })[0]);
        [doc] = object(doc, { type: 'plus', at: { x: x - b.x, y: baseline - (b.y + b.h / 2) } });
        x += b.w;
      } else {
        const text = item.above
          ? inkOf(
              (d) =>
                object(d, {
                  type: 'text',
                  at: { x: 0, y: 0 },
                  runs: item.above,
                  align: 'center',
                })[0],
            )
          : null;
        const len = Math.max(2.5, text ? text.w + 0.6 : 0);
        const arrowAt = (d, from) =>
          object(d, { type: 'arrow', kind: item.arrow, from, to: { x: from.x + len, y: from.y } });
        const b = inkOf((d) => arrowAt(d, { x: 0, y: 0 })[0]);
        let id;
        const from = { x: x - b.x, y: baseline };
        [doc, id] = arrowAt(doc, from);
        ids.arrows.push({ id, from, to: { x: from.x + len, y: baseline }, inkTop: baseline + b.y });
        if (text && item.showText !== false) {
          const at = { x: from.x + len / 2, y: baseline + b.y - 0.2 - (text.y + text.h) };
          let tid;
          [doc, tid] = object(doc, {
            type: 'text',
            at,
            runs: item.above,
            align: 'center',
            attachedTo: { arrow: id, slot: 'above' },
          });
          ids.texts.push(tid);
        }
        x += b.w;
      }
      prev = item.kind;
    }
    return [doc, ids, x];
  }

  return { empty, sub, add, object, scheme, inkOf };
}

/** One canvas layer: parts under the view transform, overlay shapes in screen px. */
function canvasSvg(core, { width, height, doc, center, pan, ghost = [], overlay = () => '' }) {
  const scene = core.sr.render(doc);
  const b = scene.bounds;
  let px = 0;
  let py = 0;
  if (b) {
    const c = center ?? { x: width / 2, y: height / 2 };
    px = Math.round(c.x - (b.x + b.w / 2) * K);
    py = Math.round(c.y - (b.y + b.h / 2) * K);
  }
  if (pan) [px, py] = [pan.x, pan.y];
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
  const ghostKeys = new Set(ghost);
  const parts = scene.parts
    .map((p) =>
      ghostKeys.has(p.key)
        ? `<g data-key="${p.key}" opacity="0.45">${p.svg}</g>`
        : `<g data-key="${p.key}">${p.svg}</g>`,
    )
    .join('\n');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n` +
    `<rect width="${width}" height="${height}" fill="#FFFFFF"/>\n` +
    `<g data-layer="content" transform="matrix(${r2(K)} 0 0 ${r2(K)} ${px} ${py})" fill="none" stroke-linecap="round" stroke-linejoin="round">\n` +
    `${parts}\n</g>\n<g data-layer="overlay">\n${overlay(view)}\n</g>\n</svg>\n`
  );
}

// ---- Overlay shapes (SPEC-editor.md "Canvas appearance"), screen px ----

const rect = (b, attrs) =>
  `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" ${attrs}/>`;

/** Where a ray from p along d leaves box b (b contains p). */
function exitT(p, d, b) {
  const ts = [];
  if (d.x > 0) ts.push((b.x + b.w - p.x) / d.x);
  if (d.x < 0) ts.push((b.x - p.x) / d.x);
  if (d.y > 0) ts.push((b.y + b.h - p.y) / d.y);
  if (d.y < 0) ts.push((b.y - p.y) / d.y);
  return Math.min(...ts);
}

/** The visible bond segment: ends clipped at labelled atoms' boxes. */
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

/**
 * Hover / selection marks for atoms and bonds, drawn opaque inside one translucent group so
 * overlaps do not darken. A skeleton vertex whose bonds are marked too gets no circle of its own:
 * the round-capped bond bands already cover it, and circles there read as a string of beads.
 */
function marks(view, { atoms = [], bonds = [], boxes = [] }, alpha) {
  const banded = new Set(bonds.flatMap((id) => [view.doc.bonds[id].a1, view.doc.bonds[id].a2]));
  const out = [];
  for (const id of bonds) {
    const [p, q] = bondSegment(view, id);
    out.push(
      `<line x1="${r2(p.x)}" y1="${r2(p.y)}" x2="${r2(q.x)}" y2="${r2(q.y)}" stroke="${ACCENT}" stroke-width="12" stroke-linecap="round"/>`,
    );
  }
  for (const id of atoms) {
    const b = view.box(`atom:${id}`, 3);
    if (b) out.push(rect(b, `rx="4" fill="${ACCENT}"`));
    else if (!banded.has(id)) {
      const c = view.atom(id);
      out.push(`<circle cx="${r2(c.x)}" cy="${r2(c.y)}" r="12" fill="${ACCENT}"/>`);
    }
  }
  for (const key of boxes) out.push(rect(view.box(key, 4), `rx="4" fill="${ACCENT}"`));
  return `<g opacity="${alpha}">${out.join('')}</g>`;
}

function union(boxes) {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

/** Selection frame (union of extents + 8 px, dashed) and the rotate handle above it. */
function frame(view, keys) {
  const f = union(keys.map((k) => view.box(k, 8)).filter(Boolean));
  // Snap to the half pixel so a 1 px stroke is crisp.
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

function warningMark(view, atomId) {
  const b = view.box(`atom:${atomId}`, 4);
  if (b) {
    return rect(
      b,
      `rx="4" fill="none" stroke="${WARNING}" stroke-width="1.5" stroke-dasharray="3 2"`,
    );
  }
  const c = view.atom(atomId);
  return `<circle cx="${r2(c.x)}" cy="${r2(c.y)}" r="13" fill="none" stroke="${WARNING}" stroke-width="1.5" stroke-dasharray="3 2"/>`;
}

/** The system pointer, drawn so a still picture shows where it is. Not part of the UI. */
function crosshair(p) {
  const x = Math.round(p.x) + 0.5;
  const y = Math.round(p.y) + 0.5;
  const path = `M${x - 9} ${y}H${x - 2}M${x + 2} ${y}H${x + 9}M${x} ${y - 9}V${y - 2}M${x} ${y + 2}V${y + 9}`;
  return (
    `<path d="${path}" stroke="#FFFFFF" stroke-width="3" stroke-linecap="square"/>` +
    `<path d="${path}" stroke="#000000" stroke-width="1"/>`
  );
}

function arrowPointer(p) {
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const d = `M${x} ${y}V${y + 17}L${x + 4} ${y + 13}L${x + 7} ${y + 19.5}L${x + 9.5} ${y + 18.5}L${x + 6.8} ${y + 12.2}H${x + 12}Z`;
  return `<path d="${d}" fill="#FFFFFF" stroke="#000000" stroke-width="1" stroke-linejoin="round"/>`;
}

// ---- Screens ----

const FULL = { width: 1280 - RAIL, height: 800 - TOP - STATUS };
const SMALL = { width: 960 - RAIL, height: 640 - TOP - STATUS };

const CONDITIONS = [
  { text: 'conc. H' },
  { script: 'sub', text: '2' },
  { text: 'SO' },
  { script: 'sub', text: '4' },
  { text: ', Δ' },
];

function reactionDoc(b, { showText = true, typo = true } = {}) {
  let doc = b.empty();
  let ids;
  [doc, ids] = b.scheme(
    doc,
    [
      { kind: 'mol', name: 'ethanol' },
      { kind: 'plus' },
      { kind: 'mol', name: 'acetic acid' },
      { kind: 'arrow', arrow: 'forward', above: CONDITIONS, showText },
      { kind: 'mol', name: 'ethyl acetate' },
      { kind: 'plus' },
      { kind: 'mol', name: 'water' },
    ],
    0,
    0,
  );
  const water = ids.mols[3].atoms[0];
  if (typo) doc = b.dmUpdate(doc, water, { label: 'H20' });
  return [doc, ids, water];
}

function screens(core) {
  const { dm, cc } = core;
  const b = { ...builder(core), dmUpdate: (d, id, patch) => dm.updateAtom(d, id, patch) };
  const out = {};
  const info = {};

  // 02: ethanol, Bond tool hovering the terminal carbon, ghost of the bond a click would add.
  {
    let doc = b.empty();
    let sel;
    [doc, sel] = b.add(doc, 'ethanol', { x: 0, y: 0 });
    const end = [...sel.atoms].find(
      (id) => doc.atoms[id].element === 'C' && dm.neighbors(doc, id).length === 1,
    );
    const a = doc.atoms[end];
    let ghostAtom;
    let ghostBond;
    let withGhost;
    [withGhost, ghostAtom] = dm.addAtom(doc, { element: 'C', x: a.x + 0.866, y: a.y - 0.5 });
    [withGhost, ghostBond] = dm.addBond(withGhost, end, ghostAtom);
    info.formula02 = cc.formulaOf(doc, Object.keys(doc.atoms));
    out['02-drawing'] = canvasSvg(core, {
      ...FULL,
      doc: withGhost,
      center: { x: FULL.width / 2, y: FULL.height / 2 - 20 },
      ghost: [`bond:${ghostBond}`, `atom:${ghostAtom}`],
      overlay: (v) => {
        const c = v.atom(end);
        return marks(v, { atoms: [end] }, 0.16) + crosshair({ x: c.x + 4, y: c.y + 3 });
      },
    });
  }

  // 03: Select, benzene selected, ethanol unselected beside it.
  {
    let doc = b.empty();
    let ring;
    [doc, ring] = b.add(doc, 'benzene', { x: 0, y: 0 });
    [doc] = b.add(doc, 'ethanol', { x: 4.2, y: 0.4 });
    info.formula03 = cc.formulaOf(doc, [...ring.atoms]);
    const keys = [...ring.atoms]
      .map((id) => `atom:${id}`)
      .concat([...ring.bonds].map((id) => `bond:${id}`));
    out['03-select'] = canvasSvg(core, {
      ...FULL,
      doc,
      overlay: (v) => {
        const ringKeys = Object.keys(v.scene.extents).filter((k) => k.startsWith('ring:'));
        return (
          marks(v, { atoms: [...ring.atoms], bonds: [...ring.bonds] }, 0.24) +
          frame(
            v,
            keys.concat(ringKeys).filter((k) => v.scene.extents[k]),
          )
        );
      },
    });
  }

  // 04: Ring tool; cyclohexanol on the canvas, pointer is up in the options bar.
  {
    let doc = b.empty();
    [doc] = b.add(doc, 'cyclohexanol', { x: 0, y: 0 });
    info.formula04 = cc.formulaOf(doc, Object.keys(doc.atoms));
    out['04-ring-options'] = canvasSvg(core, { ...FULL, doc });
  }

  // 05 and 11: Atom tool; propan-2-ol on the canvas.
  {
    let doc = b.empty();
    [doc] = b.add(doc, 'propan-2-ol', { x: 0, y: 0 });
    info.formula05 = cc.formulaOf(doc, Object.keys(doc.atoms));
    out['05-atom-options'] = canvasSvg(core, { ...FULL, doc });
    out['11-min-window'] = canvasSvg(core, { ...SMALL, doc });
  }

  // 08: tidy scheme with conditions; the water label typed as "H20" carries a warning.
  {
    const [doc, , water] = reactionDoc(b);
    const warnings = cc.perceive(doc).warnings;
    info.warnings08 = warnings.length;
    info.message08 = warnings[0].message;
    out['08-reaction'] = canvasSvg(core, {
      ...FULL,
      doc,
      overlay: (v) => {
        const w = v.box(`atom:${water}`, 0);
        info.water08 = w;
        return (
          marks(v, { atoms: [water] }, 0.16) +
          warnings
            .flatMap((x) => x.atoms)
            .map((id) => warningMark(v, id))
            .join('') +
          arrowPointer({ x: w.x + w.w - 6, y: w.y + w.h - 4 })
        );
      },
    });
  }

  // 09: the same scheme without its conditions; the text editor (HTML) is open above the arrow.
  {
    const [doc, ids] = reactionDoc(b, { showText: false, typo: false });
    out['09-text-editing'] = canvasSvg(core, {
      ...FULL,
      doc,
      overlay: (v) => {
        const a = ids.arrows[0];
        const m = v.pt({ x: (a.from.x + a.to.x) / 2, y: a.inkTop });
        info.arrow09 = { mid: m };
        return '';
      },
    });
  }
  const nf = cc.structureFromText('ethanl', core.names);
  info.suggest07 = nf.ok ? [] : nf.error.suggestions;
  return { out, info };
}

// ---- Screenshots ----

const PAGES = [
  ['01-empty', 1280, 800],
  ['02-drawing', 1280, 800],
  ['03-select', 1280, 800],
  ['04-ring-options', 1280, 800],
  ['05-atom-options', 1280, 800],
  ['06-name-dropdown', 1280, 800],
  ['07-name-nomatch', 1280, 800],
  ['08-reaction', 1280, 800],
  ['09-text-editing', 1280, 800],
  ['10-states', 1280, 800],
  ['11-min-window', 960, 640],
];

const TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
};

function serve() {
  const server = createHttpServer((req, res) => {
    const path = normalize(join(here, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(here + sep)) {
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

async function screenshots(dir) {
  const { chromium } = await import('@playwright/test');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  try {
    mkdirSync(dir, { recursive: true });
    for (const [name, width, height] of PAGES) {
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
    console.log(`serving http://127.0.0.1:${server.address().port}/01-empty.html (Ctrl+C stops)`);
    return;
  }
  const core = await loadCore();
  try {
    const { out, info } = screens(core);
    mkdirSync(join(here, 'canvas'), { recursive: true });
    for (const [name, svg] of Object.entries(out)) {
      writeFileSync(join(here, 'canvas', `${name}.svg`), svg);
    }
    const pages = buildPages(info);
    const prettier = await import('prettier');
    for (const [name, html] of Object.entries(pages)) {
      const file = join(here, `${name}.html`);
      const options = await prettier.resolveConfig(file);
      writeFileSync(file, await prettier.format(html, { ...options, filepath: file }));
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
    await screenshots(resolve(argv[png + 1]));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});

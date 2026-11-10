// Page templates for the shell and export mock-ups. `build.mjs` writes one static A*.html per
// screen from these (then Prettier formats them). The editor parts come from the approved editor
// mock-up templates (../editor/pages.mjs) so the two sets cannot drift; their icon links are
// rewritten to ../editor/icons.svg. Inventory and wording: SPEC-app-shell.md and
// SPEC-clipboard-export.md "UI design", amended in DEVIATIONS.md.
import {
  BOND_OPTIONS,
  HINTS,
  atomOptions,
  iconOptions,
  emptyState,
  nameField,
  rail,
  selectionActions,
  statusbar,
} from '../editor/pages.mjs';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Editor template output points at icons.svg next to the editor pages. */
const ed = (html) => html.replace(/href="icons\.svg#/g, 'href="../editor/icons.svg#');

const edIcon = (name, size = 20) =>
  `<svg class="icon icon-${size}" aria-hidden="true"><use href="../editor/icons.svg#${name}"/></svg>`;
const icon = (name, size = 20) =>
  `<svg class="icon icon-${size}" aria-hidden="true"><use href="shell-icons.svg#${name}"/></svg>`;
const glyph = (name, cls = '') =>
  `<svg class="${cls}" aria-hidden="true"><use href="native.svg#${name}"/></svg>`;

const stateClass = (state) =>
  ({ hover: ' is-hover', pressed: ' is-pressed', focus: ' is-focus' })[state] ?? '';

const SCHEME = 'esterification';

// ---- Copy button and top bar ----

/**
 * The Copy button. `variant`: 'label' (icon + label, >= 1100 px), 'icon' (spec, < 1100 px),
 * 'compact' (label only: the mock-up's proposal for < 1100 px).
 */
export function copyButton({
  variant = 'label',
  copied = false,
  disabled = false,
  state = '',
} = {}) {
  const cls = { label: '', icon: ' is-icon', compact: ' is-compact' }[variant];
  const label = copied ? 'Copied' : 'Copy';
  const inner =
    (variant === 'compact' ? '' : icon(copied ? 'check' : 'copy', 20)) +
    (variant === 'icon' ? '' : `<span aria-hidden="true">${label}</span>`);
  return (
    `<button class="btn btn-copy${cls}${stateClass(state)}" id="copy" data-testid="copy"` +
    ` aria-label="Copy (Ctrl+C)"${disabled ? ' aria-disabled="true"' : ''}>${inner}</button>`
  );
}

function topbar({
  field = nameField(),
  options = '',
  canUndo = true,
  canRedo = false,
  copy = {},
} = {}) {
  return ed(`<header class="topbar">
${field}
<div class="divider-v" role="separator"></div>
<div class="options" role="toolbar" aria-label="Tool options">
${options}
</div>
<div class="history">
<button class="btn btn-top" id="undo" aria-label="Undo (Ctrl+Z)"${canUndo ? '' : ' aria-disabled="true"'}>${edIcon('undo')}</button>
<button class="btn btn-top" id="redo" aria-label="Redo (Ctrl+Y)"${canRedo ? '' : ' aria-disabled="true"'}>${edIcon('redo')}</button>
</div>
${copyButton(copy)}
</header>`);
}

/** Status bar; `notice` replaces the hint (info: --text; error: warning icon, --warning). */
function status({ notice, error = false, ...rest } = {}) {
  const html = ed(statusbar({ ...rest, hint: '@@' }));
  const hint = notice
    ? `<div class="hint notice${error ? ' notice-error' : ''}" role="status" aria-live="polite">` +
      `${error ? edIcon('warning', 16) : ''}<span>${notice}</span></div>`
    : `<div class="hint" role="status" aria-live="polite">${rest.hint ?? ''}</div>`;
  return html.replace(/<div class="hint"[^>]*>@@<\/div>/, hint);
}

const img = (name) => `<img class="canvas-art" src="canvas/${name}.svg" alt="">`;

function editor({ top, left, canvas, foot, extra = '', compact = false }) {
  return `<div class="window${compact ? ' is-compact' : ''}">
${top}
${ed(left)}
<main class="canvas" role="application" aria-label="Drawing canvas">
${canvas}
</main>
${foot}
${extra}
</div>`;
}

/** The main window's editor with the scheme on it, nothing selected, Select active. */
function schemeEditor({ copy = {}, notice, error, extra = '', canvas = img('scheme'), zoom }) {
  return editor({
    top: topbar({
      options: ed(selectionActions({ enabled: { kekule: false, flip: false } })),
      copy,
    }),
    left: rail('select'),
    canvas,
    foot: status({ hint: HINTS.select, notice, error, zoom }),
    extra,
  });
}

// ---- Native approximations ----

const accessKey = (label, show) =>
  esc(label).replace(/&amp;(.)/, (_, c) => (show ? `<u>${c}</u>` : c));

function menubar({ open, keys }) {
  const items = ['&File', '&Edit', '&View', '&Help'].map((label) => {
    const id = label.slice(1).toLowerCase();
    return `<span class="menubar-item${open === id ? ' is-open' : ''}" id="mb-${id}">${accessKey(label, keys)}</span>`;
  });
  return `<div class="menubar" role="menubar">${items.join('')}</div>`;
}

function windowFrame({ title, width, height, open, keys, client }) {
  return `<div class="win" style="width: ${width}px; height: ${height}px">
<div class="titlebar"><img class="app" src="app-icon-small.svg" alt=""><span class="title">${esc(title)}</span>
<span class="caption-btn">${glyph('win-min')}</span><span class="caption-btn">${glyph('win-max')}</span><span class="caption-btn">${glyph('win-close')}</span></div>
${menubar({ open, keys })}
<div class="client">
${client}
</div>
</div>`;
}

/**
 * A popup menu. Items: '-' or { label ('&' marks the access key), accel, disabled, hover, more,
 * radio, id }.
 */
function menu(items, { anchor, side = 'below', style, keys = true } = {}) {
  const rows = items.map((it) =>
    it === '-'
      ? '<div class="menu-sep" role="separator"></div>'
      : `<div class="menu-item${it.hover ? ' is-hover' : ''}${it.disabled ? ' is-disabled' : ''}"` +
        `${it.id ? ` id="${it.id}"` : ''} role="menuitem">` +
        `<span class="mark">${it.radio ? glyph('menu-radio') : ''}</span>` +
        `<span class="label">${accessKey(it.label, keys)}</span>` +
        `<span class="accel">${it.accel ?? ''}</span>` +
        `<span class="more">${it.more ? glyph('menu-chevron') : ''}</span></div>`,
  );
  const place = anchor ? ` data-anchor="${anchor}" data-side="${side}"` : '';
  return `<div class="menu" role="menu"${place}${style ? ` style="${style}"` : ''}>\n${rows.join('\n')}\n</div>`;
}

/** A Windows task dialog (Electron showMessageBox). */
function msgbox({ title = 'Chalkbond', kind, appIcon = false, main, detail, buttons, dx = 0 }) {
  const iconHtml = appIcon
    ? '<img class="mb-icon" src="app-icon.svg" alt="">'
    : glyph(`mb-${kind}`, 'mb-icon');
  const btns = buttons
    .map((b, i) => `<button class="wbtn${i === 0 ? ' is-default' : ''}">${esc(b)}</button>`)
    .join('');
  return `<div class="msgbox" role="dialog" data-center="win" data-dx="${dx}" style="width: 440px">
<div class="msgbox-title"><span>${esc(title)}</span><span class="caption-btn">${glyph('win-close')}</span></div>
<div class="msgbox-body">${iconHtml}<div><p class="msgbox-main">${esc(main)}</p><p class="msgbox-detail">${detail.split('\n').map(esc).join('<br>')}</p></div></div>
<div class="msgbox-foot">${btns}</div>
</div>`;
}

function head(title, extraCss = []) {
  const css = [
    '../editor/tokens.css',
    'shell-tokens.css',
    '../editor/mockup.css',
    'native.css',
    'shell.css',
    ...extraCss,
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
${css.map((c) => `<link rel="stylesheet" href="${c}">`).join('\n')}
</head>`;
}

/** A desktop with the window at (24, 24) and the "native, approximate" caption under it. */
function desk({
  title,
  winTitle,
  width = 1280,
  height = 800,
  open,
  keys = false,
  client,
  popups = '',
  note,
}) {
  const html = `${head(title)}
<body class="desk">
${windowFrame({ title: winTitle, width, height, open, keys, client })}
${popups}
<p class="native-note" style="top: ${24 + height + 14}px">${note}</p>
<script src="shell.js"></script>
</body>
</html>
`;
  return { html, width: width + 48, height: height + 24 + 14 + 16 + 18 };
}

const NOTE_FRAME =
  '<b>Native, approximate:</b> Windows 11 title bar and menu bar (Chalkbond cannot style them). Everything inside the window is drawn exactly as it will be built.';
const noteMenu = (what) =>
  `<b>Native, approximate:</b> title bar, menu bar and the ${what} (Windows draws them; opened with the keyboard, so access keys are underlined). The window contents are as built.`;
const NOTE_BOX =
  '<b>Native, approximate:</b> title bar, menu bar and the message box (a Windows task dialog; Chalkbond sets only the words, icon and buttons). The window contents are as built.';

// ---- Export dialog ----

const FORMATS = [
  ['png', 'PNG picture', 'For WhatsApp, websites and printing.'],
  ['svg', 'SVG drawing', 'Stays sharp at any size in PowerPoint and Word.'],
  ['pdf', 'PDF document', 'For printing or sending as a document.'],
];

const SIZES = [
  ['Screen', 150, 'For messages and websites.'],
  ['Print', 300, 'Sharp on paper.'],
  ['Poster', 600, 'For large prints.'],
];

export function radioCard([id, title, desc], { checked = false, state = '' } = {}) {
  return (
    `<button class="radio-card${stateClass(state)}" role="radio" aria-checked="${checked}" id="fmt-${id}"` +
    `${checked ? ' tabindex="0"' : ' tabindex="-1"'}><span class="radio-dot" aria-hidden="true"></span>` +
    `<span class="radio-title">${title}</span><span class="radio-desc">${desc}</span></button>`
  );
}

export function segmented(selected, { hover, pressed, focus } = {}) {
  return (
    `<div class="seg" role="radiogroup" aria-labelledby="size-label">` +
    SIZES.map(([label]) => {
      const st = label === hover ? 'hover' : label === pressed ? 'pressed' : '';
      const f = label === focus ? ' is-focus' : '';
      return `<button class="btn seg-item${stateClass(st)}${f}" role="radio" aria-checked="${label === selected}">${label}</button>`;
    }).join('') +
    `</div>`
  );
}

export function checkbox({ checked = false, state = '' } = {}) {
  return (
    `<button class="check${stateClass(state)}" role="checkbox" aria-checked="${checked}">` +
    `<span class="check-box" aria-hidden="true">${checked ? icon('check', 16) : ''}</span>` +
    `<span class="check-label">White background</span>` +
    `<span class="check-help">Leave this off for slides with a coloured background.</span></button>`
  );
}

function exportDialog({ format, px, focus = false }) {
  const cards = FORMATS.map((f) =>
    radioCard(f, { checked: f[0] === format, state: focus && f[0] === format ? 'focus' : '' }),
  ).join('\n');
  const size = SIZES[1];
  const pngBlock =
    format === 'png'
      ? `<div class="export-size">
<p class="field-label" id="size-label">Size</p>
${segmented(size[0])}
<p class="size-note">${size[2]} ${px.w.toLocaleString('en-US')} × ${px.h.toLocaleString('en-US')} pixels.</p>
</div>
<div class="export-white">${checkbox()}</div>`
      : '';
  const reopen =
    format === 'pdf'
      ? `<p class="reopen is-warning">${icon('info', 16)}<span>PDF files can't be opened in Chalkbond again. Keep the drawing as a .chalk file too.</span></p>`
      : `<p class="reopen">${icon('info', 16)}<span>You can open this file in Chalkbond again to change the drawing.</span></p>`;
  return `<div class="scrim"></div>
<div class="dialog dialog-sm" role="dialog" aria-modal="true" aria-labelledby="export-title" data-testid="export-dialog">
<h2 class="dialog-title" id="export-title">Export drawing</h2>
<div class="dialog-body">
<p class="field-label" id="format-label">Format</p>
<div class="radio-cards" role="radiogroup" aria-labelledby="format-label">
${cards}
</div>
${pngBlock}
${reopen}
</div>
<div class="dialog-foot">
<button class="btn btn-secondary">Cancel</button>
<button class="btn btn-primary" data-testid="export-save">Save…</button>
</div>
</div>`;
}

// ---- Keyboard shortcuts dialog ----

const SHORTCUTS = [
  [
    'Tools',
    [
      [['V'], 'Select'],
      [['E'], 'Erase'],
      [['B'], 'Bond'],
      [['Z'], 'Chain'],
      [['R'], 'Ring'],
      [['L'], 'Atom'],
      [['A'], 'Arrow'],
      [['+'], 'Plus'],
      [['M'], 'Curved arrow'],
      [['T'], 'Text'],
    ],
  ],
  [
    'Pointing at an atom',
    [
      [['C', 'H', 'N', 'O', 'S', 'P', 'F', 'I'], 'Change it to that element'],
      [['L'], 'Change it to chlorine (Cl)'],
      [['B'], 'Change it to bromine (Br)'],
      [['+', '−'], 'Add a positive or negative charge'],
      [['1', '2', '3'], 'Add a single, double or triple bond'],
      [['Enter'], 'Type a label, such as OH or CH3'],
    ],
  ],
  [
    'Pointing at a bond',
    [
      [['1', '2', '3'], 'Make it single, double or triple'],
      [['W'], 'Make it a wedge'],
      [['H'], 'Make it a hash'],
    ],
  ],
  [
    'Editing',
    [
      [['Ctrl+Z'], 'Undo'],
      [['Ctrl+Y'], 'Redo'],
      [['Ctrl+C'], 'Copy (the whole drawing when nothing is selected)'],
      [['Ctrl+X'], 'Cut'],
      [['Ctrl+V'], 'Paste'],
      [['Ctrl+D'], 'Duplicate'],
      [['Ctrl+A'], 'Select all'],
      [['Delete'], 'Delete'],
      [['←', '↑', '→', '↓'], 'Move the selection (hold Shift to move further)'],
      [['Esc'], 'Cancel, or clear the selection'],
    ],
  ],
  [
    'Chemistry',
    [
      [['Ctrl+F'], 'Type a compound name'],
      [['Ctrl+Shift+L'], 'Clean up'],
      [['Ctrl+Shift+K'], 'Show Kekulé or circle'],
      [['Ctrl+Shift+T'], 'Tidy reaction'],
    ],
  ],
  [
    'View',
    [
      [['Ctrl+='], 'Zoom in'],
      [['Ctrl+−'], 'Zoom out'],
      [['Ctrl+0'], 'Fit drawing'],
      [['Ctrl+1'], 'Zoom to 100%'],
      [['Space+drag'], 'Move around the drawing'],
    ],
  ],
  [
    'Files',
    [
      [['Ctrl+N'], 'New drawing'],
      [['Ctrl+O'], 'Open'],
      [['Ctrl+S'], 'Save'],
      [['Ctrl+Shift+S'], 'Save as'],
      [['Ctrl+E'], 'Export'],
      [['F1'], 'This list'],
    ],
  ],
  [
    'While typing text',
    [
      [['Enter'], 'Finish'],
      [['Shift+Enter'], 'New line'],
      [['Esc'], 'Cancel'],
      [['Ctrl+B'], 'Bold'],
      [['Ctrl+I'], 'Italic'],
      [['Ctrl+='], 'Subscript'],
      [['Ctrl+Shift+='], 'Superscript'],
      [['Ctrl+Shift+D'], 'Insert Δ (heat)'],
      [['Ctrl+Shift+H'], 'Insert hν (light)'],
    ],
  ],
];

/** One key combination: chips joined by a muted "+"; alternatives side by side. */
export function keyChips(keys) {
  const chip = (part) =>
    part === 'drag' ? '<span>drag</span>' : `<kbd class="key">${esc(part)}</kbd>`;
  return keys
    .map((k) =>
      k === '+'
        ? chip(k)
        : k
            .split('+')
            .map((part) => chip(part === '' ? '+' : part))
            .join('<span aria-hidden="true">+</span>'),
    )
    .join(' ');
}

function shortcutsDialog() {
  const body = SHORTCUTS.map(
    ([section, rows]) =>
      `<h3 class="sc-section">${section}</h3>\n` +
      rows
        .map(
          ([keys, meaning]) =>
            `<div class="sc-row"><span class="keys">${keyChips(keys)}</span><span class="sc-meaning">${esc(meaning)}</span></div>`,
        )
        .join('\n'),
  ).join('\n');
  return `<div class="scrim"></div>
<div class="dialog dialog-md shortcuts" role="dialog" aria-modal="true" aria-labelledby="sc-title" data-testid="shortcuts-dialog">
<h2 class="dialog-title" id="sc-title">Keyboard shortcuts</h2>
<div class="dialog-body">
${body}
</div>
<div class="sc-thumb" aria-hidden="true"></div>
<div class="dialog-foot">
<button class="btn btn-secondary">Close</button>
</div>
</div>`;
}

// ---- Specimen sheets ----

function statesSheet() {
  const cols = ['Rest', 'Hover', 'Pressed', 'Selected / copied', 'Disabled', 'Keyboard focus'];
  const headRow = `<div class="spec-head"></div>${cols.map((c) => `<div class="spec-head">${c}</div>`).join('')}`;
  const row = (label, cells, bg = 'chrome') =>
    `<div class="spec-label">${label}</div>${cells.map((c) => `<div class="spec-cell on-${bg}">${c}</div>`).join('')}`;
  const na = '<span class="spec-na">—</span>';
  const note = (t) => `<span class="spec-note">${t}</span>`;
  const copyRow = (variant) => [
    copyButton({ variant }),
    copyButton({ variant, state: 'hover' }),
    copyButton({ variant, state: 'pressed' }),
    copyButton({ variant, copied: true }) + note('2 s after a copy'),
    copyButton({ variant, disabled: true }),
    copyButton({ variant, state: 'focus' }),
  ];
  const btn = (cls, label, { state = '', disabled = false } = {}) =>
    `<button class="btn ${cls}${stateClass(state)}"${disabled ? ' aria-disabled="true"' : ''}>${label}</button>`;
  const png = FORMATS[0];
  const rows = [
    row('Copy, icon and label (≥ 1100 px)', copyRow('label')),
    row('Copy, label only (proposal, &lt; 1100 px)', copyRow('compact')),
    row('Copy, icon only (spec, &lt; 1100 px)', copyRow('icon')),
    row(
      'Primary button',
      [
        btn('btn-primary', 'Save…'),
        btn('btn-primary', 'Save…', { state: 'hover' }),
        btn('btn-primary', 'Save…', { state: 'pressed' }),
        na,
        btn('btn-primary', 'Save…', { disabled: true }) + note('not used yet'),
        btn('btn-primary', 'Save…', { state: 'focus' }),
      ],
      'canvas',
    ),
    row(
      'Secondary button',
      [
        btn('btn-secondary', 'Cancel'),
        btn('btn-secondary', 'Cancel', { state: 'hover' }),
        btn('btn-secondary', 'Cancel', { state: 'pressed' }),
        na,
        btn('btn-secondary', 'Cancel', { disabled: true }) + note('not used yet'),
        btn('btn-secondary', 'Cancel', { state: 'focus' }),
      ],
      'canvas',
    ),
    row(
      'Radio card',
      [
        radioCard(png),
        radioCard(png, { state: 'hover' }),
        radioCard(png, { state: 'pressed' }),
        radioCard(png, { checked: true }),
        na,
        radioCard(png, { checked: true, state: 'focus' }),
      ],
      'canvas',
    ),
    row(
      'Checkbox',
      [
        checkbox(),
        checkbox({ state: 'hover' }),
        checkbox({ state: 'pressed' }),
        checkbox({ checked: true }),
        na,
        checkbox({ state: 'focus' }),
      ],
      'canvas',
    ),
  ];
  const tip = (title, { key, help, note: n }) =>
    `<div class="spec-tipbox"><div class="tooltip static"><div class="tooltip-title"><span>${title}</span>` +
    `${key ? `<kbd>${key}</kbd>` : ''}</div>${help ? `<div class="tooltip-help">${help}</div>` : ''}</div>` +
    `<span class="spec-note">${n}</span></div>`;
  const segs = [
    [segmented('Print'), 'rest (Print chosen)'],
    [segmented('Print', { hover: 'Screen' }), 'hover on Screen'],
    [segmented('Print', { pressed: 'Screen' }), 'pressed on Screen'],
    [segmented('Print', { focus: 'Print' }), 'keyboard focus'],
  ]
    .map(([html, n]) => `<div class="spec-tipbox">${html}${note(n)}</div>`)
    .join('\n');
  const chips = [
    [keyChips(['V']), 'one key'],
    [keyChips(['Ctrl+Shift+L']), 'a combination'],
    [keyChips(['1', '2', '3']), 'alternatives'],
  ]
    .map(
      ([html, n]) => `<div class="spec-tipbox"><span class="keys">${html}</span>${note(n)}</div>`,
    )
    .join('\n');
  const tips = [
    tip('Copy', {
      key: 'Ctrl+C',
      help: 'Copies the selection, or the whole drawing, to paste into PowerPoint or Word.',
      note: 'Copy, rest',
    }),
    tip('Copy', { key: 'Ctrl+C', help: 'Draw something first.', note: 'disabled: empty drawing' }),
    tip('Copy', {
      key: 'Ctrl+C',
      help: 'Press Enter to finish typing first.',
      note: 'disabled: typing a label or text',
    }),
  ].join('\n');
  const html = `${head('Shell control states', ['../editor/specimen.css', 'icons-sheet.css'])}
<body class="specimen shell-specimen">
<h1>Shell and export control states</h1>
<div class="spec-grid">
${headRow}
${rows.join('\n')}
</div>
<div class="spec-pairs">
<div><h2>Segmented control (Export: Size)</h2><div class="spec-tips">
${segs}
</div></div>
<div><h2>Key chips (Keyboard shortcuts)</h2><div class="spec-tips">
${chips}
</div></div>
</div>
<h2>Copy tooltips</h2>
<div class="spec-tips">
${tips}
</div>
</body>
</html>
`;
  return { html, width: 1280, height: 940 };
}

/** Context menus: two canvas crops side by side, each with its native menu at the pointer. */
function contextMenus(info) {
  const W = info.ctx.width;
  const H = info.ctx.height;
  const pointer = (p) =>
    `<svg class="menu-pointer" width="14" height="22" style="left: ${p.x}px; top: ${p.y}px" aria-hidden="true">` +
    `<path d="M0.5 0.5V17.5L4.5 13.5L7.5 20L10 19L7.3 12.7H12.5Z" fill="#FFFFFF" stroke="#000000" stroke-linejoin="round"/></svg>`;
  const left = { x: 24, y: 52 };
  const right = { x: 24 + W + 40, y: 52 };
  const p1 = { x: left.x + info.ctx.mol.x, y: left.y + info.ctx.mol.y };
  const p2 = { x: right.x + info.ctx.empty.x, y: right.y + info.ctx.empty.y };
  const molMenu = menu(
    [
      { label: 'Cu&t', accel: 'Ctrl+X' },
      { label: '&Copy', accel: 'Ctrl+C', hover: true },
      { label: '&Duplicate', accel: 'Ctrl+D' },
      { label: 'De&lete', accel: 'Del' },
      '-',
      { label: '&Paste', accel: 'Ctrl+V' },
    ],
    { style: `left: ${p1.x}px; top: ${p1.y}px; min-width: 0` },
  );
  const emptyMenu = menu(
    [
      { label: '&Paste', accel: 'Ctrl+V' },
      { label: '&Copy whole drawing', accel: 'Ctrl+C', hover: true },
      '-',
      { label: 'Select &all', accel: 'Ctrl+A' },
    ],
    { style: `left: ${p2.x}px; top: ${p2.y}px; min-width: 0` },
  );
  const panel = (at, name, label) =>
    `<p class="desk-label" style="left: ${at.x}px; top: ${at.y - 24}px">${label}</p>` +
    `<div class="win" style="left: ${at.x}px; top: ${at.y}px; width: ${W}px; height: ${H}px"><img src="canvas/${name}.svg" alt=""></div>`;
  const html = `${head('Context menus')}
<body class="desk">
${panel(left, 'ctx-mol', 'Right-click on a molecule: it is selected first')}
${panel(right, 'ctx-empty', 'Right-click on empty canvas, nothing selected')}
${molMenu}
${emptyMenu}
${pointer(p1)}
${pointer(p2)}
<p class="native-note" style="top: ${left.y + H + 14}px"><b>Native, approximate:</b> both menus are Windows popup menus (access keys underlined as when opened with the Menu key). Canvas crops are real svg-render output.</p>
<script src="shell.js"></script>
</body>
</html>
`;
  return { html, width: right.x + W + 24, height: left.y + H + 48 };
}

function iconsSheet() {
  const SIZES_PX = [16, 20, 24, 32, 48, 64, 256];
  const src = (s) => (s <= 32 ? 'app-icon-small.svg' : 'app-icon.svg');
  const strip = (theme) =>
    `<div class="icon-strip is-${theme}">` +
    SIZES_PX.map(
      (s) =>
        `<figure><img src="${src(s)}" width="${s}" height="${s}" alt=""><figcaption>${s}</figcaption></figure>`,
    ).join('') +
    `</div>`;
  const standIn = (cls, letter) => `<span class="stand-in ${cls}">${letter}</span>`;
  const bar = (theme) =>
    `<div class="taskbar is-${theme}">` +
    `<span class="tb-slot">${standIn('si-folder', '')}</span>` +
    `<span class="tb-slot">${standIn('si-word', 'W')}</span>` +
    `<span class="tb-slot">${standIn('si-ppt', 'P')}</span>` +
    `<span class="tb-slot">${standIn('si-excel', 'X')}</span>` +
    `<span class="tb-slot is-running is-active"><img src="app-icon-small.svg" width="24" height="24" alt=""></span>` +
    `<span class="tb-slot">${standIn('si-edge', '')}</span>` +
    `</div>`;
  const rowsData = [
    [
      'esterification.chalk',
      'Chalkbond drawing',
      '10-11-2026 10:42',
      '4 KB',
      'file-icon-small.svg',
    ],
    ['ethanol.chalk', 'Chalkbond drawing', '09-11-2026 16:05', '2 KB', 'file-icon-small.svg'],
    ['esterification.png', 'PNG File', '10-11-2026 10:44', '61 KB', null],
  ];
  const details = rowsData
    .map(
      ([name, type, date, size, ico]) =>
        `<div class="ex-row"><span class="ex-name">${ico ? `<img src="${ico}" width="16" height="16" alt="">` : '<span class="ex-png"></span>'}${name}</span><span>${date}</span><span>${type}</span><span class="ex-size">${size}</span></div>`,
    )
    .join('\n');
  const large = [48, 96]
    .map(
      (s) =>
        `<figure class="ex-large"><img src="file-icon.svg" width="${s}" height="${s}" alt=""><figcaption>esterification.chalk<br>${s} px</figcaption></figure>`,
    )
    .join('');
  const html = `${head('App and file icons', ['icons-sheet.css'])}
<body class="sheet">
<h1>App icon</h1>
<p class="sheet-note">16-32 px use app-icon-small.svg (no inner circle, heavier stroke); 48 px and up use app-icon.svg.</p>
${strip('light')}
${strip('dark')}
<h2>In the taskbar (24 px, light and dark)</h2>
<p class="sheet-note">The coloured letter tiles are plain stand-ins for File Explorer, Word, PowerPoint, Excel and Edge, not their real logos; they are there to judge colour and shape next to Chalkbond (running, active).</p>
<div class="taskbars">${bar('light')}${bar('dark')}</div>
<h2>.chalk file icon in File Explorer</h2>
<div class="explorer">
<div class="ex-details">
<div class="ex-row ex-head"><span>Name</span><span>Date modified</span><span>Type</span><span class="ex-size">Size</span></div>
${details}
</div>
<div class="ex-icons">${large}</div>
</div>
</body>
</html>
`;
  return { html, width: 1280, height: 1090 };
}

function noticesSheet() {
  const N = [
    [
      'Copy a selection (button, Ctrl+C, Edit or context menu)',
      'Copied. Paste into PowerPoint or Word with Ctrl+V.',
    ],
    [
      'Copy with nothing selected',
      'Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V.',
    ],
    ['Cut', 'Cut. Paste into PowerPoint or Word with Ctrl+V.'],
    [
      'Ctrl+C on an empty drawing (the button is disabled)',
      'Nothing to copy yet. Draw something first.',
    ],
    [
      'Copy of a very large drawing (picture made smaller, R3)',
      'Copied. The drawing is very large, so the picture is less sharp than usual.',
    ],
    ['Clipboard write failed', "Couldn't copy. Please try again.", true],
    [
      'Paste: a picture that is not from Chalkbond',
      'Only drawings copied from Chalkbond can be pasted here.',
    ],
    ['Paste: nothing usable', 'Nothing to paste. Copy a drawing, or a compound name, first.'],
    [
      'Paste: drawing from a newer Chalkbond',
      "This drawing was copied from a newer version of Chalkbond and can't be pasted.",
      true,
    ],
    [
      'Paste: damaged drawing',
      "The copied drawing is damaged and can't be pasted. Copy it again.",
      true,
    ],
    ['Paste: text over 64 KB', 'That text is too long to paste.'],
    ['Export written', `Exported ${SCHEME}.png.`],
    [
      'Export of a very large drawing (R3)',
      `Exported ${SCHEME}.png. The drawing is very large, so the picture is less sharp than you chose.`,
    ],
    [
      'Export too large to embed the drawing',
      `Exported ${SCHEME}.png. It is too large to open again in Chalkbond, so keep the .chalk file.`,
    ],
    ['Save', `Saved ${SCHEME}.chalk.`],
    [
      'Launch with a file while a recovery exists (RC4)',
      'Recovered your unsaved drawing. Save it, then open ethanol.chalk again.',
    ],
  ];
  const item = ([when, text, error]) =>
    `<div class="notice-item"><p class="notice-when"><span class="notice-kind${error ? ' is-error' : ''}">${error ? 'error' : 'info'}</span>${esc(when)}</p>` +
    `<div class="notice-bar">${status({ notice: esc(text), error, zoom: 115 })}</div></div>`;
  const narrow = [N[1], N[13]]
    .map(
      ([when, text, error]) =>
        `<div class="notice-item"><p class="notice-when"><span class="notice-kind">960 px</span>${esc(when)}</p>` +
        `<div class="notice-bar is-narrow">${status({ notice: esc(text), error, zoom: 115 })}</div></div>`,
    )
    .join('\n');
  const html = `${head('Status-bar notices', ['icons-sheet.css'])}
<body class="sheet notices">
<h1>Status-bar notices</h1>
<p class="sheet-note">The hint slot of the editor status bar, full window width. Info: --text, no icon. Error: warning icon, --warning. Each lasts 8 s, until the next canvas action, or Esc.</p>
${N.map(item).join('\n')}
<h2>At the minimum width (960 px)</h2>
${narrow}
</body>
</html>
`;
  return { html, width: 1280, height: 1110 };
}

// ---- Screens ----

export function buildPages(info) {
  const p = {};
  const winTitle = `*${SCHEME} - Chalkbond`;
  const main = (opts = {}) => schemeEditor({ zoom: info.zoom, ...opts });

  p['A01-main'] = desk({
    title: 'Main window',
    winTitle,
    client: main(),
    note: NOTE_FRAME,
  });

  p['A02-copied'] = desk({
    title: 'Copied',
    winTitle,
    client: main({
      copy: { copied: true },
      notice: 'Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V.',
    }),
    note: NOTE_FRAME,
  });

  p['A03-states'] = statesSheet();

  const fileMenu = menu(
    [
      { label: '&New', accel: 'Ctrl+N' },
      { label: '&Open…', accel: 'Ctrl+O' },
      { label: 'Open &recent', more: true, hover: true, id: 'mi-recent' },
      '-',
      { label: '&Save', accel: 'Ctrl+S' },
      { label: 'Save &as…', accel: 'Ctrl+Shift+S' },
      '-',
      { label: '&Export…', accel: 'Ctrl+E' },
      '-',
      { label: 'E&xit', accel: 'Alt+F4' },
    ],
    { anchor: 'mb-file' },
  );
  const recentMenu = menu(
    [
      { label: '&1 esterification.chalk — Grade 11' },
      { label: '&2 ethanol.chalk' },
      { label: '&3 esterification.chalk — Grade 12' },
      '-',
      { label: '&Clear recently opened' },
    ],
    { anchor: 'mi-recent', side: 'right' },
  );
  p['A04-file-menu'] = desk({
    title: 'File menu',
    winTitle,
    open: 'file',
    keys: true,
    client: main(),
    popups: `${fileMenu}\n${recentMenu}`,
    note: noteMenu('File menu with its Open recent submenu'),
  });

  p['A05-edit-menu'] = desk({
    title: 'Edit menu',
    winTitle,
    open: 'edit',
    keys: true,
    client: main(),
    popups: menu(
      [
        { label: '&Undo add bond', accel: 'Ctrl+Z' },
        { label: '&Redo', accel: 'Ctrl+Y', disabled: true },
        '-',
        { label: 'Cu&t', accel: 'Ctrl+X', disabled: true },
        { label: '&Copy whole drawing', accel: 'Ctrl+C', hover: true },
        { label: '&Paste', accel: 'Ctrl+V' },
        { label: '&Duplicate', accel: 'Ctrl+D', disabled: true },
        { label: 'De&lete', accel: 'Del', disabled: true },
        '-',
        { label: 'Select &all', accel: 'Ctrl+A' },
      ],
      { anchor: 'mb-edit' },
    ),
    note: noteMenu('Edit menu (nothing selected, so Copy reads "Copy whole drawing")'),
  });

  p['A06-view-menu'] = desk({
    title: 'View menu',
    winTitle,
    open: 'view',
    keys: true,
    client: main(),
    popups: menu(
      [
        { label: 'Zoom &in', accel: 'Ctrl+=' },
        { label: 'Zoom &out', accel: 'Ctrl+−' },
        { label: '&Fit drawing', accel: 'Ctrl+0' },
        { label: 'Zoom to &100%', accel: 'Ctrl+1' },
        '-',
        { label: '&Slides style', radio: true },
        { label: '&Handout style' },
      ],
      { anchor: 'mb-view' },
    ),
    note: noteMenu('View menu'),
  });

  p['A07-context-menus'] = contextMenus(info);

  for (const [key, format, focus] of [
    ['A08a-export-png', 'png', true],
    ['A08b-export-svg', 'svg', false],
    ['A08c-export-pdf', 'pdf', false],
  ]) {
    p[key] = desk({
      title: `Export ${format.toUpperCase()}`,
      winTitle,
      client: main({ extra: exportDialog({ format, px: info.px300, focus }) }),
      note:
        NOTE_FRAME +
        (focus
          ? ' Opened with Ctrl+E, so the chosen card shows the keyboard focus ring.'
          : ' Format chosen with the mouse (no focus ring).'),
    });
  }

  p['A09-save-prompt'] = desk({
    title: 'Save prompt',
    winTitle,
    client: main(),
    popups: msgbox({
      kind: 'warning',
      main: `Do you want to save changes to “${SCHEME}”?`,
      detail: "If you don't save, your changes will be lost.",
      buttons: ['Save', "Don't save", 'Cancel'],
    }),
    note: NOTE_BOX,
  });

  p['A10-open-errors'] = desk({
    title: 'Open errors',
    winTitle,
    client: main(),
    popups:
      msgbox({
        kind: 'error',
        main: '“photo.png” has no Chalkbond drawing inside.',
        detail: 'Only pictures exported or copied from Chalkbond can be opened and changed.',
        buttons: ['OK'],
        dx: -236,
      }) +
      msgbox({
        kind: 'error',
        main: '“ethanol.chalk” was made with a newer version of Chalkbond.',
        detail: 'Install the newer Chalkbond to open it. The file has not been changed.',
        buttons: ['OK'],
        dx: 236,
      }),
    note: `${NOTE_BOX} Two separate cases shown side by side; only one box appears at a time.`,
  });

  p['A11-recovery'] = desk({
    title: 'Recovery',
    winTitle: 'Untitled - Chalkbond',
    client: editor({
      top: topbar({
        options: ed(iconOptions(BOND_OPTIONS, { selected: 'bond-single', prefix: 'opt' })),
        canUndo: false,
        copy: { disabled: true },
      }),
      left: rail('bond'),
      canvas: ed(emptyState()),
      foot: status({ hint: HINTS.bond }),
    }),
    popups: msgbox({
      kind: 'info',
      main: 'Chalkbond closed before your drawing was saved.',
      detail: "Do you want to recover it? If you delete it, it can't be brought back.",
      buttons: ['Recover', 'Delete'],
    }),
    note: `${NOTE_BOX} Shown at launch over a fresh window.`,
  });

  p['A12-shortcuts'] = desk({
    title: 'Keyboard shortcuts',
    winTitle,
    client: main({ extra: shortcutsDialog() }),
    note: NOTE_FRAME,
  });

  p['A13-drop'] = desk({
    title: 'Drop overlay',
    winTitle,
    client: main({
      extra: `<div class="drop" data-testid="drop-overlay" aria-hidden="true"><div class="drop-box">
<p class="drop-title">Drop to open</p>
<p class="drop-sub">Chalkbond drawings (.chalk) and pictures made in Chalkbond (.png, .svg)</p>
</div></div>`,
    }),
    note: `${NOTE_FRAME} The Windows drag cursor is not drawn.`,
  });

  p['A14-about'] = desk({
    title: 'About',
    winTitle,
    client: main(),
    popups: msgbox({
      title: 'About Chalkbond',
      appIcon: true,
      main: 'Chalkbond 0.1.0',
      detail:
        'Draw chemical structures and reactions for teaching.\n\nWorks fully offline. Nothing you draw leaves this computer.\n\nCopyright © 2026 Aalish.\nBuilt with OpenChemLib, Electron, React, Immer and Zod.',
      buttons: ['OK', 'Licences'],
    }),
    note: NOTE_BOX,
  });

  const minSelect = (canvas, copy) =>
    editor({
      top: topbar({ options: ed(selectionActions({ enabled: { kekule: true } })), copy }),
      left: rail('select'),
      canvas,
      foot: status({ hint: HINTS.select }),
    });
  p['A15-min-window'] = desk({
    title: 'Minimum window',
    winTitle,
    width: 960,
    height: 640,
    client: minSelect(img('min'), { variant: 'icon' }),
    note: '<b>Spec as written:</b> 960 × 640 window, icon-only Copy. The rail no longer fits (Text is cut off). Title bar and menu bar: native, approximate.',
  });

  p['A15b-min-window-proposal'] = desk({
    title: 'Minimum window, proposal',
    winTitle,
    width: 960,
    height: 691,
    client: editor({
      top: topbar({
        options: ed(atomOptions({ selected: 'C' })),
        copy: { variant: 'compact' },
      }),
      left: rail('atom'),
      canvas: img('min-proposal'),
      foot: status({ hint: HINTS.atom }),
      compact: true,
    }),
    note: '<b>Proposal:</b> minimum client area 960 × 640 (window 960 × 691), label-only Copy, name field 204 px; the widest options bar (Atom) fits. Native parts approximate.',
  });

  p['A16-icons'] = iconsSheet();
  p['A17-notices'] = noticesSheet();
  return p;
}

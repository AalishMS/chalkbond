// Page templates for the shell and export mock-ups. `build.mjs` writes one static A*.html per
// screen from these (then Prettier formats them). The editor parts come from the approved editor
// mock-up templates (../editor/pages.mjs) so the two sets cannot drift; their icon links are
// rewritten to ../editor/icons.svg. Inventory and wording: SPEC-app-shell.md and
// SPEC-clipboard-export.md "UI design", amended in DEVIATIONS.md. From 2026-11-12 the window has
// no native menu bar: a menu button opens File, Edit, View and Help, and a tab strip (one tab per
// drawing) sits under the top bar (DEVIATIONS.md "Tabs"). Pages the tabs superseded (A04-A06,
// A09, A15-A15c) keep the old menu-bar chrome through `legacy`.
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

/** The menu button: first item of the top bar. `state`: hover, pressed, focus, or open (menu shown). */
export function menuButton({ state = '' } = {}) {
  const open = state === 'open';
  return (
    `<button class="btn btn-top btn-menu${stateClass(open ? '' : state)}" id="menu-btn" data-testid="menu-button"` +
    ` aria-label="Menu" aria-haspopup="menu" aria-expanded="${open}">${icon('menu', 20)}</button>`
  );
}

function topbar({
  field = nameField(),
  options = '',
  canUndo = true,
  canRedo = false,
  copy = {},
  menu = menuButton(),
} = {}) {
  return ed(`<header class="topbar">
${menu}
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

// ---- Tab strip ----

/**
 * One tab. `saving`: '' (nothing shown: a named file saves itself, or an unnamed drawing with
 * nothing on it), 'unnamed' (the dot: unsaved: unnamed with content, an edited picture, a kept
 * tab), 'unavailable' (warning icon: the file could not be saved, AS6) or 'unkept' (warning icon:
 * the app could not keep the drawing, SS6). T5 and T6 of SPEC-app-shell.md. `state`: hover, pressed, focus; `closeState`: hover, pressed.
 */
export function tab({
  title,
  active = false,
  saving = '',
  state = '',
  closeState = '',
  extra = '',
  style = '',
  id,
} = {}) {
  const mark =
    saving === 'unnamed'
      ? '<span class="tab-dot" aria-hidden="true"></span>'
      : saving === 'unavailable' || saving === 'unkept'
        ? `<span class="tab-warn" aria-hidden="true">${edIcon('warning', 16)}</span>`
        : '';
  const note =
    {
      unnamed: ', not saved as a file yet',
      unavailable: ", couldn't save",
      unkept: ", couldn't keep",
    }[saving] ?? '';
  return (
    `<div class="tab${stateClass(state)}${extra}" role="tab" aria-selected="${active}" tabindex="${active ? 0 : -1}"` +
    `${id ? ` id="${id}"` : ''}${style ? ` style="${style}"` : ''} aria-label="${esc(title)}${note}">` +
    `${mark}<span class="tab-title">${esc(title)}</span>` +
    `<button class="tab-close${stateClass(closeState)}" tabindex="-1" aria-label="Close ${esc(title)} (Ctrl+W)">${icon('close', 16)}</button></div>`
  );
}

/** The strip: optional scroll chevrons (only when the tabs overflow), the tabs, the new-tab button. */
export function tabstrip({ tabs, scroll = false, addState = '', style = '', extra = '' }) {
  const chev = (dir) =>
    `<button class="btn tab-scroll" tabindex="-1" aria-label="Scroll tabs ${dir}">${icon(`chevron-${dir}`, 16)}</button>`;
  return (
    `<div class="tabstrip"${style ? ` style="${style}"` : ''}>` +
    (scroll ? chev('left') : '') +
    `<div class="tabs" role="tablist" aria-label="Open drawings">${tabs.join('')}</div>` +
    (scroll ? chev('right') : '') +
    `<button class="btn tab-add${stateClass(addState)}" id="tab-add" aria-label="New tab (Ctrl+T)">${icon('add', 20)}</button>` +
    `${extra}</div>`
  );
}

/** The three tabs of the main window: the scheme, ethanol, an unnamed drawing with content. */
const mainTabs = (active = 0, opts = {}) =>
  tabstrip({
    tabs: [
      tab({ title: SCHEME, active: active === 0, ...opts[0] }),
      tab({ title: 'ethanol', active: active === 1, ...opts[1] }),
      tab({ title: 'Untitled 2', active: active === 2, saving: 'unnamed', ...opts[2] }),
    ],
  });

const img = (name) => `<img class="canvas-art" src="canvas/${name}.svg" alt="">`;

function editor({ top, left, canvas, foot, extra = '', compact = false, tabs = '' }) {
  return `<div class="window${compact ? ' is-compact' : ''}${tabs ? ' has-tabs' : ''}">
${top}
${ed(left)}
${tabs}
<main class="canvas" role="application" aria-label="Drawing canvas">
${canvas}
</main>
${foot}
${extra}
</div>`;
}

/** The main window's editor with the scheme on it, nothing selected, Select active. */
function schemeEditor({
  copy = {},
  notice,
  error,
  extra = '',
  canvas,
  zoom,
  legacy = false,
  tabs = mainTabs(),
  menu,
}) {
  return editor({
    top: topbar({
      options: ed(selectionActions({ enabled: { kekule: false, flip: false } })),
      copy,
      menu: legacy ? '' : (menu ?? menuButton()),
    }),
    left: rail('select'),
    canvas: canvas ?? img(legacy ? 'scheme' : 'scheme-tabs'),
    foot: status({ hint: HINTS.select, notice, error, zoom }),
    extra,
    tabs: legacy ? '' : tabs,
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

function windowFrame({ title, width, height, open, keys, client, legacy }) {
  return `<div class="win" style="width: ${width}px; height: ${height}px">
<div class="titlebar"><img class="app" src="app-icon-small.svg" alt=""><span class="title">${esc(title)}</span>
<span class="caption-btn">${glyph('win-min')}</span><span class="caption-btn">${glyph('win-max')}</span><span class="caption-btn">${glyph('win-close')}</span></div>
${legacy ? menubar({ open, keys }) : ''}
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
  legacy = false,
}) {
  const html = `${head(title)}
<body class="desk">
${windowFrame({ title: winTitle, width, height, open, keys, client, legacy })}
${popups}
<p class="native-note" style="top: ${24 + height + 14}px">${note}</p>
<script src="shell.js"></script>
</body>
</html>
`;
  return { html, width: width + 48, height: height + 24 + 14 + 16 + 18 };
}

const NOTE_FRAME =
  '<b>Native, approximate:</b> the Windows 11 title bar (Chalkbond cannot style it; the title is the name of the active tab). Everything inside the window is drawn exactly as it will be built.';
const NOTE_BOX =
  '<b>Native, approximate:</b> title bar and the message box (a Windows task dialog; Chalkbond sets only the words, icon and buttons). The window contents are as built.';

// Pages the tabs superseded keep the old chrome (title bar, menu bar) so the old wording can be
// compared; each says what replaced it.
const superseded = (by) =>
  `<b>Superseded 2026-11-12, kept for the old wording (${by}).</b> Old chrome: native menu bar and no tab strip. `;
const noteMenu = (what) =>
  `<b>Native, approximate:</b> title bar, menu bar and the ${what} (Windows draws them; opened with the keyboard, so access keys are underlined). The window contents are as built.`;

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
      // SPEC-editor.md R50: the number on the tool's button, then its letter.
      [['1', 'V'], 'Select'],
      [['2', 'E'], 'Erase'],
      [['3', 'B'], 'Bond'],
      [['4', 'Z'], 'Chain'],
      [['5', 'R'], 'Ring'],
      [['6', 'L'], 'Atom'],
      [['7', 'A'], 'Arrow'],
      [['8', '+'], 'Plus'],
      [['9', 'M'], 'Curved arrow'],
      [['0', 'T'], 'Text'],
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
      [['Ctrl+Shift+R'], 'Tidy reaction'],
    ],
  ],
  [
    'View',
    [
      [['Ctrl+='], 'Zoom in'],
      [['Ctrl+−'], 'Zoom out'],
      [['Ctrl+0'], 'Fit drawing'],
      [['Space+drag'], 'Move around the drawing'],
    ],
  ],
  [
    'Tabs and files',
    [
      [['Ctrl+T', 'Ctrl+N'], 'New tab'],
      [['Ctrl+W'], 'Close tab'],
      [['Ctrl+Shift+T'], 'Reopen closed tab'],
      [['Ctrl+Tab', 'Ctrl+Shift+Tab'], 'Next tab, previous tab'],
      [['Ctrl+1–8'], 'Go to tab 1–8'],
      [['Ctrl+9'], 'Go to the last tab'],
      [['Ctrl+O'], 'Open'],
      [['Ctrl+S'], 'Save'],
      [['Ctrl+Shift+S'], 'Save as'],
      [['Ctrl+E'], 'Export'],
      [['F10'], 'Open the menu'],
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

// ---- Tabs, menu button, close prompt, minimum window (2026-11-12) ----

/** A tooltip as the specimen sheets show it (static, with its caption). */
function tip(title, { key, help, note: n }) {
  return (
    '<div class="spec-tipbox"><div class="tooltip static"><div class="tooltip-title"><span>' +
    title +
    '</span>' +
    (key ? '<kbd>' + key + '</kbd>' : '') +
    '</div>' +
    (help ? '<div class="tooltip-help">' + help + '</div>' : '') +
    '</div><span class="spec-note">' +
    n +
    '</span></div>'
  );
}

/**
 * A strip at real size beside a 65 px rail and under a 12 px slice of the top bar, with a slice
 * of canvas under it, so the active tab is seen running into the canvas. 960 px is the minimum
 * window: the canvas column is 895 px.
 */
const stripFrame = (strip, caption = '') =>
  '<div class="strip-frame"><div class="sf-top"></div><div class="sf-rail"></div>' +
  strip +
  '<div class="sf-canvas"></div></div>' +
  caption;

/** Captions under the tabs of a strip whose tabs all have the same width. */
const captionRow = (labels, width) =>
  '<div class="cap-row" style="--cap-w: ' +
  width +
  'px">' +
  labels.map((l) => '<span>' + l + '</span>').join('') +
  '</div>';

const fixed = (w) => 'flex: none; min-width: 0; width: ' + w + 'px';

function tabsSheet() {
  const section = (title, note, body) =>
    '<section class="tab-section"><h2>' +
    title +
    '</h2>' +
    (note ? '<p class="sheet-note">' + note + '</p>' : '') +
    body +
    '</section>';

  const one = stripFrame(
    tabstrip({ tabs: [tab({ title: 'Untitled', active: true })] }),
    captionRow(['Untitled: nothing drawn yet, so no dot'], 400),
  );

  const several = stripFrame(
    tabstrip({
      tabs: [
        tab({ title: SCHEME, active: true }),
        tab({ title: 'ethanol' }),
        tab({ title: 'Untitled 2', saving: 'unnamed' }),
        tab({ title: 'Aspirin synthesis from salicylic acid' }),
      ],
    }),
    captionRow(
      [
        'active',
        'rest',
        'unnamed, with content',
        'long name: cut with …, full name in the tooltip',
      ],
      200,
    ),
  );

  const stateTabs = [
    tab({ title: 'Active', active: true, style: fixed(124) }),
    tab({ title: 'Rest', style: fixed(124) }),
    tab({ title: 'Hover', state: 'hover', style: fixed(124) }),
    tab({ title: 'Pressed', state: 'pressed', style: fixed(124) }),
    tab({ title: 'Keyboard focus', active: true, state: 'focus', style: fixed(124) }),
    tab({ title: 'Cross hover', active: true, closeState: 'hover', style: fixed(124) }),
    tab({ title: 'Cross pressed', active: true, closeState: 'pressed', style: fixed(124) }),
  ];
  const states = stripFrame(
    tabstrip({ tabs: stateTabs }),
    captionRow(
      ['active', 'rest', 'hover', 'pressed', 'keyboard focus', 'hover on ×', 'pressed ×'],
      124,
    ),
  );
  const addStates = stripFrame(
    tabstrip({
      tabs: [tab({ title: SCHEME, active: true, style: fixed(124) })],
      addState: 'hover',
    }),
    captionRow(['', '+ hover'], 124),
  );

  const saving = stripFrame(
    tabstrip({
      tabs: [
        tab({ title: SCHEME, active: true, style: fixed(200) }),
        tab({ title: 'Untitled 2', saving: 'unnamed', style: fixed(200) }),
        tab({ title: 'ethanol', saving: 'unavailable', style: fixed(200) }),
        tab({ title: 'Untitled 3', saving: 'unkept', style: fixed(200) }),
      ],
    }),
    captionRow(
      [
        'named file: saves itself, nothing shown (no “Saving…”)',
        'unsaved (unnamed with content, edited picture, kept copy): the dot',
        'unavailable file (could not save): warning icon in the dot’s place',
        'unkept drawing (the app could not keep it, e.g. disk full): warning icon',
      ],
      198,
    ),
  );

  const names = [
    'ethanol',
    'Untitled 2',
    'benzene',
    'aspirin',
    'alkenes',
    'soap',
    'polymers',
    'Untitled 3',
    'titration',
    'Grade 12 notes',
  ];
  const overflow = stripFrame(
    tabstrip({
      scroll: true,
      tabs: names.map((n, i) =>
        tab({
          title: n,
          active: n === 'Untitled 3',
          saving: n.startsWith('Untitled') ? 'unnamed' : '',
          style: i === 0 ? 'margin-left: -52px' : '',
        }),
      ),
    }),
    '<div class="cap-row" style="--cap-w: 800px"><span>11 tabs in 895 px: tabs shrink to 96 px, then the strip scrolls. The chevrons appear only now, and each only on a side that has more. The mouse wheel scrolls too, and a new or chosen tab scrolls into view.</span></div>',
  );

  const drag = stripFrame(
    tabstrip({
      tabs: [
        tab({ title: SCHEME, active: true }),
        tab({ title: 'ethanol', extra: ' is-lifted' }),
        tab({ title: 'Untitled 2', saving: 'unnamed' }),
      ],
      extra:
        '<div class="tab-drop" style="left: 5px"></div>' +
        tab({
          title: 'ethanol',
          extra: ' is-dragging',
          style: 'left: 44px; top: 8px; ' + fixed(124),
        }),
    }),
    '<div class="cap-row" style="--cap-w: 800px"><span>dragging “ethanol” to the front: the tab lifts and follows the pointer, its place dims, a 2 px accent line shows where it will land</span></div>',
  );

  const ctxTabs = tabstrip({
    tabs: [
      tab({ title: SCHEME, active: true }),
      tab({ title: 'ethanol', state: 'hover', id: 'ctx-tab' }),
      tab({ title: 'Untitled 2', saving: 'unnamed' }),
    ],
  });
  const ctxMenu =
    menu(
      [
        { label: '&New tab', accel: 'Ctrl+T' },
        '-',
        { label: '&Close tab', accel: 'Ctrl+W', hover: true },
        '-',
        { label: 'Reopen closed &tab', accel: 'Ctrl+Shift+T' },
      ],
      { keys: false, style: 'min-width: 0' },
    ).replace('<div class="menu"', '<div class="menu" data-at="ctx-tab"') +
    '<svg class="menu-pointer" data-at="ctx-tab" width="14" height="22" aria-hidden="true">' +
    '<path d="M0.5 0.5V17.5L4.5 13.5L7.5 20L10 19L7.3 12.7H12.5Z" fill="#FFFFFF" stroke="#000000" stroke-linejoin="round"/></svg>';
  const context = stripFrame(
    ctxTabs,
    '<div class="cap-row" style="--cap-w: 800px"><span>right-click on “ethanol” (the active tab does not change)</span></div>',
  );

  const tips = [
    tip('esterification', {
      help: 'Switch tabs with Ctrl+Tab and Ctrl+Shift+Tab.',
      note: 'on a tab',
    }),
    tip('Untitled 2', {
      help: 'Not saved as a file yet. Chalkbond keeps it for you. Press Ctrl+S to save it.',
      note: 'on an unsaved tab (the dot)',
    }),
    tip('ethanol', {
      help: "Couldn't save this file. Check that its folder is still there, or use Save as.",
      note: 'on an unavailable file tab (warning icon)',
    }),
    tip('Untitled 3', {
      help: "Chalkbond couldn't keep this drawing. Free some disk space, or save it with Save as.",
      note: 'on an unkept tab (warning icon)',
    }),
    tip('Close tab', { key: 'Ctrl+W', note: 'on ×' }),
    tip('New tab', { key: 'Ctrl+T', note: 'on +' }),
  ].join('\n');

  const html =
    head('Tab strip states', ['../editor/specimen.css', 'icons-sheet.css', 'tabs-sheet.css']) +
    '\n<body class="specimen shell-specimen tabs-sheet">\n<h1>Tab strip</h1>\n' +
    section('One tab', 'Always shown, even with one drawing, like a browser.', one) +
    section('Several tabs', 'Tabs are 200 px wide at most.', several) +
    section(
      'States',
      'The cross is shown on the active tab and on a hovered or focused one; its room is always kept, so a title never moves.',
      states + addStates,
    ) +
    section(
      'Saving',
      'Autosave is silent: a file tab shows nothing, even while it writes. A dot means unsaved (unnamed with content, edited picture, kept copy); a warning icon in its place means the file could not be saved or the drawing could not be kept.',
      saving,
    ) +
    section('Many tabs', '', overflow) +
    section('Drag to reorder', '', drag) +
    '<section class="tab-section tips-section"><h2>Tooltips</h2><div class="spec-tips">\n' +
    tips +
    '\n</div></section>\n' +
    section(
      'Right-click on a tab',
      'Native, approximate: a Windows popup menu, opened with the mouse (no underlined access keys).',
      context,
    ) +
    ctxMenu +
    '\n<script src="shell.js"></script>\n</body>\n</html>\n';
  return { html, width: 1024, height: 1660 };
}

/** The menu button's open menu with File's submenu, and the button in every state. */
function menuPage(info) {
  const file = menu(
    [
      { label: '&File', more: true, hover: true, id: 'mi-file' },
      { label: '&Edit', more: true },
      { label: '&View', more: true },
      { label: '&Help', more: true },
    ],
    { anchor: 'menu-btn', side: 'below', keys: false, style: 'min-width: 148px' },
  );
  const fileSub = menu(
    [
      { label: '&New tab', accel: 'Ctrl+T' },
      { label: '&Open…', accel: 'Ctrl+O' },
      { label: 'Open &recent', more: true },
      '-',
      { label: '&Save', accel: 'Ctrl+S' },
      { label: 'Save &as…', accel: 'Ctrl+Shift+S' },
      '-',
      { label: '&Export…', accel: 'Ctrl+E' },
      '-',
      { label: 'Reopen closed &tab', accel: 'Ctrl+Shift+T' },
      { label: '&Close tab', accel: 'Ctrl+W' },
      '-',
      { label: 'E&xit', accel: 'Alt+F4' },
    ],
    { anchor: 'mi-file', side: 'right', keys: false },
  );
  const desktop = desk({
    title: 'Menu button and menu',
    winTitle: SCHEME + ' - Chalkbond',
    client: schemeEditor({ zoom: info.zoomTabs, menu: menuButton({ state: 'open' }) }),
    popups: file + '\n' + fileSub,
    note: '<b>Native, approximate:</b> the title bar and the popup menus (Windows draws them; opened with the mouse, so no access keys are underlined). Edit, View and Help keep their trees from A05, A06 and the spec. The window contents are as built.',
  });
  const cell = (state, label) =>
    '<div class="ms-cell"><div class="ms-slot">' +
    menuButton({ state }) +
    '</div><span class="spec-note">' +
    label +
    '</span></div>';
  const states =
    '<p class="desk-label" style="left: 24px; top: 886px">Menu button, as it sits at the left of the top bar (32 × 32)</p>' +
    '<div class="ms-row" style="left: 24px; top: 912px">' +
    cell('', 'rest') +
    cell('hover', 'hover') +
    cell('focus', 'keyboard focus') +
    cell('pressed', 'pressed') +
    cell('open', 'menu open') +
    '<div class="ms-cell"><div class="ms-tip"><div class="tooltip static"><div class="tooltip-title"><span>Menu (Alt or F10)</span></div><div class="tooltip-help">File, Edit, View and Help.</div></div></div><span class="spec-note">tooltip</span></div>' +
    '</div>';
  const html = desktop.html
    .replace(
      '<link rel="stylesheet" href="shell.css">',
      '<link rel="stylesheet" href="shell.css">\n<link rel="stylesheet" href="tabs-sheet.css">',
    )
    .replace('<script src="shell.js"></script>', states + '\n<script src="shell.js"></script>');
  return { html, width: desktop.width, height: 1040 };
}

/** The close prompt for an unnamed drawing (modelled on A09). */
function closePrompt(info) {
  const client = editor({
    top: topbar({ options: ed(selectionActions({ enabled: { flip: false } })) }),
    left: rail('select'),
    canvas: img('untitled'),
    foot: status({ hint: HINTS.select, zoom: info.zoomUntitled }),
    tabs: mainTabs(2, { 2: { closeState: 'hover' } }),
  });
  return desk({
    title: 'Close tab prompt',
    winTitle: '*Untitled 2 - Chalkbond',
    client,
    popups: msgbox({
      kind: 'warning',
      main: 'Do you want to save “Untitled 2”?',
      detail: "If you don't save, your drawing will be lost.",
      buttons: ['Save', "Don't save", 'Cancel'],
    }),
    note:
      NOTE_BOX +
      ' Closing an unnamed drawing that has content (cross, Ctrl+W, middle click). Wording is a draft.',
  });
}

/** The minimum window, 960 x 640 of content, with the widest options bar (Atom). */
function minimumWindow(info) {
  return desk({
    title: 'Minimum window with tabs',
    winTitle: SCHEME + ' - Chalkbond',
    width: 960,
    height: 671,
    client: editor({
      top: topbar({ options: ed(atomOptions({ selected: 'C' })), copy: { variant: 'compact' } }),
      left: rail('atom'),
      canvas: img('min-tabs'),
      foot: status({ hint: HINTS.atom, zoom: info.zoomMin }),
      compact: true,
      tabs: mainTabs(),
    }),
    note: '<b>Minimum window:</b> content area 960 × 640 (window 960 × 671: the menu bar is gone), with the Atom tool, the widest options bar. Native title bar approximate.',
  });
}

// ---- Screens ----

export function buildPages(info) {
  const p = {};
  // Autosave: no asterisk any more (a named drawing saves itself); the title is the active tab's.
  const winTitle = `${SCHEME} - Chalkbond`;
  const oldTitle = `*${SCHEME} - Chalkbond`;
  const main = (opts = {}) =>
    schemeEditor({ zoom: opts.legacy ? info.zoom : info.zoomTabs, ...opts });

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
    winTitle: oldTitle,
    legacy: true,
    open: 'file',
    keys: true,
    client: main({ legacy: true }),
    popups: `${fileMenu}\n${recentMenu}`,
    note:
      superseded('the menus now open from the menu button, A19') +
      noteMenu('File menu with its Open recent submenu'),
  });

  p['A05-edit-menu'] = desk({
    title: 'Edit menu',
    winTitle: oldTitle,
    legacy: true,
    open: 'edit',
    keys: true,
    client: main({ legacy: true }),
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
    note:
      superseded('the menus now open from the menu button, A19') +
      noteMenu('Edit menu (nothing selected, so Copy reads "Copy whole drawing")'),
  });

  p['A06-view-menu'] = desk({
    title: 'View menu',
    winTitle: oldTitle,
    legacy: true,
    open: 'view',
    keys: true,
    client: main({ legacy: true }),
    popups: menu(
      [
        { label: 'Zoom &in', accel: 'Ctrl+=' },
        { label: 'Zoom &out', accel: 'Ctrl+−' },
        { label: '&Fit drawing', accel: 'Ctrl+0' },
        { label: 'Zoom to &100%' },
        '-',
        { label: '&Slides style', radio: true },
        { label: '&Handout style' },
      ],
      { anchor: 'mb-view' },
    ),
    note: superseded('the menus now open from the menu button, A19') + noteMenu('View menu'),
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
    winTitle: oldTitle,
    legacy: true,
    client: main({ legacy: true }),
    popups: msgbox({
      kind: 'warning',
      main: `Do you want to save changes to “${SCHEME}”?`,
      detail: "If you don't save, your changes will be lost.",
      buttons: ['Save', "Don't save", 'Cancel'],
    }),
    note:
      superseded('a named drawing now saves itself; closing an unnamed one asks, A20') + NOTE_BOX,
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
      tabs: tabstrip({ tabs: [tab({ title: 'Untitled', active: true })] }),
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
      top: topbar({
        options: ed(selectionActions({ enabled: { kekule: true } })),
        copy,
        menu: '',
      }),
      left: rail('select'),
      canvas,
      foot: status({ hint: HINTS.select }),
    });
  p['A15-min-window'] = desk({
    title: 'Minimum window',
    winTitle: oldTitle,
    legacy: true,
    width: 960,
    height: 640,
    client: minSelect(img('min'), { variant: 'icon' }),
    note:
      superseded('minimum window with tabs and the menu button, A21') +
      '<b>Spec as written:</b> 960 × 640 window, icon-only Copy. The rail no longer fits (Text is cut off). Title bar and menu bar: native, approximate.',
  });

  p['A15b-min-window-proposal'] = desk({
    title: 'Minimum window, proposal',
    winTitle: oldTitle,
    legacy: true,
    width: 960,
    height: 691,
    client: editor({
      top: topbar({
        options: ed(atomOptions({ selected: 'C' })),
        copy: { variant: 'compact' },
        menu: '',
      }),
      left: rail('atom'),
      canvas: img('min-proposal'),
      foot: status({ hint: HINTS.atom }),
      compact: true,
    }),
    note:
      superseded('minimum window with tabs and the menu button, A21') +
      '<b>Proposal:</b> minimum client area 960 × 640 (window 960 × 691), label-only Copy, name field 204 px; the widest options bar (Atom) fits. Native parts approximate.',
  });

  // SPEC-editor.md R51 (U8, 2026-11-12): the Select bar with the formula switch at the minimum
  // window; below 1100 px the switch is icon-only, so the bar fits beside the label-only Copy.
  p['A15c-min-window-select'] = desk({
    title: 'Minimum window, Select',
    winTitle: oldTitle,
    legacy: true,
    width: 960,
    height: 691,
    client: editor({
      top: topbar({
        options: ed(selectionActions({ enabled: { kekule: true } })),
        copy: { variant: 'compact' },
        menu: '',
      }),
      left: rail('select'),
      canvas: img('min-proposal'),
      foot: status({ hint: HINTS.select }),
      compact: true,
    }),
    note:
      superseded('minimum window with tabs and the menu button, A21') +
      '<b>2026-11-12 feature set:</b> client area 960 × 640 with the Select tool; the formula switch (R51) is icon-only below 1100 px, so the Select options bar fits beside the label-only Copy. Native parts approximate.',
  });

  p['A18-tab-strip'] = tabsSheet();
  p['A19-menu-button'] = menuPage(info);
  p['A20-close-tab-prompt'] = closePrompt(info);
  p['A21-min-window-tabs'] = minimumWindow(info);

  p['A16-icons'] = iconsSheet();
  p['A17-notices'] = noticesSheet();
  return p;
}

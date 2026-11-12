// Page templates for the editor mock-ups. `build.mjs` writes one static NN-*.html per screen
// from these (then Prettier formats them); the HTML files are the deliverable, this file only
// keeps the eleven pages consistent. Inventory, labels and hints: SPEC-editor.md "UI design",
// with the option lists amended in DEVIATIONS.md.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const icon = (name, size = 24) =>
  `<svg class="icon${size === 24 ? '' : ` icon-${size}`}" aria-hidden="true"><use href="icons.svg#${name}"/></svg>`;

/** Attributes for a forced static state. */
function stateClass(state) {
  return { hover: ' is-hover', pressed: ' is-pressed', focus: ' is-focus' }[state] ?? '';
}

// ---- Rail ----

const HINTS = {
  select: 'Click a molecule to select it. Drag to move. Drag on empty space to select an area.',
  erase: 'Click or drag over anything to erase it.',
  bond: 'Click to add a bond. Drag to aim it. Click a bond to change it.',
  chain: 'Drag to draw a carbon chain.',
  ring: 'Click to place the ring. Click an atom or bond to attach it.',
  atom: 'Click an atom to change it. Click empty space to add an atom.',
  arrow: 'Drag to draw an arrow.',
  plus: 'Click to place a plus sign.',
  curved: 'Drag from an atom or bond to where the electrons go.',
  text: 'Click to type. Click above or below an arrow for conditions.',
  hoverAtom: 'Type O, N, Cl… to change this atom. Enter for any label.',
  nameField: 'Enter inserts. Write a reaction like: ethanol + acetic acid -> ethyl acetate',
  textEditing:
    'Enter finishes. Shift+Enter starts a new line. Formulas like H2SO4 get their subscripts when you finish.',
};
export { HINTS };

/**
 * id, accessible name, letter key, default glyph, one-word caption under the icon, number key
 * (SPEC-editor.md R50: the digits 1-9, 0 in rail order, shown as a badge on each button).
 */
const TOOLS = [
  ['select', 'Select', 'V', 'select', 'Select', '1'],
  ['erase', 'Erase', 'E', 'erase', 'Erase', '2'],
  '|',
  ['bond', 'Bond', 'B', 'bond-single', 'Bond', '3'],
  ['chain', 'Chain', 'Z', 'chain', 'Chain', '4'],
  ['ring', 'Ring', 'R', 'ring-benzene', 'Ring', '5'],
  ['atom', 'Atom', 'L', 'C', 'Atom', '6'],
  '|',
  ['arrow', 'Arrow', 'A', 'arrow-forward', 'Arrow', '7'],
  ['plus', 'Plus', '+', 'plus', 'Plus', '8'],
  ['curved', 'Curved arrow', 'M', 'curved-full', 'Curly', '9'],
  ['text', 'Text', 'T', 'text', 'Text', '0'],
];
export { TOOLS };

/** `aria-keyshortcuts` names the plus key "Plus" (WAI-ARIA 1.2), every other key as typed. */
const ariaKey = (k) => (k === '+' ? 'Plus' : k);

/**
 * R50: the accessible name is the tool's name alone; both keys are in `aria-keyshortcuts`
 * (digit first, as the badge shows it), so a screen reader hears each key once. The badge and the
 * caption are `aria-hidden`.
 */
export function railButton(
  [id, label, key, glyph, caption, digit],
  { active = false, state = '', current } = {},
) {
  const g = current ?? glyph;
  const inner = /^[A-Z][a-z]?$/.test(g) ? `<span class="rail-glyph">${g}</span>` : icon(g);
  return (
    `<button class="btn btn-rail${stateClass(state)}" id="tool-${id}" aria-label="${label}"` +
    ` aria-keyshortcuts="${digit} ${ariaKey(key)}" aria-pressed="${active}">` +
    `<span class="rail-key" aria-hidden="true">${digit}</span>${inner}` +
    `<span class="rail-caption" aria-hidden="true">${caption}</span></button>`
  );
}

/** `current` maps tool id to the glyph it shows (its current variant). */
export function rail(activeTool, { current = {}, states = {} } = {}) {
  const items = TOOLS.map((t) =>
    t === '|'
      ? '<div class="rail-sep" role="separator"></div>'
      : railButton(t, { active: t[0] === activeTool, state: states[t[0]], current: current[t[0]] }),
  );
  return `<nav class="rail" role="toolbar" aria-orientation="vertical" aria-label="Tools">\n${items.join('\n')}\n</nav>`;
}

// ---- Options bar ----

export const BOND_OPTIONS = [
  ['bond-single', 'Single'],
  ['bond-double', 'Double'],
  ['bond-triple', 'Triple'],
  ['bond-wedge', 'Wedge'],
  ['bond-hash', 'Hash'],
];
export const RING_OPTIONS = [
  ['ring-benzene', 'Benzene'],
  ['ring-6', 'Cyclohexane'],
  ['ring-5', 'Cyclopentane'],
  ['ring-4', 'Cyclobutane'],
  ['ring-3', 'Cyclopropane'],
];
export const ARROW_OPTIONS = [
  ['arrow-forward', 'Reaction'],
  ['arrow-equilibrium', 'Equilibrium'],
  ['arrow-resonance', 'Resonance'],
  ['arrow-nogo', 'No reaction'],
];
export const ELEMENTS = ['C', 'H', 'N', 'O', 'S', 'P', 'F', 'Cl', 'Br', 'I'];
export const MARKS = [
  ['icon', 'mark-plus', 'Positive charge'],
  ['icon', 'mark-minus', 'Negative charge'],
  ['icon', 'mark-lone-pair', 'Lone pair'],
  ['icon', 'mark-radical', 'Radical'],
  ['text', 'δ+', 'Partial positive charge'],
  ['text', 'δ−', 'Partial negative charge'],
];

export function optIcon(name, label, { selected = false, state = '', id } = {}) {
  return (
    `<button class="btn btn-opt${stateClass(state)}"${id ? ` id="${id}"` : ''} aria-label="${label}"` +
    ` aria-pressed="${selected}">${icon(name, 20)}</button>`
  );
}

export function optText(text, label, { selected = false, state = '', id, disabled = false } = {}) {
  return (
    `<button class="btn btn-opt text${stateClass(state)}"${id ? ` id="${id}"` : ''} aria-label="${label}"` +
    `${disabled ? ' aria-disabled="true"' : ` aria-pressed="${selected}"`}>${text}</button>`
  );
}

export function iconOptions(list, { selected, hover, prefix }) {
  return list
    .map(([name, label]) =>
      optIcon(name, label, {
        selected: name === selected,
        state: name === hover ? 'hover' : '',
        id: `${prefix}-${name}`,
      }),
    )
    .join('\n');
}

const ELEMENT_NAMES = {
  C: 'Carbon',
  H: 'Hydrogen',
  N: 'Nitrogen',
  O: 'Oxygen',
  S: 'Sulfur',
  P: 'Phosphorus',
  F: 'Fluorine',
  Cl: 'Chlorine',
  Br: 'Bromine',
  I: 'Iodine',
};
export { ELEMENT_NAMES };

export function atomOptions({ selected, hover } = {}) {
  const els = ELEMENTS.map((e) =>
    optText(e, ELEMENT_NAMES[e], {
      selected: e === selected,
      state: e === hover ? 'hover' : '',
      id: `opt-${e}`,
    }),
  );
  const marks = MARKS.map(([kind, g, label]) =>
    kind === 'icon'
      ? optIcon(g, label, {
          selected: g === selected,
          state: g === hover ? 'hover' : '',
          id: `opt-${g}`,
        })
      : optText(g, label, { selected: g === selected, state: g === hover ? 'hover' : '' }),
  );
  return [...els, '<div class="options-sep" role="separator"></div>', ...marks].join('\n');
}

export function action(iconName, label, { disabled = false, state = '', id, cls = '', aria } = {}) {
  const inner = iconName ? `${icon(iconName, 20)}<span>${label}</span>` : `<span>${label}</span>`;
  return (
    `<button class="btn btn-action${iconName ? '' : ' label-only'}${cls}${stateClass(state)}"` +
    `${id ? ` id="${id}"` : ''}${aria ? ` aria-label="${aria}"` : ''}` +
    `${disabled ? ' aria-disabled="true"' : ''}>${inner}</button>`
  );
}

/**
 * Selection actions. `kekule` is 'kekule' (shows "Show Kekulé") or 'circle' ("Show circle").
 * `formula` is 'skeletal' (the drawing is skeletal: shows "Show structural") or 'structural'
 * ("Show skeletal"); SPEC-editor.md R51, the whole drawing whatever is selected.
 * Expand is rendered only when the selection contains an abbreviation (`expand: true`).
 */
export function selectionActions({
  kekule = 'kekule',
  formula = 'skeletal',
  enabled = {},
  expand = false,
} = {}) {
  const on = (k) => enabled[k] !== false;
  const flip = (id, name, label) =>
    `<button class="btn btn-opt" id="act-${id}" aria-label="${label}"${on('flip') ? '' : ' aria-disabled="true"'}>${icon(name, 20)}</button>`;
  const items = [
    action('clean-up', 'Clean up', { disabled: !on('clean'), id: 'act-clean' }),
    kekule === 'circle'
      ? action('show-circle', 'Show circle', { disabled: !on('kekule'), id: 'act-kekule' })
      : action('show-kekule', 'Show Kekulé', { disabled: !on('kekule'), id: 'act-kekule' }),
    formula === 'structural'
      ? action('show-skeletal', 'Show skeletal', {
          id: 'act-formula',
          aria: 'Show skeletal formula',
        })
      : action('show-structural', 'Show structural', {
          disabled: !on('formula'),
          id: 'act-formula',
          aria: 'Show structural formula',
        }),
    action('tidy', 'Tidy reaction', { disabled: !on('tidy'), id: 'act-tidy' }),
    '<div class="options-sep" role="separator"></div>',
    flip('flip-h', 'flip-h', 'Flip horizontal'),
    flip('flip-v', 'flip-v', 'Flip vertical'),
  ];
  if (expand) {
    items.push(
      '<div class="options-sep" role="separator"></div>',
      action('expand', 'Expand', { id: 'act-expand' }),
    );
  }
  return items.join('\n');
}

export function textOptions({ selected = [] } = {}) {
  const t = (text, label, id) =>
    optText(text, label, { selected: selected.includes(id), id: `txt-${id}` });
  const g = (name, label, id) =>
    optIcon(name, label, { selected: selected.includes(id), id: `txt-${id}` });
  return [
    t('x<span class="sub">2</span>', 'Subscript', 'sub'),
    t('x<span class="sup">2</span>', 'Superscript', 'sup'),
    t('B', 'Bold', 'bold'),
    t('<i>I</i>', 'Italic', 'italic'),
    '<div class="options-sep" role="separator"></div>',
    `<span class="options-caption">Insert</span>`,
    t('Δ', 'Insert Δ (heat)', 'delta'),
    t('hν', 'Insert hν (light)', 'hv'),
    g('glyph-degree', 'Insert °', 'deg'),
    g('glyph-arrow', 'Insert →', 'arrow'),
  ].join('\n');
}

// ---- Top bar ----

export function nameField({ value = '', focus = false, notfound = false, state = '' } = {}) {
  const cls = `namefield${focus ? ' is-focus' : ''}${notfound ? ' is-notfound' : ''}${stateClass(state)}`;
  const body = focus
    ? `<span class="field-value">${esc(value)}</span><span class="caret"></span>`
    : `<input type="text" aria-label="Compound name" placeholder="Type a compound name…" value="${esc(value)}">`;
  return `<label class="${cls}">${icon('search', 20)}${body}</label>`;
}

export function topbar({
  field = nameField(),
  options = '',
  canUndo = false,
  canRedo = false,
} = {}) {
  return `<header class="topbar">
${field}
<div class="divider-v" role="separator"></div>
<div class="options" role="toolbar" aria-label="Tool options">
${options}
</div>
<div class="history">
<button class="btn btn-top" id="undo" aria-label="Undo (Ctrl+Z)"${canUndo ? '' : ' aria-disabled="true"'}>${icon('undo', 20)}</button>
<button class="btn btn-top" id="redo" aria-label="Redo (Ctrl+Y)"${canRedo ? '' : ' aria-disabled="true"'}>${icon('redo', 20)}</button>
</div>
</header>`;
}

// ---- Status bar ----

export function statusbar({
  hint = '',
  formula = '',
  warnings = 0,
  preset = 'slides',
  zoom = 150,
} = {}) {
  const parts = [`<div class="hint" role="status" aria-live="polite">${hint}</div>`];
  if (formula) parts.push(`<div class="formula" data-testid="formula">${formula}</div>`);
  if (warnings > 0) {
    parts.push(
      `<button class="btn btn-status btn-warnings" id="warnings" aria-label="${warnings} warning${warnings > 1 ? 's' : ''}">${icon('warning', 16)}<span>${warnings}</span></button>`,
    );
  }
  parts.push(
    `<div class="segmented" role="group" aria-label="Style">` +
      `<button class="btn btn-status" id="preset-slides" aria-pressed="${preset === 'slides'}">Slides</button>` +
      `<button class="btn btn-status" id="preset-handout" aria-pressed="${preset === 'handout'}">Handout</button></div>`,
  );
  parts.push(
    `<div class="zoom">` +
      `<button class="btn btn-status" id="zoom-out" aria-label="Zoom out (Ctrl+−)">${icon('zoom-out', 16)}</button>` +
      `<button class="btn btn-status btn-zoom" id="zoom-100" aria-label="Zoom to 100%">${zoom}%</button>` +
      `<button class="btn btn-status" id="zoom-in" aria-label="Zoom in (Ctrl+=)">${icon('zoom-in', 16)}</button>` +
      `<button class="btn btn-status" id="zoom-fit" aria-label="Zoom to fit (Ctrl+0)">${icon('fit', 16)}</button>` +
      `</div>`,
  );
  return `<footer class="statusbar">\n${parts.join('\n')}\n</footer>`;
}

/** Formula text with digits as subscripts (rule C5). */
export function formulaText(f) {
  const sub = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
  const text = f.text.replace(/[0-9]/g, (d) => sub[d]);
  return f.mw === null ? text : `${text} · ${f.mw.toFixed(2)} g/mol`;
}

// ---- Tooltip, empty state, page ----

/** `key` is one key or a list of alternatives (a rail tool: digit, then letter; R50). */
export const kbds = (key) =>
  (Array.isArray(key) ? key : key ? [key] : []).map((k) => `<kbd>${k}</kbd>`).join('');

export function tooltip(forId, side, title, { key, help } = {}) {
  return (
    `<div class="tooltip" role="tooltip" data-for="${forId}" data-side="${side}">` +
    `<div class="tooltip-title"><span>${title}</span>${kbds(key)}</div>` +
    `${help ? `<div class="tooltip-help">${help}</div>` : ''}</div>`
  );
}

export function emptyState() {
  return `<div class="empty">
<svg class="empty-art" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4L18.93 8V16L12 20L5.07 16V8Z"/><circle cx="12" cy="12" r="4.2"/></svg>
<p class="empty-text">Type a compound name above, or click anywhere to start drawing.</p>
<div class="empty-try"><span>Try:</span>
<button class="chip">ethanol</button>
<button class="chip">benzene</button>
<button class="chip">ethanol + acetic acid -&gt; ethyl acetate + water</button>
</div>
</div>`;
}

export function page({ title, topbar: top, rail: left, canvas, status, extra = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="mockup.css">
</head>
<body>
<div class="window">
${top}
${left}
<main class="canvas" role="application" aria-label="Drawing canvas">
${canvas}
</main>
${status}
${extra}
</div>
<script src="mockup.js"></script>
</body>
</html>
`;
}

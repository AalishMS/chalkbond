// The eleven mock-up screens, composed from the parts in pages.mjs. `info` carries values
// computed from the real core by build.mjs (formulas, warnings, positions on the canvas).
import {
  BOND_OPTIONS,
  HINTS,
  RING_OPTIONS,
  TOOLS,
  action,
  atomOptions,
  emptyState,
  formulaText,
  icon,
  iconOptions,
  kbds,
  nameField,
  optIcon,
  optText,
  page,
  rail,
  railButton,
  selectionActions,
  statusbar,
  textOptions,
  tooltip,
  topbar,
} from './pages.mjs';

const img = (name) => `<img class="canvas-art" src="canvas/${name}.svg" alt="">`;

const SUGGESTIONS = [
  ['ethane', 'C2H6'],
  ['ethene', 'C2H4'],
  ['ethyne', 'C2H2'],
  ['ethanol', 'C2H6O'],
  ['ethylamine', 'C2H7N'],
  ['ethylbenzene', 'C8H10'],
  ['ethyl acetate', 'C4H8O2'],
  ['ethyl formate', 'C3H6O2'],
];

/** Formula with its digits in real <sub> elements (dropdown rows). */
const formulaHtml = (f) => f.replace(/[0-9]+/g, (d) => `<sub>${d}</sub>`);

/** "Did you mean" chips, closest match first (orchestrator decision; chem-core's own order differs). */
const DID_YOU_MEAN = ['ethanol', 'ethane', 'acetaldehyde'];

/**
 * The WYSIWYG text editor over the condition text: the same runs, sizes and sub offsets as the
 * rendered part (Arial: ascent 0.905, descent 0.212 em), caret at the end.
 */
function textEditor({ runs, k }) {
  const main = Math.max(...runs.map((r) => r.size));
  const base = runs.find((r) => r.size === main);
  const F = main * k;
  const scale = (v) => Math.round(v * 100) / 100;
  const lineH = Math.round(F * 1.15);
  const baselineInBox = (lineH - 1.117 * F) / 2 + 0.905 * F;
  const left = Math.round(runs[0].x) - 8;
  const top = Math.round(base.y - 2 - baselineInBox);
  const body = runs
    .map((r) =>
      r.size === main
        ? r.text
        : `<span class="run-${r.y > base.y ? 'sub' : 'sup'}" style="font-size: ${scale(r.size * k)}px; top: ${scale(r.y - base.y)}px">${r.text}</span>`,
    )
    .join('');
  const caret = `<span class="caret" style="height: ${Math.round(F * 1.05)}px; vertical-align: -${Math.round(F * 0.2)}px"></span>`;
  return (
    // A <span> so Prettier keeps the runs on one line (it may re-wrap a <div>'s content).
    `<span class="text-editor" role="textbox" aria-multiline="true" aria-label="Text" ` +
    `style="left: ${left}px; top: ${top}px; font-size: ${scale(F)}px; line-height: ${lineH}px">${body}${caret}</span>`
  );
}

function statesSheet() {
  const cols = ['Rest', 'Hover', 'Pressed', 'Selected', 'Disabled', 'Keyboard focus'];
  const head = `<div class="spec-head"></div>${cols.map((c) => `<div class="spec-head">${c}</div>`).join('')}`;
  const row = (label, cells, bg = 'chrome') =>
    `<div class="spec-label">${label}</div>${cells.map((c) => `<div class="spec-cell on-${bg}">${c}</div>`).join('')}`;
  const bond = TOOLS[3];
  const atom = TOOLS[6];
  const na = '<span class="spec-na">—</span>';
  const drop = (extra, note = '', cls = '') =>
    `<div class="spec-drop"><div class="dropdown-row${cls}"${extra}><span class="dropdown-name">ethanol</span>` +
    `<span class="dropdown-formula">${formulaHtml('C2H6O')}</span></div></div>${note}`;
  const rows = [
    row('Rail button', [
      railButton(bond),
      railButton(bond, { state: 'hover' }),
      railButton(bond, { state: 'pressed' }),
      `<div class="spec-rail">${railButton(bond, { active: true })}</div>`,
      `${na}<span class="spec-note">never disabled</span>`,
      railButton(bond, { state: 'focus' }),
    ]),
    row('Rail button, glyph', [
      railButton(atom),
      railButton(atom, { state: 'hover' }),
      railButton(atom, { state: 'pressed' }),
      `<div class="spec-rail">${railButton(atom, { active: true, state: 'hover', current: 'N' })}</div><span class="spec-note">and hovered</span>`,
      na,
      railButton(atom, { state: 'focus' }),
    ]),
    row('Option, icon', [
      optIcon('ring-5', 'Cyclopentane'),
      optIcon('ring-5', 'Cyclopentane', { state: 'hover' }),
      optIcon('ring-5', 'Cyclopentane', { state: 'pressed' }),
      optIcon('ring-5', 'Cyclopentane', { selected: true }),
      `<button class="btn btn-opt" aria-label="Flip horizontal" aria-disabled="true">${icon('flip-h', 20)}</button>`,
      optIcon('ring-5', 'Cyclopentane', { state: 'focus' }),
    ]),
    row('Option, text', [
      optText('Cl', 'Chlorine'),
      optText('Cl', 'Chlorine', { state: 'hover' }),
      optText('Cl', 'Chlorine', { state: 'pressed' }),
      optText('Cl', 'Chlorine', { selected: true }),
      optText('Cl', 'Chlorine', { disabled: true }),
      optText('Cl', 'Chlorine', { state: 'focus' }),
    ]),
    row('Action button', [
      action('clean-up', 'Clean up'),
      action('clean-up', 'Clean up', { state: 'hover' }),
      action('clean-up', 'Clean up', { state: 'pressed' }),
      na,
      action('tidy', 'Tidy reaction', { disabled: true }),
      action('clean-up', 'Clean up', { state: 'focus' }),
    ]),
    row('Formula switch (R51)', [
      action('show-structural', 'Show structural', { id: 'act-formula' }),
      action('show-structural', 'Show structural', { id: 'act-formula', state: 'hover' }),
      `${action('show-skeletal', 'Show skeletal', { id: 'act-formula', state: 'pressed' })}<span class="spec-note">structural drawing</span>`,
      na,
      `${action('show-structural', 'Show structural', { id: 'act-formula', disabled: true })}<span class="spec-note">empty drawing</span>`,
      action('show-structural', 'Show structural', { id: 'act-formula', state: 'focus' }),
    ]),
    row(
      'Chip, on the canvas',
      [
        '<button class="chip">ethanol</button>',
        '<button class="chip is-hover">ethanol</button>',
        '<button class="chip is-pressed">ethanol</button>',
        na,
        na,
        '<button class="chip is-focus">ethanol</button>',
      ],
      'canvas',
    ),
    row('Name field', [
      `<div class="spec-field">${nameField()}</div>`,
      `<div class="spec-field">${nameField({ state: 'hover' })}</div>`,
      na,
      `<div class="spec-field">${nameField({ focus: true, value: 'benz' })}</div><span class="spec-note">focused</span>`,
      `<div class="spec-field">${nameField({ notfound: true, value: 'ethanl' })}</div><span class="spec-note">not found</span>`,
      `<div class="spec-field">${nameField({ focus: true, notfound: true, value: 'ethanl' })}</div><span class="spec-note">focused, not found</span>`,
    ]),
    row('Status controls', [
      `<div class="spec-pair"><button class="btn btn-status" aria-label="Zoom in">${icon('zoom-in', 16)}</button><button class="btn btn-status btn-zoom">150%</button></div>`,
      `<div class="spec-pair"><button class="btn btn-status is-hover" aria-label="Zoom in">${icon('zoom-in', 16)}</button></div>`,
      `<div class="spec-pair"><button class="btn btn-status is-pressed" aria-label="Zoom in">${icon('zoom-in', 16)}</button></div>`,
      `<div class="segmented"><button class="btn btn-status" aria-pressed="true">Slides</button><button class="btn btn-status" aria-pressed="false">Handout</button></div>`,
      `<div class="spec-pair"><button class="btn btn-status" aria-label="Zoom in" aria-disabled="true">${icon('zoom-in', 16)}</button></div><span class="spec-note">at 400 %</span>`,
      `<div class="spec-pair"><button class="btn btn-status btn-warnings is-focus" aria-label="2 warnings">${icon('warning', 16)}<span>2</span></button></div>`,
    ]),
    row(
      'Dropdown row',
      [
        drop(''),
        drop('', '', ' is-hover'),
        na,
        drop(' aria-selected="true"', '<span class="spec-note">arrow keys</span>'),
        na,
        na,
      ],
      'canvas',
    ),
  ];
  const tip = (title, { key, help, note }) =>
    `<div class="spec-tipbox"><div class="tooltip static"><div class="tooltip-title"><span>${title}</span>` +
    `${kbds(key)}</div>${help ? `<div class="tooltip-help">${help}</div>` : ''}</div>` +
    `<span class="spec-note">${note}</span></div>`;
  const tips = [
    tip('Bond', {
      key: ['3', 'B'],
      help: 'Click to add a bond. Drag to aim it.',
      note: 'rail: name, number key, letter key, help (R50)',
    }),
    tip('Show structural formula', {
      help: 'Writes the carbons outside rings with their hydrogens (CH3, CH2, CH); bonds become twice as long.',
      note: 'R51 formula switch, help text R53 U15 (a key chip only if U7 is approved)',
    }),
    tip('Cyclopentane', { note: 'option: name only' }),
    tip('Flip horizontal', { help: 'Select a molecule first.', note: 'disabled: says why' }),
    tip('Undo', { key: 'Ctrl+Z', note: 'top bar' }),
    tip('Unknown label “H20”.', { note: 'valence warning on the canvas' }),
  ].join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Control states</title>
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="mockup.css">
<link rel="stylesheet" href="specimen.css">
</head>
<body class="specimen">
<h1>Control states</h1>
<div class="spec-grid">
${head}
${rows.join('\n')}
</div>
<h2>Tooltips</h2>
<div class="spec-tips">
${tips}
</div>
</body>
</html>
`;
}

export function buildPages(info) {
  const bondBar = iconOptions(BOND_OPTIONS, { selected: 'bond-single', prefix: 'opt' });
  const p = {};

  p['01-empty'] = page({
    title: 'Empty document',
    topbar: topbar({ options: bondBar }),
    rail: rail('bond'),
    canvas: emptyState(),
    status: statusbar({ hint: HINTS.bond }),
  });

  p['02-drawing'] = page({
    title: 'Drawing ethanol',
    topbar: topbar({ options: bondBar, canUndo: true }),
    rail: rail('bond'),
    canvas: img('02-drawing'),
    status: statusbar({ hint: HINTS.hoverAtom, formula: formulaText(info.formula02) }),
  });

  p['03-select'] = page({
    title: 'Selection',
    topbar: topbar({
      options: selectionActions({ enabled: { tidy: false } }),
      canUndo: true,
    }),
    rail: rail('select'),
    canvas: img('03-select'),
    status: statusbar({ hint: HINTS.select, formula: formulaText(info.formula03) }),
  });

  p['03b-select-abbrev'] = page({
    title: 'Selection with an abbreviation',
    topbar: topbar({
      options: selectionActions({ enabled: { kekule: false, tidy: false }, expand: true }),
      canUndo: true,
    }),
    rail: rail('select'),
    canvas: img('03b-select-abbrev'),
    status: statusbar({ hint: HINTS.select, formula: formulaText(info.formula03b) }),
  });

  p['04-ring-options'] = page({
    title: 'Ring options',
    topbar: topbar({
      options: iconOptions(RING_OPTIONS, { selected: 'ring-6', hover: 'ring-5', prefix: 'opt' }),
      canUndo: true,
    }),
    rail: rail('ring', { current: { ring: 'ring-6' } }),
    canvas: img('04-ring-options'),
    status: statusbar({ hint: HINTS.ring, formula: formulaText(info.formula04) }),
    extra: tooltip('opt-ring-5', 'below', 'Cyclopentane'),
  });

  p['05-atom-options'] = page({
    title: 'Atom options',
    topbar: topbar({ options: atomOptions({ selected: 'N', hover: 'Cl' }), canUndo: true }),
    rail: rail('atom', { current: { atom: 'N' } }),
    canvas: img('05-atom-options'),
    status: statusbar({ hint: HINTS.atom, formula: formulaText(info.formula05) }),
    extra: tooltip('opt-Cl', 'below', 'Chlorine', { help: 'Click an atom to make it Cl.' }),
  });

  const dropdownRows = SUGGESTIONS.map(
    ([name, f]) =>
      `<div class="dropdown-row${name === 'ethanol' ? ' is-hover' : ''}" role="option" aria-selected="false">` +
      `<span class="dropdown-name"><b>eth</b>${name.slice(3)}</span><span class="dropdown-formula">${formulaHtml(f)}</span></div>`,
  ).join('\n');
  p['06-name-dropdown'] = page({
    title: 'Name suggestions',
    topbar: topbar({ field: nameField({ value: 'eth', focus: true }), options: bondBar }),
    rail: rail('bond'),
    canvas: emptyState(),
    status: statusbar({ hint: HINTS.nameField }),
    extra: `<div class="dropdown" role="listbox" aria-label="Suggestions">\n${dropdownRows}\n</div>`,
  });

  const chips = DID_YOU_MEAN.map((s) => `<button class="chip">${s}</button>`).join('\n');
  p['07-name-nomatch'] = page({
    title: 'Name not found',
    topbar: topbar({
      field: nameField({ value: 'ethanl', focus: true, notfound: true }),
      options: bondBar,
    }),
    rail: rail('bond'),
    canvas: emptyState(),
    status: statusbar({ hint: HINTS.nameField }),
    extra: `<div class="dropdown" role="alert">
<div class="notfound">${icon('warning', 20)}<span>No compound named “ethanl”.</span></div>
<div class="suggest">Did you mean
<div class="suggest-chips">
${chips}
</div>
</div>
</div>`,
  });

  const w = info.water08;
  p['08-reaction'] = page({
    title: 'Reaction scheme',
    topbar: topbar({
      options: selectionActions({ enabled: { kekule: false, flip: false } }),
      canUndo: true,
    }),
    rail: rail('select'),
    canvas:
      img('08-reaction') +
      `\n<div class="anchor" id="atom-h20" style="left: ${Math.round(w.x)}px; top: ${Math.round(w.y)}px; width: ${Math.round(w.w)}px; height: ${Math.round(w.h)}px"></div>`,
    status: statusbar({ hint: HINTS.select, warnings: info.warnings08, zoom: info.zoom08 }),
    extra: tooltip('atom-h20', 'above', info.message08.replace(/"([^"]*)"/, '“$1”')),
  });

  p['09-text-editing'] = page({
    title: 'Editing conditions',
    topbar: topbar({ options: textOptions(), canUndo: true }),
    rail: rail('text'),
    canvas: `${img('09-text-editing')}\n${textEditor(info.text09)}`,
    status: statusbar({ hint: HINTS.textEditing, zoom: info.zoom09 }),
  });

  p['10-states'] = statesSheet();

  p['11-min-window'] = page({
    title: 'Minimum window',
    topbar: topbar({ options: atomOptions({ selected: 'C' }), canUndo: true }),
    rail: rail('atom'),
    canvas: img('11-min-window'),
    status: statusbar({ hint: HINTS.atom, formula: formulaText(info.formula05) }),
  });
  return p;
}

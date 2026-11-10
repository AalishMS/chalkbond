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
  ['ethane', 'C₂H₆'],
  ['ethene', 'C₂H₄'],
  ['ethyne', 'C₂H₂'],
  ['ethanol', 'C₂H₆O'],
  ['ethylamine', 'C₂H₇N'],
  ['ethylbenzene', 'C₈H₁₀'],
  ['ethyl acetate', 'C₄H₈O₂'],
  ['ethyl formate', 'C₃H₆O₂'],
];

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
    `<span class="dropdown-formula">C₂H₆O</span></div></div>${note}`;
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
      `<div class="spec-pair"><button class="btn btn-status" aria-label="Zoom in">${icon('zoom-in', 16)}</button><button class="btn btn-status btn-zoom">100%</button></div>`,
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
    `${key ? `<kbd>${key}</kbd>` : ''}</div>${help ? `<div class="tooltip-help">${help}</div>` : ''}</div>` +
    `<span class="spec-note">${note}</span></div>`;
  const tips = [
    tip('Bond', {
      key: 'B',
      help: 'Click to add a bond. Drag to aim it.',
      note: 'rail: name, key, help',
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
      options: selectionActions({ enabled: { tidy: false, expand: false } }),
      canUndo: true,
    }),
    rail: rail('select'),
    canvas: img('03-select'),
    status: statusbar({ hint: HINTS.select, formula: formulaText(info.formula03) }),
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
      `<span class="dropdown-name"><b>eth</b>${name.slice(3)}</span><span class="dropdown-formula">${f}</span></div>`,
  ).join('\n');
  p['06-name-dropdown'] = page({
    title: 'Name suggestions',
    topbar: topbar({ field: nameField({ value: 'eth', focus: true }), options: bondBar }),
    rail: rail('bond'),
    canvas: emptyState(),
    status: statusbar({ hint: HINTS.nameField }),
    extra: `<div class="dropdown" role="listbox" aria-label="Suggestions">\n${dropdownRows}\n</div>`,
  });

  const chips = info.suggest07.map((s) => `<button class="chip">${s}</button>`).join('\n');
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
      options: selectionActions({
        enabled: { kekule: false, number: false, flip: false, expand: false },
      }),
      canUndo: true,
    }),
    rail: rail('select'),
    canvas:
      img('08-reaction') +
      `\n<div class="anchor" id="atom-h20" style="left: ${Math.round(w.x)}px; top: ${Math.round(w.y)}px; width: ${Math.round(w.w)}px; height: ${Math.round(w.h)}px"></div>`,
    status: statusbar({ hint: HINTS.select, warnings: info.warnings08 }),
    extra: tooltip('atom-h20', 'above', info.message08.replace(/"([^"]*)"/, '“$1”')),
  });

  const a = info.arrow09;
  p['09-text-editing'] = page({
    title: 'Editing conditions',
    topbar: topbar({ options: textOptions(), canUndo: true }),
    rail: rail('text'),
    canvas:
      img('09-text-editing') +
      `\n<div class="editor-row" style="width: ${Math.round(a.mid.x) * 2}px; top: ${Math.round(a.mid.y - 11 - 37)}px">` +
      `<div class="text-editor" role="textbox" aria-multiline="true" aria-label="Text">conc. H2SO4, Δ<span class="caret"></span></div></div>`,
    status: statusbar({ hint: HINTS.textEditing }),
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

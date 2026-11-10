import type { EditorState, Hit, ToolId, VariantTool } from './editor-state';

export interface ToolDef {
  id: ToolId;
  /** Accessible name, without the key. */
  label: string;
  /** One-word caption under the rail icon. */
  caption: string;
  key: string;
  group: 'pick' | 'structure' | 'reaction';
  /** Sprite symbol; variant tools show their current option instead. */
  icon: string;
}

/** SPEC-editor.md "Tool rail", in rail order. */
export const TOOLS: readonly ToolDef[] = [
  { id: 'select', label: 'Select', caption: 'Select', key: 'V', group: 'pick', icon: 'select' },
  { id: 'erase', label: 'Erase', caption: 'Erase', key: 'E', group: 'pick', icon: 'erase' },
  {
    id: 'bond',
    label: 'Bond',
    caption: 'Bond',
    key: 'B',
    group: 'structure',
    icon: 'bond-single',
  },
  { id: 'chain', label: 'Chain', caption: 'Chain', key: 'Z', group: 'structure', icon: 'chain' },
  {
    id: 'ring',
    label: 'Ring',
    caption: 'Ring',
    key: 'R',
    group: 'structure',
    icon: 'ring-benzene',
  },
  { id: 'atom', label: 'Atom', caption: 'Atom', key: 'L', group: 'structure', icon: 'mark-plus' },
  {
    id: 'arrow',
    label: 'Arrow',
    caption: 'Arrow',
    key: 'A',
    group: 'reaction',
    icon: 'arrow-forward',
  },
  { id: 'plus', label: 'Plus', caption: 'Plus', key: '+', group: 'reaction', icon: 'plus' },
  {
    id: 'curved',
    label: 'Curved arrow',
    caption: 'Curly',
    key: 'M',
    group: 'reaction',
    icon: 'curved-full',
  },
  { id: 'text', label: 'Text', caption: 'Text', key: 'T', group: 'reaction', icon: 'text' },
];

export interface OptionDef {
  id: string;
  /** Accessible name. */
  label: string;
  /** Sprite symbol (20 px icon button). */
  icon?: string;
  /** Text glyph (element or δ button); shown instead of an icon. */
  glyph?: string;
  /** A separator is drawn before this option. */
  separatorBefore?: boolean;
}

const element = (id: string, label: string): OptionDef => ({ id, label, glyph: id });

/** SPEC-editor.md "Tool rail" options column with Decisions 1-3. */
export const OPTIONS: Readonly<Record<VariantTool, readonly OptionDef[]>> = {
  bond: [
    { id: 'single', label: 'Single', icon: 'bond-single' },
    { id: 'double', label: 'Double', icon: 'bond-double' },
    { id: 'triple', label: 'Triple', icon: 'bond-triple' },
    { id: 'wedge', label: 'Wedge', icon: 'bond-wedge' },
    { id: 'hash', label: 'Hash', icon: 'bond-hash' },
  ],
  ring: [
    { id: 'benzene', label: 'Benzene', icon: 'ring-benzene' },
    { id: 'cyclohexane', label: 'Cyclohexane', icon: 'ring-6' },
    { id: 'cyclopentane', label: 'Cyclopentane', icon: 'ring-5' },
    { id: 'cyclobutane', label: 'Cyclobutane', icon: 'ring-4' },
    { id: 'cyclopropane', label: 'Cyclopropane', icon: 'ring-3' },
  ],
  atom: [
    element('C', 'Carbon'),
    element('H', 'Hydrogen'),
    element('N', 'Nitrogen'),
    element('O', 'Oxygen'),
    element('S', 'Sulfur'),
    element('P', 'Phosphorus'),
    element('F', 'Fluorine'),
    element('Cl', 'Chlorine'),
    element('Br', 'Bromine'),
    element('I', 'Iodine'),
    { id: 'plus', label: 'Positive charge', icon: 'mark-plus', separatorBefore: true },
    { id: 'minus', label: 'Negative charge', icon: 'mark-minus' },
    { id: 'lone-pair', label: 'Lone pair', icon: 'mark-lone-pair' },
    { id: 'radical', label: 'Radical', icon: 'mark-radical' },
    { id: 'delta-plus', label: 'Partial positive charge', glyph: 'δ+' },
    { id: 'delta-minus', label: 'Partial negative charge', glyph: 'δ−' },
  ],
  arrow: [
    { id: 'forward', label: 'Reaction', icon: 'arrow-forward' },
    { id: 'equilibrium', label: 'Equilibrium', icon: 'arrow-equilibrium' },
    { id: 'resonance', label: 'Resonance', icon: 'arrow-resonance' },
    { id: 'nogo', label: 'No reaction', icon: 'arrow-nogo' },
  ],
  curved: [
    { id: 'full', label: 'Electron pair', icon: 'curved-full' },
    { id: 'fishhook', label: 'Single electron', icon: 'curved-fishhook' },
  ],
};

export function isVariantTool(tool: ToolId): tool is VariantTool {
  return tool in OPTIONS;
}

export interface RailFace {
  icon?: string;
  glyph?: string;
}

/** What a rail button shows: the current option for variant tools, else the tool's icon. */
export function railFace(state: EditorState, tool: ToolDef): RailFace {
  if (!isVariantTool(tool.id)) return { icon: tool.icon };
  const chosen = state.variants[tool.id];
  const option = OPTIONS[tool.id].find((o) => o.id === chosen);
  if (option?.glyph !== undefined) return { glyph: option.glyph };
  return { icon: option?.icon ?? tool.icon };
}

/** Status-bar hint per tool (SPEC-editor.md "Status-bar hints"). */
/** The status-bar hint while the name field has focus (SPEC-editor.md "Status-bar hints"). */
export const NAME_FIELD_HINT =
  'Enter inserts. Write a reaction like: ethanol + acetic acid -> ethyl acetate';

/** Hints while hovering an atom or a bond with hover keys active (K2). */
export const HOVER_HINTS = {
  atom: 'Type O, N, Cl… to change this atom. Enter for any label.',
  bond: 'Press 1, 2 or 3 for single, double, triple.',
} as const;

/** Gestures that aim a bond by dragging: while one runs the hint says how to leave the 30 degree steps. */
const ANGLE_DRAGS: readonly string[] = ['bond-drag', 'chain-drag'];
const ANGLE_HINT = 'Hold Shift for any angle.';

/**
 * The status-bar hint for `tool` and the hovered item: hover keys work with every tool except
 * Erase and Text (K2), so only there does an atom or a bond change the hint.
 */
export function hintFor(tool: ToolId, hover: Hit | null, gesture: string | null = null): string {
  if (gesture !== null && ANGLE_DRAGS.includes(gesture)) return ANGLE_HINT;
  if (hover !== null && tool !== 'erase' && tool !== 'text') {
    if (hover.kind === 'atom') return HOVER_HINTS.atom;
    if (hover.kind === 'bond') return HOVER_HINTS.bond;
  }
  return HINTS[tool];
}

export const HINTS: Readonly<Record<ToolId, string>> = {
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
};

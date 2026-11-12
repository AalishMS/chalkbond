import { HINTS, type OptionDef, type ToolDef } from './catalog';
import type { ActionState } from './selection-actions';

/** What a tooltip shows: the name, an optional key cap, an optional help line. */
export interface TipContent {
  title: string;
  /** A rail tool's number key, shown as a chip before `key` (R50). */
  digit?: string;
  key?: string;
  help?: string;
}

/** The first two sentences of a status hint: "Click to add a bond. Drag to aim it." */
function firstSentences(text: string, count: number): string {
  const sentences = text.match(/[^.]+\./g) ?? [text];
  return sentences.slice(0, count).join('').trim();
}

export function toolTip(tool: ToolDef): TipContent {
  return {
    title: tool.label,
    digit: tool.digit,
    key: tool.key,
    help: firstSentences(HINTS[tool.id], 2),
  };
}

/** Element buttons say what a click does; everything else is named only. */
export function optionTip(option: OptionDef): TipContent {
  if (/^[A-Z][a-z]?$/.test(option.id)) {
    return { title: option.label, help: `Click an atom to make it ${option.id}.` };
  }
  return { title: option.label };
}

/** A disabled action keeps its tooltip; its help line says why. */
export function actionTip(title: string, key: string | undefined, state: ActionState): TipContent {
  const tip: TipContent = { title };
  if (key !== undefined) tip.key = key;
  if (!state.enabled) tip.help = state.help;
  return tip;
}

/** The text-editing options (T5, K3), by button id. */
export const TEXT_OPTION_TIPS = {
  'txt-sub': { title: 'Subscript', key: 'Ctrl+=' },
  'txt-sup': { title: 'Superscript', key: 'Ctrl+Shift+=' },
  'txt-bold': { title: 'Bold', key: 'Ctrl+B' },
  'txt-italic': { title: 'Italic', key: 'Ctrl+I' },
  'txt-delta': { title: 'Insert Δ (heat)', key: 'Ctrl+Shift+D' },
  'txt-hv': { title: 'Insert hν (light)', key: 'Ctrl+Shift+H' },
  'txt-deg': { title: 'Insert °' },
  'txt-arrow': { title: 'Insert →' },
} as const satisfies Record<string, TipContent>;

export const HISTORY_TIPS = {
  undo: { title: 'Undo', key: 'Ctrl+Z' },
  redo: { title: 'Redo', key: 'Ctrl+Y' },
} as const satisfies Record<string, TipContent>;

/** Help line of a disabled Undo / Redo. */
export const HISTORY_EMPTY_HELP = {
  undo: 'Nothing to undo.',
  redo: 'Nothing to redo.',
} as const;

export const STATUS_TIPS = {
  zoomOut: { title: 'Zoom out', key: 'Ctrl+−' },
  zoomReset: { title: 'Zoom to 100%', key: 'Ctrl+1' },
  zoomIn: { title: 'Zoom in', key: 'Ctrl+=' },
  zoomFit: { title: 'Zoom to fit', key: 'Ctrl+0' },
} as const satisfies Record<string, TipContent>;

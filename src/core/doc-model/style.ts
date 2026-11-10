import { edit } from './edit';
import { DocError } from './errors';
import type { Doc, StylePreset, StyleSettings } from './types';

/** Patch accepted by `setStyle`. `overrides`, when given, replaces the whole object. */
export interface StylePatch {
  readonly preset?: StylePreset;
  readonly overrides?: Partial<StyleSettings>;
}

const KEYS: ReadonlySet<string> = new Set([
  'bondLength',
  'lineWidth',
  'doubleBondSpacing',
  'fontSize',
  'fontFamily',
]);

function invalid(detail: string): never {
  throw new DocError('invalid-value', detail);
}

/** Validates like the `.chalk` schema's `styleSettings` and returns a clean copy. */
function checkOverrides(value: unknown): Partial<StyleSettings> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid('style overrides must be an object');
  }
  const out: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (!KEYS.has(k)) return invalid(`unknown style key ${k}`);
    if (v === undefined) continue;
    if (k === 'fontFamily') {
      if (typeof v !== 'string') return invalid('fontFamily must be a string');
    } else if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      return invalid(`${k} must be a finite number > 0`);
    }
    out[k] = v as number | string;
  }
  return out as Partial<StyleSettings>;
}

/**
 * Sets the style preset and/or replaces the per-document overrides. Throws
 * `DocError('invalid-value')` for an unknown preset or an invalid overrides object; nothing is
 * changed in that case. An empty patch is a no-op.
 */
export function setStyle(doc: Doc, patch: StylePatch): Doc {
  if (patch.preset !== undefined && patch.preset !== 'slides' && patch.preset !== 'journal') {
    invalid(`unknown preset ${String(patch.preset)}`);
  }
  const overrides = patch.overrides === undefined ? undefined : checkOverrides(patch.overrides);
  const [next] = edit(doc, (d) => {
    if (patch.preset !== undefined) d.style.preset = patch.preset;
    if (overrides !== undefined) d.style.overrides = overrides;
  });
  return next;
}

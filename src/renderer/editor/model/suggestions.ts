// The name field's pure models: when to suggest, the dropdown rows and the not-found panel
// (SPEC-editor.md rules R9, R10, N1, N2).
import { normaliseName, type ChemError, type CompoundEntry, type NameIndex } from '@core/chem-core';

/** Rows in the dropdown (N1). */
export const MAX_ROWS = 8;
/** "Did you mean" chips (Notices and errors). */
export const MAX_CHIPS = 3;
/** Typed characters before suggestions appear (N1). */
const MIN_CHARS = 2;

const ARROWS = ['<=>', '⇌', '->', '→', '=>'];

/** True when `pred` holds at an index outside brackets and parentheses. */
function outside(text: string, pred: (rest: string) => boolean): boolean {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0 && pred(text.slice(i))) return true;
  }
  return false;
}

/** R9: no `+` and no arrow token outside brackets and parentheses. */
export function isSingleName(text: string): boolean {
  return !outside(text, (rest) => rest.startsWith('+') || ARROWS.some((a) => rest.startsWith(a)));
}

export interface SuggestionRow {
  readonly entry: CompoundEntry;
  /** The typed prefix as spelt in the key, shown in 600 weight. */
  readonly bold: string;
  /** The rest of the key. */
  readonly rest: string;
  /** R10: the display name after " — " when a synonym matched, else null. */
  readonly alias: string | null;
}

/** The key (display name or first synonym) the typed prefix matches, and how much of it. */
function matchedKey(entry: CompoundEntry, query: string): { key: string; length: number } {
  const keys = [entry.name, ...entry.synonyms];
  const key = keys.find((k) => normaliseName(k).startsWith(query)) ?? entry.name;
  let seen = 0;
  let length = 0;
  while (seen < query.length && length < key.length) {
    seen += normaliseName(key.charAt(length)).length;
    length++;
  }
  return { key, length };
}

/** N1: rows for the text typed so far; none for a reaction text or fewer than two characters. */
export function suggestionRows(names: NameIndex, text: string): SuggestionRow[] {
  const typed = text.trim();
  if (typed.length < MIN_CHARS || !isSingleName(typed)) return [];
  const query = normaliseName(typed);
  return names.suggest(typed, MAX_ROWS).map((entry) => {
    const { key, length } = matchedKey(entry, query);
    return {
      entry,
      bold: key.slice(0, length),
      rest: key.slice(length),
      alias: key === entry.name ? null : entry.name,
    };
  });
}

export interface NameError {
  readonly message: string;
  readonly suggestions: readonly string[];
}

/** N2: the not-found panel for a failed insert of `text`. */
export function nameError(text: string, error: ChemError): NameError {
  if (error.code === 'not-found') {
    return {
      message: `No compound named “${text.trim()}”.`,
      suggestions: (error.suggestions ?? []).slice(0, MAX_CHIPS),
    };
  }
  if (error.code === 'too-large') {
    return { message: 'That structure is too big to draw (over 1000 atoms).', suggestions: [] };
  }
  return { message: error.message, suggestions: [] };
}

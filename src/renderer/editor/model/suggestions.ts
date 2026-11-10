// The name field's pure models: when to suggest, the dropdown rows and the not-found panel
// (SPEC-editor.md rules R9, R10, N1, N2).
import { hasSchemeSyntax } from './scheme-text';
import { normaliseName, type ChemError, type CompoundEntry, type NameIndex } from '@core/chem-core';

/** Rows in the dropdown (N1). */
export const MAX_ROWS = 8;
/** "Did you mean" chips (Notices and errors). */
export const MAX_CHIPS = 3;
/** Typed characters before suggestions appear (N1). */
const MIN_CHARS = 2;

/** R9: no arrow token and no `+` that separates parts (outside brackets and parentheses). */
export function isSingleName(text: string): boolean {
  return !hasSchemeSyntax(text);
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
  /** N3: where the failing part stands in the typed reaction text; absent for a single name. */
  readonly span?: { readonly start: number; readonly end: number };
}

/** The text a "Did you mean" chip inserts: the failing part replaced, else the chip's name alone. */
export const chipText = (text: string, error: NameError, name: string): string =>
  error.span === undefined ? name : replaceSpan(text, error.span, name);

/** `text` with the characters of `span` replaced by `name` (a chip replaces just that part). */
export function replaceSpan(
  text: string,
  span: { readonly start: number; readonly end: number },
  name: string,
): string {
  return text.slice(0, span.start) + name + text.slice(span.end);
}

/**
 * N2: the not-found panel for a failed insert of `text`. For a part of a reaction (N3) `text` is
 * the part's name and `span` where it stands in the typed text.
 */
export function nameError(
  text: string,
  error: ChemError,
  span?: { readonly start: number; readonly end: number },
): NameError {
  const where = span === undefined ? {} : { span };
  if (error.code === 'not-found') {
    return {
      message: `No compound named “${text.trim()}”.`,
      suggestions: (error.suggestions ?? []).slice(0, MAX_CHIPS),
      ...where,
    };
  }
  if (error.code === 'too-large') {
    return {
      message: 'That structure is too big to draw (over 1000 atoms).',
      suggestions: [],
      ...where,
    };
  }
  return { message: error.message, suggestions: [], ...where };
}

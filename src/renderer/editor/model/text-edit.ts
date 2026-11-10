// The pure model behind the label and text editors (SPEC-editor.md rule T2): runs of text with an
// optional script, a selection, a pending script and a local undo stack. The editor's DOM is a
// projection of this; every edit applies to it, never to the DOM. Offsets are UTF-16 and never
// fall inside a surrogate pair.
import type { TextRun } from '@core/doc-model';

export type Script = 'sub' | 'sup';

/** One piece of text with one script; `explicit` marks formatting the user chose (T4). */
export interface EditRun {
  readonly text: string;
  readonly script?: Script;
  readonly explicit?: true;
}

/** What the next typed character gets: a script, plain, or (null) what it inherits. */
export type Pending = Script | 'plain' | null;

interface Snapshot {
  readonly runs: readonly EditRun[];
  readonly anchor: number;
  readonly focus: number;
}

export interface TextEditState {
  readonly runs: readonly EditRun[];
  /** Where the selection started and where it ends (the caret); equal for a caret. */
  readonly anchor: number;
  readonly focus: number;
  readonly pending: Pending;
  readonly undo: readonly Snapshot[];
  readonly redo: readonly Snapshot[];
}

export type DeleteUnit = 'char' | 'word' | 'line';
export type MoveKey = 'left' | 'right' | 'home' | 'end';

// ---- text and offsets -------------------------------------------------------------------------

export const textOf = (s: { readonly runs: readonly EditRun[] }): string =>
  s.runs.map((r) => r.text).join('');

const isHigh = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;

/** `offset` clamped into the text and moved off the middle of a surrogate pair. */
function snap(text: string, offset: number): number {
  const at = Math.max(0, Math.min(text.length, Math.trunc(offset)));
  if (at > 0 && at < text.length && isLow(text.charCodeAt(at)) && isHigh(text.charCodeAt(at - 1))) {
    return at - 1;
  }
  return at;
}

/** Offset of the character boundary one code point before / after `at`. */
function prevBoundary(text: string, at: number): number {
  if (at <= 0) return 0;
  const pair = isLow(text.charCodeAt(at - 1)) && at >= 2 && isHigh(text.charCodeAt(at - 2));
  return pair ? at - 2 : at - 1;
}
function nextBoundary(text: string, at: number): number {
  if (at >= text.length) return text.length;
  const pair =
    isHigh(text.charCodeAt(at)) && at + 1 < text.length && isLow(text.charCodeAt(at + 1));
  return pair ? at + 2 : at + 1;
}

const WORD = /[\p{L}\p{N}_]/u;
const isSpace = (ch: string): boolean => /\s/u.test(ch) && ch !== '\n';

function wordStart(text: string, at: number): number {
  let i = at;
  while (i > 0 && isSpace(text.charAt(i - 1))) i -= 1;
  if (i > 0 && text.charAt(i - 1) !== '\n') {
    const word = WORD.test(text.charAt(i - 1));
    while (i > 0 && text.charAt(i - 1) !== '\n' && !isSpace(text.charAt(i - 1))) {
      if (WORD.test(text.charAt(i - 1)) !== word) break;
      i -= 1;
    }
  } else if (i > 0) {
    i -= 1;
  }
  return snap(text, i);
}

function wordEnd(text: string, at: number): number {
  let i = at;
  if (i < text.length && text.charAt(i) === '\n') return i + 1;
  if (i < text.length && !isSpace(text.charAt(i))) {
    const word = WORD.test(text.charAt(i));
    while (i < text.length && !isSpace(text.charAt(i)) && text.charAt(i) !== '\n') {
      if (WORD.test(text.charAt(i)) !== word) break;
      i += 1;
    }
  }
  while (i < text.length && isSpace(text.charAt(i))) i += 1;
  return snap(text, i);
}

const lineStart = (text: string, at: number): number => text.lastIndexOf('\n', at - 1) + 1;
const lineEnd = (text: string, at: number): number => {
  const i = text.indexOf('\n', at);
  return i < 0 ? text.length : i;
};

// ---- runs -------------------------------------------------------------------------------------

const sameFormat = (a: EditRun, b: EditRun): boolean =>
  a.script === b.script && a.explicit === b.explicit;

/** Empty runs dropped, neighbours with the same format merged. */
function normalise(runs: readonly EditRun[]): readonly EditRun[] {
  const out: EditRun[] = [];
  for (const run of runs) {
    if (run.text === '') continue;
    const last = out[out.length - 1];
    if (last !== undefined && sameFormat(last, run)) {
      out[out.length - 1] = { ...last, text: last.text + run.text };
    } else {
      out.push(run);
    }
  }
  return out;
}

/** The runs restricted to `[from, to)`. */
function slice(runs: readonly EditRun[], from: number, to: number): EditRun[] {
  const out: EditRun[] = [];
  let at = 0;
  for (const run of runs) {
    const a = Math.max(from - at, 0);
    const b = Math.min(to - at, run.text.length);
    if (b > a) out.push({ ...run, text: run.text.slice(a, b) });
    at += run.text.length;
  }
  return out;
}

/** The run holding character `index` (the one starting at `index`), or undefined. */
function runAt(runs: readonly EditRun[], index: number): EditRun | undefined {
  let at = 0;
  for (const run of runs) {
    if (index < at + run.text.length) return run;
    at += run.text.length;
  }
  return undefined;
}

// ---- construction and reading -----------------------------------------------------------------

const EMPTY_HISTORY: readonly Snapshot[] = [];

function make(runs: readonly EditRun[], anchor: number, focus: number): TextEditState {
  return { runs, anchor, focus, pending: null, undo: EMPTY_HISTORY, redo: EMPTY_HISTORY };
}

/** A label's text, all of it selected (L1). Plain: nothing is explicit. */
export function fromText(text: string): TextEditState {
  return make(normalise([{ text }]), 0, text.length);
}

/** A stored text: every character explicit, so committing unchanged changes nothing (T2). */
export function fromStored(runs: readonly TextRun[]): TextEditState {
  const edit = normalise(
    runs.map((r): EditRun => {
      const base = { text: r.text, explicit: true } as const;
      return r.script === undefined ? base : { ...base, script: r.script };
    }),
  );
  const length = edit.reduce((n, r) => n + r.text.length, 0);
  return make(edit, length, length);
}

/** The selection as an ordered range. */
export function selectionOf(s: TextEditState): { start: number; end: number } {
  return { start: Math.min(s.anchor, s.focus), end: Math.max(s.anchor, s.focus) };
}

/** The script the next typed character gets, or that the selection shows (aria-pressed). */
export function scriptAtCaret(s: TextEditState): Script | 'plain' {
  if (s.pending !== null) return s.pending;
  const { start, end } = selectionOf(s);
  if (start !== end) {
    const first = runAt(s.runs, start)?.script;
    const same = slice(s.runs, start, end).every((r) => r.script === first);
    return same && first !== undefined ? first : 'plain';
  }
  return inherited(s.runs, start).script ?? 'plain';
}

/** What a character typed at `at` inherits: the character before it, else the one after. */
function inherited(runs: readonly EditRun[], at: number): EditRun {
  const run = runAt(runs, at > 0 ? at - 1 : 0);
  return run ?? { text: '' };
}

// ---- edits ------------------------------------------------------------------------------------

function commitEdit(
  s: TextEditState,
  runs: readonly EditRun[],
  anchor: number,
  focus: number,
): TextEditState {
  return {
    runs: normalise(runs),
    anchor,
    focus,
    pending: null,
    undo: [...s.undo, { runs: s.runs, anchor: s.anchor, focus: s.focus }],
    redo: EMPTY_HISTORY,
  };
}

/** `[start, end)` replaced by text carrying `format`; the caret ends after it. */
function replace(
  s: TextEditState,
  start: number,
  end: number,
  text: string,
  format: { script?: Script; explicit?: true },
): TextEditState {
  const before = slice(s.runs, 0, start);
  const after = slice(s.runs, end, textOf(s).length);
  const middle: EditRun[] = text === '' ? [] : [{ text, ...format }];
  const caret = start + text.length;
  return commitEdit(s, [...before, ...middle, ...after], caret, caret);
}

/** Types `text` over the selection (a paste is the same). */
export function insertText(s: TextEditState, text: string): TextEditState {
  if (text === '') return s;
  const { start, end } = selectionOf(s);
  const from = inherited(s.runs, start);
  let format: { script?: Script; explicit?: true };
  if (s.pending === null) {
    format = {
      ...(from.script === undefined ? {} : { script: from.script }),
      ...(from.explicit === true ? { explicit: true as const } : {}),
    };
  } else {
    format = {
      ...(s.pending === 'plain' ? {} : { script: s.pending }),
      explicit: true as const,
    };
  }
  return replace(s, start, end, text, format);
}

/**
 * The insert buttons (Δ, hν, °, →; T2): `text` as plain, non-explicit characters at the caret,
 * whatever script or format the character before it has, so formula typing that follows is
 * still formatted when the text is finished.
 */
export function insertPlain(s: TextEditState, text: string): TextEditState {
  if (text === '') return s;
  const { start, end } = selectionOf(s);
  return replace(s, start, end, text, {});
}

export function insertLineBreak(s: TextEditState): TextEditState {
  return insertText(s, '\n');
}

function deleteRange(s: TextEditState, from: number, to: number): TextEditState {
  if (from >= to) return s;
  return replace(s, from, to, '', {});
}

/** Backspace (and its word and line forms). A selection is deleted whatever the unit. */
export function deleteBackward(s: TextEditState, unit: DeleteUnit): TextEditState {
  const { start, end } = selectionOf(s);
  if (start !== end) return deleteRange(s, start, end);
  const text = textOf(s);
  const to =
    unit === 'char'
      ? prevBoundary(text, start)
      : unit === 'word'
        ? wordStart(text, start)
        : lineStart(text, start) === start
          ? prevBoundary(text, start)
          : lineStart(text, start);
  return deleteRange(s, to, start);
}

/** Delete (and its word and line forms). */
export function deleteForward(s: TextEditState, unit: DeleteUnit): TextEditState {
  const { start, end } = selectionOf(s);
  if (start !== end) return deleteRange(s, start, end);
  const text = textOf(s);
  const to =
    unit === 'char'
      ? nextBoundary(text, start)
      : unit === 'word'
        ? wordEnd(text, start)
        : lineEnd(text, start) === start
          ? nextBoundary(text, start)
          : lineEnd(text, start);
  return deleteRange(s, start, to);
}

/**
 * x₂ / x² (T2). On a selection: every selected character already has the script → plain, else
 * the script, either way explicit. On a caret: toggles what the next character gets.
 */
export function toggleScript(s: TextEditState, script: Script): TextEditState {
  const { start, end } = selectionOf(s);
  if (start === end) {
    return { ...s, pending: scriptAtCaret(s) === script ? 'plain' : script };
  }
  const selected = slice(s.runs, start, end);
  const all = selected.every((r) => r.script === script);
  const marked: EditRun[] = selected.map((r) => {
    const base = { text: r.text, explicit: true } as const;
    return all ? base : { ...base, script };
  });
  const runs = [...slice(s.runs, 0, start), ...marked, ...slice(s.runs, end, textOf(s).length)];
  return { ...commitEdit(s, runs, s.anchor, s.focus), pending: null };
}

// ---- selection --------------------------------------------------------------------------------

/** Moves the selection; a pending script is dropped only when the selection changes. */
export function setSelection(s: TextEditState, anchor: number, focus: number): TextEditState {
  const text = textOf(s);
  const a = snap(text, anchor);
  const f = snap(text, focus);
  if (a === s.anchor && f === s.focus) return s;
  return { ...s, anchor: a, focus: f, pending: null };
}

export const selectAll = (s: TextEditState): TextEditState => setSelection(s, 0, textOf(s).length);

/** Arrow / Home / End; `extend` keeps the anchor (Shift). */
export function moveSelection(s: TextEditState, key: MoveKey, extend: boolean): TextEditState {
  const text = textOf(s);
  const { start, end } = selectionOf(s);
  let focus: number;
  if (!extend && start !== end && (key === 'left' || key === 'right')) {
    const to = key === 'left' ? start : end;
    return setSelection(s, to, to);
  }
  switch (key) {
    case 'left':
      focus = prevBoundary(text, s.focus);
      break;
    case 'right':
      focus = nextBoundary(text, s.focus);
      break;
    case 'home':
      focus = lineStart(text, s.focus);
      break;
    case 'end':
      focus = lineEnd(text, s.focus);
      break;
  }
  return setSelection(s, extend ? s.anchor : focus, focus);
}

// ---- local undo -------------------------------------------------------------------------------

export function undoEdit(s: TextEditState): TextEditState {
  const last = s.undo[s.undo.length - 1];
  if (last === undefined) return s;
  return {
    ...last,
    pending: null,
    undo: s.undo.slice(0, -1),
    redo: [...s.redo, { runs: s.runs, anchor: s.anchor, focus: s.focus }],
  };
}

export function redoEdit(s: TextEditState): TextEditState {
  const next = s.redo[s.redo.length - 1];
  if (next === undefined) return s;
  return {
    ...next,
    pending: null,
    undo: [...s.undo, { runs: s.runs, anchor: s.anchor, focus: s.focus }],
    redo: s.redo.slice(0, -1),
  };
}

// ---- IME --------------------------------------------------------------------------------------

/**
 * After a composition the DOM holds `domText`: the model takes the difference as one replacement
 * (common prefix and suffix kept, so scripts of untouched characters stay). The caret ends after
 * the inserted text. Unchanged text returns `s`.
 */
export function reconcile(s: TextEditState, domText: string): TextEditState {
  const old = textOf(s);
  if (old === domText) return s;
  let p = 0;
  const limit = Math.min(old.length, domText.length);
  while (p < limit && old.charCodeAt(p) === domText.charCodeAt(p)) p += 1;
  let q = 0;
  while (
    q < limit - p &&
    old.charCodeAt(old.length - 1 - q) === domText.charCodeAt(domText.length - 1 - q)
  ) {
    q += 1;
  }
  // Never cut a surrogate pair: back the prefix and suffix off to whole characters.
  p = snap(old, p);
  while (q > 0 && p + q > 0 && snap(domText, domText.length - q) !== domText.length - q) q -= 1;
  const inserted = domText.slice(p, domText.length - q);
  const typedAt = snapSelection(s, p, old.length - q);
  return inserted === '' ? deleteBackward(typedAt, 'char') : insertText(typedAt, inserted);
}

/** `s` with the range `[from, to)` selected, whatever its pending script. */
function snapSelection(s: TextEditState, from: number, to: number): TextEditState {
  return { ...s, anchor: snap(textOf(s), from), focus: snap(textOf(s), to), pending: null };
}

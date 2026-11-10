// How an atom label is written while it is typed (SPEC-editor.md rule L1): digits after a letter
// or a closing bracket are subscripts, a trailing charge is a superscript. Pure: text in, runs out.
import { PERIODIC_SYMBOLS, type TextRun } from '@core/doc-model';
import type { EditRun, Script } from './text-edit';

/** A sign, with its magnitude after it (`+2`) or before it (`2+`). */
const TAIL = /(?:[+\-−]\d?|\d[+\-−])$/;
const SINGLE_ELEMENT = /^[A-Z][a-z]?$/;

/**
 * Where the charge superscript starts. A digit before the sign belongs to the charge only when it
 * is the second digit of a number (`SO42-`) or the whole label before it is one element symbol
 * (`Ca2+`, `O2-`); otherwise it is a count (`NH4+`, `NO3-`) and only the sign is the charge.
 */
function chargeStart(text: string): number {
  const m = TAIL.exec(text);
  if (m === null) return text.length;
  const at = m.index;
  const leadingDigit = /^\d/.test(m[0]);
  if (!leadingDigit) return at;
  const before = text.slice(0, at);
  const prev = before.slice(-1);
  if (/\d/.test(prev) || SINGLE_ELEMENT.test(before)) return at;
  return at + 1;
}

/** Digits after a letter or `)` as subscripts; consecutive characters of one kind are one run. */
function bodyRuns(body: string): TextRun[] {
  const runs: TextRun[] = [];
  let at = 0;
  for (const m of body.matchAll(/\d+/g)) {
    const prev = body[m.index - 1] ?? '';
    if (!/[\p{L})]/u.test(prev)) continue;
    if (m.index > at) runs.push({ text: body.slice(at, m.index) });
    runs.push({ text: m[0], script: 'sub' });
    at = m.index + m[0].length;
  }
  if (at < body.length) runs.push({ text: body.slice(at) });
  return runs;
}

/** The runs a label is shown with; they always join to `text`. */
export function labelDisplayRuns(text: string): TextRun[] {
  const at = chargeStart(text);
  const runs = bodyRuns(text.slice(0, at));
  if (at < text.length) runs.push({ text: text.slice(at), script: 'sup' });
  return runs;
}

// ---- finishText (SPEC-editor.md T4) ------------------------------------------------------------

const ELEMENTS: ReadonlySet<string> = new Set(PERIODIC_SYMBOLS);
/** Reaction-mechanism names that look like formulas and are not. */
const NOT_FORMULAS: ReadonlySet<string> = new Set(['SN1', 'SN2', 'SNi', 'E1', 'E2', 'E1cb']);
const MINUS = '−';

/** One character of the text: its script, and whether `finishText` may still change it. */
interface Cell {
  ch: string;
  script: Script | undefined;
  /** False for an explicit character or one that already has a script (T4: never changed). */
  free: boolean;
}

const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isLetter = (c: string): boolean => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
const isBracket = (c: string): boolean => c === '(' || c === ')' || c === '[' || c === ']';
const isClosing = (c: string): boolean => c === ')' || c === ']';
const isTokenChar = (c: string): boolean => isLetter(c) || isDigit(c) || isBracket(c);
const isSign = (c: string): boolean => c === '+' || c === '-' || c === MINUS;
const isShortcutPayload = (c: string): boolean => isDigit(c) || isSign(c);

/** Sets `script` on the cell and fixes it; a hyphen in a superscript is the true minus. */
function setScript(cell: Cell, script: Script): void {
  cell.script = script;
  cell.free = false;
  if (script === 'sup' && cell.ch === '-') cell.ch = MINUS;
}

/** T4 step 1: `->` becomes `→`. */
function arrows(cells: Cell[]): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < cells.length; i += 1) {
    const a = cells[i];
    const b = cells[i + 1];
    if (a?.free === true && b?.free === true && a.ch === '-' && b.ch === '>') {
      out.push({ ch: '→', script: undefined, free: true });
      i += 1;
    } else if (a !== undefined) out.push(a);
  }
  return out;
}

/** The index of the first free `}` after `from`, if every cell up to it is free; else -1. */
function closingBrace(cells: readonly Cell[], from: number): number {
  for (let i = from; i < cells.length; i += 1) {
    const c = cells[i];
    if (c?.free !== true) return -1;
    if (c.ch === '}') return i;
  }
  return -1;
}

/** T4 step 2: `^{…}`, `_{…}`, and `^` / `_` before a run of digits and signs. Markers go. */
function shortcuts(cells: Cell[]): Cell[] {
  const out: Cell[] = [];
  let i = 0;
  while (i < cells.length) {
    const here = cells[i];
    const marker = here?.free === true && (here.ch === '^' || here.ch === '_') ? here.ch : null;
    if (marker === null) {
      if (here !== undefined) out.push(here);
      i += 1;
      continue;
    }
    const script: Script = marker === '^' ? 'sup' : 'sub';
    const next = cells[i + 1];
    let end = -1;
    let from = -1;
    if (next?.free === true && next.ch === '{') {
      const close = closingBrace(cells, i + 2);
      if (close !== -1) {
        from = i + 2;
        end = close;
      }
    } else {
      let j = i + 1;
      while (cells[j]?.free === true && isShortcutPayload(cells[j]?.ch ?? '')) j += 1;
      if (j > i + 1) {
        from = i + 1;
        end = j;
      }
    }
    if (end === -1) {
      out.push(here as Cell);
      i += 1;
      continue;
    }
    for (let k = from; k < end; k += 1) {
      const cell = cells[k];
      if (cell !== undefined) {
        setScript(cell, script);
        out.push(cell);
      }
    }
    // Past the closing brace when there was one.
    i = next?.ch === '{' && next.free ? end + 1 : end;
  }
  return out;
}

/** True when every group of letters of `token` is a sequence of element symbols. */
function isFormula(token: string): boolean {
  if (isDigit(token.charAt(0)) || NOT_FORMULAS.has(token)) return false;
  const groups = token.split(/[^A-Za-z]+/).filter((g) => g.length > 0);
  if (groups.length === 0) return false;
  return groups.every((g) => {
    const symbols = g.match(/[A-Z][a-z]*/g);
    // A group that starts lower case would leave characters outside every symbol.
    return (
      symbols !== null &&
      symbols.join('') === g &&
      symbols.every((s) => s.length <= 2 && ELEMENTS.has(s))
    );
  });
}

/**
 * A token that ends in a digit run: whether a sign right after it makes a charge, and whether the
 * run's last digit belongs to the charge (`Fe2+`, `SO42-`) or is a count (`NH4+`, `NO3-`). Null
 * when the run is not after a letter or bracket, or its last digit is not free.
 */
function digitCharge(
  cells: readonly Cell[],
  from: number,
  end: number,
): { readonly cell: Cell; readonly digitIsCharge: boolean } | null {
  let start = end;
  while (start > from && isDigit(cells[start - 1]?.ch ?? '')) start -= 1;
  const cell = cells[end - 1];
  if (start === end || cell?.free !== true) return null;
  const before = cells[start - 1]?.ch ?? '';
  if (!isLetter(before) && !isClosing(before)) return null;
  const run = end - start;
  const text = cells
    .slice(from, end)
    .map((c) => c.ch)
    .join('');
  const oneElement = /^[A-Z][a-z]?\d$/.test(text);
  return { cell, digitIsCharge: run >= 2 || oneElement };
}

/** T4 step 3: subscripts and a trailing charge in each formula token. */
function formulas(cells: Cell[]): void {
  let i = 0;
  while (i < cells.length) {
    if (!isTokenChar(cells[i]?.ch ?? '')) {
      i += 1;
      continue;
    }
    let end = i;
    while (end < cells.length && isTokenChar(cells[end]?.ch ?? '')) end += 1;
    const token = cells
      .slice(i, end)
      .map((c) => c.ch)
      .join('');
    if (isFormula(token)) {
      const charge = digitCharge(cells, i, end);
      for (let k = i; k < end; k += 1) {
        const cell = cells[k];
        const before = cells[k - 1]?.ch ?? '';
        if (cell?.free === true && isDigit(cell.ch) && (isLetter(before) || isClosing(before))) {
          setScript(cell, 'sub');
        } else if (cell?.free === true && isDigit(cell.ch) && cells[k - 1]?.script === 'sub') {
          // The rest of a digit run that starts after a letter.
          setScript(cell, 'sub');
        }
      }
      const last = cells[end - 1]?.ch ?? '';
      const sign = cells[end];
      const after = cells[end + 1]?.ch ?? '';
      if (sign?.free === true && isSign(sign.ch) && !isTokenChar(after)) {
        if (isLetter(last) || isClosing(last)) {
          setScript(sign, 'sup');
        } else if (charge !== null && isDigit(last)) {
          setScript(sign, 'sup');
          // `Fe2+`, `SO42-`: the last digit is part of the charge, not a count.
          if (charge.digitIsCharge) setScript(charge.cell, 'sup');
        }
      }
    }
    i = end;
  }
}

/**
 * T4: the runs a text is stored with. Explicit characters (and any that already carry a script)
 * stay as they are; in the rest `->` becomes `→`, `^` / `_` shortcuts become scripts, and formula
 * tokens get subscript digits and a superscript charge. `bold` / `italic` come from the object.
 * Pure; formatting its own output again changes nothing.
 */
export function finishText(
  runs: readonly EditRun[],
  style: { readonly bold?: boolean; readonly italic?: boolean },
): TextRun[] {
  const cells: Cell[] = runs.flatMap((r) =>
    [...r.text].map((ch): Cell => ({
      ch,
      script: r.script,
      free: r.explicit !== true && r.script === undefined,
    })),
  );
  const done = shortcuts(arrows(cells));
  formulas(done);
  const out: TextRun[] = [];
  const flags = {
    ...(style.bold === true ? { bold: true as const } : {}),
    ...(style.italic === true ? { italic: true as const } : {}),
  };
  for (const cell of done) {
    const last = out.at(-1);
    if (last !== undefined && last.script === cell.script) {
      out[out.length - 1] = { ...last, text: last.text + cell.ch };
    } else {
      out.push({
        text: cell.ch,
        ...(cell.script === undefined ? {} : { script: cell.script }),
        ...flags,
      });
    }
  }
  return out;
}

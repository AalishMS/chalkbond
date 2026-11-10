// How an atom label is written while it is typed (SPEC-editor.md rule L1): digits after a letter
// or a closing bracket are subscripts, a trailing charge is a superscript. Pure: text in, runs out.
import type { TextRun } from '@core/doc-model';

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

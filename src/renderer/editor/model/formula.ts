// Formula display (SPEC-editor.md rules C5 and N1): runs with real sub/superscripts and the
// status-bar formula of the selection or the single fragment.
import { formulaOf, type Formula, type Perception } from '@core/chem-core';
import type { AtomId, Doc, Selection } from '@core/doc-model';

export interface FormulaRun {
  readonly text: string;
  /** `sub` for atom counts, `sup` for the charge. */
  readonly kind: 'text' | 'sub' | 'sup';
}

const MINUS = '−';

function chargeText(charge: number): string {
  const sign = charge < 0 ? MINUS : '+';
  const n = Math.abs(charge);
  return n === 1 ? sign : `${n}${sign}`;
}

/**
 * Runs of a Hill formula: digits after a symbol are subscripts. `charge` is the net charge; a
 * dictionary formula may instead end in one `+` or `-` (a charge of one).
 */
export function formulaRuns(hill: string, charge = 0): FormulaRun[] {
  let body = hill;
  let net = charge;
  const end = hill.at(-1);
  if (net === 0 && (end === '+' || end === '-' || end === MINUS)) {
    net = end === '+' ? 1 : -1;
    body = hill.slice(0, -1);
  }
  const runs: FormulaRun[] = [];
  for (const m of body.matchAll(/\d+|\D+/g)) {
    const text = m[0];
    const digits = /^\d/.test(text);
    runs.push({ text, kind: digits && runs.length > 0 ? 'sub' : 'text' });
  }
  if (net !== 0) runs.push({ text: chargeText(net), kind: 'sup' });
  return runs;
}

/** The plain text of the status-bar formula: 'C2H6O · 46.07 g/mol'. */
export function formulaText(f: Formula): string {
  const hill = formulaRuns(f.hill, f.charge)
    .map((r) => r.text)
    .join('');
  return f.mw === null ? hill : `${hill} · ${f.mw.toFixed(2)} g/mol`;
}

/**
 * C5: the formula of the selection's atoms (every fragment it touches, summed); with nothing
 * selected, the document's only fragment; otherwise nothing.
 */
export function statusFormula(
  doc: Doc,
  perception: Perception,
  selection: Selection,
): Formula | null {
  const atoms = new Set<AtomId>(selection.atoms);
  for (const id of selection.bonds) {
    const bond = doc.bonds[id];
    if (bond) {
      atoms.add(bond.a1);
      atoms.add(bond.a2);
    }
  }
  if (atoms.size === 0) {
    const [only, ...rest] = perception.fragments;
    return only !== undefined && rest.length === 0 ? only.formula : null;
  }
  const touched = perception.fragments.filter((f) => f.atoms.some((a) => atoms.has(a)));
  if (touched.length === 1) return (touched[0] as (typeof touched)[number]).formula;
  const known = [...atoms].filter((a) => a in doc.atoms);
  return known.length === 0 ? null : formulaOf(doc, known);
}

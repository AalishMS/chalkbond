// Atom-label interpretation (SPEC-chem-core.md "Labels and abbreviations").
import { PERIODIC_SYMBOLS, PSEUDO_SYMBOLS, type ElementSymbol } from '../doc-model/index';
import { ABBREVIATIONS, attachmentElement } from './abbreviations';

export type LabelInterpretation =
  /** Stored as `element` (+ `explicitH` / `charge`), not as a label: 'OH', 'H2N', 'NH4+', 'O-'. */
  | {
      readonly kind: 'element';
      readonly element: ElementSymbol;
      readonly hCount?: number;
      readonly charge?: number;
    }
  /** Stored as `label`; `element` is the group's attachment atom: 'Ph' → C, 'OMe' → O. */
  | { readonly kind: 'abbreviation'; readonly key: string; readonly element: ElementSymbol }
  | { readonly kind: 'unknown' };

const ELEMENTS = new Set(PERIODIC_SYMBOLS);
const PSEUDO = new Set(PSEUDO_SYMBOLS);
const MAX_CHARGE = 4;

// H count before or after the element (not both), then an optional charge: '+', '-', '+2',
// '2-'. Typographic minus (−) and super-script signs are accepted as typed or pasted.
const ELEMENT_LABEL =
  /^(?:H(?<pre>\d*))?(?<el>[A-Z][a-z]?)(?:H(?<post>\d*))?(?<charge>[+-]\d?|\d[+-])?$/;

/**
 * What a typed atom label means. Abbreviations win over element symbols, so 'Ac' is acetyl and
 * 'Pr' propyl (not actinium / praseodymium); keys are case-sensitive. Pseudo-atoms 'R', 'X',
 * '*' are elements. Anything else is `unknown` (drawn as typed, chemistry treats it as a
 * pseudo-atom).
 */
export function interpretLabel(text: string): LabelInterpretation {
  const label = text.trim().replace(/[−⁻]/g, '-').replace(/⁺/g, '+');
  if (Object.hasOwn(ABBREVIATIONS, label)) {
    const def = ABBREVIATIONS[label];
    if (def) return { kind: 'abbreviation', key: label, element: attachmentElement(def.smiles) };
  }
  if (PSEUDO.has(label)) return { kind: 'element', element: label };

  const groups = ELEMENT_LABEL.exec(label)?.groups;
  if (!groups) return { kind: 'unknown' };
  const { pre, el, post, charge: chargeText } = groups;
  if (el === undefined || !ELEMENTS.has(el)) return { kind: 'unknown' };
  if (pre !== undefined && post !== undefined) return { kind: 'unknown' };
  const hText = pre ?? post;
  const out: { kind: 'element'; element: ElementSymbol; hCount?: number; charge?: number } = {
    kind: 'element',
    element: el,
  };
  if (hText !== undefined) out.hCount = hText === '' ? 1 : Number(hText);
  if (chargeText !== undefined) {
    const sign = chargeText.includes('-') ? -1 : 1;
    const magnitude = Number(chargeText.replace(/[+-]/, '') || '1');
    if (magnitude === 0 || magnitude > MAX_CHARGE) return { kind: 'unknown' };
    out.charge = sign * magnitude;
  }
  return out;
}

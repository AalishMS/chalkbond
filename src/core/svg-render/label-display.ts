// Display data for abbreviation labels (SPEC-svg-render.md "Atoms and labels", Decision 8):
// how a group is written when the bond comes from its right, and which glyph the bond attaches
// through. A display concern, tied to chem-core's `ABBREVIATIONS` by a test.

export interface LabelDisplay {
  /** The text when neighbours are on the right: the attachment glyph comes last. */
  readonly reversed: string;
  /** The glyph the bond attaches through: first in the typed text, last in the reversed one. */
  readonly attach: string;
}

const d = (reversed: string, attach: string): LabelDisplay => Object.freeze({ reversed, attach });

/** One entry per `ABBREVIATIONS` key; `null` for groups that read the same either way round. */
export const LABEL_DISPLAY: Readonly<Record<string, LabelDisplay | null>> = Object.freeze({
  Me: null,
  Et: null,
  Pr: null,
  iPr: null,
  Bu: null,
  tBu: null,
  Ph: null,
  Bn: null,
  Ac: null,
  OMe: d('MeO', 'O'),
  OEt: d('EtO', 'O'),
  OPh: d('PhO', 'O'),
  OAc: d('AcO', 'O'),
  CO2H: d('HO2C', 'C'),
  COOH: d('HOOC', 'C'),
  CO2Me: d('MeO2C', 'C'),
  CO2Et: d('EtO2C', 'C'),
  CHO: d('OHC', 'C'),
  COCl: d('ClOC', 'C'),
  CONH2: d('H2NOC', 'C'),
  CN: d('NC', 'C'),
  NO2: d('O2N', 'N'),
  SO3H: d('HO3S', 'S'),
});

/** The reversed form of a label, or `null` if it has none (symmetric or unknown). */
export function labelDisplay(label: string): LabelDisplay | null {
  return Object.hasOwn(LABEL_DISPLAY, label) ? (LABEL_DISPLAY[label] ?? null) : null;
}

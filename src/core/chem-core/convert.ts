// SMILES and Molfile in/out (SPEC-chem-core.md "Public API" → conversion).
import {
  DocError,
  PERIODIC_SYMBOLS,
  addAtom,
  addBond,
  emptyDoc,
  everything,
  extract,
  updateAtom,
  type AtomId,
  type BondOrder,
  type BondStereo,
  type Doc,
  type Result,
  type SubDoc,
} from '../doc-model/index';
import { kekulize } from './aromatic';
import { ChemError } from './errors';
import { buildMolecule } from './molecule';
import {
  atomCount,
  molfileToMol,
  molIdCode,
  molToMolfile,
  molToSmiles,
  readMol,
  smilesToMol,
  type Mol,
  type MolData,
} from './ocl';
import { perceive } from './perceive';

export interface ImportOptions {
  /** Aromatic rings as order-1.5 bonds ('circle', default — SPEC.md decision) or Kekulé. */
  readonly aromatic?: 'circle' | 'kekule';
}

/** Larger structures are refused (`too-large`): OCL's 2D layout of ~1200 atoms takes ~1 s. */
export const MAX_IMPORT_ATOMS = 1000;
/** Text longer than this is refused before parsing. */
export const MAX_IMPORT_CHARS = 1_000_000;

const EPOCH = '1970-01-01T00:00:00.000Z';
const MIN_CHARGE = -4;
const MAX_CHARGE = 4;

const fail = (code: ChemError['code'], message: string): Result<never, ChemError> => ({
  ok: false,
  error: new ChemError(code, message),
});

/** OCL error text without its Java class prefix ("Class$S18: SmilesParser: …"). */
function oclMessage(e: unknown): string {
  return String(e instanceof Error ? e.message : e).replace(/^(Error: )?Class\$\w+: /, '');
}

// ── SMILES in ──────────────────────────────────────────────────────────────────────────────

/** Splits a SMILES string into atom tokens (with their text spans), ignoring bonds etc. */
function smilesAtoms(text: string): { start: number; end: number; star: boolean }[] {
  const out: { start: number; end: number; star: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (ch === '[') {
      const end = text.indexOf(']', i);
      const stop = end === -1 ? text.length : end + 1;
      out.push({ start: i, end: stop, star: /^\[\d*\*/.test(text.slice(i, stop)) });
      i = stop;
    } else if (ch === '%') {
      i += 3; // two-digit ring closure
    } else if (text.startsWith('Cl', i) || text.startsWith('Br', i)) {
      out.push({ start: i, end: i + 2, star: false });
      i += 2;
    } else if ('BCNOPSFIbcnops*'.includes(ch)) {
      out.push({ start: i, end: i + 1, star: ch === '*' });
      i += 1;
    } else {
      i += 1;
    }
  }
  return out;
}

/**
 * OCL reads `*` as carbon and then drops every implicit H (verified), so `*` atoms are parsed as
 * a placeholder element absent from the text and mapped back to the pseudo-atom `*`.
 */
function withStarPlaceholder(text: string): { text: string; placeholder: number | null } {
  const stars = smilesAtoms(text).filter((t) => t.star);
  if (stars.length === 0) return { text, placeholder: null };
  const symbol = ['Xe', 'Rn', 'Og'].find((s) => !text.includes(s));
  if (symbol === undefined) return { text, placeholder: null };
  let out = text;
  for (const t of stars.reverse()) {
    const token = text.slice(t.start, t.end);
    const replaced = token === '*' ? `[${symbol}]` : token.replace('*', symbol);
    out = out.slice(0, t.start) + replaced + out.slice(t.end);
  }
  return { text: out, placeholder: PERIODIC_SYMBOLS.indexOf(symbol) + 1 };
}

/** Parses SMILES into a centred sub-document (circle aromatics by default). */
export function parseSmiles(text: string, opts: ImportOptions = {}): Result<SubDoc, ChemError> {
  const trimmed = text.trim();
  if (trimmed === '') return fail('empty', 'No SMILES given.');
  if (trimmed.length > MAX_IMPORT_CHARS) return fail('too-large', 'The SMILES text is too long.');
  const { text: smiles, placeholder } = withStarPlaceholder(trimmed);
  let mol: Mol;
  try {
    // Count first without paying for a 2D layout.
    const n = atomCount(smilesToMol(smiles, { coordinates: false }));
    if (n === 0) return fail('empty', 'The SMILES has no atoms.');
    if (n > MAX_IMPORT_ATOMS) {
      return fail('too-large', `The structure has ${n} atoms (limit ${MAX_IMPORT_ATOMS}).`);
    }
    mol = smilesToMol(smiles, { coordinates: true });
  } catch (e) {
    return fail('invalid-smiles', `Not a valid SMILES: ${oclMessage(e)}`);
  }
  return toSubDoc(readMol(mol), placeholder, 1, opts, 'invalid-smiles');
}

// ── Molfile in ─────────────────────────────────────────────────────────────────────────────

/** Parses a V2000/V3000 Molfile into a centred sub-document scaled to bond length 1.0. */
export function parseMolfile(text: string, opts: ImportOptions = {}): Result<SubDoc, ChemError> {
  if (text.trim() === '') return fail('empty', 'No Molfile given.');
  if (text.length > MAX_IMPORT_CHARS) return fail('too-large', 'The Molfile is too long.');
  let mol: Mol;
  try {
    mol = molfileToMol(text);
  } catch (e) {
    return fail('invalid-molfile', `Not a valid Molfile: ${oclMessage(e)}`);
  }
  const n = atomCount(mol);
  if (n === 0) {
    // OCL returns an empty molecule for unreadable text (verified).
    return /V[23]000/.test(text) && /M\s+END/.test(text)
      ? fail('empty', 'The Molfile has no atoms.')
      : fail('invalid-molfile', 'Not a valid Molfile.');
  }
  if (n > MAX_IMPORT_ATOMS) {
    return fail('too-large', `The structure has ${n} atoms (limit ${MAX_IMPORT_ATOMS}).`);
  }
  const data = readMol(mol);
  return toSubDoc(data, null, 1 / averageBondLength(data), opts, 'invalid-molfile');
}

function averageBondLength(data: MolData): number {
  let sum = 0;
  for (const b of data.bonds) {
    const p = data.atoms[b.a1];
    const q = data.atoms[b.a2];
    if (p && q) sum += Math.hypot(p.x - q.x, p.y - q.y);
  }
  const avg = data.bonds.length > 0 ? sum / data.bonds.length : 1;
  return avg > 1e-6 ? avg : 1;
}

// ── OCL data → sub-document ────────────────────────────────────────────────────────────────

function toSubDoc(
  data: MolData,
  placeholder: number | null,
  scale: number,
  opts: ImportOptions,
  errorCode: 'invalid-smiles' | 'invalid-molfile',
): Result<SubDoc, ChemError> {
  const circle = (opts.aromatic ?? 'circle') === 'circle';
  let doc = emptyDoc(EPOCH);
  const ids: AtomId[] = [];
  try {
    for (const a of data.atoms) {
      const pseudo = a.atomicNo === 0 || a.atomicNo === placeholder;
      if (a.charge < MIN_CHARGE || a.charge > MAX_CHARGE) {
        return fail(errorCode, `Charge ${a.charge} is outside −4…+4.`);
      }
      let id: AtomId;
      [doc, id] = addAtom(doc, {
        x: a.x * scale,
        y: a.y * scale,
        element: pseudo ? pseudoSymbol(a.customLabel) : (PERIODIC_SYMBOLS[a.atomicNo - 1] ?? '*'),
        charge: pseudo ? 0 : a.charge,
        radical: a.radical,
        ...(a.mass > 0 && !pseudo ? { isotope: a.mass } : {}),
      });
      ids.push(id);
    }
    for (const b of data.bonds) {
      const delocalized = b.kind === 'delocalized';
      const order: BondOrder =
        delocalized || (circle && b.aromatic)
          ? 1.5
          : b.kind === 'double'
            ? 2
            : b.kind === 'triple'
              ? 3
              : 1;
      const stereo: BondStereo =
        order === 1 && b.kind === 'up'
          ? 'wedge'
          : order === 1 && b.kind === 'down'
            ? 'hash'
            : 'none';
      [doc] = addBond(doc, ids[b.a1] as AtomId, ids[b.a2] as AtomId, { order, stereo });
    }
  } catch (e) {
    if (e instanceof DocError) return fail(errorCode, `Unsupported structure: ${e.message}`);
    throw e;
  }

  // Where chem-core's valence model would give a different H count than the source said
  // (bracket atoms such as [nH] in a tautomer, [CH2], [O-] on purpose), fix it as explicitH.
  // OCL's own counts are wrong next to delocalized bonds (verified), so those atoms are skipped.
  const delocalized = new Set<number>();
  for (const b of data.bonds) {
    if (b.kind === 'delocalized') delocalized.add(b.a1).add(b.a2);
  }
  for (let pass = 0; pass < 2; pass++) {
    const p = perceive(doc);
    let changed = false;
    data.atoms.forEach((a, i) => {
      const id = ids[i] as AtomId;
      const atom = doc.atoms[id];
      if (!atom || a.atomicNo === 0 || a.atomicNo === placeholder || delocalized.has(i)) return;
      if (atom.explicitH === undefined && p.atoms[id]?.implicitH !== a.implicitH) {
        doc = updateAtom(doc, id, { explicitH: a.implicitH });
        changed = true;
      }
    });
    if (!changed) break;
  }

  if (!circle && Object.values(doc.bonds).some((b) => b.order === 1.5)) {
    try {
      doc = kekulize(doc);
    } catch {
      // Keep the 1.5 bonds the source gave; perception will warn about them.
    }
  }
  return { ok: true, value: extract(doc, everything(doc)) };
}

function pseudoSymbol(customLabel: string | null): string {
  return customLabel === 'R' || customLabel === 'X' ? customLabel : '*';
}

// ── SMILES / Molfile out ───────────────────────────────────────────────────────────────────

function selection(doc: Doc, atoms?: Iterable<AtomId>): AtomId[] {
  const ids = atoms === undefined ? (Object.keys(doc.atoms) as AtomId[]) : [...new Set(atoms)];
  for (const id of ids) if (!doc.atoms[id]) throw new DocError('unknown-atom', id);
  return ids;
}

/**
 * Isomeric SMILES of the atoms (default: all; bonds among them), abbreviations expanded,
 * pseudo-atoms and unknown labels written as `*`. Fragments are joined by '.'.
 */
export function toSmiles(doc: Doc, atoms?: Iterable<AtomId>): string {
  const ids = selection(doc, atoms);
  if (ids.length === 0) return '';
  const { mol } = buildMolecule(doc, ids, { stereo: true });
  return molToSmiles(mol).replace(/\[\?\]/g, '*');
}

/** Molfile (V2000 default, or V3000) of the atoms, abbreviations expanded; bond length 1.0. */
export function toMolfile(
  doc: Doc,
  atoms?: Iterable<AtomId>,
  opts: { version?: 'V2000' | 'V3000' } = {},
): string {
  const ids = selection(doc, atoms);
  const { mol } = buildMolecule(doc, ids, { stereo: true });
  return molToMolfile(mol, opts.version ?? 'V2000');
}

/**
 * OCL canonical IDCode of the atoms (stereo included): equal for the same structure however it
 * is drawn. chem-core-internal (tests, round trips); never stored in documents.
 */
export function canonicalId(doc: Doc, atoms?: Iterable<AtomId>): string {
  const ids = selection(doc, atoms);
  return molIdCode(buildMolecule(doc, ids, { stereo: true }).mol);
}

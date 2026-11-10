import {
  createHistory,
  type AtomId,
  type BondId,
  type Doc,
  type History,
  type ObjectId,
  type Selection,
  type SubDoc,
} from '@core/doc-model';
import { resolveStyle } from '@core/svg-render';
import type { Point } from '../model/geometry';
import type { Hit } from '../model/hit-test';
import { initialViewport, type Viewport } from '../model/viewport';

/** Tool ids in rail order (SPEC-editor.md "Tool rail"). */
export const TOOL_IDS = [
  'select',
  'erase',
  'bond',
  'chain',
  'ring',
  'atom',
  'arrow',
  'plus',
  'curved',
  'text',
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

/** Tools whose options bar chooses a variant (bond order, ring size, element, arrow, head). */
export type VariantTool = 'bond' | 'ring' | 'atom' | 'arrow' | 'curved';

export const EMPTY_SELECTION: Selection = {
  atoms: new Set<AtomId>(),
  bonds: new Set<BondId>(),
  objects: new Set<ObjectId>(),
};

export type { Hit } from '../model/hit-test';

/**
 * The active tool's machine state. Each tool refines `kind` into its own union member; the store
 * only holds it and clears it (cancel, undo, tool switch).
 */
export interface GestureState {
  readonly kind: string;
  /** What the overlay draws for this gesture: a marquee, snapping guides. */
  readonly overlay?: GestureOverlay;
}

/** A snapping guide: a line across the canvas through `pt` (pt, document coordinates). */
export interface Guide {
  readonly axis: 'x' | 'y';
  readonly pt: number;
}

export interface GestureOverlay {
  /** Opposite corners of the marquee, BLU. */
  readonly marquee?: { readonly from: Point; readonly to: Point };
  readonly guides?: readonly Guide[];
}

/** A ghost document for the gesture in progress; never enters history. */
export interface Preview {
  readonly doc: Doc;
  /** Item keys not in the committed scene: drawn at ghost opacity. */
  readonly added: ReadonlySet<string>;
  readonly mergeTarget?: AtomId;
  /** Erase: these parts stay in place and are drawn at `--erase-ghost-opacity`. */
  readonly faded?: readonly string[];
  /** Drag fast path: only these parts' `<g>` move, by (dx, dy) pt. */
  readonly translate?: {
    readonly keys: readonly string[];
    readonly dx: number;
    readonly dy: number;
  };
}

/** An open label or text editor; the editing model itself arrives with E23. */
export type Editing =
  | { readonly kind: 'label'; readonly atom: AtomId }
  | { readonly kind: 'text'; readonly object: ObjectId };

export interface NameField {
  text: string;
  open: boolean;
  highlighted: number;
  error: { readonly message: string; readonly suggestions: readonly string[] } | null;
}

export interface Notice {
  /** Rising number, so an expiry timer cannot clear a later notice. */
  readonly id: number;
  readonly kind: 'info' | 'error';
  readonly text: string;
}

export interface EditorState {
  /** The document is `current(history)`. */
  history: History;
  /** Last loaded or saved document, for dirty. */
  saved: Doc;
  /** Never holds ids across undo/redo. */
  selection: Selection;
  tool: ToolId;
  /** Chosen option id per variant tool (ids from catalog `OPTIONS`). */
  variants: Readonly<Record<VariantTool, string>>;
  hover: Hit | null;
  gesture: GestureState | null;
  preview: Preview | null;
  /** Zoom (1 = 100 %), pan (screen px) and canvas size (px; 0 x 0 until measured). */
  viewport: Viewport;
  editing: Editing | null;
  nameField: NameField;
  notice: Notice | null;
  /** Source of the next notice id. */
  noticeSeq: number;
  /** What Copy or Cut last took (CB1); null until something is copied. */
  clipboard: SubDoc | null;
  spaceHeld: boolean;
}

/**
 * Decision 5: Bond (single) is the active tool at launch. The viewport has the default zoom and
 * size 0 x 0 until the canvas reports its size; the reducer then applies V2.
 */
export function initialState(doc: Doc, clock: () => string): EditorState {
  return {
    history: createHistory(doc, { clock }),
    saved: doc,
    selection: EMPTY_SELECTION,
    tool: 'bond',
    variants: { bond: 'single', ring: 'benzene', atom: 'C', arrow: 'forward', curved: 'full' },
    hover: null,
    gesture: null,
    preview: null,
    viewport: initialViewport(null, { w: 0, h: 0 }, resolveStyle(doc.style).bondLength),
    editing: null,
    nameField: { text: '', open: false, highlighted: 0, error: null },
    notice: null,
    noticeSeq: 0,
    clipboard: null,
    spaceHeld: false,
  };
}

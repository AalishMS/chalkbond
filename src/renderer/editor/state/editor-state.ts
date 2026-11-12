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
import type { NameError } from '../model/suggestions';
import type { TextEditState } from '../model/text-edit';
import type { TextTarget } from '../model/text-ops';
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
  /** Curly arrow: the atoms or bonds the arrow starts and ends on, highlighted like a hover. */
  readonly anchors?: readonly Hit[];
  /** Chain: the carbons of the zig-zag (start atom included), badged by the pointer `at` (canvas px). */
  readonly count?: { readonly at: Point; readonly n: number };
}

/** A ghost document for the gesture in progress; never enters history. */
export interface Preview {
  readonly doc: Doc;
  /** Item keys not in the committed scene: drawn at ghost opacity. */
  readonly added: ReadonlySet<string>;
  readonly mergeTarget?: AtomId;
  /** The ghost of what a click would do (B6), shown while no gesture runs; Esc does not clear it. */
  readonly hovering?: boolean;
  /** Erase: these parts stay in place and are drawn at `--erase-ghost-opacity`. */
  readonly faded?: readonly string[];
  /** Drag fast path: only these parts' `<g>` move, by (dx, dy) pt. */
  readonly translate?: {
    readonly keys: readonly string[];
    readonly dx: number;
    readonly dy: number;
  };
}

/**
 * An open label or text editor: what it edits and the pure editing model behind its box (rule T2).
 * While one is open the document does not change; closing it commits or cancels.
 */
export type Editing =
  | { readonly kind: 'label'; readonly atom: AtomId; readonly edit: TextEditState }
  | {
      readonly kind: 'text';
      readonly target: TextTarget;
      readonly edit: TextEditState;
      /** B / I apply to the whole object (T2). */
      readonly bold: boolean;
      readonly italic: boolean;
    };

export interface NameField {
  text: string;
  open: boolean;
  highlighted: number;
  error: NameError | null;
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
  /**
   * V2 is still to be applied when the canvas gets a real size (a new or loaded document before
   * the first measurement). False once a tab's own view is put in (R57) or V2 has been applied.
   */
  viewPending: boolean;
  editing: Editing | null;
  nameField: NameField;
  /** Host/view name-field focus request sequence. */
  focusRequest: number;
  notice: Notice | null;
  /** Source of the next notice id. */
  noticeSeq: number;
  /** What Copy or Cut last took (CB1); null until something is copied. */
  clipboard: SubDoc | null;
  /**
   * Where the clipboard came from (CB1): the centre of the copied selection (BLU) and the shift,
   * in BLU along x and y, of the next paste: 1 after a copy, 0 after a cut, +1 after each paste.
   */
  clipboardSource: { readonly centre: Point; readonly next: number } | null;
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
    viewPending: true,
    editing: null,
    nameField: { text: '', open: false, highlighted: 0, error: null },
    notice: null,
    noticeSeq: 0,
    focusRequest: 0,
    clipboard: null,
    clipboardSource: null,
    spaceHeld: false,
  };
}

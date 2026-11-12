// Document types for doc-model. See SPEC-doc-model.md "Data Model".
// Coordinates are in bond-length units (BLU); +y points down.

export type Brand<B extends string> = string & { readonly __brand: B };

export type AtomId = Brand<'AtomId'>;
export type BondId = Brand<'BondId'>;
export type ObjectId = Brand<'ObjectId'>;
export type GroupId = Brand<'GroupId'>;
export type AnyId = AtomId | BondId | ObjectId | GroupId;

/** `#rrggbb` */
export type Color = `#${string}`;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Axis-aligned; `w`, `h` ≥ 0. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** x' = a·x + c·y + e ; y' = b·x + d·y + f (SVG matrix order). */
export type Affine = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

/** Validated against PERIODIC_SYMBOLS ∪ PSEUDO_SYMBOLS. */
export type ElementSymbol = string;

export type PartialCharge = 'δ+' | 'δ-' | 'δδ+' | 'δδ-';

export interface Atom {
  readonly id: AtomId;
  readonly x: number;
  readonly y: number;
  readonly element: ElementSymbol;
  /** Abbreviation/display label: 'Ph', 'OMe', 'CO2H'. */
  readonly label?: string;
  /** -4..+4 */
  readonly charge: number;
  readonly isotope?: number;
  /** undefined = automatic (chem-core decides). */
  readonly explicitH?: number;
  /** 0 none, 1 doublet, 2 triplet/diradical. */
  readonly radical: 0 | 1 | 2;
  /** Displayed lone pairs, 0..4. */
  readonly lonePairs?: number;
  readonly partialCharge?: PartialCharge;
  /** Atom-numbering annotation, e.g. '1', 'α'. */
  readonly number?: string;
  readonly color?: Color;
}

/** 1.5 = aromatic/delocalized. */
export type BondOrder = 1 | 2 | 3 | 1.5;
export type BondStereo = 'none' | 'wedge' | 'hash' | 'wavy' | 'bold';
export type DoublePlacement = 'auto' | 'center' | 'left' | 'right';

export interface Bond {
  readonly id: BondId;
  /** Wedge/hash narrow end. */
  readonly a1: AtomId;
  readonly a2: AtomId;
  readonly order: BondOrder;
  readonly stereo: BondStereo;
  readonly doublePlacement: DoublePlacement;
  readonly color?: Color;
}

/** Attachment point for curved arrows and callouts; follows the structure when it moves. */
export type Anchor =
  | { readonly kind: 'point'; readonly p: Point }
  | { readonly kind: 'atom'; readonly atom: AtomId; readonly offset?: Point }
  | { readonly kind: 'bond'; readonly bond: BondId; readonly t?: number };

export type ArrowKind = 'forward' | 'equilibrium' | 'retro' | 'resonance' | 'no-go';

export interface TextRun {
  readonly text: string;
  readonly script?: 'sub' | 'sup';
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly color?: Color;
}

export interface ArrowObject {
  readonly type: 'arrow';
  readonly id: ObjectId;
  readonly kind: ArrowKind;
  readonly from: Point;
  readonly to: Point;
}

export interface CurvedArrowObject {
  readonly type: 'curved-arrow';
  readonly id: ObjectId;
  readonly head: 'full' | 'fishhook';
  readonly from: Anchor;
  readonly to: Anchor;
  /** Signed curvature. */
  readonly bend: number;
}

export interface PlusObject {
  readonly type: 'plus';
  readonly id: ObjectId;
  readonly at: Point;
}

export interface TextObject {
  readonly type: 'text';
  readonly id: ObjectId;
  readonly at: Point;
  readonly runs: readonly TextRun[];
  readonly align: 'left' | 'center' | 'right';
  /** Reaction conditions above/below an arrow. */
  readonly attachedTo?: { readonly arrow: ObjectId; readonly slot: 'above' | 'below' };
}

/** Compound number under a structure. */
export interface CaptionObject {
  readonly type: 'caption';
  readonly id: ObjectId;
  readonly runs: readonly TextRun[];
  readonly target: readonly AtomId[];
}

export interface CalloutObject {
  readonly type: 'callout';
  readonly id: ObjectId;
  readonly at: Point;
  readonly runs: readonly TextRun[];
  readonly anchor: Anchor;
}

export interface BracketObject {
  readonly type: 'bracket';
  readonly id: ObjectId;
  readonly shape: 'square' | 'round' | 'curly';
  readonly rect: Rect;
  /** e.g. ‡, n, 2+ */
  readonly corner?: readonly TextRun[];
}

/** Highlight shape; paints beneath structures. */
export interface ShapeObject {
  readonly type: 'shape';
  readonly id: ObjectId;
  readonly shape: 'rect' | 'ellipse';
  readonly rect: Rect;
  readonly stroke?: Color;
  readonly fill?: Color;
  /** 0..1 */
  readonly fillOpacity: number;
}

export type DrawObject =
  | ArrowObject
  | CurvedArrowObject
  | PlusObject
  | TextObject
  | CaptionObject
  | CalloutObject
  | BracketObject
  | ShapeObject;

export type DrawObjectType = DrawObject['type'];

export interface Group {
  readonly id: GroupId;
  readonly members: { readonly atoms: readonly AtomId[]; readonly objects: readonly ObjectId[] };
}

export type StylePreset = 'slides' | 'journal';

/**
 * Per-document overrides of a style preset. Final field set; meaning defined in
 * `SPEC-svg-render.md`. All values are optional in `Doc.style.overrides`.
 */
export interface StyleSettings {
  /** Bond length in points. */
  readonly bondLength: number;
  /** Bond stroke width in points. */
  readonly lineWidth: number;
  /** Gap between the lines of a double bond, as a fraction of bond length. */
  readonly doubleBondSpacing: number;
  readonly fontFamily: string;
  /** Atom-label font size in points. */
  readonly fontSize: number;
}

export interface DocMeta {
  readonly title?: string;
  /** ISO 8601 */
  readonly created: string;
  /** ISO 8601 */
  readonly modified: string;
}

export interface Doc {
  /** In memory always 2; a file may say 1 (`SPEC-doc-model.md` File Format, D1). */
  readonly schemaVersion: 2;
  readonly atoms: Readonly<Record<AtomId, Atom>>;
  readonly bonds: Readonly<Record<BondId, Bond>>;
  readonly objects: Readonly<Record<ObjectId, DrawObject>>;
  /**
   * Paint order of objects. Atoms/bonds paint below objects, except `shape` highlights, which
   * paint beneath structures.
   */
  readonly zOrder: readonly ObjectId[];
  readonly groups: Readonly<Record<GroupId, Group>>;
  /** Id counter; ids are 'a12', 'b7', 'o3', 'g1' (prefix + n). */
  readonly nextId: number;
  readonly style: {
    readonly preset: StylePreset;
    readonly overrides: Partial<StyleSettings>;
    /**
     * Schema v2 (D1). Absent means the skeletal formula; `'structural'` shows every atom and
     * hydrogen. One value, so one state has one representation (never `'skeletal'`).
     */
    readonly formula?: 'structural';
  };
  readonly meta: DocMeta;
}

/** A selection of document items. Lives outside `Doc` (Sets are not JSON). */
export interface Selection {
  readonly atoms: ReadonlySet<AtomId>;
  readonly bonds: ReadonlySet<BondId>;
  readonly objects: ReadonlySet<ObjectId>;
}

/** `Omit` that distributes over a union (keeps each variant's own fields). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// Public types of svg-render (SPEC-svg-render.md "Data Model"). `ResolvedStyle` lives in style.ts.
import type { Perception } from '../chem-core';
import type { Point, Rect, Selection } from '../doc-model';
import type { ResolvedStyle } from './style';

/** Stable across renders of the same ids. A ring key is its atom ids sorted by number, joined by `,`. */
export type ItemKey = `atom:${string}` | `bond:${string}` | `obj:${string}` | `ring:${string}`;

/** The markup of one item, in document pt coordinates; elements separated by `\n`. */
export interface RenderPart {
  readonly key: ItemKey;
  readonly svg: string;
}

export interface RenderOptions {
  /** Draw a subset (selected bonds bring their atoms; objects only when selected). */
  readonly only?: Selection;
  /** Must be `perceive(doc)` of this document; computed when absent. */
  readonly perception?: Perception;
}

export type RenderNotice =
  /** Fallback width used; `chars` deduplicated and sorted by code point. */
  | { readonly code: 'unmeasured-glyph'; readonly chars: string }
  | { readonly code: 'skipped-item'; readonly key: ItemKey; readonly reason: string };

/** The layout result, before the SVG wrapper. */
export interface Scene {
  /** In paint order. */
  readonly parts: readonly RenderPart[];
  /** Ink extents, pt, document coordinates; `null` when nothing is drawn. */
  readonly bounds: Rect | null;
  /** Ink extents of every drawn item that has ink, pt. */
  readonly extents: Readonly<Record<ItemKey, Rect>>;
  readonly style: ResolvedStyle;
  /** Deterministic order. */
  readonly notices: readonly RenderNotice[];
}

export interface SvgOptions {
  /** pt added on every side; default 0 (tight). */
  readonly padding?: number;
  /** Opaque text, escaped, emitted as `<metadata id="chalkbond">`. */
  readonly metadata?: string;
}

export interface SvgDocument {
  /** A complete standalone SVG: `\n` line ends, trailing newline. */
  readonly svg: string;
  /** pt (the `width` / `height` attributes). */
  readonly width: number;
  readonly height: number;
  /** The document pt coordinate shown at the SVG's (0, 0): `(bounds.x - padding, bounds.y - padding)`. */
  readonly origin: Point;
}

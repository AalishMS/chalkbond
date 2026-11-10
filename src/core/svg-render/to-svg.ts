// The SVG wrapper around a rendered scene (SPEC-svg-render.md "Public API"): size in pt, a
// viewBox that starts at (0, 0), one translated group holding the parts, optional metadata.
import type { Doc, Point } from '../doc-model';
import { fmt } from './fmt';
import { render } from './render';
import { svgGroup, svgMetadata, svgRoot } from './svg-write';
import type { RenderOptions, Scene, SvgDocument, SvgOptions } from './types';

/** Padding must be a finite, non-negative number; anything else counts as 0 (tight). */
function cleanPadding(p: unknown): number {
  return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : 0;
}

/** The scene as a complete standalone SVG. An empty scene gives an empty 0 x 0 svg, no group. */
export function toSvg(scene: Scene, opts: SvgOptions = {}): SvgDocument {
  const meta = opts.metadata === undefined ? [] : [svgMetadata(opts.metadata)];
  const bounds = scene.bounds;
  if (!bounds || scene.parts.length === 0) {
    return {
      svg: svgRoot({ width: 0, height: 0, viewBox: '0 0 0 0' }, meta),
      width: 0,
      height: 0,
      origin: { x: 0, y: 0 },
    };
  }
  const pad = cleanPadding(opts.padding);
  const width = Number(fmt(bounds.w + 2 * pad));
  const height = Number(fmt(bounds.h + 2 * pad));
  const origin: Point = { x: bounds.x - pad, y: bounds.y - pad };
  const group = svgGroup(
    {
      transform: `translate(${fmt(-origin.x)} ${fmt(-origin.y)})`,
      fill: 'none',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    scene.parts.map((p) => p.svg),
  );
  return {
    svg: svgRoot({ width, height, viewBox: `0 0 ${fmt(width)} ${fmt(height)}` }, [...meta, group]),
    width,
    height,
    origin,
  };
}

/** `toSvg(render(doc, opts), opts)`: the whole document, or a subset through `only`. */
export function renderSvg(doc: Doc, opts: RenderOptions & SvgOptions = {}): SvgDocument {
  return toSvg(render(doc, opts), opts);
}

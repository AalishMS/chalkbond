// Public entry for the svg-render module. Other modules import only from here.
// See SPEC-svg-render.md. Grows with each task.
export { STYLE_PRESETS, resolveStyle, bluToPt, ptToBlu, INK, type ResolvedStyle } from './style';
export { render } from './render';
export { toSvg, renderSvg } from './to-svg';
export { curveControls } from './curved-arrow';
export { isLabelled } from './atom-label';
export type {
  ItemKey,
  RenderNotice,
  RenderOptions,
  RenderPart,
  Scene,
  SvgDocument,
  SvgOptions,
} from './types';

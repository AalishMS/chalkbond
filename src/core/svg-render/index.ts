// Public entry for the svg-render module. Other modules import only from here.
// See SPEC-svg-render.md. Grows with each task; render/toSvg/renderSvg arrive with S7.
export { STYLE_PRESETS, resolveStyle, bluToPt, ptToBlu, INK, type ResolvedStyle } from './style';

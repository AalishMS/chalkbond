// The view onto the document (SPEC-editor.md "Coordinates" and rules V1-V6).
// Document BLU -> pt (x bond length) -> screen px (x zoom x 4/3, plus pan). Zoom 1 is 100 %.
import type { Point, Rect, Size } from './geometry';

export interface Viewport {
  /** 1 = 100 %: one pt is 4/3 CSS px. */
  readonly zoom: number;
  /** Screen position of the document's pt origin, in canvas px. */
  readonly pan: Point;
  /** The canvas, in px. */
  readonly size: Size;
}

/** CSS px per pt at zoom 1. */
export const PX_PER_PT = 4 / 3;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;
/** V1. */
export const ZOOM_STEPS: readonly number[] = [
  25, 33, 50, 67, 75, 90, 100, 125, 150, 200, 250, 300, 400, 500, 600, 800,
].map((percent) => percent / 100);
/** Clear space around the ink box for fit and reveal (V3, V5), px. */
export const FIT_MARGIN = 48;
/** The least content that stays on screen when panning (V4), px. */
export const PAN_KEEP = 64;
/** R1: z0 = 1.5 x 40 / bondLength, so a bond is 80 screen px long. */
const DEFAULT_ZOOM_NUMERATOR = 1.5 * 40;
const EPS = 1e-9;

export const clampZoom = (zoom: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

/** The readout: the zoom as a whole percent. */
export const zoomPercent = (zoom: number): number => Math.round(zoom * 100);

/** Screen px per pt. */
const k = (v: Viewport): number => v.zoom * PX_PER_PT;

export function ptToScreen(v: Viewport, p: Point): Point {
  return { x: p.x * k(v) + v.pan.x, y: p.y * k(v) + v.pan.y };
}

export function screenToPt(v: Viewport, s: Point): Point {
  return { x: (s.x - v.pan.x) / k(v), y: (s.y - v.pan.y) / k(v) };
}

/** `ptPerBlu` is the scene's pt per BLU (`scene.style.ptPerBlu`: the bond length, doubled in structural mode). */
export function bluToScreen(v: Viewport, p: Point, ptPerBlu: number): Point {
  return ptToScreen(v, { x: p.x * ptPerBlu, y: p.y * ptPerBlu });
}

export function screenToBlu(v: Viewport, s: Point, ptPerBlu: number): Point {
  const pt = screenToPt(v, s);
  return { x: pt.x / ptPerBlu, y: pt.y / ptPerBlu };
}

const centreOf = (size: Size): Point => ({ x: size.w / 2, y: size.h / 2 });

/** V2 / R1: a bond is 80 screen px: 150 % for Slides (40 pt), 416.67 % for Handout (14.4 pt). */
export function defaultZoom(bondLength: number): number {
  return clampZoom(DEFAULT_ZOOM_NUMERATOR / bondLength);
}

/** The next V1 step above (`dir` 1) or below (-1) `zoom`; the range end when there is none. */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const next =
    dir === 1
      ? ZOOM_STEPS.find((s) => s > zoom + EPS)
      : [...ZOOM_STEPS].reverse().find((s) => s < zoom - EPS);
  return clampZoom(next ?? zoom);
}

/** Zoom to `zoom` (clamped), keeping the point under screen `anchor` where it is. */
export function zoomAbout(v: Viewport, zoom: number, anchor: Point): Viewport {
  const z = clampZoom(zoom);
  const ratio = z / v.zoom;
  return {
    ...v,
    zoom: z,
    pan: { x: anchor.x - (anchor.x - v.pan.x) * ratio, y: anchor.y - (anchor.y - v.pan.y) * ratio },
  };
}

/** V1: Ctrl+wheel and pinch zoom continuously about the pointer by 1.0015^(-deltaY). */
export function wheelZoom(v: Viewport, deltaY: number, anchor: Point): Viewport {
  return zoomAbout(v, v.zoom * Math.pow(1.0015, -deltaY), anchor);
}

/** V1: buttons and keys step about the canvas centre. */
export function stepViewport(v: Viewport, dir: 1 | -1): Viewport {
  return zoomAbout(v, stepZoom(v.zoom, dir), centreOf(v.size));
}

/** A viewport at `zoom` with the pt point `pt` at the canvas centre. */
function centredOn(zoom: number, pt: Point, size: Size): Viewport {
  const scale = zoom * PX_PER_PT;
  const c = centreOf(size);
  return { zoom, pan: { x: c.x - pt.x * scale, y: c.y - pt.y * scale }, size };
}

const inkCentre = (b: Rect): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/**
 * V3 / R13: the largest whole percent, at most the default zoom, at which `bounds` (pt) plus a
 * 48 px margin on every side fits `canvas`. Nothing drawn: the default zoom.
 */
export function fitZoom(bounds: Rect | null, canvas: Size, bondLength: number): number {
  const z0 = defaultZoom(bondLength);
  if (bounds === null) return z0;
  const fitW = (canvas.w - 2 * FIT_MARGIN) / (bounds.w * PX_PER_PT);
  const fitH = (canvas.h - 2 * FIT_MARGIN) / (bounds.h * PX_PER_PT);
  const percent = Math.floor(Math.min(fitW, fitH, z0) * 100 + EPS);
  return clampZoom(percent / 100);
}

/** The view that shows `bounds` at `fitZoom`, centred. */
export function fitViewport(bounds: Rect | null, canvas: Size, bondLength: number): Viewport {
  const zoom = fitZoom(bounds, canvas, bondLength);
  return centredOn(zoom, bounds === null ? { x: 0, y: 0 } : inkCentre(bounds), canvas);
}

/**
 * V2: a new or loaded document opens at the default zoom, the origin (empty) or the ink box
 * centred; if the ink box does not fit with the margin, zoom to fit instead.
 */
export function initialViewport(bounds: Rect | null, canvas: Size, bondLength: number): Viewport {
  const z0 = defaultZoom(bondLength);
  if (bounds === null) return centredOn(z0, { x: 0, y: 0 }, canvas);
  const fits =
    bounds.w * z0 * PX_PER_PT + 2 * FIT_MARGIN <= canvas.w &&
    bounds.h * z0 * PX_PER_PT + 2 * FIT_MARGIN <= canvas.h;
  return fits ? centredOn(z0, inkCentre(bounds), canvas) : fitViewport(bounds, canvas, bondLength);
}

/** One axis of V5: the shift that brings [lo, hi] inside [margin, limit - margin]. */
function minimalShift(lo: number, hi: number, limit: number): number {
  if (lo < FIT_MARGIN) return FIT_MARGIN - lo;
  if (hi > limit - FIT_MARGIN) return limit - FIT_MARGIN - hi;
  return 0;
}

/**
 * V5: after an insert, paste, duplicate or Tidy. Fully visible inside the margin: unchanged.
 * Fits at this zoom: the smallest pan. Otherwise `min(fit, z0)` centred on the ink box, only
 * when that is below the current zoom. `ink` is in pt.
 */
export function reveal(v: Viewport, ink: Rect, bondLength: number): Viewport {
  const a = ptToScreen(v, { x: ink.x, y: ink.y });
  const b = ptToScreen(v, { x: ink.x + ink.w, y: ink.y + ink.h });
  const fits = b.x - a.x <= v.size.w - 2 * FIT_MARGIN && b.y - a.y <= v.size.h - 2 * FIT_MARGIN;
  if (fits) {
    const dx = minimalShift(a.x, b.x, v.size.w);
    const dy = minimalShift(a.y, b.y, v.size.h);
    return dx === 0 && dy === 0 ? v : { ...v, pan: { x: v.pan.x + dx, y: v.pan.y + dy } };
  }
  const zoom = fitZoom(ink, v.size, bondLength);
  return zoom < v.zoom ? centredOn(zoom, inkCentre(ink), v.size) : v;
}

/**
 * V7: after a name or scheme insert. The zoom is the lower of the current zoom and the fit zoom
 * (so it never zooms in, and zooms out only when the drawing does not fit with the margin), and
 * the whole drawing's ink box `ink` (pt) is centred.
 */
export function frame(v: Viewport, ink: Rect, bondLength: number): Viewport {
  const zoom = Math.min(v.zoom, fitZoom(ink, v.size, bondLength));
  return centredOn(zoom, inkCentre(ink), v.size);
}

/** One axis of V4: the pan range that keeps `keep` px of the content [lo, lo + len) visible. */
function clampAxis(pan: number, lo: number, len: number, limit: number): number {
  const keep = Math.min(PAN_KEEP, len);
  return Math.min(Math.max(pan, keep - len - lo), limit - keep - lo);
}

/** V4: the pan, moved only as far as needed to keep 64 px of `content` (pt) on screen. */
export function clampPan(v: Viewport, content: Rect | null): Viewport {
  if (content === null) return v;
  const s = k(v);
  const x = clampAxis(v.pan.x, content.x * s, content.w * s, v.size.w);
  const y = clampAxis(v.pan.y, content.y * s, content.h * s, v.size.h);
  return x === v.pan.x && y === v.pan.y ? v : { ...v, pan: { x, y } };
}

/**
 * V6: after a preset switch the drawing keeps its on-screen size: zoom x old / new bond length
 * (clamped, not snapped), and the drawing point at the canvas centre stays there.
 */
export function switchPreset(v: Viewport, oldBondLength: number, newBondLength: number): Viewport {
  const centre = centreOf(v.size);
  const blu = screenToBlu(v, centre, oldBondLength);
  const zoom = clampZoom((v.zoom * oldBondLength) / newBondLength);
  const scale = zoom * PX_PER_PT * newBondLength;
  return {
    zoom,
    pan: { x: centre.x - blu.x * scale, y: centre.y - blu.y * scale },
    size: v.size,
  };
}

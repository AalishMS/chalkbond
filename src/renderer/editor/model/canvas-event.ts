// A raw pointer event as the tools see it: BLU and screen points, one conversion at the edge
// (SPEC-editor.md "Coordinates" and "Tools and gestures").
import type { Point } from './geometry';
import { screenToBlu, type Viewport } from './viewport';

/** The parts of a `PointerEvent` the conversion reads. */
export interface RawPointer {
  readonly clientX: number;
  readonly clientY: number;
  readonly button: number;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
}

export type CanvasEvent =
  | {
      readonly type: 'down' | 'move' | 'up';
      /** BLU. */
      readonly p: Point;
      /** Canvas px. */
      readonly screen: Point;
      readonly button: 0 | 1 | 2;
      readonly mods: { readonly shift: boolean; readonly alt: boolean; readonly ctrl: boolean };
    }
  | { readonly type: 'dblclick'; readonly p: Point; readonly screen: Point }
  | { readonly type: 'leave' }
  | { readonly type: 'cancel' };

/** A pointer move: what hover reads (HV1, B6). */
export type MoveEvent = Extract<CanvasEvent, { type: 'down' | 'move' | 'up' }> & {
  readonly type: 'move';
};

/**
 * `origin` is the canvas's top-left in client px; `ptPerBlu` is the scene's, in pt.
 * Tolerances stay in screen px, so `screen` travels with `p`.
 */
export function canvasEvent(
  type: 'down' | 'move' | 'up',
  raw: RawPointer,
  origin: Point,
  viewport: Viewport,
  ptPerBlu: number,
): CanvasEvent {
  const screen = { x: raw.clientX - origin.x, y: raw.clientY - origin.y };
  const button = raw.button === 1 || raw.button === 2 ? raw.button : 0;
  return {
    type,
    p: screenToBlu(viewport, screen, ptPerBlu),
    screen,
    button,
    mods: { shift: raw.shiftKey, alt: raw.altKey, ctrl: raw.ctrlKey },
  };
}

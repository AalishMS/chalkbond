import { useEffect, type RefObject } from 'react';
import { createCoalescer } from '../model/coalesce';
import type { Point } from '../model/geometry';
import type { Store } from '../state/store';

/** Runs `run` on the next animation frame; returns the cancel function. */
const nextFrame = (run: () => void): (() => void) => {
  const id = requestAnimationFrame(run);
  return () => cancelAnimationFrame(id);
};

/**
 * Pan and zoom input on the canvas element (V1, V4): wheel and Shift+wheel pan, Ctrl+wheel and
 * touchpad pinch zoom about the pointer, Space+drag and middle-drag pan. Pointer-move deltas are
 * summed and delivered once per frame; the reducer clamps the pan.
 */
export function useCanvasInput(canvas: RefObject<HTMLElement | null>, store: Store): void {
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const { dispatch } = store;

    // Wheel: native listener, because React's wheel handlers are passive and cannot prevent the
    // browser's own page zoom or scroll.
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      if (e.ctrlKey) {
        const rect = el.getBoundingClientRect();
        const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        dispatch({ type: 'zoom-wheel', deltaY: e.deltaY, anchor });
      } else if (e.shiftKey) {
        const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        dispatch({ type: 'pan-by', dx: -delta, dy: 0 });
      } else {
        dispatch({ type: 'pan-by', dx: -e.deltaX, dy: -e.deltaY });
      }
    };

    // Space held: the pointer pans.
    const onKeyDown = (e: KeyboardEvent): void => {
      // Only when the canvas itself has focus: Space on a chip or a button keeps its meaning.
      if (e.key !== ' ' || e.target !== el) return;
      e.preventDefault();
      dispatch({ type: 'set-space', held: true });
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === ' ') dispatch({ type: 'set-space', held: false });
    };
    const onBlur = (): void => dispatch({ type: 'set-space', held: false });

    // Drag: Space + primary button, or the middle button.
    const panDelta = createCoalescer<Point>(
      nextFrame,
      (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
      (d) => dispatch({ type: 'pan-by', dx: d.x, dy: d.y }),
    );
    let drag: { id: number; at: Point } | null = null;
    const onPointerDown = (e: PointerEvent): void => {
      const pans = e.button === 1 || (e.button === 0 && store.getState().spaceHeld);
      if (!pans) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, at: { x: e.clientX, y: e.clientY } };
      el.dataset['pan'] = '';
    };
    const onPointerMove = (e: PointerEvent): void => {
      if (drag?.id !== e.pointerId) return;
      panDelta.push({ x: e.clientX - drag.at.x, y: e.clientY - drag.at.y });
      drag.at = { x: e.clientX, y: e.clientY };
    };
    const endDrag = (e: PointerEvent): void => {
      if (drag?.id !== e.pointerId) return;
      panDelta.flush();
      drag = null;
      delete el.dataset['pan'];
    };
    // A middle press starts browser autoscroll unless the mouse-down is cancelled too.
    const onMouseDown = (e: MouseEvent): void => {
      if (e.button === 1) e.preventDefault();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('keyup', onKeyUp);
    el.addEventListener('blur', onBlur);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('mousedown', onMouseDown);
    return () => {
      panDelta.cancel();
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('keyup', onKeyUp);
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      el.removeEventListener('mousedown', onMouseDown);
    };
  }, [canvas, store]);
}

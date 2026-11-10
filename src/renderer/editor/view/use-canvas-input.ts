import { useEffect, type RefObject } from 'react';
import { current } from '@core/doc-model';
import { canvasEvent, type CanvasEvent, type MoveEvent } from '../model/canvas-event';
import { createCoalescer } from '../model/coalesce';
import type { Point } from '../model/geometry';
import type { EditorController } from '../state/controller';

/** Runs `run` on the next animation frame; returns the cancel function. */
const nextFrame = (run: () => void): (() => void) => {
  const id = requestAnimationFrame(run);
  return () => cancelAnimationFrame(id);
};

/**
 * Pan and zoom input on the canvas element (V1, V4): wheel and Shift+wheel pan, Ctrl+wheel and
 * touchpad pinch zoom about the pointer, Space+drag and middle-drag pan. Pointer-move deltas are
 * summed and delivered once per frame; the reducer clamps the pan. Otherwise a primary press
 * starts the active tool's gesture: the pointer is captured, moves are delivered once per frame
 * (latest wins; the release delivers the last one first), and a lost capture, a window blur or a
 * right press cancels it. Without a gesture, moves update the hover (HV1): one hit-test per frame.
 */
export function useCanvasInput(
  canvas: RefObject<HTMLElement | null>,
  controller: EditorController,
): void {
  const { store, derive } = controller;
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const { dispatch } = store;
    /** A pointer event's position in canvas px. */
    const canvasPx = (e: MouseEvent): Point => {
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

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
    const onBlur = (): void => {
      dispatch({ type: 'set-space', held: false });
      cancelGesture();
    };

    // Drag: Space + primary button, or the middle button.
    const panDelta = createCoalescer<Point>(
      nextFrame,
      (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
      (d) => dispatch({ type: 'pan-by', dx: d.x, dy: d.y }),
    );
    const hover = createCoalescer<MoveEvent>(
      nextFrame,
      (_pending, latest) => latest,
      (event) => dispatch({ type: 'hover-move', event }),
    );
    let drag: { id: number; at: Point } | null = null;
    /** A right press cancelled a gesture: the `contextmenu` that follows is part of that. */
    let menuSpent = false;
    /** The pointer that runs a tool gesture, while one does. */
    let gesture: number | null = null;
    const toEvent = (type: 'down' | 'move' | 'up', e: PointerEvent): CanvasEvent => {
      const state = store.getState();
      const rect = el.getBoundingClientRect();
      const bondLength = derive.committed(current(state.history)).scene.style.bondLength;
      return canvasEvent(type, e, { x: rect.left, y: rect.top }, state.viewport, bondLength);
    };
    const moves = createCoalescer<CanvasEvent>(
      nextFrame,
      (_pending, latest) => latest,
      (event) => dispatch({ type: 'pointer', event }),
    );
    const cancelGesture = (): void => {
      moves.cancel();
      gesture = null;
      if (store.getState().gesture !== null) {
        dispatch({ type: 'pointer', event: { type: 'cancel' } });
      }
    };
    const onPointerDown = (e: PointerEvent): void => {
      const pans = e.button === 1 || (e.button === 0 && store.getState().spaceHeld);
      if (pans) {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        drag = { id: e.pointerId, at: { x: e.clientX, y: e.clientY } };
        el.dataset['pan'] = '';
        return;
      }
      // Controls drawn over the canvas (the empty-state chips) keep their own clicks: capturing
      // the pointer would redirect the click to the canvas.
      if (e.target !== el) return;
      menuSpent = false;
      if (e.button === 2 && gesture !== null) {
        cancelGesture();
        menuSpent = true;
        return;
      }
      if (e.button !== 0) return;
      hover.cancel();
      dispatch({ type: 'pointer', event: toEvent('down', e) });
      if (store.getState().gesture !== null) {
        el.setPointerCapture(e.pointerId);
        gesture = e.pointerId;
      }
    };
    const onPointerMove = (e: PointerEvent): void => {
      controller.setPointer(canvasPx(e));
      if (gesture === e.pointerId) {
        moves.push(toEvent('move', e));
        return;
      }
      if (drag === null) {
        const ev = toEvent('move', e);
        if (ev.type === 'move') hover.push({ ...ev, type: 'move' });
        return;
      }
      if (drag.id !== e.pointerId) return;
      panDelta.push({ x: e.clientX - drag.at.x, y: e.clientY - drag.at.y });
      drag.at = { x: e.clientX, y: e.clientY };
    };
    const endDrag = (e: PointerEvent): void => {
      if (gesture === e.pointerId) {
        moves.flush();
        gesture = null;
        dispatch({ type: 'pointer', event: toEvent('up', e) });
        return;
      }
      if (drag?.id !== e.pointerId) return;
      panDelta.flush();
      drag = null;
      delete el.dataset['pan'];
    };
    const onPointerCancel = (e: PointerEvent): void => {
      if (gesture === e.pointerId) cancelGesture();
      else endDrag(e);
    };
    // A middle press starts browser autoscroll unless the mouse-down is cancelled too.
    const onPointerLeave = (): void => {
      controller.setPointer(null);
      hover.cancel();
      dispatch({ type: 'set-hover', hover: null });
    };
    // CM1: no menu is drawn. A gesture is cancelled; otherwise the host is told what is there.
    const onContextMenu = (e: MouseEvent): void => {
      e.preventDefault();
      if (menuSpent || gesture !== null) {
        menuSpent = false;
        cancelGesture();
        return;
      }
      controller.contextMenuAt(canvasPx(e));
    };
    // R2, S7: the double-click is the reducer's to interpret (Select opens the label editor).
    const onDoubleClick = (e: MouseEvent): void => {
      if (e.target !== el || e.button !== 0) return;
      const down = toEvent('down', e as PointerEvent);
      if (down.type === 'down') {
        dispatch({ type: 'pointer', event: { type: 'dblclick', p: down.p, screen: down.screen } });
      }
    };
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
    el.addEventListener('pointercancel', onPointerCancel);
    el.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('dblclick', onDoubleClick);
    return () => {
      panDelta.cancel();
      hover.cancel();
      moves.cancel();
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('keyup', onKeyUp);
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', onPointerCancel);
      el.removeEventListener('pointerleave', onPointerLeave);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('dblclick', onDoubleClick);
    };
  }, [canvas, controller, store, derive]);
}

// A rig for the tool tests: runs one tool as the reducer does, committing each step in a history.
import { perceive } from '@core/chem-core';
import { createHistory, current, emptyDoc, transact, type AtomId, type Doc } from '@core/doc-model';
import { render } from '@core/svg-render';
import type { CanvasEvent, MoveEvent } from '../model/canvas-event';
import type { Point } from '../model/geometry';
import { hitTest, hoverFilter } from '../model/hit-test';
import { bluToScreen, screenToBlu, type Viewport } from '../model/viewport';
import { EMPTY_SELECTION, type GestureState, type Hit, type Preview } from '../state/editor-state';
import type { Tool, ToolContext, ToolStep } from './tool';

export const NOW = '2026-01-01T00:00:00.000Z';
export const BL = 40;
/** One bond is 80 screen px at this viewport. */
export const BOND_PX = 80;
export const viewport: Viewport = { zoom: 1.5, pan: { x: 400, y: 300 }, size: { w: 1200, h: 700 } };
export const NONE = { shift: false, alt: false, ctrl: false };
export const SHIFT = { shift: true, alt: false, ctrl: false };

export const screenOf = (p: Point): Point => bluToScreen(viewport, p, BL);

export interface Rig {
  tool: Tool;
  doc: Doc;
  variant: string;
  gesture: GestureState | null;
  preview: Preview | null;
  commits: { label: string; doc: Doc }[];
}

export const rig = (tool: Tool, doc: Doc = emptyDoc(NOW), variant = ''): Rig => ({
  tool,
  doc,
  variant,
  gesture: null,
  preview: null,
  commits: [],
});

export function context(r: Rig, hit: Hit | null): ToolContext {
  return {
    doc: r.doc,
    scene: render(r.doc),
    perception: perceive(r.doc),
    selection: EMPTY_SELECTION,
    viewport,
    hit,
    variant: r.variant,
  };
}

/** Sends an event as the reducer does: a press looks its hit up; each commit is applied. */
export function send(r: Rig, ev: CanvasEvent): ToolStep {
  const scene = render(r.doc);
  const hit =
    ev.type === 'down' ? hitTest(r.doc, scene, viewport, ev.screen, hoverFilter('bond')) : null;
  const step = r.tool.step(r.gesture, ev, context(r, hit));
  r.gesture = step.gesture;
  if (step.preview !== undefined) r.preview = step.preview;
  if (step.commit !== undefined) {
    const h = transact(
      createHistory(r.doc, { clock: () => NOW }),
      step.commit.label,
      step.commit.recipe,
    );
    r.commits.push({ label: step.commit.label, doc: current(h) });
    r.doc = current(h);
  }
  return step;
}

export const at = (
  screen: Point,
  type: 'down' | 'move' | 'up',
  mods = NONE,
  button: 0 | 1 | 2 = 0,
): CanvasEvent => ({ type, p: screenToBlu(viewport, screen, BL), screen, button, mods });

export const moveAt = (screen: Point): MoveEvent => at(screen, 'move') as unknown as MoveEvent;

export function click(r: Rig, screen: Point, mods = NONE): void {
  send(r, at(screen, 'down', mods));
  send(r, at(screen, 'up', mods));
}

/** Press at `from`, move to `to` in two steps, release. Returns the preview seen before release. */
export function drag(r: Rig, from: Point, to: Point, mods = NONE): Preview | null {
  send(r, at(from, 'down', mods));
  send(r, at({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, 'move', mods));
  send(r, at(to, 'move', mods));
  const seen = r.preview;
  send(r, at(to, 'up', mods));
  return seen;
}

export const atomsOf = (d: Doc): AtomId[] => Object.keys(d.atoms) as AtomId[];
export const screenPos = (d: Doc, id: AtomId): Point =>
  screenOf({ x: d.atoms[id]?.x ?? NaN, y: d.atoms[id]?.y ?? NaN });
export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

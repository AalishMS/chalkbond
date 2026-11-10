// The shape of a tool: a pure state machine over canvas events (SPEC-editor.md "Tools and
// gestures"). A tool never touches the store; the reducer applies the step it returns.
import type { Perception } from '@core/chem-core';
import type { Doc, Selection } from '@core/doc-model';
import type { Scene } from '@core/svg-render';
import type { CanvasEvent } from '../model/canvas-event';
import type { Viewport } from '../model/viewport';
import type { GestureState, Hit, Preview, ToolId } from '../state/editor-state';

/** A press that moves less than this many screen px is a click (SPEC "Tools and gestures"). */
export const DRAG_PX = 4;

/** What a tool sees of the editor on each event. */
export interface ToolContext {
  readonly doc: Doc;
  readonly scene: Scene;
  readonly perception: Perception;
  readonly selection: Selection;
  readonly viewport: Viewport;
  /** What is under the pointer on a `down` event (handles first, once E17 adds them); else null. */
  readonly hit: Hit | null;
}

/** One document change, committed once on release: one `transact`, one undo step. */
export interface ToolCommit {
  readonly label: string;
  readonly recipe: (doc: Doc) => Doc;
  readonly selection?: Selection | 'inserted';
  readonly coalesceKey?: string;
}

export interface ToolStep {
  /** The machine's next state; null = idle. */
  readonly gesture: GestureState | null;
  /** undefined = unchanged. A preview never enters history. */
  readonly preview?: Preview | null;
  readonly commit?: ToolCommit;
  /** The selection after the step (not undoable); undefined = unchanged. */
  readonly selection?: Selection;
}

export interface Tool {
  readonly id: ToolId;
  step(gesture: GestureState | null, ev: CanvasEvent, ctx: ToolContext): ToolStep;
}

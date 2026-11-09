import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import type { Doc } from './types';

enablePatches();

/** Maximum number of undo steps kept; the oldest are dropped. */
export const HISTORY_DEPTH = 500;

interface Step {
  readonly label: string;
  readonly patches: readonly Patch[];
  readonly inverse: readonly Patch[];
}

/** Immutable undo/redo history around a document. Treat as opaque. */
export interface History {
  readonly doc: Doc;
  readonly past: readonly Step[];
  readonly future: readonly Step[];
  /** Key of the last transact if it can still be coalesced into; cleared by undo/redo. */
  readonly openKey: string | undefined;
  readonly clock: () => string;
}

export interface CreateHistoryOptions {
  /** Source of ISO 8601 timestamps for `meta.modified`. Default: the system clock. */
  readonly clock?: () => string;
}

export interface TransactOptions {
  /** Consecutive transactions with the same key merge into one undo step (e.g. a drag). */
  readonly coalesceKey?: string;
}

export function createHistory(doc: Doc, opts: CreateHistoryOptions = {}): History {
  return freeze({
    doc,
    past: [],
    future: [],
    openKey: undefined,
    clock: opts.clock ?? (() => new Date().toISOString()),
  });
}

/**
 * Applies `recipe` as one undoable step labelled `label` and stamps `meta.modified`.
 * The recipe receives a draft; doc-model ops called on it mutate it in place (see
 * SPEC-doc-model.md). A recipe that changes nothing records no step. Errors thrown by the
 * recipe propagate and leave the history unchanged.
 */
export function transact(
  h: History,
  label: string,
  recipe: (doc: Doc) => Doc,
  opts: TransactOptions = {},
): History {
  const now = h.clock();
  // The timestamp is written in the same producer, so data change + meta.modified are one step.
  const [doc, patches, inverse] = produceWithPatches(h.doc, (draft) => {
    const result = recipe(draft as Doc);
    if (result === (draft as Doc)) {
      draft.meta.modified = now;
      return undefined;
    }
    return { ...result, meta: { ...result.meta, modified: now } } as typeof draft;
  });
  if (!patches.some((p) => !isModifiedStamp(p))) return h;

  const key = opts.coalesceKey;
  const top = h.past[h.past.length - 1];
  if (key !== undefined && h.openKey === key && top) {
    const merged: Step = {
      label: top.label,
      patches: [...top.patches, ...patches],
      inverse: [...inverse, ...top.inverse],
    };
    return freeze({ ...h, doc, past: [...h.past.slice(0, -1), merged], future: [], openKey: key });
  }

  const past = [...h.past, { label, patches, inverse }];
  return freeze({
    ...h,
    doc,
    past: past.length > HISTORY_DEPTH ? past.slice(past.length - HISTORY_DEPTH) : past,
    future: [],
    openKey: key,
  });
}

export function undo(h: History): History {
  const step = h.past[h.past.length - 1];
  if (!step) return h;
  return freeze({
    ...h,
    doc: applyPatches(h.doc, step.inverse as Patch[]),
    past: h.past.slice(0, -1),
    future: [step, ...h.future],
    openKey: undefined,
  });
}

export function redo(h: History): History {
  const step = h.future[0];
  if (!step) return h;
  return freeze({
    ...h,
    doc: applyPatches(h.doc, step.patches as Patch[]),
    past: [...h.past, step],
    future: h.future.slice(1),
    openKey: undefined,
  });
}

export function current(h: History): Doc {
  return h.doc;
}

export function canUndo(h: History): boolean {
  return h.past.length > 0;
}

export function canRedo(h: History): boolean {
  return h.future.length > 0;
}

export function undoLabel(h: History): string | undefined {
  return h.past[h.past.length - 1]?.label;
}

export function redoLabel(h: History): string | undefined {
  return h.future[0]?.label;
}

function isModifiedStamp(p: Patch): boolean {
  return p.path.length === 2 && p.path[0] === 'meta' && p.path[1] === 'modified';
}

function freeze(h: History): History {
  return Object.freeze(h);
}

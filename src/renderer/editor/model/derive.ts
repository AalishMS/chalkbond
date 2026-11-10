// Perception and scene of a document, with last-one caches (SPEC-editor.md "State model").
import { createPerceiver, type Perception } from '@core/chem-core';
import type { Doc } from '@core/doc-model';
import { render, type Scene } from '@core/svg-render';

export interface Derived {
  readonly doc: Doc;
  readonly perception: Perception;
  readonly scene: Scene;
}

export interface Derive {
  /** The committed document. One-entry cache keyed by object identity. */
  committed(doc: Doc): Derived;
  /** The preview document (ghost parts, drag frames). Its own one-entry cache. */
  preview(doc: Doc): Derived;
}

/**
 * One deriver per controller: it owns one perceiver (shared by both caches, so a preview of one
 * more atom re-perceives only the fragment it touches) and a one-entry cache each for the
 * committed document and the preview. The same document object gives the same `Derived`.
 */
export function createDerive(): Derive {
  const perceive = createPerceiver();
  const cached = (): ((doc: Doc) => Derived) => {
    let last: Derived | null = null;
    return (doc) => {
      if (last === null || last.doc !== doc) {
        const perception = perceive(doc);
        last = { doc, perception, scene: render(doc, { perception }) };
      }
      return last;
    };
  };
  return { committed: cached(), preview: cached() };
}

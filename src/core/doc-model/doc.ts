import type { Doc } from './types';

/** A new, empty document. `now` is an ISO 8601 timestamp (injected to keep this pure). */
export function emptyDoc(now: string): Doc {
  return {
    schemaVersion: 1,
    atoms: {},
    bonds: {},
    objects: {},
    zOrder: [],
    groups: {},
    nextId: 1,
    style: { preset: 'slides', overrides: {} },
    meta: { created: now, modified: now },
  };
}

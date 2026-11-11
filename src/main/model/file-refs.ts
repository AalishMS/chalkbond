// File refs (SPEC-app-shell.md "Process split and IPC", R8): the renderer holds only opaque refs;
// main keeps `id → { path, kind, writable }` for the session. Pure: the id source is injected.
import type { FileRef } from '../../shared/ipc-types';

export type FileKind = FileRef['kind'];

/** What main keeps for a ref. Never sent to the renderer. */
export interface FileEntry {
  readonly path: string;
  readonly kind: FileKind;
  readonly writable: boolean;
}

/** The Open kinds (F2), PDF included under clipboard-export PDF-A. */
export const OPEN_KINDS: readonly FileKind[] = ['chalk', 'png', 'svg', 'pdf'];

/** The last path segment after `/` or `\`. */
export function baseName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
}

/** The Open kind of a path by its extension, any case; null for any other name. */
export function kindOfPath(path: string): FileKind | null {
  const name = baseName(path).toLowerCase();
  return OPEN_KINDS.find((kind) => name.endsWith(`.${kind}`)) ?? null;
}

/** R6: the format's extension is appended when the chosen name lacks it (any case). */
export function withExtension(path: string, format: FileKind): string {
  return baseName(path).toLowerCase().endsWith(`.${format}`) ? path : `${path}.${format}`;
}

/**
 * The registry. Writable rule: Save-dialog refs (`saved`) are writable for their kind; opened
 * `.chalk` refs are writable (Save in place); opened pictures are read-only (A6).
 */
export function createFileRefs(newId: () => string) {
  const entries = new Map<string, FileEntry>();
  return {
    add(path: string, kind: FileKind, how: 'opened' | 'saved'): FileRef {
      const id = newId();
      entries.set(id, { path, kind, writable: how === 'saved' || kind === 'chalk' });
      return { id, name: baseName(path), kind };
    },
    get(id: string): FileEntry | undefined {
      return entries.get(id);
    },
  };
}
export type FileRefs = ReturnType<typeof createFileRefs>;

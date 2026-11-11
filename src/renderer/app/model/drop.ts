// F12 drag and drop (SPEC-app-shell.md F12, R22, "Drop overlay"): which drags count, which dropped
// file goes to I3, and when the overlay shows. DOM-free; `drop-target.ts` wires the events.

/** The Open extensions (F2), `.pdf` under clipboard-export PDF-A. */
const OPEN_NAME = /\.(chalk|png|svg|pdf)$/i;

/** A drag carrying files; text drags are left to the editor. */
export function hasFiles(types: readonly string[]): boolean {
  return types.includes('Files');
}

/** The first file with an Open extension, else the first file (I3 answers `unsupported`). */
export function pickDropped<T extends { readonly name: string }>(files: readonly T[]): T | null {
  return files.find((file) => OPEN_NAME.test(file.name)) ?? files[0] ?? null;
}

/**
 * The overlay's visibility: shown from a Files `dragenter` until the window's last `dragleave`, a
 * drop or Esc; never while an in-window dialog is open (R22). Enter and leave events of child
 * elements are counted, so moving across the page does not flicker.
 */
export function createDropTracker() {
  let depth = 0;
  let shown = false;
  const listeners = new Set<() => void>();
  const set = (next: boolean): void => {
    if (next === shown) return;
    shown = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    enter(types: readonly string[], modal: boolean): void {
      if (!hasFiles(types)) return;
      depth++;
      set(!modal);
    },
    leave(types: readonly string[]): void {
      if (!hasFiles(types)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) set(false);
    },
    drop(): void {
      depth = 0;
      set(false);
    },
    escape(): void {
      depth = 0;
      set(false);
    },
    visible: (): boolean => shown,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export type DropTracker = ReturnType<typeof createDropTracker>;

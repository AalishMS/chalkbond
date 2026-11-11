// N2 and the dialog folders (SPEC-app-shell.md F2, F6, A6): main keeps the session file the
// renderer named by ref, the last open folder and the last save folder for this run (A10 persists
// them). Pure: Documents is injected; paths never leave main.
import type { FileEntry, FileKind } from './file-refs';

/** Everything before the last `/` or `\` (`/` for a root file, '' for a bare name). */
export function folderOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut === 0 ? path.slice(0, 1) : path.slice(0, Math.max(cut, 0));
}

export function createSessionFolders(documents: () => string) {
  let open: string | null = null;
  let save: string | null = null;
  let current: FileEntry | null = null;
  return {
    /** N2: the session's file (null after New); an opened ref sets the open folder, a saved one the save folder. */
    sessionFile(entry: FileEntry | null): void {
      current = entry;
      if (entry === null) return;
      if (entry.how === 'opened') open = folderOf(entry.path);
      else save = folderOf(entry.path);
    },
    /** F2: the last open folder, else Documents. */
    openFolder(): string {
      return open ?? documents();
    },
    /** F6: a picture session's Save as starts in the picture's folder (A6); else the last save folder, else Documents. */
    saveFolder(format: FileKind): string {
      if (format === 'chalk' && current !== null && current.kind !== 'chalk') {
        return folderOf(current.path);
      }
      return save ?? documents();
    },
  };
}
export type SessionFolders = ReturnType<typeof createSessionFolders>;

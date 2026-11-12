// N2 and the dialog folders (SPEC-app-shell.md F2, F6, A6, ST2): main keeps the session file the
// renderer named by ref, the last open, save and export folders. A10: they start from settings and
// every change is reported for settings.json. Pure: Documents is injected; paths never leave main.
import type { FileEntry, FileKind } from './file-refs';
import type { Folders } from './settings';

/** Everything before the last `/` or `\` (`/` for a root file, '' for a bare name). */
export function folderOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut === 0 ? path.slice(0, 1) : path.slice(0, Math.max(cut, 0));
}

export function createSessionFolders(
  documents: () => string,
  initial: Folders = { open: null, save: null, export: null },
  changed: (folders: Folders) => void = () => undefined,
) {
  const folders: Folders = { ...initial };
  let current: FileEntry | null = null;
  const set = (key: keyof Folders, path: string): void => {
    const folder = folderOf(path);
    if (folders[key] === folder) return;
    folders[key] = folder;
    changed({ ...folders });
  };
  return {
    /** N2: the session's file (null after New); an opened ref sets the open folder, a saved one the save folder. */
    sessionFile(entry: FileEntry | null): void {
      current = entry;
      if (entry === null) return;
      set(entry.how === 'opened' ? 'open' : 'save', entry.path);
    },
    /** ST2: the file chosen in an Export Save dialog sets the export folder. */
    exported(entry: FileEntry): void {
      set('export', entry.path);
    },
    /** F2: the last open folder, else Documents. */
    openFolder(): string {
      return folders.open ?? documents();
    },
    /**
     * F6: a picture session's Save as starts in the picture's folder (A6); else the last save
     * folder, else Documents. ST2: Export (png, svg, pdf) starts in the export folder, else the
     * last save folder, else Documents.
     */
    saveFolder(format: FileKind): string {
      if (format !== 'chalk') return folders.export ?? folders.save ?? documents();
      if (current !== null && current.kind !== 'chalk') return folderOf(current.path);
      return folders.save ?? documents();
    },
    /**
     * F6 with tabs (2026-11-12; TB20): Save as of the active tab starts in a picture tab's picture
     * folder (A6), a kept tab's former file's folder if it still exists, else the last save folder,
     * else Documents. `active` is the active tab's binding in main (null: none).
     */
    tabSaveFolder(
      active: {
        readonly kind: 'chalk' | 'picture' | 'former';
        readonly path: string;
        readonly folderExists: boolean;
      } | null,
    ): string {
      if (active?.kind === 'picture') return folderOf(active.path);
      if (active?.kind === 'former' && active.folderExists) return folderOf(active.path);
      return folders.save ?? documents();
    },
  };
}
export type SessionFolders = ReturnType<typeof createSessionFolders>;

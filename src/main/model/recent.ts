// F10 recent files (SPEC-app-shell.md F10, R21): at most 8 paths, newest first. Duplicates (any
// case on Windows) move to the top; two entries with the same base name show their parent folder.
// Pure: paths never leave main; the menu captures each entry's path when it is built.
import { MAX_RECENT } from './settings';
import { baseName } from './file-refs';
import { folderOf } from './session-folders';

/** A menu entry: the label before `&n` and `&` doubling, and the path its click opens. */
export interface RecentEntry {
  readonly label: string;
  readonly path: string;
}

const keyOf = (path: string, caseInsensitive: boolean): string =>
  caseInsensitive ? path.toLowerCase() : path;

/** `path` first; an existing entry for the same file is dropped; at most 8. */
export function addRecent(
  list: readonly string[],
  path: string,
  caseInsensitive: boolean,
): string[] {
  const key = keyOf(path, caseInsensitive);
  return [path, ...list.filter((p) => keyOf(p, caseInsensitive) !== key)].slice(0, MAX_RECENT);
}

export function removeRecent(
  list: readonly string[],
  path: string,
  caseInsensitive: boolean,
): string[] {
  const key = keyOf(path, caseInsensitive);
  return list.filter((p) => keyOf(p, caseInsensitive) !== key);
}

/** The base name; ` — <parent folder name>` when another entry has the same base name (A04). */
export function recentLabels(list: readonly string[], caseInsensitive: boolean): string[] {
  const names = list.map((path) => baseName(path));
  const keys = names.map((name) => keyOf(name, caseInsensitive));
  return list.map((path, i) => {
    const name = names[i] ?? '';
    if (keys.filter((k) => k === keys[i]).length < 2) return name;
    const folder = folderOf(path);
    return `${name} — ${baseName(folder) || folder}`;
  });
}

export interface RecentOptions {
  /** settings.json's list (already parsed: deduped and capped once more here). */
  initial: readonly string[];
  /** Windows file names ignore case. */
  caseInsensitive: boolean;
  /** Every change, for settings.json and the menu. */
  changed?: (list: readonly string[]) => void;
}

export function createRecent(o: RecentOptions) {
  let list: readonly string[] = o.initial.reduceRight<string[]>(
    (acc, path) => addRecent(acc, path, o.caseInsensitive),
    [],
  );
  const set = (next: string[]): void => {
    if (next.length === list.length && next.every((p, i) => p === list[i])) return;
    list = next;
    o.changed?.([...list]);
  };
  return {
    /** A successful open or save (F10). */
    add: (path: string): void => set(addRecent(list, path, o.caseInsensitive)),
    /** A missing file (I2 `missing`). */
    remove: (path: string): void => set(removeRecent(list, path, o.caseInsensitive)),
    /** File > Open recent > Clear. */
    clear: (): void => set([]),
    list: (): string[] => [...list],
    /** Fresh label/path pairs for the menu. */
    entries: (): RecentEntry[] => {
      const labels = recentLabels(list, o.caseInsensitive);
      return list.map((path, i) => ({ label: labels[i] ?? '', path }));
    },
  };
}
export type Recent = ReturnType<typeof createRecent>;

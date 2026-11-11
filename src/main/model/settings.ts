// Settings (SPEC-app-shell.md "Settings (no UI)", ST1, ST2): the pure model of `settings.json`.
// Lenient parse: unknown keys are dropped and each invalid field is replaced by its default on its
// own; a file that is not a JSON object is replaced by the defaults. `settings-io.ts` reads and
// writes the file; the renderer only ever sees `rendererSettings` (no path, folder or window).
import type { RendererSettings } from '../../shared/ipc-types';

export interface StoredWindow {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface Folders {
  open: string | null;
  save: string | null;
  export: string | null;
}

export interface Settings {
  version: 1;
  newDrawingStyle: RendererSettings['newDrawingStyle'];
  export: RendererSettings['export'];
  window: StoredWindow | null;
  /** At most 8 absolute paths, newest first (F10, A15). */
  recent: string[];
  folders: Folders;
}

/** `null`: the file was valid as written (or missing); otherwise why it must be rewritten. */
export type SettingsProblem = 'broken' | 'repaired' | null;

export const MAX_RECENT = 8;
const MAX_PATH = 4096;

export function defaultSettings(): Settings {
  return {
    version: 1,
    newDrawingStyle: 'slides',
    export: { format: 'png', pngDpi: 300, pngWhite: false },
    window: null,
    recent: [],
    folders: { open: null, save: null, export: null },
  };
}

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T>(v: unknown, values: readonly T[], fallback: T): T =>
  values.includes(v as T) ? (v as T) : fallback;
const isPath = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= MAX_PATH;
const pathOrNull = (v: unknown): string | null => (isPath(v) ? v : null);

function windowOf(v: unknown): StoredWindow | null {
  if (!isPlain(v)) return null;
  const { x, y, width, height, maximized } = v;
  const finite = [x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n));
  if (!finite || typeof maximized !== 'boolean') return null;
  if ((width as number) <= 0 || (height as number) <= 0) return null;
  return { x, y, width, height, maximized } as StoredWindow;
}

function recentOf(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter(isPath))].slice(0, MAX_RECENT);
}

/** The settings in `text` (null: no file) and whether the file must be rewritten. */
export function parseSettings(text: string | null): {
  settings: Settings;
  problem: SettingsProblem;
} {
  const defaults = defaultSettings();
  if (text === null) return { settings: defaults, problem: null };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { settings: defaults, problem: 'broken' };
  }
  if (!isPlain(raw)) return { settings: defaults, problem: 'broken' };
  const exp = isPlain(raw['export']) ? raw['export'] : {};
  const folders = isPlain(raw['folders']) ? raw['folders'] : {};
  const settings: Settings = {
    version: 1,
    newDrawingStyle: oneOf(raw['newDrawingStyle'], ['slides', 'journal'], 'slides'),
    export: {
      format: oneOf(exp['format'], ['png', 'svg', 'pdf'], 'png'),
      pngDpi: oneOf(exp['pngDpi'], [150, 300, 600], 300),
      pngWhite: typeof exp['pngWhite'] === 'boolean' ? exp['pngWhite'] : false,
    },
    window: windowOf(raw['window']),
    recent: recentOf(raw['recent']),
    folders: {
      open: pathOrNull(folders['open']),
      save: pathOrNull(folders['save']),
      export: pathOrNull(folders['export']),
    },
  };
  // Any repair or dropped key shows as a difference from the canonical form of what was read.
  const same = canonical(raw) === canonical(settings);
  return { settings, problem: same ? null : 'repaired' };
}

/** JSON with object keys sorted, so key order alone never counts as a repair. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    isPlain(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  );
}

export function serializeSettings(settings: Settings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/** ST2: what the renderer may see. A fresh copy. */
export function rendererSettings(settings: Settings): RendererSettings {
  return { newDrawingStyle: settings.newDrawingStyle, export: { ...settings.export } };
}

/** I8: a validated renderer change applied; every main-only field is kept. */
export function withRendererSettings(
  settings: Settings,
  change: Partial<RendererSettings>,
): Settings {
  return {
    ...settings,
    ...(change.newDrawingStyle !== undefined ? { newDrawingStyle: change.newDrawingStyle } : {}),
    ...(change.export !== undefined ? { export: { ...change.export } } : {}),
  };
}

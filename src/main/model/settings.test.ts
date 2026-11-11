// ST1, ST2 and the lenient parse of settings.json (SPEC-app-shell.md "Settings (no UI)").
import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  parseSettings,
  rendererSettings,
  serializeSettings,
  withRendererSettings,
  type Settings,
} from './settings';

const FULL: Settings = {
  version: 1,
  newDrawingStyle: 'journal',
  export: { format: 'svg', pngDpi: 600, pngWhite: true },
  window: { x: 100, y: 80, width: 1100, height: 760, maximized: true },
  recent: ['C:\\Lessons\\a.chalk', 'C:\\Lessons\\b.chalk'],
  folders: { open: 'C:\\Open', save: 'C:\\Save', export: 'C:\\Export' },
};

describe('defaults', () => {
  it('is the first-run settings of the spec', () => {
    expect(defaultSettings()).toEqual({
      version: 1,
      newDrawingStyle: 'slides',
      export: { format: 'png', pngDpi: 300, pngWhite: false },
      window: null,
      recent: [],
      folders: { open: null, save: null, export: null },
    });
  });

  it('a missing file is the defaults and needs no rewrite', () => {
    expect(parseSettings(null)).toEqual({ settings: defaultSettings(), problem: null });
  });

  it('returns a fresh object every time', () => {
    const a = defaultSettings();
    a.folders.open = 'x';
    a.recent.push('y');
    expect(defaultSettings().folders.open).toBeNull();
    expect(defaultSettings().recent).toEqual([]);
  });
});

describe('parseSettings', () => {
  it('round-trips a valid file unchanged', () => {
    expect(parseSettings(serializeSettings(FULL))).toEqual({ settings: FULL, problem: null });
  });

  it('broken JSON, a non-object or an array gives the defaults, marked broken', () => {
    for (const text of ['', '{', 'not json', '[]', '"x"', '42', 'null', '{"version":1']) {
      expect(parseSettings(text)).toEqual({ settings: defaultSettings(), problem: 'broken' });
    }
  });

  it('replaces each invalid field alone with its default', () => {
    const cases: [Record<string, unknown>, (s: Settings) => void][] = [
      [{ version: 2 }, (s) => (s.version = 1)],
      [{ newDrawingStyle: 'poster' }, (s) => (s.newDrawingStyle = 'slides')],
      [{ export: { ...FULL.export, format: 'jpg' } }, (s) => (s.export.format = 'png')],
      [{ export: { ...FULL.export, pngDpi: 72 } }, (s) => (s.export.pngDpi = 300)],
      [{ export: { ...FULL.export, pngWhite: 'yes' } }, (s) => (s.export.pngWhite = false)],
      [{ export: 'png' }, (s) => (s.export = { format: 'png', pngDpi: 300, pngWhite: false })],
      [{ window: { ...FULL.window, x: 'left' } }, (s) => (s.window = null)],
      [{ window: { ...FULL.window, width: 0 } }, (s) => (s.window = null)],
      [{ window: { ...FULL.window, height: -5 } }, (s) => (s.window = null)],
      [{ window: { ...FULL.window, maximized: 1 } }, (s) => (s.window = null)],
      [{ window: [] }, (s) => (s.window = null)],
      [{ recent: 'C:\\a.chalk' }, (s) => (s.recent = [])],
      [{ recent: ['C:\\a.chalk', 3, '', 'C:\\a.chalk'] }, (s) => (s.recent = ['C:\\a.chalk'])],
      [{ folders: { ...FULL.folders, open: 7 } }, (s) => (s.folders.open = null)],
      [{ folders: { ...FULL.folders, save: '' } }, (s) => (s.folders.save = null)],
      [{ folders: { ...FULL.folders, export: ['x'] } }, (s) => (s.folders.export = null)],
      [{ folders: null }, (s) => (s.folders = { open: null, save: null, export: null })],
    ];
    for (const [patch, fix] of cases) {
      const expected = structuredClone(FULL);
      fix(expected);
      const result = parseSettings(JSON.stringify({ ...FULL, ...patch }));
      expect(result.settings, JSON.stringify(patch)).toEqual(expected);
      expect(result.problem).toBe('repaired');
    }
  });

  it('a missing field is its default', () => {
    const { newDrawingStyle: _style, ...rest } = FULL;
    expect(parseSettings(JSON.stringify(rest)).settings).toEqual({
      ...FULL,
      newDrawingStyle: 'slides',
    });
  });

  it('drops unknown keys at every level', () => {
    const text = JSON.stringify({
      ...FULL,
      theme: 'dark',
      export: { ...FULL.export, jpegQuality: 9 },
      window: { ...FULL.window, display: 2 },
      folders: { ...FULL.folders, fonts: 'C:\\F' },
    });
    const result = parseSettings(text);
    expect(result.settings).toEqual(FULL);
    expect(result.problem).toBe('repaired');
    expect(serializeSettings(result.settings)).not.toMatch(/theme|jpegQuality|display|fonts/);
  });

  it('keeps at most 8 recent paths, in order', () => {
    const recent = Array.from({ length: 11 }, (_, i) => `C:\\r${i}.chalk`);
    expect(parseSettings(JSON.stringify({ ...FULL, recent })).settings.recent).toEqual(
      recent.slice(0, 8),
    );
  });

  it('rejects non-finite window numbers', () => {
    const text = serializeSettings(FULL).replace('"x": 100', '"x": 1e999');
    expect(parseSettings(text).settings.window).toBeNull();
  });
});

describe('the renderer view (ST2)', () => {
  it('carries no path, folder, window or recent list', () => {
    const view = rendererSettings(FULL);
    expect(view).toEqual({ newDrawingStyle: 'journal', export: FULL.export });
    expect(Object.keys(view).sort()).toEqual(['export', 'newDrawingStyle']);
    expect(JSON.stringify(view)).not.toMatch(/Lessons|Open|Save|Export|1100/);
  });

  it('is a copy: changing it does not change the settings', () => {
    const settings = structuredClone(FULL);
    const view = rendererSettings(settings);
    view.export.pngWhite = false;
    expect(settings.export.pngWhite).toBe(true);
  });

  it('applies a renderer change (I8) and leaves every main field', () => {
    const next = withRendererSettings(FULL, { newDrawingStyle: 'slides' });
    expect(next).toEqual({ ...FULL, newDrawingStyle: 'slides' });
    const exported = withRendererSettings(FULL, {
      export: { format: 'pdf', pngDpi: 150, pngWhite: false },
    });
    expect(exported).toEqual({ ...FULL, export: { format: 'pdf', pngDpi: 150, pngWhite: false } });
    expect(FULL.newDrawingStyle).toBe('journal');
  });
});

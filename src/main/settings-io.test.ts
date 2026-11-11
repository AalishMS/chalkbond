// settings-io (SPEC-app-shell.md "Settings (no UI)"): read once, atomic write 500 ms after the
// last change, a broken file replaced by valid defaults (logged), flush before quit. Real temp folder.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings, parseSettings, type Settings } from './model/settings';
import { createSettingsStore, SETTINGS_DELAY_MS } from './settings-io';

let dir = '';
let file = '';
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-settings-'));
  file = join(dir, 'settings.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A manual timer: `fire()` runs the scheduled write. */
function timers() {
  const queue: { fn: () => void; ms: number; live: boolean }[] = [];
  return {
    setTimer: (fn: () => void, ms: number) => {
      const t = { fn, ms, live: true };
      queue.push(t);
      return () => {
        t.live = false;
      };
    },
    live: () => queue.filter((t) => t.live),
    fire() {
      const due = queue.filter((t) => t.live);
      for (const t of due) t.live = false;
      for (const t of due) t.fn();
    },
  };
}

function store(log: string[] = [], clock = timers()) {
  return {
    clock,
    log,
    s: createSettingsStore({ file, log: (m) => log.push(m), setTimer: clock.setTimer }),
  };
}
const onDisk = (): Settings => parseSettings(readFileSync(file, 'utf8')).settings;
const journal = (s: Settings): Settings => ({ ...s, newDrawingStyle: 'journal' });

describe('load', () => {
  it('no file: defaults, nothing written, nothing logged', async () => {
    const { s, log } = store();
    expect(await s.load()).toEqual(defaultSettings());
    expect(existsSync(file)).toBe(false);
    expect(log).toEqual([]);
  });

  it('a valid file is read as is and not rewritten', async () => {
    const text = JSON.stringify({ ...defaultSettings(), newDrawingStyle: 'journal' });
    writeFileSync(file, text);
    const { s } = store();
    expect((await s.load()).newDrawingStyle).toBe('journal');
    expect(readFileSync(file, 'utf8')).toBe(text);
  });

  it('a broken file: defaults, logged, and the file rewritten valid at once', async () => {
    writeFileSync(file, '{"version":1, garbage');
    const { s, log } = store();
    expect(await s.load()).toEqual(defaultSettings());
    expect(log.join('\n')).toMatch(/broken/i);
    expect(parseSettings(readFileSync(file, 'utf8'))).toEqual({
      settings: defaultSettings(),
      problem: null,
    });
  });

  it('a repaired file (an invalid field, an unknown key) is logged and rewritten valid', async () => {
    writeFileSync(file, JSON.stringify({ ...defaultSettings(), newDrawingStyle: 'x', theme: 1 }));
    const { s, log } = store();
    expect(await s.load()).toEqual(defaultSettings());
    expect(log.join('\n')).toMatch(/repaired/i);
    expect(readFileSync(file, 'utf8')).not.toMatch(/theme/);
    expect(parseSettings(readFileSync(file, 'utf8')).problem).toBeNull();
  });

  it('an unreadable path (a folder) gives defaults and is logged', async () => {
    rmSync(dir, { recursive: true, force: true });
    const folder = join(dir, 'settings.json');
    mkdirSync(folder, { recursive: true });
    const { s, log } = store();
    expect(await s.load()).toEqual(defaultSettings());
    expect(log.length).toBeGreaterThan(0);
  });
});

describe('update and the 500 ms debounce', () => {
  it('writes only after the delay, once for several changes, the latest value', async () => {
    const { s, clock } = store();
    await s.load();
    s.update(journal);
    s.update((v) => ({ ...v, export: { ...v.export, pngDpi: 600 } }));
    expect(s.get().newDrawingStyle).toBe('journal');
    expect(existsSync(file)).toBe(false);
    expect(clock.live()).toHaveLength(1);
    expect(clock.live()[0]?.ms).toBe(SETTINGS_DELAY_MS);
    expect(SETTINGS_DELAY_MS).toBe(500);
    clock.fire();
    await s.flush();
    expect(onDisk().newDrawingStyle).toBe('journal');
    expect(onDisk().export.pngDpi).toBe(600);
    expect(s.pending()).toBe(false);
  });

  it('flush writes a pending change at once and cancels the timer', async () => {
    const { s, clock } = store();
    await s.load();
    s.update(journal);
    expect(s.pending()).toBe(true);
    await s.flush();
    expect(onDisk().newDrawingStyle).toBe('journal');
    expect(clock.live()).toHaveLength(0);
    expect(s.pending()).toBe(false);
  });

  it('an update that changes nothing schedules nothing', async () => {
    const { s, clock } = store();
    await s.load();
    s.update((v) => v);
    s.update((v) => ({ ...v }));
    expect(clock.live()).toHaveLength(0);
    expect(s.pending()).toBe(false);
  });

  it('writes atomically: no temp file is left, the old file stays until the rename', async () => {
    const { s } = store();
    await s.load();
    s.update(journal);
    await s.flush();
    s.update((v) => ({ ...v, newDrawingStyle: 'slides' }));
    await s.flush();
    expect(readdirSync(dir)).toEqual(['settings.json']);
    expect(onDisk().newDrawingStyle).toBe('slides');
  });

  it('a failed write is logged and leaves the change pending for the next flush', async () => {
    const { s, log } = store();
    await s.load();
    rmSync(dir, { recursive: true, force: true });
    s.update(journal);
    await s.flush();
    expect(log.join('\n')).toMatch(/write failed/i);
    mkdirSync(dir, { recursive: true });
    await s.flush();
    expect(onDisk().newDrawingStyle).toBe('journal');
  });

  it('changes made during a write are written after it', async () => {
    const { s } = store();
    await s.load();
    s.update(journal);
    const first = s.flush();
    s.update((v) => ({ ...v, export: { ...v.export, pngWhite: true } }));
    await first;
    await s.flush();
    expect(onDisk().newDrawingStyle).toBe('journal');
    expect(onDisk().export.pngWhite).toBe(true);
  });
});

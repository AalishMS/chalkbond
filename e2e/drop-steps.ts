// A15 drag and drop seams (SPEC-app-shell.md F12, SEC14): a hidden `<input type=file>` filled by
// Playwright's `setInputFiles` supplies a real, disk-backed `File`; synthetic drag events carry it
// in a `DataTransfer`. No path ever enters the page: the preload reads it (webUtils).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { serialize } from '../src/core/doc-model';
import { goldenDoc } from './harness';

/** Puts the files into a hidden file input (created once) so the page holds disk-backed Files. */
export async function stageFiles(page: Page, paths: string[]): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById('drop-probe')) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'drop-probe';
    input.multiple = true;
    input.hidden = true;
    document.body.append(input);
  });
  await page.setInputFiles('#drop-probe', paths);
}

/**
 * Dispatches `type` on the canvas area with the staged files (or text when `text` is given) and
 * returns whether the page prevented the default.
 */
export async function dispatchDrag(
  page: Page,
  type: 'dragenter' | 'dragover' | 'dragleave' | 'drop',
  text?: string,
): Promise<boolean> {
  return page.evaluate(
    ([eventType, plain]) => {
      const data = new DataTransfer();
      if (plain !== null) data.setData('text/plain', plain);
      else {
        const input = document.getElementById('drop-probe') as HTMLInputElement | null;
        for (const file of Array.from(input?.files ?? [])) data.items.add(file);
      }
      const target = document.querySelector('[data-testid="canvas"]') ?? document.body;
      const event = new DragEvent(eventType, {
        bubbles: true,
        cancelable: true,
        dataTransfer: data,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    },
    [type, text ?? null] as const,
  );
}

/** A full drop: enter, over, drop (the staged files). */
export async function dropStaged(page: Page): Promise<void> {
  await dispatchDrag(page, 'dragenter');
  await dispatchDrag(page, 'dragover');
  await dispatchDrag(page, 'drop');
}

/** Writes one `.chalk` file (the ethanol golden) per name into `dir`; returns the paths in order. */
export function writeChalkFiles(dir: string, names: string[]): string[] {
  const text = serialize(goldenDoc('ethanol'));
  return names.map((name) => {
    const file = join(dir, `${name}.chalk`);
    writeFileSync(file, text);
    return file;
  });
}

/**
 * R37, F11: hands main one open request per path at once, as the OS does when Explorer opens
 * several selected files (each is a `second-instance` command line). The events are emitted in one
 * synchronous turn, so the arrival order is the array order and nothing is delivered in between.
 */
export async function requestOpens(app: ElectronApplication, paths: string[]): Promise<void> {
  await app.evaluate(({ app: electronApp }, files) => {
    for (const file of files) electronApp.emit('second-instance', {}, ['Chalkbond.exe', file], '');
  }, paths);
}

/** The text of main's log (`userData/logs/main.log`), or '' while there is none. */
export function mainLog(userData: string): string {
  try {
    return readFileSync(join(userData, 'logs', 'main.log'), 'utf8');
  } catch {
    return '';
  }
}

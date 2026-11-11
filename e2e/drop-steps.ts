// A15 drag and drop seams (SPEC-app-shell.md F12, SEC14): a hidden `<input type=file>` filled by
// Playwright's `setInputFiles` supplies a real, disk-backed `File`; synthetic drag events carry it
// in a `DataTransfer`. No path ever enters the page: the preload reads it (webUtils).
import type { Page } from '@playwright/test';

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

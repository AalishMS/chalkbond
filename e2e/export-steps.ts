// Shared steps of the export e2e specs (C11, C12): run the Export dialog with the keyboard and
// mouse, read the scripted dialog log, wait for a notice. Dialog answers come from `launchApp`'s
// `dialogs` (e2e/stub-dialogs.mjs).
import { expect, type ElectronApplication, type Page } from '@playwright/test';
import { heardNotices } from './harness';

export type DialogLog = { method: string; options: Record<string, unknown> }[];

export const dialogLog = async (app: ElectronApplication): Promise<DialogLog> =>
  (await app.evaluate(
    () => (globalThis as { __chalkbondDialogLog?: DialogLog }).__chalkbondDialogLog ?? [],
  )) as DialogLog;

export const saveTo = (filePath: string) => ({ canceled: false, filePath });
export const openFrom = (filePath: string) => ({ canceled: false, filePaths: [filePath] });
export const BOX_OK = { response: 0, checkboxChecked: false };

/** Ctrl+E on the canvas, the format and PNG choices by mouse, then Save… (Enter). */
export async function exportWith(
  page: Page,
  choice: { format: 'png' | 'svg' | 'pdf'; size?: 'screen' | 'print' | 'poster'; white?: boolean },
): Promise<void> {
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Control+e');
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog).toBeVisible();
  await page.getByTestId(`export-format-${choice.format}`).click();
  if (choice.size) await page.getByTestId(`export-size-${choice.size}`).click();
  const white = page.getByTestId('export-white');
  if (choice.white !== undefined && (await white.count()) > 0) {
    const checked = (await white.getAttribute('aria-checked')) === 'true';
    if (checked !== choice.white) await white.click();
  }
  await page.getByTestId('export-save').click();
  await expect(dialog).toHaveCount(0);
}

/** Waits until the status bar has shown `text` (through the test hook's notice log). */
export async function expectNotice(page: Page, text: string): Promise<void> {
  await expect.poll(async () => (await heardNotices(page)).map((n) => n.text)).toContain(text);
}

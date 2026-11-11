// C8 shots (tasks/todo-clipboard-export.md). UI success only: main's clipboard.write is stubbed
// (e2e/stub-clipboard-write.mjs) behind the real flow and rasteriser. Not Windows clipboard proof.
import { expect, test } from '@playwright/test';
import { heardNotices, openApp, shot } from '../harness';
import { loadScheme, selectEthanol } from '../fixtures';

const away = { x: 640, y: 760 }; // the status bar's empty middle: no hover, no tooltip

test('C8 main: A01, the scheme with nothing selected', async () => {
  const { app, page } = await openApp({ launch: { clipboardWriteSuccess: true } });
  try {
    await loadScheme(page);
    await page.mouse.move(away.x, away.y);
    await shot(page, 'C8', 'main');
  } finally {
    await app.close();
  }
});

test('C8 copied: A02, Copy clicked, captured within 1 s of Copied', async () => {
  const { app, page } = await openApp({ launch: { clipboardWriteSuccess: true } });
  try {
    await loadScheme(page);
    const copy = page.getByTestId('copy');
    await copy.click();
    await expect(copy).toHaveText('Copied');
    const start = Date.now();
    await expect(page.getByRole('status')).toHaveText(
      'Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V.',
    );
    await page.mouse.move(away.x, away.y);
    await shot(page, 'C8', 'copied');
    expect(Date.now() - start).toBeLessThan(1000); // captured within 1 s of "Copied"
    // Still "Copied" after the capture, so the PNG shows it (it only turns back after 2 s).
    expect(await copy.textContent()).toBe('Copied');
  } finally {
    await app.close();
  }
});

test('C8 copied-selection: ethanol clicked with Select, Ctrl+C', async () => {
  const { app, page } = await openApp({ launch: { clipboardWriteSuccess: true } });
  try {
    await loadScheme(page);
    await selectEthanol(page);
    await page.keyboard.press('Control+c');
    await expect(page.getByTestId('copy')).toHaveText('Copied');
    await expect
      .poll(async () => (await heardNotices(page)).at(-1)?.text)
      .toBe('Copied. Paste into PowerPoint or Word with Ctrl+V.');
    await page.mouse.move(away.x, away.y);
    await shot(page, 'C8', 'copied-selection');
  } finally {
    await app.close();
  }
});

test('C8 min-960: A15b, the Atom tool, label-only Copy', async () => {
  const { app, page } = await openApp({
    size: [960, 640],
    launch: { clipboardWriteSuccess: true },
  });
  try {
    await loadScheme(page);
    await page.getByTestId('tool-atom').click();
    await page.mouse.move(480, 630);
    await shot(page, 'C8', 'min-960');
  } finally {
    await app.close();
  }
});

test('C8 disabled-960: empty drawing, grey disabled Copy', async () => {
  const { app, page } = await openApp({ size: [960, 640] });
  try {
    await expect(page.getByTestId('copy')).toHaveAttribute('aria-disabled', 'true');
    await page.mouse.move(480, 630);
    await shot(page, 'C8', 'disabled-960');
  } finally {
    await app.close();
  }
});

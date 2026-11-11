// A10 shot (tasks/todo-app-shell.md): switch to Handout, Ctrl+N, "Don't save": an empty drawing
// with "Handout" selected in the status bar (ST1).
import { expect, test } from '@playwright/test';
import { openApp, readDocument, shot } from '../harness';

const away = { x: 640, y: 786 }; // the status bar's empty middle: no canvas hover ghost

test('A10 new-handout: the new drawing keeps the last preset switch', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [{ response: 1 }] } });
  try {
    await page.getByTestId('preset-handout').click();
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+n');
    await expect
      .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle()))
      .toBe('Untitled - Chalkbond');
    expect((await readDocument(page)).style.preset).toBe('journal');
    await expect(page.getByTestId('preset-handout')).toHaveAttribute('aria-checked', 'true');
    await page.mouse.move(away.x, away.y);
    await shot(page, 'A10', 'new-handout');
  } finally {
    await app.close();
  }
});

// N14 shots (tasks/todo-features-2026-11.md; SPEC-editor.md R55, U16): the esterification scheme
// right after "Show structural" (with the hint in the status bar) and after Tidy reaction.
import { test } from '@playwright/test';
import { openApp, shot } from '../harness';

test('N14 the esterification scheme after the switch and after Tidy reaction', async () => {
  const { app, page } = await openApp();
  try {
    await page
      .getByTestId('empty-state')
      .getByRole('button', { name: 'ethanol + acetic acid -> ethyl acetate + water', exact: true })
      .click();
    await page.getByTestId('tool-select').click();
    await page.getByTestId('act-formula').click();
    await page.mouse.move(900, 700);
    await page.waitForTimeout(250);
    await shot(page, 'N14', 'after-switch');

    await page.getByTestId('act-tidy').click();
    await page.mouse.move(900, 700);
    await page.waitForTimeout(250);
    await shot(page, 'N14', 'after-tidy');
  } finally {
    await app.close();
  }
});

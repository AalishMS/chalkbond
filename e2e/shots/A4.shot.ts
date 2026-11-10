import { expect, test } from '@playwright/test';
import { canvasPoint, insertName, openApp, readDocument, shot } from '../harness';

test('A4 right-click selects ethanol before the future native menu', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    await page.keyboard.press('Escape');
    await page.getByTestId('tool-bond').click();
    const doc = await readDocument(page);
    const atom = Object.values(doc.atoms)[0];
    if (!atom) throw new Error('no atom');
    const point = await canvasPoint(page, atom);
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(1000, 700);
    await shot(page, 'A4', 'right-click-select');
  } finally {
    await app.close();
  }
});

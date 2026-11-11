// A13 shot (tasks/todo-app-shell.md): benzene and ethanol as A07, right-click on ethanol with the
// native popup stubbed to do nothing: ethanol selected with halo and frame as A07's left panel.
// The native menus' look (A07) is on the Windows checklist.
import { expect, test } from '@playwright/test';
import { popups, stubPopup } from '../app-menu';
import { canvasPoint, insertName, openApp, readDocument, readSelection, shot } from '../harness';

test('A13 right-click-selected', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'benzene');
    const ring = Object.keys((await readDocument(page)).atoms);
    await insertName(page, 'ethanol');
    await page.getByTestId('canvas').focus();
    for (let i = 0; i < 6 && (await readSelection(page)).atoms.length > 0; i++) {
      await page.keyboard.press('Escape');
    }
    await page.getByTestId('zoom-fit').click();
    const doc = await readDocument(page);
    const ethanol = Object.keys(doc.atoms).filter((id) => !ring.includes(id));
    const atom = doc.atoms[ethanol[1] as keyof typeof doc.atoms];
    if (!atom) throw new Error('no ethanol');
    await stubPopup(app, [null]);
    const at = await canvasPoint(page, atom);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await expect.poll(async () => (await popups(app)).length).toBe(1);
    expect((await readSelection(page)).atoms.sort()).toEqual([...ethanol].sort());
    await page.mouse.move(1270, 790);
    await shot(page, 'A13', 'right-click-selected');
  } finally {
    await app.close();
  }
});

// N9 (SPEC-clipboard-export.md R11, SC15): a structural drawing exported as PNG, SVG and PDF through
// the real Export dialog reopens through File > Open as the same structural, editable drawing.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { serialize, setStyle } from '../src/core/doc-model';
import { exportWith, expectNotice, openFrom, saveTo } from './export-steps';
import { goldenDoc, loadDocument, openApp, readDocument } from './harness';
import { expectBlockedRequests } from './launch';
import { windowTitle } from './relaunch';

let dir: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-export-structural-'));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

for (const format of ['png', 'svg', 'pdf'] as const) {
  test(`a structural drawing exported as ${format.toUpperCase()} reopens structural and equal`, async () => {
    const chalk = join(dir, 'toluene.chalk');
    const file = join(dir, `toluene.${format}`);
    const { app, page } = await openApp({
      launch: { dialogs: [saveTo(chalk), saveTo(file), openFrom(file)] },
    });
    try {
      // A v2 document (it needs only N1): toluene, drawn structural.
      const original = setStyle(goldenDoc('toluene'), { formula: 'structural' });
      await loadDocument(page, original);
      await page.getByTestId('canvas').focus();
      await page.keyboard.press('Control+s');
      await expect.poll(() => windowTitle(app)).toBe('toluene - Chalkbond');
      const doc = await readDocument(page);
      expect(doc.style.formula).toBe('structural');

      await exportWith(page, { format });
      await expectNotice(page, `Exported toluene.${format}.`);

      await page.getByTestId('canvas').focus();
      await page.keyboard.press('Control+o');
      await expect.poll(() => windowTitle(app)).toBe(`toluene.${format} - Chalkbond`);
      const reopened = await readDocument(page);
      expect(reopened.style.formula).toBe('structural');
      expect(serialize(reopened)).toBe(serialize(doc));
      // Editable: the methyl carbon is written in structural mode (CH3), the ring is not.
      await expect(page.locator('[data-layer="content"] > [data-key^="atom:"]')).not.toHaveCount(0);
      expectBlockedRequests(app, 0);
    } finally {
      await app.close();
    }
  });
}

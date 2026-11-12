// C11 (SPEC-clipboard-export.md EX3–EX5, E3; SC8): Export SVG of the scheme through the real dialog
// and C4 write: the file is exactly the UTF-8 of exportSvg(doc, null).svg (no BOM) and reopens
// through the real A9 Open flow to an equal document; the session, title and dirty state stay.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { exportSvg, readSvgDrawing } from '../src/core/clipboard-export';
import { serialize } from '../src/core/doc-model';
import { dialogLog, exportWith, expectNotice, openFrom, saveTo } from './export-steps';
import { loadScheme } from './fixtures';
import {
  expectNoNetwork,
  goldenDoc,
  loadDocument,
  openApp,
  readDocument,
  readTabs,
} from './harness';
import { windowTitle } from './relaunch';

let dir: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-export-svg-'));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('SC8: the scheme exports as exactly exportSvg(doc, null).svg and reopens equal', async () => {
  const chalk = join(dir, 'esterification.chalk');
  const file = join(dir, 'esterification.svg');
  const { app, page } = await openApp({
    launch: { dialogs: [saveTo(chalk), saveTo(file), openFrom(file)] },
  });
  try {
    await loadScheme(page);
    await page.keyboard.press('Control+s');
    await expect.poll(() => windowTitle(app)).toBe('esterification - Chalkbond');
    const doc = await readDocument(page);

    await exportWith(page, { format: 'svg' });
    await expectNotice(page, 'Exported esterification.svg.');
    expect((await dialogLog(app))[1]?.options['defaultPath']).toBe(file);
    const bytes = readFileSync(file);
    expect(bytes.equals(Buffer.from(exportSvg(doc, null).svg, 'utf8'))).toBe(true);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('<svg'); // no BOM
    expect(readSvgDrawing(bytes.toString('utf8'))).not.toBeNull();
    expect(serialize(await readDocument(page))).toBe(serialize(doc));
    expect(await windowTitle(app)).toBe('esterification - Chalkbond');

    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+o');
    await expect.poll(() => windowTitle(app)).toBe('esterification.svg - Chalkbond');
    expect(serialize(await readDocument(page))).toBe(serialize(doc));
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('the golden toluene SVG: exact bytes; an Untitled drawing stays Untitled', async () => {
  const file = join(dir, 'toluene.svg');
  const { app, page } = await openApp({ launch: { dialogs: [saveTo(file)] } });
  try {
    const doc = goldenDoc('toluene');
    await loadDocument(page, doc);
    await exportWith(page, { format: 'svg' });
    await expectNotice(page, 'Exported toluene.svg.');
    expect((await dialogLog(app))[0]?.options['defaultPath']).toMatch(/[\\/]Untitled\.svg$/);
    expect(readFileSync(file).equals(Buffer.from(exportSvg(doc, null).svg, 'utf8'))).toBe(true);
    // Export binds nothing: the tab stays Untitled, unsaved (W3, R41: an Untitled tab with content).
    expect(await windowTitle(app)).toBe('*Untitled - Chalkbond');
    expect((await readTabs(page)).map((t) => [t.label, t.kind])).toEqual([
      ['Untitled', 'untitled'],
    ]);
  } finally {
    await app.close();
  }
});

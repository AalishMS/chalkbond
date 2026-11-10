import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { openApp } from '../harness';

interface Point {
  x: number;
  y: number;
}

/**
 * Puts the physical mouse cursor at a screen point (Windows; the only platform where test
 * windows share the desktop with a real pointer: Linux launches use the headless backend or a
 * bare X display) and returns where it was. No click, no key: only the cursor moves.
 */
function moveOsCursor(to: Point): Point | null {
  if (process.platform !== 'win32') return null;
  const out = execFileSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Add-Type -AssemblyName System.Windows.Forms; $p = [System.Windows.Forms.Cursor]::Position; ' +
      `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${to.x}, ${to.y}); ` +
      'Write-Output "$($p.X) $($p.Y)"',
  ]);
  const [x, y] = out.toString().trim().split(' ').map(Number);
  return { x: x ?? 0, y: y ?? 0 };
}

test('a test window gets no OS mouse input: a real cursor moving over it does not cancel a hover', async () => {
  const { app, page } = await openApp();
  let saved: Point | null = null;
  try {
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { pointerSeen: string[] }).pointerSeen = seen;
      for (const type of ['pointerover', 'pointerout', 'pointermove']) {
        document.addEventListener(type, (e) => {
          const target = e.target instanceof Element ? e.target.closest('[data-testid]') : null;
          seen.push(`${type} ${target?.getAttribute('data-testid') ?? 'none'}`);
        });
      }
    });
    // Raise the window over every other one and put the real cursor on the canvas.
    const content = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.setAlwaysOnTop(true);
      return win?.getContentBounds() ?? { x: 0, y: 0, width: 0, height: 0 };
    });
    const onCanvas = { x: content.x + 700, y: content.y + 500 };
    saved = moveOsCursor(onCanvas);

    await page.getByTestId('opt-triple').hover();
    // The real cursor moves while the tooltip's 500 ms delay runs.
    moveOsCursor({ x: onCanvas.x + 5, y: onCanvas.y + 5 });
    await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 2000 });
    await expect(page.getByRole('tooltip').locator('.tooltip-title span')).toHaveText('Triple');

    // Only Playwright's pointer reached the page.
    const seen = await page.evaluate(
      () => (window as unknown as { pointerSeen: string[] }).pointerSeen,
    );
    expect(seen).toEqual(['pointerover opt-triple', 'pointermove opt-triple']);
  } finally {
    if (saved !== null) moveOsCursor(saved);
    await app.close();
  }
});

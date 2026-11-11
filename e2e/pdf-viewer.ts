// The C4 probe's PDF viewer comparison (SPEC-clipboard-export.md probe C4, PDF-A), shared by
// `pdf-facts.spec.ts` and `export-pdf.spec.ts`. Test-only: each PDF opens in a hidden viewer
// window with its own `probe-pdf` partition (so app-shell SEC4 on the default session does not
// block the viewer), a minimum 800 × 600 size (headless Chromium clamps an unsized hidden window
// to 1 × 1) and `capturePage` polled for up to 10 s until the page is ready. Production printing
// needs no viewer and no capture.
import type * as FsPromises from 'node:fs/promises';
import type * as NodePath from 'node:path';
import type { ElectronApplication } from '@playwright/test';

export interface ViewerPage {
  /** A file name for the temp copy (`original.pdf`). */
  name: string;
  bytes: number[];
  /** Wait for dark ink on white paper (false for a blank page). */
  ink: boolean;
}

/**
 * Captures each page in the viewer and counts, for each, the pixels that differ from the first
 * page's capture. `windows` is the app's window count after every viewer is destroyed.
 */
export async function viewerDifferences(
  app: ElectronApplication,
  pages: ViewerPage[],
): Promise<{ differences: number[]; pixels: number; windows: number }> {
  return app.evaluate(async ({ BrowserWindow, app }, pages) => {
    const { mkdtemp, writeFile, rm } = process.getBuiltinModule(
      'node:fs/promises',
    ) as typeof FsPromises;
    const { join } = process.getBuiltinModule('node:path') as typeof NodePath;
    const folder = await mkdtemp(join(app.getPath('temp'), 'chalkbond-pdf-viewer-'));
    const capture = async (bytes: number[], name: string, ink: boolean) => {
      const path = join(folder, name);
      await writeFile(path, Buffer.from(bytes));
      const viewer = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        minWidth: 800,
        minHeight: 600,
        webPreferences: { plugins: true, partition: 'probe-pdf', backgroundThrottling: false },
      });
      try {
        await viewer.loadFile(path);
        const deadline = Date.now() + 10_000;
        let previous: Buffer = Buffer.alloc(0);
        do {
          const image = await viewer.webContents.capturePage(undefined, { stayHidden: true });
          const pixels = image.toBitmap();
          const size = image.getSize();
          let white = 0,
            pageInk = 0;
          // Ignore toolbar and thumbnails: dark ink must touch white paper in the page area.
          for (let y = 65; y < size.height - 3; y++) {
            for (let x = 320; x < size.width - 3; x++) {
              const i = (y * size.width + x) * 4;
              if (pixels[i] === 255 && pixels[i + 1] === 255 && pixels[i + 2] === 255) white++;
              if (
                (pixels[i] ?? 255) < 100 &&
                (pixels[i + 1] ?? 255) < 100 &&
                (pixels[i + 2] ?? 255) < 100 &&
                [12, size.width * 12].some((delta) =>
                  [i - delta, i + delta].every(
                    (at) => pixels[at] === 255 && pixels[at + 1] === 255 && pixels[at + 2] === 255,
                  ),
                )
              )
                pageInk++;
            }
          }
          if (white > 1000 && (!ink || pageInk > 0) && pixels.equals(previous))
            return Array.from(pixels);
          previous = pixels;
          await new Promise((resolve) => setTimeout(resolve, 100));
        } while (Date.now() < deadline);
        throw new Error('INCONCLUSIVE: PDF page ' + name + ' never became ready within 10s');
      } finally {
        viewer.destroy();
      }
    };
    try {
      const captures: number[][] = [];
      for (const page of pages) captures.push(await capture(page.bytes, page.name, page.ink));
      const first = captures[0] ?? [];
      const differences = captures.map((other) => {
        let different = 0;
        for (let i = 0; i < first.length; i += 4)
          if (first.slice(i, i + 4).some((v, j) => v !== other[i + j])) different++;
        return different;
      });
      return {
        differences,
        pixels: first.length / 4,
        windows: BrowserWindow.getAllWindows().length,
      };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }, pages);
}

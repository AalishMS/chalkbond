// R29 (SPEC-app-shell.md I1): the package holds only the application. `out/` is shared with the
// output of shots, mock-ups, golden sheets and probes, so `files` must name the application
// folders, never the whole folder.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const config = readFileSync(resolve(ROOT, 'electron-builder.yml'), 'utf8');

/** The entries of the top-level `files: [a, b, c]` line (flow sequence on one line). */
function filesList(): string[] {
  const match = /^files:\s*\[(.*)\]\s*$/m.exec(config);
  if (match?.[1] === undefined)
    throw new Error('electron-builder.yml has no one-line `files` list');
  return match[1].split(',').map((entry) => entry.trim());
}

describe('electron-builder.yml `files` (R29)', () => {
  it('names exactly the three application folders and package.json', () => {
    expect(filesList()).toEqual([
      'out/main/**',
      'out/preload/**',
      'out/renderer/**',
      'package.json',
    ]);
  });

  it.each([
    'out/shots/a.png',
    'out/mockups/a.png',
    'out/mockups-shell/a.png',
    'out/sheet-slides-1.png',
    'out/golden-sheet.html',
    'out/pdf-facts/a.pdf',
  ])('no pattern reaches %s', (path) => {
    const reached = filesList().some((pattern) => {
      if (pattern.endsWith('/**')) return path.startsWith(pattern.slice(0, -2));
      return pattern === path;
    });
    expect(reached).toBe(false);
  });
});

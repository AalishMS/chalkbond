import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// SPEC-svg-render.md "Testing" (tooling) and success criterion 3: the committed goldens are
// byte-stable across platforms, so they hold no carriage return and `.gitattributes` pins LF.
const DIR = 'src/core/svg-render/__golden__/';

function committed(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', DIR], { encoding: 'utf8' });
  return out.split('\0').filter((f) => f !== '');
}

describe('svg-render goldens', () => {
  const files = committed();

  it('are committed (at least the 30 scenes in both presets)', () => {
    expect(files.filter((f) => f.endsWith('.slides.svg')).length).toBeGreaterThanOrEqual(30);
    expect(files.filter((f) => f.endsWith('.journal.svg')).length).toBeGreaterThanOrEqual(30);
  });

  it('contain no carriage return', () => {
    const withCr = files.filter((f) => readFileSync(f, 'utf8').includes('\r'));
    expect(withCr).toEqual([]);
  });

  it('are pinned to LF by .gitattributes', () => {
    expect(readFileSync('.gitattributes', 'utf8')).toMatch(
      /^src\/core\/svg-render\/__golden__\/\*\* text eol=lf$/m,
    );
  });
});

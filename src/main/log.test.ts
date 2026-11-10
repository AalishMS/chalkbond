import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createLogger } from './log';

it('appends and rotates the actual log file', () => {
  const folder = mkdtempSync(join(tmpdir(), 'chalkbond-log-'));
  try {
    const log = createLogger(folder);
    log('main', 'first');
    const path = join(folder, 'logs/main.log');
    expect(readFileSync(path, 'utf8')).toMatch(/^\d{4}-.* main first\n$/);
    writeFileSync(path, 'x'.repeat(1048576));
    log('main', 'second');
    expect(readFileSync(join(folder, 'logs/main.old.log'), 'utf8')).toHaveLength(1048576);
    expect(readFileSync(path, 'utf8')).toContain('main second\n');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

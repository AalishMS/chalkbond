import { describe, expect, it } from 'vitest';
import { fileArg, testFlags } from './args';

const OFF = { hooks: false, userData: null };

describe('testFlags', () => {
  it('reads both flags in an unpackaged build', () => {
    expect(
      testFlags(
        ['electron', '.', '--chalkbond-test-hooks', '--chalkbond-user-data=C:\\tmp\\x'],
        false,
      ),
    ).toEqual({ hooks: true, userData: 'C:\\tmp\\x' });
  });

  it('reads each flag on its own', () => {
    expect(testFlags(['--chalkbond-test-hooks'], false)).toEqual({ hooks: true, userData: null });
    expect(testFlags(['--chalkbond-user-data=/tmp/a'], false)).toEqual({
      hooks: false,
      userData: '/tmp/a',
    });
  });

  it('ignores both flags in a packaged build', () => {
    expect(
      testFlags(['app.exe', '--chalkbond-test-hooks', '--chalkbond-user-data=/tmp/a'], true),
    ).toEqual(OFF);
  });

  it('returns nothing when the flags are absent', () => {
    expect(testFlags([], false)).toEqual(OFF);
    expect(testFlags(['electron', '.', '--force-device-scale-factor=1'], false)).toEqual(OFF);
  });

  it('keeps spaces, quotes and further = signs in the value', () => {
    expect(testFlags(['--chalkbond-user-data=C:\\Temp\\my "data" dir'], false).userData).toBe(
      'C:\\Temp\\my "data" dir',
    );
    expect(testFlags(["--chalkbond-user-data=/tmp/it's=fine"], false).userData).toBe(
      "/tmp/it's=fine",
    );
  });

  it('treats a missing or empty value as no folder', () => {
    expect(testFlags(['--chalkbond-user-data'], false).userData).toBeNull();
    expect(testFlags(['--chalkbond-user-data='], false).userData).toBeNull();
    expect(testFlags(['--chalkbond-user-data', '/tmp/a'], false).userData).toBeNull();
  });

  it('does not take a flag that only starts like one', () => {
    expect(testFlags(['--chalkbond-test-hooks-extra', '--chalkbond-user-datax=/a'], false)).toEqual(
      OFF,
    );
  });

  it('takes the first user-data flag when given twice', () => {
    expect(
      testFlags(['--chalkbond-user-data=/first', '--chalkbond-user-data=/second'], false).userData,
    ).toBe('/first');
  });
});

// F11 `fileArg` (implemented early in A14 for RC4's launch with a file; A15 adds second-instance).
describe('fileArg', () => {
  it('the last argument that is not a flag and ends in an Open extension, any case', () => {
    expect(fileArg(['Chalkbond.exe', 'C:\\Users\\T\\ethanol.chalk'])).toBe(
      'C:\\Users\\T\\ethanol.chalk',
    );
    expect(fileArg(['app', '/a/one.chalk', '/b/two.CHALK'])).toBe('/b/two.CHALK');
    expect(fileArg(['app', '/a/toluene.png'])).toBe('/a/toluene.png');
    expect(fileArg(['app', '/a/x.svg', '/a/y.pdf'])).toBe('/a/y.pdf');
  });

  it('flags, Chromium extras, -r preloads, the app folder and other extensions are ignored', () => {
    expect(
      fileArg([
        '/usr/bin/electron',
        '-r',
        '/repo/e2e/no-os-mouse.mjs',
        '/repo',
        '--chalkbond-test-hooks',
        '--chalkbond-user-data=/tmp/x.chalk',
        '--force-device-scale-factor=1',
        '--no-sandbox',
        '/tmp/notes.docx',
      ]),
    ).toBeNull();
    expect(fileArg(['app', '--open=/a/b.chalk', '/a/b.chalk.txt', '/a/chalk'])).toBeNull();
    expect(fileArg([])).toBeNull();
  });

  it('a path wrapped in double quotes is unwrapped', () => {
    expect(fileArg(['app', '"C:\\My Drawings\\a b.chalk"'])).toBe('C:\\My Drawings\\a b.chalk');
  });
});

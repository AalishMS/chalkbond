/** Test flags of the main process (SPEC-app-shell.md TH1). */
export interface TestFlags {
  /** `--chalkbond-test-hooks`: define the test hook and the main-process test object. */
  readonly hooks: boolean;
  /** `--chalkbond-user-data=<dir>`: where `userData` lives for this launch; null when not given. */
  readonly userData: string | null;
}

const HOOKS_FLAG = '--chalkbond-test-hooks';
const USER_DATA_PREFIX = '--chalkbond-user-data=';

/**
 * Reads the test flags from `argv`. A packaged build honours none of them (SEC12): the flags
 * cost nothing to ignore and must never change how an installed app behaves. The user-data value
 * is everything after the first `=`, verbatim (spaces, quotes and further `=` signs included); a
 * flag with no value, or an empty one, gives null.
 */
export function testFlags(argv: readonly string[], isPackaged: boolean): TestFlags {
  if (isPackaged) return { hooks: false, userData: null };
  const given = argv.find((arg) => arg.startsWith(USER_DATA_PREFIX));
  const value = given === undefined ? '' : given.slice(USER_DATA_PREFIX.length);
  return { hooks: argv.includes(HOOKS_FLAG), userData: value === '' ? null : value };
}

const OPEN_EXTENSION = /\.(chalk|png|svg|pdf)$/i;

/**
 * F11: the file a launch asks to open: the last argument that does not start with `-` and ends in
 * an Open extension (any case), with one pair of surrounding double quotes removed; null when none.
 * (Implemented in A14 for RC4's launch with a file; A15 adds the second-instance path.)
 */
export function fileArg(argv: readonly string[]): string | null {
  for (let i = argv.length - 1; i >= 0; i--) {
    const raw = argv[i] ?? '';
    const arg =
      raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    if (!arg.startsWith('-') && OPEN_EXTENSION.test(arg)) return arg;
  }
  return null;
}

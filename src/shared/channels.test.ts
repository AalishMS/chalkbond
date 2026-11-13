// TB21: the IPC channel set after the recovery code was retired (SPEC-app-shell.md I1-I14, N1-N10,
// SEC5). The preload exposes one function per entry but `mainEvent` (`onMainEvent`) plus `platform`,
// which e2e/app-security.spec.ts checks against `Object.keys(window.chalkbond)`.
import { describe, expect, it } from 'vitest';
import { CHANNELS } from './channels';

describe('CHANNELS (TB21)', () => {
  it('is the final set: the tab channels are present, recovery and the session file are gone', () => {
    expect(Object.keys(CHANNELS).sort()).toEqual([
      'acceptOutsideChange',
      'ask',
      'autoSave',
      'bindTab',
      'checkTabFile',
      'chooseOpen',
      'chooseSave',
      'clipboardRead',
      'clipboardWrite',
      'closeOk',
      'damagedTabRecord',
      'fileDropped',
      'logError',
      'mainEvent',
      'printPdf',
      'readFile',
      'readTabRecord',
      'setSettings',
      'showAppMenu',
      'showContextMenu',
      'showFileError',
      'showTabMenu',
      'startup',
      'updateSession',
      'updateSessionIndex',
      'writeFile',
      'writeTabRecord',
    ]);
  });

  it('has unique channel names', () => {
    const names = Object.values(CHANNELS);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((name) => /recovery|session:file/.test(name))).toEqual([]);
  });
});

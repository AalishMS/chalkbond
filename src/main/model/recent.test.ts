// F10 recent files (SPEC-app-shell.md F10, R21): newest first, deduped (case-insensitive on
// Windows), at most 8, labels with the parent folder for duplicate base names. Paths stay in main.
import { describe, expect, it } from 'vitest';
import { addRecent, createRecent, recentLabels, removeRecent } from './recent';

describe('addRecent', () => {
  it('puts the path first and moves an existing one to the top', () => {
    expect(addRecent([], '/a/x.chalk', false)).toEqual(['/a/x.chalk']);
    expect(addRecent(['/a/x.chalk', '/b/y.chalk'], '/b/y.chalk', false)).toEqual([
      '/b/y.chalk',
      '/a/x.chalk',
    ]);
  });

  it('dedupes case-insensitively on Windows, keeping the new spelling', () => {
    expect(
      addRecent(['C:\\T\\Ethanol.chalk', 'C:\\T\\b.chalk'], 'c:\\t\\ethanol.CHALK', true),
    ).toEqual(['c:\\t\\ethanol.CHALK', 'C:\\T\\b.chalk']);
    // Elsewhere case matters: both stay.
    expect(addRecent(['/t/Ethanol.chalk'], '/t/ethanol.chalk', false)).toEqual([
      '/t/ethanol.chalk',
      '/t/Ethanol.chalk',
    ]);
  });

  it('keeps at most 8, dropping the oldest', () => {
    let list: string[] = [];
    for (let i = 0; i < 10; i++) list = addRecent(list, `/d/${i}.chalk`, false);
    expect(list).toHaveLength(8);
    expect(list[0]).toBe('/d/9.chalk');
    expect(list.at(-1)).toBe('/d/2.chalk');
  });

  it('never changes its input', () => {
    const list = Object.freeze(['/a.chalk']);
    expect(addRecent(list, '/b.chalk', false)).toEqual(['/b.chalk', '/a.chalk']);
    expect(list).toEqual(['/a.chalk']);
  });
});

describe('removeRecent', () => {
  it('removes the path (case-insensitively on Windows) and nothing else', () => {
    expect(removeRecent(['/a.chalk', '/b.chalk'], '/a.chalk', false)).toEqual(['/b.chalk']);
    expect(removeRecent(['/A.chalk'], '/a.chalk', false)).toEqual(['/A.chalk']);
    expect(removeRecent(['C:\\A.chalk', 'C:\\b.chalk'], 'c:\\a.CHALK', true)).toEqual([
      'C:\\b.chalk',
    ]);
  });
});

describe('recentLabels', () => {
  it('the base name; duplicates get " — <parent folder name>"', () => {
    expect(
      recentLabels(
        [
          'C:\\Users\\T\\Grade 11\\esterification.chalk',
          'C:\\Users\\T\\Grade 12\\esterification.chalk',
          '/home/t/toluene.png',
        ],
        true,
      ),
    ).toEqual([
      'esterification.chalk — Grade 11',
      'esterification.chalk — Grade 12',
      'toluene.png',
    ]);
  });

  it('a duplicate in another case counts on Windows only; a root file names its root', () => {
    expect(recentLabels(['C:\\a\\X.chalk', 'D:\\X.CHALK'], true)).toEqual([
      'X.chalk — a',
      'X.CHALK — D:',
    ]);
    expect(recentLabels(['/a/X.chalk', '/b/x.chalk'], false)).toEqual(['X.chalk', 'x.chalk']);
    expect(recentLabels(['/x.chalk', '/b/x.chalk'], false)).toEqual(['x.chalk — /', 'x.chalk — b']);
  });

  it('keeps & as typed (the menu model doubles it)', () => {
    expect(recentLabels(['/R&D/a&b.chalk', '/Lab & co/a&b.chalk'], false)).toEqual([
      'a&b.chalk — R&D',
      'a&b.chalk — Lab & co',
    ]);
  });
});

describe('createRecent', () => {
  it('add, remove, clear report every change; entries pair labels with path snapshots', () => {
    const changes: string[][] = [];
    const recent = createRecent({
      initial: ['/old.chalk'],
      caseInsensitive: false,
      changed: (list) => changes.push([...list]),
    });
    recent.add('/a/x.chalk');
    recent.add('/b/x.chalk');
    expect(recent.entries()).toEqual([
      { label: 'x.chalk — b', path: '/b/x.chalk' },
      { label: 'x.chalk — a', path: '/a/x.chalk' },
      { label: 'old.chalk', path: '/old.chalk' },
    ]);
    recent.remove('/a/x.chalk');
    recent.remove('/nope.chalk'); // not listed: no change reported
    recent.clear();
    recent.clear(); // already empty: no change reported
    expect(recent.list()).toEqual([]);
    expect(changes).toEqual([
      ['/a/x.chalk', '/old.chalk'],
      ['/b/x.chalk', '/a/x.chalk', '/old.chalk'],
      ['/b/x.chalk', '/old.chalk'],
      [],
    ]);
  });

  it('adding the path already on top reports nothing; the initial list is capped and deduped', () => {
    const changes: string[][] = [];
    const initial = Array.from({ length: 10 }, (_, i) => `/d/${i}.chalk`);
    const recent = createRecent({
      initial: ['/d/0.chalk', ...initial],
      caseInsensitive: false,
      changed: (list) => changes.push([...list]),
    });
    expect(recent.list()).toEqual(initial.slice(0, 8));
    recent.add('/d/0.chalk');
    expect(changes).toEqual([]);
  });

  it('entries are fresh snapshots: a later change never alters an earlier result', () => {
    const recent = createRecent({ initial: ['/a.chalk', '/b.chalk'], caseInsensitive: false });
    const before = recent.entries();
    recent.add('/b.chalk');
    expect(before.map((e) => e.path)).toEqual(['/a.chalk', '/b.chalk']);
    expect(recent.entries().map((e) => e.path)).toEqual(['/b.chalk', '/a.chalk']);
  });
});

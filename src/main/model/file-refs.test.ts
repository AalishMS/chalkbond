// File refs (SPEC-app-shell.md "Process split and IPC", R8; F8 R6): the pure registry and rules.
import { describe, expect, it } from 'vitest';
import { baseName, createFileRefs, kindOfPath, OPEN_KINDS, withExtension } from './file-refs';

const ids = (): (() => string) => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
};

describe('createFileRefs', () => {
  it('hands out opaque refs (id, base name, kind) and keeps the path in main', () => {
    const refs = createFileRefs(ids());
    const ref = refs.add('C:\\Users\\T\\Documents\\ethanol.chalk', 'chalk', 'opened');
    expect(ref).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'ethanol.chalk',
      kind: 'chalk',
    });
    expect(Object.keys(ref).sort()).toEqual(['id', 'kind', 'name']);
    expect(refs.get(ref.id)).toEqual({
      path: 'C:\\Users\\T\\Documents\\ethanol.chalk',
      kind: 'chalk',
      writable: true,
      how: 'opened',
    });
    expect(refs.get('00000000-0000-4000-8000-000000000999')).toBeUndefined();
  });

  it('writable: Save-dialog refs for their kind, opened .chalk refs; opened pictures never', () => {
    const refs = createFileRefs(ids());
    for (const kind of OPEN_KINDS) {
      expect(refs.get(refs.add(`/d/a.${kind}`, kind, 'saved').id)?.writable).toBe(true);
      expect(refs.get(refs.add(`/d/a.${kind}`, kind, 'opened').id)?.writable).toBe(
        kind === 'chalk',
      );
    }
  });

  it('gives every ref a fresh id, even for the same path', () => {
    const refs = createFileRefs(ids());
    const a = refs.add('/d/a.chalk', 'chalk', 'opened');
    const b = refs.add('/d/a.chalk', 'chalk', 'opened');
    expect(a.id).not.toBe(b.id);
  });
});

describe('kindOfPath and baseName', () => {
  it('reads the Open kinds by extension in any case (PDF under PDF-A)', () => {
    expect(OPEN_KINDS).toEqual(['chalk', 'png', 'svg', 'pdf']);
    expect(kindOfPath('/d/ethanol.chalk')).toBe('chalk');
    expect(kindOfPath('C:\\d\\Photo.PNG')).toBe('png');
    expect(kindOfPath('/d/a.Svg')).toBe('svg');
    expect(kindOfPath('/d/a.pdf')).toBe('pdf');
    for (const p of ['/d/setup.exe', '/d/notes', '/d/a.chalk.txt', '/d/.chalk/x', '/d/chalk'])
      expect(kindOfPath(p)).toBeNull();
  });

  it('takes the last segment after either separator', () => {
    expect(baseName('C:\\a\\b\\ethanol.chalk')).toBe('ethanol.chalk');
    expect(baseName('/a/b/notes.png')).toBe('notes.png');
    expect(baseName('C:/a\\b/c.svg')).toBe('c.svg');
    expect(baseName('plain')).toBe('plain');
  });
});

describe('withExtension (R6)', () => {
  it('appends the format extension when missing and keeps any other extension', () => {
    expect(withExtension('C:\\d\\notes', 'chalk')).toBe('C:\\d\\notes.chalk');
    expect(withExtension('C:\\d\\notes.png', 'chalk')).toBe('C:\\d\\notes.png.chalk');
    expect(withExtension('/d/a.CHALK', 'chalk')).toBe('/d/a.CHALK');
    expect(withExtension('/d/a.chalk', 'chalk')).toBe('/d/a.chalk');
    expect(withExtension('/d/pic', 'png')).toBe('/d/pic.png');
    expect(withExtension('/d/pic.Svg', 'svg')).toBe('/d/pic.Svg');
    expect(withExtension('/d/doc.pdf', 'pdf')).toBe('/d/doc.pdf');
    expect(withExtension('/d/doc.pdf', 'png')).toBe('/d/doc.pdf.png');
    expect(withExtension('/d/x.chalk', 'png')).toBe('/d/x.chalk.png');
  });
});

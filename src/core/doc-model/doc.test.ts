import { describe, expect, it } from 'vitest';
import { emptyDoc } from './doc';
import { isValidElement, PERIODIC_SYMBOLS } from './elements';
import { DocError } from './errors';
import { idNumber, makeId } from './ids';
import * as publicApi from './index';

describe('emptyDoc', () => {
  it('is an empty v1 doc stamped with the given time', () => {
    const now = '2026-11-09T12:00:00.000Z';
    expect(emptyDoc(now)).toEqual({
      schemaVersion: 1,
      atoms: {},
      bonds: {},
      objects: {},
      zOrder: [],
      groups: {},
      nextId: 1,
      style: { preset: 'slides', overrides: {} },
      meta: { created: now, modified: now },
    });
  });

  it('is plain JSON (round-trips through JSON unchanged)', () => {
    const doc = emptyDoc('2026-11-09T12:00:00.000Z');
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });
});

describe('elements', () => {
  it('lists all 118 elements in atomic-number order', () => {
    expect(PERIODIC_SYMBOLS).toHaveLength(118);
    expect(new Set(PERIODIC_SYMBOLS).size).toBe(118);
    expect(PERIODIC_SYMBOLS[0]).toBe('H');
    expect(PERIODIC_SYMBOLS[5]).toBe('C');
    expect(PERIODIC_SYMBOLS[25]).toBe('Fe');
    expect(PERIODIC_SYMBOLS[117]).toBe('Og');
  });

  it.each(['C', 'Cl', 'Og', 'R', 'X', '*'])('accepts %s', (s) => {
    expect(isValidElement(s)).toBe(true);
  });

  it.each(['', 'c', 'CL', 'Xx', 'Ph', 'D'])('rejects %j', (s) => {
    expect(isValidElement(s)).toBe(false);
  });
});

describe('ids', () => {
  it('formats ids with a kind prefix', () => {
    expect([
      makeId('atom', 1),
      makeId('bond', 7),
      makeId('object', 3),
      makeId('group', 12),
    ]).toEqual(['a1', 'b7', 'o3', 'g12']);
  });

  it.each([
    ['atom', 'a12', 12],
    ['bond', 'b7', 7],
    ['atom', 'b7', null],
    ['atom', 'a0', null],
    ['atom', 'a07', null],
    ['atom', 'a', null],
    ['atom', 'a1x', null],
  ] as const)('idNumber(%s, %s) = %s', (kind, id, n) => {
    expect(idNumber(kind, id)).toBe(n);
  });
});

describe('DocError', () => {
  it('carries a code and detail', () => {
    const err = new DocError('unknown-atom', 'a5');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('DocError');
    expect(err.code).toBe('unknown-atom');
    expect(err.message).toBe('unknown-atom: a5');
    expect(new DocError('self-bond').message).toBe('self-bond');
  });
});

describe('public entry (index.ts)', () => {
  it('exports exactly the public surface', () => {
    expect(Object.keys(publicApi).sort()).toEqual(
      [
        'DocError',
        'HISTORY_DEPTH',
        'PERIODIC_SYMBOLS',
        'PSEUDO_SYMBOLS',
        'addAtom',
        'addBond',
        'addObject',
        'canRedo',
        'canUndo',
        'checkInvariants',
        'createHistory',
        'current',
        'emptyDoc',
        'findBond',
        'isValidElement',
        'neighbors',
        'paintLayers',
        'redo',
        'redoLabel',
        'transact',
        'undo',
        'undoLabel',
        'updateAtom',
        'updateBond',
        'updateObject',
      ].sort(),
    );
  });
});

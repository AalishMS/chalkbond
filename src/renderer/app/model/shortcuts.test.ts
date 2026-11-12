// A12 (SPEC-app-shell.md "Keyboard shortcuts dialog"): exactly the normative rows, and every row
// is a key the app really has: the editor keymap (K1, K2, tool keys), the editor's K3 text keys
// or the host's K1. Test files may import the editor's private keymap (A1 lint rule).
import { describe, expect, it } from 'vitest';
import { canvasKey, globalCommand, hoverKeys, type KeyInfo } from '../../editor/model/keymap';
import { hostKey, type HostKeyContext } from './keys';
import { keyParts, SHORTCUTS } from './shortcuts';

const NOW_CONTEXT: HostKeyContext = {
  textTarget: false,
  selectionEmpty: true,
  idle: true,
  modal: false,
  fileBusy: false,
  empty: false,
  insideEditor: true,
  canReopen: true,
};

/** A chip text as `KeyboardEvent.key` (letters lower case; − is the minus key). */
function input(combo: string): KeyInfo & { readonly code?: string } {
  const parts = combo === '+' ? ['+'] : combo.split('+').map((p) => (p === '' ? '+' : p));
  const key = parts.at(-1) ?? '';
  const named: Record<string, string> = {
    Esc: 'Escape',
    '−': '-',
    '←': 'ArrowLeft',
    '↑': 'ArrowUp',
    '→': 'ArrowRight',
    '↓': 'ArrowDown',
  };
  return {
    key: named[key] ?? (key.length === 1 ? key.toLowerCase() : key),
    code: /^[0-9]$/.test(key) ? `Digit${key}` : undefined,
    ctrlKey: parts.includes('Ctrl'),
    shiftKey: parts.includes('Shift'),
    altKey: false,
    metaKey: false,
  };
}

const ATOM = { kind: 'atom', id: 'a1' } as never;
const BOND = { kind: 'bond', id: 'b1' } as never;

describe('SHORTCUTS', () => {
  it('has the eight sections of A12 in order', () => {
    expect(SHORTCUTS.map((s) => s.section)).toEqual([
      'Tools',
      'Pointing at an atom',
      'Pointing at a bond',
      'Editing',
      'Chemistry',
      'View',
      'Tabs and files',
      'While typing text',
    ]);
  });

  it('has exactly the rows of docs/mockups/shell/pages.mjs SHORTCUTS', () => {
    const rows = Object.fromEntries(
      SHORTCUTS.map((s) => [s.section, s.rows.map((r) => [r.keys.join(' '), r.meaning])]),
    );
    expect(rows).toEqual({
      Tools: [
        ['1 V', 'Select'],
        ['2 E', 'Erase'],
        ['3 B', 'Bond'],
        ['4 Z', 'Chain'],
        ['5 R', 'Ring'],
        ['6 L', 'Atom'],
        ['7 A', 'Arrow'],
        ['8 +', 'Plus'],
        ['9 M', 'Curved arrow'],
        ['0 T', 'Text'],
      ],
      'Pointing at an atom': [
        ['C H N O S P F I', 'Change it to that element'],
        ['L', 'Change it to chlorine (Cl)'],
        ['B', 'Change it to bromine (Br)'],
        ['+ −', 'Add a positive or negative charge'],
        ['1 2 3', 'Add a single, double or triple bond'],
        ['Enter', 'Type a label, such as OH or CH3'],
      ],
      'Pointing at a bond': [
        ['1 2 3', 'Make it single, double or triple'],
        ['W', 'Make it a wedge'],
        ['H', 'Make it a hash'],
      ],
      Editing: [
        ['Ctrl+Z', 'Undo'],
        ['Ctrl+Y', 'Redo'],
        ['Ctrl+C', 'Copy (the whole drawing when nothing is selected)'],
        ['Ctrl+X', 'Cut'],
        ['Ctrl+V', 'Paste'],
        ['Ctrl+D', 'Duplicate'],
        ['Ctrl+A', 'Select all'],
        ['Delete', 'Delete'],
        ['← ↑ → ↓', 'Move the selection (hold Shift to move further)'],
        ['Esc', 'Cancel, or clear the selection'],
      ],
      Chemistry: [
        ['Ctrl+F', 'Type a compound name'],
        ['Ctrl+Shift+L', 'Clean up'],
        ['Ctrl+Shift+K', 'Show Kekulé or circle'],
        ['Ctrl+Shift+R', 'Tidy reaction'],
      ],
      View: [
        ['Ctrl+=', 'Zoom in'],
        ['Ctrl+−', 'Zoom out'],
        ['Ctrl+0', 'Fit drawing'],
        ['Space+drag', 'Move around the drawing'],
      ],
      'Tabs and files': [
        ['Ctrl+T Ctrl+N', 'New tab'],
        ['Ctrl+W', 'Close tab'],
        ['Ctrl+Shift+T', 'Reopen closed tab'],
        ['Ctrl+Tab Ctrl+Shift+Tab', 'Next tab, previous tab'],
        ['Ctrl+1–8', 'Go to tab 1–8'],
        ['Ctrl+9', 'Go to the last tab'],
        ['Ctrl+O', 'Open'],
        ['Ctrl+S', 'Save'],
        ['Ctrl+Shift+S', 'Save as'],
        ['Ctrl+E', 'Export'],
        ['F10', 'Open the menu'],
        ['F1', 'This list'],
      ],
      'While typing text': [
        ['Enter', 'Finish'],
        ['Shift+Enter', 'New line'],
        ['Esc', 'Cancel'],
        ['Ctrl+B', 'Bold'],
        ['Ctrl+I', 'Italic'],
        ['Ctrl+=', 'Subscript'],
        ['Ctrl+Shift+=', 'Superscript'],
        ['Ctrl+Shift+D', 'Insert Δ (heat)'],
        ['Ctrl+Shift+H', 'Insert hν (light)'],
      ],
    });
  });
});

describe('keyParts: one chip per key joined by "+"', () => {
  it('splits combinations and keeps lone keys whole', () => {
    expect(keyParts('Ctrl+Shift+L')).toEqual([
      { kind: 'key', text: 'Ctrl' },
      { kind: 'key', text: 'Shift' },
      { kind: 'key', text: 'L' },
    ]);
    expect(keyParts('Ctrl+Shift+=')).toEqual([
      { kind: 'key', text: 'Ctrl' },
      { kind: 'key', text: 'Shift' },
      { kind: 'key', text: '=' },
    ]);
    expect(keyParts('+')).toEqual([{ kind: 'key', text: '+' }]);
    expect(keyParts('−')).toEqual([{ kind: 'key', text: '−' }]);
    expect(keyParts('F1')).toEqual([{ kind: 'key', text: 'F1' }]);
  });

  it('Ctrl+1–8 is two chips, the second one the range "1–8" (en dash)', () => {
    expect(keyParts('Ctrl+1–8')).toEqual([
      { kind: 'key', text: 'Ctrl' },
      { kind: 'key', text: '1–8' },
    ]);
    expect(keyParts('Ctrl+Shift+Tab').map((p) => p.text)).toEqual(['Ctrl', 'Shift', 'Tab']);
  });

  it('"drag" is a word, not a key chip', () => {
    expect(keyParts('Space+drag')).toEqual([
      { kind: 'key', text: 'Space' },
      { kind: 'word', text: 'drag' },
    ]);
  });
});

describe('every row is a key the app has (editor keymap, K3 or host K1)', () => {
  const rows = (section: string) => SHORTCUTS.find((s) => s.section === section)?.rows ?? [];
  const keys = (section: string) =>
    rows(section).flatMap((r) => r.keys.map((k) => [k, r] as const));

  it('Tools: each key selects that tool on the canvas', () => {
    const tools: Record<string, string> = {
      Select: 'select',
      Erase: 'erase',
      Bond: 'bond',
      Chain: 'chain',
      Ring: 'ring',
      Atom: 'atom',
      Arrow: 'arrow',
      Plus: 'plus',
      'Curved arrow': 'curved',
      Text: 'text',
    };
    for (const [key, row] of keys('Tools'))
      expect(hoverKeys(input(key), null, 'select'), key).toEqual({
        type: 'select-tool',
        tool: tools[row.meaning],
      });
    expect(keys('Tools').map(([k]) => k)).toEqual([
      '1',
      'V',
      '2',
      'E',
      '3',
      'B',
      '4',
      'Z',
      '5',
      'R',
      '6',
      'L',
      '7',
      'A',
      '8',
      '+',
      '9',
      'M',
      '0',
      'T',
    ]);
  });

  it('Pointing at an atom: hover keys on an atom', () => {
    const atom = (key: string) => hoverKeys(input(key), ATOM, 'select');
    for (const key of ['C', 'H', 'N', 'O', 'S', 'P', 'F', 'I'])
      expect(atom(key)).toEqual({
        type: 'hover-edit',
        edit: { kind: 'element', element: key },
      });
    expect(atom('L')).toEqual({ type: 'hover-edit', edit: { kind: 'element', element: 'Cl' } });
    expect(atom('B')).toEqual({ type: 'hover-edit', edit: { kind: 'element', element: 'Br' } });
    expect(atom('+')).toEqual({ type: 'hover-edit', edit: { kind: 'charge', delta: 1 } });
    expect(atom('−')).toEqual({ type: 'hover-edit', edit: { kind: 'charge', delta: -1 } });
    for (const order of [1, 2, 3])
      expect(atom(String(order))).toEqual({ type: 'hover-edit', edit: { kind: 'sprout', order } });
    expect(atom('Enter')).toEqual({ type: 'hover-edit', edit: { kind: 'label' } });
    const listed = keys('Pointing at an atom').map(([k]) => k);
    expect(listed).toEqual([
      'C',
      'H',
      'N',
      'O',
      'S',
      'P',
      'F',
      'I',
      'L',
      'B',
      '+',
      '−',
      '1',
      '2',
      '3',
      'Enter',
    ]);
  });

  it('Pointing at a bond: hover keys on a bond', () => {
    const bond = (key: string) => hoverKeys(input(key), BOND, 'select');
    for (const order of [1, 2, 3])
      expect(bond(String(order))).toEqual({ type: 'hover-edit', edit: { kind: 'order', order } });
    expect(bond('W')).toEqual({ type: 'hover-edit', edit: { kind: 'stereo', stereo: 'wedge' } });
    expect(bond('H')).toEqual({ type: 'hover-edit', edit: { kind: 'stereo', stereo: 'hash' } });
    expect(keys('Pointing at a bond').map(([k]) => k)).toEqual(['1', '2', '3', 'W', 'H']);
  });

  it('Editing, Chemistry and View: editor K1 commands and keys', () => {
    const command = (key: string) => globalCommand(input(key), 'all');
    expect(
      Object.fromEntries(
        [...keys('Editing'), ...keys('Chemistry'), ...keys('View')]
          .filter(([k]) => k.startsWith('Ctrl+'))
          .map(([k]) => [k, command(k)]),
      ),
    ).toEqual({
      'Ctrl+Z': 'undo',
      'Ctrl+Y': 'redo',
      'Ctrl+C': 'copy',
      'Ctrl+X': 'cut',
      'Ctrl+V': 'paste',
      'Ctrl+D': 'duplicate',
      'Ctrl+A': 'select-all',
      'Ctrl+F': 'focus-name-field',
      'Ctrl+Shift+L': 'clean-up',
      'Ctrl+Shift+K': 'toggle-kekulé',
      'Ctrl+Shift+R': 'tidy-reaction',
      'Ctrl+=': 'zoom-in',
      'Ctrl+−': 'zoom-out',
      'Ctrl+0': 'zoom-fit',
    });
    // Ctrl+C with nothing selected is the host's whole-drawing copy (the row says so).
    expect(hostKey(input('Ctrl+C'), NOW_CONTEXT)).toBe('copy-whole');
    expect(canvasKey(input('Delete'))).toEqual({ type: 'delete' });
    expect(canvasKey(input('Esc'))).toEqual({ type: 'escape' });
    expect(['←', '↑', '→', '↓'].map((k) => canvasKey(input(k))?.type)).toEqual([
      'nudge',
      'nudge',
      'nudge',
      'nudge',
    ]);
    expect(canvasKey({ ...input('←'), shiftKey: true })).toEqual({ type: 'nudge', dx: -1, dy: 0 });
    // Space+drag pans (SPEC-editor.md K1 "Space (hold, canvas focused)"): a held key, no command.
    expect(keys('View').find(([k]) => k === 'Space+drag')?.[1].meaning).toBe(
      'Move around the drawing',
    );
  });

  it('Tabs and files: the host keys (K1, R36, R45)', () => {
    const host = (combo: string): unknown => hostKey(input(combo), NOW_CONTEXT);
    const expected: Record<string, string> = {
      'Ctrl+T': 'new',
      'Ctrl+N': 'new',
      'Ctrl+W': 'close-tab',
      'Ctrl+Shift+T': 'reopen-tab',
      'Ctrl+Tab': 'next-tab',
      'Ctrl+Shift+Tab': 'previous-tab',
      'Ctrl+9': 'last-tab',
      'Ctrl+O': 'open',
      'Ctrl+S': 'save',
      'Ctrl+Shift+S': 'save-as',
      'Ctrl+E': 'export',
      F10: 'menu',
      F1: 'shortcuts',
    };
    const listed = keys('Tabs and files')
      .map(([k]) => k)
      .filter((k) => k !== 'Ctrl+1–8');
    expect(listed).toEqual(Object.keys(expected));
    for (const [combo, action] of Object.entries(expected)) expect(host(combo), combo).toBe(action);
  });

  it('Ctrl+1–8 expands to eight real keys, by physical key (R45)', () => {
    const range = keys('Tabs and files').find(([k]) => k === 'Ctrl+1–8');
    expect(range?.[1].meaning).toBe('Go to tab 1–8');
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8])
      expect(hostKey(input(`Ctrl+${n}`), NOW_CONTEXT), `Ctrl+${n}`).toBe(`tab-${n}`);
    // Devanagari digits: `key` differs, the physical key still goes to the tab.
    expect(hostKey({ ...input('Ctrl+3'), key: '३' }, NOW_CONTEXT)).toBe('tab-3');
  });

  it('Ctrl+Shift+T reopens only when a closed tab can come back', () => {
    expect(hostKey(input('Ctrl+Shift+T'), { ...NOW_CONTEXT, canReopen: false })).toBeNull();
  });

  it('no row names a key the editor has taken: Ctrl+1 is not Zoom to 100% and Tidy is Ctrl+Shift+R', () => {
    expect(globalCommand(input('Ctrl+1'), 'all')).toBeNull();
    expect(globalCommand(input('Ctrl+Shift+T'), 'all')).toBeNull();
    expect(globalCommand(input('Ctrl+Shift+R'), 'all')).toBe('tidy-reaction');
    const all = SHORTCUTS.flatMap((s) => s.rows.flatMap((r) => r.keys));
    expect(all).not.toContain('Ctrl+1');
  });

  it('While typing text: the editor K3 keys (SPEC-editor.md K3)', () => {
    expect(keys('While typing text').map(([k]) => k)).toEqual([
      'Enter',
      'Shift+Enter',
      'Esc',
      'Ctrl+B',
      'Ctrl+I',
      'Ctrl+=',
      'Ctrl+Shift+=',
      'Ctrl+Shift+D',
      'Ctrl+Shift+H',
    ]);
  });

  it('every editor K1, K2 and tool key and every host K1 key is listed at least once', () => {
    const listed = new Set(SHORTCUTS.flatMap((s) => s.rows.flatMap((r) => r.keys)));
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    const editorK1 = [
      'Ctrl+Z',
      'Ctrl+Y',
      'Ctrl+C',
      'Ctrl+X',
      'Ctrl+V',
      'Ctrl+D',
      'Ctrl+A',
      'Delete',
      'Ctrl+F',
      'Ctrl+=',
      'Ctrl+−',
      'Ctrl+0',
      'Ctrl+Shift+K',
      'Ctrl+Shift+L',
      'Ctrl+Shift+R',
      '←',
      '↑',
      '→',
      '↓',
      'Esc',
      'Space+drag',
    ];
    const editorK2 = [
      'C',
      'H',
      'N',
      'O',
      'S',
      'P',
      'F',
      'I',
      'L',
      'B',
      '+',
      '−',
      '1',
      '2',
      '3',
      'Enter',
      'W',
    ];
    const toolKeys = ['V', 'E', 'B', 'Z', 'R', 'L', 'A', '+', 'M', 'T', ...digits];
    const editorK3 = [
      'Enter',
      'Shift+Enter',
      'Esc',
      'Ctrl+B',
      'Ctrl+I',
      'Ctrl+=',
      'Ctrl+Shift+=',
      'Ctrl+Shift+D',
      'Ctrl+Shift+H',
    ];
    const hostK1 = [
      'Ctrl+T',
      'Ctrl+N',
      'Ctrl+W',
      'Ctrl+Shift+T',
      'Ctrl+Tab',
      'Ctrl+Shift+Tab',
      'Ctrl+1–8',
      'Ctrl+9',
      'Ctrl+O',
      'Ctrl+S',
      'Ctrl+Shift+S',
      'Ctrl+E',
      'F10',
      'F1',
      'Ctrl+C',
      'Ctrl+V',
      'Ctrl+F',
    ];
    for (const key of [...editorK1, ...editorK2, ...toolKeys, ...editorK3, ...hostK1])
      expect(listed.has(key), key).toBe(true);
    // Aliases left out of the dialog on purpose (A12): they work, the list names the main keys.
    for (const alias of ['Ctrl+PageDown', 'Ctrl+PageUp'])
      expect(listed.has(alias), alias).toBe(false);
    expect(hostKey(input('Ctrl+PageDown'), NOW_CONTEXT)).toBe('next-tab');
    expect(hostKey(input('Ctrl+PageUp'), NOW_CONTEXT)).toBe('previous-tab');
    // A lone Alt opens the menu too (M4, altGuard); it is not a chip either.
    expect(listed.has('Alt')).toBe(false);
    // And the editor really has each listed K1 key, so nothing above is invented.
    for (const key of editorK1.filter((k) => k.startsWith('Ctrl+')))
      expect(globalCommand(input(key), 'all'), key).not.toBeNull();
  });
});

// The Keyboard shortcuts dialog's content (SPEC-app-shell.md "Keyboard shortcuts dialog"; A12):
// exactly the rows of `docs/mockups/shell/pages.mjs` SHORTCUTS (R27: a tool's digit, then its
// letter). `shortcuts.test.ts` checks each row against the editor keymap, the editor's K3 keys and the host's K1.

export interface ShortcutRow {
  /** Alternatives shown side by side; a combination is written `Ctrl+Shift+L`. */
  readonly keys: readonly string[];
  readonly meaning: string;
}

export interface ShortcutSection {
  readonly section: string;
  readonly rows: readonly ShortcutRow[];
}

const row = (keys: readonly string[], meaning: string): ShortcutRow => ({ keys, meaning });

export const SHORTCUTS: readonly ShortcutSection[] = [
  {
    section: 'Tools',
    rows: [
      row(['1', 'V'], 'Select'),
      row(['2', 'E'], 'Erase'),
      row(['3', 'B'], 'Bond'),
      row(['4', 'Z'], 'Chain'),
      row(['5', 'R'], 'Ring'),
      row(['6', 'L'], 'Atom'),
      row(['7', 'A'], 'Arrow'),
      row(['8', '+'], 'Plus'),
      row(['9', 'M'], 'Curved arrow'),
      row(['0', 'T'], 'Text'),
    ],
  },
  {
    section: 'Pointing at an atom',
    rows: [
      row(['C', 'H', 'N', 'O', 'S', 'P', 'F', 'I'], 'Change it to that element'),
      row(['L'], 'Change it to chlorine (Cl)'),
      row(['B'], 'Change it to bromine (Br)'),
      row(['+', '−'], 'Add a positive or negative charge'),
      row(['1', '2', '3'], 'Add a single, double or triple bond'),
      row(['Enter'], 'Type a label, such as OH or CH3'),
    ],
  },
  {
    section: 'Pointing at a bond',
    rows: [
      row(['1', '2', '3'], 'Make it single, double or triple'),
      row(['W'], 'Make it a wedge'),
      row(['H'], 'Make it a hash'),
    ],
  },
  {
    section: 'Editing',
    rows: [
      row(['Ctrl+Z'], 'Undo'),
      row(['Ctrl+Y'], 'Redo'),
      row(['Ctrl+C'], 'Copy (the whole drawing when nothing is selected)'),
      row(['Ctrl+X'], 'Cut'),
      row(['Ctrl+V'], 'Paste'),
      row(['Ctrl+D'], 'Duplicate'),
      row(['Ctrl+A'], 'Select all'),
      row(['Delete'], 'Delete'),
      row(['←', '↑', '→', '↓'], 'Move the selection (hold Shift to move further)'),
      row(['Esc'], 'Cancel, or clear the selection'),
    ],
  },
  {
    section: 'Chemistry',
    rows: [
      row(['Ctrl+F'], 'Type a compound name'),
      row(['Ctrl+Shift+L'], 'Clean up'),
      row(['Ctrl+Shift+K'], 'Show Kekulé or circle'),
      row(['Ctrl+Shift+R'], 'Tidy reaction'),
    ],
  },
  {
    section: 'View',
    rows: [
      row(['Ctrl+='], 'Zoom in'),
      row(['Ctrl+−'], 'Zoom out'),
      row(['Ctrl+0'], 'Fit drawing'),
      row(['Space+drag'], 'Move around the drawing'),
    ],
  },
  {
    section: 'Files',
    rows: [
      row(['Ctrl+N'], 'New drawing'),
      row(['Ctrl+O'], 'Open'),
      row(['Ctrl+S'], 'Save'),
      row(['Ctrl+Shift+S'], 'Save as'),
      row(['Ctrl+E'], 'Export'),
      row(['F1'], 'This list'),
    ],
  },
  {
    section: 'While typing text',
    rows: [
      row(['Enter'], 'Finish'),
      row(['Shift+Enter'], 'New line'),
      row(['Esc'], 'Cancel'),
      row(['Ctrl+B'], 'Bold'),
      row(['Ctrl+I'], 'Italic'),
      row(['Ctrl+='], 'Subscript'),
      row(['Ctrl+Shift+='], 'Superscript'),
      row(['Ctrl+Shift+D'], 'Insert Δ (heat)'),
      row(['Ctrl+Shift+H'], 'Insert hν (light)'),
    ],
  },
];

/** One part of a key combination: a key chip, or a plain word ("drag"). */
export interface KeyPart {
  readonly kind: 'key' | 'word';
  readonly text: string;
}

/** `Ctrl+Shift+L` → three chips; a lone `+` is the plus key; `drag` is a word, not a key. */
export function keyParts(combo: string): KeyPart[] {
  if (combo === '+') return [{ kind: 'key', text: '+' }];
  return combo.split('+').map((part) => {
    const text = part === '' ? '+' : part;
    return { kind: text === 'drag' ? 'word' : 'key', text };
  });
}

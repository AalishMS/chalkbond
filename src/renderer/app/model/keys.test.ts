// K1 host keys (SPEC-app-shell.md "Keyboard (host keys)"): the full table (C8: Ctrl+C, C9:
// Ctrl+V, A8: Ctrl+N / O / S / Shift+S, C10: Ctrl+E, A11: F1, Ctrl+F), the K2 conflict check
// against the editor's keymap and the K3 Alt rule; TB22 adds the tab keys (R36, R45), F10 and the
// lone Alt.
import { describe, expect, it } from 'vitest';
import { canvasKey, globalCommand, hoverKeys } from '../../editor/model/keymap';
import {
  ALT_IDLE,
  altGuard,
  hostKey,
  type AltDecision,
  type AltGuardEvent,
  type AltState,
  type HostKeyAction,
  type HostKeyContext,
  type KeyInput,
} from './keys';

const ctrl = (key: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key,
  ctrlKey: true,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});
const canvas: HostKeyContext = {
  textTarget: false,
  selectionEmpty: true,
  idle: true,
  modal: false,
  fileBusy: false,
  empty: false,
  insideEditor: true,
};

describe('hostKey', () => {
  it('Ctrl+C on a non-text target with nothing selected copies the whole drawing (CB-K)', () => {
    expect(hostKey(ctrl('c'), canvas)).toBe('copy-whole');
    expect(hostKey(ctrl('C'), canvas)).toBe('copy-whole'); // Caps Lock
  });

  it('leaves Ctrl+C with a selection to the editor, which calls onCopy', () => {
    expect(hostKey(ctrl('c'), { ...canvas, selectionEmpty: false })).toBeNull();
    expect(globalCommand(ctrl('c'), 'all')).toBe('copy');
  });

  it('never handles Ctrl+C in a text target (R4: native text copy)', () => {
    expect(hostKey(ctrl('c'), { ...canvas, textTarget: true })).toBeNull();
    expect(hostKey(ctrl('c'), { ...canvas, textTarget: true, selectionEmpty: false })).toBeNull();
  });

  it('handles no other chord: Ctrl+X stays the editor cut, modifiers rule out Ctrl+C', () => {
    expect(hostKey(ctrl('x'), canvas)).toBeNull();
    expect(hostKey(ctrl('c', { shiftKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('c', { altKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('c', { metaKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('c', { ctrlKey: false }), canvas)).toBeNull();
    expect(hostKey(ctrl('Control'), canvas)).toBeNull();
  });

  it('Ctrl+V on a non-text target while idle pastes (CB-K: the editor paste is not reached)', () => {
    expect(hostKey(ctrl('v'), canvas)).toBe('paste');
    expect(hostKey(ctrl('V'), canvas)).toBe('paste'); // Caps Lock
    expect(hostKey(ctrl('v'), { ...canvas, selectionEmpty: false })).toBe('paste');
  });

  it('leaves Ctrl+V in a text target to native text paste (R4), and while busy', () => {
    expect(hostKey(ctrl('v'), { ...canvas, textTarget: true })).toBeNull();
    expect(hostKey(ctrl('v'), { ...canvas, textTarget: true, selectionEmpty: false })).toBeNull();
    expect(hostKey(ctrl('v'), { ...canvas, idle: false })).toBeNull();
    expect(hostKey(ctrl('v', { shiftKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('v', { altKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('v', { ctrlKey: false }), canvas)).toBeNull();
  });
});

describe('file keys (A8: F1 New, F2 Open, F5 Save, F6 Save as)', () => {
  const rows = [
    ['n', false, 'new'],
    ['o', false, 'open'],
    ['s', false, 'save'],
    ['s', true, 'save-as'],
  ] as const;

  it('idle on the canvas, with a selection, and in the name field (a text target)', () => {
    for (const [key, shiftKey, action] of rows) {
      expect(hostKey(ctrl(key, { shiftKey }), canvas)).toBe(action);
      expect(hostKey(ctrl(key.toUpperCase(), { shiftKey }), canvas)).toBe(action); // Caps Lock
      expect(hostKey(ctrl(key, { shiftKey }), { ...canvas, selectionEmpty: false })).toBe(action);
      expect(hostKey(ctrl(key, { shiftKey }), { ...canvas, textTarget: true })).toBe(action);
    }
  });

  it('ignored while busy (gesture, label or text editor), a flow runs, or a dialog is open', () => {
    for (const [key, shiftKey] of rows) {
      expect(hostKey(ctrl(key, { shiftKey }), { ...canvas, idle: false })).toBeNull();
      expect(
        hostKey(ctrl(key, { shiftKey }), { ...canvas, idle: false, textTarget: true }),
      ).toBeNull();
      expect(hostKey(ctrl(key, { shiftKey }), { ...canvas, fileBusy: true })).toBeNull();
      expect(hostKey(ctrl(key, { shiftKey }), { ...canvas, modal: true })).toBeNull();
    }
    expect(hostKey(ctrl('v'), { ...canvas, modal: true })).toBeNull();
    expect(hostKey(ctrl('c'), { ...canvas, modal: true })).toBeNull();
  });

  it('needs Ctrl alone (Shift only for Save as): Alt, Meta and Ctrl+Shift+N/O do nothing', () => {
    for (const key of ['n', 'o', 's']) {
      expect(hostKey(ctrl(key, { altKey: true }), canvas)).toBeNull();
      expect(hostKey(ctrl(key, { metaKey: true }), canvas)).toBeNull();
      expect(hostKey(ctrl(key, { ctrlKey: false }), canvas)).toBeNull();
    }
    expect(hostKey(ctrl('n', { shiftKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('o', { shiftKey: true }), canvas)).toBeNull();
  });

  it('K2: the editor has no command for them', () => {
    for (const [key, shiftKey] of rows) {
      expect(globalCommand(ctrl(key, { shiftKey }), 'all')).toBeNull();
      expect(canvasKey(ctrl(key, { shiftKey }))).toBeNull();
    }
  });
});

describe('Ctrl+E (C10: the Export dialog)', () => {
  it('opens the dialog when idle and the drawing is not empty, from the canvas or the name field', () => {
    expect(hostKey(ctrl('e'), canvas)).toBe('export');
    expect(hostKey(ctrl('E'), canvas)).toBe('export'); // Caps Lock
    expect(hostKey(ctrl('e'), { ...canvas, selectionEmpty: false })).toBe('export');
    expect(hostKey(ctrl('e'), { ...canvas, textTarget: true })).toBe('export');
  });

  it('does nothing on an empty drawing, while busy, or while a dialog is open', () => {
    expect(hostKey(ctrl('e'), { ...canvas, empty: true })).toBeNull();
    expect(hostKey(ctrl('e'), { ...canvas, idle: false })).toBeNull();
    expect(hostKey(ctrl('e'), { ...canvas, modal: true })).toBeNull();
  });

  it('needs Ctrl alone', () => {
    expect(hostKey(ctrl('e', { shiftKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('e', { altKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('e', { metaKey: true }), canvas)).toBeNull();
    expect(hostKey(ctrl('e', { ctrlKey: false }), canvas)).toBeNull();
  });

  it('while a dialog is open no host key acts (K1)', () => {
    for (const key of ['n', 'o', 's', 'e', 'c', 'v'])
      expect(hostKey(ctrl(key), { ...canvas, modal: true })).toBeNull();
  });

  it('K2: the editor has no command for Ctrl+E', () => {
    expect(globalCommand(ctrl('e'), 'all')).toBeNull();
    expect(canvasKey(ctrl('e'))).toBeNull();
  });
});

const plain = (key: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  ...ctrl(key, mods),
  ctrlKey: mods.ctrlKey ?? false,
});

describe('F1 (A11: the Keyboard shortcuts dialog)', () => {
  it('opens the list when idle, from the canvas, the name field or outside the editor', () => {
    expect(hostKey(plain('F1'), canvas)).toBe('shortcuts');
    expect(hostKey(plain('F1'), { ...canvas, textTarget: true })).toBe('shortcuts');
    expect(hostKey(plain('F1'), { ...canvas, insideEditor: false })).toBe('shortcuts');
    expect(hostKey(plain('F1'), { ...canvas, empty: true, fileBusy: true })).toBe('shortcuts');
  });

  it('does nothing while busy (a label or text editor is open) or a dialog is open', () => {
    expect(hostKey(plain('F1'), { ...canvas, idle: false })).toBeNull();
    expect(hostKey(plain('F1'), { ...canvas, idle: false, textTarget: true })).toBeNull();
    expect(hostKey(plain('F1'), { ...canvas, modal: true })).toBeNull();
  });

  it('needs F1 alone', () => {
    for (const mods of [{ ctrlKey: true }, { altKey: true }, { shiftKey: true }, { metaKey: true }])
      expect(hostKey(plain('F1', mods), canvas)).toBeNull();
    expect(hostKey(plain('F2'), canvas)).toBeNull();
  });
});

describe('Ctrl+F outside the editor root (A11)', () => {
  it('asks the editor to focus the name field when the target is outside it (e.g. body)', () => {
    expect(hostKey(ctrl('f'), { ...canvas, insideEditor: false })).toBe('focus-name');
    expect(hostKey(ctrl('F'), { ...canvas, insideEditor: false })).toBe('focus-name');
  });

  it('inside the editor its own Ctrl+F acts; modifiers and dialogs rule it out', () => {
    expect(hostKey(ctrl('f'), canvas)).toBeNull();
    expect(globalCommand(ctrl('f'), 'all')).toBe('focus-name-field');
    const outside = { ...canvas, insideEditor: false };
    expect(hostKey(ctrl('f'), { ...outside, modal: true })).toBeNull();
    expect(hostKey(ctrl('f', { shiftKey: true }), outside)).toBeNull();
    expect(hostKey(ctrl('f', { altKey: true }), outside)).toBeNull();
    expect(hostKey(ctrl('f', { metaKey: true }), outside)).toBeNull();
  });
});

describe('K1 complete: every row and nothing else', () => {
  it('claims exactly the K1 keys on a ready canvas', () => {
    const keys = [
      ...'abcdefghijklmnopqrstuvwxyz0123456789=-+',
      'F1',
      'F2',
      'F10',
      'Tab',
      'Delete',
      'Escape',
      'Enter',
      'ArrowLeft',
      'Alt',
    ];
    const claimed: string[] = [];
    for (const key of keys)
      for (const ctrlKey of [false, true])
        for (const shiftKey of [false, true])
          for (const insideEditor of [true, false]) {
            const action = hostKey(plain(key, { ctrlKey, shiftKey }), {
              ...canvas,
              insideEditor,
            });
            if (action !== null)
              claimed.push(
                `${ctrlKey ? 'Ctrl+' : ''}${shiftKey ? 'Shift+' : ''}${key}${insideEditor ? '' : ' (outside)'}=${action}`,
              );
          }
    expect(claimed.sort()).toEqual(
      [
        'Ctrl+n=new',
        'Ctrl+n (outside)=new',
        'Ctrl+o=open',
        'Ctrl+o (outside)=open',
        'Ctrl+s=save',
        'Ctrl+s (outside)=save',
        'Ctrl+Shift+s=save-as',
        'Ctrl+Shift+s (outside)=save-as',
        'Ctrl+e=export',
        'Ctrl+e (outside)=export',
        'Ctrl+c=copy-whole',
        'Ctrl+c (outside)=copy-whole',
        'Ctrl+v=paste',
        'Ctrl+v (outside)=paste',
        'Ctrl+f (outside)=focus-name',
        'F1=shortcuts',
        'F1 (outside)=shortcuts',
        'F10=menu',
        'F10 (outside)=menu',
        'Ctrl+t=new',
        'Ctrl+t (outside)=new',
        'Ctrl+w=close-tab',
        'Ctrl+w (outside)=close-tab',
        'Ctrl+Tab=next-tab',
        'Ctrl+Tab (outside)=next-tab',
        'Ctrl+Shift+Tab=previous-tab',
        'Ctrl+Shift+Tab (outside)=previous-tab',
      ].sort(),
    );
  });
});

describe('K2 conflict check against the editor keymap', () => {
  /** SPEC-editor.md K3: the label and text editor keys. */
  const EDITOR_K3 = [
    ctrl('b'),
    ctrl('i'),
    ctrl('='),
    ctrl('=', { shiftKey: true }),
    ctrl('+', { shiftKey: true }),
    ctrl('d', { shiftKey: true }),
    ctrl('h', { shiftKey: true }),
  ];
  const HOST = [
    ctrl('n'),
    ctrl('o'),
    ctrl('s'),
    ctrl('s', { shiftKey: true }),
    ctrl('e'),
    plain('F1'),
  ];
  const same = (a: KeyInput, b: KeyInput) =>
    a.key.toLowerCase() === b.key.toLowerCase() &&
    a.ctrlKey === b.ctrlKey &&
    a.shiftKey === b.shiftKey &&
    a.altKey === b.altKey &&
    a.metaKey === b.metaKey;

  it("the host's keys have no editor command: globalCommand, canvasKey, hover or tool keys", () => {
    for (const key of HOST) {
      expect(globalCommand(key, 'all'), key.key).toBeNull();
      expect(canvasKey(key), key.key).toBeNull();
      expect(hoverKeys(key, null, 'select'), key.key).toBeNull();
      expect(hoverKeys(key, { kind: 'atom', id: 'a1' } as never, 'bond'), key.key).toBeNull();
      expect(hoverKeys(key, { kind: 'bond', id: 'b1' } as never, 'bond'), key.key).toBeNull();
    }
  });

  it('none of them is an editor K3 key', () => {
    for (const host of HOST)
      for (const k3 of EDITOR_K3) expect(same(host, k3), `${host.key} vs ${k3.key}`).toBe(false);
  });

  it("K2 extended: the tab keys and F10 have no editor command (TB3 moved the editor's)", () => {
    const tabKeys = [
      ctrl('t'),
      ctrl('w'),
      ctrl('Tab'),
      ctrl('Tab', { shiftKey: true }),
      ctrl('PageUp'),
      ctrl('PageDown'),
      ctrl('T', { shiftKey: true }),
      plain('F10'),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [
        ctrl(String(n), { code: `Digit${n}` }),
        ctrl('१', { code: `Digit${n}` }), // a Devanagari digit as `key`
      ]),
    ];
    for (const key of tabKeys) {
      const name = `${key.key} ${key.code ?? ''}`;
      expect(globalCommand(key, 'all'), name).toBeNull();
      expect(canvasKey(key), name).toBeNull();
      expect(hoverKeys(key, null, 'select'), name).toBeNull();
      expect(hoverKeys(key, { kind: 'atom', id: 'a1' } as never, 'bond'), name).toBeNull();
      expect(hoverKeys(key, { kind: 'bond', id: 'b1' } as never, 'bond'), name).toBeNull();
    }
  });

  it('Ctrl+Shift+R is the editor Tidy, not a host key; Ctrl+Shift+0 is bound by neither', () => {
    const tidy = ctrl('R', { shiftKey: true });
    expect(globalCommand(tidy, 'all')).toBe('tidy-reaction');
    expect(hostKey(tidy, canvas)).toBeNull();
    const zero = ctrl(')', { shiftKey: true, code: 'Digit0' });
    expect(globalCommand(zero, 'all')).toBeNull();
    expect(canvasKey(zero)).toBeNull();
    expect(hostKey(zero, { ...canvas, canReopen: true })).toBeNull();
    expect(hostKey(ctrl('0', { code: 'Digit0' }), canvas)).toBeNull();
  });

  it('menu access keys need Alt, which every editor key requires up', () => {
    for (const key of 'fevhn') {
      const alt = plain(key, { altKey: true });
      expect(globalCommand(alt, 'all')).toBeNull();
      expect(canvasKey(alt)).toBeNull();
      expect(hoverKeys(alt, null, 'select')).toBeNull();
      expect(hostKey(alt, canvas)).toBeNull();
    }
  });
});

const tabRows: [string, KeyInput, HostKeyAction][] = [
  ['Ctrl+T', ctrl('t'), 'new'],
  ['Ctrl+N', ctrl('n'), 'new'],
  ['Ctrl+W', ctrl('w'), 'close-tab'],
  ['Ctrl+Tab', ctrl('Tab'), 'next-tab'],
  ['Ctrl+PageDown', ctrl('PageDown'), 'next-tab'],
  ['Ctrl+Shift+Tab', ctrl('Tab', { shiftKey: true }), 'previous-tab'],
  ['Ctrl+PageUp', ctrl('PageUp'), 'previous-tab'],
  ['Ctrl+Shift+T', ctrl('T', { shiftKey: true }), 'reopen-tab'],
];

describe('tab keys (R36)', () => {
  const reopenable = { ...canvas, canReopen: true };

  it('idle, on the canvas, with a selection and in the name field', () => {
    for (const [name, key, action] of tabRows) {
      expect(hostKey(key, reopenable), name).toBe(action);
      expect(hostKey(key, { ...reopenable, selectionEmpty: false }), name).toBe(action);
      expect(hostKey(key, { ...reopenable, textTarget: true }), name).toBe(action);
      expect(hostKey(key, { ...reopenable, insideEditor: false }), name).toBe(action);
    }
  });

  it('letters match either case (Caps Lock)', () => {
    expect(hostKey(ctrl('T'), canvas)).toBe('new');
    expect(hostKey(ctrl('W'), canvas)).toBe('close-tab');
    expect(hostKey(ctrl('t', { shiftKey: true }), { ...canvas, canReopen: true })).toBe(
      'reopen-tab',
    );
  });

  it('nothing while a label or text editor is open, a flow runs or a dialog is open', () => {
    for (const [name, key] of tabRows) {
      expect(hostKey(key, { ...reopenable, idle: false }), name).toBeNull();
      expect(hostKey(key, { ...reopenable, idle: false, textTarget: true }), name).toBeNull();
      expect(hostKey(key, { ...reopenable, fileBusy: true }), name).toBeNull();
      expect(hostKey(key, { ...reopenable, modal: true }), name).toBeNull();
    }
  });

  it('Ctrl+Shift+T needs a non-empty reopen list (absent counts as empty)', () => {
    const key = ctrl('T', { shiftKey: true });
    expect(hostKey(key, { ...canvas, canReopen: false })).toBeNull();
    expect(hostKey(key, canvas)).toBeNull();
    expect(hostKey(key, { ...canvas, canReopen: true })).toBe('reopen-tab');
  });

  it('needs Ctrl, and no Alt or Meta; Shift only where the row says so', () => {
    for (const [name, key] of tabRows) {
      expect(hostKey({ ...key, ctrlKey: false }, reopenable), name).toBeNull();
      expect(hostKey({ ...key, altKey: true }, reopenable), name).toBeNull();
      expect(hostKey({ ...key, metaKey: true }, reopenable), name).toBeNull();
    }
    expect(hostKey(ctrl('w', { shiftKey: true }), reopenable)).toBeNull();
    expect(hostKey(ctrl('PageDown', { shiftKey: true }), reopenable)).toBeNull();
    expect(hostKey(ctrl('PageUp', { shiftKey: true }), reopenable)).toBeNull();
    expect(hostKey(plain('Tab'), reopenable)).toBeNull();
    expect(hostKey(plain('PageDown'), reopenable)).toBeNull();
  });

  it('Ctrl+1 ... Ctrl+8 go to tab n and Ctrl+9 to the last, by `code` (R45)', () => {
    for (let n = 1; n <= 9; n++) {
      const want = n === 9 ? 'last-tab' : `tab-${n}`;
      for (const code of [`Digit${n}`, `Numpad${n}`]) {
        expect(hostKey(ctrl(String(n), { code }), canvas), code).toBe(want);
        // A Devanagari digit as `key` (Nepali layout), and a symbol (AZERTY needs Shift for 1).
        expect(hostKey(ctrl('१', { code }), canvas), code).toBe(want);
        expect(hostKey(ctrl('&', { code }), canvas), code).toBe(want);
        expect(hostKey(ctrl(String(n), { code }), { ...canvas, textTarget: true }), code).toBe(
          want,
        );
      }
      // `key` alone is not enough: no physical key, no match.
      expect(hostKey(ctrl(String(n)), canvas)).toBeNull();
    }
  });

  it('Ctrl+9 is one action whatever the tab count: the tab model picks the last tab', () => {
    // The context carries no tab count: the host asks `tabs.last` (1, 3 or 12 tabs alike).
    expect(hostKey(ctrl('9', { code: 'Digit9' }), canvas)).toBe('last-tab');
    expect(hostKey(ctrl('9', { code: 'Numpad9' }), { ...canvas, canReopen: true })).toBe(
      'last-tab',
    );
  });

  it('digits need Ctrl alone, idle, no flow or dialog; Ctrl+0 and other codes do nothing', () => {
    const one = ctrl('1', { code: 'Digit1' });
    expect(hostKey({ ...one, shiftKey: true }, canvas)).toBeNull();
    expect(hostKey({ ...one, altKey: true }, canvas)).toBeNull();
    expect(hostKey({ ...one, metaKey: true }, canvas)).toBeNull();
    expect(hostKey({ ...one, ctrlKey: false }, canvas)).toBeNull();
    expect(hostKey(one, { ...canvas, idle: false })).toBeNull();
    expect(hostKey(one, { ...canvas, fileBusy: true })).toBeNull();
    expect(hostKey(one, { ...canvas, modal: true })).toBeNull();
    for (const code of ['Digit0', 'Numpad0', 'KeyA', 'Digit10', 'XDigit1', 'NumpadAdd', ''])
      expect(hostKey(ctrl('1', { code }), canvas), code).toBeNull();
  });
});

describe('F10 (M4: the ☰ menu)', () => {
  it('opens the menu alone, idle or busy, in a text target or outside the editor', () => {
    expect(hostKey(plain('F10'), canvas)).toBe('menu');
    expect(hostKey(plain('F10'), { ...canvas, idle: false })).toBe('menu');
    expect(hostKey(plain('F10'), { ...canvas, textTarget: true, idle: false })).toBe('menu');
    expect(hostKey(plain('F10'), { ...canvas, insideEditor: false, fileBusy: true })).toBe('menu');
  });

  it('does nothing while a dialog is open, or with a modifier (Shift+F10 is the context key)', () => {
    expect(hostKey(plain('F10'), { ...canvas, modal: true })).toBeNull();
    for (const mods of [{ ctrlKey: true }, { altKey: true }, { shiftKey: true }, { metaKey: true }])
      expect(hostKey(plain('F10', mods), canvas)).toBeNull();
  });
});

describe('K3 Alt: the R4 guard and the lone Alt (M4)', () => {
  /** Feed events through `altGuard`; returns every decision. */
  function run(events: AltGuardEvent[], start: AltState = ALT_IDLE): AltDecision[] {
    const out: AltDecision[] = [];
    let state = start;
    for (const e of events) {
      const d = altGuard(state, e);
      state = d.state;
      out.push(d);
    }
    return out;
  }
  const altDown = (extra: { repeat?: boolean; otherModifier?: boolean } = {}): AltGuardEvent => ({
    type: 'keydown',
    key: 'Alt',
    repeat: false,
    ...extra,
  });
  const altUp: AltGuardEvent = { type: 'keyup', key: 'Alt' };
  const click = (altKey: boolean): AltGuardEvent => ({ type: 'pointerdown', altKey });
  const down = (key: string): AltGuardEvent => ({ type: 'keydown', key, repeat: false });
  const opened = (events: AltGuardEvent[]): boolean => run(events).some((d) => d.open);

  it('Alt alone opens the menu on the key-up and prevents it', () => {
    const [d1, d2] = run([altDown(), altUp]);
    expect(d1).toEqual({ state: { armed: false, alone: true }, prevent: false, open: false });
    expect(d2).toEqual({ state: ALT_IDLE, prevent: true, open: true });
  });

  it("Alt's auto-repeat does not count as another key", () => {
    expect(opened([altDown(), altDown({ repeat: true }), altDown({ repeat: true }), altUp])).toBe(
      true,
    );
  });

  it('opens once: a second key-up without a key-down opens nothing', () => {
    const d = run([altDown(), altUp, altUp]);
    expect(d[1]?.open).toBe(true);
    expect(d[2]).toEqual({ state: ALT_IDLE, prevent: false, open: false });
  });

  it('Alt then click then up opens nothing; the Alt+click guard prevents that key-up (R4)', () => {
    const d = run([altDown(), click(true), altDown({ repeat: true }), altUp]);
    expect(d.some((x) => x.open)).toBe(false);
    expect(d[3]).toEqual({ state: ALT_IDLE, prevent: true, open: false });
    // A later lone Alt opens again.
    expect(opened([altDown(), click(true), altUp, altDown(), altUp])).toBe(true);
  });

  it('an Alt+click with Alt already held (R4): the next Alt key-up is prevented, opens nothing', () => {
    let s = altGuard(ALT_IDLE, click(true));
    expect(s).toEqual({ state: { armed: true, alone: false }, prevent: false, open: false });
    s = altGuard(s.state, { type: 'keydown', key: 'Alt', repeat: true });
    expect(s.state).toEqual({ armed: true, alone: false });
    s = altGuard(s.state, altUp);
    expect(s).toEqual({ state: ALT_IDLE, prevent: true, open: false });
    expect(altGuard(s.state, altUp)).toEqual({ state: ALT_IDLE, prevent: false, open: false });
  });

  it('a click without Alt between down and up cancels the lone Alt and does not arm', () => {
    const d = run([altDown(), click(false), altUp]);
    expect(d[1]?.state).toEqual(ALT_IDLE);
    expect(d[2]).toEqual({ state: ALT_IDLE, prevent: false, open: false });
  });

  it('Alt+Tab, Alt+F4, Alt+letter: another key between down and up opens nothing', () => {
    for (const key of ['Tab', 'F4', 'f', 'ArrowLeft', 'Shift', 'Control'])
      expect(opened([altDown(), down(key), altUp]), key).toBe(false);
  });

  it('Alt+Shift (language switch), Shift first or Alt first, opens nothing', () => {
    expect(opened([altDown(), down('Shift'), altUp])).toBe(false);
    expect(opened([altDown(), down('Shift'), { type: 'keyup', key: 'Shift' }, altUp])).toBe(false);
    expect(opened([down('Shift'), altDown({ otherModifier: true }), altUp])).toBe(false);
    expect(opened([down('Control'), altDown({ otherModifier: true }), altUp])).toBe(false);
  });

  it('a window blur between down and up opens nothing (Alt+Tab away and back)', () => {
    expect(opened([altDown(), { type: 'blur' }, altUp])).toBe(false);
    const [, b] = run([altDown(), { type: 'blur' }]);
    expect(b?.state).toEqual(ALT_IDLE);
  });

  it('a blur clears an armed guard; the next lone Alt opens', () => {
    expect(opened([click(true), { type: 'blur' }, altDown(), altUp])).toBe(true);
  });

  it('a key-up of Alt with no key-down seen (focus came back with Alt held) opens nothing', () => {
    expect(run([altUp])[0]).toEqual({ state: ALT_IDLE, prevent: false, open: false });
  });

  it('an open dialog stops it; other key-ups change nothing', () => {
    const d = run([altDown(), { type: 'keyup', key: 'Alt', modal: true }]);
    expect(d[1]).toEqual({ state: ALT_IDLE, prevent: false, open: false });
    const e = run([altDown(), { type: 'keyup', key: 'b' }, altUp]);
    expect(e[1]?.state).toEqual({ armed: false, alone: true });
    expect(e[2]?.open).toBe(true);
  });

  it('AltGraph is not Alt', () => {
    expect(opened([down('AltGraph'), { type: 'keyup', key: 'AltGraph' }])).toBe(false);
  });

  it('any other keydown disarms an armed guard; a plain click leaves the flag', () => {
    const armed: AltState = { armed: true, alone: false };
    expect(run([down('b')], armed)[0]?.state).toEqual(ALT_IDLE);
    expect(run([click(false)], armed)[0]?.state).toEqual(armed);
    expect(run([{ type: 'keyup', key: 'b' }], armed)[0]?.state).toEqual(armed);
  });

  it('a fresh Alt press after an Alt+click is a new lone Alt (the old guard is dropped)', () => {
    const d = run([click(true), altDown(), altUp]);
    expect(d[1]?.state).toEqual({ armed: false, alone: true });
    expect(d[2]?.open).toBe(true);
  });
});

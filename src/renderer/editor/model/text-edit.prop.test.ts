// Property 6 (SPEC-editor.md "Testing"): text-edit ops keep offsets inside the text and never split
// a surrogate pair.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  deleteBackward,
  deleteForward,
  fromStored,
  fromText,
  insertLineBreak,
  insertText,
  moveSelection,
  reconcile,
  redoEdit,
  selectionOf,
  setSelection,
  textOf,
  toggleScript,
  undoEdit,
  type TextEditState,
} from './text-edit';

const FACE = String.fromCodePoint(0x1f600);
const piece = fc.constantFrom('a', 'H', '2', ' ', '+', FACE, '\n', 'AB', `${FACE}${FACE}`);

type Op = (s: TextEditState) => TextEditState;

const opArb: fc.Arbitrary<Op> = fc.oneof(
  piece.map(
    (t): Op =>
      (s) =>
        insertText(s, t),
  ),
  fc.constantFrom('char', 'word', 'line').map(
    (u): Op =>
      (s) =>
        deleteBackward(s, u),
  ),
  fc.constantFrom('char', 'word', 'line').map(
    (u): Op =>
      (s) =>
        deleteForward(s, u),
  ),
  fc.constant<Op>(insertLineBreak),
  fc.constantFrom('sub', 'sup').map(
    (sc): Op =>
      (s) =>
        toggleScript(s, sc),
  ),
  fc.tuple(fc.integer({ min: -3, max: 40 }), fc.integer({ min: -3, max: 40 })).map(
    ([a, f]): Op =>
      (s) =>
        setSelection(s, a, f),
  ),
  fc.tuple(fc.constantFrom('left', 'right', 'home', 'end'), fc.boolean()).map(
    ([k, extend]): Op =>
      (s) =>
        moveSelection(s, k, extend),
  ),
  fc.constant<Op>(undoEdit),
  fc.constant<Op>(redoEdit),
  // An IME replaced the first character (a whole code point) and added a piece.
  piece.map(
    (t): Op =>
      (s) =>
        reconcile(s, [...textOf(s)].slice(1).join('') + t),
  ),
);

const startArb = fc.oneof(
  fc.constantFrom('', 'H2O', 'NH2', `a${FACE}b`).map(fromText),
  fc.constant(fromStored([{ text: 'H' }, { text: '2', script: 'sub' }, { text: `O${FACE}` }])),
);

const isHigh = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;

/** Whether the text holds a surrogate that is not half of a proper pair. */
function hasLoneSurrogate(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (isHigh(c) && isLow(text.charCodeAt(i + 1))) i += 1;
    else if (isHigh(c) || isLow(c)) return true;
  }
  return false;
}

const sound = (s: TextEditState): void => {
  const text = textOf(s);
  for (const at of [s.anchor, s.focus]) {
    expect(Number.isInteger(at)).toBe(true);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThanOrEqual(text.length);
    if (at > 0 && at < text.length) {
      expect(isHigh(text.charCodeAt(at - 1)) && isLow(text.charCodeAt(at))).toBe(false);
    }
  }
  expect(s.runs.every((r) => r.text !== '')).toBe(true);
  for (let i = 1; i < s.runs.length; i += 1) {
    const a = s.runs[i - 1];
    const b = s.runs[i];
    expect(a?.script === b?.script && a?.explicit === b?.explicit).toBe(false);
  }
  expect(hasLoneSurrogate(text)).toBe(false);
};

describe('text-edit properties (property 6)', () => {
  it('any sequence of ops keeps offsets inside the text, off surrogate pairs, runs normalised', () => {
    fc.assert(
      fc.property(startArb, fc.array(opArb, { maxLength: 25 }), (start, ops) => {
        let s = start;
        sound(s);
        for (const op of ops) {
          s = op(s);
          sound(s);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('an undone edit gives back the text and selection it replaced; redo repeats it', () => {
    fc.assert(
      fc.property(startArb, piece, (start, t) => {
        const after = insertText(start, t);
        const undone = undoEdit(after);
        expect(textOf(undone)).toBe(textOf(start));
        expect(selectionOf(undone)).toEqual(selectionOf(start));
        expect(textOf(redoEdit(undone))).toBe(textOf(after));
      }),
      { numRuns: 200 },
    );
  });

  it('toggling a script on a selection leaves every selected character with one script, explicit', () => {
    fc.assert(
      fc.property(
        startArb,
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 8 }),
        fc.constantFrom('sub', 'sup'),
        (start, a, f, script) => {
          const s = setSelection(start, a, f);
          const { start: lo, end: hi } = selectionOf(s);
          if (lo === hi) return;
          const t = toggleScript(s, script);
          expect(textOf(t)).toBe(textOf(s));
          let at = 0;
          const seen = new Set<string>();
          for (const run of t.runs) {
            const end = at + run.text.length;
            if (at >= lo && end <= hi) {
              seen.add(String(run.script));
              expect(run.explicit).toBe(true);
            }
            at = end;
          }
          expect(seen.size).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 200 },
    );
  });
});

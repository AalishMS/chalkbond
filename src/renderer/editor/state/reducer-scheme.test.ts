// N3 / N4 / R9 at the reducer: reaction text in the name field.
import { createNameIndex } from '@core/chem-core';
import { canUndo, current, undoLabel, type Doc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import compounds from '../../../../resources/compounds/compounds.json';
import { planTidy } from '../model/tidy';
import { PX_PER_PT, ptToScreen } from '../model/viewport';
import { replaceSpan } from '../model/suggestions';
import type { EditorState } from './editor-state';
import { reduce, type EditorAction } from './reducer';
import { freshState, testContext } from './testing';

const ctx = { ...testContext(), names: createNameIndex(compounds) };
const run = (s: EditorState, a: EditorAction): EditorState => reduce(s, a, ctx);
const sized = (w = 1280, h = 800): EditorState =>
  run(freshState(), { type: 'canvas-resized', size: { w, h } });
const insertText = (s: EditorState, text: string): EditorState =>
  run(s, { type: 'insert-text', text });
const docOf = (s: EditorState): Doc => current(s.history);
const typed = (s: EditorState, text: string): EditorState => run(s, { type: 'name-text', text });

const ESTER = 'ethanol + acetic acid -> ethyl acetate + water';
const kinds = (s: EditorState): string[] =>
  Object.values(docOf(s).objects)
    .map((o) => (o.type === 'arrow' ? `arrow:${o.kind}` : o.type))
    .sort();

describe('reaction text (N3)', () => {
  it('inserts the esterification scheme as one "Insert reaction" step', () => {
    const s = insertText(sized(), ESTER);
    expect(s.history.past).toHaveLength(1);
    expect(undoLabel(s.history)).toBe('Insert reaction');
    expect(Object.keys(docOf(s).atoms)).toHaveLength(14);
    expect(kinds(s)).toEqual(['arrow:forward', 'plus', 'plus']);
  });

  it('selects everything inserted, switches to Select, clears the field, announces it', () => {
    const s = insertText(run(sized(), { type: 'select-tool', tool: 'ring' }), ESTER);
    expect(s.tool).toBe('select');
    expect(s.selection.atoms.size).toBe(14);
    expect(s.selection.objects.size).toBe(3);
    expect(s.nameField).toEqual({ text: '', open: false, highlighted: 0, error: null });
    expect(s.notice).toMatchObject({ kind: 'info', text: 'Inserted reaction' });
  });

  it('is already tidy and frames the drawing (V7): centred, never above 150 %', () => {
    const s = insertText(sized(), ESTER);
    expect(planTidy(docOf(s), s.selection)).toMatchObject({ arrows: [], moves: [] });
    const b = ctx.derive.committed(docOf(s)).scene.bounds;
    if (b === null) throw new Error('empty');
    expect(s.viewport.zoom).toBeLessThanOrEqual(1.5);
    const a = ptToScreen(s.viewport, { x: b.x, y: b.y });
    const c = ptToScreen(s.viewport, { x: b.x + b.w, y: b.y + b.h });
    expect(Math.abs((a.x + c.x) / 2 - 640)).toBeLessThan(1);
    expect(Math.abs((a.y + c.y) / 2 - 400)).toBeLessThan(1);
    expect(a.x).toBeGreaterThanOrEqual(48 - 1e-6);
    expect(c.x).toBeLessThanOrEqual(1280 - 48 + 1e-6);
    expect(b.w * PX_PER_PT * s.viewport.zoom).toBeLessThan(1280);
  });

  it('zooms out to fit in a small canvas', () => {
    const s = insertText(sized(960, 640), ESTER);
    expect(s.viewport.zoom).toBeLessThan(1.5);
    const b = ctx.derive.committed(docOf(s)).scene.bounds;
    if (b === null) throw new Error('empty');
    const a = ptToScreen(s.viewport, { x: b.x, y: b.y });
    expect(a.x).toBeGreaterThanOrEqual(48 - 1e-6);
  });

  it('Enter in the field does the same as the chip (N4)', () => {
    const s = run(typed(sized(), ESTER), { type: 'name-enter' });
    expect(undoLabel(s.history)).toBe('Insert reaction');
    expect(Object.keys(docOf(s).atoms)).toHaveLength(14);
  });

  it('one undo removes the whole scheme, redo brings it back', () => {
    let s = insertText(sized(), ESTER);
    s = run(s, { type: 'undo' });
    expect(Object.keys(docOf(s).atoms)).toHaveLength(0);
    expect(Object.keys(docOf(s).objects)).toHaveLength(0);
    expect(canUndo(s.history)).toBe(false);
    s = run(s, { type: 'redo' });
    expect(Object.keys(docOf(s).atoms)).toHaveLength(14);
  });

  it('<=> and ⇌ draw an equilibrium arrow; => and → a forward one', () => {
    expect(kinds(insertText(sized(), 'ethanol <=> ethene'))).toEqual(['arrow:equilibrium']);
    expect(kinds(insertText(sized(), 'ethanol ⇌ ethene'))).toEqual(['arrow:equilibrium']);
    expect(kinds(insertText(sized(), 'ethanol => ethene'))).toEqual(['arrow:forward']);
    expect(kinds(insertText(sized(), 'ethanol → ethene'))).toEqual(['arrow:forward']);
  });

  it('puts a coefficient text before its structure', () => {
    const s = insertText(sized(), '2 H2 + O2 -> 2 H2O');
    const texts = Object.values(docOf(s).objects).filter((o) => o.type === 'text');
    expect(texts.map((t) => (t.type === 'text' ? t.runs.map((r) => r.text).join('') : ''))).toEqual(
      ['2', '2'],
    );
    expect(kinds(s)).toEqual(['arrow:forward', 'plus', 'text', 'text']);
    // H2 (1 atom, labelled), O2 (2), H2O (2): structureFromText decides, the scheme adds no more
    expect(Object.keys(docOf(s).atoms)).toHaveLength(5);
  });

  it('reads a charge sign as part of the formula: Cl- + H2O -> H2O + Cl-', () => {
    const s = insertText(sized(), 'Cl- + H2O -> H2O + Cl-');
    expect(kinds(s)).toEqual(['arrow:forward', 'plus', 'plus']);
    expect(Object.keys(docOf(s).atoms)).toHaveLength(4);
  });

  it('names a charged part whole when chem-core does not know it: NH4+ is not split at its +', () => {
    const text = 'NH4+ + OH- -> NH3 + H2O';
    const s = insertText(sized(), text);
    expect(canUndo(s.history)).toBe(false);
    expect(s.nameField.error?.message).toBe('No compound named “NH4+”.');
    expect(s.nameField.error?.span).toEqual({ start: 0, end: 4 });
  });

  it('places a second scheme below the drawing, not over it', () => {
    let s = insertText(sized(), ESTER);
    const first = ctx.derive.committed(docOf(s)).scene.bounds;
    s = insertText(s, 'ethanol -> ethene');
    const all = ctx.derive.committed(docOf(s)).scene.bounds;
    if (first === null || all === null) throw new Error('empty');
    expect(all.x).toBeCloseTo(first.x, 3);
    expect(all.y + all.h).toBeGreaterThan(first.y + first.h + 40);
    expect(Object.keys(docOf(s).atoms)).toHaveLength(14 + 5);
  });
});

describe('a part that is not found', () => {
  const TYPO = 'ethanol + acetic acd -> ethyl acetate + water';

  it('inserts nothing and names the part with its suggestions and span', () => {
    const s = insertText(sized(), TYPO);
    expect(canUndo(s.history)).toBe(false);
    expect(s.nameField.text).toBe(TYPO);
    const error = s.nameField.error;
    expect(error?.message).toBe('No compound named “acetic acd”.');
    expect(error?.suggestions).toContain('acetic acid');
    expect(error?.span).toEqual({ start: 10, end: 20 });
  });

  it('keeps the coefficient out of the named part', () => {
    const s = insertText(sized(), '2 H2 + 3 qqzzxx -> x');
    expect(s.nameField.error?.message).toBe('No compound named “qqzzxx”.');
  });

  it('replaceSpan swaps only that part, and the retry inserts the scheme', () => {
    const s = insertText(sized(), TYPO);
    const span = s.nameField.error?.span;
    if (span === undefined) throw new Error('no span');
    const fixed = replaceSpan(s.nameField.text, span, 'acetic acid');
    expect(fixed).toBe(ESTER);
    const done = insertText(s, fixed);
    expect(undoLabel(done.history)).toBe('Insert reaction');
    expect(done.nameField.error).toBeNull();
  });

  it('a single unknown name has no span', () => {
    const s = insertText(sized(), 'ethanl');
    expect(s.nameField.error).not.toBeNull();
    expect(s.nameField.error?.span).toBeUndefined();
  });

  it('an arrow with a missing part does nothing', () => {
    const s = sized();
    expect(insertText(s, 'ethanol ->')).toBe(s);
    expect(insertText(s, 'ethanol + -> water')).toBe(s);
  });
});

describe('no suggestions while a reaction is typed (R9)', () => {
  it('stays closed with an arrow or a separating +, open for a charged formula or a bracketed +', () => {
    expect(typed(sized(), 'ethanol -> eth').nameField.open).toBe(false);
    expect(typed(sized(), 'ethanol + eth').nameField.open).toBe(false);
    expect(typed(sized(), 'ethanol+eth').nameField.open).toBe(false);
    expect(typed(sized(), 'eth').nameField.open).toBe(true);
  });
});

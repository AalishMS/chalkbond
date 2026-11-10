// SPEC-editor.md "Testing", properties (1) and (2) at the editor level, plus the guarantees the
// reducer owes the view: a preview never touches history, hit-testing and selection only name
// existing items, the DOM patch reproduces what is drawn. Random tool events, keys and commands
// on random documents from doc-model's `arbitraries.ts`.
import { createNameIndex } from '@core/chem-core';
import {
  canUndo,
  type AtomId,
  checkInvariants,
  createHistory,
  current,
  emptyDoc,
  type Doc,
  type Selection,
} from '@core/doc-model';
import { editCommand, run as editDoc } from '@core/doc-model/__fixtures__/arbitraries';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import compounds from '../../../../resources/compounds/compounds.json';
import type { CanvasEvent } from '../model/canvas-event';
import { HIT_ALL, hitTest, type Hit } from '../model/hit-test';
import { applyPatch, planPatch, type Mounted } from '../model/patch';
import { bluToScreen, screenToBlu } from '../model/viewport';
import { OPTIONS } from './catalog';
import { TOOL_IDS, type EditorState, type VariantTool } from './editor-state';
import { reduce, type EditorAction } from './reducer';
import { T0, freshState, testContext } from './testing';

const RUNS = 1000;
const TIMEOUT = 900_000;
const SIZE = { w: 1280, h: 722 };
const ctx = { ...testContext(), names: createNameIndex(compounds) };

// ---- generators -------------------------------------------------------------------------------

const target = fc.record({
  /** An existing atom (index modulo the count) the point is placed on, or null for a free point. */
  pick: fc.option(fc.nat(1000), { nil: null }),
  jx: fc.integer({ min: -14, max: 14 }),
  jy: fc.integer({ min: -14, max: 14 }),
  x: fc.integer({ min: 70, max: 1270 }),
  y: fc.integer({ min: 10, max: 710 }),
});
type Target = typeof target extends fc.Arbitrary<infer T> ? T : never;

const mods = fc.record({ shift: fc.boolean(), alt: fc.boolean(), ctrl: fc.boolean() });
const button = fc.constantFrom<0 | 1 | 2>(0, 0, 0, 0, 1, 2);
const ending = fc.constantFrom('up', 'up', 'up', 'escape', 'cancel');

const KEY_ACTIONS: readonly EditorAction[] = [
  { type: 'delete' },
  { type: 'select-all' },
  { type: 'copy' },
  { type: 'cut' },
  { type: 'paste', at: null },
  { type: 'paste', at: { x: 400, y: 300 } },
  { type: 'duplicate' },
  { type: 'escape' },
  { type: 'clean-up' },
  { type: 'toggle-kekule' },
  { type: 'tidy' },
  { type: 'expand' },
  { type: 'show-warning' },
  { type: 'flip', axis: 'h' },
  { type: 'flip', axis: 'v' },
  { type: 'nudge', dx: 1, dy: 0 },
  { type: 'nudge', dx: 0, dy: -1 },
  { type: 'set-preset', preset: 'journal' },
  { type: 'set-preset', preset: 'slides' },
  { type: 'zoom-step', dir: 1 },
  { type: 'zoom-step', dir: -1 },
  { type: 'zoom-fit' },
  { type: 'zoom-reset' },
  { type: 'pan-by', dx: 120, dy: -80 },
  { type: 'edit-commit' },
  { type: 'edit-cancel' },
  { type: 'edit-insert', text: 'H' },
  { type: 'edit-insert', text: 'Δ' },
  { type: 'notice-clear' },
];

const HISTORY_ACTIONS: readonly EditorAction[] = [{ type: 'undo' }, { type: 'redo' }];

type Closing = 'commit' | 'cancel' | 'open';
const typedText = fc.constantFrom('', 'H', 'OH', 'NH2', 'CH3', 'Δ', 'SO4', '2');
const closing = fc.constantFrom<Closing>('commit', 'commit', 'cancel', 'open');

type Step =
  | { k: 'tool'; tool: (typeof TOOL_IDS)[number] }
  | { k: 'variant'; tool: VariantTool; at: number }
  | {
      k: 'gesture';
      from: Target;
      via: Target[];
      to: Target;
      mods: { shift: boolean; alt: boolean; ctrl: boolean };
      button: 0 | 1 | 2;
      ending: 'up' | 'escape' | 'cancel';
    }
  | {
      k: 'event';
      type: 'down' | 'move' | 'up' | 'hover' | 'dblclick' | 'leave';
      at: Target;
      mods: { shift: boolean; alt: boolean; ctrl: boolean };
    }
  | { k: 'action'; action: EditorAction }
  | { k: 'insert'; text: string }
  | { k: 'label'; pick: number; typed: string; then: Closing }
  | { k: 'text'; at: Target; typed: string; then: Closing };

const VARIANT_TOOLS = Object.keys(OPTIONS) as VariantTool[];

const stepArb = (history: boolean): fc.Arbitrary<Step> =>
  fc.oneof(
    {
      weight: 2,
      arbitrary: fc.constantFrom(...TOOL_IDS).map((tool): Step => ({ k: 'tool', tool })),
    },
    {
      weight: 1,
      arbitrary: fc
        .tuple(fc.constantFrom(...VARIANT_TOOLS), fc.nat(20))
        .map(([tool, at]): Step => ({ k: 'variant', tool, at })),
    },
    {
      weight: 10,
      arbitrary: fc
        .record({
          from: target,
          via: fc.array(target, { maxLength: 3 }),
          to: target,
          mods,
          button,
          ending,
        })
        .map((g): Step => ({ k: 'gesture', ...g })),
    },
    {
      weight: 3,
      arbitrary: fc
        .record({
          type: fc.constantFrom('down', 'move', 'up', 'hover', 'dblclick', 'leave'),
          at: target,
          mods,
        })
        .map((e): Step => ({ k: 'event', ...e })),
    },
    {
      weight: 5,
      arbitrary: fc
        .constantFrom(...(history ? [...KEY_ACTIONS, ...HISTORY_ACTIONS] : KEY_ACTIONS))
        .map((action): Step => ({ k: 'action', action })),
    },
    {
      weight: 2,
      arbitrary: fc
        .constantFrom('ethanol', 'benzene', 'chlorine', 'H2 + O2 -> H2O', 'CCO', 'xyzzy')
        .map((text): Step => ({ k: 'insert', text })),
    },
    {
      weight: 2,
      arbitrary: fc
        .tuple(fc.nat(1000), typedText, closing)
        .map(([pick, typed, then]): Step => ({ k: 'label', pick, typed, then })),
    },
    {
      weight: 2,
      arbitrary: fc
        .tuple(target, typedText, closing)
        .map(([at, typed, then]): Step => ({ k: 'text', at, typed, then })),
    },
  );

const stepsArb = (history: boolean): fc.Arbitrary<Step[]> =>
  fc.array(stepArb(history), { minLength: 1, maxLength: 30, size: 'max' });

/** A random document: a random run of doc-model edits from an empty one. */
const docArb: fc.Arbitrary<Doc> = fc.array(editCommand, { maxLength: 10 }).map((cmds) => {
  let h = createHistory(emptyDoc(T0), { clock: () => T0 });
  for (const c of cmds) h = editDoc(h, c);
  return current(h);
});

// ---- running steps ----------------------------------------------------------------------------

const step = (s: EditorState, a: EditorAction): EditorState => reduce(s, a, ctx);
const docOf = (s: EditorState): Doc => current(s.history);

function start(doc: Doc): EditorState {
  return step(freshState(doc), { type: 'canvas-resized', size: SIZE });
}

function screenOf(s: EditorState, t: Target): { x: number; y: number } {
  const doc = docOf(s);
  const atoms = Object.values(doc.atoms);
  if (t.pick === null || atoms.length === 0) return { x: t.x, y: t.y };
  const atom = atoms[t.pick % atoms.length];
  if (atom === undefined) return { x: t.x, y: t.y };
  const bl = ctx.derive.committed(doc).scene.style.bondLength;
  const p = bluToScreen(s.viewport, atom, bl);
  return { x: p.x + t.jx, y: p.y + t.jy };
}

function eventAt(
  s: EditorState,
  type: 'down' | 'move' | 'up',
  t: Target,
  m: { shift: boolean; alt: boolean; ctrl: boolean },
  b: 0 | 1 | 2 = 0,
): CanvasEvent {
  const screen = screenOf(s, t);
  const bl = ctx.derive.committed(docOf(s)).scene.style.bondLength;
  return { type, p: screenToBlu(s.viewport, screen, bl), screen, button: b, mods: m };
}

/** The reducer actions one generated step stands for, each reported to `each(before, after, action)`. */
function perform(
  s: EditorState,
  st: Step,
  each: (before: EditorState, after: EditorState, action: EditorAction) => void,
): EditorState {
  let cur = s;
  const go = (a: EditorAction): void => {
    const before = cur;
    cur = step(cur, a);
    each(before, cur, a);
  };
  const close = (typed: string, then: Closing): void => {
    if (typed !== '') go({ type: 'edit-insert', text: typed });
    if (then === 'commit') go({ type: 'edit-commit' });
    else if (then === 'cancel') go({ type: 'edit-cancel' });
  };
  switch (st.k) {
    case 'tool':
      go({ type: 'select-tool', tool: st.tool });
      break;
    case 'variant': {
      const options = OPTIONS[st.tool];
      const option = options[st.at % options.length];
      if (option !== undefined) go({ type: 'select-variant', tool: st.tool, variant: option.id });
      break;
    }
    case 'gesture': {
      go({ type: 'pointer', event: eventAt(cur, 'down', st.from, st.mods, st.button) });
      for (const via of st.via) {
        go({ type: 'pointer', event: eventAt(cur, 'move', via, st.mods, st.button) });
      }
      if (st.ending === 'up') {
        go({ type: 'pointer', event: eventAt(cur, 'up', st.to, st.mods, st.button) });
      } else if (st.ending === 'escape') {
        go({ type: 'escape' });
      } else {
        go({ type: 'pointer', event: { type: 'cancel' } });
      }
      break;
    }
    case 'event': {
      if (st.type === 'leave') go({ type: 'pointer', event: { type: 'leave' } });
      else if (st.type === 'dblclick') {
        const screen = screenOf(cur, st.at);
        const bl = ctx.derive.committed(docOf(cur)).scene.style.bondLength;
        go({
          type: 'pointer',
          event: { type: 'dblclick', p: screenToBlu(cur.viewport, screen, bl), screen },
        });
      } else if (st.type === 'hover') {
        const screen = screenOf(cur, st.at);
        const bl = ctx.derive.committed(docOf(cur)).scene.style.bondLength;
        const p = screenToBlu(cur.viewport, screen, bl);
        go({ type: 'hover-move', event: { type: 'move', p, screen, button: 0, mods: st.mods } });
      } else go({ type: 'pointer', event: eventAt(cur, st.type, st.at, st.mods) });
      break;
    }
    case 'action':
      go(st.action);
      break;
    case 'insert':
      go({ type: 'insert-text', text: st.text });
      break;
    case 'label': {
      const ids = Object.keys(docOf(cur).atoms) as AtomId[];
      const id = ids[st.pick % Math.max(1, ids.length)];
      if (id === undefined) break;
      go({ type: 'open-label', atom: id });
      close(st.typed, st.then);
      break;
    }
    case 'text': {
      const screen = screenOf(cur, st.at);
      const bl = ctx.derive.committed(docOf(cur)).scene.style.bondLength;
      go({
        type: 'open-text',
        target: {
          kind: 'new',
          fresh: { at: screenToBlu(cur.viewport, screen, bl), align: 'left' },
        },
      });
      close(st.typed, st.then);
      break;
    }
  }
  return cur;
}

// ---- checks -----------------------------------------------------------------------------------

function selectionProblem(sel: Selection, doc: Doc): string | null {
  for (const id of sel.atoms) if (!(id in doc.atoms)) return `selected atom ${id} is gone`;
  for (const id of sel.bonds) if (!(id in doc.bonds)) return `selected bond ${id} is gone`;
  for (const id of sel.objects) if (!(id in doc.objects)) return `selected object ${id} is gone`;
  return null;
}

function hitProblem(hit: Hit | null, doc: Doc): string | null {
  if (hit === null) return null;
  switch (hit.kind) {
    case 'atom':
      return hit.id in doc.atoms ? null : `hit atom ${hit.id} does not exist`;
    case 'bond':
      return hit.id in doc.bonds ? null : `hit bond ${hit.id} does not exist`;
    case 'object':
      return hit.id in doc.objects ? null : `hit object ${hit.id} does not exist`;
    case 'slot':
      return hit.arrow in doc.objects ? null : `slot of missing arrow ${hit.arrow}`;
    case 'handle':
      return hit.id === undefined || hit.id in doc.objects ? null : `handle of missing ${hit.id}`;
  }
}

function stateProblem(s: EditorState): string | null {
  const doc = docOf(s);
  const violations = checkInvariants(doc);
  if (violations.length > 0) return `invariants: ${JSON.stringify(violations)}`;
  const sel = selectionProblem(s.selection, doc);
  if (sel !== null) return sel;
  const hover = hitProblem(s.hover, doc);
  if (hover !== null) return `hover: ${hover}`;
  if (s.editing?.kind === 'label' && !(s.editing.atom in doc.atoms)) {
    return `label editor open on missing atom ${s.editing.atom}`;
  }
  if (s.preview !== null) {
    const bad = checkInvariants(s.preview.doc);
    if (bad.length > 0) return `preview invariants: ${JSON.stringify(bad)}`;
  }
  return null;
}

const partsOf = (s: EditorState): Mounted[] => {
  const shown =
    s.preview === null
      ? ctx.derive.committed(docOf(s)).scene
      : ctx.derive.preview(s.preview.doc).scene;
  return shown.parts.map((p) => ({ key: p.key, svg: p.svg }));
};

describe('editor properties (SPEC-editor.md Testing 1, 2)', () => {
  it(
    'property 1: random tool events, keys and commands never throw and leave a valid document, selection and hover',
    () => {
      fc.assert(
        fc.property(docArb, stepsArb(true), (doc, steps) => {
          let s = start(doc);
          for (const st of steps) {
            s = perform(s, st, (_before, next) => {
              const problem = stateProblem(next);
              if (problem !== null) throw new Error(problem);
            });
          }
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'property 2: undo after every commit restores the previous document exactly',
    () => {
      fc.assert(
        fc.property(docArb, stepsArb(true), (doc, steps) => {
          let s = start(doc);
          for (const st of steps) {
            s = perform(s, st, (before, next, action) => {
              if (action.type === 'undo' || action.type === 'redo' || action.type === 'load')
                return;
              if (next.history.past.length !== before.history.past.length + 1) return;
              if (next.editing !== null) return;
              const undone = step(next, { type: 'undo' });
              expect(docOf(undone)).toEqual(docOf(before));
              expect(undone.history.past).toHaveLength(before.history.past.length);
            });
          }
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'any run of gestures, keys and commands followed by as many undos returns the original document',
    () => {
      fc.assert(
        fc.property(docArb, stepsArb(false), (doc, steps) => {
          const first = start(doc);
          let s = first;
          for (const st of steps) s = perform(s, st, () => undefined);
          s = step(step(s, { type: 'escape' }), { type: 'edit-cancel' });
          s = step(s, { type: 'escape' });
          const commits = s.history.past.length - first.history.past.length;
          for (let i = 0; i < commits; i++) s = step(s, { type: 'undo' });
          expect(docOf(s)).toEqual(docOf(first));
          expect(canUndo(s.history)).toBe(false);
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'a preview or a hover never changes the committed document or the history',
    () => {
      fc.assert(
        fc.property(docArb, stepsArb(true), (doc, steps) => {
          let s = start(doc);
          for (const st of steps) {
            s = perform(s, st, (before, next, action) => {
              const quiet =
                action.type === 'hover-move' ||
                (action.type === 'pointer' && action.event.type === 'move') ||
                action.type === 'set-preview';
              if (!quiet) return;
              expect(next.history).toBe(before.history);
              expect(docOf(next)).toBe(docOf(before));
            });
          }
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'hit-testing returns only existing ids, on atoms, between them and off the drawing',
    () => {
      fc.assert(
        fc.property(
          docArb,
          stepsArb(true),
          fc.array(
            fc.record({
              x: fc.integer({ min: 0, max: 1280 }),
              y: fc.integer({ min: 0, max: 722 }),
            }),
            {
              minLength: 3,
              maxLength: 6,
            },
          ),
          (doc, steps, points) => {
            let s = start(doc);
            for (const st of steps) {
              s = perform(s, st, () => undefined);
              const d = docOf(s);
              const { scene } = ctx.derive.committed(d);
              const own = Object.values(d.atoms).map((a) =>
                bluToScreen(s.viewport, a, scene.style.bondLength),
              );
              for (const p of [...points, ...own]) {
                const hit = hitTest(d, scene, s.viewport, p, HIT_ALL);
                const problem = hitProblem(hit, d);
                if (problem !== null) throw new Error(problem);
              }
            }
          },
        ),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'planPatch then applyPatch reproduces the drawn part list after every action',
    () => {
      fc.assert(
        fc.property(docArb, stepsArb(true), (doc, steps) => {
          let s = start(doc);
          let mounted = partsOf(s);
          for (const st of steps) {
            s = perform(s, st, (_before, next) => {
              const target = partsOf(next);
              expect(applyPatch(mounted, planPatch(mounted, target))).toEqual(target);
              mounted = target;
            });
          }
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );
});

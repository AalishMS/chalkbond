// Fixtures of the Tidy reaction tests: a hand-placed esterification scheme and a tidy as the
// editor commits it.
import {
  addObject,
  createHistory,
  current,
  transact,
  type Doc,
  type ObjectId,
  type Selection,
} from '@core/doc-model';
import { EMPTY_SELECTION } from '../state/editor-state';
import { drawn } from '../state/testing';
import { applyTidy, planTidy } from './tidy';

const NOW = '2026-01-01T00:00:00.000Z';

/** The messy esterification scheme of the task: four molecules, two pluses, a tilted arrow, a text near it. */
export function messyScheme(jitter: (i: number) => number = () => 0): {
  doc: Doc;
  arrow: ObjectId;
  text: ObjectId;
  pluses: ObjectId[];
} {
  let doc = drawn(
    { name: 'ethanol', x: 0, y: 0.4 + jitter(0) },
    { name: 'acetic acid', x: 4.5 + jitter(1), y: -0.3 + jitter(2) },
    { name: 'ethyl acetate', x: 13 + jitter(3), y: 0.6 },
    { name: 'water', x: 19 + jitter(4), y: -0.2 },
  );
  const [d1, plus1] = addObject(doc, { type: 'plus', at: { x: 3.2, y: 0.9 + jitter(5) } });
  const [d2, plus2] = addObject(d1, { type: 'plus', at: { x: 17.4, y: 0.1 } });
  const [d3, arrow] = addObject(d2, {
    type: 'arrow',
    kind: 'forward',
    from: { x: 7.5, y: 1.0 },
    to: { x: 11.2, y: 0.6 + jitter(6) },
  });
  const [d4, text] = addObject(d3, {
    type: 'text',
    at: { x: 9.3, y: 0.0 },
    runs: [
      { text: 'conc. H' },
      { text: '2', script: 'sub' },
      { text: 'SO' },
      { text: '4', script: 'sub' },
    ],
    align: 'left',
  });
  doc = d4;
  return { doc, arrow, text, pluses: [plus1, plus2] };
}

/** The tidy as the editor commits it: plan outside, apply inside one transaction. */
export function tidied(doc: Doc, sel: Selection = EMPTY_SELECTION): Doc | null {
  const plan = planTidy(doc, sel);
  if (plan === null) return null;
  const h = transact(createHistory(doc, { clock: () => NOW }), 'Tidy reaction', (d) =>
    applyTidy(d, plan),
  );
  return current(h);
}

/** JSON with every number rounded to 1e-9: a second tidy may differ in the last float bits. */
export const rounded = (value: unknown): string =>
  JSON.stringify(value, (_k, v: unknown) =>
    typeof v === 'number' ? Math.round(v * 1e9) / 1e9 + 0 : v,
  );

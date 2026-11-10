import { createPerceiver } from '@core/chem-core';
import { emptyDoc } from '@core/doc-model';
import { expect, it, vi } from 'vitest';
import { EMPTY_SELECTION } from '../state/editor-state';
import { createStatusFormula } from './status-formula';

it('reuses status chemistry across pointer frames and invalidates every input', () => {
  const compute = vi.fn(() => null);
  const formula = createStatusFormula(compute);
  const doc = emptyDoc('2026-01-01T00:00:00.000Z');
  const perception = createPerceiver()(doc);
  formula(doc, perception, EMPTY_SELECTION);
  for (let frame = 0; frame < 90; frame++) formula(doc, perception, EMPTY_SELECTION);
  expect(compute).toHaveBeenCalledTimes(1);
  const selection = { ...EMPTY_SELECTION, atoms: new Set(EMPTY_SELECTION.atoms) };
  formula(doc, perception, selection);
  expect(compute).toHaveBeenCalledTimes(2);
  const nextDoc = { ...doc };
  formula(nextDoc, perception, selection);
  expect(compute).toHaveBeenCalledTimes(3);
  formula(nextDoc, { ...perception }, selection);
  expect(compute).toHaveBeenCalledTimes(4);
});

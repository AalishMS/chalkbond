// SC12 (task N8): the clipboard bitmap's second exportSvg call (embed: false) must not serialise
// the drawing payload again. payload.ts is wrapped so its calls can be counted.
import { beforeEach, expect, test, vi } from 'vitest';
import { addObject, emptyDoc } from '../doc-model';
import { exportSvg } from './picture';
import { drawingPayload } from './payload';
import type * as Payload from './payload';

vi.mock('./payload', async (importActual) => {
  const actual = await importActual<typeof Payload>();
  return { ...actual, drawingPayload: vi.fn(actual.drawingPayload) };
});

const [doc] = addObject(emptyDoc('2026-11-12T00:00:00.000Z'), {
  type: 'arrow',
  kind: 'forward',
  from: { x: 0, y: 0 },
  to: { x: 3, y: 0 },
});

beforeEach(() => {
  vi.mocked(drawingPayload).mockClear();
});

test('embed: false never computes the drawing payload', () => {
  exportSvg(doc, null, { embed: false });
  exportSvg(doc, null, { embed: false, padding: 10 });
  expect(drawingPayload).not.toHaveBeenCalled();
});

test('the default still computes it exactly once', () => {
  exportSvg(doc, null);
  expect(drawingPayload).toHaveBeenCalledTimes(1);
});

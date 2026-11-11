// Copy half of the clipboard flow (SPEC-clipboard-export.md CB-C1–CB-C3, CB-Q, N-C1–N-C6) over
// fake ports and a real editor controller.
import { describe, expect, it, vi } from 'vitest';
import { drawingPayload, exportSvg, pictureDoc, readSvgDrawing } from '@core/clipboard-export';
import type * as Core from '@core/clipboard-export';
import type { Selection } from '@core/doc-model';
import { createEditorController, type EditorController } from '../../editor';
import type { ClipboardWriteRequest } from '../../../shared/ipc-types';
import { COPIED_MS, NOTICES, createCopyFlow, type CopyFlow, type CopyPorts } from './copy-flow';

vi.mock('@core/clipboard-export', async (importActual) => {
  const actual = await importActual<typeof Core>();
  return {
    ...actual,
    exportSvg: vi.fn(actual.exportSvg),
    drawingPayload: vi.fn(actual.drawingPayload),
  };
});

const NOW = '2026-11-11T00:00:00Z';
const PNG = new Uint8Array([137, 80, 78, 71]);

interface Rig {
  controller: EditorController;
  flow: CopyFlow;
  writes: ClipboardWriteRequest[];
  notify: ReturnType<typeof vi.spyOn>;
  run: ReturnType<typeof vi.spyOn>;
  write: ReturnType<typeof vi.fn>;
  rasterise: ReturnType<typeof vi.fn>;
  timers: { fn: () => void; ms: number; cancelled: boolean }[];
}

/** A controller whose onCopy goes to the flow, as `createWindowHost` wires it. */
function rig(text?: string): Rig {
  const writes: ClipboardWriteRequest[] = [];
  const timers: Rig['timers'] = [];
  const write = vi.fn(async (value: ClipboardWriteRequest) => {
    writes.push(value);
    return { ok: true };
  });
  const rasterise = vi.fn(async () => ({ png: PNG, dpi: 300, reduced: false }));
  const ports: Omit<CopyPorts, 'controller'> = {
    write,
    rasterise,
    schedule: (fn, ms) => {
      const timer = { fn, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  };
  const late: { flow?: CopyFlow } = {};
  const controller = createEditorController({
    clock: () => NOW,
    onCopy: (sub, doc, selection) => {
      void late.flow?.onCopy(sub, doc, selection);
    },
  });
  const flow = createCopyFlow({ controller, ...ports });
  late.flow = flow;
  if (text !== undefined) controller.run({ type: 'insert-text', text });
  return {
    controller,
    flow,
    writes,
    write,
    rasterise,
    timers,
    notify: vi.spyOn(controller, 'notify'),
    run: vi.spyOn(controller, 'run'),
  };
}

const live = (r: Rig) => r.timers.filter((t) => !t.cancelled);

describe('copy (CB-C1)', () => {
  it('says N-C4 on an empty drawing and writes nothing', async () => {
    const r = rig();
    await r.flow.copy();
    expect(r.notify).toHaveBeenCalledWith('info', NOTICES.empty);
    expect(NOTICES.empty).toBe('Nothing to copy yet. Draw something first.');
    expect(r.write).not.toHaveBeenCalled();
    expect(r.run).not.toHaveBeenCalled();
    expect(r.flow.copied()).toBe(false);
  });

  it('copies the whole drawing without touching the editor (R5): N-C2, no lastEditorCopy', async () => {
    const r = rig('ethanol');
    r.controller.run('select-all');
    r.controller.run('copy'); // fills the editor's in-app clipboard first
    await r.flow.whenIdle();
    r.controller.store.dispatch({ type: 'set-selection', selection: emptySelection() });
    const clipboard = r.controller.store.getState().clipboard;
    const doc = r.controller.getDoc();
    const selection = r.controller.getSelection();
    r.writes.length = 0;
    r.run.mockClear();
    vi.mocked(exportSvg).mockClear();
    vi.mocked(drawingPayload).mockClear();

    await r.flow.copy();

    expect(r.run).not.toHaveBeenCalled();
    expect(r.controller.getSelection()).toBe(selection);
    expect(r.controller.store.getState().clipboard).toBe(clipboard);
    expect(r.controller.getDoc()).toBe(doc);
    const svg = exportSvg(doc, null).svg;
    expect(r.writes).toEqual([{ png: PNG, svg, drawing: drawingPayload(pictureDoc(doc, null)) }]);
    expect(r.notify).toHaveBeenLastCalledWith(
      'info',
      'Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V.',
    );
    expect(r.flow.lastEditorCopy()).toBeNull();
    expect(r.flow.copied()).toBe(true);
  });

  it('computes the payload once: one exportSvg, reused for the PNG, the SVG and the drawing', async () => {
    const r = rig('ethanol');
    vi.mocked(exportSvg).mockClear();
    vi.mocked(drawingPayload).mockClear();
    await r.flow.copy();
    expect(exportSvg).toHaveBeenCalledTimes(1);
    expect(drawingPayload).not.toHaveBeenCalled();
    const svg = vi.mocked(exportSvg).mock.results[0]?.value as ReturnType<typeof exportSvg>;
    expect(r.rasterise).toHaveBeenCalledWith(svg, 300, false);
    expect(r.writes[0]?.svg).toBe(svg.svg);
    expect(r.writes[0]?.drawing).toBe(readSvgDrawing(svg.svg));
  });

  it('copies a selection through the editor (onCopy): N-C1 and lastEditorCopy = payload', async () => {
    const r = rig('ethanol');
    const doc = r.controller.getDoc();
    const atom = Object.keys(doc.atoms)[0] as never;
    r.controller.store.dispatch({
      type: 'set-selection',
      selection: { ...emptySelection(), atoms: new Set([atom]) },
    });
    const selection = r.controller.getSelection();
    await r.flow.copy();
    expect(r.run).toHaveBeenCalledWith('copy');
    const payload = drawingPayload(pictureDoc(doc, selection));
    expect(r.writes).toEqual([{ png: PNG, svg: exportSvg(doc, selection).svg, drawing: payload }]);
    expect(r.notify).toHaveBeenLastCalledWith(
      'info',
      'Copied. Paste into PowerPoint or Word with Ctrl+V.',
    );
    expect(r.flow.lastEditorCopy()).toBe(payload);
    expect(r.controller.getSelection()).toBe(selection);
  });

  it('pictures a cut from the document before it (CB-C3): N-C3', async () => {
    const r = rig('ethanol');
    r.controller.run('select-all');
    const before = r.controller.getDoc();
    const selection = r.controller.getSelection();
    r.controller.run('cut');
    await r.flow.whenIdle();
    expect(Object.keys(r.controller.getDoc().atoms)).toHaveLength(0);
    expect(r.writes[0]?.svg).toBe(exportSvg(before, selection).svg);
    expect(r.notify).toHaveBeenLastCalledWith(
      'info',
      'Cut. Paste into PowerPoint or Word with Ctrl+V.',
    );
    expect(r.flow.lastEditorCopy()).toBe(drawingPayload(pictureDoc(before, selection)));
  });

  it('says N-C5 when the picture was made smaller, for a whole and a selection copy', async () => {
    const r = rig('ethanol');
    r.rasterise.mockResolvedValue({ png: PNG, dpi: 150, reduced: true });
    await r.flow.copy();
    expect(r.notify).toHaveBeenLastCalledWith(
      'info',
      'Copied. The drawing is very large, so the picture is less sharp than usual.',
    );
    r.notify.mockClear();
    r.controller.run('select-all');
    await r.flow.copy();
    expect(r.notify).toHaveBeenCalledTimes(1);
    expect(r.notify).toHaveBeenLastCalledWith('info', NOTICES.reduced);
  });

  it('says N-C6 when the write fails or throws, and keeps lastEditorCopy and the button', async () => {
    const r = rig('ethanol');
    r.controller.run('select-all');
    await r.flow.copy();
    const last = r.flow.lastEditorCopy();
    expect(last).not.toBeNull();
    r.timers[0]?.fn();
    expect(r.flow.copied()).toBe(false);

    r.write.mockResolvedValueOnce({ ok: false });
    r.controller.store.dispatch({ type: 'set-selection', selection: emptySelection() });
    await r.flow.copy();
    expect(r.notify).toHaveBeenLastCalledWith('error', "Couldn't copy. Please try again.");
    expect(r.flow.lastEditorCopy()).toBe(last);
    expect(r.flow.copied()).toBe(false);

    r.write.mockRejectedValueOnce(new Error('ipc'));
    await r.flow.copy();
    expect(r.notify).toHaveBeenLastCalledWith('error', NOTICES.failed);
    r.rasterise.mockRejectedValueOnce(new Error('decode'));
    await r.flow.copy();
    expect(r.notify).toHaveBeenLastCalledWith('error', NOTICES.failed);
    expect(r.flow.lastEditorCopy()).toBe(last);
    expect(r.flow.copied()).toBe(false);
    // The queue keeps going after a failure.
    await r.flow.copy();
    expect(r.flow.copied()).toBe(true);
    expect(r.flow.lastEditorCopy()).toBeNull();
  });
});

describe('Copied state (2 s, restarted by a new copy)', () => {
  it('shows Copied for COPIED_MS, restarts the timer and tells subscribers', async () => {
    const r = rig('ethanol');
    const heard = vi.fn();
    const stop = r.flow.subscribe(heard);
    await r.flow.copy();
    expect(COPIED_MS).toBe(2000);
    expect(r.flow.copied()).toBe(true);
    expect(live(r).map((t) => t.ms)).toEqual([2000]);
    expect(heard).toHaveBeenCalledTimes(1);

    await r.flow.copy();
    expect(r.timers).toHaveLength(2);
    expect(r.timers[0]?.cancelled).toBe(true);
    expect(live(r)).toHaveLength(1);
    expect(r.flow.copied()).toBe(true);

    live(r)[0]?.fn();
    expect(r.flow.copied()).toBe(false);
    expect(heard).toHaveBeenCalledTimes(3);
    stop();
    await r.flow.copy();
    expect(heard).toHaveBeenCalledTimes(3);
  });
});

describe('queue (CB-Q)', () => {
  it('runs a paste pressed during a copy after the copy has written', async () => {
    const r = rig('ethanol');
    let release: () => void = () => {};
    r.rasterise.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ png: PNG, dpi: 300, reduced: false });
        }),
    );
    const order: string[] = [];
    r.write.mockImplementationOnce(async () => {
      order.push('write');
      return { ok: true };
    });
    const copying = r.flow.copy();
    const pasting = r.flow.enqueue(async () => {
      order.push('paste');
      return 'pasted';
    });
    await vi.waitFor(() => expect(r.rasterise).toHaveBeenCalled());
    expect(order).toEqual([]);
    release();
    expect(await pasting).toBe('pasted');
    await copying;
    expect(order).toEqual(['write', 'paste']);
  });

  it('keeps running jobs after one rejects, and passes the rejection to its caller', async () => {
    const r = rig();
    const failing = r.flow.enqueue(async () => {
      throw new Error('boom');
    });
    const next = r.flow.enqueue(async () => 1);
    await expect(failing).rejects.toThrow('boom');
    expect(await next).toBe(1);
  });
});

describe('onCopy (the stable editor hook)', () => {
  it('tells copy from cut by whether the editor document changed', async () => {
    const r = rig('ethanol');
    r.controller.run('select-all');
    const doc = r.controller.getDoc();
    const selection = r.controller.getSelection();
    const sub = r.controller.store.getState().clipboard;
    await r.flow.onCopy(sub as never, doc, selection);
    expect(r.notify).toHaveBeenLastCalledWith('info', NOTICES.selection);
    r.controller.run('delete');
    await r.flow.onCopy(sub as never, doc, selection);
    expect(r.notify).toHaveBeenLastCalledWith('info', NOTICES.cut);
  });
});

function emptySelection(): Selection {
  return { atoms: new Set(), bonds: new Set(), objects: new Set() };
}

// C10 export flow (SPEC-clipboard-export.md "Export dialog", EX1, EX2; app-shell ST2): dialog
// state from the remembered choices, the live size line, the reopen line, Save… → settings:set
// then C3 with `exportFileName`; Cancel and a cancelled native dialog do nothing. Fakes only.
import { describe, expect, it, vi } from 'vitest';
import { exportSvg } from '@core/clipboard-export';
import { addAtom, emptyDoc, setStyle, type Doc } from '@core/doc-model';
import type { FileRef, RendererSettings } from '../../../shared/ipc-types';
import {
  createExportFlow,
  PDF_OUTCOME,
  reopenLine,
  sizeLine,
  type ExportChoices,
  type ExportFlowOptions,
} from './export-flow';

const NOW = '2026-11-11T09:00:00.000Z';
const FIRST_RUN: RendererSettings['export'] = { format: 'png', pngDpi: 300, pngWhite: false };
const drawing = (atoms = 2): Doc => {
  let d = setStyle(emptyDoc(NOW), { preset: 'slides' });
  for (let i = 0; i < atoms; i++) [d] = addAtom(d, { element: 'C', x: i, y: 0 });
  return d;
};
const REF: FileRef = { id: '00000000-0000-4000-8000-000000000001', name: 'x.png', kind: 'png' };

function rig(over: Partial<ExportFlowOptions> = {}, start: ExportChoices = FIRST_RUN) {
  const calls: string[] = [];
  let doc = drawing();
  let idle = true;
  let remembered = { ...start };
  const chooseSave = vi.fn((format: string, name: string) => {
    calls.push(`chooseSave ${format} ${name}`);
    return Promise.resolve<FileRef | null>(null);
  });
  const remember = vi.fn((choices: ExportChoices) => {
    calls.push(`remember ${JSON.stringify(choices)}`);
    remembered = { ...choices };
    return Promise.resolve();
  });
  const measure = vi.fn((d: Doc) => {
    const svg = exportSvg(d, null, { embed: false });
    return { width: svg.width, height: svg.height };
  });
  const options: ExportFlowOptions = {
    main: { chooseSave },
    controller: {
      getDoc: () => doc,
      canRun: () => idle,
    },
    settings: () => remembered,
    remember,
    sessionName: () => null,
    measure,
    ...over,
  };
  const flow = createExportFlow(options);
  return {
    flow,
    calls,
    chooseSave,
    remember,
    measure,
    setDoc: (d: Doc) => {
      doc = d;
    },
    setIdle: (v: boolean) => {
      idle = v;
    },
  };
}

describe('EX1 opening', () => {
  it('first run: PNG, Print, transparent; the size of the drawing measured unembedded', () => {
    const { flow } = rig();
    expect(flow.open()).toBe(true);
    const svg = exportSvg(drawing(), null, { embed: false });
    expect(flow.state()).toEqual({
      choices: FIRST_RUN,
      size: { width: svg.width, height: svg.height },
    });
  });

  it('opens with the remembered choices', () => {
    const remembered = { format: 'svg', pngDpi: 600, pngWhite: true } as const;
    const { flow } = rig({}, remembered);
    flow.open();
    expect(flow.state()?.choices).toEqual(remembered);
  });

  it('only when idle and the drawing is not empty; not twice', () => {
    const { flow, setDoc, setIdle } = rig();
    setIdle(false);
    expect(flow.open()).toBe(false);
    setIdle(true);
    setDoc(drawing(0));
    expect(flow.open()).toBe(false);
    expect(flow.state()).toBeNull();
    setDoc(drawing(1));
    expect(flow.open()).toBe(true);
    expect(flow.open()).toBe(false);
  });

  it('measures once per drawing: choice changes and reopening do no new render', () => {
    const { flow, measure, setDoc } = rig();
    flow.open();
    flow.choose({ format: 'svg' });
    flow.choose({ format: 'png', pngDpi: 600 });
    flow.choose({ pngWhite: true });
    flow.cancel();
    flow.open();
    expect(measure).toHaveBeenCalledTimes(1);
    flow.cancel();
    setDoc(drawing(3));
    flow.open();
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('subscribers hear open, every choice and close', () => {
    const { flow } = rig();
    const heard = vi.fn();
    const stop = flow.subscribe(heard);
    flow.open();
    flow.choose({ pngDpi: 150 });
    flow.cancel();
    expect(heard).toHaveBeenCalledTimes(3);
    stop();
    flow.open();
    expect(heard).toHaveBeenCalledTimes(3);
  });
});

describe('choices and Cancel', () => {
  it('a choice changes the dialog only; nothing is remembered', () => {
    const { flow, remember } = rig();
    flow.open();
    flow.choose({ pngDpi: 600 });
    flow.choose({ pngWhite: true });
    flow.choose({ format: 'pdf' });
    expect(flow.state()?.choices).toEqual({ format: 'pdf', pngDpi: 600, pngWhite: true });
    expect(remember).not.toHaveBeenCalled();
  });

  it('a choice with the dialog closed does nothing', () => {
    const { flow } = rig();
    flow.choose({ format: 'svg' });
    expect(flow.state()).toBeNull();
  });

  it('Cancel closes with no effect: nothing remembered, no Save dialog', () => {
    const { flow, remember, chooseSave } = rig();
    flow.open();
    flow.choose({ pngDpi: 600 });
    flow.cancel();
    expect(flow.state()).toBeNull();
    expect(remember).not.toHaveBeenCalled();
    expect(chooseSave).not.toHaveBeenCalled();
    flow.open();
    expect(flow.state()?.choices.pngDpi).toBe(300);
  });
});

describe('EX2 Save…', () => {
  it('stores the choices (settings:set) and closes before C3; Untitled.png when untitled', async () => {
    const { flow, calls } = rig();
    flow.open();
    flow.choose({ pngDpi: 600, pngWhite: true });
    const saving = flow.save();
    expect(flow.state()).toBeNull();
    await saving;
    expect(calls).toEqual([
      'remember {"format":"png","pngDpi":600,"pngWhite":true}',
      'chooseSave png Untitled.png',
    ]);
  });

  it('suggests the session name with the format: esterification.chalk → esterification.svg', async () => {
    const { flow, chooseSave } = rig({ sessionName: () => 'esterification.chalk' });
    flow.open();
    flow.choose({ format: 'svg' });
    await flow.save();
    expect(chooseSave).toHaveBeenCalledWith('svg', 'esterification.svg');
    flow.open();
    flow.choose({ format: 'pdf' });
    await flow.save();
    expect(chooseSave).toHaveBeenLastCalledWith('pdf', 'esterification.pdf');
  });

  it('a cancelled native dialog does nothing more: no export, no notice', async () => {
    const chosen = vi.fn(() => Promise.resolve());
    const { flow } = rig({ chosen });
    flow.open();
    await flow.save();
    expect(chosen).not.toHaveBeenCalled();
    expect(flow.state()).toBeNull();
    expect(flow.busy()).toBe(false);
  });

  it('a chosen file is handed to the export step (C11, C12) with the choices', async () => {
    const chosen = vi.fn(() => Promise.resolve());
    const { flow } = rig({
      chosen,
      main: { chooseSave: () => Promise.resolve(REF) },
    });
    flow.open();
    flow.choose({ pngDpi: 150 });
    await flow.save();
    expect(chosen).toHaveBeenCalledWith(REF, { format: 'png', pngDpi: 150, pngWhite: false });
  });

  it('busy from Save… until the export step ends: Ctrl+E does not reopen meanwhile', async () => {
    let resolve: ((ref: FileRef | null) => void) | undefined;
    const { flow } = rig({
      main: { chooseSave: () => new Promise<FileRef | null>((r) => (resolve = r)) },
    });
    flow.open();
    const saving = flow.save();
    expect(flow.busy()).toBe(true);
    expect(flow.open()).toBe(false);
    await vi.waitFor(() => expect(resolve).toBeDefined());
    expect(flow.busy()).toBe(true);
    resolve?.(null);
    await saving;
    expect(flow.busy()).toBe(false);
    expect(flow.open()).toBe(true);
  });

  it('a failed settings store or Save dialog is logged; the flow ends cleanly', async () => {
    const logError = vi.fn();
    const { flow } = rig({
      logError,
      remember: () => Promise.reject(new Error('ipc')),
      main: { chooseSave: () => Promise.reject(new Error('dialog')) },
    });
    flow.open();
    await flow.save();
    expect(logError).toHaveBeenCalled();
    expect(flow.busy()).toBe(false);
  });

  it('Save… with the dialog closed does nothing', async () => {
    const { flow, calls } = rig();
    await flow.save();
    expect(calls).toEqual([]);
  });
});

describe('size line (PNG only)', () => {
  const size = { width: 720, height: 72 };
  it('names the size and its pixels, grouped with commas, never dpi', () => {
    expect(sizeLine(size, 150)).toBe('For messages and websites. 1,500 × 150 pixels.');
    expect(sizeLine(size, 300)).toBe('Sharp on paper. 3,000 × 300 pixels.');
    expect(sizeLine(size, 600)).toBe('For large prints. 6,000 × 600 pixels.');
    for (const dpi of [150, 300, 600] as const) expect(sizeLine(size, dpi)).not.toMatch(/dpi/i);
  });

  it('the reduced form for a very large drawing (R3)', () => {
    expect(sizeLine({ width: 7200, height: 72 }, 600)).toBe(
      'For large prints. 10,000 × 100 pixels (less sharp: the drawing is very large).',
    );
  });
});

describe('reopen line', () => {
  it('PNG, SVG and PDF under PDF-A: the reopen promise, muted', () => {
    const line = {
      text: 'You can open this file in Chalkbond again to change the drawing.',
      caution: false,
    };
    expect(reopenLine('png', 'A')).toEqual(line);
    expect(reopenLine('svg', 'B')).toEqual(line);
    expect(reopenLine('pdf', 'A')).toEqual(line);
  });

  it('PDF under PDF-B: the caution', () => {
    expect(reopenLine('pdf', 'B')).toEqual({
      text: "PDF files can't be opened in Chalkbond again. Keep the drawing as a .chalk file too.",
      caution: true,
    });
  });

  it('the probe outcome in force is A (Decision C4)', () => {
    expect(PDF_OUTCOME).toBe('A');
  });
});

// C10 export flow (SPEC-clipboard-export.md "Export dialog", EX1, EX2; app-shell ST2): dialog
// state from the remembered choices, the live size line, the reopen line, Save… → settings:set
// then C3 with `exportFileName`; Cancel and a cancelled native dialog do nothing. Fakes only.
import { describe, expect, it, vi } from 'vitest';
import {
  crc32,
  drawingPayload,
  exportSvg,
  MAX_PICTURE_BYTES,
  readPdfDrawing,
  readPngDrawing,
  readSvgDrawing,
  withPdfDrawing,
  withPictureChunks,
} from '@core/clipboard-export';
import { addAtom, addObject, emptyDoc, MAX_FILE_BYTES, setStyle, type Doc } from '@core/doc-model';
import type { SvgDocument } from '@core/svg-render';
import { createEditorController } from '../../editor';
import type {
  FileProblem,
  FileRef,
  PrintPdfRequest,
  PrintPdfResponse,
  RendererSettings,
  WriteFileResponse,
} from '../../../shared/ipc-types';
import {
  createExportFlow,
  createExportWriter,
  exportNotice,
  type ExportWriterOptions,
  type PngDpi,
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
    expect(chosen).toHaveBeenCalledWith(
      REF,
      { format: 'png', pngDpi: 150, pngWhite: false },
      drawing(),
    );
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

// C11 (EX3–EX5, N-E1–N-E3, C9 obligations): the chosen file gets the snapshot taken at Save…;
// N-E3 is judged from the bytes actually written, then N-E2, then N-E1; a failed write is the
// app-shell error box. Fakes for the ports; a real editor controller for the "no side effect" proof.
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const b = new Uint8Array(data.length + 12);
  new DataView(b.buffer).setUint32(0, data.length);
  b.set(ascii(type), 4);
  b.set(data, 8);
  new DataView(b.buffer).setUint32(b.length - 4, crc32(b.subarray(4, -4)));
  return b;
}
/** The canvas's PNG stand-in: signature, IHDR (1 × 1), IEND (never decoded). */
function rawPng(): Uint8Array {
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, 1);
  new DataView(ihdr.buffer).setUint32(4, 1);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [
    Uint8Array.from(PNG_SIGNATURE),
    pngChunk('IHDR', ihdr),
    pngChunk('IEND', ascii('')),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
const PNG_REF: FileRef = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'toluene.png',
  kind: 'png',
};
const SVG_REF: FileRef = {
  id: '00000000-0000-4000-8000-0000000000a2',
  name: 'toluene.svg',
  kind: 'svg',
};
const encoder = new TextEncoder();

type WriterOverrides = Omit<Partial<ExportWriterOptions>, 'main'> & {
  main?: Partial<ExportWriterOptions['main']>;
};
function writerRig(over: WriterOverrides = {}) {
  const writes: { ref: FileRef; data: Uint8Array }[] = [];
  const writeFile = vi.fn((ref: FileRef, data: Uint8Array) => {
    writes.push({ ref, data });
    return Promise.resolve<WriteFileResponse>({ ok: true });
  });
  const showFileError = vi.fn((_problem: FileProblem, _name: string) => Promise.resolve());
  const notify = vi.fn();
  const logError = vi.fn();
  let reduced = false;
  // As the real rasteriser: the PNG carries the SVG's metadata payload (R1).
  const rasterise = vi.fn((svg: SvgDocument, dpi: number, _white: boolean) =>
    Promise.resolve({
      png: withPictureChunks(rawPng(), { dpi, payload: readSvgDrawing(svg.svg) }),
      dpi,
      reduced,
    }),
  );
  const printPdf = vi.fn((_request: PrintPdfRequest) =>
    Promise.resolve<PrintPdfResponse>({ ok: false }),
  );
  const options: ExportWriterOptions = {
    rasterise,
    notify,
    encodeUtf8: (text) => encoder.encode(text),
    logError,
    ...over,
    main: { writeFile, showFileError, printPdf, ...over.main },
  };
  return {
    write: createExportWriter(options),
    writes,
    writeFile,
    showFileError,
    notify,
    logError,
    rasterise,
    setReduced: (v: boolean) => {
      reduced = v;
    },
  };
}
const PNG_CHOICES = (pngDpi: PngDpi, pngWhite = false): ExportChoices => ({
  format: 'png',
  pngDpi,
  pngWhite,
});
const SVG_CHOICES: ExportChoices = { format: 'svg', pngDpi: 300, pngWhite: false };
/** A valid drawing whose editable payload is over MAX_FILE_BYTES (emptyDoc stores the string twice). */
const oversized = (): Doc => {
  const [d] = addAtom(emptyDoc('x'.repeat(MAX_FILE_BYTES / 2 + 1)), { element: 'C', x: 0, y: 0 });
  return d;
};

describe('C11 notices (N-E1–N-E3)', () => {
  it('N-E3 outranks N-E2, which outranks N-E1', () => {
    expect(exportNotice('a.png', { embedded: true, reduced: false })).toBe('Exported a.png.');
    expect(exportNotice('a.png', { embedded: true, reduced: true })).toBe(
      'Exported a.png. The drawing is very large, so the picture is less sharp than you chose.',
    );
    const tooLarge =
      'Exported a.png. It is too large to open again in Chalkbond, so keep the .chalk file.';
    expect(exportNotice('a.png', { embedded: false, reduced: true })).toBe(tooLarge);
    expect(exportNotice('a.png', { embedded: false, reduced: false })).toBe(tooLarge);
  });
});

describe('C11 PNG (EX3)', () => {
  for (const dpi of [150, 300, 600] as const) {
    it(`${dpi}: rasterises exportSvg(doc, null) at the chosen size and writes those bytes`, async () => {
      const r = writerRig();
      const doc = drawing(3);
      await r.write(PNG_REF, PNG_CHOICES(dpi), doc);
      expect(r.rasterise).toHaveBeenCalledTimes(1);
      expect(r.rasterise).toHaveBeenCalledWith(exportSvg(doc, null), dpi, false);
      const png = (await r.rasterise.mock.results[0]?.value) as { png: Uint8Array };
      expect(r.writes).toEqual([{ ref: PNG_REF, data: png.png }]);
      expect(readPngDrawing(r.writes[0]?.data ?? new Uint8Array())).toBe(drawingPayload(doc));
      expect(r.notify).toHaveBeenCalledExactlyOnceWith('info', 'Exported toluene.png.');
      expect(r.showFileError).not.toHaveBeenCalled();
    });
  }

  it('White background passes the fill flag', async () => {
    const r = writerRig();
    await r.write(PNG_REF, PNG_CHOICES(300, true), drawing());
    expect(r.rasterise.mock.calls[0]?.[2]).toBe(true);
  });

  it('a reduced picture (R3) shows N-E2', async () => {
    const r = writerRig();
    r.setReduced(true);
    await r.write(PNG_REF, PNG_CHOICES(600), drawing());
    expect(r.notify).toHaveBeenCalledExactlyOnceWith(
      'info',
      'Exported toluene.png. The drawing is very large, so the picture is less sharp than you chose.',
    );
  });

  it('a payload over MAX_FILE_BYTES: written without the chunk, N-E3 (outranks reduced)', async () => {
    const r = writerRig();
    r.setReduced(true);
    const doc = oversized();
    expect(drawingPayload(doc).length).toBeGreaterThan(MAX_FILE_BYTES);
    await r.write(PNG_REF, PNG_CHOICES(300), doc);
    expect(r.writes).toHaveLength(1);
    expect(readPngDrawing(r.writes[0]?.data ?? new Uint8Array())).toBeNull();
    expect(r.notify).toHaveBeenCalledExactlyOnceWith(
      'info',
      'Exported toluene.png. It is too large to open again in Chalkbond, so keep the .chalk file.',
    );
  });

  it('N-E3 is judged from the bytes written: a PNG whose chunk was dropped (C9 cap)', async () => {
    const r = writerRig({
      rasterise: (_svg, dpi) =>
        Promise.resolve({
          png: withPictureChunks(rawPng(), { dpi, payload: null }),
          dpi,
          reduced: false,
        }),
    });
    await r.write(PNG_REF, PNG_CHOICES(300), drawing());
    expect(r.notify).toHaveBeenCalledExactlyOnceWith(
      'info',
      'Exported toluene.png. It is too large to open again in Chalkbond, so keep the .chalk file.',
    );
  });

  it('a picture over MAX_PICTURE_BYTES is never sent: the error box, no write, no notice', async () => {
    const huge = new Uint8Array(MAX_PICTURE_BYTES + 1);
    huge.set(PNG_SIGNATURE);
    const r = writerRig({
      rasterise: (_svg, dpi) => Promise.resolve({ png: huge, dpi, reduced: false }),
    });
    await r.write(PNG_REF, PNG_CHOICES(300), drawing());
    expect(r.writeFile).not.toHaveBeenCalled();
    expect(r.showFileError).toHaveBeenCalledExactlyOnceWith('write-failed', 'toluene.png');
    expect(r.notify).not.toHaveBeenCalled();
    expect(r.logError).toHaveBeenCalled();
  });

  it('a rasterising failure: the error box, no write, logged', async () => {
    const r = writerRig({ rasterise: () => Promise.reject(new Error('decode')) });
    await r.write(PNG_REF, PNG_CHOICES(300), drawing());
    expect(r.writeFile).not.toHaveBeenCalled();
    expect(r.showFileError).toHaveBeenCalledExactlyOnceWith('write-failed', 'toluene.png');
    expect(r.notify).not.toHaveBeenCalled();
    expect(r.logError).toHaveBeenCalled();
  });
});

describe('C11 SVG (EX3, EX5)', () => {
  it('writes the UTF-8 bytes of exportSvg(doc, null).svg exactly, no BOM', async () => {
    const r = writerRig();
    const doc = drawing(3);
    await r.write(SVG_REF, SVG_CHOICES, doc);
    const data = r.writes[0]?.data ?? new Uint8Array();
    expect(data).toEqual(encoder.encode(exportSvg(doc, null).svg));
    expect(Array.from(data.subarray(0, 4))).toEqual(Array.from(ascii('<svg')));
    expect(r.rasterise).not.toHaveBeenCalled();
    expect(r.notify).toHaveBeenCalledExactlyOnceWith('info', 'Exported toluene.svg.');
  });

  it('non-ASCII text is UTF-8 encoded', async () => {
    const r = writerRig();
    const [doc] = addObject(drawing(1), {
      type: 'text',
      at: { x: 2, y: 0 },
      runs: [{ text: 'conc. H₂SO₄, Δ' }],
      align: 'left',
    });
    await r.write(SVG_REF, SVG_CHOICES, doc);
    expect(new TextDecoder().decode(r.writes[0]?.data)).toBe(exportSvg(doc, null).svg);
  });

  it('a payload over MAX_FILE_BYTES: the SVG has no metadata and N-E3', async () => {
    const r = writerRig();
    const doc = oversized();
    await r.write(SVG_REF, SVG_CHOICES, doc);
    const text = new TextDecoder().decode(r.writes[0]?.data);
    expect(text).toBe(exportSvg(doc, null, { embed: false }).svg);
    expect(readSvgDrawing(text)).toBeNull();
    expect(r.notify).toHaveBeenCalledExactlyOnceWith(
      'info',
      'Exported toluene.svg. It is too large to open again in Chalkbond, so keep the .chalk file.',
    );
  });
});

describe('C11 failed writes (EX4)', () => {
  it('a refused write shows the file error for its problem; no notice', async () => {
    const errors: [FileProblem, string][] = [];
    const rig2 = writerRig({
      main: {
        writeFile: () => Promise.resolve({ ok: false, problem: 'write-denied' }),
        showFileError: (problem, name) => {
          errors.push([problem, name]);
          return Promise.resolve();
        },
      },
    });
    await rig2.write(PNG_REF, PNG_CHOICES(300), drawing());
    expect(errors).toEqual([['write-denied', 'toluene.png']]);
    expect(rig2.notify).not.toHaveBeenCalled();
  });

  it('a rejected write (main refused it) shows write-failed and is logged', async () => {
    const errors: [FileProblem, string][] = [];
    const r = writerRig({
      main: {
        writeFile: () => Promise.reject(new Error('Rejected IPC request')),
        showFileError: (problem, name) => {
          errors.push([problem, name]);
          return Promise.resolve();
        },
      },
    });
    await r.write(SVG_REF, SVG_CHOICES, drawing());
    expect(errors).toEqual([['write-failed', 'toluene.svg']]);
    expect(r.notify).not.toHaveBeenCalled();
    expect(r.logError).toHaveBeenCalled();
  });
});

describe('C11 snapshot and side effects (EX4)', () => {
  it('Save… captures the drawing once; edits during the Save dialog or rasterising are not exported', async () => {
    const r = writerRig();
    let release: (() => void) | undefined;
    const slow = writerRig({
      rasterise: async (svg, dpi, white) => {
        await new Promise<void>((resolve) => (release = resolve));
        return r.rasterise(svg, dpi, white);
      },
    });
    let answer: ((ref: FileRef | null) => void) | undefined;
    const before = drawing(2);
    const g = rig({
      main: { chooseSave: () => new Promise<FileRef | null>((res) => (answer = res)) },
      chosen: slow.write,
    });
    g.setDoc(before);
    g.flow.open();
    const saving = g.flow.save();
    await vi.waitFor(() => expect(answer).toBeDefined());
    g.setDoc(drawing(5)); // an edit while the Save dialog is open
    answer?.(PNG_REF);
    await vi.waitFor(() => expect(release).toBeDefined());
    g.setDoc(drawing(7)); // an edit while rasterising
    release?.();
    await saving;
    expect(r.rasterise).toHaveBeenCalledWith(exportSvg(before, null), 300, false);
    expect(readPngDrawing(slow.writes[0]?.data ?? new Uint8Array())).toBe(drawingPayload(before));
  });

  it('export leaves the document, its history and the dirty flag as they were', async () => {
    const controller = createEditorController({ clock: () => NOW });
    controller.load(drawing(2));
    controller.run('select-all');
    controller.run('duplicate');
    const doc = controller.getDoc();
    const dirty = controller.isDirty();
    const undo = controller.undoLabel();
    expect(dirty).toBe(true);
    const w = writerRig({ notify: (kind, text) => controller.notify(kind, text) });
    const flow = createExportFlow({
      main: { chooseSave: () => Promise.resolve(SVG_REF) },
      controller,
      settings: () => SVG_CHOICES,
      remember: () => Promise.resolve(),
      sessionName: () => 'toluene.chalk',
      chosen: w.write,
    });
    expect(flow.open()).toBe(true);
    await flow.save();
    expect(w.writes).toHaveLength(1);
    expect(controller.getDoc()).toBe(doc);
    expect(controller.isDirty()).toBe(dirty);
    expect(controller.undoLabel()).toBe(undo);
  });
});

// C12 (EX3 PDF, PDF-A2, N-E3, C9): the PDF is printed in main (C5) from the unembedded SVG; the
// renderer embeds the drawing with withPdfDrawing and writes through C4; a refusal, a payload over
// MAX_FILE_BYTES or an embedded PDF over MAX_PICTURE_BYTES writes the printed PDF unchanged + N-E3.
const PDF_REF: FileRef = {
  id: '00000000-0000-4000-8000-0000000000a3',
  name: 'toluene.pdf',
  kind: 'pdf',
};
const PDF_CHOICES: ExportChoices = { format: 'pdf', pngDpi: 300, pngWhite: false };
const TOO_LARGE_PDF =
  'Exported toluene.pdf. It is too large to open again in Chalkbond, so keep the .chalk file.';
function joinBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
/** A minimal classic-xref PDF (as Chromium prints), with a comment of `filler` bytes. */
function classicPdf(filler = 0): Uint8Array {
  const head = ascii('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');
  const pad =
    filler > 0 ? joinBytes([ascii('%'), new Uint8Array(filler).fill(97), ascii('\n')]) : ascii('');
  const xrefAt = head.length + pad.length;
  const tail = ascii(
    'xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \n' +
      `trailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`,
  );
  return joinBytes([head, pad, tail]);
}
function pdfRig(printed: Uint8Array | null, over: WriterOverrides = {}) {
  const printPdf = vi.fn((_request: PrintPdfRequest) =>
    Promise.resolve<PrintPdfResponse>(
      printed === null ? { ok: false } : { ok: true, pdf: printed },
    ),
  );
  return { ...writerRig({ ...over, main: { printPdf } }), printPdf };
}

describe('C12 PDF (EX3, PDF-A2)', () => {
  it('prints exportSvg(doc, null, { embed: false }) at its size and writes it with the drawing', async () => {
    const printed = classicPdf();
    const r = pdfRig(printed);
    const doc = drawing(3);
    await r.write(PDF_REF, PDF_CHOICES, doc);
    const svg = exportSvg(doc, null, { embed: false });
    expect(r.printPdf).toHaveBeenCalledExactlyOnceWith({
      svg: svg.svg,
      widthPt: svg.width,
      heightPt: svg.height,
    });
    const embedded = withPdfDrawing(printed, drawingPayload(doc));
    if (!embedded.ok) throw new Error(embedded.reason);
    expect(r.writes).toEqual([{ ref: PDF_REF, data: embedded.pdf }]);
    expect(readPdfDrawing(r.writes[0]?.data ?? new Uint8Array())).toBe(drawingPayload(doc));
    expect(r.notify).toHaveBeenCalledExactlyOnceWith('info', 'Exported toluene.pdf.');
    expect(r.rasterise).not.toHaveBeenCalled();
  });

  it('an embedder refusal (PDF-A3) writes the printed PDF unchanged, N-E3, the reason logged', async () => {
    const printed = ascii('%PDF-1.7\nnot a classic table\n%%EOF\n');
    const r = pdfRig(printed);
    await r.write(PDF_REF, PDF_CHOICES, drawing());
    expect(r.writes).toEqual([{ ref: PDF_REF, data: printed }]);
    expect(r.notify).toHaveBeenCalledExactlyOnceWith('info', TOO_LARGE_PDF);
    expect(r.logError.mock.calls.flat().join(' ')).toMatch(/unrecognised/);
  });

  it('a payload over MAX_FILE_BYTES writes the printed PDF unchanged and N-E3', async () => {
    const printed = classicPdf();
    const r = pdfRig(printed);
    await r.write(PDF_REF, PDF_CHOICES, oversized());
    expect(r.writes).toEqual([{ ref: PDF_REF, data: printed }]);
    expect(readPdfDrawing(r.writes[0]?.data ?? new Uint8Array())).toBeNull();
    expect(r.notify).toHaveBeenCalledExactlyOnceWith('info', TOO_LARGE_PDF);
    expect(r.logError).toHaveBeenCalled();
  });

  // The cap is injected (as rasterise's C9 test does): the core embedder builds a string of the
  // whole file, and a real 64 MiB PDF exhausts a test worker's memory. Production uses the default.
  it('an embedded PDF over the picture cap: the printed PDF unchanged and N-E3', async () => {
    const doc = drawing(2);
    const printed = classicPdf(1000);
    const embedded = withPdfDrawing(printed, drawingPayload(doc));
    if (!embedded.ok) throw new Error(embedded.reason);
    const r = pdfRig(printed, { pictureCap: embedded.pdf.length - 1 });
    await r.write(PDF_REF, PDF_CHOICES, doc);
    expect(r.writes).toEqual([{ ref: PDF_REF, data: printed }]);
    expect(r.notify).toHaveBeenCalledExactlyOnceWith('info', TOO_LARGE_PDF);
    expect(r.logError).toHaveBeenCalled();
    const fits = pdfRig(printed, { pictureCap: embedded.pdf.length });
    await fits.write(PDF_REF, PDF_CHOICES, doc);
    expect(fits.writes).toEqual([{ ref: PDF_REF, data: embedded.pdf }]);
    expect(fits.notify).toHaveBeenCalledExactlyOnceWith('info', 'Exported toluene.pdf.');
  });

  it('a printed PDF itself over MAX_PICTURE_BYTES fails as before: the box, nothing sent', async () => {
    const huge = new Uint8Array(MAX_PICTURE_BYTES + 1);
    huge.set(ascii('%PDF-'));
    const r = pdfRig(huge); // the default cap: MAX_PICTURE_BYTES
    await r.write(PDF_REF, PDF_CHOICES, drawing());
    expect(r.writeFile).not.toHaveBeenCalled();
    expect(r.showFileError).toHaveBeenCalledExactlyOnceWith('write-failed', 'toluene.pdf');
    expect(r.notify).not.toHaveBeenCalled();
  });

  it('a failed print: the error box (write-failed), no write, no notice', async () => {
    const r = pdfRig(null);
    await r.write(PDF_REF, PDF_CHOICES, drawing());
    expect(r.writeFile).not.toHaveBeenCalled();
    expect(r.showFileError).toHaveBeenCalledExactlyOnceWith('write-failed', 'toluene.pdf');
    expect(r.notify).not.toHaveBeenCalled();
    expect(r.logError).toHaveBeenCalled();
  });
});

// F1–F7, F13 (SPEC-app-shell.md "Files"; CO4; R7, R14) over fakes: every prompt answer, the
// in-progress flag with one pending request, session kinds and the published title.
import { describe, expect, it, vi } from 'vitest';
import { exportSvg, MAX_PICTURE_BYTES, withPictureChunks } from '@core/clipboard-export';
import {
  addAtom,
  emptyDoc,
  MAX_FILE_BYTES,
  parse,
  serialize,
  setStyle,
  type Doc,
  type ParseErrorCode,
} from '@core/doc-model';
import type {
  AskRequest,
  FileProblem,
  FileRef,
  ReadFileResponse,
  WriteFileResponse,
} from '../../../shared/ipc-types';
import { createFileFlows, parseProblem, type FlowMain, type RecoveryPort } from './file-flows';
import { createRecovery } from './recovery';
import { createSession, sessionUpdate, type Session } from './session';

const NOW = '2026-11-11T09:00:00.000Z';
const enc = new TextEncoder();
const decodeUtf8 = (bytes: Uint8Array): string | null => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

/** Small saved drawings: `ethanol` has three atoms, `toluene` seven (stand-ins, parse-checked). */
const SIZES = { ethanol: 3, toluene: 7 } as const;
function golden(name: keyof typeof SIZES): Doc {
  let doc = setStyle(emptyDoc(NOW), { preset: 'journal' });
  for (let i = 0; i < SIZES[name]; i++) [doc] = addAtom(doc, { element: 'C', x: i, y: 0 });
  const parsed = parse(serialize(doc));
  if (!parsed.ok) throw new Error(name);
  return parsed.value;
}

let ids = 0;
function ref(name: string): FileRef {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase() as FileRef['kind'];
  return { id: `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`, name, kind: ext };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** A controller fake: the document's identity decides dirty, as the editor's history does. */
function fakeController(start: Doc) {
  let doc = start;
  let saved = start;
  return {
    getDoc: vi.fn(() => doc),
    load: vi.fn((d: Doc) => {
      doc = d;
      saved = d;
    }),
    markSaved: vi.fn(() => {
      saved = doc;
    }),
    isDirty: () => doc !== saved,
    notify: vi.fn<(kind: 'info' | 'error', text: string) => void>(),
    /** An edit: a new document object. */
    edit() {
      [doc] = addAtom(doc, { element: 'C', x: Object.keys(doc.atoms).length, y: 0 });
    },
  };
}

interface Script {
  open?: FileRef | null;
  files?: Record<string, ReadFileResponse>;
  save?: (FileRef | null)[];
  write?: WriteFileResponse | Deferred<WriteFileResponse>;
  answers?: ('save' | 'discard' | 'cancel')[];
  /** RC2: list the recovery clears among `calls`. */
  traceRecovery?: boolean;
  /** RC3: the recover box's answers, in turn ('recover' when none is left). */
  recover?: ('recover' | 'delete')[];
  /** A recovery port to use instead of the recording fake (integration with `createRecovery`). */
  recovery?: RecoveryPort;
  /** F4a: what each `finishEditing` call does (an open editor committing), in turn. */
  finish?: ((controller: ReturnType<typeof fakeController>) => void)[];
}

function rig(script: Script = {}, start: Doc = setStyle(emptyDoc(NOW), { preset: 'slides' })) {
  const controller = fakeController(start);
  const session: Session = createSession();
  const titles: string[] = [];
  const saves = [...(script.save ?? [])];
  const answers = [...(script.answers ?? [])];
  const recoverAnswers = [...(script.recover ?? [])];
  const calls: string[] = [];
  const main = {
    chooseOpen: vi.fn(async () => {
      calls.push('chooseOpen');
      return script.open ?? null;
    }),
    readFile: vi.fn(async (r: FileRef): Promise<ReadFileResponse> => {
      calls.push(`read ${r.name}`);
      return script.files?.[r.id] ?? { ok: false, problem: 'missing' };
    }),
    chooseSave: vi.fn(async (_format: FileRef['kind'], name: string) => {
      calls.push(`chooseSave ${name}`);
      return saves.shift() ?? null;
    }),
    writeFile: vi.fn(async (r: FileRef, _data: Uint8Array): Promise<WriteFileResponse> => {
      calls.push(`write ${r.name}`);
      const w = script.write ?? { ok: true };
      return 'promise' in w ? w.promise : w;
    }),
    ask: vi.fn(async (request: AskRequest): Promise<string> => {
      if (request.kind === 'recover') {
        calls.push('ask recover');
        return recoverAnswers.shift() ?? 'recover';
      }
      calls.push(`ask ${request.name}`);
      return answers.shift() ?? 'cancel';
    }),
    showFileError: vi.fn(async (problem: FileProblem, name: string) => {
      calls.push(`error ${problem} ${name}`);
    }),
    sessionFile: vi.fn((r: FileRef | null) => {
      calls.push(`sessionFile ${r?.name ?? 'null'}`);
    }),
    closeOk: vi.fn(() => {
      calls.push('closeOk');
    }),
    logError: vi.fn<(message: string) => void>(),
  };
  const recoveryCalls: string[] = [];
  const recovery = {
    clear: vi.fn(() => {
      recoveryCalls.push('clear');
      // Only a rig that traces recovery lists it among the calls (older call lists stay as they were).
      if (script.traceRecovery) calls.push('recovery clear');
    }),
    settle: vi.fn(() => {
      recoveryCalls.push(
        `settle ${controller.isDirty() || session.forcedDirty ? 'dirty' : 'clean'}`,
      );
    }),
    adopt: vi.fn(() => {
      recoveryCalls.push('adopt');
    }),
  };
  let style: 'slides' | 'journal' = 'slides';
  const finishes = [...(script.finish ?? [])];
  const finishEditing = vi.fn(async () => {
    // Only a rig that scripts F4a lists it among the calls (older call lists stay as they were).
    if (script.finish !== undefined) calls.push('finish');
    finishes.shift()?.(controller);
  });
  const flows = createFileFlows({
    finishEditing,
    // The fake answers both I4 kinds with one function (the port's `ask` is generic).
    main: main as unknown as FlowMain,
    recovery: script.recovery ?? recovery,
    controller,
    session,
    publish: () => titles.push(sessionUpdate(session, controller.isDirty()).title),
    clock: () => NOW,
    newDrawingStyle: () => style,
    decodeUtf8,
    encodeUtf8: (text) => enc.encode(text),
  });
  return {
    flows,
    finishEditing,
    recovery,
    recoveryCalls,
    main,
    controller,
    session,
    titles,
    calls,
    setStyle: (s: typeof style) => {
      style = s;
    },
  };
}

const chalkFile = (doc: Doc): ReadFileResponse => ({ ok: true, bytes: enc.encode(serialize(doc)) });
const written = (main: { writeFile: { mock: { calls: [FileRef, Uint8Array][] } } }, i = 0) =>
  new TextDecoder().decode(main.writeFile.mock.calls[i]?.[1]);

describe('F1 New', () => {
  it('not dirty: a fresh empty drawing in the startup style, Untitled, N2 null, title', async () => {
    const r = rig();
    r.setStyle('journal');
    r.controller.markSaved();
    await r.flows.newDrawing();
    expect(r.controller.load).toHaveBeenCalledTimes(1);
    const loaded = r.controller.load.mock.calls[0]?.[0];
    expect(loaded).toEqual(setStyle(emptyDoc(NOW), { preset: 'journal' }));
    expect(r.session).toEqual(createSession());
    expect(r.main.ask).not.toHaveBeenCalled();
    expect(r.calls).toEqual(['sessionFile null']);
    expect(r.titles.at(-1)).toBe('Untitled - Chalkbond');
  });

  it("dirty + Cancel keeps the drawing; Don't save replaces it", async () => {
    const r = rig({ answers: ['cancel', 'discard'] });
    r.controller.edit();
    const before = r.controller.getDoc();
    await r.flows.newDrawing();
    expect(r.calls).toEqual(['ask Untitled']);
    expect(r.controller.getDoc()).toBe(before);
    await r.flows.newDrawing();
    expect(r.controller.load).toHaveBeenCalledTimes(1);
    expect(r.controller.isDirty()).toBe(false);
  });

  it('dirty + Save on Untitled goes to Save as, writes, then replaces', async () => {
    const out = ref('esterification.chalk');
    const r = rig({ answers: ['save'], save: [out] });
    r.controller.edit();
    const drawn = r.controller.getDoc();
    await r.flows.newDrawing();
    expect(r.calls).toEqual([
      'ask Untitled',
      'chooseSave Untitled.chalk',
      'write esterification.chalk',
      'sessionFile esterification.chalk',
      'sessionFile null',
    ]);
    expect(written(r.main)).toBe(serialize(drawn));
    expect(r.controller.load).toHaveBeenCalledTimes(1);
    expect(r.session.kind).toBe('untitled');
  });

  it('dirty + Save cancelled in the Save dialog, or failed, stops New', async () => {
    const r = rig({ answers: ['save', 'save'], save: [null, ref('x.chalk')] });
    r.controller.edit();
    await r.flows.newDrawing();
    expect(r.controller.load).not.toHaveBeenCalled();
    r.main.writeFile.mockResolvedValueOnce({ ok: false, problem: 'folder-gone' });
    await r.flows.newDrawing();
    expect(r.controller.load).not.toHaveBeenCalled();
    expect(r.calls).toContain('error folder-gone x.chalk');
    expect(r.controller.isDirty()).toBe(true);
    expect(r.session.kind).toBe('untitled');
  });

  it("R14: an edit during the prompt's save keeps the newer drawing and stops New", async () => {
    const write = deferred<WriteFileResponse>();
    const out = ref('esterification.chalk');
    const r = rig({ answers: ['save'], save: [out], write });
    r.controller.edit();
    const snapshot = r.controller.getDoc();
    const running = r.flows.newDrawing();
    await vi.waitFor(() => expect(r.main.writeFile).toHaveBeenCalled());
    r.controller.edit();
    const newer = r.controller.getDoc();
    write.resolve({ ok: true });
    await running;
    expect(written(r.main)).toBe(serialize(snapshot));
    expect(r.controller.load).not.toHaveBeenCalled();
    expect(r.controller.getDoc()).toBe(newer);
    expect(r.controller.markSaved).not.toHaveBeenCalled();
    expect(r.controller.isDirty()).toBe(true);
    expect(r.main.ask).toHaveBeenCalledTimes(1); // no extra box
    expect(r.session).toMatchObject({ kind: 'chalk', name: 'esterification.chalk', ref: out });
    expect(r.titles.at(-1)).toBe('*esterification - Chalkbond');
  });
});

describe('F2 / F3 Open', () => {
  it('cancelled Open dialog: nothing, no prompt', async () => {
    const r = rig();
    r.controller.edit();
    await r.flows.open();
    expect(r.calls).toEqual(['chooseOpen']);
  });

  it('A5: the dialog first, the bytes validated, then the prompt; success loads the file', async () => {
    const file = ref('esterification.chalk');
    const doc = golden('ethanol');
    const r = rig({ open: file, files: { [file.id]: chalkFile(doc) }, answers: ['discard'] });
    r.controller.edit();
    await r.flows.open();
    expect(r.calls).toEqual([
      'chooseOpen',
      'read esterification.chalk',
      'ask Untitled',
      'sessionFile esterification.chalk',
    ]);
    expect(r.controller.getDoc()).toEqual(doc);
    expect(r.session).toEqual({
      name: 'esterification.chalk',
      kind: 'chalk',
      ref: file,
      forcedDirty: false,
    });
    expect(r.titles.at(-1)).toBe('esterification - Chalkbond');
    expect(r.controller.notify).not.toHaveBeenCalled(); // the title says it
  });

  it('a UTF-8 BOM before the JSON is accepted', async () => {
    const file = ref('bom.chalk');
    const doc = golden('ethanol');
    const bytes = enc.encode(`\ufeff${serialize(doc)}`);
    const r = rig({ files: { [file.id]: { ok: true, bytes } } });
    await r.flows.openRef(file);
    expect(r.controller.getDoc()).toEqual(doc);
  });

  it('read and parse failures: the F14 box, no prompt, drawing and session unchanged', async () => {
    const cases: [ReadFileResponse, FileProblem][] = [
      [{ ok: false, problem: 'missing' }, 'missing'],
      [{ ok: false, problem: 'too-large' }, 'too-large'],
      [{ ok: false, problem: 'unreadable' }, 'unreadable'],
      [{ ok: true, bytes: enc.encode('{"format":"chalkbond"') }, 'damaged'],
      [{ ok: true, bytes: new Uint8Array([0xff, 0xfe, 0x00]) }, 'damaged'],
      [
        {
          ok: true,
          bytes: enc.encode(
            serialize(golden('ethanol')).replace('"schemaVersion": 1', '"schemaVersion": 999'),
          ),
        },
        'newer-version',
      ],
    ];
    for (const [response, problem] of cases) {
      const file = ref('ethanol.chalk');
      const r = rig({ open: file, files: { [file.id]: response } });
      r.controller.edit();
      const before = r.controller.getDoc();
      const session = { ...r.session };
      await r.flows.open();
      expect(r.calls).toEqual([
        'chooseOpen',
        'read ethanol.chalk',
        `error ${problem} ethanol.chalk`,
      ]);
      expect(r.controller.getDoc()).toBe(before);
      expect(r.session).toEqual(session);
      expect(r.controller.load).not.toHaveBeenCalled();
    }
  });

  it('dirty + Cancel after a valid file: unchanged; + Save with an edit during write: unchanged', async () => {
    const file = ref('ethanol.chalk');
    const write = deferred<WriteFileResponse>();
    const out = ref('mine.chalk');
    const r = rig({
      open: file,
      files: { [file.id]: chalkFile(golden('ethanol')) },
      answers: ['cancel', 'save'],
      save: [out],
      write,
    });
    r.controller.edit();
    await r.flows.open();
    expect(r.controller.load).not.toHaveBeenCalled();
    const running = r.flows.open();
    await vi.waitFor(() => expect(r.main.writeFile).toHaveBeenCalled());
    r.controller.edit();
    const newer = r.controller.getDoc();
    write.resolve({ ok: true });
    await running;
    expect(r.controller.load).not.toHaveBeenCalled(); // R14
    expect(r.controller.getDoc()).toBe(newer);
    expect(r.session.name).toBe('mine.chalk');
    expect(r.controller.isDirty()).toBe(true);
  });

  it('dirty + Save that leaves the drawing clean opens the file', async () => {
    const file = ref('ethanol.chalk');
    const r = rig({
      open: file,
      files: { [file.id]: chalkFile(golden('ethanol')) },
      answers: ['save'],
      save: [ref('mine.chalk')],
    });
    r.controller.edit();
    await r.flows.open();
    expect(r.controller.getDoc()).toEqual(golden('ethanol'));
    expect(r.session.name).toBe('ethanol.chalk');
  });
});

describe('F5 / F6 Save and Save as', () => {
  it('Untitled Save → Save as: writes serialize(snapshot), marks saved, session, notice', async () => {
    const out = ref('esterification.chalk');
    const r = rig({ save: [out] });
    r.controller.edit();
    const drawn = r.controller.getDoc();
    await r.flows.save();
    expect(r.calls).toEqual([
      'chooseSave Untitled.chalk',
      'write esterification.chalk',
      'sessionFile esterification.chalk',
    ]);
    expect(r.main.chooseSave).toHaveBeenCalledWith('chalk', 'Untitled.chalk');
    expect(written(r.main)).toBe(serialize(drawn));
    expect(r.controller.isDirty()).toBe(false);
    expect(r.session).toEqual({
      name: 'esterification.chalk',
      kind: 'chalk',
      ref: out,
      forcedDirty: false,
    });
    expect(r.controller.notify).toHaveBeenCalledWith('info', 'Saved esterification.chalk.');
    expect(r.titles.at(-1)).toBe('esterification - Chalkbond');
  });

  it('a .chalk session saves in place without a dialog; Save as suggests its name', async () => {
    const out = ref('esterification.chalk');
    const r = rig({ save: [out, null] });
    r.controller.edit();
    await r.flows.save();
    r.controller.edit();
    await r.flows.save();
    expect(r.main.chooseSave).toHaveBeenCalledTimes(1);
    expect(r.main.writeFile.mock.calls[1]?.[0]).toBe(out);
    expect(r.controller.isDirty()).toBe(false);
    r.controller.edit();
    await r.flows.saveAs();
    expect(r.main.chooseSave).toHaveBeenLastCalledWith('chalk', 'esterification.chalk');
  });

  it('Save as cancelled: no write, still dirty, session unchanged', async () => {
    const r = rig({ save: [null] });
    r.controller.edit();
    await r.flows.saveAs();
    expect(r.main.writeFile).not.toHaveBeenCalled();
    expect(r.controller.isDirty()).toBe(true);
    expect(r.session).toEqual(createSession());
    expect(r.controller.notify).not.toHaveBeenCalled();
  });

  it('failed write: the error box with the problem, still dirty, session unchanged', async () => {
    const r = rig({
      save: [ref('esterification.chalk')],
      write: { ok: false, problem: 'folder-gone' },
    });
    r.controller.edit();
    await r.flows.save();
    expect(r.calls).toContain('error folder-gone esterification.chalk');
    expect(r.controller.isDirty()).toBe(true);
    expect(r.session).toEqual(createSession());
    expect(r.main.sessionFile).not.toHaveBeenCalled();
    expect(r.controller.notify).not.toHaveBeenCalled();
    expect(r.titles.at(-1) ?? '*Untitled - Chalkbond').toBe('*Untitled - Chalkbond');
  });

  it('R7: an edit during an explicit save stays dirty; the file holds the snapshot', async () => {
    const write = deferred<WriteFileResponse>();
    const out = ref('esterification.chalk');
    const r = rig({ save: [out], write });
    r.controller.edit();
    const snapshot = r.controller.getDoc();
    const running = r.flows.save();
    await vi.waitFor(() => expect(r.main.writeFile).toHaveBeenCalled());
    r.controller.edit();
    write.resolve({ ok: true });
    await running;
    expect(written(r.main)).toBe(serialize(snapshot));
    expect(r.controller.markSaved).not.toHaveBeenCalled();
    expect(r.controller.isDirty()).toBe(true);
    expect(r.session.ref).toBe(out);
    expect(r.titles.at(-1)).toBe('*esterification - Chalkbond');
    expect(r.controller.notify).toHaveBeenCalledWith('info', 'Saved esterification.chalk.');
  });

  it('F7: a recovered drawing is dirty until saved; a stale save keeps it dirty', async () => {
    const write = deferred<WriteFileResponse>();
    const r = rig({ save: [ref('a.chalk'), ref('b.chalk')], write });
    r.session.name = 'Recovered drawing';
    r.session.kind = 'recovered';
    r.session.forcedDirty = true;
    expect(r.flows.dirty()).toBe(true);
    const running = r.flows.save();
    await vi.waitFor(() => expect(r.main.writeFile).toHaveBeenCalled());
    r.controller.edit();
    r.controller.markSaved(); // even back to a "saved" editor state, forcedDirty survives
    write.resolve({ ok: true });
    await running;
    expect(r.main.chooseSave).toHaveBeenCalledWith('chalk', 'Recovered drawing.chalk');
    expect(r.flows.dirty()).toBe(true);
    const clean = rig({ save: [ref('a.chalk')] });
    clean.session.forcedDirty = true;
    clean.session.kind = 'recovered';
    await clean.flows.save();
    expect(clean.flows.dirty()).toBe(false);
    expect(clean.session.forcedDirty).toBe(false);
  });
});

describe('in-progress flag and the pending request', () => {
  it('ignores New, Open, Save and Save as while a flow runs', async () => {
    const answer = deferred<'save' | 'discard' | 'cancel'>();
    const r = rig();
    r.main.ask.mockImplementationOnce(() => answer.promise);
    r.controller.edit();
    const running = r.flows.newDrawing();
    expect(r.flows.busy()).toBe(true);
    await r.flows.newDrawing();
    await r.flows.open();
    await r.flows.save();
    await r.flows.saveAs();
    expect(r.main.ask).toHaveBeenCalledTimes(1);
    expect(r.main.chooseOpen).not.toHaveBeenCalled();
    expect(r.main.chooseSave).not.toHaveBeenCalled();
    answer.resolve('cancel');
    await running;
    expect(r.flows.busy()).toBe(false);
  });

  it('a ref opened while a prompt is open waits; the latest wins', async () => {
    const answer = deferred<'save' | 'discard' | 'cancel'>();
    const a = ref('a.chalk');
    const b = ref('b.chalk');
    const r = rig({
      files: { [a.id]: chalkFile(golden('ethanol')), [b.id]: chalkFile(golden('toluene')) },
    });
    r.main.ask.mockImplementationOnce(() => answer.promise);
    r.controller.edit();
    const running = r.flows.newDrawing();
    await r.flows.openRef(a);
    await r.flows.openRef(b);
    expect(r.main.readFile).not.toHaveBeenCalled();
    answer.resolve('discard');
    await running;
    await vi.waitFor(() => expect(r.session.name).toBe('b.chalk'));
    expect(r.main.readFile).toHaveBeenCalledTimes(1);
    expect(r.controller.getDoc()).toEqual(golden('toluene'));
  });

  it('a failing port is logged and frees the flag', async () => {
    const r = rig();
    r.main.chooseOpen.mockRejectedValueOnce(new Error('Rejected IPC request'));
    await r.flows.open();
    expect(r.main.logError).toHaveBeenCalledWith(expect.stringContaining('Rejected IPC request'));
    expect(r.flows.busy()).toBe(false);
  });
});

describe('F13 close', () => {
  it("not dirty → close ok; dirty: Cancel stays, Don't save closes", async () => {
    const r = rig({ answers: ['cancel', 'discard'] });
    await r.flows.requestClose();
    expect(r.calls).toEqual(['closeOk']);
    r.controller.edit();
    await r.flows.requestClose();
    expect(r.main.closeOk).toHaveBeenCalledTimes(1);
    await r.flows.requestClose();
    expect(r.main.closeOk).toHaveBeenCalledTimes(2);
  });

  it('Save that succeeds closes; R14 an edit during the write does not', async () => {
    const write = deferred<WriteFileResponse>();
    const r = rig({ answers: ['save'], save: [ref('a.chalk')], write });
    r.controller.edit();
    const running = r.flows.requestClose();
    await vi.waitFor(() => expect(r.main.writeFile).toHaveBeenCalled());
    r.controller.edit();
    write.resolve({ ok: true });
    await running;
    expect(r.main.closeOk).not.toHaveBeenCalled();
    expect(r.controller.isDirty()).toBe(true);
    const ok = rig({ answers: ['save'], save: [ref('a.chalk')] });
    ok.controller.edit();
    await ok.flows.requestClose();
    expect(ok.calls).toEqual([
      'ask Untitled',
      'chooseSave Untitled.chalk',
      'write a.chalk',
      'sessionFile a.chalk',
      'closeOk',
    ]);
  });

  it('a close request during a flow waits and then runs', async () => {
    const answer = deferred<'save' | 'discard' | 'cancel'>();
    const r = rig();
    r.main.ask.mockImplementationOnce(() => answer.promise);
    r.controller.edit();
    const running = r.flows.newDrawing();
    await r.flows.requestClose();
    expect(r.main.closeOk).not.toHaveBeenCalled();
    answer.resolve('discard');
    await running;
    expect(r.main.closeOk).toHaveBeenCalledTimes(1);
  });
});

/** A 1×1 transparent PNG from another program (no Chalkbond chunk). */
const PIXEL = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);
const pngOf = (doc: Doc): Uint8Array =>
  withPictureChunks(PIXEL, { dpi: 300, payload: drawingPayloadOf(doc) });
/** clipboard-export E1: the payload is the drawing's `serialize` as one ASCII JSON line. */
const drawingPayloadOf = (doc: Doc): string => JSON.stringify(JSON.parse(serialize(doc)));
const bytes = (b: Uint8Array): ReadFileResponse => ({ ok: true, bytes: b });

describe('A9: F3 for exported pictures (clipboard-export E4) and the F14 mapping', () => {
  it('a PNG with the drawing chunk opens as a picture session, not dirty', async () => {
    const file = ref('toluene.png');
    const doc = golden('toluene');
    const r = rig({ open: file, files: { [file.id]: bytes(pngOf(doc)) } });
    await r.flows.open();
    expect(r.controller.getDoc()).toEqual(doc);
    expect(r.session).toEqual({
      name: 'toluene.png',
      kind: 'picture',
      ref: file,
      forcedDirty: false,
    });
    expect(r.flows.dirty()).toBe(false);
    expect(r.titles.at(-1)).toBe('toluene.png - Chalkbond');
    expect(r.calls).toEqual(['chooseOpen', 'read toluene.png', 'sessionFile toluene.png']);
  });

  it('an exported SVG opens from its metadata; the SVG is only scanned', async () => {
    const file = ref('toluene.svg');
    const doc = golden('toluene');
    const svg = exportSvg(doc, null).svg;
    const r = rig({ files: { [file.id]: bytes(enc.encode(svg)) } });
    await r.flows.openRef(file);
    expect(serialize(r.controller.getDoc())).toBe(serialize(doc));
    expect(r.session.kind).toBe('picture');
  });

  it('C9: a picture over 20 MiB with a small drawing inside opens; an oversize drawing is too large', async () => {
    const doc = golden('toluene');
    const svg = exportSvg(doc, null).svg.replace(
      '</svg>',
      `<!--${'x'.repeat(21 * 1024 * 1024)}--></svg>`,
    );
    const big = ref('big.svg');
    const r = rig({ files: { [big.id]: bytes(enc.encode(svg)) } });
    await r.flows.openRef(big);
    expect(serialize(r.controller.getDoc())).toBe(serialize(doc));
    expect(r.session.kind).toBe('picture');

    // The drawing inside is still held to parse's 20 MiB rule.
    const huge = `<svg><metadata id="chalkbond">{${' '.repeat(MAX_FILE_BYTES)}}</metadata></svg>`;
    const file = ref('huge.svg');
    const h = rig({ files: { [file.id]: bytes(enc.encode(huge)) } });
    await h.flows.openRef(file);
    expect(h.calls).toEqual(['read huge.svg', 'error too-large huge.svg']);
    expect(h.controller.load).not.toHaveBeenCalled();
  });

  it("A6: a picture session's Save goes to Save as with <name>.chalk; the picture is never written", async () => {
    const file = ref('toluene.png');
    const out = ref('toluene.chalk');
    const r = rig({ files: { [file.id]: bytes(pngOf(golden('toluene'))) }, save: [out] });
    await r.flows.openRef(file);
    r.controller.edit();
    await r.flows.save();
    expect(r.main.chooseSave).toHaveBeenCalledWith('chalk', 'toluene.chalk');
    expect(r.main.writeFile.mock.calls.map(([w]) => w)).toEqual([out]);
    expect(r.session).toEqual({
      name: 'toluene.chalk',
      kind: 'chalk',
      ref: out,
      forcedDirty: false,
    });
    expect(r.titles.at(-1)).toBe('toluene - Chalkbond');
  });

  it('every extractDrawing problem: the F14 box, no prompt, drawing and session unchanged', async () => {
    const cases: [string, Uint8Array, FileProblem][] = [
      ['photo.png', PIXEL, 'no-drawing'],
      ['notpng.png', enc.encode('GIF89a'), 'damaged'],
      ['plain.svg', enc.encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'no-drawing'],
      ['bad.svg', new Uint8Array([0x3c, 0xff, 0xfe]), 'damaged'],
      ['print.pdf', enc.encode('%PDF-1.4\n%%EOF\n'), 'no-drawing'],
      ['fake.pdf', enc.encode('hello'), 'damaged'],
      ['huge.chalk', new Uint8Array(MAX_FILE_BYTES + 1), 'too-large'],
      ['huge.png', new Uint8Array(MAX_PICTURE_BYTES + 1), 'too-large'],
    ];
    for (const [name, data, problem] of cases) {
      const file = ref(name);
      const r = rig({ open: file, files: { [file.id]: bytes(data) } });
      r.controller.edit();
      const before = r.controller.getDoc();
      await r.flows.open();
      expect(r.calls).toEqual(['chooseOpen', `read ${name}`, `error ${problem} ${name}`]);
      expect(r.controller.getDoc()).toBe(before);
      expect(r.session).toEqual(createSession());
    }
  });

  it('a picture whose embedded drawing is newer or damaged maps through parse', async () => {
    const newer = serialize(golden('ethanol')).replace(
      '"schemaVersion": 1',
      '"schemaVersion": 999',
    );
    const cases: [Uint8Array, FileProblem][] = [
      [
        withPictureChunks(PIXEL, { dpi: 300, payload: JSON.stringify(JSON.parse(newer)) }),
        'newer-version',
      ],
      [withPictureChunks(PIXEL, { dpi: 300, payload: '{"format":"chalkbond"' }), 'damaged'],
    ];
    for (const [data, problem] of cases) {
      const file = ref('t.png');
      const r = rig({ files: { [file.id]: bytes(data) } });
      await r.flows.openRef(file);
      expect(r.calls).toEqual(['read t.png', `error ${problem} t.png`]);
      expect(r.controller.load).not.toHaveBeenCalled();
    }
  });

  it('a ref whose name has no Open extension is unsupported (never read as a drawing)', async () => {
    const file: FileRef = { ...ref('notes.chalk'), name: 'notes.docx' };
    const r = rig({ files: { [file.id]: bytes(enc.encode('{}')) } });
    await r.flows.openRef(file);
    expect(r.calls).toEqual(['read notes.docx', 'error unsupported notes.docx']);
  });

  it('every parse code maps to an F14 problem (newer-version, too-large, else damaged)', () => {
    const expected: Record<ParseErrorCode, FileProblem> = {
      'too-large': 'too-large',
      'invalid-json': 'damaged',
      'not-chalkbond': 'damaged',
      'newer-version': 'newer-version',
      'unsupported-version': 'damaged',
      'migration-failed': 'damaged',
      schema: 'damaged',
      invariants: 'damaged',
    };
    for (const [code, problem] of Object.entries(expected))
      expect(parseProblem(code as ParseErrorCode)).toBe(problem);
  });
});

describe('F4a: an open label or text editor is finished before F4 decides (R17)', () => {
  const commit = (c: ReturnType<typeof fakeController>): void => c.edit();

  it('close: a clean drawing with an open editor is committed first, then the prompt asks', async () => {
    const r = rig({ answers: ['cancel'], finish: [commit] });
    r.controller.markSaved();
    await r.flows.requestClose();
    expect(r.calls).toEqual(['finish', 'ask Untitled']);
    expect(r.main.closeOk).not.toHaveBeenCalled();
    expect(r.controller.isDirty()).toBe(true); // Cancel keeps the edit
  });

  it('close: nothing open, clean: finish resolves and the window closes without a prompt', async () => {
    const r = rig({ finish: [] });
    r.controller.markSaved();
    await r.flows.requestClose();
    expect(r.calls).toEqual(['finish', 'closeOk']);
  });

  it('New: committed first; Save writes the committed drawing, then New goes ahead', async () => {
    const out = ref('ethanol.chalk');
    const r = rig({ answers: ['save'], save: [out], finish: [commit] });
    r.controller.markSaved();
    await r.flows.newDrawing();
    expect(r.calls.slice(0, 3)).toEqual(['finish', 'ask Untitled', 'chooseSave Untitled.chalk']);
    const saved = parse(written(r.main));
    expect(saved.ok && Object.keys(saved.value.atoms)).toHaveLength(1); // the committed edit
    expect(r.finishEditing).toHaveBeenCalledTimes(2); // before F4 and after its Save
    expect(r.controller.load).toHaveBeenCalledTimes(1);
  });

  it('openRef (F11 / F12): read and validated first, then finished, then the prompt', async () => {
    const file = ref('toluene.chalk');
    const r = rig({
      files: { [file.id]: chalkFile(golden('toluene')) },
      answers: ['cancel'],
      finish: [commit],
    });
    r.controller.markSaved();
    await r.flows.openRef(file);
    expect(r.calls).toEqual(['read toluene.chalk', 'finish', 'ask Untitled']);
    expect(r.controller.load).not.toHaveBeenCalled();
  });

  it('Open (Ctrl+O): a file that fails to validate shows F14 and never finishes the editor', async () => {
    const file = ref('broken.chalk');
    const r = rig({
      open: file,
      files: { [file.id]: { ok: true, bytes: enc.encode('{ nope') } },
      finish: [],
    });
    await r.flows.open();
    expect(r.calls).toEqual(['chooseOpen', 'read broken.chalk', 'error damaged broken.chalk']);
    expect(r.finishEditing).not.toHaveBeenCalled();
  });

  it('Open (Ctrl+O): chosen, validated, finished, prompted', async () => {
    const file = ref('toluene.chalk');
    const r = rig({
      open: file,
      files: { [file.id]: chalkFile(golden('toluene')) },
      answers: ['discard'],
      finish: [commit],
    });
    r.controller.markSaved();
    await r.flows.open();
    expect(r.calls.slice(0, 4)).toEqual([
      'chooseOpen',
      'read toluene.chalk',
      'finish',
      'ask Untitled',
    ]);
    expect(r.controller.load).toHaveBeenCalledTimes(1);
  });

  it('R14: an editor opened during the Save write is finished after it; the newer text stops New, Open and close', async () => {
    for (const action of ['new', 'open', 'close'] as const) {
      const write = deferred<WriteFileResponse>();
      const out = ref('esterification.chalk');
      const file = ref('toluene.chalk');
      // 1st finish: nothing open. 2nd (after Save): the draft typed during the write commits.
      const r = rig({
        answers: ['save'],
        save: [out],
        write,
        files: { [file.id]: chalkFile(golden('toluene')) },
        finish: [() => undefined, commit],
      });
      r.controller.edit();
      const running =
        action === 'new'
          ? r.flows.newDrawing()
          : action === 'open'
            ? r.flows.openRef(file)
            : r.flows.requestClose();
      await vi.waitFor(() => expect(r.main.writeFile).toHaveBeenCalled());
      write.resolve({ ok: true });
      await running;
      expect(r.controller.markSaved, action).toHaveBeenCalledTimes(1); // the write itself was clean
      expect(r.finishEditing, action).toHaveBeenCalledTimes(2);
      expect(r.controller.isDirty(), action).toBe(true);
      expect(r.controller.load, action).not.toHaveBeenCalled();
      expect(r.main.closeOk, action).not.toHaveBeenCalled();
      expect(r.main.ask, action).toHaveBeenCalledTimes(1);
      // The session is the saved file; N1's '*' follows the editor's dirty event (CO3, host).
      expect(r.session, action).toMatchObject({ kind: 'chalk', name: 'esterification.chalk' });
    }
  });
});

describe('A14 RC2: when the flows clear the recovery file', () => {
  it('New and Open clear only after F4 passed; a cancelled prompt, dialog or bad file keeps it', async () => {
    const good = ref('ethanol.chalk');
    const r = rig({
      traceRecovery: true,
      answers: ['cancel', 'discard', 'cancel'],
      open: good,
      files: { [good.id]: chalkFile(golden('ethanol')) },
    });
    r.controller.edit();
    await r.flows.newDrawing(); // Cancel
    expect(r.recoveryCalls).toEqual([]);
    await r.flows.newDrawing(); // Don't save
    expect(r.calls).toEqual(['ask Untitled', 'ask Untitled', 'sessionFile null', 'recovery clear']);
    r.controller.edit();
    await r.flows.open(); // prompt Cancel
    expect(r.recoveryCalls).toEqual(['clear']);
    const bad = rig({ traceRecovery: true, open: ref('broken.chalk') });
    bad.controller.edit();
    await bad.flows.open(); // missing file: F14
    const cancelled = rig({ traceRecovery: true, open: null });
    await cancelled.flows.open();
    expect([...bad.recoveryCalls, ...cancelled.recoveryCalls]).toEqual([]);
    const opened = rig({
      traceRecovery: true,
      open: good,
      files: { [good.id]: chalkFile(golden('ethanol')) },
    });
    await opened.flows.open();
    expect(opened.calls.slice(-2)).toEqual(['sessionFile ethanol.chalk', 'recovery clear']);
  });

  it('Save settles only after a successful write; a cancelled or failed save leaves it alone', async () => {
    const out = ref('a.chalk');
    const r = rig({ traceRecovery: true, save: [null, out] });
    r.controller.edit();
    await r.flows.save(); // Save as cancelled
    expect(r.recoveryCalls).toEqual([]);
    await r.flows.save();
    expect(r.recoveryCalls).toEqual(['settle clean']);
    const failed = rig({
      traceRecovery: true,
      save: [ref('b.chalk')],
      write: { ok: false, problem: 'disk-full' },
    });
    failed.controller.edit();
    await failed.flows.save();
    expect(failed.recoveryCalls).toEqual([]);
  });

  it("close: Don't save clears, then N5; Cancel neither; R14 still dirty after Save: no clear", async () => {
    const r = rig({ traceRecovery: true, answers: ['cancel', 'discard'] });
    r.controller.edit();
    await r.flows.requestClose();
    expect(r.calls).toEqual(['ask Untitled']);
    await r.flows.requestClose();
    expect(r.calls).toEqual(['ask Untitled', 'ask Untitled', 'recovery clear', 'closeOk']);
    const write = deferred<WriteFileResponse>();
    const stale = rig({ traceRecovery: true, answers: ['save'], save: [ref('c.chalk')], write });
    stale.controller.edit();
    const closing = stale.flows.requestClose();
    await vi.waitFor(() => expect(stale.main.writeFile).toHaveBeenCalled());
    stale.controller.edit();
    write.resolve({ ok: true });
    await closing;
    expect(stale.recoveryCalls).toEqual(['settle dirty']);
    expect(stale.main.closeOk).not.toHaveBeenCalled();
  });

  it('a newer edit during the save, already in the recovery file, survives the save (real recovery)', async () => {
    let now = 0;
    const due: { at: number; fn: () => void; live: boolean }[] = [];
    const sent: string[] = [];
    const holder: { r?: ReturnType<typeof rig> } = {};
    const recovery = createRecovery({
      now: () => now,
      schedule: (fn, ms) => {
        const entry = { at: now + ms, fn, live: true };
        due.push(entry);
        return () => {
          entry.live = false;
        };
      },
      main: {
        writeRecovery: ({ text }) => {
          const parsed = parse(text);
          sent.push(`write ${parsed.ok ? Object.keys(parsed.value.atoms).length : 'bad'}`);
        },
        clearRecovery: () => sent.push('clear'),
      },
      dirty: () => holder.r?.flows.dirty() ?? false,
      doc: () => holder.r?.controller.getDoc(),
      text: () => serialize(holder.r?.controller.getDoc() ?? emptyDoc(NOW)),
      name: () => 'Untitled',
    });
    const advance = (ms: number) => {
      now += ms;
      for (const entry of due) {
        if (entry.live && entry.at <= now) {
          entry.live = false;
          entry.fn();
        }
      }
    };
    const write = deferred<WriteFileResponse>();
    const r = rig({ traceRecovery: true, save: [ref('d.chalk')], write, recovery });
    holder.r = r;
    const edit = () => {
      r.controller.edit();
      recovery.update();
    };
    edit();
    advance(2000);
    const saving = r.flows.save(); // writes the 1-atom snapshot
    await vi.waitFor(() => expect(r.main.writeFile).toHaveBeenCalled());
    edit(); // 2 atoms, newer than the snapshot
    advance(2000);
    write.resolve({ ok: true });
    await saving;
    recovery.update();
    advance(20_000);
    expect(sent).toEqual(['write 1', 'write 2']);
    expect(r.flows.dirty()).toBe(true);
  });
});

describe('A14 RC3 / RC4 startup (CO5)', () => {
  const text = serialize(golden('toluene'));

  it('Recover: loads the drawing as "Recovered drawing", forcedDirty, adopts the file; Save as suggests the old name', async () => {
    const out = ref('esterification.chalk');
    const r = rig({ traceRecovery: true, recover: ['recover'], save: [out] });
    await r.flows.start({ recovery: { text, name: 'esterification.chalk' }, open: null });
    expect(r.calls).toEqual(['ask recover', 'sessionFile null']);
    expect(Object.keys(r.controller.getDoc().atoms)).toHaveLength(7);
    expect(r.session).toMatchObject({
      name: 'Recovered drawing',
      kind: 'recovered',
      forcedDirty: true,
      saveName: 'esterification.chalk',
    });
    expect(r.flows.dirty()).toBe(true);
    expect(r.titles.at(-1)).toBe('*Recovered drawing - Chalkbond');
    expect(r.recoveryCalls).toEqual(['adopt']);
    await r.flows.save();
    expect(r.main.chooseSave).toHaveBeenCalledWith('chalk', 'esterification.chalk');
    expect(r.flows.dirty()).toBe(false);
    expect(r.recoveryCalls).toEqual(['adopt', 'settle clean']);
  });

  it('Delete: clears the file, keeps the empty drawing', async () => {
    const r = rig({ traceRecovery: true, recover: ['delete'] });
    const before = r.controller.getDoc();
    await r.flows.start({ recovery: { text, name: 'Untitled' }, open: null });
    expect(r.calls).toEqual(['ask recover', 'recovery clear']);
    expect(r.controller.getDoc()).toBe(before);
    expect(r.session).toEqual(createSession());
  });

  it('a recovery file that does not parse: cleared and logged (code only), no box', async () => {
    const r = rig({ traceRecovery: true });
    await r.flows.start({ recovery: { text: '{"secret": "drawing"', name: 'x' }, open: null });
    expect(r.calls).toEqual(['recovery clear']);
    expect(r.main.ask).not.toHaveBeenCalled();
    expect(r.main.logError).toHaveBeenCalledTimes(1);
    const message = r.main.logError.mock.calls[0]?.[0] ?? '';
    expect(message).toMatch(/^Recovery file not used: /);
    expect(message).not.toContain('secret');
  });

  it('RC4: with a file request, recovery is offered first; Recover keeps it and shows N-A2', async () => {
    const file = ref('ethanol.chalk');
    const r = rig({
      traceRecovery: true,
      recover: ['recover'],
      files: { [file.id]: chalkFile(golden('ethanol')) },
    });
    await r.flows.start({ recovery: { text, name: 'Untitled' }, open: file });
    expect(r.calls).toEqual(['ask recover', 'sessionFile null']);
    expect(r.main.readFile).not.toHaveBeenCalled();
    expect(Object.keys(r.controller.getDoc().atoms)).toHaveLength(7);
    expect(r.controller.notify).toHaveBeenCalledWith(
      'info',
      'Recovered your unsaved drawing. Save it, then open ethanol.chalk again.',
    );
  });

  it('RC4: Delete, then the file opens through F3 (validated)', async () => {
    const file = ref('ethanol.chalk');
    const r = rig({
      traceRecovery: true,
      recover: ['delete'],
      files: { [file.id]: chalkFile(golden('ethanol')) },
    });
    await r.flows.start({ recovery: { text, name: 'Untitled' }, open: file });
    expect(r.calls).toEqual([
      'ask recover',
      'recovery clear',
      'read ethanol.chalk',
      'sessionFile ethanol.chalk',
      'recovery clear',
    ]);
    expect(r.session).toMatchObject({ kind: 'chalk', name: 'ethanol.chalk' });
    expect(r.controller.notify).not.toHaveBeenCalled();
  });

  it('no recovery: the file request opens; nothing at all: nothing loads (a test-hook drawing stays)', async () => {
    const file = ref('ethanol.chalk');
    const r = rig({ traceRecovery: true, files: { [file.id]: chalkFile(golden('ethanol')) } });
    await r.flows.start({ recovery: null, open: file });
    expect(r.calls).toEqual(['read ethanol.chalk', 'sessionFile ethanol.chalk', 'recovery clear']);
    const idle = rig({ traceRecovery: true });
    idle.controller.edit();
    const drawn = idle.controller.getDoc();
    await idle.flows.start({ recovery: null, open: null });
    expect(idle.controller.getDoc()).toBe(drawn);
    expect(idle.calls).toEqual([]);
    expect(idle.controller.load).not.toHaveBeenCalled();
  });

  it('startup runs as a flow: Ctrl+N waits it out (ignored), an open request queues after it', async () => {
    const answer = deferred<string>();
    const file = ref('ethanol.chalk');
    const r = rig({ traceRecovery: true, files: { [file.id]: chalkFile(golden('ethanol')) } });
    r.main.ask.mockImplementationOnce(() => answer.promise);
    const starting = r.flows.start({ recovery: { text, name: 'Untitled' }, open: null });
    await vi.waitFor(() => expect(r.main.ask).toHaveBeenCalled());
    expect(r.flows.busy()).toBe(true);
    await r.flows.newDrawing();
    void r.flows.openRef(file);
    answer.resolve('recover');
    await starting;
    await vi.waitFor(() => expect(r.main.readFile).toHaveBeenCalled());
    // The scripted answer replaced the recording fake: the box is the first call, then the load.
    expect(r.main.ask).toHaveBeenNthCalledWith(1, { kind: 'recover' });
    expect(r.calls.slice(0, 2)).toEqual(['sessionFile null', 'read ethanol.chalk']);
  });
});

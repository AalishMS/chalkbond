// The shared fake-port harness of the tab flows (TB17-TB19): an in-memory session store (records,
// the last index), files by ref id, main's tab bindings and written hashes, scripted dialogs, a
// real editor controller, and one call log across main, the controller and the host ports, so a
// test can assert the order of take, write and put. Any main function can be held (`hold`) to
// observe a flow in flight, or replaced (`override`).
import { serialize, type Doc } from '@core/doc-model';
import {
  createEditorController,
  type EditorController,
  type EditorTabState,
} from '../../../editor';
import type {
  AcceptOutsideRequest,
  AutoSaveRequest,
  AutoSaveResponse,
  BindTabRequest,
  BindTabResponse,
  CheckTabFileResponse,
  FileRef,
  OpenTarget,
  ReadFileResponse,
  ReadTabRecordResponse,
  SessionIndexUpdate,
  StartupSession,
  WriteFileResponse,
  WriteTabRecordRequest,
  WriteTabRecordResponse,
} from '../../../../shared/ipc-types';
import { buildRecord } from '../session-record';
import { createTabFlows, type TabFlowMain, type TabFlowOptions, type TabFlows } from '../tab-flows';
import type { Sha256 } from '../tab-status';
import type { TabKind } from '../tabs';

export const NOW = '2026-11-12T09:00:00.000Z';

export const sha256: Sha256 = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export const encodeUtf8 = (text: string): Uint8Array => encoder.encode(text);
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

/** Every main function the tab flows of TB17-TB19 use (TB19 extends `TabFlowMain`). */
export interface FakeMain extends TabFlowMain {
  closeOk(): void;
}
type MainName = keyof FakeMain;

export interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

/** A held call: `reached` resolves when the call arrives, `release` lets it go on. */
export interface Hold {
  readonly reached: Promise<void>;
  release(): void;
}

interface Gate extends Hold {
  readonly promise: Promise<void>;
  arrive(): void;
}

function gate(): Gate {
  let release = (): void => undefined;
  let arrive = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  return { promise, release, reached, arrive };
}

export interface HarnessOptions {
  /** The session store to share with an earlier harness (a restart). */
  readonly records?: Map<string, string>;
  /** Files by ref id, shared likewise. */
  readonly files?: Map<string, Uint8Array>;
  /** Prefix of the ids `newId` makes (`<prefix>-1`, ...). */
  readonly idPrefix?: string;
}

export function createTabFlowHarness(options: HarnessOptions = {}) {
  const calls: Call[] = [];
  const records = options.records ?? new Map<string, string>();
  const files = options.files ?? new Map<string, Uint8Array>();
  /** tab id -> ref id: main's bindings (I12). */
  const bindings = new Map<string, string>();
  /** tab id -> written hash main holds (I12 `open` / `save-as`, AS1). */
  const written = new Map<string, string | null>();
  const indexes: SessionIndexUpdate[] = [];
  const notices: { kind: 'info' | 'error'; text: string }[] = [];
  const errors: string[] = [];
  const damaged: string[] = [];
  const openDialogs: (OpenTarget | null)[] = [];
  const saveDialogs: (FileRef | null)[] = [];
  const answers: ('save' | 'discard' | 'cancel')[] = [];
  const gates = new Map<string, Gate[]>();
  const overrides = new Map<string, (...args: never[]) => unknown>();
  let ids = 0;
  let refs = 0;
  let changes = 0;

  const log = (name: string, args: readonly unknown[]): void => {
    calls.push({ name, args });
  };
  const lastIndex = (): SessionIndexUpdate | undefined => indexes.at(-1);

  /** Another open tab bound to `refId` (closed tabs, in `discarded`, bind nothing). */
  function openIn(refId: string, except: readonly string[]): string | null {
    const discarded = new Set(lastIndex()?.discarded ?? []);
    for (const [tabId, bound] of bindings) {
      if (bound === refId && !except.includes(tabId) && !discarded.has(tabId)) return tabId;
    }
    return null;
  }

  const defaults: FakeMain = {
    chooseOpen: async () => openDialogs.shift() ?? null,
    readFile: async (ref: FileRef): Promise<ReadFileResponse> => {
      const bytes = files.get(ref.id);
      return bytes === undefined ? { ok: false, problem: 'missing' } : { ok: true, bytes };
    },
    showFileError: async (..._args: unknown[]) => undefined,
    readTabRecord: async (tabId: string): Promise<ReadTabRecordResponse> => {
      const text = records.get(tabId);
      return text === undefined ? { ok: false, problem: 'missing' } : { ok: true, text };
    },
    writeTabRecord: async ({
      tabId,
      text,
    }: WriteTabRecordRequest): Promise<WriteTabRecordResponse> => {
      records.set(tabId, text);
      return { ok: true };
    },
    damagedTabRecord: (tabId: string) => {
      damaged.push(tabId);
      records.delete(tabId);
    },
    updateSessionIndex: (value: SessionIndexUpdate) => {
      indexes.push(value);
    },
    bindTab: async (request: BindTabRequest): Promise<BindTabResponse> => {
      const { tabId, reason } = request;
      if (reason === 'open' || reason === 'save-as') {
        const refId = request.ref ?? '';
        const owner = openIn(refId, [tabId]);
        if (owner !== null) return { ok: false, openIn: owner };
        bindings.set(tabId, refId);
        written.set(tabId, request.written ?? null);
        return { ok: true };
      }
      const from = request.from ?? '';
      if (reason === 'unbind') {
        bindings.delete(tabId);
        return { ok: true };
      }
      const refId = bindings.get(from);
      if (refId === undefined) throw new Error(`fake bindTab: ${from} is not bound`);
      const owner = openIn(refId, [tabId, from]);
      if (owner !== null) return { ok: false, openIn: owner };
      bindings.delete(from);
      bindings.set(tabId, refId);
      written.set(
        tabId,
        reason === 'reopen' ? (written.get(from) ?? null) : (request.written ?? null),
      );
      return { ok: true };
    },
    checkTabFile: async (tabId: string, wantBytes?: boolean): Promise<CheckTabFileResponse> => {
      const refId = bindings.get(tabId);
      if (refId === undefined) throw new Error(`fake checkTabFile: ${tabId} is not a file tab`);
      const bytes = files.get(refId);
      const hash = written.get(tabId) ?? null;
      if (bytes === undefined) return { tabId, written: hash, state: 'missing' };
      return wantBytes === true
        ? { tabId, written: hash, state: 'same', bytes }
        : { tabId, written: hash, state: 'same' };
    },
    logError: (message: string) => {
      errors.push(message);
    },
    autoSave: async ({ tabId, text }: AutoSaveRequest): Promise<AutoSaveResponse> => {
      const hash = await sha256(text);
      const refId = bindings.get(tabId);
      if (refId !== undefined) files.set(refId, encodeUtf8(text));
      written.set(tabId, hash);
      return { tabId, ok: true, sha256: hash };
    },
    acceptOutsideChange: ({ tabId, written: hash }: AcceptOutsideRequest) => {
      written.set(tabId, hash);
    },
    chooseSave: async () => saveDialogs.shift() ?? null,
    writeFile: async (ref: FileRef, data: Uint8Array): Promise<WriteFileResponse> => {
      files.set(ref.id, data);
      return { ok: true };
    },
    closeOk: () => undefined,
  };

  const SYNC = new Set<MainName>([
    'damagedTabRecord',
    'updateSessionIndex',
    'logError',
    'acceptOutsideChange',
    'closeOk',
  ]);

  function wrap<K extends MainName>(name: K): FakeMain[K] {
    const call = (args: unknown[]): unknown => {
      const impl = (overrides.get(name) ?? defaults[name]) as (...a: unknown[]) => unknown;
      return impl(...args);
    };
    if (SYNC.has(name)) {
      return ((...args: unknown[]) => {
        log(name, args);
        return call(args);
      }) as unknown as FakeMain[K];
    }
    return (async (...args: unknown[]) => {
      log(name, args);
      const held = gates.get(name)?.shift();
      if (held !== undefined) {
        held.arrive();
        await held.promise;
      }
      return call(args);
    }) as unknown as FakeMain[K];
  }

  const main = Object.fromEntries(
    (Object.keys(defaults) as MainName[]).map((name) => [name, wrap(name)]),
  ) as unknown as FakeMain;

  const editor: EditorController = createEditorController({
    clock: () => NOW,
    logError: (error) => errors.push(String(error)),
  });
  editor.store.dispatch({ type: 'canvas-resized', size: { w: 1000, h: 600 } });

  const controller: TabFlowOptions['controller'] = {
    getDoc: () => editor.getDoc(),
    markSaved: () => {
      log('markSaved', []);
      editor.markSaved();
    },
    run: (cmd) => {
      log('run', [cmd]);
      editor.run(cmd);
    },
    newState: (doc) => editor.newState(doc),
    snapshotState: () => editor.snapshotState(),
    takeState: () => {
      log('takeState', []);
      return editor.takeState();
    },
    putState: (state) => {
      log('putState', [state]);
      editor.putState(state);
    },
  };

  const ports: TabFlowOptions = {
    main,
    controller,
    sha256,
    clock: () => NOW,
    newId: () => `${options.idPrefix ?? 'tab'}-${++ids}`,
    notify: (kind, text) => {
      notices.push({ kind, text });
    },
    finishEditing: async () => {
      log('finishEditing', []);
    },
    finishEditingNow: () => {
      log('finishEditingNow', []);
    },
    ask: async (request) => {
      log('ask', [request]);
      return answers.shift() ?? 'cancel';
    },
    newDrawingStyle: () => 'slides',
    decodeUtf8,
    // F4a's idle: no gesture and no label or text editor (what `replace-doc` needs, R58).
    hostIdle: () => editor.canRun({ type: 'replace-doc', doc: editor.getDoc(), label: '' }),
    changed: () => {
      changes++;
    },
  };

  return {
    main,
    editor,
    ports,
    calls,
    records,
    files,
    bindings,
    written,
    indexes,
    notices,
    errors,
    damaged,
    openDialogs,
    saveDialogs,
    answers,
    changes: () => changes,
    /** The flows over these ports (`patch` replaces host ports, e.g. `hostIdle`). */
    flows(patch: Partial<TabFlowOptions> = {}): TabFlows {
      return createTabFlows({ ...ports, ...patch });
    },
    /** The next call of `name` (after those already held) waits until released. */
    hold(name: MainName): Hold {
      const g = gate();
      gates.set(name, [...(gates.get(name) ?? []), g]);
      return { reached: g.reached, release: g.release };
    },
    /** Replaces main's function `name` (still logged and holdable). */
    override<K extends MainName>(name: K, impl: FakeMain[K]): void {
      overrides.set(name, impl as unknown as (...args: never[]) => unknown);
    },
    /** The names of the calls in order, optionally only those in `only`. */
    names(only?: readonly string[]): string[] {
      return calls.map((c) => c.name).filter((n) => only === undefined || only.includes(n));
    },
    /** The first argument of every call of `name`. */
    argsOf(name: string): unknown[] {
      return calls.filter((c) => c.name === name).map((c) => c.args[0]);
    },
    /** A file main handed out a ref for: `serialize(doc)` (or `bytes`) under a fresh ref id. */
    file(name: string, content: Doc | Uint8Array): FileRef {
      const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
      const kind = (
        ['chalk', 'png', 'svg', 'pdf'].includes(ext) ? ext : 'chalk'
      ) as FileRef['kind'];
      const ref: FileRef = { id: `ref-${++refs}`, name, kind };
      files.set(ref.id, content instanceof Uint8Array ? content : encodeUtf8(serialize(content)));
      return ref;
    },
    /** Main already holds a binding for `tabId` (a restored session). */
    bind(tabId: string, ref: FileRef, hash: string | null): void {
      bindings.set(tabId, ref.id);
      written.set(tabId, hash);
    },
    /** Stores the record of a tab, as an earlier run would have. */
    storeRecord(tab: { id: string; kind: TabKind; name: string }, state: EditorTabState): void {
      records.set(tab.id, buildRecord(tab, state).text);
    },
    /** An I7 session from tabs (`unsaved`, `warning`, `view` default to false, false, null). */
    session(
      tabs: readonly {
        id: string;
        kind: TabKind;
        name: string;
        unsaved?: boolean;
        warning?: boolean;
        view?: { zoom: number; centre: { x: number; y: number } } | null;
      }[],
      active: string,
    ): StartupSession {
      return {
        tabs: tabs.map((t) => ({
          id: t.id,
          kind: t.kind,
          name: t.name,
          view: t.view ?? null,
          unsaved: t.unsaved ?? false,
          warning: t.warning ?? false,
        })),
        active,
      };
    },
  };
}

export type TabFlowHarness = ReturnType<typeof createTabFlowHarness>;

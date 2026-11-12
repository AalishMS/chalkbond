import type { Doc } from '@core/doc-model';
import type { EditorCommand, EditorController, EditorEvent } from '../../editor';
import type { TabMarker } from './tab-status';
import type { TabKind } from './tabs';

/** A host notice as the test hook reports it (filled in as notices appear). */
export interface HeardNotice {
  readonly kind: string;
  readonly text: string;
}

/** A tab as the test hook reports it (TB20): the strip's view plus its kind and whether active. */
export interface HookTab {
  readonly id: string;
  /** T3's label, as the strip shows it. */
  readonly label: string;
  readonly kind: TabKind;
  readonly active: boolean;
  /** T6's marker (a tab not loaded in this run: the one stored in the index). */
  readonly marker: TabMarker;
}

/** The host's tab seams the hook forwards to (TB20). */
export interface HookTabs {
  read(): Promise<readonly HookTab[]>;
  /** T11 as a click on the tab would run it (ignored while a flow runs). */
  activate(id: string): Promise<void>;
  /** How often the host's `menu` action ran (K1 F10, K3 lone Alt); TB26 opens the ☰ menu there. */
  menuRequests(): number;
}

const NO_TABS: HookTabs = {
  read: () => Promise.resolve([]),
  activate: () => Promise.resolve(),
  menuRequests: () => 0,
};

/**
 * What e2e tests see as `window.__chalkbondTest` (SPEC-app-shell.md TH2). Defined only when the
 * page was loaded with `testHooks=1`, which main does only for an unpackaged build started with
 * `--chalkbond-test-hooks`.
 */
export interface TestHook {
  /** Puts a document into the active tab, as the host's `load` does (a test seam only). */
  load(doc: Doc): void;
  run(cmd: EditorCommand): void;
  getDoc(): Doc;
  getSelection(): { atoms: string[]; bonds: string[]; objects: string[] };
  /** Editor events heard since the hook was created or the last `clearEvents`. */
  events(): EditorEvent[];
  clearEvents(): void;
  /** Host notices shown since start or the last clear; empty until the shell has any. */
  notices(): HeardNotice[];
  /** `main:event` commands received since start or the last clear; empty until the shell has any. */
  commands(): string[];
  /** The tabs in strip order (TB20). */
  readTabs(): Promise<HookTab[]>;
  /** Activates tab `id` (T11); resolves when the switch has finished. */
  activateTab(id: string): Promise<void>;
  /** How often the host's menu action ran (F10, a lone Alt) since start. */
  menuRequests(): number;
}

export interface DisposableTestHook extends TestHook {
  /** Stops listening to the controller. */
  dispose(): void;
}

type HookedController = Pick<
  EditorController,
  'load' | 'getDoc' | 'getSelection' | 'subscribe' | 'run' | 'store'
>;

export function createTestHook(
  controller: HookedController,
  commands: string[] = [],
  /** The host's load into the active tab; the plain `controller.load` by default. */
  load: (doc: Doc) => void = (doc) => controller.load(doc),
  /** The host's tab seams; none by default. */
  tabs: HookTabs = NO_TABS,
): DisposableTestHook {
  let heard: EditorEvent[] = [];
  let notices: HeardNotice[] = [];
  const unsubscribe = controller.subscribe((e) => {
    heard.push(e);
    if (e.type === 'notice') {
      const notice = controller.store.getState().notice;
      if (notice) notices.push({ kind: notice.kind, text: notice.text });
    }
  });
  return {
    load: (doc) => {
      load(doc);
    },
    run: (cmd) => controller.run(cmd),
    getDoc: () => controller.getDoc(),
    getSelection: () => {
      const selection = controller.getSelection();
      return {
        atoms: [...selection.atoms],
        bonds: [...selection.bonds],
        objects: [...selection.objects],
      };
    },
    events: () => [...heard],
    clearEvents: () => {
      heard = [];
      notices = [];
      commands.length = 0;
    },
    notices: () => notices.map((n) => ({ ...n })),
    commands: () => [...commands],
    readTabs: async () => (await tabs.read()).map((t) => ({ ...t })),
    activateTab: (id) => tabs.activate(id),
    menuRequests: () => tabs.menuRequests(),
    dispose: unsubscribe,
  };
}

import type { Doc } from '@core/doc-model';
import type { EditorCommand, EditorController, EditorEvent } from '../../editor';

/** A host notice as the test hook reports it (filled in as notices appear). */
export interface HeardNotice {
  readonly kind: string;
  readonly text: string;
}

/**
 * What e2e tests see as `window.__chalkbondTest` (SPEC-app-shell.md TH2). Defined only when the
 * page was loaded with `testHooks=1`, which main does only for an unpackaged build started with
 * `--chalkbond-test-hooks`.
 */
export interface TestHook {
  /** Puts a document into the editor as an Untitled document, as the host's `load` does. */
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
      controller.load(doc);
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
    dispose: unsubscribe,
  };
}

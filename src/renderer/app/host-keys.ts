// K1 listener (SPEC-app-shell.md "Keyboard (host keys)"): capture phase on `window`, before the
// editor's own handler; the decision is `model/keys.ts`. K3: a lone Alt opens the menu, the Alt key-up after an Alt+click opens nothing.
import type { EditorController } from '../editor';
import type { FileFlows } from './model/file-flows';
import {
  ALT_IDLE,
  altGuard,
  hostKey,
  type AltGuardEvent,
  type AltState,
  type HostKeyAction,
} from './model/keys';
import { isTextTarget } from './text-target';

/** The target lies inside the editor's root (where the editor's own Ctrl+F acts). */
function insideEditor(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.editor') !== null;
}

/** The tab keys and F10 (TB20, TB26 wire them): a key without a handler is left unhandled. */
type LaterAction = Exclude<
  HostKeyAction,
  | 'copy-whole'
  | 'paste'
  | 'new'
  | 'open'
  | 'save'
  | 'save-as'
  | 'export'
  | 'shortcuts'
  | 'focus-name'
>;
export type HostActions = Record<Exclude<HostKeyAction, LaterAction>, () => void> &
  Partial<Record<LaterAction, () => void>>;

export function installHostKeys(
  controller: Pick<EditorController, 'getSelection' | 'canRun' | 'getDoc'>,
  fileFlows: Pick<FileFlows, 'busy'>,
  actions: HostActions,
  /** An in-window dialog is open (Export, Keyboard shortcuts): K1 does nothing. */
  modal: () => boolean = () => false,
  /** The reopen list (R40) is non-empty: Ctrl+Shift+T does something (TB20 passes it). */
  canReopen: () => boolean = () => false,
): () => void {
  let alt: AltState = ALT_IDLE;
  const guard = (event: Event | null, e: AltGuardEvent): void => {
    const next = altGuard(alt, e);
    alt = next.state;
    if (next.prevent) event?.preventDefault();
    if (next.open) actions.menu?.();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    guard(event, {
      type: 'keydown',
      key: event.key,
      repeat: event.repeat,
      otherModifier: event.ctrlKey || event.shiftKey || event.metaKey,
    });
    const selection = controller.getSelection();
    const doc = controller.getDoc();
    const action = hostKey(event, {
      textTarget: isTextTarget(event.target),
      selectionEmpty:
        selection.atoms.size === 0 && selection.bonds.size === 0 && selection.objects.size === 0,
      idle: controller.canRun({ type: 'set-preset', preset: 'slides' }),
      modal: modal(),
      fileBusy: fileFlows.busy(),
      empty: Object.keys(doc.atoms).length === 0 && Object.keys(doc.objects).length === 0,
      insideEditor: insideEditor(event.target),
      canReopen: canReopen(),
    });
    const run = action === null ? undefined : actions[action];
    if (run === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    run();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    guard(event, { type: 'keyup', key: event.key, modal: modal() });
  };
  const onPointerDown = (event: PointerEvent): void => {
    guard(event, { type: 'pointerdown', altKey: event.altKey });
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  const onBlur = (): void => guard(null, { type: 'blur' });
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('blur', onBlur);
  };
}

// K1 listener (SPEC-app-shell.md "Keyboard (host keys)"): capture phase on `window`, before the
// editor's own handler; the decision is `model/keys.ts`. K3: the Alt key-up after an Alt+click.
import type { EditorController } from '../editor';
import type { FileFlows } from './model/file-flows';
import { altGuard, hostKey, type AltGuardEvent, type HostKeyAction } from './model/keys';
import { isTextTarget } from './text-target';

/** The target lies inside the editor's root (where the editor's own Ctrl+F acts). */
function insideEditor(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.editor') !== null;
}

export function installHostKeys(
  controller: Pick<EditorController, 'getSelection' | 'canRun' | 'getDoc'>,
  fileFlows: Pick<FileFlows, 'busy'>,
  actions: Record<HostKeyAction, () => void>,
  /** An in-window dialog is open (Export, Keyboard shortcuts): K1 does nothing. */
  modal: () => boolean = () => false,
): () => void {
  let armed = false;
  const guard = (event: Event, e: AltGuardEvent): void => {
    const next = altGuard(armed, e);
    armed = next.armed;
    if (next.prevent) event.preventDefault();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    guard(event, { type: 'keydown', key: event.key, repeat: event.repeat });
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
    });
    if (action === null) return;
    event.preventDefault();
    event.stopPropagation();
    actions[action]();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    guard(event, { type: 'keyup', key: event.key });
  };
  const onPointerDown = (event: PointerEvent): void => {
    guard(event, { type: 'pointerdown', altKey: event.altKey });
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('pointerdown', onPointerDown, true);
  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('pointerdown', onPointerDown, true);
  };
}

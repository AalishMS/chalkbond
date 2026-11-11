// K1 listener (SPEC-app-shell.md "Keyboard (host keys)"): capture phase on `window`, before the
// editor's own handler; the decision is `model/keys.ts`.
import type { EditorController } from '../editor';
import type { FileFlows } from './model/file-flows';
import { hostKey, type HostKeyAction } from './model/keys';

/** An `input`, `textarea` or `contenteditable` element. */
function isTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function installHostKeys(
  controller: Pick<EditorController, 'getSelection' | 'canRun' | 'getDoc'>,
  fileFlows: Pick<FileFlows, 'busy'>,
  actions: Record<HostKeyAction, () => void>,
  /** An in-window dialog is open (the Export dialog; A12's later): K1 does nothing. */
  modal: () => boolean = () => false,
): () => void {
  const listener = (event: KeyboardEvent): void => {
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
    });
    if (action === null) return;
    event.preventDefault();
    event.stopPropagation();
    actions[action]();
  };
  window.addEventListener('keydown', listener, true);
  return () => window.removeEventListener('keydown', listener, true);
}

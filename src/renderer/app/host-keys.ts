// K1 listener (SPEC-app-shell.md "Keyboard (host keys)"): capture phase on `window`, before the
// editor's own handler; the decision is `model/keys.ts`.
import type { EditorController } from '../editor';
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
  controller: Pick<EditorController, 'getSelection' | 'canRun'>,
  actions: Record<HostKeyAction, () => void>,
): () => void {
  const listener = (event: KeyboardEvent): void => {
    const selection = controller.getSelection();
    const action = hostKey(event, {
      textTarget: isTextTarget(event.target),
      selectionEmpty:
        selection.atoms.size === 0 && selection.bonds.size === 0 && selection.objects.size === 0,
      idle: controller.canRun({ type: 'set-preset', preset: 'slides' }),
    });
    if (action === null) return;
    event.preventDefault();
    event.stopPropagation();
    actions[action]();
  };
  window.addEventListener('keydown', listener, true);
  return () => window.removeEventListener('keydown', listener, true);
}

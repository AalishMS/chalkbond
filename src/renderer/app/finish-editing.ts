// F4a (SPEC-app-shell.md R17; editor R48): the host's DOM-only `finishEditing` port, injected into
// the pure file flows. An open label or text editor is finished through its own blur → commit
// path (the same as a click elsewhere), and the promise resolves once the editor has closed. An
// IME composition keeps it open until `compositionend` (no timeout, no cancel). The editor is
// seen only through its public controller: `canRun('focus-name-field')` is false exactly while a
// label or text editor is open (R47), and `subscribe` hears it close (`busy`).
import type { EditorController } from '../editor';

/** What the port needs of the editor's box: the `contenteditable` element. */
export interface EditorBox {
  blur(): void;
  dispatchEvent(event: Event): boolean;
}

const findBox = (): EditorBox | null =>
  document.querySelector<HTMLElement>('[data-testid="textbox-edit"]');

export function createFinishEditing(
  controller: Pick<EditorController, 'canRun' | 'subscribe'>,
  box: () => EditorBox | null = findBox,
): () => Promise<void> {
  const editing = (): boolean => !controller.canRun('focus-name-field');
  return () =>
    new Promise<void>((resolve) => {
      if (!editing()) {
        resolve();
        return;
      }
      // Subscribed before the blur: the commit it causes is synchronous and must not be missed.
      const stop = controller.subscribe(() => {
        if (editing()) return;
        stop();
        resolve();
      });
      const el = box();
      el?.blur();
      // A page without focus delivers no blur event: run the box's own blur handler directly.
      if (el && editing()) el.dispatchEvent(new Event('blur'));
    });
}

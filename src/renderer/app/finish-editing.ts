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

/**
 * R25: tracks an IME composition through the DOM events `compositionstart` / `compositionend`
 * (heard in the capture phase on `target`, the document, whatever the box does with them). Without a target it is never
 * composing. The editor module is not asked.
 */
export function trackComposition(
  target: Pick<EventTarget, 'addEventListener'> | undefined = typeof document === 'undefined'
    ? undefined
    : document,
): () => boolean {
  let composing = false;
  // Capture phase: it sees the event even when it does not bubble (a synthetic one in e2e).
  target?.addEventListener(
    'compositionstart',
    () => {
      composing = true;
    },
    true,
  );
  target?.addEventListener(
    'compositionend',
    () => {
      composing = false;
    },
    true,
  );
  return () => composing;
}

/**
 * R25: the shutdown flush's finish. An open label or text editor is committed through the same
 * blur as a click elsewhere, synchronously, and nothing is awaited or subscribed. During an IME
 * composition the editor is not touched (its draft is not recoverable). If the editor stays open
 * the function simply returns.
 */
export function createFinishEditingNow(
  controller: Pick<EditorController, 'canRun'>,
  composing: () => boolean,
  box: () => EditorBox | null = findBox,
): () => void {
  return () => {
    if (controller.canRun('focus-name-field') || composing()) return;
    const el = box();
    el?.blur();
    // A page without focus delivers no blur event: run the box's own blur handler directly.
    if (el && !controller.canRun('focus-name-field')) el.dispatchEvent(new Event('blur'));
  };
}

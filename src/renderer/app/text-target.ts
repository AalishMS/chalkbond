// "Text target" (SPEC-app-shell.md K1, M3): an `input`, `textarea` or `contenteditable` element.

export function isTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

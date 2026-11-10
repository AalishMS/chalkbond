/**
 * K5: a mouse press on a rail, options or status button does not take focus; if focus was in
 * the name field it moves to the canvas, so tool and hover keys work at once.
 */
export function pressKeepsFocus(e: React.MouseEvent<HTMLElement>): void {
  e.preventDefault();
  const canvas = e.currentTarget.closest('.editor')?.querySelector<HTMLElement>('.canvas');
  if (document.activeElement instanceof HTMLInputElement) canvas?.focus();
}

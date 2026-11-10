// The DOM side of the text editors (SPEC-editor.md rule T2): the model's runs drawn as text nodes
// and `<span data-script>` elements, and the two-way map between DOM positions and model
// offsets. Only text and `data-script` spans ever appear: no markup syntax, no styles.
import type { DeleteUnit } from '../model/text-edit';

/** A piece of text as shown: plain, or a sub/superscript. */
export interface DisplayRun {
  readonly text: string;
  readonly script?: 'sub' | 'sup';
}

/** Draws `runs` into `root`, replacing what it held. */
export function renderRuns(root: HTMLElement, runs: readonly DisplayRun[]): void {
  const nodes: Node[] = runs.map((run) => {
    if (run.script === undefined) return document.createTextNode(run.text);
    const span = document.createElement('span');
    span.dataset['script'] = run.script;
    span.textContent = run.text;
    return span;
  });
  root.replaceChildren(...nodes);
}

/** The text the DOM holds now (what an IME composition produced). */
export const domText = (root: HTMLElement): string => root.textContent;

/** The model offset of a DOM position inside `root`. */
export function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** The DOM position of model offset `at`: the end of the text before it (the start at 0). */
export function positionOf(root: HTMLElement, at: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let last: Text | null = null;
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    const text = n as Text;
    if (at <= seen + text.length) return { node: text, offset: at - seen };
    seen += text.length;
    last = text;
  }
  return last === null ? { node: root, offset: 0 } : { node: last, offset: last.length };
}

/** The selection inside `root` as model offsets, or null when it lies elsewhere. */
export function readSelection(root: HTMLElement): { anchor: number; focus: number } | null {
  const sel = root.ownerDocument.getSelection();
  if (sel === null || sel.anchorNode === null || sel.focusNode === null) return null;
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null;
  return {
    anchor: offsetOf(root, sel.anchorNode, sel.anchorOffset),
    focus: offsetOf(root, sel.focusNode, sel.focusOffset),
  };
}

/** Puts the DOM selection at model offsets `anchor` and `focus`. */
export function writeSelection(root: HTMLElement, anchor: number, focus: number): void {
  const sel = root.ownerDocument.getSelection();
  if (sel === null) return;
  const a = positionOf(root, anchor);
  const f = positionOf(root, focus);
  sel.setBaseAndExtent(a.node, a.offset, f.node, f.offset);
}

/** A `beforeinput` type that deletes, as the unit and direction it means; null for the others. */
export function deletion(
  inputType: string,
): { dir: 'backward' | 'forward'; unit: DeleteUnit } | null {
  switch (inputType) {
    case 'deleteContentBackward':
      return { dir: 'backward', unit: 'char' };
    case 'deleteContentForward':
    case 'deleteContent':
    case 'deleteByCut':
    case 'deleteByDrag':
      return { dir: 'forward', unit: 'char' };
    case 'deleteWordBackward':
      return { dir: 'backward', unit: 'word' };
    case 'deleteWordForward':
      return { dir: 'forward', unit: 'word' };
    case 'deleteSoftLineBackward':
    case 'deleteHardLineBackward':
      return { dir: 'backward', unit: 'line' };
    case 'deleteSoftLineForward':
    case 'deleteHardLineForward':
      return { dir: 'forward', unit: 'line' };
    default:
      return null;
  }
}

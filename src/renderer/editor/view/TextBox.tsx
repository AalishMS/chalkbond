import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  deleteBackward,
  deleteForward,
  insertLineBreak,
  insertText,
  reconcile,
  redoEdit,
  setSelection,
  undoEdit,
  type TextEditState,
} from '../model/text-edit';
import {
  deletion,
  domText,
  readSelection,
  renderRuns,
  writeSelection,
  type DisplayRun,
} from './text-dom';

export interface TextBoxProps {
  /** The pure model the box is a projection of. */
  edit: TextEditState;
  /** The model as shown: a label's digits and charge are scripted by `labelDisplayRuns`. */
  runs: readonly DisplayRun[];
  /** `label`: one line, Enter always commits. `text`: Shift+Enter breaks the line. */
  mode: 'label' | 'text';
  /** Where the box is centred, canvas px. */
  at: { readonly x: number; readonly y: number };
  /** Font size, px: the rendered text's size at the current zoom. */
  fontPx: number;
  /** The accessible name. */
  label: string;
  /** A line under the box (the label editor's caption). */
  caption?: React.ReactNode;
  captionTone?: 'muted' | 'warning';
  onChange: (edit: TextEditState) => void;
  onCommit: () => void;
  onCancel: () => void;
}

/** Plain text of a paste or drop; a one-line box loses its line breaks. */
function plainText(e: InputEvent, oneLine: boolean): string {
  const raw = e.dataTransfer?.getData('text/plain') ?? e.data ?? '';
  const text = raw.replace(/\r\n?/g, '\n');
  return oneLine ? text.replace(/\n/g, '') : text;
}

/**
 * The box of the label and text editors (SPEC-editor.md rule T2): a `contenteditable="plaintext-only"`
 * element that is only a projection of `edit`. Every cancelable `beforeinput` is cancelled and
 * applied to the model; the spans are redrawn and the selection restored. An IME composition
 * edits the DOM itself and is read back into the model on `compositionend`.
 */
export function TextBox(props: TextBoxProps): React.JSX.Element {
  const { edit, runs, mode, at, fontPx, label, caption, captionTone } = props;
  const root = useRef<HTMLDivElement>(null);
  /** The latest model, updated at once by each handler so two events in a tick do not collide. */
  const latest = useRef(edit);
  const composing = useRef(false);
  /** What the DOM was last drawn from, so a selection-only change does not redraw it. */
  const drawn = useRef<string | null>(null);
  const handlers = useRef(props);

  // The refs follow the props after each render; handlers read them, never stale props.
  useLayoutEffect(() => {
    latest.current = edit;
    handlers.current = props;
  });

  // The DOM follows the model: runs redrawn only when they changed, then the selection restored.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || composing.current) return;
    const signature = JSON.stringify(runs);
    if (drawn.current !== signature) {
      renderRuns(el, runs);
      drawn.current = signature;
    }
    if (el.ownerDocument.activeElement === el) writeSelection(el, edit.anchor, edit.focus);
  }, [runs, edit.anchor, edit.focus]);

  // Focus when the box opens, the whole model selected as the model says.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    el.focus();
    writeSelection(el, latest.current.anchor, latest.current.focus);
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const oneLine = (): boolean => handlers.current.mode === 'label';
    const apply = (next: TextEditState): void => {
      latest.current = next;
      handlers.current.onChange(next);
    };

    const onBeforeInput = (e: InputEvent): void => {
      if (composing.current || e.isComposing) return;
      if (e.cancelable) e.preventDefault();
      // The browser moves the caret before `selectionchange` is delivered: an edit applies to
      // the selection the DOM has now, not the one the model last heard of.
      const dom = readSelection(el);
      const s = dom === null ? latest.current : setSelection(latest.current, dom.anchor, dom.focus);
      const del = deletion(e.inputType);
      if (del !== null) {
        apply(del.dir === 'backward' ? deleteBackward(s, del.unit) : deleteForward(s, del.unit));
        return;
      }
      switch (e.inputType) {
        case 'insertText':
        case 'insertReplacementText':
        case 'insertFromPaste':
        case 'insertFromPasteAsQuotation':
        case 'insertFromDrop':
        case 'insertFromYank':
          apply(insertText(s, plainText(e, oneLine())));
          return;
        case 'insertLineBreak':
        case 'insertParagraph':
          if (!oneLine()) apply(insertLineBreak(s));
          return;
        case 'historyUndo':
          apply(undoEdit(s));
          return;
        case 'historyRedo':
          apply(redoEdit(s));
          return;
        default:
          return;
      }
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (composing.current || e.isComposing) return;
      const key = e.key.toLowerCase();
      if (e.key === 'Enter' && (oneLine() || !e.shiftKey)) {
        e.preventDefault();
        handlers.current.onCommit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handlers.current.onCancel();
      } else if (e.ctrlKey && !e.altKey && !e.metaKey && (key === 'z' || key === 'y')) {
        e.preventDefault();
        const redo = key === 'y' || e.shiftKey;
        apply(redo ? redoEdit(latest.current) : undoEdit(latest.current));
      }
    };

    const onCompositionStart = (): void => {
      composing.current = true;
    };
    const onCompositionEnd = (): void => {
      composing.current = false;
      const text = oneLine() ? domText(el).replace(/\n/g, '') : domText(el);
      // Force the redraw even when the text happens to equal the model's.
      drawn.current = null;
      apply(reconcile(latest.current, text));
    };

    // Caret and selection moves the browser makes (arrows, Home/End, mouse) enter the model.
    const onSelectionChange = (): void => {
      if (composing.current) return;
      const sel = readSelection(el);
      if (sel === null) return;
      const s = latest.current;
      const next = setSelection(s, sel.anchor, sel.focus);
      if (next !== s) apply(next);
    };

    const onBlur = (): void => {
      if (!composing.current) handlers.current.onCommit();
    };

    el.addEventListener('beforeinput', onBeforeInput);
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('compositionstart', onCompositionStart);
    el.addEventListener('compositionend', onCompositionEnd);
    el.addEventListener('blur', onBlur);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      el.removeEventListener('beforeinput', onBeforeInput);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('compositionstart', onCompositionStart);
      el.removeEventListener('compositionend', onCompositionEnd);
      el.removeEventListener('blur', onBlur);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, []);

  return (
    <div
      className="textbox"
      data-testid="textbox"
      data-mode={mode}
      style={{ left: at.x, top: at.y, fontSize: fontPx }}
    >
      <div
        ref={root}
        className="textbox-edit"
        data-testid="textbox-edit"
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={mode === 'text'}
        aria-label={label}
        spellCheck={false}
      />
      {caption !== undefined && (
        <div className="textbox-caption" data-tone={captionTone ?? 'muted'}>
          {caption}
        </div>
      )}
    </div>
  );
}

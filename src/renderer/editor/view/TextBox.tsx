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

/** K3: the text editor's shortcuts, as what they do. */
export type TextShortcut =
  | { readonly type: 'script'; readonly script: 'sub' | 'sup' }
  | { readonly type: 'style'; readonly flag: 'bold' | 'italic' }
  | { readonly type: 'insert'; readonly text: string };

/** K3: the shortcut a key press is, or null (text mode only). */
export function shortcutOf(e: {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}): TextShortcut | null {
  if (!e.ctrlKey || e.altKey || e.metaKey) return null;
  const key = e.key.toLowerCase();
  if (!e.shiftKey) {
    if (key === 'b') return { type: 'style', flag: 'bold' };
    if (key === 'i') return { type: 'style', flag: 'italic' };
    if (key === '=') return { type: 'script', script: 'sub' };
    return null;
  }
  if (key === '+' || key === '=') return { type: 'script', script: 'sup' };
  if (key === 'd') return { type: 'insert', text: 'Δ' };
  if (key === 'h') return { type: 'insert', text: 'hν' };
  return null;
}

export interface TextBoxProps {
  /** The pure model the box is a projection of. */
  edit: TextEditState;
  /** The model as shown: a label's digits and charge are scripted by `labelDisplayRuns`. */
  runs: readonly DisplayRun[];
  /** `label`: one line, Enter always commits. `text`: Shift+Enter breaks the line. */
  mode: 'label' | 'text';
  /** Where the box is centred, canvas px (text mode: the text's `at`, see `anchor`). */
  at: { readonly x: number; readonly y: number };
  /** Text mode: which edge of the box stands on `at.x`; the first line is centred on `at.y`. */
  anchor?: 'left' | 'center' | 'right';
  /** Text mode: B / I of the whole object. */
  bold?: boolean;
  italic?: boolean;
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
  /** Text mode: a K3 shortcut was pressed. */
  onShortcut?: (shortcut: TextShortcut) => void;
}

/** Text as it goes into the model: `\n` line ends; a one-line box loses its line breaks. */
function normalised(raw: string, oneLine: boolean): string {
  const text = raw.replace(/\r\n?/g, '\n');
  return oneLine ? text.replace(/\n/g, '') : text;
}

/** Plain text of a `beforeinput` that inserts it. */
function plainText(e: InputEvent, oneLine: boolean): string {
  return normalised(e.dataTransfer?.getData('text/plain') ?? e.data ?? '', oneLine);
}

/**
 * The box of the label and text editors (SPEC-editor.md rule T2): a `contenteditable="plaintext-only"`
 * element that is only a projection of `edit`. Every cancelable `beforeinput` is cancelled and
 * applied to the model; the spans are redrawn and the selection restored. An IME composition
 * edits the DOM itself and is read back into the model on `compositionend`.
 */
export function TextBox(props: TextBoxProps): React.JSX.Element {
  const { edit, runs, mode, at, fontPx, label, caption, captionTone } = props;
  const { anchor = 'center', bold = false, italic = false } = props;
  const root = useRef<HTMLDivElement>(null);
  /** The latest model, updated at once by each handler so two events in a tick do not collide. */
  const latest = useRef(edit);
  const composing = useRef(false);
  /** R48: a blur came during a composition; the commit runs after `compositionend`. */
  const commitAfterComposition = useRef(false);
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

    // The browser moves the caret before `selectionchange` is delivered: an edit applies to the
    // selection the DOM has now, not the one the model last heard of.
    const synced = (): TextEditState => {
      const dom = readSelection(el);
      return dom === null ? latest.current : setSelection(latest.current, dom.anchor, dom.focus);
    };

    // A paste or drop is the clipboard's `text/plain` and nothing else: with rich content on the
    // clipboard a `plaintext-only` box derives its own text from the HTML, with the wrong breaks.
    const onTransfer = (e: ClipboardEvent | DragEvent): void => {
      const data = e instanceof ClipboardEvent ? e.clipboardData : e.dataTransfer;
      if (data === null) return;
      e.preventDefault();
      apply(insertText(synced(), normalised(data.getData('text/plain'), oneLine())));
    };

    const onBeforeInput = (e: InputEvent): void => {
      if (composing.current || e.isComposing) return;
      if (e.cancelable) e.preventDefault();
      const s = synced();
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
      } else if (!oneLine()) {
        const shortcut = shortcutOf(e);
        if (shortcut !== null) {
          e.preventDefault();
          handlers.current.onShortcut?.(shortcut);
        }
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
      // R48: the composed text is in the model now, so the commit the blur deferred can run.
      if (commitAfterComposition.current) {
        commitAfterComposition.current = false;
        handlers.current.onCommit();
      }
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

    // R48: the model lacks a composition's text until `compositionend`; a blur then waits for it.
    const onBlur = (): void => {
      if (composing.current) commitAfterComposition.current = true;
      else handlers.current.onCommit();
    };
    const onFocus = (): void => {
      commitAfterComposition.current = false;
    };

    el.addEventListener('paste', onTransfer);
    el.addEventListener('drop', onTransfer);
    el.addEventListener('beforeinput', onBeforeInput);
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('compositionstart', onCompositionStart);
    el.addEventListener('compositionend', onCompositionEnd);
    el.addEventListener('blur', onBlur);
    el.addEventListener('focus', onFocus);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      el.removeEventListener('paste', onTransfer);
      el.removeEventListener('drop', onTransfer);
      el.removeEventListener('beforeinput', onBeforeInput);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('compositionstart', onCompositionStart);
      el.removeEventListener('compositionend', onCompositionEnd);
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('focus', onFocus);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, []);

  return (
    <div
      className="textbox"
      data-testid="textbox"
      data-mode={mode}
      data-anchor={mode === 'text' ? anchor : undefined}
      style={{ left: at.x, top: at.y, fontSize: fontPx }}
    >
      <div
        ref={root}
        className="textbox-edit"
        data-testid="textbox-edit"
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        style={{
          ...(bold ? { fontWeight: 'bold' } : {}),
          ...(italic ? { fontStyle: 'italic' } : {}),
        }}
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

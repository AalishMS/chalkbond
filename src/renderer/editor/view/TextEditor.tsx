import { current } from '@core/doc-model';
import { textPlace } from '../model/text-box';
import type { EditorController } from '../state/controller';
import type { EditorAction } from '../state/reducer';
import type { EditorState } from '../state/editor-state';
import { TextBox, type TextShortcut } from './TextBox';

interface TextEditorProps {
  controller: EditorController;
  state: EditorState;
  dispatch: (action: EditorAction) => void;
  /** Hands the focus back to the canvas once the box is gone. */
  onClosed: () => void;
}

/** What a K3 shortcut does, as the reducer's action. */
function actionOf(shortcut: TextShortcut): EditorAction {
  switch (shortcut.type) {
    case 'script':
      return { type: 'edit-script', script: shortcut.script };
    case 'style':
      return { type: 'edit-style', flag: shortcut.flag };
    case 'insert':
      return { type: 'edit-insert', text: shortcut.text };
  }
}

/**
 * The text editor (T1, T2): a `TextBox` over the text, in the rendered text's size at the current
 * zoom. What is typed shows exactly as typed; `finishText` formats it when the box closes.
 */
export function TextEditor({
  controller,
  state,
  dispatch,
  onClosed,
}: TextEditorProps): React.JSX.Element | null {
  const editing = state.editing;
  if (editing?.kind !== 'text') return null;
  const doc = current(state.history);
  const { scene } = controller.derive.committed(doc);
  const place = textPlace(doc, scene, state.viewport, editing.target);
  if (place === null) return null;
  return (
    <TextBox
      edit={editing.edit}
      runs={editing.edit.runs}
      mode="text"
      at={place.at}
      anchor={place.align}
      fontPx={place.fontPx}
      bold={editing.bold}
      italic={editing.italic}
      label="Text"
      onChange={(edit) => dispatch({ type: 'edit-set', edit })}
      onShortcut={(shortcut) => dispatch(actionOf(shortcut))}
      onCommit={() => {
        dispatch({ type: 'edit-commit' });
        onClosed();
      }}
      onCancel={() => {
        dispatch({ type: 'edit-cancel' });
        onClosed();
      }}
    />
  );
}

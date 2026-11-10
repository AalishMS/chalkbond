import { current } from '@core/doc-model';
import { labelDisplayRuns } from '../model/chem-text';
import { labelWarning } from '../model/label-edit';
import { labelBox } from '../model/text-box';
import { textOf } from '../model/text-edit';
import type { EditorController } from '../state/controller';
import type { EditorAction } from '../state/reducer';
import type { EditorState } from '../state/editor-state';
import { TextBox } from './TextBox';

/** L2: the caption under the box. */
export const LABEL_CAPTION = 'e.g. OH, NH2, Cl, Ph, CO2H';
export const LABEL_UNKNOWN = 'Not a known group; it will be drawn as typed.';

interface LabelEditorProps {
  controller: EditorController;
  state: EditorState;
  dispatch: (action: EditorAction) => void;
  /** Hands the focus back to the canvas once the box is gone. */
  onClosed: () => void;
}

/**
 * The label editor (L1-L3): a `TextBox` over the atom, in the rendered label's size at the
 * current zoom. Digits and a trailing charge are shown as sub- and superscripts as they are typed.
 */
export function LabelEditor({
  controller,
  state,
  dispatch,
  onClosed,
}: LabelEditorProps): React.JSX.Element | null {
  const editing = state.editing;
  if (editing?.kind !== 'label') return null;
  const doc = current(state.history);
  const { scene } = controller.derive.committed(doc);
  const box = labelBox(doc, scene, state.viewport, editing.atom);
  if (box === null) return null;
  const text = textOf(editing.edit);
  const unknown = labelWarning(text);
  return (
    <TextBox
      edit={editing.edit}
      runs={labelDisplayRuns(text)}
      mode="label"
      at={box.at}
      fontPx={box.fontPx}
      label="Atom label"
      caption={unknown ? LABEL_UNKNOWN : LABEL_CAPTION}
      captionTone={unknown ? 'warning' : 'muted'}
      onChange={(edit) => dispatch({ type: 'edit-set', edit })}
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

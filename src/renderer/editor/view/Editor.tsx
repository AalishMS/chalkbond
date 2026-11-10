import { useEffect, useState } from 'react';
import { canRedo, canUndo, current } from '@core/doc-model';
import { statusFormula } from '../model/formula';
import { fieldCommand, globalCommand } from '../model/keymap';
import { suggestionRows } from '../model/suggestions';
import type { EditorController } from '../state/controller';
import { isEmptyDoc } from '../state/empty-doc';
import { EMPTY_SCOPE } from '../state/selection-actions';
import { Canvas } from './Canvas';
import { EmptyState } from './EmptyState';
import sprite from './icons.svg?raw';
import { StatusBar } from './StatusBar';
import { ToolRail } from './ToolRail';
import { TooltipHost } from './Tooltip';
import { TopBar } from './TopBar';
import { useEditorState } from './use-store';
import './tokens.css';
import './editor.css';

/** Milliseconds a notice stays in the status bar before it expires. */
const NOTICE_MS = 8000;

/** K1 applies anywhere in the editor except a text input or editor. */
function isTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

const isNameField = (target: EventTarget): boolean =>
  target instanceof HTMLElement && target.dataset['testid'] === 'namefield-input';

interface EditorProps {
  controller: EditorController;
}

/**
 * The editor window grid: top bar, tool rail, canvas, status bar. The icon sprite is injected
 * inline once: an external sprite does not load from file:// in Chromium.
 */
export function Editor({ controller }: EditorProps): React.JSX.Element {
  const state = useEditorState(controller.store);
  const doc = current(state.history);
  const { dispatch } = controller.store;
  const [nameFocused, setNameFocused] = useState(false);
  const noticeId = state.notice?.id;
  useEffect(() => {
    if (noticeId === undefined) return;
    const timer = setTimeout(() => dispatch({ type: 'notice-expired', id: noticeId }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [noticeId, dispatch]);
  const onKeyDown = (e: React.KeyboardEvent): void => {
    // K1: a text input keeps its keys, except Undo / Redo in the empty name field (R23).
    const command = isTextTarget(e.target)
      ? isNameField(e.target)
        ? fieldCommand(e, controller.shortcuts, state.nameField.text)
        : null
      : globalCommand(e, controller.shortcuts);
    if (command === null) return;
    e.preventDefault();
    if (command === 'focus-name-field') {
      e.currentTarget.querySelector<HTMLInputElement>('[data-testid="namefield-input"]')?.focus();
      return;
    }
    controller.run(command);
  };
  const idle = state.editing === null;
  const field = state.nameField;
  const rows = field.open ? suggestionRows(controller.names, field.text) : [];
  const formula = statusFormula(doc, controller.derive.committed(doc).perception, state.selection);
  return (
    <div
      className="editor"
      onKeyDown={onKeyDown}
      onFocus={(e) => setNameFocused(isNameField(e.target))}
      onBlur={() => setNameFocused(false)}
    >
      <div className="sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />
      <TopBar
        state={state}
        scope={EMPTY_SCOPE}
        canUndo={idle && canUndo(state.history)}
        canRedo={idle && canRedo(state.history)}
        rows={rows}
        dispatch={dispatch}
      />
      <ToolRail state={state} dispatch={dispatch} />
      <Canvas controller={controller}>
        {isEmptyDoc(doc) && <EmptyState dispatch={dispatch} />}
      </Canvas>
      <StatusBar
        tool={state.tool}
        preset={doc.style.preset}
        zoom={state.viewport.zoom}
        dispatch={dispatch}
        formula={formula}
        nameFieldFocused={nameFocused}
        hover={state.hover}
        notice={state.notice}
      />
      <TooltipHost />
    </div>
  );
}

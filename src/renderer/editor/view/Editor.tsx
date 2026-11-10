import { useEffect, useMemo, useState } from 'react';
import { canRedo, canUndo, current } from '@core/doc-model';
import { statusFormula } from '../model/formula';
import { selectionScope } from '../model/scope';
import { canvasKey, fieldCommand, globalCommand, hoverKeys } from '../model/keymap';
import { suggestionRows } from '../model/suggestions';
import type { EditorController } from '../state/controller';
import { isEmptyDoc } from '../state/empty-doc';
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

const isCanvas = (target: EventTarget): boolean =>
  target instanceof HTMLElement && target.dataset['testid'] === 'canvas';

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
    // A key that changed the tool or the document leaves the pointer where it was: what rests
    // under it is hovered again at once. Not while a gesture ran (Esc cancels it, and the
    // release brings the hover back).
    const hadGesture = state.gesture !== null;
    const refresh = (): void => {
      if (!hadGesture) controller.refreshHover();
    };
    // K1: a text input keeps its keys, except Undo / Redo in the empty name field (R23).
    const inText = isTextTarget(e.target);
    const plain = inText ? null : canvasKey(e);
    // Arrow keys also move focus in the toolbars: they nudge only with the canvas focused.
    if (plain !== null && !(plain.type === 'nudge' && !isCanvas(e.target))) {
      e.preventDefault();
      dispatch(plain);
      refresh();
      return;
    }
    const command = inText
      ? isNameField(e.target)
        ? fieldCommand(e, controller.shortcuts, state.nameField.text)
        : null
      : globalCommand(e, controller.shortcuts);
    if (command === null) {
      // K2: with the canvas itself focused, a hover key acts on what is hovered, else a tool key
      // selects its tool. A held key does not repeat.
      if (!inText && isCanvas(e.target) && state.editing === null && !e.repeat) {
        const action = hoverKeys(e, state.hover, state.tool);
        if (action !== null) {
          e.preventDefault();
          dispatch(action);
          refresh();
        }
      }
      return;
    }
    e.preventDefault();
    if (command === 'focus-name-field') {
      e.currentTarget.querySelector<HTMLInputElement>('[data-testid="namefield-input"]')?.focus();
      return;
    }
    controller.run(command);
    refresh();
  };
  const idle = state.editing === null;
  const field = state.nameField;
  const rows = field.open ? suggestionRows(controller.names, field.text) : [];
  const { perception } = controller.derive.committed(doc);
  const formula = statusFormula(doc, perception, state.selection);
  const scope = useMemo(
    () => selectionScope(doc, perception, state.selection),
    [doc, perception, state.selection],
  );
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
        scope={scope}
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
        gesture={state.gesture?.kind ?? null}
        notice={state.notice}
      />
      <TooltipHost />
    </div>
  );
}

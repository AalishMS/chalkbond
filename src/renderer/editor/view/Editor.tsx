import { useEffect } from 'react';
import { canRedo, canUndo, current } from '@core/doc-model';
import { globalCommand } from '../model/keymap';
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
  const noticeId = state.notice?.id;
  useEffect(() => {
    if (noticeId === undefined) return;
    const timer = setTimeout(() => dispatch({ type: 'notice-expired', id: noticeId }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [noticeId, dispatch]);
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (isTextTarget(e.target)) return;
    const command = globalCommand(e, controller.shortcuts);
    if (command === null) return;
    e.preventDefault();
    controller.run(command);
  };
  const idle = state.editing === null;
  return (
    <div className="editor" onKeyDown={onKeyDown}>
      <div className="sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />
      <TopBar
        state={state}
        scope={EMPTY_SCOPE}
        canUndo={idle && canUndo(state.history)}
        canRedo={idle && canRedo(state.history)}
        dispatch={dispatch}
      />
      <ToolRail state={state} dispatch={dispatch} />
      <Canvas>{isEmptyDoc(doc) && <EmptyState />}</Canvas>
      <StatusBar tool={state.tool} preset={doc.style.preset} notice={state.notice} />
      <TooltipHost />
    </div>
  );
}

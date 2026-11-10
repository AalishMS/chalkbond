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

interface EditorProps {
  controller: EditorController;
}

/**
 * The editor window grid: top bar, tool rail, canvas, status bar. The icon sprite is injected
 * inline once: an external sprite does not load from file:// in Chromium.
 */
export function Editor({ controller }: EditorProps): React.JSX.Element {
  const state = useEditorState(controller.store);
  const doc = controller.getDoc();
  const { dispatch } = controller.store;
  return (
    <div className="editor">
      <div className="sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />
      <TopBar
        state={state}
        scope={EMPTY_SCOPE}
        canUndo={false}
        canRedo={false}
        dispatch={dispatch}
      />
      <ToolRail state={state} dispatch={dispatch} />
      <Canvas>{isEmptyDoc(doc) && <EmptyState />}</Canvas>
      <StatusBar tool={state.tool} preset={doc.style.preset} />
      <TooltipHost />
    </div>
  );
}

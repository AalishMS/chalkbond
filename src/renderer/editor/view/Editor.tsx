import { EMPTY_SCOPE } from '../state/selection-actions';
import type { EditorController } from '../state/controller';
import sprite from './icons.svg?raw';
import { OptionsBar } from './OptionsBar';
import { ToolRail } from './ToolRail';
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
  return (
    <div className="editor">
      <div className="sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />
      <header className="topbar" data-testid="topbar">
        <OptionsBar state={state} scope={EMPTY_SCOPE} dispatch={controller.store.dispatch} />
      </header>
      <ToolRail state={state} dispatch={controller.store.dispatch} />
      <main className="canvas" data-testid="canvas" aria-label="Drawing canvas" />
      <footer className="statusbar" data-testid="statusbar" />
    </div>
  );
}

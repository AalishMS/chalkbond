import type { EditorController } from '../state/controller';
import sprite from './icons.svg?raw';
import './tokens.css';
import './editor.css';

interface EditorProps {
  controller: EditorController;
}

/**
 * The editor window grid: top bar, tool rail, canvas, status bar. The regions are empty until
 * later tasks fill them. The icon sprite is injected inline once: an external sprite does not
 * load from file:// in Chromium.
 */
export function Editor(props: EditorProps): React.JSX.Element {
  void props.controller;
  return (
    <div className="editor">
      <div className="sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />
      <header className="topbar" data-testid="topbar" />
      <nav className="rail" data-testid="rail" aria-label="Tools" />
      <main className="canvas" data-testid="canvas" aria-label="Drawing canvas" />
      <footer className="statusbar" data-testid="statusbar" />
    </div>
  );
}

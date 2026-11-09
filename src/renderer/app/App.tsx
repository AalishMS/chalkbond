export function App(): React.JSX.Element {
  return (
    <div className="app">
      <header className="toolbar" aria-label="Toolbar">
        <span className="app-name">Chalkbond</span>
      </header>
      <main className="canvas-area" aria-label="Drawing canvas" data-testid="canvas-area" />
    </div>
  );
}

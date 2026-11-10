import { useState } from 'react';
import { createEditorController, Editor } from '../editor';

export function App(): React.JSX.Element {
  const [controller] = useState(() =>
    createEditorController({ clock: () => new Date().toISOString() }),
  );
  return (
    <div className="app" data-testid="canvas-area">
      <Editor controller={controller} />
    </div>
  );
}

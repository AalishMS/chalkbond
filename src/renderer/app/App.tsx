import { useEffect, useState } from 'react';
import { createEditorController, Editor } from '../editor';
import { createTestHook } from './model/test-hook';

export function App(): React.JSX.Element {
  const [controller] = useState(() =>
    createEditorController({ clock: () => new Date().toISOString() }),
  );
  // The e2e test hook (TH2): main loads the page with `?testHooks=1` only for an unpackaged build
  // started with `--chalkbond-test-hooks`. Without the query nothing is defined.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('testHooks') !== '1') return undefined;
    const hook = createTestHook(controller);
    Object.defineProperty(window, '__chalkbondTest', {
      value: hook,
      configurable: true,
    });
    return () => {
      hook.dispose();
      Reflect.deleteProperty(window, '__chalkbondTest');
    };
  }, [controller]);
  return (
    <div className="app" data-testid="canvas-area">
      <Editor controller={controller} />
    </div>
  );
}

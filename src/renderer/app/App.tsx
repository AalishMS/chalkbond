import { useEffect } from 'react';
import { Editor } from '../editor';
import { createTestHook } from './model/test-hook';

import type { WindowHost } from './host';
import sprite from './shell-icons.svg?raw';
import './shell-tokens.css';

export function App({ host }: { host: WindowHost }): React.JSX.Element {
  const { controller } = host;
  useEffect(() => {
    const stopMain = window.chalkbond.onMainEvent((event) => {
      if (event.type === 'command') host.commands.push(event.command);
    });
    host.publishSession();
    const stopController = controller.subscribe((event) => {
      if (event.type === 'doc' || event.type === 'dirty') host.publishSession();
    });
    return () => {
      stopController();
      stopMain();
    };
  }, [controller, host]);
  // The e2e test hook (TH2): main loads the page with `?testHooks=1` only for an unpackaged build
  // started with `--chalkbond-test-hooks`. Without the query nothing is defined.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('testHooks') !== '1') return undefined;
    const hook = createTestHook(controller, host.commands);
    Object.defineProperty(window, '__chalkbondTest', {
      value: hook,
      configurable: true,
    });
    return () => {
      hook.dispose();
      Reflect.deleteProperty(window, '__chalkbondTest');
    };
  }, [controller, host]);
  return (
    <div className="app" data-testid="canvas-area">
      <div className="sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />
      <Editor controller={controller} />
    </div>
  );
}

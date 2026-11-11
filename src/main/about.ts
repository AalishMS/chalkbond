// AB1 About box (SPEC-app-shell.md "About box"; mock-up A14): a native message box with the app
// icon; **Licences** opens the bundled THIRD-PARTY-NOTICES.txt with the system's text viewer.
import { join } from 'node:path';
import type { MessageBoxOptions, NativeImage } from 'electron';

export interface AboutPorts {
  /** `dialog.showMessageBox` (modal to the window), read at call time (TH4). */
  box(options: MessageBoxOptions): Promise<{ response: number }>;
  /** `shell.openPath`: resolves '' on success, else an error message (logged, never shown). */
  openPath(path: string): Promise<string>;
  /** `nativeImage.createFromPath`. */
  image(path: string): NativeImage;
  /** `process.resourcesPath` when packaged, else the repository's `build/` (I1 extraResources). */
  folder: string;
  /** `app.getVersion()` (package.json; 1.0.0 at the release checkpoint). */
  version: string;
  /** package.json `author`. */
  author: string;
  log(message: string): void;
}

export function createAbout(ports: AboutPorts): { show(): Promise<void> } {
  let open = false;
  return {
    async show() {
      if (open) return;
      open = true;
      try {
        const { response } = await ports.box({
          type: 'none',
          icon: ports.image(join(ports.folder, 'icon.png')),
          title: 'About Chalkbond',
          message: `Chalkbond ${ports.version}`,
          detail: [
            'Draw chemical structures and reactions for teaching.',
            '',
            'Works fully offline. Nothing you draw leaves this computer.',
            '',
            `Copyright © 2026 ${ports.author}.`,
            'Built with OpenChemLib, Electron, React, Immer and Zod.',
          ].join('\n'),
          buttons: ['OK', 'Licences'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        if (response !== 1) return;
        const failure = await ports.openPath(join(ports.folder, 'THIRD-PARTY-NOTICES.txt'));
        if (failure !== '') ports.log('Could not open the licence notices');
      } finally {
        open = false;
      }
    },
  };
}

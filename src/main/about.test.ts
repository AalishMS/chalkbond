// AB1 (SPEC-app-shell.md "About box"; A14): the native box's options and the Licences answer, with
// fake ports (TH5: native boxes are asserted as data; their look is on the Windows checklist).
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createAbout, type AboutPorts } from './about';

const DETAIL = [
  'Draw chemical structures and reactions for teaching.',
  '',
  'Works fully offline. Nothing you draw leaves this computer.',
  '',
  'Copyright © 2026 Aalish.',
  'Built with OpenChemLib, Electron, React, Immer and Zod.',
].join('\n');

function setup(response: number, openResult = '') {
  const icon = { icon: true };
  const ports = {
    box: vi.fn<AboutPorts['box']>(() => Promise.resolve({ response })),
    openPath: vi.fn<AboutPorts['openPath']>(() => Promise.resolve(openResult)),
    image: vi.fn<AboutPorts['image']>(() => icon as never),
    folder: '/app/resources',
    version: '0.1.0',
    author: 'Aalish',
    log: vi.fn<AboutPorts['log']>(),
  };
  return { ports, icon, about: createAbout(ports) };
}

describe('About (AB1)', () => {
  it('shows the A14 box: title, version, detail, OK and Licences, the app icon', async () => {
    const { ports, icon, about } = setup(0);
    await about.show();
    expect(ports.image).toHaveBeenCalledWith(join('/app/resources', 'icon.png'));
    expect(ports.box).toHaveBeenCalledWith({
      type: 'none',
      icon,
      title: 'About Chalkbond',
      message: 'Chalkbond 0.1.0',
      detail: DETAIL,
      buttons: ['OK', 'Licences'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    expect(ports.openPath).not.toHaveBeenCalled();
  });

  it('the version and author come from the app (package.json)', async () => {
    const { ports } = setup(0);
    await createAbout({ ...ports, version: '1.0.0', author: 'Someone' }).show();
    expect(ports.box.mock.lastCall?.[0]).toMatchObject({
      message: 'Chalkbond 1.0.0',
      detail: expect.stringContaining('Copyright © 2026 Someone.\n'),
    });
  });

  it('Licences opens the bundled THIRD-PARTY-NOTICES.txt (shell.openPath, Notepad)', async () => {
    const { ports, about } = setup(1);
    await about.show();
    expect(ports.openPath).toHaveBeenCalledTimes(1);
    expect(ports.openPath).toHaveBeenCalledWith(join('/app/resources', 'THIRD-PARTY-NOTICES.txt'));
    expect(ports.log).not.toHaveBeenCalled();
  });

  it('a failed open is logged, never shown as an error code', async () => {
    const { ports, about } = setup(1, 'Failed to open path');
    await about.show();
    expect(ports.log).toHaveBeenCalledWith('Could not open the licence notices');
  });

  it('a second About while one is open is ignored (one box at a time)', async () => {
    const { ports, about } = setup(0);
    await Promise.all([about.show(), about.show()]);
    expect(ports.box).toHaveBeenCalledTimes(1);
  });
});

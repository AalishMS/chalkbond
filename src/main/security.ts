import { app, session } from 'electron';

export const DEV_ORIGIN = 'http://localhost:5173';

export function installWebContentsSecurity(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event) => event.preventDefault());
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}

export function installSessionSecurity(log: (message: string) => void, blocked: () => void): void {
  const target = session.defaultSession;
  target.setPermissionCheckHandler(() => false);
  target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  target.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const local = ['file:', 'data:', 'blob:', 'devtools:'].includes(url.protocol);
    const dev =
      !app.isPackaged && (url.origin === DEV_ORIGIN || url.origin === 'ws://localhost:5173');
    if (!local && !dev) {
      blocked();
      log('Blocked nonlocal request');
    }
    callback({ cancel: !local && !dev });
  });
}

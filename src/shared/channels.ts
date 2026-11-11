export const CHANNELS = {
  clipboardWrite: 'clipboard:write',
  clipboardRead: 'clipboard:read',
  chooseOpen: 'file:choose-open',
  readFile: 'file:read',
  chooseSave: 'file:choose-save',
  writeFile: 'file:write',
  ask: 'dialog:ask',
  showFileError: 'dialog:file-error',
  startup: 'app:startup',
  updateSession: 'session:update',
  logError: 'log:error',
  mainEvent: 'main:event',
} as const;

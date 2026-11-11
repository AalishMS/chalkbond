import { CHANNELS } from '../shared/channels';
import type { MainEvent } from '../shared/ipc-types';
import { contextBridge, ipcRenderer } from 'electron';
import type { ChalkbondApi } from './api';

// Narrow, typed API only. Never expose ipcRenderer, fs or other Node/Electron objects.
const api: ChalkbondApi = {
  clipboardWrite: (value) => ipcRenderer.invoke(CHANNELS.clipboardWrite, value),
  clipboardRead: () => ipcRenderer.invoke(CHANNELS.clipboardRead, {}),
  startup: () => ipcRenderer.invoke(CHANNELS.startup, {}),
  updateSession: (value) => ipcRenderer.send(CHANNELS.updateSession, value),
  platform: process.platform,
  logError: (message) => ipcRenderer.send(CHANNELS.logError, { message }),
  onMainEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: MainEvent) => callback(value);
    ipcRenderer.on(CHANNELS.mainEvent, listener);
    return () => {
      ipcRenderer.removeListener(CHANNELS.mainEvent, listener);
    };
  },
};

contextBridge.exposeInMainWorld('chalkbond', api);

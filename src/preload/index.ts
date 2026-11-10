import { CHANNELS } from '../shared/channels';
import type { MainEvent } from '../shared/ipc-types';
import { contextBridge, ipcRenderer } from 'electron';
import type { ChalkbondApi } from './api';

// Narrow, typed API only. Never expose ipcRenderer, fs or other Node/Electron objects.
const api: ChalkbondApi = {
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

import { contextBridge } from 'electron';
import type { ChalkbondApi } from './api';

// Narrow, typed API only. Never expose ipcRenderer, fs or other Node/Electron objects.
const api: ChalkbondApi = {
  platform: process.platform,
};

contextBridge.exposeInMainWorld('chalkbond', api);

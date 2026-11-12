import { CHANNELS } from '../shared/channels';
import type { MainEvent } from '../shared/ipc-types';
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ChalkbondApi } from './api';

// Narrow, typed API only. Never expose ipcRenderer, fs or other Node/Electron objects.
const api: ChalkbondApi = {
  clipboardWrite: (value) => ipcRenderer.invoke(CHANNELS.clipboardWrite, value),
  clipboardRead: () => ipcRenderer.invoke(CHANNELS.clipboardRead, {}),
  chooseOpen: () => ipcRenderer.invoke(CHANNELS.chooseOpen, {}),
  readFile: (ref) => ipcRenderer.invoke(CHANNELS.readFile, { ref: ref.id }),
  // I3 (SEC14): the path is read here, never by the page; '' for a File the page made itself.
  openDroppedFile: (file) =>
    ipcRenderer.invoke(CHANNELS.fileDropped, { path: webUtils.getPathForFile(file) }),
  chooseSave: (format, suggestedName) =>
    ipcRenderer.invoke(CHANNELS.chooseSave, { format, suggestedName }),
  writeFile: (ref, data) => ipcRenderer.invoke(CHANNELS.writeFile, { ref: ref.id, data }),
  printPdf: (request) => ipcRenderer.invoke(CHANNELS.printPdf, request),
  ask: (request) => ipcRenderer.invoke(CHANNELS.ask, request),
  showFileError: (problem: string, name: string, context?: 'auto-save' | 'keep') =>
    ipcRenderer.invoke(
      CHANNELS.showFileError,
      context === undefined ? { problem, name } : { context, problem, name },
    ),
  showContextMenu: (request) => ipcRenderer.invoke(CHANNELS.showContextMenu, request),
  showTabMenu: (request) => ipcRenderer.invoke(CHANNELS.showTabMenu, request),
  startup: () => ipcRenderer.invoke(CHANNELS.startup, {}),
  setSettings: (value) => ipcRenderer.invoke(CHANNELS.setSettings, value),
  updateSession: (value) => ipcRenderer.send(CHANNELS.updateSession, value),
  sessionFile: (ref) => ipcRenderer.send(CHANNELS.sessionFile, { ref: ref?.id ?? null }),
  closeOk: () => ipcRenderer.send(CHANNELS.closeOk, {}),
  readTabRecord: (tabId) => ipcRenderer.invoke(CHANNELS.readTabRecord, { tabId }),
  writeTabRecord: (value) => ipcRenderer.invoke(CHANNELS.writeTabRecord, value),
  updateSessionIndex: (value) => ipcRenderer.send(CHANNELS.updateSessionIndex, value),
  bindTab: (request) => ipcRenderer.invoke(CHANNELS.bindTab, request),
  autoSave: (request) => ipcRenderer.invoke(CHANNELS.autoSave, request),
  checkTabFile: (tabId) => ipcRenderer.invoke(CHANNELS.checkTabFile, { tabId }),
  acceptOutsideChange: (value) => ipcRenderer.send(CHANNELS.acceptOutsideChange, value),
  damagedTabRecord: (tabId) => ipcRenderer.send(CHANNELS.damagedTabRecord, { tabId }),
  writeRecovery: (value) => ipcRenderer.send(CHANNELS.writeRecovery, value),
  clearRecovery: () => ipcRenderer.send(CHANNELS.clearRecovery, {}),
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

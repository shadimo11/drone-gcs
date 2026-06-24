import { contextBridge, ipcRenderer } from 'electron';

/**
 * Secure preload bridge. Only these methods cross into the renderer; the
 * renderer has no direct Node, serialport, or fs access (contextIsolation on,
 * nodeIntegration off). Each `on*` returns an unsubscribe function.
 */
const api = {
  listPorts: () => ipcRenderer.invoke('list-ports'),
  connect: (opts: unknown) => ipcRenderer.invoke('connect', opts),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  sendCommand: (cmd: unknown) => ipcRenderer.invoke('send-command', cmd),
  startLog: (opts?: { dir?: string }) => ipcRenderer.invoke('start-log', opts),
  stopLog: () => ipcRenderer.invoke('stop-log'),
  chooseSaveDir: () => ipcRenderer.invoke('choose-save-dir'),

  onTelemetry: (cb: (t: unknown, meta: unknown) => void) => {
    const h = (_e: unknown, t: unknown, meta: unknown) => cb(t, meta);
    ipcRenderer.on('telemetry', h);
    return () => ipcRenderer.removeListener('telemetry', h);
  },
  onLink: (cb: (status: string, detail?: string) => void) => {
    const h = (_e: unknown, status: string, detail?: string) => cb(status, detail);
    ipcRenderer.on('link', h);
    return () => ipcRenderer.removeListener('link', h);
  },
  onLog: (cb: (entry: unknown) => void) => {
    const h = (_e: unknown, entry: unknown) => cb(entry);
    ipcRenderer.on('log', h);
    return () => ipcRenderer.removeListener('log', h);
  },
};

contextBridge.exposeInMainWorld('gcs', api);
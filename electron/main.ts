import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SerialTransport } from '../src/transport/SerialTransport.ts';
import { MockTransport } from '../src/transport/MockTransport.ts';
import { Ingest } from '../src/transport/Ingest.ts';
import type { Transport } from '../src/transport/Transport.ts';
import { CsvLogger } from '../src/logging/csvLogger.ts';
import { encodeUplink, LOSS_OF_SIGNAL_MS } from '../src/protocol/index.ts';
import type { Telemetry, UplinkCommand } from '../src/protocol/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

let win: BrowserWindow | null = null;
let transport: Transport | null = null;
const ingest = new Ingest();
const logger = new CsvLogger();
let loggingActive = false;
let lastValidAt = 0;
let lossTimer: NodeJS.Timeout | null = null;

function send(channel: string, ...args: unknown[]) {
  win?.webContents.send(channel, ...args);
}

// ingest -> renderer + logger
ingest.on('telemetry', (t: Telemetry, meta) => {
  lastValidAt = Date.now();
  send('telemetry', t, meta);
  if (loggingActive) logger.log(t, meta.suspect);
});

// server-side loss-of-signal watchdog (authoritative)
function startWatchdog() {
  if (lossTimer) return;
  lossTimer = setInterval(() => {
    if (lastValidAt && Date.now() - lastValidAt > LOSS_OF_SIGNAL_MS) {
      send('link', 'lost', `no packet >${LOSS_OF_SIGNAL_MS}ms`);
    }
  }, 100);
}

function wireTransport(tp: Transport) {
  tp.on('data', (chunk) => ingest.push(chunk));
  tp.on('open', () => send('link', 'connected'));
  tp.on('close', (reason) => send('link', 'disconnected', reason));
  tp.on('error', (err) =>
    send('log', { ts: Date.now(), level: 'error', message: `Transport: ${err.message}` }),
  );
}

ipcMain.handle('list-ports', async () => SerialTransport.list());

ipcMain.handle('connect', async (_e, opts: { port: string | null; baud: number; mock: boolean }) => {
  if (transport) await transport.close();
  ingest.reset();
  lastValidAt = 0;

  transport = opts.mock
    ? new MockTransport({ rateHz: 20 })
    : new SerialTransport({ path: opts.port ?? '', baudRate: opts.baud, autoReconnect: true });

  wireTransport(transport);
  await transport.open();
  startWatchdog();
});

ipcMain.handle('disconnect', async () => {
  if (lossTimer) {
    clearInterval(lossTimer);
    lossTimer = null;
  }
  await transport?.close();
  transport = null;
});

ipcMain.handle('send-command', async (_e, cmd: UplinkCommand) => {
  if (!transport?.isOpen) throw new Error('not connected');
  await transport.write(encodeUplink(cmd));
});

ipcMain.handle('start-log', async (_e, opts?: { dir?: string }) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = opts?.dir ?? join(app.getPath('documents'), 'GCS_Logs');
  const path = join(dir, `telemetry_${stamp}.csv`);
  await logger.start(path);
  loggingActive = true;
  return { path };
});

ipcMain.handle('stop-log', async () => {
  loggingActive = false;
  const rows = logger.rows;
  await logger.stop();
  return { path: 'saved', rows };
});

ipcMain.handle('choose-save-dir', async () => {
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose folder to save telemetry logs',
    defaultPath: app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#14201b',
    title: 'Ground Control Station',
    webPreferences: {
      preload: isDev
        ? join(__dirname, '../dist-electron/preload.mjs')
        : join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'));
  }

  win.on('closed', () => (win = null));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
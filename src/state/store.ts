import { create } from 'zustand';
import type { Telemetry, UplinkCommand } from '../protocol/index.ts';
import { LOSS_OF_SIGNAL_MS } from '../protocol/index.ts';

export type LinkStatus = 'disconnected' | 'connecting' | 'connected' | 'lost';

export interface Waypoint {
  index: number;
  lat: number;
  lon: number;
}

export interface LogEntry {
  ts: number; // epoch ms
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface PidSettings {
  angKp: number; angKi: number; angKd: number;
  posKp: number; posKi: number; posKd: number;
  posAngSp: number; landSpeed: number; psiSp: number;
}

export interface Settings {
  comPort: string | null;
  baudRate: number;
  theme: 'dark' | 'light';
  useMockTransport: boolean;
  pid: PidSettings;
}

interface GcsState {
  // live telemetry
  telemetry: Telemetry | null;
  telemetrySuspect: boolean;
  suspectReasons: string[];
  lastPacketAt: number | null; // epoch ms of last VALID packet
  measuredRateHz: number; // rolling estimate of actual packet rate

  // link
  link: LinkStatus;
  lossOfSignal: boolean; // true when now - lastPacketAt > LOSS_OF_SIGNAL_MS

  // mission
  waypoints: Waypoint[];

  // log
  log: LogEntry[];

  // settings
  settings: Settings;

  // ---- actions ----
  ingestTelemetry: (t: Telemetry, suspect: boolean, reasons: string[]) => void;
  setLink: (s: LinkStatus) => void;
  tickWatchdog: () => void; // call ~10Hz to update lossOfSignal
  addWaypoint: (lat: number, lon: number) => void;
  setWaypoints: (wps: Waypoint[]) => void;
  clearWaypoints: () => void;
  pushLog: (level: LogEntry['level'], message: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updatePid: (patch: Partial<PidSettings>) => void;
  buildUplink: (droneCmd: number) => UplinkCommand;
}

const DEFAULT_PID: PidSettings = {
  angKp: 1.0, angKi: 0.0, angKd: 0.0,
  posKp: 1.0, posKi: 0.0, posKd: 0.0,
  posAngSp: 15, landSpeed: 0.5, psiSp: 0,
};

const MAX_LOG = 500;

let rateWindow: number[] = []; // recent inter-arrival timestamps for rate calc

export const useGcs = create<GcsState>((set, get) => ({
  telemetry: null,
  telemetrySuspect: false,
  suspectReasons: [],
  lastPacketAt: null,
  measuredRateHz: 0,

  link: 'disconnected',
  lossOfSignal: false,

  waypoints: [],
  log: [],

  settings: {
    comPort: null,
    baudRate: 115200,
    theme: 'dark',
    useMockTransport: true,
    pid: DEFAULT_PID,
  },

  ingestTelemetry: (t, suspect, reasons) => {
    const now = Date.now();
    rateWindow.push(now);
    const cutoff = now - 1000;
    rateWindow = rateWindow.filter((x) => x >= cutoff);
    set({
      telemetry: t,
      telemetrySuspect: suspect,
      suspectReasons: reasons,
      lastPacketAt: now,
      measuredRateHz: rateWindow.length,
      lossOfSignal: false,
      link: get().link === 'lost' ? 'connected' : get().link,
    });
  },

  setLink: (s) => set({ link: s }),

  tickWatchdog: () => {
    const { lastPacketAt, link, lossOfSignal } = get();
    if (link !== 'connected' && link !== 'lost') return;
    const stale = lastPacketAt != null && Date.now() - lastPacketAt > LOSS_OF_SIGNAL_MS;
    if (stale && !lossOfSignal) {
      set({ lossOfSignal: true, link: 'lost' });
      get().pushLog('error', 'Signal lost — no valid packet for >500 ms');
    }
  },

  addWaypoint: (lat, lon) =>
    set((s) => ({
      waypoints: [...s.waypoints, { index: s.waypoints.length + 1, lat, lon }],
    })),

  setWaypoints: (wps) => set({ waypoints: wps.map((w, i) => ({ ...w, index: i + 1 })) }),
  clearWaypoints: () => set({ waypoints: [] }),

  pushLog: (level, message) =>
    set((s) => ({
      log: [...s.log.slice(-(MAX_LOG - 1)), { ts: Date.now(), level, message }],
    })),

  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  updatePid: (patch) =>
    set((s) => ({ settings: { ...s.settings, pid: { ...s.settings.pid, ...patch } } })),

  buildUplink: (droneCmd) => {
    const p = get().settings.pid;
    return { droneCmd, ...p };
  },
}));

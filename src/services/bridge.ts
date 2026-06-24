import type { Telemetry, UplinkCommand } from '../protocol/index.ts';
import type { LinkStatus, LogEntry } from '../state/store.ts';
import type { SerialPortInfo } from '../transport/Transport.ts';

/**
 * The surface the preload script exposes on `window.gcs`. The renderer never
 * imports `serialport` or Node modules directly — all hardware access crosses
 * this IPC boundary, which keeps the UI a pure, testable render layer.
 */
export interface GcsBridge {
  listPorts(): Promise<SerialPortInfo[]>;
  connect(opts: { port: string | null; baud: number; mock: boolean }): Promise<void>;
  disconnect(): Promise<void>;
  sendCommand(cmd: UplinkCommand): Promise<void>;
  startLog(opts?: { dir?: string }): Promise<{ path: string }>;
  stopLog(): Promise<{ path: string; rows: number }>;
  chooseSaveDir(): Promise<string | null>;

  onTelemetry(cb: (t: Telemetry, meta: { suspect: boolean; reasons: string[] }) => void): () => void;
  onLink(cb: (status: LinkStatus, detail?: string) => void): () => void;
  onLog(cb: (entry: LogEntry) => void): () => void;
}

declare global {
  interface Window {
    gcs: GcsBridge;
  }
}
import { SerialPort } from 'serialport';
import {
  TinyEmitter,
  type Transport,
  type TransportEvents,
  type SerialPortInfo,
} from './Transport.ts';

export interface SerialOptions {
  path: string;
  baudRate?: number; // SRS B.2: 115200
  autoReconnect?: boolean;
  /** initial reconnect delay (ms); doubles each attempt up to maxBackoffMs */
  backoffMs?: number;
  maxBackoffMs?: number;
}

/**
 * Serial link to the Bridge (Arduino Mega) over USB.
 *
 * Reliability features beyond the SRS baseline:
 *  - auto-reconnect with exponential backoff
 *  - clean teardown so a manual reconnect never leaks a half-open handle
 *  - port enumeration for the connection dropdown
 *
 * Runs in the Electron main process (Node context); the renderer talks to it
 * over IPC, never importing serialport directly.
 */
export class SerialTransport
  extends TinyEmitter<TransportEvents>
  implements Transport
{
  private port: SerialPort | null = null;
  private opts: Required<SerialOptions>;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private currentBackoff: number;
  private manualClose = false;

  constructor(opts: SerialOptions) {
    super();
    this.opts = {
      baudRate: 115200,
      autoReconnect: true,
      backoffMs: 500,
      maxBackoffMs: 8000,
      ...opts,
    };
    this.currentBackoff = this.opts.backoffMs;
  }

  static async list(): Promise<SerialPortInfo[]> {
    const ports = await SerialPort.list();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer,
      friendlyName: (p as { friendlyName?: string }).friendlyName,
    }));
  }

  get isOpen(): boolean {
    return this.port?.isOpen ?? false;
  }

  open(): Promise<void> {
    this.manualClose = false;
    return new Promise((resolve, reject) => {
      this.port = new SerialPort(
        { path: this.opts.path, baudRate: this.opts.baudRate, autoOpen: false },
        // open callback set below
      );

      this.port.on('data', (chunk: Buffer) => this.emit('data', new Uint8Array(chunk)));
      this.port.on('error', (err: Error) => this.emit('error', err));
      this.port.on('close', () => {
        this.emit('close', this.manualClose ? 'manual' : 'unexpected');
        if (!this.manualClose && this.opts.autoReconnect) this.scheduleReconnect();
      });

      this.port.open((err) => {
        if (err) {
          if (this.opts.autoReconnect && !this.manualClose) this.scheduleReconnect();
          reject(err);
          return;
        }
        this.currentBackoff = this.opts.backoffMs; // reset on success
        this.emit('open');
        resolve();
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.currentBackoff;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.currentBackoff = Math.min(this.currentBackoff * 2, this.opts.maxBackoffMs);
      this.open().catch(() => {
        /* error already surfaced; backoff loop continues via close handler */
      });
    }, delay);
  }

  async close(): Promise<void> {
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await new Promise<void>((resolve) => {
      if (this.port?.isOpen) this.port.close(() => resolve());
      else resolve();
    });
    this.port = null;
  }

  write(bytes: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.port?.isOpen) return reject(new Error('port not open'));
      this.port.write(Buffer.from(bytes), (err) => (err ? reject(err) : resolve()));
    });
  }
}

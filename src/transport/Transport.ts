/**
 * Transport abstraction.
 *
 * Everything above this interface (ingest, state, UI) is unaware of *how*
 * bytes arrive. A real serial port, a CSV replay, or an in-process mock all
 * satisfy the same contract, which is what lets the GCS run and be demoed
 * with no hardware attached, and what isolates serial-library churn to one
 * folder.
 */
export interface SerialPortInfo {
  path: string; // e.g. "COM3"
  manufacturer?: string;
  friendlyName?: string;
}

export interface TransportEvents {
  /** Raw bytes received from the link. */
  data: (chunk: Uint8Array) => void;
  /** Link opened successfully. */
  open: () => void;
  /** Link closed (intentionally or by error). */
  close: (reason?: string) => void;
  /** Recoverable error; transport may attempt reconnect. */
  error: (err: Error) => void;
  // index signature so this satisfies the TinyEmitter constraint
  [event: string]: (...args: never[]) => void;
}

export interface Transport {
  readonly isOpen: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  /** Write raw bytes to the link (e.g. an encoded uplink packet). */
  write(bytes: Uint8Array): Promise<void>;
  on<K extends keyof TransportEvents>(event: K, listener: TransportEvents[K]): void;
  off<K extends keyof TransportEvents>(event: K, listener: TransportEvents[K]): void;
}

/** Minimal typed event emitter shared by transport implementations. */
export class TinyEmitter<E extends Record<string, (...args: never[]) => void>> {
  private listeners: { [K in keyof E]?: Set<E[K]> } = {};

  on<K extends keyof E>(event: K, listener: E[K]): void {
    (this.listeners[event] ??= new Set()).add(listener);
  }
  off<K extends keyof E>(event: K, listener: E[K]): void {
    this.listeners[event]?.delete(listener);
  }
  protected emit<K extends keyof E>(event: K, ...args: Parameters<E[K]>): void {
    this.listeners[event]?.forEach((l) =>
      (l as unknown as (...a: unknown[]) => void)(...args),
    );
  }
}

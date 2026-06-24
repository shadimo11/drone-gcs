import {
  decodeDownlink,
  DOWNLINK_PACKET_SIZE,
  type Telemetry,
} from '../protocol/index.ts';
import { TinyEmitter } from './Transport.ts';

/**
 * Turns a raw byte stream into validated Telemetry objects.
 *
 * Owns a rolling buffer, runs the frame search, and — because the protocol has
 * NO payload checksum (see SRS review §1.3) — applies range and rate-of-change
 * sanity checks so corrupted-but-well-framed packets are flagged rather than
 * trusted. Suspect packets are still emitted (operator may want to see them)
 * but carry `suspect: true` and a reason.
 */
export interface IngestEvents extends Record<string, (...args: never[]) => void> {
  telemetry: (t: Telemetry, meta: { suspect: boolean; reasons: string[] }) => void;
}

const LIMITS = {
  batteryVoltage: { min: 0, max: 30 }, // 4S/6S LiPo realistic ceiling
  satellitesNum: { min: 0, max: 15 },
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 },
  altitudeFb: { min: -50, max: 2000 },
};

// Max plausible change between consecutive packets (per field).
const MAX_DELTA = {
  batteryVoltage: 1.0, // volts — a real pack won't jump 1V instantly
  latitude: 0.001, // ~111 m
  longitude: 0.001,
  altitudeFb: 15, // m
};

const MAX_BUFFER = 4096; // guard against unbounded growth on a stuck link

export class Ingest extends TinyEmitter<IngestEvents> {
  private buf: number[] = [];
  private prev: Telemetry | null = null;

  /** Feed raw bytes from any transport. */
  push(chunk: Uint8Array): void {
    for (const b of chunk) this.buf.push(b);

    // Extract every complete frame currently in the buffer.
    while (this.buf.length >= DOWNLINK_PACKET_SIZE) {
      const view = Uint8Array.from(this.buf);
      const res = decodeDownlink(view);
      if (!res) {
        // No full frame yet. Trim leading bytes that can't start a frame to
        // bound memory, but keep a tail long enough to complete a split frame.
        if (this.buf.length > MAX_BUFFER) {
          this.buf = this.buf.slice(this.buf.length - DOWNLINK_PACKET_SIZE);
        }
        break;
      }
      this.buf = this.buf.slice(res.consumed);
      const { suspect, reasons } = this.validate(res.telemetry);
      if (!suspect) this.prev = res.telemetry;
      this.emit('telemetry', res.telemetry, { suspect, reasons });
    }
  }

  private validate(t: Telemetry): { suspect: boolean; reasons: string[] } {
    const reasons: string[] = [];

    for (const [k, { min, max }] of Object.entries(LIMITS)) {
      const v = t[k as keyof Telemetry] as number;
      if (v < min || v > max) reasons.push(`${k} out of range (${v})`);
    }

    if (this.prev) {
      for (const [k, maxDelta] of Object.entries(MAX_DELTA)) {
        const v = t[k as keyof Telemetry] as number;
        const p = this.prev[k as keyof Telemetry] as number;
        if (Math.abs(v - p) > maxDelta) {
          reasons.push(`${k} jumped ${(v - p).toFixed(4)} in one packet`);
        }
      }
    }

    return { suspect: reasons.length > 0, reasons };
  }

  reset(): void {
    this.buf = [];
    this.prev = null;
  }
}

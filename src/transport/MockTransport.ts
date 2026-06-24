import {
  TinyEmitter,
  type Transport,
  type TransportEvents,
} from './Transport.ts';
import {
  HEADER_BYTES,
  TERMINATOR_BYTES,
  int16ToBytesBE,
  int32ToBytesBE,
} from '../protocol/index.ts';

/**
 * In-process fake drone. Emits well-formed 36-byte downlink frames describing
 * a vehicle slowly orbiting a start point with a draining battery, so the full
 * UI (map, attitude, telemetry, logging) can be exercised with no Arduino,
 * radio, or COM port present. Also used as the deterministic backend for demos.
 *
 * Selectable rate lets you confirm the >500ms loss-of-signal alarm by setting a
 * very low rate or calling `dropLink()`.
 */
export interface MockOptions {
  rateHz?: number; // emit rate; default 20 (realistic for the E32 link)
  centerLat?: number;
  centerLon?: number;
}

export class MockTransport extends TinyEmitter<TransportEvents> implements Transport {
  private timer: ReturnType<typeof setInterval> | null = null;
  private opts: Required<MockOptions>;
  private t = 0;
  private battery = 16.4;
  private opened = false;

  constructor(opts: MockOptions = {}) {
    super();
    this.opts = {
      rateHz: 20,
      centerLat: 30.0444,
      centerLon: 31.2357,
      ...opts,
    };
  }

  get isOpen(): boolean {
    return this.opened;
  }

  open(): Promise<void> {
    this.opened = true;
    this.emit('open');
    const periodMs = 1000 / this.opts.rateHz;
    this.timer = setInterval(() => this.tick(), periodMs);
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.opened = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.emit('close', 'manual');
    return Promise.resolve();
  }

  /** Simulate a radio dropout (no frames) to test loss-of-signal handling. */
  dropLink(ms = 2000): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    setTimeout(() => {
      if (this.opened) this.timer = setInterval(() => this.tick(), 1000 / this.opts.rateHz);
    }, ms);
  }

  write(_bytes: Uint8Array): Promise<void> {
    // A real drone would act on commands; the mock just accepts them.
    return Promise.resolve();
  }

  private tick(): void {
    this.t += 1 / this.opts.rateHz;
    this.battery = Math.max(13.6, this.battery - 0.0005);

    const r = 0.0009; // ~100m orbit radius
    const lat = this.opts.centerLat + r * Math.sin(this.t * 0.15);
    const lon = this.opts.centerLon + r * Math.cos(this.t * 0.15);
    const psi = ((this.t * 9) % 360); // heading sweep
    const alt = 22 + 2 * Math.sin(this.t * 0.3);

    this.emit('data', this.buildFrame({ lat, lon, psi, alt }));
  }

  private buildFrame(s: { lat: number; lon: number; psi: number; alt: number }): Uint8Array {
    const out = new Uint8Array(36);
    let i = 0;
    out[i++] = HEADER_BYTES[0];
    out[i++] = HEADER_BYTES[1];

    const i16 = (v: number, scale: number) => {
      const [hi, lo] = int16ToBytesBE(Math.round(v * scale));
      out[i++] = hi;
      out[i++] = lo;
    };
    const i32 = (v: number, scale: number) => {
      const [b0, b1, b2, b3] = int32ToBytesBE(Math.round(v * scale));
      out[i++] = b0; out[i++] = b1; out[i++] = b2; out[i++] = b3;
    };

    i16(0.02 * Math.sin(this.t), 1000); // pitchCmd
    i16(0.02 * Math.cos(this.t), 1000); // rollCmd
    i16(s.alt, 1000); // altitudeCmd
    i16(0, 1000); // posXCmd
    i16(0, 1000); // posYCmd
    i16(3 * Math.sin(this.t * 0.5), 100); // thetaFb
    i16(2 * Math.cos(this.t * 0.5), 100); // phiFb
    i16(s.alt, 100); // altitudeFb
    i16(0, 100); // posXFb
    i16(0, 100); // posYFb
    i16(s.psi, 100); // psiFb
    i32(s.lat, 1e7);
    i32(s.lon, 1e7);
    out[i++] = Math.round(this.battery * 10) & 0xff;
    const sats = 9;
    const posConEn = 1;
    const status = 3; // e.g. "in mission"
    out[i++] = ((sats & 0x0f) << 4) | ((posConEn & 0x01) << 3) | (status & 0x07);

    out[i++] = TERMINATOR_BYTES[0];
    out[i++] = TERMINATOR_BYTES[1];
    return out;
  }
}

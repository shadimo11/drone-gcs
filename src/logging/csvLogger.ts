import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Telemetry } from '../protocol/index.ts';

/**
 * Telemetry logger with fixed 0.01 s (10 ms) timestamp resolution.
 *
 * Every row has a stable "time_s" column that increments by exactly 0.01.
 * If no packet was received for a given 10 ms slot the data cells are left
 * empty, so the time axis is always uniform and suitable for direct plotting
 * in Excel / MATLAB without resampling.
 */
const COLUMNS: (keyof Telemetry)[] = [
  'pitchCmd', 'rollCmd', 'altitudeCmd', 'posXCmd', 'posYCmd',
  'thetaFb', 'phiFb', 'altitudeFb', 'posXFb', 'posYFb', 'psiFb',
  'latitude', 'longitude', 'batteryVoltage', 'satellitesNum',
  'posConEn', 'droneStatus',
];

// Pre-built empty suffix for gap rows: ",," × (suspect + columns)
const EMPTY_CELLS = ','.repeat(1 + COLUMNS.length);

export class CsvLogger {
  private stream: WriteStream | null = null;
  private rowCount = 0;
  private startEpoch = 0;
  private lastSlot = -1; // last 10 ms slot index that was written

  async start(filePath: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    // 'w' = overwrite per session; each flight gets a fresh file
    this.stream = createWriteStream(filePath, { flags: 'w' });
    this.rowCount = 0;
    this.startEpoch = Date.now();
    this.lastSlot = -1;
    this.stream.write(['time_s', 'suspect', ...COLUMNS].join(',') + '\n');
  }

  log(t: Telemetry, suspect: boolean): void {
    if (!this.stream) return;

    const now = Date.now();
    const currentSlot = Math.round((now - this.startEpoch) / 10); // one slot = 10 ms = 0.01 s

    // Fill any missed slots with empty data rows so the time axis stays uniform
    for (let slot = this.lastSlot + 1; slot < currentSlot; slot++) {
      this.stream.write((slot * 0.01).toFixed(2) + EMPTY_CELLS + '\n');
    }

    // Write data row for the current slot
    const dataRow = COLUMNS.map((c) => {
      const v = t[c];
      return typeof v === 'number' ? roundForCsv(c, v) : v;
    });
    this.stream.write(
      [(currentSlot * 0.01).toFixed(2), suspect ? 1 : 0, ...dataRow].join(',') + '\n',
    );

    this.rowCount++;
    this.lastSlot = currentSlot;
  }

  get rows(): number {
    return this.rowCount;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (this.stream) this.stream.end(() => resolve());
      else resolve();
    });
    this.stream = null;
  }
}

function roundForCsv(col: keyof Telemetry, v: number): number {
  if (col === 'latitude' || col === 'longitude') return Number(v.toFixed(7));
  if (col === 'satellitesNum' || col === 'posConEn' || col === 'droneStatus') return v;
  return Number(v.toFixed(3));
}
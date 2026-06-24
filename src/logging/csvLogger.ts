import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Telemetry } from '../protocol/index.ts';

/**
 * Append-only telemetry logger (C.3 / D.1).
 *
 * Runs in the main process and writes incrementally so disk I/O never blocks
 * the ingest path and a crash mid-flight loses at most the OS buffer, not the
 * whole session. One row per valid packet; selected columns are dumped as a
 * plottable .csv.
 */
const COLUMNS: (keyof Telemetry)[] = [
  'pitchCmd', 'rollCmd', 'altitudeCmd', 'posXCmd', 'posYCmd',
  'thetaFb', 'phiFb', 'altitudeFb', 'posXFb', 'posYFb', 'psiFb',
  'latitude', 'longitude', 'batteryVoltage', 'satellitesNum',
  'posConEn', 'droneStatus',
];

export class CsvLogger {
  private stream: WriteStream | null = null;
  private rowCount = 0;

  async start(filePath: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    this.stream = createWriteStream(filePath, { flags: 'a' });
    this.rowCount = 0;
    const header = ['epoch_ms', 'suspect', ...COLUMNS].join(',');
    this.stream.write(header + '\n');
  }

  log(t: Telemetry, suspect: boolean): void {
    if (!this.stream) return;
    const row = [
      Date.now(),
      suspect ? 1 : 0,
      ...COLUMNS.map((c) => {
        const v = t[c];
        return typeof v === 'number' ? roundForCsv(c, v) : v;
      }),
    ].join(',');
    this.stream.write(row + '\n');
    this.rowCount++;
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

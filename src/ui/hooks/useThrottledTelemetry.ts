import { useEffect, useState } from 'react';
import { useGcs } from '../../state/store.ts';
import { UI_REFRESH_HZ } from '../../protocol/index.ts';
import type { Telemetry } from '../../protocol/index.ts';

/**
 * SRS C.1 — data is ingested/logged at full rate, but graphical updates are
 * throttled to <=30Hz so the render path never blocks ingest. The store always
 * holds the freshest value; this hook samples it on a fixed timer rather than
 * re-rendering on every packet.
 */
export function useThrottledTelemetry(): Telemetry | null {
  const [sample, setSample] = useState<Telemetry | null>(null);

  useEffect(() => {
    const periodMs = 1000 / UI_REFRESH_HZ;
    const id = setInterval(() => {
      setSample(useGcs.getState().telemetry);
    }, periodMs);
    return () => clearInterval(id);
  }, []);

  return sample;
}

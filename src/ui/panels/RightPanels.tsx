import { Panel } from '../components/Panel.tsx';
import { AttitudeIndicator } from '../components/AttitudeIndicator.tsx';
import { useThrottledTelemetry } from '../hooks/useThrottledTelemetry.ts';
import { useGcs } from '../../state/store.ts';
import { DRONE_CMD } from '../../protocol/index.ts';

export function AttitudePanel() {
  const t = useThrottledTelemetry();
  return (
    <Panel style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <AttitudeIndicator
        roll={t?.phiFb ?? 0}
        pitch={t?.thetaFb ?? 0}
        heading={t?.psiFb ?? 0}
        size={176}
      />
    </Panel>
  );
}

export function ClockPanel() {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  });
  const date = now.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  return (
    <Panel style={{ textAlign: 'center', padding: '7px 10px' }}>
      <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {date} · {time}
      </span>
    </Panel>
  );
}

export function TelemetryCard() {
  const t = useThrottledTelemetry();
  const altTarget = t?.altitudeCmd ?? 0;

  const rows: [string, string][] = [
    ['battery',    t ? `${t.batteryVoltage.toFixed(1)} V · ${batteryPct(t.batteryVoltage)}%` : '—'],
    ['satellites', t ? `${t.satellitesNum}` : '—'],
    ['ground spd', '---'],   // velocity not in current downlink protocol
    ['vert spd',   '---'],   // velocity not in current downlink protocol
    ['altitude',   t ? formatAltitude(t.altitudeFb) : '—'],
    ['alt target', formatAltitude(altTarget)],
  ];

  return (
    <Panel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="metric-label">{label}</div>
            <div className="metric-value mono">{value}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function FlightControls({
  onCommand,
}: {
  onCommand: (cmd: number, label: string) => void;
}) {
  const link = useGcs((s) => s.link);
  const disabled = link !== 'connected';

  // ARM removed — drone arms automatically on boot.
  // Values match firmware stateflow: DISARM=0, LAND=1, TAKEOFF=2
  const btns: { cmd: number; label: string; icon: string; cls: string }[] = [
    { cmd: DRONE_CMD.DISARM,  label: 'Disarm',  icon: 'ti-player-stop',     cls: 'danger' },
    { cmd: DRONE_CMD.TAKEOFF, label: 'Takeoff', icon: 'ti-arrow-up-circle',  cls: 'accent' },
    { cmd: DRONE_CMD.LAND,    label: 'Land',    icon: 'ti-arrow-down-circle', cls: 'warn'  },
  ];

  return (
    <Panel title="Controls & flight modes">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {btns.map((b) => (
          <button
            key={b.cmd}
            className={`cmd-btn ${b.cls}`}
            disabled={disabled}
            style={disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
            onClick={() => onCommand(b.cmd, b.label)}
          >
            <i className={`ti ${b.icon}`} style={{ fontSize: 16 }} aria-hidden="true" />
            {b.label}
          </button>
        ))}
      </div>
    </Panel>
  );
}

/**
 * altitudeFb comes from the TF-Luna LiDAR in centimetres.
 * Display as cm while ≤ 100, then convert to metres above that.
 * Examples: 20 → "20 cm", 120 → "1.20 m"
 */
function formatAltitude(cm: number): string {
  if (cm <= 100) return `${Math.round(cm)} cm`;
  return `${(cm / 100).toFixed(2)} m`;
}


function batteryPct(volts: number): number {
  // 3S LiPo: 12.6 V = 100 %, 9.0 V = 0 %
  return Math.max(0, Math.min(100, Math.round(((volts - 9.0) / (12.6 - 9.0)) * 100)));
}
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
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return (
    <Panel style={{ textAlign: 'center', padding: '7px 10px' }}>
      <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{date} · {time}</span>
    </Panel>
  );
}

export function TelemetryCard() {
  const t = useThrottledTelemetry();
  const altTarget = t?.altitudeCmd ?? 0;
  const groundSpeed = magnitude(t?.posXFb, t?.posYFb); // placeholder derivation
  const rows: [string, string][] = [
    ['battery', t ? `${t.batteryVoltage.toFixed(1)} V · ${batteryPct(t.batteryVoltage)}%` : '—'],
    ['satellites', t ? `${t.satellitesNum}` : '—'],
    ['ground spd', `${groundSpeed.toFixed(1)} m/s`],
    ['vert spd', `${(t?.altitudeCmd != null && t?.altitudeFb != null ? 0 : 0).toFixed(1)} m/s`],
    ['altitude', t ? `${t.altitudeFb.toFixed(1)} m` : '—'],
    ['alt target', `${altTarget.toFixed(1)} m`],
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

export function FlightControls({ onCommand }: { onCommand: (cmd: number, label: string) => void }) {
  const link = useGcs((s) => s.link);
  const disabled = link !== 'connected';
  const btns: { cmd: number; label: string; icon: string; cls: string }[] = [
    { cmd: DRONE_CMD.ARM, label: 'Arm', icon: 'ti-power', cls: 'ok' },
    { cmd: DRONE_CMD.DISARM, label: 'Disarm', icon: 'ti-player-stop', cls: 'danger' },
    { cmd: DRONE_CMD.TAKEOFF, label: 'Takeoff', icon: 'ti-arrow-up-circle', cls: 'accent' },
    { cmd: DRONE_CMD.LAND, label: 'Land', icon: 'ti-arrow-down-circle', cls: 'warn' },
  ];
  return (
    <Panel title="Controls & flight modes">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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

function magnitude(a?: number, b?: number): number {
  return Math.hypot(a ?? 0, b ?? 0);
}
function batteryPct(volts: number): number {
  // crude 4S LiPo mapping 13.6 (0%) .. 16.8 (100%)
  return Math.max(0, Math.min(100, Math.round(((volts - 13.6) / (16.8 - 13.6)) * 100)));
}

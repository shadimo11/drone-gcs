import { Panel, StatusDot } from '../components/Panel.tsx';
import { useGcs } from '../../state/store.ts';
import { useThrottledTelemetry } from '../hooks/useThrottledTelemetry.ts';

export function StatusBar() {
  const link = useGcs((s) => s.link);
  const measuredRate = useGcs((s) => s.measuredRateHz);
  const t = useThrottledTelemetry();

  const comms =
    link === 'connected' ? 'ok' : link === 'lost' ? 'danger' : link === 'connecting' ? 'warn' : 'idle';
  const commsLabel =
    link === 'connected' ? `linked · ${measuredRate} Hz` :
    link === 'lost' ? 'signal lost' :
    link === 'connecting' ? 'connecting' : 'offline';

  const sats = t?.satellitesNum ?? 0;
  const satStatus = sats >= 6 ? 'ok' : sats >= 4 ? 'warn' : 'danger';

  const volts = t?.batteryVoltage ?? 0;
  const battStatus = volts >= 11.5 ? 'ok' : volts >= 10.5 ? 'warn' : 'danger';

  return (
    <Panel
      className="panel"
      style={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 14, alignItems: 'center', padding: '8px 14px' }}
    >
      <StatusDot status={comms as never} label={commsLabel} />
      <Divider />
      <StatusDot status={satStatus as never} label={`${sats} sats`} />
      <Divider />
      <StatusDot status={battStatus as never} label={battStatus === 'ok' ? 'healthy' : 'low'} />
    </Panel>
  );
}

function Divider() {
  return <span style={{ width: 0.5, height: 16, background: 'var(--panel-border-strong)' }} />;
}

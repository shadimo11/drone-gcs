import { Panel } from '../components/Panel.tsx';
import { useGcs } from '../../state/store.ts';

export function WaypointList() {
  const waypoints = useGcs((s) => s.waypoints);
  const clear = useGcs((s) => s.clearWaypoints);

  return (
    <Panel
      style={{
        flex: 2,
        minHeight: 170,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="panel-title" style={{ margin: 0 }}>
          Waypoints {waypoints.length > 0 && <span style={{ color: 'var(--accent)' }}>({waypoints.length})</span>}
        </span>
        {waypoints.length > 0 && (
          <button
            className="icon-btn"
            style={{ width: 24, height: 24 }}
            onClick={clear}
            aria-label="Clear all waypoints"
            title="Clear all"
          >
            <i className="ti ti-trash" style={{ fontSize: 15 }} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
        {waypoints.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, padding: '8px 2px', lineHeight: 1.5 }}>
            Click anywhere on the map to drop a waypoint, then press the route
            button to snap them to roads.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {waypoints.map((w) => (
              <div
                key={w.index}
                className="mono"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  padding: '5px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--inset-bg)',
                }}
              >
                <span
                  style={{
                    flex: '0 0 auto',
                    display: 'grid',
                    placeItems: 'center',
                    width: 22,
                    height: 18,
                    borderRadius: 4,
                    background: 'var(--accent-dim)',
                    color: 'var(--accent)',
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {String(w.index).padStart(2, '0')}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {w.lat.toFixed(5)}, {w.lon.toFixed(5)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

export function MissionLog() {
  const log = useGcs((s) => s.log);
  const recent = log.slice(-40);
  const color = (lvl: string) =>
    lvl === 'error' ? 'var(--danger)' : lvl === 'warn' ? 'var(--warn)' : 'var(--text-tertiary)';

  return (
    <Panel style={{ flex: 1, minHeight: 110, display: 'flex', flexDirection: 'column' }}>
      <span className="panel-title">Mission log</span>
      <div className="scroll mono" style={{ fontSize: 10, lineHeight: 1.7, flex: 1, minHeight: 0 }}>
        {recent.length === 0 ? (
          <span style={{ color: 'var(--text-tertiary)' }}>No messages yet</span>
        ) : (
          recent.map((e, i) => (
            <div key={i} style={{ color: color(e.level) }}>
              {new Date(e.ts).toLocaleTimeString('en-GB', { hour12: false })} {e.message}
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

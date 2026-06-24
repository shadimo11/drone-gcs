import { useState } from 'react';
import { useGcs } from '../../state/store.ts';
import type { PidSettings } from '../../state/store.ts';

/**
 * PID / setpoint tuning (SRS C.4).
 *
 * Fields map 1:1 to the uplink protocol: a single ANG triple, a single POS
 * triple, plus POS_ANG_SP, LAND_SPEED and PSI_SP. Kalman-filter covariance
 * tuning is intentionally absent in v1 — the wire protocol carries no field
 * for it (SRS review §1.7); it will be added once the packet is extended.
 */
const FIELDS: { key: keyof PidSettings; label: string; group: string; step: number }[] = [
  { key: 'angKp', label: 'Angle Kp', group: 'Angle controller', step: 0.01 },
  { key: 'angKi', label: 'Angle Ki', group: 'Angle controller', step: 0.01 },
  { key: 'angKd', label: 'Angle Kd', group: 'Angle controller', step: 0.01 },
  { key: 'posKp', label: 'Position Kp', group: 'Position controller', step: 0.01 },
  { key: 'posKi', label: 'Position Ki', group: 'Position controller', step: 0.01 },
  { key: 'posKd', label: 'Position Kd', group: 'Position controller', step: 0.01 },
  { key: 'posAngSp', label: 'Pos→Ang setpoint limit', group: 'Setpoints', step: 0.5 },
  { key: 'landSpeed', label: 'Landing speed (m/s)', group: 'Setpoints', step: 0.05 },
  { key: 'psiSp', label: 'Yaw setpoint (deg)', group: 'Setpoints', step: 1 },
];

export function PidConfigModal({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: () => void;
}) {
  const pid = useGcs((s) => s.settings.pid);
  const updatePid = useGcs((s) => s.updatePid);
  const [draft, setDraft] = useState<PidSettings>(pid);

  if (!open) return null;

  const groups = [...new Set(FIELDS.map((f) => f.group))];

  const apply = () => {
    updatePid(draft);
    onSend();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PID configuration"
      style={{
        position: 'absolute', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{ width: 420, maxHeight: '82%', overflow: 'auto', padding: 20, background: 'var(--panel-bg-solid)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Parameter tuning</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>

        {groups.map((g) => (
          <div key={g} style={{ marginBottom: 16 }}>
            <p className="panel-title">{g}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {FIELDS.filter((f) => f.group === g).map((f) => (
                <label key={f.key} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {f.label}
                  <input
                    type="number"
                    step={f.step}
                    value={draft[f.key]}
                    onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
                    style={{
                      width: '100%', marginTop: 4, padding: '6px 8px',
                      background: 'var(--inset-bg)', border: '0.5px solid var(--panel-border-strong)',
                      borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)', fontSize: 13,
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="cmd-btn accent" style={{ flex: 1, flexDirection: 'row', gap: 6 }} onClick={apply}>
            <i className="ti ti-upload" aria-hidden="true" /> Apply & send to drone
          </button>
          <button className="cmd-btn" style={{ flexDirection: 'row', padding: '8px 16px' }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

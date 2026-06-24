import { useCallback, useEffect, useState } from 'react';
import { useGcs } from '../../state/store.ts';
import type { SerialPortInfo } from '../../transport/Transport.ts';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400];

/**
 * Connection control (top centre).
 *
 * - "Serial" mode: enumerate COM ports via the main process, pick a port and
 *   baud rate, then Connect. A refresh button re-scans ports.
 * - "Mock" mode: runs the synthetic drone with no hardware.
 *
 * When running outside Electron (web preview) the serial option is disabled,
 * since port enumeration needs the main process.
 */
export function ConnectionBar() {
  const link = useGcs((s) => s.link);
  const settings = useGcs((s) => s.settings);
  const updateSettings = useGcs((s) => s.updateSettings);
  const setLink = useGcs((s) => s.setLink);
  const pushLog = useGcs((s) => s.pushLog);

  const hasBridge = typeof window !== 'undefined' && !!window.gcs;
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [scanning, setScanning] = useState(false);

  const refreshPorts = useCallback(async () => {
    if (!hasBridge) return;
    setScanning(true);
    try {
      const list = await window.gcs.listPorts();
      setPorts(list);
      // auto-select first port if none chosen yet
      if (!settings.comPort && list.length > 0) {
        updateSettings({ comPort: list[0].path });
      }
    } catch (err) {
      pushLog('error', `Port scan failed: ${(err as Error).message}`);
    } finally {
      setScanning(false);
    }
  }, [hasBridge, settings.comPort, updateSettings, pushLog]);

  // scan ports on mount (and whenever we switch to serial mode)
  useEffect(() => {
    if (hasBridge && !settings.useMockTransport) refreshPorts();
  }, [hasBridge, settings.useMockTransport, refreshPorts]);

  const connected = link === 'connected' || link === 'lost';

  const connect = async () => {
    setLink('connecting');
    try {
      if (hasBridge) {
        await window.gcs.connect({
          port: settings.comPort,
          baud: settings.baudRate,
          mock: settings.useMockTransport,
        });
      }
      pushLog('info', settings.useMockTransport ? 'Connected (mock drone)' : `Connecting to ${settings.comPort}…`);
    } catch (err) {
      setLink('disconnected');
      pushLog('error', `Connect failed: ${(err as Error).message}`);
    }
  };

  const disconnect = async () => {
    try {
      if (hasBridge) await window.gcs.disconnect();
    } finally {
      setLink('disconnected');
      pushLog('info', 'Disconnected');
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--inset-bg)',
    border: '0.5px solid var(--panel-border-strong)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    padding: '6px 8px',
    height: 32,
  };

  return (
    <div
      className="panel"
      style={{
        position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', zIndex: 30,
      }}
    >
      {/* mode toggle */}
      <div style={{ display: 'flex', background: 'var(--inset-bg)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
        <ModeButton
          label="Mock"
          icon="ti-device-desktop-analytics"
          active={settings.useMockTransport}
          onClick={() => updateSettings({ useMockTransport: true })}
          disabled={connected}
        />
        <ModeButton
          label="Serial"
          icon="ti-usb"
          active={!settings.useMockTransport}
          onClick={() => updateSettings({ useMockTransport: false })}
          disabled={connected || !hasBridge}
        />
      </div>

      {/* serial controls */}
      {!settings.useMockTransport && (
        <>
          <select
            aria-label="COM port"
            value={settings.comPort ?? ''}
            onChange={(e) => updateSettings({ comPort: e.target.value })}
            disabled={connected}
            style={{ ...inputStyle, minWidth: 130 }}
          >
            {ports.length === 0 && <option value="">No ports found</option>}
            {ports.map((p) => (
              <option key={p.path} value={p.path}>
                {p.path}{p.friendlyName ? ` — ${p.friendlyName}` : p.manufacturer ? ` — ${p.manufacturer}` : ''}
              </option>
            ))}
          </select>

          <select
            aria-label="Baud rate"
            value={settings.baudRate}
            onChange={(e) => updateSettings({ baudRate: Number(e.target.value) })}
            disabled={connected}
            style={{ ...inputStyle, width: 90 }}
          >
            {BAUD_RATES.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          <button
            className="icon-btn"
            onClick={refreshPorts}
            disabled={connected || scanning}
            aria-label="Rescan ports"
            title="Rescan ports"
            style={{ width: 32, height: 32 }}
          >
            <i className={`ti ti-refresh ${scanning ? 'spin' : ''}`} aria-hidden="true" />
          </button>
        </>
      )}

      {/* connect / disconnect */}
      {!connected ? (
        <button
          className="cmd-btn ok"
          style={{ flexDirection: 'row', gap: 6, padding: '0 16px', height: 32 }}
          onClick={connect}
          disabled={link === 'connecting' || (!settings.useMockTransport && !settings.comPort)}
        >
          <i className="ti ti-plug-connected" aria-hidden="true" />
          {link === 'connecting' ? 'Connecting…' : 'Connect'}
        </button>
      ) : (
        <button
          className="cmd-btn danger"
          style={{ flexDirection: 'row', gap: 6, padding: '0 16px', height: 32 }}
          onClick={disconnect}
        >
          <i className="ti ti-plug-connected-x" aria-hidden="true" />
          Disconnect
        </button>
      )}
    </div>
  );
}

function ModeButton({
  label, icon, active, onClick, disabled,
}: {
  label: string; icon: string; active: boolean; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled && label === 'Serial' ? 'Serial needs the desktop app' : label}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: 6, padding: '5px 10px', fontSize: 12,
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 14 }} aria-hidden="true" />
      {label}
    </button>
  );
}

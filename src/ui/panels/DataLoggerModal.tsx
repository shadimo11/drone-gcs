import { useEffect, useRef, useState } from 'react';
import { useGcs } from '../../state/store.ts';
import type { Telemetry } from '../../protocol/index.ts';

const PLOT_FIELDS: { key: keyof Telemetry; label: string }[] = [
  { key: 'thetaFb',       label: 'Pitch FB (θ)'        },
  { key: 'phiFb',         label: 'Roll FB (φ)'          },
  { key: 'psiFb',         label: 'Yaw FB (ψ)'           },
  { key: 'altitudeFb',    label: 'Altitude FB'          },
  { key: 'posXFb',        label: 'Pos X FB'             },
  { key: 'posYFb',        label: 'Pos Y FB'             },
  { key: 'pitchCmd',      label: 'Pitch CMD'            },
  { key: 'rollCmd',       label: 'Roll CMD'             },
  { key: 'altitudeCmd',   label: 'Altitude CMD'         },
  { key: 'posXCmd',       label: 'Pos X CMD'            },
  { key: 'posYCmd',       label: 'Pos Y CMD'            },
  { key: 'batteryVoltage', label: 'Battery Voltage (V)' },
  { key: 'satellitesNum',  label: 'Satellites'          },
];

const WINDOW_SEC = 30; // seconds of history visible on the chart
const MAX_PTS    = 2000;

interface DataPoint { t: number; v: number; }

/**
 * Draws a scrolling line chart onto a canvas element.
 * Called inside a requestAnimationFrame loop — fully imperative, no React state.
 */
function drawChart(
  canvas: HTMLCanvasElement,
  points: DataPoint[],
  fieldLabel: string,
  isDark: boolean,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const pad = { top: 36, right: 20, bottom: 44, left: 64 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  const bg    = isDark ? '#14201b' : '#ffffff';
  const textC = isDark ? '#aab4ad' : '#4b574f';
  const gridC = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const axisC = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
  const lineC = '#4f9bff';

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Compute visible range
  const nowT = points.length > 0 ? points[points.length - 1].t : WINDOW_SEC;
  const minT = Math.max(0, nowT - WINDOW_SEC);
  const maxT = Math.max(WINDOW_SEC, nowT);
  const vis  = points.filter((p) => p.t >= minT);
  const vals = vis.map((p) => p.v);
  let minV = vals.length ? Math.min(...vals) : -1;
  let maxV = vals.length ? Math.max(...vals) :  1;
  if (minV === maxV) { minV -= 1; maxV += 1; }
  const vPad = (maxV - minV) * 0.1;
  minV -= vPad; maxV += vPad;

  const toX = (t: number) => pad.left + ((t - minT) / (maxT - minT)) * cW;
  const toY = (v: number) => pad.top + cH - ((v - minV) / (maxV - minV)) * cH;

  ctx.font         = '11px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = textC;

  // Title
  ctx.textAlign = 'center';
  ctx.fillText(`${fieldLabel} vs Time`, W / 2, 16);

  // Y-axis label (rotated)
  ctx.save();
  ctx.translate(12, pad.top + cH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('Amplitude', 0, 0);
  ctx.restore();

  // X-axis label
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Time (seconds)', pad.left + cW / 2, H - 6);

  // Y grid + tick labels
  for (let i = 0; i <= 5; i++) {
    const v = minV + (i / 5) * (maxV - minV);
    const y = toY(v);
    ctx.strokeStyle = gridC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
    ctx.fillStyle = textC; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(v.toFixed(2), pad.left - 6, y);
  }

  // X grid + tick labels
  for (let i = 0; i <= 6; i++) {
    const t = minT + (i / 6) * (maxT - minT);
    const x = toX(t);
    ctx.strokeStyle = gridC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + cH); ctx.stroke();
    ctx.fillStyle = textC; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(t.toFixed(0), x, pad.top + cH + 6);
  }

  // Axes
  ctx.strokeStyle = axisC; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, pad.top + cH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pad.left, pad.top + cH); ctx.lineTo(pad.left + cW, pad.top + cH); ctx.stroke();

  // Data line
  if (vis.length > 1) {
    ctx.strokeStyle = lineC; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    vis.forEach((p, i) => {
      const x = toX(p.t); const y = toY(p.v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // Placeholder when no data yet
  // No data overlay
  if (vis.length === 0) {
    ctx.fillStyle = textC; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Waiting for telemetry…', pad.left + cW / 2, pad.top + cH / 2);
  }

  // Current-value readout — top-left corner of the chart area
  if (vis.length > 0) {
    const last = vis[vis.length - 1];
    const overlayText = `t: ${last.t.toFixed(2)} s   val: ${last.v.toFixed(3)}`;
    const ox = pad.left + 6;
    const oy = pad.top + 6;
    const oh = 18;
    ctx.font = '10px "JetBrains Mono", "Cascadia Code", ui-monospace, monospace';
    const tw = ctx.measureText(overlayText).width;
    // Background pill
    ctx.fillStyle = isDark ? 'rgba(20,32,27,0.88)' : 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.roundRect(ox, oy, tw + 12, oh, 4);
    ctx.fill();
    // Text
    ctx.fillStyle = lineC;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(overlayText, ox + 6, oy + oh / 2);
  }
}

export function DataLoggerModal({
  open,
  onClose,
  logging,
  saveDir,
  onStartLog,
  onStopLog,
  onChooseSaveDir,
}: {
  open: boolean;
  onClose: () => void;
  logging: boolean;
  saveDir?: string;
  onStartLog: () => void;
  onStopLog: () => void;
  onChooseSaveDir: (dir: string) => void;
}) {
  const [tab, setTab] = useState<'plot' | 'record'>('plot');
  const [field, setField] = useState<keyof Telemetry>('altitudeFb');

  const theme     = useGcs((s) => s.settings.theme);
  const telemetry = useGcs((s) => s.telemetry);
  const isDark    = theme === 'dark';

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<DataPoint[]>([]);
  const startRef  = useRef<number | null>(null);

  // Reset buffer when the selected field changes or when the modal is opened
  useEffect(() => {
    pointsRef.current = [];
    startRef.current  = null;
  }, [field, open]);

  // Append incoming telemetry to the rolling buffer (runs at full telemetry rate)
  useEffect(() => {
    if (!open || tab !== 'plot' || !telemetry) return;
    const now = Date.now();
    if (startRef.current === null) startRef.current = now;
    const v = telemetry[field];
    if (typeof v !== 'number') return;
    const t = (now - startRef.current) / 1000;
    pointsRef.current.push({ t, v });
    if (pointsRef.current.length > MAX_PTS)
      pointsRef.current = pointsRef.current.slice(-MAX_PTS);
  }, [telemetry, open, tab, field]);

  // RAF render loop — redraws the canvas independently of React renders
  useEffect(() => {
    if (!open || tab !== 'plot') return;
    const fieldLabel = PLOT_FIELDS.find((f) => f.key === field)?.label ?? String(field);
    let raf: number;
    const loop = () => {
      if (canvasRef.current)
        drawChart(canvasRef.current, pointsRef.current, fieldLabel, isDark);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open, tab, field, isDark]);

  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // Electron adds a real filesystem .path to every File object
    const file = files[0] as File & { path: string };
    if (!file.path) return;
    const sep = file.path.includes('\\') ? '\\' : '/';
    const dir = file.path.substring(0, file.path.lastIndexOf(sep));
    onChooseSaveDir(dir);
    e.target.value = ''; // reset so the same folder can be re-selected
  };

  if (!open) return null;

  const insetStyle: React.CSSProperties = {
    background: 'var(--inset-bg)',
    border: '0.5px solid var(--panel-border-strong)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: 12,
    padding: '5px 8px',
  };

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{ width: 680, background: 'var(--panel-bg-solid)', padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Data Logger</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 16,
          background: 'var(--inset-bg)', borderRadius: 'var(--radius-sm)', padding: 3,
        }}>
          {(['plot', 'record'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, border: 'none', cursor: 'pointer',
                padding: '7px 0', borderRadius: 6,
                fontSize: 12, fontWeight: 500,
                background: tab === t ? 'var(--panel-bg-solid)' : 'transparent',
                color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              <i className={`ti ${t === 'plot' ? 'ti-chart-line' : 'ti-database'}`}
                 style={{ marginRight: 5 }} aria-hidden="true" />
              {t === 'plot' ? 'Live Plot' : 'Record'}
            </button>
          ))}
        </div>

        {/* ── LIVE PLOT TAB ── */}
        {tab === 'plot' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                Variable:
              </label>
              <select
                value={field}
                onChange={(e) => setField(e.target.value as keyof Telemetry)}
                style={{ ...insetStyle, minWidth: 180 }}
              >
                {PLOT_FIELDS.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>

            <canvas
              ref={canvasRef}
              width={640}
              height={300}
              style={{
                display: 'block',
                width: '100%',
                borderRadius: 'var(--radius-sm)',
                border: '0.5px solid var(--panel-border)',
              }}
            />
          </div>
        )}

        {/* ── RECORD TAB ── */}
        {tab === 'record' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Records all downlink feedback variables to CSV with stable{' '}
              <span className="mono">0.01 s</span> timestamps.
              Rows without received data are left empty so the time axis stays uniform.
            </p>

            {/* Save location */}
            <div>
              <p className="panel-title" style={{ marginBottom: 6 }}>Save location</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span
                  className="mono"
                  style={{
                    ...insetStyle, flex: 1,
                    color: 'var(--text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {saveDir ?? 'Documents\\GCS_Logs  (default)'}
                </span>
                {/* Hidden folder picker — uses Electron's File.path for the real filesystem path */}
                <input
                  ref={folderInputRef}
                  type="file"
                  // @ts-ignore — webkitdirectory is non-standard but fully supported in Electron/Chrome
                  webkitdirectory=""
                  style={{ display: 'none' }}
                  onChange={handleFolderSelect}
                />
                <button
                  className="cmd-btn"
                  style={{ flexDirection: 'row', gap: 6, padding: '6px 14px', whiteSpace: 'nowrap' }}
                  onClick={() => folderInputRef.current?.click()}
                  disabled={logging}
                >
                  <i className="ti ti-folder-open" aria-hidden="true" /> Browse…
                </button>
              </div>
            </div>

            {/* Start / Stop */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="cmd-btn ok"
                style={{
                  flex: 1, flexDirection: 'row', gap: 6, padding: '10px 0',
                  opacity: logging ? 0.4 : 1,
                }}
                onClick={onStartLog}
                disabled={logging}
              >
                <i className="ti ti-player-record" aria-hidden="true" /> Start Recording
              </button>
              <button
                className="cmd-btn danger"
                style={{
                  flex: 1, flexDirection: 'row', gap: 6, padding: '10px 0',
                  opacity: !logging ? 0.4 : 1,
                }}
                onClick={onStopLog}
                disabled={!logging}
              >
                <i className="ti ti-player-stop" aria-hidden="true" /> Stop Recording
              </button>
            </div>

            {/* Active recording indicator */}
            {logging && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                background: 'var(--ok-dim)', border: '0.5px solid var(--ok)',
                fontSize: 12, color: 'var(--ok)',
              }}>
                <i className="ti ti-circle-filled spin" style={{ fontSize: 10 }} aria-hidden="true" />
                Recording in progress…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
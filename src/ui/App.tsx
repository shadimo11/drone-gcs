import { useEffect, useState } from 'react';
import { useGcs } from '../state/store.ts';
import { MapPanel } from './panels/MapPanel.tsx';
import { StatusBar } from './panels/StatusBar.tsx';
import { QuickActions } from './panels/QuickActions.tsx';
import { AttitudePanel, ClockPanel, TelemetryCard, FlightControls } from './panels/RightPanels.tsx';
import { WaypointList, MissionLog } from './panels/MissionPanels.tsx';
import { PidConfigModal } from './panels/PidConfigModal.tsx';
import { ConnectionBar } from './panels/ConnectionBar.tsx';
import { DataLoggerModal } from './panels/DataLoggerModal.tsx';
import { generateRoadSnappedRoute } from '../services/googleMaps.ts';
import { MockTransport } from '../transport/MockTransport.ts';
import { Ingest } from '../transport/Ingest.ts';

/** Synthetic drone for web-only (no Electron) dev/preview mode. */
function setupMockTelemetry(ingestTelemetry: any) {
  const mock = new MockTransport({ rateHz: 20 });
  const ingest = new Ingest();
  ingest.on('telemetry', (t, meta) => ingestTelemetry(t, meta.suspect, meta.reasons));
  mock.on('data', (c) => ingest.push(c));
  mock.open().catch(console.error);
  return () => { mock.close().catch(console.error); };
}

// Drone status → notification config
const STATUS_MAP: Record<number, { label: string; cls: string; icon: string }> = {
  1: { label: 'On-Ground',  cls: 'blue',   icon: 'ti-home'               },
  2: { label: 'Taking Off', cls: 'yellow',  icon: 'ti-arrow-up-circle'    },
  3: { label: 'In-Air',     cls: 'green',   icon: 'ti-drone'              },
  4: { label: 'Landing',    cls: 'yellow',  icon: 'ti-arrow-down-circle'  },
  5: { label: 'Disarming',  cls: 'blue',    icon: 'ti-player-stop'        },
  6: { label: 'Crashed!',   cls: '',        icon: 'ti-alert-octagon'      }, // default red+pulse
};

export function App() {
  const theme           = useGcs((s) => s.settings.theme);
  const lossOfSignal    = useGcs((s) => s.lossOfSignal);
  const link            = useGcs((s) => s.link);
  const telemetry       = useGcs((s) => s.telemetry);
  const ingestTelemetry = useGcs((s) => s.ingestTelemetry);
  const setLink         = useGcs((s) => s.setLink);
  const pushLog         = useGcs((s) => s.pushLog);
  const tickWatchdog    = useGcs((s) => s.tickWatchdog);
  const buildUplink     = useGcs((s) => s.buildUplink);
  const waypoints       = useGcs((s) => s.waypoints);
  const setWaypoints    = useGcs((s) => s.setWaypoints);

  const [pidOpen,    setPidOpen]    = useState(false);
  const [loggerOpen, setLoggerOpen] = useState(false);
  const [logging,    setLogging]    = useState(false);
  const [terrain,    setTerrain]    = useState(false);
  const [saveDir,    setSaveDir]    = useState<string | undefined>(undefined);

  // Apply theme attribute to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Wire IPC bridge → store (graceful fallback for web-only mode)
  useEffect(() => {
    if (!window.gcs) {
      setLink('connected');
      const off = setupMockTelemetry(ingestTelemetry);
      return off;
    }
    const offT   = window.gcs.onTelemetry((t, meta) =>
      ingestTelemetry(t, (meta as any).suspect, (meta as any).reasons),
    );
    const offL   = window.gcs.onLink((status, detail) => {
      setLink(status);
      pushLog(status === 'lost' ? 'error' : 'info',
        `Link ${status}${detail ? ` (${detail})` : ''}`);
    });
    const offLog = window.gcs.onLog((e) => pushLog((e as any).level, (e as any).message));

    // Auto-connect on startup using current settings (mock by default)
    const { comPort, baudRate, useMockTransport } = useGcs.getState().settings;
    setLink('connecting');
    window.gcs
      .connect({ port: comPort, baud: baudRate, mock: useMockTransport })
      .catch((err) => pushLog('error', `Connect failed: ${err.message ?? err}`));

    return () => { offT(); offL(); offLog(); };
  }, [ingestTelemetry, setLink, pushLog]);

  // Loss-of-signal watchdog (~10 Hz)
  useEffect(() => {
    const id = setInterval(() => tickWatchdog(), 100);
    return () => clearInterval(id);
  }, [tickWatchdog]);

  // Bug 6 — threshold corrected to 10 V; clears automatically when voltage recovers
  const lowVoltage = telemetry != null && telemetry.batteryVoltage > 0 && telemetry.batteryVoltage < 10.0;

  // Bug 1 — drone status notification
  // Bug 1 — drone status notification (cleared when link is not active)
  const droneStatus = telemetry?.droneStatus ?? 0;
  const isLiveLink  = link === 'connected' || link === 'lost';
  const statusInfo  = droneStatus > 0 && telemetry && isLiveLink
    ? STATUS_MAP[droneStatus] ?? null
    : null;
  const sendCommand = async (cmd: number, label: string) => {
    try {
      await window.gcs?.sendCommand(buildUplink(cmd));
      pushLog('info', `Command sent: ${label}`);
    } catch {
      pushLog('error', `Command failed: ${label}`);
    }
  };

  // Bug 2 — logging split into start / stop so the modal can control them independently
  const startLog = async () => {
    if (!window.gcs) return;
    const { path } = await window.gcs.startLog({ dir: saveDir });
    pushLog('info', `Logging started → ${path}`);
    setLogging(true);
  };

  const stopLog = async () => {
    if (!window.gcs) return;
    const { rows } = await window.gcs.stopLog();
    pushLog('info', `Logging stopped (${rows} rows)`);
    setLogging(false);
  };

  const chooseSaveDir = (dir: string) => {
    setSaveDir(dir);
    pushLog('info', `Save location set → ${dir}`);
  };

  const generateMission = async () => {
    if (waypoints.length < 2) {
      pushLog('warn', 'Add at least two waypoints before generating a path');
      return;
    }
    try {
      pushLog('info', 'Generating road-snapped route…');
      const route = await generateRoadSnappedRoute(waypoints, 25);
      setWaypoints(route);
      pushLog('info', `Route generated: ${route.length} waypoints`);
    } catch (err) {
      pushLog('error', `Route generation failed: ${(err as Error).message}`);
    }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* full-bleed map */}
      <MapPanel terrain={terrain} />

      {/* alarm stack — all active alarms stack vertically, centred at the top */}
      <div className="alarm-stack">
        {lossOfSignal && (
          <div className="alarm" role="alert">
            <i className="ti ti-antenna-off" aria-hidden="true" /> Signal lost
          </div>
        )}
        {lowVoltage && (
          <div className="alarm" role="alert">
            <i className="ti ti-battery-1" aria-hidden="true" /> Low voltage (&lt;10 V)
          </div>
        )}
        {statusInfo && (
          <div className={`alarm ${statusInfo.cls}`} role="status">
            <i className={`ti ${statusInfo.icon}`} aria-hidden="true" /> {statusInfo.label}
          </div>
        )}
      </div>

      {/* overlays */}
      <StatusBar />
      <ConnectionBar />

      <QuickActions
        logging={logging}
        onOpenLogger={() => setLoggerOpen(true)}
        onGenerateMission={generateMission}
        onToggleTerrain={() => setTerrain((v) => !v)}
        terrainOn={terrain}
        onOpenPid={() => setPidOpen(true)}
      />

      {/* right rail */}
      <div
        className="scroll"
        style={{
          position: 'absolute', right: 14, top: 14, bottom: 14, width: 248,
          display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2,
        }}
      >
        <AttitudePanel />
        <ClockPanel />
        <TelemetryCard />
        <FlightControls onCommand={sendCommand} />
        <WaypointList />
        <MissionLog />
      </div>

      {/* modals */}
      <PidConfigModal
        open={pidOpen}
        onClose={() => setPidOpen(false)}
        onSend={() => sendCommand(0, 'PID update')}
      />

      <DataLoggerModal
        open={loggerOpen}
        onClose={() => setLoggerOpen(false)}
        logging={logging}
        saveDir={saveDir}
        onStartLog={startLog}
        onStopLog={stopLog}
        onChooseSaveDir={chooseSaveDir}
      />
    </div>
  );
}
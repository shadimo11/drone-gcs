import { useEffect, useState } from 'react';
import { useGcs } from '../state/store.ts';
import { MapPanel } from './panels/MapPanel.tsx';
import { StatusBar } from './panels/StatusBar.tsx';
import { QuickActions } from './panels/QuickActions.tsx';
import { AttitudePanel, ClockPanel, TelemetryCard, FlightControls } from './panels/RightPanels.tsx';
import { WaypointList, MissionLog } from './panels/MissionPanels.tsx';
import { PidConfigModal } from './panels/PidConfigModal.tsx';
import { ConnectionBar } from './panels/ConnectionBar.tsx';
import { generateRoadSnappedRoute } from '../services/googleMaps.ts';
import { MockTransport } from '../transport/MockTransport.ts';
import { Ingest } from '../transport/Ingest.ts';

/** Mock transport for web-only (no Electron) dev mode. */
function setupMockTelemetry(ingestTelemetry: any) {
  const mock = new MockTransport({ rateHz: 20 });
  const ingest = new Ingest();
  ingest.on('telemetry', (t, meta) => ingestTelemetry(t, meta.suspect, meta.reasons));
  mock.on('data', (c) => ingest.push(c));
  mock.open().catch(console.error);
  return () => { mock.close().catch(console.error); };
}

export function App() {
  const theme = useGcs((s) => s.settings.theme);
  const lossOfSignal = useGcs((s) => s.lossOfSignal);
  const telemetry = useGcs((s) => s.telemetry);
  const ingestTelemetry = useGcs((s) => s.ingestTelemetry);
  const setLink = useGcs((s) => s.setLink);
  const pushLog = useGcs((s) => s.pushLog);
  const tickWatchdog = useGcs((s) => s.tickWatchdog);
  const buildUplink = useGcs((s) => s.buildUplink);
  const waypoints = useGcs((s) => s.waypoints);
  const setWaypoints = useGcs((s) => s.setWaypoints);

  const [pidOpen, setPidOpen] = useState(false);
  const [logging, setLogging] = useState(false);
  const [terrain, setTerrain] = useState(false);

  // apply theme to root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // wire IPC bridge -> store (graceful fallback for web-only mode)
  useEffect(() => {
    if (!window.gcs) {
      // dev/browser mode: mock the bridge
      setLink('connected');
      const offTelemetry = setupMockTelemetry(ingestTelemetry);
      return offTelemetry;
    }
    const offT = window.gcs.onTelemetry((t, meta) => ingestTelemetry(t, meta.suspect, meta.reasons));
    const offL = window.gcs.onLink((status, detail) => {
      setLink(status);
      pushLog(status === 'lost' ? 'error' : 'info', `Link ${status}${detail ? ` (${detail})` : ''}`);
    });
    const offLog = window.gcs.onLog((e) => pushLog(e.level, e.message));

    // auto-connect using current settings (mock by default)
    const { comPort, baudRate, useMockTransport } = useGcs.getState().settings;
    setLink('connecting');
    window.gcs.connect({ port: comPort, baud: baudRate, mock: useMockTransport }).catch((err) =>
      pushLog('error', `Connect failed: ${err.message ?? err}`),
    );

    return () => { offT(); offL(); offLog(); };
  }, [ingestTelemetry, setLink, pushLog]);

  // loss-of-signal watchdog (~10Hz)
  useEffect(() => {
    const id = setInterval(() => tickWatchdog(), 100);
    return () => clearInterval(id);
  }, [tickWatchdog]);

  // low-voltage alarm (D.3 Low_V_Flag analogue: voltage threshold)
  const lowVoltage = telemetry != null && telemetry.batteryVoltage > 0 && telemetry.batteryVoltage < 14.0;

  const sendCommand = async (cmd: number, label: string) => {
    try {
      await window.gcs?.sendCommand(buildUplink(cmd));
      pushLog('info', `Command sent: ${label}`);
    } catch (err) {
      pushLog('error', `Command failed: ${label}`);
    }
  };

  const toggleLogging = async () => {
    if (!window.gcs) return;
    if (!logging) {
      const { path } = await window.gcs.startLog();
      pushLog('info', `Logging started → ${path}`);
      setLogging(true);
    } else {
      const { path, rows } = await window.gcs.stopLog();
      pushLog('info', `Logging stopped (${rows} rows) → ${path}`);
      setLogging(false);
    }
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

      {/* alarms */}
      {lossOfSignal && (
        <div className="alarm" role="alert">
          <i className="ti ti-antenna-off" aria-hidden="true" /> System disconnected — signal lost
        </div>
      )}
      {!lossOfSignal && lowVoltage && (
        <div className="alarm" role="alert" style={{ marginTop: lossOfSignal ? 56 : 12 }}>
          <i className="ti ti-battery-1" aria-hidden="true" /> Low voltage
        </div>
      )}

      {/* overlays */}
      <StatusBar />
      <ConnectionBar />

      <QuickActions
        logging={logging}
        onToggleLogging={toggleLogging}
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

      <PidConfigModal
        open={pidOpen}
        onClose={() => setPidOpen(false)}
        onSend={() => sendCommand(0, 'PID update')}
      />
    </div>
  );
}

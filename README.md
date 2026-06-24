# Ground Control Station (GCS)

A desktop Ground Control Station for an autonomous quadcopter whose flight
controller runs in Simulink on an Arduino Due, relayed to the GCS by a Bridge
(Arduino Mega) over E32-TTL-100 (telemetry) and HC-12 (command) radios.

Built with **Electron + React + TypeScript**. The map is **Google Maps**, with
road-snapped mission paths via the **Directions API**. Target platform:
**Windows x64**.

---

## Why this stack

The map is the heart of the UI and Google Maps is a browser SDK, so hosting it
inside a web-based shell (Electron) keeps the live telemetry→map path direct.
Bridging Maps into a native desktop toolkit (e.g. PySide6 + an embedded
browser) would have added a JS↔native hop on exactly the path that needs to be
most reliable. See `GCS_SRS_Review_and_Implementation_Plan.md` §1.5 / §2.

---

## Architecture

```
 Bridge (USB serial)
        │  raw bytes
        ▼
 ┌─────────────────────────── Electron MAIN process ───────────────────────────┐
 │  Transport            Ingest                 CsvLogger                        │
 │  ├ SerialTransport →  rolling buffer  →  validated Telemetry → telemetry.csv  │
 │  └ MockTransport      frame search +                                          │
 │     (no hardware)     sanity checks                                           │
 └───────────────────────────────┬─────────────────────────────────────────────┘
                                  │ IPC (contextBridge: window.gcs)
                                  ▼
 ┌────────────────────────── RENDERER (React) ─────────────────────────────────┐
 │  Zustand store ── throttled @30Hz ── Map · Attitude · Telemetry · Controls   │
 └──────────────────────────────────────────────────────────────────────────────┘
```

The renderer never imports `serialport` or any Node module; all hardware access
crosses the IPC boundary. That keeps the UI a pure render layer and isolates
serial-library churn to one folder.

### Layers

| Folder            | Responsibility                                                        |
| ----------------- | --------------------------------------------------------------------- |
| `src/protocol`    | Binary wire protocol — encode uplink (21B), decode downlink (36B).    |
| `src/transport`   | Serial link, mock drone, and the ingest/validation pipeline.          |
| `src/state`       | Zustand store — single source of truth.                               |
| `src/logging`     | Append-only CSV telemetry logger (main process).                      |
| `src/ui`          | React panels, components, hooks.                                       |
| `src/services`    | Google Maps loader + road-snapping; the IPC bridge type.              |
| `electron`        | Main process and the secure preload bridge.                           |

---

## Wire protocol corrections

Two errors in the SRS byte tables were confirmed against the deployed Simulink
model and are encoded correctly here:

1. **Downlink lat/lon int32 split** uses shifts `24/16/8/0`. The document's
   `18` was a typo for `8`; the original would corrupt every coordinate.
2. **Trailing frame marker** on both Bridge subsystems is the **Terminator
   (`-2000` → bytes `248, 48`)**, not a second Header. With two headers and no
   terminator, no packet would ever validate.

Frame markers (big-endian): Header `-1000` = `[252, 24]`, Terminator `-2000` =
`[248, 48]`. Full byte maps are documented in `src/protocol/constants.ts`,
`encodeUplink.ts`, and `decodeDownlink.ts`.

Because the protocol carries **no checksum** (review §1.3), the ingest layer
applies range and rate-of-change sanity checks and flags suspect packets rather
than trusting them blindly.

---

## Prerequisites

- **Node.js 20+** and npm
- **Windows build tools** for the `serialport` native module
  (`npm i -g windows-build-tools` is no longer required on modern Node; the
  bundled prebuilt binaries usually suffice)
- A **Google Maps API key** with *Maps JavaScript API* and *Directions API*
  enabled

## Setup

```bash
npm install
cp .env.example .env       # then paste your Maps key into .env
```

## Run (development)

```bash
npm run dev
```

This launches the Electron desktop app. It starts in **Mock mode** — a synthetic
drone orbits a start point with a draining battery — so the whole UI works with
**no hardware attached**.

### Connecting to real hardware

Use the **connection bar at the top of the window**:

1. Switch the toggle from **Mock** to **Serial**.
2. Pick your Bridge's **COM port** from the dropdown (press the refresh icon to
   re-scan if you plugged it in after launch).
3. Set the **baud rate** (default `115200`, per SRS B.2).
4. Press **Connect**.

To stop, press **Disconnect** — then you can switch ports or modes and reconnect.
No code editing required.

> Serial mode is only available in the desktop (Electron) app, since enumerating
> COM ports needs the main process. The browser preview (`vite preview`) stays in
> mock mode.

## Test

```bash
npm test
```

Runs the protocol unit tests (encode/decode round-trips, frame search in noise,
hemisphere sign handling, malformed-frame rejection) directly under Node's
type-stripping — no build step.

## Package (Windows installer)

```bash
npm run package
```

Produces an NSIS installer in `release/` via electron-builder. `serialport`'s
native bindings are unpacked from the asar (see `electron-builder.yml`).

---

## Features (mapped to the SRS)

- **Map-dominant UI** (D.3): full-bleed Google Map, floating glass panels.
- **Live telemetry** (B/C): attitude indicator, heading tape, battery, sats,
  altitude — UI throttled to ≤30Hz while ingest/logging run at full rate (C.1).
- **Flight commands** (C): Arm / Disarm / Takeoff / Land via the 21-byte uplink.
- **Parameter tuning** (C.4): angle + position PID and setpoints, mapped 1:1 to
  the protocol. *KF covariance tuning is intentionally out of v1 — the wire
  protocol has no field for it (review §1.7).*
- **Mission planning** (D.3): click to add waypoints; "Generate path" road-snaps
  them via the Directions API and simplifies the dense polyline to a manageable,
  indexed waypoint set (review §1.6).
- **Data logging** (C.3/D.1): one-click CSV to `Documents/GCS_Logs`.
- **Reliability**: serial auto-reconnect with backoff; a >500ms loss-of-signal
  watchdog on **both** sides of the IPC boundary; a low-voltage alarm; and a
  graceful "map unavailable" state if Maps can't load offline (review §1.5).
- **Accessibility**: status encoded by icon *shape + colour* (not colour alone),
  visible keyboard focus, and reduced-motion support.

---

## Notes / honest caveats

- **Styling uses plain CSS-variable design tokens, not Tailwind.** For this
  glass aesthetic a small token system in `index.css` gave cleaner control of
  the blur/transparency layers and removed a build dependency. The token set is
  the single source of truth for colour, spacing, and radius.
- **Icons and fonts load from a CDN** (`index.html`). Since the app already
  needs internet for Google Maps, this is fine for v1; for a fully offline icon
  set, vendor the Tabler webfont and the typefaces locally.
- **The protocol and transport layers are unit-tested and verified.** The
  Electron/React/Maps shell is written to standard conventions but should be
  run on the target Windows machine — it can't execute in a headless build
  environment (no display, no Maps key, no COM ports).
- **Why `serialport` is marked external in `vite.config.ts`:** bundling it into
  the ES-module main process breaks its native-bindings loader (it relies on
  `__dirname` in CommonJS context), which surfaces as a
  *"__dirname is not defined in ES module scope"* crash on launch. Keeping it
  external loads it normally from `node_modules` at runtime.
- **Measured radio rate vs. the SRS's 100Hz claim**: the E32-TTL-100 at
  9.6 kbps air-rate cannot sustain 100Hz of 36-byte downlink (~3.6 kB/s). The
  status bar shows the *measured* packet rate so you build around reality, not
  the assumed figure (review §1.4).

See `GCS_SRS_Review_and_Implementation_Plan.md` for the full requirements
review this implementation is based on.

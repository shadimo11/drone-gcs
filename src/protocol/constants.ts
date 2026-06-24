/**
 * Wire-protocol constants, transcribed directly from GCS_SRS.md Chapter 2.
 *
 * Header     = int16(-1000) -> big-endian bytes [252, 24]
 * Terminator = int16(-2000) -> big-endian bytes [248, 48]
 *
 * NOTE on the two corrections confirmed against the deployed Simulink model:
 *  - Bridge Pack_Uplink / Pack_Downlink trailing frame marker is the
 *    TERMINATOR (-2000), not a second header.
 *  - Downlink lat/lon int32 byte split uses shifts 24/16/8/0 (the "18" in the
 *    document was a typo for "8").
 * This file encodes the corrected, hardware-accurate values.
 */

// Frame markers (big-endian byte pairs)
export const HEADER_BYTES = [252, 24] as const; // int16(-1000)
export const TERMINATOR_BYTES = [248, 48] as const; // int16(-2000)

export const HEADER_INT16 = -1000;
export const TERMINATOR_INT16 = -2000;

// Packet sizes (bytes)
export const UPLINK_PACKET_SIZE = 21; // 2 header + 17 payload + 2 terminator
export const UPLINK_PAYLOAD_SIZE = 17;
export const DOWNLINK_PACKET_SIZE = 36; // 2 header + 32 payload + 2 terminator
export const DOWNLINK_PAYLOAD_SIZE = 32;

// Fixed-point scaling factors (multiply on encode, divide on decode)
export const SCALE = {
  PID: 1, // ANG_*, POS_* gains — sent as raw integers, firmware uses them directly (max 100)
  POS_ANG_SP: 10,
  LAND_SPEED: 100,
  ATTITUDE: 100,       // *_FB angle feedback
  CMD_SETPOINT: 1000,  // *_CMD feedback values
  LATLON: 1e7,         // geodetic degrees
  BATTERY: 10,         // volts
} as const;

// Drone command opcodes — DISARM=0, LAND=1, TAKEOFF=2
// ARM is removed: the drone arms automatically on boot.
export const DRONE_CMD = {
  DISARM:  0,
  LAND:    1,
  TAKEOFF: 2,
} as const;
export type DroneCmd = (typeof DRONE_CMD)[keyof typeof DRONE_CMD];

// Loss-of-signal threshold (ms) — C.1 specifies >500ms with no valid packet.
export const LOSS_OF_SIGNAL_MS = 500;

// UI refresh cap (Hz) — C.1 throttles all graphical updates to <=30Hz.
export const UI_REFRESH_HZ = 30;
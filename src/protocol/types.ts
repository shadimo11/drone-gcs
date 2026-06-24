import type { DroneCmd } from './constants.ts';

/**
 * Decoded downlink telemetry (one valid 36-byte packet).
 * Field order and scaling follow the "Downlink Parser Design" table.
 */
export interface Telemetry {
  // Controller command outputs (feedback of what the FC is commanding)
  pitchCmd: number; // deg or rad per firmware convention, /1000
  rollCmd: number; // /1000
  altitudeCmd: number; // /1000
  posXCmd: number; // /1000
  posYCmd: number; // /1000

  // Attitude & position feedback
  thetaFb: number; // pitch feedback, /100
  phiFb: number; // roll feedback, /100
  altitudeFb: number; // /100
  posXFb: number; // /100
  posYFb: number; // /100
  psiFb: number; // yaw/heading feedback, /100

  // Geodetic position
  latitude: number; // degrees, /1e7
  longitude: number; // degrees, /1e7

  // Power & status
  batteryVoltage: number; // volts, /10
  satellitesNum: number; // 0..15 (4-bit field)
  posConEn: number; // 0|1 position-controller-enabled flag
  droneStatus: number; // 0..7 (3-bit status code)
}

/**
 * Uplink command set (one 21-byte packet).
 * All optional except cmd; unspecified gains default to 0 in the encoder,
 * but in practice the caller sends the last-known full tuning set each time.
 */
export interface UplinkCommand {
  droneCmd: DroneCmd | number;

  angKp: number;
  angKi: number;
  angKd: number;

  posKp: number;
  posKi: number;
  posKd: number;

  posAngSp: number; // position->angle setpoint limit
  landSpeed: number; // m/s
  psiSp: number; // yaw setpoint
}

/** A parsed packet plus the metadata the GCS layers care about. */
export interface DecodeResult {
  telemetry: Telemetry;
  /** byte offset at which the valid frame started within the searched buffer */
  frameOffset: number;
  /** bytes consumed up to and including this frame's terminator */
  consumed: number;
}

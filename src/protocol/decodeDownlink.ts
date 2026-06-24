import {
  HEADER_BYTES,
  TERMINATOR_BYTES,
  DOWNLINK_PACKET_SIZE,
} from './constants.ts';
import { bytesToInt16BE, bytesToInt32BE } from './bytes.ts';
import type { DecodeResult, Telemetry } from './types.ts';

/**
 * Search `buffer` for the first valid 36-byte downlink frame and decode it.
 *
 * A frame is valid when bytes [i, i+1] match the header (252, 24) AND bytes
 * [i+34, i+35] match the terminator (248, 48) — the same sliding-window check
 * performed by `centralParser` in the model. Returns null if no frame is found.
 *
 * This is a pure function: the caller (transport/ingest layer) owns the rolling
 * byte buffer and decides how much to discard using `result.consumed`.
 */
export function decodeDownlink(buffer: Uint8Array): DecodeResult | null {
  const n = buffer.length;
  const last = n - DOWNLINK_PACKET_SIZE;

  for (let i = 0; i <= last; i++) {
    if (
      buffer[i] === HEADER_BYTES[0] &&
      buffer[i + 1] === HEADER_BYTES[1] &&
      buffer[i + 34] === TERMINATOR_BYTES[0] &&
      buffer[i + 35] === TERMINATOR_BYTES[1]
    ) {
      const payload = buffer.subarray(i + 2, i + 34); // 32 bytes
      return {
        telemetry: decodePayload(payload),
        frameOffset: i,
        consumed: i + DOWNLINK_PACKET_SIZE,
      };
    }
  }
  return null;
}

/**
 * Decode the 32-byte payload section.
 * Byte map (0-indexed within the payload):
 *   [0..1]   Pitch_CMD    int16 /1000
 *   [2..3]   Roll_CMD     int16 /1000
 *   [4..5]   Altitude_CMD int16 /1000
 *   [6..7]   POS_X_CMD    int16 /1000
 *   [8..9]   POS_Y_CMD    int16 /1000
 *   [10..11] Theta_FB     int16 /100
 *   [12..13] Phi_FB       int16 /100
 *   [14..15] Altitude_FB  int16 /100
 *   [16..17] POS_X_FB     int16 /100
 *   [18..19] POS_Y_FB     int16 /100
 *   [20..21] Psi_FB       int16 /100
 *   [22..25] Latitude     int32 /1e7
 *   [26..29] Longitude    int32 /1e7
 *   [30]     Battery      uint8 /10
 *   [31]     packed: sats(bits7..4) | posConEn(bit3) | status(bits2..0)
 */
export function decodePayload(p: Uint8Array): Telemetry {
  const i16 = (o: number) => bytesToInt16BE(p[o], p[o + 1]);
  const i32 = (o: number) => bytesToInt32BE(p[o], p[o + 1], p[o + 2], p[o + 3]);

  const status = p[31];

  return {
    pitchCmd: i16(0) / 1000,
    rollCmd: i16(2) / 1000,
    altitudeCmd: i16(4) / 1000,
    posXCmd: i16(6) / 1000,
    posYCmd: i16(8) / 1000,

    thetaFb: i16(10) / 100,
    phiFb: i16(12) / 100,
    altitudeFb: i16(14) / 100,
    posXFb: i16(16) / 100,
    posYFb: i16(18) / 100,
    psiFb: i16(20) / 100,

    latitude: i32(22) / 1e7,
    longitude: i32(26) / 1e7,

    batteryVoltage: p[30] / 10,
    satellitesNum: (status >> 4) & 0x0f,
    posConEn: (status >> 3) & 0x01,
    droneStatus: status & 0x07,
  };
}

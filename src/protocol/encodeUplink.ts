import {
  HEADER_BYTES,
  TERMINATOR_BYTES,
  UPLINK_PACKET_SIZE,
  SCALE,
} from './constants.ts';
import { int16ToBytesBE, toInt16, toUint8 } from './bytes.ts';
import type { UplinkCommand } from './types.ts';

/**
 * Encode an UplinkCommand into the 21-byte packet defined by the
 * "Uplink Packer Design" table:
 *
 *   [0..1]   Header (-1000)        252, 24
 *   [2]      Drone_CMD   uint8
 *   [3..4]   ANG_KP x1000 int16
 *   [5..6]   ANG_KI x1000 int16
 *   [7..8]   ANG_KD x1000 int16
 *   [9..10]  POS_KP x1000 int16
 *   [11..12] POS_KI x1000 int16
 *   [13..14] POS_KD x1000 int16
 *   [15]     POS_ANG_SP x10  uint8
 *   [16]     LAND_SPEED x100 uint8
 *   [17..18] PSI_SP int16
 *   [19..20] Terminator (-2000)   248, 48
 */
export function encodeUplink(cmd: UplinkCommand): Uint8Array {
  const out = new Uint8Array(UPLINK_PACKET_SIZE);
  let i = 0;

  out[i++] = HEADER_BYTES[0];
  out[i++] = HEADER_BYTES[1];

  out[i++] = toUint8(cmd.droneCmd);

  const i16 = (v: number, scale: number) => {
    const [hi, lo] = int16ToBytesBE(toInt16(v * scale));
    out[i++] = hi;
    out[i++] = lo;
  };

  i16(cmd.angKp, SCALE.PID);
  i16(cmd.angKi, SCALE.PID);
  i16(cmd.angKd, SCALE.PID);
  i16(cmd.posKp, SCALE.PID);
  i16(cmd.posKi, SCALE.PID);
  i16(cmd.posKd, SCALE.PID);

  out[i++] = toUint8(cmd.posAngSp * SCALE.POS_ANG_SP);
  out[i++] = toUint8(cmd.landSpeed * SCALE.LAND_SPEED);

  const [psiHi, psiLo] = int16ToBytesBE(toInt16(cmd.psiSp));
  out[i++] = psiHi;
  out[i++] = psiLo;

  out[i++] = TERMINATOR_BYTES[0];
  out[i++] = TERMINATOR_BYTES[1];

  return out;
}

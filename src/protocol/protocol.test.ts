import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeUplink,
  decodeDownlink,
  HEADER_BYTES,
  TERMINATOR_BYTES,
  UPLINK_PACKET_SIZE,
  DOWNLINK_PACKET_SIZE,
  int16ToBytesBE,
  bytesToInt16BE,
  int32ToBytesBE,
  bytesToInt32BE,
  DRONE_CMD,
} from './index.ts';
import type { Telemetry, UplinkCommand } from './types.ts';

/* ------------------------------------------------------------------ *
 * Reference downlink encoder.
 * Mirrors the firmware "Downlink_Packer" so we can validate the decoder
 * round-trips against the documented byte layout (decode(encode(x)) == x).
 * ------------------------------------------------------------------ */
function refEncodeDownlink(t: Telemetry): Uint8Array {
  const out = new Uint8Array(DOWNLINK_PACKET_SIZE);
  let i = 0;
  out[i++] = HEADER_BYTES[0];
  out[i++] = HEADER_BYTES[1];

  const i16 = (v: number, scale: number) => {
    const [hi, lo] = int16ToBytesBE(Math.round(v * scale));
    out[i++] = hi;
    out[i++] = lo;
  };
  const i32 = (v: number, scale: number) => {
    const [b0, b1, b2, b3] = int32ToBytesBE(Math.round(v * scale));
    out[i++] = b0;
    out[i++] = b1;
    out[i++] = b2;
    out[i++] = b3;
  };

  i16(t.pitchCmd, 1000);
  i16(t.rollCmd, 1000);
  i16(t.altitudeCmd, 1000);
  i16(t.posXCmd, 1000);
  i16(t.posYCmd, 1000);
  i16(t.thetaFb, 100);
  i16(t.phiFb, 100);
  i16(t.altitudeFb, 100);
  i16(t.posXFb, 100);
  i16(t.posYFb, 100);
  i16(t.psiFb, 100);
  i32(t.latitude, 1e7);
  i32(t.longitude, 1e7);
  out[i++] = Math.round(t.batteryVoltage * 10) & 0xff;
  out[i++] =
    ((t.satellitesNum & 0x0f) << 4) |
    ((t.posConEn & 0x01) << 3) |
    (t.droneStatus & 0x07);

  out[i++] = TERMINATOR_BYTES[0];
  out[i++] = TERMINATOR_BYTES[1];
  return out;
}

/* ------------------------------ bytes ----------------------------- */

test('int16 round-trips including the frame markers', () => {
  assert.deepEqual(int16ToBytesBE(-1000), [252, 24]); // header
  assert.deepEqual(int16ToBytesBE(-2000), [248, 48]); // terminator
  for (const v of [-32768, -1000, -1, 0, 1, 1000, 32767]) {
    const [hi, lo] = int16ToBytesBE(v);
    assert.equal(bytesToInt16BE(hi, lo), v, `int16 ${v}`);
  }
});

test('int32 round-trips across the signed range', () => {
  for (const v of [-2147483648, -300000000, -1, 0, 1, 300444000, 2147483647]) {
    const [b0, b1, b2, b3] = int32ToBytesBE(v);
    assert.equal(bytesToInt32BE(b0, b1, b2, b3), v, `int32 ${v}`);
  }
});

/* ----------------------------- uplink ----------------------------- */

test('uplink packet is exactly 21 bytes and correctly framed', () => {
  // Bug 3: ARM removed. Using TAKEOFF (2) as a representative command.
  // Bug 4: SCALE.PID = 1, so gains are sent as-is (no x1000 multiplier).
  const cmd: UplinkCommand = {
    droneCmd: DRONE_CMD.TAKEOFF,
    angKp: 50,
    angKi: 10,
    angKd: 5,
    posKp: 20,
    posKi: 1,
    posKd: 0,
    posAngSp: 15,
    landSpeed: 0.5,
    psiSp: 90,
  };
  const pkt = encodeUplink(cmd);
  assert.equal(pkt.length, UPLINK_PACKET_SIZE);
  // header
  assert.equal(pkt[0], 252);
  assert.equal(pkt[1], 24);
  // terminator
  assert.equal(pkt[19], 248);
  assert.equal(pkt[20], 48);
  // Drone_CMD lands in byte 2 — TAKEOFF = 2
  assert.equal(pkt[2], DRONE_CMD.TAKEOFF);
  // ANG_KP = 50 * 1 = 50 -> int16 BE [0, 50]
  assert.deepEqual([pkt[3], pkt[4]], int16ToBytesBE(50));
  // POS_ANG_SP = 15 * 10 = 150 (uint8 byte 15)
  assert.equal(pkt[15], 150);
  // LAND_SPEED = 0.5 * 100 = 50 (uint8 byte 16)
  assert.equal(pkt[16], 50);
});

/* ---------------------------- downlink ---------------------------- */

const sampleTelemetry: Telemetry = {
  pitchCmd: 0.123,
  rollCmd: -0.045,
  altitudeCmd: 25.0,
  posXCmd: 1.5,
  posYCmd: -2.25,
  thetaFb: 3.21,
  phiFb: -1.05,
  altitudeFb: 22.54,
  posXFb: 1.48,
  posYFb: -2.2,
  psiFb: 42.0,
  latitude: 30.0444, // Cairo-ish, northern + eastern hemisphere
  longitude: 31.2357,
  batteryVoltage: 15.2,
  satellitesNum: 9,
  posConEn: 1,
  droneStatus: 3, // In-Air
};

test('downlink decode round-trips a clean frame within scaling tolerance', () => {
  const frame = refEncodeDownlink(sampleTelemetry);
  assert.equal(frame.length, DOWNLINK_PACKET_SIZE);

  const res = decodeDownlink(frame);
  assert.ok(res, 'frame should be found');
  const t = res!.telemetry;

  // /1000 fields: tolerance half an LSB = 0.0005
  assert.ok(Math.abs(t.pitchCmd - sampleTelemetry.pitchCmd) <= 0.0005);
  assert.ok(Math.abs(t.rollCmd - sampleTelemetry.rollCmd) <= 0.0005);
  // /100 fields: tolerance 0.005
  assert.ok(Math.abs(t.thetaFb - sampleTelemetry.thetaFb) <= 0.005);
  assert.ok(Math.abs(t.altitudeFb - sampleTelemetry.altitudeFb) <= 0.005);
  // lat/lon /1e7: tolerance 5e-8
  assert.ok(Math.abs(t.latitude - sampleTelemetry.latitude) <= 5e-8);
  assert.ok(Math.abs(t.longitude - sampleTelemetry.longitude) <= 5e-8);
  // battery /10
  assert.ok(Math.abs(t.batteryVoltage - sampleTelemetry.batteryVoltage) <= 0.05);
  // packed status fields exact
  assert.equal(t.satellitesNum, 9);
  assert.equal(t.posConEn, 1);
  assert.equal(t.droneStatus, 3);
});

test('southern/western hemisphere coordinates keep their sign', () => {
  const south: Telemetry = {
    ...sampleTelemetry,
    latitude: -33.8688,  // Sydney
    longitude: -70.6483, // deliberately negative lon
  };
  const res = decodeDownlink(refEncodeDownlink(south));
  assert.ok(res);
  assert.ok(res!.telemetry.latitude < 0, 'latitude stays negative');
  assert.ok(res!.telemetry.longitude < 0, 'longitude stays negative');
  assert.ok(Math.abs(res!.telemetry.latitude - south.latitude) <= 5e-8);
});

test('frame search locates a packet embedded in surrounding noise', () => {
  const frame = refEncodeDownlink(sampleTelemetry);
  const noisy = new Uint8Array(7 + frame.length + 5);
  noisy.set([1, 2, 252, 9, 248, 0, 99], 0); // junk incl. lone marker bytes
  noisy.set(frame, 7);
  noisy.set([252, 24, 0, 0, 0], 7 + frame.length); // trailing partial

  const res = decodeDownlink(noisy);
  assert.ok(res, 'should still find the embedded frame');
  assert.equal(res!.frameOffset, 7);
  assert.equal(res!.consumed, 7 + DOWNLINK_PACKET_SIZE);
  assert.equal(res!.telemetry.satellitesNum, 9);
});

test('a buffer shorter than one packet yields no frame', () => {
  assert.equal(decodeDownlink(new Uint8Array(10)), null);
});

test('header present but terminator missing is rejected', () => {
  const frame = refEncodeDownlink(sampleTelemetry);
  frame[34] = 0; // corrupt terminator
  assert.equal(decodeDownlink(frame), null);
});
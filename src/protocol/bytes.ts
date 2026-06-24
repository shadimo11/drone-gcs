/**
 * Low-level byte helpers.
 *
 * The Simulink packers split each multi-byte value high-byte-first
 * (Sig1 = ArithShift right by 8/16/24, Sig2.. = mask 0xFF), i.e. BIG-ENDIAN.
 * Bit-Concat on the receive side reassembles in the same high-to-low order.
 * All helpers below are therefore big-endian and use two's-complement for
 * signed values, matching the int16/int32 casts in the model.
 */

/** Encode a signed 16-bit integer to two big-endian bytes. */
export function int16ToBytesBE(value: number): [number, number] {
  const u = value & 0xffff; // wrap to 16-bit two's complement
  return [(u >> 8) & 0xff, u & 0xff];
}

/** Decode two big-endian bytes to a signed 16-bit integer. */
export function bytesToInt16BE(hi: number, lo: number): number {
  const u = ((hi & 0xff) << 8) | (lo & 0xff);
  return u >= 0x8000 ? u - 0x10000 : u;
}

/** Encode a signed 32-bit integer to four big-endian bytes. */
export function int32ToBytesBE(value: number): [number, number, number, number] {
  const u = value >>> 0; // unsigned 32-bit view
  return [(u >>> 24) & 0xff, (u >>> 16) & 0xff, (u >>> 8) & 0xff, u & 0xff];
}

/** Decode four big-endian bytes to a signed 32-bit integer. */
export function bytesToInt32BE(b0: number, b1: number, b2: number, b3: number): number {
  const u =
    (((b0 & 0xff) << 24) | ((b1 & 0xff) << 16) | ((b2 & 0xff) << 8) | (b3 & 0xff)) >>> 0;
  return u >= 0x80000000 ? u - 0x100000000 : u;
}

/** Round to nearest integer and clamp into a signed 16-bit range. */
export function toInt16(value: number): number {
  const r = Math.round(value);
  if (r > 32767) return 32767;
  if (r < -32768) return -32768;
  return r;
}

/** Round to nearest integer and clamp into a signed 32-bit range. */
export function toInt32(value: number): number {
  const r = Math.round(value);
  if (r > 2147483647) return 2147483647;
  if (r < -2147483648) return -2147483648;
  return r;
}

/** Round to nearest integer and clamp into an unsigned 8-bit range. */
export function toUint8(value: number): number {
  const r = Math.round(value);
  if (r > 255) return 255;
  if (r < 0) return 0;
  return r;
}

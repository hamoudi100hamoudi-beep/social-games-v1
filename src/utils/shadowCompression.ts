/**
 * 🧪 Shadow Compression & Real Lossless Codec for Canonical Geometry Pipeline
 * 
 * High-performance, deterministic, zero-float integer Codec:
 *   Canonical Integer Coordinates
 *   → Delta Encoding
 *   → ZigZag Encoding
 *   → VarInt (LEB128)
 *   → Uint8Array
 * 
 * Round-Trip:
 *   Uint8Array
 *   → VarInt Decode
 *   → ZigZag Decode
 *   → Delta Reconstruction
 *   → 100% Exact Integer Coordinates
 * 
 * Invariants:
 *   - ZERO floating-point operations inside the codec.
 *   - Exact integer equality for all coordinates (qx, qy).
 *   - No network protocol changes; experimental measurement & verification only.
 */

export interface CanonicalIntPoint {
  qx: number;
  qy: number;
}

/**
 * Standard ZigZag encoding for 32-bit signed integers.
 * Maps signed numbers to unsigned integers:
 *   0 -> 0, -1 -> 1, 1 -> 2, -2 -> 3, 2 -> 4 ...
 */
export function encodeZigZag(n: number): number {
  return ((n << 1) ^ (n >> 31)) >>> 0;
}

/**
 * Standard ZigZag decoding for 32-bit unsigned integers back to signed.
 */
export function decodeZigZag(z: number): number {
  return (z >>> 1) ^ -(z & 1);
}

/**
 * Calculates byte length for an unsigned 32-bit integer in VarInt (LEB128).
 * 0..127: 1 byte
 * 128..16383: 2 bytes
 * 16384..2097151: 3 bytes
 * 2097152..268435455: 4 bytes
 * 268435456+: 5 bytes
 */
export function getVarIntLength(val: number): number {
  let v = val >>> 0;
  let bytes = 0;
  do {
    bytes++;
    v >>>= 7;
  } while (v > 0);
  return bytes;
}

/**
 * Writes an unsigned 32-bit integer as a VarInt (LEB128) into a byte array.
 */
export function writeVarInt(out: number[], val: number): void {
  let v = val >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v & 0x7f);
}

/**
 * Reads an unsigned 32-bit integer VarInt (LEB128) from a Uint8Array at cursor offset.
 */
export function readVarInt(bytes: Uint8Array, cursor: { offset: number }): number {
  let result = 0;
  let shift = 0;
  while (cursor.offset < bytes.length) {
    const b = bytes[cursor.offset++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) {
      return result >>> 0;
    }
    shift += 7;
    if (shift > 35) {
      throw new Error('VarInt overflow');
    }
  }
  throw new Error('Unexpected end of VarInt buffer');
}

/**
 * Converts Canonical Point Stream to protocol-standard integer representation:
 *   qx = round(normX * 10000)
 *   qy = round(normY * 10000)
 */
export function toCanonicalIntPoints(
  points: { x: number; y: number }[],
  logicalWidth: number,
  logicalHeight: number,
  isAlreadyNormalized: boolean = false
): CanonicalIntPoint[] {
  const len = points.length;
  const result: CanonicalIntPoint[] = new Array(len);
  for (let i = 0; i < len; i++) {
    const pt = points[i];
    const normX = isAlreadyNormalized ? pt.x : pt.x / logicalWidth;
    const normY = isAlreadyNormalized ? pt.y : pt.y / logicalHeight;
    result[i] = {
      qx: Math.round(normX * 10000),
      qy: Math.round(normY * 10000)
    };
  }
  return result;
}

/**
 * 📦 Real Binary Encoder:
 * Canonical Integer Coordinates → Delta → ZigZag → VarInt → Uint8Array
 */
export function encodeCanonicalDeltaVarint(points: CanonicalIntPoint[]): Uint8Array {
  const count = points.length;
  if (count === 0) {
    return new Uint8Array(0);
  }

  const out: number[] = [];
  let prevQx = 0;
  let prevQy = 0;

  for (let i = 0; i < count; i++) {
    const pt = points[i];
    const qx = pt.qx | 0;
    const qy = pt.qy | 0;

    if (i === 0) {
      // First point is absolute
      writeVarInt(out, encodeZigZag(qx));
      writeVarInt(out, encodeZigZag(qy));
      prevQx = qx;
      prevQy = qy;
    } else {
      // Subsequent points are deltas relative to previous quantized integer
      const deltaX = (qx - prevQx) | 0;
      const deltaY = (qy - prevQy) | 0;
      prevQx = qx;
      prevQy = qy;

      writeVarInt(out, encodeZigZag(deltaX));
      writeVarInt(out, encodeZigZag(deltaY));
    }
  }

  return new Uint8Array(out);
}

/**
 * 🔓 Real Binary Decoder:
 * Uint8Array → VarInt → ZigZag → Delta Reconstruction → Canonical Integer Coordinates
 */
export function decodeCanonicalDeltaVarint(bytes: Uint8Array): CanonicalIntPoint[] {
  if (!bytes || bytes.length === 0) {
    return [];
  }

  const decoded: CanonicalIntPoint[] = [];
  const cursor = { offset: 0 };
  let isFirst = true;
  let prevQx = 0;
  let prevQy = 0;

  while (cursor.offset < bytes.length) {
    const zzX = readVarInt(bytes, cursor);
    const zzY = readVarInt(bytes, cursor);
    const valX = decodeZigZag(zzX);
    const valY = decodeZigZag(zzY);

    if (isFirst) {
      prevQx = valX;
      prevQy = valY;
      decoded.push({ qx: prevQx, qy: prevQy });
      isFirst = false;
    } else {
      prevQx = (prevQx + valX) | 0;
      prevQy = (prevQy + valY) | 0;
      decoded.push({ qx: prevQx, qy: prevQy });
    }
  }

  return decoded;
}

export interface ShadowCompressionResult {
  pointsCount: number;
  currentWireBytes: number;
  shadowBytes: number;
  savedBytes: number;
  compressionPercent: number;
  wireBytesPerPoint: number;
  shadowBytesPerPoint: number;
}

export interface CodecValidationResult {
  pass: boolean;
  pointCountMatch: boolean;
  exactCoordinatesMatch: boolean;
  originalPointsCount: number;
  decodedPointsCount: number;
  actualEncodedBytes: number;
  estimatedCoordinateBytes: number;
  codecEstimatedDiff: number;
  currentWireBytes: number;
  actualTotalBytes: number;
  savedBytes: number;
  compressionPercent: number;
  wireBytesPerPoint: number;
  actualBytesPerPoint: number;
  encodedPayload: Uint8Array;
}

export interface ShadowCompressionMetrics {
  lastPoints: number;
  lastWireBytes: number;
  lastShadowBytes: number;
  lastSavedBytes: number;
  lastCompressionPercent: number;
  lastWireBpt: number;
  lastShadowBpt: number;

  // Real Codec Round-Trip Verification Metrics
  lastActualEncodedBytes: number;
  lastDecodedPoints: number;
  lastRoundTripPass: boolean;
  lastCodecDiff: number;

  totalPoints: number;
  totalWireBytes: number;
  totalShadowBytes: number;
  totalActualEncodedBytes: number;
  totalSavedBytes: number;
  totalCompressionPercent: number;
  totalWireBpt: number;
  totalShadowBpt: number;
  totalRoundTripPass: boolean;
}

export const INITIAL_SHADOW_METRICS: ShadowCompressionMetrics = {
  lastPoints: 0,
  lastWireBytes: 0,
  lastShadowBytes: 0,
  lastSavedBytes: 0,
  lastCompressionPercent: 0,
  lastWireBpt: 0,
  lastShadowBpt: 0,

  lastActualEncodedBytes: 0,
  lastDecodedPoints: 0,
  lastRoundTripPass: true,
  lastCodecDiff: 0,

  totalPoints: 0,
  totalWireBytes: 0,
  totalShadowBytes: 0,
  totalActualEncodedBytes: 0,
  totalSavedBytes: 0,
  totalCompressionPercent: 0,
  totalWireBpt: 0,
  totalShadowBpt: 0,
  totalRoundTripPass: true,
};

/**
 * Evaluates Shadow Compression (Estimated calculation).
 */
export function evaluateShadowCompression(
  points: { x: number; y: number }[],
  logicalWidth: number,
  logicalHeight: number,
  isAlreadyNormalized: boolean = false,
  actualWireBytes: number = 0,
  batchCount: number = 1
): ShadowCompressionResult {
  const pointsCount = points.length;
  if (pointsCount === 0) {
    return {
      pointsCount: 0,
      currentWireBytes: 0,
      shadowBytes: 0,
      savedBytes: 0,
      compressionPercent: 0,
      wireBytesPerPoint: 0,
      shadowBytesPerPoint: 0
    };
  }

  // Batch header overhead (10 bytes per draw_move packet: 1 byte type + 7 bytes instanceId + 2 bytes count)
  const headerOverhead = Math.max(1, batchCount) * 10;

  let shadowCoordinateBytes = 0;
  let prevQx = 0;
  let prevQy = 0;

  for (let i = 0; i < pointsCount; i++) {
    const pt = points[i];
    const normX = isAlreadyNormalized ? pt.x : pt.x / logicalWidth;
    const normY = isAlreadyNormalized ? pt.y : pt.y / logicalHeight;

    const qx = Math.round(normX * 10000);
    const qy = Math.round(normY * 10000);

    if (i === 0) {
      const zzX = encodeZigZag(qx);
      const zzY = encodeZigZag(qy);
      shadowCoordinateBytes += getVarIntLength(zzX) + getVarIntLength(zzY);
      prevQx = qx;
      prevQy = qy;
    } else {
      const deltaX = qx - prevQx;
      const deltaY = qy - prevQy;
      prevQx = qx;
      prevQy = qy;

      const zzX = encodeZigZag(deltaX);
      const zzY = encodeZigZag(deltaY);
      shadowCoordinateBytes += getVarIntLength(zzX) + getVarIntLength(zzY);
    }
  }

  const currentWireBytes = actualWireBytes > 0
    ? actualWireBytes
    : (headerOverhead + pointsCount * 4);

  const shadowBytes = headerOverhead + shadowCoordinateBytes;
  const savedBytes = Math.max(0, currentWireBytes - shadowBytes);
  const compressionPercent = currentWireBytes > 0
    ? (savedBytes / currentWireBytes) * 100
    : 0;

  const wireBytesPerPoint = pointsCount > 0 ? currentWireBytes / pointsCount : 0;
  const shadowBytesPerPoint = pointsCount > 0 ? shadowBytes / pointsCount : 0;

  return {
    pointsCount,
    currentWireBytes,
    shadowBytes,
    savedBytes,
    compressionPercent,
    wireBytesPerPoint,
    shadowBytesPerPoint
  };
}

/**
 * 🔬 Real Codec Validation:
 * Takes Canonical Point Stream → Encodes to Uint8Array → Decodes → Verifies 100% Lossless Match
 */
export function validateCanonicalCodec(
  points: { x: number; y: number }[],
  logicalWidth: number,
  logicalHeight: number,
  isAlreadyNormalized: boolean = false,
  actualWireBytes: number = 0,
  batchCount: number = 1
): CodecValidationResult {
  const pointsCount = points.length;
  if (pointsCount === 0) {
    return {
      pass: true,
      pointCountMatch: true,
      exactCoordinatesMatch: true,
      originalPointsCount: 0,
      decodedPointsCount: 0,
      actualEncodedBytes: 0,
      estimatedCoordinateBytes: 0,
      codecEstimatedDiff: 0,
      currentWireBytes: 0,
      actualTotalBytes: 0,
      savedBytes: 0,
      compressionPercent: 0,
      wireBytesPerPoint: 0,
      actualBytesPerPoint: 0,
      encodedPayload: new Uint8Array(0)
    };
  }

  // 1. Convert to Canonical Integer Coordinates
  const originalIntPoints = toCanonicalIntPoints(points, logicalWidth, logicalHeight, isAlreadyNormalized);

  // 2. Real Binary Encoding
  const encodedPayload = encodeCanonicalDeltaVarint(originalIntPoints);
  const actualEncodedBytes = encodedPayload.byteLength;

  // 3. Real Binary Decoding
  const decodedIntPoints = decodeCanonicalDeltaVarint(encodedPayload);
  const decodedPointsCount = decodedIntPoints.length;

  // 4. Exact Integer Equality Validation (Zero Tolerance)
  const pointCountMatch = originalIntPoints.length === decodedPointsCount;
  let exactCoordinatesMatch = pointCountMatch;

  if (pointCountMatch) {
    for (let i = 0; i < pointsCount; i++) {
      if (originalIntPoints[i].qx !== decodedIntPoints[i].qx ||
          originalIntPoints[i].qy !== decodedIntPoints[i].qy) {
        exactCoordinatesMatch = false;
        break;
      }
    }
  }

  const pass = pointCountMatch && exactCoordinatesMatch;

  // 5. Compare Real Codec Bytes against Shadow Estimate
  const shadowEstimate = evaluateShadowCompression(
    points,
    logicalWidth,
    logicalHeight,
    isAlreadyNormalized,
    actualWireBytes,
    batchCount
  );

  const headerOverhead = Math.max(1, batchCount) * 10;
  const estimatedCoordinateBytes = Math.max(0, shadowEstimate.shadowBytes - headerOverhead);
  const codecEstimatedDiff = actualEncodedBytes - estimatedCoordinateBytes;

  const currentWireBytes = shadowEstimate.currentWireBytes;
  const actualTotalBytes = headerOverhead + actualEncodedBytes;
  const savedBytes = Math.max(0, currentWireBytes - actualTotalBytes);
  const compressionPercent = currentWireBytes > 0 ? (savedBytes / currentWireBytes) * 100 : 0;
  const wireBytesPerPoint = pointsCount > 0 ? currentWireBytes / pointsCount : 0;
  const actualBytesPerPoint = pointsCount > 0 ? actualTotalBytes / pointsCount : 0;

  return {
    pass,
    pointCountMatch,
    exactCoordinatesMatch,
    originalPointsCount: pointsCount,
    decodedPointsCount,
    actualEncodedBytes,
    estimatedCoordinateBytes,
    codecEstimatedDiff,
    currentWireBytes,
    actualTotalBytes,
    savedBytes,
    compressionPercent,
    wireBytesPerPoint,
    actualBytesPerPoint,
    encodedPayload
  };
}

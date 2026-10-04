/**
 * 🧪 Shadow Compression Utility for Canonical Geometry Pipeline
 * 
 * Measurement-only shadow compressor for A/B testing data savings.
 * Operates on the exact canonical integer coordinate stream:
 *   qx = round(normX * 10000)
 *   qy = round(normY * 10000)
 * 
 * Pipeline:
 *   Canonical Geometry In
 *   → Absolute Point 0 (ZigZag + VarInt)
 *   → Delta Encoding for points 1..N (deltaX = qx - prevQx, deltaY = qy - prevQy)
 *   → ZigZag encoding for signed integers
 *   → VarInt (LEB128) variable-length byte representation
 * 
 * ZERO float operations in compressor.
 * ZERO modifications to active wire protocol or server data.
 */

/**
 * Standard ZigZag encoding for 32-bit signed integers.
 * Maps signed numbers to unsigned integers:
 *   0 -> 0, -1 -> 1, 1 -> 2, -2 -> 3, 2 -> 4 ...
 */
export function encodeZigZag(n: number): number {
  return ((n << 1) ^ (n >> 31)) >>> 0;
}

/**
 * ZigZag decoding to verify 100% lossless round-trip.
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

export interface ShadowCompressionResult {
  pointsCount: number;
  currentWireBytes: number;
  shadowBytes: number;
  savedBytes: number;
  compressionPercent: number;
  wireBytesPerPoint: number;
  shadowBytesPerPoint: number;
}

export interface ShadowCompressionMetrics {
  lastPoints: number;
  lastWireBytes: number;
  lastShadowBytes: number;
  lastSavedBytes: number;
  lastCompressionPercent: number;
  lastWireBpt: number;
  lastShadowBpt: number;

  totalPoints: number;
  totalWireBytes: number;
  totalShadowBytes: number;
  totalSavedBytes: number;
  totalCompressionPercent: number;
  totalWireBpt: number;
  totalShadowBpt: number;
}

export const INITIAL_SHADOW_METRICS: ShadowCompressionMetrics = {
  lastPoints: 0,
  lastWireBytes: 0,
  lastShadowBytes: 0,
  lastSavedBytes: 0,
  lastCompressionPercent: 0,
  lastWireBpt: 0,
  lastShadowBpt: 0,

  totalPoints: 0,
  totalWireBytes: 0,
  totalShadowBytes: 0,
  totalSavedBytes: 0,
  totalCompressionPercent: 0,
  totalWireBpt: 0,
  totalShadowBpt: 0,
};

/**
 * Evaluates Shadow Compression for a stroke of Canonical Points.
 * 
 * @param points Array of canonical points (either logical px {x,y} or normalized [0..1] {normX, normY} or {x, y})
 * @param logicalWidth Canvas logical width (used if points are logical px)
 * @param logicalHeight Canvas logical height (used if points are logical px)
 * @param isAlreadyNormalized Whether points already have coordinates in [0..1]
 * @param actualWireBytes Actual wire bytes emitted by the stroke if recorded, or 0
 * @param batchCount Number of draw_move batches emitted for this stroke
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

    // Protocol integer coordinate quantization: round(normalized * 10000)
    const qx = Math.round(normX * 10000);
    const qy = Math.round(normY * 10000);

    if (i === 0) {
      // First point: absolute integer coordinate
      const zzX = encodeZigZag(qx);
      const zzY = encodeZigZag(qy);
      shadowCoordinateBytes += getVarIntLength(zzX) + getVarIntLength(zzY);
      prevQx = qx;
      prevQy = qy;
    } else {
      // Subsequent points: delta encoding relative to previous quantized integer
      const deltaX = qx - prevQx;
      const deltaY = qy - prevQy;
      prevQx = qx;
      prevQy = qy;

      const zzX = encodeZigZag(deltaX);
      const zzY = encodeZigZag(deltaY);
      shadowCoordinateBytes += getVarIntLength(zzX) + getVarIntLength(zzY);
    }
  }

  // Current wire size: if actual wire bytes captured from socket/encoder, use them;
  // otherwise fallback to protocol standard: headerOverhead + 4 bytes per point (int16 X + int16 Y)
  const currentWireBytes = actualWireBytes > 0
    ? actualWireBytes
    : (headerOverhead + pointsCount * 4);

  // Shadow compressed size: same batch header overhead + shadow delta/varint coordinate bytes
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

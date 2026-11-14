export function decodeZigZag(z: number): number {
  return (z >>> 1) ^ -(z & 1);
}

export function readVarIntFromBuffer(buf: Buffer, cursor: { offset: number }): number {
  let result = 0;
  let shift = 0;
  while (cursor.offset < buf.length) {
    const b = buf[cursor.offset++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) {
      return result >>> 0;
    }
    shift += 7;
    if (shift > 28) throw new Error("VarInt overflow");
  }
  throw new Error("Unexpected end of VarInt buffer");
}

export function decodeType13BufferSafely(buf: Buffer): {
  success: boolean;
  instId?: string;
  count?: number;
  points?: { x: number; y: number }[];
  error?: string;
} {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 10) {
    return { success: false, error: 'header_too_small' };
  }
  if (buf[0] !== 13) {
    return { success: false, error: 'invalid_type' };
  }

  let instId = "";
  for (let i = 0; i < 7; i++) {
    const code = buf[1 + i];
    if (code > 0) instId += String.fromCharCode(code);
  }
  if (!instId) {
    return { success: false, error: 'invalid_inst_id' };
  }

  const count = buf.readUInt16LE(8);
  if (count > 3000) {
    return { success: false, error: 'count_exceeds_max' };
  }

  if (count === 0) {
    if (buf.length !== 10) {
      return { success: false, error: 'unexpected_trailing_bytes' };
    }
    return { success: true, instId, count: 0, points: [] };
  }

  const tempPoints: { x: number; y: number }[] = [];
  const cursor = { offset: 10 };
  let prevQx = 0;
  let prevQy = 0;

  try {
    for (let i = 0; i < count; i++) {
      if (cursor.offset >= buf.length) {
        return { success: false, error: 'truncated_payload' };
      }
      const zzX = readVarIntFromBuffer(buf, cursor);
      const zzY = readVarIntFromBuffer(buf, cursor);
      const valX = decodeZigZag(zzX);
      const valY = decodeZigZag(zzY);

      if (i === 0) {
        prevQx = valX;
        prevQy = valY;
      } else {
        prevQx = (prevQx + valX) | 0;
        prevQy = (prevQy + valY) | 0;
      }

      // Bounds validation: ensure coordinates fit in Int16 (-32768 to 32767)
      if (prevQx < -32768 || prevQx > 32767 || prevQy < -32768 || prevQy > 32767) {
        return { success: false, error: 'coordinates_out_of_bounds' };
      }

      tempPoints.push({ x: prevQx, y: prevQy });
    }

    if (tempPoints.length !== count) {
      return { success: false, error: 'point_count_mismatch' };
    }

    // Strict payload end check: no unexpected trailing bytes
    if (cursor.offset !== buf.length) {
      return { success: false, error: 'unexpected_trailing_bytes' };
    }

    return { success: true, instId, count, points: tempPoints };
  } catch (err: any) {
    return { success: false, error: err?.message || 'malformed_payload' };
  }
}

export function createType2Buffer(instId: string, points: { x: number; y: number }[]): Buffer {
  const count = points.length;
  const buf = Buffer.alloc(10 + count * 4);
  buf.writeUInt8(2, 0); // MSG_DRAW_MOVE = 2
  buf.write(instId.padEnd(7, "\0").slice(0, 7), 1, 7, "ascii");
  buf.writeUInt16LE(count & 0xFFFF, 8);
  for (let i = 0; i < count; i++) {
    buf.writeInt16LE(points[i].x, 10 + i * 4);
    buf.writeInt16LE(points[i].y, 12 + i * 4);
  }
  return buf;
}

export function createType1Buffer(
  instId: string,
  tool: number,
  r: number,
  g: number,
  b: number,
  width: number,
  opacity: number,
  p0_x: number,
  p0_y: number
): Buffer {
  const buf = Buffer.alloc(18);
  buf.writeUInt8(1, 0); // MSG_DRAW_START = 1
  buf.write((instId || '').padEnd(7, "\0").slice(0, 7), 1, 7, "ascii");
  buf.writeUInt8(tool & 0xFF, 8);
  buf.writeUInt8(r & 0xFF, 9);
  buf.writeUInt8(g & 0xFF, 10);
  buf.writeUInt8(b & 0xFF, 11);
  buf.writeUInt8(width & 0xFF, 12);
  buf.writeUInt8(opacity & 0xFF, 13);
  buf.writeInt16LE(p0_x, 14);
  buf.writeInt16LE(p0_y, 16);
  return buf;
}

/**
 * Validates the 7-byte ASCII instanceId slot (bytes 1..7) without heap allocations.
 * Accepts 1..7 characters from [a-zA-Z0-9_-] followed strictly by 0x00 padding.
 * Rejects control/non-ASCII characters and non-zero bytes appearing after 0x00 padding.
 * When `allowEmpty` is true (Type 5 draw_clear compatibility), an all-zero 7-byte slot is allowed.
 */
export function isValidInstIdBytes(buf: Buffer, allowEmpty: boolean = false): boolean {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return false;
  let seenZero = false;
  let hasChar = false;
  for (let i = 1; i <= 7; i++) {
    const b = buf[i];
    if (b === 0) {
      seenZero = true;
    } else {
      if (seenZero) return false;
      const isAllowed =
        (b >= 48 && b <= 57) || // 0-9
        (b >= 65 && b <= 90) || // A-Z
        (b >= 97 && b <= 122) || // a-z
        b === 95 || // _
        b === 45; // -
      if (!isAllowed) return false;
      hasChar = true;
    }
  }
  return hasChar || allowEmpty;
}

/**
 * Validates and extracts the 7-byte ASCII instanceId (bytes 1..7).
 * Returns null if malformed or empty when `allowEmpty` is false.
 */
export function extractValidatedInstId(buf: Buffer, allowEmpty: boolean = false): string | null {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return null;
  let seenZero = false;
  let len = 0;
  for (let i = 1; i <= 7; i++) {
    const b = buf[i];
    if (b === 0) {
      seenZero = true;
    } else {
      if (seenZero) return null;
      const isAllowed =
        (b >= 48 && b <= 57) ||
        (b >= 65 && b <= 90) ||
        (b >= 97 && b <= 122) ||
        b === 95 ||
        b === 45;
      if (!isAllowed) return null;
      len++;
    }
  }
  if (len === 0) {
    return allowEmpty ? "" : null;
  }
  return buf.toString("ascii", 1, 1 + len);
}

/**
 * Allowed tool indices for Type 1 (DRAW_START) and Type 3 (DRAW_END):
 * {0: pencil, 1: eraser, 3: line, 4: strokeRect, 5: fillRect, 6: strokeCircle, 7: fillCircle}.
 * Rejects bucket (2), pipette (8), and out-of-range indices (>= 9).
 */
export function isAllowedStartOrEndTool(tool: number): boolean {
  return tool <= 7 && tool !== 2;
}

/**
 * Validates Type 9 (DRAW_STROKE) binary packet header, length, tool, and mode rules in O(1):
 * - Header: >= 16 bytes, type === 9, valid non-empty ASCII instId, tool in {0, 1, 3, 4, 5, 6, 7}.
 * - Point count: readUInt16LE(14) >= 1; if shape tool (>= 3), exact pointsLength === 2.
 * - Mode & strokeId length:
 *   - Canonical pipeline (Free Draw / Experimental): pointsLength <= 3000 and exact 2-byte strokeId trailer (16 + N * 4 + 2).
 *   - Normal / Competitive: pointsLength in 1..65535; shape requires 26 bytes (with strokeId),
 *     continuous {0, 1} allows optional strokeId (16 + N * 4 or 16 + N * 4 + 2).
 */
export function isValidType9Packet(buf: Buffer, useCanonicalPipeline: boolean): boolean {
  if (!Buffer.isBuffer(buf) || buf.length < 16 || buf[0] !== 9) return false;
  if (!isValidInstIdBytes(buf, false)) return false;

  const tool = buf[8];
  if (!isAllowedStartOrEndTool(tool)) return false;

  const pointsLength = buf.readUInt16LE(14);
  if (pointsLength === 0) return false;

  const isShape = tool >= 3;
  if (isShape && pointsLength !== 2) return false;

  const bodyEnd = 16 + pointsLength * 4;
  if (useCanonicalPipeline) {
    if (pointsLength > 3000) return false;
    return buf.length === bodyEnd + 2;
  }

  if (isShape) {
    return buf.length === bodyEnd + 2;
  }

  return buf.length === bodyEnd || buf.length === bodyEnd + 2;
}

/**
 * Validates Type 4 (DRAW_ACTION / bucket fill) binary packet in O(1):
 * - Length must be one of the 4 verified layouts: 17, 19, 21, or 23 bytes
 *   (17: base; 19: +strokeId; 21: +targetRGBA; 23: +targetRGBA+strokeId).
 * - Byte 0 === 4, valid non-empty ASCII instId, tool === 2 ('bucket'),
 *   opacity <= 100, and normalized UInt16LE x/y coordinates <= 10000.
 */
export function isValidType4Packet(buf: Buffer): boolean {
  if (!Buffer.isBuffer(buf) || buf[0] !== 4) return false;
  const len = buf.length;
  if (len !== 17 && len !== 19 && len !== 21 && len !== 23) return false;
  if (!isValidInstIdBytes(buf, false)) return false;
  if (buf[8] !== 2) return false;
  if (buf[12] > 100) return false;
  const x = buf.readUInt16LE(13);
  const y = buf.readUInt16LE(15);
  if (x > 10000 || y > 10000) return false;
  return true;
}


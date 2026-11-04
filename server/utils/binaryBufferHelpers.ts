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

import type { Room } from "../src/types/game.js";
import { decodeType13BufferSafely } from "./utils/binaryBufferHelpers.js";

export type RecordCommandCallback = (
  roomId: string,
  event: string,
  data: any,
  customInstId?: string,
  customStrokeId?: number
) => void;

export type MoveResult = boolean | { abort: true; instId: string };

export type MoveCompressedResult = {
  success: boolean;
  shouldAbort?: boolean;
  instId?: string;
  points?: { x: number; y: number }[];
};

export type CommitResult =
  | { committed: true; strokeId: number; pointCount: number; instId: string; shouldAbort?: false }
  | { committed: false; shouldAbort: true; instId: string; strokeId: number }
  | null;

/**
 * Returns or initializes the in-memory active strokes map for the given room.
 */
export function getOrCreateFreeDrawStrokes(room: Room): Map<string, any> {
  if (!room.freeDrawStrokes) {
    room.freeDrawStrokes = new Map();
  }
  return room.freeDrawStrokes;
}

/**
 * Returns or initializes the canonical stroke cache map for the given room.
 */
export function getOrCreateFreeDrawCanonicalCache(
  room: Room
): Map<string, { buffer: Buffer; createdAt: number }> {
  if (!room.freeDrawCanonicalCache) {
    room.freeDrawCanonicalCache = new Map();
  }
  return room.freeDrawCanonicalCache;
}

/**
 * Handles the start of a continuous stroke in Free Draw or Experimental mode.
 * Stores stroke metadata and initial point p0 in room.freeDrawStrokes.
 */
export function handleFreeDrawStart(room: Room, socketId: string, buf: Buffer): boolean {
  if (!room || (!room.isFreeDraw && !room.isExperimental) || !Buffer.isBuffer(buf) || buf.length < 18) return false;
  if (buf[0] !== 1) return false; // MSG_DRAW_START

  // Header layout:
  // 0: type (1)
  // 1..7: instId (7B)
  // 8: tool (1B)
  // 9: r, 10: g, 11: b (3B)
  // 12: width (1B)
  // 13: opacity (1B)
  // 14..15: p0_x (2B Int16 LE)
  // 16..17: p0_y (2B Int16 LE)

  let instId = "";
  for (let i = 0; i < 7; i++) {
    const code = buf[1 + i];
    if (code > 0) instId += String.fromCharCode(code);
  }
  const tool = buf[8];
  const r = buf[9];
  const g = buf[10];
  const b = buf[11];
  const width = buf[12];
  const opacity = buf[13];
  const p0_x = buf.readInt16LE(14);
  const p0_y = buf.readInt16LE(16);

  const strokes = getOrCreateFreeDrawStrokes(room);
  const key = `${socketId}_${instId}`;

  // If an existing stroke was hanging for this key, abort it
  if (strokes.has(key)) {
    strokes.delete(key);
  }

  strokes.set(key, {
    socketId,
    instId,
    tool,
    r,
    g,
    b,
    width,
    opacity,
    points: [{ x: p0_x, y: p0_y }],
    receivedPointCount: 1, // Includes p0
    createdAt: Date.now(),
    status: 'ACTIVE'
  });

  return true;
}

/**
 * Handles uncompressed Type 2 movement points for an active stroke.
 * Returns true/false without allocation for normal acceptance/rejection,
 * or an abort descriptor if lifetime or point limits are exceeded.
 */
export function handleFreeDrawMove(room: Room, socketId: string, buf: Buffer): MoveResult {
  if (!room || (!room.isFreeDraw && !room.isExperimental) || !Buffer.isBuffer(buf) || buf.length < 10) return false;
  if (buf[0] !== 2) return false; // MSG_DRAW_MOVE

  let instId = "";
  for (let i = 0; i < 7; i++) {
    const code = buf[1 + i];
    if (code > 0) instId += String.fromCharCode(code);
  }

  const strokes = getOrCreateFreeDrawStrokes(room);
  const key = `${socketId}_${instId}`;
  const stroke = strokes.get(key);
  if (!stroke || stroke.status !== 'ACTIVE') return false;

  // Safety check 1: Hard absolute duration limit (60s)
  if (Date.now() - stroke.createdAt > 60000) {
    console.warn(`[FreeDraw Server] Stroke exceeded 60s hard lifetime limit. Aborting: ${key}`);
    return { abort: true, instId };
  }

  const count = buf.readUInt16LE(8);
  const expectedByteLen = 10 + count * 4;
  if (buf.length < expectedByteLen) return false;

  // Safety check 2: Buffer point limit (3,000 points)
  if (stroke.points.length + count > 3000) {
    console.warn(`[FreeDraw Server] Stroke exceeded 3000 point limit. Aborting: ${key}`);
    return { abort: true, instId };
  }

  for (let i = 0; i < count; i++) {
    const px = buf.readInt16LE(10 + i * 4);
    const py = buf.readInt16LE(12 + i * 4);
    stroke.points.push({ x: px, y: py });
  }
  stroke.receivedPointCount = stroke.points.length;

  return true;
}

/**
 * Handles compressed Type 13 delta movement points for an active stroke.
 * Performs atomic decoding and appends points only after full validation.
 */
export function handleFreeDrawMoveCompressed(
  room: Room,
  socketId: string,
  buf: Buffer
): MoveCompressedResult {
  if (!room || (!room.isFreeDraw && !room.isExperimental)) return { success: false };

  // 1. Strict Payload Validation & Temporary Local Decode
  const decoded = decodeType13BufferSafely(buf);
  if (!decoded.success || !decoded.points || !decoded.instId) {
    return { success: false };
  }

  const instId = decoded.instId;
  const strokes = getOrCreateFreeDrawStrokes(room);
  const key = `${socketId}_${instId}`;
  const stroke = strokes.get(key);
  if (!stroke || stroke.status !== 'ACTIVE') return { success: false };

  // Safety check 1: Hard absolute duration limit (60s)
  if (Date.now() - stroke.createdAt > 60000) {
    console.warn(`[FreeDraw Server] Stroke exceeded 60s hard lifetime limit. Aborting: ${key}`);
    return { success: false, shouldAbort: true, instId };
  }

  // Safety check 2: Buffer point limit (3,000 points)
  if (stroke.points.length + decoded.points.length > 3000) {
    console.warn(`[FreeDraw Server] Stroke exceeded 3000 point limit. Aborting: ${key}`);
    return { success: false, shouldAbort: true, instId };
  }

  // 2. ATOMIC COMMIT: Append points to stroke.points ONLY after complete verification
  for (let i = 0; i < decoded.points.length; i++) {
    stroke.points.push(decoded.points[i]);
  }
  stroke.receivedPointCount = stroke.points.length;

  return { success: true, instId, points: decoded.points };
}

/**
 * Handles stroke completion (Type 3). Constructs the authoritative canonical Type 9 buffer,
 * records Type 9 and Type 3 into history through recordCommandFacade, caches Type 9, and cleans up active stroke.
 */
export function handleFreeDrawEnd(
  room: Room,
  socketId: string,
  buf: Buffer,
  recordCommandFacade: RecordCommandCallback
): CommitResult {
  if (!room || (!room.isFreeDraw && !room.isExperimental) || !Buffer.isBuffer(buf) || buf.length < 8) return null;
  if (buf[0] !== 3) return null; // MSG_DRAW_END

  let instId = "";
  for (let i = 0; i < 7; i++) {
    const code = buf[1 + i];
    if (code > 0) instId += String.fromCharCode(code);
  }

  const strokes = getOrCreateFreeDrawStrokes(room);
  const key = `${socketId}_${instId}`;
  const stroke = strokes.get(key);

  if (!stroke || stroke.status !== 'ACTIVE') {
    return null;
  }

  let strokeId = 0;
  if (buf.length >= 27) {
    strokeId = buf.readUInt16LE(23);
  }

  const isCancelled = buf.length >= 23 && buf[22] === 1;
  if (isCancelled) {
    return { committed: false, shouldAbort: true, instId, strokeId };
  }

  // Check lifetime limit
  if (Date.now() - stroke.createdAt > 60000) {
    console.warn(`[FreeDraw Server] Stroke exceeded lifetime on draw_end. Aborting: ${key}`);
    return { committed: false, shouldAbort: true, instId, strokeId };
  }

  // Canonical Server Data Rule: "The points actually received by the server"
  const pts = stroke.points;
  const pointsLength = pts.length;

  // Construct Canonical Binary Type 9 Stroke Buffer (byte-for-byte identical to client Type 9)
  // 0: Type 9 (1B)
  // 1..7: instId (7B ascii)
  // 8: tool (1B)
  // 9: r, 10: g, 11: b (3B)
  // 12: width (1B)
  // 13: opacity (1B)
  // 14..15: pointsLength (2B Uint16LE)
  // 16..: Int16LE pairs (each 4B)
  // 16 + pointsLength * 4..: strokeId (2B Uint16LE)
  const type9Buf = Buffer.alloc(16 + pointsLength * 4 + 2);
  type9Buf.writeUInt8(9, 0); // MSG_DRAW_STROKE = 9
  type9Buf.write(instId.padEnd(7, "\0").slice(0, 7), 1, 7, "ascii");
  type9Buf.writeUInt8(stroke.tool, 8);
  type9Buf.writeUInt8(stroke.r, 9);
  type9Buf.writeUInt8(stroke.g, 10);
  type9Buf.writeUInt8(stroke.b, 11);
  type9Buf.writeUInt8(stroke.width, 12);
  type9Buf.writeUInt8(stroke.opacity, 13);
  type9Buf.writeUInt16LE(pointsLength, 14);

  for (let i = 0; i < pointsLength; i++) {
    const p = pts[i];
    type9Buf.writeInt16LE(p.x, 16 + i * 4);
    type9Buf.writeInt16LE(p.y, 18 + i * 4);
  }
  type9Buf.writeUInt16LE((strokeId || 0) & 0xFFFF, 16 + pointsLength * 4);

  // Record canonical stroke into standard drawHistory through existing protected facade path
  recordCommandFacade(room.id, 'draw_binary', type9Buf, instId, strokeId);

  // Also record the normal draw_end (Type 3) into drawHistory so undoLastDrawing
  // cleanly pops both Type 9 + Type 3 as an atomic pair
  recordCommandFacade(room.id, 'draw_binary', buf, instId, strokeId);

  // Cache canonical Type 9 temporarily for targeted client repair requests
  const cache = getOrCreateFreeDrawCanonicalCache(room);
  const cacheKey = `${instId}_${strokeId}`;
  cache.set(cacheKey, { buffer: type9Buf, createdAt: Date.now() });

  // Evict old canonical cache entries older than 30s or if cache exceeds 100 entries
  const now = Date.now();
  for (const [ck, val] of cache.entries()) {
    if (now - val.createdAt > 30000 || cache.size > 100) {
      cache.delete(ck);
    }
  }

  // Clean up active stroke buffer
  strokes.delete(key);

  return {
    committed: true,
    strokeId,
    pointCount: pointsLength,
    instId
  };
}

/**
 * Retrieves a cached canonical Type 9 stroke buffer for client packet loss repair.
 */
export function getCanonicalFreeDrawStroke(
  room: Room,
  instId: string,
  strokeId: number
): Buffer | null {
  if (!room || (!room.isFreeDraw && !room.isExperimental) || !room.freeDrawCanonicalCache) return null;
  const cacheKey = `${instId}_${strokeId}`;
  const cached = room.freeDrawCanonicalCache.get(cacheKey);
  return cached ? cached.buffer : null;
}

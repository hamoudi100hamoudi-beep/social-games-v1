import { getToolName } from '../src/utils/drawBinaryHelper.js';
import { createType2Buffer } from './rooms.js';
import { defaultDrawRateLimiter, type DrawRateLimiter } from './drawRateLimit.js';
import {
  extractValidatedInstId,
  extractValidatedType4Identity,
  isAllowedStartOrEndTool,
  isValidInstIdBytes,
  isValidType4Packet,
  isValidType9Packet
} from './utils/binaryBufferHelpers.js';
import { markPlayerActive } from './controlInputValidation.js';

export interface DrawBinaryDependencies {
  io?: any;
  roomManager: any;
  drawRateLimiter?: DrawRateLimiter;
  now?: () => number;
  relayFreeDrawMove?: (
    roomId: string,
    senderSocket: any,
    compressedBuf: Buffer,
    instId: string,
    points: { x: number; y: number }[]
  ) => void;
}

function emitOneTimeAbort(io: any, roomId: string, instId: string, strokeId: number): void {
  if (!io || typeof io.to !== 'function') return;
  const abortBuf = Buffer.alloc(10);
  abortBuf.writeUInt8(12, 0); // MSG_DRAW_ABORT = 12
  abortBuf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  abortBuf.writeUInt16LE(strokeId & 0xffff, 8);
  io.to(roomId).emit('draw_binary', abortBuf);
}

function cleanupRejectedActiveStroke(
  io: any,
  roomManager: any,
  room: any,
  roomId: string,
  socketId: string,
  type: number,
  buf: Buffer,
  useCanonicalPipeline: boolean,
  isContinuousTool: boolean,
  instId: string | null
): void {
  if (!instId) return;

  if (
    useCanonicalPipeline &&
    (type === 13 || type === 2 || type === 6 || ((type === 1 || type === 3) && isContinuousTool))
  ) {
    const key = `${socketId}_${instId}`;
    const activeStroke = room.freeDrawStrokes?.get(key);
    if (activeStroke && activeStroke.status === 'ACTIVE') {
      const abortStrokeId = type === 3 && buf.length === 27 ? buf.readUInt16LE(23) : 0;
      if (typeof roomManager.abortFreeDrawStroke === 'function') {
        roomManager.abortFreeDrawStroke(roomId, socketId, instId, abortStrokeId);
      } else {
        room.freeDrawStrokes.delete(key);
      }
      return;
    }
    if (type !== 6) return;
  }

  if (
    (!useCanonicalPipeline || !isContinuousTool) &&
    (type === 2 || type === 3 || type === 6 || type === 9) &&
    room.gameState?.isDrawingActive === true
  ) {
    room.gameState.isDrawingActive = false;
    const abortStrokeId = type === 3 && buf.length === 27 ? buf.readUInt16LE(23) : 0;
    emitOneTimeAbort(io, roomId, instId, abortStrokeId);
  }
}

function defaultRelayFreeDrawMove(
  io: any,
  roomManager: any,
  roomId: string,
  senderSocket: any,
  compressedBuf: Buffer,
  instId: string,
  points: { x: number; y: number }[]
) {
  if (!io || !io.sockets) return;
  const roomSockets = io.sockets.adapter?.rooms?.get(roomId);
  if (!roomSockets || roomSockets.size <= 1) return;

  let type2FallbackBuf: Buffer | null = null;
  for (const targetSocketId of roomSockets) {
    if (targetSocketId === senderSocket.id) continue;
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (!targetSocket) continue;

    if (typeof roomManager.isClientType13Capable === 'function' && roomManager.isClientType13Capable(targetSocketId)) {
      if (targetSocket.volatile) {
        targetSocket.volatile.emit('draw_binary', compressedBuf);
      } else {
        targetSocket.emit('draw_binary', compressedBuf);
      }
    } else {
      if (!type2FallbackBuf) {
        type2FallbackBuf = createType2Buffer(instId, points);
      }
      if (targetSocket.volatile) {
        targetSocket.volatile.emit('draw_binary', type2FallbackBuf);
      } else {
        targetSocket.emit('draw_binary', type2FallbackBuf);
      }
    }
  }
}

/**
 * Production draw_binary handler enforcing server-side drawing authorization.
 * Shared between server.ts and test suites.
 */
export function handleDrawBinary(
  socket: any,
  rawBuf: any,
  deps: DrawBinaryDependencies
): void {
  try {
    const { io, roomManager } = deps;
    const player = roomManager.getPlayer(socket.id);
    const roomId = player ? player.roomId : null;
    if (!roomId) return;

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const buf = Buffer.isBuffer(rawBuf)
      ? rawBuf
      : (rawBuf instanceof ArrayBuffer
        ? Buffer.from(rawBuf)
        : (ArrayBuffer.isView(rawBuf)
          ? Buffer.from(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength)
          : null));

    if (!buf || buf.length === 0) return;

    const isFreeDraw = Boolean(room.isFreeDraw);
    const isExperimental = Boolean(room.isExperimental);
    const isCompetitiveExperimental = isExperimental && !isFreeDraw;
    const useCanonicalPipeline = isFreeDraw || isExperimental;
    const pId = player.persistentId || player.id;

    const type = buf[0];
    const competitiveBucketIdentity =
      isCompetitiveExperimental && type === 4 ? extractValidatedType4Identity(buf) : null;

    // ── 1. CENTRAL AUTHORIZATION GATE ──
    if (isFreeDraw) {
      // Free Draw mode: Player must be in activeDrawers
      const isAuthorizedDrawer = Boolean(
        room.activeDrawers &&
        (room.activeDrawers.includes(pId) || room.activeDrawers.includes(socket.id))
      );
      if (!isAuthorizedDrawer) {
        return; // Silent reject for spectator or unauthorized player
      }
    } else {
      // Normal competitive or Experimental room:
      // Status must be 'DRAWING' AND sender must be the current round drawer
      if (room.gameState?.status !== 'DRAWING') {
        if (isCompetitiveExperimental && type === 4 && competitiveBucketIdentity && typeof socket?.emit === 'function') {
          socket.emit('draw_action_rejected', {
            drawEpoch: room.gameState?.drawEpoch ?? 0,
            instId: competitiveBucketIdentity.instId,
            strokeId: competitiveBucketIdentity.strokeId,
            reason: 'turn_ended',
          });
        }
        return; // Silent reject during WAITING, CHOOSING, ROUND_END, PODIUM, etc.
      }
      const currentDrawerId = room.gameState?.currentDrawerId;
      const isCurrentDrawer = Boolean(
        currentDrawerId &&
        (currentDrawerId === pId || currentDrawerId === player.id || currentDrawerId === socket.id)
      );
      if (!isCurrentDrawer) {
        if (isCompetitiveExperimental && type === 4 && competitiveBucketIdentity && typeof socket?.emit === 'function') {
          socket.emit('draw_action_rejected', {
            drawEpoch: room.gameState?.drawEpoch ?? 0,
            instId: competitiveBucketIdentity.instId,
            strokeId: competitiveBucketIdentity.strokeId,
            reason: 'not_drawer',
          });
        }
        return; // Silent reject for guessers or non-drawers
      }
    }

    // Slice 1: Reject server-only control types (11, 12), unsupported/unknown types (0, 14..255),
    // and non-canonical Type 13 before any history insertion, broadcast, or state mutation.
    // Legacy Type 10 remains accepted to preserve existing compatibility behavior.
    if (type === 0 || type === 11 || type === 12 || type > 13) {
      return;
    }
    if (type === 13 && !useCanonicalPipeline) {
      return;
    }

    const toolName = buf.length >= 9 ? getToolName(buf[8]) : '';
    const isContinuousTool = toolName === 'pencil' || toolName === 'eraser';

    // ── 2. O(1) STRUCTURAL HEADER VALIDATION & WORK COST (PRE-LIMITER) ──
    let workCost = buf.length;
    let instIdForCleanup: string | null = null;
    let undoTargetInstId = '';
    let undoTargetStrokeId = 0;

    if (type === 5) { // draw_clear
      if (buf.length !== 8 || !isValidInstIdBytes(buf, true)) return;
    } else if (type === 6) { // draw_cancel
      if (buf.length !== 8) return;
      instIdForCleanup = extractValidatedInstId(buf, false);
      if (!instIdForCleanup) return;
    } else if (type === 7) { // draw_undo
      if (isFreeDraw || isExperimental) {
        if (buf.length !== 10) return;
        undoTargetInstId = extractValidatedInstId(buf, false) || '';
        if (!undoTargetInstId) return;
        if (isFreeDraw) {
          const identity = room.drawingIdentities?.[undoTargetInstId];
          if (!identity || identity.socketId !== socket.id) {
            return;
          }
        }
        undoTargetStrokeId = buf.readUInt16LE(8);
      } else {
        if (buf.length !== 8 || !isValidInstIdBytes(buf, false)) return;
      }
    } else if (type === 8) { // draw_redo
      if (isFreeDraw || isExperimental) return;
      if (buf.length !== 8 || !isValidInstIdBytes(buf, false)) return;
    } else if (type === 1) { // draw_start
      if (buf.length !== 18 || !isAllowedStartOrEndTool(buf[8])) return;
      instIdForCleanup = extractValidatedInstId(buf, false);
      if (!instIdForCleanup) return;
    } else if (type === 13) { // Canonical compressed draw_move
      if (buf.length < 10) return;
      instIdForCleanup = extractValidatedInstId(buf, false);
      if (!instIdForCleanup) return;
      const compressedCount = buf.readUInt16LE(8);
      if (compressedCount > 3000) return;
      if (compressedCount === 0 && buf.length !== 10) return;
      if (compressedCount > 0 && buf.length <= 10) return;
      workCost = Math.max(buf.length, compressedCount * 4);
    } else if (type === 2) { // draw_move (uncompressed)
      if (buf.length < 10) return;
      instIdForCleanup = extractValidatedInstId(buf, false);
      if (!instIdForCleanup) return;
      const moveCount = buf.readUInt16LE(8);
      if (buf.length !== 10 + moveCount * 4) return;
    } else if (type === 3) { // draw_end
      if ((buf.length !== 23 && buf.length !== 27) || !isAllowedStartOrEndTool(buf[8])) return;
      instIdForCleanup = extractValidatedInstId(buf, false);
      if (!instIdForCleanup) return;
    } else if (type === 9) { // draw_stroke
      if (!isValidType9Packet(buf, useCanonicalPipeline)) return;
      instIdForCleanup = extractValidatedInstId(buf, false);
    } else if (type === 4) { // draw_action (bucket)
      if (!isValidType4Packet(buf)) {
        if (isCompetitiveExperimental && competitiveBucketIdentity && typeof socket?.emit === 'function') {
          socket.emit('draw_action_rejected', {
            drawEpoch: room.gameState?.drawEpoch ?? 0,
            instId: competitiveBucketIdentity.instId,
            strokeId: competitiveBucketIdentity.strokeId,
            reason: 'invalid_packet',
          });
        }
        return;
      }
      if (competitiveBucketIdentity) {
        instIdForCleanup = competitiveBucketIdentity.instId;
      }
    }

    // ── 3. O(1) PER-SOCKET PACKET & WORK-UNIT TOKEN BUCKET (SLICE 5A) ──
    const limiter = deps.drawRateLimiter ?? defaultDrawRateLimiter;
    const nowMs = deps.now ? deps.now() : Date.now();
    if (!limiter.consume(socket.id, workCost, nowMs)) {
      cleanupRejectedActiveStroke(
        io,
        roomManager,
        room,
        roomId,
        socket.id,
        type,
        buf,
        useCanonicalPipeline,
        isContinuousTool,
        instIdForCleanup
      );
      if (isCompetitiveExperimental && type === 4 && competitiveBucketIdentity && typeof socket?.emit === 'function') {
        socket.emit('draw_action_rejected', {
          drawEpoch: room.gameState?.drawEpoch ?? 0,
          instId: competitiveBucketIdentity.instId,
          strokeId: competitiveBucketIdentity.strokeId,
          reason: 'rate_limit',
        });
      }
      return;
    }

    // ── 4. AUTHORIZED, VALIDATED & RATE-PERMITTED EXECUTION ──
    if (type === 5) { // draw_clear
      if (isFreeDraw || isExperimental) {
        roomManager.handleFreeDrawClear(roomId, buf);
      } else {
        roomManager.recordDrawCommand(roomId, 'draw_binary', buf);
      }
      markPlayerActive(player, nowMs);
      if (socket.broadcast && typeof socket.broadcast.to === 'function') {
        socket.broadcast.to(roomId).emit('draw_binary', buf);
      }
      if (
        isCompetitiveExperimental &&
        io &&
        typeof io.to === 'function' &&
        typeof roomManager.getBucketLockSyncPayload === 'function'
      ) {
        io.to(roomId).emit('bucket_lock_sync', roomManager.getBucketLockSyncPayload(roomId));
      }
    } else if (type === 6) { // draw_cancel
      roomManager.recordDrawCommand(roomId, 'draw_binary', buf);
      markPlayerActive(player, nowMs);
      if (socket.broadcast && typeof socket.broadcast.to === 'function') {
        socket.broadcast.to(roomId).emit('draw_binary', buf);
      }
    } else if (type === 7) { // draw_undo
      if (isCompetitiveExperimental && typeof roomManager.undoCompetitiveExperimentalStroke === 'function') {
        const undoRes = roomManager.undoCompetitiveExperimentalStroke(roomId, undoTargetInstId, undoTargetStrokeId);
        if (undoRes.removed) {
          markPlayerActive(player, nowMs);
          if (io && typeof io.to === 'function') {
            io.to(roomId).emit('draw_binary', buf);
          }
        } else {
          if (socket && typeof socket.emit === 'function') {
            socket.emit('draw_undo_rejected', {
              reason: undoRes.reason || 'bucket_locked',
              strokeId: undoTargetStrokeId,
              instId: undoTargetInstId,
              drawEpoch: undoRes.drawEpoch,
              lockedBucket: undoRes.lockedBucket,
            });
          }
        }
      } else if (isFreeDraw || isExperimental) {
        const removed = roomManager.undoFreeDrawStroke(roomId, undoTargetInstId, undoTargetStrokeId);
        if (removed) {
          markPlayerActive(player, nowMs);
          if (io && typeof io.to === 'function') {
            io.to(roomId).emit('draw_binary', buf);
          }
        }
      } else {
        roomManager.undoLastDrawing(roomId);
        markPlayerActive(player, nowMs);
        if (io && typeof io.to === 'function') {
          io.to(roomId).emit('draw_binary', buf);
        }
      }
    } else if (type === 8) { // draw_redo
      roomManager.redoDrawing(roomId);
      markPlayerActive(player, nowMs);
      if (io && typeof io.to === 'function') {
        io.to(roomId).emit('draw_binary', buf);
      }
    } else if (type === 1) { // draw_start
      if (useCanonicalPipeline && isContinuousTool) {
        const started = roomManager.handleFreeDrawStart(roomId, socket.id, buf);
        if (!started) return;
        markPlayerActive(player, nowMs);
        // Broadcast live draw_start so spectators initialize their local live layer
        if (socket.broadcast && typeof socket.broadcast.to === 'function') {
          socket.broadcast.to(roomId).emit('draw_binary', buf);
        }
      } else {
        // Shape start in canonical rooms or any allowed tool start in Normal rooms
        roomManager.recordDrawCommand(roomId, 'draw_binary', buf);
        markPlayerActive(player, nowMs);
        if (socket.broadcast && typeof socket.broadcast.to === 'function') {
          socket.broadcast.to(roomId).emit('draw_binary', buf);
        }
      }
    } else if (type === 13) { // Canonical compressed draw_move
      const res = roomManager.handleFreeDrawMoveCompressed(roomId, socket.id, buf);
      if (!res || !res.success || !res.points || !res.instId) {
        return;
      }
      markPlayerActive(player, nowMs);
      if (deps.relayFreeDrawMove) {
        deps.relayFreeDrawMove(roomId, socket, buf, res.instId, res.points);
      } else {
        defaultRelayFreeDrawMove(io, roomManager, roomId, socket, buf, res.instId, res.points);
      }
    } else if (type === 2) { // draw_move (uncompressed)
      if (useCanonicalPipeline) {
        const ok = roomManager.handleFreeDrawMove(roomId, socket.id, buf);
        if (!ok) return;
        markPlayerActive(player, nowMs);
        if (socket.broadcast && typeof socket.broadcast.to === 'function') {
          if (socket.broadcast.to(roomId).volatile) {
            socket.broadcast.to(roomId).volatile.emit('draw_binary', buf);
          } else {
            socket.broadcast.to(roomId).emit('draw_binary', buf);
          }
        }
      } else {
        roomManager.recordDrawCommand(roomId, 'draw_binary', buf);
        markPlayerActive(player, nowMs);
        if (socket.broadcast && typeof socket.broadcast.to === 'function') {
          socket.broadcast.to(roomId).emit('draw_binary', buf);
        }
      }
    } else if (type === 3) { // draw_end
      if (useCanonicalPipeline && isContinuousTool) {
        const commitResult = roomManager.handleFreeDrawEnd(roomId, socket.id, buf);
        if (commitResult && commitResult.committed) {
          markPlayerActive(player, nowMs);
          const commitBuf = Buffer.alloc(12);
          commitBuf.writeUInt8(11, 0); // MSG_DRAW_COMMIT = 11
          commitBuf.write(commitResult.instId.padEnd(7, "\0").slice(0, 7), 1, 7, "ascii");
          commitBuf.writeUInt16LE(commitResult.strokeId & 0xFFFF, 8);
          commitBuf.writeUInt16LE(commitResult.pointCount & 0xFFFF, 10);
          if (io && typeof io.to === 'function') {
            io.to(roomId).emit('draw_binary', commitBuf);
          }
        }
        // When handleFreeDrawEnd returns null (cancelled/expired already emitted Type 12 abort,
        // or orphaned/duplicate stroke), do NOT broadcast raw Type 3.
        return;
      } else {
        // Shape end in canonical rooms or any allowed tool end in Normal rooms
        roomManager.recordDrawCommand(roomId, 'draw_binary', buf);
        markPlayerActive(player, nowMs);
        if (socket.broadcast && typeof socket.broadcast.to === 'function') {
          socket.broadcast.to(roomId).emit('draw_binary', buf);
        }
      }
    } else if (type === 9) { // draw_stroke
      roomManager.recordDrawCommand(roomId, 'draw_binary', buf);
      markPlayerActive(player, nowMs);
      if (socket.broadcast && typeof socket.broadcast.to === 'function') {
        socket.broadcast.to(roomId).emit('draw_binary', buf);
      }
    } else if (type === 4) { // draw_action (bucket)
      const prevLock =
        isCompetitiveExperimental && typeof roomManager.getBucketLockSyncPayload === 'function'
          ? roomManager.getBucketLockSyncPayload(roomId)
          : null;
      const recordRes = roomManager.recordDrawCommand(roomId, 'draw_binary', buf);
      if (isCompetitiveExperimental && (!recordRes || !recordRes.recorded)) {
        if (competitiveBucketIdentity && typeof socket?.emit === 'function') {
          socket.emit('draw_action_rejected', {
            drawEpoch: recordRes?.drawEpoch ?? room.gameState?.drawEpoch ?? 0,
            instId: competitiveBucketIdentity.instId,
            strokeId: competitiveBucketIdentity.strokeId,
            reason: 'not_recorded',
          });
        }
        return;
      }
      markPlayerActive(player, nowMs);
      if (socket.broadcast && typeof socket.broadcast.to === 'function') {
        socket.broadcast.to(roomId).emit('draw_binary', buf);
      }
      if (isCompetitiveExperimental && competitiveBucketIdentity && typeof socket?.emit === 'function') {
        socket.emit('draw_action_ack', {
          drawEpoch: recordRes?.drawEpoch ?? room.gameState?.drawEpoch ?? 0,
          instId: competitiveBucketIdentity.instId,
          strokeId: competitiveBucketIdentity.strokeId,
        });
      }
      if (
        isCompetitiveExperimental &&
        io &&
        typeof io.to === 'function' &&
        typeof roomManager.getBucketLockSyncPayload === 'function'
      ) {
        const nextLock = roomManager.getBucketLockSyncPayload(roomId);
        const lockChanged =
          !prevLock ||
          prevLock.drawEpoch !== nextLock.drawEpoch ||
          prevLock.lockedBucket?.instId !== nextLock.lockedBucket?.instId ||
          prevLock.lockedBucket?.strokeId !== nextLock.lockedBucket?.strokeId;
        if (lockChanged) {
          io.to(roomId).emit('bucket_lock_sync', nextLock);
        }
      }
    } else {
      // Remaining supported legacy type (Type 10 clear compatibility)
      // Preserve history & broadcast compatibility without counting unverified legacy Type 10 as genuine AFK activity
      roomManager.recordDrawCommand(roomId, 'draw_binary', buf);
      if (socket.broadcast && typeof socket.broadcast.to === 'function') {
        socket.broadcast.to(roomId).emit('draw_binary', buf);
      }
    }
  } catch (err) {
    console.error("Error in handleDrawBinary:", err);
  }
}

/**
 * Registers the draw_binary event listener on a socket using the shared production handler.
 */
export function registerDrawBinaryHandler(
  socket: any,
  deps: DrawBinaryDependencies
): void {
  socket.on('draw_binary', (rawBuf: any) => {
    handleDrawBinary(socket, rawBuf, deps);
  });
}

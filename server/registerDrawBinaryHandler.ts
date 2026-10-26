import { getToolName } from '../src/utils/drawBinaryHelper.js';
import { createType2Buffer } from './rooms.js';

export interface DrawBinaryDependencies {
  io?: any;
  roomManager: any;
  relayFreeDrawMove?: (
    roomId: string,
    senderSocket: any,
    compressedBuf: Buffer,
    instId: string,
    points: { x: number; y: number }[]
  ) => void;
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
    const useCanonicalPipeline = isFreeDraw || isExperimental;
    const pId = player.persistentId || player.id;

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
        return; // Silent reject during WAITING, CHOOSING, ROUND_END, PODIUM, etc.
      }
      const currentDrawerId = room.gameState?.currentDrawerId;
      const isCurrentDrawer = Boolean(
        currentDrawerId &&
        (currentDrawerId === pId || currentDrawerId === player.id || currentDrawerId === socket.id)
      );
      if (!isCurrentDrawer) {
        return; // Silent reject for guessers or non-drawers
      }
    }

    const type = buf[0];
    const toolName = buf.length >= 9 ? getToolName(buf[8]) : '';
    const isContinuousTool = toolName === 'pencil' || toolName === 'eraser';

    if (type === 5) { // draw_clear
      if (isFreeDraw || isExperimental) {
        roomManager.handleFreeDrawClear(roomId, buf);
      } else {
        roomManager.recordDrawCommand(roomId, 'draw_binary', buf);
      }
      if (socket.broadcast && typeof socket.broadcast.to === 'function') {
        socket.broadcast.to(roomId).emit('draw_binary', buf);
      }
    } else if (type === 7) { // draw_undo
      if ((isFreeDraw || isExperimental) && buf.length >= 10) {
        let targetInstId = "";
        for (let i = 0; i < 7; i++) {
          const code = buf[1 + i];
          if (code > 0) targetInstId += String.fromCharCode(code);
        }
        if (!targetInstId) return;

        // In Free Draw: targetInstId MUST exist in room.drawingIdentities AND belong to socket.id
        if (isFreeDraw) {
          const identity = room.drawingIdentities?.[targetInstId];
          if (!identity || identity.socketId !== socket.id) {
            return; // Silent reject if identity missing or belongs to another socket
          }
        }

        const targetStrokeId = buf.readUInt16LE(8);
        const removed = roomManager.undoFreeDrawStroke(roomId, targetInstId, targetStrokeId);
        if (removed && io && typeof io.to === 'function') {
          io.to(roomId).emit('draw_binary', buf);
        }
      } else {
        roomManager.undoLastDrawing(roomId);
        if (io && typeof io.to === 'function') {
          io.to(roomId).emit('draw_binary', buf);
        }
      }
    } else if (type === 8) { // draw_redo
      roomManager.redoDrawing(roomId);
      if (io && typeof io.to === 'function') {
        io.to(roomId).emit('draw_binary', buf);
      }
    } else if (useCanonicalPipeline && type === 1 && isContinuousTool) { // Canonical draw_start
      roomManager.handleFreeDrawStart(roomId, socket.id, buf);
      // Broadcast live draw_start so spectators initialize their local live layer
      if (socket.broadcast && typeof socket.broadcast.to === 'function') {
        socket.broadcast.to(roomId).emit('draw_binary', buf);
      }
    } else if (useCanonicalPipeline && (type === 2 || type === 13)) { // Canonical draw_move
      if (type === 13) {
        const res = roomManager.handleFreeDrawMoveCompressed(roomId, socket.id, buf);
        if (!res || !res.success || !res.points || !res.instId) {
          return;
        }
        if (deps.relayFreeDrawMove) {
          deps.relayFreeDrawMove(roomId, socket, buf, res.instId, res.points);
        } else {
          defaultRelayFreeDrawMove(io, roomManager, roomId, socket, buf, res.instId, res.points);
        }
      } else {
        const ok = roomManager.handleFreeDrawMove(roomId, socket.id, buf);
        if (!ok) return;
        if (socket.broadcast && typeof socket.broadcast.to === 'function') {
          if (socket.broadcast.to(roomId).volatile) {
            socket.broadcast.to(roomId).volatile.emit('draw_binary', buf);
          } else {
            socket.broadcast.to(roomId).emit('draw_binary', buf);
          }
        }
      }
    } else if (useCanonicalPipeline && type === 3 && isContinuousTool) { // Canonical draw_end
      const commitResult = roomManager.handleFreeDrawEnd(roomId, socket.id, buf);
      if (commitResult && commitResult.committed) {
        const commitBuf = Buffer.alloc(12);
        commitBuf.writeUInt8(11, 0); // MSG_DRAW_COMMIT = 11
        commitBuf.write(commitResult.instId.padEnd(7, "\0").slice(0, 7), 1, 7, "ascii");
        commitBuf.writeUInt16LE(commitResult.strokeId & 0xFFFF, 8);
        commitBuf.writeUInt16LE(commitResult.pointCount & 0xFFFF, 10);
        if (io && typeof io.to === 'function') {
          io.to(roomId).emit('draw_binary', commitBuf);
        }
      } else {
        if (socket.broadcast && typeof socket.broadcast.to === 'function') {
          socket.broadcast.to(roomId).emit('draw_binary', buf);
        }
      }
    } else {
      // Normal Rooms or non-commit actions (e.g. shapes, bucket, or Normal room pencil)
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

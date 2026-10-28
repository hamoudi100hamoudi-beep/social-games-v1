import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import customParser from 'socket.io-msgpack-parser';
import { roomManager, normalizeArabic, createType2Buffer } from './server/rooms.js';
import { getRoomConfig, ROOM_PRESETS } from './src/types/game.js';
import { getToolName } from './src/utils/drawBinaryHelper.js';
import { registerJoinRoomHandler } from './server/registerJoinRoomHandler.js';
import { registerDrawBinaryHandler } from './server/registerDrawBinaryHandler.js';
import { registerSubmitGuessHandler } from './server/registerSubmitGuessHandler.js';
import { registerSelectWordHandler } from './server/registerSelectWordHandler.js';
import { registerSendMessageHandler } from './server/registerSendMessageHandler.js';
import { registerGetRoomsInfoHandler } from './server/registerGetRoomsInfoHandler.js';
import { registerRequestRoundSyncHandler } from './server/registerRequestRoundSyncHandler.js';
import { registerLeaveRoomHandler } from './server/registerLeaveRoomHandler.js';
import { registerDrawingIdentityHandlers } from './server/registerDrawingIdentityHandlers.js';
import { registerVoteKickHandler } from './server/registerVoteKickHandler.js';

import { checkRateLimit } from './server/rateLimit.js';

const getJsonSafeHistory = (history: any[]): any[] => {
  if (!Array.isArray(history)) return [];

  const safeList: any[] = [];
  let inDrawingMode = false;

  const toSafeEntry = (cmd: any, event: string, safeData: any) => {
    const entry: any = { event, data: safeData };
    const instId = cmd.instId !== undefined && cmd.instId !== null && cmd.instId !== ''
      ? cmd.instId
      : (cmd.instanceId !== undefined && cmd.instanceId !== null && cmd.instanceId !== '' ? cmd.instanceId : undefined);

    if (instId !== undefined) {
      entry.instanceId = instId;
    }
    if (cmd.strokeId !== undefined && cmd.strokeId !== null) {
      entry.strokeId = cmd.strokeId;
    }
    return entry;
  };

  for (const cmd of history) {
    if (!cmd) continue;

    if (Array.isArray(cmd)) {
      safeList.push(getJsonSafeHistory(cmd));
      continue;
    }

    // تحويل البيانات الثنائية (Buffers) إلى مصفوفات JSON آمنة 
    let safeData = cmd.data;
    if (cmd.data && Buffer.isBuffer(cmd.data)) {
      safeData = Array.from(cmd.data);
    }

    const event = cmd.event;
    const isBinary = event === "draw_binary" && Array.isArray(safeData) && safeData.length > 0;
    const binaryType = isBinary ? safeData[0] : null;

    if (isBinary) {
      if (binaryType === 1) { // draw_start
        inDrawingMode = true;
        safeList.push(toSafeEntry(cmd, event, safeData));
      } else if (binaryType === 2) { // draw_move
        if (inDrawingMode) {
          safeList.push(toSafeEntry(cmd, event, safeData));
        } else {
          console.log(`[Sanitizer] Filtered out orphaned move packet (type 2) on transport sync`);
        }
      } else if (binaryType === 3 || binaryType === 6) { // draw_end / draw_cancel
        if (inDrawingMode) {
          safeList.push(toSafeEntry(cmd, event, safeData));
          inDrawingMode = false;
        } else {
          console.log(`[Sanitizer] Filtered out orphaned end/cancel packet (type 3/6) on transport sync`);
        }
      } else if (binaryType === 4 || binaryType === 5 || binaryType === 10) {
        inDrawingMode = false;
        safeList.push(toSafeEntry(cmd, event, safeData));
      } else {
        safeList.push(toSafeEntry(cmd, event, safeData));
      }
    } else {
      if (event === "draw_start") {
        inDrawingMode = true;
        safeList.push(toSafeEntry(cmd, event, safeData));
      } else if (event === "draw_action" || event === "draw_clear") {
        inDrawingMode = false; // تصفير نمط الرسم عند الأدوات المكتملة ذاتياً
        safeList.push(toSafeEntry(cmd, event, safeData));
      } else {
        safeList.push(toSafeEntry(cmd, event, safeData));
      }
    }
  }

  return safeList;
};

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  
  const httpServer = createServer(app);
  
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket'],
    maxHttpBufferSize: 1e8,
    parser: customParser
  });

  roomManager.setIo(io);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: Date.now() });
  });

  // Rate limiting maps
  const chatMessageLimits = new Map<string, number[]>();
  const guessLimits = new Map<string, number[]>();
  const voteKickLimits = new Map<string, number[]>();
  const roundSyncLimits = new Map<string, number[]>();

  function relayFreeDrawMove(
    roomId: string,
    senderSocket: any,
    compressedBuf: Buffer,
    instId: string,
    points: { x: number; y: number }[]
  ) {
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    if (!roomSockets || roomSockets.size <= 1) return;

    let type2FallbackBuf: Buffer | null = null;

    for (const targetSocketId of roomSockets) {
      if (targetSocketId === senderSocket.id) continue;

      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (!targetSocket) continue;

      if (roomManager.isClientType13Capable(targetSocketId)) {
        targetSocket.volatile.emit('draw_binary', compressedBuf);
      } else {
        if (!type2FallbackBuf) {
          type2FallbackBuf = createType2Buffer(instId, points);
        }
        targetSocket.volatile.emit('draw_binary', type2FallbackBuf);
      }
    }
  }

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    const PASSIVE_BACKGROUND_EVENTS = new Set([
      'request_round_sync',
      'get_room_info',
    ]);

    socket.onAny((eventName) => {
      try {
        if (PASSIVE_BACKGROUND_EVENTS.has(eventName)) return;
        const player = roomManager.getPlayer(socket.id);
        if (player) {
          player.lastActivity = Date.now();
          player.afkWarningSent = false;
        }
      } catch (err) {}
    });
    
    socket.on('get_room_info', (roomId, callback) => {
      try {
        const room = roomManager.getRoom(roomId);
        const config = getRoomConfig(roomId);
        const count = room ? room.players.filter(p => !p.isOffline).length : 0;
        const max = room?.maxPlayers ?? config.maxPlayers;
        const winningScore = room?.winningScore ?? config.winningScore;
        const theme = room?.theme ?? config.theme;
        if (callback) callback({ count, max, winningScore, theme });
      } catch (e) {
        console.error(e);
        if (callback) callback({ count: 0, max: 5, winningScore: 30, theme: 'General' });
      }
    });

    registerGetRoomsInfoHandler(socket, {
      roomManager,
      getRoomConfig,
      ROOM_PRESETS,
    });

    socket.on('client_capabilities', (caps) => {
      try {
        if (caps && typeof caps === 'object') {
          roomManager.setClientCapabilities(socket.id, caps);
        }
      } catch (err) {
        console.error("Error setting client capabilities:", err);
      }
    });

    registerJoinRoomHandler(socket, {
      io,
      roomManager,
      getRoomConfig,
      getJsonSafeHistory,
    });

    registerRequestRoundSyncHandler(socket, {
      roomManager,
      roundSyncLimits,
      checkRateLimit,
      getJsonSafeHistory,
    });

    registerLeaveRoomHandler(socket, {
      io,
      roomManager,
    });

    registerDrawBinaryHandler(socket, {
      io,
      roomManager,
      relayFreeDrawMove,
    });

    socket.on('draw_repair_req', (data) => {
      try {
        const player = roomManager.getPlayer(socket.id);
        const roomId = player ? player.roomId : null;
        if (roomId && data && data.instId !== undefined && data.strokeId !== undefined) {
          const canonicalStroke = roomManager.getCanonicalFreeDrawStroke(roomId, String(data.instId), Number(data.strokeId));
          if (canonicalStroke) {
            // Send canonical Type 9 stroke ONLY to the requesting socket
            socket.emit('draw_binary', canonicalStroke);
          }
        }
      } catch (err) {
        console.error("Error handling draw_repair_req:", err);
      }
    });

    socket.on('start_free_draw', () => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        roomManager.startFreeDraw(player.roomId, socket.id);
      }
    });

    registerDrawingIdentityHandlers(socket, {
      roomManager,
    });

    socket.on('request_drawing_identities', () => {
      try {
        const player = roomManager.getPlayer(socket.id);
        if (player && player.roomId) {
          const identities = roomManager.getDrawingIdentitiesForRoom(player.roomId);
          if (identities) {
            socket.emit('drawing_identities_update', identities);
          }
        }
      } catch (err) {
        console.error("Error handling request_drawing_identities:", err);
      }
    });

    socket.on('stop_free_draw', () => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        roomManager.stopFreeDraw(player.roomId, socket.id);
      }
    });

    socket.on('skip_turn', () => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        roomManager.handleSkipTurn(player.roomId, socket.id);
      }
    });

    registerSelectWordHandler(socket, {
      roomManager,
    });

    registerSubmitGuessHandler(socket, {
      roomManager,
      guessLimits,
      checkRateLimit,
    });

    socket.on('request_hint', () => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        roomManager.requestHint(player.roomId, socket.id);
      }
    });

    socket.on('report_draw', () => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        roomManager.reportDrawing(player.roomId, socket.id);
      }
    });

    registerSendMessageHandler(socket, {
      io,
      roomManager,
      chatLimits: chatMessageLimits,
      checkRateLimit,
      normalizeArabic,
    });

    socket.on('request_kick', ({ roomId, nickname, playerId }, callback) => {
      try {
        console.warn(`[REQUEST KICK/AFK] Player ${nickname} (${playerId}) requested kick from room ${roomId}`);
        const player = roomManager.getPlayer(socket.id);
        if (player && player.roomId) {
          const rId = player.roomId;
          const room = roomManager.getRoom(rId);
          if (room) {
            roomManager.removePlayerFromRoom(rId, socket.id);
            
            const leaveMsg = {
              id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
              text: `تم طرد ${nickname} بسبب عدم النشاط (AFK)`,
              type: 'system'
            };
            roomManager.saveChatMessage(rId, leaveMsg);
            io.to(rId).emit('receive_message', leaveMsg);
          }
          roomManager.removePlayer(socket.id);
        }
        if (callback) callback({ success: true });
      } catch (e) {
        console.error("Error in request_kick event:", e);
        if (callback) callback({ error: e instanceof Error ? e.message : String(e) });
      }
    });

    registerVoteKickHandler(socket, {
      io,
      roomManager,
      voteKickLimits,
      checkRateLimit,
    });

    socket.on('ping_activity', () => {
      try {
        const player = roomManager.getPlayer(socket.id);
        if (player) {
          player.lastActivity = Date.now();
          player.afkWarningSent = false;
        }
      } catch (e) {
        console.error("Error in ping_activity event:", e);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected, delegating to roomManager: ${socket.id}`);
      try {
        roomManager.handleDisconnect(socket.id);
      } catch (e) {
        console.error("Error during disconnect handling:", e);
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

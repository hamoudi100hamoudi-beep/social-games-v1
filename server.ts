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

  const checkRateLimit = (limitsMap: Map<string, number[]>, socketId: string, maxMessages: number, windowMs: number) => {
    const now = Date.now();
    const timestamps = limitsMap.get(socketId) || [];
    // remove timestamps older than windowMs
    const recent = timestamps.filter(ts => now - ts < windowMs);
    if (recent.length >= maxMessages) {
      return false; // Rate limited
    }
    recent.push(now);
    limitsMap.set(socketId, recent);
    return true; // Allowed
  };

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

    socket.on('get_rooms_info', (roomIdsOrCallback, maybeCallback) => {
      try {
        const callback = typeof roomIdsOrCallback === 'function' ? roomIdsOrCallback : maybeCallback;
        const requestedIds = Array.isArray(roomIdsOrCallback)
          ? roomIdsOrCallback
          : ROOM_PRESETS.map((p) => p.id);

        const stats: Record<string, { count: number; max: number; winningScore: number; theme: string }> = {};
        for (const id of requestedIds) {
          const room = roomManager.getRoom(id);
          const config = getRoomConfig(id);
          const count = room ? room.players.filter((p) => !p.isOffline).length : 0;
          stats[id] = {
            count,
            max: room?.maxPlayers ?? config.maxPlayers,
            winningScore: room?.winningScore ?? config.winningScore,
            theme: room?.theme ?? config.theme,
          };
        }
        if (callback) callback(stats);
      } catch (e) {
        console.error("Error in get_rooms_info:", e);
        const cb = typeof roomIdsOrCallback === 'function' ? roomIdsOrCallback : maybeCallback;
        if (cb) cb({});
      }
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

    socket.on('request_round_sync', () => {
      try {
        const player = roomManager.getPlayer(socket.id);
        if (player && player.roomId) {
          const room = roomManager.getRoom(player.roomId);
          if (room) {
            roomManager.sendStateToPlayer(room, player);
            // Always emit draw_history_sync to guarantee the client's loader disappears instantly
            socket.emit('draw_history_sync', getJsonSafeHistory(room.gameState.drawHistory || []));
            socket.emit('draw_redo_sync', getJsonSafeHistory(room.gameState.redoStack || []));
            roomManager.syncActiveFreeDrawStrokesToSocket(room, socket);
          }
        }
      } catch (e) {
        console.error("Error in request_round_sync:", e);
      }
    });

    socket.on('leave_room', ({ roomId }) => {
      try {
        socket.leave(roomId);
        const player = roomManager.getPlayer(socket.id);
        const playerName = player ? player.name : 'لاعب';
        const room = roomManager.removePlayerFromRoom(roomId, socket.id);
        if (room) {
          const leaveMsg = {
            id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
            text: `${playerName} غادر الغرفة`,
            type: 'system'
          };
          roomManager.saveChatMessage(roomId, leaveMsg);
          io.to(roomId).emit('receive_message', leaveMsg);
        }
      } catch (e) {
        console.error(e);
      }
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

    socket.on('register_drawing_identity', ({ instanceId }) => {
      try {
        if (instanceId && typeof instanceId === 'string') {
          roomManager.registerDrawingIdentity(socket.id, instanceId);
        }
      } catch (err) {
        console.error("Error registering drawing identity:", err);
      }
    });

    socket.on('unregister_drawing_identity', ({ instanceId }) => {
      try {
        if (instanceId && typeof instanceId === 'string') {
          roomManager.unregisterDrawingIdentity(socket.id, instanceId);
        }
      } catch (err) {
        console.error("Error unregistering drawing identity:", err);
      }
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

    socket.on('send_message', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        if (!checkRateLimit(chatMessageLimits, player.persistentId || socket.id, 5, 2000)) {
          return; // Ignore if rate limited
        }

        const room = roomManager.getRoom(player.roomId);
        if (room && room.gameState.status === 'DRAWING' && room.gameState.currentWord) {
           const guess = data.text?.toLowerCase().trim() || "";
           const target = room.gameState.currentWord.toLowerCase().trim();
           const guessNorm = normalizeArabic(guess);
           const targetNorm = normalizeArabic(target);
           
           if (guess && target && (guess.includes(target) || guessNorm.includes(targetNorm))) {
              socket.emit('receive_message', {
                id: 'sys-cheat-' + Date.now(),
                text: '🚫 لا يمكنك كتابة الإجابة في الدردشة أثناء الرسم!',
                type: 'warning'
              });
              return;
           }
        }

        const msg = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          text: data.text,
          sender: player.name,
          senderId: socket.id,
          avatar: player.avatar,
          type: 'message'
        };
        roomManager.saveChatMessage(player.roomId, msg);
        io.to(player.roomId).emit('receive_message', msg);
      }
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

    socket.on('submit_vote_kick', ({ targetPlayerId }, callback) => {
      try {
        const player = roomManager.getPlayer(socket.id);
        if (!player || !player.roomId) {
          if (callback) callback({ error: 'player_not_found' });
          return;
        }

        const roomId = player.roomId;
        const room = roomManager.getRoom(roomId);
        if (!room) {
          if (callback) callback({ error: 'room_not_found' });
          return;
        }

        const targetPlayer = room.players.find(p => p.persistentId === targetPlayerId);
        if (!targetPlayer) {
          if (callback) callback({ error: 'target_not_found' });
          return;
        }

        if (!room.votekicks) room.votekicks = {};
        if (!room.bannedUsers) room.bannedUsers = [];

        const voters = room.votekicks[targetPlayerId] || [];
        const selfId = player.persistentId || player.id;
        const alreadyVoted = voters.includes(selfId);

        // Get total active (not offline) players in the room representing the room's quorum
        const onlineCount = room.players.filter(p => !p.isOffline).length;

        // VOTE KICK CRITERIA (Variable Room Quorum):
        // - 5 players or less -> needs 2 votes.
        // - 6 players -> needs 3 votes.
        // - 7 or 8 players -> needs 4 votes.
        // - 9 or 10 players -> needs 5 votes.
        let requiredVotes = 2;
        if (onlineCount <= 5) {
          requiredVotes = 2;
        } else if (onlineCount === 6) {
          requiredVotes = 3;
        } else if (onlineCount <= 8) {
          requiredVotes = 4;
        } else {
          requiredVotes = 5;
        }

        if (alreadyVoted) {
          // Remove vote action
          const updatedVoters = voters.filter(vId => vId !== selfId);
          room.votekicks[targetPlayerId] = updatedVoters;
          const currentCount = updatedVoters.length;

          if (callback) callback({ success: true, voted: false, count: currentCount, required: requiredVotes });

          // Update state visually
          roomManager.sendStateToPlayer(room, player);
          roomManager.sendStateToPlayer(room, targetPlayer);
          // Broadcast to all
          room.players.forEach(p => {
            roomManager.sendStateToPlayer(room, p);
          });
          return;
        }

        // Add vote action
        voters.push(selfId);
        room.votekicks[targetPlayerId] = voters;
        const currentCount = voters.length;

        // Visual Chat alert styled dynamic
        const announceMsg = {
          id: 'votekick-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
          text: `${player.name} voted to kick out ${targetPlayer.name}`,
          voterName: player.name,
          targetName: targetPlayer.name,
          type: 'votekick_alert'
        };
        roomManager.saveChatMessage(roomId, announceMsg);
        io.to(roomId).emit('receive_message', announceMsg);

        if (currentCount >= requiredVotes) {
          // BANDECISION REACHED! Add target user persistentId/playerId to banned list
          const banId = targetPlayer.persistentId || targetPlayer.id;
          if (!room.bannedUsers.includes(banId)) {
            room.bannedUsers.push(banId);
          }

          // Emit banned to the target player so their client is locked out instantly
          io.to(targetPlayer.id).emit('banned_from_room');

          // Clean vote mapping for this target user
          delete room.votekicks[targetPlayerId];

          // Disconnect client socket
          const socketToKick = io.sockets.sockets.get(targetPlayer.id);
          if (socketToKick) {
             socketToKick.leave(roomId);
             socketToKick.emit('banned_from_room');
          }

          // Evict from room state
          const kickedName = targetPlayer.name;
          const targetSocketId = targetPlayer.id;
          roomManager.removePlayerFromRoom(roomId, targetSocketId);
          roomManager.removePlayer(targetSocketId);

          const kickedAnnounce = {
            id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
            text: `${kickedName} غادر الغرفة`,
            type: 'system'
          };
          roomManager.saveChatMessage(roomId, kickedAnnounce);
          io.to(roomId).emit('receive_message', kickedAnnounce);
        }

        // Update all players
        room.players.forEach(p => {
          roomManager.sendStateToPlayer(room, p);
        });

        if (callback) callback({ success: true, voted: true, count: currentCount, required: requiredVotes });
      } catch (e) {
        console.error("Error in submit_vote_kick event:", e);
        if (callback) callback({ error: String(e) });
      }
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

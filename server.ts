import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { roomManager } from './server/rooms.js';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  
  const httpServer = createServer(app);
  // Setup Socket.io
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket'],
    maxHttpBufferSize: 1e8 // 100MB payload limit (solves infinite disconnect loop when history is huge)
  });

  roomManager.setIo(io);

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: Date.now() });
  });

  // Socket.io Handlers
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);
    
    // Room logic
    socket.on('get_room_info', (roomId, callback) => {
      try {
        const room = roomManager.getRoom(roomId);
        if (callback) callback({ count: room ? room.players.length : 0, max: 5 });
      } catch (e) {
        console.error(e);
        if (callback) callback({ count: 0, max: 5 });
      }
    });

    socket.on('join_room', ({ roomId, nickname, avatar, playerId, reconnectOnly }, callback) => {
      try {
        // Try to reconnect first by playerId or nickname
        const reconnectedRoom = roomManager.reconnectPlayer(roomId, playerId || '', nickname, socket.id);
        if (reconnectedRoom) {
            socket.join(roomId);
            if (callback) callback({ success: true, reconnected: true });
            return;
        }

        // If reconnectOnly is true, it means the client was attempting to reconnect to an existing session
        // but the player or room was evicted/timed out.
        if (reconnectOnly) {
            if (callback) callback({ error: 'session_expired' });
            return;
        }

        const existingRoom = roomManager.getRoom(roomId);
        const onlinePlayersCount = existingRoom ? existingRoom.players.filter(p => !p.isOffline).length : 0;
        if (existingRoom && onlinePlayersCount >= 5) {
          if (callback) callback({ error: 'عذراً، هذه الغرفة ممتلئة بالكامل!' });
          return;
        }

        socket.join(roomId);
        const room = roomManager.addPlayerToRoom(roomId, {
          id: socket.id,
          name: nickname,
          avatar: avatar || nickname.charAt(0).toUpperCase(),
          roomId: roomId,
          score: 0,
          wins: 0,
          persistentId: playerId
        });
        
        if (callback) callback({ success: true, reconnected: false });

        // System Message
        const joinMsg = {
          id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
          text: `${nickname} انضم للغرفة`,
          type: 'system'
        };
        roomManager.saveChatMessage(roomId, joinMsg);
        io.to(roomId).emit('receive_message', joinMsg);
      } catch (e) {
        console.error(e);
        if (callback) callback({ error: 'حدث خطأ أثناء الانضمام للغرفة' });
      }
    });

    socket.on('request_round_sync', () => {
      try {
        const player = roomManager.getPlayer(socket.id);
        if (player && player.roomId) {
          const room = roomManager.getRoom(player.roomId);
          if (room) {
            console.log(`[Socket] request_round_sync received from ${player.name} (${socket.id}) for room ${room.id}`);
            
            // 1. Send current room state
            roomManager.sendStateToPlayer(room, player);

            // 2. Send draw history
            if (room.gameState.drawHistory && room.gameState.drawHistory.length > 0) {
              socket.emit('draw_history_sync', room.gameState.drawHistory);
            }

            // 3. Send past chat messages
            if (room.chatMessages && room.chatMessages.length > 0) {
              room.chatMessages.forEach((msg) => {
                socket.emit('receive_message', msg);
              });
            }

            // 4. Send past guess messages
            if (room.guessMessages && room.guessMessages.length > 0) {
              room.guessMessages.forEach((msg) => {
                socket.emit('receive_guess', msg);
              });
            }
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

    socket.on('draw_binary', (buf) => {
      // High-performance binary parser for instant passthrough and server CPU protection
      const player = roomManager.getPlayer(socket.id);
      const roomId = player ? player.roomId : null;
      
      if (buf && Buffer.isBuffer(buf) && buf.length > 0) {
        const type = buf[0];
        
        if (roomId) {
          if (type === 5) { // draw_clear
            roomManager.clearDrawHistory(roomId);
            io.to(roomId).emit('draw_binary', buf);
          } else if (type === 7) { // draw_undo
            roomManager.undoLastDrawing(roomId);
            io.to(roomId).emit('draw_binary', buf);
          } else if (type === 8) { // draw_redo
            roomManager.redoDrawing(roomId);
            io.to(roomId).emit('draw_binary', buf);
          } else {
            // Raw Binary Passthrough (blindly broadcast to other room members to save CPU)
            roomManager.recordDrawCommand(roomId, 'draw_binary', buf);
            socket.broadcast.to(roomId).emit('draw_binary', buf);
          }
        } else {
          socket.broadcast.emit('draw_binary', buf);
        }
      }
    });

    // Post-migration: All legacy JSON-based drawing events are retired in favor of high-performance MSG_DRAW binary protocol.
    
    socket.on('skip_turn', () => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        roomManager.handleSkipTurn(player.roomId, socket.id);
      }
    });

    socket.on('select_word', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        roomManager.startGameRound(player.roomId, data.word, socket.id);
      }
    });

    socket.on('submit_guess', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        roomManager.submitGuess(player.roomId, socket.id, data.guess);
      }
    });

    socket.on('request_hint', () => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        roomManager.requestHint(player.roomId, socket.id);
      }
    });

    socket.on('request_canvas_sync', () => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        const room = roomManager.getRoom(player.roomId);
        if (room && room.gameState.drawHistory && room.gameState.drawHistory.length > 0) {
          console.log(`[Socket] Sending active canvas sync history to player ${player.name} (${socket.id})`);
          socket.emit('draw_history_sync', room.gameState.drawHistory);
        }
      }
    });

    socket.on('debug_room_status', () => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        const room = roomManager.getRoom(player.roomId);
        if (room) {
          console.error(`[DEBUG ROOM STATUS] Room: ${room.id}, PlayersCount: ${room.players.length}`);
          room.players.forEach((p, idx) => {
            console.error(`  -> Player[${idx}]: Name="${p.name}", SocketID="${p.id}", PersistentID="${p.persistentId}", isOffline=${p.isOffline}`);
          });
        } else {
          console.error(`[DEBUG ROOM STATUS] Room not found for ID: ${player.roomId}`);
        }
      } else {
        console.error(`[DEBUG ROOM STATUS] Player not found/no room assigned for socket: ${socket.id}`);
      }
    });

    socket.on('send_message', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
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

    socket.on('player_away', () => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        const awayMsg = {
          id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
          text: `اللاعب ${player.name} يتواجد الآن في الخلفية (خارج المتصفح)...`,
          type: 'system'
        };
        roomManager.saveChatMessage(player.roomId, awayMsg);
        io.to(player.roomId).emit('receive_message', awayMsg);
      }
    });
    
    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
      try {
        roomManager.handleDisconnect(socket.id);
      } catch (e) {
        console.error("Error during disconnect", e);
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static files serving
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

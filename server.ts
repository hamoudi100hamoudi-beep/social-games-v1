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
    transports: ['websocket']
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

    socket.on('join_room', ({ roomId, nickname, avatar, playerId }, callback) => {
      try {
        // Try to reconnect first by playerId or nickname
        const reconnectedRoom = roomManager.reconnectPlayer(roomId, playerId || '', nickname, socket.id);
        if (reconnectedRoom) {
            socket.join(roomId);
            if (callback) callback({ success: true, reconnected: true });

            // Instantly send the current room state strictly to the reconnected player
            const targetPlayer = reconnectedRoom.players.find(p => p.id === socket.id);
            if (targetPlayer) {
              roomManager.sendStateToPlayer(reconnectedRoom, targetPlayer);
            }

            // Send draw history strictly to the reconnected player
            if (reconnectedRoom.gameState.drawHistory && reconnectedRoom.gameState.drawHistory.length > 0) {
               socket.emit('draw_history_sync', reconnectedRoom.gameState.drawHistory);
            }

            // Send past chat messages strictly to the reconnected player
            if (reconnectedRoom.chatMessages && reconnectedRoom.chatMessages.length > 0) {
              reconnectedRoom.chatMessages.forEach((msg) => {
                socket.emit('receive_message', msg);
              });
            }
            // Send past guess messages strictly to the reconnected player
            if (reconnectedRoom.guessMessages && reconnectedRoom.guessMessages.length > 0) {
              reconnectedRoom.guessMessages.forEach((msg) => {
                socket.emit('receive_guess', msg);
              });
            }

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

        // Instantly force-sync state strictly to the newly joined player representation
        const targetPlayer = room.players.find(p => p.id === socket.id);
        if (targetPlayer) {
          roomManager.sendStateToPlayer(room, targetPlayer);
        }

        // Send draw history strictly to the newly joined player
        if (room.gameState.drawHistory && room.gameState.drawHistory.length > 0) {
           socket.emit('draw_history_sync', room.gameState.drawHistory);
        }

        // Send past chat messages strictly to the newly joined player
        if (room.chatMessages && room.chatMessages.length > 0) {
          room.chatMessages.forEach((msg) => {
            socket.emit('receive_message', msg);
          });
        }
        // Send past guess messages strictly to the newly joined player
        if (room.guessMessages && room.guessMessages.length > 0) {
          room.guessMessages.forEach((msg) => {
            socket.emit('receive_guess', msg);
          });
        }

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

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
        // Try to reconnect first if playerId is provided
        if (playerId) {
          const reconnectedRoom = roomManager.reconnectPlayer(roomId, playerId, socket.id);
          if (reconnectedRoom) {
            socket.join(roomId);
            if (callback) callback({ success: true, reconnected: true });

            // Send draw history strictly to the reconnected player
            if (reconnectedRoom.gameState.drawHistory && reconnectedRoom.gameState.drawHistory.length > 0) {
               socket.emit('draw_history_sync', reconnectedRoom.gameState.drawHistory);
            }

            // System Message in Arabic
            const name = reconnectedRoom.players.find(p => p.id === socket.id)?.name || nickname;
            io.to(roomId).emit('receive_message', {
              id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
              text: `${name} عاد للقاعة واستأنف اللعب`,
              type: 'system'
            });

            return;
          }
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
        
        if (callback) callback({ success: true });

        // Send draw history strictly to the newly joined player
        if (room.gameState.drawHistory && room.gameState.drawHistory.length > 0) {
           socket.emit('draw_history_sync', room.gameState.drawHistory);
        }

        // System Message
        io.to(roomId).emit('receive_message', {
          id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
          text: `${nickname} انضم للغرفة`,
          type: 'system'
        });
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
          io.to(roomId).emit('receive_message', {
            id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
            text: `${playerName} غادر الغرفة`,
            type: 'system'
          });
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

    // Relay drawing events to other clients in the same room (if we had rooms), for now broadcast to all
    socket.on('draw_start', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
         roomManager.recordDrawCommand(player.roomId, 'draw_start', data);
         socket.broadcast.to(player.roomId).emit('draw_start', data);
      }
      else socket.broadcast.emit('draw_start', data);
    });
    
    socket.on('draw_move', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
         roomManager.recordDrawCommand(player.roomId, 'draw_move', data);
         socket.broadcast.to(player.roomId).emit('draw_move', data);
      }
      else socket.broadcast.emit('draw_move', data);
    });
    
    socket.on('draw_end', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
         roomManager.recordDrawCommand(player.roomId, 'draw_end', data);
         socket.broadcast.to(player.roomId).emit('draw_end', data);
      }
      else socket.broadcast.emit('draw_end', data);
    });

    socket.on('draw_action', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
         roomManager.recordDrawCommand(player.roomId, 'draw_action', data);
         socket.broadcast.to(player.roomId).emit('draw_action', data);
      }
      else socket.broadcast.emit('draw_action', data);
    });

    socket.on('draw_clear', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
         roomManager.clearDrawHistory(player.roomId);
         io.to(player.roomId).emit('draw_clear', data); // Broadcasts to everyone including sender!
      }
      else io.emit('draw_clear', data);
    });

    socket.on('draw_cancel', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) socket.broadcast.to(player.roomId).emit('draw_cancel', data);
      else socket.broadcast.emit('draw_cancel', data);
    });

    socket.on('draw_undo', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
         roomManager.undoLastDrawing(player.roomId);
         io.to(player.roomId).emit('draw_undo_local', data);
      }
      else io.emit('draw_undo', data);
    });

    socket.on('draw_redo', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
         roomManager.redoDrawing(player.roomId);
         io.to(player.roomId).emit('draw_redo_local', data);
      }
      else io.emit('draw_redo', data);
    });
    
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
        io.to(player.roomId).emit('receive_message', {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          text: data.text,
          sender: player.name,
          senderId: socket.id,
          avatar: player.avatar,
          type: 'message'
        });
      }
    });

    socket.on('player_away', () => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        io.to(player.roomId).emit('receive_message', {
          id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
          text: `اللاعب ${player.name} يتواجد الآن في الخلفية (خارج المتصفح)...`,
          type: 'system'
        });
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

import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { roomManager } from './src/server/rooms.js';

async function startServer() {
  const app = express();
  const PORT = 3000;
  
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

    socket.on('join_room', ({ roomId, nickname, avatar }, callback) => {
      try {
        const existingRoom = roomManager.getRoom(roomId);
        if (existingRoom && existingRoom.players.length >= 5) {
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
          wins: 0
        });
        
        if (callback) callback({ success: true });

        // Broadcast updated room state
        io.to(roomId).emit('room_state_update', {
          roomId: room.id,
          players: room.players,
          gameState: room.gameState
        });

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
          io.to(roomId).emit('room_state_update', {
            roomId: room.id,
            players: room.players,
            gameState: room.gameState
          });
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

    // Relay drawing events to other clients in the same room (if we had rooms), for now broadcast to all
    socket.on('draw_start', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) socket.broadcast.to(player.roomId).emit('draw_start', data);
      else socket.broadcast.emit('draw_start', data);
    });
    
    socket.on('draw_move', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) socket.broadcast.to(player.roomId).emit('draw_move', data);
      else socket.broadcast.emit('draw_move', data);
    });
    
    socket.on('draw_end', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) socket.broadcast.to(player.roomId).emit('draw_end', data);
      else socket.broadcast.emit('draw_end', data);
    });

    socket.on('draw_action', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) socket.broadcast.to(player.roomId).emit('draw_action', data);
      else socket.broadcast.emit('draw_action', data);
    });

    socket.on('draw_clear', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) socket.broadcast.to(player.roomId).emit('draw_clear', data);
      else socket.broadcast.emit('draw_clear', data);
    });

    socket.on('draw_cancel', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) socket.broadcast.to(player.roomId).emit('draw_cancel', data);
      else socket.broadcast.emit('draw_cancel', data);
    });

    socket.on('draw_undo', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) socket.broadcast.to(player.roomId).emit('draw_undo', data);
      else socket.broadcast.emit('draw_undo', data);
    });

    socket.on('draw_redo', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) socket.broadcast.to(player.roomId).emit('draw_redo', data);
      else socket.broadcast.emit('draw_redo', data);
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
    
    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
      try {
        const player = roomManager.getPlayer(socket.id);
        if (player && player.roomId) {
          const roomId = player.roomId;
          const playerName = player.name;
          const room = roomManager.removePlayerFromRoom(roomId, socket.id);
          if (room) {
            io.to(roomId).emit('room_state_update', {
              roomId: room.id,
              players: room.players,
              gameState: room.gameState
            });
            io.to(roomId).emit('receive_message', {
              id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
              text: `${playerName} غادر الغرفة`,
              type: 'system'
            });
          }
        }
        roomManager.removePlayer(socket.id);
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

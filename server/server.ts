import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { roomManager } from './rooms';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket'],
    maxHttpBufferSize: 1e8 
  });

  roomManager.setIo(io);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: Date.now() });
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    socket.on('join_room', ({ roomId, nickname, avatar, playerId, reconnectOnly }, callback) => {
      try {
        let room = roomManager.reconnectPlayer(roomId, playerId || '', nickname, socket.id);
        let isReconnected = !!room;

        if (room) {
          socket.join(roomId);
        } else {
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
          room = roomManager.addPlayerToRoom(roomId, {
            id: socket.id,
            name: nickname,
            avatar: avatar || nickname.charAt(0).toUpperCase(),
            roomId: roomId,
            score: 0,
            wins: 0,
            persistentId: playerId
          });

          const joinMsg = {
            id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
            text: `${nickname} انضم للغرفة`,
            type: 'system'
          };
          roomManager.saveChatMessage(roomId, joinMsg);
          io.to(roomId).emit('receive_message', joinMsg);
        }

        if (callback) callback({ success: true, reconnected: isReconnected });

        // مزامنة حالة الغرفة والرسم المقتطع فوراً عند الدخول
        const player = roomManager.getPlayer(socket.id);
        if (player && room) {
          roomManager.sendStateToPlayer(room, player);
          if (room.gameState.drawHistory && room.gameState.drawHistory.length > 0) {
            const slicedHistory = room.gameState.drawHistory.slice(-200);
            socket.emit('draw_history_sync', slicedHistory);
          }
        }
      } catch (e) {
        console.error(e);
        if (callback) callback({ error: 'حدث خطأ أثناء الانضمام للغرفة' });
      }
    });

    socket.on('draw_binary', (buf) => {
      const player = roomManager.getPlayer(socket.id);
      const roomId = player ? player.roomId : null;
      if (buf && Buffer.isBuffer(buf) && buf.length > 0 && roomId) {
        const type = buf[0];
        if (type === 5) {
          roomManager.clearDrawHistory(roomId);
          io.to(roomId).emit('draw_binary', buf);
        } else {
          roomManager.recordDrawCommand(roomId, 'draw_binary', buf);
          socket.broadcast.to(roomId).emit('draw_binary', buf);
        }
      }
    });

    socket.on('skip_turn', () => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) roomManager.handleSkipTurn(player.roomId, socket.id);
    });

    socket.on('select_word', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) roomManager.startGameRound(player.roomId, data.word, socket.id);
    });

    socket.on('submit_guess', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) roomManager.submitGuess(player.roomId, socket.id, data.guess);
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
      } catch (e) { console.error(e); }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnect detected: ${socket.id}`);
      roomManager.handleDisconnect(socket.id);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => { res.sendFile(path.join(distPath, 'index.html')); });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

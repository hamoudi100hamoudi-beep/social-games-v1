import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { roomManager } from './server/rooms.js';

const getJsonSafeHistory = (history: any[]) => {
  return (history || []).map(cmd => {
    if (cmd && cmd.data && Buffer.isBuffer(cmd.data)) {
      return {
        event: cmd.event,
        data: Array.from(cmd.data)
      };
    }
    return cmd;
  });
};

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
    console.log(`[Socket] Client connected: ${socket.id}`);

    socket.onAny((eventName) => {
      try {
        const player = roomManager.getPlayer(socket.id);
        if (player) {
          player.lastActivity = Date.now();
        }
      } catch (err) {}
    });
    
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
        const checkRoom = roomManager.getRoom(roomId);
        if (checkRoom && checkRoom.bannedUsers && playerId && checkRoom.bannedUsers.includes(playerId)) {
          console.log(`[Ban Filter] Blocked join/reconnect for banned player ID: ${playerId} in room: ${roomId}`);
          if (callback) callback({ error: 'banned', success: false });
          return;
        }

        const reconnectedRoom = roomManager.reconnectPlayer(roomId, playerId || '', nickname, socket.id);
        if (reconnectedRoom) {
            socket.join(roomId);
            if (callback) callback({ success: true, reconnected: true });
            
            try {
              const player = reconnectedRoom.players.find(p => p.id === socket.id);
              if (player) {
                player.isOffline = false;
                roomManager.sendStateToPlayer(reconnectedRoom, player);

                // Always emit draw_history_sync to guarantee the client's loader disappears instantly
                socket.emit('draw_history_sync', getJsonSafeHistory(reconnectedRoom.gameState.drawHistory || []));
              }
            } catch (syncErr) {
              console.error("[Socket] Error during direct sync in rejoin:", syncErr);
            }
            return;
        }

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

        try {
          const player = roomManager.getPlayer(socket.id);
          if (player) {
            roomManager.sendStateToPlayer(room, player);

            // Always emit draw_history_sync to guarantee the client's loader disappears instantly
            socket.emit('draw_history_sync', getJsonSafeHistory(room.gameState.drawHistory || []));
          }
        } catch (syncErr) {
          console.error("[Socket] Error during direct sync in join:", syncErr);
        }

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
            roomManager.sendStateToPlayer(room, player);
            // Always emit draw_history_sync to guarantee the client's loader disappears instantly
            socket.emit('draw_history_sync', getJsonSafeHistory(room.gameState.drawHistory || []));
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
      const player = roomManager.getPlayer(socket.id);
      const roomId = player ? player.roomId : null;
      
      if (buf && Buffer.isBuffer(buf) && buf.length > 0) {
        const type = buf[0];
        if (roomId) {
          if (type === 5) {
            roomManager.clearDrawHistory(roomId);
            io.to(roomId).emit('draw_binary', buf);
          } else if (type === 7) {
            roomManager.undoLastDrawing(roomId);
            io.to(roomId).emit('draw_binary', buf);
          } else if (type === 8) {
            roomManager.redoDrawing(roomId);
            io.to(roomId).emit('draw_binary', buf);
          } else {
            roomManager.recordDrawCommand(roomId, 'draw_binary', buf);
            socket.broadcast.to(roomId).emit('draw_binary', buf);
          }
        }
      }
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

    socket.on('report_draw', () => {
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        roomManager.reportDrawing(player.roomId, socket.id);
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

          // Send system notification that vote was removed
          const removeAnnounceMsg = {
            id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
            text: `${player.name} ألغى تصويته ضد ${targetPlayer.name} (${currentCount}/${requiredVotes})`,
            type: 'votekick_alert'
          };
          roomManager.saveChatMessage(roomId, removeAnnounceMsg);
          io.to(roomId).emit('receive_message', removeAnnounceMsg);

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
          text: `${player.name} voted للـ kick ضد ${targetPlayer.name} (${currentCount}/${requiredVotes})`,
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
            text: `تم طرد ${kickedName} عن طريق التصويت!`,
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
        }
      } catch (e) {
        console.error("Error in ping_activity event:", e);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected, securing ghost state: ${socket.id}`);
      try {
        const player = roomManager.getPlayer(socket.id);
        if (player && player.roomId) {
          player.isOffline = true;
          
          setTimeout(() => {
            const currentRoom = roomManager.getRoom(player.roomId);
            const currentPlayerState = currentRoom ? currentRoom.players.find(p => p.persistentId === player.persistentId) : null;
            if (!currentPlayerState || currentPlayerState.isOffline) {
              roomManager.handleDisconnect(socket.id);
              console.log(`[Grace Period] Player ${player.name} evicted after timeout.`);
            }
          }, 30000); 
        } else {
          roomManager.handleDisconnect(socket.id);
        }
      } catch (e) {
        console.error("Error during resilient disconnect handling:", e);
        try { roomManager.handleDisconnect(socket.id); } catch (_) {}
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

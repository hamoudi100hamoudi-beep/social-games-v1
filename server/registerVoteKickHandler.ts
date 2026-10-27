export interface VoteKickDependencies {
  io: any;
  roomManager: any;
}

/**
 * Production handler for submit_vote_kick enforcing safe payload validation,
 * quorum calculation, vote toggling, chat announcements, and room eviction/banning.
 */
export function handleSubmitVoteKick(
  socket: any,
  data: any,
  callback: any,
  deps: VoteKickDependencies
): void {
  try {
    const { io, roomManager } = deps;
    if (!socket || !roomManager) return;

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      if (typeof callback === 'function') callback({ success: false, error: 'invalid_payload' });
      return;
    }

    const targetPlayerId = typeof data.targetPlayerId === 'string' ? data.targetPlayerId.trim() : '';
    if (!targetPlayerId) {
      if (typeof callback === 'function') callback({ success: false, error: 'invalid_payload' });
      return;
    }

    const player = roomManager.getPlayer(socket.id);
    if (!player || !player.roomId) {
      if (typeof callback === 'function') callback({ error: 'player_not_found' });
      return;
    }

    const roomId = player.roomId;
    const room = roomManager.getRoom(roomId);
    if (!room) {
      if (typeof callback === 'function') callback({ error: 'room_not_found' });
      return;
    }

    const targetPlayer = room.players.find((p: any) => p.persistentId === targetPlayerId);
    if (!targetPlayer) {
      if (typeof callback === 'function') callback({ error: 'target_not_found' });
      return;
    }

    if (!room.votekicks) room.votekicks = {};
    if (!room.bannedUsers) room.bannedUsers = [];

    const voters = room.votekicks[targetPlayerId] || [];
    const selfId = player.persistentId || player.id;
    const alreadyVoted = voters.includes(selfId);

    // Get total active (not offline) players in the room representing the room's quorum
    const onlineCount = room.players.filter((p: any) => !p.isOffline).length;

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
      const updatedVoters = voters.filter((vId: string) => vId !== selfId);
      room.votekicks[targetPlayerId] = updatedVoters;
      const currentCount = updatedVoters.length;

      if (typeof callback === 'function') callback({ success: true, voted: false, count: currentCount, required: requiredVotes });

      // Update state visually
      roomManager.sendStateToPlayer(room, player);
      roomManager.sendStateToPlayer(room, targetPlayer);
      // Broadcast to all
      room.players.forEach((p: any) => {
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
    if (io) {
      io.to(roomId).emit('receive_message', announceMsg);
    }

    if (currentCount >= requiredVotes) {
      // BANDECISION REACHED! Add target user persistentId/playerId to banned list
      const banId = targetPlayer.persistentId || targetPlayer.id;
      if (!room.bannedUsers.includes(banId)) {
        room.bannedUsers.push(banId);
      }

      // Emit banned to the target player so their client is locked out instantly
      if (io) {
        io.to(targetPlayer.id).emit('banned_from_room');
      }

      // Clean vote mapping for this target user
      delete room.votekicks[targetPlayerId];

      // Disconnect client socket
      const socketToKick = io?.sockets?.sockets?.get ? io.sockets.sockets.get(targetPlayer.id) : null;
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
      if (io) {
        io.to(roomId).emit('receive_message', kickedAnnounce);
      }
    }

    // Update all players
    room.players.forEach((p: any) => {
      roomManager.sendStateToPlayer(room, p);
    });

    if (typeof callback === 'function') callback({ success: true, voted: true, count: currentCount, required: requiredVotes });
  } catch (e) {
    console.error("Error in submit_vote_kick event:", e);
    if (typeof callback === 'function') callback({ error: String(e) });
  }
}

/**
 * Registers submit_vote_kick event listener on a socket using the shared production handler.
 */
export function registerVoteKickHandler(
  socket: any,
  deps: VoteKickDependencies
): void {
  socket.on('submit_vote_kick', (data: any, callback?: any) => {
    handleSubmitVoteKick(socket, data, callback, deps);
  });
}

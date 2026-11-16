import { checkRateLimit } from './rateLimit.js';
import { CONTROL_CHAR_REGEX, markPlayerActive } from './controlInputValidation.js';

export const VOTEKICK_ALERT_COOLDOWN_MS = 60_000;

export interface VotekickAlertCooldownEntry {
  voterId: string;
  targetId: string;
  sentAt: number;
}

export interface VoteKickDependencies {
  io: any;
  roomManager: any;
  voteKickLimits: Map<string, number[]>;
  checkRateLimit: typeof checkRateLimit;
}

/**
 * Production handler for submit_vote_kick enforcing safe payload validation,
 * rate limiting, self-vote protection, quorum calculation, vote toggling,
 * separated votekick_alert notification cooldowns, and room eviction/banning.
 */
export function handleSubmitVoteKick(
  socket: any,
  data: any,
  callback: any,
  deps: VoteKickDependencies
): void {
  try {
    const { io, roomManager, voteKickLimits, checkRateLimit: checkLimitFn } = deps;
    if (!socket || !roomManager) return;

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      if (typeof callback === 'function') callback({ success: false, error: 'invalid_payload' });
      return;
    }

    if (
      typeof data.targetPlayerId !== 'string' ||
      data.targetPlayerId.length > 64 ||
      CONTROL_CHAR_REGEX.test(data.targetPlayerId)
    ) {
      if (typeof callback === 'function') callback({ success: false, error: 'invalid_payload' });
      return;
    }

    const targetPlayerId = data.targetPlayerId.trim();
    if (targetPlayerId.length === 0 || targetPlayerId.length > 64) {
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

    // Rate limit check BEFORE O(N) room.players.find lookup:
    // 3 requests per 2000ms using persistentId || socket.id
    const rateLimitKey = player.persistentId || socket.id;
    const allowed = checkLimitFn(voteKickLimits, rateLimitKey, 3, 2000);
    if (!allowed) {
      if (typeof callback === 'function') callback({ success: false, error: 'rate_limited' });
      return;
    }

    const targetPlayer = room.players.find((p: any) => p.persistentId === targetPlayerId);
    if (!targetPlayer) {
      if (typeof callback === 'function') callback({ error: 'target_not_found' });
      return;
    }

    const selfId = player.persistentId || player.id;
    const targetAuthId = targetPlayer.persistentId || targetPlayer.id;

    // Authoritative self-vote protection using server-side voter and target identities
    if (
      targetPlayer === player ||
      targetPlayer.id === socket.id ||
      targetPlayer.id === player.id ||
      (player.persistentId && targetPlayer.persistentId === player.persistentId) ||
      targetPlayerId === selfId ||
      targetAuthId === selfId
    ) {
      if (typeof callback === 'function') callback({ success: false, error: 'cannot_vote_self' });
      return;
    }

    if (!room.votekicks) room.votekicks = {};
    if (!room.bannedUsers) room.bannedUsers = [];

    const voters = room.votekicks[targetPlayerId] || [];
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
      markPlayerActive(player);

      if (typeof callback === 'function') callback({ success: true, voted: false, count: currentCount, required: requiredVotes });

      // Broadcast updated room state to all room members (includes both voter and target)
      let voterUpdated = false;
      room.players.forEach((p: any) => {
        if (p === player || p.id === player.id) voterUpdated = true;
        roomManager.sendStateToPlayer(room, p);
      });
      if (!voterUpdated) {
        roomManager.sendStateToPlayer(room, player);
      }
      return;
    }

    // Add vote action
    voters.push(selfId);
    room.votekicks[targetPlayerId] = voters;
    const currentCount = voters.length;

    // Separated notification cooldown (60,000ms per (voterId, targetPlayerId) pair)
    // Vote state toggling & quorum checks above remain unaffected.
    const now = Date.now();
    markPlayerActive(player, now);
    if (!(room.votekickAlertCooldowns instanceof Map)) {
      room.votekickAlertCooldowns = new Map<string, VotekickAlertCooldownEntry>();
    }
    const alertCooldowns: Map<string, VotekickAlertCooldownEntry> = room.votekickAlertCooldowns;
    for (const [k, entry] of alertCooldowns.entries()) {
      if (!entry || now - entry.sentAt >= VOTEKICK_ALERT_COOLDOWN_MS) {
        alertCooldowns.delete(k);
      }
    }

    const pairKey = `${selfId.length}:${selfId}:${targetAuthId}`;
    const existingAlert = alertCooldowns.get(pairKey);
    if (!existingAlert || now - existingAlert.sentAt >= VOTEKICK_ALERT_COOLDOWN_MS) {
      alertCooldowns.set(pairKey, { voterId: selfId, targetId: targetAuthId, sentAt: now });

      // Visual Chat alert styled dynamic
      const announceMsg = {
        id: 'votekick-' + now.toString() + Math.random().toString(36).substr(2, 5),
        text: `${player.name} voted to kick out ${targetPlayer.name}`,
        voterName: player.name,
        targetName: targetPlayer.name,
        type: 'votekick_alert'
      };
      roomManager.saveChatMessage(roomId, announceMsg);
      if (io) {
        io.to(roomId).emit('receive_message', announceMsg);
      }
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

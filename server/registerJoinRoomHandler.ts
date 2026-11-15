import type { Server, Socket } from 'socket.io';
import { CONTROL_CHAR_REGEX } from './controlInputValidation.js';

export interface JoinRoomDependencies {
  io?: any;
  roomManager: any;
  getRoomConfig?: (roomId: string) => any;
  getJsonSafeHistory?: (history: any[]) => any[];
}

export interface JoinRoomPayload {
  roomId: string;
  nickname: string;
  avatar?: string;
  playerId: string;
  reconnectOnly?: boolean;
  supportsType13?: boolean;
  reconnectSecret?: string;
}

export type JoinRoomCallback = (res: any) => void;

/**
 * Normalizes nickname for duplicate detection according to standard game rules:
 * NFKC normalization, Arabic letter unification (alif, taa marbuta, yaa), diacritics removal, trimming, lowercase.
 */
export const normalizeNickname = (str: string): string => {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFKC')
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F]/g, "")
    .trim()
    .toLowerCase();
};

/**
 * Production join_room handler. Shared between server.ts and test suite.
 */
export function handleJoinRoom(
  socket: any,
  payload: JoinRoomPayload,
  callback: JoinRoomCallback | undefined,
  deps: JoinRoomDependencies
): void {
  const { io, roomManager, getRoomConfig, getJsonSafeHistory } = deps;
  const reply = (res: any) => {
    if (typeof callback === 'function') {
      callback(res);
    }
  };

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    reply({ error: 'invalid_payload', success: false });
    return;
  }

  const { roomId, nickname, avatar, playerId, reconnectOnly, supportsType13, reconnectSecret } = payload;

  if (reconnectOnly !== undefined && typeof reconnectOnly !== 'boolean') {
    reply({ error: 'invalid_payload', success: false, reason: 'invalid_reconnect_only' });
    return;
  }

  if (supportsType13 !== undefined && typeof supportsType13 !== 'boolean') {
    reply({ error: 'invalid_payload', success: false, reason: 'invalid_capabilities' });
    return;
  }

  if (typeof roomId !== 'string' || roomId.length > 100 || CONTROL_CHAR_REGEX.test(roomId)) {
    reply({ error: 'invalid_payload', success: false, reason: 'invalid_room_id' });
    return;
  }

  if (
    typeof nickname !== 'string' ||
    nickname.length > 32 ||
    CONTROL_CHAR_REGEX.test(nickname)
  ) {
    reply({ error: 'invalid_payload', success: false, reason: 'invalid_nickname' });
    return;
  }
  const trimmedNickname = nickname.trim();
  if (trimmedNickname.length === 0 || trimmedNickname.length > 24) {
    reply({ error: 'invalid_payload', success: false, reason: 'invalid_nickname' });
    return;
  }

  if (avatar !== undefined) {
    if (
      typeof avatar !== 'string' ||
      avatar.length > 32 ||
      CONTROL_CHAR_REGEX.test(avatar) ||
      (avatar.length > 0 && avatar.trim().length === 0)
    ) {
      reply({ error: 'invalid_payload', success: false, reason: 'invalid_avatar' });
      return;
    }
  }

  if (!playerId || typeof playerId !== 'string') {
    console.warn(`[Join Filter] Rejecting join without playerId from socket: ${socket.id}`);
    reply({ error: 'unauthorized', success: false, reason: 'missing_player_id' });
    return;
  }
  if (playerId.length > 64 || CONTROL_CHAR_REGEX.test(playerId)) {
    reply({ error: 'unauthorized', success: false, reason: 'invalid_player_id' });
    return;
  }
  const trimmedPlayerId = playerId.trim();
  if (trimmedPlayerId.length === 0) {
    console.warn(`[Join Filter] Rejecting join without playerId from socket: ${socket.id}`);
    reply({ error: 'unauthorized', success: false, reason: 'missing_player_id' });
    return;
  }
  if (trimmedPlayerId.length < 3) {
    reply({ error: 'unauthorized', success: false, reason: 'invalid_player_id' });
    return;
  }

  if (
    reconnectSecret !== undefined &&
    (typeof reconnectSecret !== 'string' || reconnectSecret.length > 128 || CONTROL_CHAR_REGEX.test(reconnectSecret))
  ) {
    reply({ error: 'unauthorized', success: false, reason: 'invalid_credentials' });
    return;
  }

  try {
    if (!roomManager.isValidRoomId(roomId)) {
      console.warn(`[Join Filter] Rejecting join to invalid/non-existent room: ${roomId}`);
      reply({ error: 'room_not_found', success: false });
      return;
    }

    const checkRoom = roomManager.getRoom(roomId);
    if (checkRoom) {
      if (!checkRoom.bannedUsers) checkRoom.bannedUsers = [];
      if (!checkRoom.votekicks) checkRoom.votekicks = {};

      const isUserBanned = (playerId && checkRoom.bannedUsers.includes(playerId)) || checkRoom.bannedUsers.includes(socket.id);
      if (isUserBanned) {
        console.log(`[Ban Filter] Blocked join/reconnect for banned player ID: ${playerId || socket.id} in room: ${roomId}`);
        reply({ error: 'banned', success: false });
        return;
      }
    }

    const reconnectRes = roomManager.reconnectPlayer(roomId, playerId, nickname, socket.id, reconnectSecret);
    if (reconnectRes.status === 'auth_failed') {
      console.warn(`[AUTH REJECTED] Unauthorized reconnect attempt for player ID: ${playerId || 'N/A'} in room: ${roomId}`);
      reply({ error: 'unauthorized', success: false, reason: reconnectRes.reason });
      return;
    }

    if (reconnectRes.status === 'reconnected') {
      if (supportsType13 && typeof roomManager.setClientCapabilities === 'function') {
        roomManager.setClientCapabilities(socket.id, { supportsType13: true });
      }
      const reconnectedRoom = reconnectRes.room;
      if (typeof socket.join === 'function') {
        socket.join(roomId);
      }
      reply({ success: true, reconnected: true });

      try {
        const player = reconnectedRoom.players.find((p: any) => p.id === socket.id);
        if (player) {
          player.isOffline = false;
          if (typeof roomManager.sendStateToPlayer === 'function') {
            roomManager.sendStateToPlayer(reconnectedRoom, player);
          }

          // Always emit draw_history_sync to guarantee the client's loader disappears instantly
          if (getJsonSafeHistory) {
            socket.emit('draw_history_sync', getJsonSafeHistory(reconnectedRoom.gameState?.drawHistory || []));
            socket.emit('draw_redo_sync', getJsonSafeHistory(reconnectedRoom.gameState?.redoStack || []));
          } else {
            socket.emit('draw_history_sync', reconnectedRoom.gameState?.drawHistory || []);
            socket.emit('draw_redo_sync', reconnectedRoom.gameState?.redoStack || []);
          }
          if (typeof roomManager.syncActiveFreeDrawStrokesToSocket === 'function') {
            roomManager.syncActiveFreeDrawStrokesToSocket(reconnectedRoom, socket);
          }
        }
      } catch (syncErr) {
        console.error("[Socket] Error during direct sync in rejoin:", syncErr);
      }
      return;
    }

    if (reconnectOnly) {
      if (callback) callback({ error: 'session_expired', reason: 'connection_lost' });
      socket.emit('session_expired', { reason: 'connection_lost' });
      return;
    }

    // --- NEW JOIN AUTHENTICATION GATE (Phase 1: Verification without registration) ---
    const authJoinRes = roomManager.validateJoinIdentity(playerId, reconnectSecret, socket.id);
    if (!authJoinRes.ok) {
      console.warn(`[AUTH REJECTED] Join rejected for playerId: ${playerId || 'N/A'}, reason: ${authJoinRes.reason}`);
      if (authJoinRes.reason === 'auth_store_full') {
        if (callback) callback({ error: 'auth_store_full', success: false, reason: 'auth_store_full' });
      } else {
        if (callback) callback({ error: 'unauthorized', success: false, reason: authJoinRes.reason });
      }
      return;
    }

    // --- Check Room conditions (Nickname taken & Capacity) ---
    const existingRoom = roomManager.getRoom(roomId);
    if (existingRoom) {
      const normIncoming = normalizeNickname(nickname);
      const isNicknameTaken = existingRoom.players.some((p: any) => normalizeNickname(p.name) === normIncoming);
      if (isNicknameTaken) {
        if (callback) callback({ error: 'nickname_taken', success: false });
        return;
      }
    }

    const maxCapacity = existingRoom?.maxPlayers || (getRoomConfig ? getRoomConfig(roomId).maxPlayers : 5);
    const onlinePlayersCount = existingRoom ? existingRoom.players.filter((p: any) => !p.isOffline).length : 0;
    if (existingRoom && onlinePlayersCount >= maxCapacity) {
      if (callback) callback({ error: 'عذراً، هذه الغرفة ممتلئة بالكامل!' });
      return;
    }

    // --- NEW JOIN AUTHENTICATION GATE (Phase 2: Commit initial credential ONLY after join conditions pass) ---
    if (authJoinRes.isNew) {
      const regOk = roomManager.commitNewJoinCredential(authJoinRes.cleanPid, reconnectSecret!);
      if (!regOk) {
        console.warn(`[AUTH REJECTED] Failed to register credential for playerId: ${playerId} (auth store full)`);
        if (callback) callback({ error: 'auth_store_full', success: false, reason: 'auth_store_full' });
        return;
      }
    }

    if (supportsType13 && typeof roomManager.setClientCapabilities === 'function') {
      roomManager.setClientCapabilities(socket.id, { supportsType13: true });
    }
    if (typeof socket.join === 'function') {
      socket.join(roomId);
    }
    const room = roomManager.addPlayerToRoom(roomId, {
      id: socket.id,
      name: nickname,
      avatar: avatar || nickname.charAt(0).toUpperCase(),
      roomId: roomId,
      score: 0,
      wins: 0,
      persistentId: authJoinRes.cleanPid
    });

    if (callback) callback({ success: true, reconnected: false });

    try {
      // Always emit draw_history_sync to guarantee the client's loader disappears instantly
      if (getJsonSafeHistory) {
        socket.emit('draw_history_sync', getJsonSafeHistory(room.gameState?.drawHistory || []));
        socket.emit('draw_redo_sync', getJsonSafeHistory(room.gameState?.redoStack || []));
      } else {
        socket.emit('draw_history_sync', room.gameState?.drawHistory || []);
        socket.emit('draw_redo_sync', room.gameState?.redoStack || []);
      }
      if (typeof roomManager.syncActiveFreeDrawStrokesToSocket === 'function') {
        roomManager.syncActiveFreeDrawStrokesToSocket(room, socket);
      }
    } catch (syncErr) {
      console.error("[Socket] Error during direct sync in join:", syncErr);
    }

    const joinMsg = {
      id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
      text: `${nickname} انضم للغرفة`,
      type: 'system'
    };
    if (typeof roomManager.saveChatMessage === 'function') {
      roomManager.saveChatMessage(roomId, joinMsg);
    }
    if (io && typeof io.to === 'function') {
      io.to(roomId).emit('receive_message', joinMsg);
    }
  } catch (e) {
    console.error(e);
    if (callback) callback({ error: 'حدث خطأ أثناء الانضمام للغرفة' });
  }
}

/**
 * Registers the join_room event listener on a socket using the shared production handler.
 */
export function registerJoinRoomHandler(
  socket: any,
  deps: JoinRoomDependencies
): void {
  socket.on('join_room', (payload: JoinRoomPayload, callback?: JoinRoomCallback) => {
    handleJoinRoom(socket, payload, callback, deps);
  });
}

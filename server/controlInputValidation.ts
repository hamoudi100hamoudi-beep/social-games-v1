import { checkRateLimit, ControlRateLimiter, defaultControlRateLimiter } from './rateLimit.js';

export const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F-\u009F]/;

export function hasControlCharacters(value: string): boolean {
  return CONTROL_CHAR_REGEX.test(value);
}

export type SanitizedClientCapabilitiesResult =
  | { valid: true; hasSupportsType13: true; supportsType13: boolean }
  | { valid: true; hasSupportsType13: false }
  | { valid: false };

/**
 * Validates and extracts only the supported `supportsType13` boolean capability.
 * Rejects null, primitives, Arrays, and non-boolean `supportsType13` values.
 * Never retains unknown properties or nested blobs.
 */
export function sanitizeClientCapabilities(caps: unknown): SanitizedClientCapabilitiesResult {
  if (!caps || typeof caps !== 'object' || Array.isArray(caps)) {
    return { valid: false };
  }

  const rawSupportsType13 = (caps as { supportsType13?: unknown }).supportsType13;
  if (rawSupportsType13 !== undefined) {
    if (typeof rawSupportsType13 !== 'boolean') {
      return { valid: false };
    }
    return { valid: true, hasSupportsType13: true, supportsType13: rawSupportsType13 };
  }

  return { valid: true, hasSupportsType13: false };
}

export interface GetRoomInfoDependencies {
  roomManager: {
    getRoom: (roomId: string) => any;
  };
  getRoomConfig: (roomId: string) => {
    maxPlayers: number;
    winningScore: number;
    theme: string;
  };
  controlRateLimiter?: ControlRateLimiter;
  socketId?: string;
}

/**
 * Production handler for `get_room_info` enforcing early roomId type/length/non-empty checks
 * prior to calling `getRoom` / `getRoomConfig`, preventing TypeError or console.error spam,
 * plus optional per-socket rate limiting with safe callback resolution.
 */
export function handleGetRoomInfo(
  roomId: unknown,
  callback: unknown,
  deps: GetRoomInfoDependencies
): { count: number; max: number; winningScore: number; theme: string } | { error: 'rate_limited' } {
  if (deps.controlRateLimiter) {
    if (!deps.controlRateLimiter.consume(deps.socketId || '', 'get_room_info')) {
      const rateLimitedRes = { error: 'rate_limited' as const };
      if (typeof callback === 'function') {
        try {
          callback(rateLimitedRes);
        } catch (cbErr) {
          console.error('Error executing throttled get_room_info callback:', cbErr);
        }
      }
      return rateLimitedRes;
    }
  }

  let roomInfo = { count: 0, max: 5, winningScore: 30, theme: 'General' };

  try {
    if (typeof roomId === 'string' && roomId.length <= 100 && !CONTROL_CHAR_REGEX.test(roomId)) {
      const trimmedRoomId = roomId.trim();
      if (trimmedRoomId.length > 0) {
        const room =
          deps.roomManager.getRoom(roomId) ??
          (trimmedRoomId !== roomId ? deps.roomManager.getRoom(trimmedRoomId) : undefined);
        const config = deps.getRoomConfig(trimmedRoomId);
        const count = room ? room.players.filter((p: any) => !p.isOffline).length : 0;
        const max = room?.maxPlayers ?? config.maxPlayers;
        const winningScore = room?.winningScore ?? config.winningScore;
        const theme = room?.theme ?? config.theme;
        roomInfo = { count, max, winningScore, theme };
      }
    }
  } catch (e) {
    console.error('Error computing room info for get_room_info:', e);
  }

  if (typeof callback === 'function') {
    try {
      callback(roomInfo);
    } catch (cbErr) {
      console.error('Error executing get_room_info callback:', cbErr);
    }
  }

  return roomInfo;
}

export interface DrawRepairDependencies {
  roomManager: {
    getPlayer: (socketId: string) => any;
    getCanonicalFreeDrawStroke: (roomId: string, instId: string, strokeId: number) => Buffer | null;
  };
  drawRepairLimits: Map<string, number[]>;
  checkRateLimit?: typeof checkRateLimit;
  limit?: number;
  windowMs?: number;
}

/**
 * Production handler for `draw_repair_req` enforcing raw instId length <= 16 before trim(),
 * strict alphanumeric 1..7 instId, integer strokeId 0..65535, and 20 req / 1000ms rate limit.
 */
export function handleDrawRepairReq(
  socket: any,
  data: any,
  deps: DrawRepairDependencies
): void {
  try {
    const {
      roomManager,
      drawRepairLimits,
      checkRateLimit: checkLimitFn = checkRateLimit,
      limit = 20,
      windowMs = 1000,
    } = deps;
    if (!socket || !roomManager) return;

    const player = roomManager.getPlayer(socket.id);
    if (!player || !player.roomId) return;
    const roomId = player.roomId;

    // 1. Strict Input Validation (silent rejection)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;

    if (typeof data.instId !== 'string' || data.instId.length > 16) return;
    const trimmedInstId = data.instId.trim();
    if (trimmedInstId.length < 1 || trimmedInstId.length > 7 || !/^[a-zA-Z0-9]+$/.test(trimmedInstId)) {
      return;
    }

    if (typeof data.strokeId !== 'number' || !Number.isInteger(data.strokeId)) return;
    if (data.strokeId < 0 || data.strokeId > 65535) return;

    // 2. Per-player room rate limiting
    const rateLimitKey = `${roomId}:${player.persistentId || socket.id}`;
    if (!checkLimitFn(drawRepairLimits, rateLimitKey, limit, windowMs)) {
      return;
    }

    // 3. Retrieve canonical Type 9 stroke from cache and emit ONLY to requesting socket
    const canonicalStroke = roomManager.getCanonicalFreeDrawStroke(roomId, trimmedInstId, data.strokeId);
    if (canonicalStroke) {
      socket.emit('draw_binary', canonicalStroke);
    }
  } catch (err) {
    console.error('Error handling draw_repair_req:', err);
  }
}

export interface FreeDrawToggleDependencies {
  roomManager: {
    getPlayer: (socketId: string) => any;
    startFreeDraw: (roomId: string, socketId: string) => void;
    stopFreeDraw: (roomId: string, socketId: string) => void;
  };
  controlRateLimiter?: ControlRateLimiter;
}

/**
 * Production handler for `start_free_draw` enforcing shared per-socket toggle rate limit.
 */
export function handleStartFreeDraw(
  socket: any,
  deps: FreeDrawToggleDependencies
): void {
  try {
    const { roomManager } = deps;
    if (!socket || !roomManager) return;

    const player = roomManager.getPlayer(socket.id);
    if (!player || !player.roomId) return;

    const limiter =
      deps.controlRateLimiter ??
      (typeof socket.id === 'string' && socket.id.length > 0 ? defaultControlRateLimiter : undefined);
    if (limiter && !limiter.consume(socket.id, 'free_draw_toggle')) {
      return;
    }

    roomManager.startFreeDraw(player.roomId, socket.id);
  } catch (err) {
    console.error('Error in handleStartFreeDraw:', err);
  }
}

/**
 * Production handler for `stop_free_draw` enforcing shared per-socket toggle rate limit.
 */
export function handleStopFreeDraw(
  socket: any,
  deps: FreeDrawToggleDependencies
): void {
  try {
    const { roomManager } = deps;
    if (!socket || !roomManager) return;

    const player = roomManager.getPlayer(socket.id);
    if (!player || !player.roomId) return;

    const limiter =
      deps.controlRateLimiter ??
      (typeof socket.id === 'string' && socket.id.length > 0 ? defaultControlRateLimiter : undefined);
    if (limiter && !limiter.consume(socket.id, 'free_draw_toggle')) {
      return;
    }

    roomManager.stopFreeDraw(player.roomId, socket.id);
  } catch (err) {
    console.error('Error in handleStopFreeDraw:', err);
  }
}

export interface RequestDrawingIdentitiesDependencies {
  roomManager: {
    getPlayer: (socketId: string) => any;
    getDrawingIdentitiesForRoom: (roomId: string) => any;
  };
  controlRateLimiter?: ControlRateLimiter;
}

/**
 * Production handler for `request_drawing_identities` enforcing per-socket rate limit.
 */
export function handleRequestDrawingIdentities(
  socket: any,
  deps: RequestDrawingIdentitiesDependencies
): void {
  try {
    const { roomManager } = deps;
    if (!socket || !roomManager) return;

    const player = roomManager.getPlayer(socket.id);
    if (!player || !player.roomId) return;

    const limiter =
      deps.controlRateLimiter ??
      (typeof socket.id === 'string' && socket.id.length > 0 ? defaultControlRateLimiter : undefined);
    if (limiter && !limiter.consume(socket.id, 'request_drawing_identities')) {
      return;
    }

    const identities = roomManager.getDrawingIdentitiesForRoom(player.roomId);
    if (identities) {
      socket.emit('drawing_identities_update', identities);
    }
  } catch (err) {
    console.error('Error handling request_drawing_identities:', err);
  }
}

export interface PlayerActivityTarget {
  lastActivity?: number;
  afkWarningSent?: boolean;
}

/**
 * Updates player AFK activity timestamp and clears any prior warning flag in O(1) without allocations.
 */
export function markPlayerActive(
  player: PlayerActivityTarget | null | undefined,
  now: number = Date.now()
): void {
  if (!player) return;
  player.lastActivity = now;
  player.afkWarningSent = false;
}

/**
 * Production handler for `ping_activity` preserving explicit AFK modal recovery.
 */
export function handlePingActivity(
  socket: any,
  roomManager: { getPlayer: (socketId: string) => PlayerActivityTarget | undefined },
  now: number = Date.now()
): void {
  try {
    if (!socket || !roomManager) return;
    const player = roomManager.getPlayer(socket.id);
    if (!player || player.afkWarningSent !== true) return;
    markPlayerActive(player, now);
  } catch (e) {
    console.error('Error in ping_activity event:', e);
  }
}

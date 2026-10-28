import { RoomConfig } from '../src/types/game.js';

export const MAX_REQUESTED_ROOM_IDS = 10;

export interface RoomStatsEntry {
  count: number;
  max: number;
  winningScore: number;
  theme: string;
}

export interface GetRoomsInfoDependencies {
  roomManager: {
    getRoom: (roomId: string) => any;
    isValidRoomId: (roomId: unknown) => boolean;
  };
  getRoomConfig: (roomId: string) => any;
  ROOM_PRESETS: RoomConfig[];
}

export function handleGetRoomsInfo(
  roomIdsOrCallback: unknown,
  maybeCallback: unknown,
  deps: GetRoomsInfoDependencies
): Record<string, RoomStatsEntry> {
  const callback = typeof roomIdsOrCallback === 'function' ? roomIdsOrCallback : maybeCallback;

  let requestedIds: string[];

  if (Array.isArray(roomIdsOrCallback)) {
    const rawSlice = roomIdsOrCallback.slice(0, MAX_REQUESTED_ROOM_IDS);
    const validRoomIds: string[] = [];
    const seenLower = new Set<string>();

    for (const rawId of rawSlice) {
      if (typeof rawId !== 'string') continue;
      const cleanId = rawId.trim();
      if (cleanId.length === 0 || cleanId.length > 100) continue;
      if (!deps.roomManager.isValidRoomId(cleanId)) continue;

      const lower = cleanId.toLowerCase();
      if (seenLower.has(lower)) continue;
      seenLower.add(lower);
      validRoomIds.push(cleanId);
    }
    requestedIds = validRoomIds;
  } else {
    requestedIds = deps.ROOM_PRESETS.map((p) => p.id);
  }

  const stats: Record<string, RoomStatsEntry> = Object.create(null);

  for (const id of requestedIds) {
    const room = deps.roomManager.getRoom(id);
    const config = deps.getRoomConfig(id);
    const count = room ? room.players.filter((p: any) => !p.isOffline).length : 0;
    stats[id] = {
      count,
      max: room?.maxPlayers ?? config.maxPlayers,
      winningScore: room?.winningScore ?? config.winningScore,
      theme: room?.theme ?? config.theme,
    };
  }

  if (typeof callback === 'function') {
    try {
      callback(stats);
    } catch (cbErr) {
      console.error("Error in get_rooms_info callback:", cbErr);
    }
  }

  return stats;
}

export function registerGetRoomsInfoHandler(
  socket: any,
  deps: GetRoomsInfoDependencies
) {
  socket.on('get_rooms_info', (roomIdsOrCallback: unknown, maybeCallback: unknown) => {
    try {
      handleGetRoomsInfo(roomIdsOrCallback, maybeCallback, deps);
    } catch (e) {
      console.error("Error in get_rooms_info:", e);
      const cb = typeof roomIdsOrCallback === 'function' ? roomIdsOrCallback : maybeCallback;
      if (typeof cb === 'function') {
        try {
          cb(Object.create(null));
        } catch {}
      }
    }
  });
}

export interface RequestRoundSyncDependencies {
  roomManager: any;
  roundSyncLimits: Map<string, number[]>;
  checkRateLimit: (map: Map<string, number[]>, key: string, limit: number, windowMs: number) => boolean;
  getJsonSafeHistory: (history: any[]) => any[];
}

export function handleRequestRoundSync(
  socket: any,
  callback: any,
  deps: RequestRoundSyncDependencies
) {
  try {
    const player = deps.roomManager.getPlayer(socket.id);
    if (player && player.roomId) {
      const room = deps.roomManager.getRoom(player.roomId);
      if (room) {
        const identifier = player.persistentId || socket.id;
        const rateLimitKey = `${player.roomId}:${identifier}`;

        if (!deps.checkRateLimit(deps.roundSyncLimits, rateLimitKey, 1, 1000)) {
          if (typeof callback === 'function') {
            callback({
              success: false,
              error: 'rate_limited',
              retryAfterMs: 1000
            });
          }
          return;
        }

        deps.roomManager.sendStateToPlayer(room, player);
        socket.emit('draw_history_sync', deps.getJsonSafeHistory(room.gameState.drawHistory || []));
        socket.emit('draw_redo_sync', deps.getJsonSafeHistory(room.gameState.redoStack || []));
        deps.roomManager.syncActiveFreeDrawStrokesToSocket(room, socket);

        if (typeof callback === 'function') {
          callback({ success: true });
        }
      }
    }
  } catch (e) {
    console.error("Error in request_round_sync:", e);
  }
}

export function registerRequestRoundSyncHandler(
  socket: any,
  deps: RequestRoundSyncDependencies
) {
  socket.on('request_round_sync', (callback?: any) => {
    handleRequestRoundSync(socket, callback, deps);
  });
}

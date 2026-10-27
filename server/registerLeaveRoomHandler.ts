export interface LeaveRoomDependencies {
  io?: any;
  roomManager: any;
}

/**
 * Production handler for leave_room enforcing server-authoritative room membership,
 * safe payload validation, and protecting rooms against client-spoofed roomId attacks.
 */
export function handleLeaveRoom(
  socket: any,
  data: any,
  deps: LeaveRoomDependencies
): void {
  try {
    const { io, roomManager } = deps;
    if (!socket || !roomManager) return;

    // 1. Look up player strictly on the server by socket.id
    const player = roomManager.getPlayer(socket.id);
    if (!player || !player.roomId) {
      // The player is not in any room: safe no-op.
      return;
    }

    // 2. Authoritative roomId comes strictly from server state
    const actualRoomId = player.roomId;
    const playerName = player.name || 'لاعب';

    // 3. Socket leaves the authoritative room in Socket.IO
    if (typeof socket.leave === 'function') {
      socket.leave(actualRoomId);
      // If client supplied a different roomId string in payload, also leave it defensively
      if (
        data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        typeof data.roomId === 'string' &&
        data.roomId !== actualRoomId
      ) {
        socket.leave(data.roomId);
      }
    }

    // 4. Remove player from their actual room in roomManager
    const room = roomManager.removePlayerFromRoom(actualRoomId, socket.id);

    // 5. If room still exists, save and broadcast leave notification to actual room
    if (room) {
      const leaveMsg = {
        id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
        text: `${playerName} غادر الغرفة`,
        type: 'system'
      };
      roomManager.saveChatMessage(actualRoomId, leaveMsg);
      if (io) {
        io.to(actualRoomId).emit('receive_message', leaveMsg);
      }
    }
  } catch (err) {
    console.error("Error in handleLeaveRoom:", err);
  }
}

/**
 * Registers the leave_room event listener on a socket using the shared production handler.
 */
export function registerLeaveRoomHandler(
  socket: any,
  deps: LeaveRoomDependencies
): void {
  socket.on('leave_room', (data: any) => {
    handleLeaveRoom(socket, data, deps);
  });
}

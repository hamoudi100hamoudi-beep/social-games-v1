export interface Player {
  id: string; // Socket ID
  name: string;
  avatar: string;
  roomId: string | null;
}

export interface Room {
  id: string;
  players: Player[];
  // Future: gameState, roomSettings, etc.
}

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private players: Map<string, Player> = new Map();

  createRoom(roomId: string): Room {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, { id: roomId, players: [] });
    }
    return this.rooms.get(roomId)!;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  addPlayerToRoom(roomId: string, player: Player): Room {
    const room = this.createRoom(roomId);
    
    // Remove from previous room if any
    const existingPlayer = this.players.get(player.id);
    if (existingPlayer && existingPlayer.roomId && existingPlayer.roomId !== roomId) {
      this.removePlayerFromRoom(existingPlayer.roomId, player.id);
    }
    
    player.roomId = roomId;
    this.players.set(player.id, player);
    
    // Add to new room if not already in it
    if (!room.players.find(p => p.id === player.id)) {
      room.players.push(player);
    }
    return room;
  }

  removePlayerFromRoom(roomId: string, socketId: string): Room | undefined {
    const room = this.rooms.get(roomId);
    if (room) {
      room.players = room.players.filter(p => p.id !== socketId);
      
      const player = this.players.get(socketId);
      if (player) {
        player.roomId = null;
      }
      
      // We can choose to keep empty rooms for a while, or delete them
      if (room.players.length === 0) {
        this.rooms.delete(roomId);
        return undefined; // Room deleted
      }
    }
    return room;
  }

  getPlayer(socketId: string): Player | undefined {
    return this.players.get(socketId);
  }

  removePlayer(socketId: string) {
    const player = this.players.get(socketId);
    if (player && player.roomId) {
      this.removePlayerFromRoom(player.roomId, socketId);
    }
    this.players.delete(socketId);
  }
}

export const roomManager = new RoomManager();

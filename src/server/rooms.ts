import { Player, Room, GameState } from '../types/game.js';

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private players: Map<string, Player> = new Map();

  createRoom(roomId: string): Room {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, { 
        id: roomId, 
        players: [],
        gameState: {
          status: 'waiting',
          currentDrawerId: null,
          currentWord: null
        }
      });
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
    try {
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
    } catch (e) {
      console.error("Error removing player from room:", e);
      return undefined;
    }
  }

  getPlayer(socketId: string): Player | undefined {
    return this.players.get(socketId);
  }

  removePlayer(socketId: string) {
    try {
      const player = this.players.get(socketId);
      if (player && player.roomId) {
        this.removePlayerFromRoom(player.roomId, socketId);
      }
      this.players.delete(socketId);
    } catch (e) {
      console.error("Error removing player:", e);
    }
  }
}

export const roomManager = new RoomManager();

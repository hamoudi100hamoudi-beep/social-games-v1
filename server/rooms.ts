import { Server } from 'socket.io';
import { Player, Room, GameState } from '../types/game.js';

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private players: Map<string, Player> = new Map();
  private io: Server | null = null;
  private tickInterval: NodeJS.Timeout | null = null;

  setIo(io: Server) {
    this.io = io;
    if (!this.tickInterval) {
      this.tickInterval = setInterval(() => this.tick(), 1000);
      console.log('[Game Engine] Global tick loop started (1s interval)');
    }
  }

  private tick() {
    this.rooms.forEach(room => {
      this.processRoomTick(room);
    });
  }

  private processRoomTick(room: Room) {
    const { gameState } = room;

    if (gameState.status === 'WAITING') {
      if (room.players.length >= 2) {
        this.transitionToChoosing(room);
      }
    } else if (gameState.status === 'CHOOSING') {
      gameState.timeLeft--;
      if (gameState.timeLeft <= 0) {
        // Player missed their turn
        if (this.io) {
          const sysId = 'sys-' + Date.now();
          const player = this.players.get(gameState.currentDrawerId as string);
          const name = player ? player.name : 'Unknown';
          this.io.to(room.id).emit('receive_message', {
            id: sysId,
            senderId: gameState.currentDrawerId,
            text: `${name} has lost the turn`,
            type: 'system'
          });
        }
        this.transitionToChoosing(room); // Next player
      }
    } else if (gameState.status === 'DRAWING') {
      gameState.timeLeft--;
      if (gameState.timeLeft <= 0) {
        // Time is up
        this.transitionToRoundEnd(room);
      } else if (gameState.correctGuessers.length > 0 && gameState.correctGuessers.length === room.players.length - 1) {
        // Everyone guessed correctly
        this.transitionToRoundEnd(room);
      }
    } else if (gameState.status === 'ROUND_END') {
      gameState.timeLeft--;
      if (gameState.timeLeft <= 0) {
        this.transitionToChoosing(room);
      }
    } else if (gameState.status === 'PODIUM') {
      gameState.timeLeft--;
      if (gameState.timeLeft <= 0) {
        // Find highest scorer (top player)
        const sorted = [...room.players].sort((a, b) => b.score - a.score);
        if (sorted.length > 0 && sorted[0].score > 0) {
           sorted[0].wins += 1;
        }
        
        // Reset scores
        room.players.forEach(p => p.score = 0);
        
        // Since we broadcast waiting, it clears the board
        this.transitionToWaiting(room);
      }
    }

    if (this.io) {
       this.io.to(room.id).emit('timer_tick', { timeLeft: gameState.timeLeft, status: gameState.status });
    }
  }

  private transitionToWaiting(room: Room) {
    console.log(`[Room ${room.id}] Transitioning to WAITING`);
    room.gameState.status = 'WAITING';
    room.gameState.currentDrawerId = null;
    room.gameState.currentWord = null;
    room.gameState.wordOptions = [];
    room.gameState.correctGuessers = [];
    room.gameState.timeLeft = 0;
    
    if (room.players.length >= 2) {
       return this.transitionToChoosing(room);
    }
    
    this.broadcastState(room);
  }

  private transitionToChoosing(room: Room) {
    if (room.players.length < 2) {
       return this.transitionToWaiting(room);
    }
    
    // Logic for next turn
    let nextDrawerId = room.gameState.turnQueue.shift();
    if (nextDrawerId) {
      // Put them at the back of the queue
      room.gameState.turnQueue.push(nextDrawerId); 
      // Verify player is still in room
      if (!room.players.find(p => p.id === nextDrawerId)) {
        return this.transitionToChoosing(room); // Recursive call if player left
      }
    } else {
       return this.transitionToWaiting(room);
    }

    const SAMPLE_WORDS = ['تفاحة', 'سيارة', 'كتاب', 'طائرة', 'منزل', 'فيل', 'بطيخ', 'كمبيوتر', 'بحر', 'قمر', 'شجرة', 'شمس', 'قرد', 'جمل', 'سفينة'];
    const shuffled = [...SAMPLE_WORDS].sort(() => 0.5 - Math.random());

    console.log(`[Room ${room.id}] Transitioning to CHOOSING. Drawer: ${nextDrawerId}`);
    room.gameState.status = 'CHOOSING';
    room.gameState.currentDrawerId = nextDrawerId;
    room.gameState.currentWord = null;
    room.gameState.wordOptions = shuffled.slice(0, 2);
    room.gameState.correctGuessers = [];
    room.gameState.hintsUsed = 0;
    room.gameState.revealedIndices = [];
    room.gameState.timeLeft = 9;
    
    if (this.io) {
       this.io.to(room.id).emit('draw_clear', { instanceId: 'system' });
    }
    
    this.broadcastState(room);
  }

  private transitionToPodium(room: Room) {
    console.log(`[Room ${room.id}] Transitioning to PODIUM`);
    room.gameState.status = 'PODIUM';
    room.gameState.timeLeft = 9;
    this.broadcastState(room);
  }

  private transitionToRoundEnd(room: Room) {
    const winner = room.players.find(p => p.score >= 120);
    if (winner) {
      return this.transitionToPodium(room);
    }
    
    console.log(`[Room ${room.id}] Transitioning to ROUND_END`);
    room.gameState.status = 'ROUND_END';
    room.gameState.timeLeft = 8;
    this.broadcastState(room);
  }

  public startGameRound(roomId: string, word: string, socketId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.gameState.status !== 'CHOOSING' || room.gameState.currentDrawerId !== socketId) return;

    room.gameState.currentWord = word;
    room.gameState.status = 'DRAWING';
    room.gameState.timeLeft = 100;
    room.gameState.wordOptions = [];
    console.log(`[Room ${room.id}] Transitioning to DRAWING. Word: ${word}`);
    this.broadcastState(room);
  }

  public handleSkipTurn(roomId: string, socketId: string) {
    const room = this.rooms.get(roomId);
    // Player can skip only if they are the current drawer and it's either CHOOSING or DRAWING
    if (!room || room.gameState.currentDrawerId !== socketId) return;
    if (room.gameState.status !== 'CHOOSING' && room.gameState.status !== 'DRAWING') return;

    if (this.io) {
      const player = this.players.get(socketId);
      const name = player ? player.name : 'اللاعب';
      this.io.to(room.id).emit('receive_message', {
        id: 'sys-' + Date.now(),
        senderId: socketId,
        text: `${name} skipped the turn`,
        type: 'system'
      });
    }

    this.transitionToRoundEnd(room);
  }

  public submitGuess(roomId: string, socketId: string, guess: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.gameState.status !== 'DRAWING') return;

    const player = this.players.get(socketId);
    if (!player) return;

    // Reject if player is drawer
    if (room.gameState.currentDrawerId === socketId) return;

    // Reject if player already guessed
    if (room.gameState.correctGuessers.includes(socketId)) return;

    const currentWord = room.gameState.currentWord || '';
    const isCorrect = guess.toLowerCase().trim() === currentWord.toLowerCase().trim();

    if (isCorrect) {
      room.gameState.correctGuessers.push(socketId);
      
      const hintsUsed = room.gameState.hintsUsed || 0;
      const baseScore = 10 - hintsUsed;
      const guesserScore = Math.max(1, baseScore - (room.gameState.correctGuessers.length - 1));
      player.score += guesserScore;

      const drawer = this.players.get(room.gameState.currentDrawerId || '');
      if (drawer) {
         if (room.gameState.correctGuessers.length === 1) {
            drawer.score += Math.max(1, 11 - hintsUsed);
         } else {
            drawer.score += 2;
         }
      }

      if (this.io) {
        this.io.to(room.id).emit('receive_guess', {
          id: 'sys-' + Date.now(),
          text: `${player.name} guessed the word!`,
          type: 'system',
          color: '#10B981' // emerald-500
        });
      }

      // Check if someone reached 120
      const winner = room.players.find(p => p.score >= 120);
      if (winner) {
         return this.transitionToPodium(room);
      }

      // Deduct time dynamically
      const remainingPlayers = room.players.length - 1; // Excluding drawer
      if (remainingPlayers > 0) {
         const timeReduction = Math.floor(room.gameState.timeLeft / (remainingPlayers - room.gameState.correctGuessers.length + 1));
         room.gameState.timeLeft = Math.max(1, room.gameState.timeLeft - timeReduction);
      }

      if (room.gameState.correctGuessers.length === remainingPlayers) {
        this.transitionToRoundEnd(room);
      } else {
        this.broadcastState(room);
      }
    } else {
      // Broadcast incorrect guess to chat but maybe with a specific 'guess' type or regular message
      if (this.io) {
        this.io.to(room.id).emit('receive_guess', {
          id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
          text: guess,
          sender: player.name,
          senderId: socketId,
          type: 'message'
        });
      }
    }
  }

  public requestHint(roomId: string, socketId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.gameState.status !== 'DRAWING') return;

    // Only drawer can request hints
    if (room.gameState.currentDrawerId !== socketId) return;

    const word = room.gameState.currentWord || '';
    const charCount = word.replace(/\s/g, '').length;
    const maxHints = charCount < 3 ? 1 : 2;

    room.gameState.hintsUsed = room.gameState.hintsUsed || 0;
    room.gameState.revealedIndices = room.gameState.revealedIndices || [];

    if (room.gameState.hintsUsed >= maxHints) return;

    room.gameState.hintsUsed++;

    // Only reveal a character if it's the second hint, or if maxHints is 1
    // Actually the prompt says:
    // First hint: shows number of letters as blanks _ _ _
    // Second hint: reveals a random character in its position
    // Since showing blanks is automatic implicitly for 0 hints? Wait.
    // "التلميح الأول: يعرض عدد حروف الكلمة كفراغات أعلى الشاشة"
    // So hint 1 just enables blanks.
    // "التلميح الثاني: يكشف حرفاً عشوائياً"
    // So if hintsUsed == 2, or if word length < 3 and hintsUsed == 1 (meaning the only hint reveals a letter? Or maybe just blanks?)
    // Let's say if hintsUsed == 2, pick a random unrevealed index.
    
    if (room.gameState.hintsUsed === 2 || (maxHints === 1 && room.gameState.hintsUsed === 1)) {
       const unrevealed = [];
       for (let i = 0; i < word.length; i++) {
         if (word[i] !== ' ' && !room.gameState.revealedIndices.includes(i)) {
           unrevealed.push(i);
         }
       }
       if (unrevealed.length > 0) {
         const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)];
         room.gameState.revealedIndices.push(pick);
       }
    }

    this.broadcastState(room);
  }

  private broadcastState(room: Room) {
    if (this.io) {
      // Create a masked version of the word for everyone
      const word = room.gameState.currentWord || '';
      const charCount = word.replace(/\s/g, '').length;
      const maxHints = charCount < 3 ? 1 : 2;
      const hintsUsed = room.gameState.hintsUsed || 0;
      const revealedIndices = room.gameState.revealedIndices || [];
      
      const maskedWordArray = word.split('').map((char, index) => {
         if (char === ' ') return { isSpace: true, char: ' ' };
         let reveal = false;
         if (hintsUsed === 2 && revealedIndices.includes(index)) reveal = true;
         if (hintsUsed === 1 && maxHints === 1 && revealedIndices.includes(index)) reveal = true;
         return { isSpace: false, char: reveal ? char : null, index };
      });

      // To make it secure, iterate over room.players and emit individually
      room.players.forEach(p => {
        if (this.io) {
          const isDrawer = p.id === room.gameState.currentDrawerId;
          this.io.to(p.id).emit('room_state_update', {
            roomId: room.id,
            players: room.players,
            gameState: {
               ...room.gameState,
               currentWord: isDrawer ? room.gameState.currentWord : null,
               wordOptions: isDrawer ? room.gameState.wordOptions : [],
               maskedWordArray: maskedWordArray
            }
          });
        }
      });
    }
  }

  createRoom(roomId: string): Room {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, { 
        id: roomId, 
        players: [],
        gameState: {
          status: 'WAITING',
          currentDrawerId: null,
          currentWord: null,
          timeLeft: 0,
          correctGuessers: [],
          turnQueue: []
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
      room.gameState.turnQueue.push(player.id);
    }

    this.broadcastState(room);
    return room;
  }

  removePlayerFromRoom(roomId: string, socketId: string): Room | undefined {
    try {
      const room = this.rooms.get(roomId);
      if (room) {
        room.players = room.players.filter(p => p.id !== socketId);
        room.gameState.turnQueue = room.gameState.turnQueue.filter(id => id !== socketId);
        
        const player = this.players.get(socketId);
        if (player) {
          player.roomId = null;
        }
        
        if (room.players.length === 0) {
          this.rooms.delete(roomId);
          return undefined; // Room deleted
        }

        // Handle if current drawer leaves
        if (room.gameState.currentDrawerId === socketId) {
           if (room.gameState.correctGuessers.length === 0) {
              if (this.io) {
                this.io.to(room.id).emit('receive_message', {
                  id: 'sys-' + Date.now(),
                  text: 'الرسام غادر الغرفة ولم يجب أحد',
                  type: 'system'
                });
              }
              this.transitionToRoundEnd(room);
           }
        } else if (room.players.length < 2) {
           this.transitionToWaiting(room);
        } else {
           this.broadcastState(room);
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

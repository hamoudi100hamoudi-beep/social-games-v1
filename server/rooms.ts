import { Server } from 'socket.io';
import { Player, Room, GameState } from '../src/types/game.js';

const ALL_WORDS = [
  'تفاحة', 'سيارة', 'كتاب', 'طائرة', 'منزل', 'فيل', 'بطيخ', 'كمبيوتر', 'بحر', 'قمر', 'شجرة', 'شمس', 'قرد', 'جمل', 'سفينة',
  'قطة', 'كلب', 'أسد', 'نمر', 'حمار وحشي', 'زرافة', 'حصان', 'عصفور', 'صندوق', 'باب', 'شباك', 'سرير', 'كرسي', 'طاولة', 
  'مكتب', 'مصباح', 'تلفاز', 'ساعة', 'حقيبة', 'نظارات', 'سيف', 'درع', 'فأس', 'قوس', 'جبل', 'نهر', 'غابة', 'صحراء', 'جزيرة', 
  'شاطئ', 'نار', 'دخان', 'مقص', 'سكين', 'ملعقة', 'ثلاجة', 'فرن', 'مروحة', 'مكيف', 'سرير', 'وسادة', 'خريطة', 'بوصلة', 'كاميرا'
];

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private players: Map<string, Player> = new Map();
  private evictionTimers: Map<string, NodeJS.Timeout> = new Map();
  public activeSessions: Map<string, { socketId: string, player: Player }> = new Map();
  private io: Server | null = null;
  private tickInterval: NodeJS.Timeout | null = null;

  setIo(io: Server) {
    this.io = io;
    if (!this.tickInterval) {
      this.tickInterval = setInterval(() => this.tick(), 1000);
      console.log('[Game Engine] Global tick loop started (Clean Slate Protocol)');
    }
  }

  private tick() {
    this.rooms.forEach(room => this.processRoomTick(room));
  }

  private processRoomTick(room: Room) {
    const { gameState } = room;

    if (gameState.status === 'WAITING') {
      const onlinePlayersCount = room.players.filter(p => !p.isOffline).length;
      if (onlinePlayersCount >= 2) this.transitionToChoosing(room);
    } else if (gameState.status === 'CHOOSING') {
      gameState.timeLeft--;
      if (gameState.timeLeft <= 0) this.transitionToRoundEnd(room, 'turn_lost');
    } else if (gameState.status === 'DRAWING') {
      gameState.timeLeft--;
      const activeGuessersCount = room.players.filter(p => (p.persistentId || p.id) !== gameState.currentDrawerId && !p.isOffline).length;
      const onlineCorrectGuessersCount = gameState.correctGuessers.filter(pId => {
        const p = room.players.find(pl => (pl.persistentId || pl.id) === pId);
        return p && !p.isOffline;
      }).length;

      if (gameState.timeLeft <= 0) {
        this.transitionToRoundEnd(room, 'timeout');
      } else if (activeGuessersCount > 0 && onlineCorrectGuessersCount >= activeGuessersCount) {
        this.transitionToRoundEnd(room, 'all_guessed');
      }
    } else if (gameState.status === 'ROUND_END') {
      gameState.timeLeft--;
      if (gameState.timeLeft <= 0) this.transitionToChoosing(room);
    } else if (gameState.status === 'PODIUM') {
      gameState.timeLeft--;
      if (gameState.timeLeft <= 0) {
        const sorted = [...room.players].sort((a, b) => b.score - a.score);
        if (sorted.length > 0 && sorted[0].score > 0) sorted[0].wins += 1;
        room.players.forEach(p => p.score = 0);
        this.transitionToWaiting(room);
      }
    }

    if (this.io) {
      this.io.to(room.id).emit('timer_tick', { timeLeft: gameState.timeLeft, status: gameState.status });
    }
  }

  private transitionToWaiting(room: Room) {
    room.gameState.status = 'WAITING';
    room.gameState.currentDrawerId = null;
    room.gameState.currentWord = null;
    room.gameState.wordOptions = [];
    room.gameState.correctGuessers = [];
    room.gameState.timeLeft = 0;
    this.broadcastState(room);
  }

  private transitionToChoosing(room: Room) {
    const onlinePlayersCount = room.players.filter(p => !p.isOffline).length;
    if (onlinePlayersCount < 2) return this.transitionToWaiting(room);

    let nextDrawerId: string | null = null;
    const queueLength = room.gameState.turnQueue.length;
    for (let i = 0; i < queueLength; i++) {
      const candidateId = room.gameState.turnQueue.shift();
      if (!candidateId) break;
      room.gameState.turnQueue.push(candidateId);
      const p = room.players.find(player => (player.persistentId || player.id) === candidateId);
      if (p) { nextDrawerId = candidateId; break; }
    }

    if (!nextDrawerId) return this.transitionToWaiting(room);

    let availableWords = ALL_WORDS.filter(w => !room.usedWords.includes(w));
    if (availableWords.length < 2) {
      room.usedWords = [];
      availableWords = [...ALL_WORDS];
    }
    const selectedWords = [...availableWords].sort(() => 0.5 - Math.random()).slice(0, 2);
    room.usedWords.push(...selectedWords);

    room.gameState.status = 'CHOOSING';
    room.gameState.currentDrawerId = nextDrawerId;
    room.gameState.currentWord = null;
    room.gameState.wordOptions = selectedWords;
    room.gameState.correctGuessers = [];
    room.gameState.hintsUsed = 0;
    room.gameState.revealedIndices = [];
    room.gameState.drawHistory = [];
    room.gameState.timeLeft = 15;
    this.clearDrawHistoryForRoomAndClient(room);
    
    this.broadcastState(room);
  }

  private transitionToPodium(room: Room) {
    room.gameState.status = 'PODIUM';
    room.gameState.timeLeft = 10;
    this.broadcastState(room);
  }

  private transitionToRoundEnd(room: Room, reason: 'timeout' | 'all_guessed' | 'drawer_left' | 'turn_lost' | 'skipped' = 'timeout') {
    const winner = room.players.find(p => p.score >= 100);
    if (winner) return this.transitionToPodium(room);

    room.gameState.status = 'ROUND_END';
    room.gameState.roundEndReason = reason;
    room.gameState.roundEndWord = room.gameState.currentWord || undefined;
    room.gameState.timeLeft = 5;

    this.clearDrawHistoryForRoomAndClient(room);
    this.broadcastState(room);
  }

  public startGameRound(roomId: string, word: string, socketId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const player = this.players.get(socketId);
    const pId = player ? (player.persistentId || player.id) : socketId;
    if (room.gameState.status !== 'CHOOSING' || room.gameState.currentDrawerId !== pId) return;

    room.gameState.currentWord = word;
    room.gameState.status = 'DRAWING';
    room.gameState.wordOptions = [];
    room.gameState.timeLeft = 80;
    this.broadcastState(room);
  }

  public handleSkipTurn(roomId: string, socketId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const player = this.players.get(socketId);
    const pId = player ? (player.persistentId || player.id) : socketId;
    if (room.gameState.currentDrawerId !== pId) return;
    this.transitionToRoundEnd(room, 'skipped');
  }

  public submitGuess(roomId: string, socketId: string, guess: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.gameState.status !== 'DRAWING') return;
    const player = this.players.get(socketId);
    if (!player) return;

    const pId = player.persistentId || player.id;
    if (room.gameState.currentDrawerId === pId || room.gameState.correctGuessers.includes(pId)) return;

    const currentWord = room.gameState.currentWord || '';
    if (guess.toLowerCase().trim() === currentWord.toLowerCase().trim()) {
      room.gameState.correctGuessers.push(pId);
      player.score += 10;
      
      const activeGuessersCount = room.players.filter(p => (p.persistentId || p.id) !== room.gameState.currentDrawerId && !p.isOffline).length;
      const onlineCorrectGuessersCount = room.gameState.correctGuessers.filter(pIdToMatch => {
        const p = room.players.find(pl => (pl.persistentId || pl.id) === pIdToMatch);
        return p && !p.isOffline;
      }).length;

      if (activeGuessersCount > 0 && onlineCorrectGuessersCount >= activeGuessersCount) {
        this.transitionToRoundEnd(room, 'all_guessed');
      } else {
        this.broadcastState(room);
      }
    } else {
      this.broadcastMessage(room, {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
        text: guess, sender: player.name, senderId: socketId, type: 'message'
      });
    }
  }

  public requestHint(roomId: string, socketId: string) {}

  public sendStateToPlayer(room: Room, p: Player) {
    if (!this.io || !room || !p) return;
    try {
      const currentDrawerId = room.gameState?.currentDrawerId || '';
      const isDrawer = p.id === currentDrawerId || (p.persistentId && p.persistentId === currentDrawerId);
      const word = room.gameState?.currentWord || '';
      
      // المقص الذكي: حماية رام الهاتف باقتطاع آخر 200 حركة فقط
      const safeDrawHistory = room.gameState?.drawHistory ? room.gameState.drawHistory.slice(-200) : [];

      this.io.to(p.id).emit('room_state_update', {
        roomId: room.id,
        players: room.players || [],
        gameState: {
          ...room.gameState,
          drawHistory: safeDrawHistory,
          currentWord: isDrawer ? word : null,
          wordOptions: isDrawer ? (room.gameState.wordOptions || []) : []
        }
      });
    } catch (err) {
      console.error("[CRITICAL] Error in sendStateToPlayer:", err);
    }
  }

  private broadcastState(room: Room) {
    if (this.io) {
      room.players.forEach(p => this.sendStateToPlayer(room, p));
    }
  }

  createRoom(roomId: string): Room {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, { 
        id: roomId, players: [],
        gameState: { status: 'WAITING', currentDrawerId: null, currentWord: null, timeLeft: 0, correctGuessers: [], turnQueue: [], hintsUsed: 0, revealedIndices: [], drawHistory: [] },
        usedWords: [], chatMessages: [], guessMessages: []
      });
    }
    return this.rooms.get(roomId)!;
  }

  public saveChatMessage(roomId: string, message: any) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (!room.chatMessages) room.chatMessages = [];
    room.chatMessages.push(message);
    if (room.chatMessages.length > 40) room.chatMessages.shift();
  }

  public broadcastMessage(room: Room, msg: any) {
    this.saveChatMessage(room.id, msg);
    if (this.io) this.io.to(room.id).emit('receive_message', msg);
  }

  public clearDrawHistoryForRoomAndClient(room: Room) {
    if (room) {
      room.gameState.drawHistory = [];
      if (this.io) {
        this.io.to(room.id).emit('draw_clear', { instanceId: 'server-sweeper' });
        const clearBuf = Buffer.alloc(8);
        clearBuf.writeUInt8(5, 0);
        this.io.to(room.id).emit('draw_binary', clearBuf);
      }
    }
  }

  getRoom(roomId: string): Room | undefined { return this.rooms.get(roomId); }

  recordDrawCommand(roomId: string, event: string, data: any) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (!room.gameState.drawHistory) room.gameState.drawHistory = [];
    room.gameState.drawHistory.push({ event, data });
    if (room.gameState.drawHistory.length > 500) {
      room.gameState.drawHistory = room.gameState.drawHistory.slice(-500);
    }
  }

  clearDrawHistory(roomId: string) {
    const room = this.rooms.get(roomId);
    if (room && room.gameState.drawHistory) room.gameState.drawHistory = [];
  }

  undoLastDrawing(roomId: string) {}
  redoDrawing(roomId: string) {}

  addPlayerToRoom(roomId: string, player: Player): Room {
    const room = this.createRoom(roomId);
    const pId = player.persistentId || player.id;
    this.activeSessions.set(pId, { socketId: player.id, player });

    const existingPlayer = this.players.get(player.id);
    if (existingPlayer && existingPlayer.roomId && existingPlayer.roomId !== roomId) {
      this.removePlayerFromRoom(existingPlayer.roomId, player.id);
    }
    player.roomId = roomId;
    this.players.set(player.id, player);

    if (!room.players.find(p => p.id === player.id)) {
      room.players.push(player);
      if (!room.gameState.turnQueue.includes(pId)) room.gameState.turnQueue.push(pId);
    }
    this.broadcastState(room);
    return room;
  }

  removePlayerFromRoom(roomId: string, socketId: string): Room | undefined {
    const room = this.rooms.get(roomId);
    if (room) {
      const player = this.players.get(socketId);
      const pId = player ? (player.persistentId || player.id) : socketId;
      room.players = room.players.filter(p => p.id !== socketId);
      room.gameState.turnQueue = room.gameState.turnQueue.filter(id => id !== pId);
      room.gameState.correctGuessers = room.gameState.correctGuessers.filter(id => id !== pId);
      if (player) player.roomId = null;
      if (room.players.length === 0) {
        this.rooms.delete(roomId);
        return undefined;
      }
      if (room.gameState.currentDrawerId === pId && room.players.length > 0) {
        this.transitionToRoundEnd(room, 'drawer_left');
      } else {
        this.broadcastState(room);
      }
    }
    return room;
  }

  public reconnectPlayer(roomId: string, persistentId: string, nickname: string, newSocketId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    let existingPlayer = room.players.find(p => p.persistentId && p.persistentId === persistentId);
    if (!existingPlayer) existingPlayer = room.players.find(p => p.name === nickname);
    if (!existingPlayer) return null;

    const oldSocketId = existingPlayer.id;
    const pId = existingPlayer.persistentId || existingPlayer.id;

    if (this.evictionTimers.has(pId)) {
      clearTimeout(this.evictionTimers.get(pId));
      this.evictionTimers.delete(pId);
    }

    this.activeSessions.set(pId, { socketId: newSocketId, player: existingPlayer });

    if (oldSocketId !== newSocketId) {
      existingPlayer.id = newSocketId;
      this.players.delete(oldSocketId);
      this.players.set(newSocketId, existingPlayer);
      if (room.chatMessages) {
        room.chatMessages.forEach(msg => { if (msg.senderId === oldSocketId) msg.senderId = newSocketId; });
      }
    }
    
    existingPlayer.isOffline = false;
    delete existingPlayer.offlineSince;
    return room;
  }

  getPlayer(socketId: string): Player | undefined {
    return this.players.get(socketId);
  }

  public handleDisconnect(socketId: string) {
    const player = this.players.get(socketId);
    if (!player) return;

    const pId = player.persistentId || player.id;
    const activeSession = this.activeSessions.get(pId);

    // القفل الذكي: يتجاهل الفصل إذا كان اللاعب قد ربط سوكت جديد
    if (activeSession && activeSession.socketId !== socketId) {
      this.players.delete(socketId);
      return;
    }

    player.isOffline = true;
    player.offlineSince = Date.now();
    const roomId = player.roomId;

    if (roomId) {
      const room = this.rooms.get(roomId);
      if (room) this.broadcastState(room);

      if (this.evictionTimers.has(pId)) clearTimeout(this.evictionTimers.get(pId));

      // فترة السماح: 30 ثانية قبل الطرد النهائي
      const timer = setTimeout(() => {
        const currentRoom = this.rooms.get(roomId);
        if (currentRoom) {
          const latestSession = this.activeSessions.get(pId);
          if (latestSession && latestSession.socketId === socketId && latestSession.player.isOffline) {
            this.removePlayerFromRoom(roomId, latestSession.player.id);
            this.players.delete(latestSession.player.id);
            this.activeSessions.delete(pId);
            this.evictionTimers.delete(pId);
          }
        }
      }, 30000);
      this.evictionTimers.set(pId, timer);
    }
  }
}

export const roomManager = new RoomManager();

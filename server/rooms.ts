import { Server } from 'socket.io';
import { Player, Room, GameState } from '../src/types/game.js';

const ALL_WORDS = [
  'تفاحة', 'سيارة', 'كتاب', 'طائرة', 'منزل', 'فيل', 'بطيخ', 'كمبيوتر', 'بحر', 'قمر', 'شجرة', 'شمس', 'قرد', 'جمل', 'سفينة',
  'قطة', 'كلب', 'أسد', 'نمر', 'حمار وحشي', 'زرافة', 'حصان', 'عصفور', 'صندوق', 'باب', 'شباك', 'سرير', 'كرسي', 'طاولة', 
  'مكتب', 'مصباح', 'تلفاز', 'سجادة', 'ساعة', 'حقيبة', 'محفظة', 'قلم', 'دفتر', 'نظارات', 'سيف', 'درع', 'فأس', 'قوس', 
  'بندقية', 'رصاصة', 'قنبلة', 'سماء', 'نجمة', 'غيوم', 'مطر', 'ثلج', 'برق', 'جبل', 'نهر', 'غابة', 'صحراء', 'جزيرة', 
  'شاطئ', 'رمل', 'صدفة', 'حجر', 'نار', 'دخان', 'رماد', 'فحم', 'حطب', 'شمعة', 'عود ثقاب', 'مقص', 'سكين', 'ملعقة', 
  'شوكة', 'صحن', 'كأس', 'إبريق', 'مقلاة', 'ثلاجة', 'فرن', 'غسالة', 'مكنسة', 'مكواة', 'مروحة', 'مكيف', 'مدفأة', 
  'بطانية', 'وسادة', 'منشفة', 'حمام', 'فرشاة أسنان', 'معجون أسنان', 'صابون', 'شامبو', 'عطر', 'مشط', 'مرآة', 'ميزان', 
  'سلة', 'حبل', 'عجلة', 'خريطة', 'بوصلة', 'منظار', 'كاميرا', 'راديو', 'ميكروفون', 'سماعات', 'بوق', 'طبلة', 'جيتار', 
  'بيانو', 'مزمار', 'كمان', 'كرة', 'مضرب', 'شبكة', 'حذاء', 'جوارب', 'بنطال', 'قميص', 'فستان', 'تنورة', 'قبعة', 'قفازات', 
  'وشاح', 'معطف', 'حزام', 'ربطة عنق', 'نظارة شمسية', 'مفتاح', 'قفل', 'مطرقة', 'مسمار', 'مفك', 'منشار', 'فرشاة', 'دلو', 
  'مجرفة', 'خرطوم', 'سُلَّم', 'خيمة', 'حقيبة ظهر', 'نار مخيم', 'سنارة صيد', 'سمكة', 'قرش', 'حوت', 'دلفين', 'أخطبوط', 
  'سلطعون', 'قنديل البحر', 'نجم البحر', 'لؤلؤة', 'مرجان', 'سعادة', 'حزن', 'غضب', 'خوف', 'حب', 'دهشة', 'ضحك', 'بكاء', 
  'نوم', 'حلم', 'أفكار', 'ذكريات', 'دراجة', 'قطار', 'سفينة فضاء', 'رجل آلي', 'نظارة', 'عصا سحرية', 'تاج', 'قلادة',
  'خاتم', 'سوار', 'دبوس', 'زر', 'إبرة', 'خيط', 'مغناطيس', 'بطارية', 'مصباح يدوي', 'شاحن', 'سلك', 'مسمار', 'صامولة',
  'برغي', 'مفصلة', 'مقبض', 'نافذة', 'جدار', 'سقف', 'أرضية', 'شرفة', 'حديقة', 'بوابة', 'سور', 'طريق', 'جسر', 'نفق',
  'برج', 'قلعة', 'قصر', 'خيمة', 'كهف', 'بئر', 'نافورة', 'شلال', 'ينبوع', 'نهر', 'بحيرة', 'محيط', 'بركة', 'مستنقع',
  'ثعبان', 'سلحفاة', 'تمساح', 'سحلية', 'حرباء', 'ضفدع', 'فأر', 'سنجاب', 'أرنب', 'خروف', 'ماعز', 'بقرة', 'عجل', 'ثور'
];

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
    try {
      const now = Date.now();
      const offlineTimeout = 130 * 1000;
      
      this.rooms.forEach(room => {
        try {
          // Clean up players who are offline for > 120 seconds
          const playersToEvict: string[] = [];
          room.players.forEach(p => {
            if (p.isOffline && p.offlineSince && (now - p.offlineSince > offlineTimeout)) {
              playersToEvict.push(p.id);
            }
          });

          playersToEvict.forEach(socketId => {
            console.log(`[Game Engine] Evicting player ${socketId} from room ${room.id} due to offline timeout`);
            const player = this.players.get(socketId);
            const playerName = player ? player.name : 'لاعب';
            
            this.removePlayerFromRoom(room.id, socketId);
            this.players.delete(socketId);
            
            if (this.io) {
              this.io.to(room.id).emit('receive_message', {
                id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
                text: `تم طرد ${playerName} بسبب الغياب الطويل`,
                type: 'system'
              });
            }
          });

          this.processRoomTick(room);
        } catch (e) {
          console.error(`Error processing room tick for ${room.id}:`, e);
        }
      });
    } catch (e) {
      console.error('Error in global tick loop:', e);
    }
  }

  private processRoomTick(room: Room) {
    const { gameState } = room;

    if (gameState.status === 'WAITING') {
      const onlinePlayersCount = room.players.filter(p => !p.isOffline).length;
      if (onlinePlayersCount >= 2) {
        this.transitionToChoosing(room);
      }
    } else if (gameState.status === 'CHOOSING') {
      gameState.timeLeft--;
      const drawer = room.players.find(p => p.id === gameState.currentDrawerId);
      // Immediately skip under-choosing drawer if they go offline, or missed deadline
      if (gameState.timeLeft <= 91 || (drawer && drawer.isOffline)) {
        // Player missed their turn
        this.transitionToRoundEnd(room, 'turn_lost'); // Show round end overlay instead of skipping immediately
      }
    } else if (gameState.status === 'DRAWING') {
      gameState.timeLeft--;
      const activeGuessersCount = room.players.filter(p => p.id !== gameState.currentDrawerId && !p.isOffline).length;
      const onlineCorrectGuessersCount = gameState.correctGuessers.filter(id => {
        const p = room.players.find(pl => pl.id === id);
        return p && !p.isOffline;
      }).length;

      if (gameState.timeLeft <= 0) {
        // Time is up
        this.transitionToRoundEnd(room, 'timeout');
      } else if (activeGuessersCount > 0 && onlineCorrectGuessersCount >= activeGuessersCount) {
        // Everyone online guessed correctly
        this.transitionToRoundEnd(room, 'all_guessed');
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
    
    const onlinePlayersCount = room.players.filter(p => !p.isOffline).length;
    if (onlinePlayersCount >= 2) {
       return this.transitionToChoosing(room);
    }
    
    this.broadcastState(room);
  }

  private transitionToChoosing(room: Room) {
    if (room.players.length < 2) {
       return this.transitionToWaiting(room);
    }

    const onlinePlayersCount = room.players.filter(p => !p.isOffline).length;
    if (onlinePlayersCount < 2) {
       return this.transitionToWaiting(room);
    }
    
    // Logic for next turn - cycle through queue to find first online player in the room
    let nextDrawerId: string | null = null;
    const queueLength = room.gameState.turnQueue.length;
    
    for (let i = 0; i < queueLength; i++) {
      const candidateId = room.gameState.turnQueue.shift();
      if (!candidateId) break;
      
      // Put at the back of the queue
      room.gameState.turnQueue.push(candidateId);
      
      // Let's check if player exists in room AND is online
      const p = room.players.find(player => player.id === candidateId);
      if (p && !p.isOffline) {
        nextDrawerId = candidateId;
        break;
      }
    }

    if (!nextDrawerId) {
       return this.transitionToWaiting(room);
    }

    // Use unused words
    let availableWords = ALL_WORDS.filter(w => !room.usedWords.includes(w));
    if (availableWords.length < 2) {
       room.usedWords = [];
       availableWords = [...ALL_WORDS];
    }
    const shuffled = [...availableWords].sort(() => 0.5 - Math.random());
    const selectedWords = shuffled.slice(0, 2);
    room.usedWords.push(...selectedWords);

    console.log(`[Room ${room.id}] Transitioning to CHOOSING. Drawer: ${nextDrawerId}`);
    room.gameState.status = 'CHOOSING';
    room.gameState.currentDrawerId = nextDrawerId;
    room.gameState.currentWord = null;
    room.gameState.wordOptions = selectedWords;
    room.gameState.correctGuessers = [];
    room.gameState.hintsUsed = 0;
    room.gameState.revealedIndices = [];
    room.gameState.drawHistory = [];
    //@ts-ignore
    room.gameState.redoStack = [];
    room.gameState.timeLeft = 100;
    
    if (this.io) {
       this.io.to(room.id).emit('draw_clear', { instanceId: 'system' });
       
       const drawer = room.players.find(p => p.id === nextDrawerId);
       const name = drawer ? drawer.name : 'Unknown';
       this.io.to(room.id).emit('receive_guess', {
         id: 'sys-' + Date.now() + '-turn',
         text: `Turn of ${name}`,
         type: 'system',
         subType: 'turn',
         color: '#38BDF8'
       });
    }
    
    this.broadcastState(room);
  }

  private transitionToPodium(room: Room) {
    console.log(`[Room ${room.id}] Transitioning to PODIUM`);
    room.gameState.status = 'PODIUM';
    room.gameState.timeLeft = 15;

    const winner = [...room.players].reduce((max, p) => (p.score > max.score ? p : max), room.players[0] || { name: 'Unknown', score: 0 });
    if (this.io) {
       this.io.to(room.id).emit('receive_guess', {
          id: 'sys-' + Date.now() + '-podium-winner',
          text: `Game over. The winner is ${winner.name} with ${winner.score} points`,
          type: 'system',
          subType: 'game_over',
          color: '#38BDF8'
       });
    }

    this.broadcastState(room);
  }

  private transitionToRoundEnd(room: Room, reason: 'timeout' | 'all_guessed' | 'drawer_left' | 'turn_lost' | 'skipped' = 'timeout') {
    const winner = room.players.find(p => p.score >= 100);
    if (winner) {
      return this.transitionToPodium(room);
    }
    
    console.log(`[Room ${room.id}] Transitioning to ROUND_END reason: ${reason}`);
    room.gameState.status = 'ROUND_END';
    room.gameState.roundEndReason = reason;
    room.gameState.roundEndWord = room.gameState.currentWord || undefined;
    room.gameState.timeLeft = 8;

    const word = room.gameState.currentWord || '';

    if (this.io) {
       if (reason === 'all_guessed') {
          this.io.to(room.id).emit('receive_guess', {
             id: 'sys-' + Date.now() + '-all-guessed',
             text: `Everybody hit the answer!`,
             type: 'system',
             subType: 'all_guessed',
             color: '#10B981'
          });
       } else if (reason === 'timeout' || reason === 'drawer_left') {
          const hasSucceeded = (room.gameState.correctGuessers || []).length > 0;
          this.io.to(room.id).emit('receive_guess', {
             id: 'sys-' + Date.now() + '-timeover',
             text: hasSucceeded ? `Time's Up!` : `Nobody hit the answer`,
             type: 'system',
             subType: 'answer_reveal',
             color: '#38BDF8'
          });
          if (word) {
             this.io.to(room.id).emit('receive_guess', {
                id: 'sys-' + Date.now() + '-answer-word',
                text: `The answer was: ${word}`,
                type: 'system',
                subType: 'answer_reveal',
                word: word,
                color: '#38BDF8'
             });
          }
       } else if (reason === 'skipped') {
          const drawer = room.players.find(p => p.id === room.gameState.currentDrawerId);
          const name = drawer ? drawer.name : 'الرسام';
          this.io.to(room.id).emit('receive_guess', {
             id: 'sys-' + Date.now() + '-skip',
             text: `${name} skipped the turn`,
             type: 'system',
             subType: 'skipped',
             color: '#EF4444'
          });
          if (word) {
             this.io.to(room.id).emit('receive_guess', {
                id: 'sys-' + Date.now() + '-answer-word',
                text: `The answer was: ${word}`,
                type: 'system',
                subType: 'answer_reveal',
                word: word,
                color: '#38BDF8'
             });
          }
       } else if (reason === 'turn_lost') {
          const drawer = room.players.find(p => p.id === room.gameState.currentDrawerId);
          const name = drawer ? drawer.name : 'الرسام';
          this.io.to(room.id).emit('receive_guess', {
             id: 'sys-' + Date.now() + '-lost',
             text: `${name} has lost the turn`,
             type: 'system',
             subType: 'lost_turn',
             color: '#EF4444'
          });
       }

       // Emit Interval message in logs
       this.io.to(room.id).emit('receive_guess', {
          id: 'sys-' + Date.now() + '-interval',
          text: `Interval...`,
          type: 'system',
          subType: 'interval',
          color: '#38BDF8'
       });
    }

    this.broadcastState(room);
  }

  public startGameRound(roomId: string, word: string, socketId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.gameState.status !== 'CHOOSING' || room.gameState.currentDrawerId !== socketId) return;

    room.gameState.currentWord = word;
    room.gameState.status = 'DRAWING';
    room.gameState.wordOptions = [];
    console.log(`[Room ${room.id}] Transitioning to DRAWING. Word: ${word}`);
    this.broadcastState(room);
  }

  public handleSkipTurn(roomId: string, socketId: string) {
    const room = this.rooms.get(roomId);
    // Player can skip only if they are the current drawer and it's either CHOOSING or DRAWING
    if (!room || room.gameState.currentDrawerId !== socketId) return;
    if (room.gameState.status !== 'CHOOSING' && room.gameState.status !== 'DRAWING') return;

    this.transitionToRoundEnd(room, 'skipped');
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
          subType: 'hit',
          senderId: socketId,
          word: room.gameState.currentWord,
          sender: player.name,
          color: '#10B981' // emerald-500
        });
      }

      // Deduct time dynamically based on active (online, non-drawer) guessers
      const activeGuessersCount = room.players.filter(p => p.id !== room.gameState.currentDrawerId && !p.isOffline).length;
      const onlineCorrectGuessersCount = room.gameState.correctGuessers.filter(id => {
        const p = room.players.find(pl => pl.id === id);
        return p && !p.isOffline;
      }).length;

      if (activeGuessersCount > 0) {
         const timeReduction = Math.floor(room.gameState.timeLeft / (activeGuessersCount - onlineCorrectGuessersCount + 1));
         room.gameState.timeLeft = Math.max(1, room.gameState.timeLeft - timeReduction);
      }

      if (activeGuessersCount > 0 && onlineCorrectGuessersCount >= activeGuessersCount) {
        this.transitionToRoundEnd(room, 'all_guessed');
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
    let maxHints = charCount < 3 ? 1 : 2;
    if (charCount >= 5) {
       maxHints = 3;
    }

    room.gameState.hintsUsed = room.gameState.hintsUsed || 0;
    room.gameState.revealedIndices = room.gameState.revealedIndices || [];

    if (room.gameState.hintsUsed >= maxHints) return;

    room.gameState.hintsUsed++;

    if (room.gameState.hintsUsed >= 2 || (maxHints === 1 && room.gameState.hintsUsed === 1)) {
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
      let maxHints = charCount < 3 ? 1 : 2;
      if (charCount >= 5) {
         maxHints = 3;
      }
      const hintsUsed = room.gameState.hintsUsed || 0;
      const revealedIndices = room.gameState.revealedIndices || [];
      
      let maskedWordArray = [] as any[];
      if (hintsUsed >= 1) {
        maskedWordArray = word.split('').map((char, index) => {
           if (char === ' ') return { isSpace: true, char: ' ' };
           let reveal = false;
           if (revealedIndices.includes(index)) reveal = true;
           return { isSpace: false, char: reveal ? char : null, index };
        });
      }

      // To make it secure, iterate over room.players and emit individually
      room.players.forEach(p => {
        if (this.io) {
          const isDrawer = p.id === room.gameState.currentDrawerId;
          const { drawHistory, ...publicGameState } = room.gameState;
          this.io.to(p.id).emit('room_state_update', {
            roomId: room.id,
            players: room.players,
            gameState: {
               ...publicGameState,
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
          turnQueue: [],
          hintsUsed: 0,
          revealedIndices: [],
          drawHistory: []
        },
        usedWords: []
      });
    }
    return this.rooms.get(roomId)!;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  recordDrawCommand(roomId: string, event: string, data: any) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (!room.gameState.drawHistory) room.gameState.drawHistory = [];
    //@ts-ignore
    if (!room.gameState.redoStack) room.gameState.redoStack = [];
    room.gameState.drawHistory.push({ event, data });
    
    // Any new drawing action clears the redo stack
    //@ts-ignore
    room.gameState.redoStack = [];
  }

  undoLastDrawing(roomId: string): {event: string, data: any}[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    if (!room.gameState.drawHistory) room.gameState.drawHistory = [];
    //@ts-ignore
    if (!room.gameState.redoStack) room.gameState.redoStack = [];
    
    const history = room.gameState.drawHistory;
    //@ts-ignore
    const redoStack = room.gameState.redoStack;

    const isDrawEnd = (cmd: any) => 
      cmd.event === 'draw_end' || 
      (cmd.event === 'draw_binary' && Buffer.isBuffer(cmd.data) && cmd.data.length > 0 && cmd.data[0] === 3);

    const isDrawAction = (cmd: any) => 
      cmd.event === 'draw_action' || 
      (cmd.event === 'draw_binary' && Buffer.isBuffer(cmd.data) && cmd.data.length > 0 && cmd.data[0] === 4);

    const isDrawStart = (cmd: any) => 
      cmd.event === 'draw_start' || 
      (cmd.event === 'draw_binary' && Buffer.isBuffer(cmd.data) && cmd.data.length > 0 && cmd.data[0] === 1);
    
    let endIndex = history.length - 1;
    while (endIndex >= 0 && !isDrawEnd(history[endIndex]) && !isDrawAction(history[endIndex])) {
       endIndex--;
    }
    
    if (endIndex >= 0) {
      if (isDrawAction(history[endIndex])) {
        const removed = history.splice(endIndex, history.length - endIndex);
        redoStack.push(removed);
      } else {
        let startIndex = endIndex;
        while (startIndex >= 0 && !isDrawStart(history[startIndex])) {
           startIndex--;
        }
        if (startIndex >= 0) {
           const removed = history.splice(startIndex, history.length - startIndex);
           redoStack.push(removed);
        }
      }
    }
    return history;
  }

  redoDrawing(roomId: string): {event: string, data: any}[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    if (!room.gameState.drawHistory) room.gameState.drawHistory = [];
    //@ts-ignore
    if (!room.gameState.redoStack) room.gameState.redoStack = [];
    
    const history = room.gameState.drawHistory;
    //@ts-ignore
    const redoStack = room.gameState.redoStack;
    
    if (redoStack.length > 0) {
      const commandsToRestore = redoStack.pop();
      if (commandsToRestore) {
         history.push(...commandsToRestore);
      }
    }
    return history;
  }

  clearDrawHistory(roomId: string) {
    const room = this.rooms.get(roomId);
    if (room && room.gameState.drawHistory) {
      room.gameState.drawHistory = [];
      //@ts-ignore
      room.gameState.redoStack = [];
    }
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
        room.gameState.correctGuessers = room.gameState.correctGuessers.filter(id => id !== socketId);
        
        const player = this.players.get(socketId);
        if (player) {
          player.roomId = null;
        }
        
        if (room.players.length === 0) {
          this.rooms.delete(roomId);
          return undefined; // Room deleted
        }

        if (room.players.length < 2) {
           room.players.forEach(p => p.score = 0);
        }

        // Handle if current drawer leaves
        if (room.gameState.currentDrawerId === socketId) {
           if (room.gameState.correctGuessers.length === 0 && room.players.length > 0) {
              this.transitionToRoundEnd(room, 'drawer_left');
           } else {
              this.broadcastState(room);
           }
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

  public reconnectPlayer(roomId: string, persistentId: string, newSocketId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const existingPlayer = room.players.find(p => p.persistentId === persistentId);
    if (!existingPlayer) return null;

    const oldSocketId = existingPlayer.id;

    console.log(`[Reattach] Swapping socket ${oldSocketId} -> ${newSocketId} for player ${existingPlayer.name}`);

    // Update Player ID mapping
    existingPlayer.id = newSocketId;
    existingPlayer.isOffline = false;
    delete existingPlayer.offlineSince;

    // Update RoomManager players map
    this.players.delete(oldSocketId);
    this.players.set(newSocketId, existingPlayer);

    // Update Room gameState with new socket ID
    if (room.gameState.currentDrawerId === oldSocketId) {
      room.gameState.currentDrawerId = newSocketId;
    }
    room.gameState.turnQueue = room.gameState.turnQueue.map(id => id === oldSocketId ? newSocketId : id);
    room.gameState.correctGuessers = room.gameState.correctGuessers.map(id => id === oldSocketId ? newSocketId : id);

    this.broadcastState(room);
    return room;
  }

  getPlayer(socketId: string): Player | undefined {
    return this.players.get(socketId);
  }

  public handleDisconnect(socketId: string) {
    try {
      const player = this.players.get(socketId);
      if (!player) return;

      player.isOffline = true;
      player.offlineSince = Date.now();

      const roomId = player.roomId;
      if (roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
          // Broadcast state so clients see isOffline
          this.broadcastState(room);

          // System Message in Arabic
          if (this.io) {
            this.io.to(roomId).emit('receive_message', {
              id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
              text: `${player.name} فقد الاتصال، بانتظار عودته...`,
              type: 'system'
            });
          }
        }
      }
    } catch (e) {
      console.error("Error in handleDisconnect:", e);
    }
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

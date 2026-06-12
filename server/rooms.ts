import { Server } from "socket.io";
import { Player, Room, GameState } from "../src/types/game.js";

const ALL_WORDS = [
  "تفاحة",
  "سيارة",
  "كتاب",
  "طائرة",
  "منزل",
  "فيل",
  "بطيخ",
  "كمبيوتر",
  "بحر",
  "قمر",
  "شجرة",
  "شمس",
  "قرد",
  "جمل",
  "سفينة",
  "قطة",
  "كلب",
  "أسد",
  "نمر",
  "حمار وحشي",
  "زرافة",
  "حصان",
  "عصفور",
  "صندوق",
  "باب",
  "شباك",
  "سرير",
  "كرسي",
  "طاولة",
  "مكتب",
  "مصباح",
  "تلفاز",
  "سجادة",
  "ساعة",
  "حقيبة",
  "محفظة",
  "قلم",
  "دفتر",
  "نظارات",
  "سيف",
  "درع",
  "فأس",
  "قوس",
  "بندقية",
  "رصاصة",
  "قنبلة",
  "سماء",
  "نجمة",
  "غيوم",
  "مطر",
  "ثلج",
  "برق",
  "جبل",
  "نهر",
  "غابة",
  "صحراء",
  "جزيرة",
  "شاطئ",
  "رمل",
  "صدفة",
  "حجر",
  "نار",
  "دخان",
  "رماد",
  "فحم",
  "حطب",
  "شمعة",
  "عود ثقاب",
  "مقص",
  "سكين",
  "ملعقة",
  "شوكة",
  "صحن",
  "كأس",
  "إبريق",
  "مقلاة",
  "ثلاجة",
  "فرن",
  "غسالة",
  "مكنسة",
  "مكواة",
  "مروحة",
  "مكيف",
  "مدفأة",
  "بطانية",
  "وسادة",
  "منشفة",
  "حمام",
  "فرشاة أسنان",
  "معجون أسنان",
  "صابون",
  "شامبو",
  "عطر",
  "مشط",
  "مرآة",
  "ميزان",
  "سلة",
  "حبل",
  "عجلة",
  "خريطة",
  "بوصلة",
  "منظار",
  "كاميرا",
  "راديو",
  "ميكروفون",
  "سماعات",
  "بوق",
  "طبلة",
  "جيتار",
  "بيانو",
  "مزمار",
  "كمان",
  "كرة",
  "مضرب",
  "شبكة",
  "حذاء",
  "جوارب",
  "بنطال",
  "قميص",
  "فستان",
  "تنورة",
  "قبعة",
  "قفازات",
  "وشاح",
  "معطف",
  "حزام",
  "ربطة عنق",
  "نظارة شمسية",
  "مفتاح",
  "قفل",
  "مطرقة",
  "مسمار",
  "مفك",
  "منشار",
  "فرشاة",
  "دلو",
  "مجرفة",
  "خرطوم",
  "سُلَّم",
  "خيمة",
  "حقيبة ظهر",
  "نار مخيم",
  "سنارة صيد",
  "سمكة",
  "قرش",
  "حوت",
  "دلفين",
  "أخطبوط",
  "سلطعون",
  "قنديل البحر",
  "نجم البحر",
  "لؤلؤة",
  "مرجان",
  "سعادة",
  "حزن",
  "غضب",
  "خوف",
  "حب",
  "دهشة",
  "ضحك",
  "بكاء",
  "نوم",
  "حلم",
  "أفكار",
  "ذكريات",
  "دراجة",
  "قطار",
  "سفينة فضاء",
  "رجل آلي",
  "نظارة",
  "عصا سحرية",
  "تاج",
  "قلادة",
  "خاتم",
  "سوار",
  "دبوس",
  "زر",
  "إبرة",
  "خيط",
  "مغناطيس",
  "بطارية",
  "مصباح يدوي",
  "شاحن",
  "سلك",
  "مسمار",
  "صامولة",
  "برغي",
  "مفصلة",
  "مقبض",
  "نافذة",
  "جدار",
  "سقف",
  "أرضية",
  "شرفة",
  "حديقة",
  "بوابة",
  "سور",
  "طريق",
  "جسر",
  "نفق",
  "برج",
  "قلعة",
  "قصر",
  "خيمة",
  "كهف",
  "بئر",
  "نافورة",
  "شلال",
  "ينبوع",
  "نهر",
  "بحيرة",
  "محيط",
  "بركة",
  "مستنقع",
  "ثعبان",
  "سلحفاة",
  "تمساح",
  "سحلية",
  "حرباء",
  "ضفدع",
  "فأر",
  "سنجاب",
  "أرنب",
  "خروف",
  "ماعز",
  "بقرة",
  "عجل",
  "ثور",
];

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private players: Map<string, Player> = new Map();
  private evictionTimers: Map<string, NodeJS.Timeout> = new Map();
  private io: Server | null = null;
  private tickInterval: NodeJS.Timeout | null = null;

  setIo(io: Server) {
    this.io = io;
    if (!this.tickInterval) {
      this.tickInterval = setInterval(() => this.tick(), 1000);
      console.log("[Game Engine] Global tick loop started (1s interval)");
    }
  }

  private tick() {
    try {
      this.rooms.forEach((room) => {
        try {
          this.kickIdlePlayers(room);
          this.processRoomTick(room);
        } catch (e) {
          console.error(`Error processing room tick for ${room.id}:`, e);
        }
      });
    } catch (e) {
      console.error("Error in global tick loop:", e);
    }
  }

  private kickIdlePlayers(room: Room) {
    const idleTimeout = 4 * 60 * 1000; // 4 minutes
    const now = Date.now();
    const playersToKick: Player[] = [];

    room.players.forEach((p) => {
      // If player is already offline, the 10-second grace period eviction handles them,
      // so we only actively kick online idle players to keep rooms healthy.
      if (!p.isOffline) {
        const lastAct = p.lastActivity || now;
        if (now - lastAct > idleTimeout) {
          playersToKick.push(p);
        }
      }
    });

    playersToKick.forEach((p) => {
      console.warn(`[AFK KICK] Player ${p.name} (${p.id}) is idle for > 4m. Removing.`);
      
      const socket = this.io?.sockets.sockets.get(p.id);
      if (socket) {
        socket.emit('session_expired', { reason: 'afk' });
        socket.disconnect(true);
      }

      this.removePlayerFromRoom(room.id, p.id);
      this.players.delete(p.id);

      this.broadcastMessage(room, {
        id: "sys-afk-" + Date.now().toString() + Math.random().toString(36).substr(2, 5),
        text: `تم طرد ${p.name} بسبب عدم النشاط (AFK)`,
        type: "system",
      });
    });
  }

  private processRoomTick(room: Room) {
    const { gameState } = room;

    if (gameState.status === "WAITING") {
      const onlinePlayersCount = room.players.filter(
        (p) => !p.isOffline,
      ).length;
      if (onlinePlayersCount >= 2) {
        this.transitionToChoosing(room);
      }
    } else if (gameState.status === "CHOOSING") {
      gameState.timeLeft--;
      const drawer = room.players.find(
        (p) => (p.persistentId || p.id) === gameState.currentDrawerId,
      );
      // Skip turn only if they missed the deadline (do not skip immediately for being offline)
      if (gameState.timeLeft <= 91) {
        // Player missed their turn
        this.transitionToRoundEnd(room, "turn_lost"); // Show round end overlay instead of skipping immediately
      }
    } else if (gameState.status === "DRAWING") {
      gameState.timeLeft--;
      const activeGuessersCount = room.players.filter(
        (p) =>
          (p.persistentId || p.id) !== gameState.currentDrawerId &&
          !p.isOffline,
      ).length;
      const onlineCorrectGuessersCount = gameState.correctGuessers.filter(
        (pId) => {
          const p = room.players.find(
            (pl) => (pl.persistentId || pl.id) === pId,
          );
          return p && !p.isOffline;
        },
      ).length;

      if (gameState.timeLeft <= 0) {
        // Time is up
        this.transitionToRoundEnd(room, "timeout");
      } else if (
        activeGuessersCount > 0 &&
        onlineCorrectGuessersCount >= activeGuessersCount
      ) {
        // Everyone online guessed correctly
        this.transitionToRoundEnd(room, "all_guessed");
      }
    } else if (gameState.status === "ROUND_END") {
      gameState.timeLeft--;
      if (gameState.timeLeft <= 0) {
        this.transitionToChoosing(room);
      }
    } else if (gameState.status === "PODIUM") {
      gameState.timeLeft--;
      if (gameState.timeLeft <= 0) {
        // Find highest scorer (top player)
        const sorted = [...room.players].sort((a, b) => b.score - a.score);
        if (sorted.length > 0 && sorted[0].score > 0) {
          sorted[0].wins += 1;
        }

        // Reset scores
        room.players.forEach((p) => (p.score = 0));

        // Since we broadcast waiting, it clears the board
        this.transitionToWaiting(room);
      }
    }

    if (this.io) {
      this.io
        .to(room.id)
        .emit("timer_tick", {
          timeLeft: gameState.timeLeft,
          status: gameState.status,
        });
    }
  }

  private transitionToWaiting(room: Room) {
    console.log(`[Room ${room.id}] Transitioning to WAITING`);
    room.gameState.status = "WAITING";
    room.gameState.currentDrawerId = null;
    room.gameState.currentWord = null;
    room.gameState.wordOptions = [];
    room.gameState.correctGuessers = [];
    room.gameState.timeLeft = 0;

    const onlinePlayersCount = room.players.filter((p) => !p.isOffline).length;
    if (onlinePlayersCount >= 2) {
      return this.transitionToChoosing(room);
    }

    this.broadcastState(room);
  }

  private transitionToChoosing(room: Room) {
    if (room.players.length < 2) {
      return this.transitionToWaiting(room);
    }

    const onlinePlayersCount = room.players.filter((p) => !p.isOffline).length;
    if (onlinePlayersCount < 2) {
      return this.transitionToWaiting(room);
    }

    // Logic for next turn - cycle through queue to find first player in the room (even if offline)
    let nextDrawerId: string | null = null;
    const queueLength = room.gameState.turnQueue.length;

    for (let i = 0; i < queueLength; i++) {
      const candidateId = room.gameState.turnQueue.shift();
      if (!candidateId) break;

      // Put at the back of the queue
      room.gameState.turnQueue.push(candidateId);

      // Check if player exists in room (allow even if temporarily offline so they can reconnect during their turn)
      const p = room.players.find(
        (player) => (player.persistentId || player.id) === candidateId,
      );
      if (p) {
        nextDrawerId = candidateId;
        break;
      }
    }

    if (!nextDrawerId) {
      return this.transitionToWaiting(room);
    }

    // Use unused words
    let availableWords = ALL_WORDS.filter((w) => !room.usedWords.includes(w));
    if (availableWords.length < 2) {
      room.usedWords = [];
      availableWords = [...ALL_WORDS];
    }
    const shuffled = [...availableWords].sort(() => 0.5 - Math.random());
    const selectedWords = shuffled.slice(0, 2);
    room.usedWords.push(...selectedWords);

    console.log(
      `[Room ${room.id}] Transitioning to CHOOSING. Drawer: ${nextDrawerId}`,
    );
    room.gameState.status = "CHOOSING";
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
    room.gameState.reports = [];

    // Snapshot scores to enable rollback if the round gets reported/canceled
    room.turnStartScores = {};
    room.players.forEach((p) => {
      const uniqueId = p.persistentId || p.id;
      room.turnStartScores![uniqueId] = p.score;
    });

    this.clearDrawHistoryForRoomAndClient(room);
    const drawer = room.players.find(
      (p) => (p.persistentId || p.id) === nextDrawerId,
    );
    const name = drawer ? drawer.name : "Unknown";
    this.broadcastGuess(room, {
      id: "sys-" + Date.now() + "-turn",
      text: `Turn of ${name}`,
      type: "system",
      subType: "turn",
      color: "#38BDF8",
    });

    this.broadcastState(room);
  }

  private transitionToPodium(room: Room) {
    console.log(`[Room ${room.id}] Transitioning to PODIUM`);
    room.gameState.status = "PODIUM";
    room.gameState.timeLeft = 15;

    const winner = [...room.players].reduce(
      (max, p) => (p.score > max.score ? p : max),
      room.players[0] || { name: "Unknown", score: 0 },
    );
    this.broadcastGuess(room, {
      id: "sys-" + Date.now() + "-podium-winner",
      text: `Game over. The winner is ${winner.name} with ${winner.score} points`,
      type: "system",
      subType: "game_over",
      color: "#38BDF8",
    });

    this.broadcastState(room);
  }

  private transitionToRoundEnd(
    room: Room,
    reason:
      | "timeout"
      | "all_guessed"
      | "drawer_left"
      | "turn_lost"
      | "skipped"
      | "canceled" = "timeout",
  ) {
    // Standard validation: don't transition more than once if already round end
    if (room.gameState.status === "ROUND_END" && reason !== "canceled") {
      return;
    }

    const winner = room.players.find((p) => p.score >= 40);
    if (winner && reason !== "canceled") {
      return this.transitionToPodium(room);
    }

    console.log(
      `[Room ${room.id}] Transitioning to ROUND_END reason: ${reason}`,
    );
    room.gameState.status = "ROUND_END";
    room.gameState.roundEndReason = reason;
    room.gameState.roundEndWord = room.gameState.currentWord || undefined;
    room.gameState.timeLeft = 8;

    const word = room.gameState.currentWord || "";

    // Wiping drawHistory to guard server memory from RAM Bloat
    this.clearDrawHistoryForRoomAndClient(room);

    if (reason === "canceled") {
      // Rollback scores to the snapshot of turnStartScores
      if (room.turnStartScores) {
        room.players.forEach((p) => {
          const uniqueId = p.persistentId || p.id;
          if (room.turnStartScores && room.turnStartScores[uniqueId] !== undefined) {
            p.score = room.turnStartScores[uniqueId];
          }
        });
      }
      this.broadcastGuess(room, {
        id: "sys-" + Date.now() + "-canceled",
        text: `Canceled turn`,
        type: "system",
        subType: "canceled",
        color: "#EF4444",
      });
    } else if (reason === "all_guessed") {
      this.broadcastGuess(room, {
        id: "sys-" + Date.now() + "-all-guessed",
        text: `Everybody hit the answer!`,
        type: "system",
        subType: "all_guessed",
        color: "#10B981",
      });
    } else if (reason === "timeout" || reason === "drawer_left") {
      const hasSucceeded = (room.gameState.correctGuessers || []).length > 0;
      this.broadcastGuess(room, {
        id: "sys-" + Date.now() + "-timeover",
        text: hasSucceeded ? `Time's Up!` : `Nobody hit the answer`,
        type: "system",
        subType: "answer_reveal",
        color: "#38BDF8",
      });
      if (word) {
        this.broadcastGuess(room, {
          id: "sys-" + Date.now() + "-answer-word",
          text: `The answer was: ${word}`,
          type: "system",
          subType: "answer_reveal",
          word: word,
          color: "#38BDF8",
        });
      }
    } else if (reason === "skipped") {
      const drawer = room.players.find(
        (p) => (p.persistentId || p.id) === room.gameState.currentDrawerId,
      );
      const name = drawer ? drawer.name : "الرسام";
      this.broadcastGuess(room, {
        id: "sys-" + Date.now() + "-skip",
        text: `${name} skipped the turn`,
        type: "system",
        subType: "skipped",
        color: "#EF4444",
      });
      if (word) {
        this.broadcastGuess(room, {
          id: "sys-" + Date.now() + "-answer-word",
          text: `The answer was: ${word}`,
          type: "system",
          subType: "answer_reveal",
          word: word,
          color: "#38BDF8",
        });
      }
    } else if (reason === "turn_lost") {
      const drawer = room.players.find(
        (p) => (p.persistentId || p.id) === room.gameState.currentDrawerId,
      );
      const name = drawer ? drawer.name : "الرسام";
      this.broadcastGuess(room, {
        id: "sys-" + Date.now() + "-lost",
        text: `${name} has lost the turn`,
        type: "system",
        subType: "lost_turn",
        color: "#EF4444",
      });
    }

    // Emit Interval message in logs
    this.broadcastGuess(room, {
      id: "sys-" + Date.now() + "-interval",
      text: `Interval...`,
      type: "system",
      subType: "interval",
      color: "#38BDF8",
    });

    this.broadcastState(room);
  }

  public startGameRound(roomId: string, word: string, socketId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const player = this.players.get(socketId);
    const pId = player ? player.persistentId || player.id : socketId;
    if (
      room.gameState.status !== "CHOOSING" ||
      room.gameState.currentDrawerId !== pId
    )
      return;

    room.gameState.currentWord = word;
    room.gameState.status = "DRAWING";
    room.gameState.wordOptions = [];
    console.log(`[Room ${room.id}] Transitioning to DRAWING. Word: ${word}`);
    this.broadcastState(room);
  }

  public handleSkipTurn(roomId: string, socketId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const player = this.players.get(socketId);
    const pId = player ? player.persistentId || player.id : socketId;
    if (room.gameState.currentDrawerId !== pId) return;
    if (
      room.gameState.status !== "CHOOSING" &&
      room.gameState.status !== "DRAWING"
    )
      return;

    this.transitionToRoundEnd(room, "skipped");
  }

  public submitGuess(roomId: string, socketId: string, guess: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.gameState.status !== "DRAWING") return;

    const player = this.players.get(socketId);
    if (!player) return;

    const pId = player.persistentId || player.id;

    // Reject if player is drawer
    if (room.gameState.currentDrawerId === pId) return;

    // Reject if player already guessed
    if (room.gameState.correctGuessers.includes(pId)) return;

    const currentWord = room.gameState.currentWord || "";
    const isCorrect =
      guess.toLowerCase().trim() === currentWord.toLowerCase().trim();

    if (isCorrect) {
      room.gameState.correctGuessers.push(pId);

      const hintsUsed = room.gameState.hintsUsed || 0;
      const baseScore = 10 - hintsUsed;
      const guesserScore = Math.max(
        1,
        baseScore - (room.gameState.correctGuessers.length - 1),
      );
      player.score += guesserScore;

      const drawer = room.players.find(
        (p) => (p.persistentId || p.id) === room.gameState.currentDrawerId,
      );
      if (drawer) {
        if (room.gameState.correctGuessers.length === 1) {
          drawer.score += Math.max(1, 11 - hintsUsed);
        } else {
          drawer.score += 2;
        }
      }

      this.broadcastGuess(room, {
        id: "sys-" + Date.now(),
        text: `${player.name} guessed the word!`,
        type: "system",
        subType: "hit",
        senderId: socketId,
        word: room.gameState.currentWord,
        sender: player.name,
        color: "#10B981", // emerald-500
      });

      // Deduct time based on Gartic.io-style mechanics (10 seconds per correct guess, locking of remaining time below 20 seconds)
      const activeGuessersCount = room.players.filter(
        (p) =>
          (p.persistentId || p.id) !== room.gameState.currentDrawerId &&
          !p.isOffline,
      ).length;
      const onlineCorrectGuessersCount = room.gameState.correctGuessers.filter(
        (pIdToMatch) => {
          const p = room.players.find(
            (pl) => (pl.persistentId || pl.id) === pIdToMatch,
          );
          return p && !p.isOffline;
        },
      ).length;

      const CRITICAL_GRACE_PERIOD = 20; // safe zone (20 seconds)
      const TIME_DEDUCTION = 10;        // 10 seconds deducted per correct guess

      if (room.gameState.timeLeft > CRITICAL_GRACE_PERIOD) {
        let newTime = room.gameState.timeLeft - TIME_DEDUCTION;
        if (newTime < CRITICAL_GRACE_PERIOD) {
          newTime = CRITICAL_GRACE_PERIOD;
        }
        room.gameState.timeLeft = newTime;
      }

      if (
        activeGuessersCount > 0 &&
        onlineCorrectGuessersCount >= activeGuessersCount
      ) {
        this.transitionToRoundEnd(room, "all_guessed");
      } else {
        this.broadcastState(room);
      }
    } else {
      // Broadcast incorrect guess to chat but maybe with a specific 'guess' type or regular message
      this.broadcastGuess(room, {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
        text: guess,
        sender: player.name,
        senderId: socketId,
        type: "message",
      });
    }
  }

  public requestHint(roomId: string, socketId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.gameState.status !== "DRAWING") return;

    const player = this.players.get(socketId);
    const pId = player ? player.persistentId || player.id : socketId;

    // Only drawer can request hints
    if (room.gameState.currentDrawerId !== pId) return;

    const word = room.gameState.currentWord || "";
    const charCount = word.replace(/\s/g, "").length;
    let maxHints = charCount < 3 ? 1 : 2;
    if (charCount >= 5) {
      maxHints = 3;
    }

    room.gameState.hintsUsed = room.gameState.hintsUsed || 0;
    room.gameState.revealedIndices = room.gameState.revealedIndices || [];

    if (room.gameState.hintsUsed >= maxHints) return;

    room.gameState.hintsUsed++;

    if (
      room.gameState.hintsUsed >= 2 ||
      (maxHints === 1 && room.gameState.hintsUsed === 1)
    ) {
      const unrevealed = [];
      for (let i = 0; i < word.length; i++) {
        if (word[i] !== " " && !room.gameState.revealedIndices.includes(i)) {
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

  public reportDrawing(roomId: string, socketId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.gameState.status !== "DRAWING") return;

    const player = this.players.get(socketId);
    if (!player) return;

    const pId = player.persistentId || player.id;

    // The drawer cannot report their own drawing!
    if (room.gameState.currentDrawerId === pId) return;

    if (!room.gameState.reports) {
      room.gameState.reports = [];
    }

    // Prevent double reporting
    if (room.gameState.reports.includes(pId)) return;

    room.gameState.reports.push(pId);

    // Broadcast report message to the guess/info logs feed exactly as shown: "⚠️ [PlayerName] reported!"
    this.broadcastGuess(room, {
      id: "sys-" + Date.now() + "-report-" + pId,
      text: `${player.name} reported!`,
      type: "system",
      subType: "report",
      sender: player.name,
      color: "#EF4444",
    });

    const activePlayersCount = room.players.filter((p) => !p.isOffline).length;
    let requiredReports = 2; // Default for <=5 players
    if (activePlayersCount <= 4) {
      requiredReports = Math.max(2, Math.ceil(activePlayersCount / 2));
    } else if (activePlayersCount === 5) {
      requiredReports = 2;
    } else if (activePlayersCount === 6) {
      requiredReports = 3;
    } else if (activePlayersCount === 7) {
      requiredReports = 4;
    } else if (activePlayersCount === 8) {
      requiredReports = 4;
    } else {
      requiredReports = Math.floor(activePlayersCount / 2);
    }

    if (room.gameState.reports.length >= requiredReports) {
      console.log(`[Report Engine] Cancel threshold reached (${room.gameState.reports.length}/${requiredReports}). Triggering CANCELED TURN.`);
      this.transitionToRoundEnd(room, "canceled");
    } else {
      this.broadcastState(room);
    }
  }

  public sendStateToPlayer(room: Room, p: Player) {
    if (this.io) {
      // Create a masked version of the word for everyone
      const word = room.gameState.currentWord || "";
      const charCount = word.replace(/\s/g, "").length;
      let maxHints = charCount < 3 ? 1 : 2;
      if (charCount >= 5) {
        maxHints = 3;
      }
      const hintsUsed = room.gameState.hintsUsed || 0;
      const revealedIndices = room.gameState.revealedIndices || [];

      let maskedWordArray = [] as any[];
      if (hintsUsed >= 1) {
        maskedWordArray = word.split("").map((char, index) => {
          if (char === " ") return { isSpace: true, char: " " };
          let reveal = false;
          if (revealedIndices.includes(index)) reveal = true;
          return { isSpace: false, char: reveal ? char : null, index };
        });
      }

      const isDrawer =
        p.id === room.gameState.currentDrawerId ||
        (p.persistentId && p.persistentId === room.gameState.currentDrawerId);
      const { drawHistory, ...publicGameState } = room.gameState;
      this.io.to(p.id).emit("room_state_update", {
        roomId: room.id,
        players: room.players,
        gameState: {
          ...publicGameState,
          currentWord: isDrawer ? room.gameState.currentWord : null,
          wordOptions: isDrawer ? room.gameState.wordOptions : [],
          maskedWordArray: maskedWordArray,
        },
      });
    }
  }

  private broadcastState(room: Room) {
    if (this.io) {
      room.players.forEach((p) => {
        this.sendStateToPlayer(room, p);
      });
    }
  }

  createRoom(roomId: string): Room {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        players: [],
        gameState: {
          status: "WAITING",
          currentDrawerId: null,
          currentWord: null,
          timeLeft: 0,
          correctGuessers: [],
          turnQueue: [],
          hintsUsed: 0,
          revealedIndices: [],
          drawHistory: [],
        },
        usedWords: [],
        chatMessages: [],
        guessMessages: [],
      });
    }
    return this.rooms.get(roomId)!;
  }

  public saveChatMessage(roomId: string, message: any) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (!room.chatMessages) room.chatMessages = [];
    room.chatMessages.push(message);
    if (room.chatMessages.length > 40) {
      room.chatMessages.shift(); // sliding window / rolling queue of 40 max
    }
  }

  public saveGuessMessage(roomId: string, message: any) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (!room.guessMessages) room.guessMessages = [];
    room.guessMessages.push(message);
    if (room.guessMessages.length > 40) {
      room.guessMessages.shift(); // sliding window / rolling queue of 40 max
    }
  }

  public broadcastMessage(room: Room, msg: any) {
    this.saveChatMessage(room.id, msg);
    if (this.io) {
      this.io.to(room.id).emit("receive_message", msg);
    }
  }

  public broadcastGuess(room: Room, msg: any) {
    this.saveGuessMessage(room.id, msg);
    if (this.io) {
      this.io.to(room.id).emit("receive_guess", msg);
    }
  }

  public clearDrawHistoryForRoomAndClient(room: Room) {
    if (room) {
      room.gameState.drawHistory = [];
      //@ts-ignore
      room.gameState.redoStack = [];

      console.log(
        `[Memory Sweeper] Wiped drawing history completely to avoid RAM Bloat`,
      );

      if (this.io) {
        // Emit explicit draw_clear message to the room to wipe locally
        this.io
          .to(room.id)
          .emit("draw_clear", { instanceId: "server-sweeper" });

        // Also construct an 8-byte MSG_DRAW_CLEAR binary draw_binary buffer to ensure any binary client clears
        const clearBuf = Buffer.alloc(8);
        clearBuf.writeUInt8(5, 0); // MSG_DRAW_CLEAR type
        clearBuf.write("server", 1, 7, "ascii"); // string padding or server identification
        this.io.to(room.id).emit("draw_binary", clearBuf);
      }
    }
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

  undoLastDrawing(roomId: string): { event: string; data: any }[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    if (!room.gameState.drawHistory) room.gameState.drawHistory = [];
    //@ts-ignore
    if (!room.gameState.redoStack) room.gameState.redoStack = [];

    const history = room.gameState.drawHistory;
    //@ts-ignore
    const redoStack = room.gameState.redoStack;

    const isDrawEnd = (cmd: any) =>
      cmd.event === "draw_end" ||
      (cmd.event === "draw_binary" &&
        Buffer.isBuffer(cmd.data) &&
        cmd.data.length > 0 &&
        cmd.data[0] === 3);

    const isDrawAction = (cmd: any) =>
      cmd.event === "draw_action" ||
      (cmd.event === "draw_binary" &&
        Buffer.isBuffer(cmd.data) &&
        cmd.data.length > 0 &&
        cmd.data[0] === 4);

    const isDrawStart = (cmd: any) =>
      cmd.event === "draw_start" ||
      (cmd.event === "draw_binary" &&
        Buffer.isBuffer(cmd.data) &&
        cmd.data.length > 0 &&
        cmd.data[0] === 1);

    let endIndex = history.length - 1;
    while (
      endIndex >= 0 &&
      !isDrawEnd(history[endIndex]) &&
      !isDrawAction(history[endIndex])
    ) {
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
          const removed = history.splice(
            startIndex,
            history.length - startIndex,
          );
          redoStack.push(removed);
        }
      }
    }
    return history;
  }

  redoDrawing(roomId: string): { event: string; data: any }[] {
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
    console.error(
      `[NEW CONNECTION] Socket ID: ${player.id} , Username: ${player.name}, Persistent ID: ${player.persistentId || "N/A"}`,
    );
    const room = this.createRoom(roomId);

    // Remove from previous room if any
    const existingPlayer = this.players.get(player.id);
    if (
      existingPlayer &&
      existingPlayer.roomId &&
      existingPlayer.roomId !== roomId
    ) {
      this.removePlayerFromRoom(existingPlayer.roomId, player.id);
    }

    player.roomId = roomId;
    player.lastActivity = Date.now();
    this.players.set(player.id, player);

    // Add to new room if not already in it
    if (!room.players.find((p) => p.id === player.id)) {
      room.players.push(player);
      const pId = player.persistentId || player.id;
      if (!room.gameState.turnQueue.includes(pId)) {
        room.gameState.turnQueue.push(pId);
      }
    }

    this.broadcastState(room);
    return room;
  }

  removePlayerFromRoom(roomId: string, socketId: string): Room | undefined {
    try {
      const room = this.rooms.get(roomId);
      if (room) {
        const player = this.players.get(socketId);
        const pId = player ? player.persistentId || player.id : socketId;

        room.players = room.players.filter((p) => p.id !== socketId);
        room.gameState.turnQueue = room.gameState.turnQueue.filter(
          (id) => id !== pId,
        );
        room.gameState.correctGuessers = room.gameState.correctGuessers.filter(
          (id) => id !== pId,
        );

        if (player) {
          player.roomId = null;
        }

        if (room.players.length === 0) {
          this.rooms.delete(roomId);
          return undefined; // Room deleted
        }

        if (room.players.length < 2) {
          room.players.forEach((p) => (p.score = 0));
        }

        // Handle if current drawer leaves
        if (room.gameState.currentDrawerId === pId) {
          if (
            room.gameState.correctGuessers.length === 0 &&
            room.players.length > 0
          ) {
            this.transitionToRoundEnd(room, "drawer_left");
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

  public reconnectPlayer(
    roomId: string,
    persistentId: string,
    nickname: string,
    newSocketId: string,
  ): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    let existingPlayer = room.players.find(
      (p) => p.persistentId && p.persistentId === persistentId,
    );
    let matchMethod = "persistentId";
    if (!existingPlayer) {
      // fallback: find by name (even if technically online, it might be a ghost socket that hasn't timed out yet)
      existingPlayer = room.players.find((p) => p.name === nickname);
      if (existingPlayer) matchMethod = "nickname";
    }

    if (!existingPlayer) {
      console.error(
        `[RECONNECT ATTEMPT] Searching for User: ${nickname}, Found Match? No, Old Socket ID: N/A, New Socket ID: ${newSocketId}`,
      );
      return null;
    }

    const oldSocketId = existingPlayer.id;

    // Rescue player: cancel their eviction timer
    const pId = existingPlayer.persistentId || existingPlayer.name;
    if (this.evictionTimers.has(pId)) {
      console.log(
        `[GRACE PERIOD] Rescued player ${existingPlayer.name} (${pId}). Cancelling 10s eviction timer.`,
      );
      clearTimeout(this.evictionTimers.get(pId));
      this.evictionTimers.delete(pId);
    }

    if (oldSocketId === newSocketId) {
      console.error(
        `[RECONNECT ATTEMPT] Searching for User: ${existingPlayer.name}, Found Match? Yes (${matchMethod}), Socket ID unchanged: ${newSocketId}`,
      );
      existingPlayer.isOffline = false;
      existingPlayer.lastActivity = Date.now();
      delete existingPlayer.offlineSince;
      this.broadcastState(room);
      return room;
    }

    console.error(
      `[RECONNECT ATTEMPT] Searching for User: ${existingPlayer.name}, Found Match? Yes (${matchMethod}), Old Socket ID: ${oldSocketId}, New Socket ID: ${newSocketId}`,
    );

    // --- Ghost Socket Shield ---
    // If we have a new socket ID, forcefully disconnect the stale ghost socket connection
    // to prevent listeners from leaking, ghost states, or chat freeze.
    if (oldSocketId && oldSocketId !== newSocketId && this.io) {
      const oldSocket = this.io.sockets.sockets.get(oldSocketId);
      if (oldSocket) {
        console.log(`[Ghost Socket Shield] Force-disconnecting leaking ghost socket: ${oldSocketId}`);
        oldSocket.disconnect(true);
      }
    }

    // Update Player ID mapping
    existingPlayer.id = newSocketId;
    existingPlayer.isOffline = false;
    existingPlayer.lastActivity = Date.now();
    delete existingPlayer.offlineSince;

    // Update RoomManager players map
    this.players.delete(oldSocketId);
    this.players.set(newSocketId, existingPlayer);

    // Also explicitly update the chat messages and guesses to reference the new ID natively
    if (room.chatMessages) {
      room.chatMessages.forEach((msg) => {
        if (msg.senderId === oldSocketId) msg.senderId = newSocketId;
      });
    }
    if (room.guessMessages) {
      room.guessMessages.forEach((msg) => {
        if (msg.senderId === oldSocketId) msg.senderId = newSocketId;
      });
    }

    this.broadcastState(room);
    return room;
  }

  getPlayer(socketId: string): Player | undefined {
    return this.players.get(socketId);
  }

  public handleDisconnect(socketId: string) {
    try {
      const player = this.players.get(socketId);

      // Explicitly check the room's player array as well to ensure it's not a dangling old socket
      // matched by username or old map entry
      let activeRoomPlayer = null;
      let roomId = player?.roomId;

      if (!roomId) {
        // Fallback manual scan just in case this.players map was out of sync
        for (const [rid, room] of this.rooms.entries()) {
          const found = room.players.find((p) => p.id === socketId);
          if (found) {
            activeRoomPlayer = found;
            roomId = rid;
            break;
          }
        }
      } else {
        const room = this.rooms.get(roomId);
        if (room) {
          activeRoomPlayer = room.players.find((p) => p.id === socketId);

          // If player is found in this.players map but their actual ID in the room array was updated to a NEW socket, ignore this disconnect
          const playerByNameOrRef = room.players.find(
            (p) => p.name === player?.name,
          );
          if (playerByNameOrRef && playerByNameOrRef.id !== socketId) {
            console.warn(
              `[IGNORED DISCONNECT] Socket ${socketId} belongs to old connection of ${playerByNameOrRef.name}. Current active socket is ${playerByNameOrRef.id}.`,
            );
            return;
          }
        }
      }

      const pToUpdate = activeRoomPlayer || player;
      if (!pToUpdate) return;

      if (pToUpdate.id !== socketId) {
        console.warn(
          `[IGNORED DISCONNECT - ID MISMATCH] Disconnecting: ${socketId}, Active: ${pToUpdate.id}`,
        );
        return;
      }

      console.error(
        `[PLAYER DISCONNECTED] Socket ID: ${socketId}, Username: ${pToUpdate.name}`,
      );

      pToUpdate.isOffline = true;
      pToUpdate.offlineSince = Date.now();

      if (roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
          // Broadcast state so clients see isOffline
          this.broadcastState(room);

          // Grace period setup (10 seconds)
          const pId = pToUpdate.persistentId || pToUpdate.name;
          if (this.evictionTimers.has(pId)) {
            clearTimeout(this.evictionTimers.get(pId));
          }

          console.log(
            `[GRACE PERIOD] Starting 10-second grace timer for disconnected player ${pToUpdate.name} (${pId})`,
          );
          const timer = setTimeout(() => {
            try {
              const currentRoom = this.rooms.get(roomId!);
              if (currentRoom) {
                const checkPlayer = currentRoom.players.find(
                  (p) => (p.persistentId || p.name) === pId,
                );
                if (checkPlayer && checkPlayer.isOffline) {
                  console.log(
                    `[GRACE PERIOD] Eviction timeout triggered for ${checkPlayer.name}. Cleaning up player representation.`,
                  );

                  this.removePlayerFromRoom(roomId!, checkPlayer.id);
                  this.players.delete(checkPlayer.id);
                  this.evictionTimers.delete(pId);

                  this.broadcastMessage(currentRoom, {
                    id:
                      "sys-" +
                      Date.now().toString() +
                      Math.random().toString(36).substr(2, 5),
                    text: `خرج ${checkPlayer.name} من اللعبة`,
                    type: "system",
                  });
                }
              }
            } catch (err) {
              console.error("Error running grace eviction:", err);
            }
          }, 10000);

          this.evictionTimers.set(pId, timer);
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
        // Strict guard: only proceed if the current room's player still uses THIS socketId
        const room = this.rooms.get(player.roomId);
        if (room) {
          const activePlayer = room.players.find((p) => p.name === player.name);
          if (activePlayer && activePlayer.id !== socketId) {
            console.warn(
              `[IGNORED REMOVE] Socket ${socketId} belongs to old connection of ${activePlayer.name}. Active socket is ${activePlayer.id}. ignoring.`,
            );
            this.players.delete(socketId); // Just clean map if it's lingering
            return;
          }
        }

        this.removePlayerFromRoom(player.roomId, socketId);
      }
      this.players.delete(socketId);
    } catch (e) {
      console.error("Error removing player:", e);
    }
  }
}

export const roomManager = new RoomManager();

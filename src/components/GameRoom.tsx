import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import DrawingBoard from "./DrawingBoard";
import {
  Send,
  MessageSquare,
  AlertTriangle,
  Volume2,
  Info,
  X,
  User as UserIcon,
  UserMinus,
  Pencil,
  Copy,
  Check,
  Clock,
  WifiOff,
  Eye,
  EyeOff,
  LogOut,
  DoorOpen,
  ArrowRight,
} from "lucide-react";
import { useSocket } from "./SocketProvider";
import { motion, AnimatePresence } from "motion/react";
import { PlayersSidebar } from "./game/PlayersSidebar";
import { MiniBoardOverlay } from "./game/MiniBoardOverlay";
import { OverlayChatRoom, ChatMessage } from "./game/OverlayChatRoom";
import CinematicModal from "./game/CinematicModal";
import { safeLocalStorage } from "../utils/storage";

interface GameRoomProps {
  nickname: string;
  room: string;
  avatar: string;
  onLeave?: () => void;
  justJoined?: boolean;
}

interface Message {
  id: string;
  sender: string;
  senderId?: string;
  text: string;
  isSelf: boolean;
  type: "message" | "system";
  avatar?: string;
  color?: string;
}

type PlayerSlot = {
  id: string;
  name: string;
  points: number | null;
  isCurrent: boolean;
  isEmpty?: boolean;
  avatar?: string;
  wins?: number;
  isOffline?: boolean;
  persistentId?: string;
};

interface HitNotification {
  id: string;
  name: string;
}

const SmoothTimer = ({
  gameState,
  maxTime,
  isFullScreen = false,
}: {
  gameState: { status: string; timeLeft: number; currentWord?: string | null };
  maxTime: number;
  isFullScreen?: boolean;
}) => {
  const barRef = React.useRef<HTMLDivElement>(null);
  const lastTimeLeftRef = React.useRef(gameState.timeLeft);
  const lastUpdateRef = React.useRef(Date.now());
  const statusRef = React.useRef(gameState.status);

  React.useEffect(() => {
    if (gameState.status !== statusRef.current) {
      statusRef.current = gameState.status;
      lastTimeLeftRef.current = gameState.timeLeft;
      lastUpdateRef.current = Date.now();
    } else if (gameState.timeLeft !== lastTimeLeftRef.current) {
      lastTimeLeftRef.current = gameState.timeLeft;
      lastUpdateRef.current = Date.now();
    }
  }, [gameState.timeLeft, gameState.status]);

  React.useEffect(() => {
    let requestId: number;
    const updateTimer = () => {
      const now = Date.now();
      const elapsed = (now - lastUpdateRef.current) / 1000;
      let visualTimeLeft = lastTimeLeftRef.current - elapsed;
      if (visualTimeLeft < 0) visualTimeLeft = 0;
      let pct = (visualTimeLeft / maxTime) * 100;
      pct = Math.max(0, Math.min(100, pct));

      if (barRef.current) {
        barRef.current.style.width = `${pct}%`;
        let timerColorClass =
          "bg-[#FBBF24] shadow-[0_0_8px_rgba(251,191,36,0.5)]";
        if (gameState.status !== "DRAWING" && gameState.status !== "CHOOSING") {
          timerColorClass =
            "bg-[#1AD2FF] shadow-[0_0_8px_rgba(26,210,255,0.5)]";
        } else {
          if (pct <= 20) {
            timerColorClass = "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]";
          } else if (pct <= 50) {
            timerColorClass =
              "bg-[#F97316] shadow-[0_0_8px_rgba(249,115,22,0.5)]";
          }
        }
        barRef.current.className = `h-full rounded-full ${timerColorClass}`;
      }

      requestId = requestAnimationFrame(updateTimer);
    };
    requestId = requestAnimationFrame(updateTimer);
    return () => cancelAnimationFrame(requestId);
  }, [maxTime, gameState.status]);

  return (
    <div
      className={`w-full px-2 sm:px-3 py-1.5 shrink-0 flex items-center justify-center ${isFullScreen ? "bg-transparent" : "bg-game-primary-blue"}`}
      dir="ltr"
    >
      <div className="w-full h-1.5 sm:h-2 bg-black/40 rounded-full overflow-hidden shadow-inner flex justify-start">
        <div ref={barRef} className="h-full rounded-full bg-[#1AD2FF]" />
      </div>
    </div>
  );
};

// 🎬 2️⃣ Cinematic Flow & Stagger Animation Variants
const cinematicCardVariants = {
  hidden: { opacity: 0, scale: 0.94, y: 40 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.16, 1, 0.3, 1],
      staggerChildren: 0.06,
      delayChildren: 0.05
    }
  },
  exit: {
    opacity: 0,
    scale: 0.94,
    y: -25,
    transition: {
      duration: 0.25,
      ease: [0.7, 0, 0.84, 0]
    }
  }
};

const cinematicItemVariants = {
  hidden: { opacity: 0, y: 15, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1]
    }
  }
};

export default function GameRoom({
  nickname,
  room,
  avatar,
  onLeave,
  justJoined,
}: GameRoomProps) {
  const { socket, isConnected, socketId } = useSocket();
  const [isCanvasSyncing, setIsCanvasSyncing] = useState(true);
  const [isInitialLoadingRoom, setIsInitialLoadingRoom] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const guessInputRef = React.useRef<HTMLTextAreaElement>(null);
  const mainContainerRef = React.useRef<HTMLDivElement>(null);
  const iosKeyboardHeightCache = React.useRef<number>(350);
  const [maxViewportHeight, setMaxViewportHeight] = useState<number>(
    typeof window !== "undefined" ? window.innerHeight : 800,
  );
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const hasEmittedJoin = React.useRef(false);

  const [isAfkPopupOpen, setIsAfkPopupOpen] = useState(false);
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const [afkCountdown, setAfkCountdown] = useState(90);
  const lastActiveRef = React.useRef(Date.now());
  const afkCountdownIntervalRef = React.useRef<any>(null);

  const handleIHaveReturned = () => {
    setIsAfkPopupOpen(false);
    lastActiveRef.current = Date.now();
    socket?.emit("ping_activity");
  };

  const persistentPlayerId = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    let id = safeLocalStorage.getItem("gartic_player_id");
    if (!id) {
      id =
        "usr-" +
        Math.random().toString(36).substring(2, 11) +
        "-" +
        Date.now().toString(36);
      safeLocalStorage.setItem("gartic_player_id", id);
    }
    return id;
  }, []);

  const [gameState, setGameState] = useState<any>({
    status: "WAITING",
    currentDrawerId: null,
    currentWord: null,
    timeLeft: 0,
    wordOptions: [],
  });

  const [showCorrectAnimation, setShowCorrectAnimation] = useState(false);
  const [hitNotifications, setHitNotifications] = useState<HitNotification[]>(
    [],
  );

  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  const openChat = () => {
    setIsChatOpen(true);
    setUnreadCount(0);
  };

  const closeChat = () => {
    setIsChatOpen(false);
    const textarea = document.getElementById("chat-textarea");
    if (textarea) {
      textarea.blur();
    }
  };
  const [guessInput, setGuessInput] = useState("");
  const [chatInput, setChatInput] = useState("");

  const [guesses, setGuesses] = useState<Message[]>([]);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [currentPlayers, setCurrentPlayers] = useState<PlayerSlot[]>([]);

  const confettis = React.useMemo(() => {
    if (gameState.status !== "PODIUM") return [];
    const colors = [
      'bg-yellow-400', 'bg-red-400', 'bg-green-400', 'bg-blue-400', 
      'bg-pink-400', 'bg-orange-400', 'bg-purple-400', 'bg-teal-400', 'bg-amber-300'
    ];
    return Array.from({ length: 120 }).map((_, i) => {
      const wave = Math.floor(i / 40); // 3 waves of 40 particles
      const angleDeg = -90 + (Math.random() * 140 - 70); // -160deg to -20deg (upwards)
      const angleRad = (angleDeg * Math.PI) / 180;
      
      const forceX = Math.random() * 45 + 10; // vw scale
      const forceY = Math.random() * 40 + 55; // vh scale
      
      const tx = Math.sin(angleRad) * forceX;
      const ty = -Math.cos(angleRad) * forceY;
      
      const size = Math.random() * 10 + 6;
      // Delay: Wave 0 @ 2.2s, Wave 1 @ 5.7s, Wave 2 @ 9.2s...
      const delay = 2.2 + wave * 3.5 + Math.random() * 0.4;
      const duration = Math.random() * 1.5 + 2.5; // snappier explosion and fall
      const color = colors[i % colors.length];
      const isRound = Math.random() > 0.4;
      const rotation = Math.random() * 720 + 360;
      const drift = Math.random() * 20 - 10; // wind drift in vw
      
      return { 
        id: i, 
        tx: `${tx}vw`, 
        ty: `${ty}vh`, 
        drift: `${drift}vw`,
        size, 
        delay, 
        duration, 
        color, 
        isRound, 
        rotation: `${rotation}deg` 
      };
    });
  }, [gameState.status]);

  const [selectedProfilePlayer, setSelectedProfilePlayer] = useState<any>(null);
  const lastActiveProfilePlayerRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (selectedProfilePlayer) {
      lastActiveProfilePlayerRef.current = selectedProfilePlayer;
    }
  }, [selectedProfilePlayer]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = safeLocalStorage.getItem("gartic_blocked_users");
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      safeLocalStorage.setItem("gartic_blocked_users", JSON.stringify(blockedUsers));
    }
  }, [blockedUsers]);

  const [votekicks, setVotekicks] = useState<Record<string, string[]>>({});
  const [isBanned, setIsBanned] = useState(false);
  const [isRoomFull, setIsRoomFull] = useState(false);
  const [isNicknameTaken, setIsNicknameTaken] = useState(false);
  const [showCooldownWarning, setShowCooldownWarning] = useState(false);
  const lastVoteKickTimeRef = React.useRef<number>(0);

  const handleToggleVoteKick = () => {
    if (!selectedProfilePlayer) return;
    const targetPlayerId = selectedProfilePlayer.persistentId || selectedProfilePlayer.id;
    const isRemove = (votekicks[targetPlayerId] || []).includes(persistentPlayerId);

    if (!isRemove) {
      const lastVoteStr = typeof window !== "undefined" ? safeLocalStorage.getItem("gartic_last_votekick_time") : null;
      const lastVoteTime = lastVoteStr ? parseInt(lastVoteStr, 10) : 0;
      const timeSinceLastVote = Date.now() - lastVoteTime;
      if (timeSinceLastVote < 60000) {
        setShowCooldownWarning(true);
        return;
      }
    }

    socket?.emit("submit_vote_kick", { targetPlayerId }, (res: any) => {
      if (res.success) {
        if (!isRemove) {
          if (typeof window !== "undefined") {
            const now = Date.now();
            safeLocalStorage.setItem("gartic_last_votekick_time", now.toString());
            lastVoteKickTimeRef.current = now;
          }
        }
      } else {
        console.error("Votekick error:", res.error);
      }
    });
  };

  const handleToggleBlock = () => {
    if (!selectedProfilePlayer) return;
    const targetId = selectedProfilePlayer.persistentId || selectedProfilePlayer.id;
    setBlockedUsers((prev) => {
      if (prev.includes(targetId)) {
        return prev.filter(id => id !== targetId);
      } else {
        return [...prev, targetId];
      }
    });
  };

  const filteredChatMessages = React.useMemo(() => {
    return chatMessages.filter(msg => {
      if (!msg.senderId) return true;
      const senderPlayer = currentPlayers.find(p => p.id === msg.senderId);
      const pId = senderPlayer?.persistentId;
      const isBlocked = blockedUsers.includes(msg.senderId) || (pId && blockedUsers.includes(pId));
      return !isBlocked;
    });
  }, [chatMessages, blockedUsers, currentPlayers]);

  // Auto-dismiss the room loading screen once player state and canvas draw-history have finished syncing
  useEffect(() => {
    if (currentPlayers.length > 0 && !isCanvasSyncing) {
      const timer = setTimeout(() => {
        setIsInitialLoadingRoom(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentPlayers.length, isCanvasSyncing]);

  const amIDrawer = React.useMemo(() => {
    if (!gameState.currentDrawerId) return false;
    if (gameState.currentDrawerId === persistentPlayerId) return true;

    // fallback: locate the player slots
    const drawerPlayer = currentPlayers.find(
      (p) =>
        p.persistentId === gameState.currentDrawerId ||
        p.id === gameState.currentDrawerId,
    );
    if (drawerPlayer && drawerPlayer.persistentId) {
      return drawerPlayer.persistentId === persistentPlayerId;
    }
    const slotMe = currentPlayers.find(
      (p) => p.persistentId === persistentPlayerId,
    );
    if (
      slotMe &&
      drawerPlayer &&
      slotMe.persistentId === drawerPlayer.persistentId
    ) {
      return true;
    }
    return gameState.currentDrawerId === socketId;
  }, [gameState.currentDrawerId, currentPlayers, persistentPlayerId, socketId]);

  const drawerPersistentId = React.useMemo(() => {
    if (!gameState.currentDrawerId) return "lobby";
    const drawerPlayer = currentPlayers.find(
      (p) =>
        p.persistentId === gameState.currentDrawerId ||
        p.id === gameState.currentDrawerId,
    );
    return drawerPlayer?.persistentId || gameState.currentDrawerId;
  }, [gameState.currentDrawerId, currentPlayers]);

  // Clean-up and auto-dismiss of overlays when phase/turn changes
  useEffect(() => {
    if (gameState?.status !== "DRAWING") {
      setShowReportConfirm(false);
    }
    if (gameState?.status === "CHOOSING" && amIDrawer) {
      setSelectedProfilePlayer(null);
    }
  }, [gameState?.status, amIDrawer]);

  const isDrawingMode = gameState.status === "DRAWING" && amIDrawer;

  const hasAlreadyReported = React.useMemo(() => {
    if (!gameState.reports) return false;
    return (
      gameState.reports.includes(persistentPlayerId) ||
      (socket?.id ? gameState.reports.includes(socket.id) : false)
    );
  }, [gameState.reports, persistentPlayerId, socket?.id]);

  const canReport = gameState.status === "DRAWING" && !amIDrawer && !hasAlreadyReported;

  const handleReport = () => {
    if (!canReport) return;
    setShowReportConfirm(true);
  };

  // --- Block 1: Handle Room Join & Rejoin based on (Re)connection status ---
  useEffect(() => {
    if (!socket) return;

    const handleJoin = () => {
      const reconnectOnly = hasEmittedJoin.current || !justJoined;
      console.log(
        "[GameRoom] Sending join_room:",
        room,
        "with playerId:",
        persistentPlayerId,
        "socket:",
        socket.id,
        "reconnectOnly:",
        reconnectOnly,
      );
      socket.emit(
        "join_room",
        {
          roomId: room,
          nickname,
          avatar: avatar || nickname.charAt(0).toUpperCase(),
          playerId: persistentPlayerId,
          reconnectOnly: reconnectOnly,
        },
        (res: any) => {
          if (res && res.success) {
            console.log("[GameRoom] Successfully joined/reconnected room.");
            hasEmittedJoin.current = true;
          } else if (
            res &&
            (res.error === "session_expired" ||
              res.reason === "session_expired")
          ) {
            console.warn(
              "[GameRoom] Server session expired or evicted. Redirecting to setup/lobby.",
            );
            if (typeof window !== "undefined") {
              safeLocalStorage.removeItem("gartic_player_room");
              const reason = res.reason || "connection_lost";
              safeLocalStorage.setItem("gartic_session_expired_reason", reason);
              if (reason === "afk_idle" || reason === "afk_kicked") {
                safeLocalStorage.setItem("gartic_afk_kicked", Date.now().toString());
              } else {
                safeLocalStorage.setItem("gartic_connection_lost", Date.now().toString());
              }
            }
            onLeave?.();
          } else if (res && res.error === "nickname_taken") {
            console.warn("[GameRoom] Rejoin blocked: Nickname is already taken.");
            setIsNicknameTaken(true);
            setIsInitialLoadingRoom(false);
          } else if (res && res.error === "banned") {
            console.warn("[GameRoom] Rejoin blocked: Player is banned from room.");
            setIsBanned(true);
            setIsInitialLoadingRoom(false);
          } else if (res && res.error) {
            console.warn("[GameRoom] Join room failed with error:", res.error);
            if (res.error.includes("ممتلئة") || res.error.includes("full") || res.error.includes("كامل")) {
              setIsRoomFull(true);
            }
            setIsInitialLoadingRoom(false);
          }
        },
      );
    };

    if (socket.connected) {
      handleJoin();
    }

    socket.on("connect", handleJoin);

    return () => {
      socket.off("connect", handleJoin);
    };
  }, [socket]);

  // --- Local Visual Count Down for the AFK Warning Popup ---
  useEffect(() => {
    if (isAfkPopupOpen) {
      afkCountdownIntervalRef.current = setInterval(() => {
        setAfkCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(afkCountdownIntervalRef.current);
            console.warn("[AFK Engine] Local countdown finished. Waiting for server to kick.");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (afkCountdownIntervalRef.current) {
        clearInterval(afkCountdownIntervalRef.current);
      }
    }

    return () => {
      if (afkCountdownIntervalRef.current) {
        clearInterval(afkCountdownIntervalRef.current);
      }
    };
  }, [isAfkPopupOpen]);

  // --- Smart Awaken Trigger (Page Visibility API) ---
  useEffect(() => {
    if (!socket) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[Visibility API] Tab awakened. Syncing with server...");
        if (!socket.connected) {
          console.log("[Visibility API] Socket disconnected. Reconnecting cleanly...");
          socket.connect();
        }
        // Force an immediate activity ping to prevent false-positive AFK kick
        socket.emit("ping_activity");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [socket]);

  // --- Block 2: Register Persistent Socket Listeners ---
  useEffect(() => {
    if (!socket) return;

    const onRoomStateUpdate = (state: {
      roomId: string;
      players: any[];
      votekicks?: any;
      gameState: any;
    }) => {
      if (state.votekicks) {
        setVotekicks(state.votekicks);
      }
      const isActiveRound =
        state.gameState?.status === "DRAWING" ||
        state.gameState?.status === "CHOOSING";

      setCurrentPlayers((prevPlayers) => {
        const mapped = state.players.map((p) => ({
          id: p.id,
          name: p.name,
          points: p.score || 0,
          wins: p.wins || 0,
          isCurrent:
            isActiveRound &&
            state.gameState?.currentDrawerId === (p.persistentId || p.id),
          isOffline: p.isOffline || false,
          avatar: p.avatar,
          isEmpty: false,
          persistentId: p.persistentId,
        }));

        mapped.sort((a, b) => {
          // If points are different, sort by points descending
          if (b.points !== a.points) {
            return b.points - a.points;
          }

          // If points are identical and > 0, use the exact same tie-breaker as the server
          // (which is the join order, reflected by their index in state.players)
          if (b.points > 0) {
            const indexA_server = state.players.findIndex((p) => p.id === a.id);
            const indexB_server = state.players.findIndex((p) => p.id === b.id);
            return indexA_server - indexB_server;
          }

          // If points are identical (such as a round-end score reset or tie), preserve their previous ranking order
          const indexA = prevPlayers.findIndex((p) => p.id === a.id);
          const indexB = prevPlayers.findIndex((p) => p.id === b.id);

          if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
          }

          // Fallback if one is new
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;

          return a.name.localeCompare(b.name);
        });

        return mapped;
      });

      if (state.gameState) {
        setGameState((prev: any) => {
          return state.gameState;
        });
      }
    };

    const onTimerTick = (data: { timeLeft: number; status: string }) => {
      setGameState((prev) => ({
        ...prev,
        timeLeft: data.timeLeft,
        status: data.status,
      }));
    };

    const onReceiveMessage = (msg: any) => {
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) {
          return prev;
        }
        const updated = [
          ...prev,
          {
            ...msg,
            isSelf: msg.senderId === socket.id,
          },
        ];
        return updated.slice(-40);
      });

      setIsChatOpen((currentOpenState) => {
        if (!currentOpenState) {
          setUnreadCount((prevCount) => prevCount + 1);
        }
        return currentOpenState;
      });
    };

    const onReceiveGuess = (msg: any) => {
      setGuesses((prev) => {
        if (prev.some((m) => m.id === msg.id)) {
          return prev;
        }
        const updated = [
          ...prev,
          {
            ...msg,
            isSelf: msg.senderId === socket.id,
          },
        ];
        return updated.slice(-40);
      });

      if (msg.subType === "hit") {
        if (msg.senderId === socket.id) {
          if (guessInputRef.current) {
            guessInputRef.current.blur();
          }
          setShowCorrectAnimation(true);
          setTimeout(() => setShowCorrectAnimation(false), 1200);
        }

        const hitId = Date.now().toString() + Math.random().toString();
        setHitNotifications((prev) => {
          const next = [...prev, { id: hitId, name: msg.sender }];
          return next.slice(-20); // allow up to 20 notifications at once for larger rooms
        });

        setTimeout(() => {
          setHitNotifications((prev) => prev.filter((n) => n.id !== hitId));
        }, 4500);
      }

      if (msg.subType === "report") {
        const reportId = Date.now().toString() + Math.random().toString();
        setHitNotifications((prev) => {
          const next = [...prev, { id: reportId, name: msg.sender, isReport: true }];
          return next.slice(-20);
        });

        setTimeout(() => {
          setHitNotifications((prev) => prev.filter((n) => n.id !== reportId));
        }, 4500);
      }
    };

    const onSessionExpired = (data: any) => {
      console.warn("[GameRoom] Session expired (AFK/Evicted). Returning to lobby.", data);
      if (typeof window !== "undefined") {
        safeLocalStorage.removeItem("gartic_player_room");
        const reason = (data && data.reason) || "connection_lost";
        safeLocalStorage.setItem("gartic_session_expired_reason", reason);
        if (reason === "afk_idle" || reason === "afk_kicked") {
          safeLocalStorage.setItem("gartic_afk_kicked", Date.now().toString());
        } else {
          safeLocalStorage.setItem("gartic_connection_lost", Date.now().toString());
        }
      }
      onLeave?.();
    };

    const onAfkWarning = (data: any) => {
      console.warn("[AFK] Warning received from server. Seconds remaining:", data?.secondsLeft);
      setIsAfkPopupOpen(true);
      setAfkCountdown(data?.secondsLeft || 90);
    };

    const onBannedFromRoom = () => {
      console.warn("[GameRoom] You are banned/kicked from the room by other users.");
      setIsBanned(true);
      setIsInitialLoadingRoom(false);
    };

    socket.on("room_state_update", onRoomStateUpdate);
    socket.on("receive_message", onReceiveMessage);
    socket.on("receive_guess", onReceiveGuess);
    socket.on("timer_tick", onTimerTick);
    socket.on("session_expired", onSessionExpired);
    socket.on("afk_warning", onAfkWarning);
    socket.on("banned_from_room", onBannedFromRoom);

    return () => {
      socket.off("room_state_update", onRoomStateUpdate);
      socket.off("receive_message", onReceiveMessage);
      socket.off("receive_guess", onReceiveGuess);
      socket.off("timer_tick", onTimerTick);
      socket.off("session_expired", onSessionExpired);
      socket.off("afk_warning", onAfkWarning);
      socket.off("banned_from_room", onBannedFromRoom);
    };
  }, [socket]);

  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    let currentMax = window.visualViewport?.height || window.innerHeight;
    setMaxViewportHeight(currentMax);

    const handleResize = () => {
      if (!window.visualViewport) return;

      const currentHeight = window.visualViewport.height;

      if (currentHeight > currentMax) {
        currentMax = currentHeight;
        setMaxViewportHeight(currentMax);
      }

      // True if height shrunk significantly
      const isKeyboardShowing = currentHeight < currentMax - 150;
      setIsKeyboardOpen(isKeyboardShowing);

      // Calculate keyboard inset for iOS Safari
      // On Android, the main container (100dvh) usually shrinks with the visual viewport.
      // On iOS Safari, the main container stays full height, but visual viewport shrinks.
      if (mainContainerRef.current) {
         const containerHeight = mainContainerRef.current.getBoundingClientRect().height;
         // If container is larger than visual viewport, it means keyboard is covering the bottom
         // and the container didn't shrink to accommodate it (iOS Safari behavior).
         const inset = Math.max(0, containerHeight - currentHeight);
         document.documentElement.style.setProperty("--keyboard-inset", `${inset}px`);
         
         if (inset > 150) {
           iosKeyboardHeightCache.current = inset + 25;
         }
      }

      if (!isKeyboardShowing) {
        // Android specific fix: When keyboard is dismissed using back button,
        // the input remains focused but the keyboard is gone. We must blur it
        // so the room returns to its normal layout. We target Android specifically
        // to ensure we don't interfere with iOS Safari behavior.
        if (typeof window !== "undefined" && /android/i.test(navigator.userAgent || "")) {
          const activeEl = document.activeElement;
          if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
            (activeEl as HTMLElement).blur();
          }
        }
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleResize);
      handleResize();
      // We don't listen to scroll here anymore to avoid conflicting with natural panning
    }

    return () => {
      window.visualViewport?.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyPosition = document.body.style.position;
    const originalBodyWidth = document.body.style.width;
    const originalBodyHeight = document.body.style.height;

    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalHtmlPosition = document.documentElement.style.position;
    const originalHtmlHeight = document.documentElement.style.height;

    // Lock body to prevent outer scrolling entirely in the GameRoom,
    // so iOS Safari never scrolls the page up when the keyboard appears.
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100vw";
    document.body.style.height = "100%";

    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.position = "fixed";
    document.documentElement.style.height = "100%";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.position = originalBodyPosition;
      document.body.style.width = originalBodyWidth;
      document.body.style.height = originalBodyHeight;

      document.documentElement.style.overflow = originalHtmlOverflow;
      document.documentElement.style.position = originalHtmlPosition;
      document.documentElement.style.height = originalHtmlHeight;
    };
  }, []);


  const isInputDisabled =
    gameState.status === "WAITING" ||
    gameState.status === "ROUND_END" ||
    gameState.status === "PODIUM" ||
    gameState.status === "CHOOSING" ||
    amIDrawer ||
    gameState.correctGuessers?.includes(socketId || "");

  useEffect(() => {
    if (isInputDisabled) {
      if (guessInputRef.current) {
        guessInputRef.current.blur();
      }
      setIsInputFocused(false);
    }
  }, [isInputDisabled]);

  const handleIOSFocusBypass = () => {
    if (typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))) {
      document.documentElement.style.setProperty("--keyboard-inset", `${iosKeyboardHeightCache.current}px`);
      window.scrollTo(0, 0);
      setTimeout(() => window.scrollTo(0, 0), 10);
    }
  };

  const handleGuessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !guessInput.trim() ||
      gameState.correctGuessers?.includes(socketId || "") ||
      amIDrawer
    )
      return;

    socket?.emit("submit_guess", { guess: guessInput.trim() });
    setGuessInput("");
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;

    socket.emit("send_message", { text: chatInput.trim() });

    setChatInput("");
    const textarea = document.getElementById(
      "chat-textarea",
    ) as HTMLTextAreaElement;
    if (textarea) {
      textarea.style.height = "40px";
    }
  };

  const handleSkipTurn = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    socket?.emit("skip_turn");
    setShowSkipConfirm(false);
  };

  const handleWordSelect = (word: string) => {
    socket?.emit("select_word", { word });
  };

  const renderWordOverlay = (isFullScreenMode: boolean = false) => {
    if (gameState.status !== "DRAWING") return null;
    if (amIDrawer && !isFullScreenMode) return null;
    return (
      <div 
        className="absolute left-0 right-0 flex items-center justify-center z-[150] pointer-events-none"
        style={{ top: 'clamp(6px, 1.6vw, 12px)' }}
      >
        {(() => {
          const isDrawer = amIDrawer;
          const hintsUsed = gameState.hintsUsed || 0;
          const maskedArray = gameState.maskedWordArray || [];

          if (isDrawer && gameState.currentWord) {
            const isRTL = /[\u0600-\u06FF]/.test(gameState.currentWord);

            return (
              <div
                className="flex items-center"
                style={{ 
                  flexDirection: isRTL ? "row-reverse" : "row",
                  gap: 'clamp(4px, 1.6vw, 12px)'
                }}
              >
                {gameState.currentWord
                  .split("")
                  .map((char: string, i: number) => {
                    if (char === " ")
                      return (
                        <span 
                          key={`space-${i}`} 
                          style={{ width: 'clamp(10px, 3.2vw, 24px)' }} 
                        />
                      );
                    const isRevealed = (
                      gameState.revealedIndices || []
                    ).includes(i);
                    return (
                      <div
                        key={`char-${i}`}
                        className="flex flex-col items-center justify-between"
                        style={{ height: 'clamp(22px, 5.2vw, 42px)' }}
                      >
                        <span
                          className={`leading-none font-black ${isRevealed ? "text-[#FBBF24]" : "text-[#0F172A]"}`}
                          style={{ fontSize: 'clamp(14px, 3.2vw, 24px)' }}
                        >
                          {char}
                        </span>
                        <div
                          className={`rounded-full mt-auto ${hintsUsed >= 1 ? (isRevealed ? "bg-[#FBBF24]" : "bg-[#0F172A]") : "opacity-0"}`}
                          style={{
                            width: 'clamp(7px, 1.9vw, 14px)',
                            height: 'clamp(2.5px, 0.4vw, 3px)'
                          }}
                        />
                      </div>
                    );
                  })}
              </div>
            );
          } else {
            if (!maskedArray || maskedArray.length === 0) return null;
            const fullWordStr = maskedArray
              .map((m: any) => m.char || "")
              .join("");
            const isRTL = /[\u0600-\u06FF]/.test(
              fullWordStr || gameState.currentWord || "",
            );

            return (
              <div
                className="flex items-center"
                style={{ 
                  flexDirection: isRTL ? "row-reverse" : "row",
                  gap: 'clamp(4px, 1.6vw, 12px)'
                }}
              >
                {maskedArray.map((item: any, i: number) => {
                  if (item.isSpace)
                    return (
                      <span 
                        key={`space-${i}`} 
                        style={{ width: 'clamp(10px, 3.2vw, 24px)' }} 
                      />
                    );
                  return (
                    <div
                      key={`char-${i}`}
                      className="flex flex-col items-center justify-between"
                      style={{ height: 'clamp(22px, 5.2vw, 42px)' }}
                    >
                      <span 
                        className="leading-none font-black text-[#0F172A]"
                        style={{ fontSize: 'clamp(14px, 3.2vw, 24px)' }}
                      >
                        {item.char || ""}
                      </span>
                      <div
                        className={`rounded-full mt-auto ${item.char ? "bg-[#0F172A]" : "bg-slate-500"}`}
                        style={{
                          width: 'clamp(7px, 1.9vw, 14px)',
                          height: 'clamp(2.5px, 0.4vw, 3px)'
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            );
          }
        })()}
      </div>
    );
  };

  const slots: PlayerSlot[] = Array.from({ length: 5 }).map((_, index) => {
    if (index < currentPlayers.length) return currentPlayers[index];
    return {
      id: `empty-${index}`,
      name: "Empty",
      points: null,
      isCurrent: false,
      isEmpty: true,
    };
  });

  const morphMode = isInputFocused;

  const getMaxTime = () => {
    switch (gameState.status) {
      case "DRAWING":
      case "CHOOSING":
        return 100;
      case "ROUND_END":
        return 8;
      case "PODIUM":
        return 15;
      default:
        return 15;
    }
  };
  const timerPercentage = Math.max(
    0,
    Math.min(100, (gameState.timeLeft / getMaxTime()) * 100),
  );

  const getCurrentDrawerName = () => {
    const player = currentPlayers.find(
      (p) =>
        p.persistentId === gameState.currentDrawerId ||
        p.id === gameState.currentDrawerId,
    );
    return player ? player.name : "";
  };

  // --- Hardware Back Button Interceptor ---
  const activeStatesRef = React.useRef({
    isChatOpen,
    showReportConfirm,
    showSkipConfirm,
    selectedProfilePlayer,
    showExitConfirm,
    showCooldownWarning
  });

  useEffect(() => {
    activeStatesRef.current = {
      isChatOpen,
      showReportConfirm,
      showSkipConfirm,
      selectedProfilePlayer,
      showExitConfirm,
      showCooldownWarning
    };
  }, [
    isChatOpen,
    showReportConfirm,
    showSkipConfirm,
    selectedProfilePlayer,
    showExitConfirm,
    showCooldownWarning
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Push an initial state to trap the back button
    // We append a hash to ensure the browser registers a distinct history entry
    if (!window.location.hash.includes("game")) {
      window.history.pushState(null, "", window.location.pathname + window.location.search + "#game");
    }

    const handlePopState = (e: PopStateEvent) => {
      // The user pressed back, which popped the "#game" hash.
      // We immediately push it back to trap the NEXT back press.
      window.history.pushState(null, "", window.location.pathname + window.location.search + "#game");

      const current = activeStatesRef.current;

      if (current.isChatOpen) {
        setIsChatOpen(false);
        const textarea = document.getElementById("chat-textarea");
        if (textarea) textarea.blur();
      } else if (current.showReportConfirm) {
        setShowReportConfirm(false);
      } else if (current.showSkipConfirm) {
        setShowSkipConfirm(false);
      } else if (current.selectedProfilePlayer) {
        setSelectedProfilePlayer(null);
      } else if (current.showCooldownWarning) {
        setShowCooldownWarning(false);
      } else if (current.showExitConfirm) {
        setShowExitConfirm(false);
      } else {
        // If nothing is open, open the exit confirm modal
        setShowExitConfirm(true);
      }
    };

    window.addEventListener("popstate", handlePopState);
    
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const effectiveHeight = "100dvh";

  return (
    <>
      <div
        ref={mainContainerRef}
        className="fixed top-0 left-0 right-0 grid w-full bg-bg-dark-brand font-sans overflow-hidden overscroll-none touch-none"
        style={{
          height: effectiveHeight,
          gridTemplateColumns: "minmax(0, 32%) minmax(0, 68%)",
          gridTemplateRows: "auto minmax(0, 1fr)",
        }}
      >
        {/* Global Exit Room Button */}
        {!isChatOpen && (
          <button
            onClick={() => setShowExitConfirm(true)}
            className="absolute top-1 right-1 z-[120] text-gray-800 hover:text-gray-950 transition-colors bg-transparent outline-none"
            title="الخروج من الغرفة"
          >
            <X size={32} strokeWidth={3} />
          </button>
        )}

        {/* Exit Confirmation Dialog */}
        <CinematicModal
          isOpen={showExitConfirm}
          onClose={() => setShowExitConfirm(false)}
          titleType="exit"
          titleText="EXIT"
          buttons={[
            {
              id: "exit-confirm-no-btn",
              text: "NO",
              onClick: () => setShowExitConfirm(false),
              variant: "primary",
            },
            {
              id: "exit-confirm-yes-btn",
              text: "YES",
              onClick: () => {
                setShowExitConfirm(false);
                socket?.emit("leave_room", { roomId: room });
                onLeave?.();
              },
              className: "flex-1 select-none cursor-pointer bg-[#FB923C] text-white hover:bg-[#EA580C] border-2 border-white/60 active:scale-95 transition-all text-base sm:text-lg font-black py-4 px-5 rounded-[22px] shadow-md tracking-wide flex items-center justify-center",
            },
          ]}
        >
          {/* Professional Static Door with Cartoon Anticipation Arrow */}
          <div className="w-full flex items-center justify-center mb-8 mt-4 relative h-24">
            {/* The Arrow */}
            <motion.div
              animate={{
                x: [0, -10, 20],
                scale: [1, 0.85, 0.6],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 1.6,
                repeat: Infinity,
                repeatDelay: 0.3,
                times: [0, 0.35, 1],
                ease: [0.25, 1, 0.3, 1], // Custom easing for the pullback then dart
              }}
              className="absolute left-[calc(50%-45px)] top-1/2 -translate-y-1/2 z-20 drop-shadow-md"
            >
              <ArrowRight className="w-10 h-10 text-[#2E2882] stroke-[4]" />
            </motion.div>
            
            {/* The Door */}
            <div className="absolute left-[calc(50%-20px)] top-1/2 -translate-y-1/2 flex items-center justify-center z-10">
              <DoorOpen className="w-28 h-28 text-[#8C8AA7] stroke-[1.5]" />
            </div>
          </div>

          {/* Question */}
          <h3 id="exit-confirm-title" className="text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-4">
            Do you want to leave the game?
          </h3>
        </CinematicModal>

        {/* Top Area (Drawing / Waiting) */}
        {/* 
            ⚠️ CRITICAL ARCHITECTURE RULE: DO NOT CHANGE THE ASPECT RATIO (1.72) OF THE CANVAS. 
            GameRoom uses aspect-[740/430]. Any internal canvas resizing must preserve 
            this exact aspect ratio to prevent spectator layout squishing or grey gaps. 
        */}
        <div
          className={`relative flex flex-col overflow-hidden bg-bg-dark-brand items-center justify-center
                      ${morphMode ? "col-start-2 col-end-3 row-start-1 row-end-2" : "col-start-1 col-end-3 row-start-1 row-end-2"}
                     `}
        >
          <div 
            className={`w-full max-w-full h-auto max-h-full aspect-[740/430] shrink-0 bg-white flex flex-col items-center justify-center overflow-hidden relative ${morphMode ? "rounded-bl-[6px] sm:rounded-bl-[8px]" : ""}`}
          >
            {/* Hint/Word Overlay Overlay for spectator view */}
            {!isDrawingMode && renderWordOverlay()}

            {/* Unified Adaptive Drawing Canvas Container */}
            <div
              className={
                isDrawingMode
                  ? "fixed inset-0 z-[100] bg-gray-300 flex flex-col items-center justify-center overflow-hidden"
                  : "w-full h-full relative flex flex-col"
              }
            >
              {isDrawingMode && renderWordOverlay(true)}
              <DrawingBoard
                key={`shared-board-${room || ""}`}
                currentDrawerId={gameState.currentDrawerId}
                status={gameState.status}
                readOnly={!isDrawingMode}
                onSyncStateChange={(syncing) => setIsCanvasSyncing(syncing)}
                onSkipTurn={
                  isDrawingMode && gameState.status === "DRAWING" && !(gameState.correctGuessers && gameState.correctGuessers.length > 0)
                    ? () => setShowSkipConfirm(true)
                    : undefined
                }
                onRequestHint={
                  isDrawingMode && gameState.status === "DRAWING" && !(gameState.correctGuessers && gameState.correctGuessers.length > 0)
                    ? () => socket?.emit("request_hint")
                    : undefined
                }
                timerPercentage={timerPercentage}
                timerBarNode={
                  isDrawingMode ? (
                    <SmoothTimer
                      gameState={gameState}
                      maxTime={getMaxTime()}
                      isFullScreen={true}
                    />
                  ) : undefined
                }
                hintsRemaining={
                  isDrawingMode
                    ? (() => {
                        const word = gameState.currentWord || "";
                        const charCount = word.replace(/\s/g, "").length;
                        let maxHints = charCount < 3 ? 1 : 2;
                        if (charCount >= 5) maxHints = 3;
                        return Math.max(0, maxHints - (gameState.hintsUsed || 0));
                      })()
                    : 0
                }
              />

              {/* Hit Notifications Overlay (Active only when drawing in fullscreen mode) */}
              {isDrawingMode && (
                <div className="absolute bottom-[90px] sm:bottom-[100px] left-1/2 -translate-x-1/2 z-[110] flex flex-col justify-end items-center pointer-events-none gap-0.5 overflow-visible h-auto max-h-56 w-full max-w-full">
                  <AnimatePresence>
                    {hitNotifications.map((hit) => {
                      if (hit.isReport) {
                        return (
                          <motion.div
                            layout
                            key={hit.id}
                            initial={{ opacity: 0, scale: 0.6, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{
                              opacity: 0,
                              scale: 0.6,
                              y: -10,
                              transition: { duration: 0.3 },
                            }}
                            transition={{ duration: 0.4, type: "spring", bounce: 0.4 }}
                            style={{
                              textShadow:
                                "1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 0 2px 4px rgba(255,100,100,0.4)",
                            }}
                            className="flex items-center justify-center gap-1.5 text-red-500 font-bold text-[15px] whitespace-nowrap bg-transparent"
                            dir="ltr"
                          >
                            <AlertTriangle size={16} className="text-red-500 shrink-0" />
                            <span
                              className="truncate max-w-[150px] sm:max-w-[200px] text-center"
                              dir="ltr"
                            >
                              {hit.name}
                            </span>
                            <span>reported!</span>
                          </motion.div>
                        );
                      }

                      return (
                        <motion.div
                          layout
                          key={hit.id}
                          initial={{ opacity: 0, scale: 0.6, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{
                            opacity: 0,
                            scale: 0.6,
                            y: -10,
                            transition: { duration: 0.3 },
                          }}
                          transition={{ duration: 0.4, type: "spring", bounce: 0.4 }}
                          style={{
                            textShadow:
                              "1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 0 2px 4px rgba(0,229,64,0.4)",
                          }}
                          className="flex items-center justify-center gap-1.5 text-[#00E540] font-bold text-[15px] whitespace-nowrap bg-transparent"
                          dir="ltr"
                        >
                          <Check size={16} strokeWidth={4} />
                          <span
                            className="truncate max-w-[150px] sm:max-w-[200px] text-center"
                            dir="ltr"
                          >
                            {hit.name}
                          </span>
                          <span>hit!</span>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Correct Guess Animation */}
            {showCorrectAnimation && (
              <div className="absolute inset-0 pointer-events-none z-[60] flex items-center justify-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1, 1, 1.1, 0] }}
                  transition={{
                    duration: 1,
                    times: [0, 0.2, 0.3, 0.75, 0.85, 1],
                    ease: [
                      "easeOut",
                      "easeInOut",
                      "linear",
                      "easeInOut",
                      "easeIn",
                    ],
                  }}
                  className="w-20 h-20 sm:w-26 sm:h-26 bg-[#00E540] rounded-full border-[4px] border-white flex items-center justify-center shadow-[0_6px_24px_rgba(0,229,64,0.5)]"
                >
                  <motion.svg
                    viewBox="0 0 50 50"
                    className="w-11 h-11 sm:w-14 sm:h-14 text-white drop-shadow-sm"
                  >
                    <motion.path
                      d="M 14 27 L 22 35 L 38 15"
                      fill="transparent"
                      strokeWidth="6"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{
                        pathLength: [0, 0, 1, 1, 0],
                        opacity: [0, 0, 1, 1, 0],
                      }}
                      transition={{
                        duration: 1,
                        times: [0, 0.15, 0.3, 0.85, 1],
                        ease: "linear",
                      }}
                    />
                  </motion.svg>
                </motion.div>
              </div>
            )}

            <MiniBoardOverlay 
              gameState={gameState} 
              amIDrawer={amIDrawer} 
              currentPlayers={currentPlayers}
              getCurrentDrawerName={getCurrentDrawerName}
            />
          </div>

          {/* Timer Bar */}
          <SmoothTimer
            gameState={gameState}
            maxTime={getMaxTime()}
            isFullScreen={false}
          />
        </div>

        {/* Left: Players Sidebar */}
        <PlayersSidebar
          slots={slots}
          gameState={gameState}
          morphMode={morphMode}
          socketId={socketId}
          onPlayerClick={setSelectedProfilePlayer}
        />

        {/* Right: Actions & Guess Input */}
        <div
          className={`flex flex-col relative bg-bg-panel-brand pb-2 pr-2 pt-0 pl-1 sm:pb-3 sm:pr-3 sm:pt-0 sm:pl-1.5
                      ${morphMode ? "col-start-2 col-end-3 row-start-2 row-end-3" : "col-start-2 col-end-3 row-start-2 row-end-3"}
                     `}
        >
          <div className="flex-1 flex flex-col bg-bg-dark-brand rounded-xl sm:rounded-2xl shadow-inner border border-white/5 overflow-hidden relative">
            {/* Actions Bar */}
            <div
              className={`shrink-0 bg-[#0A1A38] ${isInputFocused ? "hidden" : "block"}`}
            >
              <div className="overflow-hidden">
                <div className="flex gap-2 sm:gap-4 p-2 sm:p-3 justify-around">
                  <button
                    id="report-draw-btn"
                    disabled={!canReport}
                    onClick={handleReport}
                    title={hasAlreadyReported ? "You reported this draw" : "Report drawing"}
                    className={`w-8 h-8 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white transition-all shadow-md active:scale-95 cursor-pointer
                      ${hasAlreadyReported 
                        ? "bg-red-600 border border-red-500 opacity-90 cursor-not-allowed" 
                        : canReport 
                          ? "bg-orange-400 hover:bg-orange-500 cursor-pointer" 
                          : "bg-slate-500/40 opacity-40 cursor-not-allowed"
                      }`}
                  >
                    <AlertTriangle size={16} />
                  </button>
                  <button className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl bg-yellow-400 hover:bg-yellow-500 active:scale-95 flex items-center justify-center text-white transition-all shadow-md">
                    <Volume2 size={16} />
                  </button>
                  <button className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl bg-yellow-400 hover:bg-yellow-500 active:scale-95 flex items-center justify-center text-white transition-all shadow-md">
                    <Info size={16} />
                  </button>
                  <button
                    onClick={openChat}
                    className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl bg-yellow-400 hover:bg-yellow-500 active:scale-95 flex items-center justify-center text-bg-dark-brand font-bold transition-all shadow-md relative"
                  >
                    <MessageSquare size={16} />
                    {unreadCount > 0 && (
                      <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] sm:text-[11px] font-bold px-1 py-0.5 rounded-full shadow-md border-2 border-slate-200">
                        {unreadCount > 9 ? "+9" : unreadCount}
                      </div>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Feedback Area (interactive feed) */}
            <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-3 flex flex-col-reverse font-sans min-h-0 bg-transparent">
              <div className="flex flex-col-reverse gap-2">
                {[...guesses].reverse().map((msg) => {
                  const isSystem = msg.type === "system";
                  if (isSystem) {
                    const subType = (msg as any).subType || "";
                    const text = msg.text;

                    // Close guess warning
                    if (subType === "close") {
                      const displayWord = (msg as any).word || "";
                      return (
                        <div
                          key={msg.id}
                          className="flex items-center gap-2 text-amber-500 font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <span className="text-amber-500 font-black shrink-0">⚡</span>
                          <span dir="auto" className="flex items-center gap-1">
                            <span className="text-amber-500 font-extrabold">{displayWord}</span>
                            <span className="text-amber-500/90 font-normal">is close!</span>
                          </span>
                        </div>
                      );
                    }

                    // Drawing report warning log
                    if (subType === "report") {
                      return (
                        <div
                          key={msg.id}
                          className="flex items-center gap-2 text-[#EF4444] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <AlertTriangle
                            size={14}
                            className="text-[#EF4444] shrink-0 font-extrabold"
                          />
                          <span dir="auto" className="flex items-center gap-1">
                            <span className="text-[#EF4444] font-extrabold">{msg.sender}</span>
                            <span className="text-[#EF4444] font-normal">reported!</span>
                          </span>
                        </div>
                      );
                    }

                    // Drawing canceled turn log
                    if (subType === "canceled") {
                      return (
                        <div
                          key={msg.id}
                          className="flex items-center gap-2 text-[#EF4444] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <AlertTriangle
                            size={14}
                            className="text-[#EF4444] shrink-0 font-extrabold"
                          />
                          <span dir="auto" className="text-[#EF4444] font-normal">Canceled turn</span>
                        </div>
                      );
                    }

                    // Hit / guessed correctly
                    if (subType === "hit") {
                      const isSelfGuesser = msg.senderId === socketId;
                      const displayWord = (msg as any).word || "";
                      return (
                        <div
                          key={msg.id}
                          className="flex items-center gap-2 text-[#00E540] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <Check
                            size={14}
                            className="stroke-[3.5] text-[#00E540] shrink-0"
                          />
                          {isSelfGuesser ? (
                            <span dir="auto" className="font-normal text-[#00E540]">
                              You've found the answer: <span className="font-extrabold text-[#00E540]">{displayWord}</span>
                            </span>
                          ) : (
                            <span dir="auto" className="font-normal text-[#00E540]">
                              <span className="font-extrabold text-[#00E540]">{msg.sender || text.replace(" guessed the word!", "")}</span> hit!
                            </span>
                          )}
                        </div>
                      );
                    }

                    // Round End break / Interval
                    if (subType === "interval") {
                      return (
                        <div
                          key={msg.id}
                          className="flex items-center gap-2 text-[#1AD2FF] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <Clock
                            size={14}
                            className="text-[#1AD2FF] shrink-0"
                          />
                          <span className="font-normal text-[#1AD2FF]">Interval...</span>
                        </div>
                      );
                    }

                    // Turn change
                    if (subType === "turn") {
                      const match = text.match(/^(Turn of\s+)(.+)$/i);
                      return (
                        <div
                          key={msg.id}
                          className="flex items-center gap-2 text-[#1AD2FF] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <Pencil
                            size={12}
                            className="text-[#1AD2FF] shrink-0"
                          />
                          {match ? (
                            <span dir="auto" className="text-[#1AD2FF]">
                              Turn of <span className="font-extrabold text-[#1AD2FF]">{match[2]}</span>
                            </span>
                          ) : (
                            <span dir="auto" className="text-[#1AD2FF]">{text}</span>
                          )}
                        </div>
                      );
                    }

                    // Game over
                    if (subType === "game_over") {
                      return (
                        <div
                          key={msg.id}
                          className="flex items-start gap-2 text-[#1AD2FF] font-normal text-sm sm:text-base py-1 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <Info
                            size={14}
                            className="text-[#1AD2FF] shrink-0 mt-0.5"
                          />
                          <span dir="auto" className="font-normal">{text}</span>
                        </div>
                      );
                    }

                    // Everybody hit
                    if (subType === "all_guessed") {
                      return (
                        <div
                          key={msg.id}
                          className="flex items-center gap-2 text-[#00E540] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <Check
                            size={14}
                            className="stroke-[3.5] text-[#00E540] shrink-0"
                          />
                          <span className="font-normal">Everybody hit the answer!</span>
                        </div>
                      );
                    }

                    // Lost turn / Inactive
                    if (
                      subType === "lost_turn" ||
                      text.toLowerCase().includes("lost the turn") ||
                      text.toLowerCase().includes("lost your turn")
                    ) {
                      const isDrawerSelf = amIDrawer;
                      const displayText = isDrawerSelf
                        ? "You've lost your turn"
                        : text;
                      return (
                        <div
                          key={msg.id}
                          className="flex items-center gap-2 text-[#EF4444] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <AlertTriangle
                            size={14}
                            className="text-[#EF4444] shrink-0"
                          />
                          <span dir="auto" className="font-normal">{displayText}</span>
                        </div>
                      );
                    }

                    // Other reveals
                    const isNobodyHit = text.toLowerCase().includes("nobody hit");
                    let iconNode = (
                      <Info size={14} className="shrink-0 text-[#1AD2FF]" />
                    );
                    let textColor = "#1AD2FF";

                    if (
                      !isNobodyHit && (
                        text.toLowerCase().includes("hit") ||
                        text.toLowerCase().includes("guessed") ||
                        text.toLowerCase().includes("guessed the word")
                      )
                    ) {
                      iconNode = (
                        <Check
                          size={14}
                          className="stroke-[3.5] text-[#00E540] shrink-0"
                        />
                      );
                      textColor = "#00E540";
                    } else if (text.toLowerCase().includes("turn") || isNobodyHit) {
                      iconNode = (
                        <Pencil size={12} className="shrink-0 text-[#1AD2FF]" />
                      );
                      textColor = "#1AD2FF";
                    } else if (text.toLowerCase().includes("interval")) {
                      iconNode = (
                        <Clock size={14} className="shrink-0 text-[#1AD2FF]" />
                      );
                      textColor = "#1AD2FF";
                    } else if (
                      text.toLowerCase().includes("timeout") ||
                      text.toLowerCase().includes("time's up") ||
                      text.toLowerCase().includes("answer was")
                    ) {
                      iconNode = (
                        <Pencil size={12} className="shrink-0 text-[#1AD2FF]" />
                      );
                      textColor = "#1AD2FF";
                    }

                    return (
                      <div
                        key={msg.id}
                        className="flex items-center gap-2 font-normal text-sm sm:text-base py-0.5"
                        style={{ color: textColor }}
                      >
                        {iconNode}
                        <span dir="auto">{text}</span>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className="text-sm sm:text-base">
                      <div className="flex items-start gap-1">
                        <span className="font-extrabold text-[#F3F4F6] shrink-0">
                          {msg.sender}:
                        </span>
                        <span
                          className={`${msg.isSelf ? "text-white" : "text-slate-300"} font-normal break-words`}
                          dir="auto"
                          style={{ unicodeBidi: "plaintext" }}
                        >
                          {msg.text}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center gap-1.5 text-primary-brand font-normal text-sm sm:text-base">
                  <Info size={14} />
                  Waiting for players
                </div>
              </div>
            </div>

            {/* Guess Input Area */}
            <div 
              className="px-2 pb-2 pt-1 sm:px-3 sm:pb-3 shrink-0 mt-auto bg-transparent"
              style={{ paddingBottom: 'calc(0.5rem + var(--keyboard-inset, 0px))' }}
            >
              <form onSubmit={handleGuessSubmit} className="relative">
                <div
                  className={`absolute left-4 top-1/2 -translate-y-1/2 transition-opacity duration-200 ${isInputDisabled ? "text-white/15" : "text-white/50"}`}
                >
                  <Pencil size={18} />
                </div>
                <textarea
                  ref={guessInputRef}
                  id="guess-textarea"
                  dir="auto"
                  rows={1}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  name="guess_input_random_name"
                  data-form-type="other"
                  disabled={isInputDisabled && !isInputFocused}
                  value={isInputDisabled ? "" : guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (guessInput.trim() && !isInputDisabled) {
                        handleGuessSubmit(e as any);
                      }
                    }
                  }}
                  onFocus={() => {
                    handleIOSFocusBypass();
                    setIsInputFocused(true);
                    setIsKeyboardOpen(true);
                  }}
                  onBlur={() => {
                    setIsInputFocused(false);
                  }}
                  placeholder={
                    gameState.status === "WAITING"
                      ? "Waiting..."
                      : gameState.status === "ROUND_END"
                        ? gameState.roundEndReason === "skipped"
                          ? "Skipped"
                          : gameState.roundEndReason === "turn_lost"
                            ? "Inactive"
                            : "Interval"
                        : gameState.status === "PODIUM"
                          ? "Game Over"
                          : gameState.status === "CHOOSING"
                            ? "Waiting for the drawing"
                            : amIDrawer
                              ? "You are drawing!"
                              : gameState.correctGuessers?.includes(
                                    socketId || "",
                                  )
                                ? "You've found the answer!"
                                : "Answer here..."
                  }
                  className={`w-full h-12 border-2 border-transparent rounded-[24px] pl-11 pr-14 py-[13px] resize-none overflow-hidden text-white font-bold text-sm sm:text-base outline-none transition-all duration-200 shadow-sm whitespace-nowrap ios-input-focus ${isInputDisabled ? "bg-[#0A162B] text-white/30 cursor-not-allowed placeholder:text-white/20" : "bg-[#09152B] focus:bg-[#0A1A35] focus:border-primary-brand/40 placeholder:text-white/45"}`}
                  style={{ WebkitTouchCallout: 'default', WebkitUserSelect: 'text', userSelect: 'text' }}
                />
                <button
                  type="submit"
                  onPointerDown={(e) => e.preventDefault()}
                  disabled={!guessInput.trim() || isInputDisabled}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-bg-dark-brand disabled:opacity-0 bg-primary-brand rounded-full hover:bg-white transition-all shadow-md"
                >
                  <Send size={16} className="-ml-0.5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Overlay */}
      <OverlayChatRoom
        isChatOpen={isChatOpen}
        viewportOffsetTop={0}
        closeChat={closeChat}
        chatMessages={filteredChatMessages}
        socketId={socketId}
        chatInput={chatInput}
        setChatInput={setChatInput}
        handleChatSubmit={handleChatSubmit}
        iosKeyboardHeightCache={iosKeyboardHeightCache}
      />

      {/* Skip Confirm Modal */}
      <CinematicModal
        isOpen={showSkipConfirm}
        onClose={() => setShowSkipConfirm(false)}
        titleType="report"
        titleText="SKIP"
        buttons={[
          {
            id: "skip-confirm-no-btn",
            text: <span className="text-white font-black">NO</span>,
            onClick: () => setShowSkipConfirm(false),
            variant: "primary",
          },
          {
            id: "skip-confirm-yes-btn",
            text: <span className="text-white font-black">YES</span>,
            onClick: handleSkipTurn,
            variant: "danger",
          },
        ]}
      >
        <h3 id="skip-confirm-title" className="text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
          Do you want to skip your turn?
        </h3>
        <p id="skip-confirm-title-ar" className="text-[#8C8AA7] text-base font-bold mb-6">
          هل تريد تجاوز دورك في الرسم؟
        </p>
      </CinematicModal>

      {/* AFK Popup Modal */}
      <CinematicModal
        isOpen={isAfkPopupOpen}
        titleType="inactive"
        titleText="INACTIVE"
        buttons={[
          {
            id: "afk-return-btn",
            text: "موافق",
            onClick: handleIHaveReturned,
            variant: "neutral",
            icon: <Check strokeWidth={4} size={20} />,
          },
        ]}
      >
        {/* Question */}
        <h3 
          id="afk-title" 
          className="text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-4 px-2"
        >
          هل ما زلت معنا؟
        </h3>

        <p 
          id="afk-description" 
          className="text-[#8C8AA7] text-base font-bold mb-5 leading-normal"
        >
          اضغط موافق للاستمرار في اللعب
        </p>

        {/* Remainder Countdown Badge */}
        <div 
          className="bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-full px-5 py-2 inline-flex items-center gap-2 mb-6 text-sm font-black text-[#EF4444] select-none"
        >
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EF4444] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EF4444]"></span>
          </span>
          سيتم طردك بعد: <span className="font-extrabold font-mono text-base">{afkCountdown}</span> ثانية
        </div>
      </CinematicModal>

      {/* Report Confirmation Modal */}
      <CinematicModal
        isOpen={showReportConfirm}
        onClose={() => setShowReportConfirm(false)}
        titleType="report"
        titleText="REPORT"
        buttons={[
          {
            id: "report-confirm-no-btn",
            text: "NO",
            onClick: () => setShowReportConfirm(false),
            variant: "primary",
          },
          {
            id: "report-confirm-yes-btn",
            text: "YES",
            onClick: () => {
              setShowReportConfirm(false);
              socket?.emit("report_draw");
            },
            variant: "danger",
          },
        ]}
      >
        {/* Red warning triangle with elegant bell vibration/shaking loop animation */}
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 mt-4 relative">
          <motion.div 
            animate={{
              rotate: [-4, 4, -4, 4, -4, 4, 0],
              scale: [1, 1.05, 1, 1.05, 1]
            }}
            transition={{
              delay: 1.5,
              repeat: Infinity,
              duration: 0.6,
              repeatDelay: 1.8,
              ease: "easeInOut"
            }}
          >
            <AlertTriangle className="w-20 h-20 text-[#FB923C] fill-[#FB923C]/5" strokeWidth={2.5} />
          </motion.div>
        </div>

        {/* Content Text exactly as requested */}
        <h3 id="report-confirm-title" className="text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-6">
          Are you sure you wanna report this drawing?
        </h3>
      </CinematicModal>

      {/* Global Overlays for CHOOSING state */}
      {gameState.status === "CHOOSING" && amIDrawer && (
        <div className="fixed inset-0 z-[500] bg-black/70  flex items-center justify-center p-4 touch-none">
          <div className="text-center w-full max-w-md px-6 animate-in fade-in zoom-in-95 duration-300">
            <h2 className="text-[#FBBF24] text-3xl sm:text-4xl font-black mb-2 drop-shadow-md tracking-wide">
              IT'S YOUR TURN!
            </h2>
            <p className="text-white/80 text-lg sm:text-xl mb-12">
              Choose a word to draw
            </p>

            {gameState.wordOptions && gameState.wordOptions.length >= 2 && (
              <div className="space-y-6">
                <div className="flex flex-col items-center">
                  <span
                    className="text-white text-3xl font-bold mb-4 drop-shadow-lg"
                    dir="auto"
                  >
                    {gameState.wordOptions[0]}
                  </span>
                  <button
                    onClick={() => handleWordSelect(gameState.wordOptions[0])}
                    className="w-[85%] max-w-xs bg-accent-brand hover:bg-accent-brand-dark text-bg-dark-brand font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-[0_4px_14px_0_rgba(251,191,36,0.39)] active:scale-95 transition-all text-xl"
                  >
                    <Pencil fill="currentColor" size={24} />
                    DRAW
                  </button>
                </div>

                <div className="flex items-center w-full relative py-2">
                  <div className="flex-1 border-t border-white/20 h-px"></div>
                  <span className="px-4 text-white/50 font-bold bg-transparent text-lg">
                    OR
                  </span>
                  <div className="flex-1 border-t border-white/20 h-px"></div>
                </div>

                <div className="flex flex-col items-center">
                  <span
                    className="text-white text-3xl font-bold mb-4 drop-shadow-lg"
                    dir="auto"
                  >
                    {gameState.wordOptions[1]}
                  </span>
                  <button
                    onClick={() => handleWordSelect(gameState.wordOptions[1])}
                    className="w-[85%] max-w-xs bg-accent-brand hover:bg-accent-brand-dark text-bg-dark-brand font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-[0_4px_14px_0_rgba(251,191,36,0.39)] active:scale-95 transition-all text-xl"
                  >
                    <Pencil fill="currentColor" size={24} />
                    DRAW
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dynamic Non-Intrusive Connection Status removed to allow silent background connection */}
      <AnimatePresence>
        {isInitialLoadingRoom && (
          <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="fixed inset-0 flex flex-col items-center justify-center bg-[#061220] z-[999999] cursor-not-allowed select-none touch-none"
            style={{ pointerEvents: "auto" }}
          >
            <div className="flex flex-col items-center">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-4 border-[#1AD2FF]/20" />
                <div className="absolute inset-0 rounded-full border-4 border-t-[#1AD2FF] animate-spin" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      <CinematicModal
        isOpen={!!selectedProfilePlayer}
        onClose={() => setSelectedProfilePlayer(null)}
        titleType="profile"
        titleText="PROFILE"
      >
        {(() => {
          const playerToRender = selectedProfilePlayer || lastActiveProfilePlayerRef.current;
          if (!playerToRender) return null;

          const isSelf = playerToRender.persistentId === persistentPlayerId || playerToRender.id === socket?.id;
          const targetId = playerToRender.persistentId || playerToRender.id;
          const votesList = votekicks[targetId] || [];
          const alreadyVoted = votesList.includes(persistentPlayerId);
          const isBlocked = blockedUsers.includes(targetId);

          return (
            <>
              {/* Avatar Emoji Frame with Sequential Animation */}
              <div className="w-36 h-36 rounded-full bg-[#ECEBFC] border-2 border-white/80 flex items-center justify-center mx-auto mb-5 shadow-inner relative select-none shadow-[inset_0_2px_4px_rgba(255,255,255,0.7),_0_6px_15px_rgba(46,40,130,0.12)]">
                <span className="text-[85px] leading-none mb-1">{playerToRender.avatar || "👤"}</span>
              </div>

              {/* Player Name Card */}
              <div>
                <h3 id="profile-modal-name" className="text-[25px] font-black text-[#2E2882] leading-snug tracking-tight mb-6">
                  {playerToRender.name}
                </h3>
              </div>

              {isSelf ? (
                <div 
                  className="py-3.5 px-4 bg-white rounded-[20px] border border-[#4F46E5]/10 text-center text-[#4F46E5] font-extrabold text-sm shadow-sm"
                >
                  هذا هو حسابك الشخصي
                </div>
              ) : (
                <div className="flex flex-col gap-3.5 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Block / Unblock Action Button (Mute) */}
                  <div>
                    <button
                      id="profile-modal-block-btn"
                      onClick={() => {
                        handleToggleBlock();
                        setSelectedProfilePlayer(null);
                      }}
                      className={`w-full py-4 px-5 font-black text-base rounded-[22px] transition-all cursor-pointer flex items-center justify-center uppercase tracking-wide gap-3 select-none ${
                        isBlocked 
                          ? "bg-[#38BDF8] text-white hover:bg-[#0EA5E9] border-2 border-white/40 active:scale-95 shadow-md"
                          : "bg-[#ECEBFC] text-[#8C8AA7] hover:bg-[#D9D6F7] border-2 border-white/80 active:scale-95 shadow-sm"
                      }`}
                    >
                      {isBlocked ? <Volume2 className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                      {isBlocked ? "UNMUTE" : "MUTE"}
                    </button>
                  </div>

                  {/* Votekick Action Button */}
                  <div>
                    <button
                      id="profile-modal-kick-btn"
                      onClick={() => {
                        handleToggleVoteKick();
                        setSelectedProfilePlayer(null);
                      }}
                      className={`w-full py-4 px-5 font-black text-base rounded-[22px] transition-all cursor-pointer flex items-center justify-center uppercase tracking-wide gap-3 select-none ${
                        alreadyVoted
                          ? "bg-[#FB923C] text-white hover:bg-[#EA580C] border-2 border-white/40 active:scale-95 shadow-md"
                          : "bg-[#ECEBFC] text-[#8C8AA7] hover:bg-[#D9D6F7] border-2 border-white/80 active:scale-95 shadow-sm"
                      }`}
                    >
                      <UserIcon className="w-5 h-5" />
                      {alreadyVoted ? `REMOVE VOTE (${votesList.length})` : "VOTEKICK"}
                    </button>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </CinematicModal>

      {/* Cooldown Warning Modal */}
      <CinematicModal
        isOpen={showCooldownWarning}
        onClose={() => setShowCooldownWarning(false)}
        titleType="report"
        titleText="SLOW DOWN"
        buttons={[
          {
            id: "cooldown-warning-ok-btn",
            text: "OK",
            onClick: () => setShowCooldownWarning(false),
            variant: "custom",
            className: "w-full py-4 px-5 font-black text-base rounded-[22px] transition-all cursor-pointer flex items-center justify-center uppercase tracking-wide gap-3 select-none bg-[#1AAACC] text-white hover:bg-[#1691ae] border-2 border-white/40 active:scale-95 shadow-md",
          },
        ]}
      >
        {/* Red warning triangle with elegant bell vibration/shaking loop animation */}
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 mt-4 relative">
          <motion.div 
            animate={{
              rotate: [-4, 4, -4, 4, -4, 4, 0],
              scale: [1, 1.05, 1, 1.05, 1]
            }}
            transition={{
              delay: 1.5,
              repeat: Infinity,
              duration: 0.6,
              repeatDelay: 1.8,
              ease: "easeInOut"
            }}
          >
            <AlertTriangle className="w-20 h-20 text-[#EF4444] fill-[#EF4444]/5" strokeWidth={2.5} />
          </motion.div>
        </div>

        {/* Alert Message */}
        <h3 id="cooldown-warning-title" className="text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
          You voted recently. Please waiting to votekick again
        </h3>
        <p id="cooldown-warning-ar" className="text-[#8C8AA7] text-base font-bold mb-6">
          لقد قمت بالتصويت مؤخراً. يرجى الانتظار للمحاولة مرة أخرى.
        </p>
      </CinematicModal>

      {/* Kicked Out / Hard Block Screen */}
      <CinematicModal
        isOpen={isBanned}
        titleType="report"
        titleText="KICKED"
        buttons={[
          {
            id: "kicked-out-exit-btn",
            text: "OK",
            onClick: () => {
              if (typeof window !== "undefined") {
                safeLocalStorage.removeItem("gartic_player_room");
              }
              onLeave?.();
            },
            variant: "danger",
          },
        ]}
      >
        {/* Red warning triangle with elegant bell vibration/shaking loop animation */}
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 mt-4 relative">
          <motion.div 
            animate={{
              rotate: [-4, 4, -4, 4, -4, 4, 0],
              scale: [1, 1.05, 1, 1.05, 1]
            }}
            transition={{
              delay: 1.5,
              repeat: Infinity,
              duration: 0.6,
              repeatDelay: 1.8,
              ease: "easeInOut"
            }}
          >
            <AlertTriangle className="w-20 h-20 text-[#EF4444] fill-[#EF4444]/5" strokeWidth={2.5} />
          </motion.div>
        </div>

        {/* Content Text in standard theme colors */}
        <h3 id="kicked-out-desc" className="text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
          You were kicked out by voting
        </h3>
        <p id="kicked-out-desc-ar" className="text-[#8C8AA7] text-base font-bold mb-6">
          تم طردك من هذه الغرفة بناءً على تصويت اللاعبين الآخرين.
        </p>
      </CinematicModal>

      {/* Nickname Taken Warning Modal */}
      <CinematicModal
        isOpen={isNicknameTaken}
        overlayClassName="bg-slate-950/100"
        onClose={() => {
          setIsNicknameTaken(false);
          if (typeof window !== "undefined") {
            safeLocalStorage.removeItem("gartic_player_room");
          }
          onLeave?.();
        }}
        titleType="report"
        titleText="ERROR"
        buttons={[
          {
            id: "nickname-taken-exit-btn",
            text: "OK",
            onClick: () => {
              setIsNicknameTaken(false);
              if (typeof window !== "undefined") {
                safeLocalStorage.removeItem("gartic_player_room");
              }
              onLeave?.();
            },
            variant: "danger",
          },
        ]}
      >
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 mt-4 relative">
          <motion.div 
            animate={{
              rotate: [-4, 4, -4, 4, -4, 4, 0],
              scale: [1, 1.05, 1, 1.05, 1]
            }}
            transition={{
              delay: 1.5,
              repeat: Infinity,
              duration: 0.6,
              repeatDelay: 1.8,
              ease: "easeInOut"
            }}
          >
            <AlertTriangle className="w-20 h-20 text-[#FB923C] fill-[#FB923C]/5" strokeWidth={2.5} />
          </motion.div>
        </div>

        <h3 id="nickname-taken-desc" className="text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
          Name already in use
        </h3>
        <p id="nickname-taken-desc-ar" className="text-[#8C8AA7] text-base font-bold mb-6">
          يوجد شخص آخر في الغرفة بنفس الاسم، غيره لتتمكن من الدخول
        </p>
      </CinematicModal>

      {/* Room Full Warning Modal */}
      <CinematicModal
        isOpen={isRoomFull}
        onClose={() => {
          setIsRoomFull(false);
          if (typeof window !== "undefined") {
            safeLocalStorage.removeItem("gartic_player_room");
          }
          onLeave?.();
        }}
        titleType="report"
        titleText="ERROR"
        buttons={[
          {
            id: "room-full-exit-btn",
            text: "OK",
            onClick: () => {
              setIsRoomFull(false);
              if (typeof window !== "undefined") {
                safeLocalStorage.removeItem("gartic_player_room");
              }
              onLeave?.();
            },
            variant: "danger",
          },
        ]}
      >
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 mt-4 relative">
          <motion.div 
            animate={{
              rotate: [-4, 4, -4, 4, -4, 4, 0],
              scale: [1, 1.05, 1, 1.05, 1]
            }}
            transition={{
              delay: 1.5,
              repeat: Infinity,
              duration: 0.6,
              repeatDelay: 1.8,
              ease: "easeInOut"
            }}
          >
            <AlertTriangle className="w-20 h-20 text-[#FB923C] fill-[#FB923C]/5" strokeWidth={2.5} />
          </motion.div>
        </div>

        <h3 id="room-full-desc" className="text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
          This room is full
        </h3>
        <p id="room-full-desc-ar" className="text-[#8C8AA7] text-base font-bold mb-6">
          هذه الغرفة ممتلئة بالكامل
        </p>
      </CinematicModal>
    </>
  );
}

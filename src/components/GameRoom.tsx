import React, { useState, useEffect, useCallback, useMemo } from "react";
import { IsolatedDrawingLayer } from "./experimental/IsolatedDrawingLayer";
import {
  Send,
  MessageSquare,
  AlertTriangle,
  Volume2,
  VolumeX,
  Info,
  X,
  User as UserIcon,
  UserMinus,
  Pencil,
  Copy,
  Check,
  WifiOff,
  Eye,
  EyeOff,
  LogOut,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { useSocket } from "./SocketProvider";
import { motion, AnimatePresence } from "motion/react";
import { FreeDrawPlayersList } from "./game/FreeDrawPlayersList";
import { MiniBoardOverlay } from "./game/MiniBoardOverlay";
import { OverlayChatRoom, ChatMessage } from "./game/OverlayChatRoom";
import CinematicModal from "./game/CinematicModal";
import ExitSprite from "./game/ExitSprite";
import AfkWarningSprite from "./game/AfkWarningSprite";
import { safeLocalStorage } from "../utils/storage";
import { getPlayerIdentity } from "../utils/playerAuth";
import { soundManager } from "../utils/soundManager";
import { useRoomEventGate } from "../hooks/useRoomEventGate";
import { getRoomConfig } from "../types/game";
import { isMobileDebugActive } from "../utils/erudaManager";
import { FreeDrawMobileDebug } from "./game/FreeDrawMobileDebug";

// 🧪 DIAGNOSTIC TEST: FREE DRAW ISOLATION TEST
// Isolates Free Draw drawing completely from non-essential Room Shell DOM, background panels, modals, and unneeded re-renders.
// Set to false to cleanly revert to previous behavior.
export const FREE_DRAW_ISOLATION_TEST = true;

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
  avatar: string;
  wins?: number;
  isOffline?: boolean;
  persistentId?: string;
  isNew?: boolean;
};



// 🛡️ Isolated Micro-Badge Component (Re-renders ONLY itself when unread count changes, 0 re-renders for GameRoom/Canvas)
export interface UnreadBadgeHandle {
  setCount: (count: number) => void;
}

export const UnreadBadge = React.memo(
  React.forwardRef<UnreadBadgeHandle, { initialCount?: number; className?: string }>(
    ({ initialCount = 0, className = "px-1.5 py-0.5" }, ref) => {
      const [count, setCount] = React.useState(initialCount);

      React.useImperativeHandle(
        ref,
        () => ({
          setCount: (newCount: number) => {
            setCount(newCount);
          },
        }),
        [],
      );

      if (count <= 0) return null;

      return (
        <div
          className={`absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] sm:text-[11px] font-bold rounded-full border-2 border-slate-200 pointer-events-none select-none z-10 ${className}`}
        >
          {count > 9 ? "+9" : count}
        </div>
      );
    },
  ),
);


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
  const mainContainerRef = React.useRef<HTMLDivElement>(null);
  const iosKeyboardHeightCache = React.useRef<number>(350);
  const [maxViewportHeight, setMaxViewportHeight] = useState<number>(
    typeof window !== "undefined" ? window.innerHeight : 800,
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const hasEmittedJoin = React.useRef(false);
  const [isRoomJoined, setIsRoomJoined] = useState(false);
  const [hasJoinedRoomOnce, setHasJoinedRoomOnce] = useState(false);
  const hasJoinedRoomOnceRef = React.useRef(false);
  useEffect(() => {
    hasJoinedRoomOnceRef.current = hasJoinedRoomOnce;
  }, [hasJoinedRoomOnce]);

  const [isProlongedDisconnect, setIsProlongedDisconnect] = useState(false);
  const [isJoinTimedOut, setIsJoinTimedOut] = useState(false);

  const joinAttemptRef = React.useRef(0);
  const joinTimeoutRef = React.useRef<any>(null);

  const [isAfkPopupOpen, setIsAfkPopupOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(soundManager.getMuted());
  const [afkCountdown, setAfkCountdown] = useState(90);
  const lastActiveRef = React.useRef(Date.now());
  const afkCountdownIntervalRef = React.useRef<any>(null);

  const handleIHaveReturned = () => {
    setIsAfkPopupOpen(false);
    lastActiveRef.current = Date.now();
    socket?.emit("ping_activity");
  };

  const toggleMute = () => {
    const newMuted = soundManager.toggleMuted();
    setIsMuted(newMuted);
  };

  const { playerId: persistentPlayerId, reconnectSecret } = React.useMemo(() => {
    return getPlayerIdentity();
  }, []);

  const [gameState, setGameState] = useState<any>({
    status: "WAITING",
    currentDrawerId: null,
    currentWord: null,
    timeLeft: 0,
  });

  const gameStateRef = React.useRef(gameState);
  React.useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);



  // --- Free Draw Room Engine ---
  const roomConfig = getRoomConfig(room);
  const [isFreeDrawRoom, setIsFreeDrawRoom] = useState(Boolean(roomConfig?.isFreeDraw));
  const [activeDrawers, setActiveDrawers] = useState<string[]>([]);
  const [hasEnteredFreeDraw, setHasEnteredFreeDraw] = useState(false);
  const [hasDrawHistory, setHasDrawHistory] = useState(false);
  const isFreeDraw = Boolean(roomConfig?.isFreeDraw || gameState?.isFreeDraw || isFreeDrawRoom);

  const handleStartFreeDraw = () => {
    if (!socket) return;
    setHasEnteredFreeDraw(true);
    socket.emit("start_free_draw");
    const myId = persistentPlayerId || socketId;
    if (myId) {
      setActiveDrawers((prev) => (prev.includes(myId) ? prev : [...prev, myId]));
    }
  };

  const handleStopFreeDraw = () => {
    if (!socket) return;
    socket.emit("stop_free_draw");
    const myId = persistentPlayerId || socketId;
    setActiveDrawers((prev) => prev.filter((id) => id !== myId && id !== socketId && id !== persistentPlayerId));
  };

  const closeChat = () => {
    setIsChatOpen(false);
    isChatOpenRef.current = false;
    const textarea = document.getElementById("chat-textarea");
    if (textarea) {
      textarea.blur();
    }
  };
  const [chatInput, setChatInput] = useState("");

  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [currentPlayers, setCurrentPlayers] = useState<PlayerSlot[]>([]);

  // 🛡️ High-Performance Synchronous Mirrors to buffer background updates during active drawing
  const chatMessagesRef = React.useRef<Message[]>([]);
  const currentPlayersRef = React.useRef<PlayerSlot[]>([]);
  const unreadCountRef = React.useRef<number>(0);
  const isChatOpenRef = React.useRef<boolean>(false);
  const unreadBadgeTopRef = React.useRef<UnreadBadgeHandle>(null);
  const unreadBadgeSideRef = React.useRef<UnreadBadgeHandle>(null);

  const updateUnreadBadges = React.useCallback((count: number) => {
    unreadBadgeTopRef.current?.setCount(count);
    unreadBadgeSideRef.current?.setCount(count);
  }, []);

  const openChat = () => {
    if (chatMessagesRef.current.length > 0 && chatMessagesRef.current !== chatMessages) {
      setChatMessages(chatMessagesRef.current);
    }
    setIsChatOpen(true);
    isChatOpenRef.current = true;
    unreadCountRef.current = 0;
    updateUnreadBadges(0);
    setUnreadCount(0);
  };

  React.useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);


  React.useEffect(() => {
    currentPlayersRef.current = currentPlayers;
  }, [currentPlayers]);

  React.useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

  React.useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

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
  const [isAuthStoreFull, setIsAuthStoreFull] = useState(false);
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
    if (isFreeDraw) {
      return Boolean(
        (persistentPlayerId && activeDrawers.includes(persistentPlayerId)) ||
        (socketId && activeDrawers.includes(socketId))
      );
    }
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
  }, [isFreeDraw, activeDrawers, gameState.currentDrawerId, currentPlayers, persistentPlayerId, socketId]);

  // 🔊 Sound Hooks
  const eventGate = useRoomEventGate();
  const canPlaySoundRef = React.useRef<boolean>(false);
  const prevPlayersLengthRef = React.useRef<number>(0);

  useEffect(() => {
    // Prevent sounds from playing immediately after joining (to avoid notification spam)
    const timer = setTimeout(() => {
      canPlaySoundRef.current = true;
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const isDrawingMode = amIDrawer;
  const isDrawingModeRef = React.useRef<boolean>(isDrawingMode);

  // 🛡️ Free Draw Isolation: When drawing in Free Draw, isolate room shell to prevent re-render thrashing & DOM overdraw
  const isFreeDrawIsolated = Boolean(FREE_DRAW_ISOLATION_TEST && isFreeDraw && isDrawingMode);
  const isFreeDrawIsolatedRef = React.useRef<boolean>(isFreeDrawIsolated);

  React.useEffect(() => {
    isDrawingModeRef.current = isDrawingMode;
    isFreeDrawIsolatedRef.current = isFreeDrawIsolated;
  }, [isDrawingMode, isFreeDrawIsolated]);

  // 🛡️ When active drawing mode finishes, flush any buffered background data cleanly to React state
  React.useEffect(() => {
    if (!isDrawingMode) {
      if (chatMessagesRef.current.length > 0 && chatMessagesRef.current !== chatMessages) {
        setChatMessages(chatMessagesRef.current);
      }
      if (unreadCountRef.current > 0 && unreadCountRef.current !== unreadCount) {
        setUnreadCount(unreadCountRef.current);
      }
      updateUnreadBadges(unreadCountRef.current);
      if (currentPlayersRef.current.length > 0 && currentPlayersRef.current !== currentPlayers) {
        setCurrentPlayers(currentPlayersRef.current);
      }
    }
  }, [isDrawingMode, updateUnreadBadges]);



  // 🛡️ Stabilized Drawing Layer Action Callbacks (Ensures areDrawingPropsEqual stays rock-solid)
  const handleStopFreeDrawAction = useCallback(() => {
    handleStopFreeDraw();
  }, [socket, persistentPlayerId, socketId]);

  const handleSyncStateChangeAction = useCallback((syncing: boolean) => {
    setIsCanvasSyncing(syncing);
  }, []);

  const handleHistoryLengthChangeAction = useCallback((hasStrokes: boolean) => {
    setHasDrawHistory(hasStrokes);
  }, []);

  const handleAcknowledgeNewPlayer = useCallback((playerId: string) => {
    eventGate.acknowledgeNewPlayer(playerId);
    if (currentPlayersRef.current) {
      currentPlayersRef.current = currentPlayersRef.current.map((p) =>
        p.id === playerId ? { ...p, isNew: false } : p
      );
    }
    setCurrentPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, isNew: false } : p))
    );
  }, [eventGate]);

  // --- Prolonged Disconnect Timer (20 seconds) ---
  useEffect(() => {
    const isDisconnectedOrRejoining = hasJoinedRoomOnce && (!isConnected || !isRoomJoined);

    if (!isDisconnectedOrRejoining) {
      setIsProlongedDisconnect(false);
      return;
    }

    const timer = setTimeout(() => {
      setIsProlongedDisconnect(true);
    }, 20000);

    return () => {
      clearTimeout(timer);
    };
  }, [hasJoinedRoomOnce, isConnected, isRoomJoined]);

  // --- Block 1: Handle Room Join & Rejoin based on (Re)connection status ---
  useEffect(() => {
    if (!socket) return;

    const handleJoin = () => {
      const currentAttempt = ++joinAttemptRef.current;
      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
      }

      // Schedule 10-second timeout for this specific attempt
      joinTimeoutRef.current = setTimeout(() => {
        if (joinAttemptRef.current !== currentAttempt) return;
        console.warn(`[GameRoom] Join room attempt ${currentAttempt} timed out after 10s.`);
        setIsInitialLoadingRoom(false);
        // Timeout does NOT mean room is full. If initial join failed, show timeout error
        if (!hasJoinedRoomOnceRef.current) {
          setIsJoinTimedOut(true);
          if (typeof window !== "undefined") {
            safeLocalStorage.removeItem("gartic_player_room");
            safeLocalStorage.setItem("gartic_connection_lost", Date.now().toString());
          }
        }
      }, 10000);

      const reconnectOnly = hasEmittedJoin.current || !justJoined;
      console.log(
        `[GameRoom] Sending join_room (attempt ${currentAttempt}):`,
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
          reconnectSecret,
          reconnectOnly: reconnectOnly,
        },
        (res: any) => {
          // Stale response from a previous attempt: discard
          if (joinAttemptRef.current !== currentAttempt) return;

          if (joinTimeoutRef.current) {
            clearTimeout(joinTimeoutRef.current);
            joinTimeoutRef.current = null;
          }

          if (res && res.success) {
            console.log(`[GameRoom] Successfully joined/reconnected room on attempt ${currentAttempt}.`);
            hasEmittedJoin.current = true;
            setHasJoinedRoomOnce(true);
            setIsRoomJoined(true);
            setIsInitialLoadingRoom(false);
            setIsJoinTimedOut(false);
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
          } else if (res && res.error === "unauthorized") {
            console.warn("[GameRoom] Reconnect rejected: unauthorized session credential mismatch.");
            if (typeof window !== "undefined") {
              safeLocalStorage.removeItem("gartic_player_room");
              safeLocalStorage.setItem("gartic_session_expired_reason", "unauthorized");
            }
            onLeave?.();
          } else if (res && (res.error === "auth_store_full" || res.reason === "auth_store_full")) {
            console.warn("[GameRoom] Rejoin blocked: Server session store is full.");
            setIsAuthStoreFull(true);
            setIsInitialLoadingRoom(false);
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
      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
      }
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
      isFreeDraw?: boolean;
      activeDrawers?: string[];
      gameState: any;
      hasDrawHistory?: boolean;
    }) => {
      setIsRoomJoined(true);
      if (typeof state.isFreeDraw !== "undefined") {
        setIsFreeDrawRoom(Boolean(state.isFreeDraw));
      }
      if (state.activeDrawers) {
        setActiveDrawers(state.activeDrawers);
      }
      if (typeof state.hasDrawHistory !== "undefined") {
        setHasDrawHistory(Boolean(state.hasDrawHistory));
      } else if (state.gameState && typeof state.gameState.hasDrawHistory !== "undefined") {
        setHasDrawHistory(Boolean(state.gameState.hasDrawHistory));
      }
      if (state.votekicks) {
        setVotekicks(state.votekicks);
      }
      const newPlayersMap = new Map();
      if (!eventGate.isLive()) {
        eventGate.hydrateGate(state.players);
        prevPlayersLengthRef.current = state.players.length;
      } else {
        // Remove players who were in currentPlayersRef.current but are no longer in state.players
        const currentActiveIds = new Set((state.players || []).map((p: any) => p.id));
        currentPlayersRef.current.forEach((prevP) => {
          if (prevP && prevP.id && !prevP.isEmpty && !currentActiveIds.has(prevP.id)) {
            eventGate.removePlayer(prevP.id);
          }
        });

        // 🔊 Player Join / Leave sounds: trigger immediately for all players (including the active drawer)
        if (canPlaySoundRef.current && prevPlayersLengthRef.current > 0) {
          if (state.players.length > prevPlayersLengthRef.current) {
            soundManager.play("playerJoin");
          } else if (state.players.length < prevPlayersLengthRef.current) {
            soundManager.play("playerLeave");
          }
        }
        prevPlayersLengthRef.current = state.players.length;

        // Calculate isNew for each player before the state updater
        state.players.forEach((p) => {
          newPlayersMap.set(p.id, eventGate.isNewPlayer(p.id));
        });
      }

      const prevPlayers = currentPlayersRef.current;
      const mapped = state.players.map((p) => ({
        id: p.id,
        name: p.name,
        points: p.score || 0,
        wins: p.wins || 0,
        isCurrent: false,
        isOffline: p.isOffline || false,
        avatar: p.avatar,
        isEmpty: false,
        persistentId: p.persistentId,
        isNew: newPlayersMap.get(p.id) || false,
      }));

      mapped.sort((a, b) => {
        // If points are different, sort by points descending
        if (b.points !== a.points) {
          return b.points - a.points;
        }

        // When points are equal, sort deterministically by server join order (index in state.players)
        const indexA_server = state.players.findIndex((p) => p.id === a.id);
        const indexB_server = state.players.findIndex((p) => p.id === b.id);
        if (indexA_server !== -1 && indexB_server !== -1 && indexA_server !== indexB_server) {
          return indexA_server - indexB_server;
        }

        // Ultimate deterministic fallback: player id
        return a.id.localeCompare(b.id);
      });

      currentPlayersRef.current = mapped;

      // 🛡️ Only update currentPlayers state when NOT drawing or on initial hydration to avoid heavy sidebar re-renders
      if (!isDrawingModeRef.current || prevPlayers.length === 0) {
        setCurrentPlayers(mapped);
      }

      if (state.gameState) {
        setGameState((prev: any) => {
          return state.gameState;
        });
      }
    };


    const onReceiveMessage = (msg: any) => {
      // 🔊 Play notification sound for system messages (chatMessage sound is completely removed)
      if (eventGate.isLive() && canPlaySoundRef.current) {
        if (msg.type === "system") {
          soundManager.play('notification');
        }
      }

      if (chatMessagesRef.current.some((m) => m.id === msg.id)) {
        return;
      }

      const updated = [
        ...chatMessagesRef.current,
        {
          ...msg,
          isSelf: msg.senderId === socket.id,
        },
      ].slice(-40);

      chatMessagesRef.current = updated;

      if (!isChatOpenRef.current) {
        unreadCountRef.current += 1;
        // Update isolated badge imperatively without triggering GameRoom re-render
        updateUnreadBadges(unreadCountRef.current);
        // For Drawer in Free Draw when isolated: keep unreadCount in ref (no rerender) until chat opens or turn ends
        if (!isFreeDrawIsolatedRef.current) {
          setUnreadCount(unreadCountRef.current);
        }
      }

      // If not in drawing mode, or in Free Draw (when not isolated), or if chat overlay is currently open, update React state immediately
      if (!isDrawingModeRef.current || (isFreeDraw && !isFreeDrawIsolatedRef.current) || isChatOpenRef.current) {
        setChatMessages(updated);
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

    const onDrawBinary = () => {
      setHasDrawHistory(true);
    };
    const onDrawHistorySync = (history: any[]) => {
      setHasDrawHistory(Boolean(history && history.length > 0));
    };

    socket.on("room_state_update", onRoomStateUpdate);
    socket.on("receive_message", onReceiveMessage);
    socket.on("session_expired", onSessionExpired);
    socket.on("afk_warning", onAfkWarning);
    socket.on("banned_from_room", onBannedFromRoom);
    socket.on("draw_binary", onDrawBinary);
    socket.on("draw_history_sync", onDrawHistorySync);

    const onDisconnect = () => {
      setIsRoomJoined(false);
    };

    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("disconnect", onDisconnect);
      socket.off("room_state_update", onRoomStateUpdate);
      socket.off("receive_message", onReceiveMessage);
      socket.off("session_expired", onSessionExpired);
      socket.off("afk_warning", onAfkWarning);
      socket.off("banned_from_room", onBannedFromRoom);
      socket.off("draw_binary", onDrawBinary);
      socket.off("draw_history_sync", onDrawHistorySync);
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

  const roomCapacity = Math.max(currentPlayers.length, getRoomConfig(room).maxPlayers);
  const slots: PlayerSlot[] = Array.from({ length: roomCapacity }).map((_, index) => {
    if (index < currentPlayers.length) {
      const p = currentPlayers[index];
      return {
        ...p,
        isBlocked: (p.persistentId && blockedUsers.includes(p.persistentId)) || blockedUsers.includes(p.id) || false,
      };
    }
    return {
      id: `empty-${index}`,
      name: "Empty",
      points: null,
      isCurrent: false,
      isEmpty: true,
      avatar: "",
    };
  });

  const morphMode = false;


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
    selectedProfilePlayer,
    showExitConfirm,
    showCooldownWarning
  });

  useEffect(() => {
    activeStatesRef.current = {
      isChatOpen,
      selectedProfilePlayer,
      showExitConfirm,
      showCooldownWarning
    };
  }, [
    isChatOpen,
    selectedProfilePlayer,
    showExitConfirm,
    showCooldownWarning
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Create a very deep buffer (15 states) to completely absorb rapid back button presses.
    // Even if the user taps back 5 times in a row very fast, they will only consume our dummy states,
    // and our code will replenish them as the popstate events fire.
    for (let i = 0; i < 15; i++) {
      window.history.pushState({ gartic_trap: i }, "");
    }

    const handlePopState = (e: PopStateEvent) => {
      // Replenish the state immediately to maintain the deep buffer
      window.history.pushState({ gartic_trap: 'replenish' }, "");

      const current = activeStatesRef.current;

      if (current.isChatOpen) {
        setIsChatOpen(false);
        const textarea = document.getElementById("chat-textarea");
        if (textarea) textarea.blur();
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

  // --- Browser Unload Protection (beforeunload) ---
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers require setting returnValue or returning a string to show the prompt
      e.returnValue = "Are you sure you want to leave the game?";
      return "Are you sure you want to leave the game?";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
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
              variant: "danger",
            },
          ]}
        >
          {/* Animated Exit Character Sprite */}
          <div className="w-full flex items-center justify-center mb-3 sm:mb-5 mt-1">
            <ExitSprite className="w-26 sm:w-36 h-auto" />
          </div>

          {/* Question */}
          <h3 id="exit-confirm-title" className="text-[18px] sm:text-[22px] font-black text-[#2E2882] leading-snug tracking-tight mb-3 sm:mb-4 text-center">
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
            {/* Floating button for Free Draw: shown when player returned to room, or new player entering active room */}
            {isFreeDraw && !isDrawingMode && (hasEnteredFreeDraw || activeDrawers.length > 0 || hasDrawHistory) && (
              <button
                type="button"
                onClick={handleStartFreeDraw}
                className="absolute top-2 left-2 z-[60] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer pointer-events-auto border border-white/40"
              >
                <Pencil size={14} className="stroke-[2.5]" />
                <span>{hasEnteredFreeDraw ? "العودة للرسم" : (activeDrawers.length > 0 || hasDrawHistory ? "انضم للرسم" : "ابدأ الرسم")}</span>
              </button>
            )}

            {/* Unified Adaptive Drawing Canvas Container */}
            <div
              className={
                isDrawingMode
                  ? "fixed inset-0 z-[100] bg-gray-300 flex flex-col items-center justify-center overflow-hidden"
                  : "w-full h-full relative flex flex-col"
              }
            >
              
              {/* Free Draw Top Bar: Quick Chat button */}
              {isDrawingMode && isFreeDraw && (
                <div 
                  className="absolute right-0 flex items-center px-3 sm:px-4 z-[150] pointer-events-none"
                  style={{ top: 'clamp(8px, 2vw, 16px)' }}
                  dir="ltr"
                >
                  {/* Right: Chat button (shifted left with mr-12 sm:mr-16 so it never collides with exit X button) */}
                  <div className="flex items-center pointer-events-auto mr-12 sm:mr-16">
                    <button
                      type="button"
                      onClick={openChat}
                      title="الدردشة"
                      className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-yellow-400 hover:bg-yellow-500 active:scale-95 flex items-center justify-center text-bg-dark-brand font-bold transition-all border border-black/10 relative cursor-pointer"
                    >
                      <MessageSquare size={18} />
                      <UnreadBadge ref={unreadBadgeTopRef} initialCount={unreadCountRef.current} className="px-1.5 py-0.5" />
                    </button>
                  </div>
                </div>
              )}

              <IsolatedDrawingLayer
                readOnly={!isDrawingMode}
                isDrawingMode={isDrawingMode}
                isFreeDraw={isFreeDraw}
                amIDrawer={amIDrawer}
                currentDrawerId={gameState.currentDrawerId}
                status={gameState.status}
                canSkipTurn={false}
                canRequestHint={false}
                hintsRemaining={0}
                onSkipTurnRequest={undefined}
                onRequestHintAction={undefined}
                onExitFreeDrawAction={handleStopFreeDrawAction}
                onSyncStateChangeAction={handleSyncStateChangeAction}
                onHistoryLengthChangeAction={handleHistoryLengthChangeAction}
                drawerTimerSlotRef={undefined}
                isRoomJoined={isRoomJoined}
              />

            </div>

            {!isFreeDrawIsolated && (
              <MiniBoardOverlay 
                gameState={gameState} 
                amIDrawer={amIDrawer} 
                currentPlayers={currentPlayers}
                getCurrentDrawerName={getCurrentDrawerName}
                isFreeDraw={isFreeDraw}
                onStartFreeDraw={handleStartFreeDraw}
                activeDrawersCount={activeDrawers.length}
                hasEnteredFreeDraw={hasEnteredFreeDraw}
                hasDrawHistory={hasDrawHistory}
              />
            )}
          </div>

        </div>

        {/* Left: Players Sidebar */}
        {!isFreeDrawIsolated && (
          <FreeDrawPlayersList
            slots={slots}
            morphMode={morphMode}
            onPlayerClick={setSelectedProfilePlayer}
            onAcknowledgeNewPlayer={handleAcknowledgeNewPlayer}
          />
        )}

        {/* Right: Actions Bar */}
        {!isFreeDrawIsolated && (
          <div
            className="flex flex-col relative bg-bg-panel-brand pb-2 pr-2 pt-0 pl-1 sm:pb-3 sm:pr-3 sm:pt-0 sm:pl-1.5 col-start-2 col-end-3 row-start-2 row-end-3"
          >
          <div className="flex-1 flex flex-col bg-bg-dark-brand rounded-xl sm:rounded-2xl shadow-inner border border-white/5 overflow-hidden relative">
            {/* Actions Bar */}
            <div className="shrink-0 bg-[#0A1A38] block">
              <div className="overflow-hidden">
                <div className="flex gap-2 sm:gap-4 p-2 sm:p-3 justify-around">
                  <button 
                    onClick={toggleMute}
                    className={`w-8 h-8 sm:w-12 sm:h-12 rounded-xl active:scale-95 flex items-center justify-center text-white transition-all border border-white/10 relative overflow-hidden ${
                      isMuted ? "bg-slate-400 hover:bg-slate-500" : "bg-yellow-400 hover:bg-yellow-500"
                    }`}
                  >
                    {isMuted ? (
                      <VolumeX size={16} className="text-white z-10" />
                    ) : (
                      <Volume2 size={16} className="text-white z-10" />
                    )}
                    {isMuted && (
                      <div className="absolute inset-0 m-auto w-[2px] h-[70%] bg-white/70 -rotate-45 z-0 animate-in fade-in zoom-in duration-200"></div>
                    )}
                  </button>
                  <button className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl bg-yellow-400 hover:bg-yellow-500 active:scale-95 flex items-center justify-center text-white transition-all border border-white/10">
                    <Info size={16} />
                  </button>
                  <button
                    onClick={openChat}
                    className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl bg-yellow-400 hover:bg-yellow-500 active:scale-95 flex items-center justify-center text-bg-dark-brand font-bold transition-all border border-white/10 relative"
                  >
                    <MessageSquare size={16} />
                    <UnreadBadge ref={unreadBadgeSideRef} initialCount={unreadCountRef.current} className="px-1 py-0.5" />
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
      </div>

      {/* Chat Overlay */}
      {(!isFreeDrawIsolated || isChatOpen) && (
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
      )}


      {/* AFK Popup Modal */}
      {(!isFreeDrawIsolated || isAfkPopupOpen) && (
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
              icon: <Check strokeWidth={4} size={18} />,
            },
          ]}
        >
          {/* Animated Warning Sprite */}
          <div className="flex justify-center mb-3 sm:mb-4 mt-1">
            <AfkWarningSprite className="w-24 sm:w-34 aspect-[256/326]" />
          </div>

          {/* Question & Subtext in the same line (RTL reading order) */}
          <h3 
            id="afk-title" 
            dir="rtl"
            className="text-sm sm:text-base font-black text-[#2E2882] leading-snug mb-3 sm:mb-4 px-1 text-center"
          >
            <span>هل ما زلت هنا؟ </span>
            <span id="afk-description">اضغط موافق للاستمرار في اللعب</span>
          </h3>

          {/* Compact Remainder Countdown Badge */}
          <div 
            dir="rtl"
            className="bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-full px-4 py-1.5 inline-flex items-center gap-2 mb-3 sm:mb-4 text-xs sm:text-sm font-black text-[#EF4444] select-none"
          >
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EF4444] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EF4444]"></span>
            </span>
            <span>
              سيتم فصل الاتصال بعد: <span className="font-extrabold font-mono text-xs sm:text-sm">{afkCountdown}</span> ثانية
            </span>
          </div>
        </CinematicModal>
      )}



      {/* Dynamic Non-Intrusive Connection Status removed to allow silent background connection */}
      <AnimatePresence>
        {isInitialLoadingRoom && (
          <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className={`fixed inset-0 flex flex-col items-center justify-center ${isMobileDebugActive() ? "bg-[#061220]/50" : "bg-[#061220]"} z-[5000] cursor-not-allowed select-none touch-none`}
            style={{ pointerEvents: isInitialLoadingRoom ? "auto" : "none" }}
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

      {/* 🌐 Independent Connection Status Overlay (CONNECTION-STATUS-UX-1) */}
      <AnimatePresence>
        {hasJoinedRoomOnce && (!isConnected || !isRoomJoined) && (
          <motion.div
            key="connection-status-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-0 z-[9000] bg-[#061220]/60 flex flex-col items-center justify-center p-4 select-none touch-none"
            dir="rtl"
          >
            <div className="bg-[#121B2A] border border-white/10 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center">
              {/* Animated Icon / Spinner */}
              <div className="relative w-16 h-16 mb-5 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-[#1AD2FF]/20" />
                <div className="absolute inset-0 rounded-full border-4 border-t-[#1AD2FF] animate-spin" />
                <WifiOff className="w-7 h-7 text-[#FB923C] animate-pulse" />
              </div>

              {/* Status Title */}
              <h3 className="text-xl sm:text-2xl font-black text-white mb-2 tracking-tight">
                {!isConnected
                  ? "انقطع الاتصال بالخادم"
                  : "عاد الاتصال"}
              </h3>

              {/* Status Subtitle */}
              <p className="text-sm sm:text-base text-slate-300 font-medium mb-6 leading-relaxed">
                {isProlongedDisconnect
                  ? "تعذر استعادة الاتصال حتى الآن. يرجى التحقق من اتصالك بالإنترنت."
                  : !isConnected
                    ? "نحاول إعادة الاتصال تلقائيًا..."
                    : "جارٍ إعادة الانضمام إلى الغرفة..."}
              </p>

              {/* Prolonged Disconnect Action: Return to Lobby */}
              {isProlongedDisconnect && (
                <button
                  id="disconnect-return-lobby-btn"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      safeLocalStorage.removeItem("gartic_player_room");
                    }
                    onLeave?.();
                  }}
                  className="w-full py-3.5 px-5 font-black text-sm sm:text-base rounded-2xl transition-all cursor-pointer flex items-center justify-center uppercase tracking-wide gap-2 bg-[#FB923C] text-white hover:bg-[#EA580C] border-2 border-white/30 active:scale-95 shadow-lg"
                >
                  <LogOut className="w-5 h-5 ml-1" />
                  <span>العودة إلى الردهة</span>
                </button>
              )}
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
              {/* Avatar Emoji Frame with Comfortable Dimensions */}
              <div className="w-24 h-24 sm:w-30 sm:h-30 rounded-full bg-[#ECEBFC] border-2 border-white/80 flex items-center justify-center mx-auto mb-3 sm:mb-4 relative select-none shrink-0">
                <span className="text-[56px] sm:text-[70px] leading-none mb-0.5">{playerToRender.avatar || "👤"}</span>
              </div>

              {/* Player Name Card */}
              <div className="w-full">
                <h3 id="profile-modal-name" className="text-[18px] sm:text-[22px] font-black text-[#2E2882] leading-snug tracking-tight mb-3 sm:mb-4 text-center truncate px-2">
                  {playerToRender.name}
                </h3>
              </div>

              {isSelf ? (
                <div 
                  className="py-3 px-4 bg-white rounded-[18px] border border-[#4F46E5]/10 text-center text-[#4F46E5] font-extrabold text-sm"
                >
                  هذا هو حسابك الشخصي
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 sm:gap-3 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Block / Unblock Action Button (Mute) */}
                  <div>
                    <button
                      id="profile-modal-block-btn"
                      onClick={() => {
                        handleToggleBlock();
                        setSelectedProfilePlayer(null);
                      }}
                      className={`w-full py-3 sm:py-3.5 px-4 font-black text-sm sm:text-base rounded-[18px] sm:rounded-[20px] transition-all cursor-pointer flex items-center justify-center uppercase tracking-wide gap-2.5 select-none ${
                        isBlocked 
                          ? "bg-[#38BDF8] text-white hover:bg-[#0EA5E9] border-2 border-white/40 active:scale-95"
                          : "bg-[#FB923C] text-white hover:bg-[#EA580C] border-2 border-white/40 active:scale-95"
                      }`}
                    >
                      <EyeOff className="w-5 h-5" />
                      {isBlocked ? "UNBLOCK" : "BLOCK"}
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
                      className={`w-full py-3 sm:py-3.5 px-4 font-black text-sm sm:text-base rounded-[18px] sm:rounded-[20px] transition-all cursor-pointer flex items-center justify-center uppercase tracking-wide gap-2.5 select-none ${
                        alreadyVoted
                          ? "bg-[#38BDF8] text-white hover:bg-[#0EA5E9] border-2 border-white/40 active:scale-95"
                          : "bg-[#FB923C] text-white hover:bg-[#EA580C] border-2 border-white/40 active:scale-95"
                      }`}
                    >
                      <UserIcon className="w-5 h-5" />
                      {alreadyVoted ? "REMOVE VOTE" : "VOTEKICK"}
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
            className: "w-full py-4 px-5 font-black text-base rounded-[22px] transition-all cursor-pointer flex items-center justify-center uppercase tracking-wide gap-3 select-none bg-[#1AAACC] text-white hover:bg-[#1691ae] border-2 border-white/40 active:scale-95",
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
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-5 mt-3 relative">
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

        <h3 id="nickname-taken-desc" className="text-[19px] sm:text-[21px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
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
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-5 mt-3 relative">
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

        <h3 id="room-full-desc" className="text-[19px] sm:text-[21px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
          This room is full
        </h3>
        <p id="room-full-desc-ar" className="text-[#8C8AA7] text-base font-bold mb-6">
          هذه الغرفة ممتلئة بالكامل
        </p>
      </CinematicModal>

      {/* Server Full (Auth Store Full) Warning Modal */}
      <CinematicModal
        isOpen={isAuthStoreFull}
        onClose={() => {
          setIsAuthStoreFull(false);
          if (typeof window !== "undefined") {
            safeLocalStorage.removeItem("gartic_player_room");
          }
          onLeave?.();
        }}
        titleType="report"
        titleText="SERVER FULL"
        buttons={[
          {
            id: "auth-store-full-exit-btn",
            text: "OK",
            onClick: () => {
              setIsAuthStoreFull(false);
              if (typeof window !== "undefined") {
                safeLocalStorage.removeItem("gartic_player_room");
              }
              onLeave?.();
            },
            variant: "danger",
          },
        ]}
      >
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-5 mt-3 relative">
          <AlertTriangle className="w-20 h-20 text-[#FB923C] fill-[#FB923C]/5" strokeWidth={2.5} />
        </div>

        <h3 id="auth-store-full-desc" className="text-[19px] sm:text-[21px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
          Server Capacity Reached
        </h3>
        <p id="auth-store-full-desc-ar" className="text-[#8C8AA7] text-base font-bold mb-6">
          بلغ الخادم طاقته الاستيعابية القصوى حالياً، يرجى المحاولة بعد قليل
        </p>
      </CinematicModal>

      {/* Join Room Timeout Modal */}
      <CinematicModal
        isOpen={isJoinTimedOut}
        onClose={() => {
          setIsJoinTimedOut(false);
          if (typeof window !== "undefined") {
            safeLocalStorage.removeItem("gartic_player_room");
          }
          onLeave?.();
        }}
        titleType="report"
        titleText="TIMEOUT"
        buttons={[
          {
            id: "join-timeout-exit-btn",
            text: "OK",
            onClick: () => {
              setIsJoinTimedOut(false);
              if (typeof window !== "undefined") {
                safeLocalStorage.removeItem("gartic_player_room");
              }
              onLeave?.();
            },
            variant: "danger",
          },
        ]}
      >
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-5 mt-3 relative">
          <AlertTriangle className="w-20 h-20 text-[#FB923C] fill-[#FB923C]/5" strokeWidth={2.5} />
        </div>

        <h3 id="join-timeout-desc" className="text-[19px] sm:text-[21px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
          Connection Timeout
        </h3>
        <p id="join-timeout-desc-ar" className="text-[#8C8AA7] text-base font-bold mb-6">
          تعذر الاتصال بالغرفة في الوقت المحدد، يرجى المحاولة مرة أخرى
        </p>
      </CinematicModal>

      {/* 🛠️ Free Draw Mobile Debug Console & Diagnostics Controller */}
      {isFreeDraw && <FreeDrawMobileDebug />}
    </>
  );
}

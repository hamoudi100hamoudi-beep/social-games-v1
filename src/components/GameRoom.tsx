import React, { useState, useEffect } from "react";
import DrawingBoard from "./DrawingBoard";
import {
  Send,
  MessageSquare,
  AlertTriangle,
  Volume2,
  Info,
  X,
  User as UserIcon,
  Pencil,
  Copy,
  Check,
  Clock,
  WifiOff,
} from "lucide-react";
import { useSocket } from "./SocketProvider";
import { motion, AnimatePresence } from "motion/react";
import { PlayersSidebar } from "./game/PlayersSidebar";
import { OverlayChatRoom, ChatMessage } from "./game/OverlayChatRoom";

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
            "bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.5)]";
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
      className={`w-full px-2 sm:px-3 py-1 shrink-0 flex items-center justify-center ${isFullScreen ? "bg-transparent" : "bg-[#1A103C]"}`}
      dir="ltr"
    >
      <div className="w-full h-1.5 sm:h-2 bg-[#24174D] rounded-full overflow-hidden shadow-inner flex justify-start">
        <div ref={barRef} className="h-full rounded-full bg-[#3b82f6]" />
      </div>
    </div>
  );
};

export default function GameRoom({
  nickname,
  room,
  avatar,
  onLeave,
  justJoined,
}: GameRoomProps) {
  const { socket, isConnected, socketId } = useSocket();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const guessInputRef = React.useRef<HTMLInputElement>(null);
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);
  const [viewportOffsetTop, setViewportOffsetTop] = useState<number>(0);
  const [maxViewportHeight, setMaxViewportHeight] = useState<number>(
    typeof window !== "undefined" ? window.innerHeight : 800,
  );
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const hasEmittedJoin = React.useRef(false);

  const persistentPlayerId = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    let id = localStorage.getItem("gartic_player_id");
    if (!id) {
      id =
        "usr-" +
        Math.random().toString(36).substring(2, 11) +
        "-" +
        Date.now().toString(36);
      localStorage.setItem("gartic_player_id", id);
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

  const isDrawingMode = gameState.status === "DRAWING" && amIDrawer;

  // --- Block 1: Handle Room Join & Rejoin based on (Re)connection status ---
  useEffect(() => {
    if (!socket) return;

    const handleJoin = () => {
      const reconnectOnly = hasEmittedJoin.current;
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
              localStorage.removeItem("gartic_player_room");
            }
            onLeave?.();
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

  // --- Block 2: Register Persistent Socket Listeners ---
  useEffect(() => {
    if (!socket) return;

    const onRoomStateUpdate = (state: {
      roomId: string;
      players: any[];
      gameState: any;
    }) => {
      const isActiveRound =
        state.gameState?.status === "DRAWING" ||
        state.gameState?.status === "CHOOSING";
      const players = state.players
        .map((p) => ({
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
        }))
        .sort((a, b) => b.points - a.points);

      setCurrentPlayers(players);
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
    };

    socket.on("room_state_update", onRoomStateUpdate);
    socket.on("receive_message", onReceiveMessage);
    socket.on("receive_guess", onReceiveGuess);
    socket.on("timer_tick", onTimerTick);

    return () => {
      socket.off("room_state_update", onRoomStateUpdate);
      socket.off("receive_message", onReceiveMessage);
      socket.off("receive_guess", onReceiveGuess);
      socket.off("timer_tick", onTimerTick);
    };
  }, [socket]);

  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const delayedBlurTimeoutRef = React.useRef<any>(null);
  const wasKeyboardShowingRef = React.useRef<boolean>(false);

  useEffect(() => {
    let currentMax = window.visualViewport?.height || window.innerHeight;
    setMaxViewportHeight(currentMax);

    const handleResize = () => {
      if (!window.visualViewport) return;

      const currentHeight = window.visualViewport.height;
      setLockedHeight(currentHeight);
      
      // Force scroll reset immediately to prevent room/chat from sliding off-screen or shifting up
      window.scrollTo(0, 0);
      if (document.body) document.body.scrollTop = 0;
      setViewportOffsetTop(0);

      if (currentHeight > currentMax) {
        currentMax = currentHeight;
        setMaxViewportHeight(currentMax);
      }

      // True if height shrunk significantly
      const isKeyboardShowing = currentHeight < currentMax - 150;
      setIsKeyboardOpen(isKeyboardShowing);

      // Always ensure layout is at origin (0, 0)
      window.scrollTo(0, 0);

      if (isKeyboardShowing) {
        wasKeyboardShowingRef.current = true;
        // Clear any scheduled delayed blurs if keyboard is actively showing
        if (delayedBlurTimeoutRef.current) {
          clearTimeout(delayedBlurTimeoutRef.current);
          delayedBlurTimeoutRef.current = null;
        }
      } else {
        // Keyboard is closed/dismissed
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
          if (wasKeyboardShowingRef.current) {
            (activeEl as HTMLElement).blur();
            wasKeyboardShowingRef.current = false;
          } else {
            if (!delayedBlurTimeoutRef.current) {
              delayedBlurTimeoutRef.current = setTimeout(() => {
                const currentHeightNow = window.visualViewport?.height || window.innerHeight;
                const isKeyboardShowingNow = currentHeightNow < currentMax - 150;
                const activeTagNow = document.activeElement?.tagName;
                if (!isKeyboardShowingNow && (activeTagNow === "INPUT" || activeTagNow === "TEXTAREA")) {
                  (document.activeElement as HTMLElement).blur();
                }
                delayedBlurTimeoutRef.current = null;
              }, 50);
            }
          }
        }
      }
    };

    if (window.visualViewport) {
      setLockedHeight(window.visualViewport.height);
      setViewportOffsetTop(0);
      window.visualViewport.addEventListener("resize", handleResize);
      window.visualViewport.addEventListener("scroll", handleResize);
    }

    return () => {
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("scroll", handleResize);
    };
  }, []);

  useEffect(() => {
    if (isChatOpen) {
      const originalBodyOverflow = document.body.style.overflow;
      const originalBodyPosition = document.body.style.position;
      const originalBodyWidth = document.body.style.width;
      const originalBodyHeight = document.body.style.height;

      const originalHtmlOverflow = document.documentElement.style.overflow;
      const originalHtmlPosition = document.documentElement.style.position;
      const originalHtmlHeight = document.documentElement.style.height;

      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100vw";
      document.body.style.height = "100%";

      document.documentElement.style.overflow = "hidden";
      document.documentElement.style.position = "fixed";
      document.documentElement.style.height = "100%";

      window.scrollTo(0, 0);

      return () => {
        document.body.style.overflow = originalBodyOverflow;
        document.body.style.position = originalBodyPosition;
        document.body.style.width = originalBodyWidth;
        document.body.style.height = originalBodyHeight;

        document.documentElement.style.overflow = originalHtmlOverflow;
        document.documentElement.style.position = originalHtmlPosition;
        document.documentElement.style.height = originalHtmlHeight;

        setTimeout(() => {
          window.scrollTo(0, 0);
        }, 50);
      };
    }
  }, [isChatOpen]);

  // Prevent any browser automatic layout scrolling when chat is open or keyboard is showing
  useEffect(() => {
    const preventAutoScroll = () => {
      if (typeof window !== "undefined" && (isChatOpen || isKeyboardOpen)) {
        if (window.scrollY !== 0 || window.scrollX !== 0) {
          window.scrollTo(0, 0);
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("scroll", preventAutoScroll, { passive: true });
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("scroll", preventAutoScroll);
      }
    };
  }, [isChatOpen, isKeyboardOpen]);

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
      <div className="absolute top-1 sm:top-2 left-0 right-0 flex items-center justify-center z-[150] pointer-events-none drop-shadow-md">
        {(() => {
          const isDrawer = amIDrawer;
          const hintsUsed = gameState.hintsUsed || 0;
          const maskedArray = gameState.maskedWordArray || [];

          if (isDrawer && gameState.currentWord) {
            const isRTL = /[\u0600-\u06FF]/.test(gameState.currentWord);

            return (
              <div
                className="flex gap-1 sm:gap-1.5 items-end mt-1 sm:mt-2"
                style={{ flexDirection: isRTL ? "row-reverse" : "row" }}
              >
                {gameState.currentWord
                  .split("")
                  .map((char: string, i: number) => {
                    if (char === " ")
                      return <span key={`space-${i}`} className="w-3" />;
                    const isRevealed = (
                      gameState.revealedIndices || []
                    ).includes(i);
                    return (
                      <div
                        key={`char-${i}`}
                        className="relative flex flex-col items-center justify-end h-6 sm:h-8"
                      >
                        <span
                          className={`text-lg sm:text-2xl leading-none font-black absolute bottom-1.5 ${isRevealed ? "text-[#FBBF24] drop-shadow-md" : "text-slate-400/40"}`}
                        >
                          {char}
                        </span>
                        <div
                          className={`w-3 sm:w-5 h-[3px] rounded-full mt-auto ${hintsUsed >= 1 ? "bg-[#FBBF24] shadow-[0_0_5px_rgba(251,191,36,0.5)]" : "bg-slate-300/80 shadow-sm"}`}
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
                className="flex gap-1 sm:gap-1.5 items-end mt-1 sm:mt-2"
                style={{ flexDirection: isRTL ? "row-reverse" : "row" }}
              >
                {maskedArray.map((item: any, i: number) => {
                  if (item.isSpace)
                    return <span key={`space-${i}`} className="w-3" />;
                  return (
                    <div
                      key={`char-${i}`}
                      className="relative flex flex-col items-center justify-end h-6 sm:h-8"
                    >
                      <span className="text-lg sm:text-2xl leading-none font-black absolute bottom-1.5 text-[#FBBF24] drop-shadow-md">
                        {item.char || ""}
                      </span>
                      <div
                        className={`w-3 sm:w-5 h-[3px] rounded-full mt-auto ${hintsUsed >= 1 ? "bg-[#FBBF24] shadow-[0_0_5px_rgba(251,191,36,0.5)]" : "bg-slate-300/80 shadow-sm"}`}
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

  return (
    <>
      <div
        className="fixed top-0 left-0 right-0 grid w-full bg-[#1A103C] font-sans overflow-hidden overscroll-none touch-none"
        style={{
          height: isChatOpen
            ? "100vh"
            : lockedHeight
              ? `${lockedHeight}px`
              : "100dvh",
          gridTemplateColumns: "minmax(0, 35%) minmax(0, 65%)",
          gridTemplateRows: "auto minmax(0, 1fr)",
        }}
      >
        {/* Global Exit Room Button */}
        {!isChatOpen && (
          <button
            onClick={() => setShowExitConfirm(true)}
            className="absolute top-4 right-4 z-[120] text-gray-800 hover:text-gray-950 transition-colors bg-transparent outline-none"
            title="الخروج من الغرفة"
          >
            <X size={32} strokeWidth={3} />
          </button>
        )}

        {/* Exit Confirmation Dialog */}
        <AnimatePresence>
          {showExitConfirm && (
            <div className="absolute inset-0 z-[150] flex flex-col items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setShowExitConfirm(false)}
              />
              {/* Dialog Content */}
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                className="relative bg-white rounded-[2rem] w-full max-w-sm flex flex-col items-center shadow-2xl p-6 sm:p-8 pt-12 pb-8 overflow-visible z-10"
              >
                {/* Banner Ribbon (CSS Ribbon) */}
                <div className="absolute -top-[1.2rem] left-1/2 -translate-x-1/2 w-48 flex justify-center z-20">
                  <div className="absolute top-4 -left-3 border-[12px] border-blue-800 border-l-transparent border-b-transparent z-[-1]"></div>
                  <div className="absolute top-4 -right-3 border-[12px] border-blue-800 border-r-transparent border-b-transparent z-[-1]"></div>

                  <div className="relative bg-[#2196F3] border-[3px] border-[#0A2540] rounded-lg px-8 py-1 shadow-[0_4px_0_#0A2540]">
                    <span
                      className="text-[#FFEB3B] font-black text-xl tracking-wider"
                      style={{ WebkitTextStroke: "1px #0A2540" }}
                    >
                      EXIT
                    </span>
                  </div>
                </div>

                {/* Big Icon */}
                <div className="w-36 h-36 rounded-full bg-[#FFEB3B] border-[4px] border-[#0A2540] mt-6 flex items-center justify-center relative shadow-[0_4px_0_#0A2540]">
                  {/* Door representation */}
                  <div className="w-16 h-20 bg-white border-[3px] border-[#0A2540] rounded-sm relative">
                    <div className="absolute top-1/2 right-2 w-2 h-2 rounded-full border-[2px] border-[#0A2540]" />
                  </div>
                </div>

                {/* Question */}
                <h3 className="text-gray-500 font-bold text-lg sm:text-xl text-center mt-8 mb-8">
                  Do you want to leave the game?
                </h3>

                {/* Buttons */}
                <div className="flex items-center gap-4 w-full">
                  <button
                    onClick={() => setShowExitConfirm(false)}
                    className="flex-1 h-14 bg-[#29C6F6] border-[3px] border-[#0A2540] rounded-full flex items-center justify-center gap-2 shadow-[0_4px_0_#0A2540] active:translate-y-1 active:shadow-[0_0px_0_#0A2540] transition-all"
                  >
                    <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[#29C6F6] border-2 border-[#0A2540]">
                      <X size={14} strokeWidth={4} />
                    </div>
                    <span className="text-[#0A2540] font-black text-lg">
                      NO
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      socket?.emit("leave_room", { roomId: room });
                      onLeave?.();
                    }}
                    className="flex-1 h-14 bg-[#FFB300] border-[3px] border-[#0A2540] rounded-full flex items-center justify-center gap-2 shadow-[0_4px_0_#0A2540] active:translate-y-1 active:shadow-[0_0px_0_#0A2540] transition-all"
                  >
                    <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[#FFB300] border-2 border-[#0A2540]">
                      <Check size={14} strokeWidth={4} />
                    </div>
                    <span className="text-[#0A2540] font-black text-lg">
                      YES
                    </span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Top Area (Drawing / Waiting) */}
        <div
          className={`relative flex flex-col shrink-0 overflow-hidden bg-[#1A103C]
                      ${morphMode ? "col-start-2 col-end-3 row-start-1 row-end-2" : "col-start-1 col-end-3 row-start-1 row-end-2"}
                     `}
        >
          <div className="w-full aspect-[4/3] bg-white shrink-0 flex flex-col items-center justify-center overflow-hidden relative">
            {/* Hint/Word Overlay Overlay for spectator view */}
            {!isDrawingMode && renderWordOverlay()}

            {/* Unified Adaptive Drawing Canvas Container */}
            <div
              className={
                isDrawingMode
                  ? "fixed inset-0 z-[100] bg-white flex flex-col transition-all duration-300 opacity-100"
                  : "w-full h-full relative flex flex-col"
              }
            >
              {isDrawingMode && renderWordOverlay(true)}
              <DrawingBoard
                key={`shared-board-${room || ""}`}
                currentDrawerId={gameState.currentDrawerId}
                status={gameState.status}
                readOnly={isDrawingMode ? false : !amIDrawer}
                onSkipTurn={
                  isDrawingMode && gameState.status === "DRAWING"
                    ? () => setShowSkipConfirm(true)
                    : undefined
                }
                onRequestHint={
                  isDrawingMode && gameState.status === "DRAWING"
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
                    {hitNotifications.map((hit) => (
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
                            "1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 0 2px 4px rgba(255,255,255,0.8)",
                        }}
                        className="flex items-center justify-center gap-1.5 text-[#10B981] font-bold text-[15px] whitespace-nowrap bg-transparent"
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
                    ))}
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
                  className="w-32 h-32 sm:w-40 sm:h-40 bg-[#10B981] rounded-full border-[5px] border-white flex items-center justify-center shadow-[0_10px_40px_rgba(16,185,129,0.5)]"
                >
                  <motion.svg
                    viewBox="0 0 50 50"
                    className="w-20 h-20 sm:w-24 sm:h-24 text-white drop-shadow-md"
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

            {/* Overlays for WAITING state */}
            {gameState.status === "WAITING" && (
              <div className="absolute inset-0 z-[40] flex flex-col items-center justify-center bg-white pointer-events-none p-4 select-none font-sans">
                <div className="text-center animate-in fade-in zoom-in-95 duration-300 w-full max-w-sm">
                  <div className="mb-4">
                    <span className="text-[#0B2E5C] text-2xl sm:text-4xl font-black tracking-wide uppercase drop-shadow-[0_2px_0_rgb(251,191,36)] px-5 py-2">
                      WAITING
                    </span>
                  </div>
                  <div className="relative w-24 h-24 sm:w-28 sm:h-28 mb-5 mx-auto bg-sky-100 rounded-full flex items-center justify-center border-4 border-[#0B2E5C]/10 shadow-inner">
                    <span className="text-5xl sm:text-6xl animate-pulse">
                      ⏳
                    </span>
                    <span className="absolute -top-1 -right-1 text-2.5xl animate-bounce">
                      ⏰
                    </span>
                  </div>
                  <p className="text-[#728299] text-base sm:text-lg font-extrabold tracking-wide">
                    Waiting for players
                  </p>
                </div>
              </div>
            )}

            {/* Overlays for CHOOSING state (non-drawer) */}
            {gameState.status === "CHOOSING" && !amIDrawer && (
              <div className="absolute inset-0 z-[40] flex flex-col items-center justify-center bg-white pointer-events-none p-4 select-none font-sans">
                <div className="text-center animate-in fade-in zoom-in-95 duration-300 w-full max-w-sm">
                  <div className="mb-4">
                    <span className="text-[#0B2E5C] text-2xl sm:text-4xl font-black tracking-wide uppercase drop-shadow-[0_2px_0_rgb(251,191,36)] px-5 py-2">
                      NEW TURN!
                    </span>
                  </div>

                  {/* Avatar element */}
                  <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto bg-[#F8FAFC] border-[5px] border-[#0A2540] rounded-full flex items-center justify-center shadow-lg mb-4 relative overflow-visible">
                    <span className="text-4xl sm:text-5xl">
                      {
                        currentPlayers.find(
                          (p) =>
                            p.persistentId === gameState.currentDrawerId ||
                            p.id === gameState.currentDrawerId,
                        )?.avatar
                      }
                    </span>
                    <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#FBBF24] rounded-full flex items-center justify-center shadow border-2 border-[#0A2540]">
                      <span className="text-xs">✏️</span>
                    </div>
                  </div>

                  <p className="text-[#728299] text-sm sm:text-base font-extrabold mb-0.5">
                    It's the turn of
                  </p>
                  <h3 className="text-[#0B2E5C] font-black text-xl sm:text-2xl tracking-wide">
                    {getCurrentDrawerName()}
                  </h3>
                </div>
              </div>
            )}

            {/* Overlays for ROUND_END state */}
            {gameState.status === "ROUND_END" &&
              (() => {
                const reason = gameState.roundEndReason;
                const word = gameState.roundEndWord || "";
                const isDrawer = amIDrawer;
                const drawerName = getCurrentDrawerName() || "الرسام";
                const hasSucceeded =
                  (gameState.correctGuessers || []).length > 0;

                // 1. SKIPPED STATE
                if (reason === "skipped") {
                  return (
                    <div className="absolute inset-0 z-[40] flex flex-col items-center justify-center bg-white pointer-events-none p-4 select-none font-sans">
                      <div className="text-center animate-in fade-in zoom-in-95 duration-300 w-full max-w-sm">
                        <div className="mb-4">
                          <span className="text-[#0B2E5C] text-2xl sm:text-4xl font-black tracking-wide uppercase drop-shadow-[0_2px_0_rgb(251,191,36)] px-5 py-2">
                            SKIPPED!
                          </span>
                        </div>

                        <div className="relative w-24 h-24 sm:w-28 sm:h-28 mb-5 mx-auto bg-green-50 rounded-full flex items-center justify-center border-4 border-green-100 shadow-sm">
                          <span className="text-5xl sm:text-6xl animate-bounce">
                            ✏️
                          </span>
                          <span className="absolute -bottom-1 -right-1 text-2xl animate-spin">
                            💫
                          </span>
                        </div>

                        <h3
                          className="text-[#0A2540] font-black text-lg sm:text-xl tracking-wide mb-1"
                          dir="auto"
                        >
                          {isDrawer
                            ? "You've skipped the turn"
                            : `${drawerName} skipped the turn`}
                        </h3>
                      </div>
                    </div>
                  );
                }

                // 2. TURN LOST / INACTIVE STATE
                if (reason === "turn_lost") {
                  return (
                    <div className="absolute inset-0 z-[40] flex flex-col items-center justify-center bg-white pointer-events-none p-4 select-none font-sans">
                      <div className="text-center animate-in fade-in zoom-in-95 duration-300 w-full max-w-sm">
                        <div className="mb-4">
                          <span className="text-[#0B2E5C] text-2xl sm:text-4xl font-black tracking-wide uppercase drop-shadow-[0_2px_0_rgb(251,191,36)] px-5 py-2">
                            INACTIVE
                          </span>
                        </div>

                        <div className="relative w-24 h-24 sm:w-28 sm:h-28 mb-5 mx-auto bg-amber-50 rounded-full flex items-center justify-center border-4 border-amber-100 shadow-sm">
                          <span className="text-5xl sm:text-6xl animate-pulse">
                            💤
                          </span>
                          <span className="absolute -bottom-1 -right-1 text-2.5xl">
                            ⏰
                          </span>
                        </div>

                        <h3
                          className="text-[#0A2540] font-black text-lg sm:text-xl tracking-wide mb-1"
                          dir="auto"
                        >
                          {isDrawer
                            ? "You've lost your turn :("
                            : `${drawerName} has lost the turn`}
                        </h3>
                      </div>
                    </div>
                  );
                }

                // 3. INTERVAL / STANDARD ROUND END (timeout, all_guessed, drawer_left)
                let topHeader = "INTERVAL";
                let statusMessage = "Take a while to relax";

                if (reason === "all_guessed") {
                  statusMessage = "Everybody hit the answer!";
                } else if (reason === "timeout" || reason === "drawer_left") {
                  statusMessage = hasSucceeded
                    ? "Take a while to relax"
                    : "Nobody hit the answer :(";
                }

                return (
                  <div className="absolute inset-0 z-[40] flex flex-col items-center justify-center bg-white pointer-events-none p-4 select-none font-sans">
                    <div className="text-center animate-in fade-in zoom-in-95 duration-300 w-full max-w-sm">
                      <div className="mb-3">
                        <span className="text-[#0B2E5C] text-2xl sm:text-4xl font-black tracking-wide uppercase drop-shadow-[0_2px_0_rgb(251,191,36)] px-5 py-2">
                          {topHeader}
                        </span>
                      </div>

                      <p
                        className="text-[#728299] text-sm sm:text-base font-extrabold mb-4"
                        dir="auto"
                      >
                        {statusMessage}
                      </p>

                      <div className="relative w-24 h-24 sm:w-28 sm:h-28 mb-4 mx-auto bg-sky-50 rounded-full flex items-center justify-center border-4 border-sky-150 shadow-sm">
                        <span className="text-5xl sm:text-6xl animate-bounce">
                          🎨
                        </span>
                        <span className="absolute -top-1 -right-1 text-2.5xl">
                          ✨
                        </span>
                      </div>

                      {word && (
                        <div className="mt-2 text-center">
                          <span className="text-[#728299] text-xs sm:text-sm font-bold block mb-1">
                            The answer was:
                          </span>
                          <span
                            className="text-[#0B2E5C] text-xl sm:text-2xl font-black tracking-wide inline-block bg-[#F1F5F9] border-2 border-slate-200/60 px-5 py-1 rounded-full shadow-inner"
                            dir="auto"
                          >
                            {word}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

            {/* Overlays for PODIUM state */}
            {gameState.status === "PODIUM" &&
              (() => {
                const sorted = [...currentPlayers]
                  .sort((a, b) => (b.points || 0) - (a.points || 0))
                  .filter((p) => !p.isEmpty);
                const first = sorted[0];
                const second = sorted[1];
                const third = sorted[2];

                return (
                  <div
                    id="podium-overlay"
                    className="absolute inset-0 z-[50] flex flex-col bg-white p-4 sm:p-6 font-sans select-none animate-in fade-in duration-300 overflow-hidden"
                  >
                    <style>{`
                   @keyframes medal-shine {
                     0% { transform: translateX(-150%) rotate(25deg); opacity: 0; }
                     5% { opacity: 1; }
                     15% { transform: translateX(150%) rotate(25deg); opacity: 0; }
                     100% { transform: translateX(150%) rotate(25deg); opacity: 0; }
                   }
                   .animate-medal-shine {
                     animation: medal-shine 5s ease-in-out infinite;
                   }
                 `}</style>
                    {/* Title: GAME OVER */}
                    <div className="w-full flex justify-center mt-0 mb-2">
                      <h1 className="text-2xl sm:text-4xl font-black text-[#0B2E5C] tracking-wide uppercase drop-shadow-[0_2px_0_rgba(251,191,36,1)]">
                        GAME OVER
                      </h1>
                    </div>

                    {/* Winners Podium alignments - elevated closer to top */}
                    <div className="flex-1 flex flex-col items-center justify-start pt-2 sm:pt-6">
                      <div className="flex items-end justify-center gap-6 sm:gap-16 w-full max-w-lg pb-4">
                        {/* Second Place */}
                        {second ? (
                          <div
                            id="podium-second"
                            className="flex flex-col items-center animate-in slide-in-from-bottom-8 duration-700 relative w-14 sm:w-20 mt-4"
                          >
                            <div className="relative">
                              <div className="relative p-1 bg-gradient-to-r from-slate-400 via-slate-100 to-slate-400 rounded-full shadow-[0_8px_20px_rgba(148,163,184,0.4)] border border-slate-500 overflow-hidden">
                                <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center text-slate-700 font-extrabold text-xl sm:text-3xl border-4 border-white shadow-inner relative overflow-hidden font-sans">
                                  <span className="drop-shadow-sm">
                                    {second.avatar}
                                  </span>
                                </div>
                                <div className="absolute inset-0 bg-white/40 w-[200%] h-full animate-medal-shine z-10" />
                              </div>
                              {/* Silver Medal Badge (3D look) */}
                              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-b from-slate-200 via-slate-400 to-slate-600 border-[3px] border-slate-700 flex items-center justify-center shadow-[0_4px_8px_rgba(100,116,139,0.35)] text-white font-black text-sm z-20 overflow-hidden">
                                3
                                <div className="absolute inset-0 bg-white/40 animate-medal-shine z-10" />
                              </div>
                            </div>
                            <span className="text-[#0A2540] font-black text-[13px] sm:text-[16px] mt-4 truncate w-full text-center tracking-wide block">
                              {second.name}
                            </span>
                          </div>
                        ) : (
                          <div className="w-14 sm:w-20" />
                        )}

                        {/* First Place */}
                        {first && (
                          <div
                            id="podium-first"
                            className="flex flex-col items-center animate-in slide-in-from-bottom-12 duration-1000 relative w-16 sm:w-24 z-10"
                          >
                            <div className="relative overflow-visible">
                              <div className="relative p-1 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 rounded-full shadow-[0_12px_28px_rgba(245,158,11,0.5)] border border-amber-600 overflow-hidden">
                                <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-yellow-50 to-amber-100 flex items-center justify-center text-amber-900 font-extrabold text-2xl sm:text-4xl border-4 border-white shadow-inner relative overflow-hidden font-sans">
                                  <span className="drop-shadow-sm">
                                    {first.avatar}
                                  </span>
                                </div>
                                <div className="absolute inset-0 bg-white/50 w-[200%] h-full animate-medal-shine z-10" />
                              </div>
                              {/* Gold Medal Badge (3D look) */}
                              <div className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gradient-to-b from-yellow-200 via-amber-400 to-amber-600 border-[3.5px] border-amber-800 flex items-center justify-center shadow-[0_5px_12px_rgba(217,119,6,0.45)] text-white font-black text-sm sm:text-lg z-20 overflow-hidden">
                                1
                                <div className="absolute inset-0 bg-white/50 animate-medal-shine z-10" />
                              </div>
                            </div>
                            <span className="text-[#0B2E5C] font-black text-[15px] sm:text-[18px] mt-5 truncate w-full text-center tracking-wide block">
                              {first.name}
                            </span>
                          </div>
                        )}

                        {/* Third Place */}
                        {third ? (
                          <div
                            id="podium-third"
                            className="flex flex-col items-center animate-in slide-in-from-bottom-6 duration-500 relative w-14 sm:w-20 mt-4"
                          >
                            <div className="relative">
                              <div className="relative p-1 bg-gradient-to-r from-orange-700 via-orange-500 to-orange-800 rounded-full shadow-[0_8px_20px_rgba(194,65,12,0.35)] border border-orange-900 overflow-hidden">
                                <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center text-orange-950 font-extrabold text-xl sm:text-3xl border-4 border-white shadow-inner relative overflow-hidden font-sans">
                                  <span className="drop-shadow-sm">
                                    {third.avatar}
                                  </span>
                                </div>
                                <div className="absolute inset-0 bg-white/30 w-[200%] h-full animate-medal-shine z-10" />
                              </div>
                              {/* Bronze Medal Badge (3D look) */}
                              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-b from-orange-300 via-orange-600 to-orange-800 border-[3px] border-orange-950 flex items-center justify-center shadow-[0_4px_8px_rgba(154,52,18,0.35)] text-white font-black text-sm z-20 overflow-hidden">
                                3
                                <div className="absolute inset-0 bg-white/30 animate-medal-shine z-10" />
                              </div>
                            </div>
                            <span className="text-[#0A2540] font-black text-[13px] sm:text-[16px] mt-4 truncate w-full text-center tracking-wide block">
                              {third.name}
                            </span>
                          </div>
                        ) : (
                          <div className="w-14 sm:w-20" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
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
        />

        {/* Right: Actions & Guess Input */}
        <div
          className={`flex flex-col bg-[#1A103C] relative overflow-hidden
                      ${morphMode ? "col-start-2 col-end-3 row-start-2 row-end-3" : "col-start-2 col-end-3 row-start-2 row-end-3"}
                     `}
        >
            {/* Actions Bar */}
            <div
              className={`grid transition-all duration-150 ease-in-out shrink-0 bg-[#24174D]
                          ${isInputFocused ? "grid-rows-[0fr] opacity-0 border-none" : "grid-rows-[1fr] opacity-100 border-b border-[#00D9FF]/10"}`}
            >
              <div className="overflow-hidden">
                <div className="flex gap-2 sm:gap-4 p-2 sm:p-3 bg-[#1AAACC]/10 justify-around">
                  <button className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl bg-orange-400 hover:bg-orange-500 active:scale-95 flex items-center justify-center text-white transition-all shadow-md">
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
                    className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl bg-yellow-400 hover:bg-yellow-500 active:scale-95 flex items-center justify-center text-[#1A103C] font-bold transition-all shadow-md relative"
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
            <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-2 flex flex-col-reverse font-sans min-h-0">
              <div className="flex flex-col-reverse gap-1.5">
                {[...guesses].reverse().map((msg) => {
                  const isSystem = msg.type === "system";
                  if (isSystem) {
                    const subType = (msg as any).subType || "";
                    const text = msg.text;

                    // Hit / guessed correctly
                    if (subType === "hit") {
                      const isSelfGuesser = msg.senderId === socketId;
                      const displayWord = (msg as any).word || "";
                      const displayText = isSelfGuesser
                        ? `You've found the answer: ${displayWord}`
                        : `${msg.sender || text.replace(" guessed the word!", "")} hit!`;

                      return (
                        <div
                          key={msg.id}
                          className="flex items-center gap-2 text-[#10B981] font-bold text-xs sm:text-sm py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <Check
                            size={14}
                            className="stroke-[3.5] text-[#10B981] shrink-0"
                          />
                          <span dir="auto">{displayText}</span>
                        </div>
                      );
                    }

                    // Round End break / Interval
                    if (subType === "interval") {
                      return (
                        <div
                          key={msg.id}
                          className="flex items-center gap-2 text-[#60A5FA] font-bold text-xs sm:text-sm py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <Clock
                            size={14}
                            className="text-[#60A5FA] shrink-0"
                          />
                          <span>Interval...</span>
                        </div>
                      );
                    }

                    // Turn change
                    if (subType === "turn") {
                      return (
                        <div
                          key={msg.id}
                          className="flex items-center gap-2 text-[#60A5FA] font-bold text-xs sm:text-sm py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <Pencil
                            size={12}
                            className="text-[#60A5FA] shrink-0"
                          />
                          <span dir="auto">{text}</span>
                        </div>
                      );
                    }

                    // Game over
                    if (subType === "game_over") {
                      return (
                        <div
                          key={msg.id}
                          className="flex items-start gap-2 text-[#60A5FA] font-bold text-xs sm:text-sm py-1 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <Info
                            size={14}
                            className="text-[#60A5FA] shrink-0 mt-0.5"
                          />
                          <span dir="auto">{text}</span>
                        </div>
                      );
                    }

                    // Everybody hit
                    if (subType === "all_guessed") {
                      return (
                        <div
                          key={msg.id}
                          className="flex items-center gap-2 text-[#10B981] font-bold text-xs sm:text-sm py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <Check
                            size={14}
                            className="stroke-[3.5] text-[#10B981] shrink-0"
                          />
                          <span>Everybody hit the answer!</span>
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
                          className="flex items-center gap-2 text-[#EF4444] font-bold text-xs sm:text-sm py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <AlertTriangle
                            size={14}
                            className="text-[#EF4444] shrink-0"
                          />
                          <span dir="auto">{displayText}</span>
                        </div>
                      );
                    }

                    // Other reveals
                    let iconNode = (
                      <Info size={14} className="shrink-0 text-[#60A5FA]" />
                    );
                    let textColor = "#60A5FA";

                    if (
                      text.toLowerCase().includes("hit") ||
                      text.toLowerCase().includes("guessed") ||
                      text.toLowerCase().includes("guessed the word")
                    ) {
                      iconNode = (
                        <Check
                          size={14}
                          className="stroke-[3.5] text-[#10B981] shrink-0"
                        />
                      );
                      textColor = "#10B981";
                    } else if (text.toLowerCase().includes("turn")) {
                      iconNode = (
                        <Pencil size={12} className="shrink-0 text-[#60A5FA]" />
                      );
                      textColor = "#60A5FA";
                    } else if (text.toLowerCase().includes("interval")) {
                      iconNode = (
                        <Clock size={14} className="shrink-0 text-[#60A5FA]" />
                      );
                      textColor = "#60A5FA";
                    } else if (
                      text.toLowerCase().includes("timeout") ||
                      text.toLowerCase().includes("time's up") ||
                      text.toLowerCase().includes("answer was")
                    ) {
                      iconNode = (
                        <Pencil size={12} className="shrink-0 text-[#60A5FA]" />
                      );
                      textColor = "#60A5FA";
                    }

                    return (
                      <div
                        key={msg.id}
                        className="flex items-center gap-2 font-bold text-xs sm:text-sm py-0.5"
                        style={{ color: textColor }}
                      >
                        {iconNode}
                        <span dir="auto">{text}</span>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className="text-[12px] sm:text-[14px]">
                      <div className="flex items-start gap-1">
                        <Pencil
                          size={10}
                          className="text-[#00D9FF]/40 shrink-0 mt-1"
                        />
                        <span className="font-bold text-white/50">
                          {msg.sender}:
                        </span>
                        <span
                          className={`${msg.isSelf ? "text-white" : "text-slate-300"} break-words`}
                          dir="auto"
                          style={{ unicodeBidi: "plaintext" }}
                        >
                          {msg.text}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center gap-1.5 text-[#00D9FF] font-medium text-[11px] sm:text-[13px]">
                  <Info size={12} />
                  Waiting for players
                </div>
              </div>
            </div>

            {/* Guess Input Area */}
            <div className="p-1.5 shrink-0 mt-auto bg-[#1A103C] border-t border-white/5">
              <form onSubmit={handleGuessSubmit} className="relative">
                <div
                  className={`absolute left-2.5 top-1/2 -translate-y-1/2 transition-opacity duration-200 ${isInputDisabled ? "text-white/15" : "text-white/50"}`}
                >
                  <Pencil size={12} />
                </div>
                <input
                  ref={guessInputRef}
                  type="text"
                  disabled={isInputDisabled && !isInputFocused}
                  value={isInputDisabled ? "" : guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  onFocus={() => {
                    setIsInputFocused(true);
                    setIsKeyboardOpen(true);
                    if (delayedBlurTimeoutRef.current) {
                      clearTimeout(delayedBlurTimeoutRef.current);
                      delayedBlurTimeoutRef.current = null;
                    }
                    setTimeout(() => {
                      window.scrollTo(0, 0);
                    }, 50);
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
                  className={`w-full h-8 border rounded-lg pl-8 pr-10 text-white font-bold text-xs outline-none transition-all duration-200 ${isInputDisabled ? "bg-black/40 border-white/5 text-white/30 cursor-not-allowed placeholder:text-white/20" : "bg-black/20 border-white/10 focus:border-[#00D9FF] placeholder:text-white/45"}`}
                />
                <button
                  type="submit"
                  onPointerDown={(e) => e.preventDefault()}
                  disabled={!guessInput.trim() || isInputDisabled}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-[#1A103C] disabled:opacity-0 bg-[#00D9FF] rounded-md hover:bg-white transition-opacity"
                >
                  <Send size={12} className="-ml-0.5" />
                </button>
              </form>
            </div>
          </div>
      </div>

      {/* Chat Overlay */}
      <OverlayChatRoom
        isChatOpen={isChatOpen}
        viewportOffsetTop={viewportOffsetTop}
        lockedHeight={lockedHeight}
        closeChat={closeChat}
        chatMessages={chatMessages}
        socketId={socketId}
        chatInput={chatInput}
        setChatInput={setChatInput}
        handleChatSubmit={handleChatSubmit}
      />

      {/* Skip Confirm Modal */}
      {showSkipConfirm && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#24174D] p-6 rounded-3xl shadow-2xl flex flex-col items-center border border-white/10 animate-in zoom-in-95 w-full max-w-sm text-center">
            <h3 className="text-white font-bold text-lg mb-2">Skip Turn?</h3>
            <p className="text-white/70 text-sm mb-6">
              Are you sure you want to skip your turn?
            </p>
            <div className="flex gap-4 w-full">
              <button
                onClick={() => setShowSkipConfirm(false)}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-4 rounded-xl transition-all"
              >
                No
              </button>
              <button
                onClick={handleSkipTurn}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Overlays for CHOOSING state */}
      {gameState.status === "CHOOSING" && amIDrawer && (
        <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 touch-none">
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
                    className="w-[85%] max-w-xs bg-[#FBBF24] hover:bg-[#F59E0B] text-[#1A103C] font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-[0_4px_14px_0_rgba(251,191,36,0.39)] active:scale-95 transition-all text-xl"
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
                    className="w-[85%] max-w-xs bg-[#FBBF24] hover:bg-[#F59E0B] text-[#1A103C] font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-[0_4px_14px_0_rgba(251,191,36,0.39)] active:scale-95 transition-all text-xl"
                  >
                    <Pencil fill="currentColor" size={24} />
                    DRAW
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Timer Bar for Drawer Choosing Screen */}
          <div className="absolute bottom-10 left-0 right-0 w-full px-6 max-w-md mx-auto">
            {
              <SmoothTimer
                gameState={gameState}
                maxTime={getMaxTime()}
                isFullScreen={true}
              />
            }
          </div>
        </div>
      )}

      {/* Dynamic Non-Intrusive Connection Status removed to allow silent background connection */}
    </>
  );
}

import React, { useState, useEffect } from 'react';
import DrawingBoard from './DrawingBoard';
import { Send, MessageSquare, AlertTriangle, Volume2, Info, X, User as UserIcon, Pencil, Copy, Check, Clock, WifiOff } from 'lucide-react';
import { useSocket } from './SocketProvider';
import { motion, AnimatePresence } from 'motion/react';

interface GameRoomProps {
  nickname: string;
  room: string;
  avatar: string;
  onLeave?: () => void;
}

interface Message {
  id: string;
  sender: string;
  senderId?: string;
  text: string;
  isSelf: boolean;
  type: 'message' | 'system';
  avatar?: string;
  color?: string;
}

type PlayerSlot = { id: string; name: string; points: number | null; isCurrent: boolean; isEmpty?: boolean; avatar?: string; wins?: number; isOffline?: boolean; persistentId?: string; };

interface HitNotification {
  id: string;
  name: string;
}

const getSenderColor = (name: string) => {
  const colors = [
    'text-red-400', 
    'text-green-400', 
    'text-yellow-400', 
    'text-pink-400', 
    'text-indigo-400',
    'text-orange-400',
    'text-lime-400'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const ChatMessageItem: React.FC<{ 
  msg: Message, 
  activeCopyId: string | null, 
  onSetActiveCopy: (id: string | null) => void,
  mySocketId?: string
}> = ({ 
  msg, 
  activeCopyId, 
  onSetActiveCopy,
  mySocketId
}) => {
  const showCopy = activeCopyId === msg.id;

  const startY = React.useRef<number>(0);
  const startX = React.useRef<number>(0);
  const hasScrolled = React.useRef<boolean>(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Unconditionally prevent default on pointerdown to stop focus loss (keep keyboard open)
    // This does NOT break touch scrolling on modern mobile browsers.
    e.preventDefault();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    hasScrolled.current = false;
    startY.current = e.touches[0].clientY;
    startX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaY = Math.abs(e.touches[0].clientY - startY.current);
    const deltaX = Math.abs(e.touches[0].clientX - startX.current);
    if (deltaY > 10 || deltaX > 10) {
      hasScrolled.current = true;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!hasScrolled.current) {
      if (e.cancelable) e.preventDefault();
      toggleCopy();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleCopy();
  };

  const toggleCopy = () => {
    if (showCopy) {
      onSetActiveCopy(null);
    } else {
      onSetActiveCopy(msg.id);
    }
  };

  const copyToClipboard = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
    try {
      navigator.clipboard.writeText(msg.text);
    } catch (err) {}
    onSetActiveCopy(null);
  };

  if (msg.type === 'system') {
    const text = msg.text || '';
    const isJoin = text.includes('انضم للغرفة') || text.toLowerCase().includes('joined');
    const isLeave = text.includes('غادر الغرفة') || text.toLowerCase().includes('left');

    if (!isJoin && !isLeave) {
      return null;
    }

    const isTargetingSelf = msg.senderId === mySocketId;
    let displayText = text;
    if (isTargetingSelf && text.includes('lost the turn')) {
        displayText = "You've lost your turn";
    } else if (isTargetingSelf && text.includes('skipped the turn')) {
        displayText = "You've skipped the turn";
    }

    return (
      <div className="flex justify-center mb-2">
        <div 
          className="bg-[#00D9FF]/20 text-[#00D9FF] px-4 py-1.5 rounded-full text-xs font-bold shadow-sm backdrop-blur-md"
          dir="auto"
          style={{ unicodeBidi: 'plaintext' }}
        >
          {displayText}
        </div>
      </div>
    );
  }

  if (msg.isSelf) {
    return (
      <div className="flex justify-end items-end gap-2 w-full animate-in slide-in-from-bottom-2 select-none">
        <div 
          className="flex flex-col items-end max-w-[80%] relative"
          onPointerDown={handlePointerDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleClick}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        >
          <span className="text-[15px] text-[#00D9FF] font-bold mb-1 mr-1">{msg.sender}</span>
          <div 
            className="bg-[#7C4DFF] px-4 py-2.5 rounded-2xl rounded-tr-sm text-white text-[15px] font-medium shadow-md break-words border border-[#6A3DE8]"
            dir="auto"
            style={{ unicodeBidi: 'plaintext', textAlign: 'start' }}
          >
            {msg.text}
          </div>
          {showCopy && (
            <button 
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); copyToClipboard(e); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyToClipboard(e); }}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); copyToClipboard(e); }}
              className="absolute -top-3 left-0 bg-black/80 text-white text-[10px] px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1 z-10 animate-in fade-in border border-white/20"
            >
              <Copy size={10} />
              Copy
            </button>
          )}
        </div>
        <div className="w-16 h-16 rounded-full bg-[#1A103C] border-[3px] border-[#00D9FF] flex items-center justify-center shrink-0 shadow-lg relative bottom-1">
          <span className="text-4xl translate-y-[1px]">{msg.avatar}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start items-end gap-2 w-full animate-in slide-in-from-bottom-2 select-none">
      <div className="w-16 h-16 rounded-full bg-[#24174D] border-[3px] border-[#7C4DFF] flex items-center justify-center shrink-0 shadow-lg relative bottom-1">
        <span className="text-4xl translate-y-[1px]">{msg.avatar || '?'}</span>
      </div>
      <div 
        className="flex flex-col items-start max-w-[80%] relative"
        onPointerDown={handlePointerDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
      >
        <span className={`text-[15px] font-bold mb-1 ml-1 ${getSenderColor(msg.sender)}`}>{msg.sender}</span>
        <div 
          className="bg-[#24174D] px-4 py-2.5 rounded-2xl rounded-tl-sm text-white text-[15px] font-medium shadow-md break-words border border-white/10"
          dir="auto"
          style={{ unicodeBidi: 'plaintext', textAlign: 'start' }}
        >
          {msg.text}
        </div>
        {showCopy && (
          <button 
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); copyToClipboard(e); }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyToClipboard(e); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); copyToClipboard(e); }}
            className="absolute -top-3 right-0 bg-black/80 text-white text-[10px] px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1 z-10 animate-in fade-in border border-white/20"
          >
            <Copy size={10} /> 
            Copy
          </button>
        )}
      </div>
    </div>
  );
};

const SmoothTimer = ({ gameState, maxTime, isFullScreen = false }: { gameState: { status: string, timeLeft: number, currentWord?: string | null }, maxTime: number, isFullScreen?: boolean }) => {
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
        let timerColorClass = 'bg-[#FBBF24] shadow-[0_0_8px_rgba(251,191,36,0.5)]';
        if (gameState.status !== 'DRAWING' && gameState.status !== 'CHOOSING') {
          timerColorClass = 'bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.5)]';
        } else {
          if (pct <= 20) {
            timerColorClass = 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]';
          } else if (pct <= 50) {
            timerColorClass = 'bg-[#F97316] shadow-[0_0_8px_rgba(249,115,22,0.5)]';
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
    <div className={`w-full px-2 sm:px-3 py-1 shrink-0 flex items-center justify-center ${isFullScreen ? 'bg-transparent' : 'bg-[#1A103C]'}`} dir="ltr">
        <div className="w-full h-1.5 sm:h-2 bg-[#24174D] rounded-full overflow-hidden shadow-inner flex justify-start">
            <div 
              ref={barRef}
              className="h-full rounded-full bg-[#3b82f6]"
            />
        </div>
    </div>
  );
};

export default function GameRoom({ nickname, room, avatar, onLeave }: GameRoomProps) {
  const { socket, isConnected, socketId } = useSocket();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const bgTouchStartTime = React.useRef<number>(0);
  const guessInputRef = React.useRef<HTMLInputElement>(null);
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);
  const [viewportOffsetTop, setViewportOffsetTop] = useState<number>(0);
  const [maxViewportHeight, setMaxViewportHeight] = useState<number>(typeof window !== 'undefined' ? window.innerHeight : 800);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeCopyId, setActiveCopyId] = useState<string | null>(null);
  const [syncHistory, setSyncHistory] = useState<any[] | null>(null);

  const persistentPlayerId = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    let id = localStorage.getItem('gartic_player_id');
    if (!id) {
      id = 'usr-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
      localStorage.setItem('gartic_player_id', id);
    }
    return id;
  }, []);
  
  const [gameState, setGameState] = useState<any>({
    status: 'WAITING',
    currentDrawerId: null,
    currentWord: null,
    timeLeft: 0,
    wordOptions: []
  });

  const [showCorrectAnimation, setShowCorrectAnimation] = useState(false);
  const [hitNotifications, setHitNotifications] = useState<HitNotification[]>([]);

  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  const openChat = () => {
    setIsChatOpen(true);
    setUnreadCount(0);
  };

  const closeChat = () => {
    setIsChatOpen(false);
    setActiveCopyId(null);
    const textarea = document.getElementById('chat-textarea');
    if (textarea) {
      textarea.blur();
    }
  };
  const [guessInput, setGuessInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  
  const [guesses, setGuesses] = useState<Message[]>([]);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [currentPlayers, setCurrentPlayers] = useState<PlayerSlot[]>([]);

  const amIDrawer = React.useMemo(() => {
    if (!gameState.currentDrawerId) return false;
    if (gameState.currentDrawerId === persistentPlayerId) return true;
    
    // fallback: locate the player slots
    const drawerPlayer = currentPlayers.find(p => p.persistentId === gameState.currentDrawerId || p.id === gameState.currentDrawerId);
    if (drawerPlayer && drawerPlayer.persistentId) {
      return drawerPlayer.persistentId === persistentPlayerId;
    }
    const slotMe = currentPlayers.find(p => p.persistentId === persistentPlayerId);
    if (slotMe && drawerPlayer && slotMe.persistentId === drawerPlayer.persistentId) {
      return true;
    }
    return gameState.currentDrawerId === socketId;
  }, [gameState.currentDrawerId, currentPlayers, persistentPlayerId, socketId]);

  const drawerPersistentId = React.useMemo(() => {
    if (!gameState.currentDrawerId) return 'lobby';
    const drawerPlayer = currentPlayers.find(p => p.persistentId === gameState.currentDrawerId || p.id === gameState.currentDrawerId);
    return drawerPlayer?.persistentId || gameState.currentDrawerId;
  }, [gameState.currentDrawerId, currentPlayers]);

  const isDrawingMode = gameState.status === 'DRAWING' && amIDrawer;

  // ==========================================
  // PHASE 4: PASSIVE DEBOUNCED IDLE & VISIBILITY GRACE PERIOD
  // ==========================================
  useEffect(() => {
    if (!socket) return;

    // --- Part 1: Passive Debounced Idle Timeout (120s) ---
    const IDLE_TIMEOUT_MS = 120 * 1000;
    let idleTimer: any = null;

    const handlePlayerIdle = () => {
      console.log("[AFK Engine] User inactive for 120 seconds. Kicking back to lobby...");
      if (typeof window !== 'undefined') {
        localStorage.setItem('gartic_afk_kicked', 'true');
      }
      onLeave?.();
    };

    // Resets the silent 120s idle timer
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(handlePlayerIdle, IDLE_TIMEOUT_MS);
    };

    // Attach lightweight event listeners
    const interactionEvents = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'];
    const handleInteraction = () => {
      resetIdleTimer();
    };

    interactionEvents.forEach(event => {
      window.addEventListener(event, handleInteraction, { passive: true });
    });

    // Start initial timer
    resetIdleTimer();

    // --- Part 2: Smart Visibility Sensor & Timer Drift Fix ---
    const GRACE_PERIOD_MS = 15 * 1000;
    let visibilityTimer: any = null;
    let lastHiddenTime = 0;
    let hasEmittedAway = false;

    const handleVisibilityChange = () => {
      const state = document.visibilityState;
      console.log(`[Visibility Engine] Page visibility changed: ${state}`);

      if (state === 'hidden') {
        // Page hidden: start background hide timestamp & 15s grace period
        lastHiddenTime = Date.now();
        hasEmittedAway = false;

        if (visibilityTimer) clearTimeout(visibilityTimer);
        visibilityTimer = setTimeout(() => {
          if (document.visibilityState === 'hidden' && !hasEmittedAway) {
            console.log("[Visibility Engine] User hidden for > 15s. Emitting away to server.");
            socket.emit('player_away');
            hasEmittedAway = true;
          }
        }, GRACE_PERIOD_MS);

      } else if (state === 'visible') {
        // Page returned/visible: calculate time drift
        if (lastHiddenTime > 0) {
          const delta = Date.now() - lastHiddenTime;
          console.log(`[Visibility Engine] User returned after hidden for ${delta}ms`);
          
          // Timer Drift protection: systems sleep JS engines in bg.
          // If we was away more than 15s, but system suspends prevented the setTimeout
          // from firing, emit it now retrospectively to keep the server/chat sync accurate.
          if (delta >= GRACE_PERIOD_MS && !hasEmittedAway) {
            console.log("[Visibility Engine] User was hidden for >15s (retrospective drift). Emitting away.");
            socket.emit('player_away');
            hasEmittedAway = true;
          }
          
          lastHiddenTime = 0;
        }

        // Cancel background timer as the user is visible now
        if (visibilityTimer) {
          clearTimeout(visibilityTimer);
          visibilityTimer = null;
        }

        // Active return: reset we idle timer to start fresh 120s from now
        resetIdleTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // --- Cleanup function to prevent memory leaks ---
    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (visibilityTimer) clearTimeout(visibilityTimer);
      
      interactionEvents.forEach(event => {
        window.removeEventListener(event, handleInteraction);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [socket, onLeave]);

  // --- Block 1: Handle Room Join & Rejoin based on (Re)connection status ---
  useEffect(() => {
    if (!socket || !isConnected) return;
    
    console.log('[GameRoom] Connection active, sending join_room:', room, 'with playerId:', persistentPlayerId, 'socket:', socket.id);
    socket.emit('join_room', {
      roomId: room,
      nickname,
      avatar: avatar || nickname.charAt(0).toUpperCase(),
      playerId: persistentPlayerId
    }, (res: any) => {
      if (res && res.success) {
        console.log('[GameRoom] Successfully joined/reconnected room, requesting pull sync...');
        socket.emit('request_round_sync');
      }
    });
  }, [socket, isConnected, room, nickname, avatar, persistentPlayerId]);

  // --- Block 2: Register Persistent Socket Listeners ---
  useEffect(() => {
    if (!socket) return;

    const onRoomStateUpdate = (state: { roomId: string, players: any[], gameState: any }) => {
      const isActiveRound = state.gameState?.status === 'DRAWING' || state.gameState?.status === 'CHOOSING';
      const players = state.players.map(p => ({
        id: p.id,
        name: p.name,
        points: p.score || 0,
        wins: p.wins || 0,
        isCurrent: isActiveRound && state.gameState?.currentDrawerId === (p.persistentId || p.id),
        isOffline: p.isOffline || false,
        avatar: p.avatar,
        isEmpty: false,
        persistentId: p.persistentId
      })).sort((a, b) => b.points - a.points);
      
      setCurrentPlayers(players);
      if (state.gameState) {
        setGameState(state.gameState);
      }
    };

    const onTimerTick = (data: { timeLeft: number, status: string }) => {
      setGameState(prev => ({
        ...prev,
        timeLeft: data.timeLeft,
        status: data.status
      }));
    };

    const onReceiveMessage = (msg: any) => {
      setChatMessages((prev) => {
        const updated = [...prev, {
          ...msg,
          isSelf: msg.senderId === socket.id
        }];
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
        const updated = [...prev, {
          ...msg,
          isSelf: msg.senderId === socket.id
        }];
        return updated.slice(-40);
      });
      
      if (msg.subType === 'hit') {
         if (msg.senderId === socket.id) {
             setShowCorrectAnimation(true);
             setTimeout(() => setShowCorrectAnimation(false), 1200);
         }
         
         const hitId = Date.now().toString() + Math.random().toString();
         setHitNotifications(prev => {
            const next = [...prev, { id: hitId, name: msg.sender }];
            return next.slice(-20); // allow up to 20 notifications at once for larger rooms
         });
         
         setTimeout(() => {
             setHitNotifications(prev => prev.filter(n => n.id !== hitId));
         }, 4500);
      }
    };

    socket.on('room_state_update', onRoomStateUpdate);
    socket.on('receive_message', onReceiveMessage);
    socket.on('receive_guess', onReceiveGuess);
    socket.on('timer_tick', onTimerTick);
    socket.on('draw_history_sync', setSyncHistory);

    return () => {
      socket.off('room_state_update', onRoomStateUpdate);
      socket.off('receive_message', onReceiveMessage);
      socket.off('receive_guess', onReceiveGuess);
      socket.off('timer_tick', onTimerTick);
      socket.off('draw_history_sync', setSyncHistory);
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
      setLockedHeight(currentHeight);
      setViewportOffsetTop(window.visualViewport.offsetTop || 0);

      if (currentHeight > currentMax) {
        currentMax = currentHeight;
        setMaxViewportHeight(currentMax);
      }
      
      // True if height shrunk significantly
      const isKeyboardShowing = currentHeight < currentMax - 150;
      setIsKeyboardOpen(isKeyboardShowing);

      // Force no scroll
      window.scrollTo(0, 0);

      if (isKeyboardShowing && (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA')) {
        // The user wants chat popup not to trigger morph, but we haven't isolated the chat popup input yet.
        // For now, any keyboard presence will trigger the layout mode. We'll handle isolation later.
      } else if (!isKeyboardShowing && (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA')) {
          (document.activeElement as HTMLElement).blur();
      }
    };

    const handleScroll = () => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        window.scrollTo(0, 0);
      }
    };

    window.addEventListener('scroll', handleScroll);

    if (window.visualViewport) {
      setLockedHeight(window.visualViewport.height);
      setViewportOffsetTop(window.visualViewport.offsetTop || 0);
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  const isInputDisabled = 
    gameState.status === 'WAITING' || 
    gameState.status === 'ROUND_END' || 
    gameState.status === 'PODIUM' || 
    gameState.status === 'CHOOSING' || 
    amIDrawer || 
    gameState.correctGuessers?.includes(socketId || '');

  useEffect(() => {
    if (isInputDisabled) {
      setIsInputFocused(false);
      if (guessInputRef.current) {
        guessInputRef.current.blur();
      }
    }
  }, [isInputDisabled]);

  const handleGuessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessInput.trim() || gameState.correctGuessers?.includes(socketId || '') || amIDrawer) return;
    
    socket?.emit('submit_guess', { guess: guessInput.trim() });
    setGuessInput('');
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    
    socket.emit('send_message', { text: chatInput.trim() });
    
    setChatInput('');
    const textarea = document.getElementById('chat-textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.style.height = '40px';
    }
  };

  const handleSkipTurn = () => {
    if (document.activeElement instanceof HTMLElement) {
       document.activeElement.blur();
    }
    socket?.emit('skip_turn');
    setShowSkipConfirm(false);
  };

  const handleWordSelect = (word: string) => {
    socket?.emit('select_word', { word });
  };

  const renderWordOverlay = (isFullScreenMode: boolean = false) => {
     if (gameState.status !== 'DRAWING') return null;
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
                     <div className="flex gap-1 sm:gap-1.5 items-end mt-1 sm:mt-2" style={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        {gameState.currentWord.split('').map((char: string, i: number) => {
                           if (char === ' ') return <span key={`space-${i}`} className="w-3" />;
                           const isRevealed = (gameState.revealedIndices || []).includes(i);
                           return (
                              <div key={`char-${i}`} className="relative flex flex-col items-center justify-end h-6 sm:h-8">
                                 <span className={`text-lg sm:text-2xl leading-none font-black absolute bottom-1.5 ${isRevealed ? 'text-[#FBBF24] drop-shadow-md' : 'text-slate-400/40'}`}>
                                    {char}
                                 </span>
                                 <div className={`w-3 sm:w-5 h-[3px] rounded-full mt-auto ${hintsUsed >= 1 ? 'bg-[#FBBF24] shadow-[0_0_5px_rgba(251,191,36,0.5)]' : 'bg-slate-300/80 shadow-sm'}`} />
                              </div>
                           );
                        })}
                     </div>
                  );
               } else {
                  if (!maskedArray || maskedArray.length === 0) return null;
                  const fullWordStr = maskedArray.map((m: any) => m.char || '').join('');
                  const isRTL = /[\u0600-\u06FF]/.test(fullWordStr || gameState.currentWord || '');
                  
                  return (
                     <div className="flex gap-1 sm:gap-1.5 items-end mt-1 sm:mt-2" style={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        {maskedArray.map((item: any, i: number) => {
                           if (item.isSpace) return <span key={`space-${i}`} className="w-3" />;
                           return (
                              <div key={`char-${i}`} className="relative flex flex-col items-center justify-end h-6 sm:h-8">
                                 <span className="text-lg sm:text-2xl leading-none font-black absolute bottom-1.5 text-[#FBBF24] drop-shadow-md">
                                    {item.char || ''}
                                 </span>
                                 <div className={`w-3 sm:w-5 h-[3px] rounded-full mt-auto ${hintsUsed >= 1 ? 'bg-[#FBBF24] shadow-[0_0_5px_rgba(251,191,36,0.5)]' : 'bg-slate-300/80 shadow-sm'}`} />
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
    return { id: `empty-${index}`, name: 'Empty', points: null, isCurrent: false, isEmpty: true };
  });

  const morphMode = isInputFocused;

  const getMaxTime = () => {
    switch (gameState.status) {
      case 'DRAWING': 
      case 'CHOOSING': return 100;
      case 'ROUND_END': return 8;
      case 'PODIUM': return 15;
      default: return 15;
    }
  };
  const timerPercentage = Math.max(0, Math.min(100, (gameState.timeLeft / getMaxTime()) * 100));

  const getCurrentDrawerName = () => {
    const player = currentPlayers.find(p => p.persistentId === gameState.currentDrawerId || p.id === gameState.currentDrawerId);
    return player ? player.name : '';
  };

  return (
    <>
      <div 
        className="fixed top-0 left-0 right-0 grid w-full bg-[#1A103C] font-sans overflow-hidden overscroll-none touch-none"
        style={{ 
          height: isChatOpen ? (maxViewportHeight ? `${maxViewportHeight}px` : '100dvh') : (lockedHeight ? `${lockedHeight}px` : '100dvh'),
          gridTemplateColumns: 'minmax(0, 35%) minmax(0, 65%)',
          gridTemplateRows: 'auto minmax(0, 1fr)'
        }}
      >
        {/* Global Exit Room Button */}
        <button 
          onClick={() => setShowExitConfirm(true)}
          className="absolute top-4 right-4 z-[120] text-gray-800 hover:text-gray-950 transition-colors bg-transparent outline-none"
          title="الخروج من الغرفة"
        >
          <X size={32} strokeWidth={3} />
        </button>

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
                        <span className="text-[#FFEB3B] font-black text-xl tracking-wider" style={{ WebkitTextStroke: '1px #0A2540' }}>EXIT</span>
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
                    <span className="text-[#0A2540] font-black text-lg">NO</span>
                  </button>
                  <button 
                    onClick={() => {
                        socket?.emit('leave_room', { roomId: room });
                        onLeave?.();
                    }}
                    className="flex-1 h-14 bg-[#FFB300] border-[3px] border-[#0A2540] rounded-full flex items-center justify-center gap-2 shadow-[0_4px_0_#0A2540] active:translate-y-1 active:shadow-[0_0px_0_#0A2540] transition-all"
                  >
                    <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[#FFB300] border-2 border-[#0A2540]">
                       <Check size={14} strokeWidth={4} />
                    </div>
                    <span className="text-[#0A2540] font-black text-lg">YES</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        
      {/* Drawing Mode View (Full Screen for Drawer) */}
      {isDrawingMode && (
        <div 
          className="fixed inset-0 z-[100] bg-white flex flex-col transition-opacity duration-300 opacity-100"
        >
          {renderWordOverlay(true)}
          <DrawingBoard 
            key={`full-${drawerPersistentId}`}
            readOnly={false}
            historySyncCommands={syncHistory}
            onSkipTurn={gameState.status === 'DRAWING' ? () => setShowSkipConfirm(true) : undefined}
            onRequestHint={gameState.status === 'DRAWING' ? () => socket?.emit('request_hint') : undefined}
            timerPercentage={timerPercentage}
            timerBarNode={<SmoothTimer gameState={gameState} maxTime={getMaxTime()} isFullScreen={true} />}
            hintsRemaining={
              (() => {
                const word = gameState.currentWord || '';
                const charCount = word.replace(/\s/g, '').length;
                let maxHints = charCount < 3 ? 1 : 2;
                if (charCount >= 5) maxHints = 3;
                return Math.max(0, maxHints - (gameState.hintsUsed || 0));
              })()
            }
          />
          
          {/* Hit Notifications Overlay */}
          <div className="absolute bottom-[90px] sm:bottom-[100px] left-1/2 -translate-x-1/2 z-[110] flex flex-col justify-end items-center pointer-events-none gap-0.5 overflow-visible h-auto max-h-56 w-full max-w-full">
             <AnimatePresence>
                {hitNotifications.map((hit) => (
                   <motion.div
                      layout
                      key={hit.id}
                      initial={{ opacity: 0, scale: 0.6, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.6, y: -10, transition: { duration: 0.3 } }}
                      transition={{ duration: 0.4, type: "spring", bounce: 0.4 }}
                      style={{ textShadow: '1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 0 2px 4px rgba(255,255,255,0.8)' }}
                      className="flex items-center justify-center gap-1.5 text-[#10B981] font-bold text-[15px] whitespace-nowrap bg-transparent"
                      dir="ltr"
                   >
                      <Check size={16} strokeWidth={4} />
                      <span className="truncate max-w-[150px] sm:max-w-[200px] text-center" dir="ltr">{hit.name}</span>
                      <span>hit!</span>
                   </motion.div>
                ))}
             </AnimatePresence>
          </div>
        </div>
      )}

      {/* Top Area (Drawing / Waiting) */}
      <div className={`relative flex flex-col shrink-0 overflow-hidden bg-[#1A103C]
                      ${morphMode ? 'col-start-2 col-end-3 row-start-1 row-end-2' : 'col-start-1 col-end-3 row-start-1 row-end-2'}
                     `}>
        <div className="w-full aspect-[4/3] bg-white shrink-0 flex flex-col items-center justify-center overflow-hidden relative">
          
          {/* Hint/Word Overlay Overlay */}
          {renderWordOverlay()}

          <DrawingBoard 
            key={drawerPersistentId}
            readOnly={!amIDrawer}
            historySyncCommands={syncHistory}
            timerPercentage={timerPercentage}
          />
          
          {/* Correct Guess Animation */}
          {showCorrectAnimation && (
            <div className="absolute inset-0 pointer-events-none z-[60] flex items-center justify-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.2, 1, 1, 1.1, 0] }}
                transition={{ 
                  duration: 1, 
                  times: [0, 0.2, 0.3, 0.75, 0.85, 1],
                  ease: ["easeOut", "easeInOut", "linear", "easeInOut", "easeIn"]
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
                       opacity: [0, 0, 1, 1, 0]
                    }}
                    transition={{
                       duration: 1,
                       times: [0, 0.15, 0.3, 0.85, 1],
                       ease: "linear"
                    }}
                  />
                </motion.svg>
              </motion.div>
            </div>
          )}

          {/* Overlays for WAITING state */}
          {gameState.status === 'WAITING' && (
             <div className="absolute inset-0 z-[40] flex flex-col items-center justify-center bg-white pointer-events-none p-4 select-none font-sans">
                <div className="text-center animate-in fade-in zoom-in-95 duration-300 w-full max-w-sm">
                   <div className="mb-4">
                      <span className="text-[#0B2E5C] text-2xl sm:text-4xl font-black tracking-wide uppercase drop-shadow-[0_2px_0_rgb(251,191,36)] px-5 py-2">
                        WAITING
                      </span>
                   </div>
                   <div className="relative w-24 h-24 sm:w-28 sm:h-28 mb-5 mx-auto bg-sky-100 rounded-full flex items-center justify-center border-4 border-[#0B2E5C]/10 shadow-inner">
                     <span className="text-5xl sm:text-6xl animate-pulse">⏳</span>
                     <span className="absolute -top-1 -right-1 text-2.5xl animate-bounce">⏰</span>
                   </div>
                   <p className="text-[#728299] text-base sm:text-lg font-extrabold tracking-wide">Waiting for players</p>
                </div>
             </div>
          )}

           {/* Overlays for CHOOSING state (non-drawer) */}
           {gameState.status === 'CHOOSING' && !amIDrawer && (
              <div className="absolute inset-0 z-[40] flex flex-col items-center justify-center bg-white pointer-events-none p-4 select-none font-sans">
                 <div className="text-center animate-in fade-in zoom-in-95 duration-300 w-full max-w-sm">
                    <div className="mb-4">
                       <span className="text-[#0B2E5C] text-2xl sm:text-4xl font-black tracking-wide uppercase drop-shadow-[0_2px_0_rgb(251,191,36)] px-5 py-2">
                         NEW TURN!
                       </span>
                    </div>
                    
                    {/* Avatar element */}
                    <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto bg-[#F8FAFC] border-[5px] border-[#0A2540] rounded-full flex items-center justify-center shadow-lg mb-4 relative overflow-visible">
                       <span className="text-4xl sm:text-5xl">{currentPlayers.find(p => p.persistentId === gameState.currentDrawerId || p.id === gameState.currentDrawerId)?.avatar}</span>
                       <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#FBBF24] rounded-full flex items-center justify-center shadow border-2 border-[#0A2540]">
                         <span className="text-xs">✏️</span>
                       </div>
                    </div>

                    <p className="text-[#728299] text-sm sm:text-base font-extrabold mb-0.5">It's the turn of</p>
                    <h3 className="text-[#0B2E5C] font-black text-xl sm:text-2xl tracking-wide">{getCurrentDrawerName()}</h3>
                 </div>
              </div>
           )}

          {/* Overlays for ROUND_END state */}
          {gameState.status === 'ROUND_END' && (() => {
             const reason = gameState.roundEndReason;
             const word = gameState.roundEndWord || '';
             const isDrawer = amIDrawer;
             const drawerName = getCurrentDrawerName() || 'الرسام';
             const hasSucceeded = (gameState.correctGuessers || []).length > 0;

             // 1. SKIPPED STATE
             if (reason === 'skipped') {
                return (
                   <div className="absolute inset-0 z-[40] flex flex-col items-center justify-center bg-white pointer-events-none p-4 select-none font-sans">
                      <div className="text-center animate-in fade-in zoom-in-95 duration-300 w-full max-w-sm">
                         <div className="mb-4">
                            <span className="text-[#0B2E5C] text-2xl sm:text-4xl font-black tracking-wide uppercase drop-shadow-[0_2px_0_rgb(251,191,36)] px-5 py-2">
                              SKIPPED!
                            </span>
                         </div>
                         
                         <div className="relative w-24 h-24 sm:w-28 sm:h-28 mb-5 mx-auto bg-green-50 rounded-full flex items-center justify-center border-4 border-green-100 shadow-sm">
                           <span className="text-5xl sm:text-6xl animate-bounce">✏️</span>
                           <span className="absolute -bottom-1 -right-1 text-2xl animate-spin">💫</span>
                         </div>
                         
                         <h3 className="text-[#0A2540] font-black text-lg sm:text-xl tracking-wide mb-1" dir="auto">
                           {isDrawer ? "You've skipped the turn" : `${drawerName} skipped the turn`}
                         </h3>
                      </div>
                   </div>
                );
             }

             // 2. TURN LOST / INACTIVE STATE
             if (reason === 'turn_lost') {
                return (
                   <div className="absolute inset-0 z-[40] flex flex-col items-center justify-center bg-white pointer-events-none p-4 select-none font-sans">
                      <div className="text-center animate-in fade-in zoom-in-95 duration-300 w-full max-w-sm">
                         <div className="mb-4">
                            <span className="text-[#0B2E5C] text-2xl sm:text-4xl font-black tracking-wide uppercase drop-shadow-[0_2px_0_rgb(251,191,36)] px-5 py-2">
                              INACTIVE
                            </span>
                         </div>
                         
                         <div className="relative w-24 h-24 sm:w-28 sm:h-28 mb-5 mx-auto bg-amber-50 rounded-full flex items-center justify-center border-4 border-amber-100 shadow-sm">
                           <span className="text-5xl sm:text-6xl animate-pulse">💤</span>
                           <span className="absolute -bottom-1 -right-1 text-2.5xl">⏰</span>
                         </div>
                         
                         <h3 className="text-[#0A2540] font-black text-lg sm:text-xl tracking-wide mb-1" dir="auto">
                           {isDrawer ? "You've lost your turn :(" : `${drawerName} has lost the turn`}
                         </h3>
                      </div>
                   </div>
                );
             }

             // 3. INTERVAL / STANDARD ROUND END (timeout, all_guessed, drawer_left)
             let topHeader = "INTERVAL";
             let statusMessage = "Take a while to relax";

             if (reason === 'all_guessed') {
                statusMessage = "Everybody hit the answer!";
             } else if (reason === 'timeout' || reason === 'drawer_left') {
                statusMessage = hasSucceeded ? "Take a while to relax" : "Nobody hit the answer :(";
             }

             return (
                <div className="absolute inset-0 z-[40] flex flex-col items-center justify-center bg-white pointer-events-none p-4 select-none font-sans">
                   <div className="text-center animate-in fade-in zoom-in-95 duration-300 w-full max-w-sm">
                      <div className="mb-3">
                         <span className="text-[#0B2E5C] text-2xl sm:text-4xl font-black tracking-wide uppercase drop-shadow-[0_2px_0_rgb(251,191,36)] px-5 py-2">
                           {topHeader}
                         </span>
                      </div>
                      
                      <p className="text-[#728299] text-sm sm:text-base font-extrabold mb-4" dir="auto">{statusMessage}</p>

                      <div className="relative w-24 h-24 sm:w-28 sm:h-28 mb-4 mx-auto bg-sky-50 rounded-full flex items-center justify-center border-4 border-sky-150 shadow-sm">
                        <span className="text-5xl sm:text-6xl animate-bounce">🎨</span>
                        <span className="absolute -top-1 -right-1 text-2.5xl">✨</span>
                      </div>
                      
                      {word && (
                         <div className="mt-2 text-center">
                            <span className="text-[#728299] text-xs sm:text-sm font-bold block mb-1">The answer was:</span>
                            <span className="text-[#0B2E5C] text-xl sm:text-2xl font-black tracking-wide inline-block bg-[#F1F5F9] border-2 border-slate-200/60 px-5 py-1 rounded-full shadow-inner" dir="auto">
                               {word}
                            </span>
                         </div>
                      )}
                   </div>
                </div>
             );
          })()}

          {/* Overlays for PODIUM state */}
          {gameState.status === 'PODIUM' && (() => {
             const sorted = [...currentPlayers].sort((a, b) => (b.points || 0) - (a.points || 0)).filter(p => !p.isEmpty);
             const first = sorted[0];
             const second = sorted[1];
             const third = sorted[2];
             
             return (
               <div id="podium-overlay" className="absolute inset-0 z-[50] flex flex-col bg-white p-4 sm:p-6 font-sans select-none animate-in fade-in duration-300 overflow-hidden">
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
                         <div id="podium-second" className="flex flex-col items-center animate-in slide-in-from-bottom-8 duration-700 relative w-14 sm:w-20 mt-4">
                            <div className="relative">
                               <div className="relative p-1 bg-gradient-to-r from-slate-400 via-slate-100 to-slate-400 rounded-full shadow-[0_8px_20px_rgba(148,163,184,0.4)] border border-slate-500 overflow-hidden">
                                  <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center text-slate-700 font-extrabold text-xl sm:text-3xl border-4 border-white shadow-inner relative overflow-hidden font-sans">
                                    <span className="drop-shadow-sm">{second.avatar}</span>
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
                         <div id="podium-first" className="flex flex-col items-center animate-in slide-in-from-bottom-12 duration-1000 relative w-16 sm:w-24 z-10">
                            <div className="relative overflow-visible">
                               <div className="relative p-1 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 rounded-full shadow-[0_12px_28px_rgba(245,158,11,0.5)] border border-amber-600 overflow-hidden">
                                  <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-yellow-50 to-amber-100 flex items-center justify-center text-amber-900 font-extrabold text-2xl sm:text-4xl border-4 border-white shadow-inner relative overflow-hidden font-sans">
                                    <span className="drop-shadow-sm">{first.avatar}</span>
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
                         <div id="podium-third" className="flex flex-col items-center animate-in slide-in-from-bottom-6 duration-500 relative w-14 sm:w-20 mt-4">
                            <div className="relative">
                               <div className="relative p-1 bg-gradient-to-r from-orange-700 via-orange-500 to-orange-800 rounded-full shadow-[0_8px_20px_rgba(194,65,12,0.35)] border border-orange-900 overflow-hidden">
                                  <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center text-orange-950 font-extrabold text-xl sm:text-3xl border-4 border-white shadow-inner relative overflow-hidden font-sans">
                                     <span className="drop-shadow-sm">{third.avatar}</span>
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
        <SmoothTimer gameState={gameState} maxTime={getMaxTime()} isFullScreen={false} />
      </div>

      {/* Left: Players Sidebar */}
      <div className={`flex flex-col border-r border-[#00D9FF]/20 bg-[#24174D] overflow-y-auto overscroll-contain touch-pan-y
                      ${morphMode ? 'col-start-1 col-end-2 row-start-1 row-end-3' : 'col-start-1 col-end-2 row-start-2 row-end-3'}
                     `}>
          {slots.map((slot) => {
            const isDrawer = slot.isCurrent;
            const isCorrectGuesser = !slot.isEmpty && gameState.status === 'DRAWING' && gameState.correctGuessers?.includes(slot.id);
            
            let bgClass = '';
            let borderClass = 'border-[#94A3B8]'; // Slate-400 for good visibility default
            let nameClass = 'text-white';
            let ptsClass = 'text-[#7C4DFF]';

            if (isDrawer) {
               bgClass = 'bg-[#00D9FF]/10'; // Cyan bg
               borderClass = 'border-[#00D9FF]'; // Cyan border
               nameClass = 'text-[#00D9FF]';
               ptsClass = 'text-[#00D9FF]';
            } else if (isCorrectGuesser) {
               bgClass = 'bg-[#10B981]/15'; // Greenish bg
               borderClass = 'border-[#10B981]'; // Green border
               nameClass = 'text-[#34D399]';
               ptsClass = 'text-[#34D399]';
            } else if (!slot.isEmpty) {
               borderClass = 'border-[#94A3B8]'; // Slate 400 default
            }

            return (
              <motion.div 
                layout="position" // Only animate positional changes (reordering) to avoid height morphing delay
                transition={{ type: "tween", duration: 0.15 }}
                key={slot.id} 
                className={`flex items-center p-2 sm:p-4 border-b border-[#00D9FF]/10 h-[65px] sm:h-[80px] shrink-0 transition-colors duration-200 ${bgClass}`}
              >
                {/* Avatar */}
                <div className="relative shrink-0 mr-2 sm:mr-3">
                   <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-[3px] transition-colors duration-200
                     ${slot.isEmpty ? 'bg-black/20 border-white/10' : `bg-[#1A103C] ${borderClass}`}`}>
                     {slot.isEmpty ? (
                       <UserIcon size={20} className="text-white/30" />
                     ) : (
                       <span className="text-2xl sm:text-3xl translate-y-[1px]">{slot.avatar}</span>
                     )}
                   </div>
                   
                   {/* Role/Status Icon */}
                   {!slot.isEmpty && isCorrectGuesser && (
                     <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-[#10B981] rounded-full border-2 border-[#1A103C] flex items-center justify-center shadow-sm z-10 transition-transform scale-in">
                        <Check size={10} strokeWidth={4} className="text-white" />
                     </div>
                   )}
                   {!slot.isEmpty && isDrawer && !isCorrectGuesser && (
                     <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-[#00D9FF] rounded-full border-2 border-[#1A103C] flex items-center justify-center shadow-sm z-10">
                        <Pencil size={10} strokeWidth={3} className="text-[#1A103C]" />
                     </div>
                   )}
                </div>
                
                {/* Info */}
                <div className="flex flex-col justify-center overflow-hidden">
                   <span className={`font-bold flex items-center gap-1 text-[12px] sm:text-[15px] truncate max-w-full transition-colors duration-200
                     ${slot.isEmpty ? 'text-white/40' : nameClass}`}>
                     <span className="truncate">{slot.name}</span>
                     {(slot.wins ?? 0) > 0 && (
                       <span className="text-yellow-500 scale-110 shrink-0" title={`${slot.wins} Wins`}>🏆 {slot.wins}</span>
                     )}
                   </span>
                   {!slot.isEmpty && (
                     <span className={`text-[11px] sm:text-[13px] font-bold transition-colors duration-200 ${ptsClass}`}>{slot.points} pts</span>
                   )}
                </div>
              </motion.div>
            );
          })}
      </div>

      {/* Right: Actions & Guess Input */}
      <div className={`flex flex-col bg-[#1A103C] relative overflow-hidden
                      ${morphMode ? 'col-start-2 col-end-3 row-start-2 row-end-3' : 'col-start-2 col-end-3 row-start-2 row-end-3'}
                     `}>
           
           {/* Actions Bar */}
           <div className={`grid transition-all duration-150 ease-in-out shrink-0 bg-[#24174D]
                          ${isInputFocused ? 'grid-rows-[0fr] opacity-0 border-none' : 'grid-rows-[1fr] opacity-100 border-b border-[#00D9FF]/10'}`}>
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
                 <button onClick={openChat} className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl bg-yellow-400 hover:bg-yellow-500 active:scale-95 flex items-center justify-center text-[#1A103C] font-bold transition-all shadow-md relative">
                   <MessageSquare size={16} />
                   {unreadCount > 0 && (
                     <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] sm:text-[11px] font-bold px-1 py-0.5 rounded-full shadow-md border-2 border-slate-200">
                       {unreadCount > 9 ? '+9' : unreadCount}
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
                 const isSystem = msg.type === 'system';
                 if (isSystem) {
                   const subType = (msg as any).subType || '';
                   const text = msg.text;

                   // Hit / guessed correctly
                   if (subType === 'hit') {
                     const isSelfGuesser = msg.senderId === socketId;
                     const displayWord = (msg as any).word || '';
                     const displayText = isSelfGuesser 
                       ? `You've found the answer: ${displayWord}` 
                       : `${msg.sender || text.replace(' guessed the word!', '')} hit!`;

                     return (
                       <div key={msg.id} className="flex items-center gap-2 text-[#10B981] font-bold text-xs sm:text-sm py-0.5 animate-in fade-in slide-in-from-left-2 duration-200">
                         <Check size={14} className="stroke-[3.5] text-[#10B981] shrink-0" />
                         <span dir="auto">{displayText}</span>
                       </div>
                     );
                   }

                   // Round End break / Interval
                   if (subType === 'interval') {
                     return (
                       <div key={msg.id} className="flex items-center gap-2 text-[#60A5FA] font-bold text-xs sm:text-sm py-0.5 animate-in fade-in slide-in-from-left-2 duration-200">
                         <Clock size={14} className="text-[#60A5FA] shrink-0" />
                         <span>Interval...</span>
                       </div>
                     );
                   }

                   // Turn change
                   if (subType === 'turn') {
                     return (
                       <div key={msg.id} className="flex items-center gap-2 text-[#60A5FA] font-bold text-xs sm:text-sm py-0.5 animate-in fade-in slide-in-from-left-2 duration-200">
                         <Pencil size={12} className="text-[#60A5FA] shrink-0" />
                         <span dir="auto">{text}</span>
                       </div>
                     );
                   }

                   // Game over
                   if (subType === 'game_over') {
                     return (
                       <div key={msg.id} className="flex items-start gap-2 text-[#60A5FA] font-bold text-xs sm:text-sm py-1 animate-in fade-in slide-in-from-left-2 duration-200">
                         <Info size={14} className="text-[#60A5FA] shrink-0 mt-0.5" />
                         <span dir="auto">{text}</span>
                       </div>
                     );
                   }

                   // Everybody hit
                   if (subType === 'all_guessed') {
                     return (
                       <div key={msg.id} className="flex items-center gap-2 text-[#10B981] font-bold text-xs sm:text-sm py-0.5 animate-in fade-in slide-in-from-left-2 duration-200">
                         <Check size={14} className="stroke-[3.5] text-[#10B981] shrink-0" />
                         <span>Everybody hit the answer!</span>
                       </div>
                     );
                   }

                   // Lost turn / Inactive
                   if (subType === 'lost_turn' || text.toLowerCase().includes('lost the turn') || text.toLowerCase().includes('lost your turn')) {
                     const isDrawerSelf = amIDrawer;
                     const displayText = isDrawerSelf ? "You've lost your turn" : text;
                     return (
                       <div key={msg.id} className="flex items-center gap-2 text-[#EF4444] font-bold text-xs sm:text-sm py-0.5 animate-in fade-in slide-in-from-left-2 duration-200">
                         <AlertTriangle size={14} className="text-[#EF4444] shrink-0" />
                         <span dir="auto">{displayText}</span>
                       </div>
                     );
                   }

                   // Other reveals
                   let iconNode = <Info size={14} className="shrink-0 text-[#60A5FA]" />;
                   let textColor = '#60A5FA';

                   if (text.toLowerCase().includes('hit') || text.toLowerCase().includes('guessed') || text.toLowerCase().includes('guessed the word')) {
                     iconNode = <Check size={14} className="stroke-[3.5] text-[#10B981] shrink-0" />;
                     textColor = '#10B981';
                   } else if (text.toLowerCase().includes('turn')) {
                     iconNode = <Pencil size={12} className="shrink-0 text-[#60A5FA]" />;
                     textColor = '#60A5FA';
                   } else if (text.toLowerCase().includes('interval')) {
                     iconNode = <Clock size={14} className="shrink-0 text-[#60A5FA]" />;
                     textColor = '#60A5FA';
                   } else if (text.toLowerCase().includes('timeout') || text.toLowerCase().includes('time\'s up') || text.toLowerCase().includes('answer was')) {
                     iconNode = <Pencil size={12} className="shrink-0 text-[#60A5FA]" />;
                     textColor = '#60A5FA';
                   }

                   return (
                     <div key={msg.id} className="flex items-center gap-2 font-bold text-xs sm:text-sm py-0.5" style={{ color: textColor }}>
                       {iconNode}
                       <span dir="auto">{text}</span>
                     </div>
                   );
                 }

                 return (
                   <div key={msg.id} className="text-[12px] sm:text-[14px]">
                     <div className="flex items-start gap-1">
                       <Pencil size={10} className="text-[#00D9FF]/40 shrink-0 mt-1" />
                       <span className="font-bold text-white/50">{msg.sender}:</span>
                       <span className={`${msg.isSelf ? 'text-white' : 'text-slate-300'} break-words`} dir="auto" style={{ unicodeBidi: 'plaintext' }}>{msg.text}</span>
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
               <div className={`absolute left-2.5 top-1/2 -translate-y-1/2 transition-opacity duration-200 ${isInputDisabled ? "text-white/15" : "text-white/50"}`}>
                 <Pencil size={12} />
               </div>
               <input 
                 ref={guessInputRef}
                 type="text"
                 disabled={isInputDisabled} value={isInputDisabled ? "" : guessInput}
                 onChange={(e) => setGuessInput(e.target.value)}
                 onFocus={() => setIsInputFocused(true)}
                 onBlur={() => setIsInputFocused(false)}
                 placeholder={
                    gameState.status === 'WAITING' ? "Waiting..." :
                    gameState.status === 'ROUND_END' ? (gameState.roundEndReason === 'skipped' ? "Skipped" : gameState.roundEndReason === 'turn_lost' ? "Inactive" : "Interval") :
                    gameState.status === 'PODIUM' ? "Game Over" :
                    gameState.status === 'CHOOSING' ? "Waiting for the drawing" :
                    amIDrawer ? "You are drawing!" :
                    gameState.correctGuessers?.includes(socketId || '') ? "You've found the answer!" :
                    "Answer here..."
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
      {isChatOpen && (
         <div 
           className="fixed left-0 right-0 z-50 bg-black/60 flex flex-col justify-end overscroll-none touch-none"
           style={{ 
             top: `${viewportOffsetTop}px`,
             height: lockedHeight ? `${lockedHeight}px` : '100dvh' 
           }}
         >
            
            <div className="w-full h-full flex flex-col">
                {/* Header (Invisible but usable to close if clicking top area) */}
                <div 
                  className="w-full shrink-0 h-16 cursor-pointer" 
                  onClick={closeChat}
                />

                {/* Actual Chat Container */}
                <div 
                  className="w-full flex-1 bg-transparent flex flex-col min-h-0 select-none" 
                  style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                  onContextMenu={(e) => e.preventDefault()}
                  onTouchStart={() => { bgTouchStartTime.current = Date.now(); }}
                  onMouseDown={() => { bgTouchStartTime.current = Date.now(); }}
                  onClick={() => {
                    setActiveCopyId(null);
                    
                    const duration = Date.now() - bgTouchStartTime.current;
                    if (bgTouchStartTime.current > 0 && duration > 300) {
                      bgTouchStartTime.current = 0;
                      return; // It was a long press, do nothing!
                    }
                    bgTouchStartTime.current = 0;

                    const act = document.activeElement;
                    if (act?.tagName === 'INPUT' || act?.tagName === 'TEXTAREA') {
                      (act as HTMLElement).blur();
                    }
                  }}
                >
                  
                  {/* Messages Area */}
                  <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-4 flex flex-col-reverse min-h-0">
                    <div className="flex flex-col-reverse gap-4 max-w-2xl mx-auto w-full">
                     {[...chatMessages].reverse().map(msg => (
                       <ChatMessageItem 
                         key={msg.id} 
                         msg={msg} 
                         activeCopyId={activeCopyId}
                         onSetActiveCopy={setActiveCopyId}
                         mySocketId={socketId}
                       />
                     ))}
                    </div>
                  </div>

                  {/* Input Area */}
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.stopPropagation()}
                    className="p-3 bg-[#24174D]/90 backdrop-blur-md border-t border-white/10 shrink-0 safe-area-bottom z-10 w-full select-auto"
                    style={{ WebkitTouchCallout: 'default', WebkitUserSelect: 'auto', userSelect: 'auto' }}
                  >
                    <form onSubmit={handleChatSubmit} className="relative max-w-2xl mx-auto flex gap-2 items-end">
                      <button 
                        type="button"
                        onClick={closeChat}
                        className="w-10 h-10 shrink-0 flex items-center justify-center border-2 border-white/10 bg-black/20 text-white rounded-xl hover:bg-white/10 transition-colors"
                      >
                        <X size={18} />
                      </button>
                      <textarea
                        id="chat-textarea"
                        value={chatInput}
                        onChange={(e) => {
                          setChatInput(e.target.value);
                          e.target.style.height = 'auto'; 
                          e.target.style.height = `${Math.max(40, e.target.scrollHeight)}px`; 
                        }}
                        dir="auto"
                        rows={1}
                        placeholder="Type your message here..."
                        className="flex-1 w-full min-w-0 min-h-[40px] max-h-[100px] rounded-xl border-2 border-white/10 bg-black/40 px-3 py-2 text-sm text-white font-bold placeholder-white/30 focus:border-[#7C4DFF] outline-none transition-all shadow-inner resize-none overflow-y-auto overscroll-contain touch-pan-y leading-tight select-text"
                        style={{ height: '40px', WebkitTouchCallout: 'default', WebkitUserSelect: 'text', userSelect: 'text' }}
                      />
                      <button 
                        type="submit"
                        onPointerDown={(e) => e.preventDefault()}
                        disabled={!chatInput.trim()} 
                        className="w-10 h-10 shrink-0 flex items-center justify-center text-white disabled:bg-[#7C4DFF]/50 bg-[#7C4DFF] rounded-xl hover:bg-[#6A3DE8] transition-colors shadow-md active:scale-95"
                      >
                        <Send size={16} />
                      </button>
                    </form>
                  </div>

                </div>
            </div>
         </div>
      )}

    {/* Skip Confirm Modal */}
    {showSkipConfirm && (
      <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-[#24174D] p-6 rounded-3xl shadow-2xl flex flex-col items-center border border-white/10 animate-in zoom-in-95 w-full max-w-sm text-center">
          <h3 className="text-white font-bold text-lg mb-2">Skip Turn?</h3>
          <p className="text-white/70 text-sm mb-6">Are you sure you want to skip your turn?</p>
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
    {gameState.status === 'CHOOSING' && amIDrawer && (
       <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 touch-none">
             <div className="text-center w-full max-w-md px-6 animate-in fade-in zoom-in-95 duration-300">
                <h2 className="text-[#FBBF24] text-3xl sm:text-4xl font-black mb-2 drop-shadow-md tracking-wide">IT'S YOUR TURN!</h2>
                <p className="text-white/80 text-lg sm:text-xl mb-12">Choose a word to draw</p>

                {gameState.wordOptions && gameState.wordOptions.length >= 2 && (
                   <div className="space-y-6">
                      <div className="flex flex-col items-center">
                         <span className="text-white text-3xl font-bold mb-4 drop-shadow-lg" dir="auto">{gameState.wordOptions[0]}</span>
                         <button onClick={() => handleWordSelect(gameState.wordOptions[0])} className="w-[85%] max-w-xs bg-[#FBBF24] hover:bg-[#F59E0B] text-[#1A103C] font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-[0_4px_14px_0_rgba(251,191,36,0.39)] active:scale-95 transition-all text-xl">
                            <Pencil fill="currentColor" size={24} />
                            DRAW
                         </button>
                      </div>

                      <div className="flex items-center w-full relative py-2">
                         <div className="flex-1 border-t border-white/20 h-px"></div>
                         <span className="px-4 text-white/50 font-bold bg-transparent text-lg">OR</span>
                         <div className="flex-1 border-t border-white/20 h-px"></div>
                      </div>

                      <div className="flex flex-col items-center">
                         <span className="text-white text-3xl font-bold mb-4 drop-shadow-lg" dir="auto">{gameState.wordOptions[1]}</span>
                         <button onClick={() => handleWordSelect(gameState.wordOptions[1])} className="w-[85%] max-w-xs bg-[#FBBF24] hover:bg-[#F59E0B] text-[#1A103C] font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-[0_4px_14px_0_rgba(251,191,36,0.39)] active:scale-95 transition-all text-xl">
                            <Pencil fill="currentColor" size={24} />
                            DRAW
                         </button>
                      </div>
                   </div>
                )}
             </div>
             
             {/* Timer Bar for Drawer Choosing Screen */}
             <div className="absolute bottom-10 left-0 right-0 w-full px-6 max-w-md mx-auto">
                {<SmoothTimer gameState={gameState} maxTime={getMaxTime()} isFullScreen={true} />}
             </div>
       </div>
    )}

    {/* Dynamic Non-Intrusive Connection Status removed to allow silent background connection */}
    </>
  );
}

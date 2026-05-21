import React, { useState, useEffect } from 'react';
import DrawingBoard from './DrawingBoard';
import { Send, MessageSquare, AlertTriangle, Volume2, Info, X, User as UserIcon, Pencil, Copy, Check, Clock } from 'lucide-react';
import { useSocket } from './SocketProvider';

interface GameRoomProps {
  nickname: string;
  room: string;
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

type PlayerSlot = { id: string; name: string; points: number | null; isCurrent: boolean; isEmpty?: boolean; avatar?: string; wins?: number };

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
    const isTargetingSelf = msg.senderId === mySocketId;
    let text = msg.text;
    if (isTargetingSelf && msg.text.includes('lost the turn')) {
        text = "You've lost your turn";
    } else if (isTargetingSelf && msg.text.includes('skipped the turn')) {
        text = "You've skipped the turn";
    }

    return (
      <div className="flex justify-center mb-2">
        <div 
          className="bg-[#00D9FF]/20 text-[#00D9FF] px-4 py-1.5 rounded-full text-xs font-bold shadow-sm backdrop-blur-md"
          dir="auto"
          style={{ unicodeBidi: 'plaintext' }}
        >
          {text}
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
          <span className="text-[11px] text-[#00D9FF] font-bold mb-1 mr-1">{msg.sender}</span>
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
        <div className="w-8 h-8 rounded-full bg-[#1A103C] border-2 border-[#00D9FF] flex items-center justify-center shrink-0 shadow-lg relative bottom-1">
          <span className="text-[#00D9FF] font-bold text-xs">{msg.avatar}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start items-end gap-2 w-full animate-in slide-in-from-bottom-2 select-none">
      <div className="w-8 h-8 rounded-full bg-[#24174D] border-2 border-[#7C4DFF] flex items-center justify-center shrink-0 shadow-lg relative bottom-1">
        <span className="text-white font-bold text-xs">{msg.avatar || '?'}</span>
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
        <span className={`text-[11px] font-bold mb-1 ml-1 ${getSenderColor(msg.sender)}`}>{msg.sender}</span>
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

export default function GameRoom({ nickname, room }: GameRoomProps) {
  const { socket } = useSocket();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const bgTouchStartTime = React.useRef<number>(0);
  const guessInputRef = React.useRef<HTMLInputElement>(null);
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);
  const [maxViewportHeight, setMaxViewportHeight] = useState<number>(typeof window !== 'undefined' ? window.innerHeight : 800);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeCopyId, setActiveCopyId] = useState<string | null>(null);
  
  const [gameState, setGameState] = useState<any>({
    status: 'WAITING',
    currentDrawerId: null,
    currentWord: null,
    timeLeft: 0,
    wordOptions: []
  });
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
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [currentPlayers, setCurrentPlayers] = useState<PlayerSlot[]>([]);

  useEffect(() => {
    if (!socket) return;
    
    socket.emit('join_room', {
      roomId: room,
      nickname,
      avatar: nickname.charAt(0).toUpperCase()
    });

    const onRoomStateUpdate = (state: { roomId: string, players: any[], gameState: any }) => {
      const players = state.players.map(p => ({
        id: p.id,
        name: p.name,
        points: p.score || 0,
        wins: p.wins || 0,
        isCurrent: state.gameState?.currentDrawerId === p.id,
        avatar: p.avatar,
        isEmpty: false
      }));
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
    };

    socket.on('room_state_update', onRoomStateUpdate);
    socket.on('receive_message', onReceiveMessage);
    socket.on('receive_guess', onReceiveGuess);
    socket.on('timer_tick', onTimerTick);

    return () => {
      socket.emit('leave_room', { roomId: room });
      socket.off('room_state_update', onRoomStateUpdate);
      socket.off('receive_message', onReceiveMessage);
      socket.off('receive_guess', onReceiveGuess);
      socket.off('timer_tick', onTimerTick);
    };
  }, [socket, nickname, room]);

  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    let currentMax = window.visualViewport?.height || window.innerHeight;
    setMaxViewportHeight(currentMax);

    const handleResize = () => {
      if (!window.visualViewport) return;
      
      const currentHeight = window.visualViewport.height;
      setLockedHeight(currentHeight);

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
      window.visualViewport.addEventListener('resize', handleResize);
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, []);

  const isInputDisabled = 
    gameState.status === 'WAITING' || 
    gameState.status === 'ROUND_END' || 
    gameState.status === 'PODIUM' || 
    gameState.status === 'CHOOSING' || 
    gameState.currentDrawerId === socket?.id || 
    gameState.correctGuessers?.includes(socket?.id || '');

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
    if (!guessInput.trim() || gameState.correctGuessers?.includes(socket?.id) || gameState.currentDrawerId === socket?.id) return;
    
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
    setIsDrawingMode(true);
  };

  useEffect(() => {
    if (gameState.status !== 'DRAWING' || gameState.currentDrawerId !== socket?.id) {
       setIsDrawingMode(false);
    }
  }, [gameState.status, gameState.currentDrawerId, socket?.id]);

  const renderWordOverlay = (isFullScreenMode: boolean = false) => {
     if (gameState.status !== 'DRAWING') return null;
     if (gameState.currentDrawerId === socket?.id && !isFullScreenMode) return null;
     return (
        <div className="absolute top-1 sm:top-2 left-0 right-0 flex items-center justify-center z-[150] pointer-events-none drop-shadow-md">
           {(() => {
               const isDrawer = gameState.currentDrawerId === socket?.id;
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

  const renderTimerBar = (isFullScreen: boolean = false) => {
    let timerColorClass = 'bg-[#FBBF24] shadow-[0_0_8px_rgba(251,191,36,0.5)]';
    
    if (gameState.status !== 'DRAWING' && gameState.status !== 'CHOOSING') {
      timerColorClass = 'bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.5)]';
    } else {
      if (timerPercentage <= 20) {
        timerColorClass = 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]';
      } else if (timerPercentage <= 50) {
        timerColorClass = 'bg-[#F97316] shadow-[0_0_8px_rgba(249,115,22,0.5)]';
      }
    }

    return (
      <div className={`w-full px-2 sm:px-3 py-1 shrink-0 flex items-center justify-center ${isFullScreen ? 'bg-transparent' : 'bg-[#1A103C]'}`} dir="ltr">
        <div className="w-full h-1.5 sm:h-2 bg-[#24174D] rounded-full overflow-hidden shadow-inner flex justify-start">
            <div 
              key={gameState.status + (gameState.currentWord || '')}
              className={`h-full rounded-full ${timerColorClass}`}
              style={{ 
                 width: `${timerPercentage}%`,
                 transition: 'width 1s linear, background-color 0.3s ease'
              }}
            />
        </div>
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
      case 'ROUND_END':
      case 'PODIUM': return 15;
      default: return 15;
    }
  };
  const timerPercentage = Math.max(0, Math.min(100, (gameState.timeLeft / getMaxTime()) * 100));

  const getCurrentDrawerName = () => {
    const player = currentPlayers.find(p => p.id === gameState.currentDrawerId);
    return player ? player.name : '';
  };

  return (
    <>
      <div 
        className="fixed top-0 left-0 right-0 grid w-full bg-[#1A103C] font-sans overflow-hidden overscroll-none touch-none"
        style={{ 
          height: isChatOpen ? (maxViewportHeight ? `${maxViewportHeight}px` : '100dvh') : (lockedHeight ? `${lockedHeight}px` : '100dvh'),
          transitionProperty: 'grid-template-columns, grid-template-rows',
          transitionDuration: '300ms',
          transitionTimingFunction: 'ease-in-out',
          gridTemplateColumns: 'minmax(0, 35%) minmax(0, 65%)',
          gridTemplateRows: 'auto minmax(0, 1fr)'
        }}
      >
        
      {/* Drawing Mode View (Full Screen for Drawer) */}
      {isDrawingMode && (
        <div 
          className="fixed inset-0 z-[100] bg-white flex flex-col transition-opacity duration-300 opacity-100"
        >
          {renderWordOverlay(true)}
          <DrawingBoard 
            readOnly={false}
            onSkipTurn={gameState.status === 'DRAWING' ? () => setShowSkipConfirm(true) : undefined}
            onRequestHint={gameState.status === 'DRAWING' ? () => socket?.emit('request_hint') : undefined}
            timerPercentage={timerPercentage}
            timerBarNode={renderTimerBar(true)}
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
        </div>
      )}

      {/* Top Area (Drawing / Waiting) */}
      <div className={`relative flex flex-col shrink-0 overflow-hidden transition-all duration-300 bg-[#1A103C]
                      ${morphMode ? 'col-start-2 col-end-3 row-start-1 row-end-2' : 'col-start-1 col-end-3 row-start-1 row-end-2'}
                     `}>
        <div className="w-full aspect-[4/3] bg-white shrink-0 flex flex-col items-center justify-center transition-all duration-300 overflow-hidden relative">
          
          {/* Hint/Word Overlay Overlay */}
          {renderWordOverlay()}

          <DrawingBoard 
            readOnly={gameState.currentDrawerId !== socket?.id}
            timerPercentage={timerPercentage}
          />
          
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
          {gameState.status === 'CHOOSING' && gameState.currentDrawerId !== socket?.id && (
             <div className="absolute inset-0 z-[40] flex flex-col items-center justify-center bg-white pointer-events-none p-4 select-none font-sans">
                <div className="text-center animate-in fade-in zoom-in-95 duration-300 w-full max-w-sm">
                   <div className="mb-4">
                      <span className="text-[#0B2E5C] text-2xl sm:text-4xl font-black tracking-wide uppercase drop-shadow-[0_2px_0_rgb(251,191,36)] px-5 py-2">
                        NEW TURN!
                      </span>
                   </div>
                   
                   {/* Avatar element */}
                   <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto bg-[#F8FAFC] border-[5px] border-[#0A2540] rounded-full flex items-center justify-center shadow-lg mb-4 relative overflow-visible">
                      <span className="text-4xl sm:text-5xl">{currentPlayers.find(p => p.id === gameState.currentDrawerId)?.avatar}</span>
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
             const isDrawer = gameState.currentDrawerId === socket?.id;
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
               <div className="absolute inset-0 z-[50] flex flex-col bg-white p-4 sm:p-6 font-sans relative select-none">
                 {/* Close button X */}
                 <button 
                   onClick={() => socket?.emit('leave_room', { roomId: room })}
                   className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors z-[60]"
                 >
                    <X size={24} className="stroke-[3.5]" />
                 </button>

                 {/* Title: GAME OVER */}
                 <div className="w-full flex justify-center mt-2 mb-4">
                    <h1 className="text-2xl sm:text-4xl font-black text-[#0B2E5C] tracking-wide uppercase drop-shadow-[0_2px_0_rgba(251,191,36,1)]">
                      GAME OVER
                    </h1>
                 </div>

                 {/* Winners Podium alignments */}
                 <div className="flex-1 flex items-center justify-center">
                    <div className="flex items-end justify-center gap-4 sm:gap-14 w-full max-w-lg mt-2 pb-4">
                       
                       {/* Second Place */}
                       {second ? (
                         <div className="flex flex-col items-center animate-in slide-in-from-bottom-8 duration-700 relative w-16 sm:w-28">
                            <div className="relative">
                               <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-yellow-400/10 border-[5px] border-[#0A2540] flex items-center justify-center text-white font-bold text-2xl sm:text-4xl shadow-md">
                                   <span className="text-3xl sm:text-5xl">{second.avatar}</span>
                               </div>
                               {/* Silver Medal Badge */}
                               <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-gradient-to-b from-slate-100 to-slate-400 border-[3.5px] border-[#0A2540] flex items-center justify-center shadow-md">
                                  <span className="text-[#0A2540] font-black text-xs sm:text-sm">2</span>
                               </div>
                            </div>
                            <span className="text-[#0A2540] font-black text-[13px] sm:text-[16px] mt-4 truncate w-full text-center tracking-wide block">
                               {second.name}
                            </span>
                         </div>
                       ) : (
                         <div className="w-16 sm:w-28" />
                       )}

                       {/* First Place */}
                       {first && (
                         <div className="flex flex-col items-center animate-in slide-in-from-bottom-12 duration-1000 relative w-20 sm:w-32 z-10">
                            <div className="relative overflow-visible">
                               {/* Laurel decorative SVG around the first place avatar */}
                               <svg className="absolute -inset-5 w-[calc(100%+40px)] h-[calc(100%+40px)] text-green-500 pointer-events-none fill-none overflow-visible" viewBox="0 0 120 120">
                                 {/* Left green wreath branch */}
                                 <path 
                                    d="M 32 94 C 18 78 18 48 36 30" 
                                    stroke="#10B981" 
                                    strokeWidth="3.5" 
                                    strokeLinecap="round" 
                                 />
                                 <circle cx="28" cy="85" r="3.5" fill="#10B981" />
                                 <circle cx="21" cy="72" r="3.5" fill="#10B981" />
                                 <circle cx="20" cy="58" r="3.5" fill="#10B981" />
                                 <circle cx="25" cy="44" r="3.5" fill="#10B981" />
                                 <circle cx="33" cy="33" r="3.5" fill="#10B981" />

                                 {/* Right green wreath branch */}
                                 <path 
                                    d="M 88 94 C 102 78 102 48 84 30" 
                                    stroke="#10B981" 
                                    strokeWidth="3.5" 
                                    strokeLinecap="round" 
                                 />
                                 <circle cx="92" cy="85" r="3.5" fill="#10B981" />
                                 <circle cx="99" cy="72" r="3.5" fill="#10B981" />
                                 <circle cx="100" cy="58" r="3.5" fill="#10B981" />
                                 <circle cx="95" cy="44" r="3.5" fill="#10B981" />
                                 <circle cx="87" cy="33" r="3.5" fill="#10B981" />
                               </svg>

                               <div className="w-20 h-20 sm:w-32 sm:h-32 rounded-full bg-yellow-400 border-[6px] border-[#0A2540] flex items-center justify-center text-white font-bold text-3xl sm:text-5xl shadow-lg relative">
                                   <span className="text-4xl sm:text-6xl">{first.avatar}</span>
                               </div>
                               {/* Gold Medal Badge */}
                               <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-8 h-8 sm:w-11 sm:h-11 rounded-full bg-gradient-to-b from-[#FFF099] to-[#FBBF24] border-[4px] border-[#0A2540] flex items-center justify-center shadow-md">
                                  <span className="text-[#0A2540] font-black text-sm sm:text-lg">1</span>
                               </div>
                            </div>
                            <span className="text-[#0A2540] font-black text-[15px] sm:text-[18px] mt-5 truncate w-full text-center tracking-wide block">
                               {first.name}
                            </span>
                         </div>
                       )}

                       {/* Third Place */}
                       {third ? (
                         <div className="flex flex-col items-center animate-in slide-in-from-bottom-6 duration-500 relative w-16 sm:w-28">
                            <div className="relative">
                               <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-yellow-400/10 border-[5px] border-[#0A2540] flex items-center justify-center text-white font-bold text-2xl sm:text-4xl shadow-md">
                                   <span className="text-3xl sm:text-5xl">{third.avatar}</span>
                               </div>
                               {/* Bronze Medal Badge */}
                               <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-gradient-to-b from-amber-200 to-amber-700 border-[3.5px] border-[#0A2540] flex items-center justify-center shadow-md">
                                  <span className="text-[#0A2540] font-black text-xs sm:text-sm">3</span>
                               </div>
                            </div>
                            <span className="text-[#0A2540] font-black text-[13px] sm:text-[16px] mt-4 truncate w-full text-center tracking-wide block">
                               {third.name}
                            </span>
                         </div>
                       ) : (
                         <div className="w-16 sm:w-28" />
                       )}

                    </div>
                 </div>
               </div>
             );
          })()}


        </div>

        {/* Timer Bar */}
        {renderTimerBar()}
      </div>

      {/* Left: Players Sidebar */}
      <div className={`flex flex-col border-r border-[#00D9FF]/20 bg-[#24174D] overflow-y-auto overscroll-contain touch-pan-y transition-all duration-300
                      ${morphMode ? 'col-start-1 col-end-2 row-start-1 row-end-3' : 'col-start-1 col-end-2 row-start-2 row-end-3'}
                     `}>
          {slots.map((slot) => (
            <div 
              key={slot.id} 
              className={`flex items-center p-2 sm:p-4 border-b border-[#00D9FF]/10 h-[65px] sm:h-[80px] shrink-0
                ${slot.isCurrent ? 'bg-[#00D9FF]/10' : ''}`}
            >
              {/* Avatar */}
              <div className="relative shrink-0 mr-2 sm:mr-3">
                 <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-2 
                   ${slot.isEmpty ? 'bg-black/20 border-white/10' : 'bg-[#1A103C] border-[#00D9FF]'}`}>
                   {slot.isEmpty ? (
                     <UserIcon size={20} className="text-white/30" />
                   ) : (
                     <span className="font-bold text-base sm:text-lg text-white">{slot.avatar}</span>
                   )}
                 </div>
                 {slot.isCurrent && (
                   <div className="absolute top-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-yellow-400 rounded-full border border-[#1A103C]" />
                 )}
              </div>
              
              {/* Info */}
              <div className="flex flex-col justify-center overflow-hidden">
                 <span className={`font-bold flex items-center gap-1 text-[12px] sm:text-[15px] truncate max-w-full
                   ${slot.isEmpty ? 'text-white/40' : 'text-white'}`}>
                   <span className="truncate">{slot.name}</span>
                   {(slot.wins ?? 0) > 0 && (
                     <span className="text-yellow-500 scale-110 shrink-0" title={`${slot.wins} Wins`}>🏆 {slot.wins}</span>
                   )}
                 </span>
                 {!slot.isEmpty && (
                   <span className="text-[11px] sm:text-[13px] font-bold text-[#7C4DFF]">{slot.points} pts</span>
                 )}
              </div>
            </div>
          ))}
      </div>

      {/* Right: Actions & Guess Input */}
      <div className={`flex flex-col bg-[#1A103C] relative transition-all duration-300 overflow-hidden
                      ${morphMode ? 'col-start-2 col-end-3 row-start-2 row-end-3' : 'col-start-2 col-end-3 row-start-2 row-end-3'}
                     `}>
           
           {/* Actions Bar */}
           <div className={`grid transition-all duration-300 ease-in-out shrink-0 bg-[#24174D]
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
                     const isSelfGuesser = msg.senderId === socket?.id;
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
                     const isDrawerSelf = gameState.currentDrawerId === socket?.id;
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
               <div className={`absolute left-2.5 top-1/2 -translate-y-1/2 transition-opacity duration-200 ${(gameState.status === 'WAITING' || gameState.status === 'ROUND_END' || gameState.status === 'PODIUM' || gameState.status === 'CHOOSING' || gameState.currentDrawerId === socket?.id || gameState.correctGuessers?.includes(socket?.id || '')) ? "text-white/15" : "text-white/50"}`}>
                 <Pencil size={12} />
               </div>
               <input 
                 ref={guessInputRef}
                 type="text"
                 disabled={gameState.status === 'WAITING' || gameState.status === 'ROUND_END' || gameState.status === 'PODIUM' || gameState.status === 'CHOOSING' || gameState.currentDrawerId === socket?.id || gameState.correctGuessers?.includes(socket?.id || '')} value={(gameState.status === 'WAITING' || gameState.status === 'ROUND_END' || gameState.status === 'PODIUM' || gameState.status === 'CHOOSING' || gameState.currentDrawerId === socket?.id || gameState.correctGuessers?.includes(socket?.id || '')) ? "" : guessInput}
                 onChange={(e) => setGuessInput(e.target.value)}
                 onFocus={() => setIsInputFocused(true)}
                 onBlur={() => setIsInputFocused(false)}
                 placeholder={
                    gameState.status === 'WAITING' ? "Waiting..." :
                    gameState.status === 'ROUND_END' ? (gameState.roundEndReason === 'skipped' ? "Skipped" : gameState.roundEndReason === 'turn_lost' ? "Inactive" : "Interval") :
                    gameState.status === 'PODIUM' ? "Game Over" :
                    gameState.status === 'CHOOSING' ? "Waiting for the drawing" :
                    gameState.currentDrawerId === socket?.id ? "You are drawing!" :
                    gameState.correctGuessers?.includes(socket?.id || '') ? "You've found the answer!" :
                    "Answer here..."
                  }
                 className={`w-full h-8 border rounded-lg pl-8 pr-10 text-white font-bold text-xs outline-none transition-all duration-200 ${(gameState.status === 'WAITING' || gameState.status === 'ROUND_END' || gameState.status === 'PODIUM' || gameState.status === 'CHOOSING' || gameState.currentDrawerId === socket?.id || gameState.correctGuessers?.includes(socket?.id || '')) ? "bg-black/40 border-white/5 text-white/30 cursor-not-allowed placeholder:text-white/20" : "bg-black/20 border-white/10 focus:border-[#00D9FF] placeholder:text-white/45"}`}
               />
               <button 
                 type="submit"
                 onPointerDown={(e) => e.preventDefault()}
                 disabled={!guessInput.trim() || gameState.status === 'WAITING' || gameState.status === 'ROUND_END' || gameState.status === 'PODIUM' || gameState.status === 'CHOOSING' || gameState.currentDrawerId === socket?.id || gameState.correctGuessers?.includes(socket?.id || '')}
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
           className="fixed top-0 left-0 right-0 z-50 bg-black/60 flex flex-col justify-end overscroll-none touch-none"
           style={{ height: lockedHeight ? `${lockedHeight}px` : '100dvh' }}
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
                         mySocketId={socket?.id}
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
    {gameState.status === 'CHOOSING' && gameState.currentDrawerId === socket?.id && (
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
                {renderTimerBar(true)}
             </div>
       </div>
    )}

    </>
  );
}

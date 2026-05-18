import React, { useState, useEffect } from 'react';
import DrawingBoard from './DrawingBoard';
import { Send, MessageSquare, AlertTriangle, Volume2, Info, X, User as UserIcon, Pencil, Copy } from 'lucide-react';
import { useSocket } from '../providers/SocketProvider';

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
}

type PlayerSlot = { id: string; name: string; points: number | null; isCurrent: boolean; isEmpty?: boolean; avatar?: string };

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
  onSetActiveCopy: (id: string | null) => void 
}> = ({ 
  msg, 
  activeCopyId, 
  onSetActiveCopy 
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
    return (
      <div className="flex justify-center mb-2">
        <div className="bg-[#00D9FF]/20 text-[#00D9FF] px-4 py-1.5 rounded-full text-xs font-bold shadow-sm backdrop-blur-md">
          {msg.text}
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
          <div className="bg-[#7C4DFF] px-4 py-2.5 rounded-2xl rounded-tr-sm text-white text-[15px] font-medium shadow-md break-words border border-[#6A3DE8]">
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
        <div className="bg-[#24174D] px-4 py-2.5 rounded-2xl rounded-tl-sm text-white text-[15px] font-medium shadow-md break-words border border-white/10">
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
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);
  const [maxViewportHeight, setMaxViewportHeight] = useState<number>(typeof window !== 'undefined' ? window.innerHeight : 800);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeCopyId, setActiveCopyId] = useState<string | null>(null);

  const openChat = () => {
    setIsChatOpen(true);
    setUnreadCount(0);
  };

  const closeChat = () => {
    setIsChatOpen(false);
    setActiveCopyId(null);
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

    const onRoomStateUpdate = (state: { roomId: string, players: any[] }) => {
      const players = state.players.map(p => ({
        id: p.id,
        name: p.name,
        points: 0,
        isCurrent: p.id === socket.id,
        avatar: p.avatar,
        isEmpty: false
      }));
      setCurrentPlayers(players);
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

    socket.on('room_state_update', onRoomStateUpdate);
    socket.on('receive_message', onReceiveMessage);

    return () => {
      socket.emit('leave_room', { roomId: room });
      socket.off('room_state_update', onRoomStateUpdate);
      socket.off('receive_message', onReceiveMessage);
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

  const handleGuessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessInput.trim()) return;
    
    const newMsg: Message = { 
      id: Date.now().toString(), 
      sender: nickname, 
      text: guessInput.trim(), 
      isSelf: true,
      type: 'message',
      avatar: nickname.charAt(0).toUpperCase()
    };

    setGuesses(prev => {
      const updated = [...prev, newMsg];
      return updated.slice(-40); // Keep only the last 40 messages
    });
    
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

  const slots: PlayerSlot[] = Array.from({ length: 5 }).map((_, index) => {
    if (index < currentPlayers.length) return currentPlayers[index];
    return { id: `empty-${index}`, name: 'Empty', points: null, isCurrent: false, isEmpty: true };
  });

  const morphMode = isKeyboardOpen && !isChatOpen;

  return (
    <>
      <div 
        className="fixed top-0 left-0 right-0 grid w-full bg-[#1A103C] font-sans overflow-hidden"
        style={{ 
          height: isChatOpen ? (maxViewportHeight ? `${maxViewportHeight}px` : '100dvh') : (lockedHeight ? `${lockedHeight}px` : '100dvh'),
          transitionProperty: 'grid-template-columns, grid-template-rows',
          transitionDuration: '300ms',
          transitionTimingFunction: 'ease-in-out',
          gridTemplateColumns: morphMode ? 'minmax(0, 35%) minmax(0, 65%)' : 'minmax(0, 30%) minmax(0, 70%)',
          gridTemplateRows: 'auto minmax(0, 1fr)'
        }}
      >
        
        {/* Drawing Mode View */}
      {isDrawingMode && (
        <div 
          className="fixed inset-0 z-[100] bg-white flex transition-opacity duration-300 opacity-100"
        >
          <button 
            onClick={() => setIsDrawingMode(false)}
            className="absolute top-4 left-4 z-[110] bg-[#7C4DFF] hover:bg-[#6A3DE8] active:scale-95 text-white px-4 py-2 rounded-xl font-bold shadow-lg transition-all"
          >
            Exit Drawing
          </button>
          <DrawingBoard />
        </div>
      )}

      {/* Top Area (Drawing / Waiting) */}
      <div className={`relative flex flex-col shrink-0 bg-[#1A103C] overflow-hidden transition-all duration-300
                      ${morphMode ? 'col-start-2 col-end-3 row-start-1 row-end-2' : 'col-start-1 col-end-3 row-start-1 row-end-2'}
                     `}>
        <div className="w-full aspect-[4/3] bg-white shrink-0 flex flex-col items-center justify-center transition-all duration-300 overflow-hidden">
          <DrawingBoard readOnly={true} />
        </div>
        <button 
          onClick={() => setIsDrawingMode(true)}
          className="absolute top-4 right-4 z-[60] bg-[#7C4DFF] hover:bg-[#6A3DE8] active:scale-95 text-white px-2 py-1 text-xs sm:px-4 sm:py-2 rounded-xl font-bold shadow-lg transition-all"
        >
          Draw (Host)
        </button>
        {/* Timer Bar */}
        <div className="w-full h-1.5 sm:h-2 bg-[#24174D] shrink-0">
            <div 
              className="h-full bg-orange-500 origin-left"
              style={{
                width: '100%',
                animation: 'timer-shrink 60s linear forwards'
              }}
            />
            <style>{`
              @keyframes timer-shrink {
                from { width: 100%; }
                to { width: 0%; }
              }
            `}</style>
        </div>
      </div>

      {/* Left: Players Sidebar */}
      <div className={`flex flex-col border-r border-[#00D9FF]/20 bg-[#24174D] overflow-y-auto transition-all duration-300
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
                 <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-2 
                   ${slot.isEmpty ? 'bg-black/20 border-white/10' : 'bg-[#1A103C] border-[#00D9FF]'}`}>
                   {slot.isEmpty ? (
                     <UserIcon size={16} className="text-white/30" />
                   ) : (
                     <span className="font-bold text-sm sm:text-lg text-white">{slot.avatar}</span>
                   )}
                 </div>
                 {slot.isCurrent && (
                   <div className="absolute top-0 right-0 w-2 h-2 sm:w-3 sm:h-3 bg-yellow-400 rounded-full border border-[#1A103C]" />
                 )}
              </div>
              
              {/* Info */}
              <div className="flex flex-col justify-center overflow-hidden">
                 <span className={`font-bold text-[10px] sm:text-[15px] truncate max-w-full
                   ${slot.isEmpty ? 'text-white/40' : 'text-white'}`}>
                   {slot.name}
                 </span>
                 {!slot.isEmpty && (
                   <span className="text-[9px] sm:text-[13px] font-bold text-[#7C4DFF]">{slot.points} pts</span>
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
           <div className="flex-1 overflow-y-auto p-2 flex flex-col-reverse font-sans min-h-0">
             <div className="flex flex-col-reverse gap-1.5">
                {[...guesses].reverse().map((msg) => (
                  <div key={msg.id} className="text-[12px] sm:text-[14px]">
                    {msg.type === 'system' ? (
                      <span className="text-[#00D9FF] font-bold">{msg.text}</span>
                    ) : (
                      <div className="flex items-start gap-1">
                        <Pencil size={10} className="text-[#00D9FF] shrink-0 mt-1" />
                        <span className="font-bold text-white/70">{msg.sender}:</span>
                        <span className={`${msg.isSelf ? 'text-white' : 'text-slate-300'} break-words`}>{msg.text}</span>
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-1.5 text-[#00D9FF] font-medium text-[11px] sm:text-[13px]">
                  <Info size={12} />
                  Waiting for players
                </div>
             </div>
           </div>

           {/* Guess Input Area */}
           <div className="p-1.5 shrink-0 mt-auto bg-[#1A103C] border-t border-white/5">
             <form onSubmit={handleGuessSubmit} className="relative">
               <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/50">
                 <Pencil size={12} />
               </div>
               <input 
                 type="text"
                 value={guessInput}
                 onChange={(e) => setGuessInput(e.target.value)}
                 onFocus={() => setIsInputFocused(true)}
                 onBlur={() => setIsInputFocused(false)}
                 placeholder="Answer here..."
                 className="w-full h-8 bg-black/20 border border-white/10 rounded-lg pl-8 pr-10 text-white font-bold text-xs outline-none focus:border-[#00D9FF] transition-colors"
               />
               <button 
                 type="submit"
                 onPointerDown={(e) => e.preventDefault()}
                 disabled={!guessInput.trim()}
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
           className="fixed top-0 left-0 right-0 z-50 bg-black/60 flex flex-col justify-end"
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
                  <div className="flex-1 overflow-y-auto p-4 flex flex-col-reverse min-h-0">
                    <div className="flex flex-col-reverse gap-4 max-w-2xl mx-auto w-full">
                     {[...chatMessages].reverse().map(msg => (
                       <ChatMessageItem 
                         key={msg.id} 
                         msg={msg} 
                         activeCopyId={activeCopyId}
                         onSetActiveCopy={setActiveCopyId}
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
                    className="p-3 bg-[#24174D]/90 backdrop-blur-md border-t border-white/10 shrink-0 safe-area-bottom z-10 w-full"
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
                        className="flex-1 w-full min-w-0 min-h-[40px] max-h-[100px] rounded-xl border-2 border-white/10 bg-black/40 px-3 py-2 text-sm text-white font-bold placeholder-white/30 focus:border-[#7C4DFF] outline-none transition-all shadow-inner resize-none overflow-y-auto leading-tight"
                        style={{ height: '40px' }}
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

    </>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Copy } from 'lucide-react';

export interface ChatMessage {
  id: string;
  sender: string;
  senderId?: string;
  text: string;
  isSelf: boolean;
  type: 'message' | 'system';
  avatar?: string;
  color?: string;
}

export const getSenderColor = (name: string): string => {
  if (!name) return 'text-indigo-400';
  const colors = [
    'text-red-400',
    'text-green-400',
    'text-blue-400',
    'text-yellow-400',
    'text-pink-400',
    'text-purple-400',
    'text-cyan-400',
    'text-teal-400',
    'text-indigo-400',
    'text-orange-400',
    'text-lime-400'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

interface ChatMessageItemProps {
  msg: ChatMessage;
  activeCopyId: string | null;
  onSetActiveCopy: (id: string | null) => void;
  mySocketId?: string | null;
}

const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  msg,
  activeCopyId,
  onSetActiveCopy,
  mySocketId
}) => {
  const showCopy = activeCopyId === msg.id;
  const startY = useRef<number>(0);
  const startX = useRef<number>(0);
  const hasScrolled = useRef<boolean>(false);

  const handlePointerDown = (e: React.PointerEvent) => {
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
    const isLeave = text.includes('غادر الغرفة') || text.toLowerCase().includes('left') || text.includes('خرج');
    const isKick = text.includes('طرد') || text.toLowerCase().includes('kick') || text.toLowerCase().includes('banned');

    if (!isJoin && !isLeave && !isKick) {
      return null;
    }

    const isTargetingSelf = msg.senderId === mySocketId;
    let displayText = text;
    if (isTargetingSelf && text.includes('lost the turn')) {
        displayText = "You've lost your turn";
    } else if (isTargetingSelf && text.includes('skipped the turn')) {
        displayText = "You've skipped the turn";
    }

    if (isKick) {
      return (
        <div className="flex justify-center mb-2">
          <div 
            className="bg-red-500/10 text-[#FF4D4D] border border-[#FF4D4D]/20 px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm backdrop-blur-md animate-in fade-in zoom-in-95 duration-200 flex items-center justify-center gap-1.5"
            dir="auto"
            style={{ unicodeBidi: 'plaintext' }}
          >
            <span>⚠</span>
            <span>{displayText}</span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-center mb-2">
        <div 
          className="bg-primary-brand/10 text-primary-brand border border-primary-brand/20 px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm backdrop-blur-md flex items-center justify-center gap-1.5 animate-in fade-in duration-250"
          dir="auto"
          style={{ unicodeBidi: 'plaintext' }}
        >
          <span>ⓘ</span>
          <span>{displayText}</span>
        </div>
      </div>
    );
  }

  if (msg.type === 'votekick_alert') {
    return (
      <div className="flex justify-center mb-2">
        <div 
          className="bg-red-500/10 text-[#FF4D4D] border border-[#FF4D4D]/20 px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm backdrop-blur-md animate-in fade-in zoom-in-95 duration-200 flex items-center justify-center gap-1.5"
          dir="auto"
          style={{ unicodeBidi: 'plaintext' }}
        >
          <span>⚠</span>
          <span>{msg.text}</span>
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
          <span className="text-[15px] text-primary-brand font-bold mb-1 mr-1">{msg.sender}</span>
          <div 
            className="bg-primary-brand px-4 py-2.5 rounded-2xl rounded-tr-sm text-white text-[15px] font-medium shadow-md break-words border border-primary-brand-dark"
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
        <div className="w-16 h-16 rounded-full bg-bg-dark-brand border-[3px] border-primary-brand flex items-center justify-center shrink-0 shadow-lg relative bottom-1">
          <span className="text-4xl translate-y-[1px]">{msg.avatar}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start items-end gap-2 w-full animate-in slide-in-from-bottom-2 select-none">
      <div className="w-16 h-16 rounded-full bg-bg-panel-brand border-[3px] border-accent-brand flex items-center justify-center shrink-0 shadow-lg relative bottom-1">
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

interface OverlayChatRoomProps {
  isChatOpen: boolean;
  closeChat: () => void;
  chatMessages: ChatMessage[];
  socketId: string | null;
  chatInput: string;
  setChatInput: (val: string) => void;
  handleChatSubmit: (e: React.FormEvent) => void;
}

export const OverlayChatRoom: React.FC<OverlayChatRoomProps> = ({
  isChatOpen,
  closeChat,
  chatMessages,
  socketId,
  chatInput,
  setChatInput,
  handleChatSubmit
}) => {
  const [activeCopyId, setActiveCopyId] = useState<string | null>(null);
  const bgTouchStartTime = useRef<number>(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isChatOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [chatMessages, isChatOpen]);

  if (!isChatOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 flex flex-col justify-end overscroll-none touch-none animate-in fade-in duration-200"
    >
       <div className="w-full h-full flex flex-col">
           {/* Header (Close if clicked) */}
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
                 return; // long press
               }
               bgTouchStartTime.current = 0;

               const act = document.activeElement;
               if (act?.tagName === 'INPUT' || act?.tagName === 'TEXTAREA') {
                 (act as HTMLElement).blur();
               }
             }}
           >
             
             {/* Messages Area */}
             <div
               ref={scrollContainerRef}
               className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-4 flex flex-col-reverse min-h-0 animate-in slide-in-from-bottom-4 duration-300"
             >
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
               className="p-3 bg-game-primary-blue/95 backdrop-blur-md border-t border-white/10 shrink-0 safe-area-bottom z-10 w-full select-auto"
               style={{ 
                 WebkitTouchCallout: 'default', 
                 WebkitUserSelect: 'auto', 
                 userSelect: 'auto',
                 paddingBottom: 'calc(0.75rem + var(--keyboard-inset, 0px))'
               }}
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
                   className="flex-1 w-full min-w-0 min-h-[40px] max-h-[100px] rounded-xl border-2 border-white/10 bg-black/40 px-3 py-2 text-sm text-white font-bold placeholder-white/30 focus:border-primary-brand outline-none transition-all shadow-inner resize-none overflow-y-auto overscroll-contain touch-pan-y leading-tight select-text"
                   style={{ height: '40px', WebkitTouchCallout: 'default', WebkitUserSelect: 'text', userSelect: 'text' }}
                 />
                 <button 
                   type="submit"
                   onPointerDown={(e) => e.preventDefault()}
                   disabled={!chatInput.trim()} 
                   className="w-10 h-10 shrink-0 flex items-center justify-center text-white disabled:bg-primary-brand/50 bg-primary-brand rounded-xl hover:bg-primary-brand-dark transition-colors shadow-md active:scale-95"
                 >
                   <Send size={16} />
                 </button>
               </form>
             </div>

           </div>
       </div>
    </div>
  );
};

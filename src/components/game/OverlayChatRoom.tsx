import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Copy } from 'lucide-react';
import { Trans } from 'react-i18next';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { StructuredSystemEventMetadata } from '../../types/game';

export interface ChatMessage extends StructuredSystemEventMetadata {
  id: string;
  sender: string;
  senderId?: string;
  text: string;
  isSelf: boolean;
  type: 'message' | 'system' | 'votekick_alert' | 'warning';
  avatar?: string;
  color?: string;
  voterName?: string;
  targetName?: string;
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

const extractLegacyActorName = (text: string, patterns: RegExp[]): string | undefined => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const trimmed = match[1].trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
};

interface ChatMessageItemProps {
  msg: ChatMessage;
  activeCopyId: string | null;
  onSetActiveCopy: (id: string | null) => void;
  mySocketId?: string | null;
  t: ReturnType<typeof useAppTranslation>['t'];
  isRTL: boolean;
}

const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  msg,
  activeCopyId,
  onSetActiveCopy,
  mySocketId,
  t,
  isRTL
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

  const isVotekickEvent =
    msg.eventCode === 'votekick_alert' || msg.type === 'votekick_alert';
  const isWordLeakEvent = msg.eventCode === 'chat_word_leak_warning';

  if (isVotekickEvent || msg.type === 'warning' || isWordLeakEvent) {
    const voterName = msg.params?.voterName || msg.voterName;
    const targetName = msg.params?.targetName || msg.targetName;
    const isLegacyWordLeak =
      !msg.eventCode &&
      msg.type === 'warning' &&
      (msg.text.includes('لا يمكنك كتابة الإجابة') ||
        msg.text.toLowerCase().includes('cannot type the answer in chat'));

    return (
      <div className="flex justify-center mb-2 animate-message-pop">
        <div
          className="bg-red-500/10 border border-[#FF4D4D]/20 px-4 py-2 rounded-full text-[15px] font-semibold shadow-sm flex items-center justify-center gap-1.5 animate-in fade-in zoom-in-95 duration-200"
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          <span className="text-[#FF4D4D] shrink-0">⚠</span>
          {isVotekickEvent && voterName && targetName ? (
            <div className="flex flex-wrap items-center gap-1 justify-center text-center text-[#FF4D4D]">
              <Trans
                t={t}
                i18nKey="chat.votekickAlert"
                values={{ voterName, targetName }}
                components={{
                  voter: (
                    <bdi
                      dir="auto"
                      className="text-[#FF4D4D] font-bold max-w-[120px] truncate inline-block align-bottom"
                    />
                  ),
                  target: (
                    <bdi
                      dir="auto"
                      className="text-[#FF4D4D] font-bold max-w-[120px] truncate inline-block align-bottom"
                    />
                  )
                }}
              />
            </div>
          ) : isWordLeakEvent || isLegacyWordLeak ? (
            <span className="text-[#FF4D4D] text-center">
              {t('chat.wordLeakWarning')}
            </span>
          ) : (
            <span
              className="text-[#FF4D4D]"
              style={{ unicodeBidi: 'plaintext' }}
              dir="auto"
            >
              {msg.text}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (msg.type === 'system') {
    const text = msg.text || '';
    const lowerText = text.toLowerCase();
    const isTargetingSelf = Boolean(msg.senderId && mySocketId && msg.senderId === mySocketId);

    const renderSystemPill = (content: React.ReactNode, localized: boolean) => (
      <div className="flex justify-center mb-2 animate-message-pop">
        <div
          className="bg-primary-brand/10 text-primary-brand border border-primary-brand/20 px-4 py-2 rounded-full text-[15px] font-semibold shadow-sm flex items-center justify-center gap-1.5 animate-in fade-in duration-250 text-center"
          dir={localized ? (isRTL ? 'rtl' : 'ltr') : 'auto'}
          style={localized ? undefined : { unicodeBidi: 'plaintext' }}
        >
          <span className="shrink-0">ⓘ</span>
          <span>{content}</span>
        </div>
      </div>
    );

    if (msg.eventCode === 'player_joined') {
      const name =
        msg.params?.name ||
        extractLegacyActorName(text, [/^(.+?)\s+انضم للغرفة$/, /^(.+?)\s+joined(?:\s+the\s+room)?$/i]);
      if (name) {
        return renderSystemPill(
          <Trans
            t={t}
            i18nKey="chat.system.playerJoined"
            values={{ name }}
            components={{ player: <bdi dir="auto" /> }}
          />,
          true
        );
      }
      return renderSystemPill(text, false);
    }

    if (msg.eventCode === 'player_left') {
      const name =
        msg.params?.name ||
        extractLegacyActorName(text, [/^(.+?)\s+غادر الغرفة$/, /^(.+?)\s+left(?:\s+the\s+room)?$/i]);
      if (name) {
        return renderSystemPill(
          <Trans
            t={t}
            i18nKey="chat.system.playerLeft"
            values={{ name }}
            components={{ player: <bdi dir="auto" /> }}
          />,
          true
        );
      }
      return renderSystemPill(text, false);
    }

    if (msg.eventCode === 'player_kicked') {
      const name =
        msg.params?.name ||
        extractLegacyActorName(text, [
          /^(.+?)\s+غادر الغرفة$/,
          /^(.+?)\s+(?:was\s+)?kicked(?:\s+from\s+the\s+room)?$/i,
          /^تم طرد\s+(.+?)(?:\s+من الغرفة)?$/
        ]);
      if (name) {
        return renderSystemPill(
          <Trans
            t={t}
            i18nKey="chat.system.playerKicked"
            values={{ name }}
            components={{ player: <bdi dir="auto" /> }}
          />,
          true
        );
      }
      return renderSystemPill(text, false);
    }

    if (msg.eventCode === 'player_afk_kicked') {
      const name =
        msg.params?.name ||
        extractLegacyActorName(text, [
          /^تم طرد\s+(.+?)\s+بسبب عدم النشاط/,
          /^(.+?)\s+was kicked for inactivity/i
        ]);
      if (name) {
        return renderSystemPill(
          <Trans
            t={t}
            i18nKey="chat.system.playerAfkKicked"
            values={{ name }}
            components={{ player: <bdi dir="auto" /> }}
          />,
          true
        );
      }
      return renderSystemPill(text, false);
    }

    if (msg.eventCode === 'player_disconnected_removed') {
      const name =
        msg.params?.name ||
        extractLegacyActorName(text, [
          /^انقطع اتصال\s+(.+?)\s+وتمت إزالته من اللعبة$/,
          /^(.+?)\s+disconnected and was removed/i
        ]);
      if (name) {
        return renderSystemPill(
          <Trans
            t={t}
            i18nKey="chat.system.playerDisconnectedRemoved"
            values={{ name }}
            components={{ player: <bdi dir="auto" /> }}
          />,
          true
        );
      }
      return renderSystemPill(text, false);
    }

    // Legacy fallback allowlist (when eventCode is absent or unrecognized)
    const isJoin = text.includes('انضم للغرفة') || lowerText.includes('joined');
    const isLeave = text.includes('غادر الغرفة') || lowerText.includes('left') || text.includes('خرج');
    const isKick = text.includes('طرد') || lowerText.includes('kick') || lowerText.includes('banned');
    const isDisconnectRemoved = text.includes('انقطع اتصال');

    if (!isJoin && !isLeave && !isKick && !isDisconnectRemoved) {
      return null;
    }

    if (isTargetingSelf && text.includes('lost the turn')) {
      return renderSystemPill(t('chat.system.turnLostSelf'), true);
    }
    if (isTargetingSelf && text.includes('skipped the turn')) {
      return renderSystemPill(t('chat.system.turnSkippedSelf'), true);
    }

    const legacyDisconnectedName = isDisconnectRemoved
      ? extractLegacyActorName(text, [/^انقطع اتصال\s+(.+?)\s+وتمت إزالته من اللعبة$/])
      : undefined;
    if (legacyDisconnectedName) {
      return renderSystemPill(
        <Trans
          t={t}
          i18nKey="chat.system.playerDisconnectedRemoved"
          values={{ name: legacyDisconnectedName }}
          components={{ player: <bdi dir="auto" /> }}
        />,
        true
      );
    }

    const legacyAfkName = isKick
      ? extractLegacyActorName(text, [/^تم طرد\s+(.+?)\s+بسبب عدم النشاط/])
      : undefined;
    if (legacyAfkName) {
      return renderSystemPill(
        <Trans
          t={t}
          i18nKey="chat.system.playerAfkKicked"
          values={{ name: legacyAfkName }}
          components={{ player: <bdi dir="auto" /> }}
        />,
        true
      );
    }

    const legacyJoinedName = isJoin
      ? extractLegacyActorName(text, [/^(.+?)\s+انضم للغرفة$/, /^(.+?)\s+joined(?:\s+the\s+room)?$/i])
      : undefined;
    if (legacyJoinedName) {
      return renderSystemPill(
        <Trans
          t={t}
          i18nKey="chat.system.playerJoined"
          values={{ name: legacyJoinedName }}
          components={{ player: <bdi dir="auto" /> }}
        />,
        true
      );
    }

    const legacyLeftName = isLeave
      ? extractLegacyActorName(text, [/^(.+?)\s+غادر الغرفة$/, /^(.+?)\s+left(?:\s+the\s+room)?$/i])
      : undefined;
    if (legacyLeftName) {
      return renderSystemPill(
        <Trans
          t={t}
          i18nKey="chat.system.playerLeft"
          values={{ name: legacyLeftName }}
          components={{ player: <bdi dir="auto" /> }}
        />,
        true
      );
    }

    return renderSystemPill(text, false);
  }

  if (msg.isSelf) {
    return (
      <div className="flex justify-end items-end gap-2 w-full animate-message-pop select-none">
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
          <span className="text-[15px] text-primary-brand font-bold mb-1 mr-1">
            <bdi dir="auto">{msg.sender}</bdi>
          </span>
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
              dir={isRTL ? 'rtl' : 'ltr'}
              className="absolute -top-3 left-0 bg-black/80 text-white text-[10px] px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1 z-10 animate-in fade-in border border-white/20"
            >
              <Copy size={10} />
              {t('chat.copy')}
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
    <div className="flex justify-start items-end gap-2 w-full animate-message-pop select-none">
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
        <span className={`text-[15px] font-bold mb-1 ml-1 ${getSenderColor(msg.sender)}`}>
          <bdi dir="auto">{msg.sender}</bdi>
        </span>
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
            dir={isRTL ? 'rtl' : 'ltr'}
            className="absolute -top-3 right-0 bg-black/80 text-white text-[10px] px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1 z-10 animate-in fade-in border border-white/20"
          >
            <Copy size={10} /> 
            {t('chat.copy')}
          </button>
        )}
      </div>
    </div>
  );
};

interface OverlayChatRoomProps {
  isChatOpen: boolean;
  viewportOffsetTop: number;
  closeChat: () => void;
  chatMessages: ChatMessage[];
  socketId: string | null;
  chatInput: string;
  setChatInput: (val: string) => void;
  handleChatSubmit: (e: React.FormEvent) => void;
  iosKeyboardHeightCache: React.MutableRefObject<number>;
}

export const OverlayChatRoom: React.FC<OverlayChatRoomProps> = ({
  isChatOpen,
  viewportOffsetTop,
  closeChat,
  chatMessages,
  socketId,
  chatInput,
  setChatInput,
  handleChatSubmit,
  iosKeyboardHeightCache
}) => {
  const { t, isRTL } = useAppTranslation('events');
  const [activeCopyId, setActiveCopyId] = useState<string | null>(null);
  const bgTouchStartTime = useRef<number>(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleIOSFocusBypass = () => {
    if (typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))) {
      document.documentElement.style.setProperty("--keyboard-inset", `${iosKeyboardHeightCache.current}px`);
      window.scrollTo(0, 0);
      setTimeout(() => window.scrollTo(0, 0), 10);
    }
  };

  useEffect(() => {
    if (isChatOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [chatMessages, isChatOpen]);

  if (!isChatOpen) return null;

  return (
    <div 
      className="fixed top-0 bottom-0 left-0 right-0 z-[160] bg-black/60 flex flex-col justify-end overscroll-none touch-none animate-in fade-in duration-200"
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
                    t={t}
                    isRTL={isRTL}
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
               className="p-3 bg-game-primary-blue border-t border-white/10 shrink-0 safe-area-bottom z-10 w-full select-auto"
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
                   maxLength={250}
                   value={chatInput}
                   onChange={(e) => {
                     setChatInput(e.target.value);
                     e.target.style.height = 'auto'; 
                     e.target.style.height = `${Math.max(40, e.target.scrollHeight)}px`; 
                   }}
                   dir="auto"
                   rows={1}
                   placeholder={t('chat.inputPlaceholder')}
                   className="flex-1 w-full min-w-0 min-h-[40px] max-h-[100px] rounded-xl border-2 border-white/10 bg-black/40 px-3 py-2 text-sm text-white font-bold placeholder-white/30 focus:border-primary-brand outline-none transition-all shadow-inner resize-none overflow-y-auto overscroll-contain touch-pan-y leading-tight select-text ios-input-focus"
                   style={{ height: '40px', WebkitTouchCallout: 'default', WebkitUserSelect: 'text', userSelect: 'text' }}
                   onFocus={handleIOSFocusBypass}
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

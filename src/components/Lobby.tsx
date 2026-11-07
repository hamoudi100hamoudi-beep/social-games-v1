import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Users, Plus, ChevronLeft, ChevronRight, Search, X, LayoutGrid, Check, WifiOff, AlertTriangle } from 'lucide-react';
import { useSocket } from './SocketProvider';
import { motion, AnimatePresence } from 'motion/react';
import CinematicModal from './game/CinematicModal';
import CustomEmojiModal from './game/CustomEmojiModal';
import RoomInfoModal from './lobby/RoomInfoModal';
import AvatarCarousel from './lobby/AvatarCarousel';
import RoomsBrowserScreen from './lobby/RoomsBrowserScreen';
import { safeLocalStorage } from '../utils/storage';
import GameTitle from './game/GameTitle';
import { ROOM_PRESETS, getRoomConfig } from '../types/game';


interface LobbyProps {
  onPlay: (nickname: string, room: string, avatar: string) => void;
}

const AVATARS = [
  '😂', '😅', '😁', '😙', '😗', '😍', '🙂', '🥲', '☺️', '😌', '🙃', '🤪', '😑', '🤔', '🥺', '🥹', '🫠',
  '🌝', '🌞', '🤠', '🧐', '🤫', '😠', '🥶', '😎', '🥸', '🤡', '👹', '☠️', '👀', '🌹', '🌼', '🌷', '🌺', '🌜', '⭐', '🐨', '❄️', '🐻', '🐺', '🐶', '🐱', '🐯', '🦁', '🐮', '🦊', '🐰', '🐭', '🐹', '🐼', '🐴', '🐧', '🐣', '🐸'
];

type Screen = 'home' | 'rooms';

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
      duration: 0.35,
      ease: [0.16, 1, 0.3, 1]
    }
  }
};

// Module-level timestamp to throttle room info requests across React component remounts and StrictMode cycles
let lastRoomsInfoFetchTime = 0;

export default function Lobby({ onPlay }: LobbyProps) {
  const { socket } = useSocket();
  const [screen, setScreen] = useState<Screen>('home');
  const [nickname, setNickname] = useState(() => {
    if (typeof window !== 'undefined') {
      return safeLocalStorage.getItem('gartic_player_nickname') || '';
    }
    return '';
  });

  // Custom Emojis state saved in localStorage (max 5)
  const [customEmojis, setCustomEmojis] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = safeLocalStorage.getItem('gartic_custom_emojis');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed.slice(0, 5);
          }
        }
      } catch {
        // fallback
      }
    }
    return [];
  });

  // Combine custom emojis at the front with default AVATARS
  const allAvatars = useMemo(() => {
    const uniqueCustom = customEmojis.filter((e) => !AVATARS.includes(e));
    return [...uniqueCustom, ...AVATARS];
  }, [customEmojis]);

  // Selected Avatar Emoji
  const [selectedEmoji, setSelectedEmoji] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const savedEmoji = safeLocalStorage.getItem('gartic_player_avatar_emoji');
      if (savedEmoji) return savedEmoji;

      const savedIdx = safeLocalStorage.getItem('gartic_player_avatar_index');
      if (savedIdx !== null) {
        const val = parseInt(savedIdx, 10);
        if (!isNaN(val) && val >= 0 && val < AVATARS.length) {
          return AVATARS[val];
        }
      }
    }
    return AVATARS[Math.floor(Math.random() * AVATARS.length)];
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      safeLocalStorage.setItem('gartic_player_nickname', nickname);
    }
  }, [nickname]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      safeLocalStorage.setItem('gartic_player_avatar_emoji', selectedEmoji);
      const idx = allAvatars.indexOf(selectedEmoji);
      if (idx >= 0) {
        safeLocalStorage.setItem('gartic_player_avatar_index', idx.toString());
      }
    }
  }, [selectedEmoji, allAvatars]);

  const [showAvatarGrid, setShowAvatarGrid] = useState(false);
  const [showCustomEmojiModal, setShowCustomEmojiModal] = useState(false);
  const [nicknameError, setNicknameError] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  const handleAddCustomEmoji = (newEmoji: string) => {
    setCustomEmojis((prev) => {
      const filtered = prev.filter((e) => e !== newEmoji);
      const updated = [newEmoji, ...filtered].slice(0, 5);
      if (typeof window !== 'undefined') {
        safeLocalStorage.setItem('gartic_custom_emojis', JSON.stringify(updated));
      }
      return updated;
    });
    setSelectedEmoji(newEmoji);
  };

  // Keyboard and viewport scaling states for initial screen
  const lobbyContainerRef = React.useRef<HTMLDivElement>(null);
  const lobbyKeyboardHeightCache = React.useRef<number>(300);
  const [maxViewportHeight, setMaxViewportHeight] = useState<number | string>(
    typeof window !== 'undefined' && window.innerHeight > 300 ? window.innerHeight : '100dvh'
  );
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyPosition = document.body.style.position;
    const originalBodyWidth = document.body.style.width;
    const originalBodyHeight = document.body.style.height;

    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalHtmlPosition = document.documentElement.style.position;
    const originalHtmlHeight = document.documentElement.style.height;

    // Lock body to prevent outer scrolling entirely in the Lobby,
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

  useEffect(() => {
    let currentMax = window.visualViewport?.height || window.innerHeight;
    if (currentMax > 300) {
      setMaxViewportHeight(currentMax);
    }

    const handleResize = () => {
      if (!window.visualViewport) return;
      const currentHeight = window.visualViewport.height;
      if (currentHeight > currentMax) {
        currentMax = currentHeight;
      }
      if (currentHeight > 300 || currentMax > 300) {
        setMaxViewportHeight(currentHeight);
      }

      const isKeyboardShowing = currentHeight < currentMax - 150;
      setIsKeyboardOpen(isKeyboardShowing);

      if (lobbyContainerRef.current) {
        const containerHeight = lobbyContainerRef.current.getBoundingClientRect().height;
        const inset = Math.max(0, containerHeight - currentHeight);
        if (inset > 150) {
          lobbyKeyboardHeightCache.current = inset + 25;
        }
        document.documentElement.style.setProperty("--lobby-keyboard-inset", `${inset}px`);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleResize);
      handleResize();
    }
    return () => {
      window.visualViewport?.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
      if (screen !== 'home') return;
      if (showAvatarGrid) return; // Allow scrolling the avatar grid modal

      const target = e.target as HTMLElement;
      if (
        target.closest('.scrollable-content') || 
        target.tagName === 'TEXTAREA' || 
        target.tagName === 'INPUT'
      ) {
        return;
      }
      e.preventDefault();
    };

    document.addEventListener('touchmove', preventScroll, { passive: false });
    return () => {
      document.removeEventListener('touchmove', preventScroll);
    };
  }, [screen, showAvatarGrid]);

  const handleIOSFocusBypass = () => {
    if (typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))) {
      document.documentElement.style.setProperty("--lobby-keyboard-inset", `${lobbyKeyboardHeightCache.current}px`);
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as any });
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      setTimeout(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' as any });
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
      }, 50);
    }
  };
  const [afkWarning, setAfkWarning] = useState(() => {
    if (typeof window !== 'undefined') {
      const afkStored = safeLocalStorage.getItem('gartic_afk_kicked');
      if (afkStored) {
        const timestamp = parseInt(afkStored, 10);
        if (!isNaN(timestamp) && Date.now() - timestamp < 180000) {
          return true;
        }
      }
    }
    return false;
  });

  const [connLostWarning, setConnLostWarning] = useState(() => {
    if (typeof window !== 'undefined') {
      const connLostStored = safeLocalStorage.getItem('gartic_connection_lost');
      const reason = safeLocalStorage.getItem('gartic_session_expired_reason');
      const afkStored = safeLocalStorage.getItem('gartic_afk_kicked');
      
      let isAfk = false;
      if (afkStored) {
        const timestamp = parseInt(afkStored, 10);
        if (!isNaN(timestamp) && Date.now() - timestamp < 180000) {
          isAfk = true;
        }
      }

      if (connLostStored) {
        const timestamp = parseInt(connLostStored, 10);
        if (!isNaN(timestamp) && Date.now() - timestamp < 180000) {
          return true;
        }
      }

      if (!isAfk && !afkStored && reason === 'connection_lost' && !connLostStored) {
        return true;
      }
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      safeLocalStorage.removeItem('gartic_afk_kicked');
      safeLocalStorage.removeItem('gartic_connection_lost');
      safeLocalStorage.removeItem('gartic_session_expired_reason');
    }
  }, []);

  useEffect(() => {
    if (socket && !socket.connected) {
      console.log("[Lobby] Socket is disconnected. Reconnecting cleanly...");
      socket.connect();
    }
  }, [socket]);
  
  const [roomStats, setRoomStats] = useState<Record<string, { count: number; max: number; winningScore: number; theme: string }>>({});
  const [joinError, setJoinError] = useState<string | null>(null);

  // Sort presets dynamically: rooms with active players rise to the top (ordered descending by players), empty rooms at the bottom
  const sortedPresets = useMemo(() => {
    return [...ROOM_PRESETS].sort((a, b) => {
      const countA = roomStats[a.id]?.count ?? 0;
      const countB = roomStats[b.id]?.count ?? 0;
      if (countB !== countA) {
        return countB - countA;
      }
      return 0;
    });
  }, [roomStats]);

  // Notice for "NEW ROOM" button click
  const [newRoomNotice, setNewRoomNotice] = useState<string | null>(null);
  const newRoomNoticeTimer = useRef<NodeJS.Timeout | null>(null);

  const handleNewRoomClick = () => {
    if (newRoomNoticeTimer.current) clearTimeout(newRoomNoticeTimer.current);
    setNewRoomNotice("هذه الميزة غير متوفرة بعد");
    newRoomNoticeTimer.current = setTimeout(() => {
      setNewRoomNotice(null);
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (newRoomNoticeTimer.current) clearTimeout(newRoomNoticeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!socket) return;
    
    const fetchCounts = () => {
      const now = Date.now();
      // Prevent duplicate fetches within 1000ms across component remounts (StrictMode) or rapid reconnects
      if (now - lastRoomsInfoFetchTime < 1000) return;
      lastRoomsInfoFetchTime = now;

      socket.emit('get_rooms_info', (data: any) => {
        if (data && typeof data === 'object') {
          setRoomStats((prev) => ({
            ...prev,
            ...data,
          }));
        }
      });
    };
    
    if (socket.connected) {
      fetchCounts();
    }
    const interval = setInterval(fetchCounts, 10000);

    socket.on('connect', fetchCounts);

    return () => {
      clearInterval(interval);
      socket.off('connect', fetchCounts);
    };
  }, [socket]);

  useEffect(() => {
    if (selectedRoom && socket) {
      socket.emit('get_room_info', selectedRoom, (data: any) => {
        if (data && typeof data.count === 'number') {
          const cfg = getRoomConfig(selectedRoom);
          setRoomStats((prev) => ({
            ...prev,
            [selectedRoom]: {
              count: data.count,
              max: data.max || cfg.maxPlayers,
              winningScore: data.winningScore || cfg.winningScore,
              theme: data.theme || cfg.theme,
            },
          }));
        }
      });
    }
  }, [selectedRoom, socket]);

  const handleRoomClick = (roomId: string) => {
    setSelectedRoom(roomId);
    setJoinError(null);
  };

  const handlePrevAvatar = () => {
    const currentIdx = allAvatars.indexOf(selectedEmoji);
    const safeIdx = currentIdx >= 0 ? currentIdx : 0;
    const nextIdx = (safeIdx - 1 + allAvatars.length) % allAvatars.length;
    setSelectedEmoji(allAvatars[nextIdx]);
  };

  const handleNextAvatar = () => {
    const currentIdx = allAvatars.indexOf(selectedEmoji);
    const safeIdx = currentIdx >= 0 ? currentIdx : 0;
    const nextIdx = (safeIdx + 1) % allAvatars.length;
    setSelectedEmoji(allAvatars[nextIdx]);
  };

  const handlePlay = () => {
    if (!nickname.trim()) {
      setNicknameError(true);
      return;
    }
    const finalName = nickname.trim();
    const finalRoom = selectedRoom || 'general';
    const config = getRoomConfig(finalRoom);
    
    if (socket) {
      // Check again right before playing
      socket.emit('get_room_info', finalRoom, (data: any) => {
        const maxCapacity = data?.max || config.maxPlayers;
        if (data && data.count >= maxCapacity) {
          setJoinError('عذراً، هذه الغرفة ممتلئة بالكامل!');
          if (!selectedRoom) {
             setNicknameError(false);
          }
        } else {
          onPlay(finalName, finalRoom, selectedEmoji);
        }
      });
    } else {
      onPlay(finalName, finalRoom, selectedEmoji);
    }
  };

  const handleGoToRooms = () => {
    if (!nickname.trim()) {
      setNicknameError(true);
      return;
    }
    setNicknameError(false);
    setJoinError(null);
    setScreen('rooms');
  };

  return (
    <div 
      ref={lobbyContainerRef}
      className="fixed inset-0 bg-game-primary-blue text-white font-sans flex flex-col overflow-hidden"
      style={{ height: maxViewportHeight }}
    >
      
      {/* Home Screen */}
      {screen === 'home' && !afkWarning && !connLostWarning && (
        <div className="flex-1 flex flex-col items-center justify-start p-3 sm:p-5 z-10 w-full max-w-md mx-auto overflow-hidden no-scrollbar">
          {/* Header Row (Game Title) */}
          <div className="w-full flex items-center justify-center mb-auto relative px-2 mt-2 shrink-0">
            <GameTitle 
              text="DRAW.IO" 
              type="skip" 
              className="text-[38px] sm:text-[42px]" 
            />
          </div>

          {/* White/Light-purple Card */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className={`w-[90%] max-w-[340px] bg-[#ECEBFC] rounded-[32px] relative border-2 border-white/60 flex flex-col justify-center items-center text-[#2E2882] min-h-0 my-auto shrink-0 ${
              isKeyboardOpen 
                ? "py-4 px-6" 
                : "py-4 [@media(min-height:600px)]:py-5 px-5 [@media(min-height:600px)]:px-6 sm:px-8"
            }`}
          >
            {/* Content body wrapper */}
            <div className={`flex flex-col items-center w-full ${isKeyboardOpen ? 'space-y-3' : 'space-y-4'}`}>
              {/* Avatar Selector */}
              <AvatarCarousel
                selectedEmoji={selectedEmoji}
                isKeyboardOpen={isKeyboardOpen}
                onPrevAvatar={handlePrevAvatar}
                onNextAvatar={handleNextAvatar}
                onOpenGrid={() => setShowAvatarGrid(true)}
              />

              
              <div className={`w-full max-w-[280px] sm:max-w-[320px] ${isKeyboardOpen ? 'space-y-1' : 'space-y-2'}`}>
                <label className={`font-black text-[#8C8AA7] uppercase tracking-wide ${isKeyboardOpen ? 'text-[11px]' : 'text-xs'}`}>NICKNAME</label>
                <textarea 
                  maxLength={10}
                  rows={1}
                  value={nickname}
                  onChange={(e) => { setNickname(e.target.value.replace(/\n/g, '')); setNicknameError(false); setJoinError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleGoToRooms();
                    }
                  }}
                  onFocus={handleIOSFocusBypass}
                  placeholder="Enter your name..."
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  name="nickname_input_random_name"
                  data-form-type="other"
                  style={{ resize: 'none' }}
                  className={`w-full bg-white text-[#2E2882] placeholder-[#8C8AA7]/50 border-2 rounded-2xl px-5 font-black outline-none transition-all focus:bg-white overflow-hidden whitespace-nowrap ios-input-focus ${
                    isKeyboardOpen
                      ? 'h-12 py-3 text-sm'
                      : 'h-12 [@media(min-height:600px)]:h-14 py-2 [@media(min-height:600px)]:py-3.5 text-sm [@media(min-height:600px)]:text-base'
                  } ${nicknameError ? 'border-red-400 focus:border-red-400' : 'border-[#2E2882]/10 focus:border-[#38BDF8]'}`}
                />
              </div>
            </div>
          </motion.div>

          {/* Bottom Rooms button OUTSIDE the white card */}
          <button 
            onClick={handleGoToRooms}
            className={`w-[85%] sm:w-[75%] max-w-[320px] mx-auto bg-[#38BDF8] hover:bg-[#0EA5E9] text-white rounded-[24px] font-black flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-lg mt-auto mb-2 shrink-0 ${
              isKeyboardOpen 
                ? "h-11 text-sm mb-1" 
                : "h-12 [@media(min-height:600px)]:h-14 sm:h-16 text-base [@media(min-height:600px)]:text-lg sm:text-xl"
            }`}
          >
            <span>ROOMS</span>
          </button>
        </div>
      )}

      {/* Rooms Browser Screen */}
      {screen === 'rooms' && (
        <RoomsBrowserScreen
          sortedPresets={sortedPresets}
          roomStats={roomStats}
          newRoomNotice={newRoomNotice}
          onBackToHome={() => setScreen('home')}
          onSelectRoom={handleRoomClick}
          onNewRoomClick={handleNewRoomClick}
        />
      )}

      {/* Room Info Modal */}
      <RoomInfoModal
        isOpen={!!selectedRoom}
        selectedRoom={selectedRoom}
        roomStats={roomStats}
        joinError={joinError}
        onClose={() => setSelectedRoom(null)}
        onPlay={handlePlay}
      />


      {/* AFK Warning Modal */}
      <CinematicModal
        isOpen={afkWarning}
        onClose={() => setAfkWarning(false)}
        titleType="inactive"
        titleText="INACTIVE"
        buttons={[
          {
            id: "afk-warning-ok-btn",
            text: "OK",
            onClick: () => setAfkWarning(false),
            variant: "secondary",
          },
        ]}
      >
        <p
          id="afk-warning-text"
          className="text-base sm:text-lg font-bold text-[#8C8AA7] leading-relaxed mb-4 px-2 text-center"
        >
          تم قطع الاتصال بسبب الخمول
          <br />
          <span className="text-[13px] font-semibold opacity-70 block mt-1">(Disconnected due to inactivity)</span>
        </p>
      </CinematicModal>

      {/* Connection Lost Warning Modal */}
      <CinematicModal
        isOpen={connLostWarning}
        onClose={() => setConnLostWarning(false)}
        titleType="exit"
        titleText="DISCONNECTED"
        buttons={[
          {
            id: "conn-lost-warning-ok-btn",
            text: "OK",
            onClick: () => setConnLostWarning(false),
            variant: "danger",
          },
        ]}
      >
        <p
          id="conn-lost-warning-text"
          className="text-base sm:text-lg font-bold text-[#8C8AA7] leading-relaxed mb-4 px-2 text-center"
        >
          انقطع الاتصال ببيئة اللعب
          <br />
          <span className="text-[13px] font-semibold opacity-70 block mt-1">(Connection toast or session expired)</span>
        </p>
      </CinematicModal>

      {/* Room Full Warning Modal */}
      <CinematicModal
        isOpen={!!joinError}
        onClose={() => setJoinError(null)}
        titleType="report"
        titleText="ERROR"
        buttons={[
          {
            id: "lobby-room-full-ok-btn",
            text: "OK",
            onClick: () => setJoinError(null),
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

        <h3 id="lobby-room-full-desc" className="text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
          This room is full
        </h3>
        <p id="lobby-room-full-desc-ar" className="text-[#8C8AA7] text-base font-bold mb-6">
          هذه الغرفة ممتلئة بالكامل
        </p>
      </CinematicModal>

      {/* Avatar Grid Overlay */}
      {showAvatarGrid && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 cursor-pointer" onClick={() => setShowAvatarGrid(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-5 border-2 border-slate-200 animate-in zoom-in-95 duration-200" dir="rtl">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-black text-[#38BDF8]">اختر أفاتار</span>
              <button onClick={() => setShowAvatarGrid(false)} className="text-[#8C8AA7] hover:text-[#2E2882] bg-slate-100 p-1.5 rounded-full transition-colors active:scale-90">
                <X size={18} strokeWidth={3} />
              </button>
            </div>
            <div className="grid grid-cols-6 gap-2 overflow-y-auto max-h-[300px] sm:max-h-[400px] no-scrollbar">
              {/* Add Custom Emoji Button as First Grid Item */}
              <button
                type="button"
                onClick={() => {
                  setShowAvatarGrid(false);
                  setShowCustomEmojiModal(true);
                }}
                className="h-12 w-12 rounded-2xl bg-[#38BDF8]/10 hover:bg-[#38BDF8]/20 border-2 border-dashed border-[#38BDF8] flex items-center justify-center text-[#38BDF8] active:scale-95 transition-all cursor-pointer shadow-xs"
                title="أضف إيموجي مخصص"
              >
                <Plus size={22} strokeWidth={3.5} />
              </button>

              {allAvatars.map((emoji, idx) => (
                <button
                  key={`${emoji}-${idx}`}
                  type="button"
                  onClick={() => { setSelectedEmoji(emoji); setShowAvatarGrid(false); }}
                  className={`text-3xl h-12 w-12 flex items-center justify-center hover:scale-125 transition-transform ${emoji === selectedEmoji ? 'bg-[#38BDF8]/15 rounded-2xl scale-110 border-2 border-[#38BDF8] font-black shadow-inner' : ''}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Custom Emoji Picker Modal */}
      <CustomEmojiModal
        isOpen={showCustomEmojiModal}
        onClose={() => setShowCustomEmojiModal(false)}
        onAddEmoji={handleAddCustomEmoji}
      />

      {/* Background decoration */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary-brand rounded-full mix-blend-overlay filter blur-[100px] opacity-20 pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-accent-brand rounded-full mix-blend-overlay filter blur-[100px] opacity-20 pointer-events-none" />
    </div>
  );
}

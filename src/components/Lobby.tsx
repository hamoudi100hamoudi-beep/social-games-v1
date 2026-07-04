import React, { useState, useEffect } from 'react';
import { Users, Settings, Plus, Play, ChevronLeft, ChevronRight, Search, X, LayoutGrid, Check, WifiOff, AlertTriangle } from 'lucide-react';
import { useSocket } from './SocketProvider';
import { motion, AnimatePresence } from 'motion/react';
import CinematicModal from './game/CinematicModal';
import { safeLocalStorage } from '../utils/storage';
import GameTitle from './game/GameTitle';

interface LobbyProps {
  onPlay: (nickname: string, room: string, avatar: string) => void;
}

const AVATARS = [
  '😂', '😅', '😁', '😃', '😙', '😗', '😍', '🙂', '🥲', '☺️', '😌', '🙃', '🤪', '😑', '🤔', '🥺', '🥹', '🫠',
  '🌝', '🌞', '🤠', '🧐', '🤫', '😠', '🥶', '😎', '🥸', '🤡', '👹', '☠️', '👀', '🌹', '🌼', '🌷', '🌺', '🌜', '⭐', '🐨', '🐻', '❄️', '🐻', '🐺', '🐶', '🐱', '🐯', '🦁', '🐮', '🦊', '🐰', '🐭', '🐹', '🐼', '🐴', '🐧', '🐣', '🐸'
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

export default function Lobby({ onPlay }: LobbyProps) {
  const { socket } = useSocket();
  const [screen, setScreen] = useState<Screen>('home');
  const [nickname, setNickname] = useState(() => {
    if (typeof window !== 'undefined') {
      return safeLocalStorage.getItem('gartic_player_nickname') || '';
    }
    return '';
  });
  const [avatarIndex, setAvatarIndex] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = safeLocalStorage.getItem('gartic_player_avatar_index');
      if (saved !== null) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 0 && val < AVATARS.length) {
          return val;
        }
      }
    }
    return Math.floor(Math.random() * AVATARS.length);
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      safeLocalStorage.setItem('gartic_player_nickname', nickname);
    }
  }, [nickname]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      safeLocalStorage.setItem('gartic_player_avatar_index', avatarIndex.toString());
    }
  }, [avatarIndex]);
  const [showAvatarGrid, setShowAvatarGrid] = useState(false);
  const [nicknameError, setNicknameError] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
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

  // Home screen settings modal states

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [localZoomEnabled, setLocalZoomEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return safeLocalStorage.getItem('gartic_zoom_enabled') === 'true';
    }
    return false;
  });

  const toggleLocalZoom = () => {
    const nextVal = !localZoomEnabled;
    setLocalZoomEnabled(nextVal);
    if (typeof window !== 'undefined') {
      safeLocalStorage.setItem('gartic_zoom_enabled', nextVal ? 'true' : 'false');
    }
  };

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
      if (document.body) document.body.scrollTop = 0;
      if (document.documentElement) document.documentElement.scrollTop = 0;
    }
  }, [screen]);
  
  const [roomCount, setRoomCount] = useState<number>(0);
  const [testRoomCount, setTestRoomCount] = useState<number>(0);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedRoom && socket) {
      socket.emit('get_room_info', selectedRoom, (data: any) => {
        if (data && typeof data.count === 'number') {
          setRoomCount(data.count);
        }
      });
    }
  }, [selectedRoom, socket]);

  useEffect(() => {
    if (!socket) return;
    
    const fetchCount = () => {
      socket.emit('get_room_info', 'General #Test', (data: any) => {
        if (data && typeof data.count === 'number') {
          setTestRoomCount(data.count);
        }
      });
    };
    
    fetchCount();
    const interval = setInterval(fetchCount, 4000);
    return () => clearInterval(interval);
  }, [socket]);

  const handleRoomClick = (roomId: string) => {
    setSelectedRoom(roomId);
    setJoinError(null);
  };

  const handlePlay = () => {
    if (!nickname.trim()) {
      setNicknameError(true);
      return;
    }
    const finalName = nickname.trim();
    const finalRoom = selectedRoom || 'general';
    
    if (socket) {
      // Check again right before playing
      socket.emit('get_room_info', finalRoom, (data: any) => {
        if (data && data.count >= 5) {
          setJoinError('عذراً، هذه الغرفة ممتلئة بالكامل!');
          if (!selectedRoom) {
            // Also show it on home screen if they just clicked PLAY from there
             setNicknameError(false); // Can reuse or create specific error state, but joinError is fine
          }
        } else {
          onPlay(finalName, finalRoom, AVATARS[avatarIndex]);
        }
      });
    } else {
      onPlay(finalName, finalRoom, AVATARS[avatarIndex]);
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
    <div className="fixed inset-0 bg-game-primary-blue text-white font-sans flex flex-col overflow-hidden">
      
      {/* Home Screen */}
      {screen === 'home' && !afkWarning && !connLostWarning && (
        <div className="flex-1 flex flex-col items-center justify-between p-3 sm:p-5 z-10 w-full max-w-md mx-auto">
          {/* Header Row (Game Title and Settings Gear) */}
          <div className="w-full flex items-center justify-between mb-2 relative px-2 mt-2">
            {/* Spacer for symmetry on the left */}
            <div className="w-10 h-10 pointer-events-none invisible" />

            {/* Center Game Title */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
              <GameTitle 
                text="DRAW.IO" 
                type="skip" 
                className="text-[38px] sm:text-[42px]" 
              />
            </div>

            {/* Settings button on the right side of the header row */}
            <button 
              onClick={() => setShowSettingsModal(true)}
              className="w-10 h-10 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 text-white backdrop-blur-md cursor-pointer z-20 shadow-md"
              title="الإعدادات"
            >
              <Settings size={20} />
            </button>
          </div>

          {/* White/Light-purple Card */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-[85%] max-w-[340px] bg-[#ECEBFC] py-5 px-6 sm:px-8 rounded-[32px] shadow-2xl relative border border-white/40 flex flex-col my-2 text-[#2E2882] justify-center items-center min-h-0"
          >
            {/* Content body wrapper */}
            <div className="space-y-4 flex flex-col items-center w-full">
              {/* Avatar Selector */}
              <div className="flex flex-col items-center gap-2 w-full">
                <label className="text-sm font-black text-[#8C8AA7] uppercase tracking-wider">CHOOSE AVATAR</label>
                
                <div className="flex items-center justify-between w-full relative max-w-[280px] sm:max-w-[320px]">
                  <button 
                    onClick={() => setAvatarIndex((prev) => (prev - 1 + AVATARS.length) % AVATARS.length)}
                    className="w-11 h-11 bg-white hover:bg-slate-50 border border-[#2E2882]/10 rounded-full flex items-center justify-center transition-all active:scale-90 text-[#2E2882] shadow-sm cursor-pointer"
                  >
                    <ChevronLeft strokeWidth={3.5} className="w-5 h-5" />
                  </button>
                  
                  <div className="relative group cursor-pointer" onClick={() => setShowAvatarGrid(true)}>
                    <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-white border-4 border-[#38BDF8] flex items-center justify-center shadow-md hover:scale-105 transition-transform select-none overflow-hidden">
                      <span className="text-[80px] sm:text-[96px] translate-y-1 sm:translate-y-2 leading-none flex items-center justify-center select-none">{AVATARS[avatarIndex]}</span>
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-full">
                         <LayoutGrid className="text-white" size={28} />
                      </div>
                    </div>
                    {/* Small grid badge */}
                    <div className="absolute -bottom-1 -right-1 bg-[#38BDF8] p-2 rounded-full border-2 border-white text-white shadow-md transition-transform hover:scale-110 active:scale-95">
                      <LayoutGrid size={16} strokeWidth={3} />
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setAvatarIndex((prev) => (prev + 1) % AVATARS.length)}
                    className="w-11 h-11 bg-white hover:bg-slate-50 border border-[#2E2882]/10 rounded-full flex items-center justify-center transition-all active:scale-90 text-[#2E2882] shadow-sm cursor-pointer"
                  >
                    <ChevronRight strokeWidth={3.5} className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="w-full space-y-2 max-w-[280px] sm:max-w-[320px]">
                <label className="text-xs font-black text-[#8C8AA7] uppercase tracking-wide">NICKNAME</label>
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
                  onFocus={() => {
                    if (typeof window !== 'undefined') {
                      setTimeout(() => {
                        window.scrollTo(0, 0);
                        if (document.body) document.body.scrollTop = 0;
                      }, 50);
                    }
                  }}
                  onBlur={() => {
                    if (typeof window !== 'undefined') {
                      setTimeout(() => {
                        window.scrollTo(0, 0);
                        if (document.body) document.body.scrollTop = 0;
                        if (document.documentElement) document.documentElement.scrollTop = 0;
                      }, 80);
                    }
                  }}
                  placeholder="Enter your name..."
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  name="nickname_input_random_name"
                  data-form-type="other"
                  style={{ resize: 'none' }}
                  className={`w-full h-14 py-3.5 bg-white text-[#2E2882] placeholder-[#8C8AA7]/50 border-2 rounded-2xl px-5 font-black text-base outline-none transition-all focus:bg-white overflow-hidden whitespace-nowrap ${nicknameError ? 'border-red-400 focus:border-red-400' : 'border-[#2E2882]/10 focus:border-[#38BDF8]'}`}
                />
              </div>
            </div>
          </motion.div>

          {/* Bottom Rooms button OUTSIDE the white card */}
          <button 
            onClick={handleGoToRooms}
            className="w-[85%] sm:w-[75%] max-w-[320px] mx-auto h-14 sm:h-16 bg-[#38BDF8] hover:bg-[#0EA5E9] text-white rounded-[24px] font-black text-lg sm:text-xl flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-lg mb-2"
          >
            <span>ROOMS</span>
          </button>
        </div>
      )}

      {/* Rooms Browser Screen */}
      {screen === 'rooms' && (
        <div className="flex-1 flex flex-col items-center justify-between p-3 sm:p-5 z-10 w-full max-w-md mx-auto">
          {/* Header Row (Back Button and "ROOMS" Title) */}
          <div className="w-full flex items-center justify-between mb-2 relative px-2 mt-2">
            {/* Back button */}
            <button 
              onClick={() => setScreen('home')}
              className="w-10 h-10 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center text-[#2E2882] active:scale-90 transition-transform shadow-md cursor-pointer border border-[#2E2882]/10 z-20"
            >
              <ChevronLeft size={20} strokeWidth={4} />
            </button>

            {/* Title */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
              <GameTitle 
                text="ROOMS" 
                type="skip" 
                className="text-[34px] sm:text-[36px]" 
              />
            </div>

            {/* Spacer for symmetry */}
            <div className="w-10 h-10 pointer-events-none invisible" />
          </div>

          {/* White/Light-purple Room Card */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-[85%] max-w-[340px] mx-auto bg-[#ECEBFC] p-4 sm:p-6 rounded-[32px] shadow-2xl relative border border-white/40 flex flex-col flex-1 my-2 text-[#2E2882] overflow-hidden min-h-0"
          >
            {/* List - Positioned cleanly at the top of the white container */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 no-scrollbar">
              {/* Dummy Room Item - Enlarged for premium layout */}
              <button 
                onClick={() => handleRoomClick('General #Test')}
                className="w-full bg-white hover:bg-slate-50 border border-[#2E2882]/5 hover:border-[#38BDF8]/20 p-5 sm:p-6 rounded-[28px] flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer shadow-md group"
              >
                <div className="flex flex-col items-start">
                  <span className="font-black text-lg sm:text-xl text-[#2E2882] group-hover:text-[#38BDF8] transition-colors flex items-center gap-2">
                    General <span className="text-[#8C8AA7]/70 font-semibold text-xs sm:text-sm">#Test</span>
                  </span>
                </div>
                {/* Style optimized: No blue frame, dark blue text & icon */}
                <div className="flex items-center gap-1.5 text-[#2E2882] font-black text-base sm:text-lg px-1">
                  <Users size={20} strokeWidth={3.5} className="text-[#2E2882]" />
                  <span>{testRoomCount}/5</span>
                </div>
              </button>
            </div>
          </motion.div>

          {/* Bottom New Room button OUTSIDE the white card */}
          <button className="w-[85%] sm:w-[75%] max-w-[320px] mx-auto h-14 sm:h-16 bg-[#38BDF8] hover:bg-[#0EA5E9] text-white rounded-[24px] font-black text-lg sm:text-xl flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-lg mb-2">
            <Plus size={22} strokeWidth={4} />
            <span>NEW ROOM</span>
          </button>
        </div>
      )}

      {/* Room Info Modal */}
      <CinematicModal
        isOpen={!!selectedRoom}
        onClose={() => setSelectedRoom(null)}
        titleType="report"
        titleText="INFO"
        buttons={[
          {
            id: "room-info-play-btn",
            text: <span className="text-white font-black">PLAY</span>,
            onClick: handlePlay,
            variant: "danger",
            icon: <Play className="w-5 h-5 shadow-sm" fill="currentColor" strokeWidth={3} />,
          },
        ]}
      >
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-full bg-[#FB923C]/10 flex items-center justify-center mb-6 mt-2 relative">
            <Settings size={40} className="text-[#FB923C] animate-spin-slow" strokeWidth={3} />
          </div>
          
          <h3 className="text-2xl font-black text-[#2E2882] mb-6 text-center">{selectedRoom}</h3>

          <div className="grid grid-cols-3 gap-2.5 w-full mb-4">
            <div className="text-center bg-white border border-[#2E2882]/10 p-2.5 rounded-2xl flex flex-col justify-center shadow-sm">
              <div className="text-[#8C8AA7] text-[10px] font-black uppercase tracking-wider mb-1">Players</div>
              <div className="text-[#2E2882] font-black text-base">{roomCount}/5</div>
            </div>
            <div className="text-center bg-white border border-[#2E2882]/10 p-2.5 rounded-2xl flex flex-col justify-center shadow-sm">
              <div className="text-[#8C8AA7] text-[10px] font-black uppercase tracking-wider mb-1">Theme</div>
              <div className="text-[#2E2882] font-bold text-[13px] leading-relaxed truncate">General</div>
            </div>
            <div className="text-center bg-white border border-[#2E2882]/10 p-2.5 rounded-2xl flex flex-col justify-center shadow-sm">
              <div className="text-[#8C8AA7] text-[10px] font-black uppercase tracking-wider mb-1">To Win</div>
              <div className="text-[#FB923C] font-extrabold text-[13px] leading-relaxed justify-center">30 pts</div>
            </div>
          </div>
        </div>
      </CinematicModal>

      {/* Global Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] p-6 shadow-2xl max-w-[340px] w-[85%] text-slate-800 relative animate-in zoom-in-95 duration-200" dir="rtl">
            <button 
              onClick={() => setShowSettingsModal(false)}
              className="absolute top-4 right-4 w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 active:scale-95 transition-transform"
            >
              <X size={18} />
            </button>

            <div className="flex flex-col items-center mt-2">
              <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center mb-4">
                <Settings size={32} className="text-[#7C4DFF]" strokeWidth={2.5} />
              </div>
              
              <h2 className="text-xl font-black mb-4 text-center text-slate-800">إعدادات اللعبة الرسمية</h2>
              
              <div className="w-full space-y-4 mb-6">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-700">وضع التكبير والسحب (Zoom & Pan)</span>
                    <button 
                      onClick={toggleLocalZoom}
                      className={`w-12 h-7.5 rounded-full p-1 transition-colors duration-200 outline-none focus:outline-none flex items-center ${localZoomEnabled ? 'bg-[#10B981] justify-end' : 'bg-slate-300 justify-start'}`}
                    >
                      <div className="w-5 h-5 bg-white rounded-full shadow-md" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                    يتيح لك استخدام <span className="font-bold text-slate-700">إصبعين</span> على الهواتف لتكبير وتحريك ساحة الرسم لتفاصيل أدق، أو استخدام <span className="font-bold text-slate-700">الزر الأيمن للفأرة</span> على الكمبيوتر.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-primary-brand/5 border border-primary-brand/10 text-primary-brand font-bold text-xs text-center leading-relaxed">
                  ⚡ ميزة ذكية: إذا تم تعطيل هذا الوضع، فلن يتم استهلاك أي طاقة أو موارد من المعالج والمستشعرات لضمان أداء سلس بنسبة 100% للأجهزة الضعيفة.
                </div>
              </div>

              <button 
                onClick={() => setShowSettingsModal(false)}
                className="w-full h-12 bg-primary-brand hover:bg-primary-brand-dark text-white rounded-xl font-bold flex items-center justify-center transition-all active:scale-95 text-sm"
              >
                حفظ وإغلاق
              </button>
            </div>
          </div>
        </div>
      )}

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
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={() => setShowAvatarGrid(false)} />
          <div className="relative w-[85%] max-w-[340px] bg-white rounded-3xl p-5 border border-white/40 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-black text-[#38BDF8]">ALL AVATARS</span>
              <button onClick={() => setShowAvatarGrid(false)} className="text-[#8C8AA7] hover:text-[#2E2882] bg-slate-100 p-1.5 rounded-full transition-colors active:scale-90">
                <X size={18} strokeWidth={3} />
              </button>
            </div>
            <div className="grid grid-cols-6 gap-2 overflow-y-auto max-h-[300px] sm:max-h-[400px] no-scrollbar">
              {AVATARS.map((emoji, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => { setAvatarIndex(idx); setShowAvatarGrid(false); }}
                  className={`text-3xl h-12 w-12 flex items-center justify-center hover:scale-125 transition-transform ${idx === avatarIndex ? 'bg-[#38BDF8]/15 rounded-xl scale-110 border border-[#38BDF8]/30 font-black shadow-inner' : ''}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Background decoration */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary-brand rounded-full mix-blend-overlay filter blur-[100px] opacity-20 pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-accent-brand rounded-full mix-blend-overlay filter blur-[100px] opacity-20 pointer-events-none" />
    </div>
  );
}

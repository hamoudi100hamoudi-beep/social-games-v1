import React, { useState, useEffect } from 'react';
import { Users, Settings, Plus, Play, ChevronLeft, ChevronRight, Search, X, LayoutGrid, Check, WifiOff, AlertTriangle } from 'lucide-react';
import { useSocket } from './SocketProvider';
import { motion, AnimatePresence } from 'motion/react';
import CinematicModal from './game/CinematicModal';
import { safeLocalStorage } from '../utils/storage';

interface LobbyProps {
  onPlay: (nickname: string, room: string, avatar: string) => void;
}

const AVATARS = [
  '😊', '😂', '😎', '🤪', '😍', '🤔', '🥶', '😡', '🤡', '🤠', '👽', '👻', '🤖', '💩', '👾', '👹', 
  '🐱', '🐶', '🦊', '🐼', '🦁', '🐯', '🐰', '🐭', '🐹', '🐻', '🐨', '🐷', '🐸', '🐵', '🐔', '🐧', 
  '🦆', '🦉', '🦄', '🦖', '🐙', '🦋', '🐞', '🐢', '🐍', '🐬', '🐳', '🦈', '🐊', '🐅', '🐆', '🦓'
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
  const [afkWarning, setAfkWarning] = useState(false);
  const [connLostWarning, setConnLostWarning] = useState(false);

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
      const reason = safeLocalStorage.getItem('gartic_session_expired_reason');
      const isAfk = safeLocalStorage.getItem('gartic_afk_kicked') === 'true' || reason === 'afk_idle' || reason === 'afk_kicked';
      const isConnLost = safeLocalStorage.getItem('gartic_connection_lost') === 'true' || reason === 'connection_lost';
      
      if (isAfk) {
        setAfkWarning(true);
        safeLocalStorage.removeItem('gartic_afk_kicked');
      } else if (isConnLost) {
        setConnLostWarning(true);
        safeLocalStorage.removeItem('gartic_connection_lost');
      }
      
      safeLocalStorage.removeItem('gartic_session_expired_reason');
    }
  }, []);

  useEffect(() => {
    if (socket && !socket.connected) {
      console.log("[Lobby] Socket is disconnected. Reconnecting cleanly...");
      socket.connect();
    }
  }, [socket]);
  
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
    <div className="w-full h-full min-h-screen bg-game-primary-blue text-white font-sans flex flex-col relative overflow-hidden">
      
      {/* Settings gear in top corner */}
      {screen === 'home' && (
        <button 
          onClick={() => setShowSettingsModal(true)}
          className="absolute top-4 right-4 z-40 w-11 h-11 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 text-white backdrop-blur-md"
          title="الإعدادات"
        >
          <Settings size={22} />
        </button>
      )}

      {/* Home Screen */}
      {screen === 'home' && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 z-10">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-sm bg-[#ECEBFC] pt-6 pb-8 px-6 sm:px-8 rounded-[32px] shadow-2xl relative border border-white/40 flex flex-col h-auto text-[#2E2882]"
          >
            {/* Title flag */}
            <div className="text-center mb-6 mt-1 select-none">
              <h1 className="cartoon-title-profile text-[42px] tracking-widest uppercase text-center">
                DRAW.IO
              </h1>
            </div>
            
            {/* Content body wrapper */}
            <div className="space-y-6 flex flex-col items-center w-full">
              {/* Avatar Selector */}
              <div className="flex flex-col items-center gap-2 w-full">
                <label className="text-xs font-black text-[#8C8AA7] uppercase tracking-wide">CHOOSE AVATAR</label>
                
                {!showAvatarGrid ? (
                  <div className="flex items-center justify-between w-full relative">
                    <button 
                      onClick={() => setAvatarIndex((prev) => (prev - 1 + AVATARS.length) % AVATARS.length)}
                      className="w-11 h-11 bg-white hover:bg-slate-50 border border-[#2E2882]/10 rounded-full flex items-center justify-center transition-all active:scale-90 text-[#2E2882] shadow-sm cursor-pointer"
                    >
                      <ChevronLeft strokeWidth={3.5} className="w-5 h-5" />
                    </button>
                    
                    <div className="relative group cursor-pointer" onClick={() => setShowAvatarGrid(true)}>
                      <div className="w-24 h-24 rounded-full bg-white border-4 border-[#38BDF8] flex items-center justify-center shadow-md hover:scale-105 transition-transform select-none overflow-hidden">
                        <span className="text-[64px] translate-y-1">{AVATARS[avatarIndex]}</span>
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                           <LayoutGrid className="text-white" size={24} />
                        </div>
                      </div>
                      {/* Small grid badge */}
                      <div className="absolute -bottom-1 -right-1 bg-[#38BDF8] p-1.5 rounded-full border-2 border-white text-white shadow-md transition-transform hover:scale-110 active:scale-95">
                        <LayoutGrid size={14} strokeWidth={3} />
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => setAvatarIndex((prev) => (prev + 1) % AVATARS.length)}
                      className="w-11 h-11 bg-white hover:bg-slate-50 border border-[#2E2882]/10 rounded-full flex items-center justify-center transition-all active:scale-90 text-[#2E2882] shadow-sm cursor-pointer"
                    >
                      <ChevronRight strokeWidth={3.5} className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="w-full bg-white rounded-2xl p-4 border border-[#2E2882]/10 relative animate-in zoom-in-95 duration-200 shadow-md">
                    <div className="flex justify-between items-center mb-2.5">
                      <span className="text-xs font-black text-[#38BDF8]">ALL AVATARS</span>
                      <button onClick={() => setShowAvatarGrid(false)} className="text-[#8C8AA7] hover:text-[#2E2882] bg-slate-100 p-1 rounded-full transition-colors active:scale-90">
                        <X size={14} strokeWidth={3} />
                      </button>
                    </div>
                    <div className="grid grid-cols-6 gap-1.5 overflow-y-auto max-h-[140px] no-scrollbar">
                      {AVATARS.map((emoji, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => { setAvatarIndex(idx); setShowAvatarGrid(false); }}
                          className={`text-2xl h-9 w-9 flex items-center justify-center hover:scale-125 transition-transform ${idx === avatarIndex ? 'bg-[#38BDF8]/15 rounded-lg scale-110 border border-[#38BDF8]/30 font-black' : ''}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="w-full space-y-1">
                <label className="text-xs font-black text-[#8C8AA7] uppercase tracking-wide">NICKNAME</label>
                <input 
                  type="text" 
                  maxLength={10}
                  value={nickname}
                  onChange={(e) => { setNickname(e.target.value); setNicknameError(false); setJoinError(null); }}
                  placeholder="Enter your name..."
                  className={`w-full h-13 bg-white text-[#2E2882] placeholder-[#8C8AA7]/50 border-2 rounded-2xl px-5 font-black text-base outline-none transition-all focus:bg-white ${nicknameError ? 'border-red-400 focus:border-red-400' : 'border-[#2E2882]/10 focus:border-[#38BDF8]'}`}
                />
              </div>

              <button 
                onClick={handleGoToRooms}
                className="w-full h-14 bg-[#FB923C] hover:bg-[#EA580C] text-white rounded-2xl font-black text-lg border-b-4 border-[#EA580C] shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>ROOMS</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Rooms Browser Screen */}
      {screen === 'rooms' && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 z-10 w-full">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-sm bg-[#ECEBFC] pt-5 pb-8 px-5 sm:px-6 rounded-[32px] shadow-2xl relative border border-white/40 flex flex-col h-[525px] text-[#2E2882]"
          >
            {/* Back button */}
            <button 
              onClick={() => setScreen('home')}
              className="absolute top-5 left-5 w-10 h-10 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center text-[#2E2882] active:scale-90 transition-transform shadow-sm cursor-pointer border border-[#2E2882]/10"
            >
              <ChevronLeft size={22} strokeWidth={3.5} />
            </button>

            {/* Header */}
            <div className="text-center mb-5 mt-1 select-none">
              <h2 className="cartoon-title-skip text-[36px] tracking-widest uppercase">
                ROOMS
              </h2>
            </div>

            {/* Search Bar */}
            <div className="relative mb-4">
              <input 
                type="text" 
                placeholder="Search a room..."
                className="w-full h-12 bg-white rounded-2xl px-4 pl-11 font-black text-[#2E2882] placeholder-[#8C8AA7]/60 outline-none border border-[#2E2882]/10 focus:border-[#38BDF8] transition-colors shadow-inner"
              />
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8C8AA7]" strokeWidth={2.5} />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3 mb-4 no-scrollbar">
              {/* Dummy Room Item */}
              <button 
                onClick={() => handleRoomClick('General #Test')}
                className="w-full bg-white hover:bg-slate-50 border-2 border-[#2E2882]/10 hover:border-[#38BDF8]/40 p-4 rounded-3xl flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer shadow-sm group"
              >
                <div className="flex flex-col items-start">
                  <span className="font-black text-base text-[#2E2882] group-hover:text-[#38BDF8] transition-colors">General <span className="text-[#8C8AA7]/75 font-semibold">#Test</span></span>
                </div>
                <div className="flex items-center gap-1.5 text-white font-black text-xs bg-[#38BDF8] border-b-4 border-[#0EA5E9] px-3 py-1.5 rounded-2xl shadow-sm">
                  <Users size={15} strokeWidth={3} />
                  <span>{testRoomCount}/5</span>
                </div>
              </button>
            </div>

            {/* Bottom button */}
            <button className="w-full h-14 bg-[#38BDF8] hover:bg-[#0EA5E9] text-white rounded-2xl font-black text-lg border-b-4 border-[#0EA5E9] flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-md">
              <Plus size={20} strokeWidth={3.5} />
              <span>NEW ROOM</span>
            </button>
          </motion.div>
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
          <div className="bg-white rounded-[32px] p-6 shadow-2xl max-w-sm w-[90%] text-slate-800 relative animate-in zoom-in-95 duration-200" dir="rtl">
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

      {/* Background decoration */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary-brand rounded-full mix-blend-overlay filter blur-[100px] opacity-20 pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-accent-brand rounded-full mix-blend-overlay filter blur-[100px] opacity-20 pointer-events-none" />
    </div>
  );
}

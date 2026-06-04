import React, { useState, useEffect } from 'react';
import { Users, Settings, Plus, Play, ChevronLeft, ChevronRight, Search, X, LayoutGrid } from 'lucide-react';
import { useSocket } from './SocketProvider';

interface LobbyProps {
  onPlay: (nickname: string, room: string, avatar: string) => void;
}

const AVATARS = [
  '😊', '😂', '😎', '🤪', '😍', '🤔', '🥶', '😡', '🤡', '🤠', '👽', '👻', '🤖', '💩', '👾', '👹', 
  '🐱', '🐶', '🦊', '🐼', '🦁', '🐯', '🐰', '🐭', '🐹', '🐻', '🐨', '🐷', '🐸', '🐵', '🐔', '🐧', 
  '🦆', '🦉', '🦄', '🦖', '🐙', '🦋', '🐞', '🐢', '🐍', '🐬', '🐳', '🦈', '🐊', '🐅', '🐆', '🦓'
];

type Screen = 'home' | 'rooms';

export default function Lobby({ onPlay }: LobbyProps) {
  const { socket } = useSocket();
  const [screen, setScreen] = useState<Screen>('home');
  const [nickname, setNickname] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('gartic_player_nickname') || '';
    }
    return '';
  });
  const [avatarIndex, setAvatarIndex] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gartic_player_avatar_index');
      if (saved !== null) {
        return parseInt(saved, 10);
      }
    }
    return Math.floor(Math.random() * AVATARS.length);
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('gartic_player_nickname', nickname);
    }
  }, [nickname]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('gartic_player_avatar_index', avatarIndex.toString());
    }
  }, [avatarIndex]);
  const [showAvatarGrid, setShowAvatarGrid] = useState(false);
  const [nicknameError, setNicknameError] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [afkWarning, setAfkWarning] = useState(false);

  // Home screen settings modal states
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [localZoomEnabled, setLocalZoomEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('gartic_zoom_enabled') === 'true';
    }
    return false;
  });

  const toggleLocalZoom = () => {
    const nextVal = !localZoomEnabled;
    setLocalZoomEnabled(nextVal);
    if (typeof window !== 'undefined') {
      localStorage.setItem('gartic_zoom_enabled', nextVal ? 'true' : 'false');
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (localStorage.getItem('gartic_afk_kicked') === 'true') {
        setAfkWarning(true);
        localStorage.removeItem('gartic_afk_kicked');
      }
    }
  }, []);
  
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
    <div className="w-full h-full min-h-screen bg-gradient-to-br from-[#3b2082] via-[#5c36cc] to-[#7C4DFF] text-white font-sans flex flex-col relative overflow-hidden">
      
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
        <div className="flex-1 flex flex-col items-center justify-center p-6 z-10">
          <div className="w-full max-w-sm space-y-8 flex flex-col items-center">
            
            <div className="text-5xl font-black tracking-tight mb-4 drop-shadow-lg text-white">
              DRAW<span className="text-[#00D9FF]">.</span>IO
            </div>
            
            {/* Avatar Selector */}
            <div className="flex flex-col items-center gap-3">
              <label className="text-sm font-bold text-white/90">CHOOSE AVATAR</label>
              
              {!showAvatarGrid ? (
                <div className="flex items-center gap-6 relative">
                  <button 
                    onClick={() => setAvatarIndex((prev) => (prev - 1 + AVATARS.length) % AVATARS.length)}
                    className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all active:scale-95 text-white/70 hover:text-white"
                  >
                    <ChevronLeft strokeWidth={3} />
                  </button>
                  
                  <div className="relative group cursor-pointer" onClick={() => setShowAvatarGrid(true)}>
                    <div className="w-28 h-28 rounded-full bg-white/20 border-4 border-[#00D9FF] flex items-center justify-center shadow-[0_0_20px_rgba(0,217,255,0.4)] transition-transform select-none overflow-hidden">
                      <span className="text-[72px] translate-y-1">{AVATARS[avatarIndex]}</span>
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                         <LayoutGrid className="text-white" size={32} />
                      </div>
                    </div>
                    {/* Small grid badge */}
                    <div className="absolute -bottom-1 -right-1 bg-[#00D9FF] p-2 rounded-full border-2 border-[#1A103C] text-[#1A103C] hover:bg-white shadow-lg transition-transform hover:scale-110 active:scale-95">
                      <LayoutGrid size={18} />
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setAvatarIndex((prev) => (prev + 1) % AVATARS.length)}
                    className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all active:scale-95 text-white/70 hover:text-white"
                  >
                    <ChevronRight strokeWidth={3} />
                  </button>
                </div>
              ) : (
                <div className="w-full max-w-sm bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 relative animate-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-[#00D9FF]">ALL AVATARS</span>
                    <button onClick={() => setShowAvatarGrid(false)} className="text-white/50 hover:text-white bg-black/20 p-1 rounded-full transition-colors active:scale-95">
                      <X size={16} />
                    </button>
                  </div>
                  {/* Hide standard scrollbars cleanly */}
                  <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 overflow-y-auto max-h-[160px]" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {AVATARS.map((emoji, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setAvatarIndex(idx); setShowAvatarGrid(false); }}
                        className={`text-2xl h-10 w-10 flex items-center justify-center hover:scale-125 transition-transform ${idx === avatarIndex ? 'bg-white/20 rounded-lg scale-110' : ''}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="w-full space-y-4">
              {afkWarning && (
                <div className="w-full bg-amber-500/10 border border-amber-500/40 text-amber-200 font-bold p-4 rounded-2xl flex flex-col gap-1 text-center text-xs relative select-none animate-in fade-in slide-in-from-top-2 duration-300">
                  <span className="text-sm font-black text-amber-300">⚠️ تنبيه خمول النظام</span>
                  <span>تم إخراجك تلقائياً بسبب خمول طويل وتوفير باقة البيانات/الطاقة!</span>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-sm font-bold ml-2 text-white/90">NICKNAME</label>
                <input 
                  type="text" 
                  maxLength={10}
                  value={nickname}
                  onChange={(e) => { setNickname(e.target.value); setNicknameError(false); setJoinError(null); }}
                  placeholder="Enter your name..."
                  className={`w-full h-14 bg-white/10 backdrop-blur-md text-white placeholder-white/50 border-2 rounded-2xl px-6 font-bold text-lg outline-none transition-all focus:bg-white/20 ${nicknameError ? 'border-red-400 focus:border-red-400' : 'border-white/20 focus:border-[#00D9FF]'}`}
                />
              </div>
              {joinError && (
                <div className="text-center text-red-300 font-bold bg-red-900/40 p-2 rounded-xl border border-red-500/50">
                  {joinError}
                </div>
              )}
            </div>

            <button 
              onClick={handleGoToRooms}
              className="w-full h-14 bg-[#7C4DFF] text-white rounded-2xl font-bold text-xl shadow-[0_4px_20px_rgba(124,77,255,0.5)] hover:shadow-[0_6px_25px_rgba(124,77,255,0.7)] hover:-translate-y-1 transition-all active:translate-y-0 active:shadow-[0_2px_10px_rgba(124,77,255,0.4)] flex items-center justify-center gap-2"
            >
              <span>ROOMS</span>
            </button>
          </div>
        </div>
      )}

      {/* Rooms Browser Screen */}
      {screen === 'rooms' && (
        <div className="flex-1 flex flex-col h-full z-10">
          {/* Header */}
          <div className="flex items-center justify-between p-6 shrink-0">
            <button 
              onClick={() => setScreen('home')}
              className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center active:scale-95 transition-transform backdrop-blur-md"
            >
              <ChevronLeft size={28} className="text-white" />
            </button>
            <h1 className="text-2xl font-black tracking-wide text-white">ROOMS</h1>
            <div className="w-12 h-12"></div>
          </div>

          {/* Rooms List Container */}
          <div className="flex-1 bg-slate-50 rounded-t-[32px] sm:rounded-3xl sm:mx-4 sm:mb-4 sm:flex-none sm:h-[600px] flex flex-col overflow-hidden shadow-2xl relative text-slate-800">
            
            {/* Search Bar */}
            <div className="p-4 sm:p-6 border-b border-slate-200 shrink-0">
               <div className="relative">
                 <input 
                   type="text" 
                   placeholder="Search a room..."
                   className="w-full h-12 bg-slate-200/50 rounded-2xl px-4 pl-12 font-bold text-slate-700 outline-none focus:bg-slate-200 transition-colors"
                 />
                 <Search size={22} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
               </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 space-y-3">
              
              {/* Dummy Room Item */}
              <button 
                onClick={() => handleRoomClick('General #Test')}
                className="w-full bg-white border-2 border-slate-100 p-4 rounded-3xl flex items-center justify-between active:border-[#00D9FF] active:bg-[#00D9FF]/5 transition-colors"
              >
                <div className="flex flex-col items-start">
                  <span className="font-bold text-lg text-slate-800">General <span className="text-slate-400 font-medium">#Test</span></span>
                </div>
                <div className="flex items-center gap-2 text-[#00D9FF] font-black text-lg bg-[#00D9FF]/10 px-4 py-2 rounded-2xl">
                  <Users size={20} strokeWidth={3} />
                  <span>{testRoomCount}/5</span>
                </div>
              </button>
              
            </div>

            {/* Bottom Actions */}
            <div className="p-4 sm:p-6 bg-white border-t border-slate-100 shrink-0">
               <button className="w-full h-14 bg-slate-100 text-slate-700 rounded-2xl font-bold text-xl border-2 border-slate-200 flex items-center justify-center gap-2 active:bg-slate-200 transition-colors">
                 <Plus size={24} strokeWidth={3} />
                 <span>NEW ROOM</span>
               </button>
            </div>

          </div>
        </div>
      )}

      {/* Room Info Modal */}
      {selectedRoom && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-[32px] p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-slate-800 relative">
            
            <button 
              onClick={() => setSelectedRoom(null)}
              className="absolute top-4 right-4 w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 active:scale-95 transition-transform"
            >
              <X size={20} className="w-full h-full p-2" />
            </button>

            <div className="flex flex-col items-center mt-4">
              <div className="w-24 h-24 rounded-full bg-[#00D9FF]/10 flex items-center justify-center mb-6">
                <Settings size={48} className="text-[#00D9FF]" strokeWidth={2.5} />
              </div>
              
              <h2 className="text-2xl font-black mb-8 text-center">{selectedRoom}</h2>

              <div className="grid grid-cols-3 gap-2.5 w-full mb-8">
                <div className="text-center bg-slate-50 p-2.5 rounded-2xl flex flex-col justify-center">
                  <div className="text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">Players</div>
                  <div className="text-[#00D9FF] font-black text-base">{roomCount}/5</div>
                </div>
                <div className="text-center bg-slate-50 p-2.5 rounded-2xl flex flex-col justify-center">
                  <div className="text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">Theme</div>
                  <div className="text-slate-700 font-bold text-[13px] leading-relaxed truncate">General</div>
                </div>
                <div className="text-center bg-slate-50 p-2.5 rounded-2xl flex flex-col justify-center border border-amber-100/40">
                  <div className="text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">To Win</div>
                  <div className="text-amber-500 font-extrabold text-[13px] leading-relaxed">30 pts</div>
                </div>
              </div>

              {joinError && (
                <div className="w-full text-center text-red-500 font-bold bg-red-50 p-3 rounded-xl border border-red-200 mb-4">
                  {joinError}
                </div>
              )}

              <button 
                onClick={handlePlay}
                className="w-full h-14 bg-[#7C4DFF] text-white rounded-2xl font-bold text-xl shadow-[0_4px_20px_rgba(124,77,255,0.4)] flex items-center justify-center gap-3 active:scale-95 transition-all"
              >
                <Play size={24} fill="currentColor" />
                <span>PLAY</span>
              </button>
            </div>
          </div>
        </div>
      )}

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

                <div className="p-3.5 rounded-2xl bg-violet-50/50 border border-violet-100 text-violet-800 text-xs text-center font-bold leading-relaxed">
                  ⚡ ميزة ذكية: إذا تم تعطيل هذا الوضع، فلن يتم استهلاك أي طاقة أو موارد من المعالج والمستشعرات لضمان أداء سلس بنسبة 100% للأجهزة الضعيفة.
                </div>
              </div>

              <button 
                onClick={() => setShowSettingsModal(false)}
                className="w-full h-12 bg-[#7C4DFF] hover:bg-[#6c3fe6] text-white rounded-xl font-bold flex items-center justify-center transition-all active:scale-95 text-sm"
              >
                حفظ وإغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background decoration */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#00D9FF] rounded-full mix-blend-overlay filter blur-[100px] opacity-20 pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-[#7C4DFF] rounded-full mix-blend-overlay filter blur-[100px] opacity-50 pointer-events-none" />
    </div>
  );
}

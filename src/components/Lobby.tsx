import React, { useState } from 'react';
import { Users, Settings, Plus, Play, ChevronLeft, Search, X } from 'lucide-react';

interface LobbyProps {
  onPlay: (nickname: string, room: string) => void;
}

type Screen = 'home' | 'rooms';

export default function Lobby({ onPlay }: LobbyProps) {
  const [screen, setScreen] = useState<Screen>('home');
  const [nickname, setNickname] = useState('');
  const [nicknameError, setNicknameError] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  const handleRoomClick = (roomId: string) => {
    setSelectedRoom(roomId);
  };

  const handlePlay = () => {
    if (!nickname.trim()) {
      setNicknameError(true);
      return;
    }
    const finalName = nickname.trim();
    onPlay(finalName, selectedRoom || 'general');
  };

  const handleGoToRooms = () => {
    if (!nickname.trim()) {
      setNicknameError(true);
      return;
    }
    setNicknameError(false);
    setScreen('rooms');
  };

  return (
    <div className="w-full h-full min-h-screen bg-gradient-to-br from-[#3b2082] via-[#5c36cc] to-[#7C4DFF] text-white font-sans flex flex-col relative overflow-hidden">
      
      {/* Home Screen */}
      {screen === 'home' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 z-10">
          <div className="w-full max-w-sm space-y-8 flex flex-col items-center">
            
            <div className="text-5xl font-black tracking-tight mb-4 drop-shadow-lg text-white">
              DRAW<span className="text-[#00D9FF]">.</span>IO
            </div>
            
            <div className="w-full space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-bold ml-2 text-white/90">NICKNAME</label>
                <input 
                  type="text" 
                  value={nickname}
                  onChange={(e) => { setNickname(e.target.value); setNicknameError(false); }}
                  placeholder="Enter your name..."
                  className={`w-full h-14 bg-white/10 backdrop-blur-md text-white placeholder-white/50 border-2 rounded-2xl px-6 font-bold text-lg outline-none transition-all focus:bg-white/20 ${nicknameError ? 'border-red-400 focus:border-red-400' : 'border-white/20 focus:border-[#00D9FF]'}`}
                />
              </div>
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
                  <span>5/10</span>
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

              <div className="grid grid-cols-2 gap-4 w-full mb-8">
                <div className="text-center bg-slate-50 p-4 rounded-2xl">
                  <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Players</div>
                  <div className="text-[#00D9FF] font-black text-xl">5/10</div>
                </div>
                <div className="text-center bg-slate-50 p-4 rounded-2xl">
                  <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Theme</div>
                  <div className="text-slate-700 font-bold text-lg">General</div>
                </div>
              </div>

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

      {/* Background decoration */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#00D9FF] rounded-full mix-blend-overlay filter blur-[100px] opacity-20 pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-[#7C4DFF] rounded-full mix-blend-overlay filter blur-[100px] opacity-50 pointer-events-none" />
    </div>
  );
}

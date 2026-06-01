import React from 'react';

interface Player {
  id: string;
  name: string;
  avatar: string;
  score: number;
  wins: number;
  isOffline?: boolean;
  persistentId?: string;
}

interface PlayersListProps {
  players: Player[];
  currentDrawerId: string | null;
}

export const PlayersList: React.FC<PlayersListProps> = ({ players, currentDrawerId }) => {
  // ترتيب اللاعبين تنازلياً حسب الأعلى نقاطاً
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="w-full bg-[#1C1145]/90 border border-white/10 rounded-2xl p-2.5 shadow-lg shrink-0" dir="rtl">
      <div className="flex justify-between items-center mb-1.5 px-1">
        <span className="text-[10px] font-black text-[#00D9FF]/90 uppercase tracking-wider">
          قائمة المنافسين ({players.length})
        </span>
        <span className="text-[9px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded-full border border-indigo-500/30">
          ترتيب النقاط 🏆
        </span>
      </div>

      <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-1 text-right">
        {sortedPlayers.map((player, index) => {
          const isDrawer = currentDrawerId === player.id || currentDrawerId === player.persistentId;
          const isFirstPlace = index === 0 && player.score > 0;
          
          return (
            <div
              key={player.id}
              className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all duration-300 min-w-[76px] max-w-[84px] shrink-0 relative ${
                player.isOffline
                  ? 'bg-slate-900/40 border-slate-700/30 opacity-40'
                  : isDrawer
                  ? 'bg-gradient-to-b from-[#3E2392] to-[#20144B] border-[#FFD700] shadow-[0_0_12px_rgba(255,215,0,0.25)]'
                  : 'bg-[#20144B]/80 border-white/5 hover:border-white/15'
              }`}
            >
              {/* التاج للمركز الأول */}
              {isFirstPlace && (
                <div className="absolute -top-2.5 -right-1.5 text-base drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] animate-bounce duration-1000">
                  👑
                </div>
              )}

              {/* دائرة الأفتار المتوهجة */}
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-2xl select-none relative mb-1.5 transition-transform duration-300 ${isDrawer ? 'scale-105' : ''}`}>
                <div className={`absolute inset-0 rounded-full border-2 ${
                  player.isOffline 
                    ? 'border-rose-500/50' 
                    : isDrawer 
                    ? 'border-[#FFD700] animate-pulse' 
                    : 'border-indigo-400/30'
                }`} />
                <span className="z-10">{player.avatar || '🦊'}</span>
              </div>

              {/* اسم اللاعب */}
              <span className={`text-[11px] font-bold truncate w-full text-center ${
                player.isOffline ? 'text-slate-500 line-through' : 'text-white'
              }`}>
                {player.name}
              </span>

              {/* مؤشر حالة الرسم أو النقاط */}
              <div className="mt-1">
                {isDrawer ? (
                  <span className="text-[8px] text-amber-300 font-extrabold flex items-center gap-0.5 justify-center bg-amber-500/10 px-1 py-0.5 rounded-md border border-amber-500/20">
                    ✍️ يرسم
                  </span>
                ) : (
                  <span className="text-[10px] font-black text-[#00D9FF] bg-[#00D9FF]/10 px-1.5 py-0.5 rounded-lg">
                    {player.score} ن
                  </span>
                )}
              </div>

              {/* انقطع الاتصال */}
              {player.isOffline && (
                <div className="absolute inset-0 bg-red-950/20 rounded-xl flex items-center justify-center">
                  <span className="bg-red-500 text-white text-[7px] font-black px-1 rounded-md animate-pulse">
                     أوفلاين
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};


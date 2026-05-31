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
  // ترتيب اللاعبين تنازلياً حسب الأعلى سكورت
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="w-full bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
      <h3 className="text-right text-xs font-bold text-slate-400 mb-2 border-b border-slate-100 pb-1">
        اللاعبون ({players.length})
      </h3>
      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
        {sortedPlayers.map((player, index) => {
          const isDrawer = currentDrawerId === player.id || currentDrawerId === player.persistentId;
          
          return (
            <div
              key={player.id}
              className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                player.isOffline
                  ? 'bg-slate-50 border-slate-200 opacity-60'
                  : isDrawer
                  ? 'bg-amber-50 border-amber-200 shadow-sm'
                  : 'bg-white border-slate-100'
              }`}
            >
              {/* جهة النقاط وحالة الاتصال */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
                  {player.score} ن
                </span>
                {player.isOffline && (
                  <span className="text-[10px] text-rose-500 font-medium animate-pulse">
                    انقطع الاتصال...
                  </span>
                )}
              </div>

              {/* جهة الاسم والرمز التعبيري المؤقت */}
              <div className="flex items-center gap-2 text-right">
                <div className="flex flex-col items-end">
                  <span className={`text-sm font-bold ${player.isOffline ? 'text-slate-400' : 'text-slate-700'}`}>
                    {player.name}
                  </span>
                  {isDrawer && (
                    <span className="text-[10px] text-amber-600 font-medium flex items-center gap-0.5">
                      ✏️ يرسم الآن
                    </span>
                  )}
                </div>
                
                {/* رتبة اللاعب رقم 1 يظهر بـ تاج ذهبي */}
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-sm text-slate-500 border border-slate-200">
                  {index === 0 && player.score > 0 ? '👑' : player.name.charAt(0).toUpperCase()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

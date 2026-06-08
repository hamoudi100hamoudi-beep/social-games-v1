import React from 'react';
import { motion } from 'motion/react';
import { User as UserIcon, Check, Pencil } from 'lucide-react';

export interface PlayerSlot {
  id: string;
  name: string;
  points: number | null;
  isCurrent: boolean;
  isEmpty?: boolean;
  avatar?: string;
  wins?: number;
  isOffline?: boolean;
  persistentId?: string;
}

interface PlayersSidebarProps {
  slots: PlayerSlot[];
  gameState: {
    status: string;
    correctGuessers?: string[];
  };
  morphMode: boolean;
  socketId: string | null;
}

export const PlayersSidebar: React.FC<PlayersSidebarProps> = ({
  slots,
  gameState,
  morphMode,
  socketId
}) => {
  return (
    <div className={`flex flex-col border-r border-[#00D9FF]/20 bg-[#24174D] overflow-y-auto overscroll-contain touch-pan-y
                    col-start-1 col-end-2 row-start-1 row-end-3
                   `}>
        {slots.map((slot) => {
          const isDrawer = slot.isCurrent;
          const isCorrectGuesser = !slot.isEmpty && gameState.status === 'DRAWING' && gameState.correctGuessers?.includes(slot.id);
          
          let bgClass = '';
          let borderClass = 'border-[#94A3B8]'; // Slate-400 for good visibility default
          let nameClass = 'text-white';
          let ptsClass = 'text-[#7C4DFF]';

          if (isDrawer) {
             bgClass = 'bg-[#00D9FF]/10'; // Cyan bg
             borderClass = 'border-[#00D9FF]'; // Cyan border
             nameClass = 'text-[#00D9FF]';
             ptsClass = 'text-[#00D9FF]';
          } else if (isCorrectGuesser) {
             bgClass = 'bg-[#10B981]/15'; // Greenish bg
             borderClass = 'border-[#10B981]'; // Green border
             nameClass = 'text-[#34D399]';
             ptsClass = 'text-[#34D399]';
          } else if (!slot.isEmpty) {
             borderClass = 'border-[#94A3B8]'; // Slate 400 default
          }

          return (
            <motion.div 
              layout="position" // Only animate positional changes (reordering) to avoid height morphing delay
              transition={{ type: "tween", duration: 0.15 }}
              key={slot.id} 
              className={`flex items-center p-2 sm:p-4 border-b border-[#00D9FF]/10 h-[65px] sm:h-[80px] shrink-0 transition-colors duration-200 ${bgClass}`}
            >
              {/* Avatar */}
              <div className="relative shrink-0 mr-2 sm:mr-3">
                 <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-[3px] transition-colors duration-200
                   ${slot.isEmpty ? 'bg-black/20 border-white/10' : `bg-[#1A103C] ${borderClass}`}`}>
                   {slot.isEmpty ? (
                     <UserIcon size={20} className="text-white/30" />
                   ) : (
                     <span className="text-2xl sm:text-3xl translate-y-[1px]">{slot.avatar}</span>
                   )}
                 </div>
                 
                 {/* Role/Status Icon */}
                 {!slot.isEmpty && isCorrectGuesser && (
                   <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-[#10B981] rounded-full border-2 border-[#1A103C] flex items-center justify-center shadow-sm z-10 transition-transform scale-in animate-scale-in">
                      <Check size={10} strokeWidth={4} className="text-white" />
                   </div>
                 )}
                 {!slot.isEmpty && isDrawer && !isCorrectGuesser && (
                   <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-[#00D9FF] rounded-full border-2 border-[#1A103C] flex items-center justify-center shadow-sm z-10">
                      <Pencil size={10} strokeWidth={3} className="text-[#1A103C]" />
                   </div>
                 )}
              </div>
              
              {/* Info */}
              <div className="flex flex-col justify-center overflow-hidden">
                 <span className={`font-bold flex items-center gap-1 text-[12px] sm:text-[15px] truncate max-w-full transition-colors duration-200
                   ${slot.isEmpty ? 'text-white/40' : nameClass}`}>
                   <span className="truncate">{slot.name}</span>
                   {(slot.wins ?? 0) > 0 && (
                     <span className="text-yellow-500 scale-110 shrink-0" title={`${slot.wins} Wins`}>🏆 {slot.wins}</span>
                   )}
                 </span>
                 {!slot.isEmpty && (
                   <span className={`text-[11px] sm:text-[13px] font-bold transition-colors duration-200 ${ptsClass}`}>{slot.points} pts</span>
                 )}
              </div>
            </motion.div>
          );
        })}
    </div>
  );
};

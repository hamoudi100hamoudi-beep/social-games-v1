import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  onPlayerClick?: (player: PlayerSlot) => void;
}

interface FloatingPoints {
  id: string;
  playerId: string;
  amount: number;
}

export const PlayersSidebar: React.FC<PlayersSidebarProps> = ({
  slots,
  gameState,
  morphMode,
  socketId,
  onPlayerClick
}) => {
  const [activePopups, setActivePopups] = React.useState<FloatingPoints[]>([]);
  const prevPointsRef = React.useRef<{ [key: string]: number | null }>({});
  const prevRanksRef = React.useRef<{ [key: string]: number }>({});

  // Create a stable-sorted copy for rendering so DOM elements never re-order or mount/unmount mid-transition
  const stableSlots = React.useMemo(() => {
    return [...slots].sort((a, b) => a.id.localeCompare(b.id));
  }, [slots]);

  // Record previous ranks after rendering
  React.useEffect(() => {
    slots.forEach((slot, index) => {
      prevRanksRef.current[slot.id] = index;
    });
  }, [slots]);

  // Detect score changes and trigger floating indicator
  React.useEffect(() => {
    slots.forEach((slot) => {
      if (slot.isEmpty) return;
      const key = slot.id; // Unique slot visual ID
      const currentPts = slot.points;
      const prevPts = prevPointsRef.current[key];

      if (prevPts !== undefined && prevPts !== null && currentPts !== null && currentPts > prevPts) {
        const diff = currentPts - prevPts;
        const popupId = `${key}-${Date.now()}-${Math.random()}`;

        setActivePopups((prev) => [...prev, { id: popupId, playerId: key, amount: diff }]);

        setTimeout(() => {
          setActivePopups((prev) => prev.filter((p) => p.id !== popupId));
        }, 1500);
      }

      // Record current score
      prevPointsRef.current[key] = currentPts;
    });
  }, [slots]);

  return (
    <div className={`flex flex-col border-r border-primary-brand/20 bg-bg-panel-brand overflow-y-auto overscroll-contain touch-pan-y
                    ${morphMode ? 'col-start-1 col-end-2 row-start-1 row-end-3' : 'col-start-1 col-end-2 row-start-2 row-end-3'}
                   `}>
      <style>{`
        .sidebar-container {
          --row-height: 65px;
          position: relative;
          width: 100%;
        }
        @media (min-width: 640px) {
          .sidebar-container {
            --row-height: 80px;
          }
        }
      `}</style>
      
      <div 
        className="sidebar-container w-full shrink-0" 
        style={{ height: `calc(var(--row-height) * ${slots.length})` }}
      >
        {/* Background lines representing fixed boundary lines */}
        <div className="absolute inset-0 pointer-events-none select-none z-0">
          {slots.map((_, i) => (
            <div 
              key={`grid-line-${i}`}
              style={{
                height: 'var(--row-height)',
                top: `calc(var(--row-height) * ${i})`,
              }}
              className="absolute inset-x-0 border-b border-primary-brand/10"
            />
          ))}
        </div>

        {/* Real-time moving active and empty cards */}
        {stableSlots.map((slot) => {
          const rankIndex = slots.findIndex((s) => s.id === slot.id);
          const isDrawer = slot.isCurrent;
          const isCorrectGuesser =
            !slot.isEmpty &&
            gameState.status === 'DRAWING' &&
            (gameState.correctGuessers?.includes(slot.id) ||
             (slot.persistentId ? gameState.correctGuessers?.includes(slot.persistentId) : false));
          
          let bgClass = '';
          let borderClass = 'border-[#94A3B8]'; // Slate-400 default
          let nameClass = 'text-white';
          let ptsClass = 'text-primary-brand';

          if (isDrawer) {
             bgClass = 'bg-primary-brand/10'; // Brand sky blue bg
             borderClass = 'border-primary-brand'; // Brand sky blue border
             nameClass = 'text-primary-brand';
             ptsClass = 'text-primary-brand';
          } else if (isCorrectGuesser) {
             bgClass = 'bg-[#00E540]/12 border-l-[4px] border-[#00E540]'; // Vibrant Gartic green accent and bg
             borderClass = 'border-[#00E540]'; 
             nameClass = 'text-[#00E540]';
             ptsClass = 'text-[#00E540] font-black';
          } else if (!slot.isEmpty) {
             borderClass = 'border-[#94A3B8]'; // Slate 400 default
          }

          const slotPopups = activePopups.filter((p) => p.playerId === slot.id);

          // Get previous rank for z-index calculation (upward transitions overlap downward transitions)
          const prevRank = prevRanksRef.current[slot.id];
          let zIndex = 10;
          if (prevRank !== undefined) {
            if (rankIndex < prevRank) {
              zIndex = 25; // Moving UP -> higher priority to stand out on top
            } else if (rankIndex > prevRank) {
              zIndex = 5;  // Moving DOWN -> lower priority to slide underneath the rising player
            }
          }

          return (
            <div 
              key={slot.id} 
              style={{
                top: `calc(var(--row-height) * ${rankIndex})`,
                height: 'var(--row-height)',
                transition: 'top 0.75s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s ease, border-color 0.2s ease',
                zIndex: zIndex,
              }}
              className={`absolute inset-x-0 flex items-center p-2 sm:p-4 overflow-visible ${bgClass} ${!slot.isEmpty ? 'cursor-pointer hover:bg-white/5 active:bg-white/10' : ''}`}
              onClick={() => {
                if (!slot.isEmpty && onPlayerClick) {
                  onPlayerClick(slot);
                }
              }}
            >
              {/* Avatar */}
              <div className="relative shrink-0 mr-2 sm:mr-3">
                 <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-[3px] transition-colors duration-200
                   ${slot.isEmpty ? 'bg-black/20 border-white/10' : `bg-bg-dark-brand ${borderClass}`}`}>
                   {slot.isEmpty ? (
                     <UserIcon size={20} className="text-white/30" />
                   ) : (
                     <span className="text-2xl sm:text-3xl translate-y-[1px]">{slot.avatar}</span>
                   )}
                 </div>
                 
                 {/* Status/Role Icon badge */}
                 {!slot.isEmpty && isCorrectGuesser && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-[#00E540] rounded-full border-2 border-bg-dark-brand flex items-center justify-center shadow-sm z-15 transition-all scale-in animate-scale-in">
                       <Check size={10} strokeWidth={4} className="text-black font-extrabold" />
                    </div>
                 )}
                 {!slot.isEmpty && isDrawer && !isCorrectGuesser && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-primary-brand rounded-full border-2 border-bg-dark-brand flex items-center justify-center shadow-sm z-15">
                       <Pencil size={10} strokeWidth={3} className="text-bg-dark-brand" />
                    </div>
                  )}
               </div>
               
               {/* Info */}
               <div className="flex flex-col justify-center overflow-hidden mr-auto pr-8">
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

               {/* Bouncy floating score popups */}
               <AnimatePresence>
                 {slotPopups.map((popup) => (
                   <motion.div
                     key={popup.id}
                     initial={{ opacity: 0, scale: 0.6, y: 10 }}
                     animate={{ opacity: 1, scale: 1.05, y: -10 }}
                     exit={{ opacity: 0, scale: 0.8, y: -22 }}
                     transition={{
                       duration: 1.2,
                       ease: [0.175, 0.885, 0.32, 1.255]
                     }}
                     style={{
                       textShadow: `
                         1px 1px 0px #000, 
                         -1px -1px 0px #000, 
                         1px -1px 0px #000, 
                         -1px 1px 0px #000,
                         0px 2px 4px rgba(0, 229, 64, 0.5)
                       `
                     }}
                     className="absolute right-4 text-[#00E540] font-black italic text-xs sm:text-sm select-none pointer-events-none z-20"
                   >
                     <span>+{popup.amount}</span>
                   </motion.div>
                 ))}
               </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
};

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User as UserIcon, Check, Pencil } from 'lucide-react';

const TrophyContainer: React.FC<{ wins: number }> = ({ wins }) => {
  return (
    <div 
      id="gartic-trophy-container"
      key={wins}
      className="absolute -left-2.5 -bottom-2 z-20 flex items-center justify-center select-none overflow-visible"
    >
      <style>{`
        @keyframes trophyPopCelebrate {
          0% { transform: scale(0.3) rotate(-15deg); }
          50% { transform: scale(1.4) rotate(15deg); }
          70% { transform: scale(0.9) rotate(-10deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        .animate-trophy-celebrate {
          animation: trophyPopCelebrate 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
          transform-origin: center;
        }
      `}</style>
      <div className="w-7 h-7 flex items-center justify-center relative">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-7 h-7 animate-trophy-celebrate drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]" fill="none">
          {/* Base bottom stand */}
          <path d="M6 21H18" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M9 21L10 17H14L15 21" fill="#FDE047" stroke="black" strokeWidth="1.5" strokeLinejoin="round"/>
          
          {/* Left Handle */}
          <path d="M7 8H4V11C4 12.5 5.5 13 7 13" fill="#FDE047" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          
          {/* Right Handle */}
          <path d="M17 8H20V11C20 12.5 18.5 13 17 13" fill="#FDE047" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          
          {/* Cup Bowl */}
          <path d="M7 5H17V12C17 14.76 14.76 17 12 17C9.24 17 7 14.76 7 12V5Z" fill="#FDE047" stroke="black" strokeWidth="1.5" strokeLinejoin="round"/>
          
          {/* Specular shine */}
          <path d="M8.5 6.5V11" stroke="white" strokeWidth="1" strokeLinecap="round"/>

          {/* Centered count text when there is more than 1 win */}
          {wins > 1 && (
            <text 
              x="12" 
              y="12.5" 
              fontFamily="sans-serif" 
              fontWeight="900" 
              fontSize="6.5" 
              fill="black" 
              textAnchor="middle" 
              dominantBaseline="middle"
              className="select-none font-bold"
            >
              {wins}
            </text>
          )}
        </svg>
      </div>
    </div>
  );
};

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
    <div className={`flex flex-col bg-bg-panel-brand overflow-y-auto overscroll-contain touch-pan-y
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
          let ptsClass = 'text-white';

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
              className={`absolute inset-x-0 flex items-center pl-1.5 pr-1 py-1.5 sm:pl-3 sm:pr-2.5 sm:py-3 overflow-visible ${bgClass} ${!slot.isEmpty ? 'cursor-pointer hover:bg-white/5 active:bg-white/10' : ''}`}
              onClick={() => {
                if (!slot.isEmpty && onPlayerClick) {
                  onPlayerClick(slot);
                }
              }}
            >
              {/* Avatar with Gartic Trophy */}
              <div className="relative shrink-0 mr-1.5 sm:mr-2.5">
                 <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-[3px] transition-colors duration-200
                   ${slot.isEmpty ? 'bg-black/20 border-white/10' : `bg-bg-dark-brand ${borderClass}`}`}>
                   {slot.isEmpty ? (
                     <UserIcon size={20} className="text-white/30" />
                   ) : (
                     <span className="text-2xl sm:text-3xl translate-y-[1px]">{slot.avatar}</span>
                   )}
                 </div>
                 
                 {/* Trophy cup for wins (Gartic style) */}
                 {!slot.isEmpty && (slot.wins ?? 0) > 0 && (
                   <TrophyContainer wins={slot.wins!} />
                 )}

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
               <div className="flex-1 min-w-0 flex flex-col justify-center pr-1 text-left">
                  <div className={`font-bold text-[13px] sm:text-[15.5px] truncate transition-colors duration-200 leading-tight ${slot.isEmpty ? 'text-white/40' : nameClass}`}>
                     {slot.name}
                  </div>
                  {!slot.isEmpty && (
                    <div className={`text-[11px] sm:text-[13px] font-bold transition-colors duration-200 mt-0.5 leading-none ${ptsClass}`}>
                      {slot.points} pts
                    </div>
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

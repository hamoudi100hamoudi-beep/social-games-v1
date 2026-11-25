import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User as UserIcon, Check, Pencil, EyeOff } from 'lucide-react';
import { useAppTranslation } from '../../i18n/useAppTranslation';

const TrophyContainer: React.FC<{ wins: number; isCelebrating?: boolean }> = ({ wins, isCelebrating = false }) => {
  if (wins <= 0) return null;
  const [imgError, setImgError] = React.useState(false);
  const [imgLoaded, setImgLoaded] = React.useState(false);

  const isReady = imgLoaded || imgError;

  return (
    <div 
      id="gartic-trophy-container"
      className="absolute -left-1 -bottom-3.5 z-20 flex items-center justify-center select-none overflow-visible"
    >
      <style>{`
        @keyframes trophyPopCelebrate {
          0% { transform: scale(0) rotate(-22deg); opacity: 0; }
          45% { transform: scale(1.38) rotate(18deg); opacity: 1; }
          70% { transform: scale(0.88) rotate(-12deg); opacity: 1; }
          85% { transform: scale(1.08) rotate(5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        .animate-trophy-celebrate {
          animation: trophyPopCelebrate 0.65s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
          transform-origin: center;
        }
      `}</style>
      
      {/* Preloader element to ensure image is cached/ready before triggering animation */}
      {!isReady && (
        <img 
          src="/trophy.webp" 
          alt="" 
          className="hidden" 
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
        />
      )}

      {isReady && (
        <div className={`w-[26px] h-[26px] sm:w-[30px] sm:h-[30px] flex items-center justify-center relative ${isCelebrating ? 'animate-trophy-celebrate' : ''}`}>
          {!imgError ? (
            <img 
              src="/trophy.webp" 
              alt="Trophy" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-7 h-7" fill="none">
              {/* Base bottom stand */}
              <path d="M6 21H18" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M9 21L10 17H14L15 21" fill="#FDE047" stroke="black" strokeWidth="1.5" strokeLinejoin="round"/>
              {/* Handles */}
              <path d="M7 8H4V11C4 12.5 5.5 13 7 13" fill="#FDE047" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 8H20V11C20 12.5 18.5 13 17 13" fill="#FDE047" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              {/* Cup Bowl */}
              <path d="M7 5H17V12C17 14.76 14.76 17 12 17C9.24 17 7 14.76 7 12V5Z" fill="#FDE047" stroke="black" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M8.5 6.5V11" stroke="white" strokeWidth="1" strokeLinecap="round"/>
            </svg>
          )}
          {/* Centered count text inside the cup bowl */}
          {wins > 0 && (
            <span 
              className={`absolute top-[44%] left-1/2 -translate-x-1/2 -translate-y-1/2 font-black text-[#2C1800] select-none pointer-events-none leading-none z-10 ${
                wins >= 10 ? 'text-[8px] sm:text-[9px]' : 'text-[9.5px] sm:text-[10.5px]'
              }`}
              style={{ fontFamily: 'system-ui, sans-serif' }}
            >
              {wins}
            </span>
          )}
        </div>
      )}
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
  isBlocked?: boolean;
  isNew?: boolean;
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
  isFreeDraw?: boolean;
  amIDrawer?: boolean;
  onAcknowledgeNewPlayer?: (playerId: string) => void;
}

interface FloatingPoints {
  id: string;
  playerId: string;
  amount: number;
}

const getSlotIdentity = (slot: { persistentId?: string; id: string }) =>
  slot.persistentId || slot.id;

export const PlayersSidebar: React.FC<PlayersSidebarProps> = ({
  slots,
  gameState,
  morphMode,
  socketId,
  onPlayerClick,
  isFreeDraw = false,
  amIDrawer = false,
  onAcknowledgeNewPlayer,
}) => {
  const { t: tCommon } = useAppTranslation('common');
  const [activePopups, setActivePopups] = React.useState<FloatingPoints[]>([]);
  const prevPointsRef = React.useRef<{ [key: string]: number | null }>({});
  const prevRanksRef = React.useRef<{ [key: string]: number }>({});
  const isPointsResetRef = React.useRef(false);
  const hasMountedRef = React.useRef(false);

  const [newlyJoinedIds, setNewlyJoinedIds] = React.useState<Set<string>>(new Set());
  const prevPlayerIdsRef = React.useRef<Set<string> | null>(null);
  const entranceTimersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Stable wins tracking per player (persistentId || id) to celebrate ONLY real win increases
  const prevWinsRef = React.useRef<Map<string, number> | null>(null);
  const [celebratingKeys, setCelebratingKeys] = React.useState<Set<string>>(new Set());
  const celebrationTimersRef = React.useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Track win increases per player and trigger celebration ONLY on real wins
  React.useEffect(() => {
    // First mount: establish baseline without triggering any celebration
    if (prevWinsRef.current === null) {
      const initialWins = new Map<string, number>();
      slots.forEach((s) => {
        if (!s.isEmpty) {
          const key = s.persistentId || s.id;
          initialWins.set(key, s.wins ?? 0);
        }
      });
      prevWinsRef.current = initialWins;
      return;
    }

    // Subsequent updates: detect players whose wins ACTUALLY increased
    const freshWinsKeys: string[] = [];
    const updatedWins = new Map(prevWinsRef.current);

    slots.forEach((s) => {
      if (!s.isEmpty) {
        const key = s.persistentId || s.id;
        const currentWins = s.wins ?? 0;
        const prevWins = prevWinsRef.current?.get(key);

        if (prevWins !== undefined && currentWins > prevWins) {
          freshWinsKeys.push(key);
        }
        updatedWins.set(key, currentWins);
      }
    });

    prevWinsRef.current = updatedWins;

    if (freshWinsKeys.length > 0) {
      setCelebratingKeys((prev) => {
        const next = new Set(prev);
        freshWinsKeys.forEach((k) => next.add(k));
        return next;
      });

      freshWinsKeys.forEach((key) => {
        const existingTimer = celebrationTimersRef.current.get(key);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
          setCelebratingKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
          celebrationTimersRef.current.delete(key);
        }, 800);

        celebrationTimersRef.current.set(key, timer);
      });
    }
  }, [slots]);

  // Clean up all celebration and entrance timers on unmount
  React.useEffect(() => {
    return () => {
      celebrationTimersRef.current.forEach((t) => clearTimeout(t));
      celebrationTimersRef.current.clear();
      entranceTimersRef.current.forEach((t) => clearTimeout(t));
      entranceTimersRef.current.clear();
    };
  }, []);

  // Track player joins dynamically and trigger pop animation cleanly ONLY for real joins
  React.useEffect(() => {
    const currentActiveIds = new Set(
      slots.filter((s) => !s.isEmpty).map((s) => getSlotIdentity(s))
    );

    // First mount: establish baseline of existing players, but do NOT ignore players who arrived with isNew: true
    if (prevPlayerIdsRef.current === null) {
      prevPlayerIdsRef.current = new Set(
        slots.filter((s) => !s.isEmpty && !s.isNew).map((s) => getSlotIdentity(s))
      );
    }

    // Identify fresh players that actually just joined
    const freshNewIds: string[] = [];
    slots.forEach((s) => {
      if (!s.isEmpty) {
        const key = getSlotIdentity(s);
        const wasKnown = prevPlayerIdsRef.current?.has(key) ?? false;
        if (s.isNew || (prevPlayerIdsRef.current && prevPlayerIdsRef.current.size > 0 && !wasKnown)) {
          freshNewIds.push(key);
        }
      }
    });

    // Update set of known active players (sync with currently active IDs, preserve if array is empty)
    if (currentActiveIds.size > 0) {
      prevPlayerIdsRef.current = currentActiveIds;

      // Clear active entrance timers for players who actually left the room
      const departedAnimatedIds: string[] = [];
      entranceTimersRef.current.forEach((timer, id) => {
        if (!currentActiveIds.has(id)) {
          clearTimeout(timer);
          entranceTimersRef.current.delete(id);
          departedAnimatedIds.push(id);
        }
      });
      if (departedAnimatedIds.length > 0) {
        setNewlyJoinedIds((prev) => {
          const hasAny = departedAnimatedIds.some((id) => prev.has(id));
          if (!hasAny) return prev;
          const next = new Set(prev);
          departedAnimatedIds.forEach((id) => next.delete(id));
          return next;
        });
      }
    }

    if (freshNewIds.length > 0) {
      freshNewIds.forEach((id) => {
        onAcknowledgeNewPlayer?.(id);
      });

      const toSchedule = freshNewIds.filter((id) => !entranceTimersRef.current.has(id));
      if (toSchedule.length > 0) {
        setNewlyJoinedIds((prev) => {
          const next = new Set(prev);
          toSchedule.forEach((id) => next.add(id));
          return next;
        });

        toSchedule.forEach((id) => {
          const timer = setTimeout(() => {
            entranceTimersRef.current.delete(id);
            setNewlyJoinedIds((prev) => {
              if (!prev.has(id)) return prev;
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }, 420);

          entranceTimersRef.current.set(id, timer);
        });
      }
    }
  }, [slots, onAcknowledgeNewPlayer]);

  const stableSlots = React.useMemo(() => {
    return [...slots].sort((a, b) => getSlotIdentity(a).localeCompare(getSlotIdentity(b)));
  }, [slots]);

  // Record previous ranks after layout to track movements
  React.useLayoutEffect(() => {
    hasMountedRef.current = true;
    isPointsResetRef.current = false;
    slots.forEach((slot, index) => {
      prevRanksRef.current[getSlotIdentity(slot)] = index;
    });
  }, [slots]);

  // Detect score reset and score changes
  // When scores are reset (e.g. at start of new game/round after podium), all scores drop to 0.
  // We must suppress rank animation so cards don't jitter or re-sort animatedly.
  const hadPositiveScores = Object.values(prevPointsRef.current).some((pts) => pts !== null && pts !== undefined && pts > 0);
  const allCurrentZero = slots.some((s) => !s.isEmpty) && slots.filter((s) => !s.isEmpty).every((s) => (s.points || 0) === 0);
  if (hadPositiveScores && allCurrentZero) {
    isPointsResetRef.current = true;
  }

  // Detect score changes and trigger floating indicator (disabled for active drawer during DRAWING)
  React.useEffect(() => {
    slots.forEach((slot) => {
      if (slot.isEmpty) return;
      const key = getSlotIdentity(slot); // Stable canonical identity across reconnects
      const currentPts = slot.points;
      const prevPts = prevPointsRef.current[key];

      const isDrawerActive = amIDrawer && gameState.status === 'DRAWING';
      if (!isDrawerActive && prevPts !== undefined && prevPts !== null && currentPts !== null && currentPts > prevPts) {
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
  }, [slots, gameState.status, amIDrawer]);

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
          const slotKey = getSlotIdentity(slot);
          const rankIndex = slots.findIndex((s) => getSlotIdentity(s) === slotKey);
          const isDrawer = slot.isCurrent;
          const isCorrectGuesser =
            !slot.isEmpty &&
            gameState.status === 'DRAWING' &&
            (gameState.correctGuessers?.includes(slot.id) ||
             (slot.persistentId ? gameState.correctGuessers?.includes(slot.persistentId) : false));
          
          let bgClass = '';
          let borderClass = 'border-[#94A3B8]'; // Slate-400 default
          let nameClass = 'text-white';
          let ptsClass = 'text-[#FBBF24]';

          if (isDrawer) {
             bgClass = 'bg-primary-brand/10'; // Brand sky blue bg
             borderClass = 'border-primary-brand'; // Brand sky blue border
             nameClass = 'text-primary-brand';
          } else if (isCorrectGuesser) {
             bgClass = 'bg-[#00E540]/12'; // Vibrant Gartic green bg
             borderClass = 'border-[#00E540]'; 
             nameClass = 'text-[#00E540]';
             ptsClass = 'text-[#00E540] font-black';
          } else if (!slot.isEmpty) {
             borderClass = 'border-[#94A3B8]'; // Slate 400 default
          }

          const slotPopups = activePopups.filter((p) => p.playerId === slotKey);

          // Get previous rank for z-index calculation (upward transitions overlap downward transitions)
          const prevRank = prevRanksRef.current[slotKey];
          let zIndex = 10;
          if (prevRank !== undefined) {
            if (rankIndex < prevRank) {
              zIndex = 25; // Moving UP -> higher priority to stand out on top
            } else if (rankIndex > prevRank) {
              zIndex = 5;  // Moving DOWN -> lower priority to slide underneath the rising player
            }
          }

          // Smooth easing: starts smoothly, accelerates, decelerates smoothly into position
          const isDrawerActive = amIDrawer && gameState.status === 'DRAWING';
          const cardTransition = !isDrawerActive && !isPointsResetRef.current
            ? 'top 0.45s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s ease, border-color 0.2s ease'
            : 'background-color 0.2s ease, border-color 0.2s ease';

          return (
            <div 
              key={slotKey} 
              style={{
                top: `calc(var(--row-height) * ${rankIndex})`,
                height: 'var(--row-height)',
                transition: cardTransition,
                zIndex: zIndex,
              }}
              className={`absolute inset-x-0 flex items-center pl-1.5 pr-1 py-1.5 sm:pl-3 sm:pr-2.5 sm:py-3 overflow-visible ${bgClass} ${!slot.isEmpty ? 'cursor-pointer hover:bg-white/5 active:bg-white/10' : ''}`}
              onClick={() => {
                if (!slot.isEmpty && onPlayerClick) {
                  onPlayerClick(slot);
                }
              }}
            >
              {/* Container grouping Avatar and Info (Name + Points) together */}
              <div
                className={`flex items-center min-w-0 max-w-full overflow-visible ${
                  !slot.isEmpty && ((Boolean(onAcknowledgeNewPlayer) && slot.isNew) || newlyJoinedIds.has(slotKey))
                    ? 'animate-avatar-pop'
                    : ''
                }`}
              >
                {/* Avatar with Gartic Trophy */}
                <div className="relative shrink-0 mr-1.5 sm:mr-2.5">
                   <div className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-[3px] transition-colors duration-200
                     ${slot.isEmpty ? 'bg-black/20 border-white/10' : `bg-bg-dark-brand ${borderClass}`}`}>
                     {slot.isEmpty ? (
                       <UserIcon size={20} className="text-white/30" />
                     ) : (
                       <span className="text-2xl sm:text-3xl translate-y-[1px]">{slot.avatar}</span>
                     )}
                     {slot.isBlocked && (
                       <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center pointer-events-none">
                         <EyeOff className="w-5 h-5 text-white/90" strokeWidth={2.5} />
                       </div>
                     )}
                   </div>
                   
                   {/* Trophy cup for wins (Gartic style) */}
                   {!slot.isEmpty && (
                     <TrophyContainer
                       wins={slot.wins ?? 0}
                       isCelebrating={celebratingKeys.has(slot.persistentId || slot.id)}
                     />
                   )}

                   {/* Status/Role Icon badge */}
                   {!slot.isEmpty && isCorrectGuesser && (
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-[#00E540] rounded-full border-2 border-bg-dark-brand flex items-center justify-center shadow-sm z-15 transition-all scale-in animate-scale-in">
                          <Check size={10} strokeWidth={4} className="text-black font-extrabold" />
                      </div>
                   )}
                   {!slot.isEmpty && isDrawer && !isCorrectGuesser && (
                      <Pencil
                        strokeWidth={2.5}
                        className="absolute -bottom-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary-brand drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] pointer-events-none z-15"
                      />
                    )}
                 </div>
                 
                 {/* Info */}
                 <div className="min-w-0 flex flex-col justify-center pr-1 text-left">
                    <div className={`font-bold text-[13px] sm:text-[15.5px] truncate transition-colors duration-200 leading-tight ${slot.isEmpty ? 'text-white/40' : nameClass}`}>
                       {slot.name}
                    </div>
                    {!slot.isEmpty && !isFreeDraw && (
                      <div className={`text-[11px] sm:text-[13px] font-bold transition-colors duration-200 mt-0.5 leading-none ${ptsClass}`}>
                        {tCommon('units.points', { count: slot.points ?? 0 })}
                      </div>
                    )}
                 </div>
              </div>

               {/* Bouncy floating score popups - disabled for drawer during DRAWING */}
               {!isDrawerActive && slotPopups.length > 0 && (
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
               )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

import React from 'react';
import { User as UserIcon, EyeOff } from 'lucide-react';

export interface FreeDrawPlayerSlot {
  id: string;
  name: string;
  points?: number | null;
  isCurrent?: boolean;
  isEmpty?: boolean;
  avatar?: string;
  wins?: number;
  isOffline?: boolean;
  persistentId?: string;
  isBlocked?: boolean;
  isNew?: boolean;
}

interface FreeDrawPlayersListProps {
  slots: FreeDrawPlayerSlot[];
  morphMode?: boolean;
  onPlayerClick?: (player: FreeDrawPlayerSlot) => void;
  onAcknowledgeNewPlayer?: (playerId: string) => void;
}

const getSlotIdentity = (slot: { persistentId?: string; id: string }) =>
  slot.persistentId || slot.id;

export const FreeDrawPlayersList: React.FC<FreeDrawPlayersListProps> = ({
  slots,
  morphMode = false,
  onPlayerClick,
  onAcknowledgeNewPlayer,
}) => {
  const [newlyJoinedIds, setNewlyJoinedIds] = React.useState<Set<string>>(new Set());
  const prevPlayerIdsRef = React.useRef<Set<string> | null>(null);
  const entranceTimersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Clean up all entrance timers on unmount
  React.useEffect(() => {
    return () => {
      entranceTimersRef.current.forEach((t) => clearTimeout(t));
      entranceTimersRef.current.clear();
    };
  }, []);

  // Track new player joins to trigger the pop-in entrance animation smoothly
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

  // Keep DOM elements keyed stably so that CSS top transitions execute smoothly upon player join/leave
  const stableSlots = React.useMemo(() => {
    return [...slots].sort((a, b) => getSlotIdentity(a).localeCompare(getSlotIdentity(b)));
  }, [slots]);

  return (
    <div
      className={`flex flex-col bg-bg-panel-brand overflow-y-auto overscroll-contain touch-pan-y
                  ${morphMode ? 'col-start-1 col-end-2 row-start-1 row-end-3' : 'col-start-1 col-end-2 row-start-2 row-end-3'}
                 `}
    >
      <style>{`
        .freedraw-sidebar-container {
          --row-height: 65px;
          position: relative;
          width: 100%;
        }
        @media (min-width: 640px) {
          .freedraw-sidebar-container {
            --row-height: 80px;
          }
        }
      `}</style>

      <div
        className="freedraw-sidebar-container w-full shrink-0"
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

          const cardTransition = 'top 0.45s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s ease, border-color 0.2s ease';

          return (
            <div
              key={slotKey}
              style={{
                top: `calc(var(--row-height) * ${rankIndex})`,
                height: 'var(--row-height)',
                transition: cardTransition,
                zIndex: 10,
              }}
              className={`absolute inset-x-0 flex items-center pl-1.5 pr-1 py-1.5 sm:pl-3 sm:pr-2.5 sm:py-3 overflow-visible ${
                !slot.isEmpty ? 'cursor-pointer hover:bg-white/5 active:bg-white/10' : ''
              }`}
              onClick={() => {
                if (!slot.isEmpty && onPlayerClick) {
                  onPlayerClick(slot);
                }
              }}
            >
              {/* Container grouping Avatar and Name together */}
              <div
                className={`flex items-center min-w-0 max-w-full overflow-visible ${
                  !slot.isEmpty && ((Boolean(onAcknowledgeNewPlayer) && slot.isNew) || newlyJoinedIds.has(slotKey))
                    ? 'animate-avatar-pop'
                    : ''
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0 mr-1.5 sm:mr-2.5">
                  <div
                    className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-[3px] transition-colors duration-200
                      ${slot.isEmpty ? 'bg-black/20 border-white/10' : 'bg-bg-dark-brand border-[#94A3B8]'}`}
                  >
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
                </div>

                {/* Info: Name only */}
                <div className="min-w-0 flex flex-col justify-center pr-1 text-left">
                  <div
                    className={`font-bold text-[13px] sm:text-[15.5px] truncate transition-colors duration-200 leading-tight ${
                      slot.isEmpty ? 'text-white/40' : 'text-white'
                    }`}
                  >
                    {slot.name}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

import { useRef, useCallback } from 'react';

const getStablePlayerId = (
  player: { persistentId?: string; id?: string } | null | undefined,
): string => {
  if (!player) return '';
  return player.persistentId || player.id || '';
};

export function useRoomEventGate() {
  const isHydratedRef = useRef(false);
  const knownPlayersRef = useRef<Set<string>>(new Set());
  const pendingNewPlayersRef = useRef<Set<string>>(new Set());

  const hydrateGate = useCallback((initialPlayers: any[]) => {
    if (!isHydratedRef.current) {
      initialPlayers.forEach(p => {
        const stableId = getStablePlayerId(p);
        if (p && !p.isEmpty && stableId) {
          knownPlayersRef.current.add(stableId);
        }
      });
      isHydratedRef.current = true;
    }
  }, []);

  const isNewPlayer = useCallback((stableId: string) => {
    if (!isHydratedRef.current || !stableId) return false;

    if (!knownPlayersRef.current.has(stableId)) {
      knownPlayersRef.current.add(stableId);
      pendingNewPlayersRef.current.add(stableId);
      return true;
    }
    return pendingNewPlayersRef.current.has(stableId);
  }, []);

  const acknowledgeNewPlayer = useCallback((stableId: string) => {
    if (!stableId) return;
    pendingNewPlayersRef.current.delete(stableId);
  }, []);

  const removePlayer = useCallback((stableId: string) => {
    if (!stableId) return;
    knownPlayersRef.current.delete(stableId);
    pendingNewPlayersRef.current.delete(stableId);
  }, []);

  const isLive = useCallback(() => {
    return isHydratedRef.current;
  }, []);
  
  // Expose a method to reset the gate, just in case we change rooms or disconnect completely
  const resetGate = useCallback(() => {
    isHydratedRef.current = false;
    knownPlayersRef.current.clear();
    pendingNewPlayersRef.current.clear();
  }, []);

  return {
    hydrateGate,
    isNewPlayer,
    acknowledgeNewPlayer,
    removePlayer,
    isLive,
    resetGate,
    knownPlayersRef,
    pendingNewPlayersRef,
  };
}

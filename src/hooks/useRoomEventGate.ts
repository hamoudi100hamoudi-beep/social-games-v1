import { useRef, useCallback } from 'react';

export function useRoomEventGate() {
  const isHydratedRef = useRef(false);
  const knownPlayersRef = useRef<Set<string>>(new Set());

  const hydrateGate = useCallback((initialPlayers: any[]) => {
    if (!isHydratedRef.current) {
      initialPlayers.forEach(p => {
        if (p && !p.isEmpty && p.id) {
            knownPlayersRef.current.add(p.id);
        }
      });
      isHydratedRef.current = true;
    }
  }, []);

  const isNewPlayer = useCallback((id: string) => {
    if (!isHydratedRef.current) return false;
    
    if (!knownPlayersRef.current.has(id)) {
      knownPlayersRef.current.add(id);
      return true;
    }
    return false;
  }, []);
  
  const removePlayer = useCallback((id: string) => {
      knownPlayersRef.current.delete(id);
  }, []);

  const isLive = useCallback(() => {
    return isHydratedRef.current;
  }, []);
  
  // Expose a method to reset the gate, just in case we change rooms or disconnect completely
  const resetGate = useCallback(() => {
    isHydratedRef.current = false;
    knownPlayersRef.current.clear();
  }, []);

  return {
    hydrateGate,
    isNewPlayer,
    removePlayer,
    isLive,
    resetGate,
    knownPlayersRef,
  };
}

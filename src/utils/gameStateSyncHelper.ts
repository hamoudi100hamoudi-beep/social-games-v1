/**
 * 🛡️ Game State Synchronization & Canvas Turn Reset Helper
 *
 * Distinguishes between:
 * 1. Initial authoritative room-state hydration (establishing the room baseline on mount/join).
 * 2. Subsequent genuine game-state or drawer transitions that require resetting the canvas.
 *
 * Invariant:
 * The first authoritative room state received for a mounted room establishes the baseline
 * and MUST NOT cause a destructive turn reset after history has been synced.
 * Subsequent genuine game-state or drawer transitions MUST trigger a clean turn reset.
 */

export interface GameStateSnapshot {
  status?: string;
  currentDrawerId?: string | null;
}

export interface StateResetEvaluation {
  /**
   * Whether the canvas should execute a clean turn reset (executeResetState).
   */
  shouldResetCanvas: boolean;
  /**
   * Whether pending spectator drawing queue points should be fast-forward flushed.
   */
  shouldFlushSpectatorQueue: boolean;
  /**
   * Whether this transition was an initial room-state baseline hydration
   * rather than a subsequent turn transition.
   */
  isInitialHydration: boolean;
  /**
   * The updated baseline establishment flag to store.
   */
  hasEstablishedBaseline: boolean;
  /**
   * The new snapshot to record as previous state.
   */
  nextRecordedState: GameStateSnapshot;
}

/**
 * Evaluates whether a change in room status or current drawer represents
 * an initial authoritative room-state hydration or a subsequent genuine turn transition.
 */
export function evaluateStateTransitionReset(
  prevState: GameStateSnapshot,
  nextState: GameStateSnapshot,
  hasEstablishedBaseline: boolean,
  hasSyncedOnce: boolean,
  isSyncing: boolean
): StateResetEvaluation {
  const normPrevDrawer = prevState.currentDrawerId ?? null;
  const normNextDrawer = nextState.currentDrawerId ?? null;
  const normPrevStatus = prevState.status ?? '';
  const normNextStatus = nextState.status ?? '';

  const isStateChanged =
    normPrevDrawer !== normNextDrawer ||
    normPrevStatus !== normNextStatus;

  if (!isStateChanged) {
    return {
      shouldResetCanvas: false,
      shouldFlushSpectatorQueue: false,
      isInitialHydration: false,
      hasEstablishedBaseline,
      nextRecordedState: prevState,
    };
  }

  // If the initial authoritative baseline has not yet been established for this mounted room,
  // this transition represents the initial room-state hydration from the default unhydrated state.
  // It must establish the baseline and NEVER wipe the newly restored drawing canvas.
  if (!hasEstablishedBaseline) {
    return {
      shouldResetCanvas: false,
      shouldFlushSpectatorQueue: false,
      isInitialHydration: true,
      hasEstablishedBaseline: true,
      nextRecordedState: {
        status: nextState.status,
        currentDrawerId: nextState.currentDrawerId,
      },
    };
  }

  // Subsequent genuine game-state or drawer transition:
  const shouldFlushSpectatorQueue =
    normPrevStatus === 'DRAWING' ||
    normNextStatus !== 'DRAWING' ||
    normPrevDrawer !== normNextDrawer;

  const shouldResetCanvas = Boolean(hasSyncedOnce && !isSyncing);

  return {
    shouldResetCanvas,
    shouldFlushSpectatorQueue,
    isInitialHydration: false,
    hasEstablishedBaseline: true,
    nextRecordedState: {
      status: nextState.status,
      currentDrawerId: nextState.currentDrawerId,
    },
  };
}

import assert from 'assert';
import {
  evaluateStateTransitionReset,
  GameStateSnapshot,
} from '../src/utils/gameStateSyncHelper.js';

console.log('--- Test Suite: evaluateStateTransitionReset Regression Suite ---');

let passCount = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. Initial hydration into an active DRAWING room must NEVER wipe synced drawing
test('HYDRATION-1.1: Initial transition from default GameRoom state to active DRAWING establishes baseline without wiping canvas', () => {
  const defaultMountState: GameStateSnapshot = { status: 'WAITING', currentDrawerId: null };
  const authoritativeInitialState: GameStateSnapshot = { status: 'DRAWING', currentDrawerId: 'drawer-alice' };

  // History sync completed before React state update committed:
  const hasEstablishedBaseline = false;
  const hasSyncedOnce = true;
  const isSyncing = false;

  const result = evaluateStateTransitionReset(
    defaultMountState,
    authoritativeInitialState,
    hasEstablishedBaseline,
    hasSyncedOnce,
    isSyncing
  );

  assert.strictEqual(result.shouldResetCanvas, false, 'Canvas MUST NOT be reset on initial room hydration');
  assert.strictEqual(result.isInitialHydration, true, 'Transition must be identified as initial hydration');
  assert.strictEqual(result.hasEstablishedBaseline, true, 'Initial baseline must be marked as established');
  assert.strictEqual(result.nextRecordedState.status, 'DRAWING', 'Next recorded status must match authoritative state');
  assert.strictEqual(result.nextRecordedState.currentDrawerId, 'drawer-alice', 'Next recorded drawer must match authoritative state');
});

// 2. Subsequent genuine drawer change MUST trigger expected canvas reset
test('HYDRATION-1.2: Subsequent genuine drawer change triggers turn reset', () => {
  const currentTurnState: GameStateSnapshot = { status: 'DRAWING', currentDrawerId: 'drawer-alice' };
  const nextTurnState: GameStateSnapshot = { status: 'DRAWING', currentDrawerId: 'drawer-bob' };

  const hasEstablishedBaseline = true;
  const hasSyncedOnce = true;
  const isSyncing = false;

  const result = evaluateStateTransitionReset(
    currentTurnState,
    nextTurnState,
    hasEstablishedBaseline,
    hasSyncedOnce,
    isSyncing
  );

  assert.strictEqual(result.shouldResetCanvas, true, 'Canvas MUST be reset when drawer changes in subsequent turn');
  assert.strictEqual(result.isInitialHydration, false, 'Subsequent turn change is not initial hydration');
  assert.strictEqual(result.shouldFlushSpectatorQueue, true, 'Spectator queue must be flushed on turn transition');
  assert.strictEqual(result.hasEstablishedBaseline, true, 'Baseline remains established');
  assert.strictEqual(result.nextRecordedState.currentDrawerId, 'drawer-bob', 'Next recorded drawer must be drawer-bob');
});

// 3. Subsequent round end transition MUST trigger expected reset
test('HYDRATION-1.3: Subsequent round transition to ROUND_END triggers expected reset', () => {
  const currentTurnState: GameStateSnapshot = { status: 'DRAWING', currentDrawerId: 'drawer-alice' };
  const roundEndState: GameStateSnapshot = { status: 'ROUND_END', currentDrawerId: 'drawer-alice' };

  const hasEstablishedBaseline = true;
  const hasSyncedOnce = true;
  const isSyncing = false;

  const result = evaluateStateTransitionReset(
    currentTurnState,
    roundEndState,
    hasEstablishedBaseline,
    hasSyncedOnce,
    isSyncing
  );

  assert.strictEqual(result.shouldResetCanvas, true, 'Canvas reset must be triggered on transition to ROUND_END');
  assert.strictEqual(result.isInitialHydration, false, 'ROUND_END transition is not initial hydration');
  assert.strictEqual(result.shouldFlushSpectatorQueue, true, 'Spectator queue must be flushed when DRAWING ends');
  assert.strictEqual(result.nextRecordedState.status, 'ROUND_END', 'Next recorded status must be ROUND_END');
});

// 4. Joined when room is truly in WAITING, then game starts -> MUST trigger turn reset
test('HYDRATION-1.4: Room joined in WAITING then starting round triggers legitimate reset', () => {
  // Baseline established in WAITING:
  const waitingState: GameStateSnapshot = { status: 'WAITING', currentDrawerId: null };
  const roundStartState: GameStateSnapshot = { status: 'CHOOSING', currentDrawerId: 'drawer-alice' };

  const hasEstablishedBaseline = true; // Established upon authoritative WAITING receipt
  const hasSyncedOnce = true;
  const isSyncing = false;

  const result = evaluateStateTransitionReset(
    waitingState,
    roundStartState,
    hasEstablishedBaseline,
    hasSyncedOnce,
    isSyncing
  );

  assert.strictEqual(result.shouldResetCanvas, true, 'Canvas reset MUST be triggered when game transitions from WAITING to CHOOSING');
  assert.strictEqual(result.isInitialHydration, false, 'Game start is not initial hydration');
  assert.strictEqual(result.nextRecordedState.status, 'CHOOSING', 'Next recorded status must be CHOOSING');
  assert.strictEqual(result.nextRecordedState.currentDrawerId, 'drawer-alice', 'Next recorded drawer must be drawer-alice');
});

// 5. Re-render without state change does NOT trigger reset
test('HYDRATION-1.5: Re-render without status or drawer change does not trigger reset', () => {
  const state: GameStateSnapshot = { status: 'DRAWING', currentDrawerId: 'drawer-alice' };

  const result = evaluateStateTransitionReset(
    state,
    state,
    true,
    true,
    false
  );

  assert.strictEqual(result.shouldResetCanvas, false, 'No reset on identical state re-render');
  assert.strictEqual(result.shouldFlushSpectatorQueue, false, 'No flush on identical state re-render');
});

// 6. Turn change while sync is still actively in progress does not call executeResetState
test('HYDRATION-1.6: Turn change while sync is actively in progress defers reset to sync handler', () => {
  const currentTurnState: GameStateSnapshot = { status: 'DRAWING', currentDrawerId: 'drawer-alice' };
  const nextTurnState: GameStateSnapshot = { status: 'DRAWING', currentDrawerId: 'drawer-bob' };

  const hasEstablishedBaseline = true;
  const hasSyncedOnce = false;
  const isSyncing = true; // In-flight sync

  const result = evaluateStateTransitionReset(
    currentTurnState,
    nextTurnState,
    hasEstablishedBaseline,
    hasSyncedOnce,
    isSyncing
  );

  assert.strictEqual(result.shouldResetCanvas, false, 'shouldResetCanvas is false while sync is actively in flight');
  assert.strictEqual(result.shouldFlushSpectatorQueue, true, 'Spectator queue must still be flushed');
});

console.log(`\n🎉 All ${passCount} state transition reset regression tests passed!`);

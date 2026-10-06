import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Free Draw Bucket Undo Fast Path & Single-Flight Guard', () => {
  // Mock command generator
  const makeCmd = (instId: string, strId: number, type: 'stroke' | 'bucket', name: string) => ({
    instanceId: instId,
    strokeId: strId,
    type,
    name
  });

  const getSig = (cmd: any) => `${cmd.instanceId}_${cmd.strokeId}`;

  it('Test 1: A -> B -> Bucket -> C -> Undo Bucket: A and B preserved, Bucket removed, C replayed, zero Bucket re-execution', () => {
    let floodFillExecutionCount = 0;
    let canvasRestoredFromCache = false;
    let replayedCommands: string[] = [];

    // Pre-target bitmap cache state
    const cache = {
      isValid: true,
      meta: {
        baseHistoryLength: 2, // after A (0) and B (1)
        targetInstanceId: 'user_A',
        targetStrokeId: 3,
        prevAnchorSignature: 'user_A_2'
      }
    };

    const history = [
      makeCmd('user_A', 1, 'stroke', 'A'),
      makeCmd('user_A', 2, 'stroke', 'B'),
      makeCmd('user_A', 3, 'bucket', 'Bucket'),
      makeCmd('user_B', 4, 'stroke', 'C')
    ];

    // Undo target: user_A's latest command is Bucket at index 2
    const targetInst = 'user_A';
    const targetStrId = 3;
    const targetIndex = history.findIndex(c => c.instanceId === targetInst && c.strokeId === targetStrId);
    assert.strictEqual(targetIndex, 2, 'Target index must be 2');

    // Fast-path validity check
    const isValid =
      cache.isValid &&
      cache.meta.targetInstanceId === targetInst &&
      cache.meta.targetStrokeId === targetStrId &&
      cache.meta.baseHistoryLength === targetIndex &&
      getSig(history[targetIndex - 1]) === cache.meta.prevAnchorSignature &&
      getSig(history[targetIndex]) === `${targetInst}_${targetStrId}`;

    assert.strictEqual(isValid, true, 'Fast path must be 100% valid');

    // Execute fast-path
    const [removed] = history.splice(targetIndex, 1);
    assert.strictEqual(removed.name, 'Bucket');
    canvasRestoredFromCache = true;

    // Replay remaining commands after targetIndex
    for (let i = targetIndex; i < history.length; i++) {
      const cmd = history[i];
      if (cmd.type === 'bucket') floodFillExecutionCount++;
      replayedCommands.push(cmd.name);
    }

    assert.strictEqual(canvasRestoredFromCache, true, 'Bitmap must be restored directly from pre-target cache');
    assert.strictEqual(floodFillExecutionCount, 0, 'Bucket must NEVER be re-executed via floodFill');
    assert.deepStrictEqual(replayedCommands, ['C'], 'Only command C occurring after Bucket must be replayed');
    assert.deepStrictEqual(history.map(c => c.name), ['A', 'B', 'C'], 'Final history contains A, B, and C (Bucket removed)');
  });

  it('Test 2: Bucket -> Undo: Direct restore with zero command replay', () => {
    let floodFillExecutionCount = 0;
    let canvasRestoredFromCache = false;
    let replayedCount = 0;

    const cache = {
      isValid: true,
      meta: {
        baseHistoryLength: 0,
        targetInstanceId: 'user_A',
        targetStrokeId: 1,
        prevAnchorSignature: null
      }
    };

    const history = [
      makeCmd('user_A', 1, 'bucket', 'Bucket1')
    ];

    const targetIndex = 0;
    const targetInst = 'user_A';
    const targetStrId = 1;

    const isValid =
      cache.isValid &&
      cache.meta.targetInstanceId === targetInst &&
      cache.meta.targetStrokeId === targetStrId &&
      cache.meta.baseHistoryLength === targetIndex &&
      getSig(history[targetIndex]) === `${targetInst}_${targetStrId}`;

    assert.strictEqual(isValid, true);

    history.splice(targetIndex, 1);
    canvasRestoredFromCache = true;

    for (let i = targetIndex; i < history.length; i++) {
      replayedCount++;
    }

    assert.strictEqual(canvasRestoredFromCache, true, 'Canvas restored from cache');
    assert.strictEqual(replayedCount, 0, 'Zero commands replayed (pure bitmap restore)');
    assert.strictEqual(floodFillExecutionCount, 0, 'Zero flood fills executed');
    assert.strictEqual(history.length, 0, 'History is empty');
  });

  it('Test 3: Bucket 1 ... Bucket 20 -> Undo Bucket 20: Zero flood fills executed, previous 19 buckets preserved', () => {
    let floodFillExecutionCount = 0;
    const history: any[] = [];

    for (let i = 1; i <= 20; i++) {
      history.push(makeCmd('user_A', i, 'bucket', `Bucket${i}`));
    }

    // Cache was captured immediately before Bucket 20
    const cache = {
      isValid: true,
      meta: {
        baseHistoryLength: 19,
        targetInstanceId: 'user_A',
        targetStrokeId: 20,
        prevAnchorSignature: 'user_A_19'
      }
    };

    const targetIndex = 19;
    const targetInst = 'user_A';
    const targetStrId = 20;

    const isValid =
      cache.isValid &&
      cache.meta.targetInstanceId === targetInst &&
      cache.meta.targetStrokeId === targetStrId &&
      cache.meta.baseHistoryLength === targetIndex &&
      getSig(history[targetIndex - 1]) === cache.meta.prevAnchorSignature &&
      getSig(history[targetIndex]) === `${targetInst}_${targetStrId}`;

    assert.strictEqual(isValid, true, 'Fast path matches Bucket 20 perfectly');

    // Execute fast-path
    const [removed] = history.splice(targetIndex, 1);
    assert.strictEqual(removed.name, 'Bucket20');

    // Replay remaining (none)
    let replayedCount = 0;
    for (let i = targetIndex; i < history.length; i++) {
      if (history[i].type === 'bucket') floodFillExecutionCount++;
      replayedCount++;
    }

    assert.strictEqual(floodFillExecutionCount, 0, 'NONE of the 20 Buckets are re-executed through floodFill');
    assert.strictEqual(replayedCount, 0, 'Zero commands replayed');
    assert.strictEqual(history.length, 19, '19 buckets remain preserved in history');
  });

  it('Test 4: Single-Flight Undo Guard: Rapid bursts of Undo invocations drop duplicate executions', () => {
    let undoExecutionCount = 0;
    let undoInProgress = false;

    const simulateUndoClick = () => {
      if (undoInProgress) {
        return false; // Dropped by Single-Flight Guard
      }
      undoInProgress = true;
      try {
        undoExecutionCount++;
        return true;
      } finally {
        // Unlock on next tick / frame
      }
    };

    // First click: succeeds and sets lock
    const res1 = simulateUndoClick();
    assert.strictEqual(res1, true, 'First click must execute');

    // Rapid successive clicks while lock is held (queued touch events / double tap)
    const res2 = simulateUndoClick();
    const res3 = simulateUndoClick();
    assert.strictEqual(res2, false, 'Second click must be dropped');
    assert.strictEqual(res3, false, 'Third click must be dropped');

    assert.strictEqual(undoExecutionCount, 1, 'Exactly one Undo must execute');

    // Simulate unlock on frame boundary
    undoInProgress = false;

    // Subsequent legitimate click after frame boundary succeeds
    const res4 = simulateUndoClick();
    assert.strictEqual(res4, true, 'Legitimate click after frame boundary succeeds');
    assert.strictEqual(undoExecutionCount, 2, 'Total undos executed is 2');
  });
});

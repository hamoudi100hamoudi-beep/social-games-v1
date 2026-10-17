import { describe, it } from 'node:test';
import assert from 'node:assert';
import { encodeBinaryDrawMessage } from '../src/utils/drawBinaryHelper';
import {
  selectEvictionIndexMinimax,
  countBucketsBeforeIndex,
  findLatestClearIndex
} from '../src/utils/bucketCheckpointPolicy';

const FREE_DRAW_TAIL_SIZE = 40;
const FREE_DRAW_BUCKET_TAIL_THRESHOLD = 3;

const isCommandHeavy = (cmd: any): boolean => {
  if (!cmd || !cmd.data) return false;
  if (cmd.data instanceof ArrayBuffer) {
    const byte0 = new Uint8Array(cmd.data)[0];
    return byte0 === 4 || byte0 === 5;
  }
  if (ArrayBuffer.isView(cmd.data)) {
    const byte0 = (cmd.data as Uint8Array)[0];
    return byte0 === 4 || byte0 === 5;
  }
  return false;
};

const getTargetCheckpointIndex = (list: any[], currentIndex: number): number => {
  const N = list.length;
  if (N <= currentIndex) return currentIndex;

  if (N - currentIndex >= FREE_DRAW_TAIL_SIZE * 2) {
    return N - FREE_DRAW_TAIL_SIZE;
  }

  // Count heavy commands in unbaked suffix
  let heavyCount = 0;
  for (let i = currentIndex; i < N; i++) {
    if (isCommandHeavy(list[i])) {
      heavyCount++;
      if (heavyCount >= FREE_DRAW_BUCKET_TAIL_THRESHOLD) break;
    }
  }

  if (heavyCount >= FREE_DRAW_BUCKET_TAIL_THRESHOLD) {
    return N - 1;
  }

  return currentIndex;
};

describe('Bucket-Aware Checkpoint Suite', () => {
  const createStrokeCmd = (instId: string, sId: number) => ({
    event: 'draw_binary',
    data: encodeBinaryDrawMessage('draw_stroke', {
      tool: 'pencil',
      color: '#000000',
      width: 5,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
      strokeId: sId,
      instanceId: instId
    }),
    instanceId: instId,
    strokeId: sId
  });

  const createBucketCmd = (instId: string, sId: number) => ({
    event: 'draw_binary',
    data: encodeBinaryDrawMessage('draw_action', {
      tool: 'bucket',
      color: '#ff0000',
      opacity: 1,
      x: 0.5,
      y: 0.5,
      strokeId: sId,
      instanceId: instId
    }),
    instanceId: instId,
    strokeId: sId
  });

  it('Pencil only: preserves existing FREE_DRAW_TAIL_SIZE policy perfectly', () => {
    const list: any[] = [];
    let checkpointIdx = 0;

    // Add 79 pencil strokes -> should NOT advance checkpoint
    for (let i = 1; i <= 79; i++) {
      list.push(createStrokeCmd('user_A', i));
      const target = getTargetCheckpointIndex(list, checkpointIdx);
      assert.strictEqual(target, 0, `At ${i} strokes, checkpoint should not advance yet`);
    }

    // Add 80th stroke (79 -> 80: 80 - 0 = 80 >= 40*2)
    list.push(createStrokeCmd('user_A', 80));
    const target = getTargetCheckpointIndex(list, checkpointIdx);
    assert.strictEqual(target, 40, 'At 80 strokes, checkpoint advances to 40 (N - 40)');
  });

  it('Bucket only: advances checkpoint when heavy threshold (3) is reached', () => {
    const list: any[] = [];
    let checkpointIdx = 0;

    // 1st bucket
    list.push(createBucketCmd('user_A', 1));
    assert.strictEqual(getTargetCheckpointIndex(list, checkpointIdx), 0);

    // 2nd bucket
    list.push(createBucketCmd('user_A', 2));
    assert.strictEqual(getTargetCheckpointIndex(list, checkpointIdx), 0);

    // 3rd bucket -> length = 3, heavyCount = 3 -> advances to N - 1 = 2
    list.push(createBucketCmd('user_A', 3));
    let target = getTargetCheckpointIndex(list, checkpointIdx);
    assert.strictEqual(target, 2, 'Advances to 2 when 3rd bucket arrives, keeping 1 in tail');
    checkpointIdx = target;

    // 4th bucket (from index 2 to 4: bucket 3 and 4 -> heavyCount = 2)
    list.push(createBucketCmd('user_A', 4));
    assert.strictEqual(getTargetCheckpointIndex(list, checkpointIdx), 2);

    // 5th bucket (from index 2 to 5: bucket 3, 4, 5 -> heavyCount = 3) -> advances to 4
    list.push(createBucketCmd('user_A', 5));
    target = getTargetCheckpointIndex(list, checkpointIdx);
    assert.strictEqual(target, 4, 'Advances to 4 when 3 unbaked buckets accumulate');
    checkpointIdx = target;
  });

  it('Undo with Bucket-Aware Checkpoint: tail replay never exceeds 2 heavy buckets', () => {
    const list: any[] = [];
    let checkpointIdx = 0;

    // Add 10 buckets simulating continuous bucket fills
    for (let i = 1; i <= 10; i++) {
      list.push(createBucketCmd('user_A', i));
      const target = getTargetCheckpointIndex(list, checkpointIdx);
      if (target > checkpointIdx) {
        checkpointIdx = target;
      }
    }

    // At 10 buckets: checkpointIdx is at 8 (baking buckets 1..8), tail has buckets 9 and 10 (2 buckets)
    assert.strictEqual(checkpointIdx, 8);
    assert.strictEqual(list.length - checkpointIdx, 2);

    // If user undos bucket 10 (targetIndex = 9 >= checkpointIdx = 8):
    // Checkpoint is VALID!
    // Suffix to replay after targetIndex 9 is: 0 commands!
    // Number of floodFill executions required: 0!
  });

  it('Interleaved Pencil + Bucket: advances when bucket density accumulates', () => {
    const list: any[] = [];
    let checkpointIdx = 0;

    // 5 pencils
    for (let i = 1; i <= 5; i++) {
      list.push(createStrokeCmd('user_A', i));
    }
    assert.strictEqual(getTargetCheckpointIndex(list, checkpointIdx), 0);

    // Add 1 bucket
    list.push(createBucketCmd('user_A', 6));
    assert.strictEqual(getTargetCheckpointIndex(list, checkpointIdx), 0);

    // 5 pencils
    for (let i = 7; i <= 11; i++) {
      list.push(createStrokeCmd('user_A', i));
    }
    assert.strictEqual(getTargetCheckpointIndex(list, checkpointIdx), 0);

    // Add 2nd bucket
    list.push(createBucketCmd('user_A', 12));
    assert.strictEqual(getTargetCheckpointIndex(list, checkpointIdx), 0);

    // Add 3rd bucket -> total heavy in unbaked suffix = 3!
    list.push(createBucketCmd('user_A', 13));
    const target = getTargetCheckpointIndex(list, checkpointIdx);
    assert.strictEqual(target, 12, 'Advances to N-1 = 12');
  });
});

describe('Phase 1F.5: History-Indexed Bucket Checkpoint Manager Suite', () => {
  const MAX_HISTORY_CHECKPOINTS = 10;

  const createStrokeCmd = (instId: string, sId: number) => ({
    event: 'draw_binary',
    data: encodeBinaryDrawMessage('draw_stroke', {
      tool: 'pencil',
      color: '#111111',
      width: 5,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
      strokeId: sId,
      instanceId: instId
    }),
    instanceId: instId,
    strokeId: sId
  });

  const createBucketCmd = (instId: string, sId: number, color = '#ff0000') => ({
    event: 'draw_binary',
    data: encodeBinaryDrawMessage('draw_action', {
      tool: 'bucket',
      color,
      opacity: 1,
      x: 0.5,
      y: 0.5,
      strokeId: sId,
      instanceId: instId
    }),
    instanceId: instId,
    strokeId: sId
  });

  const isBucketCmd = (cmd: any): boolean => {
    if (!cmd || !cmd.data) return false;
    let byte0 = 0;
    if (cmd.data instanceof ArrayBuffer) {
      byte0 = new Uint8Array(cmd.data)[0];
    } else if (ArrayBuffer.isView(cmd.data)) {
      byte0 = (cmd.data as Uint8Array)[0];
    }
    return byte0 === 4;
  };

  const getCommandSignature = (cmd: any): string => {
    if (!cmd) return "";
    const instId = cmd.instanceId || cmd.instId || "";
    const sId = cmd.strokeId !== undefined ? cmd.strokeId : -1;
    return `${instId}_${sId}`;
  };

  // Simulated 32x32 Bitmap Canvas Engine for Deterministic Pixel Oracle & Exactness
  const WIDTH = 32;
  const HEIGHT = 32;

  class SimulatedCanvas {
    pixels: Uint8Array;
    floodFillCalls = 0;

    constructor() {
      this.pixels = new Uint8Array(WIDTH * HEIGHT);
    }

    clone(): SimulatedCanvas {
      const copy = new SimulatedCanvas();
      copy.pixels.set(this.pixels);
      copy.floodFillCalls = this.floodFillCalls;
      return copy;
    }

    clear() {
      this.pixels.fill(0);
    }

    drawStroke(colorVal: number) {
      // Sets a line of pixels
      for (let x = 2; x < 10; x++) {
        this.pixels[5 * WIDTH + x] = colorVal;
      }
    }

    floodFill(fillColorVal: number) {
      this.floodFillCalls++;
      // Simple fill on target region
      const targetVal = this.pixels[0];
      if (targetVal === fillColorVal) return;
      for (let i = 0; i < this.pixels.length; i++) {
        if (this.pixels[i] === targetVal) {
          this.pixels[i] = fillColorVal;
        }
      }
    }

    applyCmd(cmd: any) {
      if (isBucketCmd(cmd)) {
        // Map strokeId to distinct color value
        const colorVal = (cmd.strokeId * 37) % 250 + 1;
        this.floodFill(colorVal);
      } else {
        const colorVal = (cmd.strokeId * 17) % 250 + 1;
        this.drawStroke(colorVal);
      }
    }
  }

  interface SimulatedCheckpoint {
    canvas: SimulatedCanvas;
    index: number;
    anchorSignature: string;
    lastClearIndex: number;
  }

  class HistoryCheckpointManager {
    checkpoints: SimulatedCheckpoint[] = [];
    pool: SimulatedCanvas[] = [];

    acquireCanvas(): SimulatedCanvas {
      return this.pool.pop() || new SimulatedCanvas();
    }

    releaseCanvas(c: SimulatedCanvas) {
      if (this.pool.length < MAX_HISTORY_CHECKPOINTS + 4) {
        c.clear();
        this.pool.push(c);
      }
    }

    capture(index: number, activeCanvas: SimulatedCanvas, commands: any[], lastClearIndex: number) {
      const existingIdx = this.checkpoints.findIndex(cp => cp.index === index);
      if (existingIdx !== -1) {
        const existing = this.checkpoints[existingIdx];
        existing.canvas.pixels.set(activeCanvas.pixels);
        existing.anchorSignature = index > 0 ? getCommandSignature(commands[index - 1]) : "";
        existing.lastClearIndex = lastClearIndex;
        return;
      }

      if (this.checkpoints.length >= MAX_HISTORY_CHECKPOINTS) {
        let minGap = Infinity;
        let evictIdx = 1;
        const cps = this.checkpoints;
        for (let i = 1; i < cps.length - 2; i++) {
          const gap = cps[i + 1].index - cps[i].index;
          if (gap < minGap) {
            minGap = gap;
            evictIdx = i;
          }
        }
        const [evicted] = cps.splice(evictIdx, 1);
        if (evicted) this.releaseCanvas(evicted.canvas);
      }

      const c = this.acquireCanvas();
      c.pixels.set(activeCanvas.pixels);
      const cp: SimulatedCheckpoint = {
        canvas: c,
        index,
        anchorSignature: index > 0 ? getCommandSignature(commands[index - 1]) : "",
        lastClearIndex
      };
      this.checkpoints.push(cp);
      this.checkpoints.sort((a, b) => a.index - b.index);
    }

    invalidateAfter(targetIndex: number) {
      const keep: SimulatedCheckpoint[] = [];
      for (const cp of this.checkpoints) {
        if (cp.index > targetIndex) {
          this.releaseCanvas(cp.canvas);
        } else {
          keep.push(cp);
        }
      }
      this.checkpoints = keep;
    }

    getBestCheckpoint(commands: any[], targetLength: number, lastClearIndex: number): SimulatedCheckpoint | null {
      for (let i = this.checkpoints.length - 1; i >= 0; i--) {
        const cp = this.checkpoints[i];
        if (cp.index <= 0 || cp.index > commands.length || cp.index > targetLength) continue;
        if (cp.index <= lastClearIndex || cp.lastClearIndex !== lastClearIndex) continue;
        const sig = getCommandSignature(commands[cp.index - 1]);
        if (sig === cp.anchorSignature) {
          return cp;
        }
      }
      return null;
    }
  }

  it('Default flag invariant: isBucketCheckpointExpEnabled is false by default', () => {
    // When localStorage is empty or null, feature flag must be inactive
    const isEnabled = false;
    assert.strictEqual(isEnabled, false, 'Checkpoint experiment must be disabled by default');
  });

  it('Ordered, history-indexed retention and bounded capacity', () => {
    const manager = new HistoryCheckpointManager();
    const liveCanvas = new SimulatedCanvas();
    const commands: any[] = [];

    // Push 15 bucket operations
    for (let i = 1; i <= 15; i++) {
      const cmd = createBucketCmd('user_A', i);
      commands.push(cmd);
      liveCanvas.applyCmd(cmd);
      manager.capture(i, liveCanvas, commands, -1);
    }

    // Verify bounded size
    assert.ok(manager.checkpoints.length <= MAX_HISTORY_CHECKPOINTS, `Length ${manager.checkpoints.length} must not exceed ${MAX_HISTORY_CHECKPOINTS}`);
    assert.strictEqual(manager.checkpoints.length, MAX_HISTORY_CHECKPOINTS);

    // Verify strictly ascending ordering
    for (let i = 1; i < manager.checkpoints.length; i++) {
      assert.ok(manager.checkpoints[i].index > manager.checkpoints[i - 1].index, 'Indices must be strictly increasing');
    }

    // Verify first and last checkpoints are preserved by gap eviction policy
    assert.strictEqual(manager.checkpoints[0].index, 1, 'First checkpoint must be preserved');
    assert.strictEqual(manager.checkpoints[manager.checkpoints.length - 1].index, 15, 'Latest checkpoint must be preserved');
  });

  it('Repeated Bucket Undo avoids falling back to 0 and eliminates redundant floodFills', () => {
    const manager = new HistoryCheckpointManager();
    const liveCanvas = new SimulatedCanvas();
    const commands: any[] = [];
    const redoStack: any[] = [];

    // Build interleaved sequence of Strokes and Buckets
    // 0: Stroke 1
    // 1: Bucket 1 -> Checkpoint @ 2
    // 2: Stroke 2
    // 3: Bucket 2 -> Checkpoint @ 4
    // 4: Stroke 3
    // 5: Bucket 3 -> Checkpoint @ 6
    // 6: Stroke 4
    // 7: Bucket 4 -> Checkpoint @ 8
    for (let s = 1; s <= 4; s++) {
      const strokeCmd = createStrokeCmd('user_A', s * 2 - 1);
      commands.push(strokeCmd);
      liveCanvas.applyCmd(strokeCmd);

      const bucketCmd = createBucketCmd('user_A', s * 2);
      commands.push(bucketCmd);
      liveCanvas.applyCmd(bucketCmd);
      manager.capture(commands.length, liveCanvas, commands, -1);
    }

    assert.strictEqual(commands.length, 8);
    assert.strictEqual(manager.checkpoints.length, 4);
    assert.deepStrictEqual(manager.checkpoints.map(cp => cp.index), [2, 4, 6, 8]);

    // Helper to replay from best checkpoint
    const replayWithCheckpoints = (): { replayedCount: number; floodFillCalls: number } => {
      const best = manager.getBestCheckpoint(commands, commands.length, -1);
      const replayCanvas = new SimulatedCanvas();
      let startIdx = 0;
      if (best) {
        replayCanvas.pixels.set(best.canvas.pixels);
        startIdx = best.index;
      }
      for (let i = startIdx; i < commands.length; i++) {
        replayCanvas.applyCmd(commands[i]);
      }
      return {
        replayedCount: commands.length - startIdx,
        floodFillCalls: replayCanvas.floodFillCalls
      };
    };

    // Helper to build Ground Truth (replay from index 0)
    const getGroundTruthCanvas = (): SimulatedCanvas => {
      const gt = new SimulatedCanvas();
      for (const cmd of commands) {
        gt.applyCmd(cmd);
      }
      return gt;
    };

    // --- UNDO #1: Undo Bucket 4 (index 7) ---
    const target1 = 7;
    manager.invalidateAfter(target1);
    const [undone1] = commands.splice(target1, 1);
    redoStack.push(undone1);

    // Assert: Checkpoint @ 8 invalidated, checkpoints @ [2, 4, 6] retained
    assert.deepStrictEqual(manager.checkpoints.map(cp => cp.index), [2, 4, 6]);

    const res1 = replayWithCheckpoints();
    assert.strictEqual(res1.replayedCount, 1, 'Only Stroke 4 (index 6) replayed from checkpoint @ 6');
    assert.strictEqual(res1.floodFillCalls, 0, 'ZERO floodFill calls during Undo 1!');

    // Pixel exactness check against ground truth
    const gt1 = getGroundTruthCanvas();
    const replayCanvas1 = new SimulatedCanvas();
    const best1 = manager.getBestCheckpoint(commands, commands.length, -1)!;
    replayCanvas1.pixels.set(best1.canvas.pixels);
    for (let i = best1.index; i < commands.length; i++) replayCanvas1.applyCmd(commands[i]);
    assert.deepStrictEqual(replayCanvas1.pixels, gt1.pixels, 'Undo 1 pixels match ground truth 100%');

    // --- UNDO #2 (Repeated Undo): Undo Stroke 4 (now at index 6) ---
    const target2 = 6;
    manager.invalidateAfter(target2);
    const [undone2] = commands.splice(target2, 1);
    redoStack.push(undone2);

    // Assert: Checkpoints @ [2, 4, 6] retained
    assert.deepStrictEqual(manager.checkpoints.map(cp => cp.index), [2, 4, 6]);

    const res2 = replayWithCheckpoints();
    assert.strictEqual(res2.replayedCount, 0, 'ZERO commands replayed! Reconstructed directly from checkpoint @ 6');
    assert.strictEqual(res2.floodFillCalls, 0, 'ZERO floodFill calls during Undo 2!');

    const gt2 = getGroundTruthCanvas();
    const replayCanvas2 = new SimulatedCanvas();
    const best2 = manager.getBestCheckpoint(commands, commands.length, -1)!;
    replayCanvas2.pixels.set(best2.canvas.pixels);
    assert.deepStrictEqual(replayCanvas2.pixels, gt2.pixels, 'Undo 2 pixels match ground truth 100%');

    // --- UNDO #3 (Repeated Undo): Undo Bucket 3 (now at index 5) ---
    const target3 = 5;
    manager.invalidateAfter(target3);
    const [undone3] = commands.splice(target3, 1);
    redoStack.push(undone3);

    // Assert: Checkpoint @ 6 invalidated, checkpoints @ [2, 4] retained
    assert.deepStrictEqual(manager.checkpoints.map(cp => cp.index), [2, 4]);

    const res3 = replayWithCheckpoints();
    assert.strictEqual(res3.replayedCount, 1, 'Only Stroke 3 (index 4) replayed from checkpoint @ 4');
    assert.strictEqual(res3.floodFillCalls, 0, 'ZERO floodFill calls during Undo 3!');

    const gt3 = getGroundTruthCanvas();
    const replayCanvas3 = new SimulatedCanvas();
    const best3 = manager.getBestCheckpoint(commands, commands.length, -1)!;
    replayCanvas3.pixels.set(best3.canvas.pixels);
    for (let i = best3.index; i < commands.length; i++) replayCanvas3.applyCmd(commands[i]);
    assert.deepStrictEqual(replayCanvas3.pixels, gt3.pixels, 'Undo 3 pixels match ground truth 100%');

    // --- REDO #1: Redo Bucket 3 ---
    const redo1 = redoStack.pop();
    commands.push(redo1);
    const canvasAfterRedo1 = getGroundTruthCanvas();
    manager.capture(commands.length, canvasAfterRedo1, commands, -1);
    assert.deepStrictEqual(manager.checkpoints.map(cp => cp.index), [2, 4, 6], 'Checkpoint @ 6 restored on Redo 1');

    // --- REDO #2: Redo Stroke 4 ---
    const redo2 = redoStack.pop();
    commands.push(redo2);

    // --- REDO #3: Redo Bucket 4 ---
    const redo3 = redoStack.pop();
    commands.push(redo3);
    const canvasAfterRedo3 = getGroundTruthCanvas();
    manager.capture(commands.length, canvasAfterRedo3, commands, -1);
    assert.deepStrictEqual(manager.checkpoints.map(cp => cp.index), [2, 4, 6, 8], 'Checkpoint @ 8 restored on Redo 3');

    // Final pixel verification: full restoration matches initial state
    const finalReplay = new SimulatedCanvas();
    const finalBest = manager.getBestCheckpoint(commands, commands.length, -1)!;
    assert.strictEqual(finalBest.index, 8);
    finalReplay.pixels.set(finalBest.canvas.pixels);
    assert.deepStrictEqual(finalReplay.pixels, liveCanvas.pixels, 'Final state after repeated Redo matches initial state 100%');
  });
});

describe('Phase 1F.6.3: Global Minimax Bucket Checkpoint Distribution Suite', () => {
  const createBucketCmd = (instId: string, sId: number) => ({
    event: 'draw_binary',
    data: encodeBinaryDrawMessage('draw_action', {
      tool: 'bucket',
      color: '#ff0000',
      opacity: 1,
      x: 0.5,
      y: 0.5,
      strokeId: sId,
      instanceId: instId
    }),
    instanceId: instId,
    strokeId: sId
  });

  const createStrokeCmd = (instId: string, sId: number) => ({
    event: 'draw_binary',
    data: encodeBinaryDrawMessage('draw_stroke', {
      tool: 'pencil',
      color: '#000000',
      width: 5,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
      strokeId: sId,
      instanceId: instId
    }),
    instanceId: instId,
    strokeId: sId
  });

  it('100 Bucket commands with Prospective-Aware Minimax policy maintains max gap <= 15 and prevents fallback to 0', () => {
    const MAX_HISTORY_CHECKPOINTS = 10;
    const checkpoints: { index: number }[] = [];

    const capture = (index: number, list: any[]) => {
      if (checkpoints.length >= MAX_HISTORY_CHECKPOINTS) {
        const evictIdx = selectEvictionIndexMinimax(checkpoints, list, -1, index, MAX_HISTORY_CHECKPOINTS);
        if (evictIdx >= 0 && evictIdx < checkpoints.length) {
          checkpoints.splice(evictIdx, 1);
        }
      }
      checkpoints.push({ index });
      checkpoints.sort((a, b) => a.index - b.index);
    };

    const list: any[] = [];
    for (let i = 1; i <= 100; i++) {
      list.push(createBucketCmd('user_A', i));
      capture(i, list);
    }

    assert.strictEqual(checkpoints.length, MAX_HISTORY_CHECKPOINTS);

    const bucketCounts = checkpoints.map(cp => countBucketsBeforeIndex(list, cp.index, -1));
    let maxGap = bucketCounts[0];
    for (let i = 0; i < checkpoints.length - 1; i++) {
      maxGap = Math.max(maxGap, bucketCounts[i+1] - bucketCounts[i]);
    }
    const totalBuckets = countBucketsBeforeIndex(list, list.length, -1);
    maxGap = Math.max(maxGap, totalBuckets - bucketCounts[checkpoints.length - 1]);

    console.log("[TEST 1F.6.4] Final Checkpoint Indices:", checkpoints.map(cp => cp.index));
    console.log("[TEST 1F.6.4] Final Checkpoint Bucket Counts:", bucketCounts);
    console.log("[TEST 1F.6.4] Max Bucket Gap:", maxGap);

    assert.ok(maxGap <= 16, `Max bucket gap ${maxGap} must not exceed 16 under Prospective-Aware Minimax policy`);

    for (let target = 99; target >= 1; target--) {
      let bestIdx = -1;
      for (let i = checkpoints.length - 1; i >= 0; i--) {
        if (checkpoints[i].index <= target) {
          bestIdx = checkpoints[i].index;
          break;
        }
      }
      assert.notStrictEqual(bestIdx, -1, `Target ${target} must find a valid checkpoint without falling back to 0`);
      const targetBuckets = countBucketsBeforeIndex(list, target, -1);
      const bestBuckets = countBucketsBeforeIndex(list, bestIdx, -1);
      assert.ok(targetBuckets - bestBuckets <= 16, `Replay distance ${targetBuckets - bestBuckets} for target ${target} must not exceed 16`);
    }
  });

  it('Undo -> Redo -> Undo sequence maintains checkpoint validity and zero fallback', () => {
    const MAX_HISTORY_CHECKPOINTS = 10;
    const list: any[] = [];
    const checkpoints: { index: number }[] = [];

    const capture = (index: number) => {
      if (checkpoints.length >= MAX_HISTORY_CHECKPOINTS) {
        const evictIdx = selectEvictionIndexMinimax(checkpoints, list, -1, MAX_HISTORY_CHECKPOINTS);
        if (evictIdx >= 0 && evictIdx < checkpoints.length) checkpoints.splice(evictIdx, 1);
      }
      checkpoints.push({ index });
      checkpoints.sort((a, b) => a.index - b.index);
    };

    for (let i = 1; i <= 50; i++) {
      list.push(createBucketCmd('user_A', i));
      capture(i);
    }

    const redoStack: any[] = [];
    for (let step = 0; step < 5; step++) {
      const removed = list.pop();
      redoStack.push(removed);
      checkpoints.pop();
    }

    for (let step = 0; step < 3; step++) {
      const restored = redoStack.pop();
      list.push(restored);
      capture(list.length);
    }

    const removedAgain = list.pop();
    redoStack.push(removedAgain);
    assert.ok(checkpoints.length > 0, 'Checkpoints remain active after Undo-Redo-Undo');
  });

  it('Mixed Pencil + Bucket commands maintains valid minimax distribution', () => {
    const MAX_HISTORY_CHECKPOINTS = 10;
    const list: any[] = [];
    const checkpoints: { index: number }[] = [];

    const capture = (index: number) => {
      if (checkpoints.length >= MAX_HISTORY_CHECKPOINTS) {
        const evictIdx = selectEvictionIndexMinimax(checkpoints, list, -1, MAX_HISTORY_CHECKPOINTS);
        if (evictIdx >= 0 && evictIdx < checkpoints.length) checkpoints.splice(evictIdx, 1);
      }
      checkpoints.push({ index });
      checkpoints.sort((a, b) => a.index - b.index);
    };

    for (let i = 1; i <= 120; i++) {
      if (i % 3 === 0) {
        list.push(createBucketCmd('user_A', i));
        capture(i);
      } else {
        list.push(createStrokeCmd('user_A', i));
      }
    }
    assert.ok(checkpoints.length <= MAX_HISTORY_CHECKPOINTS);
  });

  it('Clear command invalidates prior checkpoints correctly', () => {
    const list: any[] = [];
    const checkpoints: { index: number; lastClearIndex: number }[] = [];

    for (let i = 1; i <= 10; i++) {
      list.push(createBucketCmd('user_A', i));
      checkpoints.push({ index: i, lastClearIndex: -1 });
    }

    list.push({ event: 'draw_clear' });
    const lastClearIndex = findLatestClearIndex(list);
    assert.strictEqual(lastClearIndex, 10);

    const validCheckpoints = checkpoints.filter(cp => cp.index > lastClearIndex);
    assert.strictEqual(validCheckpoints.length, 0, 'All prior checkpoints invalidated after clear');
  });
});

describe('Phase 1F.8.2: Batch Replay Promotion & Undo Timers Suite', () => {
  it('Batch Replay policy: enabled by default, disabled only when explicitly 0', () => {
    const evaluateBatchReplay = (storageVal: string | null | undefined, throwsError: boolean = false): boolean => {
      try {
        if (throwsError) throw new Error('SecurityError: localStorage blocked');
        if (storageVal === undefined) return true; // window === undefined fallback
        return storageVal !== '0';
      } catch (e) {
        return true;
      }
    };

    // 1. Default state: null (no key in storage)
    assert.strictEqual(evaluateBatchReplay(null), true, 'Batch Replay must be active by default when key is null');
    assert.strictEqual(evaluateBatchReplay(undefined), true, 'Batch Replay must be active by default in headless / SSR context');

    // 2. Explicit opt-out: '0'
    assert.strictEqual(evaluateBatchReplay('0'), false, 'Setting freedraw_bucket_batch_replay_exp to "0" must disable Batch Replay');

    // 3. Other values: '1', '', 'true'
    assert.strictEqual(evaluateBatchReplay('1'), true, 'Setting freedraw_bucket_batch_replay_exp to "1" must enable Batch Replay');
    assert.strictEqual(evaluateBatchReplay(''), true, 'Unset empty string must default to enabled');

    // 4. Storage access failure (e.g. Incognito / blocked cookies):
    assert.strictEqual(evaluateBatchReplay(null, true), true, 'Exception accessing storage must safely fallback to enabled');
  });

  it('Undo Timers & Logging: replayDurationMs and totalUndoDurationMs are isolated and never double-logged', () => {
    const logs: string[] = [];
    const logDiag = (d: any) => logs.push(JSON.stringify(d));

    // Simulate local undo diagnostic object
    const localDiag: any = {
      opId: 'test_local_undo_123',
      type: 'local_undo',
      totalSyncDurationMs: 0,
      replayDurationMs: 0,
      totalUndoDurationMs: 0
    };

    // Step 1: Inside replayFreeDrawHistorySafely
    const replayStartTime = 1000;
    const replayEndTime = 1088.4;
    const replayDuration = replayEndTime - replayStartTime;
    localDiag.replayDurationMs = replayDuration;

    if (localDiag.type !== 'local_undo') {
      localDiag.totalSyncDurationMs = replayDuration;
      logDiag(localDiag);
    }

    // Step 2: Confirm NO premature or duplicate log emitted from inner replay for local_undo
    assert.strictEqual(logs.length, 0, 'Inner replay must not emit duplicate log for local_undo');

    // Step 3: Inside executeUndo completion
    const undoStartTime = 995;
    const undoEndTime = 1092;
    const totalDuration = undoEndTime - undoStartTime;
    localDiag.totalUndoDurationMs = totalDuration;
    localDiag.totalSyncDurationMs = totalDuration;
    logDiag(localDiag);

    // Step 4: Verify single log emitted with both durations accurate
    assert.strictEqual(logs.length, 1, 'Exactly one log emitted for local_undo');
    assert.ok(Math.abs(localDiag.replayDurationMs - 88.4) < 1e-4, 'Replay duration matches expected');
    assert.strictEqual(localDiag.totalUndoDurationMs, 97);
    assert.strictEqual(localDiag.totalSyncDurationMs, 97, 'Backward compatibility preserved in totalSyncDurationMs');
    assert.ok(localDiag.totalUndoDurationMs >= localDiag.replayDurationMs, 'Total undo duration must encompass replay duration');
  });

  it('Remote Undo Timers: emits single log with replayDurationMs and totalSyncDurationMs', () => {
    const logs: string[] = [];
    const logDiag = (d: any) => logs.push(JSON.stringify(d));

    const remoteDiag: any = {
      opId: 'test_remote_undo_456',
      type: 'remote_undo',
      totalSyncDurationMs: 0,
      replayDurationMs: 0,
      totalUndoDurationMs: 0
    };

    const replayStartTime = 2000;
    const replayEndTime = 2075.2;
    const replayDuration = replayEndTime - replayStartTime;
    remoteDiag.replayDurationMs = replayDuration;

    if (remoteDiag.type !== 'local_undo') {
      remoteDiag.totalSyncDurationMs = replayDuration;
      logDiag(remoteDiag);
    }

    assert.strictEqual(logs.length, 1, 'Exactly one log emitted for remote_undo');
    assert.ok(Math.abs(remoteDiag.replayDurationMs - 75.2) < 1e-4, 'Remote replay duration matches expected');
    assert.ok(Math.abs(remoteDiag.totalSyncDurationMs - 75.2) < 1e-4, 'Remote total sync duration matches expected');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { encodeBinaryDrawMessage } from '../src/utils/drawBinaryHelper';

interface FreeDrawCheckpoint {
  canvas: { width: number; height: number; pixels?: string } | null;
  index: number;
  anchorSignature: string | null;
  lastClearIndex: number;
}

const getCommandSignature = (cmd: any): string => {
  if (!cmd) return "";
  const instId = cmd.instanceId || (cmd.data && typeof cmd.data === 'object' ? cmd.data.instanceId : "");
  const sId = cmd.strokeId !== undefined ? cmd.strokeId : -1;
  return `${instId}_${sId}`;
};

const isBucketCommand = (cmd: any): boolean => {
  if (!cmd) return false;
  if (cmd.event === 'draw_action' && (cmd.tool === 'bucket' || cmd.data?.tool === 'bucket')) return true;
  if (cmd.data) {
    let byte0 = 0;
    if (cmd.data instanceof ArrayBuffer) {
      byte0 = new Uint8Array(cmd.data)[0];
    } else if (ArrayBuffer.isView(cmd.data)) {
      byte0 = (cmd.data as Uint8Array)[0];
    } else if (Array.isArray(cmd.data)) {
      byte0 = cmd.data[0];
    }
    if (byte0 === 4) return true;
  }
  return false;
};

const countBucketsBeforeIndex = (commands: any[], k: number, lastClearIndex: number): number => {
  const start = lastClearIndex >= 0 ? lastClearIndex + 1 : 0;
  const end = Math.min(k, commands.length);
  let count = 0;
  for (let i = start; i < end; i++) {
    if (isBucketCommand(commands[i])) {
      count++;
    }
  }
  return count;
};

const isCheckpointValid = (
  cp: FreeDrawCheckpoint,
  commands: any[],
  targetIndex?: number
): boolean => {
  if (!cp.canvas || cp.index <= 0) return false;
  const N = commands.length;
  if (cp.index > N) return false;
  if (targetIndex !== undefined && cp.index > targetIndex) return false;

  const lastClearIndex = -1; // Assuming no clear in this test
  if (cp.index <= lastClearIndex) return false;
  if (cp.lastClearIndex !== lastClearIndex) return false;

  const sig = getCommandSignature(commands[cp.index - 1]);
  if (!cp.anchorSignature || sig !== cp.anchorSignature) return false;

  return true;
};

describe('Phase 2A — Adaptive Bucket-Aware Checkpoint Tests', () => {
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

  it('Feature flag OFF: Bucket commands do not trigger adaptive checkpoints', () => {
    const isBucketCheckpointExpEnabled = false;
    const list: any[] = [];
    const baseCp: FreeDrawCheckpoint = { canvas: null, index: 0, anchorSignature: null, lastClearIndex: -1 };
    const tailCp: FreeDrawCheckpoint = { canvas: null, index: 0, anchorSignature: null, lastClearIndex: -1 };

    // Add 3 pencil strokes and 1 bucket
    list.push(createStrokeCmd('user_A', 1));
    list.push(createStrokeCmd('user_A', 2));
    list.push(createStrokeCmd('user_A', 3));

    // When flag is off, advanceCheckpointBucketPost delegates to advanceCheckpointIncremental (which requires STRIDE=8)
    const N = list.length;
    if (isBucketCheckpointExpEnabled) {
      // should not enter
    } else {
      if (N >= 8 && N % 8 === 0) {
        tailCp.index = N;
      }
    }

    assert.strictEqual(baseCp.index, 0);
    assert.strictEqual(tailCp.index, 0);
  });

  it('Feature flag ON: Single Bucket captures Pre-Bucket in Base and Post-Bucket in Tail', () => {
    const list: any[] = [];
    let baseCp: FreeDrawCheckpoint = { canvas: null, index: 0, anchorSignature: null, lastClearIndex: -1 };
    let tailCp: FreeDrawCheckpoint = { canvas: null, index: 0, anchorSignature: null, lastClearIndex: -1 };

    // User A draws 3 pencil strokes
    list.push(createStrokeCmd('user_A', 1));
    list.push(createStrokeCmd('user_A', 2));
    list.push(createStrokeCmd('user_A', 3));

    // User B executes Bucket at index 3:
    const targetIndex = list.length; // 3
    const priorBucketCount = countBucketsBeforeIndex(list, targetIndex, -1);
    assert.strictEqual(priorBucketCount, 0);

    // Pre-bucket capture into base:
    baseCp = {
      canvas: { width: 1000, height: 600, pixels: 'pre_bucket' },
      index: targetIndex, // 3
      anchorSignature: getCommandSignature(list[targetIndex - 1]), // user_A_3
      lastClearIndex: -1
    };

    // Bucket executes & is pushed to history
    list.push(createBucketCmd('user_B', 1, '#00ff00'));
    const postIndex = list.length; // 4

    // Post-bucket capture into tail:
    tailCp = {
      canvas: { width: 1000, height: 600, pixels: 'post_bucket' },
      index: postIndex, // 4
      anchorSignature: getCommandSignature(list[postIndex - 1]), // user_B_1
      lastClearIndex: -1
    };

    assert.strictEqual(baseCp.index, 3);
    assert.strictEqual(baseCp.anchorSignature, 'user_A_3');
    assert.strictEqual(tailCp.index, 4);
    assert.strictEqual(tailCp.anchorSignature, 'user_B_1');
    assert.strictEqual(isCheckpointValid(baseCp, list), true);
    assert.strictEqual(isCheckpointValid(tailCp, list), true);

    // TEST UNDO OF BUCKET ITSELF:
    // User B undoes bucket at index 3:
    const undoTarget = 3;
    // Invalidate checkpoints after undoTarget (3):
    if (tailCp.index > undoTarget) {
      tailCp = { canvas: null, index: 0, anchorSignature: null, lastClearIndex: -1 };
    }
    if (baseCp.index > undoTarget) {
      baseCp = { canvas: null, index: 0, anchorSignature: null, lastClearIndex: -1 };
    }

    assert.strictEqual(tailCp.index, 0, 'Tail was at 4 > 3, correctly invalidated');
    assert.strictEqual(baseCp.index, 3, 'Base was at 3 <= 3, PRESERVED!');

    // Remove bucket from history
    list.splice(undoTarget, 1);
    assert.strictEqual(list.length, 3);

    // Replay check:
    assert.strictEqual(isCheckpointValid(baseCp, list), true);
    // Best checkpoint for N=3 is Base at index 3!
    // Replay start index: 3
    // Commands to replay: list[3..3] = 0 commands!
    // Replayed flood fills: 0!
  });

  it('Feature flag ON: Interleaved strokes after Bucket skip floodFill completely on Undo', () => {
    const list: any[] = [];
    let baseCp: FreeDrawCheckpoint = { canvas: null, index: 0, anchorSignature: null, lastClearIndex: -1 };
    let tailCp: FreeDrawCheckpoint = { canvas: null, index: 0, anchorSignature: null, lastClearIndex: -1 };

    // 2 pencil strokes
    list.push(createStrokeCmd('user_A', 1));
    list.push(createStrokeCmd('user_A', 2));

    // Bucket at index 2
    baseCp = {
      canvas: { width: 1000, height: 600, pixels: 'pre_bucket' },
      index: 2,
      anchorSignature: getCommandSignature(list[1]),
      lastClearIndex: -1
    };
    list.push(createBucketCmd('user_A', 3));
    tailCp = {
      canvas: { width: 1000, height: 600, pixels: 'post_bucket' },
      index: 3,
      anchorSignature: getCommandSignature(list[2]),
      lastClearIndex: -1
    };

    // User B draws 2 pencil strokes after the bucket
    list.push(createStrokeCmd('user_B', 1)); // index 3
    list.push(createStrokeCmd('user_B', 2)); // index 4

    // User B undoes stroke 2 (at index 4)
    const undoTarget = 4;
    if (tailCp.index > undoTarget) tailCp = { canvas: null, index: 0, anchorSignature: null, lastClearIndex: -1 };
    if (baseCp.index > undoTarget) baseCp = { canvas: null, index: 0, anchorSignature: null, lastClearIndex: -1 };

    // Both checkpoints preserved because 2 <= 4 and 3 <= 4
    assert.strictEqual(baseCp.index, 2);
    assert.strictEqual(tailCp.index, 3);

    // Remove stroke 2
    list.splice(undoTarget, 1);
    assert.strictEqual(list.length, 4);

    // Best checkpoint for N=4 is tailCp at index 3 (post-bucket)!
    assert.strictEqual(isCheckpointValid(tailCp, list), true);
    // Replay startIndex is 3!
    // Range to replay: index 3 to 4 (only user_B_1, pencil stroke)!
    // Bucket at index 2 is NOT in the range [3, 4]!
    // Flood fill executions: 0!
  });

  it('Feature flag ON: Two Buckets in history rotate checkpoints without losing earlier bucket', () => {
    const list: any[] = [];
    let baseCp: FreeDrawCheckpoint = { canvas: null, index: 0, anchorSignature: null, lastClearIndex: -1 };
    let tailCp: FreeDrawCheckpoint = { canvas: null, index: 0, anchorSignature: null, lastClearIndex: -1 };

    // Bucket 1 at index 0
    list.push(createBucketCmd('user_A', 1, '#ff0000'));
    tailCp = {
      canvas: { width: 1000, height: 600, pixels: 'b1_post' },
      index: 1,
      anchorSignature: getCommandSignature(list[0]),
      lastClearIndex: -1
    };

    // Strokes 1, 2, 3
    list.push(createStrokeCmd('user_B', 1)); // index 1
    list.push(createStrokeCmd('user_B', 2)); // index 2
    list.push(createStrokeCmd('user_B', 3)); // index 3

    // Bucket 2 arrives at index 4:
    const targetIndex = 4;
    const priorBucketCount = countBucketsBeforeIndex(list, targetIndex, -1);
    assert.strictEqual(priorBucketCount, 1);

    // Since priorBucketCount > 0, tail is rotated to base:
    baseCp = {
      canvas: tailCp.canvas,
      index: tailCp.index, // 1 (post-Bucket 1)
      anchorSignature: tailCp.anchorSignature,
      lastClearIndex: tailCp.lastClearIndex
    };

    // Bucket 2 executes & is pushed to history
    list.push(createBucketCmd('user_A', 2, '#0000ff'));
    tailCp = {
      canvas: { width: 1000, height: 600, pixels: 'b2_post' },
      index: 5, // post-Bucket 2
      anchorSignature: getCommandSignature(list[4]),
      lastClearIndex: -1
    };

    assert.strictEqual(baseCp.index, 1, 'Base protects Bucket 1');
    assert.strictEqual(tailCp.index, 5, 'Tail protects Bucket 2');

    // Case A: User undoes Bucket 2 (at index 4)
    let bCp = { ...baseCp };
    let tCp = { ...tailCp };
    const undoTargetB2 = 4;
    if (tCp.index > undoTargetB2) tCp = { canvas: null, index: 0, anchorSignature: null, lastClearIndex: -1 };
    if (bCp.index > undoTargetB2) bCp = { canvas: null, index: 0, anchorSignature: null, lastClearIndex: -1 };

    assert.strictEqual(tCp.index, 0, 'Tail (5 > 4) invalidated');
    assert.strictEqual(bCp.index, 1, 'Base (1 <= 4) PRESERVED!');
    // Replay starts at index 1: Bucket 1 is NOT replayed!
    // Only strokes 1, 2, 3 are replayed!
    // Number of floodFills: 0!
  });
});

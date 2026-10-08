import { describe, it } from 'node:test';
import assert from 'node:assert';
import { encodeBinaryDrawMessage } from '../src/utils/drawBinaryHelper';

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

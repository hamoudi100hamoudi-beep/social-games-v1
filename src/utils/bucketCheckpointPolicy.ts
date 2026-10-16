export const isBucketCommand = (cmd: any): boolean => {
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

export const isClearCommand = (c: any): boolean => {
  if (!c) return false;
  if (c.event === 'draw_clear') return true;
  if (c.event === 'draw_binary' && c.data) {
    const byte0 = c.data instanceof ArrayBuffer 
      ? new Uint8Array(c.data)[0] 
      : (ArrayBuffer.isView(c.data) ? (c.data as Uint8Array)[0] : (Array.isArray(c.data) ? c.data[0] : 0));
    return byte0 === 5;
  }
  return false;
};

export const findLatestClearIndex = (commands: any[], upToIndex?: number): number => {
  const end = upToIndex !== undefined ? Math.min(commands.length - 1, upToIndex) : commands.length - 1;
  for (let i = end; i >= 0; i--) {
    if (isClearCommand(commands[i])) return i;
  }
  return -1;
};

export const countBucketsBeforeIndex = (commands: any[], k: number, lastClearIndex: number): number => {
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

export interface CheckpointInfo {
  index: number;
  [key: string]: any;
}

/**
 * Global Minimax Eviction Policy:
 * Evaluates all removable candidates (protecting index 0 anchor and the last 3 tail checkpoints),
 * and picks the candidate eviction that minimizes the maximum bucket gap across the entire array
 * (including start/clear boundary and end boundary).
 */
export const selectEvictionIndexMinimax = (
  checkpoints: CheckpointInfo[],
  commands: any[],
  lastClearIndex: number,
  maxCapacity: number = 10
): number => {
  if (checkpoints.length < maxCapacity) return -1;

  const totalBuckets = countBucketsBeforeIndex(commands, commands.length, lastClearIndex);
  const minEvictIndex = 1;
  const maxEvictIndex = Math.max(1, checkpoints.length - 4);

  let bestEvictIdx = minEvictIndex;
  let lowestMaxGap = Infinity;

  for (let i = minEvictIndex; i <= maxEvictIndex; i++) {
    const reduced = checkpoints.filter((_, idx) => idx !== i);
    let maxG = 0;
    const bCounts = reduced.map(cp => countBucketsBeforeIndex(commands, cp.index, lastClearIndex));
    const startB = 0;
    const endB = totalBuckets;

    if (reduced.length > 0) {
      maxG = Math.max(maxG, bCounts[0] - startB);
      for (let j = 0; j < reduced.length - 1; j++) {
        maxG = Math.max(maxG, bCounts[j + 1] - bCounts[j]);
      }
      maxG = Math.max(maxG, endB - bCounts[reduced.length - 1]);
    } else {
      maxG = endB - startB;
    }

    if (maxG < lowestMaxGap) {
      lowestMaxGap = maxG;
      bestEvictIdx = i;
    }
  }

  return bestEvictIdx;
};

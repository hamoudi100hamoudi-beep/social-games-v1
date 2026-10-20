const isBucketCommand = (cmd) => {
  if (!cmd) return false;
  if (cmd.event === "draw_action" && (cmd.tool === "bucket" || cmd.data?.tool === "bucket")) return true;
  if (cmd.data) {
    let byte0 = 0;
    if (cmd.data instanceof ArrayBuffer) {
      byte0 = new Uint8Array(cmd.data)[0];
    } else if (ArrayBuffer.isView(cmd.data)) {
      byte0 = cmd.data[0];
    } else if (Array.isArray(cmd.data)) {
      byte0 = cmd.data[0];
    }
    if (byte0 === 4) return true;
  }
  return false;
};
export const isClearCommand = (c) => {
  if (!c) return false;
  if (c.event === "draw_clear") return true;
  if (c.event === "draw_binary" && c.data) {
    const byte0 = c.data instanceof ArrayBuffer ? new Uint8Array(c.data)[0] : ArrayBuffer.isView(c.data) ? c.data[0] : Array.isArray(c.data) ? c.data[0] : 0;
    return byte0 === 5;
  }
  return false;
};
export const findLatestClearIndex = (commands, upToIndex) => {
  const end = upToIndex !== void 0 ? Math.min(commands.length - 1, upToIndex) : commands.length - 1;
  for (let i = end; i >= 0; i--) {
    if (isClearCommand(commands[i])) return i;
  }
  return -1;
};
export const countBucketsBeforeIndex = (commands, k, lastClearIndex) => {
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
export const selectEvictionIndexMinimax = (checkpoints, commands, lastClearIndex, newIndex, maxCapacity = 10) => {
  if (checkpoints.length < maxCapacity) return -1;
  const totalBuckets = countBucketsBeforeIndex(commands, commands.length, lastClearIndex);
  const minEvictIndex = 1;
  const maxEvictIndex = Math.max(1, checkpoints.length - 3);
  let bestEvictIdx = minEvictIndex;
  let lowestMaxGap = Infinity;
  for (let i = minEvictIndex; i <= maxEvictIndex; i++) {
    const reduced = checkpoints.filter((_, idx) => idx !== i);
    const prospective = [...reduced, { index: newIndex }];
    prospective.sort((a, b) => a.index - b.index);
    let maxG = 0;
    const bCounts = prospective.map((cp) => countBucketsBeforeIndex(commands, cp.index, lastClearIndex));
    const startB = 0;
    const endB = totalBuckets;
    if (prospective.length > 0) {
      maxG = Math.max(maxG, bCounts[0] - startB);
      for (let j = 0; j < prospective.length - 1; j++) {
        maxG = Math.max(maxG, bCounts[j + 1] - bCounts[j]);
      }
      maxG = Math.max(maxG, endB - bCounts[prospective.length - 1]);
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

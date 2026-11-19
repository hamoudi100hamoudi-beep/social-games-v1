export const getCommandSignature = (cmd: any): string => {
  if (!cmd) return "";
  const instId = cmd.instanceId || cmd.instId || (cmd.data && typeof cmd.data === 'object' ? (cmd.data.instanceId || cmd.data.instId) : "");
  let sId = cmd.strokeId !== undefined ? cmd.strokeId : -1;
  if (sId === -1 && cmd.data && typeof cmd.data === 'object' && cmd.data.strokeId !== undefined) {
    sId = cmd.data.strokeId;
  }
  return `${instId}_${sId}`;
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

export const isCommandHeavy = (cmd: any): boolean => {
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

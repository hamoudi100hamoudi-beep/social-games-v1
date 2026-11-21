import type { BucketLockSyncPayload, Room } from "../src/types/game.js";

export const COMPETITIVE_BUCKET_UNDO_LIMIT = 3;

export interface CompetitiveUndoResult {
  removed: boolean;
  reason?: 'not_found' | 'bucket_locked' | 'lock_desync';
  drawEpoch: number;
  lockedBucket: { instId: string; strokeId: number } | null;
}

/**
 * Extracts a 7-character session instance ID from binary draw packets.
 */
function extractInstanceIdFromBuffer(buf: any): string {
  if (!buf || (!Buffer.isBuffer(buf) && !Array.isArray(buf)) || buf.length < 8) return "";
  let str = "";
  for (let i = 0; i < 7; i++) {
    const code = buf[1 + i];
    if (code > 0) {
      str += String.fromCharCode(code);
    }
  }
  return str;
}

function readUInt16LEAny(buf: any, offset: number): number | undefined {
  if (!buf || offset < 0 || offset + 1 >= buf.length) return undefined;
  if (Buffer.isBuffer(buf)) return buf.readUInt16LE(offset);
  if (Array.isArray(buf)) return ((buf[offset] & 0xff) | ((buf[offset + 1] & 0xff) << 8)) >>> 0;
  return undefined;
}

function extractStrokeIdFromBuffer(buf: any, type: number): number | undefined {
  if (!buf || (!Buffer.isBuffer(buf) && !Array.isArray(buf))) return undefined;
  if ((type === 1 || type === 3) && buf.length >= 25) {
    return readUInt16LEAny(buf, 23);
  } else if (type === 4) {
    const hasTarget = buf.length >= 21;
    if (hasTarget && buf.length >= 23) {
      return readUInt16LEAny(buf, 21);
    } else if (!hasTarget && buf.length >= 19) {
      return readUInt16LEAny(buf, 17);
    }
  } else if (type === 9) {
    const pointsLen = buf.length >= 16 ? (readUInt16LEAny(buf, 14) ?? 0) : 0;
    const expectedLen = 16 + pointsLen * 4;
    if (buf.length >= expectedLen + 2) {
      return readUInt16LEAny(buf, expectedLen);
    }
  }
  return undefined;
}

function getHistoryEntryMeta(cmd: any): { type: number; instId: string; strokeId: number | undefined } {
  if (!cmd) return { type: 0, instId: "", strokeId: undefined };

  const isBinary =
    cmd.event === "draw_binary" &&
    cmd.data &&
    (Buffer.isBuffer(cmd.data) || Array.isArray(cmd.data)) &&
    cmd.data.length > 0;

  let type = 0;
  if (isBinary) {
    type = cmd.data[0];
  } else if (cmd.event === "draw_action") {
    type = 4;
  } else if (cmd.event === "draw_clear") {
    type = 5;
  } else if (cmd.event === "draw_stroke") {
    type = 9;
  } else if (cmd.event === "draw_start") {
    type = 1;
  } else if (cmd.event === "draw_end") {
    type = 3;
  } else if (cmd.event === "draw_cancel") {
    type = 6;
  }

  const instId =
    cmd.instId ||
    cmd.instanceId ||
    (isBinary ? extractInstanceIdFromBuffer(cmd.data) : "") ||
    (cmd.data && typeof cmd.data === "object" && !Buffer.isBuffer(cmd.data) && !Array.isArray(cmd.data)
      ? (cmd.data.instanceId || cmd.data.instId || "")
      : "");

  let strokeId: number | undefined =
    cmd.strokeId !== undefined && cmd.strokeId !== null ? cmd.strokeId : undefined;

  if (strokeId === undefined && isBinary) {
    strokeId = extractStrokeIdFromBuffer(cmd.data, type);
  } else if (
    strokeId === undefined &&
    cmd.data &&
    typeof cmd.data === "object" &&
    !Buffer.isBuffer(cmd.data) &&
    !Array.isArray(cmd.data) &&
    cmd.data.strokeId !== undefined
  ) {
    strokeId = cmd.data.strokeId;
  }

  return { type, instId, strokeId };
}

function isClearHistoryEntry(cmd: any): boolean {
  if (!cmd) return false;
  if (cmd.event === "draw_clear") return true;
  if (cmd.event === "draw_binary" && cmd.data && cmd.data.length > 0) {
    const t = cmd.data[0];
    return t === 5 || t === 10;
  }
  return false;
}

function findActiveEpochStartIndex(history: any[]): number {
  for (let i = history.length - 1; i >= 0; i--) {
    if (isClearHistoryEntry(history[i])) {
      return i + 1;
    }
  }
  return 0;
}

export function isCompetitiveExperimentalRoom(room: Room | undefined | null): boolean {
  return Boolean(room && room.isExperimental && !room.isFreeDraw);
}

/**
 * Advances drawEpoch exactly once for a logical Clear operation and resets any previous Bucket lock.
 */
export function advanceRoomDrawEpoch(room: Room): void {
  if (!room || !room.gameState) return;
  room.gameState.drawEpoch = (room.gameState.drawEpoch ?? 0) + 1;
  room.gameState.lockedBucketTarget = null;
}

/**
 * Dynamically resolves the current Bucket lock frontier index inside the active Epoch.
 * Primary reference is stable identity (drawEpoch + instId + strokeId), never a persisted raw index.
 */
export function resolveRoomBucketLockState(room: Room): BucketLockSyncPayload & {
  lockIdx: number;
  lockDesynced: boolean;
} {
  const drawEpoch = room?.gameState?.drawEpoch ?? 0;
  if (!room || !isCompetitiveExperimentalRoom(room)) {
    return { drawEpoch, lockedBucket: null, lockIdx: -1, lockDesynced: false };
  }

  const lock = room.gameState.lockedBucketTarget ?? null;
  if (!lock || lock.drawEpoch !== drawEpoch) {
    return { drawEpoch, lockedBucket: null, lockIdx: -1, lockDesynced: false };
  }

  const history = room.gameState.drawHistory || [];
  const epochStart = findActiveEpochStartIndex(history);

  for (let i = epochStart; i < history.length; i++) {
    const meta = getHistoryEntryMeta(history[i]);
    if (meta.type === 4 && meta.instId === lock.instId && meta.strokeId === lock.strokeId) {
      return {
        drawEpoch,
        lockedBucket: { instId: lock.instId, strokeId: lock.strokeId },
        lockIdx: i,
        lockDesynced: false
      };
    }
  }

  return {
    drawEpoch,
    lockedBucket: { instId: lock.instId, strokeId: lock.strokeId },
    lockIdx: -1,
    lockDesynced: true
  };
}

function recomputeCompetitiveBucketLockOnBucketRecord(room: Room): void {
  if (!isCompetitiveExperimentalRoom(room)) return;
  if (room.gameState.drawEpoch === undefined) {
    room.gameState.drawEpoch = 0;
  }

  const history = room.gameState.drawHistory || [];
  const epochStart = findActiveEpochStartIndex(history);
  const resolved = resolveRoomBucketLockState(room);

  // If existing lock for current epoch is somehow missing, do not weaken/move it backward.
  if (resolved.lockDesynced) {
    return;
  }

  const scanStart = Math.max(epochStart, resolved.lockIdx + 1);
  const unlockedBuckets: { idx: number; instId: string; strokeId: number }[] = [];

  for (let i = scanStart; i < history.length; i++) {
    const meta = getHistoryEntryMeta(history[i]);
    if (meta.type === 4 && meta.instId && meta.strokeId !== undefined) {
      unlockedBuckets.push({ idx: i, instId: meta.instId, strokeId: meta.strokeId });
    }
  }

  if (unlockedBuckets.length > COMPETITIVE_BUCKET_UNDO_LIMIT) {
    const newLock = unlockedBuckets[unlockedBuckets.length - (COMPETITIVE_BUCKET_UNDO_LIMIT + 1)];
    if (newLock && newLock.idx > resolved.lockIdx) {
      room.gameState.lockedBucketTarget = {
        drawEpoch: resolved.drawEpoch,
        instId: newLock.instId,
        strokeId: newLock.strokeId
      };
    }
  }
}

/**
 * Records a draw command into authoritative room drawing history.
 * Handles stroke consolidation, start/end validation, and atomic redo stack reset.
 */
export function recordRoomDrawCommand(
  room: Room,
  event: string,
  data: any,
  customInstId?: string,
  customStrokeId?: number,
  options?: { skipEpochAdvance?: boolean }
): { recorded: boolean; drawEpoch: number } {
  if (!room || !room.gameState) return { recorded: false, drawEpoch: 0 };
  if (!room.gameState.drawHistory) room.gameState.drawHistory = [];
  //@ts-ignore
  if (!room.gameState.redoStack) room.gameState.redoStack = [];
  if (room.gameState.drawEpoch === undefined) {
    room.gameState.drawEpoch = 0;
  }

  const isBinary = event === "draw_binary" && Buffer.isBuffer(data) && data.length > 0;
  const type = isBinary ? data[0] : 0;
  const instId = customInstId || (isBinary ? extractInstanceIdFromBuffer(data) : "");
  let strokeId = customStrokeId;
  if (strokeId === undefined && isBinary && Buffer.isBuffer(data)) {
    strokeId = extractStrokeIdFromBuffer(data, type);
  }

  // If we already have a solidified draw_stroke (type 9) in history for this instId, do not append any further transient drawing actions
  if (isBinary && instId && (type === 1 || type === 2 || type === 3 || type === 6)) {
    const hasStroke = room.gameState.drawHistory.some(cmd => {
      if (cmd.event === 'draw_binary' && Buffer.isBuffer(cmd.data) && cmd.data.length > 0) {
        return cmd.data[0] === 9 && extractInstanceIdFromBuffer(cmd.data) === instId;
      }
      return false;
    });
    if (hasStroke) {
      return { recorded: false, drawEpoch: room.gameState.drawEpoch }; // Ignore duplicated transient live packet as it's already recorded in a completed stroke object!
    }
  }

  let isValidStart = false;

  if (isBinary) {
    if (type === 1) { // draw_start
      room.gameState.isDrawingActive = true;
      isValidStart = true;
    } else if (type === 2) { // draw_move
      if (room.gameState.isDrawingActive === false) {
        return { recorded: false, drawEpoch: room.gameState.drawEpoch };
      }
    } else if (type === 3 || type === 6) { // draw_end أو draw_cancel
      room.gameState.isDrawingActive = false;
    } else if (type === 9) { // draw_stroke
      isValidStart = true;
      room.gameState.isDrawingActive = false;

      // Consolidate legacy transient stroke streams under the same session instanceId
      if (instId) {
        room.gameState.drawHistory = room.gameState.drawHistory.filter(cmd => {
          if (cmd.event === 'draw_binary' && Buffer.isBuffer(cmd.data) && cmd.data.length > 0) {
            const t = cmd.data[0];
            if ((t === 1 || t === 2 || t === 3 || t === 6) && extractInstanceIdFromBuffer(cmd.data) === instId) {
              return false;
            }
          }
          return true;
        });
      }
    } else if (type === 4 || type === 10 || type === 5) { // draw_action (bucket) or draw_clear
      isValidStart = true;
      room.gameState.isDrawingActive = false;
    }
  } else if (event === "draw_start" || event === "draw_action" || event === "draw_clear") {
    isValidStart = true;
  }

  // Protection to avoid orphaned packages on an empty draw history
  if (room.gameState.drawHistory.length === 0 && !isValidStart) {
    return { recorded: false, drawEpoch: room.gameState.drawEpoch };
  }

  const isClearCmd = (isBinary && (type === 5 || type === 10)) || event === "draw_clear";
  if (isClearCmd && !options?.skipEpochAdvance) {
    advanceRoomDrawEpoch(room);
  }

  const historyEntry: any = { event, data };
  if (instId) historyEntry.instId = instId;
  if (strokeId !== undefined) historyEntry.strokeId = strokeId;
  room.gameState.drawHistory.push(historyEntry);

  if ((isBinary && type === 4) || event === "draw_action") {
    recomputeCompetitiveBucketLockOnBucketRecord(room);
  }

  room.gameState.redoStack = [];
  return { recorded: true, drawEpoch: room.gameState.drawEpoch };
}

/**
 * Authoritative targeted undo for Competitive Experimental rooms (isExperimental && !isFreeDraw).
 * Enforces the 3-bucket undo limit per drawEpoch using stable identity (drawEpoch + instId + strokeId),
 * blocks undoing locked buckets or bypassing them to older commands, and treats [Type 9, Type 3] pairs as one logical stroke.
 */
export function undoRoomCompetitiveExperimentalStroke(
  room: Room,
  targetInstId: string,
  targetStrokeId: number
): CompetitiveUndoResult {
  if (!room || !room.gameState) {
    return { removed: false, reason: 'not_found', drawEpoch: 0, lockedBucket: null };
  }

  // Invariant: immediately lock active drawing on undo to block late-arriving packets
  room.gameState.isDrawingActive = false;

  const lockState = resolveRoomBucketLockState(room);
  const { drawEpoch, lockedBucket, lockIdx, lockDesynced } = lockState;

  if (!room.gameState.drawHistory || room.gameState.drawHistory.length === 0) {
    return {
      removed: false,
      reason: lockDesynced ? 'lock_desync' : 'not_found',
      drawEpoch,
      lockedBucket
    };
  }

  if (lockDesynced) {
    return {
      removed: false,
      reason: 'lock_desync',
      drawEpoch,
      lockedBucket
    };
  }

  const history = room.gameState.drawHistory;
  const epochStart = findActiveEpochStartIndex(history);

  const matchesTarget = (cmd: any): boolean => {
    if (!cmd || isClearHistoryEntry(cmd)) return false;
    const meta = getHistoryEntryMeta(cmd);
    return meta.instId === targetInstId && meta.strokeId === targetStrokeId;
  };

  let minTargetIdx = -1;
  for (let i = 0; i < history.length; i++) {
    if (matchesTarget(history[i])) {
      minTargetIdx = i;
      break;
    }
  }

  if (minTargetIdx === -1 || minTargetIdx < epochStart) {
    return {
      removed: false,
      reason: 'not_found',
      drawEpoch,
      lockedBucket
    };
  }

  if (lockIdx >= 0 && minTargetIdx <= lockIdx) {
    return {
      removed: false,
      reason: 'bucket_locked',
      drawEpoch,
      lockedBucket
    };
  }

  room.gameState.drawHistory = history.filter((cmd, idx) => idx < epochStart || !matchesTarget(cmd));

  if (room.freeDrawCanonicalCache) {
    const cacheKey = `${targetInstId}_${targetStrokeId}`;
    room.freeDrawCanonicalCache.delete(cacheKey);
  }

  return {
    removed: true,
    drawEpoch,
    lockedBucket
  };
}

/**
 * Performs an exact targeted removal of a stroke matching targetInstId and targetStrokeId in Free Draw mode.
 * Evicts from room.freeDrawCanonicalCache if present. Returns true if removed, false otherwise (no-op).
 */
export function undoRoomFreeDrawStroke(
  room: Room,
  targetInstId: string,
  targetStrokeId: number
): boolean {
  if (!room || !room.gameState.drawHistory || room.gameState.drawHistory.length === 0) {
    return false;
  }

  const history = room.gameState.drawHistory;

  const matchesTarget = (cmd: any): boolean => {
    if (!cmd) return false;
    if (cmd.instId === targetInstId && cmd.strokeId === targetStrokeId) {
      return true;
    }
    if (cmd.event === 'draw_binary' && Buffer.isBuffer(cmd.data) && cmd.data.length >= 8) {
      const b = cmd.data;
      const type = b[0];
      let inst = "";
      for (let i = 0; i < 7; i++) {
        const code = b[1 + i];
        if (code > 0) inst += String.fromCharCode(code);
      }
      if (inst !== targetInstId) return false;
      if ((type === 1 || type === 3) && b.length >= 25) {
        const sId = b.readUInt16LE(23);
        if (sId === targetStrokeId) return true;
      }
    }
    return false;
  };

  const hasMatch = history.some(matchesTarget);
  if (!hasMatch) {
    return false; // NO-OP: Target not found! Do not touch drawHistory.
  }

  // Filter out ONLY the matching element(s) for this target stroke,
  // keeping the order of all other elements and buckets completely intact!
  room.gameState.drawHistory = history.filter(cmd => !matchesTarget(cmd));

  // Invalidate canonical cache for this stroke if present
  if (room.freeDrawCanonicalCache) {
    const cacheKey = `${targetInstId}_${targetStrokeId}`;
    room.freeDrawCanonicalCache.delete(cacheKey);
  }

  return true;
}

/**
 * Performs 1-step undo on the authoritative room drawing history.
 * Supports atomic [draw_stroke, draw_end] compound stroke removal.
 * Immediately sets isDrawingActive to false to block late-arriving draw_move packets.
 */
export function undoRoomLastDrawing(
  room: Room
): { event: string; data: any }[] {
  if (!room) return [];
  if (!room.gameState.drawHistory) room.gameState.drawHistory = [];
  if (!room.gameState.redoStack) room.gameState.redoStack = [];

  // Lock drawing immediately when undo is pressed to lock out any late-arriving draw_move packets
  room.gameState.isDrawingActive = false;

  const canUndo = room.gameState.drawHistory.length > 0 && room.gameState.redoStack.length === 0;
  if (canUndo) {
    const history = room.gameState.drawHistory;
    const lastIndex = history.length - 1;
    const lastCmd = history[lastIndex];

    const isEndCmd = (cmd: any): boolean => {
      if (!cmd) return false;
      if (cmd.event === 'draw_end' || cmd.event === 'draw_cancel') return true;
      if (cmd.event === 'draw_binary' && cmd.data) {
        let b: number | null = null;
        if (Buffer.isBuffer(cmd.data) && cmd.data.length > 0) b = cmd.data[0];
        else if (Array.isArray(cmd.data) && cmd.data.length > 0) b = cmd.data[0];
        return b === 3 || b === 6;
      }
      return false;
    };

    const isStrokeCmd = (cmd: any): boolean => {
      if (!cmd) return false;
      if (cmd.event === 'draw_stroke') return true;
      if (cmd.event === 'draw_binary' && cmd.data) {
        let b: number | null = null;
        if (Buffer.isBuffer(cmd.data) && cmd.data.length > 0) b = cmd.data[0];
        else if (Array.isArray(cmd.data) && cmd.data.length > 0) b = cmd.data[0];
        return b === 9;
      }
      return false;
    };

    // 🛡️ Atomic Stroke Undo: If the last completed action is draw_stroke followed by draw_end (Type 9 + Type 3),
    // remove both together as a single logical unit so that draw_stroke does not remain orphaned in drawHistory.
    if (lastIndex >= 1 && isEndCmd(lastCmd) && isStrokeCmd(history[lastIndex - 1])) {
      const endCmd = history.pop()!;
      const strokeCmd = history.pop()!;
      room.gameState.redoStack = [[strokeCmd, endCmd]];
    } else {
      const removed = history.pop();
      if (removed) {
        room.gameState.redoStack = [removed]; // Enforce 1-step undo/redo limit
      }
    }
  }

  return room.gameState.drawHistory;
}

/**
 * Restores the most recently undone draw action from the 1-step redoStack back to drawHistory.
 */
export function redoRoomDrawing(
  room: Room
): { event: string; data: any }[] {
  if (!room) return [];
  if (!room.gameState.drawHistory) room.gameState.drawHistory = [];
  if (!room.gameState.redoStack) room.gameState.redoStack = [];

  const history = room.gameState.drawHistory;
  const redoStack = room.gameState.redoStack;

  if (redoStack.length > 0) {
    const restored = redoStack.pop();
    if (restored) {
      if (Array.isArray(restored)) {
        history.push(...restored);
      } else {
        history.push(restored);
      }
    }
  }
  return history;
}

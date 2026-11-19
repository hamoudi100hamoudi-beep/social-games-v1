import type { Room } from "../src/types/game.js";
import {
  COMPETITIVE_BUCKET_UNDO_LIMIT,
  type CompetitiveActionRejectReason,
  type CompetitiveLockedBoundaryTarget,
  type CompetitiveUndoRejectReason,
  type CompetitiveUndoSummary,
  extractCommandIdentity,
  findLatestClearMarkerIndex,
  getCommandPacketType,
  isCompetitiveBucketCommand,
  isCompetitiveDurableUndoableType,
  isCompetitiveRoomMode,
  makeCompetitiveIdentityKey,
  recomputeCompetitiveBucketBoundary,
  resolveLockedBoundaryIndex,
} from "../src/utils/competitiveUndoPolicy.js";

/**
 * Extracts a 7-character session instance ID from binary draw packets.
 */
function extractInstanceIdFromBuffer(buf: any): string {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 8) return "";
  let str = "";
  for (let i = 0; i < 7; i++) {
    const code = buf[1 + i];
    if (code > 0) {
      str += String.fromCharCode(code);
    }
  }
  return str;
}

export function ensureCompetitiveRoomState(room: Room): void {
  if (!room || !room.gameState) return;
  if (room.gameState.drawEpochId === undefined || !Number.isFinite(room.gameState.drawEpochId)) {
    room.gameState.drawEpochId = 0;
  }
  if (room.gameState.lockedBucketCount === undefined || !Number.isFinite(room.gameState.lockedBucketCount)) {
    room.gameState.lockedBucketCount = 0;
  }
  if (room.gameState.lockedBoundaryTarget === undefined) {
    room.gameState.lockedBoundaryTarget = null;
  }
  if (isCompetitiveRoomMode(room)) {
    room.gameState.competitiveUndoLimit = COMPETITIVE_BUCKET_UNDO_LIMIT;
  }
  if (!room.competitiveEpochUsedIds) {
    room.competitiveEpochUsedIds = new Set<string>();
  }
  if (!room.competitiveClearedIds) {
    room.competitiveClearedIds = new Set<string>();
  }
}

export function getCompetitiveUndoSummary(room: Room): CompetitiveUndoSummary {
  ensureCompetitiveRoomState(room);
  return {
    drawEpochId: room.gameState.drawEpochId ?? 0,
    lockedBucketCount: room.gameState.lockedBucketCount ?? 0,
    lockedBoundaryTarget: room.gameState.lockedBoundaryTarget ?? null,
    undoLimit: COMPETITIVE_BUCKET_UNDO_LIMIT,
  };
}

/**
 * Advances the authoritative Competitive draw epoch exactly once per logical reset/clear.
 * When `preserveClearedIds` is true (mid-turn Clear), prior-epoch identities are moved into
 * `competitiveClearedIds` so stale in-flight Type 7 requests return `stale_epoch`.
 */
export function advanceCompetitiveEpoch(
  room: Room,
  options?: { preserveClearedIds?: boolean }
): CompetitiveUndoSummary {
  ensureCompetitiveRoomState(room);
  room.gameState.drawEpochId = (room.gameState.drawEpochId ?? 0) + 1;
  room.gameState.lockedBucketCount = 0;
  room.gameState.lockedBoundaryTarget = null;

  if (options?.preserveClearedIds) {
    if (!room.competitiveClearedIds) room.competitiveClearedIds = new Set<string>();
    if (room.competitiveEpochUsedIds) {
      for (const k of room.competitiveEpochUsedIds) {
        if (room.competitiveClearedIds.size < 2000) {
          room.competitiveClearedIds.add(k);
        }
      }
    }
  } else {
    room.competitiveClearedIds?.clear();
  }
  room.competitiveEpochUsedIds?.clear();

  return getCompetitiveUndoSummary(room);
}

export interface CompetitiveRecordResult {
  accepted: boolean;
  reason?: CompetitiveActionRejectReason;
  identity?: { instanceId: string; strokeId: number };
  summary: CompetitiveUndoSummary;
}

/**
 * Competitive-only draw command ingestion with O(1) duplicate (instanceId, strokeId) prevention
 * and retained-suffix Bucket boundary update.
 */
export function recordCompetitiveDrawCommand(
  room: Room,
  event: string,
  data: any,
  customInstId?: string,
  customStrokeId?: number
): CompetitiveRecordResult {
  ensureCompetitiveRoomState(room);
  const summary = getCompetitiveUndoSummary(room);

  if (!room.gameState.drawHistory) room.gameState.drawHistory = [];
  if (!room.gameState.redoStack) room.gameState.redoStack = [];

  const isBinary = event === "draw_binary" && Buffer.isBuffer(data) && data.length > 0;
  const type = isBinary ? data[0] : getCommandPacketType({ event, data });
  const instId = customInstId || (isBinary ? extractInstanceIdFromBuffer(data) : "");
  let strokeId = customStrokeId;

  if (strokeId === undefined && isBinary && Buffer.isBuffer(data)) {
    const extracted = extractCommandIdentity({ event, data, instanceId: instId });
    if (extracted) strokeId = extracted.strokeId;
  }

  // Enforce unique non-zero (instId, strokeId) on durable Competitive commits (Type 4 Bucket & Type 9 Stroke)
  if (isCompetitiveDurableUndoableType(type)) {
    if (!instId || strokeId === undefined || strokeId <= 0) {
      return { accepted: false, reason: "invalid_packet", summary };
    }
    const idKey = makeCompetitiveIdentityKey(instId, strokeId);
    if (room.competitiveEpochUsedIds!.has(idKey)) {
      return { accepted: false, reason: "duplicate_id", summary };
    }
    room.competitiveEpochUsedIds!.add(idKey);
  }

  // Standard consolidation / recording
  recordRoomDrawCommandInternal(room, event, data, customInstId, customStrokeId);

  // Recompute retained-suffix locked Bucket boundary ONLY on committed Bucket (Type 4)
  if (type === 4) {
    const epochId = room.gameState.drawEpochId ?? 0;
    const boundary = recomputeCompetitiveBucketBoundary(
      room.gameState.drawHistory,
      room.gameState.lockedBucketCount ?? 0,
      room.gameState.lockedBoundaryTarget ?? null,
      epochId,
      COMPETITIVE_BUCKET_UNDO_LIMIT
    );
    if (boundary.resolved) {
      room.gameState.lockedBucketCount = boundary.lockedBucketCount;
      room.gameState.lockedBoundaryTarget = boundary.lockedBoundaryTarget;
    }
  }

  return {
    accepted: true,
    identity: instId && strokeId ? { instanceId: instId, strokeId } : undefined,
    summary: getCompetitiveUndoSummary(room),
  };
}

/**
 * Authoritative Competitive Undo (Stage 4A):
 * - Validates against server `drawHistory` and `lockedBoundaryTarget`
 * - Rejects locked Buckets, pre-boundary commands, transient 1/2/3/6, missing, or stale-epoch targets
 * - Never mutates history on rejection
 * - Removes ONLY the targeted chronological top durable command on accept and preserves locked boundary
 */
export function undoCompetitiveCommand(
  room: Room,
  targetInstId: string,
  targetStrokeId: number
): { ok: boolean; reason?: CompetitiveUndoRejectReason; summary: CompetitiveUndoSummary } {
  ensureCompetitiveRoomState(room);
  const summary = getCompetitiveUndoSummary(room);

  if (!room || !room.gameState.drawHistory || room.gameState.drawHistory.length === 0) {
    const key = targetInstId && targetStrokeId > 0 ? makeCompetitiveIdentityKey(targetInstId, targetStrokeId) : "";
    const reason: CompetitiveUndoRejectReason =
      key && room?.competitiveClearedIds?.has(key) ? "stale_epoch" : "not_found";
    return { ok: false, reason, summary };
  }

  if (!targetInstId || !Number.isFinite(targetStrokeId) || targetStrokeId <= 0) {
    return { ok: false, reason: "not_found", summary };
  }

  const history = room.gameState.drawHistory;
  const epochId = room.gameState.drawEpochId ?? 0;
  const { resolved, lockedIndex } = resolveLockedBoundaryIndex(
    history,
    room.gameState.lockedBoundaryTarget ?? null,
    epochId
  );
  if (!resolved) {
    return { ok: false, reason: "not_found", summary };
  }

  const clearIdx = findLatestClearMarkerIndex(history);
  let targetIndex = -1;
  let newestDurableIndex = -1;

  for (let i = history.length - 1; i > clearIdx; i--) {
    const cmd = history[i];
    const type = getCommandPacketType(cmd);
    if (!isCompetitiveDurableUndoableType(type)) {
      continue; // Transient 1/2/3/6 never act as valid Competitive Undo targets
    }
    if (newestDurableIndex === -1) {
      newestDurableIndex = i;
    }
    const ident = extractCommandIdentity(cmd);
    if (ident && ident.instanceId === targetInstId && ident.strokeId === (targetStrokeId & 0xffff)) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === -1) {
    const key = makeCompetitiveIdentityKey(targetInstId, targetStrokeId);
    const reason: CompetitiveUndoRejectReason = room.competitiveClearedIds?.has(key)
      ? "stale_epoch"
      : "not_found";
    return { ok: false, reason, summary };
  }

  // Chronologically at or before locked boundary -> locked (never skip locked Bucket)
  if (targetIndex <= lockedIndex) {
    return { ok: false, reason: "locked", summary };
  }

  // Strict chronological Undo: target must be the latest durable command above clear barrier
  if (targetIndex !== newestDurableIndex) {
    return { ok: false, reason: "not_found", summary };
  }

  // Remove exact single command (leaving lockedBucketCount & lockedBoundaryTarget immutable)
  history.splice(targetIndex, 1);
  room.gameState.isDrawingActive = false;

  if (room.freeDrawCanonicalCache) {
    const cacheKey = `${targetInstId}_${targetStrokeId}`;
    room.freeDrawCanonicalCache.delete(cacheKey);
  }

  return {
    ok: true,
    summary: getCompetitiveUndoSummary(room),
  };
}

function recordRoomDrawCommandInternal(
  room: Room,
  event: string,
  data: any,
  customInstId?: string,
  customStrokeId?: number
): void {
  if (!room) return;
  if (!room.gameState.drawHistory) room.gameState.drawHistory = [];
  //@ts-ignore
  if (!room.gameState.redoStack) room.gameState.redoStack = [];

  const isBinary = event === "draw_binary" && Buffer.isBuffer(data) && data.length > 0;
  const type = isBinary ? data[0] : 0;
  const instId = customInstId || (isBinary ? extractInstanceIdFromBuffer(data) : "");
  let strokeId = customStrokeId;
  if (strokeId === undefined && isBinary && Buffer.isBuffer(data)) {
    if ((type === 1 || type === 3) && data.length >= 25) {
      strokeId = data.readUInt16LE(23);
    } else if (type === 4) {
      // draw_action (bucket)
      const hasTarget = data.length >= 21;
      if (hasTarget && data.length >= 23) {
        strokeId = data.readUInt16LE(21);
      } else if (!hasTarget && data.length >= 19) {
        strokeId = data.readUInt16LE(17);
      }
    } else if (type === 9) {
      // draw_stroke (shapes / consolidated strokes)
      const pointsLen = data.length >= 16 ? data.readUInt16LE(14) : 0;
      const expectedLen = 16 + pointsLen * 4;
      if (data.length >= expectedLen + 2) {
        strokeId = data.readUInt16LE(expectedLen);
      }
    }
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
      return; // Ignore duplicated transient live packet as it's already recorded in a completed stroke object!
    }
  }

  let isValidStart = false;

  if (isBinary) {
    if (type === 1) { // draw_start
      room.gameState.isDrawingActive = true;
      isValidStart = true;
    } else if (type === 2) { // draw_move
      if (room.gameState.isDrawingActive === false) {
        return;
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
    return;
  }

  const historyEntry: any = { event, data };
  if (instId) historyEntry.instId = instId;
  if (strokeId !== undefined) historyEntry.strokeId = strokeId;
  room.gameState.drawHistory.push(historyEntry);

  room.gameState.redoStack = [];
}

/**
 * Records a draw command into authoritative room drawing history.
 * Handles stroke consolidation, start/end validation, atomic redo stack reset,
 * and delegates to Competitive Stage 4A tracking when in Competitive rooms.
 */
export function recordRoomDrawCommand(
  room: Room,
  event: string,
  data: any,
  customInstId?: string,
  customStrokeId?: number
): void {
  if (!room) return;
  if (isCompetitiveRoomMode(room)) {
    recordCompetitiveDrawCommand(room, event, data, customInstId, customStrokeId);
    return;
  }
  recordRoomDrawCommandInternal(room, event, data, customInstId, customStrokeId);
}

/**
 * Performs an exact targeted removal of a stroke matching targetInstId and targetStrokeId.
 * In Competitive mode, enforces Stage 4A locked Bucket boundary & chronological undo safety.
 * Evicts from room.freeDrawCanonicalCache if present. Returns true if removed, false otherwise (no-op).
 */
export function undoRoomFreeDrawStroke(
  room: Room,
  targetInstId: string,
  targetStrokeId: number
): boolean {
  if (!room) return false;
  if (isCompetitiveRoomMode(room)) {
    return undoCompetitiveCommand(room, targetInstId, targetStrokeId).ok;
  }
  if (!room.gameState.drawHistory || room.gameState.drawHistory.length === 0) {
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

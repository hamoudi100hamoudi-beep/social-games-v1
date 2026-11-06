import type { Room } from "../src/types/game.js";

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

/**
 * Records a draw command into authoritative room drawing history.
 * Handles stroke consolidation, start/end validation, and atomic redo stack reset.
 */
export function recordRoomDrawCommand(
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

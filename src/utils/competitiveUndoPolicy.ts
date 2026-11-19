export const COMPETITIVE_BUCKET_UNDO_LIMIT = 3;

export interface CompetitiveCommandIdentity {
  instanceId: string;
  strokeId: number;
}

export interface CompetitiveLockedBoundaryTarget {
  instanceId: string;
  strokeId: number;
  epochId: number;
}

export interface CompetitiveUndoSummary {
  drawEpochId: number;
  lockedBucketCount: number;
  lockedBoundaryTarget: CompetitiveLockedBoundaryTarget | null;
  undoLimit: number;
}

export type CompetitiveUndoRejectReason =
  | 'locked'
  | 'not_found'
  | 'not_drawing'
  | 'rate_limited'
  | 'stale_epoch';

export type CompetitiveActionRejectReason =
  | 'invalid_packet'
  | 'duplicate_id'
  | 'not_drawing'
  | 'rate_limited'
  | 'stale_epoch';

export function isCompetitiveRoomMode(
  roomOrConfig: { isFreeDraw?: boolean; isExperimental?: boolean } | null | undefined
): boolean {
  return Boolean(roomOrConfig && roomOrConfig.isExperimental && !roomOrConfig.isFreeDraw);
}

function readRawBytes(data: any): Uint8Array | null {
  if (!data) return null;
  if (typeof Uint8Array !== 'undefined' && data instanceof Uint8Array) return data;
  if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

function extractAsciiInstId(bytes: Uint8Array): string {
  if (bytes.length < 8) return '';
  let str = '';
  for (let i = 1; i <= 7; i++) {
    const code = bytes[i];
    if (code === 0) break;
    str += String.fromCharCode(code);
  }
  return str;
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

/**
 * Determines the binary packet type (1..13) for a history command entry,
 * supporting Uint8Array/Buffer, ArrayBuffer, number[], or decoded JSON command shapes.
 */
export function getCommandPacketType(cmd: any): number {
  if (!cmd) return 0;
  const bytes = readRawBytes(cmd.data);
  if (bytes && bytes.length > 0) {
    return bytes[0];
  }
  if (Array.isArray(cmd.data) && cmd.data.length > 0) {
    return Number(cmd.data[0]) || 0;
  }
  if (cmd.event === 'draw_clear') return 5;
  if (cmd.event === 'draw_action' && cmd.data?.tool === 'bucket') return 4;
  if (cmd.event === 'draw_stroke') return 9;
  if (cmd.event === 'draw_start') return 1;
  if (cmd.event === 'draw_move' || cmd.event === 'draw_move_compressed') return 2;
  if (cmd.event === 'draw_end') return 3;
  if (cmd.event === 'draw_cancel') return 6;
  return 0;
}

export function isCompetitiveClearCommand(cmd: any): boolean {
  const type = getCommandPacketType(cmd);
  return type === 5 || type === 10 || cmd?.event === 'draw_clear';
}

export function isCompetitiveBucketCommand(cmd: any): boolean {
  return getCommandPacketType(cmd) === 4;
}

export function isCompetitiveCommittedStrokeCommand(cmd: any): boolean {
  return getCommandPacketType(cmd) === 9;
}

export function isCompetitiveDurableUndoableType(type: number): boolean {
  return type === 4 || type === 9;
}

/**
 * Extracts (instanceId, strokeId) identity from a command entry.
 * Returns null if instanceId is missing or strokeId is absent/zero.
 */
export function extractCommandIdentity(cmd: any): CompetitiveCommandIdentity | null {
  if (!cmd) return null;

  let instId: string | undefined =
    typeof cmd.instanceId === 'string' && cmd.instanceId.length > 0
      ? cmd.instanceId
      : (typeof cmd.instId === 'string' && cmd.instId.length > 0 ? cmd.instId : undefined);
  let strokeId: number | undefined =
    typeof cmd.strokeId === 'number' && Number.isFinite(cmd.strokeId) ? cmd.strokeId : undefined;

  const bytes = readRawBytes(cmd.data);
  if (bytes && bytes.length >= 8) {
    if (!instId) {
      instId = extractAsciiInstId(bytes);
    }
    if (strokeId === undefined) {
      const type = bytes[0];
      if ((type === 1 || type === 3) && bytes.length >= 25) {
        strokeId = readUInt16LE(bytes, 23);
      } else if (type === 4) {
        if (bytes.length === 23) {
          strokeId = readUInt16LE(bytes, 21);
        } else if (bytes.length === 19) {
          strokeId = readUInt16LE(bytes, 17);
        }
      } else if (type === 9 && bytes.length >= 18) {
        const pointsLen = readUInt16LE(bytes, 14);
        const expectedLen = 16 + pointsLen * 4;
        if (bytes.length === expectedLen + 2) {
          strokeId = readUInt16LE(bytes, expectedLen);
        }
      }
    }
  } else if (cmd.data && typeof cmd.data === 'object') {
    if (!instId && typeof cmd.data.instanceId === 'string') {
      instId = cmd.data.instanceId;
    } else if (!instId && typeof cmd.data.instId === 'string') {
      instId = cmd.data.instId;
    }
    if (strokeId === undefined && typeof cmd.data.strokeId === 'number') {
      strokeId = cmd.data.strokeId;
    }
  }

  if (!instId || strokeId === undefined || strokeId <= 0) {
    return null;
  }

  return {
    instanceId: instId,
    strokeId: strokeId & 0xffff,
  };
}

export function makeCompetitiveIdentityKey(instanceId: string, strokeId: number): string {
  return `${instanceId}_${strokeId & 0xffff}`;
}

export function findLatestClearMarkerIndex(commands: any[]): number {
  if (!Array.isArray(commands)) return -1;
  for (let i = commands.length - 1; i >= 0; i--) {
    if (isCompetitiveClearCommand(commands[i])) {
      return i;
    }
  }
  return -1;
}

/**
 * Resolves a server locked boundary target against the given command list (strictly after any latest clear marker).
 * Returns:
 * - `-1` and `resolved: true` if `lockedBoundaryTarget` is null (no locked Bucket in active epoch)
 * - `index >= 0` and `resolved: true` if found in `commands` after the latest clear marker
 * - `-1` and `resolved: false` if `lockedBoundaryTarget` is non-null but unresolvable in `commands` (or epoch mismatch)
 */
export function resolveLockedBoundaryIndex(
  commands: any[],
  lockedBoundaryTarget: CompetitiveLockedBoundaryTarget | null,
  activeEpochId: number
): { resolved: boolean; lockedIndex: number } {
  if (!lockedBoundaryTarget) {
    return { resolved: true, lockedIndex: -1 };
  }
  if (lockedBoundaryTarget.epochId !== activeEpochId) {
    return { resolved: false, lockedIndex: -1 };
  }
  if (!Array.isArray(commands) || commands.length === 0) {
    return { resolved: false, lockedIndex: -1 };
  }

  const clearIdx = findLatestClearMarkerIndex(commands);
  for (let i = commands.length - 1; i > clearIdx; i--) {
    const cmd = commands[i];
    if (!isCompetitiveBucketCommand(cmd)) continue;
    const ident = extractCommandIdentity(cmd);
    if (
      ident &&
      ident.instanceId === lockedBoundaryTarget.instanceId &&
      ident.strokeId === lockedBoundaryTarget.strokeId
    ) {
      return { resolved: true, lockedIndex: i };
    }
  }

  return { resolved: false, lockedIndex: -1 };
}

/**
 * Computes the monotonic Bucket undo boundary update using the retained suffix rule:
 * - Only committed Bucket commands retained strictly AFTER `currentLockedBoundary` count toward the `limit` (3).
 * - If the retained unlocked Bucket suffix exceeds `limit`, the oldest excess Buckets become permanently locked,
 *   and the newest locked Bucket becomes the new `lockedBoundaryTarget`.
 * - Undoing Buckets never shrinks `lockedBucketCount` or moves `lockedBoundaryTarget` backward.
 */
export function recomputeCompetitiveBucketBoundary(
  commands: any[],
  currentLockedCount: number,
  currentLockedBoundary: CompetitiveLockedBoundaryTarget | null,
  epochId: number,
  limit: number = COMPETITIVE_BUCKET_UNDO_LIMIT
): {
  resolved: boolean;
  lockedIndex: number;
  lockedBucketCount: number;
  lockedBoundaryTarget: CompetitiveLockedBoundaryTarget | null;
} {
  const { resolved, lockedIndex } = resolveLockedBoundaryIndex(
    commands,
    currentLockedBoundary,
    epochId
  );
  if (!resolved) {
    return {
      resolved: false,
      lockedIndex: -1,
      lockedBucketCount: currentLockedCount,
      lockedBoundaryTarget: currentLockedBoundary,
    };
  }

  const clearIdx = findLatestClearMarkerIndex(commands);
  const startSearchIdx = Math.max(clearIdx, lockedIndex) + 1;
  const suffixBucketIndices: number[] = [];

  for (let i = startSearchIdx; i < commands.length; i++) {
    if (isCompetitiveBucketCommand(commands[i])) {
      const ident = extractCommandIdentity(commands[i]);
      if (ident) {
        suffixBucketIndices.push(i);
      }
    }
  }

  if (suffixBucketIndices.length <= limit) {
    return {
      resolved: true,
      lockedIndex,
      lockedBucketCount: currentLockedCount,
      lockedBoundaryTarget: currentLockedBoundary,
    };
  }

  const newlyLockedCount = suffixBucketIndices.length - limit;
  const newBoundaryCmdIndex = suffixBucketIndices[newlyLockedCount - 1];
  const newBoundaryIdentity = extractCommandIdentity(commands[newBoundaryCmdIndex]);

  if (!newBoundaryIdentity) {
    return {
      resolved: true,
      lockedIndex,
      lockedBucketCount: currentLockedCount,
      lockedBoundaryTarget: currentLockedBoundary,
    };
  }

  return {
    resolved: true,
    lockedIndex: newBoundaryCmdIndex,
    lockedBucketCount: currentLockedCount + newlyLockedCount,
    lockedBoundaryTarget: {
      instanceId: newBoundaryIdentity.instanceId,
      strokeId: newBoundaryIdentity.strokeId,
      epochId,
    },
  };
}

/**
 * Finds the next chronological durable Undo target in Competitive mode.
 * Enforces strict chronological order (top durable command above clear marker)
 * and stops BEFORE `lockedIndex` (never skips a locked Bucket to undo older strokes).
 * Fail-closed when boundary cannot be resolved.
 */
export function findCompetitiveUndoTarget(
  commands: any[],
  lockedBoundaryTarget: CompetitiveLockedBoundaryTarget | null,
  activeEpochId: number
): {
  boundaryResolved: boolean;
  lockedIndex: number;
  targetIndex: number;
  targetIdentity: CompetitiveCommandIdentity | null;
  blockedByLock: boolean;
} {
  if (!Array.isArray(commands)) {
    return {
      boundaryResolved: lockedBoundaryTarget === null,
      lockedIndex: -1,
      targetIndex: -1,
      targetIdentity: null,
      blockedByLock: false,
    };
  }

  const { resolved, lockedIndex } = resolveLockedBoundaryIndex(
    commands,
    lockedBoundaryTarget,
    activeEpochId
  );

  if (!resolved) {
    return {
      boundaryResolved: false,
      lockedIndex: -1,
      targetIndex: -1,
      targetIdentity: null,
      blockedByLock: false,
    };
  }

  const clearIdx = findLatestClearMarkerIndex(commands);
  for (let i = commands.length - 1; i > clearIdx; i--) {
    const cmd = commands[i];
    const type = getCommandPacketType(cmd);
    if (!isCompetitiveDurableUndoableType(type)) {
      continue;
    }

    if (i <= lockedIndex) {
      return {
        boundaryResolved: true,
        lockedIndex,
        targetIndex: -1,
        targetIdentity: null,
        blockedByLock: true,
      };
    }

    const identity = extractCommandIdentity(cmd);
    if (!identity) {
      return {
        boundaryResolved: true,
        lockedIndex,
        targetIndex: -1,
        targetIdentity: null,
        blockedByLock: false,
      };
    }

    return {
      boundaryResolved: true,
      lockedIndex,
      targetIndex: i,
      targetIdentity: identity,
      blockedByLock: false,
    };
  }

  return {
    boundaryResolved: true,
    lockedIndex,
    targetIndex: -1,
    targetIdentity: null,
    blockedByLock: false,
  };
}

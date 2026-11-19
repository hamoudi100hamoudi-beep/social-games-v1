import {
  type CompetitiveLockedBoundaryTarget,
  type CompetitiveUndoSummary,
  extractCommandIdentity,
  findLatestClearMarkerIndex,
  getCommandPacketType,
  isCompetitiveClearCommand,
  isCompetitiveDurableUndoableType,
  makeCompetitiveIdentityKey,
  resolveLockedBoundaryIndex,
} from './competitiveUndoPolicy';

export interface CompetitiveClientBoundaryState {
  epochId: number;
  lockedBucketCount: number;
  lockedBoundaryTarget: CompetitiveLockedBoundaryTarget | null;
  boundaryResolved: boolean;
  pendingBucketIds: string[];
}

export function createInitialCompetitiveBoundaryState(): CompetitiveClientBoundaryState {
  return {
    epochId: 0,
    lockedBucketCount: 0,
    lockedBoundaryTarget: null,
    boundaryResolved: true,
    pendingBucketIds: [],
  };
}

/**
 * Normalizes raw history commands for Competitive rooms:
 * - Drops all commands prior to the latest Clear marker (retaining at most that Clear marker at index 0)
 * - Strips transient live/abort/commit packets (Types 1, 2, 3, 6, 11, 12, 13) so they never masquerade
 *   as undoable targets or resurrect cancelled shapes on replay
 * - Preserves only durable Type 4 (Bucket) and Type 9 (Stroke) commands with valid non-zero identity,
 *   deduping any duplicate (instanceId, strokeId) pairs within the active epoch
 */
export function normalizeCompetitiveCommands(rawCommands: any[]): any[] {
  if (!Array.isArray(rawCommands) || rawCommands.length === 0) {
    return [];
  }

  const clearIdx = findLatestClearMarkerIndex(rawCommands);
  const startIdx = clearIdx >= 0 ? clearIdx + 1 : 0;
  const result: any[] = [];

  if (clearIdx >= 0) {
    result.push(rawCommands[clearIdx]);
  }

  const seenKeys = new Set<string>();
  for (let i = startIdx; i < rawCommands.length; i++) {
    const cmd = rawCommands[i];
    if (!cmd) continue;
    if (isCompetitiveClearCommand(cmd)) continue;

    const type = getCommandPacketType(cmd);
    if (!isCompetitiveDurableUndoableType(type)) {
      continue;
    }

    const identity = extractCommandIdentity(cmd);
    if (!identity) {
      continue;
    }

    const key = makeCompetitiveIdentityKey(identity.instanceId, identity.strokeId);
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);

    if (cmd.instanceId === identity.instanceId && cmd.strokeId === identity.strokeId) {
      result.push(cmd);
    } else {
      result.push({
        ...cmd,
        instanceId: identity.instanceId,
        strokeId: identity.strokeId,
      });
    }
  }

  return result;
}

/**
 * Applies incoming authoritative Competitive boundary/epoch state from `room_state_update`,
 * `competitive_undo_state`, `draw_bucket_ack`, `draw_undo_accepted`, or rejection payloads.
 * Enforces monotonic `drawEpochId` progression and fail-closed boundary resolution.
 */
export function applyCompetitiveSummaryState(
  current: CompetitiveClientBoundaryState,
  incoming: Partial<CompetitiveUndoSummary> & { epochId?: number } | null | undefined,
  commands: any[],
  isSyncReady: boolean
): {
  next: CompetitiveClientBoundaryState;
  epochAdvanced: boolean;
  shouldRequestResync: boolean;
} {
  if (!incoming) {
    return { next: current, epochAdvanced: false, shouldRequestResync: false };
  }

  const rawEpoch =
    typeof incoming.drawEpochId === 'number'
      ? incoming.drawEpochId
      : (typeof incoming.epochId === 'number' ? incoming.epochId : current.epochId);

  // Ignore stale lower epochs
  if (rawEpoch < current.epochId) {
    return { next: current, epochAdvanced: false, shouldRequestResync: false };
  }

  const epochAdvanced = rawEpoch > current.epochId;
  const nextLockedCount =
    typeof incoming.lockedBucketCount === 'number'
      ? (epochAdvanced ? incoming.lockedBucketCount : Math.max(current.lockedBucketCount, incoming.lockedBucketCount))
      : (epochAdvanced ? 0 : current.lockedBucketCount);

  let nextBoundaryTarget = current.lockedBoundaryTarget;
  if (incoming.lockedBoundaryTarget !== undefined) {
    if (epochAdvanced) {
      nextBoundaryTarget = incoming.lockedBoundaryTarget;
    } else if (incoming.lockedBoundaryTarget !== null) {
      // Same epoch: only adopt target when boundary matches epoch and advances or initializes
      if (incoming.lockedBoundaryTarget.epochId === rawEpoch) {
        if (
          current.lockedBoundaryTarget === null ||
          nextLockedCount >= current.lockedBucketCount
        ) {
          nextBoundaryTarget = incoming.lockedBoundaryTarget;
        }
      }
    }
  } else if (epochAdvanced) {
    nextBoundaryTarget = null;
  }

  const nextPendingBucketIds = epochAdvanced ? [] : [...current.pendingBucketIds];

  if (!isSyncReady) {
    return {
      next: {
        epochId: rawEpoch,
        lockedBucketCount: nextLockedCount,
        lockedBoundaryTarget: nextBoundaryTarget,
        boundaryResolved: nextBoundaryTarget === null,
        pendingBucketIds: nextPendingBucketIds,
      },
      epochAdvanced,
      shouldRequestResync: false,
    };
  }

  const { resolved } = resolveLockedBoundaryIndex(commands, nextBoundaryTarget, rawEpoch);
  return {
    next: {
      epochId: rawEpoch,
      lockedBucketCount: nextLockedCount,
      lockedBoundaryTarget: nextBoundaryTarget,
      boundaryResolved: resolved,
      pendingBucketIds: nextPendingBucketIds,
    },
    epochAdvanced,
    shouldRequestResync: !resolved && nextBoundaryTarget !== null,
  };
}

/**
 * Normalizes incoming `draw_history_sync` commands for Competitive rooms and resolves the
 * active epoch's locked boundary target against the synced history.
 * Fail-closed: if `current.lockedBoundaryTarget` is non-null and missing from synced history,
 * `boundaryResolved` becomes `false` and `shouldRequestResync` is `true`.
 */
export function reconcileCompetitiveHistorySync(
  current: CompetitiveClientBoundaryState,
  rawCommands: any[]
): {
  normalizedCommands: any[];
  next: CompetitiveClientBoundaryState;
  shouldRequestResync: boolean;
} {
  const normalizedCommands = normalizeCompetitiveCommands(rawCommands);
  const { resolved } = resolveLockedBoundaryIndex(
    normalizedCommands,
    current.lockedBoundaryTarget,
    current.epochId
  );

  return {
    normalizedCommands,
    next: {
      ...current,
      boundaryResolved: resolved,
      pendingBucketIds: [],
    },
    shouldRequestResync: !resolved && current.lockedBoundaryTarget !== null,
  };
}

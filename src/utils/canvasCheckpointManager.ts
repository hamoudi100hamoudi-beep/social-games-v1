import { selectEvictionIndexMinimax } from './bucketCheckpointPolicy';
import {
  getCommandSignature,
  findLatestClearIndex,
  isBucketCommand,
  countBucketsBeforeIndex
} from './canvasCommandHelpers';

// 🛡️ Free Draw Dual Bounded Checkpoint Structure & Helpers (Base & Tail Snapshots)
export interface FreeDrawCheckpoint {
  canvas: HTMLCanvasElement | null;
  index: number; // Snapshot at index k represents canvas state after commands 0..k-1 (before command k)
  anchorSignature: string | null;
  lastClearIndex: number;
}

// 🛡️ History-Indexed Bucket Checkpoint Collection (Phase 1F.5)
// Maintains an ordered, history-indexed collection of global canvas snapshots,
// bounded by MAX_HISTORY_CHECKPOINTS to guarantee predictable RAM usage.
export const MAX_HISTORY_CHECKPOINTS = 10;
export const COMPETITIVE_DEFAULT_STRIDE = 8;
export const COMPETITIVE_POST_BUCKET_STRIDE = 16;

export interface HistoryCheckpoint {
  canvas: HTMLCanvasElement;
  index: number; // Snapshot represents canvas state after commands 0..index-1 (before command index)
  anchorSignature: string;
  lastClearIndex: number;
  timestamp: number;
}

export const isBucketCheckpointExpEnabled = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem('freedraw_bucket_checkpoint_exp') !== '0';
  } catch (e) {
    return true;
  }
};

export const isCompetitiveReplayOptEnabled = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem('competitive_replay_perf_stage4c') !== '0';
  } catch (e) {
    return true;
  }
};

export interface CompetitiveCheckpointBounds {
  lastClearIndex: number;
  activeStart: number;
  maxConfirmedIdx: number;
  lockIdx: number;
  lockMissing: boolean;
  safeBaseUpperBound: number;
}

export interface CompetitiveReplayCheckpointPlan {
  candidateBaseIndex: number;
  candidateTailIndex: number;
  postReplayBaseIndex: number;
  postReplayTailIndex: number;
}

export interface CanvasCheckpointDependencies {
  getCtx: () => CanvasRenderingContext2D | null;
  getCommands: () => any[];
  getLogicalBounds: () => { width: number; height: number; dpr: number };
  getConfig: () => {
    isFreeDraw: boolean;
    isExperimental: boolean;
  };
  getCompetitiveCheckpointBounds?: (commands: any[]) => CompetitiveCheckpointBounds;
}

export class CanvasCheckpointManager {
  private baseCheckpoint: FreeDrawCheckpoint = {
    canvas: null,
    index: 0,
    anchorSignature: null,
    lastClearIndex: -1
  };

  private tailCheckpoint: FreeDrawCheckpoint = {
    canvas: null,
    index: 0,
    anchorSignature: null,
    lastClearIndex: -1
  };

  private historyCheckpoints: HistoryCheckpoint[] = [];
  private checkpointCanvasPool: HTMLCanvasElement[] = [];
  private deps: CanvasCheckpointDependencies;

  constructor(deps: CanvasCheckpointDependencies) {
    this.deps = deps;
  }

  private isCompetitiveCheckpointEnabled(): boolean {
    const config = this.deps.getConfig();
    return !config.isFreeDraw && Boolean(config.isExperimental) && isCompetitiveReplayOptEnabled();
  }

  private countBucketsInRange(commands: any[], startInclusive: number, endExclusive: number): number {
    const start = Math.max(0, startInclusive);
    const end = Math.min(commands.length, endExclusive);
    let count = 0;
    for (let i = start; i < end; i++) {
      if (isBucketCommand(commands[i])) {
        count++;
      }
    }
    return count;
  }

  private computeCompetitiveTailTarget(
    commands: any[],
    baseAnchor: number,
    confirmedEnd: number
  ): {
    desiredTailIndex: number;
    unlockedBucketCount: number;
    lastB: number;
    postLastBucket: number;
    trailingCount: number;
  } {
    if (confirmedEnd <= baseAnchor) {
      return {
        desiredTailIndex: -1,
        unlockedBucketCount: 0,
        lastB: -1,
        postLastBucket: -1,
        trailingCount: 0
      };
    }

    const unlockedBuckets: number[] = [];
    for (let i = baseAnchor; i < confirmedEnd; i++) {
      if (isBucketCommand(commands[i])) {
        unlockedBuckets.push(i);
      }
    }

    if (unlockedBuckets.length === 0) {
      const span = confirmedEnd - baseAnchor;
      const numStrides = Math.floor(span / COMPETITIVE_DEFAULT_STRIDE);
      return {
        desiredTailIndex:
          numStrides >= 1 ? baseAnchor + numStrides * COMPETITIVE_DEFAULT_STRIDE : -1,
        unlockedBucketCount: 0,
        lastB: -1,
        postLastBucket: -1,
        trailingCount: 0
      };
    }

    const lastB = unlockedBuckets[unlockedBuckets.length - 1];
    const postLastBucket = lastB + 1;
    const trailingCount = confirmedEnd - postLastBucket;
    let desiredTailIndex = -1;

    if (trailingCount > 0) {
      if (trailingCount >= COMPETITIVE_POST_BUCKET_STRIDE) {
        const k = Math.floor(trailingCount / COMPETITIVE_POST_BUCKET_STRIDE);
        desiredTailIndex = postLastBucket + k * COMPETITIVE_POST_BUCKET_STRIDE;
      } else {
        desiredTailIndex = postLastBucket;
      }
    } else if (unlockedBuckets.length >= 2) {
      const pivotPos = unlockedBuckets.length <= 3 ? 0 : unlockedBuckets.length - 3;
      desiredTailIndex = unlockedBuckets[pivotPos] + 1;
    } else if (postLastBucket <= confirmedEnd) {
      desiredTailIndex = postLastBucket;
    }

    return {
      desiredTailIndex,
      unlockedBucketCount: unlockedBuckets.length,
      lastB,
      postLastBucket,
      trailingCount
    };
  }

  // --- Diagnostic & Inspection Accessors ---

  getBaseIndex(): number {
    return this.baseCheckpoint.index;
  }

  getTailIndex(): number {
    return this.tailCheckpoint.index;
  }

  getBaseCheckpoint(): Readonly<FreeDrawCheckpoint> {
    return this.baseCheckpoint;
  }

  getTailCheckpoint(): Readonly<FreeDrawCheckpoint> {
    return this.tailCheckpoint;
  }

  getHistoryCheckpointCount(): number {
    return this.historyCheckpoints.length;
  }

  getHistoryCheckpoints(): readonly HistoryCheckpoint[] {
    return this.historyCheckpoints;
  }

  isBaseValid(commands: any[], targetIndex?: number): boolean {
    return this.isCheckpointValid(this.baseCheckpoint, commands, targetIndex);
  }

  isTailValid(commands: any[], targetIndex?: number): boolean {
    return this.isCheckpointValid(this.tailCheckpoint, commands, targetIndex);
  }

  // --- Canvas Pool Operations ---

  acquireRecycledCheckpointCanvas(): HTMLCanvasElement {
    const config = this.deps.getConfig();
    const bounds = this.deps.getLogicalBounds();
    const effectiveDPR = bounds.dpr ?? 1.0;
    const targetW = Math.round(bounds.width * effectiveDPR);
    const targetH = Math.round(bounds.height * effectiveDPR);

    let canvas: HTMLCanvasElement;
    if (this.checkpointCanvasPool.length > 0) {
      canvas = this.checkpointCanvasPool.pop()!;
    } else {
      canvas = document.createElement('canvas');
    }

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const cCtx = canvas.getContext('2d');
    if (cCtx) {
      cCtx.setTransform(effectiveDPR, 0, 0, effectiveDPR, 0, 0);
      cCtx.lineCap = 'round';
      cCtx.lineJoin = 'round';
      cCtx.imageSmoothingEnabled = true;
      cCtx.imageSmoothingQuality = 'high';
      cCtx.clearRect(0, 0, targetW, targetH);
    }
    return canvas;
  }

  releaseCheckpointCanvas(canvas: HTMLCanvasElement): void {
    if (!canvas) return;
    if (this.checkpointCanvasPool.length < MAX_HISTORY_CHECKPOINTS + 4) {
      const cCtx = canvas.getContext('2d');
      if (cCtx) {
        cCtx.clearRect(0, 0, canvas.width, canvas.height);
      }
      this.checkpointCanvasPool.push(canvas);
    }
  }

  clearHistoryCheckpoints(): void {
    for (const cp of this.historyCheckpoints) {
      if (cp.canvas) this.releaseCheckpointCanvas(cp.canvas);
    }
    this.historyCheckpoints = [];
  }

  // --- Checkpoint Lifecycle Operations ---

  captureHistoryCheckpoint(index: number, commandList?: any[], sourceImageData?: ImageData): boolean {
    const config = this.deps.getConfig();
    if (!config.isFreeDraw || !isBucketCheckpointExpEnabled()) return false;
    const ctx = this.deps.getCtx();
    if (!ctx || !ctx.canvas) return false;

    const list = commandList || this.deps.getCommands();
    const lastClearIndex = findLatestClearIndex(list);
    if (index <= lastClearIndex) return false;

    const existingIdx = this.historyCheckpoints.findIndex(cp => cp.index === index);
    if (existingIdx !== -1) {
      const existing = this.historyCheckpoints[existingIdx];
      const cCtx = existing.canvas.getContext('2d');
      if (cCtx) {
        if (sourceImageData) {
          cCtx.putImageData(sourceImageData, 0, 0);
        } else {
          cCtx.clearRect(0, 0, existing.canvas.width, existing.canvas.height);
          cCtx.save();
          cCtx.setTransform(1, 0, 0, 1, 0, 0);
          cCtx.drawImage(ctx.canvas, 0, 0);
          cCtx.restore();
        }
        existing.anchorSignature = index > 0 ? getCommandSignature(list[index - 1]) : "";
        existing.lastClearIndex = lastClearIndex;
        existing.timestamp = Date.now();
        return true;
      }
      return false;
    }

    if (this.historyCheckpoints.length >= MAX_HISTORY_CHECKPOINTS) {
      const cps = this.historyCheckpoints;
      const evictIdx = selectEvictionIndexMinimax(cps, list, lastClearIndex, index, MAX_HISTORY_CHECKPOINTS);
      if (evictIdx >= 0 && evictIdx < cps.length) {
        const [evicted] = cps.splice(evictIdx, 1);
        if (evicted?.canvas) {
          this.releaseCheckpointCanvas(evicted.canvas);
        }
      }
    }

    const cCanvas = this.acquireRecycledCheckpointCanvas();
    const cCtx = cCanvas.getContext('2d');
    if (cCtx) {
      if (sourceImageData) {
        cCtx.putImageData(sourceImageData, 0, 0);
      } else {
        cCtx.save();
        cCtx.setTransform(1, 0, 0, 1, 0, 0);
        cCtx.drawImage(ctx.canvas, 0, 0);
        cCtx.restore();
      }

      const cp: HistoryCheckpoint = {
        canvas: cCanvas,
        index,
        anchorSignature: index > 0 ? getCommandSignature(list[index - 1]) : "",
        lastClearIndex,
        timestamp: Date.now()
      };
      this.historyCheckpoints.push(cp);
      this.historyCheckpoints.sort((a, b) => a.index - b.index);
      return true;
    }
    return false;
  }

  invalidateHistoryCheckpointsAfter(targetIndex: number): void {
    const keep: HistoryCheckpoint[] = [];
    for (const cp of this.historyCheckpoints) {
      if (cp.index > targetIndex) {
        this.releaseCheckpointCanvas(cp.canvas);
      } else {
        keep.push(cp);
      }
    }
    this.historyCheckpoints = keep;
  }

  ensureCheckpointCanvas(slot: 'base' | 'tail'): HTMLCanvasElement {
    const cp = slot === 'base' ? this.baseCheckpoint : this.tailCheckpoint;
    if (!cp.canvas) {
      cp.canvas = document.createElement('canvas');
    }
    const canvas = cp.canvas;
    const config = this.deps.getConfig();
    const bounds = this.deps.getLogicalBounds();
    const effectiveDPR = bounds.dpr ?? 1.0;
    const targetW = Math.round(bounds.width * effectiveDPR);
    const targetH = Math.round(bounds.height * effectiveDPR);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const cCtx = canvas.getContext('2d');
    if (cCtx) {
      cCtx.setTransform(effectiveDPR, 0, 0, effectiveDPR, 0, 0);
      cCtx.lineCap = 'round';
      cCtx.lineJoin = 'round';
      cCtx.imageSmoothingEnabled = true;
      cCtx.imageSmoothingQuality = 'high';
    }
    return canvas;
  }

  invalidateCheckpoint(slot: 'base' | 'tail' | 'all' = 'all'): void {
    if (slot === 'base' || slot === 'all') {
      this.baseCheckpoint.index = 0;
      this.baseCheckpoint.anchorSignature = null;
      this.baseCheckpoint.lastClearIndex = -1;
      if (this.baseCheckpoint.canvas) {
        const cCtx = this.baseCheckpoint.canvas.getContext('2d');
        if (cCtx) {
          cCtx.clearRect(0, 0, this.baseCheckpoint.canvas.width, this.baseCheckpoint.canvas.height);
        }
      }
    }
    if (slot === 'tail' || slot === 'all') {
      this.tailCheckpoint.index = 0;
      this.tailCheckpoint.anchorSignature = null;
      this.tailCheckpoint.lastClearIndex = -1;
      if (this.tailCheckpoint.canvas) {
        const cCtx = this.tailCheckpoint.canvas.getContext('2d');
        if (cCtx) {
          cCtx.clearRect(0, 0, this.tailCheckpoint.canvas.width, this.tailCheckpoint.canvas.height);
        }
      }
    }
    if (slot === 'all') {
      this.clearHistoryCheckpoints();
    }
  }

  isCheckpointValid(
    cp: FreeDrawCheckpoint | HistoryCheckpoint,
    commands: any[],
    targetIndex?: number
  ): boolean {
    const config = this.deps.getConfig();
    if (!config.isFreeDraw && !config.isExperimental) return false;
    if (!cp.canvas || cp.index <= 0) return false;
    const N = commands.length;
    if (cp.index > N) return false;
    if (targetIndex !== undefined && cp.index > targetIndex) return false;

    const bounds = this.deps.getLogicalBounds();
    const effectiveDPR = bounds.dpr ?? 1.0;
    const targetW = Math.round(bounds.width * effectiveDPR);
    const targetH = Math.round(bounds.height * effectiveDPR);
    if (cp.canvas.width !== targetW || cp.canvas.height !== targetH) return false;

    const currentClearIndex = findLatestClearIndex(commands);
    if (cp.index <= currentClearIndex) return false;
    if (cp.lastClearIndex !== currentClearIndex) return false;

    const sig = getCommandSignature(commands[cp.index - 1]);
    if (!cp.anchorSignature || sig !== cp.anchorSignature) return false;

    if (this.isCompetitiveCheckpointEnabled() && this.deps.getCompetitiveCheckpointBounds) {
      const cBounds = this.deps.getCompetitiveCheckpointBounds(commands);
      if (cp.index > cBounds.maxConfirmedIdx) return false;
      if (cp === this.baseCheckpoint) {
        if (cBounds.lockMissing || cp.index > cBounds.safeBaseUpperBound) return false;
      }
    }

    return true;
  }

  getBestCheckpoint(
    commands: any[],
    targetIndex?: number
  ): { slot: 'base' | 'tail' | 'history'; index: number; canvas: HTMLCanvasElement } | null {
    const config = this.deps.getConfig();
    // 🛡️ Phase 1F.5: Prioritize History-Indexed Checkpoint Collection when experimental flag is active
    if (isBucketCheckpointExpEnabled() && config.isFreeDraw) {
      for (let i = this.historyCheckpoints.length - 1; i >= 0; i--) {
        const cp = this.historyCheckpoints[i];
        if (this.isCheckpointValid(cp, commands, targetIndex)) {
          return { slot: 'history', index: cp.index, canvas: cp.canvas };
        }
      }
    }

    const tailValid = this.isCheckpointValid(this.tailCheckpoint, commands, targetIndex);
    const baseValid = this.isCheckpointValid(this.baseCheckpoint, commands, targetIndex);

    if (tailValid && baseValid) {
      if (this.tailCheckpoint.index >= this.baseCheckpoint.index) {
        return { slot: 'tail', index: this.tailCheckpoint.index, canvas: this.tailCheckpoint.canvas! };
      } else {
        return { slot: 'base', index: this.baseCheckpoint.index, canvas: this.baseCheckpoint.canvas! };
      }
    } else if (tailValid) {
      return { slot: 'tail', index: this.tailCheckpoint.index, canvas: this.tailCheckpoint.canvas! };
    } else if (baseValid) {
      return { slot: 'base', index: this.baseCheckpoint.index, canvas: this.baseCheckpoint.canvas! };
    }
    return null;
  }

  invalidateCheckpointsAfterIndex(targetIndex: number): void {
    const config = this.deps.getConfig();
    if (isBucketCheckpointExpEnabled() && config.isFreeDraw) {
      this.invalidateHistoryCheckpointsAfter(targetIndex);
    }
    if (this.tailCheckpoint.index > targetIndex) {
      this.invalidateCheckpoint('tail');
    }
    if (this.baseCheckpoint.index > targetIndex) {
      this.invalidateCheckpoint('base');
    }
  }

  capturePreBucketCheckpoint(targetIndex: number): void {
    const config = this.deps.getConfig();
    const isFreeDrawExp = config.isFreeDraw && isBucketCheckpointExpEnabled();
    const isCompetitiveExp = this.isCompetitiveCheckpointEnabled();
    if (!isFreeDrawExp && !isCompetitiveExp) return;
    const ctx = this.deps.getCtx();
    if (!ctx || !ctx.canvas) return;

    if (isFreeDrawExp) {
      this.captureHistoryCheckpoint(targetIndex);
    }

    const list = this.deps.getCommands();
    const lastClearIndex = findLatestClearIndex(list);
    if (targetIndex <= lastClearIndex) return;
    if (isCompetitiveExp) {
      const activeStart = lastClearIndex >= 0 ? lastClearIndex + 1 : 0;
      if (targetIndex <= activeStart || targetIndex > list.length) return;
      const cBounds = this.deps.getCompetitiveCheckpointBounds?.(list);
      if (!cBounds || cBounds.lockMissing || targetIndex > cBounds.safeBaseUpperBound) {
        return;
      }
    }

    const priorBucketCount = countBucketsBeforeIndex(list, targetIndex, lastClearIndex);
    const baseValid = this.isCheckpointValid(this.baseCheckpoint, list);

    // If there is no prior bucket since clear, base can hold the pre-bucket state at targetIndex.
    // If base is already holding an older bucket checkpoint, we do not overwrite base to preserve the older bucket.
    if (!baseValid || priorBucketCount === 0) {
      const bCanvas = this.ensureCheckpointCanvas('base');
      const bCtx = bCanvas.getContext('2d');
      if (bCtx) {
        bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
        bCtx.save();
        bCtx.setTransform(1, 0, 0, 1, 0, 0);
        bCtx.drawImage(ctx.canvas, 0, 0);
        bCtx.restore();
        this.baseCheckpoint = {
          canvas: bCanvas,
          index: targetIndex,
          anchorSignature: targetIndex > 0 ? getCommandSignature(list[targetIndex - 1]) : "",
          lastClearIndex
        };
      }
    }
  }

  reconcileCompetitiveCheckpoints(): void {
    if (!this.isCompetitiveCheckpointEnabled()) return;
    const ctx = this.deps.getCtx();
    if (!ctx || !ctx.canvas) return;

    const list = this.deps.getCommands();
    const N = list.length;
    const bounds = this.deps.getCompetitiveCheckpointBounds?.(list);
    if (!bounds) return;

    const { activeStart, maxConfirmedIdx, lockMissing, safeBaseUpperBound } = bounds;
    if (N <= activeStart) return;

    if (this.baseCheckpoint.index > 0 && !this.isCheckpointValid(this.baseCheckpoint, list)) {
      this.invalidateCheckpoint('base');
    }
    if (this.tailCheckpoint.index > 0 && !this.isCheckpointValid(this.tailCheckpoint, list)) {
      this.invalidateCheckpoint('tail');
    }

    let baseValid = this.isCheckpointValid(this.baseCheckpoint, list);
    let tailValid = this.isCheckpointValid(this.tailCheckpoint, list);

    // Zero-copy promotion: Tail -> Base once Tail is safely within the confirmed server lock frontier
    if (
      tailValid &&
      !lockMissing &&
      safeBaseUpperBound > activeStart &&
      this.tailCheckpoint.index <= safeBaseUpperBound &&
      (!baseValid || this.tailCheckpoint.index > this.baseCheckpoint.index)
    ) {
      const oldBaseCanvas = this.baseCheckpoint.canvas;
      this.baseCheckpoint = this.tailCheckpoint;
      this.tailCheckpoint = {
        canvas: oldBaseCanvas,
        index: 0,
        anchorSignature: null,
        lastClearIndex: -1
      };
      if (oldBaseCanvas) {
        const tCtx = oldBaseCanvas.getContext('2d');
        tCtx?.clearRect(0, 0, oldBaseCanvas.width, oldBaseCanvas.height);
      }
      baseValid = this.isCheckpointValid(this.baseCheckpoint, list);
      tailValid = false;
    }

    // Never capture live ctx.canvas into checkpoints while any bucket in history is unconfirmed
    if (maxConfirmedIdx !== N) {
      return;
    }

    const baseAnchor = Math.max(
      activeStart,
      baseValid ? this.baseCheckpoint.index : activeStart
    );

    if (
      !lockMissing &&
      safeBaseUpperBound === N &&
      safeBaseUpperBound > activeStart &&
      this.countBucketsInRange(list, activeStart, N) > 0 &&
      (!baseValid || this.baseCheckpoint.index < N)
    ) {
      this.captureCandidateSlot('base', N, list);
      if (tailValid && this.tailCheckpoint.index <= N) {
        this.invalidateCheckpoint('tail');
      }
      return;
    }

    if (N <= baseAnchor) {
      return;
    }

    const tailUsableAboveBase = tailValid && this.tailCheckpoint.index > baseAnchor;
    const {
      desiredTailIndex,
      unlockedBucketCount,
      trailingCount
    } = this.computeCompetitiveTailTarget(list, baseAnchor, N);

    if (unlockedBucketCount === 0) {
      if (!tailUsableAboveBase) {
        if ((N - baseAnchor) >= COMPETITIVE_DEFAULT_STRIDE) {
          this.captureCandidateSlot('tail', N, list);
        }
        return;
      }

      if (
        this.tailCheckpoint.index < N &&
        (N - this.tailCheckpoint.index) >= COMPETITIVE_DEFAULT_STRIDE
      ) {
        this.captureCandidateSlot('tail', N, list);
      }
      return;
    }

    if (!tailUsableAboveBase) {
      if (
        (trailingCount === 0 &&
          (unlockedBucketCount >= 2 || (N - baseAnchor) >= COMPETITIVE_DEFAULT_STRIDE)) ||
        trailingCount >= COMPETITIVE_POST_BUCKET_STRIDE
      ) {
        this.captureCandidateSlot('tail', N, list);
      }
      return;
    }

    if (this.tailCheckpoint.index < N) {
      if (trailingCount === 0) {
        const bucketsBeforeTail = this.countBucketsInRange(list, baseAnchor, this.tailCheckpoint.index);
        const bucketsAfterTail = this.countBucketsInRange(list, this.tailCheckpoint.index, N);
        const tailIsOnBucket =
          this.tailCheckpoint.index > 0 && isBucketCommand(list[this.tailCheckpoint.index - 1]);
        if (
          !tailIsOnBucket ||
          (bucketsBeforeTail === 0 && bucketsAfterTail >= 2)
        ) {
          this.captureCandidateSlot('tail', N, list);
        }
      } else if (
        trailingCount >= COMPETITIVE_POST_BUCKET_STRIDE &&
        desiredTailIndex > baseAnchor &&
        this.tailCheckpoint.index < desiredTailIndex
      ) {
        this.captureCandidateSlot('tail', N, list);
      }
    }
  }

  computeCompetitiveReplayPlan(commands: any[], endIndex: number): CompetitiveReplayCheckpointPlan {
    const emptyPlan: CompetitiveReplayCheckpointPlan = {
      candidateBaseIndex: -1,
      candidateTailIndex: -1,
      postReplayBaseIndex: -1,
      postReplayTailIndex: -1
    };
    if (!this.isCompetitiveCheckpointEnabled()) return emptyPlan;

    const bounds = this.deps.getCompetitiveCheckpointBounds?.(commands);
    if (!bounds) return emptyPlan;

    const { activeStart, maxConfirmedIdx, lockMissing, safeBaseUpperBound } = bounds;
    const effectiveConfEnd = Math.min(endIndex, maxConfirmedIdx);
    if (effectiveConfEnd <= activeStart) return emptyPlan;

    const baseValid = this.isCheckpointValid(this.baseCheckpoint, commands);

    let desiredBaseIndex = -1;
    if (!lockMissing && safeBaseUpperBound > activeStart) {
      const clampedBase = Math.min(safeBaseUpperBound, effectiveConfEnd);
      if (
        clampedBase > activeStart &&
        this.countBucketsInRange(commands, activeStart, clampedBase) > 0
      ) {
        desiredBaseIndex = clampedBase;
      }
    }

    let candidateBaseIndex = -1;
    let postReplayBaseIndex = -1;
    if (desiredBaseIndex > activeStart) {
      const alreadyCoveredByBase = baseValid && this.baseCheckpoint.index >= desiredBaseIndex;
      if (!alreadyCoveredByBase) {
        if (desiredBaseIndex < endIndex) {
          candidateBaseIndex = desiredBaseIndex;
        } else if (desiredBaseIndex === endIndex) {
          postReplayBaseIndex = endIndex;
        }
      }
    }

    const effectiveBaseAnchor = Math.max(
      activeStart,
      desiredBaseIndex > activeStart
        ? desiredBaseIndex
        : (baseValid ? this.baseCheckpoint.index : activeStart)
    );

    let { desiredTailIndex } = this.computeCompetitiveTailTarget(
      commands,
      effectiveBaseAnchor,
      effectiveConfEnd
    );

    if (desiredTailIndex <= effectiveBaseAnchor) {
      desiredTailIndex = -1;
    }

    let candidateTailIndex = -1;
    let postReplayTailIndex = -1;
    if (desiredTailIndex > effectiveBaseAnchor && desiredTailIndex <= effectiveConfEnd) {
      if (desiredTailIndex < endIndex) {
        candidateTailIndex = desiredTailIndex;
      } else if (desiredTailIndex === endIndex) {
        postReplayTailIndex = endIndex;
      }
    }

    return {
      candidateBaseIndex,
      candidateTailIndex,
      postReplayBaseIndex,
      postReplayTailIndex
    };
  }

  advanceCheckpointBucketPost(postIndex: number): void {
    if (this.isCompetitiveCheckpointEnabled()) {
      this.reconcileCompetitiveCheckpoints();
      return;
    }
    const config = this.deps.getConfig();
    const isFreeDrawExp = config.isFreeDraw && isBucketCheckpointExpEnabled();
    const isCompetitiveExp = this.isCompetitiveCheckpointEnabled();
    if (!isFreeDrawExp && !isCompetitiveExp) {
      this.advanceCheckpointIncremental();
      return;
    }

    const ctx = this.deps.getCtx();
    if (!ctx || !ctx.canvas) return;

    if (isFreeDrawExp) {
      this.captureHistoryCheckpoint(postIndex);
    }

    const list = this.deps.getCommands();
    const lastClearIndex = findLatestClearIndex(list);
    if (postIndex <= lastClearIndex) return;
    if (isCompetitiveExp && (postIndex <= 0 || postIndex > list.length)) return;

    const priorBucketCount = countBucketsBeforeIndex(list, postIndex - 1, lastClearIndex);
    const tailValid = this.isCheckpointValid(this.tailCheckpoint, list);

    if (priorBucketCount > 0 && tailValid && this.tailCheckpoint.index < postIndex) {
      // Rotate tail to base so base protects the previous bucket
      const bCanvas = this.ensureCheckpointCanvas('base');
      const bCtx = bCanvas.getContext('2d');
      if (bCtx && this.tailCheckpoint.canvas) {
        bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
        bCtx.save();
        bCtx.setTransform(1, 0, 0, 1, 0, 0);
        bCtx.drawImage(this.tailCheckpoint.canvas, 0, 0);
        bCtx.restore();
        this.baseCheckpoint = {
          canvas: bCanvas,
          index: this.tailCheckpoint.index,
          anchorSignature: this.tailCheckpoint.anchorSignature,
          lastClearIndex: this.tailCheckpoint.lastClearIndex
        };
      }
    }

    // Capture post-bucket into tail at postIndex
    const tCanvas = this.ensureCheckpointCanvas('tail');
    const tCtx = tCanvas.getContext('2d');
    if (tCtx) {
      tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
      tCtx.save();
      tCtx.setTransform(1, 0, 0, 1, 0, 0);
      tCtx.drawImage(ctx.canvas, 0, 0);
      tCtx.restore();
      this.tailCheckpoint = {
        canvas: tCanvas,
        index: postIndex,
        anchorSignature: getCommandSignature(list[postIndex - 1]),
        lastClearIndex
      };
    }

    const baseValid = this.isCheckpointValid(this.baseCheckpoint, list);
    if (baseValid && this.baseCheckpoint.index > this.tailCheckpoint.index) {
      const temp = this.baseCheckpoint;
      this.baseCheckpoint = this.tailCheckpoint;
      this.tailCheckpoint = temp;
    }
  }

  advanceCheckpointIncremental(): void {
    if (this.isCompetitiveCheckpointEnabled()) {
      this.reconcileCompetitiveCheckpoints();
      return;
    }
    const config = this.deps.getConfig();
    if (!config.isFreeDraw && !config.isExperimental) return;
    const list = this.deps.getCommands();
    const N = list.length;
    const STRIDE = 8;

    const ctx = this.deps.getCtx();
    if (!ctx || !ctx.canvas) return;

    const lastClearIndex = findLatestClearIndex(list);
    const activeStart = lastClearIndex >= 0 ? lastClearIndex + 1 : 0;

    // 🛡️ Adaptive Checkpoint Stride Adjustment (Free Draw Exp & Competitive Experimental Stage 4C)
    if ((isBucketCheckpointExpEnabled() && config.isFreeDraw) || this.isCompetitiveCheckpointEnabled()) {
      let latestBucketIdx = -1;
      for (let i = N - 1; i >= activeStart; i--) {
        if (isBucketCommand(list[i])) {
          latestBucketIdx = i;
          break;
        }
      }

      if (latestBucketIdx >= 0) {
        const postBucketIdx = latestBucketIdx + 1;
        const delta = N - postBucketIdx;
        if (delta < STRIDE || delta % STRIDE !== 0) return;

        const baseValid = this.isCheckpointValid(this.baseCheckpoint, list);
        const tailValid = this.isCheckpointValid(this.tailCheckpoint, list);

        if (tailValid && this.tailCheckpoint.index === N) return;
        if (baseValid && this.baseCheckpoint.index === N) return;

        // If tail is currently holding the postBucket checkpoint, promote it to base to preserve bucket protection:
        if (tailValid && this.tailCheckpoint.index === postBucketIdx) {
          const bCanvas = this.ensureCheckpointCanvas('base');
          const bCtx = bCanvas.getContext('2d');
          if (bCtx && this.tailCheckpoint.canvas) {
            bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
            bCtx.save();
            bCtx.setTransform(1, 0, 0, 1, 0, 0);
            bCtx.drawImage(this.tailCheckpoint.canvas, 0, 0);
            bCtx.restore();
            this.baseCheckpoint = {
              canvas: bCanvas,
              index: this.tailCheckpoint.index,
              anchorSignature: this.tailCheckpoint.anchorSignature,
              lastClearIndex: this.tailCheckpoint.lastClearIndex
            };
          }
        }

        // Capture new stride snapshot into tail at N:
        const tCanvas = this.ensureCheckpointCanvas('tail');
        const tCtx = tCanvas.getContext('2d');
        if (tCtx) {
          tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
          tCtx.save();
          tCtx.setTransform(1, 0, 0, 1, 0, 0);
          tCtx.drawImage(ctx.canvas, 0, 0);
          tCtx.restore();
          this.tailCheckpoint = {
            canvas: tCanvas,
            index: N,
            anchorSignature: getCommandSignature(list[N - 1]),
            lastClearIndex
          };
        }
        return;
      }
    }

    const M = N - activeStart;
    if (M < STRIDE) return;
    if (M % STRIDE !== 0) return;

    const baseValid = this.isCheckpointValid(this.baseCheckpoint, list);
    const tailValid = this.isCheckpointValid(this.tailCheckpoint, list);

    if (tailValid && this.tailCheckpoint.index === N) return;
    if (baseValid && this.baseCheckpoint.index === N) return;

    // Normalize order: Base should hold earlier index, Tail later index
    if (baseValid && tailValid && this.baseCheckpoint.index > this.tailCheckpoint.index) {
      const temp = this.baseCheckpoint;
      this.baseCheckpoint = this.tailCheckpoint;
      this.tailCheckpoint = temp;
    }

    if (!baseValid) {
      // Slot 1: Base is empty or invalidated, capture into Base
      const bCanvas = this.ensureCheckpointCanvas('base');
      const bCtx = bCanvas.getContext('2d');
      if (bCtx) {
        bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
        bCtx.save();
        bCtx.setTransform(1, 0, 0, 1, 0, 0);
        bCtx.drawImage(ctx.canvas, 0, 0);
        bCtx.restore();
        this.baseCheckpoint = {
          canvas: bCanvas,
          index: N,
          anchorSignature: getCommandSignature(list[N - 1]),
          lastClearIndex
        };
      }
      if (tailValid && this.baseCheckpoint.index > this.tailCheckpoint.index) {
        const temp = this.baseCheckpoint;
        this.baseCheckpoint = this.tailCheckpoint;
        this.tailCheckpoint = temp;
      }
    } else if (!tailValid) {
      // Slot 2: Base is valid, Tail is empty or invalidated, capture into Tail
      const tCanvas = this.ensureCheckpointCanvas('tail');
      const tCtx = tCanvas.getContext('2d');
      if (tCtx) {
        tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
        tCtx.save();
        tCtx.setTransform(1, 0, 0, 1, 0, 0);
        tCtx.drawImage(ctx.canvas, 0, 0);
        tCtx.restore();
        this.tailCheckpoint = {
          canvas: tCanvas,
          index: N,
          anchorSignature: getCommandSignature(list[N - 1]),
          lastClearIndex
        };
      }
    } else {
      // Both Base and Tail are valid: rotate snapshots
      // Recycle the older Base canvas for the new head checkpoint at index N
      const recycledCanvas = this.ensureCheckpointCanvas('base');
      const rCtx = recycledCanvas.getContext('2d');
      if (rCtx) {
        rCtx.clearRect(0, 0, recycledCanvas.width, recycledCanvas.height);
        rCtx.save();
        rCtx.setTransform(1, 0, 0, 1, 0, 0);
        rCtx.drawImage(ctx.canvas, 0, 0);
        rCtx.restore();

        // Previous Tail becomes the older checkpoint (Base)
        this.baseCheckpoint = {
          canvas: this.tailCheckpoint.canvas,
          index: this.tailCheckpoint.index,
          anchorSignature: this.tailCheckpoint.anchorSignature,
          lastClearIndex: this.tailCheckpoint.lastClearIndex
        };

        // Recycled canvas becomes the newer checkpoint (Tail)
        this.tailCheckpoint = {
          canvas: recycledCanvas,
          index: N,
          anchorSignature: getCommandSignature(list[N - 1]),
          lastClearIndex
        };
      }
    }
  }

  captureCandidateSlot(
    slot: 'base' | 'tail',
    index: number,
    commands: any[],
    sourceImageData?: ImageData | null,
    onBeforeDrawFromContext?: () => void
  ): boolean {
    const cpCanvas = this.ensureCheckpointCanvas(slot);
    const cpCtx = cpCanvas.getContext('2d');
    if (!cpCtx) return false;

    const ctx = this.deps.getCtx();
    if (!ctx || !ctx.canvas) return false;

    const canCopyDirectly = Boolean(
      sourceImageData &&
      sourceImageData.data &&
      sourceImageData.width === cpCanvas.width &&
      sourceImageData.height === cpCanvas.height
    );

    if (canCopyDirectly && sourceImageData) {
      cpCtx.putImageData(sourceImageData, 0, 0);
    } else {
      onBeforeDrawFromContext?.();
      cpCtx.clearRect(0, 0, cpCanvas.width, cpCanvas.height);
      cpCtx.save();
      cpCtx.setTransform(1, 0, 0, 1, 0, 0);
      cpCtx.drawImage(ctx.canvas, 0, 0);
      cpCtx.restore();
    }

    const lastClearIndex = findLatestClearIndex(commands);
    const cpRecord: FreeDrawCheckpoint = {
      canvas: cpCanvas,
      index,
      anchorSignature: getCommandSignature(commands[index - 1]),
      lastClearIndex
    };

    if (slot === 'base') {
      this.baseCheckpoint = cpRecord;
    } else {
      this.tailCheckpoint = cpRecord;
    }

    return true;
  }
}

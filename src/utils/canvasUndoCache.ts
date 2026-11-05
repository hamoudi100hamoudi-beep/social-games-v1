/**
 * 🛡️ Canvas Undo/Redo Bitmap Cache Manager (Phase 4E / Sub-Batch 4E-1B)
 *
 * Dedicated encapsulation for Free Draw and Competitive 1-step Undo/Redo bitmap caches.
 * Prevents O(N) full replays in long drawing sessions by capturing instant previous-state
 * snapshots on offscreen backing canvases.
 *
 * Invariants strictly maintained:
 * 1. Lazy offscreen canvas allocation and resizing (reused across the lifecycle).
 * 2. Unaltered ordering: stage at pointer-down, commit on stroke accept, discard on cancel.
 * 3. Strict fast-path verification (target ID, stroke ID, base history length, anchor signature).
 * 4. Competitive Undo/Redo flow: Redo cache preserved during pre-redo undo capture until restore succeeds.
 * 5. Full independence from CanvasCheckpointManager.
 */

import { getCommandSignature } from './canvasCommandHelpers';

export interface FreeDrawUndoCacheMeta {
  baseHistoryLength: number;
  targetInstanceId: string;
  targetStrokeId: number;
  prevAnchorSignature: string | null;
}

export interface CanvasUndoCacheDependencies {
  /** Retrieves the primary hardware canvas element */
  getCanvas: () => HTMLCanvasElement | null;
  /** Retrieves current command history for metadata anchoring */
  getCommands: () => any[];
  /** Retrieves runtime configuration flags */
  getConfig: () => {
    isFreeDraw?: boolean;
    enableBitmapUndoCache?: boolean;
    readOnly?: boolean;
  };
}

export class CanvasUndoCache {
  private undoCanvas: HTMLCanvasElement | null = null;
  private redoCanvas: HTMLCanvasElement | null = null;
  private pendingCanvas: HTMLCanvasElement | null = null;

  private hasUndo: boolean = false;
  private hasRedo: boolean = false;
  private hasPending: boolean = false;

  private meta: FreeDrawUndoCacheMeta | null = null;
  private deps: CanvasUndoCacheDependencies;

  constructor(deps: CanvasUndoCacheDependencies) {
    this.deps = deps;
  }

  private isFeatureEnabled(): boolean {
    const config = this.deps.getConfig();
    return Boolean(config.isFreeDraw || config.enableBitmapUndoCache);
  }

  private ensureCanvas(currentCanvas: HTMLCanvasElement | null, targetCanvas: HTMLCanvasElement): HTMLCanvasElement {
    let canvas = currentCanvas;
    if (!canvas) {
      canvas = document.createElement('canvas');
    }
    if (canvas.width !== targetCanvas.width || canvas.height !== targetCanvas.height) {
      canvas.width = targetCanvas.width;
      canvas.height = targetCanvas.height;
    }
    return canvas;
  }

  private copyContent(source: HTMLCanvasElement, target: HTMLCanvasElement): boolean {
    if (target.width !== source.width || target.height !== source.height) {
      target.width = source.width;
      target.height = source.height;
    }
    const tCtx = target.getContext('2d');
    if (!tCtx) return false;
    tCtx.globalCompositeOperation = 'copy';
    tCtx.drawImage(source, 0, 0);
    tCtx.globalCompositeOperation = 'source-over';
    return true;
  }

  private restore(cache: HTMLCanvasElement, target: HTMLCanvasElement): boolean {
    if (cache.width !== target.width || cache.height !== target.height) {
      return false;
    }
    const targetCtx = target.getContext('2d');
    if (!targetCtx) return false;
    targetCtx.save();
    targetCtx.setTransform(1, 0, 0, 1, 0, 0);
    targetCtx.globalCompositeOperation = 'copy';
    targetCtx.drawImage(cache, 0, 0);
    targetCtx.restore();
    return true;
  }

  // --- A. Pending Local Drawing (Pencil, Eraser, Shapes) ---

  /**
   * Stages the untouched primary canvas into the pending cache at pointer-down.
   * Runs only when bitmap caching is enabled and canvas is not read-only.
   */
  stagePending(): void {
    const config = this.deps.getConfig();
    const useCache = Boolean(config.isFreeDraw || config.enableBitmapUndoCache);
    if (!useCache || config.readOnly) return;
    const canvas = this.deps.getCanvas();
    if (!canvas) return;

    this.pendingCanvas = this.ensureCanvas(this.pendingCanvas, canvas);
    const copied = this.copyContent(canvas, this.pendingCanvas);
    if (copied) {
      this.hasPending = true;
    }
  }

  /**
   * Commits the staged pending cache into the committed Undo cache once a stroke or shape is finalized.
   * Invalidates any previous Redo cache and clears the pending flag.
   */
  commitPending(targetInstId?: string, targetStrId?: number): void {
    if (!this.isFeatureEnabled()) return;
    const canvas = this.deps.getCanvas();
    if (!this.hasPending || !this.pendingCanvas || !canvas) return;

    this.undoCanvas = this.ensureCanvas(this.undoCanvas, canvas);
    const copied = this.copyContent(this.pendingCanvas, this.undoCanvas);
    if (copied) {
      this.hasUndo = true;
      this.hasPending = false;
      this.hasRedo = false;

      if (targetInstId !== undefined && targetStrId !== undefined) {
        const list = this.deps.getCommands();
        const baseLen = list.length;
        const prevSig = baseLen > 0 ? getCommandSignature(list[baseLen - 1]) : null;
        this.meta = {
          baseHistoryLength: baseLen,
          targetInstanceId: targetInstId,
          targetStrokeId: targetStrId,
          prevAnchorSignature: prevSig
        };
      } else {
        this.meta = null;
      }
    }
  }

  /**
   * Discards the pending cache without touching committed Undo/Redo caches or metadata.
   * Used for PINCH-DOT-1 cancellation or gestures that stayed entirely outside canvas bounds.
   */
  discardPending(): void {
    this.hasPending = false;
  }

  // --- B. Direct Captures (Bucket, Remote Rasterization, Local Redo) ---

  /**
   * Captures the current primary canvas directly into the Undo cache.
   * Used when there is no staging phase (bucket fills, remote strokes, redo replay).
   */
  captureDirect(targetInstId?: string, targetStrId?: number): void {
    if (!this.isFeatureEnabled()) return;
    const canvas = this.deps.getCanvas();
    if (!canvas) return;

    this.undoCanvas = this.ensureCanvas(this.undoCanvas, canvas);
    const copied = this.copyContent(canvas, this.undoCanvas);
    if (copied) {
      this.hasUndo = true;
      this.hasPending = false;
      this.hasRedo = false;

      if (targetInstId !== undefined && targetStrId !== undefined) {
        const list = this.deps.getCommands();
        const baseLen = list.length;
        const prevSig = baseLen > 0 ? getCommandSignature(list[baseLen - 1]) : null;
        this.meta = {
          baseHistoryLength: baseLen,
          targetInstanceId: targetInstId,
          targetStrokeId: targetStrId,
          prevAnchorSignature: prevSig
        };
      } else {
        this.meta = null;
      }
    }
  }

  // --- C. Fast-Path Validation & Restoration ---

  /**
   * Performs strict validation that the cached undo bitmap matches the target command
   * and historical chain position before attempting restoration.
   */
  canRestoreFastPath(
    targetInst: string,
    targetStrId: number,
    targetIndex: number,
    onMiss?: (reason: string) => void
  ): boolean {
    if (!this.hasUndo || !this.undoCanvas) {
      onMiss?.('missing_cache');
      return false;
    }
    if (!this.meta) {
      onMiss?.('missing_metadata');
      return false;
    }
    if (this.meta.targetInstanceId !== targetInst || this.meta.targetStrokeId !== targetStrId) {
      onMiss?.('target_mismatch');
      return false;
    }
    if (this.meta.baseHistoryLength !== targetIndex) {
      onMiss?.('base_history_length_mismatch');
      return false;
    }

    const list = this.deps.getCommands();
    if (targetIndex > 0) {
      const prevCmd = list[targetIndex - 1];
      if (getCommandSignature(prevCmd) !== this.meta.prevAnchorSignature) {
        onMiss?.('anchor_mismatch');
        return false;
      }
    }

    const targetCmd = list[targetIndex];
    if (getCommandSignature(targetCmd) !== `${targetInst}_${targetStrId}`) {
      onMiss?.('command_signature_mismatch');
      return false;
    }

    return true;
  }

  /**
   * Restores primary canvas from the Undo cache.
   * Does NOT automatically alter cache validity flags; caller manages state transitions.
   */
  restoreFromUndoCache(): boolean {
    const canvas = this.deps.getCanvas();
    if (!canvas || !this.undoCanvas || !this.hasUndo) return false;
    return this.restore(this.undoCanvas, canvas);
  }

  /**
   * Restores primary canvas from the Redo cache.
   * Does NOT automatically alter cache validity flags; caller manages state transitions.
   */
  restoreFromRedoCache(): boolean {
    const canvas = this.deps.getCanvas();
    if (!canvas || !this.redoCanvas || !this.hasRedo) return false;
    return this.restore(this.redoCanvas, canvas);
  }

  // --- D. Competitive Undo / Redo Special Operations ---

  /**
   * Captures the current primary canvas into the Redo cache before competitive undo.
   * Leaves Undo validity and metadata intact.
   */
  captureCurrentAsRedoCache(): boolean {
    const canvas = this.deps.getCanvas();
    if (!canvas) return false;

    this.redoCanvas = this.ensureCanvas(this.redoCanvas, canvas);
    const copied = this.copyContent(canvas, this.redoCanvas);
    if (copied) {
      this.hasRedo = true;
      return true;
    }
    return false;
  }

  /**
   * Captures current primary canvas into the Undo cache before competitive redo,
   * PRESERVING the active Redo cache so redo restoration can succeed immediately after.
   */
  captureCurrentAsUndoCachePreservingRedo(): boolean {
    const canvas = this.deps.getCanvas();
    if (!canvas) return false;

    this.undoCanvas = this.ensureCanvas(this.undoCanvas, canvas);
    const copied = this.copyContent(canvas, this.undoCanvas);
    if (copied) {
      this.hasUndo = true;
      return true;
    }
    return false;
  }

  // --- E. Invalidation & State Transitions ---

  /**
   * Clears committed Undo and Redo caches and metadata, leaving pending state untouched.
   * Used after fast-path undo consumption or replay fallback.
   */
  invalidateCommittedCaches(): void {
    this.hasUndo = false;
    this.hasRedo = false;
    this.meta = null;
  }

  /**
   * Fully resets all caches (Undo, Redo, Pending) and metadata.
   * Used for clear epochs, resets, and full server history synchronization.
   */
  invalidateAll(): void {
    this.hasUndo = false;
    this.hasRedo = false;
    this.hasPending = false;
    this.meta = null;
  }

  /**
   * Convenience invalidation guarded by feature flag, matching existing invalidateFreeDrawCaches().
   */
  invalidateIfEnabled(): void {
    if (!this.isFeatureEnabled()) return;
    this.invalidateAll();
  }

  consumeUndo(): void {
    this.hasUndo = false;
  }

  consumeRedo(): void {
    this.hasRedo = false;
  }

  markUndoValid(): void {
    this.hasUndo = true;
  }

  clearMeta(): void {
    this.meta = null;
  }

  // --- F. Read-Only State Accessors ---

  hasUndoCache(): boolean {
    return this.hasUndo && Boolean(this.undoCanvas);
  }

  hasRedoCache(): boolean {
    return this.hasRedo && Boolean(this.redoCanvas);
  }

  hasPendingCache(): boolean {
    return this.hasPending && Boolean(this.pendingCanvas);
  }

  getMeta(): FreeDrawUndoCacheMeta | null {
    return this.meta;
  }

  getUndoCanvas(): HTMLCanvasElement | null {
    return this.undoCanvas;
  }

  getRedoCanvas(): HTMLCanvasElement | null {
    return this.redoCanvas;
  }

  getPendingCanvas(): HTMLCanvasElement | null {
    return this.pendingCanvas;
  }
}

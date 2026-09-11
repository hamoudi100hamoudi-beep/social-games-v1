// 🧪 Objective Profiling & Diagnostic Instrumentation for Task 2 (Experimental Drawing Room)

export type OperationCategory = 'CRITICAL FOR DRAWING' | 'NON-CRITICAL' | 'UNKNOWN';

export interface ConcurrentOperation {
  timestampRelMs: number;
  name: string;
  category: OperationCategory;
  details?: string;
}

export interface LongTaskRecord {
  timestampRelMs: number;
  durationMs: number;
  name: string;
}

export interface ResizeObserverRecord {
  timestampRelMs: number;
  target: string;
  width: number;
  height: number;
}

export interface PointerMoveSample {
  index: number;
  dispatchDelayMs: number;
  intervalMs: number;
}

export interface ExperimentalMetrics {
  // Counters
  gameRoomRenderCount: number;
  drawingLayerRenderCount: number;

  // Timelines (Relative to DRAWING transition start, in ms)
  transitionStartTimestamp: number | null;
  layerCommitRelMs: number | null;
  layoutMeasurementRelMs: number | null;
  
  // React Commits
  reactCommits: Array<{ timestampRelMs: number; component: string; reason: string }>;

  // Layout & Resize
  resizeObserverEvents: ResizeObserverRecord[];

  // Main Thread Freezes (Long Tasks & RAF Jitter)
  longTasks: LongTaskRecord[];
  rafStats: {
    totalFrames: number;
    droppedFrames: number; // delta > 33.3ms (less than 30 FPS)
    severeDroppedFrames: number; // delta > 50ms
    maxFrameDurationMs: number;
    avgFrameDurationMs: number;
    isRunning: boolean;
  };

  // Pointer Latencies (Hardware Event Timestamp vs Handler Execution Time)
  pointerDownStats: {
    eventTimestampRelMs: number | null;
    dispatchDelayMs: number | null;
  } | null;

  pointerMoveStats: {
    sampleCount: number;
    avgDispatchDelayMs: number | null;
    maxDispatchDelayMs: number | null;
    samples: PointerMoveSample[];
  };

  // Concurrent Operations Matrix
  concurrentOperations: ConcurrentOperation[];
  
  // Status
  isProfilingActive: boolean;
}

class ExperimentalInstrumentationManager {
  private metrics: ExperimentalMetrics = this.createDefaultMetrics();
  private listeners: Set<(m: ExperimentalMetrics) => void> = new Set();
  
  private rafTimerId: number | null = null;
  private lastRafTimestamp: number = 0;
  private longTaskObserver: PerformanceObserver | null = null;
  private profilingTimeoutId: any = null;
  private lastMoveTimestamp: number = 0;

  private createDefaultMetrics(): ExperimentalMetrics {
    return {
      gameRoomRenderCount: 0,
      drawingLayerRenderCount: 0,
      transitionStartTimestamp: null,
      layerCommitRelMs: null,
      layoutMeasurementRelMs: null,
      reactCommits: [],
      resizeObserverEvents: [],
      longTasks: [],
      rafStats: {
        totalFrames: 0,
        droppedFrames: 0,
        severeDroppedFrames: 0,
        maxFrameDurationMs: 0,
        avgFrameDurationMs: 0,
        isRunning: false,
      },
      pointerDownStats: null,
      pointerMoveStats: {
        sampleCount: 0,
        avgDispatchDelayMs: null,
        maxDispatchDelayMs: null,
        samples: [],
      },
      concurrentOperations: [],
      isProfilingActive: false,
    };
  }

  getMetrics(): ExperimentalMetrics {
    return { ...this.metrics };
  }

  subscribe(cb: (m: ExperimentalMetrics) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    const copy = this.getMetrics();
    this.listeners.forEach((cb) => {
      try {
        cb(copy);
      } catch (e) {
        // Safe dev listener guard
      }
    });
  }

  private getRelMs(): number {
    if (!this.metrics.transitionStartTimestamp) return 0;
    return Math.round((performance.now() - this.metrics.transitionStartTimestamp) * 10) / 10;
  }

  /**
   * 🚀 Called at the exact instant the state changes to DRAWING for the drawer
   */
  startTransition(isDrawer: boolean) {
    const now = performance.now();
    this.reset();
    this.metrics.transitionStartTimestamp = now;
    this.metrics.isProfilingActive = true;

    // Log the initiation operation
    this.recordOperation(
      'Transition: Entering DRAWING state',
      isDrawer ? 'CRITICAL FOR DRAWING' : 'NON-CRITICAL',
      `role=${isDrawer ? 'drawer' : 'spectator'}`
    );

    // Setup PerformanceObserver for longtask (if supported by the browser engine)
    this.setupLongTaskObserver();

    // Start requestAnimationFrame jitter & frame budget monitoring for 3.5 seconds
    this.startRafMonitoring();

    // Automatically stop intensive profiling window after 4 seconds to preserve battery and CPU
    if (this.profilingTimeoutId) clearTimeout(this.profilingTimeoutId);
    this.profilingTimeoutId = setTimeout(() => {
      this.stopProfiling();
    }, 4000);

    this.notify();
  }

  private setupLongTaskObserver() {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;
    try {
      if (this.longTaskObserver) {
        this.longTaskObserver.disconnect();
      }
      this.longTaskObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        for (const entry of entries) {
          if (entry.entryType === 'longtask') {
            const relMs = this.metrics.transitionStartTimestamp
              ? Math.round((entry.startTime - this.metrics.transitionStartTimestamp) * 10) / 10
              : Math.round(entry.startTime);
            const duration = Math.round(entry.duration * 10) / 10;

            this.metrics.longTasks.push({
              timestampRelMs: relMs,
              durationMs: duration,
              name: entry.name || 'MainThread_LongTask',
            });
          }
        }
        this.notify();
      });

      this.longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch (err) {
      // 'longtask' might not be supported in some WebViews/Safari, safely fallback to rAF jitter
    }
  }

  private startRafMonitoring() {
    if (typeof window === 'undefined') return;
    if (this.rafTimerId) cancelAnimationFrame(this.rafTimerId);

    this.metrics.rafStats.isRunning = true;
    this.lastRafTimestamp = performance.now();
    let frameTimes: number[] = [];

    const frameStep = (now: number) => {
      if (!this.metrics.rafStats.isRunning) return;

      const delta = now - this.lastRafTimestamp;
      this.lastRafTimestamp = now;

      // Ignore anomalous first frame
      if (delta > 0 && delta < 1000) {
        frameTimes.push(delta);
        this.metrics.rafStats.totalFrames++;

        if (delta > 33.3) {
          this.metrics.rafStats.droppedFrames++;
        }
        if (delta > 50) {
          this.metrics.rafStats.severeDroppedFrames++;
        }
        if (delta > this.metrics.rafStats.maxFrameDurationMs) {
          this.metrics.rafStats.maxFrameDurationMs = Math.round(delta * 10) / 10;
        }

        const sum = frameTimes.reduce((acc, v) => acc + v, 0);
        this.metrics.rafStats.avgFrameDurationMs = Math.round((sum / frameTimes.length) * 10) / 10;
      }

      this.rafTimerId = requestAnimationFrame(frameStep);
    };

    this.rafTimerId = requestAnimationFrame(frameStep);
  }

  stopProfiling() {
    this.metrics.isProfilingActive = false;
    this.metrics.rafStats.isRunning = false;
    if (this.rafTimerId) {
      cancelAnimationFrame(this.rafTimerId);
      this.rafTimerId = null;
    }
    if (this.longTaskObserver) {
      this.longTaskObserver.disconnect();
      this.longTaskObserver = null;
    }
    this.notify();
  }

  /**
   * ⚛️ Records React Component renders / commits during transition
   */
  recordReactCommit(component: string, reason: string) {
    if (component === 'ExperimentalGameRoom') {
      this.metrics.gameRoomRenderCount++;
    } else if (component === 'IsolatedDrawingLayer') {
      this.metrics.drawingLayerRenderCount++;
      if (this.metrics.layerCommitRelMs === null && this.metrics.transitionStartTimestamp !== null) {
        this.metrics.layerCommitRelMs = this.getRelMs();
      }
    }

    if (this.metrics.reactCommits.length < 25) {
      this.metrics.reactCommits.push({
        timestampRelMs: this.getRelMs(),
        component,
        reason,
      });
    }
    this.notify();
  }

  /**
   * 📐 Records when the Canvas layout / size measurement completes
   */
  recordLayoutMeasurement(width: number, height: number, source: string) {
    const rel = this.getRelMs();
    if (this.metrics.layoutMeasurementRelMs === null && this.metrics.transitionStartTimestamp !== null) {
      this.metrics.layoutMeasurementRelMs = rel;
    }

    if (this.metrics.resizeObserverEvents.length < 15) {
      this.metrics.resizeObserverEvents.push({
        timestampRelMs: rel,
        target: source,
        width: Math.round(width),
        height: Math.round(height),
      });
    }

    this.recordOperation(
      `Canvas Layout Ready: ${source} (${Math.round(width)}x${Math.round(height)})`,
      'CRITICAL FOR DRAWING',
      `completed in ${rel}ms`
    );

    this.notify();
  }

  /**
   * 👆 Records first pointerdown event with dispatch delay (event.timeStamp vs JS execution)
   */
  recordPointerDown(event: PointerEvent) {
    if (this.metrics.pointerDownStats !== null) return;
    const now = performance.now();
    
    // W3C event.timeStamp is relative to timeOrigin (matching performance.now())
    const dispatchDelay = event.timeStamp > 0 ? Math.max(0, Math.round((now - event.timeStamp) * 10) / 10) : 0;

    this.metrics.pointerDownStats = {
      eventTimestampRelMs: this.getRelMs(),
      dispatchDelayMs: dispatchDelay,
    };

    this.recordOperation(
      `First pointerdown dispatched (delay: ${dispatchDelay}ms)`,
      'CRITICAL FOR DRAWING',
      `pointerType=${event.pointerType || 'touch'}`
    );

    this.lastMoveTimestamp = now;
    this.notify();
  }

  /**
   * ✏️ Records pointermove stream dispatch latency during active drawing
   */
  recordPointerMove(event: PointerEvent) {
    const samples = this.metrics.pointerMoveStats.samples;
    if (samples.length >= 30) return; // Cap at 30 samples to avoid any memory/perf overhead

    const now = performance.now();
    const dispatchDelay = event.timeStamp > 0 ? Math.max(0, Math.round((now - event.timeStamp) * 10) / 10) : 0;
    const interval = this.lastMoveTimestamp > 0 ? Math.round((now - this.lastMoveTimestamp) * 10) / 10 : 0;
    this.lastMoveTimestamp = now;

    samples.push({
      index: samples.length + 1,
      dispatchDelayMs: dispatchDelay,
      intervalMs: interval,
    });

    this.metrics.pointerMoveStats.sampleCount = samples.length;
    
    const sum = samples.reduce((acc, s) => acc + s.dispatchDelayMs, 0);
    this.metrics.pointerMoveStats.avgDispatchDelayMs = Math.round((sum / samples.length) * 10) / 10;
    this.metrics.pointerMoveStats.maxDispatchDelayMs = Math.max(...samples.map((s) => s.dispatchDelayMs));

    // Batch notify every 5 moves to prevent re-rendering the HUD during active stroke
    if (samples.length % 5 === 0 || samples.length === 1) {
      this.notify();
    }
  }

  /**
   * 📋 Logs an operation executed during the transition window with category
   */
  recordOperation(name: string, category: OperationCategory, details?: string) {
    if (this.metrics.concurrentOperations.length >= 40) return;
    this.metrics.concurrentOperations.push({
      timestampRelMs: this.getRelMs(),
      name,
      category,
      details,
    });
  }

  reset() {
    this.metrics = this.createDefaultMetrics();
    this.notify();
  }
}

export const expMetrics = new ExperimentalInstrumentationManager();

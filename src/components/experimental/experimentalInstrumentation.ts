// 🧪 Dev-Only Performance & Re-render Instrumentation for Experimental Drawing Room
export interface ExperimentalMetrics {
  gameRoomRenderCount: number;
  drawingLayerRenderCount: number;
  drawingModeEnterTimestamp: number | null;
  firstPointerDownTimestamp: number | null;
  firstCanvasDrawTimestamp: number | null;
  transitionToFirstInputMs: number | null;
  inputToFirstDrawMs: number | null;
  lastDrawingLayerRenderReason: string;
}

class ExperimentalInstrumentationManager {
  private metrics: ExperimentalMetrics = {
    gameRoomRenderCount: 0,
    drawingLayerRenderCount: 0,
    drawingModeEnterTimestamp: null,
    firstPointerDownTimestamp: null,
    firstCanvasDrawTimestamp: null,
    transitionToFirstInputMs: null,
    inputToFirstDrawMs: null,
    lastDrawingLayerRenderReason: 'initial_mount',
  };

  private listeners: Set<(m: ExperimentalMetrics) => void> = new Set();

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

  recordGameRoomRender() {
    this.metrics.gameRoomRenderCount++;
    this.notify();
  }

  recordDrawingLayerRender(reason: string = 'props_updated') {
    this.metrics.drawingLayerRenderCount++;
    this.metrics.lastDrawingLayerRenderReason = reason;
    this.notify();
  }

  recordDrawingModeEnter() {
    const now = performance.now();
    this.metrics.drawingModeEnterTimestamp = now;
    this.metrics.firstPointerDownTimestamp = null;
    this.metrics.firstCanvasDrawTimestamp = null;
    this.metrics.transitionToFirstInputMs = null;
    this.metrics.inputToFirstDrawMs = null;
    this.notify();
  }

  recordFirstPointerDown() {
    if (this.metrics.firstPointerDownTimestamp !== null) return;
    const now = performance.now();
    this.metrics.firstPointerDownTimestamp = now;
    if (this.metrics.drawingModeEnterTimestamp !== null) {
      this.metrics.transitionToFirstInputMs = Math.round(now - this.metrics.drawingModeEnterTimestamp);
    }
    this.notify();
  }

  recordFirstCanvasDraw() {
    if (this.metrics.firstCanvasDrawTimestamp !== null) return;
    const now = performance.now();
    this.metrics.firstCanvasDrawTimestamp = now;
    if (this.metrics.firstPointerDownTimestamp !== null) {
      this.metrics.inputToFirstDrawMs = Math.round(now - this.metrics.firstPointerDownTimestamp);
    }
    this.notify();
  }

  reset() {
    this.metrics = {
      gameRoomRenderCount: 0,
      drawingLayerRenderCount: 0,
      drawingModeEnterTimestamp: null,
      firstPointerDownTimestamp: null,
      firstCanvasDrawTimestamp: null,
      transitionToFirstInputMs: null,
      inputToFirstDrawMs: null,
      lastDrawingLayerRenderReason: 'reset',
    };
    this.notify();
  }
}

export const expMetrics = new ExperimentalInstrumentationManager();

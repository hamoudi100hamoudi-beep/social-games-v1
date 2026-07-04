import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useImperativeHandle,
  forwardRef
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useSocket } from '../SocketProvider';
import { ToolType } from '../../types/draw';
import {
  encodeBinaryDrawMessage,
  decodeBinaryDrawMessage
} from '../../utils/drawBinaryHelper';

// --- Constants ---
/* 
  ⚠️ CRITICAL ARCHITECTURE RULE: DO NOT CHANGE THE ASPECT RATIO (1.72) OF THE CANVAS.
  GameRoom uses aspect-[740/430]. Any internal canvas resizing must preserve
  this exact aspect ratio to prevent spectator layout squishing or grey gaps. 
*/
export const CANVAS_WIDTH = 592;
export const CANVAS_HEIGHT = 344;

const LOGICAL_WIDTH = CANVAS_WIDTH;
const LOGICAL_HEIGHT = CANVAS_HEIGHT;

// --- Performance and DPR Tiering ---
const getPerformanceTier = () => {
  if (typeof window === 'undefined') return 1;
  try {
    const nav: any = navigator;
    const cpuCount = nav.hardwareConcurrency;
    const memory = nav.deviceMemory;

    const cpus = cpuCount !== undefined ? cpuCount : 4;
    const mem = memory !== undefined ? memory : 4;

    if (cpus <= 2 || mem <= 2) {
      return 3; // Low-End: ultra-low VRAM memory restrictions
    }
    if (cpus <= 4 || mem <= 3) {
      return 2; // Medium-End
    }
  } catch (err) {
    if (window.devicePixelRatio !== undefined && window.devicePixelRatio < 1.5) {
      return 3;
    }
  }
  return 1; // High-End
};

const PERF_TIER = typeof window !== 'undefined' ? getPerformanceTier() : 1;
const IS_LOW_END = PERF_TIER === 3;

const getAdaptiveDPR = () => {
  if (typeof window === 'undefined') return 2;
  
  const isMobileOrTablet = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Tablet/i.test(navigator.userAgent) || 
    ('ontouchstart' in window) || 
    (navigator.maxTouchPoints > 0);

  if (isMobileOrTablet) {
    if (PERF_TIER === 3) return 1.0;
    if (PERF_TIER === 2) return 1.2;
    return Math.min(1.5, window.devicePixelRatio || 1);
  }

  if (PERF_TIER === 3) return 1.0;
  if (PERF_TIER === 2) return 1.2;
  return Math.min(2, window.devicePixelRatio || 1);
};

const DPR = typeof window !== 'undefined' ? getAdaptiveDPR() : 2;

// --- Built-in Flood Fill (Aided for performance and safety) ---
const matchColor = (data: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number) => {
  const tolerance = 40;
  return Math.abs(data[i] - r) <= tolerance &&
         Math.abs(data[i + 1] - g) <= tolerance &&
         Math.abs(data[i + 2] - b) <= tolerance &&
         Math.abs(data[i + 3] - a) <= tolerance;
};

let sharedOffscreenCanvas: HTMLCanvasElement | null = null;
let sharedOffscreenCtx: CanvasRenderingContext2D | null = null;

const floodFill = (ctx: CanvasRenderingContext2D, startX: number, startY: number, fillColorStr: string, fillOpacity: number = 1) => {
  const canvas = ctx.canvas;
  const cw = canvas.width;
  const ch = canvas.height;

  if (!sharedOffscreenCanvas) {
    sharedOffscreenCanvas = document.createElement('canvas');
  }
  if (sharedOffscreenCanvas.width !== cw || sharedOffscreenCanvas.height !== ch) {
    sharedOffscreenCanvas.width = cw;
    sharedOffscreenCanvas.height = ch;
    sharedOffscreenCtx = null;
  }
  if (!sharedOffscreenCtx) {
    sharedOffscreenCtx = sharedOffscreenCanvas.getContext('2d', { willReadFrequently: true });
  }

  const offscreenCtx = sharedOffscreenCtx;
  if (!offscreenCtx) return;

  offscreenCtx.clearRect(0, 0, cw, ch);
  offscreenCtx.drawImage(canvas, 0, 0);

  const imageData = offscreenCtx.getImageData(0, 0, cw, ch);
  const data = imageData.data;

  const sx = Math.floor(startX * DPR);
  const sy = Math.floor(startY * DPR);

  if (sx < 0 || sx >= cw || sy < 0 || sy >= ch) return;

  const targetIdx = (sy * cw + sx) * 4;
  const tr = data[targetIdx];
  const tg = data[targetIdx + 1];
  const tb = data[targetIdx + 2];
  const ta = data[targetIdx + 3];

  let fillHex = fillColorStr;
  if (fillHex.length === 4) {
    fillHex = '#' + fillHex[1] + fillHex[1] + fillHex[2] + fillHex[2] + fillHex[3] + fillHex[3];
  }

  const fr = parseInt(fillHex.slice(1, 3), 16) || 0;
  const fg = parseInt(fillHex.slice(3, 5), 16) || 0;
  const fb = parseInt(fillHex.slice(5, 7), 16) || 0;

  if (fillOpacity >= 0.95 && Math.abs(tr - fr) <= 5 && Math.abs(tg - fg) <= 5 && Math.abs(tb - fb) <= 5) {
    return;
  }

  const visited = new Uint8Array(cw * ch);
  const queueX: number[] = [sx];
  const queueY: number[] = [sy];
  let head = 0;

  while (head < queueX.length) {
    const cx = queueX[head];
    const cy = queueY[head];
    head++;

    const seedIdx = cy * cw + cx;
    if (visited[seedIdx]) continue;

    let xCurr = cx;
    let yCurr = cy;

    let idx = (yCurr * cw + xCurr) * 4;
    let pixelIdx = yCurr * cw + xCurr;
    while (xCurr >= 0 && !visited[pixelIdx] && matchColor(data, idx, tr, tg, tb, ta)) {
      xCurr--;
      idx -= 4;
      pixelIdx--;
    }
    xCurr++;
    idx += 4;
    pixelIdx++;

    let spanAbove = false;
    let spanBelow = false;

    while (xCurr < cw && !visited[pixelIdx] && matchColor(data, idx, tr, tg, tb, ta)) {
      visited[pixelIdx] = 1;

      const destR = data[idx];
      const destG = data[idx + 1];
      const destB = data[idx + 2];

      data[idx] = Math.round(fr * fillOpacity + destR * (1 - fillOpacity));
      data[idx + 1] = Math.round(fg * fillOpacity + destG * (1 - fillOpacity));
      data[idx + 2] = Math.round(fb * fillOpacity + destB * (1 - fillOpacity));
      data[idx + 3] = 255;

      if (yCurr > 0) {
        const idxAbove = ((yCurr - 1) * cw + xCurr) * 4;
        const pixelIdxAbove = (yCurr - 1) * cw + xCurr;
        const matchesAbove = !visited[pixelIdxAbove] && matchColor(data, idxAbove, tr, tg, tb, ta);
        if (!spanAbove && matchesAbove) {
          queueX.push(xCurr);
          queueY.push(yCurr - 1);
          spanAbove = true;
        } else if (spanAbove && !matchesAbove) {
          spanAbove = false;
        }
      }

      if (yCurr < ch - 1) {
        const idxBelow = ((yCurr + 1) * cw + xCurr) * 4;
        const pixelIdxBelow = (yCurr + 1) * cw + xCurr;
        const matchesBelow = !visited[pixelIdxBelow] && matchColor(data, idxBelow, tr, tg, tb, ta);
        if (!spanBelow && matchesBelow) {
          queueX.push(xCurr);
          queueY.push(yCurr + 1);
          spanBelow = true;
        } else if (spanBelow && !matchesBelow) {
          spanBelow = false;
        }
      }

      xCurr++;
      idx += 4;
      pixelIdx++;
    }
  }

  ctx.putImageData(imageData, 0, 0);
};

export interface DrawingCanvasCoreRef {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  resetState: () => void;
  getCanvasSnapshot: () => string | null;
  resetZoom?: () => void;
}

interface DrawingCanvasCoreProps {
  readOnly?: boolean;
  tool: ToolType;
  color: string;
  thickness: number;
  opacity: number;
  onHistoryStateChange?: (index: number, length: number) => void;
  onPipetteColorPicked?: (hex: string) => void;
  currentDrawerId?: string;
  status?: string;
  isZoomEnabled?: boolean;
  onSyncStateChange?: (syncing: boolean) => void;
}

const DrawingCanvasCore = forwardRef<DrawingCanvasCoreRef, DrawingCanvasCoreProps>((
  {
    readOnly = false,
    tool,
    color,
    thickness,
    opacity,
    onHistoryStateChange,
    onPipetteColorPicked,
    currentDrawerId,
    status,
    isZoomEnabled = false,
    onSyncStateChange
  },
  ref
) => {
  const instanceId = useMemo(() => Math.random().toString(36).substring(2, 9), []);
  const { socket, isConnected } = useSocket();

  // Primary visual and interactive layers
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);

  // Core drawing contexts
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const tempCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // States
  const [isSyncing, setIsSyncing] = useState(true);
  const [hasSyncedOnce, setHasSyncedOnce] = useState(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Local drawing track refs
  const isDrawingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentPathRef = useRef<{ x: number; y: number }[]>([]);
  const activeSessionsRef = useRef<Record<string, {
    tool: ToolType;
    color: string;
    width: number;
    opacity: number;
    path: { x: number; y: number }[];
  }>>({});

  // Batch network throttle
  const moveBatchRef = useRef<{ x: number; y: number }[]>([]);
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const bucketTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const preventBucketRef = useRef(false);

  useEffect(() => {
    return () => {
      if (bucketTimeoutRef.current) {
        clearTimeout(bucketTimeoutRef.current);
      }
    };
  }, []);

  const isReplayingRef = useRef(false);

  // Deterministic local command queue for flawless client-side undo/redo and late-joiner state recovery
  const localCommandsRef = useRef<any[]>([]);
  const localRedoStackRef = useRef<any[][]>([]);
  const prevCommandsCountRef = useRef<number>(-1);

  // Buffering history syncing before ref ready
  const bufferedSyncRef = useRef<any[] | null>(null);
  const lastSyncRequestTimeRef = useRef<number>(0);

  // Layout scale tracking for responsive full viewport fitting
  const containerRef = useRef<HTMLDivElement>(null);
  const transformWrapperRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef({ scale: 1, x: 0, y: 0 });
  const [baseScale, setBaseScale] = useState(1);
  const hasInitializedTransform = useRef(false);
  const isCanvasResizeObserverReadyRef = useRef(false);
  const hasManuallyZoomedOrPanned = useRef(false);
  const activeTouchCountRef = useRef(0);
  const isZoomPinchingRef = useRef(false);
  const redrawRequestedRef = useRef(false);

  // Force re-centering instantly when user drawing status / role updates
  useEffect(() => {
    hasInitializedTransform.current = false;
    hasManuallyZoomedOrPanned.current = false;
  }, [readOnly]);

  // Stable Callback Reference Guard (معقل المرجع المستقر للتخلص من عواصف الترابط)
  const onSyncStateChangeRef = useRef(onSyncStateChange);
  
  // تحديث فوري للمرجع في كل ريندر لمنع الاستدعاءات المغلقة القديمة (Stale Closures)
  onSyncStateChangeRef.current = onSyncStateChange;

  useEffect(() => {
    onSyncStateChangeRef.current = onSyncStateChange;
  });

  useEffect(() => {
    onSyncStateChangeRef.current?.(isSyncing);
  }, [isSyncing]);

  // Dynamic references to read props values directly in listeners without re-binding
  const propsRef = useRef({ tool, color, thickness, opacity, readOnly });
  useEffect(() => {
    propsRef.current = { tool, color, thickness, opacity, readOnly };
  }, [tool, color, thickness, opacity, readOnly]);

  const applyTransform = (overrideBaseScale?: number) => {
    if (transformWrapperRef.current) {
      if (readOnly) {
        transformWrapperRef.current.style.transform = 'none';
        return;
      }
      const { x, y, scale } = transformRef.current;
      const currentBaseScale = overrideBaseScale !== undefined ? overrideBaseScale : baseScale;
      transformWrapperRef.current.style.transform = `translate(${x}px, ${y}px) scale(${currentBaseScale * scale})`;
    }
  };

  useEffect(() => {
    applyTransform();
  }, [baseScale]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) continue;
        
        const targetScale = readOnly
          ? Math.min(width / LOGICAL_WIDTH, height / LOGICAL_HEIGHT)
          : height / LOGICAL_HEIGHT;
        
        setBaseScale(targetScale);
        
        // Exact responsive centered coordinates
        const canvasDisplayWidth = LOGICAL_WIDTH * targetScale;
        const canvasDisplayHeight = LOGICAL_HEIGHT * targetScale;
        const initialX = (width - canvasDisplayWidth) / 2;
        const initialY = (height - canvasDisplayHeight) / 2;

        // Auto-center on layout update/transition unless the player already Zoomed or Panned manually
        if (!hasInitializedTransform.current || readOnly || !hasManuallyZoomedOrPanned.current) {
          transformRef.current = { scale: 1, x: initialX, y: initialY };
          if (!readOnly) hasInitializedTransform.current = true;
        }
        
        applyTransform(targetScale);
        
        // Signal that the DOM is fully laid out and ResizeObserver has evaluated physical scale
        isCanvasResizeObserverReadyRef.current = true;
      }
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, [readOnly]);

  // --- Multi-touch Mobile Pinch to Zoom and Pan ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let touchStartDist = 0;
    let touchStartScale = 1;
    let touchStartCenterX = 0;
    let touchStartCenterY = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let isPinching = false;

    const handleTouchStart = (e: TouchEvent) => {
      activeTouchCountRef.current = e.touches.length;

      if (e.touches.length >= 2) {
        preventBucketRef.current = true;
        if (bucketTimeoutRef.current) {
          clearTimeout(bucketTimeoutRef.current);
          bucketTimeoutRef.current = null;
        }
      }

      // Immediately cancel any active solo-touch stroke if user introduces a second touch (pinch zoom start)
      if (e.touches.length >= 2 && isDrawingRef.current) {
        isDrawingRef.current = false;
        
        if (tempCtxRef.current) {
          tempCtxRef.current.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
        }
        moveBatchRef.current = [];
        emitDrawCommand('draw_end', {
          tool: propsRef.current.tool,
          color: propsRef.current.color,
          width: propsRef.current.thickness,
          opacity: propsRef.current.opacity,
          isShape: false,
          isCancelled: true
        });
        emitDrawCommand('draw_cancel', {});
      }

      if (!isZoomEnabled || propsRef.current.readOnly) return;

      if (e.touches.length === 2) {
        e.preventDefault();
        isPinching = true;
        isZoomPinchingRef.current = true;

        const t1 = e.touches[0];
        const t2 = e.touches[1];

        touchStartDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        touchStartScale = transformRef.current.scale;
        
        const clientMidX = (t1.clientX + t2.clientX) / 2;
        const clientMidY = (t1.clientY + t2.clientY) / 2;

        const rect = container.getBoundingClientRect();
        touchStartCenterX = clientMidX - rect.left;
        touchStartCenterY = clientMidY - rect.top;

        touchStartX = transformRef.current.x;
        touchStartY = transformRef.current.y;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      activeTouchCountRef.current = e.touches.length;

      if (e.touches.length >= 2) {
        preventBucketRef.current = true;
        if (bucketTimeoutRef.current) {
          clearTimeout(bucketTimeoutRef.current);
          bucketTimeoutRef.current = null;
        }
      }

      if (!isZoomEnabled || propsRef.current.readOnly || !isPinching) return;

      if (e.touches.length === 2) {
        e.preventDefault();

        const t1 = e.touches[0];
        const t2 = e.touches[1];

        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (touchStartDist > 0) {
          const rect = container.getBoundingClientRect();
          const containerW = rect.width;
          const containerH = rect.height;

          // Dynamically compute perfect fit scale so mobile user can see full drawing stage
          const fitWidthScale = containerW / (LOGICAL_WIDTH * baseScale);
          const fitHeightScale = containerH / (LOGICAL_HEIGHT * baseScale);
          const perfectFitScale = Math.min(fitWidthScale, fitHeightScale);
          const minScaleLimit = Math.max(0.3, Math.min(1.0, perfectFitScale * 0.9));
          let scaleFactor = dist / touchStartDist;
          let nextScale = Math.max(minScaleLimit, Math.min(4.0, touchStartScale * scaleFactor));

          const clientMidX = (t1.clientX + t2.clientX) / 2;
          const clientMidY = (t1.clientY + t2.clientY) / 2;
          const currentCenterX = clientMidX - rect.left;
          const currentCenterY = clientMidY - rect.top;

          let nextX = currentCenterX - ((touchStartCenterX - touchStartX) / touchStartScale) * nextScale;
          let nextY = currentCenterY - ((touchStartCenterY - touchStartY) / touchStartScale) * nextScale;

          // Apply boundary buffers to prevent the canvas from getting lost offscreen
          const dispW = LOGICAL_WIDTH * baseScale * nextScale;
          const dispH = LOGICAL_HEIGHT * baseScale * nextScale;

          const minX = -dispW + 100;
          const maxX = containerW - 100;
          const minY = -dispH + 100;
          const maxY = containerH - 100;

          nextX = Math.max(minX, Math.min(maxX, nextX));
          nextY = Math.max(minY, Math.min(maxY, nextY));

          transformRef.current = { scale: nextScale, x: nextX, y: nextY };
          hasManuallyZoomedOrPanned.current = true;
          applyTransform();
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      activeTouchCountRef.current = e.touches.length;

      if (e.touches.length === 0) {
        preventBucketRef.current = false;
      }

      if (isPinching) {
        isPinching = false;
        touchStartDist = 0;
        // Keep zoom-is-pinching true for 100ms path stabilization after pinch ends
        setTimeout(() => {
          isZoomPinchingRef.current = false;
        }, 100);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isZoomEnabled, baseScale]);

  // --- Desktop Wheel / Pinch Zoom ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!isZoomEnabled || propsRef.current.readOnly) return;

      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const containerW = rect.width;
      const containerH = rect.height;

      // Dynamically compute perfect fit scale so user can zoom out enough to see full canvas
      const fitWidthScale = containerW / (LOGICAL_WIDTH * baseScale);
      const fitHeightScale = containerH / (LOGICAL_HEIGHT * baseScale);
      const perfectFitScale = Math.min(fitWidthScale, fitHeightScale);
      const minScaleLimit = Math.max(0.3, Math.min(1.0, perfectFitScale * 0.9));

      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let factor = e.deltaY < 0 ? 1.15 : 0.85;
      const nextScale = Math.max(minScaleLimit, Math.min(4.0, transformRef.current.scale * factor));
      const scaleRatio = nextScale / transformRef.current.scale;

      let nextX = mx - (mx - transformRef.current.x) * scaleRatio;
      let nextY = my - (my - transformRef.current.y) * scaleRatio;

      // Apply boundary buffers
      const dispW = LOGICAL_WIDTH * baseScale * nextScale;
      const dispH = LOGICAL_HEIGHT * baseScale * nextScale;

      const minX = -dispW + 100;
      const maxX = containerW - 100;
      const minY = -dispH + 100;
      const maxY = containerH - 100;

      nextX = Math.max(minX, Math.min(maxX, nextX));
      nextY = Math.max(minY, Math.min(maxY, nextY));

      transformRef.current = { scale: nextScale, x: nextX, y: nextY };
      hasManuallyZoomedOrPanned.current = true;
      applyTransform();
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [isZoomEnabled, baseScale]);

  // --- Desktop Click-Drag To Pan (Right Click / Middle Click-Drag) ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;

    const handlePointerDown = (e: PointerEvent) => {
      if (!isZoomEnabled || propsRef.current.readOnly) return;

      if (e.button === 2 || e.button === 1) {
        e.preventDefault();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialX = transformRef.current.x;
        initialY = transformRef.current.y;
        container.setPointerCapture(e.pointerId);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      e.preventDefault();

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let nextX = initialX + dx;
      let nextY = initialY + dy;

      const rect = container.getBoundingClientRect();
      const dispW = LOGICAL_WIDTH * baseScale * transformRef.current.scale;
      const dispH = LOGICAL_HEIGHT * baseScale * transformRef.current.scale;
      const containerW = rect.width;
      const containerH = rect.height;

      const minX = -dispW + 100;
      const maxX = containerW - 100;
      const minY = -dispH + 100;
      const maxY = containerH - 100;

      nextX = Math.max(minX, Math.min(maxX, nextX));
      nextY = Math.max(minY, Math.min(maxY, nextY));

      transformRef.current = {
        ...transformRef.current,
        x: nextX,
        y: nextY
      };
      hasManuallyZoomedOrPanned.current = true;
      applyTransform();
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isDragging) {
        isDragging = false;
        container.releasePointerCapture(e.pointerId);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (isZoomEnabled && !propsRef.current.readOnly) {
        e.preventDefault();
      }
    };

    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerUp);
    container.addEventListener('contextmenu', handleContextMenu);

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerUp);
      container.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isZoomEnabled, baseScale]);

  // Expose handles to Parent Component
  useImperativeHandle(ref, () => ({
    undo: () => executeUndo(true),
    redo: () => executeRedo(true),
    clear: () => executeClear(true),
    resetState: () => executeResetState(),
    getCanvasSnapshot: () => {
      if (canvasRef.current) {
        return canvasRef.current.toDataURL('image/png');
      }
      return null;
    },
    resetZoom: () => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const targetScale = propsRef.current.readOnly
         ? Math.min(rect.width / LOGICAL_WIDTH, rect.height / LOGICAL_HEIGHT)
         : rect.height / LOGICAL_HEIGHT;

      const canvasDisplayWidth = LOGICAL_WIDTH * targetScale;
      const canvasDisplayHeight = LOGICAL_HEIGHT * targetScale;
      const initialX = (rect.width - canvasDisplayWidth) / 2;
      const initialY = (rect.height - canvasDisplayHeight) / 2;

      transformRef.current = { scale: 1, x: initialX, y: initialY };
      hasManuallyZoomedOrPanned.current = false;
      applyTransform(targetScale);
    }
  }));

  // Binary Command Dispatch helper
  const emitDrawCommand = (event: string, payload: any) => {
    if (socket?.connected) {
      const msg = encodeBinaryDrawMessage(event, { ...payload, instanceId });
      if (event === 'draw_move' && socket.volatile) {
        socket.volatile.emit('draw_binary', msg);
      } else {
        socket.emit('draw_binary', msg);
      }

      // Record local durable drawing history for deterministic undo / redo
      if (event === 'draw_stroke' || event === 'draw_clear' || (event === 'draw_action' && payload.tool === 'bucket')) {
        prevCommandsCountRef.current = localCommandsRef.current.length;
        localCommandsRef.current.push({ event: 'draw_binary', data: msg });
        localRedoStackRef.current = []; // Wipe redo stack on new action
        syncHistoryButtons();
      }
    }
  };

  // --- Snapshot Management (Adaptive Multi-Step VRAM Memory & CPU Optimizer) ---
  const saveSnapshot = (force = false) => {
    // No-op: Drawing state-recovery is now 100% powered deterministically by the lightweight command replay engine (localCommandsRef)
  };

  // --- Logical Coordinate Conversion ---
  const getLogicalCoords = (clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const x = ((clientX - rect.left) / rect.width) * LOGICAL_WIDTH;
    const y = ((clientY - rect.top) / rect.height) * LOGICAL_HEIGHT;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  };

  // --- Dynamic Drawing Functions ---
  const drawSegment = (
    activeCtx: CanvasRenderingContext2D,
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    tool: string,
    color: string,
    width: number,
    opacity: number
  ) => {
    activeCtx.save();
    activeCtx.lineWidth = width;
    activeCtx.lineCap = 'round';
    activeCtx.lineJoin = 'round';
    activeCtx.globalAlpha = opacity;
    if (tool === 'eraser') {
      activeCtx.strokeStyle = '#ffffff';
    } else {
      activeCtx.strokeStyle = color;
    }
    activeCtx.beginPath();
    activeCtx.moveTo(p1.x, p1.y);
    activeCtx.lineTo(p2.x, p2.y);
    activeCtx.stroke();
    activeCtx.restore();
  };

  const drawEntirePath = (
    activeCtx: CanvasRenderingContext2D,
    path: { x: number; y: number }[],
    drawTool: ToolType,
    drawColor: string,
    drawWidth: number,
    drawOpacity: number
  ) => {
    if (path.length === 0) return;

    activeCtx.save();
    activeCtx.lineWidth = drawWidth;
    activeCtx.lineCap = 'round';
    activeCtx.lineJoin = 'round';
    activeCtx.globalAlpha = drawOpacity;

    if (drawTool === 'eraser') {
      activeCtx.strokeStyle = '#ffffff';
      activeCtx.fillStyle = '#ffffff';
    } else {
      activeCtx.strokeStyle = drawColor;
      activeCtx.fillStyle = drawColor;
    }

    if (path.length === 1) {
      activeCtx.beginPath();
      activeCtx.arc(path[0].x, path[0].y, drawWidth / 2, 0, Math.PI * 2);
      activeCtx.fill();
    } else {
      // Smooth midpoint quadratic curve drawing to eliminate polygonal sharp corners
      activeCtx.beginPath();
      activeCtx.moveTo(path[0].x, path[0].y);
      if (path.length === 2) {
        activeCtx.lineTo(path[1].x, path[1].y);
      } else {
        let i = 1;
        for (i = 1; i < path.length - 1; i++) {
          const xc = (path[i].x + path[i + 1].x) / 2;
          const yc = (path[i].y + path[i + 1].y) / 2;
          activeCtx.quadraticCurveTo(path[i].x, path[i].y, xc, yc);
        }
        activeCtx.lineTo(path[path.length - 1].x, path[path.length - 1].y);
      }
      activeCtx.stroke();
    }

    activeCtx.restore();
  };

  const executeRedrawTempLayer = () => {
    const tempCtx = tempCtxRef.current;
    if (!tempCtx) return;

    tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);

    if (isDrawingRef.current) {
      const activeTool = propsRef.current.tool;
      const activeColor = propsRef.current.color;
      const activeWidth = propsRef.current.thickness;
      const activeOpacity = propsRef.current.opacity;

      if (activeTool === 'pencil' || activeTool === 'eraser') {
        if (currentPathRef.current.length > 0) {
          drawEntirePath(tempCtx, currentPathRef.current, activeTool, activeColor, activeWidth, activeOpacity);
        }
      } else {
        if (currentPathRef.current.length > 0) {
          const lastPt = currentPathRef.current[currentPathRef.current.length - 1];
          drawShape(tempCtx, startXRef.current, startYRef.current, lastPt.x, lastPt.y, activeTool, activeColor, activeWidth, activeOpacity);
        }
      }
    }

    Object.keys(activeSessionsRef.current).forEach((instId) => {
      const session = activeSessionsRef.current[instId];
      if (session && session.path && session.path.length > 0) {
        const isShape = session.tool !== 'pencil' && session.tool !== 'eraser';
        if (isShape) {
          const startPt = session.path[0];
          const lastPt = session.path[session.path.length - 1];
          drawShape(tempCtx, startPt.x, startPt.y, lastPt.x, lastPt.y, session.tool, session.color, session.width, session.opacity);
        } else {
          drawEntirePath(tempCtx, session.path, session.tool, session.color, session.width, session.opacity);
        }
      }
    });
  };

  const redrawTempLayer = () => {
    if (redrawRequestedRef.current) return;
    redrawRequestedRef.current = true;
    requestAnimationFrame(() => {
      redrawRequestedRef.current = false;
      executeRedrawTempLayer();
    });
  };

  const drawShape = (
    activeCtx: CanvasRenderingContext2D,
    x0: number, y0: number,
    x1: number, y1: number,
    drawTool: ToolType,
    drawColor: string,
    drawWidth: number,
    drawOpacity: number
  ) => {
    const isZeroLength = Math.abs(x1 - x0) < 0.5 && Math.abs(y1 - y0) < 0.5;
    if (isZeroLength) {
      return;
    }

    activeCtx.save();
    activeCtx.lineWidth = drawWidth;
    activeCtx.lineCap = 'round';
    activeCtx.lineJoin = 'round';
    activeCtx.globalAlpha = drawOpacity;

    if (drawTool === 'eraser') {
      activeCtx.strokeStyle = '#ffffff';
      activeCtx.fillStyle = '#ffffff';
    } else {
      activeCtx.strokeStyle = drawColor;
      activeCtx.fillStyle = drawColor;
    }

    activeCtx.beginPath();

    if (drawTool === 'line') {
      activeCtx.moveTo(x0, y0);
      activeCtx.lineTo(x1, y1);
      activeCtx.stroke();
    } else if (drawTool === 'strokeRect') {
      activeCtx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    } else if (drawTool === 'fillRect') {
      activeCtx.fillRect(x0, y0, x1 - x0, y1 - y0);
    } else if (drawTool === 'strokeCircle') {
      const centerX = (x0 + x1) / 2;
      const centerY = (y0 + y1) / 2;
      const radiusX = Math.abs(x1 - x0) / 2;
      const radiusY = Math.abs(y1 - y0) / 2;
      activeCtx.ellipse(centerX, centerY, Math.max(0.1, radiusX), Math.max(0.1, radiusY), 0, 0, Math.PI * 2);
      activeCtx.stroke();
    } else if (drawTool === 'fillCircle') {
      const centerX = (x0 + x1) / 2;
      const centerY = (y0 + y1) / 2;
      const radiusX = Math.abs(x1 - x0) / 2;
      const radiusY = Math.abs(y1 - y0) / 2;
      activeCtx.ellipse(centerX, centerY, Math.max(0.1, radiusX), Math.max(0.1, radiusY), 0, 0, Math.PI * 2);
      activeCtx.fill();
    }

    activeCtx.restore();
  };

  // --- Handlers & Commands Replays ---

  const executeResetState = () => {
    console.log("[DrawingCanvasCore] Hard-resetting drawing state...");
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (ctx && tempCtx) {
      // Clear visual layers
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
    }

    // Reset local/remote paths & sessions
    isDrawingRef.current = false;
    currentPathRef.current = [];
    activeSessionsRef.current = {};
    moveBatchRef.current = [];

    // Clear throttle timeout and bucket timeout
    if (throttleTimeoutRef.current) {
      clearTimeout(throttleTimeoutRef.current);
      throttleTimeoutRef.current = null;
    }
    if (bucketTimeoutRef.current) {
      clearTimeout(bucketTimeoutRef.current);
      bucketTimeoutRef.current = null;
    }
    preventBucketRef.current = false;

    // Reinitialize Undo / Redo stacks
    bufferedSyncRef.current = null;
    localCommandsRef.current = [];
    localRedoStackRef.current = [];
    prevCommandsCountRef.current = -1;

    if (ctx && tempCtx) {
      saveSnapshot(); 
    }

    // Callback to update Parent Component history buttons
    syncHistoryButtons();
  };

  const executeClear = (emit: boolean = true) => {
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (!ctx || !tempCtx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);

    if (emit) {
      emitDrawCommand('draw_clear', {});
    }
    saveSnapshot();
  };

  const syncHistoryButtons = () => {
    const list = localCommandsRef.current;
    const canUndo = list.length > 0 && localRedoStackRef.current.length === 0;
    const canRedo = localRedoStackRef.current.length > 0;
    const index = canUndo ? 1 : 0;
    const length = index + (canRedo ? 1 : 0) + 1;
    onHistoryStateChange?.(index, length);
  };

  const executeUndo = (emit: boolean = true) => {
    const list = localCommandsRef.current;
    const canUndo = list.length > 0 && localRedoStackRef.current.length === 0;
    if (!canUndo) return;

    const removed = list.pop();
    if (removed) {
      localRedoStackRef.current = [removed];
    }
    applySyncedHistory(list);

    syncHistoryButtons();

    if (emit) {
      emitDrawCommand('draw_undo', {});
    }
  };

  const executeRedo = (emit: boolean = true) => {
    const canRedo = localRedoStackRef.current.length > 0;
    if (!canRedo) return;

    const commandsToRestore = localRedoStackRef.current.pop();
    if (commandsToRestore) {
      if (Array.isArray(commandsToRestore)) {
        localCommandsRef.current.push(...commandsToRestore);
      } else {
        localCommandsRef.current.push(commandsToRestore);
      }
      applySyncedHistory(localCommandsRef.current);
    }

    syncHistoryButtons();

    if (emit) {
      emitDrawCommand('draw_redo', {});
    }
  };

  // Replay of full history from reconnect/new joiner sync event
  const applySyncedHistory = (commands: any[]) => {
    try {
      const ctx = ctxRef.current;
      const tempCtx = tempCtxRef.current;
      if (!ctx || !tempCtx) return;

      console.log("[DrawingCanvasCore] Instantly rebuilding room drawing history...", commands.length);

      // Initial clear
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);

      // Reset history stacks
      localCommandsRef.current = [...commands];
      prevCommandsCountRef.current = -1;
      saveSnapshot(); // Base empty state in history stack

      // Enable replaying flag to prevent intermediate image generation snapshots inside the loops
      isReplayingRef.current = true;

      const replayPaths: Record<string, { x: number; y: number }[]> = {};
      const replaySessions: Record<string, { tool: ToolType; color: string; width: number; opacity: number }> = {};

      commands.forEach((cmdObj) => {
        try {
          const decoded = decodeBinaryDrawMessage(cmdObj.data);
          if (!decoded) return;
          const { event, data } = decoded;
          if (!data) return;

          const instId = data.instanceId || 'default';
          const cmdTool = data.tool || 'pencil';
          const cmdColor = data.color || '#000000';
          const cmdWidth = data.width || 5;
          const cmdOpacity = data.opacity !== undefined ? data.opacity : 1;

          if (!replayPaths[instId]) {
            replayPaths[instId] = [];
          }
          const path = replayPaths[instId];

          if (event === 'draw_stroke') {
            const isShape = cmdTool !== 'pencil' && cmdTool !== 'eraser';
            const scaledPoints = (data.points || []).map((pt: any) => ({
              x: pt.x * LOGICAL_WIDTH,
              y: pt.y * LOGICAL_HEIGHT
            }));
            if (scaledPoints.length > 0) {
              if (isShape && scaledPoints.length >= 2) {
                const startPt = scaledPoints[0];
                const lastPt = scaledPoints[scaledPoints.length - 1];
                drawShape(ctx, startPt.x, startPt.y, lastPt.x, lastPt.y, cmdTool, cmdColor, cmdWidth, cmdOpacity);
              } else {
                drawEntirePath(ctx, scaledPoints, cmdTool, cmdColor, cmdWidth, cmdOpacity);
              }
            }
            saveSnapshot();
          } else if (event === 'draw_start') {
            replaySessions[instId] = {
              tool: cmdTool,
              color: cmdColor,
              width: cmdWidth,
              opacity: cmdOpacity
            };
            const rx = data.x * LOGICAL_WIDTH;
            const ry = data.y * LOGICAL_HEIGHT;
            path.length = 0;
            path.push({ x: rx, y: ry });
          } else if (event === 'draw_move') {
            const handleMovePoint = (mx: number, my: number) => {
              path.push({ x: mx, y: my });
            };

            if (data.moves && Array.isArray(data.moves)) {
              data.moves.forEach((m: any) => {
                handleMovePoint(m.x * LOGICAL_WIDTH, m.y * LOGICAL_HEIGHT);
              });
            } else if (data.x !== undefined && data.y !== undefined) {
              handleMovePoint(data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT);
            }
          } else if (event === 'draw_end') {
            const session = replaySessions[instId] || {
              tool: 'pencil',
              color: '#000000',
              width: 5,
              opacity: 1
            };
            const isShape = session.tool !== 'pencil' && session.tool !== 'eraser';
            if (!data.isCancelled && path.length > 0 && !isShape) {
              drawEntirePath(ctx, path, session.tool, session.color, session.width, session.opacity);
            }

            if (!data.isCancelled && isShape && data.startX !== undefined && data.startY !== undefined) {
              const sX = data.startX * LOGICAL_WIDTH;
              const sY = data.startY * LOGICAL_HEIGHT;
              const eX = (data.x !== undefined ? data.x : (data.endX !== undefined ? data.endX : 0)) * LOGICAL_WIDTH;
              const eY = (data.y !== undefined ? data.y : (data.endY !== undefined ? data.endY : 0)) * LOGICAL_HEIGHT;
              drawShape(ctx, sX, sY, eX, eY, session.tool, session.color, session.width, session.opacity);
            }
            path.length = 0;
            delete replaySessions[instId];
            if (!data.isCancelled) {
              saveSnapshot(); // Save snapshot naturally (bypassed during replay)
            }
          } else if (event === 'draw_cancel') {
            path.length = 0;
            delete replaySessions[instId];
          } else if (event === 'draw_clear') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
            saveSnapshot(); // Bypassed during replay
          } else if (event === 'draw_action') {
            if (cmdTool === 'bucket' && data.x !== undefined && data.y !== undefined) {
              floodFill(ctx, data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT, cmdColor, cmdOpacity);
              saveSnapshot(); // Bypassed during replay
            }
          } else if (event === 'draw_undo') {
            executeUndo(false);
          } else if (event === 'draw_redo') {
            executeRedo(false);
          }
        } catch (itemErr) {
          console.error("[DrawingCanvasCore] Ref using error under sync command loop: ", itemErr);
        }
      });

      // Render any leftover paths (e.g. drawer disconnected mid-stroke)
      Object.keys(replaySessions).forEach((instId) => {
        try {
          const session = replaySessions[instId];
          const path = replayPaths[instId];
          if (session && path && path.length > 0) {
            const isShape = session.tool !== 'pencil' && session.tool !== 'eraser';
            if (isShape) {
              const startPt = path[0];
              const lastPt = path[path.length - 1];
              drawShape(ctx, startPt.x, startPt.y, lastPt.x, lastPt.y, session.tool, session.color, session.width, session.opacity);
            } else {
              drawEntirePath(ctx, path, session.tool, session.color, session.width, session.opacity);
            }
          }
        } catch (itemErr) {
          console.error("[DrawingCanvasCore] Leftover stroke parsing error: ", itemErr);
        }
      });

      // Clean up local temp active sessions cache to clear residual lines
      activeSessionsRef.current = {};
    } catch (totalSyncErr) {
      console.error("[DrawingCanvasCore] Failed to reconstruct whole history accurately: ", totalSyncErr);
    } finally {
      // Deactivate replaying and save the final integrated snapshot
      isReplayingRef.current = false;
      saveSnapshot();
      syncHistoryButtons();
    }
  };

  // --- Real-time Socket Event Receivers ---
  useEffect(() => {
    if (!socket) return;

    const onDrawBinary = (raw: any) => {
      const decoded = decodeBinaryDrawMessage(raw);
      if (!decoded) return;
      const { event, data } = decoded;
      if (!data || data.instanceId === instanceId) return;

      const remoteTool = data.tool || 'pencil';
      const remoteColor = data.color || '#000000';
      const remoteWidth = data.width || 5;
      const remoteOpacity = data.opacity !== undefined ? data.opacity : 1;

      const ctx = ctxRef.current;
      const tempCtx = tempCtxRef.current;
      if (!ctx || !tempCtx) return;

      if (event === 'draw_stroke') {
        const isShape = remoteTool !== 'pencil' && remoteTool !== 'eraser';
        const scaledPoints = (data.points || []).map((pt: any) => ({
          x: pt.x * LOGICAL_WIDTH,
          y: pt.y * LOGICAL_HEIGHT
        }));
        if (scaledPoints.length > 0) {
          if (isShape && scaledPoints.length >= 2) {
            const startPt = scaledPoints[0];
            const lastPt = scaledPoints[scaledPoints.length - 1];
            drawShape(ctx, startPt.x, startPt.y, lastPt.x, lastPt.y, remoteTool, remoteColor, remoteWidth, remoteOpacity);
          } else {
            drawEntirePath(ctx, scaledPoints, remoteTool, remoteColor, remoteWidth, remoteOpacity);
          }
          // Solidify the line and wipe the temporary transient trace to prevent artifacts
          delete activeSessionsRef.current[data.instanceId];
          redrawTempLayer();

          prevCommandsCountRef.current = localCommandsRef.current.length;
          localCommandsRef.current.push({ event: 'draw_binary', data: raw });
          localRedoStackRef.current = [];
          saveSnapshot();
          syncHistoryButtons();
        }
      } else if (event === 'draw_start') {
        const rx = data.x * LOGICAL_WIDTH;
        const ry = data.y * LOGICAL_HEIGHT;
        activeSessionsRef.current[data.instanceId] = {
          tool: remoteTool,
          color: remoteColor,
          width: remoteWidth,
          opacity: remoteOpacity,
          path: [{ x: rx, y: ry }]
        };
        if ((remoteTool === 'pencil' || remoteTool === 'eraser') && remoteOpacity === 1.0) {
          ctx.save();
          ctx.fillStyle = remoteTool === 'eraser' ? '#ffffff' : remoteColor;
          ctx.beginPath();
          ctx.arc(rx, ry, remoteWidth / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          redrawTempLayer();
        }
      } else if (event === 'draw_move') {
        const session = activeSessionsRef.current[data.instanceId];
        if (session) {
          const isSolidPencilEraser = (session.tool === 'pencil' || session.tool === 'eraser') && session.opacity === 1.0;
          const handleMovePoint = (mx: number, my: number) => {
            const prevPt = session.path[session.path.length - 1];
            session.path.push({ x: mx, y: my });
            if (isSolidPencilEraser && prevPt) {
              drawSegment(ctx, prevPt, { x: mx, y: my }, session.tool, session.color, session.width, session.opacity);
            }
          };

          if (data.moves && Array.isArray(data.moves)) {
            data.moves.forEach((m: any) => {
              handleMovePoint(m.x * LOGICAL_WIDTH, m.y * LOGICAL_HEIGHT);
            });
          } else if (data.x !== undefined && data.y !== undefined) {
            handleMovePoint(data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT);
          }
          if (!isSolidPencilEraser) {
            redrawTempLayer();
          }
        }
      } else if (event === 'draw_end') {
        const session = activeSessionsRef.current[data.instanceId];
        if (session) {
          const isShape = session.tool !== 'pencil' && session.tool !== 'eraser';
          const isSolidPencilEraser = !isShape && session.opacity === 1.0;
          if (!data.isCancelled && session.path.length > 0 && !isShape && !isSolidPencilEraser) {
            drawEntirePath(ctx, session.path, session.tool, session.color, session.width, session.opacity);
          }

          if (!data.isCancelled && isShape && data.startX !== undefined && data.startY !== undefined) {
            const sX = data.startX * LOGICAL_WIDTH;
            const sY = data.startY * LOGICAL_HEIGHT;
            const eX = (data.x !== undefined ? data.x : (data.endX !== undefined ? data.endX : 0)) * LOGICAL_WIDTH;
            const eY = (data.y !== undefined ? data.y : (data.endY !== undefined ? data.endY : 0)) * LOGICAL_HEIGHT;
            drawShape(ctx, sX, sY, eX, eY, session.tool, session.color, session.width, session.opacity);
          }
          delete activeSessionsRef.current[data.instanceId];
        }
        redrawTempLayer();
        if (!data.isCancelled) {
          saveSnapshot();
        }
      } else if (event === 'draw_cancel') {
        delete activeSessionsRef.current[data.instanceId];
        redrawTempLayer();
      } else if (event === 'draw_clear') {
        prevCommandsCountRef.current = localCommandsRef.current.length;
        localCommandsRef.current.push({ event: 'draw_binary', data: raw });
        localRedoStackRef.current = [];
        executeClear(false);
        syncHistoryButtons();
      } else if (event === 'draw_action') {
        if (remoteTool === 'bucket' && data.x !== undefined && data.y !== undefined) {
          floodFill(ctx, data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT, remoteColor, remoteOpacity);
          prevCommandsCountRef.current = localCommandsRef.current.length;
          localCommandsRef.current.push({ event: 'draw_binary', data: raw });
          localRedoStackRef.current = [];
          saveSnapshot();
          syncHistoryButtons();
        }
      } else if (event === 'draw_undo') {
        executeUndo(false);
      } else if (event === 'draw_redo') {
        executeRedo(false);
      }
    };

    const processIncomingHistorySync = (commands: any[]) => {
      try {
        const ctx = ctxRef.current;
        const tempCtx = tempCtxRef.current;
        if (!ctx || !tempCtx) return;

        console.log("[DrawingCanvasCore] Starting Deferred Queue & Forced Multi-Snapshots chunking...", commands.length);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);

        localCommandsRef.current = [...commands];
        prevCommandsCountRef.current = -1;

        isReplayingRef.current = true;

        const replayPaths: Record<string, { x: number; y: number }[]> = {};
        const replaySessions: Record<string, { tool: ToolType; color: string; width: number; opacity: number }> = {};

        let currentIndex = 0;
        const CHUNK_SIZE = 50; 

        const processChunk = () => {
          const endIndex = Math.min(currentIndex + CHUNK_SIZE, commands.length);
          
          for (let i = currentIndex; i < endIndex; i++) {
            const cmdObj = commands[i];
            try {
              const decoded = decodeBinaryDrawMessage(cmdObj.data);
              if (!decoded) continue;
              const { event, data } = decoded;
              if (!data) continue;

              const instId = data.instanceId || 'default';
              const cmdTool = data.tool || 'pencil';
              const cmdColor = data.color || '#000000';
              const cmdWidth = data.width || 5;
              const cmdOpacity = data.opacity !== undefined ? data.opacity : 1;

              if (!replayPaths[instId]) {
                replayPaths[instId] = [];
              }
              const path = replayPaths[instId];

              if (event === 'draw_stroke') {
                const isShape = cmdTool !== 'pencil' && cmdTool !== 'eraser';
                const scaledPoints = (data.points || []).map((pt: any) => ({
                  x: pt.x * LOGICAL_WIDTH,
                  y: pt.y * LOGICAL_HEIGHT
                }));
                if (scaledPoints.length > 0) {
                  if (isShape && scaledPoints.length >= 2) {
                    const startPt = scaledPoints[0];
                    const lastPt = scaledPoints[scaledPoints.length - 1];
                    drawShape(ctx, startPt.x, startPt.y, lastPt.x, lastPt.y, cmdTool, cmdColor, cmdWidth, cmdOpacity);
                  } else {
                    drawEntirePath(ctx, scaledPoints, cmdTool, cmdColor, cmdWidth, cmdOpacity);
                  }
                }
                // Memory cleanup
                scaledPoints.length = 0; 
              } else if (event === 'draw_start') {
                replaySessions[instId] = { tool: cmdTool, color: cmdColor, width: cmdWidth, opacity: cmdOpacity };
                const rx = data.x * LOGICAL_WIDTH;
                const ry = data.y * LOGICAL_HEIGHT;
                path.length = 0;
                path.push({ x: rx, y: ry });
              } else if (event === 'draw_move') {
                const handleMovePoint = (mx: number, my: number) => {
                  path.push({ x: mx, y: my });
                };
                if (data.moves && Array.isArray(data.moves)) {
                  data.moves.forEach((m: any) => {
                    handleMovePoint(m.x * LOGICAL_WIDTH, m.y * LOGICAL_HEIGHT);
                  });
                } else if (data.x !== undefined && data.y !== undefined) {
                  handleMovePoint(data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT);
                }
              } else if (event === 'draw_end') {
                const session = replaySessions[instId] || { tool: 'pencil', color: '#000000', width: 5, opacity: 1 };
                const isShape = session.tool !== 'pencil' && session.tool !== 'eraser';
                if (!data.isCancelled && path.length > 0 && !isShape) {
                  drawEntirePath(ctx, path, session.tool, session.color, session.width, session.opacity);
                }
                if (!data.isCancelled && isShape && data.startX !== undefined && data.startY !== undefined) {
                  const sX = data.startX * LOGICAL_WIDTH;
                  const sY = data.startY * LOGICAL_HEIGHT;
                  const eX = (data.x !== undefined ? data.x : (data.endX !== undefined ? data.endX : 0)) * LOGICAL_WIDTH;
                  const eY = (data.y !== undefined ? data.y : (data.endY !== undefined ? data.endY : 0)) * LOGICAL_HEIGHT;
                  drawShape(ctx, sX, sY, eX, eY, session.tool, session.color, session.width, session.opacity);
                }
                path.length = 0;
                delete replaySessions[instId];
              } else if (event === 'draw_cancel') {
                path.length = 0;
                delete replaySessions[instId];
              } else if (event === 'draw_clear') {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
              } else if (event === 'draw_action') {
                if (cmdTool === 'bucket' && data.x !== undefined && data.y !== undefined) {
                  floodFill(ctx, data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT, cmdColor, cmdOpacity);
                }
              }
            } catch (itemErr) {
              console.error("[DrawingCanvasCore] Error decoding step in sync: ", itemErr);
            }
          }

          currentIndex = endIndex;

          if (currentIndex < commands.length) {
            requestAnimationFrame(processChunk);
          } else {
            Object.keys(replaySessions).forEach((instId) => {
              try {
                const session = replaySessions[instId];
                const path = replayPaths[instId];
                if (session && path && path.length > 0) {
                  const isShape = session.tool !== 'pencil' && session.tool !== 'eraser';
                  if (isShape) {
                    const startPt = path[0];
                    const lastPt = path[path.length - 1];
                    drawShape(ctx, startPt.x, startPt.y, lastPt.x, lastPt.y, session.tool, session.color, session.width, session.opacity);
                  } else {
                    drawEntirePath(ctx, path, session.tool, session.color, session.width, session.opacity);
                  }
                }
                if (path) path.length = 0;
              } catch (err) {}
            });

            activeSessionsRef.current = {};
            isReplayingRef.current = false;
            setIsSyncing(false);
            setHasSyncedOnce(true);
            if (syncTimeoutRef.current) {
              clearTimeout(syncTimeoutRef.current);
              syncTimeoutRef.current = null;
            }
            console.log("[DrawingCanvasCore] Deferred queue fully rendered.");
          }
        };

        requestAnimationFrame(processChunk);

      } catch (err) {
        console.error("[DrawingCanvasCore] Sync Chunk Error:", err);
        setIsSyncing(false);
      }
    };

    const onDrawHistorySync = (commands: any[]) => {
      console.log("[DrawingCanvasCore] Received draw_history_sync event, payload length:", commands?.length);
      
      const attemptSync = () => {
        if (!isCanvasResizeObserverReadyRef.current || !ctxRef.current || !tempCtxRef.current) {
          console.log("[DrawingCanvasCore] Canvas or ResizeObserver not ready. Deferring history sync (Pending Queue)...");
          setTimeout(attemptSync, 50);
          return;
        }
        processIncomingHistorySync(commands);
      };

      attemptSync();
    };

    const onDrawRedoSync = (commands: any[]) => {
      console.log("[DrawingCanvasCore] Received draw_redo_sync event, payload length:", commands?.length);
      localRedoStackRef.current = commands || [];
      syncHistoryButtons();
    };

    socket.on('draw_binary', onDrawBinary);
    socket.on('draw_history_sync', onDrawHistorySync);
    socket.on('draw_redo_sync', onDrawRedoSync);

    return () => {
      socket.off('draw_binary', onDrawBinary);
      socket.off('draw_history_sync', onDrawHistorySync);
      socket.off('draw_redo_sync', onDrawRedoSync);
    };
  }, [socket, instanceId]);

  const startSyncFlow = () => {
    const now = Date.now();
    if (now - lastSyncRequestTimeRef.current < 1000) {
      console.log("[DrawingCanvasCore] Suppressing duplicate sync request within 1000ms cooldown window.");
      return;
    }
    lastSyncRequestTimeRef.current = now;

    setIsSyncing(true);
    console.log("[DrawingCanvasCore] Activating loading state, requesting round sync...");

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(() => {
      console.log("[DrawingCanvasCore] Sync safety timeout reached (4s). Overriding loading screen.");
      setIsSyncing(false);
      setHasSyncedOnce(true);
    }, 4000);

    socket?.emit('request_round_sync');
  };

  // --- Network Connection Recovery Engine ---
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      console.log("[DrawingCanvasCore] System connection established. Loader active until drawing sync finishes.");
      setIsSyncing(true);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        console.log("[DrawingCanvasCore] Reconnect sync safety timeout reached. Overriding loading screen.");
        setIsSyncing(false);
        setHasSyncedOnce(true);
      }, 4000);
    };

    const handleDisconnect = () => {
      console.log("[DrawingCanvasCore] System connection lost.");
      setIsSyncing(true);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    
    // Initial mount safety loader
    if (socket.connected && !hasSyncedOnce) {
      setIsSyncing(true);
      if (!syncTimeoutRef.current) {
        syncTimeoutRef.current = setTimeout(() => {
          console.log("[DrawingCanvasCore] Initial sync safety timeout. Overriding loading screen.");
          setIsSyncing(false);
          setHasSyncedOnce(true);
        }, 4000);
      }
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };
  }, [socket, hasSyncedOnce, readOnly]);

  // Automated Clean Reset State on turn / drawer change
  const previousStateRef = useRef({ currentDrawerId, status });
  useEffect(() => {
    if (previousStateRef.current.currentDrawerId !== currentDrawerId || previousStateRef.current.status !== status) {
      if (hasSyncedOnce && !isSyncing) {
        console.log(`[DrawingCanvasCore] Game state changed. Drawer: ${currentDrawerId}, Status: ${status}. Resetting canvas.`);
        executeResetState();
      }
    }
    previousStateRef.current = { currentDrawerId, status };
  }, [currentDrawerId, status, hasSyncedOnce, isSyncing]);

  // --- HTML Canvas Initialization ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    if (!canvas || !tempCanvas) return;

    canvas.width = LOGICAL_WIDTH * DPR;
    canvas.height = LOGICAL_HEIGHT * DPR;
    tempCanvas.width = LOGICAL_WIDTH * DPR;
    tempCanvas.height = LOGICAL_HEIGHT * DPR;

    const ctx = canvas.getContext('2d', { alpha: false });
    const tempCtx = tempCanvas.getContext('2d');

    if (ctx && tempCtx) {
      ctx.scale(DPR, DPR);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctxRef.current = ctx;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

      tempCtx.scale(DPR, DPR);
      tempCtx.lineCap = 'round';
      tempCtx.lineJoin = 'round';
      tempCtxRef.current = tempCtx;

      // WARM-UP Canvas rendering engine to prevent first-stroke stutter on weak devices
      // This forces Skia / GPU to compile shaders immediately rather than when user draws.
      tempCtx.beginPath();
      tempCtx.moveTo(0,0);
      tempCtx.lineTo(0.1, 0.1);
      tempCtx.quadraticCurveTo(0.2, 0.2, 0.3, 0.3);
      tempCtx.strokeStyle = 'rgba(0,0,0,0.01)';
      tempCtx.stroke();
      tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);

      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.lineTo(0.1, 0.1);
      ctx.quadraticCurveTo(0.2, 0.2, 0.3, 0.3);
      ctx.strokeStyle = 'rgba(0,0,0,0.01)';
      ctx.stroke();
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

      saveSnapshot();

      if (bufferedSyncRef.current) {
        applySyncedHistory(bufferedSyncRef.current);
        bufferedSyncRef.current = null;
      }
    }
  }, []);

  // --- Drawing Pointer Events Hooks ---

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (propsRef.current.readOnly) return;
    if (isDrawingRef.current) return;
    if (isZoomPinchingRef.current || activeTouchCountRef.current >= 2) return;
    
    // STRICT GUARD: Prevent drawing before Canvas layout and ResizeObserver are fully ready.
    // If the canvas width/height are 0 during early mount, getLogicalCoords produces Infinity,
    // which causes catastrophic GPU lag when passed to ctx.stroke().
    if (!isCanvasResizeObserverReadyRef.current) return;
    
    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (!canvas || !tempCanvas || !ctx || !tempCtx) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const activeTool = propsRef.current.tool;
    const activeColor = propsRef.current.color;
    const activeWidth = propsRef.current.thickness;
    const activeOpacity = propsRef.current.opacity;

    const { x, y } = getLogicalCoords(e.clientX, e.clientY, canvas);
    startXRef.current = x;
    startYRef.current = y;

    if (activeTool === 'bucket') {
      const runBucket = () => {
        floodFill(ctx, x, y, activeColor, activeOpacity);
        emitDrawCommand('draw_action', {
          tool: 'bucket',
          color: activeColor,
          opacity: activeOpacity,
          x: x / LOGICAL_WIDTH,
          y: y / LOGICAL_HEIGHT
        });
        saveSnapshot();
      };

      if (e.pointerType === 'touch') {
        preventBucketRef.current = false;
        if (bucketTimeoutRef.current) clearTimeout(bucketTimeoutRef.current);
        bucketTimeoutRef.current = setTimeout(() => {
          if (!preventBucketRef.current && activeTouchCountRef.current < 2 && !isZoomPinchingRef.current) {
            runBucket();
          }
        }, 70);
      } else {
        runBucket();
      }
      return;
    }

    isDrawingRef.current = true;

    if (activeTool === 'pipette') {
      const offscreen = document.createElement('canvas');
      offscreen.width = canvas.width;
      offscreen.height = canvas.height;
      const oCtx = offscreen.getContext('2d', { willReadFrequently: true });
      if (oCtx) {
        oCtx.drawImage(canvas, 0, 0);
        const rx = Math.floor(x * DPR);
        const ry = Math.floor(y * DPR);
        const pixel = oCtx.getImageData(rx, ry, 1, 1).data;
        const hex = "#" + ("000000" + ((pixel[0] << 16) | (pixel[1] << 8) | pixel[2]).toString(16)).slice(-6);
        onPipetteColorPicked?.(hex);
      }
      isDrawingRef.current = false;
      
      return;
    }

    currentPathRef.current = [{ x, y }];
    emitDrawCommand('draw_start', {
      tool: activeTool,
      color: activeColor,
      width: activeWidth,
      opacity: activeOpacity,
      x: x / LOGICAL_WIDTH,
      y: y / LOGICAL_HEIGHT
    });

    if (activeTool === 'pencil' || activeTool === 'eraser') {
      if (activeOpacity === 1.0) {
        ctx.save();
        ctx.fillStyle = activeTool === 'eraser' ? '#ffffff' : activeColor;
        ctx.beginPath();
        ctx.arc(x, y, activeWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        redrawTempLayer();
      }
    } else {
      tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
      drawShape(tempCtx, x, y, x, y, activeTool, activeColor, activeWidth, activeOpacity);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;

    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (!canvas || !tempCanvas || !ctx || !tempCtx) return;

    if (isZoomPinchingRef.current || activeTouchCountRef.current >= 2) {
      isDrawingRef.current = false;
      
      tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
      moveBatchRef.current = [];
      emitDrawCommand('draw_end', {
        tool: propsRef.current.tool,
        color: propsRef.current.color,
        width: propsRef.current.thickness,
        opacity: propsRef.current.opacity,
        isShape: false,
        isCancelled: true
      });
      emitDrawCommand('draw_cancel', {});
      return;
    }

    const { x, y } = getLogicalCoords(e.clientX, e.clientY, canvas);
    const activeTool = propsRef.current.tool;
    const activeColor = propsRef.current.color;
    const activeWidth = propsRef.current.thickness;
    const activeOpacity = propsRef.current.opacity;

    if (activeTool === 'pencil' || activeTool === 'eraser') {
      // Maintain exact 1 decimal place format to optimize performance
      const roundedX = Math.round(x * 10) / 10;
      const roundedY = Math.round(y * 10) / 10;

      const path = currentPathRef.current;
      
      // Compute Dynamic Distance Threshold to protect socket bandwidth and match user resolution
      const brushSize = activeWidth;
      const currentThreshold = brushSize < 6 ? 0.5 : (brushSize > 10 ? 3.5 : 1.5);

      // Point Compression and Lightweight Micro-Linear Interpolation (Lerp) for fast movements
      if (path.length > 0) {
        const lastPt = path[path.length - 1];
        const dist = Math.hypot(roundedX - lastPt.x, roundedY - lastPt.y);
        
        if (dist < currentThreshold) {
          return;
        }

        // Lightweight interpolation if distance is greater than 8 pixels to smooth fast polygonal arcs
        if (dist > 8) {
          const stepSize = 6;
          const stepsCount = Math.floor(dist / stepSize);
          if (stepsCount > 1) {
            for (let i = 1; i < stepsCount; i++) {
              const t = i / stepsCount;
              const lerpX = Math.round((lastPt.x + (roundedX - lastPt.x) * t) * 10) / 10;
              const lerpY = Math.round((lastPt.y + (roundedY - lastPt.y) * t) * 10) / 10;
              
              const currentPrev = path[path.length - 1];
              path.push({ x: lerpX, y: lerpY });
              moveBatchRef.current.push({ x: lerpX / LOGICAL_WIDTH, y: lerpY / LOGICAL_HEIGHT });
              
              if (activeOpacity === 1.0 && currentPrev) {
                drawSegment(ctx, currentPrev, { x: lerpX, y: lerpY }, activeTool, activeColor, activeWidth, activeOpacity);
              }
            }
          }
        }
      }

      const lastPrev = path[path.length - 1];
      path.push({ x: roundedX, y: roundedY });
      
      if (activeOpacity === 1.0) {
        if (lastPrev) {
          drawSegment(ctx, lastPrev, { x: roundedX, y: roundedY }, activeTool, activeColor, activeWidth, activeOpacity);
        }
      } else {
        redrawTempLayer();
      }

      const normX = roundedX / LOGICAL_WIDTH;
      const normY = roundedY / LOGICAL_HEIGHT;

      moveBatchRef.current.push({ x: normX, y: normY });

      const intervalMs = IS_LOW_END ? 40 : (PERF_TIER === 2 ? 24 : 16);

      if (!throttleTimeoutRef.current) {
        throttleTimeoutRef.current = setTimeout(() => {
          if (moveBatchRef.current.length > 0) {
            emitDrawCommand('draw_move', {
              tool: activeTool,
              color: activeColor,
              width: activeWidth,
              opacity: activeOpacity,
              moves: moveBatchRef.current
            });
            moveBatchRef.current = [];
          }
          throttleTimeoutRef.current = null;
        }, intervalMs);
      }
    } else {
      tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
      drawShape(tempCtx, startXRef.current, startYRef.current, x, y, activeTool, activeColor, activeWidth, activeOpacity);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);

    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (!canvas || !tempCanvas || !ctx || !tempCtx) return;

    if (!isDrawingRef.current) return;

    const { x, y } = getLogicalCoords(e.clientX, e.clientY, canvas);
    const activeTool = propsRef.current.tool;
    const activeColor = propsRef.current.color;
    const activeWidth = propsRef.current.thickness;
    const activeOpacity = propsRef.current.opacity;

    isDrawingRef.current = false;
    

    if (throttleTimeoutRef.current) {
      clearTimeout(throttleTimeoutRef.current);
      throttleTimeoutRef.current = null;
    }

    if (activeTool === 'pencil' || activeTool === 'eraser') {
      if (moveBatchRef.current.length > 0) {
        emitDrawCommand('draw_move', {
          tool: activeTool,
          color: activeColor,
          width: activeWidth,
          opacity: activeOpacity,
          moves: moveBatchRef.current
        });
        moveBatchRef.current = [];
      }

      tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);

      if (currentPathRef.current.length > 0) {
        if (activeOpacity !== 1.0) {
          drawEntirePath(ctx, currentPathRef.current, activeTool, activeColor, activeWidth, activeOpacity);
        }

        // Send complete stroke object for precise restoration and history tracking
        const normalizedPoints = currentPathRef.current.map(pt => ({
          x: pt.x / LOGICAL_WIDTH,
          y: pt.y / LOGICAL_HEIGHT
        }));
        emitDrawCommand('draw_stroke', {
          tool: activeTool,
          color: activeColor,
          width: activeWidth,
          opacity: activeOpacity,
          points: normalizedPoints
        });
      }

      emitDrawCommand('draw_end', {
        tool: activeTool,
        color: activeColor,
        width: activeWidth,
        opacity: activeOpacity,
        isShape: false
      });
    } else {
      tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
      drawShape(ctx, startXRef.current, startYRef.current, x, y, activeTool, activeColor, activeWidth, activeOpacity);

      // Send complete stroke object for shapes (straight lines, rectangles, circles, etc.)
      const normalizedPoints = [
        { x: startXRef.current / LOGICAL_WIDTH, y: startYRef.current / LOGICAL_HEIGHT },
        { x: x / LOGICAL_WIDTH, y: y / LOGICAL_HEIGHT }
      ];
      emitDrawCommand('draw_stroke', {
        tool: activeTool,
        color: activeColor,
        width: activeWidth,
        opacity: activeOpacity,
        points: normalizedPoints
      });

      emitDrawCommand('draw_end', {
        tool: activeTool,
        color: activeColor,
        width: activeWidth,
        opacity: activeOpacity,
        isShape: true,
        startX: startXRef.current / LOGICAL_WIDTH,
        startY: startYRef.current / LOGICAL_HEIGHT,
        endX: x / LOGICAL_WIDTH,
        endY: y / LOGICAL_HEIGHT,
        x: x / LOGICAL_WIDTH,
        y: y / LOGICAL_HEIGHT
      });
    }

    currentPathRef.current = [];
    saveSnapshot();
  };

  return (
    <div
      ref={containerRef}
      role="presentation"
      className="absolute inset-0 select-none overflow-hidden touch-none bg-gray-300"
      style={{
        width: '100%',
        height: '100%',
      }}
    >
      <div
        ref={transformWrapperRef}
        className="absolute left-0 top-0 transform-gpu bg-white overflow-hidden select-none touch-none"
        style={readOnly ? {
          width: '100%',
          height: '100%',
          transformOrigin: '0 0',
          willChange: 'transform'
        } : {
          width: LOGICAL_WIDTH,
          height: LOGICAL_HEIGHT,
          transformOrigin: '0 0',
          willChange: 'transform'
        }}
      >
        <canvas
          id="drawing-board-layer-primary"
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full block bg-white touch-none ${readOnly ? 'object-contain pointer-events-none' : 'pointer-events-auto cursor-crosshair'}`}
          style={{
            zIndex: 10,
            imageRendering: 'auto'
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <canvas
          id="drawing-board-layer-shapes-preview"
          ref={tempCanvasRef}
          className={`absolute inset-0 w-full h-full block pointer-events-none touch-none bg-transparent ${readOnly ? 'object-contain' : ''}`}
          style={{
            zIndex: 20
          }}
        />
      </div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {(isSyncing || !isConnected) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className={`fixed inset-0 flex flex-col items-center justify-center z-[999999] select-none touch-none ${
                hasSyncedOnce
                  ? (readOnly ? "bg-transparent" : "bg-[#0c061d]/85 cursor-not-allowed")
                  : "bg-[#0c061d] cursor-not-allowed"
              }`}
              style={{ pointerEvents: hasSyncedOnce && readOnly ? 'none' : 'auto' }}
            >
              <div className="flex flex-col items-center">
                <div className="relative w-14 h-14">
                  <div className="absolute inset-0 rounded-full border-4 border-[#1AD2FF]/20" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-[#1AD2FF] animate-spin" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
});

DrawingCanvasCore.displayName = 'DrawingCanvasCore';

export default DrawingCanvasCore;

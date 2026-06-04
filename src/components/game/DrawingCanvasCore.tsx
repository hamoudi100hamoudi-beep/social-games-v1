import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useImperativeHandle,
  forwardRef
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSocket } from '../SocketProvider';
import { ToolType } from '../../types/draw';
import {
  compressPayload,
  decompressPayload,
  encodeBinaryDrawMessage,
  decodeBinaryDrawMessage
} from '../../utils/drawBinaryHelper';

// --- Constants ---
const LOGICAL_WIDTH = 800;
const LOGICAL_HEIGHT = 600;

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
    status
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
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasSyncedOnce, setHasSyncedOnce] = useState(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Local drawing track refs
  const isDrawingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentPathRef = useRef<{ x: number; y: number }[]>([]);
  const remotePathRef = useRef<{ x: number; y: number }[]>([]);
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

  // Undo / Redo Snapshot Cache
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef(-1);

  // Buffering history syncing before ref ready
  const bufferedSyncRef = useRef<any[] | null>(null);

  // Layout scale tracking for responsive full viewport fitting
  const containerRef = useRef<HTMLDivElement>(null);
  const transformWrapperRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef({ scale: 1, x: 0, y: 0 });
  const [baseScale, setBaseScale] = useState(1);
  const hasInitializedTransform = useRef(false);

  // Dynamic references to read props values directly in listeners without re-binding
  const propsRef = useRef({ tool, color, thickness, opacity, readOnly });
  useEffect(() => {
    propsRef.current = { tool, color, thickness, opacity, readOnly };
  }, [tool, color, thickness, opacity, readOnly]);

  const applyTransform = (overrideBaseScale?: number) => {
    if (transformWrapperRef.current) {
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
        
        let targetScale;
        if (readOnly) {
          targetScale = Math.min(width / LOGICAL_WIDTH, height / LOGICAL_HEIGHT);
        } else {
          targetScale = height / LOGICAL_HEIGHT;
        }
        
        setBaseScale(targetScale);
        
        if (!hasInitializedTransform.current || readOnly) {
          const canvasDisplayWidth = LOGICAL_WIDTH * targetScale;
          const canvasDisplayHeight = LOGICAL_HEIGHT * targetScale;
          const initialX = (width - canvasDisplayWidth) / 2;
          const initialY = (height - canvasDisplayHeight) / 2; 
          
          transformRef.current = { scale: 1, x: initialX, y: initialY };
          applyTransform(targetScale);
          if (!readOnly) hasInitializedTransform.current = true;
        }
      }
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, [readOnly]);

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
    }
  };

  // --- Snapshot Management ---
  const saveSnapshot = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    try {
      const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // If we made custom edits, dump obsolete redo points
      if (historyIndexRef.current < historyRef.current.length - 1) {
        historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
      }

      historyRef.current.push(snapshot);
      const MAX_HISTORY = 10;
      if (historyRef.current.length > MAX_HISTORY) {
        historyRef.current.shift();
      }

      historyIndexRef.current = historyRef.current.length - 1;
      onHistoryStateChange?.(historyIndexRef.current, historyRef.current.length);
    } catch (err) {
      console.error("[DrawingCanvasCore] Failed to save step VRAM snapshot:", err);
    }
  };

  // --- Logical Coordinate Conversion ---
  const getLogicalCoords = (clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * LOGICAL_WIDTH;
    const y = ((clientY - rect.top) / rect.height) * LOGICAL_HEIGHT;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  };

  // --- Dynamic Drawing Functions ---
  const drawLineSegment = (
    activeCtx: CanvasRenderingContext2D,
    x0: number, y0: number,
    x1: number, y1: number,
    drawTool: ToolType,
    drawColor: string,
    drawWidth: number,
    drawOpacity: number
  ) => {
    activeCtx.save();
    activeCtx.lineWidth = drawWidth;
    activeCtx.lineCap = 'round';
    activeCtx.lineJoin = 'round';
    activeCtx.globalAlpha = drawOpacity;

    if (drawTool === 'eraser') {
      activeCtx.strokeStyle = '#ffffff';
    } else {
      activeCtx.strokeStyle = drawColor;
    }

    activeCtx.beginPath();
    activeCtx.moveTo(x0, y0);
    activeCtx.lineTo(x1, y1);
    activeCtx.stroke();
    activeCtx.restore();
  };

  const drawSmoothSegment = (
    activeCtx: CanvasRenderingContext2D,
    x0: number, y0: number,     // Start midpoint
    cpX: number, cpY: number,   // Control point
    x1: number, y1: number,     // End midpoint
    drawTool: ToolType,
    drawColor: string,
    drawWidth: number,
    drawOpacity: number
  ) => {
    activeCtx.save();
    activeCtx.lineWidth = drawWidth;
    activeCtx.lineCap = 'round';
    activeCtx.lineJoin = 'round';
    activeCtx.globalAlpha = drawOpacity;

    if (drawTool === 'eraser') {
      activeCtx.strokeStyle = '#ffffff';
    } else {
      activeCtx.strokeStyle = drawColor;
    }

    activeCtx.beginPath();
    activeCtx.moveTo(x0, y0);
    activeCtx.quadraticCurveTo(cpX, cpY, x1, y1);
    activeCtx.stroke();
    activeCtx.restore();
  };

  const drawMicroDot = (
    activeCtx: CanvasRenderingContext2D,
    x: number, y: number,
    drawTool: ToolType,
    drawColor: string,
    drawWidth: number,
    drawOpacity: number
  ) => {
    activeCtx.save();
    activeCtx.lineWidth = drawWidth;
    activeCtx.lineCap = 'round';
    activeCtx.lineJoin = 'round';
    activeCtx.globalAlpha = drawOpacity;

    if (drawTool === 'eraser') {
      activeCtx.strokeStyle = '#ffffff';
    } else {
      activeCtx.strokeStyle = drawColor;
    }

    activeCtx.beginPath();
    activeCtx.moveTo(x, y);
    // 0.1 pixel micro-step ensures flawless anti-aliased circular points drawing without bloated dots distortion 
    activeCtx.lineTo(x + 0.1, y);
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
    } else if (path.length === 2) {
      activeCtx.beginPath();
      activeCtx.moveTo(path[0].x, path[0].y);
      activeCtx.lineTo(path[1].x, path[1].y);
      activeCtx.stroke();
    } else {
      activeCtx.beginPath();
      activeCtx.moveTo(path[0].x, path[0].y);
      const firstMidX = (path[0].x + path[1].x) / 2;
      const firstMidY = (path[0].y + path[1].y) / 2;
      activeCtx.lineTo(firstMidX, firstMidY);

      for (let i = 1; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i + 1];
        const midNextX = (p1.x + p2.x) / 2;
        const midNextY = (p1.y + p2.y) / 2;
        activeCtx.quadraticCurveTo(p1.x, p1.y, midNextX, midNextY);
      }

      activeCtx.lineTo(path[path.length - 1].x, path[path.length - 1].y);
      activeCtx.stroke();
    }

    activeCtx.restore();
  };

  const redrawTempLayer = () => {
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
        drawEntirePath(tempCtx, session.path, session.tool, session.color, session.width, session.opacity);
      }
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
      const radius = Math.hypot(x1 - x0, y1 - y0);
      activeCtx.arc(x0, y0, radius, 0, Math.PI * 2);
      activeCtx.stroke();
    } else if (drawTool === 'fillCircle') {
      const radius = Math.hypot(x1 - x0, y1 - y0);
      activeCtx.arc(x0, y0, radius, 0, Math.PI * 2);
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
    remotePathRef.current = [];
    activeSessionsRef.current = {};
    moveBatchRef.current = [];

    // Clear throttle timeout
    if (throttleTimeoutRef.current) {
      clearTimeout(throttleTimeoutRef.current);
      throttleTimeoutRef.current = null;
    }

    // Reinitialize Undo / Redo stacks
    historyRef.current = [];
    historyIndexRef.current = -1;
    bufferedSyncRef.current = null;

    if (ctx && tempCtx) {
      saveSnapshot(); 
    }

    // Callback to update Parent Component history buttons
    onHistoryStateChange?.(-1, 0);
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

  const executeUndo = (emit: boolean = true) => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const ctx = ctxRef.current;
      const snapshot = historyRef.current[historyIndexRef.current];
      if (ctx && snapshot) {
        ctx.putImageData(snapshot, 0, 0);
      }
      onHistoryStateChange?.(historyIndexRef.current, historyRef.current.length);

      if (emit) {
        emitDrawCommand('draw_undo', {});
      }
    }
  };

  const executeRedo = (emit: boolean = true) => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const ctx = ctxRef.current;
      const snapshot = historyRef.current[historyIndexRef.current];
      if (ctx && snapshot) {
        ctx.putImageData(snapshot, 0, 0);
      }
      onHistoryStateChange?.(historyIndexRef.current, historyRef.current.length);

      if (emit) {
        emitDrawCommand('draw_redo', {});
      }
    }
  };

  // Replay of full history from reconnect/new joiner sync event
  const applySyncedHistory = (commands: any[]) => {
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (!ctx || !tempCtx) return;

    console.log("[DrawingCanvasCore] Instantly rebuilding room drawing history...", commands.length);

    // Initial clear
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);

    // Reset history stacks
    historyRef.current = [];
    saveSnapshot(); // Base empty state

    const replayPaths: Record<string, { x: number; y: number }[]> = {};
    const replaySessions: Record<string, { tool: ToolType; color: string; width: number; opacity: number }> = {};

    commands.forEach((cmdObj) => {
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

      if (event === 'draw_start') {
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
        if (path.length > 0) {
          drawEntirePath(ctx, path, session.tool, session.color, session.width, session.opacity);
        }

        const isShape = session.tool !== 'pencil' && session.tool !== 'eraser';
        if (isShape && data.startX !== undefined && data.startY !== undefined) {
          const sX = data.startX * LOGICAL_WIDTH;
          const sY = data.startY * LOGICAL_HEIGHT;
          const eX = (data.x !== undefined ? data.x : (data.endX !== undefined ? data.endX : 0)) * LOGICAL_WIDTH;
          const eY = (data.y !== undefined ? data.y : (data.endY !== undefined ? data.endY : 0)) * LOGICAL_HEIGHT;
          drawShape(ctx, sX, sY, eX, eY, session.tool, session.color, session.width, session.opacity);
        }
        path.length = 0;
        delete replaySessions[instId];
        saveSnapshot();
      } else if (event === 'draw_clear') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        saveSnapshot();
      } else if (event === 'draw_action') {
        if (cmdTool === 'bucket' && data.x !== undefined && data.y !== undefined) {
          floodFill(ctx, data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT, cmdColor, cmdOpacity);
          saveSnapshot();
        }
      } else if (event === 'draw_undo') {
        executeUndo(false);
      } else if (event === 'draw_redo') {
        executeRedo(false);
      }
    });
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

      if (event === 'draw_start') {
        const rx = data.x * LOGICAL_WIDTH;
        const ry = data.y * LOGICAL_HEIGHT;
        activeSessionsRef.current[data.instanceId] = {
          tool: remoteTool,
          color: remoteColor,
          width: remoteWidth,
          opacity: remoteOpacity,
          path: [{ x: rx, y: ry }]
        };
        redrawTempLayer();
      } else if (event === 'draw_move') {
        const session = activeSessionsRef.current[data.instanceId];
        if (session) {
          const handleMovePoint = (mx: number, my: number) => {
            session.path.push({ x: mx, y: my });
          };

          if (data.moves && Array.isArray(data.moves)) {
            data.moves.forEach((m: any) => {
              handleMovePoint(m.x * LOGICAL_WIDTH, m.y * LOGICAL_HEIGHT);
            });
          } else if (data.x !== undefined && data.y !== undefined) {
            handleMovePoint(data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT);
          }
          redrawTempLayer();
        }
      } else if (event === 'draw_end') {
        const session = activeSessionsRef.current[data.instanceId];
        if (session) {
          if (session.path.length > 0) {
            drawEntirePath(ctx, session.path, session.tool, session.color, session.width, session.opacity);
          }

          const isShape = session.tool !== 'pencil' && session.tool !== 'eraser';
          if (isShape && data.startX !== undefined && data.startY !== undefined) {
            const sX = data.startX * LOGICAL_WIDTH;
            const sY = data.startY * LOGICAL_HEIGHT;
            const eX = (data.x !== undefined ? data.x : (data.endX !== undefined ? data.endX : 0)) * LOGICAL_WIDTH;
            const eY = (data.y !== undefined ? data.y : (data.endY !== undefined ? data.endY : 0)) * LOGICAL_HEIGHT;
            drawShape(ctx, sX, sY, eX, eY, session.tool, session.color, session.width, session.opacity);
          }
          delete activeSessionsRef.current[data.instanceId];
        }
        redrawTempLayer();
        saveSnapshot();
      } else if (event === 'draw_clear') {
        executeClear(false);
      } else if (event === 'draw_action') {
        if (remoteTool === 'bucket' && data.x !== undefined && data.y !== undefined) {
          floodFill(ctx, data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT, remoteColor, remoteOpacity);
          saveSnapshot();
        }
      } else if (event === 'draw_undo') {
        executeUndo(false);
      } else if (event === 'draw_redo') {
        executeRedo(false);
      }
    };

    const onDrawHistorySync = (commands: any[]) => {
      console.log("[DrawingCanvasCore] Received draw_history_sync event, payload length:", commands?.length);
      if (ctxRef.current && tempCtxRef.current) {
        applySyncedHistory(commands);
      } else {
        // Buffering the sync until refs are fully ready
        bufferedSyncRef.current = commands;
      }
      setIsSyncing(false);
      setHasSyncedOnce(true);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };

    socket.on('draw_binary', onDrawBinary);
    socket.on('draw_history_sync', onDrawHistorySync);

    return () => {
      socket.off('draw_binary', onDrawBinary);
      socket.off('draw_history_sync', onDrawHistorySync);
    };
  }, [socket, instanceId]);

  const startSyncFlow = () => {
    setIsSyncing(true);
    console.log("[DrawingCanvasCore] Activating loading state, requesting round sync...");

    // Setup 4 seconds safety timeout to prevent getting stuck under network latency
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
      console.log("[DrawingCanvasCore] System connection established. Recovering state history...");
      startSyncFlow();
    };

    socket.on('connect', handleConnect);
    
    // Explicit trigger upon mounting
    if (socket.connected) {
      console.log("[DrawingCanvasCore] Initialized with healthy connection. Instantly fetching sync history...");
      startSyncFlow();
    }

    return () => {
      socket.off('connect', handleConnect);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };
  }, [socket]);

  // Automated Clean Reset State on turn / drawer change
  const previousStateRef = useRef({ currentDrawerId, status });
  useEffect(() => {
    if (previousStateRef.current.currentDrawerId !== currentDrawerId || previousStateRef.current.status !== status) {
      console.log(`[DrawingCanvasCore] Game state changed. Drawer: ${currentDrawerId}, Status: ${status}. Resetting canvas.`);
      executeResetState();
    }
    previousStateRef.current = { currentDrawerId, status };
  }, [currentDrawerId, status]);

  // --- HTML Canvas Initialization ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    if (!canvas || !tempCanvas) return;

    // Strict non-fluctuating dimensional scale initialization
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

      // Draw initial white canvas background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

      tempCtx.scale(DPR, DPR);
      tempCtx.lineCap = 'round';
      tempCtx.lineJoin = 'round';
      tempCtxRef.current = tempCtx;

      // Save initial state snapshot
      saveSnapshot();

      // Flush any buffered history states received pre-context load
      if (bufferedSyncRef.current) {
        applySyncedHistory(bufferedSyncRef.current);
        bufferedSyncRef.current = null;
      }
    }
  }, []);

  // --- Drawing Pointer Events Hooks ---

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (propsRef.current.readOnly) return;
    
    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (!canvas || !tempCanvas || !ctx || !tempCtx) return;

    // Direct capture focusing pointer movements over the viewport boundaries
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const { x, y } = getLogicalCoords(e.clientX, e.clientY, canvas);
    startXRef.current = x;
    startYRef.current = y;
    isDrawingRef.current = true;
    setIsDrawing(true);

    const activeTool = propsRef.current.tool;
    const activeColor = propsRef.current.color;
    const activeWidth = propsRef.current.thickness;
    const activeOpacity = propsRef.current.opacity;

    if (activeTool === 'bucket') {
      floodFill(ctx, x, y, activeColor, activeOpacity);
      emitDrawCommand('draw_action', {
        tool: 'bucket',
        color: activeColor,
        opacity: activeOpacity,
        x: x / LOGICAL_WIDTH,
        y: y / LOGICAL_HEIGHT
      });
      saveSnapshot();
      return;
    }

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
      setIsDrawing(false);
      return;
    }

    // Interactive path starting
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
      redrawTempLayer();
    } else {
      // Clear temp layer
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

    const { x, y } = getLogicalCoords(e.clientX, e.clientY, canvas);
    const activeTool = propsRef.current.tool;
    const activeColor = propsRef.current.color;
    const activeWidth = propsRef.current.thickness;
    const activeOpacity = propsRef.current.opacity;

    if (activeTool === 'pencil' || activeTool === 'eraser') {
      const path = currentPathRef.current;
      path.push({ x, y });

      redrawTempLayer();

      const normX = x / LOGICAL_WIDTH;
      const normY = y / LOGICAL_HEIGHT;

      // Safe compression batch dispatching matching active performance capabilities
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
      // Shape dragging previewing
      tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
      drawShape(tempCtx, startXRef.current, startYRef.current, x, y, activeTool, activeColor, activeWidth, activeOpacity);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;

    // Release direct Pointer Captures safely on ending
    e.currentTarget.releasePointerCapture(e.pointerId);

    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (!canvas || !tempCanvas || !ctx || !tempCtx) return;

    const { x, y } = getLogicalCoords(e.clientX, e.clientY, canvas);
    const activeTool = propsRef.current.tool;
    const activeColor = propsRef.current.color;
    const activeWidth = propsRef.current.thickness;
    const activeOpacity = propsRef.current.opacity;

    isDrawingRef.current = false;
    setIsDrawing(false);

    // Cancel outstanding throttling timeouts
    if (throttleTimeoutRef.current) {
      clearTimeout(throttleTimeoutRef.current);
      throttleTimeoutRef.current = null;
    }

    if (activeTool === 'pencil' || activeTool === 'eraser') {
      // Transfer final batch points
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

      // Clear temp layer
      tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);

      // Commit full path directly onto the primary canvas context
      if (currentPathRef.current.length > 0) {
        drawEntirePath(ctx, currentPathRef.current, activeTool, activeColor, activeWidth, activeOpacity);
      }

      emitDrawCommand('draw_end', {
        tool: activeTool,
        color: activeColor,
        width: activeWidth,
        opacity: activeOpacity,
        isShape: false
      });
    } else {
      // Commit shape directly onto the primary canvas context
      tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
      drawShape(ctx, startXRef.current, startYRef.current, x, y, activeTool, activeColor, activeWidth, activeOpacity);

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
      className="absolute inset-0 select-none overflow-hidden touch-none bg-slate-900"
      style={{
        width: '100%',
        height: '100%',
      }}
    >
      {/* 
        This is the dynamic high-performance rendering stage. 
        Aspect-ratio tracking is responsive to fit fully inside viewport or zoom/drag 
      */}
      <div
        ref={transformWrapperRef}
        className="absolute left-0 top-0 transform-gpu bg-white shadow-xl overflow-hidden select-none touch-none"
        style={{
          width: LOGICAL_WIDTH,
          height: LOGICAL_HEIGHT,
          transformOrigin: '0 0',
          willChange: 'transform'
        }}
      >
        {/* Double-buffered interactive canvas slots (Opaque Primary Layer + Transparent Shape Preview) */}
        <canvas
          id="drawing-board-layer-primary"
          ref={canvasRef}
          className="absolute inset-0 w-full h-full block bg-white touch-none pointer-events-auto cursor-crosshair"
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
          className="absolute inset-0 w-full h-full block pointer-events-none touch-none bg-transparent"
          style={{
            zIndex: 20
          }}
        />
      </div>

      <AnimatePresence>
        {(isSyncing || !isConnected) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className={`fixed inset-0 flex flex-col items-center justify-center z-[999999] cursor-not-allowed select-none touch-none ${
              hasSyncedOnce
                ? "bg-[#0c061d]/60 backdrop-blur-md"
                : "bg-[#0c061d]"
            }`}
            style={{ pointerEvents: 'auto' }}
          >
            <div className="flex flex-col items-center">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-4 border-violet-500/20" />
                <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 animate-spin" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

DrawingCanvasCore.displayName = 'DrawingCanvasCore';

export default DrawingCanvasCore;

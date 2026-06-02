import React, { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useSocket } from '../SocketProvider';
import { ToolType, PooledPoint } from '../../types/draw';
import {
  compressPayload,
  decompressPayload,
  acquirePoint,
  releasePoints,
  encodeBinaryDrawMessage,
  decodeBinaryDrawMessage
} from '../../utils/drawBinaryHelper';

const matchColor = (data: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number) => {
  const tolerance = 40; 
  return Math.abs(data[i] - r) <= tolerance && 
         Math.abs(data[i+1] - g) <= tolerance && 
         Math.abs(data[i+2] - b) <= tolerance && 
         Math.abs(data[i+3] - a) <= tolerance;
};

let sharedOffscreenCanvas: HTMLCanvasElement | null = null;
let sharedOffscreenCtx: CanvasRenderingContext2D | null = null;

const floodFill = (ctx: CanvasRenderingContext2D, startX: number, startY: number, fillColorStr: string, fillOpacity: number = 1, DPR: number) => {
  const canvas = ctx.canvas;
  const cw = canvas.width, ch = canvas.height;
  
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
  const tr = data[targetIdx], tg = data[targetIdx+1], tb = data[targetIdx+2], ta = data[targetIdx+3];
  
  let fillHex = fillColorStr;
  if (fillHex.length === 4) fillHex = '#' + fillHex[1] + fillHex[1] + fillHex[2] + fillHex[2] + fillHex[3] + fillHex[3];
  
  const fr = parseInt(fillHex.slice(1, 3), 16) || 0;
  const fg = parseInt(fillHex.slice(3, 5), 16) || 0;
  const fb = parseInt(fillHex.slice(5, 7), 16) || 0;
  
  // Guard against filling the exact same color at full opacity
  if (fillOpacity >= 0.95 && Math.abs(tr - fr) <= 5 && Math.abs(tg - fg) <= 5 && Math.abs(tb - fb) <= 5) {
    return;
  }
  
  const visited = new Uint8Array(cw * ch);
  
  // Standard queue-based scanline algorithm with visited tracking to prevent back-tracking or infinite loops
  const queueX: number[] = [sx];
  const queueY: number[] = [sy];
  let head = 0;
  
  while (head < queueX.length) {
    const cx = queueX[head];
    const cy = queueY[head];
    head++;
    
    const seedIdx = cy * cw + cx;
    if (visited[seedIdx]) {
      continue;
    }
    
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
      
      // Perform manual alpha blending on the opaque canvas (alpha: false)
      const destR = data[idx];
      const destG = data[idx+1];
      const destB = data[idx+2];
      
      data[idx] = Math.round(fr * fillOpacity + destR * (1 - fillOpacity));
      data[idx+1] = Math.round(fg * fillOpacity + destG * (1 - fillOpacity));
      data[idx+2] = Math.round(fb * fillOpacity + destB * (1 - fillOpacity));
      data[idx+3] = 255; // Keep opaque on alpha:false context
      
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

const LOGICAL_WIDTH = 800;
const LOGICAL_HEIGHT = 600;

const getPerformanceTier = () => {
  if (typeof window === 'undefined') return 1;
  try {
    const nav: any = navigator;
    const cpuCount = nav.hardwareConcurrency;
    const memory = nav.deviceMemory;

    const cpus = cpuCount !== undefined ? cpuCount : 4;
    const mem = memory !== undefined ? memory : 4;

    if (cpus <= 2 || mem <= 2) {
      return 3; // Level 3: Low-End
    }
    if (cpus <= 4 || mem <= 3) {
      return 2; // Level 2: Medium-End
    }
  } catch (err) {
    if (window.devicePixelRatio !== undefined && window.devicePixelRatio < 1.5) {
      return 3;
    }
  }
  return 1; // Level 1: High-End
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

export interface DrawingCanvasCoreHandle {
  undo: (emit?: boolean) => void;
  redo: (emit?: boolean) => void;
  clearCanvas: (emit?: boolean) => void;
  downloadScreenshot: () => void;
}

export interface DrawingCanvasCoreProps {
  readOnly: boolean;
  tool: ToolType;
  color: string;
  setColor: (c: string) => void;
  currentWidth: number;
  currentOpacity: number;
  previewSize: number | null;
  setPreviewSize: (p: number | null) => void;
  activeMenu: 'tools' | 'controls' | null;
  setActiveMenu: (m: 'tools' | 'controls' | null) => void;
  changeTool: (t: ToolType) => void;
  previousTool: React.MutableRefObject<ToolType>;
  onHistoryStateChange: (state: { index: number; length: number }) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

const DrawingCanvasCore = forwardRef<DrawingCanvasCoreHandle, DrawingCanvasCoreProps>(({
  readOnly,
  tool,
  color,
  setColor,
  currentWidth,
  currentOpacity,
  previewSize,
  setPreviewSize,
  activeMenu,
  setActiveMenu,
  changeTool,
  previousTool,
  onHistoryStateChange,
  containerRef
}, ref) => {
  const instanceId = useMemo(() => Math.random().toString(36).substring(2, 9), []);
  const { socket } = useSocket();

  const emitDrawCommand = (event: string, data: any) => {
    if (socket && socket.connected) {
      const msg = encodeBinaryDrawMessage(event, { ...data, instanceId });
      if (event === 'draw_move' && socket.volatile) {
        socket.volatile.emit('draw_binary', msg);
      } else {
        socket.emit('draw_binary', msg);
      }
    }
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);
  const interactionLayerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const tempCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  
  const lastMoveProcessedTime = useRef(0);
  const lastBucketFillTimeRef = useRef(0);
  const [isDrawing, setIsDrawing] = useState(false);

  const transformRef = useRef({ scale: 1, x: 0, y: 0 });
  const transformWrapperRef = useRef<HTMLDivElement>(null);
  const lastSyncCommands = useRef<any[] | null>(null);
  const applySyncedHistoryRef = useRef<((commands: any[]) => void) | null>(null);
  
  const history = useRef<ImageData[]>([]);
  const historyIndex = useRef<number>(-1);
  const [baseScale, setBaseScale] = useState(1);
  const hasInitializedTransform = useRef(false);
  const moveBatchRef = useRef<{x: number, y: number}[]>([]);
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const menuJustClosedRef = useRef<boolean>(false);

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
  }, [readOnly, containerRef]);

  const getContainerCoord = (viewportX: number, viewportY: number) => {
    const container = containerRef.current;
    if (!container) return { x: viewportX, y: viewportY };
    const rect = container.getBoundingClientRect();
    return { x: viewportX - rect.left, y: viewportY - rect.top };
  };

  const clampTransform = (newX: number, newY: number, newScale: number, currentBaseScale: number) => {
    const container = containerRef.current;
    if (!container) return { x: newX, y: newY, scale: newScale };
    const { width, height } = container.getBoundingClientRect();
    
    if (PERF_TIER === 3) {
      const cw = LOGICAL_WIDTH * currentBaseScale;
      const ch = LOGICAL_HEIGHT * currentBaseScale;
      return {
        x: (width - cw) / 2,
        y: (height - ch) / 2,
        scale: 1,
      };
    }
    
    if (PERF_TIER === 2) {
      const cw = LOGICAL_WIDTH * currentBaseScale * 1;
      const ch = LOGICAL_HEIGHT * currentBaseScale * 1;
      const initialY = (height - ch) / 2;
      let clampedX = newX;
      if (cw <= width) {
        clampedX = (width - cw) / 2;
      } else {
        const minX = width - cw;
        const maxX = 0;
        clampedX = Math.max(minX, Math.min(maxX, newX));
      }
      return {
        x: clampedX,
        y: initialY,
        scale: 1,
      };
    }

    const cw = LOGICAL_WIDTH * currentBaseScale * newScale;
    const ch = LOGICAL_HEIGHT * currentBaseScale * newScale;
    const paddingX = Math.min(100, width / 2);
    const paddingY = Math.min(100, height / 2);

    const minX = -cw + paddingX;
    const maxX = width - paddingX;
    const minY = -ch + paddingY;
    const maxY = height - paddingY;

    return {
      x: Math.max(minX, Math.min(maxX, newX)),
      y: Math.max(minY, Math.min(maxY, newY)),
      scale: newScale
    };
  };

  const remotePathRef = useRef<{x: number, y: number}[]>([]);
  const remoteProps = useRef({ tool: 'pencil', color: '#000', width: 5, opacity: 1 });

  const drawStrokeSegment = (
    activeCtx: CanvasRenderingContext2D,
    path: { x: number, y: number }[],
    tool: string,
    color: string,
    width: number
  ) => {
    const len = path.length;
    if (len === 0) return;

    activeCtx.beginPath();
    activeCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    activeCtx.fillStyle = color;
    activeCtx.lineWidth = width;
    activeCtx.lineCap = 'round';
    activeCtx.lineJoin = 'round';
    
    if (tool === 'pencil') {
       activeCtx.shadowBlur = IS_LOW_END ? 0 : 1;
       activeCtx.shadowColor = color;
    } else {
       activeCtx.shadowBlur = 0;
       activeCtx.shadowColor = 'transparent';
    }

    if (len === 1) {
      activeCtx.fillStyle = activeCtx.strokeStyle;
      activeCtx.arc(path[0].x, path[0].y, width / 2, 0, Math.PI * 2);
      activeCtx.fill();
    } else if (len === 2) {
      activeCtx.moveTo(path[0].x, path[0].y);
      activeCtx.lineTo(path[1].x, path[1].y);
      activeCtx.stroke();
    } else {
      const p0 = path[len - 3];
      const p1 = path[len - 2];
      const p2 = path[len - 1];

      const mid1X = (p0.x + p1.x) / 2;
      const mid1Y = (p0.y + p1.y) / 2;
      const mid2X = (p1.x + p2.x) / 2;
      const mid2Y = (p1.y + p2.y) / 2;

      activeCtx.moveTo(mid1X, mid1Y);
      activeCtx.quadraticCurveTo(p1.x, p1.y, mid2X, mid2Y);
      activeCtx.stroke();
    }
    activeCtx.shadowBlur = 0;
  };

  // State initialization and refs
  const currentPath = useRef<PooledPoint[]>([]);
  const lastRenderedIndexRef = useRef<number>(0);
  const needsRenderRef = useRef<boolean>(false);
  const pinchRef = useRef<boolean>(false);
  const lastTouch = useRef({ dist: 0, x: 0, y: 0 });

  const saveHistory = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const MAX_HISTORY = 5;
      
      if (historyIndex.current < history.current.length - 1) {
        history.current = history.current.slice(0, historyIndex.current + 1);
      }
      
      history.current.push(imgData);
      
      while (history.current.length > MAX_HISTORY + 1) {
        history.current.shift();
      }
      
      historyIndex.current = history.current.length - 1;
      onHistoryStateChange({ index: historyIndex.current, length: history.current.length });
    } catch (err) {
      console.error("[saveHistory] Fail safely:", err);
    }
  };

  const undo = (emit = true) => {
    if (historyIndex.current > 0) {
      historyIndex.current--;
      const data = history.current[historyIndex.current];
      ctxRef.current?.putImageData(data, 0, 0);
      onHistoryStateChange({ index: historyIndex.current, length: history.current.length });
      if (emit) {
        emitDrawCommand('draw_undo', {});
      }
    }
  };

  const redo = (emit = true) => {
    if (historyIndex.current < history.current.length - 1) {
      historyIndex.current++;
      const data = history.current[historyIndex.current];
      ctxRef.current?.putImageData(data, 0, 0);
      onHistoryStateChange({ index: historyIndex.current, length: history.current.length });
      if (emit) {
        emitDrawCommand('draw_redo', {});
      }
    }
  };

  const clearCanvas = (emit = true) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    const tempCtx = tempCtxRef.current;
    if (tempCtx) {
       tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
    }
    
    // Wipe local history entirely, start fresh
    history.current = [];
    historyIndex.current = -1;
    saveHistory(); 

    if (emit) {
      emitDrawCommand('draw_clear', {});
    }
  };

  useImperativeHandle(ref, () => ({
    undo,
    redo,
    clearCanvas,
    downloadScreenshot: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tCtx = tempCanvas.getContext('2d');
        if (tCtx) {
          tCtx.fillStyle = '#ffffff';
          tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
          tCtx.drawImage(canvas, 0, 0);
        }
        const url = tempCanvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `khandris-drawing-${new Date().getTime()}.png`;
        a.click();
      } catch (e) {
        console.error("Failed to save screenshot", e);
      }
    }
  }));

  useEffect(() => {
    if (!socket) return;
    
    const onDrawStart = (raw: any, isReplay = false) => {
      const data = decompressPayload(raw);
      if (!isReplay && data.instanceId === instanceId) return;
      remoteProps.current = data;
      const x = data.x * LOGICAL_WIDTH;
      const y = data.y * LOGICAL_HEIGHT;
      
      releasePoints(remotePathRef.current);
      remotePathRef.current.push(acquirePoint(x, y));

      const ctx = ctxRef.current;
      const tempCtx = tempCtxRef.current;
      const tempCanvas = tempCanvasRef.current;
      if (!ctx || !tempCtx || !tempCanvas) return;

      const { tool, color, opacity, width } = data;

      if (tool !== 'bucket' && tool !== 'pipette') {
        tempCanvas.style.opacity = opacity.toString();
        tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
        tempCtx.globalAlpha = 1;
        tempCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
        tempCtx.fillStyle = color;
        tempCtx.globalCompositeOperation = 'source-over';
        
        if (tool === 'pencil' || tool === 'eraser') {
          drawStrokeSegment(tempCtx, remotePathRef.current, tool, color, width);
        } else {
          tempCtx.beginPath();
          tempCtx.lineCap = 'round';
          tempCtx.lineJoin = 'round';
          tempCtx.lineWidth = width;
          tempCtx.moveTo(x, y);
          tempCtx.lineTo(x, y);
          if (tool === 'line') {
            tempCtx.stroke();
          } else if (tool === 'strokeCircle') {
            tempCtx.arc(x, y, 1, 0, Math.PI * 2);
            tempCtx.stroke();
          } else if (tool === 'fillCircle') {
            tempCtx.arc(x, y, 1, 0, Math.PI * 2);
            tempCtx.fill();
          }
        }
      }
    };

    const onDrawMove = (raw: any, isReplay = false) => {
      const data = decompressPayload(raw);
      if (!isReplay && data.instanceId === instanceId) return;
      const ctx = ctxRef.current;
      const tempCtx = tempCtxRef.current;
      if (!ctx || !tempCtx || !remotePathRef.current || remotePathRef.current.length === 0) return;
      const { color, width, tool } = remoteProps.current;
      
      const processPoint = (ptX: number, ptY: number) => {
        const x = ptX * LOGICAL_WIDTH;
        const y = ptY * LOGICAL_HEIGHT;

        if (!isReplay && remotePathRef.current.length > 0) {
          const last = remotePathRef.current[remotePathRef.current.length - 1];
          const dist = Math.hypot(x - last.x, y - last.y);
          if (dist > 8) {
            const steps = Math.min(10, Math.floor(dist / 4));
            for (let i = 1; i < steps; i++) {
              const t = i / steps;
              const interpX = last.x + (x - last.x) * t;
              const interpY = last.y + (y - last.y) * t;
              remotePathRef.current.push(acquirePoint(interpX, interpY));
              
              if (tool === 'pencil' || tool === 'eraser') {
                drawStrokeSegment(tempCtx, remotePathRef.current, tool, color, width);
              }
            }
          }
        }

        remotePathRef.current.push(acquirePoint(x, y));

        if (tool === 'pencil' || tool === 'eraser') {
          drawStrokeSegment(tempCtx, remotePathRef.current, tool, color, width);
        } else {
          tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
          tempCtx.beginPath();
          tempCtx.strokeStyle = color;
          tempCtx.fillStyle = color;
          tempCtx.lineWidth = width;
          tempCtx.lineCap = 'round';
          tempCtx.lineJoin = 'round';
          tempCtx.shadowBlur = 0;
          tempCtx.shadowColor = 'transparent';

          const startX = remotePathRef.current[0].x;
          const startY = remotePathRef.current[0].y;

          if (tool === 'line') {
            tempCtx.moveTo(startX, startY);
            tempCtx.lineTo(x, y);
            tempCtx.stroke();
          } else if (tool === 'strokeRect') {
            tempCtx.lineJoin = 'miter';
            tempCtx.strokeRect(startX, startY, x - startX, y - startY);
          } else if (tool === 'fillRect') {
            tempCtx.fillRect(startX, startY, x - startX, y - startY);
          } else if (tool === 'strokeCircle') {
            const radius = Math.hypot(x - startX, y - startY);
            tempCtx.arc(startX, startY, radius, 0, Math.PI * 2);
            tempCtx.stroke();
          } else if (tool === 'fillCircle') {
            const radius = Math.hypot(x - startX, y - startY);
            tempCtx.arc(startX, startY, radius, 0, Math.PI * 2);
            tempCtx.fill();
          }
        }
      };

      if (data.moves && Array.isArray(data.moves)) {
        for (const pt of data.moves) {
           processPoint(pt.x, pt.y);
        }
      } else if (data.x !== undefined && data.y !== undefined) {
        processPoint(data.x, data.y);
      }
    };

    const onDrawEnd = (raw?: any, skipSave = false, isReplay = false) => {
      const data = decompressPayload(raw);
      if (!isReplay && data?.instanceId === instanceId) return;
      const ctx = ctxRef.current;
      const tempCtx = tempCtxRef.current;
      const tempCanvas = tempCanvasRef.current;
      if (!ctx || !tempCtx || !tempCanvas) return;
      
      const p = remotePathRef.current;
      const props = remoteProps.current;
      
      if (props.tool !== 'bucket' && props.tool !== 'pipette') {
         if (p.length > 0) {
           const { tool, color, opacity, width } = props;
           
           if (tool === 'pencil' || tool === 'eraser') {
             const n = p.length;
             if (n >= 2) {
               tempCtx.beginPath();
               tempCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
               tempCtx.lineWidth = width;
               tempCtx.lineCap = 'round';
               tempCtx.lineJoin = 'round';
               tempCtx.globalAlpha = 1;
               
               const p1 = p[n - 2];
               const p2 = p[n - 1];
               const midX = (p1.x + p2.x) / 2;
               const midY = (p1.y + p2.y) / 2;
               tempCtx.moveTo(midX, midY);
               tempCtx.lineTo(p2.x, p2.y);
               tempCtx.stroke();
             }
           }
           
           ctx.globalAlpha = opacity;
           ctx.globalCompositeOperation = 'source-over';
           ctx.drawImage(tempCanvas, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
           tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
         }
      }
      
      if (!skipSave) {
        saveHistory();
      }
      
      releasePoints(remotePathRef.current);
    };

    const onDrawCancel = (raw: any) => {
      const data = decompressPayload(raw);
      if (data?.instanceId === instanceId) return;
      tempCtxRef.current?.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
      releasePoints(remotePathRef.current);
    };

    const onDrawClear = (raw?: any) => {
      const data = decompressPayload(raw);
      if (data?.instanceId === instanceId) return;
      clearCanvas(false);
    };

    const onDrawAction = (raw: any, isReplay = false) => {
      const data = decompressPayload(raw);
      if (!isReplay && data.instanceId === instanceId) return;
      const ctx = ctxRef.current;
      if (!ctx) return;

      const { tool, color, opacity, x, y } = data;
      const realX = x * LOGICAL_WIDTH;
      const realY = y * LOGICAL_HEIGHT;

      if (tool === 'bucket') {
        floodFill(ctx, realX, realY, color, opacity, DPR);
        if (!isReplay) {
          saveHistory();
        }
      }
    };

    const onDrawUndo = (raw?: any) => {
      const data = decompressPayload(raw);
      if (data?.instanceId === instanceId) return;
      undo(false);
    };

    const onDrawUndoLocal = (raw?: any) => {
      const data = decompressPayload(raw);
      if (data?.instanceId === instanceId) return;
      undo(false);
    };

    const onDrawRedo = (raw?: any) => {
      const data = decompressPayload(raw);
      if (data?.instanceId === instanceId) return;
      redo(false);
    };

    const onDrawRedoLocal = (raw?: any) => {
      const data = decompressPayload(raw);
      if (data?.instanceId === instanceId) return;
      redo(false);
    };

    const applySyncedHistory = (commands: any[]) => {
      let ctx = ctxRef.current;
      let canvas = canvasRef.current;
      let tempCtx = tempCtxRef.current;
      let tempCanvas = tempCanvasRef.current;
      
      if ((!ctx || !canvas || !tempCtx || !tempCanvas) && canvasRef.current && tempCanvasRef.current) {
         console.log("[DrawingCanvasCore - History Sync] Initializing context on-demand for immediate rendering...");
         const canvasEl = canvasRef.current;
         const tempCanvasEl = tempCanvasRef.current;
         
         const newCtx = canvasEl.getContext('2d', { alpha: false });
         const newTempCtx = tempCanvasEl.getContext('2d');
         
         if (newCtx && newTempCtx) {
           newCtx.scale(DPR, DPR);
           newCtx.lineCap = 'round';
           newCtx.lineJoin = 'round';
           ctxRef.current = newCtx;
           
           newTempCtx.scale(DPR, DPR);
           newTempCtx.lineCap = 'round';
           newTempCtx.lineJoin = 'round';
           tempCtxRef.current = newTempCtx;
           
           newCtx.fillStyle = '#ffffff';
           newCtx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
           
           ctx = newCtx;
           canvas = canvasEl;
           tempCtx = newTempCtx;
           tempCanvas = tempCanvasEl;
         }
      }
      
      if (!ctx || !canvas || !tempCtx || !tempCanvas) {
         console.warn("[History Sync] Missing references, buffering for later");
         return;
      }
      
      console.log("[History Sync] Replaying", commands.length, "commands");

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
      
      history.current = [];
      const blankData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      history.current.push(blankData);

      for (const cmd of commands) {
         try {
            if (!cmd) continue;
            let event = cmd.event;
            let data = cmd.data;
            
            if (event === 'draw_binary') {
               const decoded = decodeBinaryDrawMessage(data);
               if (decoded) {
                  event = decoded.event;
                  data = decoded.data;
               } else {
                  continue; 
               }
            }
            
            if (!data) continue;
            
            if (event === 'draw_start') onDrawStart(data, true);
            else if (event === 'draw_move') onDrawMove(data, true);
            else if (event === 'draw_end') {
               onDrawEnd(data, true, true);
            }
            else if (event === 'draw_action') {
               onDrawAction(data, true);
            }
         } catch (err) {
            console.error("[History Sync] Replay draw error:", err, cmd);
         }
      }
      
      try {
         const finalSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
         history.current.push(finalSnapshot);
      } catch (err) {
         console.error("[History Sync] Save final snapshot error:", err);
      }
      
      const MAX_HISTORY = 5;
      while (history.current.length > MAX_HISTORY + 1) {
         history.current.shift();
      }
      
      historyIndex.current = history.current.length - 1;
      onHistoryStateChange({ index: historyIndex.current, length: history.current.length });
    };

    const onDrawHistorySync = (commands: any[]) => {
      console.log("[DrawingCanvasCore] draw_history_sync socket event received directly, count:", commands?.length);
      lastSyncCommands.current = commands;
      applySyncedHistory(commands);
    };

    const onDrawBinary = (rawMsg: any) => {
       const decoded = decodeBinaryDrawMessage(rawMsg);
       if (!decoded) return;
       const { event, data } = decoded;
       if (event === 'draw_start') onDrawStart(data);
       else if (event === 'draw_move') onDrawMove(data);
       else if (event === 'draw_end') onDrawEnd(data);
       else if (event === 'draw_cancel') onDrawCancel(data);
       else if (event === 'draw_clear') onDrawClear(data);
       else if (event === 'draw_action') onDrawAction(data);
       else if (event === 'draw_undo') onDrawUndo(data);
       else if (event === 'draw_redo') onDrawRedo(data);
    };

    socket.on('draw_binary', onDrawBinary);
    socket.on('draw_start', onDrawStart);
    socket.on('draw_move', onDrawMove);
    socket.on('draw_end', onDrawEnd);
    socket.on('draw_cancel', onDrawCancel);
    socket.on('draw_clear', onDrawClear);
    socket.on('draw_action', onDrawAction);
    socket.on('draw_undo', onDrawUndo);
    socket.on('draw_undo_local', onDrawUndoLocal);
    socket.on('draw_redo', onDrawRedo);
    socket.on('draw_redo_local', onDrawRedoLocal);
    socket.on('draw_history_sync', onDrawHistorySync);

    applySyncedHistoryRef.current = applySyncedHistory;

    if (lastSyncCommands.current && ctxRef.current && canvasRef.current) {
      applySyncedHistory(lastSyncCommands.current);
    }

    return () => {
      socket.off('draw_binary', onDrawBinary);
      socket.off('draw_start', onDrawStart);
      socket.off('draw_move', onDrawMove);
      socket.off('draw_end', onDrawEnd);
      socket.off('draw_clear', onDrawClear);
      socket.off('draw_action', onDrawAction);
      socket.off('draw_undo', onDrawUndo);
      socket.off('draw_undo_local', onDrawUndoLocal);
      socket.off('draw_redo', onDrawRedo);
      socket.off('draw_redo_local', onDrawRedoLocal);
      socket.off('draw_history_sync', onDrawHistorySync);
    };
  }, [socket]);

  // Main UI contexts setup or scaling
  useEffect(() => {
    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    if (!canvas || !tempCanvas) return;

    // Strict pixel size assignment to bypass standard Vite layout remount triggers
    canvas.width = LOGICAL_WIDTH * DPR;
    canvas.height = LOGICAL_HEIGHT * DPR;

    tempCanvas.width = LOGICAL_WIDTH * DPR;
    tempCanvas.height = LOGICAL_HEIGHT * DPR;

    const ctx = canvas.getContext('2d', { alpha: false });
    const tempCtx = tempCanvas.getContext('2d');
    if (!ctx || !tempCtx) return;

    ctx.scale(DPR, DPR);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    ctxRef.current = ctx;

    tempCtx.scale(DPR, DPR);
    tempCtx.lineCap = 'round';
    tempCtx.lineJoin = 'round';
    tempCtxRef.current = tempCtx;

    // Cleanly bootstrap local history stack at index 0 matching standard sync specs
    if (history.current.length === 0) {
       saveHistory();
    } else {
       // restore previous drawings if already set
       const lastSnapshot = history.current[historyIndex.current];
       if (lastSnapshot) {
         ctx.putImageData(lastSnapshot, 0, 0);
       }
    }

    if (lastSyncCommands.current) {
       applySyncedHistoryRef.current?.(lastSyncCommands.current);
    }
  }, []);

  const getCoord = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = LOGICAL_WIDTH / rect.width;   
    const scaleY = LOGICAL_HEIGHT / rect.height; 
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const lastTouchTime = useRef(0);

  const handlePointerDown = (e: React.TouchEvent | React.MouseEvent | TouchEvent | MouseEvent) => {
    if (activeMenu !== null) {
      setActiveMenu(null);
      menuJustClosedRef.current = true;
      return;
    }

    if (menuJustClosedRef.current) {
      return;
    }
    
    let clientX, clientY;
    if ('touches' in e) {
      lastTouchTime.current = Date.now();
      if (e.touches.length >= 2) {
        pinchRef.current = true;
        if (isDrawing) {
          setIsDrawing(false);
          ctxRef.current?.closePath();
          tempCtxRef.current?.closePath();
          tempCtxRef.current?.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
          emitDrawCommand('draw_cancel', {});
          releasePoints(currentPath.current);
        }
        const t1 = e.touches[0], t2 = e.touches[1];
        const cxViewport = (t1.clientX + t2.clientX) / 2;
        const cyViewport = (t1.clientY + t2.clientY) / 2;
        const { x: cx, y: cy } = getContainerCoord(cxViewport, cyViewport);
        
        lastTouch.current = {
          dist: Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
          x: cx,
          y: cy
        };
        return;
      }
      if (e.touches.length === 1) {
        pinchRef.current = false;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        return;
      }
    } else {
       if (Date.now() - lastTouchTime.current < 500) return;
       pinchRef.current = false;
       clientX = e.clientX;
       clientY = e.clientY;
    }

    const { x, y } = getCoord(clientX, clientY);
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    const tempCanvas = tempCanvasRef.current;
    if (!ctx || !tempCtx || !tempCanvas) return;

    if (tool === 'bucket' || tool === 'pipette') {
       releasePoints(currentPath.current);
       currentPath.current.push(acquirePoint(x, y));
       return;
    }

    releasePoints(currentPath.current);
    currentPath.current.push(acquirePoint(x, y));
    setIsDrawing(true);
    
    let activeCtx = tempCtx;
    
    if (tool !== 'bucket' && tool !== 'pipette') {
      tempCanvas.style.opacity = currentOpacity.toString();
      activeCtx.globalAlpha = 1; 
      activeCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
      activeCtx.fillStyle = color;
      activeCtx.globalCompositeOperation = 'source-over';
    }

    if (tool !== 'bucket' && tool !== 'pipette') {
       emitDrawCommand('draw_start', {
          tool, color, width: currentWidth, opacity: currentOpacity,
          x: x / LOGICAL_WIDTH, y: y / LOGICAL_HEIGHT
       });
    }

    if (tool === 'pencil' || tool === 'eraser') {
      lastRenderedIndexRef.current = 0;
      drawStrokeSegment(tempCtx, currentPath.current, tool, color, currentWidth);
      needsRenderRef.current = false;
    } else if (tool !== 'bucket' && tool !== 'pipette') {
      tempCtx.beginPath();
      tempCtx.lineCap = 'round';
      tempCtx.lineJoin = 'round';
      tempCtx.lineWidth = currentWidth;
      tempCtx.moveTo(x, y);
      tempCtx.lineTo(x, y);
      if (tool === 'line') {
        tempCtx.stroke();
      } else if (tool === 'strokeCircle') {
        tempCtx.arc(x, y, 1, 0, Math.PI*2);
        tempCtx.stroke();
      } else if (tool === 'fillCircle') {
        tempCtx.arc(x, y, 1, 0, Math.PI*2);
        tempCtx.fill();
      }
      needsRenderRef.current = true;
    }
    
    if (ctx) ctx.shadowBlur = 0;
  };

  const handlePointerMove = (e: React.TouchEvent | React.MouseEvent | TouchEvent | MouseEvent) => {
    if (menuJustClosedRef.current) {
      return;
    }

    let clientX, clientY;

    if ('touches' in e) {
      if (e.touches.length >= 2) {
        const t1 = e.touches[0], t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        
        const cxViewport = (t1.clientX + t2.clientX) / 2;
        const cyViewport = (t1.clientY + t2.clientY) / 2;
        const { x: cx, y: cy } = getContainerCoord(cxViewport, cyViewport);

        const { dist: lastDist, x: lastCx, y: lastCy } = lastTouch.current;
        
        if (lastDist === 0) return;
        
        const scaleDiff = dist / lastDist;
        const dx = cx - lastCx;
        const dy = cy - lastCy;

        const prev = transformRef.current;
        let newScale = prev.scale * scaleDiff;
        newScale = Math.min(Math.max(0.3, newScale), 10);
        
        let newX = cx + dx - (cx - prev.x) * (newScale / prev.scale);
        let newY = cy + dy - (cy - prev.y) * (newScale / prev.scale);

        if (PERF_TIER === 3) {
          newScale = 1;
          newX = prev.x;
          newY = prev.y;
        } else if (PERF_TIER === 2) {
          newScale = 1;
          newX = prev.x + dx;
          newY = prev.y;
        }

        const clamped = clampTransform(newX, newY, newScale, baseScale);
        transformRef.current = { 
          scale: clamped.scale !== undefined ? clamped.scale : newScale, 
          x: clamped.x, 
          y: clamped.y 
        };
        applyTransform();

        lastTouch.current = { dist, x: cx, y: cy };
        
        if (isDrawing) {
            setIsDrawing(false);
            needsRenderRef.current = false;
            ctxRef.current?.closePath();
            tempCtxRef.current?.closePath();
            tempCtxRef.current?.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
            emitDrawCommand('draw_cancel', {});
        }
        return;
      }
      if (e.touches.length === 1 && isDrawing) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        return;
      }
    } else {
       if (!isDrawing || Date.now() - lastTouchTime.current < 500) return;
       clientX = e.clientX;
       clientY = e.clientY;
    }

    const { x, y } = getCoord(clientX, clientY);
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (!ctx || !tempCtx) return;

    let shouldPush = true;
    if (currentPath.current.length > 0 && (tool === 'pencil' || tool === 'eraser')) {
      const lastPt = currentPath.current[currentPath.current.length - 1];
      const dx = x - lastPt.x;
      const dy = y - lastPt.y;
      const distSq = dx * dx + dy * dy;

      let minDistance = 0.5; 
      if (PERF_TIER === 3) {
        minDistance = 4.0; 
      } else if (PERF_TIER === 2) {
        minDistance = 2.0; 
      }

      if (distSq < minDistance * minDistance) {
        shouldPush = false;
      }
    }

    if (shouldPush) {
      if (currentPath.current.length > 0 && (tool === 'pencil' || tool === 'eraser')) {
         const lastPt = currentPath.current[currentPath.current.length - 1];
         const dist = Math.hypot(x - lastPt.x, y - lastPt.y);
         if (dist > 6) {
            const steps = Math.min(8, Math.floor(dist / 3));
            for (let i = 1; i < steps; i++) {
               const t = i / steps;
               const interpX = lastPt.x + (x - lastPt.x) * t;
               const interpY = lastPt.y + (y - lastPt.y) * t;
               currentPath.current.push(acquirePoint(interpX, interpY));
            }
         }
      }
      currentPath.current.push(acquirePoint(x, y));
    } else {
      return; 
    }
    
    if (tool === 'pencil' || tool === 'eraser') {
      needsRenderRef.current = true;
      
      if (socket) {
        const normX = x / LOGICAL_WIDTH;
        const normY = y / LOGICAL_HEIGHT;
        let shouldAdd = true;
        
        if (DPR < 2 && moveBatchRef.current.length > 0) {
           const lastPt = moveBatchRef.current[moveBatchRef.current.length - 1];
           const dx = normX - lastPt.x;
           const dy = normY - lastPt.y;
           if (dx * dx + dy * dy < 0.000009) {
              shouldAdd = false;
           }
        }
        
        if (shouldAdd) {
           moveBatchRef.current.push({ x: normX, y: normY });
        }

        if (!throttleTimeoutRef.current) {
          throttleTimeoutRef.current = setTimeout(() => {
            if (moveBatchRef.current.length > 0) {
               emitDrawCommand('draw_move', {
                 moves: moveBatchRef.current
               });
               moveBatchRef.current = [];
            }
            throttleTimeoutRef.current = null;
          }, 16); 
        }
      }
    } else {
      needsRenderRef.current = true;
      const normX = x / LOGICAL_WIDTH;
      const normY = y / LOGICAL_HEIGHT;
      emitDrawCommand('draw_move', {
        x: normX,
        y: normY
      });
    }
  };

  const handlePointerUp = (e: React.TouchEvent | React.MouseEvent | TouchEvent | MouseEvent) => {
    if (menuJustClosedRef.current) {
      menuJustClosedRef.current = false;
      return;
    }
    if (!('touches' in e) && Date.now() - lastTouchTime.current < 500) return;
    if ((tool === 'bucket' || tool === 'pipette') && currentPath.current && currentPath.current.length > 0) {
      if (!pinchRef.current) {
        const {x, y} = currentPath.current[0];
        const ctx = ctxRef.current;
        if (ctx) {
          if (tool === 'bucket') {
            const now = Date.now();
            if (now - lastBucketFillTimeRef.current < 500) {
              releasePoints(currentPath.current);
              return;
            }
            lastBucketFillTimeRef.current = now;

            floodFill(ctx, x, y, color, currentOpacity, DPR);
            saveHistory();
            if (socket && socket.connected) {
               const msg = encodeBinaryDrawMessage('draw_action', {
                 instanceId, tool: 'bucket', color, opacity: currentOpacity, x: x / LOGICAL_WIDTH, y: y / LOGICAL_HEIGHT
               });
               socket.emit('draw_binary', msg);
            }
          } else if (tool === 'pipette') {
            let offscreenCanvas: HTMLCanvasElement | null = document.createElement('canvas');
            offscreenCanvas.width = ctx.canvas.width;
            offscreenCanvas.height = ctx.canvas.height;
            const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
            
            if (offscreenCtx) {
              offscreenCtx.drawImage(ctx.canvas, 0, 0);
              const rx = Math.floor(x * DPR);
              const ry = Math.floor(y * DPR);
              const pData = offscreenCtx.getImageData(rx, ry, 1, 1).data;
              const hex = "#" + ("000000" + ((pData[0] << 16) | (pData[1] << 8) | pData[2]).toString(16)).slice(-6);
              setColor(hex);
              changeTool(previousTool.current);
            }
            
            offscreenCanvas.width = 0;
            offscreenCanvas.height = 0;
            offscreenCanvas = null;
          }
        }
      }
      releasePoints(currentPath.current);
    }

    if (isDrawing) {
      if (throttleTimeoutRef.current) {
         clearTimeout(throttleTimeoutRef.current);
         throttleTimeoutRef.current = null;
      }
      if (moveBatchRef.current.length > 0) {
         emitDrawCommand('draw_move', {
           moves: moveBatchRef.current
         });
         moveBatchRef.current = [];
      }
      
      if (flushLocalRenderRef.current) {
        flushLocalRenderRef.current();
      }
      
      ctxRef.current?.closePath();
      tempCtxRef.current?.closePath();
      setIsDrawing(false);
      needsRenderRef.current = false;

      if (tool !== 'bucket' && tool !== 'pipette') {
        const tempCtx = tempCtxRef.current;
        
        if (tool === 'pencil' || tool === 'eraser') {
          if (tempCtx) {
            const n = currentPath.current.length;
            if (n >= 2) {
              tempCtx.beginPath();
              tempCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
              tempCtx.lineWidth = currentWidth;
              tempCtx.lineCap = 'round';
              tempCtx.lineJoin = 'round';
              tempCtx.globalAlpha = 1;
              
              const p1 = currentPath.current[n - 2];
              const p2 = currentPath.current[n - 1];
              const midX = (p1.x + p2.x) / 2;
              const midY = (p1.y + p2.y) / 2;
              tempCtx.moveTo(midX, midY);
              tempCtx.lineTo(p2.x, p2.y);
              tempCtx.stroke();
            }
          }
        }

        const ctx = ctxRef.current;
        const tempCanvas = tempCanvasRef.current;
        if (ctx && tempCanvas && tempCtx) {
          ctx.globalAlpha = currentOpacity;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(tempCanvas, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
          tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
        }
      }

      saveHistory();

      const lastCoords = currentPath.current && currentPath.current.length > 0
        ? currentPath.current[currentPath.current.length - 1]
        : null;
      const startCoords = currentPath.current && currentPath.current.length > 0
        ? currentPath.current[0]
        : {x: 0, y: 0};
      
      emitDrawCommand('draw_end', { 
        tool, color, width: currentWidth, opacity: currentOpacity,
        startX: startCoords.x / LOGICAL_WIDTH, startY: startCoords.y / LOGICAL_HEIGHT,
        x: lastCoords ? lastCoords.x / LOGICAL_WIDTH : 0, 
        y: lastCoords ? lastCoords.y / LOGICAL_HEIGHT : 0
      });

      releasePoints(currentPath.current);
    }
  };

  // 60FPS Draw Loop
  const flushLocalRenderRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let rAFId: number;
    
    const flushLocalRender = () => {
      if (!isDrawing || !needsRenderRef.current) return;
      const tempCtx = tempCtxRef.current;
      if (!tempCtx) return;

      if (tool === 'pencil' || tool === 'eraser') {
        const path = currentPath.current;
        const len = path.length;
        if (len === 0) return;

        const startIndex = lastRenderedIndexRef.current;
        if (startIndex < len) {
          tempCtx.beginPath();
          tempCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
          tempCtx.lineWidth = currentWidth;
          tempCtx.lineCap = 'round';
          tempCtx.lineJoin = 'round';
          tempCtx.shadowBlur = IS_LOW_END ? 0 : 1;
          tempCtx.shadowColor = color;
          tempCtx.globalAlpha = 1;

          if (startIndex === 0) {
            tempCtx.fillStyle = tempCtx.strokeStyle;
            tempCtx.arc(path[0].x, path[0].y, currentWidth / 2, 0, Math.PI * 2);
            tempCtx.fill();
            lastRenderedIndexRef.current = 1;
          }

          for (let i = Math.max(1, startIndex); i < len; i++) {
            const p1 = path[i - 1];
            const p2 = path[i];
            
            if (i === 1) {
              tempCtx.moveTo(p1.x, p1.y);
              tempCtx.lineTo(p2.x, p2.y);
            } else {
              const p0 = path[i - 2];
              const mid1X = (p0.x + p1.x) / 2;
              const mid1Y = (p0.y + p1.y) / 2;
              const mid2X = (p1.x + p2.x) / 2;
              const mid2Y = (p1.y + p2.y) / 2;
              tempCtx.moveTo(mid1X, mid1Y);
              tempCtx.quadraticCurveTo(p1.x, p1.y, mid2X, mid2Y);
            }
          }
          tempCtx.stroke();
          tempCtx.shadowBlur = 0;
          lastRenderedIndexRef.current = len;
        }
      } else {
        const path = currentPath.current;
        const len = path.length;
        if (len > 0) {
          const x = path[len - 1].x;
          const y = path[len - 1].y;
          const startX = path[0].x;
          const startY = path[0].y;

          tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
          tempCtx.beginPath();
          tempCtx.strokeStyle = color;
          tempCtx.fillStyle = color;
          tempCtx.lineWidth = currentWidth;
          tempCtx.lineCap = 'round';
          tempCtx.lineJoin = 'round';
          tempCtx.shadowBlur = 0;
          
          if (tool === 'line') {
            tempCtx.moveTo(startX, startY);
            tempCtx.lineTo(x, y);
            tempCtx.stroke();
          } else if (tool === 'strokeRect') {
            tempCtx.lineJoin = 'miter';
            tempCtx.strokeRect(startX, startY, x - startX, y - startY);
          } else if (tool === 'fillRect') {
            tempCtx.fillRect(startX, startY, x - startX, y - startY);
          } else if (tool === 'strokeCircle') {
            const radius = Math.hypot(x - startX, y - startY);
            tempCtx.arc(startX, startY, radius, 0, Math.PI * 2);
            tempCtx.stroke();
          } else if (tool === 'fillCircle') {
            const radius = Math.hypot(x - startX, y - startY);
            tempCtx.arc(startX, startY, radius, 0, Math.PI * 2);
            tempCtx.fill();
          }
        }
      }
      needsRenderRef.current = false;
    };

    flushLocalRenderRef.current = flushLocalRender;

    const renderLoop = () => {
      flushLocalRender();
      rAFId = requestAnimationFrame(renderLoop);
    };
    
    rAFId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rAFId);
  }, [isDrawing, tool, color, currentWidth]);

  useEffect(() => {
    const handleUp = (e: MouseEvent | TouchEvent) => {
      if (isDrawing || currentPath.current.length > 0) {
         handlePointerUp(e);
      }
    };
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDrawing, tool, color, currentWidth, currentOpacity]);

  useEffect(() => {
    const preventDefault = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', preventDefault, { passive: false });
    return () => document.removeEventListener('touchmove', preventDefault);
  }, []);

  return (
    <div 
      ref={containerRef} 
      dir="ltr" 
      className="flex-1 relative bg-slate-100 overflow-hidden w-full h-full cursor-crosshair"
    >
      {/* Transform Wrapper for Pinch-to-Zoom and Base Scale */}
      <div 
        ref={transformWrapperRef}
        className="absolute left-0 top-0 transform-gpu"
        style={{ 
          width: LOGICAL_WIDTH,
          height: LOGICAL_HEIGHT,
          transformOrigin: '0 0',
          willChange: 'transform'
        }}
      >
        <canvas 
          ref={canvasRef} 
          className="w-full h-full touch-none pointer-events-none bg-white block"
        />
        <canvas 
          ref={tempCanvasRef} 
          className="absolute inset-0 w-full h-full touch-none pointer-events-none block"
        />
      </div>

      {/* Interaction Layer (covers full screen container) */}
      {!readOnly && (
        <div 
          ref={interactionLayerRef}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          className="absolute inset-0 z-10 touch-none"
        />
      )}

      {/* Brush Size Preview Bubble */}
      {previewSize !== null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50 touch-none">
          <div 
            className="rounded-full border border-black shadow-[0_0_0_1px_rgba(255,255,255,0.8)]"
            style={{
              width: previewSize * transformRef.current.scale * baseScale,
              height: previewSize * transformRef.current.scale * baseScale,
            }}
          />
        </div>
      )}
    </div>
  );
});

DrawingCanvasCore.displayName = 'DrawingCanvasCore';

export default DrawingCanvasCore;

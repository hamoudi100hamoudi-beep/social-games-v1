/* 
 * ! PROTECTED FILE !
 * This component is finalized. Do NOT modify without consulting the user.
 */
import React, { useEffect, useRef, useState, useId, useMemo } from 'react';
import { useSocket } from './SocketProvider';
import { 
  Pencil, Eraser, Undo2, Redo2, FileX, RefreshCcw, 
  Lightbulb, UserMinus, X, Circle, Square, PaintBucket, Minus, Pipette, Camera 
} from 'lucide-react';

const TOP_COLORS = ['#000000', '#666666', '#0000ff', '#ffffff', '#aaaaaa', '#00ffff', '#00ff00', '#ff0000', '#ff8800', '#ffff00', '#800080'];
const BOT_COLORS = ['#8B4513', '#800000', '#ff00ff', '#ffb6c1', '#00fa9a', '#add8e6', '#f0e68c', '#ff4500', '#2e8b57', '#4b0082', '#000080'];

type ToolType = 'pencil' | 'eraser' | 'bucket' | 'line' | 'strokeRect' | 'fillRect' | 'strokeCircle' | 'fillCircle' | 'pipette';

const matchColor = (data: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number) => {
  const tolerance = 40; 
  return Math.abs(data[i] - r) <= tolerance && 
         Math.abs(data[i+1] - g) <= tolerance && 
         Math.abs(data[i+2] - b) <= tolerance && 
         Math.abs(data[i+3] - a) <= tolerance;
};

const floodFill = (ctx: CanvasRenderingContext2D, startX: number, startY: number, fillColorStr: string, fillOpacity: number = 1) => {
  const canvas = ctx.canvas;
  const cw = canvas.width, ch = canvas.height;
  
  const imageData = ctx.getImageData(0, 0, cw, ch);
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
  
  const visited = new Uint8Array(cw * ch);
  
  const stack = [sx, sy];
  let iterations = 0;
  const maxIterations = cw * ch;

  while(stack.length > 0 && iterations < maxIterations) {
    iterations++;
    const y = stack.pop()!;
    let x = stack.pop()!;
    
    let idx = (y * cw + x) * 4;
    let pixelIdx = y * cw + x;
    while(x >= 0 && !visited[pixelIdx] && matchColor(data, idx, tr, tg, tb, ta)) {
      x--;
      idx -= 4;
      pixelIdx--;
    }
    x++;
    idx += 4;
    pixelIdx++;
    
    let reachAbove = false;
    let reachBelow = false;
    
    while(x < cw && !visited[pixelIdx] && matchColor(data, idx, tr, tg, tb, ta)) {
      // Alpha blending
      const destA = data[idx+3] / 255;
      const outA = fillOpacity + destA * (1 - fillOpacity);
      
      if (outA > 0) {
        data[idx] = Math.round((fr * fillOpacity + data[idx] * destA * (1 - fillOpacity)) / outA);
        data[idx+1] = Math.round((fg * fillOpacity + data[idx+1] * destA * (1 - fillOpacity)) / outA);
        data[idx+2] = Math.round((fb * fillOpacity + data[idx+2] * destA * (1 - fillOpacity)) / outA);
        data[idx+3] = Math.round(outA * 255);
      } else {
        data[idx] = fr;
        data[idx+1] = fg;
        data[idx+2] = fb;
        data[idx+3] = 0;
      }
      visited[pixelIdx] = 1;
      
      if (y > 0) {
        if (!visited[pixelIdx - cw] && matchColor(data, idx - cw*4, tr, tg, tb, ta)) {
          if (!reachAbove) {
            stack.push(x, y-1);
            reachAbove = true;
          }
        } else if (reachAbove) {
          reachAbove = false;
        }
      }
      if (y < ch - 1) {
        if (!visited[pixelIdx + cw] && matchColor(data, idx + cw*4, tr, tg, tb, ta)) {
          if (!reachBelow) {
            stack.push(x, y+1);
            reachBelow = true;
          }
        } else if (reachBelow) {
          reachBelow = false;
        }
      }
      x++;
      idx += 4;
      pixelIdx++;
    }
  }
  ctx.putImageData(imageData, 0, 0);
};

const LOGICAL_WIDTH = 1200;
const LOGICAL_HEIGHT = 900;

let _cachedDPR = 0;
const getAdaptiveDPR = () => {
  if (typeof window === 'undefined') return 2;
  if (_cachedDPR > 0) return _cachedDPR;
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  const nav: any = navigator;
  const cpuCount = nav.hardwareConcurrency || 4;
  const memory = nav.deviceMemory || 4;
  if (cpuCount <= 4 || memory <= 4) dpr = Math.min(dpr, 1.2);
  if (cpuCount <= 2 || memory <= 2) dpr = Math.min(dpr, 1.0);
  _cachedDPR = dpr;
  return dpr;
};
const DPR = typeof window !== 'undefined' ? getAdaptiveDPR() : 2;

export default function DrawingBoard({ 
  readOnly = false,
  onSkipTurn,
  onRequestHint,
  hintsRemaining = 0,
  timerPercentage = 0,
  timerBarNode
}: { 
  readOnly?: boolean;
  onSkipTurn?: () => void;
  onRequestHint?: () => void;
  hintsRemaining?: number;
  timerPercentage?: number;
  timerBarNode?: React.ReactNode;
}) {
  const instanceId = useId();
  const { socket } = useSocket();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const tempCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // State
  const [activeMenu, setActiveMenu] = useState<'tools' | 'controls' | null>(null);
  const [tool, setTool] = useState<ToolType>('pencil');
  const [color, setColor] = useState('#000000');
  const [penWidth, setPenWidth] = useState(5);
  const [penOpacity, setPenOpacity] = useState(1);
  const [eraserWidth, setEraserWidth] = useState(40);
  const [eraserOpacity, setEraserOpacity] = useState(1);
  const [bucketOpacity, setBucketOpacity] = useState(1);
  const [previewSize, setPreviewSize] = useState<number | null>(null);
  
  // Transform is managed directly via ref to bypass React render for 60fps pinch-to-zoom
  const transformRef = useRef({ scale: 1, x: 0, y: 0 });
  const transformWrapperRef = useRef<HTMLDivElement>(null);
  
  const [historyState, setHistoryState] = useState({ index: 0, length: 0 });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [baseScale, setBaseScale] = useState(1);
  const hasInitializedTransform = useRef(false);
  const moveBatchRef = useRef<{x: number, y: number}[]>([]);
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
  
  const getContainerCoord = (viewportX: number, viewportY: number) => {
    const container = containerRef.current;
    if (!container) return { x: viewportX, y: viewportY };
    const rect = container.getBoundingClientRect();
    return { x: viewportX - rect.left, y: viewportY - rect.top };
  };

  const clampTransform = (newX: number, newY: number, newScale: number, currentBaseScale: number) => {
    const container = containerRef.current;
    if (!container) return { x: newX, y: newY };
    const { width, height } = container.getBoundingClientRect();
    
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
    };
  };
  
  const prevRemote = useRef<{x: number, y: number} | null>(null);
  const remoteProps = useRef({ tool: 'pencil', color: '#000', width: 5, opacity: 1 });

  useEffect(() => {
    if (!socket) return;
    
    const onDrawStart = (data: any, isReplay = false) => {
      if (!isReplay && data.instanceId === instanceId) return;
      remoteProps.current = data;
      const x = data.x * LOGICAL_WIDTH;
      const y = data.y * LOGICAL_HEIGHT;
      prevRemote.current = {x, y};

      const ctx = ctxRef.current;
      const tempCtx = tempCtxRef.current;
      const tempCanvas = tempCanvasRef.current;
      if (!ctx || !tempCtx || !tempCanvas) return;

      const { tool, color, opacity } = data;
      let activeCtx = (tool === 'pencil' || tool === 'eraser') ? tempCtx : ctx;

      if (tool === 'pencil' || tool === 'eraser') {
        tempCanvas.style.opacity = opacity.toString();
        activeCtx.globalAlpha = 1;
        activeCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
        activeCtx.globalCompositeOperation = 'source-over';
      } else {
        activeCtx.globalAlpha = opacity;
        activeCtx.strokeStyle = color;
        activeCtx.fillStyle = color;
        activeCtx.globalCompositeOperation = 'source-over';
      }

      if (tool === 'pencil' || tool === 'eraser' || tool === 'line') {
        activeCtx.beginPath();
        activeCtx.lineCap = 'round';
        activeCtx.lineJoin = 'round';
        activeCtx.lineWidth = data.width;
        activeCtx.moveTo(x, y);
        activeCtx.lineTo(x, y);
        if (tool === 'pencil') {
          activeCtx.shadowBlur = 1;
          activeCtx.shadowColor = color;
        } else {
          activeCtx.shadowBlur = 0;
          activeCtx.shadowColor = 'transparent';
        }
        activeCtx.stroke();
        activeCtx.shadowBlur = 0;
      } else if (tool === 'strokeCircle') {
        activeCtx.beginPath();
        activeCtx.lineWidth = data.width;
        activeCtx.arc(x, y, 1, 0, Math.PI*2);
        activeCtx.stroke();
      } else if (tool === 'fillCircle') {
        activeCtx.beginPath();
        activeCtx.arc(x, y, 1, 0, Math.PI*2);
        activeCtx.fill();
      }
    };

    const onDrawMove = (data: any, isReplay = false) => {
      if (!isReplay && data.instanceId === instanceId) return;
      const ctx = ctxRef.current;
      const tempCtx = tempCtxRef.current;
      if (!ctx || !tempCtx || !prevRemote.current) return;
      const { color, width, tool, opacity } = remoteProps.current;
      
      const processPoint = (ptX: number, ptY: number) => {
        const x = ptX * LOGICAL_WIDTH;
        const y = ptY * LOGICAL_HEIGHT;

        if (tool === 'pencil' || tool === 'eraser') {
          let activeCtx = tempCtx;
          activeCtx.beginPath();
          activeCtx.lineCap = 'round';
          activeCtx.lineJoin = 'round';
          activeCtx.lineWidth = width;
          activeCtx.globalAlpha = 1;
          activeCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
          activeCtx.moveTo(prevRemote.current!.x, prevRemote.current!.y);
          activeCtx.lineTo(x, y);
          
          if (tool === 'pencil') {
            activeCtx.shadowBlur = 1;
            activeCtx.shadowColor = color;
          } else {
            activeCtx.shadowBlur = 0;
            activeCtx.shadowColor = 'transparent';
          }
          
          activeCtx.stroke();
          activeCtx.shadowBlur = 0;
          prevRemote.current = {x, y};
        } else if (!isReplay) {
          const canvas = canvasRef.current;
          const lastData = history.current[historyIndex.current];
          if (lastData) {
            ctx.putImageData(lastData, 0, 0);
          } else if (canvas) {
            ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
          }
          
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          ctx.lineWidth = width;
          ctx.globalAlpha = opacity;

          const startX = prevRemote.current!.x;
          const startY = prevRemote.current!.y;

          if (tool === 'line') {
            ctx.moveTo(startX, startY);
            ctx.lineTo(x, y);
            ctx.stroke();
          } else if (tool === 'strokeRect') {
            ctx.lineJoin = 'miter';
            ctx.strokeRect(startX, startY, x - startX, y - startY);
          } else if (tool === 'fillRect') {
            ctx.fillRect(startX, startY, x - startX, y - startY);
          } else if (tool === 'strokeCircle') {
            const radius = Math.hypot(x - startX, y - startY);
            ctx.arc(startX, startY, radius, 0, Math.PI * 2);
            ctx.stroke();
          } else if (tool === 'fillCircle') {
            const radius = Math.hypot(x - startX, y - startY);
            ctx.arc(startX, startY, radius, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      };

      if (data.moves && Array.isArray(data.moves)) {
        for (const pt of data.moves) {
           processPoint(pt.x, pt.y);
        }
      } else {
        processPoint(data.x, data.y);
      }
    };

    const onDrawEnd = (data?: any, skipSave = false, isReplay = false) => {
      if (!isReplay && data?.instanceId === instanceId) return;
      
      const tool = data?.tool || remoteProps.current.tool;
      const opacity = data?.opacity || remoteProps.current.opacity;
      const color = data?.color || remoteProps.current.color;
      const width = data?.width || remoteProps.current.width;
      const ctx = ctxRef.current;
      
      if (tool === 'pencil' || tool === 'eraser') {
        const tempCanvas = tempCanvasRef.current;
        const tempCtx = tempCtxRef.current;
        if (ctx && tempCanvas && tempCtx) {
          ctx.globalAlpha = opacity;
          ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
          ctx.drawImage(tempCanvas, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
          tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
      } else if (data && data.x !== undefined && data.y !== undefined && ctx) {
        // Redraw exact final shape for line and shapes
        if (!isReplay) {
          const canvas = canvasRef.current;
          const lastData = history.current[historyIndex.current];
          if (lastData) {
            ctx.putImageData(lastData, 0, 0);
          } else if (canvas) {
            ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
          }
        }
        
        ctx.beginPath();
        const activeColor = data.color || color;
        ctx.strokeStyle = activeColor;
        ctx.fillStyle = activeColor;
        ctx.lineWidth = data.width || width;
        ctx.globalAlpha = data.opacity || opacity;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const startX = data.startX * LOGICAL_WIDTH;
        const startY = data.startY * LOGICAL_HEIGHT;
        const finalX = data.x * LOGICAL_WIDTH;
        const finalY = data.y * LOGICAL_HEIGHT;

        const remoteTool = data.tool || tool;

        if (remoteTool === 'line') {
          ctx.moveTo(startX, startY);
          ctx.lineTo(finalX, finalY);
          ctx.stroke();
        } else if (remoteTool === 'strokeRect') {
          ctx.lineJoin = 'miter';
          ctx.strokeRect(startX, startY, finalX - startX, finalY - startY);
        } else if (remoteTool === 'fillRect') {
          ctx.fillRect(startX, startY, finalX - startX, finalY - startY);
        } else if (remoteTool === 'strokeCircle') {
          const radius = Math.hypot(finalX - startX, finalY - startY);
          ctx.arc(startX, startY, radius, 0, Math.PI * 2);
          ctx.stroke();
        } else if (remoteTool === 'fillCircle') {
          const radius = Math.hypot(finalX - startX, finalY - startY);
          ctx.arc(startX, startY, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      prevRemote.current = null;
      if (!skipSave) saveHistory();
    };

    const onDrawClear = (data?: any, isReplay = false) => {
      clearCanvas(false);
    };

    const onDrawAction = (data: any, skipSave = false, isReplay = false) => {
      if (!isReplay && data.instanceId === instanceId) return;
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (data.tool === 'bucket') {
        floodFill(ctx, data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT, data.color, data.opacity);
        if (!skipSave) saveHistory();
      }
    };

    const onDrawCancel = (data?: any) => {
      if (data?.instanceId === instanceId) return;
      const { tool } = remoteProps.current;
      if (tool === 'pencil' || tool === 'eraser') {
        const tempCtx = tempCtxRef.current;
        tempCtx?.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
      } else {
        const ctx = ctxRef.current;
        if (ctx) {
           const lastData = history.current[historyIndex.current];
           if (lastData) {
             ctx.putImageData(lastData, 0, 0);
           } else {
             const canvas = canvasRef.current;
             if (canvas) {
               ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
             }
           }
        }
      }
      prevRemote.current = null;
    };

    socket.on('draw_start', onDrawStart);
    socket.on('draw_move', onDrawMove);
    socket.on('draw_end', onDrawEnd);
    socket.on('draw_cancel', onDrawCancel);
    socket.on('draw_clear', onDrawClear);
    socket.on('draw_action', onDrawAction);

    socket.on('draw_undo', (data?: any) => {
      undo(false); // Called by server for everybody to fallback, but history is synced
    });
    
    socket.on('draw_redo', (data?: any) => {
      if (data?.instanceId === instanceId) return;
      redo(false);
    });

    socket.on('draw_history_sync', (commands: any[]) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      
      // Replay all commands
      for (const cmd of commands) {
         if (cmd.event === 'draw_start') onDrawStart(cmd.data, true);
         else if (cmd.event === 'draw_move') onDrawMove(cmd.data, true);
         else if (cmd.event === 'draw_end') onDrawEnd(cmd.data, true, true);
         else if (cmd.event === 'draw_action') onDrawAction(cmd.data, true, true);
      }
    });

    return () => {
      socket.off('draw_start', onDrawStart);
      socket.off('draw_move', onDrawMove);
      socket.off('draw_end', onDrawEnd);
      socket.off('draw_clear', onDrawClear);
      socket.off('draw_action', onDrawAction);
      socket.off('draw_undo');
      socket.off('draw_redo');
      socket.off('draw_history_sync');
    };
  }, [socket]);

  const changeTool = (newTool: ToolType) => {
    if (newTool !== 'pipette') {
      previousTool.current = newTool;
    }
    setTool(newTool);
    setActiveMenu(null);
  };


  const currentWidth = tool === 'eraser' ? eraserWidth : penWidth;
  const currentOpacity = tool === 'eraser' ? eraserOpacity : (tool === 'bucket' ? bucketOpacity : penOpacity);
  
  // History
  const history = useRef<ImageData[]>([]);
  const historyIndex = useRef(-1);
  const lastTouch = useRef({ dist: 0, x: 0, y: 0 });
  const currentPath = useRef<{x: number, y: number}[]>([]);
  const pinchRef = useRef(false);
  const previousTool = useRef<ToolType>('pencil');

  // Init canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    if (!canvas || !tempCanvas) return;
    
    // For crisp display on Retina, multiply by DPR
    canvas.width = LOGICAL_WIDTH * DPR;
    canvas.height = LOGICAL_HEIGHT * DPR;
    tempCanvas.width = LOGICAL_WIDTH * DPR;
    tempCanvas.height = LOGICAL_HEIGHT * DPR;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tempCtx = tempCanvas.getContext('2d');
    if (ctx && tempCtx) {
      ctx.scale(DPR, DPR);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctxRef.current = ctx;
      
      tempCtx.scale(DPR, DPR);
      tempCtx.lineCap = 'round';
      tempCtx.lineJoin = 'round';
      tempCtxRef.current = tempCtx;
      
      // Initialize with white background
      ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      
      // Reset history to avoid double initialization in React StrictMode
      history.current = [];
      historyIndex.current = -1;
      saveHistory(); // Save initial blank state
    }
    
    // Prevent default touch behaviors entirely on window to be safe against pull-to-refresh
    const preventDefault = (e: TouchEvent) => {
       if (e.target === canvas) e.preventDefault();
    };
    document.addEventListener('touchmove', preventDefault, { passive: false });
    return () => document.removeEventListener('touchmove', preventDefault);
  }, []);

  const saveHistory = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    history.current = history.current.slice(0, historyIndex.current + 1);
    history.current.push(data);
    
    const MAX_HISTORY = 10;
    while (history.current.length > MAX_HISTORY + 1) {
      history.current.shift();
    }
    historyIndex.current = history.current.length - 1;
    setHistoryState({ index: historyIndex.current, length: history.current.length });
  };

  const lastUndoTime = useRef(0);
  const lastRedoTime = useRef(0);

  const undo = (emit = true) => {
    if (emit && Date.now() - lastUndoTime.current < 200) return;
    if (emit) lastUndoTime.current = Date.now();
    
    if (emit && socket) {
      socket.emit('draw_undo', { instanceId });
      if (historyIndex.current > 0) {
        historyIndex.current--;
        setHistoryState({ index: historyIndex.current, length: history.current.length });
      }
    } else if (!emit && historyIndex.current > 0) {
      // Local fallback (not used in server-driven mostly, unless needed)
      historyIndex.current--;
      const data = history.current[historyIndex.current];
      ctxRef.current?.putImageData(data, 0, 0);
      setHistoryState({ index: historyIndex.current, length: history.current.length });
    }
  };

  const redo = (emit = true) => {
    if (emit && Date.now() - lastRedoTime.current < 200) return;
    if (emit) lastRedoTime.current = Date.now();
    
    if (emit && socket) {
      socket.emit('draw_redo', { instanceId });
      if (historyIndex.current < history.current.length - 1) {
        historyIndex.current++;
        setHistoryState({ index: historyIndex.current, length: history.current.length });
      }
    } else if (!emit && historyIndex.current < history.current.length - 1) {
      historyIndex.current++;
      const data = history.current[historyIndex.current];
      ctxRef.current?.putImageData(data, 0, 0);
      setHistoryState({ index: historyIndex.current, length: history.current.length });
    }
  };

  const clearCanvas = (emit = true) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    const tempCtx = tempCtxRef.current;
    if (tempCtx) {
       tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
    }
    
    // Wipe local history entirely, start fresh
    history.current = [];
    historyIndex.current = -1;
    saveHistory(); // Creates the first blank snapshot at index 0

    if (emit && socket) {
      socket.emit('draw_clear', { instanceId });
    }
  };

  const requestClearCanvas = () => {
    setShowClearConfirm(true);
  };

  const confirmClear = () => {
    clearCanvas(true);
    setShowClearConfirm(false);
  };

  const downloadScreenshot = () => {
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
      alert("حدث خطأ أثناء حفظ الرسمة.");
    }
  };

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

  const handlePointerDown = (e: React.TouchEvent | React.MouseEvent) => {
    setActiveMenu(null); // Close menus when interacting with canvas
    
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
          // Erase the accidental start of the stroke
          const lastData = history.current[historyIndex.current];
          if (lastData) {
            ctxRef.current?.putImageData(lastData, 0, 0);
          } else {
            const canvas = canvasRef.current;
            if (canvas) {
              const ctx = ctxRef.current;
              if (ctx) {
                ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
              }
            }
          }
          if (socket) {
            socket.emit('draw_cancel', { instanceId });
          }
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
       currentPath.current = [{x, y}];
       return;
    }

    currentPath.current = [{x, y}];
    setIsDrawing(true);
    
    // Choose context based on tool
    let activeCtx = (tool === 'pencil' || tool === 'eraser') ? tempCtx : ctx;
    
    if (tool === 'pencil' || tool === 'eraser') {
      tempCanvas.style.opacity = currentOpacity.toString();
      activeCtx.globalAlpha = 1; // Draw solid on temp canvas, css handles opacity
      activeCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
      
      // We always draw with source-over on the tempCanvas, even for eraser. 
      // The erasing part (destination-out) happens when we composite onto the main canvas in handlePointerUp
      activeCtx.globalCompositeOperation = 'source-over';
    } else {
      activeCtx.globalAlpha = currentOpacity;
      activeCtx.strokeStyle = color;
      activeCtx.fillStyle = color;
      activeCtx.globalCompositeOperation = 'source-over';
    }

    activeCtx.beginPath();
    activeCtx.lineCap = 'round';
    activeCtx.lineJoin = 'round';
    activeCtx.lineWidth = currentWidth;
    
    if (socket && (tool === 'pencil' || tool === 'eraser' || tool === 'line' || tool === 'strokeRect' || tool === 'fillRect' || tool === 'strokeCircle' || tool === 'fillCircle')) {
       socket.emit('draw_start', {
          instanceId, tool, color, width: currentWidth, opacity: currentOpacity,
          x: x / LOGICAL_WIDTH, y: y / LOGICAL_HEIGHT
       });
    }

    if (tool === 'pencil' || tool === 'eraser' || tool === 'line') {
      activeCtx.moveTo(x, y);
      activeCtx.lineTo(x, y);
      if (tool === 'pencil') {
        activeCtx.shadowBlur = 1;
        activeCtx.shadowColor = color;
      } else {
        activeCtx.shadowBlur = 0;
        activeCtx.shadowColor = 'transparent';
      }
      activeCtx.stroke();
      activeCtx.shadowBlur = 0;
    } else if (tool === 'strokeCircle') {
      activeCtx.arc(x, y, 1, 0, Math.PI*2);
      activeCtx.stroke();
    } else if (tool === 'fillCircle') {
      activeCtx.arc(x, y, 1, 0, Math.PI*2);
      activeCtx.fill();
    }
    
    ctx.shadowBlur = 0;
  };

  const handlePointerMove = (e: React.TouchEvent | React.MouseEvent) => {
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

        const clamped = clampTransform(newX, newY, newScale, baseScale);
        transformRef.current = { scale: newScale, x: clamped.x, y: clamped.y };
        applyTransform();

        lastTouch.current = { dist, x: cx, y: cy };
        
        // Failsafe exit drawing if tracking slipped
        if (isDrawing) {
            setIsDrawing(false);
            ctxRef.current?.closePath();
            tempCtxRef.current?.closePath();
            tempCtxRef.current?.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
            // Erase the accidental start of the stroke
            const lastData = history.current[historyIndex.current];
            if (lastData) {
              ctxRef.current?.putImageData(lastData, 0, 0);
            } else {
              const canvas = canvasRef.current;
              if (canvas) {
                const ctx = ctxRef.current;
                if (ctx) {
                  ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
                }
              }
            }
            if (socket) {
              socket.emit('draw_cancel', { instanceId });
            }
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

    currentPath.current.push({x, y});
    const len = currentPath.current.length;
    const prev = currentPath.current[len - 2] || currentPath.current[0];
    const startX = currentPath.current[0].x;
    const startY = currentPath.current[0].y;

    if (tool === 'pencil' || tool === 'eraser') {
      // Point-to-point fast drawing
      const activeCtx = (tool === 'pencil' || tool === 'eraser') ? tempCtx : ctx;
      activeCtx.beginPath();
      activeCtx.moveTo(prev.x, prev.y);
      activeCtx.lineTo(x, y);
      activeCtx.stroke();
    } else {
      // Shape tools need preview redrawing
      const canvas = canvasRef.current;
      const baseImage = history.current[historyIndex.current];
      if (baseImage) {
        ctx.putImageData(baseImage, 0, 0);
      } else if (canvas) {
        ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      }

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = currentWidth;
      ctx.globalAlpha = currentOpacity;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      if (tool === 'line') {
        ctx.moveTo(startX, startY);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else if (tool === 'strokeRect') {
        ctx.lineJoin = 'miter';
        ctx.strokeRect(startX, startY, x - startX, y - startY);
      } else if (tool === 'fillRect') {
        ctx.fillRect(startX, startY, x - startX, y - startY);
      } else if (tool === 'strokeCircle') {
        const radius = Math.hypot(x - startX, y - startY);
        ctx.arc(startX, startY, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (tool === 'fillCircle') {
        const radius = Math.hypot(x - startX, y - startY);
        ctx.arc(startX, startY, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    if (socket) {
      if (tool === 'pencil' || tool === 'eraser') {
        const normX = x / LOGICAL_WIDTH;
        const normY = y / LOGICAL_HEIGHT;
        let shouldAdd = true;
        
        // Adaptive Path Simplification for weak devices
        if (DPR < 2 && moveBatchRef.current.length > 0) {
           const lastPt = moveBatchRef.current[moveBatchRef.current.length - 1];
           const dx = normX - lastPt.x;
           const dy = normY - lastPt.y;
           // If distance is less than 0.003 (approx 3 pixels), skip sending to network
           if (dx * dx + dy * dy < 0.000009) {
              shouldAdd = false;
           }
        }
        
        if (shouldAdd) {
           moveBatchRef.current.push({ x: normX, y: normY });
        }

        if (!throttleTimeoutRef.current) {
          throttleTimeoutRef.current = setTimeout(() => {
            if (socket && moveBatchRef.current.length > 0) {
               socket.emit('draw_move', {
                 instanceId, 
                 moves: moveBatchRef.current
               });
               moveBatchRef.current = [];
            }
            throttleTimeoutRef.current = null;
          }, DPR < 2 ? 26 : 16); // Optimize Batch Interval: 26ms for weak devices, 16ms for fast
        }
      } else {
        socket.emit('draw_move', {
          instanceId, x: x / LOGICAL_WIDTH, y: y / LOGICAL_HEIGHT
        });
      }
    }
  };

  const handlePointerUp = (e: React.TouchEvent | React.MouseEvent) => {
    if (!('touches' in e) && Date.now() - lastTouchTime.current < 500) return;
    if ((tool === 'bucket' || tool === 'pipette') && currentPath.current && currentPath.current.length > 0) {
      if (!pinchRef.current) {
        const {x, y} = currentPath.current[0];
        const ctx = ctxRef.current;
        if (ctx) {
          if (tool === 'bucket') {
            floodFill(ctx, x, y, color, currentOpacity);
            saveHistory();
            if (socket) {
               socket.emit('draw_action', {
                 instanceId, tool: 'bucket', color, opacity: currentOpacity, x: x / LOGICAL_WIDTH, y: y / LOGICAL_HEIGHT
               });
            }
          } else if (tool === 'pipette') {
            const rx = Math.floor(x * DPR);
            const ry = Math.floor(y * DPR);
            const pData = ctx.getImageData(rx, ry, 1, 1).data;
            const hex = "#" + ("000000" + ((pData[0] << 16) | (pData[1] << 8) | pData[2]).toString(16)).slice(-6);
            setColor(hex);
            changeTool(previousTool.current);
          }
        }
      }
      currentPath.current = [];
    }

    if (isDrawing) {
      if (throttleTimeoutRef.current) {
         clearTimeout(throttleTimeoutRef.current);
         throttleTimeoutRef.current = null;
      }
      if (socket && moveBatchRef.current.length > 0) {
         socket.emit('draw_move', {
           instanceId, 
           moves: moveBatchRef.current
         });
         moveBatchRef.current = [];
      }
      
      ctxRef.current?.closePath();
      tempCtxRef.current?.closePath();
      setIsDrawing(false);

      if (tool === 'pencil' || tool === 'eraser') {
        const ctx = ctxRef.current;
        const tempCanvas = tempCanvasRef.current;
        const tempCtx = tempCtxRef.current;
        if (ctx && tempCanvas && tempCtx) {
          ctx.globalAlpha = currentOpacity;
          ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
          ctx.drawImage(tempCanvas, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
          tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
        }
      }

      saveHistory();

      if (socket) {
        const lastCoords = currentPath.current && currentPath.current.length > 0
          ? currentPath.current[currentPath.current.length - 1]
          : null;
        const startCoords = currentPath.current && currentPath.current.length > 0
          ? currentPath.current[0]
          : {x: 0, y: 0};
        socket.emit('draw_end', { 
          instanceId,
          tool, color, width: currentWidth, opacity: currentOpacity,
          startX: startCoords.x / LOGICAL_WIDTH, startY: startCoords.y / LOGICAL_HEIGHT,
          x: lastCoords ? lastCoords.x / LOGICAL_WIDTH : 0, 
          y: lastCoords ? lastCoords.y / LOGICAL_HEIGHT : 0
        });
      }
    }
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-white touch-none select-none" dir="rtl">
      
      {showClearConfirm && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
           <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-[90%] text-center" dir="rtl">
              <h3 className="text-xl font-bold mb-2 text-slate-800">تأكيد المسح</h3>
              <p className="text-slate-600 mb-6">هل أنت متأكد من مسح مساحة الرسم بالكامل؟</p>
              <div className="flex gap-3 justify-center">
                 <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-800 font-medium hover:bg-slate-200 transition-colors">إلغاء</button>
                 <button onClick={confirmClear} className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-700 transition-colors">مسح بالكامل</button>
              </div>
           </div>
        </div>
      )}

      {/* Canvas Area */}
      <div ref={containerRef} dir="ltr" className="flex-1 relative bg-white overflow-hidden w-full h-full cursor-crosshair">
        
        {/* Transform Wrapper for Pinch-to-Zoom and Base Scale */}
        <div 
          ref={transformWrapperRef}
          className="absolute left-0 top-0 transform-gpu"
          style={{ 
            width: LOGICAL_WIDTH,
            height: LOGICAL_HEIGHT,
            transformOrigin: '0 0'
          }}
        >
          <canvas 
            ref={canvasRef} 
            className="w-full h-full touch-none pointer-events-none bg-white shadow-[0_0_30px_rgba(0,0,0,0.1)] block"
          />
          <canvas 
            ref={tempCanvasRef} 
            className="absolute inset-0 w-full h-full touch-none pointer-events-none block"
          />
        </div>

        {/* Interaction Layer (covers full screen container) */}
        {!readOnly && (
          <div 
            className="absolute inset-0 z-10 touch-none"
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseOut={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            onTouchCancel={handlePointerUp}
          />
        )}

        {/* Screenshot Button */}
        <div className="absolute top-2.5 left-2.5 z-20">
          <button 
            onClick={downloadScreenshot} 
            className="w-8 h-8 bg-black/40 text-white rounded-xl flex items-center justify-center shadow-sm hover:bg-black/55 active:scale-95 transition-all"
            title="التقاط صورة للرسمة"
          >
            <Camera size={16} strokeWidth={2.5} />
          </button>
        </div>

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

        {/* Overlay Menus */}
        {!readOnly && activeMenu === 'tools' && (
          <div className="absolute bottom-24 right-4 grid grid-cols-2 gap-2 bg-black/60 p-3 rounded-2xl border border-white/20 shadow-xl z-20 animate-in fade-in slide-in-from-bottom-2">
            <SubToolBtn icon={<Pencil />} active={tool==='pencil'} onClick={() => changeTool('pencil')} />
            <SubToolBtn icon={<Eraser />} active={tool==='eraser'} onClick={() => changeTool('eraser')} />
            <SubToolBtn icon={<Square fill="currentColor" />} active={tool==='fillRect'} onClick={() => changeTool('fillRect')} />
            <SubToolBtn icon={<Square />} active={tool==='strokeRect'} onClick={() => changeTool('strokeRect')} />
            <SubToolBtn icon={<Circle fill="currentColor" />} active={tool==='fillCircle'} onClick={() => changeTool('fillCircle')} />
            <SubToolBtn icon={<Circle />} active={tool==='strokeCircle'} onClick={() => changeTool('strokeCircle')} />
            <SubToolBtn icon={<PaintBucket />} active={tool==='bucket'} onClick={() => changeTool('bucket')} />
            <SubToolBtn icon={<Minus />} active={tool==='line'} onClick={() => changeTool('line')} />
            <SubToolBtn icon={<Pipette />} active={tool==='pipette'} onClick={() => changeTool('pipette')} />
            <SubToolBtn icon={<FileX />} onClick={requestClearCanvas} className="text-white !bg-rose-600/80 hover:!bg-rose-600 !border-rose-500" />
          </div>
        )}

        {/* Fixed Action Buttons (Undo/Redo) - Positioned bottom-left physical above toolbar */}
        {!readOnly && (
          <div className="absolute bottom-20 left-4 flex flex-col gap-3 z-20">
            <button 
              onClick={undo} 
              disabled={historyState.index <= 0}
              className={`w-12 h-12 bg-black/60 text-white rounded-2xl flex items-center justify-center shadow-md transition-all ${historyState.index <= 0 ? 'opacity-30 pointer-events-none' : 'hover:bg-black/70 active:scale-95'}`}
            >
              <Undo2 size={24} strokeWidth={2.5} />
            </button>
            <button 
              onClick={redo} 
              disabled={historyState.index >= historyState.length - 1}
              className={`w-12 h-12 bg-black/60 text-white rounded-2xl flex items-center justify-center shadow-md transition-all ${historyState.index >= historyState.length - 1 ? 'opacity-30 pointer-events-none' : 'hover:bg-black/70 active:scale-95'}`}
            >
              <Redo2 size={24} strokeWidth={2.5} />
            </button>
          </div>
        )}

        {/* Horizontal Sliders Area (Floating) */}
        {!readOnly && (
          <div className="absolute bottom-4 left-0 right-0 w-full flex items-center justify-center px-6 gap-6 z-20 pointer-events-none" dir="ltr">
            
            {/* Stroke Width Slider */}
            <div className="flex-1 relative flex items-center h-8 max-w-[45%] group pointer-events-auto" dir="ltr">
               {/* Track */}
               <div className="absolute inset-x-0 top-1/2 -mt-[5px] h-[10px] rounded-full bg-slate-300 pointer-events-none shadow-inner" />
               {/* Fill */}
               <div 
                  className="absolute left-0 top-1/2 -mt-[5px] h-[10px] rounded-l-full bg-[#1a56db] pointer-events-none" 
                  style={{ width: `${((currentWidth - 1) / ((tool === 'eraser' ? (typeof window !== 'undefined' ? window.innerWidth / 2 : 200) : 40) - 1)) * 100}%` }} 
               />
               
               <input 
                  type="range" min="1" max={tool === 'eraser' ? (typeof window !== 'undefined' ? window.innerWidth / 2 : 200) : 40} value={currentWidth} 
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (tool === 'eraser') setEraserWidth(val);
                    else setPenWidth(val);
                    setPreviewSize(val);
                  }}
                  onPointerUp={() => setPreviewSize(null)}
                  onPointerLeave={() => setPreviewSize(null)}
                  className="absolute inset-0 w-full h-full cursor-pointer appearance-none bg-transparent outline-none m-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-slate-300 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-slate-300"
                />
            </div>

            {/* Opacity Slider */}
            <div className="flex-1 relative flex items-center h-8 max-w-[45%] group pointer-events-auto" dir="ltr">
               {/* Track Background (Checkered) */}
               <div className="absolute inset-x-0 top-1/2 -mt-[5px] h-[10px] rounded-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjY2NjIi8+CjxyZWN0IHg9IjQiIHk9IjQiIHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNjY2MiLz4KPC9zdmc+')] pointer-events-none overflow-hidden border border-slate-300/50 shadow-inner block">
                 {/* Gradient Fill */}
                 <div className="absolute inset-0 w-full h-full" style={{ background: `linear-gradient(to right, transparent, ${tool === 'eraser' ? '#ffffff' : color})` }} />
               </div>
               
               <input 
                  type="range" min="10" max="100" value={currentOpacity * 100} 
                  onChange={(e) => {
                    const val = Number(e.target.value) / 100;
                    if (tool === 'eraser') setEraserOpacity(val);
                    else if (tool === 'bucket') setBucketOpacity(val);
                    else setPenOpacity(val);
                  }}
                  className="absolute inset-0 w-full h-full cursor-pointer appearance-none bg-transparent outline-none m-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-slate-300 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-slate-300"
                />
            </div>

          </div>
        )}

      </div>
      
      {/* External Timer Bar from GameRoom */}
      {!readOnly && timerBarNode}

      {/* Bottom Toolbar */}
      {!readOnly && (
        <div className="bg-[#1a56db] p-3 sm:p-4 flex items-center justify-between gap-3 shrink-0 pb-safe shadow-[0_-4px_10px_rgba(0,0,0,0.1)] z-30">
        
        {/* Action Buttons (Left side visually, but we are RTL, so right side visually) */}
        <div className="flex items-center gap-2 shrink-0">
          <ActionBtn 
            icon={<RefreshCcw strokeWidth={2.5} size={22} />} 
            active={tool === 'eraser'} 
            onClick={() => {
              if (tool === 'eraser') changeTool('pencil');
              else if (tool === 'pencil') changeTool('eraser');
              else changeTool('pencil');
            }} 
            className="!bg-[#facc15] !text-slate-800 hover:!bg-[#eab308] !border-transparent"
          />
          <ActionBtn 
            icon={
              tool === 'eraser' ? <Eraser strokeWidth={2.5} size={22} /> :
              tool === 'bucket' ? <PaintBucket strokeWidth={2.5} size={22} /> :
              tool === 'fillRect' ? <Square fill="currentColor" size={22} /> :
              tool === 'strokeRect' ? <Square strokeWidth={2.5} size={22} /> :
              tool === 'fillCircle' ? <Circle fill="currentColor" size={22} /> :
              tool === 'strokeCircle' ? <Circle strokeWidth={2.5} size={22} /> :
              tool === 'line' ? <Minus strokeWidth={2.5} size={22} /> :
              tool === 'pipette' ? <Pipette strokeWidth={2.5} size={22} /> :
              <Pencil strokeWidth={2.5} size={22} />
            } 
            active={activeMenu === 'tools' || (tool !== 'eraser' && !activeMenu)} 
            onClick={() => setActiveMenu(m => m === 'tools' ? null : 'tools')} 
            className="!bg-white !text-blue-600 !border-white" /* To make it prominent as main tool */
          />
          {hintsRemaining > 0 && onRequestHint && (
            <div className="relative">
              <ActionBtn 
                icon={<Lightbulb strokeWidth={2.5} size={22} />} 
                onClick={onRequestHint} 
                className="!bg-[#facc15] !text-slate-800 hover:!bg-[#eab308] !border-transparent flex" 
              />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                {hintsRemaining}
              </span>
            </div>
          )}
          {onSkipTurn && (
            <ActionBtn 
              icon={<UserMinus strokeWidth={2.5} size={22} />} 
              onClick={onSkipTurn} 
              className="!bg-red-500 !text-white hover:!bg-red-600 !border-transparent" 
            />
          )}
        </div>
        
        {/* Color Palette (Scrollable horizontally) */}
        <div className="flex-1 overflow-x-auto flex flex-col gap-1.5 no-scrollbar pl-1 select-none touch-pan-x" style={{ scrollbarWidth: 'none' }}>
          <div className="flex gap-1.5 min-w-max">
            {TOP_COLORS.map(c => (
              <ColorBtn key={c} color={c} active={color===c && tool !== 'eraser'} onClick={() => { setColor(c); setActiveMenu(null); if (tool === 'eraser') changeTool(previousTool.current); }} />
            ))}
          </div>
          <div className="flex gap-1.5 min-w-max">
            {BOT_COLORS.map(c => (
              <ColorBtn key={c} color={c} active={color===c && tool !== 'eraser'} onClick={() => { setColor(c); setActiveMenu(null); if (tool === 'eraser') changeTool(previousTool.current); }} />
            ))}
          </div>
        </div>
      </div>
      )}
      
    </div>
  );
}

// Components
function ActionBtn({ icon, active, onClick, className = '' }: { icon: React.ReactNode, active?: boolean, onClick: () => void, className?: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl transition-all shadow-sm
        ${active 
          ? 'bg-white text-[#1a56db] scale-105 shadow-md' 
          : 'bg-[#ffcc00] text-[#1a56db] hover:bg-white hover:scale-105 active:scale-95'
        } ${className}`}
    >
      {icon}
    </button>
  );
}

function SubToolBtn({ icon, active, onClick, className = '' }: { icon: React.ReactNode, active?: boolean, onClick: () => void, className?: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-12 h-12 flex items-center justify-center rounded-xl border transition-all
        ${active 
          ? 'bg-blue-600 border-blue-400 text-white shadow-inner scale-105' 
          : 'bg-white/10 border-transparent text-white hover:bg-white/20 ' + className
        }`}
    >
      {/* We clone icon to pass consistent sizing */}
      {React.cloneElement(icon as React.ReactElement, { size: 24, strokeWidth: 2.5 })}
    </button>
  );
}

function ColorBtn({ color, active, onClick }: { key?: React.Key, color: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg border-2 transition-all p-0.5
        ${active ? 'border-white scale-110 shadow-lg z-10' : 'border-transparent hover:scale-105'}`}
    >
      <div 
        className="w-full h-full rounded-md shadow-inner" 
        style={{ backgroundColor: color }}
      />
    </button>
  );
}

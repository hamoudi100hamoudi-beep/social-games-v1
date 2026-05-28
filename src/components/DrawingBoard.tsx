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

const compressPayload = (data: any): any => {
  if (!data) return data;
  const comp: any = {};
  if (data.instanceId !== undefined) comp.i = data.instanceId;
  if (data.tool !== undefined) comp.t = data.tool;
  if (data.color !== undefined) comp.c = data.color;
  if (data.width !== undefined) comp.w = data.width;
  if (data.opacity !== undefined) comp.o = Math.round(data.opacity * 100) / 100;
  if (data.x !== undefined) comp.x = Math.round(data.x * 10000);
  if (data.y !== undefined) comp.y = Math.round(data.y * 10000);
  if (data.startX !== undefined) comp.sx = Math.round(data.startX * 10000);
  if (data.startY !== undefined) comp.sy = Math.round(data.startY * 10000);
  if (data.moves !== undefined && Array.isArray(data.moves)) {
    comp.m = data.moves.map((pt: any) => ({
      x: Math.round(pt.x * 10000),
      y: Math.round(pt.y * 10000)
    }));
  }
  return comp;
};

const decompressPayload = (comp: any): any => {
  if (!comp) return comp;
  if (comp.instanceId !== undefined) return comp;
  const data: any = {};
  if (comp.i !== undefined) data.instanceId = comp.i;
  if (comp.t !== undefined) data.tool = comp.t;
  if (comp.c !== undefined) data.color = comp.c;
  if (comp.w !== undefined) data.width = comp.w;
  if (comp.o !== undefined) data.opacity = comp.o;
  if (comp.x !== undefined) data.x = comp.x / 10000;
  if (comp.y !== undefined) data.y = comp.y / 10000;
  if (comp.sx !== undefined) data.startX = comp.sx / 10000;
  if (comp.sy !== undefined) data.startY = comp.sy / 10000;
  if (comp.m !== undefined && Array.isArray(comp.m)) {
    data.moves = comp.m.map((pt: any) => ({
      x: pt.x / 10000,
      y: pt.y / 10000
    }));
  }
  return data;
};

const MSG_DRAW_START = 1;
const MSG_DRAW_MOVE = 2;
const MSG_DRAW_END = 3;
const MSG_DRAW_ACTION = 4;
const MSG_DRAW_CLEAR = 5;
const MSG_DRAW_CANCEL = 6;
const MSG_DRAW_UNDO = 7;
const MSG_DRAW_REDO = 8;

const TOOLS_LIST = ['pencil', 'eraser', 'bucket', 'line', 'strokeRect', 'fillRect', 'strokeCircle', 'fillCircle', 'pipette'];

const getToolIndex = (toolName: string): number => {
  const idx = TOOLS_LIST.indexOf(toolName);
  return idx >= 0 ? idx : 0;
};

const getToolName = (idx: number): string => {
  return TOOLS_LIST[idx] || 'pencil';
};

const writeString7 = (view: DataView, offset: number, str: string) => {
  for (let i = 0; i < 7; i++) {
    const code = i < str.length ? str.charCodeAt(i) : 0;
    view.setUint8(offset + i, code);
  }
};

const readString7 = (view: DataView, offset: number): string => {
  let str = '';
  for (let i = 0; i < 7; i++) {
    const code = view.getUint8(offset + i);
    if (code > 0) {
      str += String.fromCharCode(code);
    }
  }
  return str;
};

const parseColorToRGB = (colorStr: string): {r: number, g: number, b: number} => {
  if (!colorStr) return { r: 0, g: 0, b: 0 };
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16) || 0;
      const g = parseInt(hex[1] + hex[1], 16) || 0;
      const b = parseInt(hex[2] + hex[2], 16) || 0;
      return { r, g, b };
    } else {
      const r = parseInt(hex.slice(0, 2), 16) || 0;
      const g = parseInt(hex.slice(2, 4), 16) || 0;
      const b = parseInt(hex.slice(4, 6), 16) || 0;
      return { r, g, b };
    }
  }
  return { r: 0, g: 0, b: 0 };
};

const formatRGBToHex = (r: number, g: number, b: number): string => {
  const pad = (n: number) => n.toString(16).padStart(2, '0');
  return `#${pad(r)}${pad(g)}${pad(b)}`;
};

// High-performance static Point Pool to prevent Garbage Collection and heap allocations inside rendering/pointer loops
type PooledPoint = { x: number; y: number };
const pointPool: PooledPoint[] = [];

// Pre-hydrate point pool with healthy default slots to ensure instantaneous reuse at start
for (let i = 0; i < 400; i++) {
  pointPool.push({ x: 0, y: 0 });
}

const acquirePoint = (x: number, y: number): PooledPoint => {
  const pt = pointPool.pop();
  if (pt) {
    pt.x = x;
    pt.y = y;
    return pt;
  }
  return { x, y };
};

const releasePoints = (points: PooledPoint[]) => {
  const len = points.length;
  for (let i = 0; i < len; i++) {
    if (pointPool.length < 2000) {
      pointPool.push(points[i]);
    }
  }
  // Clear the array natively without creating a new reference
  points.length = 0;
};

const encodeBinaryDrawMessage = (event: string, data: any): ArrayBuffer => {
  const instId = data.instanceId || '';
  
  if (event === 'draw_start') {
    const buffer = new ArrayBuffer(18);
    const view = new DataView(buffer);
    view.setUint8(0, MSG_DRAW_START);
    writeString7(view, 1, instId);
    
    view.setUint8(8, getToolIndex(data.tool));
    const rgb = parseColorToRGB(data.color);
    view.setUint8(9, rgb.r);
    view.setUint8(10, rgb.g);
    view.setUint8(11, rgb.b);
    
    const width = Math.min(255, Math.max(0, Math.round(data.width || 0)));
    view.setUint8(12, width);
    
    const opacityVal = Math.min(100, Math.max(0, Math.round((data.opacity !== undefined ? data.opacity : 1) * 100)));
    view.setUint8(13, opacityVal);
    
    const scaledX = Math.min(10000, Math.max(0, Math.round((data.x || 0) * 10000)));
    const scaledY = Math.min(10000, Math.max(0, Math.round((data.y || 0) * 10000)));
    view.setUint16(14, scaledX, true);
    view.setUint16(16, scaledY, true);
    
    return buffer;
  }
  
  if (event === 'draw_move') {
    const moves = Array.isArray(data.moves) ? data.moves : (data.x !== undefined ? [{ x: data.x, y: data.y }] : []);
    const movesLength = moves.length;
    
    const buffer = new ArrayBuffer(10 + movesLength * 4);
    const view = new DataView(buffer);
    view.setUint8(0, MSG_DRAW_MOVE);
    writeString7(view, 1, instId);
    
    view.setUint16(8, movesLength, true);
    for (let i = 0; i < movesLength; i++) {
      const pt = moves[i];
      const scaledPtX = Math.min(10000, Math.max(0, Math.round((pt.x || 0) * 10000)));
      const scaledPtY = Math.min(10000, Math.max(0, Math.round((pt.y || 0) * 10000)));
      view.setUint16(10 + i * 4, scaledPtX, true);
      view.setUint16(12 + i * 4, scaledPtY, true);
    }
    
    return buffer;
  }
  
  if (event === 'draw_end') {
    const buffer = new ArrayBuffer(22);
    const view = new DataView(buffer);
    view.setUint8(0, MSG_DRAW_END);
    writeString7(view, 1, instId);
    
    view.setUint8(8, getToolIndex(data.tool));
    const rgb = parseColorToRGB(data.color);
    view.setUint8(9, rgb.r);
    view.setUint8(10, rgb.g);
    view.setUint8(11, rgb.b);
    
    const width = Math.min(255, Math.max(0, Math.round(data.width || 0)));
    view.setUint8(12, width);
    
    const opacityVal = Math.min(100, Math.max(0, Math.round((data.opacity !== undefined ? data.opacity : 1) * 100)));
    view.setUint8(13, opacityVal);
    
    const scaledSX = Math.min(10000, Math.max(0, Math.round((data.startX || 0) * 10000)));
    const scaledSY = Math.min(10000, Math.max(0, Math.round((data.startY || 0) * 10000)));
    view.setUint16(14, scaledSX, true);
    view.setUint16(16, scaledSY, true);
    
    const scaledX = Math.min(10000, Math.max(0, Math.round((data.x || 0) * 10000)));
    const scaledY = Math.min(10000, Math.max(0, Math.round((data.y || 0) * 10000)));
    view.setUint16(18, scaledX, true);
    view.setUint16(20, scaledY, true);
    
    return buffer;
  }
  
  if (event === 'draw_action') {
    const buffer = new ArrayBuffer(17);
    const view = new DataView(buffer);
    view.setUint8(0, MSG_DRAW_ACTION);
    writeString7(view, 1, instId);
    
    view.setUint8(8, getToolIndex(data.tool));
    const rgb = parseColorToRGB(data.color);
    view.setUint8(9, rgb.r);
    view.setUint8(10, rgb.g);
    view.setUint8(11, rgb.b);
    
    const opacityVal = Math.min(100, Math.max(0, Math.round((data.opacity !== undefined ? data.opacity : 1) * 100)));
    view.setUint8(12, opacityVal);
    
    const scaledX = Math.min(10000, Math.max(0, Math.round((data.x || 0) * 10000)));
    const scaledY = Math.min(10000, Math.max(0, Math.round((data.y || 0) * 10000)));
    view.setUint16(13, scaledX, true);
    view.setUint16(15, scaledY, true);
    
    return buffer;
  }
  
  let type = 5;
  if (event === 'draw_clear') type = MSG_DRAW_CLEAR;
  else if (event === 'draw_cancel') type = MSG_DRAW_CANCEL;
  else if (event === 'draw_undo') type = MSG_DRAW_UNDO;
  else if (event === 'draw_redo') type = MSG_DRAW_REDO;
  
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint8(0, type);
  writeString7(view, 1, instId);
  return buffer;
};

const decodeBinaryDrawMessage = (input: any): { event: string, data: any } | null => {
  if (!input) return null;
  
  let buffer: ArrayBuffer;
  if (input instanceof ArrayBuffer) {
    buffer = input;
  } else if (input.buffer instanceof ArrayBuffer) {
    buffer = input.buffer;
  } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
    buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  } else {
    return null;
  }
  
  const view = new DataView(buffer);
  if (view.byteLength < 8) return null;
  
  const type = view.getUint8(0);
  const instId = readString7(view, 1);
  
  if (type === MSG_DRAW_START) {
    const tool = getToolName(view.getUint8(8));
    const r = view.getUint8(9);
    const g = view.getUint8(10);
    const b = view.getUint8(11);
    const color = formatRGBToHex(r, g, b);
    const width = view.getUint8(12);
    const opacity = view.getUint8(13) / 100;
    const x = view.getUint16(14, true) / 10000;
    const y = view.getUint16(16, true) / 10000;
    
    return {
      event: 'draw_start',
      data: { instanceId: instId, tool, color, width, opacity, x, y }
    };
  }
  
  if (type === MSG_DRAW_MOVE) {
    const movesLength = view.getUint16(8, true);
    const moves = [];
    for (let i = 0; i < movesLength; i++) {
      const x = view.getUint16(10 + i * 4, true) / 10000;
      const y = view.getUint16(12 + i * 4, true) / 10000;
      moves.push({ x, y });
    }
    
    if (movesLength === 1) {
      return {
        event: 'draw_move',
        data: { instanceId: instId, x: moves[0].x, y: moves[0].y }
      };
    } else {
      return {
        event: 'draw_move',
        data: { instanceId: instId, moves }
      };
    }
  }
  
  if (type === MSG_DRAW_END) {
    const tool = getToolName(view.getUint8(8));
    const r = view.getUint8(9);
    const g = view.getUint8(10);
    const b = view.getUint8(11);
    const color = formatRGBToHex(r, g, b);
    const width = view.getUint8(12);
    const opacity = view.getUint8(13) / 100;
    const startX = view.getUint16(14, true) / 10000;
    const startY = view.getUint16(16, true) / 10000;
    const x = view.getUint16(18, true) / 10000;
    const y = view.getUint16(20, true) / 10000;
    
    return {
      event: 'draw_end',
      data: { instanceId: instId, tool, color, width, opacity, startX, startY, x, y }
    };
  }
  
  if (type === MSG_DRAW_ACTION) {
    const tool = getToolName(view.getUint8(8));
    const r = view.getUint8(9);
    const g = view.getUint8(10);
    const b = view.getUint8(11);
    const color = formatRGBToHex(r, g, b);
    const opacity = view.getUint8(12) / 100;
    const x = view.getUint16(13, true) / 10000;
    const y = view.getUint16(15, true) / 10000;
    
    return {
      event: 'draw_action',
      data: { instanceId: instId, tool, color, opacity, x, y }
    };
  }
  
  let eventName = 'draw_clear';
  if (type === MSG_DRAW_CANCEL) eventName = 'draw_cancel';
  else if (type === MSG_DRAW_UNDO) eventName = 'draw_undo';
  else if (type === MSG_DRAW_REDO) eventName = 'draw_redo';
  
  return {
    event: eventName,
    data: { instanceId: instId }
  };
};

const matchColor = (data: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number) => {
  const tolerance = 40; 
  return Math.abs(data[i] - r) <= tolerance && 
         Math.abs(data[i+1] - g) <= tolerance && 
         Math.abs(data[i+2] - b) <= tolerance && 
         Math.abs(data[i+3] - a) <= tolerance;
};

let sharedOffscreenCanvas: HTMLCanvasElement | null = null;
let sharedOffscreenCtx: CanvasRenderingContext2D | null = null;

const floodFill = (ctx: CanvasRenderingContext2D, startX: number, startY: number, fillColorStr: string, fillOpacity: number = 1) => {
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
      return 3; // Level 3: Low-End (ultra-low VRAM memory restrictions, no panning/zoom)
    }
    if (cpus <= 4 || mem <= 3) {
      return 2; // Level 2: Medium-End (restricted zoom, only horizontal panning)
    }
  } catch (err) {
    if (window.devicePixelRatio !== undefined && window.devicePixelRatio < 1.5) {
      return 3;
    }
  }
  return 1; // Level 1: High-End (unrestricted full features)
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
  key?: any;
}) {
  const instanceId = useMemo(() => Math.random().toString(36).substring(2, 9), []);
  const { socket } = useSocket();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);
  const interactionLayerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const tempCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastMoveProcessedTime = useRef(0);
  const lastBucketFillTimeRef = useRef(0);
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
  const colorsScrollRef = useRef<HTMLDivElement>(null);
  const menuJustClosedRef = useRef<boolean>(false);

  useEffect(() => {
    const el = colorsScrollRef.current;
    if (!el) return;
    let isDown = false;
    let startX: number;
    let scrollLeft: number;

    const handleMouseDown = (e: MouseEvent) => {
      isDown = true;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
    };
    const handleMouseLeave = () => {
      isDown = false;
    };
    const handleMouseUp = () => {
      isDown = false;
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.5;
      el.scrollLeft = scrollLeft - walk;
    };

    el.addEventListener('mousedown', handleMouseDown, { passive: false });
    el.addEventListener('mouseleave', handleMouseLeave);
    el.addEventListener('mouseup', handleMouseUp);
    el.addEventListener('mousemove', handleMouseMove, { passive: false });
    return () => {
      el.removeEventListener('mousedown', handleMouseDown);
      el.removeEventListener('mouseleave', handleMouseLeave);
      el.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

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
    if (!container) return { x: newX, y: newY, scale: newScale };
    const { width, height } = container.getBoundingClientRect();
    
    if (PERF_TIER === 3) {
      // Level 3: Locked completely centered in space, absolutely no movement or zooming
      const cw = LOGICAL_WIDTH * currentBaseScale;
      const ch = LOGICAL_HEIGHT * currentBaseScale;
      return {
        x: (width - cw) / 2,
        y: (height - ch) / 2,
        scale: 1,
      };
    }
    
    if (PERF_TIER === 2) {
      // Level 2: Zoom locked to 1, Horizontal pan ONLY, Vertical centered
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

    // Level 1: Full freedom
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

  useEffect(() => {
    if (!socket) return;
    
    const onDrawStart = (raw: any, isReplay = false) => {
      const data = decompressPayload(raw);
      if (!isReplay && data.instanceId === instanceId) return;
      remoteProps.current = data;
      const x = data.x * LOGICAL_WIDTH;
      const y = data.y * LOGICAL_HEIGHT;
      
      // Cleanly recycle existing remote points before seeding new stroke
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

        // Ultimate Line Smoothing Engine:
        // When receiving real-time coordinates, if the transmission gap is wide due to throttling,
        // dynamically generate intermediate points during live gameplay to maintain an elegant, seamless 60fps look!
        if (!isReplay && remotePathRef.current.length > 0) {
          const last = remotePathRef.current[remotePathRef.current.length - 1];
          const dist = Math.hypot(x - last.x, y - last.y);
          if (dist > 8) {
            // Smoothly divide and interpolate up to 10 points
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
      
      const tool = data?.tool || remoteProps.current.tool;
      const opacity = data?.opacity || remoteProps.current.opacity;
      const ctx = ctxRef.current;
      const tempCanvas = tempCanvasRef.current;
      const tempCtx = tempCtxRef.current;
      
      if (tool !== 'bucket' && tool !== 'pipette') {
        if (ctx && tempCanvas && tempCtx) {
          
          if (data && data.startX !== undefined && data.x !== undefined && tool !== 'pencil' && tool !== 'eraser') {
            const startX = data.startX * LOGICAL_WIDTH;
            const startY = data.startY * LOGICAL_HEIGHT;
            const x = data.x * LOGICAL_WIDTH;
            const y = data.y * LOGICAL_HEIGHT;
            const width = data.width || remoteProps.current.width;
            const color = data.color || remoteProps.current.color;

            tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
            tempCtx.beginPath();
            tempCtx.strokeStyle = color;
            tempCtx.fillStyle = color;
            tempCtx.lineWidth = width;
            tempCtx.lineCap = 'round';
            tempCtx.lineJoin = 'round';

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
          } else if (tool === 'pencil' || tool === 'eraser') {
            const path = remotePathRef.current;
            const n = path.length;
            if (n >= 2) {
              const width = remoteProps.current.width;
              const color = remoteProps.current.color;
              tempCtx.beginPath();
              tempCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
              tempCtx.lineWidth = width;
              tempCtx.lineCap = 'round';
              tempCtx.lineJoin = 'round';
              
              const p1 = path[n - 2];
              const p2 = path[n - 1];
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
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
      }

      // Return points of finished stroke to the static pointPool
      releasePoints(remotePathRef.current);
      if (!skipSave) saveHistory();
    };

    const onDrawClear = (data?: any, isReplay = false) => {
      if (!isReplay && data?.instanceId === instanceId) return;
      clearCanvas(false);
    };

    const onDrawAction = (raw: any, skipSave = false, isReplay = false) => {
      const data = decompressPayload(raw);
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
      const tempCtx = tempCtxRef.current;
      tempCtx?.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
      releasePoints(remotePathRef.current);
    };

    const onDrawBinary = (raw: any) => {
      const decoded = decodeBinaryDrawMessage(raw);
      if (!decoded) return;
      const { event, data } = decoded;
      if (!data) return;
      if (data.instanceId === instanceId) return;

      if (event === 'draw_start') {
        onDrawStart(data);
      } else if (event === 'draw_move') {
        onDrawMove(data);
      } else if (event === 'draw_end') {
        onDrawEnd(data, false);
      } else if (event === 'draw_clear') {
        onDrawClear(data, false);
      } else if (event === 'draw_action') {
        onDrawAction(data, false);
      } else if (event === 'draw_cancel') {
        onDrawCancel(data);
      } else if (event === 'draw_undo') {
        undo(false);
      } else if (event === 'draw_redo') {
        redo(false);
      }
    };

    socket.on('draw_binary', onDrawBinary);
    socket.on('draw_start', onDrawStart);
    socket.on('draw_move', onDrawMove);
    socket.on('draw_end', onDrawEnd);
    socket.on('draw_cancel', onDrawCancel);
    socket.on('draw_clear', onDrawClear);
    socket.on('draw_action', onDrawAction);

    socket.on('draw_undo', (raw?: any) => {
      const data = decompressPayload(raw);
      if (data?.instanceId === instanceId) return;
      undo(false);
    });
    
    socket.on('draw_undo_local', (raw?: any) => {
      const data = decompressPayload(raw);
      if (data?.instanceId === instanceId) return;
      undo(false);
    });
    
    socket.on('draw_redo', (raw?: any) => {
      const data = decompressPayload(raw);
      if (data?.instanceId === instanceId) return;
      redo(false);
    });

    socket.on('draw_redo_local', (raw?: any) => {
      const data = decompressPayload(raw);
      if (data?.instanceId === instanceId) return;
      redo(false);
    });

    socket.on('draw_history_sync', (commands: any[]) => {
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const tempCtx = tempCtxRef.current;
      if (tempCtx) {
         tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
      }
      
      // Rebuild history completely from server sequence
      history.current = [];
      const blankData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      history.current.push(blankData);

      // Replay all commands
      for (const cmd of commands) {
         let event = cmd.event;
         let data = cmd.data;
         
         if (event === 'draw_binary') {
            const decoded = decodeBinaryDrawMessage(data);
            if (decoded) {
               event = decoded.event;
               data = decoded.data;
            }
         }
         
         if (event === 'draw_start') onDrawStart(data, true);
         else if (event === 'draw_move') onDrawMove(data, true);
         else if (event === 'draw_end') {
            onDrawEnd(data, true, true);
            history.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
         }
         else if (event === 'draw_action') {
            onDrawAction(data, true, true);
            history.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
         }
      }
      
      const MAX_HISTORY = 5;
      while (history.current.length > MAX_HISTORY + 1) {
         history.current.shift();
      }
      
      historyIndex.current = history.current.length - 1;
      setHistoryState({ index: historyIndex.current, length: history.current.length });
    });

    return () => {
      socket.off('draw_binary', onDrawBinary);
      socket.off('draw_start', onDrawStart);
      socket.off('draw_move', onDrawMove);
      socket.off('draw_end', onDrawEnd);
      socket.off('draw_clear', onDrawClear);
      socket.off('draw_action', onDrawAction);
      socket.off('draw_undo');
      socket.off('draw_undo_local');
      socket.off('draw_redo');
      socket.off('draw_redo_local');
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

  const stateRefs = useRef({ tool, color, currentWidth: 5, currentOpacity: 1 });

  const currentWidth = tool === 'eraser' ? eraserWidth : penWidth;
  const currentOpacity = tool === 'eraser' ? eraserOpacity : (tool === 'bucket' ? bucketOpacity : penOpacity);
  
  // Sync state refs for the rAF loop
  stateRefs.current = { tool, color, currentWidth, currentOpacity };

  // History
  const history = useRef<ImageData[]>([]);
  const historyIndex = useRef(-1);
  const lastTouch = useRef({ dist: 0, x: 0, y: 0 });
  const currentPath = useRef<{x: number, y: number}[]>([]);
  const needsRenderRef = useRef(false);
  const pinchRef = useRef(false);
  const previousTool = useRef<ToolType>('pencil');
  const flushLocalRenderRef = useRef<() => void>(() => {});
  const lastRenderedIndexRef = useRef(0);

  // Ensure pointer up is never missed even if pointer leaves window
  useEffect(() => {
    if (!isDrawing) return;
    const handleGlobalUp = (e: MouseEvent | TouchEvent) => {
      handlePointerUp(e as any);
    };
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchend', handleGlobalUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [isDrawing]); // Note: handlePointerUp will be stale if tool changes mid-draw, but isDrawing prevents this.

  // Synchronized animation frame loop for drawing
  useEffect(() => {
    let rAFId: number;
    
    const executeRender = (force = false) => {
      if ((!isDrawing && !force) || (!needsRenderRef.current && !force)) return;
      
      const ctx = ctxRef.current;
      const tempCtx = tempCtxRef.current;
      if (!ctx || !tempCtx) return;
      
      const path = currentPath.current;
      const len = path.length;
      
      if (len === 0) return;
      
      const startX = path[0].x;
      const startY = path[0].y;
      const lastPt = path[len - 1];
      const x = lastPt.x;
      const y = lastPt.y;

      const { tool, color, currentWidth, currentOpacity } = stateRefs.current;

      if (tool === 'pencil' || tool === 'eraser') {
        const activeCtx = tempCtx;
        const startIndex = lastRenderedIndexRef.current;
        
        if (startIndex < len - 1) {
          activeCtx.beginPath();
          activeCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
          activeCtx.lineWidth = currentWidth;
          activeCtx.lineCap = 'round';
          activeCtx.lineJoin = 'round';
          activeCtx.globalAlpha = 1;
          
          if (tool === 'pencil') {
             activeCtx.shadowBlur = IS_LOW_END ? 0 : 1;
             activeCtx.shadowColor = color;
          } else {
             activeCtx.shadowBlur = 0;
             activeCtx.shadowColor = 'transparent';
          }
          
          for (let i = Math.max(1, startIndex); i < len; i++) {
            const p1 = path[i - 1];
            const p2 = path[i];
            
            if (i === 1) {
              activeCtx.moveTo(p1.x, p1.y);
              activeCtx.lineTo(p2.x, p2.y);
              activeCtx.stroke();
            } else {
              const p0 = path[i - 2];
              const mid1X = (p0.x + p1.x) / 2;
              const mid1Y = (p0.y + p1.y) / 2;
              const mid2X = (p1.x + p2.x) / 2;
              const mid2Y = (p1.y + p2.y) / 2;
              
              activeCtx.moveTo(mid1X, mid1Y);
              activeCtx.quadraticCurveTo(p1.x, p1.y, mid2X, mid2Y);
              activeCtx.stroke();
            }
          }
          activeCtx.shadowBlur = 0;
          lastRenderedIndexRef.current = len - 1;
        }
      } else {
        const activeCtx = tempCtx;
        activeCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);

        activeCtx.beginPath();
        activeCtx.strokeStyle = color;
        activeCtx.fillStyle = color;
        activeCtx.lineWidth = currentWidth;
        activeCtx.globalAlpha = 1; // opacity is managed by tempCanvas css
        activeCtx.lineCap = 'round';
        activeCtx.lineJoin = 'round';
        activeCtx.shadowBlur = 0;
        activeCtx.shadowColor = 'transparent';

        if (tool === 'line') {
          activeCtx.moveTo(startX, startY);
          activeCtx.lineTo(x, y);
          activeCtx.stroke();
        } else if (tool === 'strokeRect') {
          activeCtx.lineJoin = 'miter';
          activeCtx.strokeRect(startX, startY, x - startX, y - startY);
        } else if (tool === 'fillRect') {
          activeCtx.fillRect(startX, startY, x - startX, y - startY);
        } else if (tool === 'strokeCircle') {
          const radius = Math.hypot(x - startX, y - startY);
          activeCtx.arc(startX, startY, radius, 0, Math.PI * 2);
          activeCtx.stroke();
        } else if (tool === 'fillCircle') {
          const radius = Math.hypot(x - startX, y - startY);
          activeCtx.arc(startX, startY, radius, 0, Math.PI * 2);
          activeCtx.fill();
        }
      }
      
      needsRenderRef.current = false;
    };
    
    flushLocalRenderRef.current = () => executeRender(true);

    const runRaf = () => {
      rAFId = requestAnimationFrame(runRaf);
      executeRender();
    };
    
    if (isDrawing) {
      rAFId = requestAnimationFrame(runRaf);
    }
    return () => cancelAnimationFrame(rAFId);
  }, [isDrawing]);

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
    
    const ctx = canvas.getContext('2d', { alpha: false });
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
      
      // Initialize with solid white background (highly performant and opaque)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      
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

  // Register native pointer/touch event listeners directly to bypass React synthetic event overhead and prevent input lag
  useEffect(() => {
    const el = interactionLayerRef.current;
    if (!el || readOnly) return;

    const onDown = (e: MouseEvent | TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      handlePointerDown(e);
    };

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      handlePointerMove(e);
    };

    const onUp = (e: MouseEvent | TouchEvent) => {
      handlePointerUp(e);
    };

    el.addEventListener('mousedown', onDown);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseup', onUp);
    el.addEventListener('mouseleave', onUp);

    el.addEventListener('touchstart', onDown, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onUp, { passive: false });
    el.addEventListener('touchcancel', onUp, { passive: false });

    return () => {
      el.removeEventListener('mousedown', onDown);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseup', onUp);
      el.removeEventListener('mouseleave', onUp);

      el.removeEventListener('touchstart', onDown);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onUp);
      el.removeEventListener('touchcancel', onUp);
    };
  }, [readOnly, activeMenu, tool, color, bucketOpacity, penOpacity, eraserOpacity, penWidth, eraserWidth, isDrawing]);

  const saveHistory = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Storing state in JS memory history list. No redundant GPU uploads are needed.
    
    history.current = history.current.slice(0, historyIndex.current + 1);
    history.current.push(data);
    
    const MAX_HISTORY = 5;
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
    
    // Low-end device active-drawer restriction: only allow 1 undo step.
    if (emit && IS_LOW_END && !readOnly) {
      if (historyIndex.current <= history.current.length - 2) {
        return;
      }
    }
    
    if (historyIndex.current > 0) {
      historyIndex.current--;
      const data = history.current[historyIndex.current];
      ctxRef.current?.putImageData(data, 0, 0);
      setHistoryState({ index: historyIndex.current, length: history.current.length });
      
      if (emit && socket) {
        socket.emit('draw_binary', encodeBinaryDrawMessage('draw_undo', { instanceId }));
      }
    }
  };

  const redo = (emit = true) => {
    if (emit && Date.now() - lastRedoTime.current < 200) return;
    if (emit) lastRedoTime.current = Date.now();
    
    if (historyIndex.current < history.current.length - 1) {
      historyIndex.current++;
      const data = history.current[historyIndex.current];
      ctxRef.current?.putImageData(data, 0, 0);
      setHistoryState({ index: historyIndex.current, length: history.current.length });
      
      if (emit && socket) {
        socket.emit('draw_binary', encodeBinaryDrawMessage('draw_redo', { instanceId }));
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
    saveHistory(); // Creates the first blank snapshot at index 0

    if (emit && socket) {
      socket.emit('draw_binary', encodeBinaryDrawMessage('draw_clear', { instanceId }));
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
          // Since active drawing is isolated to tempCanvas, clearing tempCtx is fully sufficient.
          if (socket) {
            socket.emit('draw_binary', encodeBinaryDrawMessage('draw_cancel', { instanceId }));
          }
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
    
    // Choose context based on tool
    let activeCtx = tempCtx;
    
    if (tool !== 'bucket' && tool !== 'pipette') {
      tempCanvas.style.opacity = currentOpacity.toString();
      activeCtx.globalAlpha = 1; // Draw solid on temp canvas, css handles opacity
      activeCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
      activeCtx.fillStyle = color;
      activeCtx.globalCompositeOperation = 'source-over';
    }

    if (socket && tool !== 'bucket' && tool !== 'pipette') {
       socket.emit('draw_binary', encodeBinaryDrawMessage('draw_start', {
          instanceId, tool, color, width: currentWidth, opacity: currentOpacity,
          x: x / LOGICAL_WIDTH, y: y / LOGICAL_HEIGHT
       }));
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
          // Level 3: Locking zoom and panning completely static
          newScale = 1;
          newX = prev.x;
          newY = prev.y;
        } else if (PERF_TIER === 2) {
          // Level 2: Lock scale to 1, lock Y to initial, and let it pan horizontally
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
        
        // Failsafe exit drawing if tracking slipped
        if (isDrawing) {
            setIsDrawing(false);
            needsRenderRef.current = false;
            ctxRef.current?.closePath();
            tempCtxRef.current?.closePath();
            tempCtxRef.current?.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
            // Since active drawing is isolated to tempCanvas, clearing tempCtx is fully sufficient.
            if (socket) {
              socket.emit('draw_binary', encodeBinaryDrawMessage('draw_cancel', { instanceId }));
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

    let shouldPush = true;
    if (currentPath.current.length > 0 && (tool === 'pencil' || tool === 'eraser')) {
      const lastPt = currentPath.current[currentPath.current.length - 1];
      const dx = x - lastPt.x;
      const dy = y - lastPt.y;
      const distSq = dx * dx + dy * dy;

      let minDistance = 0.5; // low default debounce to filter out sensor sub-pixel noise
      if (PERF_TIER === 3) {
        minDistance = 4.0; // Level 3: filter out points closer than 4 logical pixels (~4px on 1.0 DPR)
      } else if (PERF_TIER === 2) {
        minDistance = 2.0; // Level 2: filter out points closer than 2 logical pixels (~2.4px on 1.2 DPR)
      }

      if (distSq < minDistance * minDistance) {
        shouldPush = false;
      }
    }

    if (shouldPush) {
      currentPath.current.push(acquirePoint(x, y));
    } else {
      return; // Skip rendering and websocket syncing for redundant jitter coordinates
    }
    
    if (tool === 'pencil' || tool === 'eraser') {
      needsRenderRef.current = true;
      
      if (socket) {
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
               socket.emit('draw_binary', encodeBinaryDrawMessage('draw_move', {
                 instanceId, 
                 moves: moveBatchRef.current
               }));
               moveBatchRef.current = [];
            }
            throttleTimeoutRef.current = null;
          }, DPR < 2 ? 26 : 16); // Optimize Batch Interval: 26ms for weak devices, 16ms for fast
        }
      }
    } else {
      needsRenderRef.current = true;
      if (socket) {
        const normX = x / LOGICAL_WIDTH;
        const normY = y / LOGICAL_HEIGHT;
        socket.emit('draw_binary', encodeBinaryDrawMessage('draw_move', {
          instanceId,
          x: normX,
          y: normY
        }));
      }
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

            floodFill(ctx, x, y, color, currentOpacity);
            saveHistory();
            if (socket) {
               socket.emit('draw_binary', encodeBinaryDrawMessage('draw_action', {
                 instanceId, tool: 'bucket', color, opacity: currentOpacity, x: x / LOGICAL_WIDTH, y: y / LOGICAL_HEIGHT
               }));
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
      if (socket && moveBatchRef.current.length > 0) {
         socket.emit('draw_binary', encodeBinaryDrawMessage('draw_move', {
           instanceId, 
           moves: moveBatchRef.current
         }));
         moveBatchRef.current = [];
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
          // Restore last known good state from JS memory before compositing.
          // This prevents a major issue on low-end Android browsers where the main canvas GPU 
          // backing buffer gets silently discarded to save VRAM while the user is busy dragging 
          // a long stroke on the temp canvas.
          // Skip redundant putImageData to prevent critical timing/blanking bugs on low-end hardware.
          // Since we aggressively optimize canvas memory resolution with DPR 1.0 (Level 3) and DPR 1.2 (Level 2),
          // browser memory discard is fully prevented. Bypassing putImageData completely resolves disappearing drawings 
          // and saves valuable CPU cycles.

          ctx.globalAlpha = currentOpacity;
          ctx.globalCompositeOperation = 'source-over';
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
        socket.emit('draw_binary', encodeBinaryDrawMessage('draw_end', { 
          instanceId,
          tool, color, width: currentWidth, opacity: currentOpacity,
          startX: startCoords.x / LOGICAL_WIDTH, startY: startCoords.y / LOGICAL_HEIGHT,
          x: lastCoords ? lastCoords.x / LOGICAL_WIDTH : 0, 
          y: lastCoords ? lastCoords.y / LOGICAL_HEIGHT : 0
        }));
      }

      releasePoints(currentPath.current);
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
      <div ref={containerRef} dir="ltr" className="flex-1 relative bg-slate-100 overflow-hidden w-full h-full cursor-crosshair">
        
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
            className="absolute inset-0 z-10 touch-none"
          />
        )}

        {/* Screenshot Button removed as per user request */}

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
          <div className="absolute bottom-[58px] left-[6px] grid grid-cols-2 gap-2 bg-black/80 p-2.5 rounded-xl border border-white/20 shadow-xl z-20 animate-in fade-in slide-in-from-bottom-2">
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

        {/* Floating Action Buttons (Undo/Redo) - Positioned upper-left horizontally side by side */}
        {!readOnly && (
          <div className="absolute top-3 left-3 flex gap-1.5 z-30 pointer-events-auto">
            <button 
              type="button"
              onClick={undo} 
              disabled={historyState.index <= 0}
              className={`w-[32px] h-[32px] bg-white text-slate-700 rounded-lg flex items-center justify-center border border-slate-300/40 shadow-[0_2px_6px_rgba(0,0,0,0.15)] transition-all ${historyState.index <= 0 ? 'opacity-30 pointer-events-none' : 'hover:bg-slate-100 hover:scale-105 active:scale-95'}`}
            >
              <Undo2 size={16} strokeWidth={2.5} />
            </button>
            <button 
              type="button"
              onClick={redo} 
              disabled={historyState.index >= historyState.length - 1}
              className={`w-[32px] h-[32px] bg-white text-slate-700 rounded-lg flex items-center justify-center border border-slate-300/40 shadow-[0_2px_6px_rgba(0,0,0,0.15)] transition-all ${historyState.index >= historyState.length - 1 ? 'opacity-30 pointer-events-none' : 'hover:bg-slate-100 hover:scale-105 active:scale-95'}`}
            >
              <Redo2 size={16} strokeWidth={2.5} />
            </button>
          </div>
        )}
        {!readOnly && (
          <div className="absolute bottom-[2px] left-0 right-0 w-full flex items-center justify-center px-4 gap-4 z-40 pointer-events-none" dir="ltr">
            
            {/* Stroke Width Slider */}
            <div className="flex-1 relative flex items-center h-4 max-w-[45%] group pointer-events-auto" dir="ltr">
               {/* Track */}
               <div className="absolute inset-x-0 top-1/2 -mt-[2px] h-[4px] rounded-full bg-slate-200 pointer-events-none shadow-sm" />
               {/* Fill */}
               <div 
                  className="absolute left-0 top-1/2 -mt-[2px] h-[4px] rounded-l-full bg-[#1a56db] pointer-events-none" 
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
                  className="absolute inset-0 w-full h-full cursor-pointer appearance-none bg-transparent outline-none m-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.3)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-slate-300/80 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.3)] [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-slate-300/80"
                />
            </div>

            {/* Opacity Slider */}
            <div className="flex-1 relative flex items-center h-4 max-w-[45%] group pointer-events-auto" dir="ltr">
               {/* Track Background (Checkered) */}
               <div className="absolute inset-x-0 top-1/2 -mt-[2px] h-[4px] rounded-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjY2NjIi8+CjxyZWN0IHg9IjQiIHk9IjQiIHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNjY2MiLz4KPC9zdmc+')] pointer-events-none overflow-hidden border border-slate-300/30 shadow-inner block">
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
                  className="absolute inset-0 w-full h-full cursor-pointer appearance-none bg-transparent outline-none m-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.3)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-slate-300/80 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.3)] [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-slate-300/80"
                />
            </div>

          </div>
        )}

      </div>
      
      {/* Bottom Toolbar with integrated timer and controls */}
      {!readOnly && (
        <div className="bg-[#1a56db] flex flex-col shrink-0 pb-safe shadow-[0_-4px_10px_rgba(0,0,0,0.1)] z-30" dir="ltr">
          {/* Integrated timer bar from GameRoom at the top edge of bottom bar */}
          {timerBarNode && (
            <div className="w-full">
              {timerBarNode}
            </div>
          )}

          <div className="p-2 sm:p-2.5 pt-1.5 flex items-center justify-between gap-2.5">
            {/* Action Buttons on the Left (Order exactly as User's attachment) */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* 1. Yellow Swap eraser/pencil toggle button */}
              <ActionBtn 
                icon={<RefreshCcw />} 
                active={tool === 'eraser'} 
                onClick={() => {
                  if (tool === 'eraser') changeTool('pencil');
                  else if (tool === 'pencil') changeTool('eraser');
                  else changeTool('pencil');
                }} 
                className="!bg-[#facc15] !text-slate-800 hover:!bg-[#eab308] !border-transparent !rounded-lg"
              />

              {/* 2. White pencil selector */}
              <ActionBtn 
                icon={
                  tool === 'eraser' ? <Eraser /> :
                  tool === 'bucket' ? <PaintBucket /> :
                  tool === 'fillRect' ? <Square fill="currentColor" /> :
                  tool === 'strokeRect' ? <Square /> :
                  tool === 'fillCircle' ? <Circle fill="currentColor" /> :
                  tool === 'strokeCircle' ? <Circle /> :
                  tool === 'line' ? <Minus /> :
                  tool === 'pipette' ? <Pipette /> :
                  <Pencil />
                } 
                active={activeMenu === 'tools' || (tool !== 'eraser' && !activeMenu)} 
                onClick={() => setActiveMenu(m => m === 'tools' ? null : 'tools')} 
                className="!bg-white !text-[#1a56db] !border-transparent !rounded-lg" /* Active white with blue icon */
              />

              {/* 3. Yellow hint bulb with Red Badge */}
              {hintsRemaining > 0 && onRequestHint && (
                <div className="relative">
                  <ActionBtn 
                    icon={<Lightbulb />} 
                    onClick={onRequestHint} 
                    className="!bg-[#facc15] !text-slate-800 hover:!bg-[#eab308] !border-transparent !rounded-lg flex" 
                  />
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-4.5 h-4.5 flex items-center justify-center rounded-full border border-[#1a56db]">
                    {hintsRemaining}
                  </span>
                </div>
              )}

              {/* 4. Red Skip/Kick Button */}
              {onSkipTurn && (
                <ActionBtn 
                  icon={<UserMinus />} 
                  onClick={onSkipTurn} 
                  className="!bg-[#f23c4f] !text-white hover:!bg-red-600 !border-transparent !rounded-lg shrink-0" 
                />
              )}
            </div>

            {/* Color Palette on the Right (Scrollable/draggable horizontally, fills to the right edge with square color cells) */}
            <div 
              ref={colorsScrollRef} 
              className="flex-1 overflow-x-auto select-none touch-pan-x no-scrollbar ml-1.5 -mr-2 sm:-mr-2.5 max-w-full py-0.5" 
              dir="ltr"
              style={{ scrollbarWidth: 'none' }}
            >
              <div className="flex flex-col gap-[3px] min-w-max pr-2 sm:pr-2.5">
                <div className="flex gap-[3px]">
                  {TOP_COLORS.map(c => (
                    <ColorBtn key={c} color={c} active={color===c && tool !== 'eraser'} onClick={() => { setColor(c); setActiveMenu(null); if (tool === 'eraser') changeTool(previousTool.current); }} />
                  ))}
                </div>
                <div className="flex gap-[3px]">
                  {BOT_COLORS.map(c => (
                    <ColorBtn key={c} color={c} active={color===c && tool !== 'eraser'} onClick={() => { setColor(c); setActiveMenu(null); if (tool === 'eraser') changeTool(previousTool.current); }} />
                  ))}
                </div>
              </div>
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
      type="button"
      onClick={onClick}
      className={`w-[38px] h-[38px] flex items-center justify-center rounded-lg transition-all shadow-sm focus:outline-none select-none
        ${active 
          ? 'bg-white text-[#1a56db] scale-105 shadow-md' 
          : 'bg-[#ffcc00] text-[#1a56db] hover:bg-white hover:scale-105 active:scale-95'
        } ${className}`}
    >
      {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { size: 19, strokeWidth: 2.5 }) : icon}
    </button>
  );
}

function SubToolBtn({ icon, active, onClick, className = '' }: { icon: React.ReactNode, active?: boolean, onClick: () => void, className?: string }) {
  return (
    <button 
      type="button"
      onClick={onClick}
      className={`w-11 h-11 flex items-center justify-center rounded-lg border transition-all
        ${active 
          ? 'bg-blue-600 border-blue-400 text-white shadow-inner scale-105' 
          : 'bg-white/10 border-transparent text-white hover:bg-white/20 ' + className
        }`}
    >
      {/* We clone icon to pass consistent sizing */}
      {React.cloneElement(icon as React.ReactElement, { size: 21, strokeWidth: 2.5 })}
    </button>
  );
}

function ColorBtn({ color, active, onClick }: { key?: React.Key, color: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      type="button"
      onClick={onClick}
      className={`w-[21px] h-[21px] flex-shrink-0 rounded-[4px] border transition-none relative focus:outline-none select-none
        ${active ? 'border-[#FBBF24] border-[2.5px] z-10' : 'border-black/20'}`}
      style={{ backgroundColor: color }}
    />
  );
}

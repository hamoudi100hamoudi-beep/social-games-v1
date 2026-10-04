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
import {
  ShadowCompressionMetrics,
  INITIAL_SHADOW_METRICS,
  evaluateShadowCompression
} from '../../utils/shadowCompression';

// --- Constants ---
/* 
  ⚠️ CRITICAL ARCHITECTURE RULE: DO NOT CHANGE THE ASPECT RATIO (1.72) OF THE CANVAS.
  GameRoom uses aspect-[740/430]. Any internal canvas resizing must preserve
  this exact aspect ratio to prevent spectator layout squishing or grey gaps. 
*/
export const CANVAS_WIDTH = 592;
export const CANVAS_HEIGHT = 344;

// Free Draw logical dimensions test: 680 x 396 (exact 1.7171 ratio matching 592 x 344 and 740 x 430)
export const FREE_DRAW_LOGICAL_WIDTH = 680;
export const FREE_DRAW_LOGICAL_HEIGHT = 396;
export const FREE_DRAW_TAIL_SIZE = 40;

const DEFAULT_LOGICAL_WIDTH = CANVAS_WIDTH;
const DEFAULT_LOGICAL_HEIGHT = CANVAS_HEIGHT;

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
  if (a <= 10) {
    return data[i + 3] <= 10;
  }
  if (data[i + 3] <= 10) {
    return false;
  }
  const tolerance = 18;
  return Math.abs(data[i] - r) <= tolerance &&
         Math.abs(data[i + 1] - g) <= tolerance &&
         Math.abs(data[i + 2] - b) <= tolerance &&
         Math.abs(data[i + 3] - a) <= tolerance;
};

let sharedOffscreenCanvas: HTMLCanvasElement | null = null;
let sharedOffscreenCtx: CanvasRenderingContext2D | null = null;

interface TargetRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

// Bounded seed recovery search offsets within Euclidean distance <= 2.0 physical pixels, ordered by distance
const RECOVERY_NEIGHBOR_OFFSETS = [
  // Distance 1.0 (4 orthogonal neighbors)
  [0, -1], [0, 1], [-1, 0], [1, 0],
  // Distance ~1.414 (4 diagonal neighbors)
  [-1, -1], [1, -1], [-1, 1], [1, 1],
  // Distance 2.0 (4 orthogonal 2-step neighbors)
  [0, -2], [0, 2], [-2, 0], [2, 0]
];

const floodFill = (
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColorStr: string,
  fillOpacity: number = 1,
  logicalWidth: number = DEFAULT_LOGICAL_WIDTH,
  logicalHeight: number = DEFAULT_LOGICAL_HEIGHT,
  expectedTarget?: TargetRGBA
): TargetRGBA | null => {
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
  if (!offscreenCtx) return null;

  offscreenCtx.clearRect(0, 0, cw, ch);
  offscreenCtx.drawImage(canvas, 0, 0);

  const imageData = offscreenCtx.getImageData(0, 0, cw, ch);
  const data = imageData.data;

  // Derive pixel seed coordinates directly from canvas physical backing store scale (cw / logicalWidth)
  const scaleX = cw / logicalWidth;
  const scaleY = ch / logicalHeight;
  let sx = Math.floor(startX * scaleX);
  let sy = Math.floor(startY * scaleY);

  if (sx < 0 || sx >= cw || sy < 0 || sy >= ch) return null;

  let targetIdx = (sy * cw + sx) * 4;
  let tr = data[targetIdx];
  let tg = data[targetIdx + 1];
  let tb = data[targetIdx + 2];
  let ta = data[targetIdx + 3];

  if (expectedTarget) {
    tr = expectedTarget.r;
    tg = expectedTarget.g;
    tb = expectedTarget.b;
    ta = expectedTarget.a;

    // Check if initial candidate seed pixel matches expected targetRGBA
    const initialMatches = matchColor(data, targetIdx, tr, tg, tb, ta);
    if (!initialMatches) {
      let recovered = false;
      for (let i = 0; i < RECOVERY_NEIGHBOR_OFFSETS.length; i++) {
        const nx = sx + RECOVERY_NEIGHBOR_OFFSETS[i][0];
        const ny = sy + RECOVERY_NEIGHBOR_OFFSETS[i][1];
        if (nx >= 0 && nx < cw && ny >= 0 && ny < ch) {
          const nIdx = (ny * cw + nx) * 4;
          if (matchColor(data, nIdx, tr, tg, tb, ta)) {
            sx = nx;
            sy = ny;
            targetIdx = nIdx;
            recovered = true;
            break;
          }
        }
      }
      if (!recovered) {
        // Safe Abort: no matching pixel within <= 2 physical pixels
        return null;
      }
    }
  }

  let fillHex = fillColorStr;
  if (fillHex.length === 4) {
    fillHex = '#' + fillHex[1] + fillHex[1] + fillHex[2] + fillHex[2] + fillHex[3] + fillHex[3];
  }

  const fr = parseInt(fillHex.slice(1, 3), 16) || 0;
  const fg = parseInt(fillHex.slice(3, 5), 16) || 0;
  const fb = parseInt(fillHex.slice(5, 7), 16) || 0;

  if (ta >= 240 && fillOpacity >= 0.95 && Math.abs(tr - fr) <= 5 && Math.abs(tg - fg) <= 5 && Math.abs(tb - fb) <= 5) {
    return { r: tr, g: tg, b: tb, a: ta };
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

      const destA = data[idx + 3] / 255;

      if (destA <= 0.04) {
        data[idx] = fr;
        data[idx + 1] = fg;
        data[idx + 2] = fb;
        data[idx + 3] = Math.round(fillOpacity * 255);
      } else {
        const destR = data[idx];
        const destG = data[idx + 1];
        const destB = data[idx + 2];
        const outA = fillOpacity + destA * (1 - fillOpacity);
        const factorSrc = fillOpacity / outA;
        const factorDest = (destA * (1 - fillOpacity)) / outA;
        data[idx] = Math.round(fr * factorSrc + destR * factorDest);
        data[idx + 1] = Math.round(fg * factorSrc + destG * factorDest);
        data[idx + 2] = Math.round(fb * factorSrc + destB * factorDest);
        data[idx + 3] = Math.round(outA * 255);
      }

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
  return { r: tr, g: tg, b: tb, a: ta };
};

export interface DrawingCanvasCoreRef {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  resetState: () => void;
  getCanvasSnapshot: () => string | null;
  resetZoom?: () => void;
}

// 🧪 EXPERIMENTAL NETWORK SAMPLING TEST (Free Draw Only)
// OFF (false) = Standard network behavior (every local sampled point enters moveBatchRef)
// ON (true) = Network-only spatial sampling (2.0px min-distance filter for draw_move, keeping local canvas 100% untouched)
export const EXPERIMENTAL_NETWORK_SAMPLING_TEST = false;

// 🧪 EXPERIMENTAL CANONICAL LOCAL STROKE PROTOTYPE (Phase 5A - Free Draw Only)
// Disabled (false) by default: Standard current behavior works 100% untouched.
// Enabled (true): Live drawing renders via canonicalStrokeRef (online decimated points + provisional tail)
//                 with zero network changes and zero morph at pointerup.
export const EXPERIMENTAL_CANONICAL_LOCAL_TEST = false;

// 🧪 EXPERIMENTAL SINGLE-SOURCE CANONICAL GEOMETRY PIPELINE (A/B Test)
// OFF (false) = Standard baseline behavior (currentPathRef for live canvas, network receives raw points, history records network points)
// ON (true)  = 100% Single-Source of Truth:
//              Raw Input -> Protocol-precision representation -> Unified Canonical Stream
//              Used identically for: Live Temp Preview, Committed Stroke, Network draw_move, Local History & Undo/Redo Replay
export const EXPERIMENTAL_SINGLE_SOURCE_CANONICAL = false;

// Online Canonical Processor Configuration Constants (Configurable for calibration)
export const CANONICAL_MIN_TURN_DIST = 1.3; // Min distance when sharp turn detected (logical px)
export const CANONICAL_MIN_CONSECUTIVE_TURN_DIST = 1.6; // Min distance when consecutive turns (logical px)
export const CANONICAL_MAX_DIST = 2.8; // Max distance before forcing canonical anchor (logical px)
export const CANONICAL_COS_TURN_THRESHOLD = 0.85; // Angle turn threshold (~32 degrees)
export const SPLINE_CUSP_COS = 0.5; // Turn angle threshold for cusp clamping (~60 degrees) in Hybrid Spline Renderer

// 📊 TEMPORARY RUNTIME DIAGNOSTICS (Free Draw Application Drawing Payload)
// Set to false to disable overlay and measurement completely without affecting runtime drawing
export const ENABLE_FREE_DRAW_DIAGNOSTICS = true;

export interface CanonicalMetrics {
  lastCanonicalPoints: number;
  lastNetworkPoints: number;
  lastDensePoints: number;
  totalCanonicalPoints: number;
  totalNetworkPoints: number;
  totalDensePoints: number;
  strokesCount: number;
  shadow?: ShadowCompressionMetrics;
}

interface DrawingDiagnosticStats {
  drawMove: { count: number; points: number; bytes: number };
  drawStroke: { count: number; points: number; bytes: number };
  drawStart: { count: number; bytes: number };
  drawEnd: { count: number; bytes: number };
  drawCommit: { count: number };
  drawRepair: { count: number };
  drawAbort: { count: number };
  canonicalMetrics?: CanonicalMetrics;
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
  deferredReset?: boolean;
  isFreeDraw?: boolean;
  isExperimental?: boolean;
  enableInputOptimizations?: boolean;
  enableBitmapUndoCache?: boolean;
  enableFixedDPR?: boolean;
  enableCanvasAlpha?: boolean;
  enableDestinationOutEraser?: boolean;
  enableNetworkSampling?: boolean;
  enableCanonicalLocalTest?: boolean;
  enableSingleSourceCanonical?: boolean;
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
    onSyncStateChange,
    deferredReset = false,
    isFreeDraw = false,
    isExperimental = false,
    enableInputOptimizations = false,
    enableBitmapUndoCache = false,
    enableFixedDPR = false,
    enableCanvasAlpha = false,
    enableDestinationOutEraser = false,
    enableNetworkSampling = false,
    enableCanonicalLocalTest = false,
    enableSingleSourceCanonical = false
  },
  ref
) => {
  const instanceId = useMemo(() => Math.random().toString(36).substring(2, 9), []);
  const { socket, isConnected } = useSocket();

  // Phase 5A Local Test Toggle (Free Draw Only)
  const [isCanonicalLocalTestActive, setIsCanonicalLocalTestActive] = useState(EXPERIMENTAL_CANONICAL_LOCAL_TEST);

  // Experimental Single-Source Canonical Geometry Pipeline Toggle (Free Draw Only)
  const [isSingleSourceActive, setIsSingleSourceActive] = useState(EXPERIMENTAL_SINGLE_SOURCE_CANONICAL);
  const isSingleSourceActiveRef = useRef(isSingleSourceActive);
  isSingleSourceActiveRef.current = isSingleSourceActive;

  // Logical coordinate system bounds: 680x396 for Free Draw & Experimental Draw, 592x344 for Normal rooms
  const LOGICAL_WIDTH = (isFreeDraw || isExperimental) ? FREE_DRAW_LOGICAL_WIDTH : DEFAULT_LOGICAL_WIDTH;
  const LOGICAL_HEIGHT = (isFreeDraw || isExperimental) ? FREE_DRAW_LOGICAL_HEIGHT : DEFAULT_LOGICAL_HEIGHT;

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
  const activePointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentPathRef = useRef<{ x: number; y: number }[]>([]);

  // Phase 5A: Parallel Canonical Stroke Prototype Refs (Shadow / Local-Only)
  const canonicalStrokeRef = useRef<{ x: number; y: number }[]>([]);
  const provisionalTailRef = useRef<{ x: number; y: number } | null>(null);
  const lastCanonicalDirXRef = useRef<number>(0);
  const lastCanonicalDirYRef = useRef<number>(0);
  const lastCanonicalSegmentLenRef = useRef<number>(0);
  const canonicalTurnsRef = useRef<number>(0);

  const canonicalStatsRef = useRef<CanonicalMetrics>({
    lastCanonicalPoints: 0,
    lastNetworkPoints: 0,
    lastDensePoints: 0,
    totalCanonicalPoints: 0,
    totalNetworkPoints: 0,
    totalDensePoints: 0,
    strokesCount: 0,
    shadow: { ...INITIAL_SHADOW_METRICS }
  });
  const strokeWireBytesRef = useRef<number>(0);
  const strokeBatchCountRef = useRef<number>(0);
  const activeSessionsRef = useRef<Record<string, {
    tool: ToolType;
    color: string;
    width: number;
    opacity: number;
    path: { x: number; y: number }[];
    strokeId?: number;
    networkPointCount?: number;
    rawPoints?: { x: number; y: number }[];
    pendingQueue?: { x: number; y: number }[];
  }>>({});
  const spectatorPlaybackRafRef = useRef<number | null>(null);

  interface DrainingStroke {
    instanceId: string;
    strokeId: number;
    tool: ToolType;
    color: string;
    width: number;
    opacity: number;
    path: { x: number; y: number }[];
    pendingQueue: { x: number; y: number }[];
    rawPoints?: { x: number; y: number }[];
  }
  const drainingStrokesRef = useRef<DrainingStroke[]>([]);

  // Batch network throttle
  const moveBatchRef = useRef<{ x: number; y: number }[]>([]);
  const networkStrokePointsRef = useRef<{ x: number; y: number }[]>([]);
  const lastNetworkPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastNetworkDirXRef = useRef<number>(0);
  const lastNetworkDirYRef = useRef<number>(0);
  const lastNetworkSegmentLenRef = useRef<number>(0);
  const consecutiveTurnsRef = useRef<number>(0);
  const currentLocalStrokeIdRef = useRef<number>(1);
  const drawerNetworkPointCountRef = useRef<number>(0);
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const bucketTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const preventBucketRef = useRef(false);

  // 📊 Local Diagnostic Counters (Zero network, zero state updates per event)
  const drawingDiagRef = useRef<DrawingDiagnosticStats>({
    drawMove: { count: 0, points: 0, bytes: 0 },
    drawStroke: { count: 0, points: 0, bytes: 0 },
    drawStart: { count: 0, bytes: 0 },
    drawEnd: { count: 0, bytes: 0 },
    drawCommit: { count: 0 },
    drawRepair: { count: 0 },
    drawAbort: { count: 0 },
  });
  const [diagSnapshot, setDiagSnapshot] = useState<DrawingDiagnosticStats | null>(null);
  const [isDiagnosticsVisible, setIsDiagnosticsVisible] = useState(false);
  // 📊 Lazy Diagnostics: Only active and polling when explicitly opened by user
  useEffect(() => {
    if (!ENABLE_FREE_DRAW_DIAGNOSTICS || !propsRef.current.isFreeDraw || !isDiagnosticsVisible) {
      return;
    }

    // Capture initial snapshot immediately on open
    setDiagSnapshot({
      drawMove: { ...drawingDiagRef.current.drawMove },
      drawStroke: { ...drawingDiagRef.current.drawStroke },
      drawStart: { ...drawingDiagRef.current.drawStart },
      drawEnd: { ...drawingDiagRef.current.drawEnd },
      drawCommit: { ...drawingDiagRef.current.drawCommit },
      drawRepair: { ...drawingDiagRef.current.drawRepair },
      drawAbort: { ...drawingDiagRef.current.drawAbort },
      canonicalMetrics: { ...canonicalStatsRef.current }
    });

    const interval = setInterval(() => {
      setDiagSnapshot({
        drawMove: { ...drawingDiagRef.current.drawMove },
        drawStroke: { ...drawingDiagRef.current.drawStroke },
        drawStart: { ...drawingDiagRef.current.drawStart },
        drawEnd: { ...drawingDiagRef.current.drawEnd },
        drawCommit: { ...drawingDiagRef.current.drawCommit },
        drawRepair: { ...drawingDiagRef.current.drawRepair },
        drawAbort: { ...drawingDiagRef.current.drawAbort },
        canonicalMetrics: { ...canonicalStatsRef.current }
      });
    }, 600);
    return () => clearInterval(interval);
  }, [isDiagnosticsVisible]);

  const resetDiagnosticStats = () => {
    drawingDiagRef.current = {
      drawMove: { count: 0, points: 0, bytes: 0 },
      drawStroke: { count: 0, points: 0, bytes: 0 },
      drawStart: { count: 0, bytes: 0 },
      drawEnd: { count: 0, bytes: 0 },
      drawCommit: { count: 0 },
      drawRepair: { count: 0 },
      drawAbort: { count: 0 },
    };
    canonicalStatsRef.current = {
      lastCanonicalPoints: 0,
      lastNetworkPoints: 0,
      lastDensePoints: 0,
      totalCanonicalPoints: 0,
      totalNetworkPoints: 0,
      totalDensePoints: 0,
      strokesCount: 0,
      shadow: { ...INITIAL_SHADOW_METRICS }
    };
    setDiagSnapshot({
      drawMove: { ...drawingDiagRef.current.drawMove },
      drawStroke: { ...drawingDiagRef.current.drawStroke },
      drawStart: { ...drawingDiagRef.current.drawStart },
      drawEnd: { ...drawingDiagRef.current.drawEnd },
      drawCommit: { ...drawingDiagRef.current.drawCommit },
      drawRepair: { ...drawingDiagRef.current.drawRepair },
      drawAbort: { ...drawingDiagRef.current.drawAbort },
      canonicalMetrics: { ...canonicalStatsRef.current }
    });
  };

  useEffect(() => {
    return () => {
      if (bucketTimeoutRef.current) {
        clearTimeout(bucketTimeoutRef.current);
      }
      if (spectatorPlaybackRafRef.current !== null) {
        cancelAnimationFrame(spectatorPlaybackRafRef.current);
        spectatorPlaybackRafRef.current = null;
      }
      drainingStrokesRef.current = [];
    };
  }, []);

  const isReplayingRef = useRef(false);

  // Deterministic local command queue for flawless client-side undo/redo and late-joiner state recovery
  const localCommandsRef = useRef<any[]>([]);
  const localRedoStackRef = useRef<any[]>([]);
  const prevCommandsCountRef = useRef<number>(-1);

  // 🛡️ Free Draw 1-Step Undo/Redo Canvas Caches (Prevents O(N) full replays in long sessions)
  const freeDrawUndoCacheCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const freeDrawRedoCacheCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const freeDrawPendingUndoCacheCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasFreeDrawUndoCacheRef = useRef<boolean>(false);
  const hasFreeDrawRedoCacheRef = useRef<boolean>(false);
  const hasFreeDrawPendingUndoCacheRef = useRef<boolean>(false);

  // Free Draw Cache Lifecycle Helpers
  const ensureCacheCanvas = (cacheRef: React.MutableRefObject<HTMLCanvasElement | null>, targetCanvas: HTMLCanvasElement) => {
    if (!cacheRef.current) {
      cacheRef.current = document.createElement('canvas');
    }
    if (cacheRef.current.width !== targetCanvas.width || cacheRef.current.height !== targetCanvas.height) {
      cacheRef.current.width = targetCanvas.width;
      cacheRef.current.height = targetCanvas.height;
    }
    return cacheRef.current;
  };

  const copyCanvasContent = (source: HTMLCanvasElement, target: HTMLCanvasElement) => {
    if (target.width !== source.width || target.height !== source.height) {
      target.width = source.width;
      target.height = source.height;
    }
    const tCtx = target.getContext('2d');
    if (tCtx) {
      tCtx.globalCompositeOperation = 'copy';
      tCtx.drawImage(source, 0, 0);
      tCtx.globalCompositeOperation = 'source-over';
    }
  };

  const restoreCanvasFromCache = (cache: HTMLCanvasElement, target: HTMLCanvasElement): boolean => {
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
  };

  const stageFreeDrawPendingCache = () => {
    const useCache = propsRef.current.isFreeDraw || Boolean(propsRef.current.enableBitmapUndoCache);
    if (!useCache || propsRef.current.readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pendingCanvas = ensureCacheCanvas(freeDrawPendingUndoCacheCanvasRef, canvas);
    copyCanvasContent(canvas, pendingCanvas);
    hasFreeDrawPendingUndoCacheRef.current = true;
  };

  const commitFreeDrawPendingCache = () => {
    const useCache = propsRef.current.isFreeDraw || Boolean(propsRef.current.enableBitmapUndoCache);
    if (!useCache) return;
    if (hasFreeDrawPendingUndoCacheRef.current && freeDrawPendingUndoCacheCanvasRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const undoCanvas = ensureCacheCanvas(freeDrawUndoCacheCanvasRef, canvas);
      copyCanvasContent(freeDrawPendingUndoCacheCanvasRef.current, undoCanvas);
      hasFreeDrawUndoCacheRef.current = true;
      hasFreeDrawPendingUndoCacheRef.current = false;
      hasFreeDrawRedoCacheRef.current = false;
    }
  };

  const captureDirectFreeDrawUndoCache = () => {
    const useCache = propsRef.current.isFreeDraw || Boolean(propsRef.current.enableBitmapUndoCache);
    if (!useCache) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const undoCanvas = ensureCacheCanvas(freeDrawUndoCacheCanvasRef, canvas);
    copyCanvasContent(canvas, undoCanvas);
    hasFreeDrawUndoCacheRef.current = true;
    hasFreeDrawPendingUndoCacheRef.current = false;
    hasFreeDrawRedoCacheRef.current = false;
  };

  const invalidateFreeDrawCaches = () => {
    const useCache = propsRef.current.isFreeDraw || Boolean(propsRef.current.enableBitmapUndoCache);
    if (!useCache) return;
    hasFreeDrawUndoCacheRef.current = false;
    hasFreeDrawRedoCacheRef.current = false;
    hasFreeDrawPendingUndoCacheRef.current = false;
  };

  // 🛡️ Free Draw Sliding Checkpoint Refs & Helpers (Strategy C: Incremental Forward Baking)
  const checkpointCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const checkpointIndexRef = useRef<number>(0);
  const checkpointAnchorSignatureRef = useRef<string | null>(null);

  const getCommandSignature = (cmd: any): string => {
    if (!cmd) return "";
    const instId = cmd.instanceId || (cmd.data && typeof cmd.data === 'object' ? cmd.data.instanceId : "");
    const sId = cmd.strokeId !== undefined ? cmd.strokeId : -1;
    return `${instId}_${sId}`;
  };

  const ensureCheckpointCanvas = () => {
    if (!checkpointCanvasRef.current) {
      checkpointCanvasRef.current = document.createElement('canvas');
    }
    const effectiveDPR = (propsRef.current.isFreeDraw || propsRef.current.isExperimental || enableFixedDPR) ? 1.0 : DPR;
    const targetW = Math.round(LOGICAL_WIDTH * effectiveDPR);
    const targetH = Math.round(LOGICAL_HEIGHT * effectiveDPR);
    if (checkpointCanvasRef.current.width !== targetW || checkpointCanvasRef.current.height !== targetH) {
      checkpointCanvasRef.current.width = targetW;
      checkpointCanvasRef.current.height = targetH;
    }
    const cCtx = checkpointCanvasRef.current.getContext('2d');
    if (cCtx) {
      cCtx.setTransform(effectiveDPR, 0, 0, effectiveDPR, 0, 0);
      cCtx.lineCap = 'round';
      cCtx.lineJoin = 'round';
      cCtx.imageSmoothingEnabled = true;
      cCtx.imageSmoothingQuality = 'high';
    }
    return checkpointCanvasRef.current;
  };

  const invalidateCheckpoint = () => {
    checkpointIndexRef.current = 0;
    checkpointAnchorSignatureRef.current = null;
    if (checkpointCanvasRef.current) {
      const cCtx = checkpointCanvasRef.current.getContext('2d');
      if (cCtx) {
        cCtx.clearRect(0, 0, checkpointCanvasRef.current.width, checkpointCanvasRef.current.height);
      }
    }
  };

  const advanceCheckpointIncremental = () => {
    if (!propsRef.current.isFreeDraw) return;
    const list = localCommandsRef.current;
    const N = list.length;
    if (N - checkpointIndexRef.current < FREE_DRAW_TAIL_SIZE * 2) return;

    const targetIndex = N - FREE_DRAW_TAIL_SIZE;
    const fromIndex = checkpointIndexRef.current;
    if (targetIndex <= fromIndex) return;

    const canvas = ensureCheckpointCanvas();
    const cCtx = canvas.getContext('2d');
    if (!cCtx) return;

    if (fromIndex === 0) {
      cCtx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const replayPaths: Record<string, { x: number; y: number }[]> = {};
    const replaySessions: Record<string, { tool: ToolType; color: string; width: number; opacity: number }> = {};

    for (let i = fromIndex; i < targetIndex; i++) {
      applyReplayCommand(cCtx, list[i], replayPaths, replaySessions);
    }

    Object.keys(replaySessions).forEach((instId) => {
      try {
        const session = replaySessions[instId];
        const path = replayPaths[instId];
        if (session && path && path.length > 0) {
          const isShape = session.tool !== 'pencil' && session.tool !== 'eraser';
          if (isShape) {
            const startPt = path[0];
            const lastPt = path[path.length - 1];
            drawShape(cCtx, startPt.x, startPt.y, lastPt.x, lastPt.y, session.tool, session.color, session.width, session.opacity);
          } else {
            drawEntirePath(cCtx, path, session.tool, session.color, session.width, session.opacity);
          }
        }
      } catch (err) {}
    });

    checkpointIndexRef.current = targetIndex;
    checkpointAnchorSignatureRef.current = getCommandSignature(list[targetIndex - 1]);
  };

  // Buffering history syncing before ref ready
  const bufferedSyncRef = useRef<any[] | null>(null);
  const lastSyncRequestTimeRef = useRef<number>(0);

  // Layout scale tracking for responsive full viewport fitting
  const containerRef = useRef<HTMLDivElement>(null);
  const transformWrapperRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef({ scale: 1, x: 0, y: 0 });
  const baseScaleRef = useRef(1);
  const hasInitializedTransform = useRef(false);
  const isCanvasResizeObserverReadyRef = useRef(false);
  const hasManuallyZoomedOrPanned = useRef(false);
  const activeTouchCountRef = useRef(0);
  const isZoomPinchingRef = useRef(false);
  const redrawRequestedRef = useRef(false);

  // Safe Edge Stroke Entry refs (تتبع الرسم عند البدء من خارج حدود اللوحة وسحب الإصبع لداخلها)
  const lastOutsideTouchRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const touchStartedOutsideRef = useRef(false);
  const touchDrawingActiveFromOutsideRef = useRef(false);
  const exitedOutsideWhilePointerDownRef = useRef(false);
  const lastOutsidePointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const strokeHandlerRef = useRef<{
    start: (x: number, y: number) => void;
    move: (x: number, y: number) => void;
    end: () => void;
  } | null>(null);
  const shapeHandlerRef = useRef<{
    start: (rawX: number, rawY: number) => void;
    move: (rawX: number, rawY: number) => void;
    end: (rawX: number, rawY: number) => void;
  } | null>(null);
  const outsideShapeStartCoordsRef = useRef<{ x: number; y: number } | null>(null);

  // Force re-centering instantly when user drawing status / role updates and reset observer readiness gate
  useEffect(() => {
    hasInitializedTransform.current = false;
    hasManuallyZoomedOrPanned.current = false;
    isCanvasResizeObserverReadyRef.current = false;
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
  const propsRef = useRef({ tool, color, thickness, opacity, readOnly, isFreeDraw, isExperimental, enableInputOptimizations, enableBitmapUndoCache, enableFixedDPR, enableCanvasAlpha, enableDestinationOutEraser, enableNetworkSampling, enableCanonicalLocalTest, enableSingleSourceCanonical });
  propsRef.current = { tool, color, thickness, opacity, readOnly, isFreeDraw, isExperimental, enableInputOptimizations, enableBitmapUndoCache, enableFixedDPR, enableCanvasAlpha, enableDestinationOutEraser, enableNetworkSampling, enableCanonicalLocalTest, enableSingleSourceCanonical };
  useEffect(() => {
    propsRef.current = { tool, color, thickness, opacity, readOnly, isFreeDraw, isExperimental, enableInputOptimizations, enableBitmapUndoCache, enableFixedDPR, enableCanvasAlpha, enableDestinationOutEraser, enableNetworkSampling, enableCanonicalLocalTest, enableSingleSourceCanonical };
  }, [tool, color, thickness, opacity, readOnly, isFreeDraw, isExperimental, enableInputOptimizations, enableBitmapUndoCache, enableFixedDPR, enableCanvasAlpha, enableDestinationOutEraser, enableNetworkSampling, enableCanonicalLocalTest, enableSingleSourceCanonical]);

  const applyTransformRef = useRef<(overrideBaseScale?: number) => void>(() => {});
  applyTransformRef.current = (overrideBaseScale?: number) => {
    if (transformWrapperRef.current) {
      if (propsRef.current.readOnly) {
        transformWrapperRef.current.style.transform = 'none';
        return;
      }
      const { x, y, scale } = transformRef.current;
      const currentBaseScale = overrideBaseScale !== undefined ? overrideBaseScale : baseScaleRef.current;
      transformWrapperRef.current.style.transform = `translate(${x}px, ${y}px) scale(${currentBaseScale * scale})`;
    }
  };
  const applyTransform = (overrideBaseScale?: number) => applyTransformRef.current(overrideBaseScale);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measureAndCenter = (width: number, height: number) => {
      if (width === 0 || height === 0) return;
      
      const targetScale = readOnly
        ? Math.min(width / LOGICAL_WIDTH, height / LOGICAL_HEIGHT)
        : height / LOGICAL_HEIGHT;
      
      baseScaleRef.current = targetScale;
      
      // Exact responsive centered coordinates
      const canvasDisplayWidth = LOGICAL_WIDTH * targetScale;
      const canvasDisplayHeight = LOGICAL_HEIGHT * targetScale;
      const initialX = (width - canvasDisplayWidth) / 2;
      const initialY = (height - canvasDisplayHeight) / 2;

      // Auto-center on layout update/transition unless the player already Zoomed or Panned manually
      if (!hasInitializedTransform.current || readOnly || !hasManuallyZoomedOrPanned.current) {
        transformRef.current = { scale: 1, x: initialX, y: initialY };
        applyTransform(targetScale);
        if (!readOnly) hasInitializedTransform.current = true;
      }
      
      // Signal that the DOM is fully laid out and physical scale is evaluated
      isCanvasResizeObserverReadyRef.current = true;
    };

    // Immediate check: if container already has non-zero layout dimensions, center and ready up instantly
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      measureAndCenter(container.clientWidth, container.clientHeight);
    }

    const obs = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        measureAndCenter(width, height);
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

    // Performance optimization for mobile pinch/zoom:
    // Cache container bounding rect during active gesture to prevent forced layout thrashing on every touchmove
    let cachedContainerRect: DOMRect | null = null;
    let gestureRafId: number | null = null;

    const flushPendingTransform = () => {
      if (gestureRafId !== null) {
        cancelAnimationFrame(gestureRafId);
        gestureRafId = null;
        applyTransform();
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      activeTouchCountRef.current = e.touches.length;

      if (e.touches.length >= 2) {
        touchStartedOutsideRef.current = false;
        touchDrawingActiveFromOutsideRef.current = false;
        lastOutsideTouchRef.current = null;
        preventBucketRef.current = true;
        if (bucketTimeoutRef.current) {
          clearTimeout(bucketTimeoutRef.current);
          bucketTimeoutRef.current = null;
        }
      }

      // Immediately cancel any active solo-touch stroke if user introduces a second touch (pinch zoom start)
      if (e.touches.length >= 2 && isDrawingRef.current) {
        touchDrawingActiveFromOutsideRef.current = false;
        isDrawingRef.current = false;
        
        if (tempCtxRef.current) {
          tempCtxRef.current.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
        }
        moveBatchRef.current = [];
        networkStrokePointsRef.current = [];
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

      if (e.touches.length === 1 && !propsRef.current.readOnly) {
        const t = e.touches[0];
        lastOutsideTouchRef.current = { clientX: t.clientX, clientY: t.clientY };
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const isInside = t.clientX >= rect.left && t.clientX <= rect.right && t.clientY >= rect.top && t.clientY <= rect.bottom;
          touchStartedOutsideRef.current = !isInside;
          if (!isInside) {
            const rawCoords = getLogicalCoords(t.clientX, t.clientY, canvas, false);
            outsideShapeStartCoordsRef.current = { x: rawCoords.x, y: rawCoords.y };
          }
        }
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
        cachedContainerRect = rect;
        touchStartCenterX = clientMidX - rect.left;
        touchStartCenterY = clientMidY - rect.top;

        touchStartX = transformRef.current.x;
        touchStartY = transformRef.current.y;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      activeTouchCountRef.current = e.touches.length;

      if (e.touches.length >= 2) {
        touchStartedOutsideRef.current = false;
        touchDrawingActiveFromOutsideRef.current = false;
        lastOutsideTouchRef.current = null;
        outsideShapeStartCoordsRef.current = null;
        preventBucketRef.current = true;
        if (bucketTimeoutRef.current) {
          clearTimeout(bucketTimeoutRef.current);
          bucketTimeoutRef.current = null;
        }
      }

      // Safe Edge Stroke Entry for Mobile (سحب الإصبع من خارج حافة الشاشة إلى داخل اللوحة)
      if (
        e.touches.length === 1 &&
        !propsRef.current.readOnly &&
        !isZoomPinchingRef.current &&
        isCanvasResizeObserverReadyRef.current &&
        canvasRef.current
      ) {
        const rect = canvasRef.current.getBoundingClientRect();
        const t = e.touches[0];
        const isInside = t.clientX >= rect.left && t.clientX <= rect.right && t.clientY >= rect.top && t.clientY <= rect.bottom;
        if (!isInside) {
          touchStartedOutsideRef.current = true;
          lastOutsideTouchRef.current = { clientX: t.clientX, clientY: t.clientY };
        }
      }

      if (
        e.touches.length === 1 &&
        touchStartedOutsideRef.current &&
        !propsRef.current.readOnly &&
        !isZoomPinchingRef.current &&
        isCanvasResizeObserverReadyRef.current
      ) {
        const activeTool = propsRef.current.tool;
        const isShape = activeTool === 'line' || activeTool === 'strokeRect' || activeTool === 'fillRect' || activeTool === 'strokeCircle' || activeTool === 'fillCircle';
        const canvas = canvasRef.current;

        if (isShape && canvas) {
          const t = e.touches[0];
          lastOutsideTouchRef.current = { clientX: t.clientX, clientY: t.clientY };
          const raw = getLogicalCoords(t.clientX, t.clientY, canvas, false);
          if (!isDrawingRef.current) {
            const startPt = outsideShapeStartCoordsRef.current || raw;
            shapeHandlerRef.current?.start(startPt.x, startPt.y);
            touchDrawingActiveFromOutsideRef.current = true;
          } else if (touchDrawingActiveFromOutsideRef.current) {
            shapeHandlerRef.current?.move(raw.x, raw.y);
            if (e.cancelable) e.preventDefault();
          }
        } else if ((activeTool === 'pencil' || activeTool === 'eraser') && canvas) {
          const rect = canvas.getBoundingClientRect();
          const t = e.touches[0];
          const isInside = t.clientX >= rect.left && t.clientX <= rect.right && t.clientY >= rect.top && t.clientY <= rect.bottom;

          if (!isDrawingRef.current) {
            if (isInside) {
              let entryX = 0;
              let entryY = 0;
              if (lastOutsideTouchRef.current) {
                const entryCoords = getLogicalCoords(lastOutsideTouchRef.current.clientX, lastOutsideTouchRef.current.clientY, canvas, true);
                entryX = entryCoords.x;
                entryY = entryCoords.y;
              } else {
                const curCoords = getLogicalCoords(t.clientX, t.clientY, canvas, true);
                entryX = curCoords.x;
                entryY = curCoords.y;
              }
              strokeHandlerRef.current?.start(entryX, entryY);
              touchDrawingActiveFromOutsideRef.current = true;

              const curCoords = getLogicalCoords(t.clientX, t.clientY, canvas, true);
              strokeHandlerRef.current?.move(curCoords.x, curCoords.y);
              if (e.cancelable) e.preventDefault();
            } else {
              lastOutsideTouchRef.current = { clientX: t.clientX, clientY: t.clientY };
            }
          } else if (touchDrawingActiveFromOutsideRef.current) {
            if (propsRef.current.isFreeDraw) {
              const rawCoords = getLogicalCoords(t.clientX, t.clientY, canvas, false);
              strokeHandlerRef.current?.move(rawCoords.x, rawCoords.y);
              if (e.cancelable) e.preventDefault();
            } else {
              if (isInside) {
                const curCoords = getLogicalCoords(t.clientX, t.clientY, canvas, true);
                strokeHandlerRef.current?.move(curCoords.x, curCoords.y);
                if (e.cancelable) e.preventDefault();
              } else {
                const clamped = getLogicalCoords(t.clientX, t.clientY, canvas, true);
                strokeHandlerRef.current?.move(clamped.x, clamped.y);
                strokeHandlerRef.current?.end();
                touchDrawingActiveFromOutsideRef.current = false;
                lastOutsideTouchRef.current = { clientX: t.clientX, clientY: t.clientY };
                if (e.cancelable) e.preventDefault();
              }
            }
          }
        }
      }

      if (!isZoomEnabled || propsRef.current.readOnly) return;

      if (e.touches.length === 2) {
        e.preventDefault();

        const t1 = e.touches[0];
        const t2 = e.touches[1];

        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (!cachedContainerRect) {
          cachedContainerRect = container.getBoundingClientRect();
        }
        const rect = cachedContainerRect;

        // If touchStart was missed, interrupted, or zero-distance, re-anchor cleanly
        if ((!isPinching || touchStartDist <= 0) && dist > 0) {
          isPinching = true;
          isZoomPinchingRef.current = true;
          touchStartDist = dist;
          touchStartScale = (transformRef.current.scale && isFinite(transformRef.current.scale) && transformRef.current.scale > 0) ? transformRef.current.scale : 1;
          touchStartCenterX = (t1.clientX + t2.clientX) / 2 - rect.left;
          touchStartCenterY = (t1.clientY + t2.clientY) / 2 - rect.top;
          touchStartX = isFinite(transformRef.current.x) ? transformRef.current.x : 0;
          touchStartY = isFinite(transformRef.current.y) ? transformRef.current.y : 0;
        }

        if (touchStartDist > 0 && dist > 0) {
          const containerW = rect.width;
          const containerH = rect.height;

          // Dynamically compute perfect fit scale so mobile user can see full drawing stage
          const currentBase = (baseScaleRef.current && isFinite(baseScaleRef.current) && baseScaleRef.current > 0) ? baseScaleRef.current : 1;
          const fitWidthScale = containerW / (LOGICAL_WIDTH * currentBase);
          const fitHeightScale = containerH / (LOGICAL_HEIGHT * currentBase);
          const perfectFitScale = Math.min(fitWidthScale, fitHeightScale);
          const minScaleLimit = Math.max(0.3, Math.min(1.0, (isFinite(perfectFitScale) && perfectFitScale > 0 ? perfectFitScale : 1) * 0.9));

          let scaleFactor = dist / touchStartDist;
          if (!isFinite(scaleFactor) || scaleFactor <= 0) scaleFactor = 1;
          const safeStartScale = (touchStartScale && isFinite(touchStartScale) && touchStartScale > 0) ? touchStartScale : 1;
          let nextScale = Math.max(minScaleLimit, Math.min(4.0, safeStartScale * scaleFactor));
          if (!isFinite(nextScale)) nextScale = 1;

          const clientMidX = (t1.clientX + t2.clientX) / 2;
          const clientMidY = (t1.clientY + t2.clientY) / 2;
          const currentCenterX = clientMidX - rect.left;
          const currentCenterY = clientMidY - rect.top;

          let nextX = currentCenterX - ((touchStartCenterX - touchStartX) / safeStartScale) * nextScale;
          let nextY = currentCenterY - ((touchStartCenterY - touchStartY) / safeStartScale) * nextScale;
          if (!isFinite(nextX)) nextX = transformRef.current.x || 0;
          if (!isFinite(nextY)) nextY = transformRef.current.y || 0;

          // Apply boundary buffers to prevent the canvas from getting lost offscreen
          const dispW = LOGICAL_WIDTH * currentBase * nextScale;
          const dispH = LOGICAL_HEIGHT * currentBase * nextScale;

          const minX = -dispW + 100;
          const maxX = containerW - 100;
          const minY = -dispH + 100;
          const maxY = containerH - 100;

          if (minX <= maxX) nextX = Math.max(minX, Math.min(maxX, nextX));
          if (minY <= maxY) nextY = Math.max(minY, Math.min(maxY, nextY));

          transformRef.current = { scale: nextScale, x: nextX, y: nextY };
          hasManuallyZoomedOrPanned.current = true;

          // Coalesce DOM transform updates onto screen refresh rate (rAF) to eliminate main-thread layout bottleneck
          if (gestureRafId === null) {
            gestureRafId = requestAnimationFrame(() => {
              gestureRafId = null;
              applyTransform();
            });
          }
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      activeTouchCountRef.current = e.touches.length;

      if (e.touches.length === 0) {
        preventBucketRef.current = false;
        if (touchDrawingActiveFromOutsideRef.current) {
          touchDrawingActiveFromOutsideRef.current = false;
          touchStartedOutsideRef.current = false;
          const activeTool = propsRef.current.tool;
          const isShape = activeTool === 'line' || activeTool === 'strokeRect' || activeTool === 'fillRect' || activeTool === 'strokeCircle' || activeTool === 'fillCircle';
          const canvas = canvasRef.current;
          if (isShape && canvas && lastOutsideTouchRef.current) {
            const raw = getLogicalCoords(lastOutsideTouchRef.current.clientX, lastOutsideTouchRef.current.clientY, canvas, false);
            shapeHandlerRef.current?.end(raw.x, raw.y);
          } else if (isShape) {
            shapeHandlerRef.current?.end(startXRef.current, startYRef.current);
          } else {
            strokeHandlerRef.current?.end();
          }
          lastOutsideTouchRef.current = null;
          outsideShapeStartCoordsRef.current = null;
        } else {
          touchStartedOutsideRef.current = false;
          lastOutsideTouchRef.current = null;
          outsideShapeStartCoordsRef.current = null;
        }
      }

      if (isPinching) {
        isPinching = false;
        touchStartDist = 0;
        cachedContainerRect = null;
        flushPendingTransform();

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
      if (gestureRafId !== null) {
        cancelAnimationFrame(gestureRafId);
        gestureRafId = null;
      }
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isZoomEnabled, readOnly]);

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
      const fitWidthScale = containerW / (LOGICAL_WIDTH * baseScaleRef.current);
      const fitHeightScale = containerH / (LOGICAL_HEIGHT * baseScaleRef.current);
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
      const dispW = LOGICAL_WIDTH * baseScaleRef.current * nextScale;
      const dispH = LOGICAL_HEIGHT * baseScaleRef.current * nextScale;

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
  }, [isZoomEnabled, readOnly]);

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
      const dispW = LOGICAL_WIDTH * baseScaleRef.current * transformRef.current.scale;
      const dispH = LOGICAL_HEIGHT * baseScaleRef.current * transformRef.current.scale;
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
  }, [isZoomEnabled, readOnly]);

  // Expose handles to Parent Component
  useImperativeHandle(ref, () => ({
    undo: () => executeUndo(true),
    redo: () => executeRedo(true),
    clear: () => executeClear(true),
    resetState: () => {
      flushPendingReset();
      executeResetState();
    },
    getCanvasSnapshot: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      if (!propsRef.current.isFreeDraw) {
        return canvas.toDataURL('image/png');
      }
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const exportCtx = exportCanvas.getContext('2d');
      if (exportCtx) {
        exportCtx.fillStyle = '#ffffff';
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        exportCtx.drawImage(canvas, 0, 0);
        return exportCanvas.toDataURL('image/png');
      }
      return canvas.toDataURL('image/png');
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

      // 📊 Runtime Diagnostic: capture exact encoded ArrayBuffer byteLength locally
      if (ENABLE_FREE_DRAW_DIAGNOSTICS && propsRef.current.isFreeDraw && msg) {
        const byteLen = msg.byteLength;
        if (event === 'draw_move') {
          const pts = Array.isArray(payload.moves) ? payload.moves.length : 1;
          drawingDiagRef.current.drawMove.count++;
          drawingDiagRef.current.drawMove.points += pts;
          drawingDiagRef.current.drawMove.bytes += byteLen;
          strokeWireBytesRef.current += byteLen;
          strokeBatchCountRef.current++;
        } else if (event === 'draw_stroke') {
          const pts = Array.isArray(payload.points) ? payload.points.length : 0;
          drawingDiagRef.current.drawStroke.count++;
          drawingDiagRef.current.drawStroke.points += pts;
          drawingDiagRef.current.drawStroke.bytes += byteLen;
        } else if (event === 'draw_start') {
          drawingDiagRef.current.drawStart.count++;
          drawingDiagRef.current.drawStart.bytes += byteLen;
        } else if (event === 'draw_end') {
          drawingDiagRef.current.drawEnd.count++;
          drawingDiagRef.current.drawEnd.bytes += byteLen;
        }
      }

      if (event === 'draw_move' && socket.volatile) {
        socket.volatile.emit('draw_binary', msg);
      } else {
        socket.emit('draw_binary', msg);
      }

      // Record local durable drawing history for deterministic undo / redo
      if (event === 'draw_stroke' || event === 'draw_clear' || (event === 'draw_action' && payload.tool === 'bucket')) {
        prevCommandsCountRef.current = localCommandsRef.current.length;
        localCommandsRef.current.push({
          event: 'draw_binary',
          data: msg,
          instanceId,
          strokeId: payload.strokeId || currentLocalStrokeIdRef.current
        });
        advanceCheckpointIncremental();
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
  const getLogicalCoords = (clientX: number, clientY: number, canvas: HTMLCanvasElement, clamp: boolean = true) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    let x = ((clientX - rect.left) / rect.width) * LOGICAL_WIDTH;
    let y = ((clientY - rect.top) / rect.height) * LOGICAL_HEIGHT;
    if (clamp) {
      x = Math.max(0, Math.min(LOGICAL_WIDTH, x));
      y = Math.max(0, Math.min(LOGICAL_HEIGHT, y));
    }
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  };

  // --- Dynamic Drawing Functions ---
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
      if ((propsRef.current.isFreeDraw || propsRef.current.enableDestinationOutEraser) && activeCtx !== tempCtxRef.current) {
        activeCtx.globalCompositeOperation = 'destination-out';
        activeCtx.strokeStyle = 'rgba(0,0,0,1)';
        activeCtx.fillStyle = 'rgba(0,0,0,1)';
      } else {
        activeCtx.strokeStyle = '#ffffff';
        activeCtx.fillStyle = '#ffffff';
      }
    } else {
      activeCtx.strokeStyle = drawColor;
      activeCtx.fillStyle = drawColor;
    }

    if (path.length === 1) {
      activeCtx.beginPath();
      activeCtx.arc(path[0].x, path[0].y, drawWidth / 2, 0, Math.PI * 2);
      activeCtx.fill();
    } else {
      activeCtx.beginPath();
      activeCtx.moveTo(path[0].x, path[0].y);

      if (path.length === 2) {
        activeCtx.lineTo(path[1].x, path[1].y);
      } else {
        const len = path.length;
        // 8 Primitive Stack Variables for Zero-Allocation Hybrid Interpolating Spline
        let cp1x = 0;
        let cp1y = 0;
        let cp2x = 0;
        let cp2y = 0;
        let t1x = 0;
        let t1y = 0;
        let t2x = 0;
        let t2y = 0;

        for (let i = 0; i < len - 1; i++) {
          const pCurr = path[i];
          const pNext = path[i + 1];

          const dx = pNext.x - pCurr.x;
          const dy = pNext.y - pCurr.y;
          const d = Math.hypot(dx, dy);

          if (d < 0.001) {
            // Degenerate zero-length segment: connect directly
            activeCtx.lineTo(pNext.x, pNext.y);
            continue;
          }

          // 1. Compute Tangent T1 at pCurr
          if (i === 0) {
            // Boundary: Start of stroke -> clamp tangent along initial chord
            t1x = dx;
            t1y = dy;
          } else {
            const pPrev = path[i - 1];
            const dx0 = pCurr.x - pPrev.x;
            const dy0 = pCurr.y - pPrev.y;
            const d0 = Math.hypot(dx0, dy0);

            const cosTurn = d0 > 0.001 ? (dx0 * dx + dy0 * dy) / (d0 * d) : 1;

            if (cosTurn < SPLINE_CUSP_COS) {
              // Cusp detected at pCurr: clamp tangent along outgoing chord to preserve sharp corner
              t1x = dx;
              t1y = dy;
            } else {
              // Smooth Catmull-Rom tangent
              t1x = (pNext.x - pPrev.x) * 0.5;
              t1y = (pNext.y - pPrev.y) * 0.5;

              // Shape-preserving tangent clamping against overshoot/looping
              const lenT1 = Math.hypot(t1x, t1y);
              if (lenT1 > d) {
                const scale = d / lenT1;
                t1x *= scale;
                t1y *= scale;
              }
            }
          }

          // 2. Compute Tangent T2 at pNext
          if (i + 1 === len - 1) {
            // Boundary: End of stroke -> clamp tangent along final chord
            t2x = dx;
            t2y = dy;
          } else {
            const pNextNext = path[i + 2];
            const dx2 = pNextNext.x - pNext.x;
            const dy2 = pNextNext.y - pNext.y;
            const d2 = Math.hypot(dx2, dy2);

            const cosTurnNext = d2 > 0.001 ? (dx * dx2 + dy * dy2) / (d * d2) : 1;

            if (cosTurnNext < SPLINE_CUSP_COS) {
              // Cusp detected at pNext: clamp tangent along incoming chord to preserve sharp corner
              t2x = dx;
              t2y = dy;
            } else {
              // Smooth Catmull-Rom tangent
              t2x = (pNextNext.x - pCurr.x) * 0.5;
              t2y = (pNextNext.y - pCurr.y) * 0.5;

              // Shape-preserving tangent clamping against overshoot/looping
              const lenT2 = Math.hypot(t2x, t2y);
              if (lenT2 > d) {
                const scale = d / lenT2;
                t2x *= scale;
                t2y *= scale;
              }
            }
          }

          // 3. Compute Cubic Bézier Control Points directly on the stack
          cp1x = pCurr.x + t1x / 3;
          cp1y = pCurr.y + t1y / 3;
          cp2x = pNext.x - t2x / 3;
          cp2y = pNext.y - t2y / 3;

          // 4. Direct Canvas API invocation - Zero intermediate allocations
          activeCtx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, pNext.x, pNext.y);
        }
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
        const isSingleSource = Boolean(
          propsRef.current.isFreeDraw &&
          (isSingleSourceActiveRef.current || propsRef.current.enableSingleSourceCanonical)
        );

        if (isSingleSource && canonicalStrokeRef.current.length > 0) {
          drawEntirePath(tempCtx, canonicalStrokeRef.current, activeTool, activeColor, activeWidth, activeOpacity);
        } else {
          const isCanonicalActive = Boolean(
            propsRef.current.isFreeDraw &&
            (isCanonicalLocalTestActive || propsRef.current.enableCanonicalLocalTest)
          );

          if (isCanonicalActive && canonicalStrokeRef.current.length > 0) {
            const cPath = canonicalStrokeRef.current;
            const pTail = provisionalTailRef.current;
            if (pTail) {
              drawEntirePath(tempCtx, [...cPath, pTail], activeTool, activeColor, activeWidth, activeOpacity);
            } else {
              drawEntirePath(tempCtx, cPath, activeTool, activeColor, activeWidth, activeOpacity);
            }
          } else if (currentPathRef.current.length > 0) {
            drawEntirePath(tempCtx, currentPathRef.current, activeTool, activeColor, activeWidth, activeOpacity);
          }
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

    drainingStrokesRef.current.forEach((stroke) => {
      if (stroke && stroke.path && stroke.path.length > 0) {
        drawEntirePath(tempCtx, stroke.path, stroke.tool, stroke.color, stroke.width, stroke.opacity);
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

  // 🚀 Free Draw Spectator Playback Ticker
  // Decouples the 200ms network batch frequency from the local display refresh rate.
  // Smoothly drains session.pendingQueue at 60fps across the 200ms arrival window.
  // Smoothly drains committed stroke tails over 2-5 frames (eliminating sudden end-of-stroke jumps).
  const triggerSpectatorPlayback = () => {
    if (spectatorPlaybackRafRef.current !== null) return;

    const tick = () => {
      let hasRemainingPoints = false;
      const ctx = ctxRef.current;
      const sessions = activeSessionsRef.current;
      const instIds = Object.keys(sessions);

      // 1. Drain active in-flight sessions
      for (let i = 0; i < instIds.length; i++) {
        const session = sessions[instIds[i]];
        if (!session || !session.pendingQueue || session.pendingQueue.length === 0) continue;

        const q = session.pendingQueue;

        // Hard safety bound: If queue exceeds 60 points (e.g. background tab or frame drop), fast-forward excess points
        if (q.length > 60) {
          const excess = q.length - 15;
          for (let k = 0; k < excess; k++) {
            session.path.push(q.shift()!);
          }
        }

        // Adaptive drain rate: target draining within ~10-12 frames (approx. 200ms at 60fps)
        const pointsToDrain = Math.max(1, Math.ceil(q.length / 10));
        const count = Math.min(pointsToDrain, q.length);

        for (let k = 0; k < count; k++) {
          session.path.push(q.shift()!);
        }

        if (q.length > 0) {
          hasRemainingPoints = true;
        }
      }

      // 2. Drain committed stroke tails smoothly (slightly accelerated: 2 to 4 points per frame)
      if (drainingStrokesRef.current.length > 0) {
        const remainingDraining: DrainingStroke[] = [];

        for (let i = 0; i < drainingStrokesRef.current.length; i++) {
          const stroke = drainingStrokesRef.current[i];
          const q = stroke.pendingQueue;

          if (q.length > 0) {
            const pointsToDrain = Math.max(2, Math.ceil(q.length / 4));
            const count = Math.min(pointsToDrain, q.length);

            for (let k = 0; k < count; k++) {
              stroke.path.push(q.shift()!);
            }
          }

          if (q.length > 0) {
            hasRemainingPoints = true;
            remainingDraining.push(stroke);
          } else {
            // Tail completely drained: finalize stroke cleanly to permanent canvas ctx
            if (ctx && stroke.path.length > 0) {
              captureDirectFreeDrawUndoCache();
              drawEntirePath(ctx, stroke.path, stroke.tool, stroke.color, stroke.width, stroke.opacity);

              const canonicalStrokeMsg = encodeBinaryDrawMessage('draw_stroke', {
                instanceId: stroke.instanceId,
                tool: stroke.tool,
                color: stroke.color,
                width: stroke.width,
                opacity: stroke.opacity,
                points: stroke.rawPoints || []
              });
              prevCommandsCountRef.current = localCommandsRef.current.length;
              localCommandsRef.current.push({
                event: 'draw_binary',
                data: canonicalStrokeMsg,
                instanceId: stroke.instanceId,
                strokeId: stroke.strokeId
              });
              if (!propsRef.current.isFreeDraw) {
                localRedoStackRef.current = [];
              }
              saveSnapshot();
              syncHistoryButtons();
            }
          }
        }

        drainingStrokesRef.current = remainingDraining;
      }

      redrawTempLayer();

      if (hasRemainingPoints) {
        spectatorPlaybackRafRef.current = requestAnimationFrame(tick);
      } else {
        spectatorPlaybackRafRef.current = null;
      }
    };

    spectatorPlaybackRafRef.current = requestAnimationFrame(tick);
  };

  // ⚡ Fast-forward flush all pending spectator points and draining strokes immediately to canvas
  const fastForwardFlushSpectatorQueue = () => {
    const ctx = ctxRef.current;
    let didFlushAnything = false;

    // 1. Drain all pending in-flight spectator points directly to session paths
    const sessions = activeSessionsRef.current;
    const instIds = Object.keys(sessions);
    for (let i = 0; i < instIds.length; i++) {
      const session = sessions[instIds[i]];
      if (session && session.pendingQueue && session.pendingQueue.length > 0) {
        while (session.pendingQueue.length > 0) {
          session.path.push(session.pendingQueue.shift()!);
        }
        didFlushAnything = true;
      }
    }

    // 2. Finalize any stroke tails in drainingStrokesRef immediately to permanent canvas
    if (drainingStrokesRef.current.length > 0) {
      for (let i = 0; i < drainingStrokesRef.current.length; i++) {
        const stroke = drainingStrokesRef.current[i];
        if (stroke.pendingQueue && stroke.pendingQueue.length > 0) {
          while (stroke.pendingQueue.length > 0) {
            stroke.path.push(stroke.pendingQueue.shift()!);
          }
        }
        if (ctx && stroke.path.length > 0) {
          captureDirectFreeDrawUndoCache();
          drawEntirePath(ctx, stroke.path, stroke.tool, stroke.color, stroke.width, stroke.opacity);
          const canonicalStrokeMsg = encodeBinaryDrawMessage('draw_stroke', {
            instanceId: stroke.instanceId,
            tool: stroke.tool,
            color: stroke.color,
            width: stroke.width,
            opacity: stroke.opacity,
            points: stroke.rawPoints || []
          });
          prevCommandsCountRef.current = localCommandsRef.current.length;
          localCommandsRef.current.push({
            event: 'draw_binary',
            data: canonicalStrokeMsg,
            instanceId: stroke.instanceId,
            strokeId: stroke.strokeId
          });
          if (!propsRef.current.isFreeDraw) {
            localRedoStackRef.current = [];
          }
          didFlushAnything = true;
        }
      }
      drainingStrokesRef.current = [];
    }

    if (spectatorPlaybackRafRef.current !== null) {
      cancelAnimationFrame(spectatorPlaybackRafRef.current);
      spectatorPlaybackRafRef.current = null;
    }

    if (didFlushAnything) {
      redrawTempLayer();
      saveSnapshot();
      syncHistoryButtons();
    }
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
      if ((propsRef.current.isFreeDraw || propsRef.current.enableDestinationOutEraser) && activeCtx !== tempCtxRef.current) {
        activeCtx.globalCompositeOperation = 'destination-out';
        activeCtx.strokeStyle = 'rgba(0,0,0,1)';
        activeCtx.fillStyle = 'rgba(0,0,0,1)';
      } else {
        activeCtx.strokeStyle = '#ffffff';
        activeCtx.fillStyle = '#ffffff';
      }
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

  // 🛡️ Deterministic Canvas Backing-Store Clear:
  // Clears the entire physical framebuffer (0, 0, canvas.width, canvas.height) at identity transform
  // to ensure 100% solid white main canvas and 100% empty transparent temp canvas with zero residual alpha or edge artifacts.
  const resetCanvasBackingStores = (
    targetCtx?: CanvasRenderingContext2D | null,
    targetTempCtx?: CanvasRenderingContext2D | null
  ) => {
    const activeCtx = targetCtx || ctxRef.current;
    const activeTempCtx = targetTempCtx || tempCtxRef.current;

    if (activeCtx && activeCtx.canvas) {
      activeCtx.save();
      activeCtx.setTransform(1, 0, 0, 1, 0, 0);
      if (propsRef.current.isFreeDraw || propsRef.current.enableCanvasAlpha) {
        activeCtx.clearRect(0, 0, activeCtx.canvas.width, activeCtx.canvas.height);
      } else {
        activeCtx.fillStyle = '#ffffff';
        activeCtx.fillRect(0, 0, activeCtx.canvas.width, activeCtx.canvas.height);
      }
      activeCtx.restore();
    }

    if (activeTempCtx && activeTempCtx.canvas) {
      activeTempCtx.save();
      activeTempCtx.setTransform(1, 0, 0, 1, 0, 0);
      activeTempCtx.clearRect(0, 0, activeTempCtx.canvas.width, activeTempCtx.canvas.height);
      activeTempCtx.restore();
      activeTempCtx.beginPath();
    }
  };

  const executeResetState = () => {
    console.log("[DrawingCanvasCore] Hard-resetting drawing state...");
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (ctx && tempCtx) {
      resetCanvasBackingStores(ctx, tempCtx);
    }

    // Reset local/remote paths & sessions
    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    exitedOutsideWhilePointerDownRef.current = false;
    lastOutsidePointerRef.current = null;
    currentPathRef.current = [];
    activeSessionsRef.current = {};
    moveBatchRef.current = [];
    networkStrokePointsRef.current = [];
    lastNetworkPointRef.current = null;
    lastNetworkDirXRef.current = 0;
    lastNetworkDirYRef.current = 0;
    lastNetworkSegmentLenRef.current = 0;
    consecutiveTurnsRef.current = 0;

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

    fastForwardFlushSpectatorQueue();
    if (spectatorPlaybackRafRef.current !== null) {
      cancelAnimationFrame(spectatorPlaybackRafRef.current);
      spectatorPlaybackRafRef.current = null;
    }
    drainingStrokesRef.current = [];

    // Reinitialize Undo / Redo stacks
    bufferedSyncRef.current = null;
    localCommandsRef.current = [];
    localRedoStackRef.current = [];
    prevCommandsCountRef.current = -1;

    // Reinitialize Free Draw Caches
    hasFreeDrawUndoCacheRef.current = false;
    hasFreeDrawRedoCacheRef.current = false;
    hasFreeDrawPendingUndoCacheRef.current = false;

    if (ctx && tempCtx) {
      saveSnapshot(); 
    }

    // Callback to update Parent Component history buttons
    syncHistoryButtons();
  };

  // 🛡️ Task 4: Deferred Reset Mechanism - prevents heavy canvas fill/clear blocking transition frames
  const pendingResetRafRef = useRef<number | null>(null);
  const isResetPendingRef = useRef(false);

  const flushPendingReset = () => {
    if (pendingResetRafRef.current !== null) {
      cancelAnimationFrame(pendingResetRafRef.current);
      pendingResetRafRef.current = null;
    }
    if (isResetPendingRef.current) {
      isResetPendingRef.current = false;
      executeResetState();
    }
  };

  useEffect(() => {
    return () => {
      if (pendingResetRafRef.current !== null) {
        cancelAnimationFrame(pendingResetRafRef.current);
        pendingResetRafRef.current = null;
      }
    };
  }, []);

  const executeClear = (emit: boolean = true) => {
    if (isResetPendingRef.current) {
      flushPendingReset();
    }
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (!ctx || !tempCtx) return;

    invalidateCheckpoint();
    captureDirectFreeDrawUndoCache();

    resetCanvasBackingStores(ctx, tempCtx);

    if (emit) {
      emitDrawCommand('draw_clear', {});
    }
    saveSnapshot();
  };

  const syncHistoryButtons = () => {
    const list = localCommandsRef.current;
    let canUndo = false;
    if (propsRef.current.isFreeDraw) {
      canUndo = list.some(cmd => {
        if (!cmd) return false;
        const cmdInstId = cmd.instanceId || (cmd.data && typeof cmd.data === 'object' ? cmd.data.instanceId : undefined);
        return cmdInstId === instanceId && cmd.strokeId !== undefined;
      });
    } else {
      canUndo = list.length > 0 && localRedoStackRef.current.length === 0;
    }
    const canRedo = localRedoStackRef.current.length > 0;
    const index = canUndo ? 1 : 0;
    const length = index + (canRedo ? 1 : 0) + 1;
    onHistoryStateChange?.(index, length);
  };

  const executeUndo = (emit: boolean = true) => {
    if (isResetPendingRef.current) {
      flushPendingReset();
    }
    const list = localCommandsRef.current;

    // 🎯 Free Draw: Per-User Undo (Exact Target Identification)
    // Searches backwards for the last completed stroke belonging to THIS player only (using their instanceId)
    // and extracts its strokeId. Strictly NO-OP if no stroke belongs to this player.
    if (propsRef.current.isFreeDraw) {
      let targetIndex = -1;
      let targetStrokeId: number | undefined;

      for (let i = list.length - 1; i >= 0; i--) {
        const cmd = list[i];
        if (cmd) {
          const cmdInstId = cmd.instanceId || (cmd.data && typeof cmd.data === 'object' ? cmd.data.instanceId : undefined);
          if (cmdInstId === instanceId && cmd.strokeId !== undefined) {
            targetIndex = i;
            targetStrokeId = cmd.strokeId;
            break;
          }
        }
      }

      if (targetIndex === -1 || targetStrokeId === undefined) {
        return; // NO-OP: No strokes found for this player
      }

      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        moveBatchRef.current = [];
        networkStrokePointsRef.current = [];
      }
      exitedOutsideWhilePointerDownRef.current = false;
      lastOutsidePointerRef.current = null;

      // 1. Optimistic Local Removal:
      if (targetIndex < checkpointIndexRef.current) {
        invalidateCheckpoint();
      }
      const [removedCmd] = list.splice(targetIndex, 1);
      if (removedCmd) {
        localRedoStackRef.current.push(removedCmd);
      }

      // 2. Filter local draining queue if present:
      const beforeDrainingCount = drainingStrokesRef.current.length;
      drainingStrokesRef.current = drainingStrokesRef.current.filter(
        s => !(s.instanceId === instanceId && s.strokeId === targetStrokeId)
      );
      if (drainingStrokesRef.current.length !== beforeDrainingCount) {
        redrawTempLayer();
      }

      // 3. Instant 0ms Local Canvas Replay:
      hasFreeDrawUndoCacheRef.current = false;
      hasFreeDrawRedoCacheRef.current = false;
      replayFreeDrawHistorySafely(list);

      // 4. Send authoritative draw_undo to server for room broadcast:
      if (emit) {
        emitDrawCommand('draw_undo', { strokeId: targetStrokeId });
      }
      return;
    }

    // Normal / Competitive Rooms: Keep existing global undo behavior intact
    const canUndo = list.length > 0 && localRedoStackRef.current.length === 0;
    if (!canUndo) return;

    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      moveBatchRef.current = [];
      networkStrokePointsRef.current = [];
    }
    exitedOutsideWhilePointerDownRef.current = false;
    lastOutsidePointerRef.current = null;

    const removed = list.pop();
    if (removed) {
      localRedoStackRef.current = [removed];
    }

    // 🛡️ Fast-Path: Single Previous-State Canvas Cache (For both local player and spectators)
    let restoredViaCache = false;
    const useCache = Boolean(propsRef.current.enableBitmapUndoCache);
    if (useCache && hasFreeDrawUndoCacheRef.current && freeDrawUndoCacheCanvasRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const redoCanvas = ensureCacheCanvas(freeDrawRedoCacheCanvasRef, canvas);
      copyCanvasContent(canvas, redoCanvas);
      hasFreeDrawRedoCacheRef.current = true;

      restoredViaCache = restoreCanvasFromCache(freeDrawUndoCacheCanvasRef.current, canvas);
      if (restoredViaCache) {
        if (tempCtxRef.current) {
          tempCtxRef.current.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
        }
        hasFreeDrawUndoCacheRef.current = false;
      }
    }

    if (!restoredViaCache) {
      applySyncedHistory(list);
    }

    syncHistoryButtons();

    if (emit) {
      emitDrawCommand('draw_undo', {});
    }
  };

  const executeRedo = (emit: boolean = true) => {
    if (isResetPendingRef.current) {
      flushPendingReset();
    }
    const canRedo = localRedoStackRef.current.length > 0;
    if (!canRedo) return;

    // 🎯 Free Draw Branch: Collaborative Redo
    if (propsRef.current.isFreeDraw) {
      const cmdToRestore = localRedoStackRef.current.pop();
      if (!cmdToRestore) return;

      const rawCmd = Array.isArray(cmdToRestore) ? cmdToRestore[0] : cmdToRestore;
      if (!rawCmd || !rawCmd.data) return;

      const decoded = decodeBinaryDrawMessage(rawCmd.data);
      if (!decoded || !decoded.data) return;

      // Increment monotonic strokeId for the redone command
      currentLocalStrokeIdRef.current = ((currentLocalStrokeIdRef.current || 0) + 1) & 0xFFFF;
      if (currentLocalStrokeIdRef.current === 0) currentLocalStrokeIdRef.current = 1;
      const newStrokeId = currentLocalStrokeIdRef.current;

      let newMsg: ArrayBuffer | null = null;

      if (decoded.event === 'draw_stroke') {
        const payload = {
          tool: decoded.data.tool,
          color: decoded.data.color,
          width: decoded.data.width,
          opacity: decoded.data.opacity,
          points: decoded.data.points,
          strokeId: newStrokeId,
          instanceId
        };
        newMsg = encodeBinaryDrawMessage('draw_stroke', payload);
      } else if (decoded.event === 'draw_action') {
        const targetRGBA = decoded.data.targetRGBA;
        const payload = {
          tool: 'bucket',
          color: decoded.data.color,
          opacity: decoded.data.opacity,
          x: decoded.data.x,
          y: decoded.data.y,
          targetR: targetRGBA ? targetRGBA.r : undefined,
          targetG: targetRGBA ? targetRGBA.g : undefined,
          targetB: targetRGBA ? targetRGBA.b : undefined,
          targetA: targetRGBA ? targetRGBA.a : undefined,
          strokeId: newStrokeId,
          instanceId
        };
        newMsg = encodeBinaryDrawMessage('draw_action', payload);
      }

      if (newMsg) {
        prevCommandsCountRef.current = localCommandsRef.current.length;
        localCommandsRef.current.push({
          event: 'draw_binary',
          data: newMsg,
          instanceId,
          strokeId: newStrokeId
        });

        hasFreeDrawUndoCacheRef.current = false;
        hasFreeDrawRedoCacheRef.current = false;
        replayFreeDrawHistorySafely(localCommandsRef.current);
        advanceCheckpointIncremental();
        syncHistoryButtons();

        if (emit && socket?.connected) {
          socket.emit('draw_binary', newMsg);
        }
      }
      return;
    }

    // Normal / Competitive Rooms: Keep existing global redo behavior intact
    const commandsToRestore = localRedoStackRef.current.pop();
    if (commandsToRestore) {
      if (Array.isArray(commandsToRestore)) {
        localCommandsRef.current.push(...commandsToRestore);
      } else {
        localCommandsRef.current.push(commandsToRestore);
      }
    }

    // 🛡️ Fast-Path: Single Redo-State Canvas Cache (For both local player and spectators)
    let restoredViaCache = false;
    const useCache = propsRef.current.isFreeDraw || Boolean(propsRef.current.enableBitmapUndoCache);
    if (useCache && hasFreeDrawRedoCacheRef.current && freeDrawRedoCacheCanvasRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const undoCanvas = ensureCacheCanvas(freeDrawUndoCacheCanvasRef, canvas);
      copyCanvasContent(canvas, undoCanvas);
      hasFreeDrawUndoCacheRef.current = true;

      restoredViaCache = restoreCanvasFromCache(freeDrawRedoCacheCanvasRef.current, canvas);
      if (restoredViaCache) {
        if (tempCtxRef.current) {
          tempCtxRef.current.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
        }
        hasFreeDrawRedoCacheRef.current = false;
      }
    }

    if (!restoredViaCache) {
      applySyncedHistory(localCommandsRef.current);
    }

    syncHistoryButtons();

    if (emit) {
      emitDrawCommand('draw_redo', {});
    }
  };

  // 🛡️ Unified History Replay Engine: Ensures that Live Replay, New Join Sync, and Remote Undo
  // execute identical drawing, shape, path, clear, and bucket fill operations across all environments.
  const applyReplayCommand = (
    ctx: CanvasRenderingContext2D,
    cmdObj: any,
    replayPaths: Record<string, { x: number; y: number }[]>,
    replaySessions: Record<string, { tool: ToolType; color: string; width: number; opacity: number }>
  ) => {
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
          saveSnapshot();
        }
      } else if (event === 'draw_cancel') {
        path.length = 0;
        delete replaySessions[instId];
      } else if (event === 'draw_clear') {
        Object.keys(replayPaths).forEach((k) => delete replayPaths[k]);
        Object.keys(replaySessions).forEach((k) => delete replaySessions[k]);
        resetCanvasBackingStores(ctx, tempCtxRef.current);
        saveSnapshot();
      } else if (event === 'draw_action') {
        if (cmdTool === 'bucket' && data.x !== undefined && data.y !== undefined) {
          floodFill(ctx, data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT, cmdColor, cmdOpacity, LOGICAL_WIDTH, LOGICAL_HEIGHT, data.targetRGBA);
          saveSnapshot();
        }
      } else if (event === 'draw_undo') {
        executeUndo(false);
      } else if (event === 'draw_redo') {
        executeRedo(false);
      }
    } catch (itemErr) {
      console.error("[DrawingCanvasCore] Ref using error under sync command loop: ", itemErr);
    }
  };

  // Replay of full history from reconnect/new joiner sync event
  const applySyncedHistory = (commands: any[]) => {
    try {
      const ctx = ctxRef.current;
      const tempCtx = tempCtxRef.current;
      if (!ctx || !tempCtx) return;

      console.log("[DrawingCanvasCore] Instantly rebuilding room drawing history...", commands.length);

      invalidateCheckpoint();

      // Initial clear
      resetCanvasBackingStores(ctx, tempCtx);

      // Reset history stacks
      localCommandsRef.current = [...commands];
      prevCommandsCountRef.current = -1;
      saveSnapshot(); // Base empty state in history stack

      // Enable replaying flag to prevent intermediate image generation snapshots inside the loops
      isReplayingRef.current = true;

      const replayPaths: Record<string, { x: number; y: number }[]> = {};
      const replaySessions: Record<string, { tool: ToolType; color: string; width: number; opacity: number }> = {};

      commands.forEach((cmdObj) => {
        applyReplayCommand(ctx, cmdObj, replayPaths, replaySessions);
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
      if (propsRef.current.isFreeDraw && commands.length >= FREE_DRAW_TAIL_SIZE * 2) {
        advanceCheckpointIncremental();
      }
    }
  };

  // 🛡️ Safe Mid-History Replay for Free Draw Per-User Undo:
  // Clears and reconstructs ONLY the committed base canvas (ctx).
  // Strictly PRESERVES tempCtx, activeSessionsRef, and drainingStrokesRef so ongoing live drawing is never interrupted.
  const replayFreeDrawHistorySafely = (commands: any[]) => {
    try {
      const ctx = ctxRef.current;
      if (!ctx) return;

      const N = commands.length;
      let startIndex = 0;

      const isCheckpointValid =
        Boolean(propsRef.current.isFreeDraw) &&
        checkpointCanvasRef.current !== null &&
        checkpointIndexRef.current > 0 &&
        checkpointIndexRef.current <= N &&
        getCommandSignature(commands[checkpointIndexRef.current - 1]) === checkpointAnchorSignatureRef.current;

      if (isCheckpointValid && checkpointCanvasRef.current) {
        // 1. Clear ONLY the permanent base canvas
        ctx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
        // 2. Blit baked checkpoint canvas instantly (1:1 pixel exact copy)
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(checkpointCanvasRef.current, 0, 0);
        ctx.restore();
        startIndex = checkpointIndexRef.current;
      } else {
        // Fallback: Full Replay from 0
        invalidateCheckpoint();
        ctx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
        startIndex = 0;
      }

      // 2. Replay all remaining committed commands
      isReplayingRef.current = true;
      const replayPaths: Record<string, { x: number; y: number }[]> = {};
      const replaySessions: Record<string, { tool: ToolType; color: string; width: number; opacity: number }> = {};

      for (let i = startIndex; i < N; i++) {
        applyReplayCommand(ctx, commands[i], replayPaths, replaySessions);
      }

      // Render any leftover committed strokes
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
          // Ignore
        }
      });

      // If we performed a full replay and have enough commands, immediately bake a checkpoint
      if (!isCheckpointValid && Boolean(propsRef.current.isFreeDraw) && N >= FREE_DRAW_TAIL_SIZE * 2) {
        advanceCheckpointIncremental();
      }
    } catch (err) {
      console.error("[DrawingCanvasCore] Error in replayFreeDrawHistorySafely: ", err);
    } finally {
      isReplayingRef.current = false;
      saveSnapshot();
      syncHistoryButtons();
    }
  };

  // --- Real-time Socket Event Receivers ---
  useEffect(() => {
    if (!socket) return;

    const onDrawBinary = (raw: any) => {
      if (isResetPendingRef.current) {
        flushPendingReset();
      }
      const decoded = decodeBinaryDrawMessage(raw);
      if (!decoded) return;
      const { event, data } = decoded;
      if (!data) return;

      // In Free Draw, allow draw_undo to reach the sender so their canvas stays 100% authoritative and synchronized with the server broadcast
      const isFreeDrawUndo = Boolean(propsRef.current.isFreeDraw) && event === 'draw_undo';
      if (data.instanceId === instanceId && !isFreeDrawUndo) return;

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
          captureDirectFreeDrawUndoCache();
          if (isShape && scaledPoints.length >= 2) {
            const startPt = scaledPoints[0];
            const lastPt = scaledPoints[scaledPoints.length - 1];
            drawShape(ctx, startPt.x, startPt.y, lastPt.x, lastPt.y, remoteTool, remoteColor, remoteWidth, remoteOpacity);
          } else {
            drawEntirePath(ctx, scaledPoints, remoteTool, remoteColor, remoteWidth, remoteOpacity);
          }
          // Solidify the line and wipe the temporary transient trace to prevent artifacts
          delete activeSessionsRef.current[data.instanceId];
          drainingStrokesRef.current = drainingStrokesRef.current.filter(s => s.instanceId !== data.instanceId);
          redrawTempLayer();

          prevCommandsCountRef.current = localCommandsRef.current.length;
          localCommandsRef.current.push({
            event: 'draw_binary',
            data: raw,
            instanceId: data.instanceId,
            strokeId: data.strokeId
          });
          advanceCheckpointIncremental();
          if (!propsRef.current.isFreeDraw) {
            localRedoStackRef.current = [];
          }
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
          path: [{ x: rx, y: ry }],
          strokeId: data.strokeId || 0,
          networkPointCount: 1, // Includes p0
          rawPoints: [{ x: data.x, y: data.y }],
          pendingQueue: []
        };
        redrawTempLayer();
      } else if (event === 'draw_move') {
        const session = activeSessionsRef.current[data.instanceId];
        if (session) {
          const isContinuousStream = Boolean(propsRef.current.isFreeDraw || propsRef.current.isExperimental) && (session.tool === 'pencil' || session.tool === 'eraser');

          const handleMovePoint = (mx: number, my: number, normX: number, normY: number) => {
            if (!session.rawPoints) session.rawPoints = [];
            session.rawPoints.push({ x: normX, y: normY });
            session.networkPointCount = (session.networkPointCount || 0) + 1;

            if (isContinuousStream) {
              if (!session.pendingQueue) session.pendingQueue = [];
              session.pendingQueue.push({ x: mx, y: my });
            } else {
              session.path.push({ x: mx, y: my });
            }
          };

          if (data.moves && Array.isArray(data.moves)) {
            data.moves.forEach((m: any) => {
              handleMovePoint(m.x * LOGICAL_WIDTH, m.y * LOGICAL_HEIGHT, m.x, m.y);
            });
          } else if (data.x !== undefined && data.y !== undefined) {
            handleMovePoint(data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT, data.x, data.y);
          }

          if (isContinuousStream) {
            triggerSpectatorPlayback();
          } else {
            redrawTempLayer();
          }
        }
      } else if (event === 'draw_commit') {
        if (ENABLE_FREE_DRAW_DIAGNOSTICS && propsRef.current.isFreeDraw) {
          drawingDiagRef.current.drawCommit.count++;
        }

        const session = activeSessionsRef.current[data.instanceId];
        const serverPointCount = data.pointCount !== undefined ? data.pointCount : 0;
        const strokeId = data.strokeId !== undefined ? data.strokeId : 0;

        // If this commit belongs to the DRAWER themselves:
        if (data.instanceId === instanceId) {
          // Drawer has already recorded local command and drawn on canvasRef in finishCurrentStroke
          delete activeSessionsRef.current[data.instanceId];
          return;
        }

        // For SPECTATORS / VIEWERS:
        if (session) {
          const localCount = session.networkPointCount || 0;
          if (localCount === serverPointCount) {
            // Happy path: 100% exact match!
            if (session.pendingQueue && session.pendingQueue.length > 0) {
              // Smooth tail drain over 2-5 frames instead of instant dump (eliminates end-of-stroke jump)
              drainingStrokesRef.current.push({
                instanceId: data.instanceId,
                strokeId,
                tool: session.tool,
                color: session.color,
                width: session.width,
                opacity: session.opacity,
                path: session.path,
                pendingQueue: session.pendingQueue,
                rawPoints: session.rawPoints
              });
              delete activeSessionsRef.current[data.instanceId];
              triggerSpectatorPlayback();
            } else {
              // Queue already fully drained: promote to permanent canvas immediately
              if (session.path.length > 0) {
                captureDirectFreeDrawUndoCache();
                drawEntirePath(ctx, session.path, session.tool, session.color, session.width, session.opacity);
                
                // Record in localCommands history for viewer-side undo/redo sync
                const canonicalStrokeMsg = encodeBinaryDrawMessage('draw_stroke', {
                  instanceId: data.instanceId,
                  tool: session.tool,
                  color: session.color,
                  width: session.width,
                  opacity: session.opacity,
                  points: session.rawPoints || []
                });
                prevCommandsCountRef.current = localCommandsRef.current.length;
                localCommandsRef.current.push({
                  event: 'draw_binary',
                  data: canonicalStrokeMsg,
                  instanceId: data.instanceId,
                  strokeId
                });
                advanceCheckpointIncremental();
                if (!propsRef.current.isFreeDraw) {
                  localRedoStackRef.current = [];
                }
                saveSnapshot();
                syncHistoryButtons();
              }
              delete activeSessionsRef.current[data.instanceId];
              redrawTempLayer();
            }
          } else {
            // Count mismatch! Volatile packet loss occurred: request targeted canonical repair
            console.warn(`[DrawingCanvasCore] Packet mismatch for stroke ${strokeId}: localCount=${localCount} vs serverCount=${serverPointCount}. Requesting canonical repair...`);
            if (ENABLE_FREE_DRAW_DIAGNOSTICS && propsRef.current.isFreeDraw) {
              drawingDiagRef.current.drawRepair.count++;
            }
            delete activeSessionsRef.current[data.instanceId];
            drainingStrokesRef.current = drainingStrokesRef.current.filter(s => s.instanceId !== data.instanceId);
            redrawTempLayer();
            socket.emit('draw_repair_req', { instId: data.instanceId, strokeId });
          }
        }
      } else if (event === 'draw_abort') {
        if (ENABLE_FREE_DRAW_DIAGNOSTICS && propsRef.current.isFreeDraw) {
          drawingDiagRef.current.drawAbort.count++;
        }
        delete activeSessionsRef.current[data.instanceId];
        drainingStrokesRef.current = drainingStrokesRef.current.filter(s => s.instanceId !== data.instanceId);
        redrawTempLayer();
      } else if (event === 'draw_end') {
        const session = activeSessionsRef.current[data.instanceId];
        if (session) {
          const isShape = session.tool !== 'pencil' && session.tool !== 'eraser';
          let committed = false;
          if (!data.isCancelled && session.path.length > 0 && !isShape) {
            if (session.pendingQueue && session.pendingQueue.length > 0) {
              drainingStrokesRef.current.push({
                instanceId: data.instanceId,
                strokeId: session.strokeId || 0,
                tool: session.tool,
                color: session.color,
                width: session.width,
                opacity: session.opacity,
                path: session.path,
                pendingQueue: session.pendingQueue,
                rawPoints: session.rawPoints
              });
              delete activeSessionsRef.current[data.instanceId];
              triggerSpectatorPlayback();
            } else {
              captureDirectFreeDrawUndoCache();
              drawEntirePath(ctx, session.path, session.tool, session.color, session.width, session.opacity);
              committed = true;
              delete activeSessionsRef.current[data.instanceId];
            }
          } else {
            delete activeSessionsRef.current[data.instanceId];
          }

          if (!data.isCancelled && isShape && data.startX !== undefined && data.startY !== undefined) {
            captureDirectFreeDrawUndoCache();
            const sX = data.startX * LOGICAL_WIDTH;
            const sY = data.startY * LOGICAL_HEIGHT;
            const eX = (data.x !== undefined ? data.x : (data.endX !== undefined ? data.endX : 0)) * LOGICAL_WIDTH;
            const eY = (data.y !== undefined ? data.y : (data.endY !== undefined ? data.endY : 0)) * LOGICAL_HEIGHT;
            drawShape(ctx, sX, sY, eX, eY, session.tool, session.color, session.width, session.opacity);
            committed = true;
          }
        }
        redrawTempLayer();
        if (!data.isCancelled) {
          saveSnapshot();
        }
      } else if (event === 'draw_cancel') {
        delete activeSessionsRef.current[data.instanceId];
        drainingStrokesRef.current = drainingStrokesRef.current.filter(s => s.instanceId !== data.instanceId);
        redrawTempLayer();
      } else if (event === 'draw_clear') {
        invalidateCheckpoint();
        fastForwardFlushSpectatorQueue();
        drainingStrokesRef.current = [];
        activeSessionsRef.current = {};
        redrawTempLayer();
        captureDirectFreeDrawUndoCache();
        prevCommandsCountRef.current = localCommandsRef.current.length;
        localCommandsRef.current.push({ event: 'draw_binary', data: raw });
        localRedoStackRef.current = [];
        executeClear(false);
        syncHistoryButtons();
      } else if (event === 'draw_action') {
        if (remoteTool === 'bucket' && data.x !== undefined && data.y !== undefined) {
          captureDirectFreeDrawUndoCache();
          floodFill(ctx, data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT, remoteColor, remoteOpacity, LOGICAL_WIDTH, LOGICAL_HEIGHT, data.targetRGBA);
          prevCommandsCountRef.current = localCommandsRef.current.length;
          localCommandsRef.current.push({
            event: 'draw_binary',
            data: raw,
            instanceId: data.instanceId,
            strokeId: data.strokeId
          });
          advanceCheckpointIncremental();
          if (!propsRef.current.isFreeDraw) {
            localRedoStackRef.current = [];
          }
          saveSnapshot();
          syncHistoryButtons();
        }
      } else if (event === 'draw_undo') {
        if (propsRef.current.isFreeDraw && data.strokeId !== undefined && data.instanceId) {
          const targetInst = data.instanceId;
          const targetStrId = data.strokeId;

          // 1. Safe Filter of Spectator Playback Queue:
          // Filter OUT only the stroke matching (targetInst + targetStrId).
          // Strictly PRESERVE all other strokes in drainingStrokesRef!
          const beforeDrainingCount = drainingStrokesRef.current.length;
          drainingStrokesRef.current = drainingStrokesRef.current.filter(
            s => !(s.instanceId === targetInst && s.strokeId === targetStrId)
          );
          if (drainingStrokesRef.current.length !== beforeDrainingCount) {
            redrawTempLayer();
          }

          // 2. Safe Mid-History Undo on Committed Commands:
          const list = localCommandsRef.current;
          const index = list.findIndex(cmd => {
            if (!cmd) return false;
            const cmdInstId = cmd.instanceId || (cmd.data && typeof cmd.data === 'object' ? cmd.data.instanceId : undefined);
            return cmdInstId === targetInst && cmd.strokeId === targetStrId;
          });

          if (index !== -1) {
            if (index < checkpointIndexRef.current) {
              invalidateCheckpoint();
            }
            list.splice(index, 1);
            hasFreeDrawUndoCacheRef.current = false;
            hasFreeDrawRedoCacheRef.current = false;
            replayFreeDrawHistorySafely(list);
          }
        } else {
          // Normal Rooms: retain original behavior
          fastForwardFlushSpectatorQueue();
          drainingStrokesRef.current = [];
          activeSessionsRef.current = {};
          redrawTempLayer();
          executeUndo(false);
        }
      } else if (event === 'draw_redo') {
        if (!propsRef.current.isFreeDraw) {
          drainingStrokesRef.current = [];
          activeSessionsRef.current = {};
          redrawTempLayer();
          executeRedo(false);
        }
      }
    };

    const processIncomingHistorySync = (commands: any[]) => {
      try {
        const ctx = ctxRef.current;
        const tempCtx = tempCtxRef.current;
        if (!ctx || !tempCtx) return;

        console.log("[DrawingCanvasCore] Starting Deferred Queue & Forced Multi-Snapshots chunking...", commands.length);

        invalidateCheckpoint();

        resetCanvasBackingStores(ctx, tempCtx);

        hasFreeDrawUndoCacheRef.current = false;
        hasFreeDrawRedoCacheRef.current = false;
        hasFreeDrawPendingUndoCacheRef.current = false;

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
            applyReplayCommand(ctx, commands[i], replayPaths, replaySessions);
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
            saveSnapshot();
            syncHistoryButtons();
            setIsSyncing(false);
            setHasSyncedOnce(true);
            if (syncTimeoutRef.current) {
              clearTimeout(syncTimeoutRef.current);
              syncTimeoutRef.current = null;
            }
            if (propsRef.current.isFreeDraw && commands.length >= FREE_DRAW_TAIL_SIZE * 2) {
              advanceCheckpointIncremental();
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
      if (isResetPendingRef.current) {
        flushPendingReset();
      }
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
      if (previousStateRef.current.status === 'DRAWING' || status !== 'DRAWING' || previousStateRef.current.currentDrawerId !== currentDrawerId) {
        fastForwardFlushSpectatorQueue();
      }
      if (hasSyncedOnce && !isSyncing) {
        console.log(`[DrawingCanvasCore] Game state changed. Drawer: ${currentDrawerId}, Status: ${status}. Resetting canvas.`);
        if (deferredReset && status === 'DRAWING') {
          // Defer heavy canvas clear/fill out of the critical transition frame
          isResetPendingRef.current = true;
          if (pendingResetRafRef.current !== null) {
            cancelAnimationFrame(pendingResetRafRef.current);
          }
          pendingResetRafRef.current = requestAnimationFrame(() => {
            pendingResetRafRef.current = null;
            if (isResetPendingRef.current) {
              isResetPendingRef.current = false;
              executeResetState();
            }
          });
        } else {
          flushPendingReset();
          executeResetState();
        }
      }
    }
    previousStateRef.current = { currentDrawerId, status };
  }, [currentDrawerId, status, hasSyncedOnce, isSyncing, deferredReset]);

  // --- HTML Canvas Initialization ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    if (!canvas || !tempCanvas) return;

    // In Free Draw mode and Experimental (Batch 3 DPR test): Canonical Backing Store Resolution (Option B)
    // Both Main and Temp canvases are strictly locked to effectiveDPR = 1.0 (680x396 physical pixels)
    // for 100% deterministic pixel-perfect synchronization across all devices and zero memory bloat on mobile.
    // In Normal/Competitive rooms: Adaptive DPR continues to be used.
    const effectiveDPR = (isFreeDraw || isExperimental || enableFixedDPR) ? 1.0 : DPR;

    canvas.width = Math.round(LOGICAL_WIDTH * effectiveDPR);
    canvas.height = Math.round(LOGICAL_HEIGHT * effectiveDPR);
    tempCanvas.width = Math.round(LOGICAL_WIDTH * effectiveDPR);
    tempCanvas.height = Math.round(LOGICAL_HEIGHT * effectiveDPR);

    const ctx = canvas.getContext('2d', (isFreeDraw || enableCanvasAlpha) ? undefined : { alpha: false });
    const tempCtx = tempCanvas.getContext('2d');

    if (ctx && tempCtx) {
      ctx.setTransform(effectiveDPR, 0, 0, effectiveDPR, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctxRef.current = ctx;

      tempCtx.setTransform(effectiveDPR, 0, 0, effectiveDPR, 0, 0);
      tempCtx.lineCap = 'round';
      tempCtx.lineJoin = 'round';
      tempCtx.imageSmoothingEnabled = true;
      tempCtx.imageSmoothingQuality = 'high';
      tempCtxRef.current = tempCtx;

      // Solidify initial physical backing store state (transparent for Free Draw, white for Normal)
      resetCanvasBackingStores(ctx, tempCtx);

      // WARM-UP Canvas rendering engine to prevent first-stroke stutter on weak devices
      // This forces Skia / GPU to compile shaders immediately rather than when user draws.
      tempCtx.beginPath();
      tempCtx.moveTo(0,0);
      tempCtx.lineTo(0.1, 0.1);
      tempCtx.quadraticCurveTo(0.2, 0.2, 0.3, 0.3);
      tempCtx.strokeStyle = 'rgba(0,0,0,0.01)';
      tempCtx.stroke();
      resetCanvasBackingStores(ctx, tempCtx);

      invalidateCheckpoint();
      saveSnapshot();

      if (bufferedSyncRef.current) {
        applySyncedHistory(bufferedSyncRef.current);
        bufferedSyncRef.current = null;
      }
    }

    const handleOrientationOrResize = () => {
      invalidateCheckpoint();
    };
    window.addEventListener('resize', handleOrientationOrResize);
    window.addEventListener('orientationchange', handleOrientationOrResize);
    return () => {
      window.removeEventListener('resize', handleOrientationOrResize);
      window.removeEventListener('orientationchange', handleOrientationOrResize);
    };
  }, []);

  // --- Drawing Pointer Events Hooks & Stroke Pipeline ---

  const startPencilOrEraserStroke = (logicalX: number, logicalY: number) => {
    if (propsRef.current.readOnly) return;
    if (isDrawingRef.current) return;
    if (isZoomPinchingRef.current || activeTouchCountRef.current >= 2) return;
    if (!isCanvasResizeObserverReadyRef.current) return;

    const activeTool = propsRef.current.tool;
    if (activeTool !== 'pencil' && activeTool !== 'eraser') return;

    stageFreeDrawPendingCache();

    const activeColor = propsRef.current.color;
    const activeWidth = propsRef.current.thickness;
    const activeOpacity = propsRef.current.opacity;

    isDrawingRef.current = true;
    startXRef.current = logicalX;
    startYRef.current = logicalY;

    if (localRedoStackRef.current.length > 0) {
      localRedoStackRef.current = [];
      syncHistoryButtons();
    }

    const isSingleSource = Boolean(
      propsRef.current.isFreeDraw &&
      (isSingleSourceActiveRef.current || propsRef.current.enableSingleSourceCanonical)
    );

    let startX = logicalX;
    let startY = logicalY;
    let startNormX = logicalX / LOGICAL_WIDTH;
    let startNormY = logicalY / LOGICAL_HEIGHT;

    if (isSingleSource) {
      startNormX = Math.round((logicalX / LOGICAL_WIDTH) * 10000) / 10000;
      startNormY = Math.round((logicalY / LOGICAL_HEIGHT) * 10000) / 10000;
      startX = startNormX * LOGICAL_WIDTH;
      startY = startNormY * LOGICAL_HEIGHT;
    }

    currentPathRef.current = [{ x: logicalX, y: logicalY }];
    lastNetworkPointRef.current = { x: startX, y: startY };
    lastNetworkDirXRef.current = 0;
    lastNetworkDirYRef.current = 0;
    lastNetworkSegmentLenRef.current = 0;
    consecutiveTurnsRef.current = 0;
    networkStrokePointsRef.current = [{ x: startNormX, y: startNormY }];

    // Reset per-stroke wire byte accumulator for shadow compression evaluation
    strokeWireBytesRef.current = 0;
    strokeBatchCountRef.current = 0;

    // Phase 5A: Initialize Parallel Canonical Stroke
    canonicalStrokeRef.current = [{ x: startX, y: startY }];
    provisionalTailRef.current = null;
    lastCanonicalDirXRef.current = 0;
    lastCanonicalDirYRef.current = 0;
    lastCanonicalSegmentLenRef.current = 0;
    canonicalTurnsRef.current = 0;
    
    // Increment local 16-bit monotonic strokeId
    currentLocalStrokeIdRef.current = ((currentLocalStrokeIdRef.current || 0) + 1) & 0xFFFF;
    if (currentLocalStrokeIdRef.current === 0) currentLocalStrokeIdRef.current = 1;

    // Dedicated network point counter initialized to 1 for p0
    drawerNetworkPointCountRef.current = 1;

    emitDrawCommand('draw_start', {
      tool: activeTool,
      color: activeColor,
      width: activeWidth,
      opacity: activeOpacity,
      strokeId: currentLocalStrokeIdRef.current,
      x: startNormX,
      y: startNormY
    });

    redrawTempLayer();
  };

  const processStrokeMove = (logicalX: number, logicalY: number) => {
    if (!isDrawingRef.current) return;
    if (isZoomPinchingRef.current || activeTouchCountRef.current >= 2) {
      isDrawingRef.current = false;
      hasFreeDrawPendingUndoCacheRef.current = false;
      const tempCtx = tempCtxRef.current;
      if (tempCtx) {
        tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
      }
      moveBatchRef.current = [];
      networkStrokePointsRef.current = [];
      lastNetworkPointRef.current = null;
      lastNetworkDirXRef.current = 0;
      lastNetworkDirYRef.current = 0;
      lastNetworkSegmentLenRef.current = 0;
      consecutiveTurnsRef.current = 0;
      canonicalStrokeRef.current = [];
      provisionalTailRef.current = null;
      lastCanonicalDirXRef.current = 0;
      lastCanonicalDirYRef.current = 0;
      lastCanonicalSegmentLenRef.current = 0;
      canonicalTurnsRef.current = 0;
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

    const activeTool = propsRef.current.tool;
    if (activeTool !== 'pencil' && activeTool !== 'eraser') return;

    const activeColor = propsRef.current.color;
    const activeWidth = propsRef.current.thickness;
    const activeOpacity = propsRef.current.opacity;

    const roundedX = Math.round(logicalX * 10) / 10;
    const roundedY = Math.round(logicalY * 10) / 10;
    const path = currentPathRef.current;

    const brushSize = activeWidth;
    const currentThreshold = brushSize < 6 ? 0.5 : (brushSize > 10 ? 3.5 : 1.5);

    if (path.length > 0) {
      const lastPt = path[path.length - 1];
      const dist = Math.hypot(roundedX - lastPt.x, roundedY - lastPt.y);

      if (dist < currentThreshold) {
        return;
      }

      const useInputOptimizations = propsRef.current.isFreeDraw || Boolean(propsRef.current.enableInputOptimizations);

      if (!useInputOptimizations && dist > 8) {
        const stepSize = 6;
        const stepsCount = Math.floor(dist / stepSize);
        if (stepsCount > 1) {
          for (let i = 1; i < stepsCount; i++) {
            const t = i / stepsCount;
            const lerpX = Math.round((lastPt.x + (roundedX - lastPt.x) * t) * 10) / 10;
            const lerpY = Math.round((lastPt.y + (roundedY - lastPt.y) * t) * 10) / 10;
            path.push({ x: lerpX, y: lerpY });
            moveBatchRef.current.push({ x: lerpX / LOGICAL_WIDTH, y: lerpY / LOGICAL_HEIGHT });
          }
        }
      }
    }

    path.push({ x: roundedX, y: roundedY });

    const isSingleSource = Boolean(
      propsRef.current.isFreeDraw &&
      (isSingleSourceActiveRef.current || propsRef.current.enableSingleSourceCanonical)
    );

    if (isSingleSource) {
      // 🎯 Single-Source Canonical Geometry Pipeline:
      // Derive protocol-precision coordinate so drawer, network wire, viewer and replay share 100% identical floats
      const normX = Math.round((roundedX / LOGICAL_WIDTH) * 10000) / 10000;
      const normY = Math.round((roundedY / LOGICAL_HEIGHT) * 10000) / 10000;
      const canX = normX * LOGICAL_WIDTH;
      const canY = normY * LOGICAL_HEIGHT;

      // 1:1 Unified point: Single source of truth for Live, Network and History
      canonicalStrokeRef.current.push({ x: canX, y: canY });
      moveBatchRef.current.push({ x: normX, y: normY });
      networkStrokePointsRef.current.push({ x: normX, y: normY });
      lastNetworkPointRef.current = { x: canX, y: canY };

      redrawTempLayer();
    } else {
      // Phase 5A.2A: Online Canonical Processor (Extrema- & Corner-Preserving Decimator)
      if (propsRef.current.isFreeDraw) {
        const cPath = canonicalStrokeRef.current;
        if (cPath.length > 0) {
          const lastCanPt = cPath[cPath.length - 1];
          const pTail = provisionalTailRef.current;

          // 1. Preserve local extremum or corner apex before it gets bypassed
          if (pTail) {
            const v1x = pTail.x - lastCanPt.x;
            const v1y = pTail.y - lastCanPt.y;
            const d1 = Math.hypot(v1x, v1y);

            const v2x = roundedX - pTail.x;
            const v2y = roundedY - pTail.y;
            const d2 = Math.hypot(v2x, v2y);

            // Check if legs exceed minimum subpixel movement to filter touch jitter
            if (d1 >= 0.7 && d2 >= 0.5) {
              const dot = v1x * v2x + v1y * v2y;
              const cosTurn = dot / (d1 * d2);

              const isAngleTurn = cosTurn < CANONICAL_COS_TURN_THRESHOLD;
              const isAxisReversal = (v1x * v2x < -0.01 && Math.abs(v1x) >= 0.6 && Math.abs(v2x) >= 0.5) ||
                                    (v1y * v2y < -0.01 && Math.abs(v1y) >= 0.6 && Math.abs(v2y) >= 0.5);

              if (isAngleTurn || isAxisReversal) {
                // Commit pTail as a critical canonical corner / extremum point!
                cPath.push({ x: pTail.x, y: pTail.y });
                lastCanonicalDirXRef.current = v1x;
                lastCanonicalDirYRef.current = v1y;
                lastCanonicalSegmentLenRef.current = d1;
                canonicalTurnsRef.current++;
                provisionalTailRef.current = null;
              }
            }
          }

          // 2. Evaluate current point against the active anchor (either previous anchor or newly committed apex)
          const currentAnchor = cPath[cPath.length - 1];
          const cdx = roundedX - currentAnchor.x;
          const cdy = roundedY - currentAnchor.y;
          const dist = Math.hypot(cdx, cdy);

          const minDist = canonicalTurnsRef.current > 0
            ? CANONICAL_MIN_CONSECUTIVE_TURN_DIST
            : CANONICAL_MIN_TURN_DIST;

          let acceptCanonical = false;

          if (dist >= CANONICAL_MAX_DIST) {
            acceptCanonical = true;
            canonicalTurnsRef.current = 0;
          } else if (dist >= minDist) {
            const prevLen = lastCanonicalSegmentLenRef.current;
            if (prevLen > 0.1) {
              const dot = (cdx * lastCanonicalDirXRef.current) + (cdy * lastCanonicalDirYRef.current);
              const cosTheta = dot / (dist * prevLen);
              acceptCanonical = cosTheta < CANONICAL_COS_TURN_THRESHOLD;
              if (acceptCanonical) {
                canonicalTurnsRef.current++;
              }
            } else {
              acceptCanonical = dist >= CANONICAL_MIN_TURN_DIST;
              canonicalTurnsRef.current = 0;
            }
          }

          if (acceptCanonical) {
            cPath.push({ x: roundedX, y: roundedY });
            provisionalTailRef.current = null;
            lastCanonicalDirXRef.current = cdx;
            lastCanonicalDirYRef.current = cdy;
            lastCanonicalSegmentLenRef.current = dist;
          } else {
            provisionalTailRef.current = { x: roundedX, y: roundedY };
          }
        } else {
          cPath.push({ x: roundedX, y: roundedY });
          provisionalTailRef.current = null;
        }
      }

      redrawTempLayer();

      const normX = roundedX / LOGICAL_WIDTH;
      const normY = roundedY / LOGICAL_HEIGHT;

      // --- Network Path Separation (EXPERIMENTAL_NETWORK_SAMPLING_TEST) ---
      const isNetworkSamplingActive = Boolean(
        (propsRef.current.isFreeDraw || propsRef.current.enableNetworkSampling) &&
        (EXPERIMENTAL_NETWORK_SAMPLING_TEST || propsRef.current.enableNetworkSampling)
      );

      let shouldSendToNetwork = true;
      if (isNetworkSamplingActive) {
        const lastNetPt = lastNetworkPointRef.current;
        if (lastNetPt) {
          const dx = roundedX - lastNetPt.x;
          const dy = roundedY - lastNetPt.y;
          const dist = Math.hypot(dx, dy);

          const MIN_TURN_DIST = 1.6;
          const MIN_CONSECUTIVE_TURN_DIST = 2.0;
          const MAX_DIST = 3.6;
          const COS_TURN_THRESHOLD = 0.82;

          const minDistRequired =
            consecutiveTurnsRef.current > 0
              ? MIN_CONSECUTIVE_TURN_DIST
              : MIN_TURN_DIST;

          if (dist < minDistRequired) {
            shouldSendToNetwork = false;
          } else if (dist >= MAX_DIST) {
            shouldSendToNetwork = true;
            consecutiveTurnsRef.current = 0;
          } else {
            const prevLen = lastNetworkSegmentLenRef.current;
            if (prevLen > 0.1) {
              const dot =
                (dx * lastNetworkDirXRef.current) +
                (dy * lastNetworkDirYRef.current);
              const cosTheta = dot / (dist * prevLen);
              shouldSendToNetwork = cosTheta < COS_TURN_THRESHOLD;
              if (shouldSendToNetwork) {
                consecutiveTurnsRef.current++;
              }
            } else {
              shouldSendToNetwork = dist >= 2.0;
              consecutiveTurnsRef.current = 0;
            }
          }

          if (shouldSendToNetwork) {
            lastNetworkDirXRef.current = dx;
            lastNetworkDirYRef.current = dy;
            lastNetworkSegmentLenRef.current = dist;
          }
        }
      }

      if (shouldSendToNetwork) {
        moveBatchRef.current.push({ x: normX, y: normY });
        networkStrokePointsRef.current.push({ x: normX, y: normY });
        lastNetworkPointRef.current = { x: roundedX, y: roundedY };
      }
    }

    const isContinuousMode = Boolean(propsRef.current.isFreeDraw || propsRef.current.isExperimental);
    const intervalMs = isContinuousMode
      ? 200
      : (IS_LOW_END ? 40 : (PERF_TIER === 2 ? 24 : 16));

    if (!throttleTimeoutRef.current) {
      throttleTimeoutRef.current = setTimeout(() => {
        if (moveBatchRef.current.length > 0) {
          if (isContinuousMode) {
            drawerNetworkPointCountRef.current += moveBatchRef.current.length;
          }
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
  };

  const finishCurrentStroke = () => {
    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (!canvas || !tempCanvas || !ctx || !tempCtx) return;

    if (!isDrawingRef.current) return;

    const activeTool = propsRef.current.tool;
    const activeColor = propsRef.current.color;
    const activeWidth = propsRef.current.thickness;
    const activeOpacity = propsRef.current.opacity;
    const isContinuousMode = Boolean(propsRef.current.isFreeDraw || propsRef.current.isExperimental);

    isDrawingRef.current = false;

    if (throttleTimeoutRef.current) {
      clearTimeout(throttleTimeoutRef.current);
      throttleTimeoutRef.current = null;
    }

    if (activeTool === 'pencil' || activeTool === 'eraser') {
      if (isContinuousMode && currentPathRef.current.length >= 2 && lastNetworkPointRef.current) {
        const lastPt = currentPathRef.current[currentPathRef.current.length - 1];
        const endDist = Math.hypot(
          lastPt.x - lastNetworkPointRef.current.x,
          lastPt.y - lastNetworkPointRef.current.y
        );
        if (endDist >= 1.0) {
          const isSingleSource = Boolean(
            propsRef.current.isFreeDraw &&
            (isSingleSourceActiveRef.current || propsRef.current.enableSingleSourceCanonical)
          );
          if (isSingleSource) {
            const normX = Math.round((lastPt.x / LOGICAL_WIDTH) * 10000) / 10000;
            const normY = Math.round((lastPt.y / LOGICAL_HEIGHT) * 10000) / 10000;
            const canX = normX * LOGICAL_WIDTH;
            const canY = normY * LOGICAL_HEIGHT;
            moveBatchRef.current.push({ x: normX, y: normY });
            networkStrokePointsRef.current.push({ x: normX, y: normY });
            canonicalStrokeRef.current.push({ x: canX, y: canY });
            lastNetworkPointRef.current = { x: canX, y: canY };
          } else {
            const normX = lastPt.x / LOGICAL_WIDTH;
            const normY = lastPt.y / LOGICAL_HEIGHT;
            moveBatchRef.current.push({ x: normX, y: normY });
            networkStrokePointsRef.current.push({ x: normX, y: normY });
            lastNetworkPointRef.current = { x: lastPt.x, y: lastPt.y };
          }
        }
      }

      if (moveBatchRef.current.length > 0) {
        if (isContinuousMode) {
          drawerNetworkPointCountRef.current += moveBatchRef.current.length;
        }
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
        // Only commit undo cache and record stroke in history if at least one point is inside/touches canvas viewport
        const hasVisibleContent = !isContinuousMode || currentPathRef.current.some(
          pt => pt.x >= 0 && pt.x <= LOGICAL_WIDTH && pt.y >= 0 && pt.y <= LOGICAL_HEIGHT
        );

        if (hasVisibleContent) {
          commitFreeDrawPendingCache();

          const isSingleSource = Boolean(
            propsRef.current.isFreeDraw &&
            (isSingleSourceActiveRef.current || propsRef.current.enableSingleSourceCanonical)
          );

          if (isSingleSource && canonicalStrokeRef.current.length > 0) {
            drawEntirePath(ctx, canonicalStrokeRef.current, activeTool, activeColor, activeWidth, activeOpacity);
          } else {
            const isCanonicalActive = Boolean(
              propsRef.current.isFreeDraw &&
              (isCanonicalLocalTestActive || propsRef.current.enableCanonicalLocalTest)
            );

            if (isCanonicalActive && canonicalStrokeRef.current.length > 0) {
              const cPath = canonicalStrokeRef.current;
              if (provisionalTailRef.current) {
                const lastPt = cPath[cPath.length - 1];
                const pTail = provisionalTailRef.current;
                const dEnd = Math.hypot(pTail.x - lastPt.x, pTail.y - lastPt.y);
                if (dEnd >= 0.4) {
                  cPath.push(pTail);
                }
              }
              drawEntirePath(ctx, cPath, activeTool, activeColor, activeWidth, activeOpacity);
            } else {
              drawEntirePath(ctx, currentPathRef.current, activeTool, activeColor, activeWidth, activeOpacity);
            }
          }

          if (propsRef.current.isFreeDraw) {
            const cCount = canonicalStrokeRef.current.length;
            const netCount = networkStrokePointsRef.current.length;
            const denseCount = currentPathRef.current.length;

            canonicalStatsRef.current.lastCanonicalPoints = cCount;
            canonicalStatsRef.current.lastNetworkPoints = netCount;
            canonicalStatsRef.current.lastDensePoints = denseCount;
            canonicalStatsRef.current.totalCanonicalPoints += cCount;
            canonicalStatsRef.current.totalNetworkPoints += netCount;
            canonicalStatsRef.current.totalDensePoints += denseCount;
            canonicalStatsRef.current.strokesCount++;

            // 🧪 Shadow Compression Evaluation over the Canonical Point Stream
            // Input: ONLY the Canonical Point Stream ("Canonical Geometry in")
            if (cCount > 0) {
              const shadowResult = evaluateShadowCompression(
                canonicalStrokeRef.current,
                LOGICAL_WIDTH,
                LOGICAL_HEIGHT,
                false,
                strokeWireBytesRef.current,
                strokeBatchCountRef.current
              );

              const prevShadow = canonicalStatsRef.current.shadow || { ...INITIAL_SHADOW_METRICS };
              const newTotalPoints = prevShadow.totalPoints + shadowResult.pointsCount;
              const newTotalWireBytes = prevShadow.totalWireBytes + shadowResult.currentWireBytes;
              const newTotalShadowBytes = prevShadow.totalShadowBytes + shadowResult.shadowBytes;
              const newTotalSavedBytes = Math.max(0, newTotalWireBytes - newTotalShadowBytes);
              const newTotalCompPercent = newTotalWireBytes > 0 ? (newTotalSavedBytes / newTotalWireBytes) * 100 : 0;
              const newTotalWireBpt = newTotalPoints > 0 ? newTotalWireBytes / newTotalPoints : 0;
              const newTotalShadowBpt = newTotalPoints > 0 ? newTotalShadowBytes / newTotalPoints : 0;

              canonicalStatsRef.current.shadow = {
                lastPoints: shadowResult.pointsCount,
                lastWireBytes: shadowResult.currentWireBytes,
                lastShadowBytes: shadowResult.shadowBytes,
                lastSavedBytes: shadowResult.savedBytes,
                lastCompressionPercent: shadowResult.compressionPercent,
                lastWireBpt: shadowResult.wireBytesPerPoint,
                lastShadowBpt: shadowResult.shadowBytesPerPoint,

                totalPoints: newTotalPoints,
                totalWireBytes: newTotalWireBytes,
                totalShadowBytes: newTotalShadowBytes,
                totalSavedBytes: newTotalSavedBytes,
                totalCompressionPercent: newTotalCompPercent,
                totalWireBpt: newTotalWireBpt,
                totalShadowBpt: newTotalShadowBpt
              };
            }
          }

          // In Free Draw / Experimental: DO NOT send duplicate client draw_stroke in successful path!
          // Server will commit canonical Type 9 upon draw_end and broadcast draw_commit.
          if (!isContinuousMode) {
            // Normal Rooms: retain original draw_stroke behavior
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
          } else {
            // Free Draw & Experimental: Record local command for deterministic drawer-side Undo/Redo without sending over the network
            const localStrokeMsg = encodeBinaryDrawMessage('draw_stroke', {
              instanceId,
              tool: activeTool,
              color: activeColor,
              width: activeWidth,
              opacity: activeOpacity,
              points: networkStrokePointsRef.current
            });
            prevCommandsCountRef.current = localCommandsRef.current.length;
            localCommandsRef.current.push({
              event: 'draw_binary',
              data: localStrokeMsg,
              instanceId,
              strokeId: currentLocalStrokeIdRef.current
            });
            advanceCheckpointIncremental();
            localRedoStackRef.current = [];
            syncHistoryButtons();
          }
        } else {
          // Entire gesture stayed outside canvas without entering: discard pending undo cache cleanly
          hasFreeDrawPendingUndoCacheRef.current = false;
        }
      } else {
        hasFreeDrawPendingUndoCacheRef.current = false;
      }

      emitDrawCommand('draw_end', {
        tool: activeTool,
        color: activeColor,
        width: activeWidth,
        opacity: activeOpacity,
        isShape: false,
        strokeId: currentLocalStrokeIdRef.current,
        expectedPointCount: drawerNetworkPointCountRef.current
      });
    }

    currentPathRef.current = [];
    networkStrokePointsRef.current = [];
    canonicalStrokeRef.current = [];
    provisionalTailRef.current = null;
    lastCanonicalDirXRef.current = 0;
    lastCanonicalDirYRef.current = 0;
    lastCanonicalSegmentLenRef.current = 0;
    canonicalTurnsRef.current = 0;
    lastNetworkPointRef.current = null;
    lastNetworkDirXRef.current = 0;
    lastNetworkDirYRef.current = 0;
    lastNetworkSegmentLenRef.current = 0;
    consecutiveTurnsRef.current = 0;
    drawerNetworkPointCountRef.current = 0;
    saveSnapshot();
  };

  const startShapeDrawing = (rawX: number, rawY: number) => {
    const tempCanvas = tempCanvasRef.current;
    const tempCtx = tempCtxRef.current;
    if (!tempCanvas || !tempCtx) return;

    startXRef.current = rawX;
    startYRef.current = rawY;
    isDrawingRef.current = true;
    currentPathRef.current = [{ x: rawX, y: rawY }];

    if (localRedoStackRef.current.length > 0) {
      localRedoStackRef.current = [];
      syncHistoryButtons();
    }

    const activeTool = propsRef.current.tool;
    const activeColor = propsRef.current.color;
    const activeWidth = propsRef.current.thickness;
    const activeOpacity = propsRef.current.opacity;

    // Increment monotonic strokeId for this Shape operation
    currentLocalStrokeIdRef.current = ((currentLocalStrokeIdRef.current || 0) + 1) & 0xFFFF;
    if (currentLocalStrokeIdRef.current === 0) currentLocalStrokeIdRef.current = 1;

    stageFreeDrawPendingCache();

    emitDrawCommand('draw_start', {
      tool: activeTool,
      color: activeColor,
      width: activeWidth,
      opacity: activeOpacity,
      strokeId: currentLocalStrokeIdRef.current,
      x: rawX / LOGICAL_WIDTH,
      y: rawY / LOGICAL_HEIGHT
    });

    tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
    drawShape(tempCtx, rawX, rawY, rawX, rawY, activeTool, activeColor, activeWidth, activeOpacity);
  };

  const processShapeMove = (rawX: number, rawY: number) => {
    const tempCanvas = tempCanvasRef.current;
    const tempCtx = tempCtxRef.current;
    if (!tempCanvas || !tempCtx || !isDrawingRef.current) return;

    const activeTool = propsRef.current.tool;
    const activeColor = propsRef.current.color;
    const activeWidth = propsRef.current.thickness;
    const activeOpacity = propsRef.current.opacity;

    tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
    drawShape(tempCtx, startXRef.current, startYRef.current, rawX, rawY, activeTool, activeColor, activeWidth, activeOpacity);
  };

  const finishShapeDrawing = (rawX: number, rawY: number) => {
    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (!canvas || !tempCanvas || !ctx || !tempCtx || !isDrawingRef.current) return;

    isDrawingRef.current = false;

    if (throttleTimeoutRef.current) {
      clearTimeout(throttleTimeoutRef.current);
      throttleTimeoutRef.current = null;
    }

    tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);

    const activeTool = propsRef.current.tool;
    const activeColor = propsRef.current.color;
    const activeWidth = propsRef.current.thickness;
    const activeOpacity = propsRef.current.opacity;

    commitFreeDrawPendingCache();

    // Draw shape to the primary canvas context (hardware-clipped naturally at canvas bounds)
    drawShape(ctx, startXRef.current, startYRef.current, rawX, rawY, activeTool, activeColor, activeWidth, activeOpacity);

    const shapeStrokeId = currentLocalStrokeIdRef.current;

    // Send complete stroke object for shapes (straight lines, rectangles, circles, etc.)
    const normalizedPoints = [
      { x: startXRef.current / LOGICAL_WIDTH, y: startYRef.current / LOGICAL_HEIGHT },
      { x: rawX / LOGICAL_WIDTH, y: rawY / LOGICAL_HEIGHT }
    ];
    emitDrawCommand('draw_stroke', {
      tool: activeTool,
      color: activeColor,
      width: activeWidth,
      opacity: activeOpacity,
      strokeId: shapeStrokeId,
      points: normalizedPoints
    });

    emitDrawCommand('draw_end', {
      tool: activeTool,
      color: activeColor,
      width: activeWidth,
      opacity: activeOpacity,
      isShape: true,
      strokeId: shapeStrokeId,
      expectedPointCount: 2,
      startX: startXRef.current / LOGICAL_WIDTH,
      startY: startYRef.current / LOGICAL_HEIGHT,
      endX: rawX / LOGICAL_WIDTH,
      endY: rawY / LOGICAL_HEIGHT,
      x: rawX / LOGICAL_WIDTH,
      y: rawY / LOGICAL_HEIGHT
    });

    currentPathRef.current = [];
    saveSnapshot();
  };

  strokeHandlerRef.current = {
    start: startPencilOrEraserStroke,
    move: processStrokeMove,
    end: finishCurrentStroke
  };

  shapeHandlerRef.current = {
    start: startShapeDrawing,
    move: processShapeMove,
    end: finishShapeDrawing
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    if (propsRef.current.readOnly) return;
    if (isDrawingRef.current) return;
    if (isZoomPinchingRef.current || activeTouchCountRef.current >= 2) return;
    
    if (isResetPendingRef.current) {
      flushPendingReset();
    }

    // STRICT GUARD: Prevent drawing before Canvas layout and ResizeObserver are fully ready.
    // If the canvas width/height are 0 during early mount, getLogicalCoords produces Infinity,
    // which causes catastrophic GPU lag when passed to ctx.stroke().
    if (!isCanvasResizeObserverReadyRef.current) return;
    
    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (!canvas || !tempCanvas || !ctx || !tempCtx) return;

    activePointerIdRef.current = e.pointerId;

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}
    exitedOutsideWhilePointerDownRef.current = false;
    lastOutsidePointerRef.current = null;

    const activeTool = propsRef.current.tool;
    const activeColor = propsRef.current.color;
    const activeWidth = propsRef.current.thickness;
    const activeOpacity = propsRef.current.opacity;

    const { x, y } = getLogicalCoords(e.clientX, e.clientY, canvas, true);
    startXRef.current = x;
    startYRef.current = y;

    if (activeTool === 'bucket') {
      const runBucket = () => {
        captureDirectFreeDrawUndoCache();
        const sampledTarget = floodFill(ctx, x, y, activeColor, activeOpacity, LOGICAL_WIDTH, LOGICAL_HEIGHT);

        if (localRedoStackRef.current.length > 0) {
          localRedoStackRef.current = [];
          syncHistoryButtons();
        }

        // Increment monotonic strokeId for this Bucket operation
        currentLocalStrokeIdRef.current = ((currentLocalStrokeIdRef.current || 0) + 1) & 0xFFFF;
        if (currentLocalStrokeIdRef.current === 0) currentLocalStrokeIdRef.current = 1;
        const thisBucketStrokeId = currentLocalStrokeIdRef.current;

        emitDrawCommand('draw_action', {
          tool: 'bucket',
          color: activeColor,
          opacity: activeOpacity,
          strokeId: thisBucketStrokeId,
          x: x / LOGICAL_WIDTH,
          y: y / LOGICAL_HEIGHT,
          targetR: sampledTarget ? sampledTarget.r : undefined,
          targetG: sampledTarget ? sampledTarget.g : undefined,
          targetB: sampledTarget ? sampledTarget.b : undefined,
          targetA: sampledTarget ? sampledTarget.a : undefined
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

    if (activeTool === 'pipette') {
      const offscreen = document.createElement('canvas');
      offscreen.width = canvas.width;
      offscreen.height = canvas.height;
      const oCtx = offscreen.getContext('2d', { willReadFrequently: true });
      if (oCtx) {
        oCtx.drawImage(canvas, 0, 0);
        const scaleX = canvas.width / LOGICAL_WIDTH;
        const scaleY = canvas.height / LOGICAL_HEIGHT;
        const rx = Math.floor(x * scaleX);
        const ry = Math.floor(y * scaleY);
        const pixel = oCtx.getImageData(rx, ry, 1, 1).data;
        const alpha = pixel[3];
        const r = alpha === 255 ? pixel[0] : Math.round((pixel[0] * alpha + 255 * (255 - alpha)) / 255);
        const g = alpha === 255 ? pixel[1] : Math.round((pixel[1] * alpha + 255 * (255 - alpha)) / 255);
        const b = alpha === 255 ? pixel[2] : Math.round((pixel[2] * alpha + 255 * (255 - alpha)) / 255);
        const hex = "#" + ("000000" + ((r << 16) | (g << 8) | b).toString(16)).slice(-6);
        onPipetteColorPicked?.(hex);
      }
      return;
    }

    if (activeTool === 'pencil' || activeTool === 'eraser') {
      startPencilOrEraserStroke(x, y);
      return;
    }

    const rawCoords = getLogicalCoords(e.clientX, e.clientY, canvas, false);
    startShapeDrawing(rawCoords.x, rawCoords.y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    if (e.pointerId !== activePointerIdRef.current) return;
    if (!isDrawingRef.current && !exitedOutsideWhilePointerDownRef.current) return;

    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (!canvas || !tempCanvas || !ctx || !tempCtx) return;

    if (isZoomPinchingRef.current || activeTouchCountRef.current >= 2) {
      isDrawingRef.current = false;
      exitedOutsideWhilePointerDownRef.current = false;
      lastOutsidePointerRef.current = null;
      
      tempCtx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
      moveBatchRef.current = [];
      networkStrokePointsRef.current = [];
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

    const rawCoords = getLogicalCoords(e.clientX, e.clientY, canvas, false);
    const isInside = rawCoords.x >= 0 && rawCoords.x <= LOGICAL_WIDTH && rawCoords.y >= 0 && rawCoords.y <= LOGICAL_HEIGHT;
    const activeTool = propsRef.current.tool;

    if (activeTool === 'pencil' || activeTool === 'eraser') {
      const useInputOptimizations = propsRef.current.isFreeDraw || Boolean(propsRef.current.enableInputOptimizations);
      if (isDrawingRef.current) {
        if (useInputOptimizations) {
          // Free Draw & Experimental (Batch 1): Continuous un-clamped stroke trajectory across canvas edges
          // Pointer capture maintains full gesture tracking outside canvas.
          // Native canvas context naturally clips any geometry outside (0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT).
          // Extract native browser coalesced events if available to preserve sub-frame curve fidelity without synthetic Lerp
          const nativeEvt = e.nativeEvent as any;
          const rawEvents: PointerEvent[] = (nativeEvt && typeof nativeEvt.getCoalescedEvents === 'function')
            ? nativeEvt.getCoalescedEvents()
            : [];
          if (rawEvents.length > 0) {
            for (let i = 0; i < rawEvents.length; i++) {
              const pt = getLogicalCoords(rawEvents[i].clientX, rawEvents[i].clientY, canvas, false);
              processStrokeMove(pt.x, pt.y);
            }
          } else {
            processStrokeMove(rawCoords.x, rawCoords.y);
          }
        } else {
          if (isInside) {
            processStrokeMove(rawCoords.x, rawCoords.y);
          } else {
            // Normal / Competitive: Keep existing legacy boundary edge clamp behavior
            const clamped = getLogicalCoords(e.clientX, e.clientY, canvas, true);
            processStrokeMove(clamped.x, clamped.y);
            finishCurrentStroke();
            exitedOutsideWhilePointerDownRef.current = true;
            lastOutsidePointerRef.current = { clientX: e.clientX, clientY: e.clientY };
          }
        }
      } else if (exitedOutsideWhilePointerDownRef.current && !useInputOptimizations) {
        // Normal / Competitive: Was outside while holding down, now re-entered canvas: start new stroke cleanly
        if (isInside) {
          exitedOutsideWhilePointerDownRef.current = false;
          let entryX = rawCoords.x;
          let entryY = rawCoords.y;
          if (lastOutsidePointerRef.current) {
            const entryCoords = getLogicalCoords(lastOutsidePointerRef.current.clientX, lastOutsidePointerRef.current.clientY, canvas, true);
            entryX = entryCoords.x;
            entryY = entryCoords.y;
          }
          lastOutsidePointerRef.current = null;
          startPencilOrEraserStroke(entryX, entryY);
          processStrokeMove(rawCoords.x, rawCoords.y);
        } else {
          // Still outside canvas while dragging: keep tracking last outside pointer position for precise entry
          lastOutsidePointerRef.current = { clientX: e.clientX, clientY: e.clientY };
        }
      }
    } else {
      processShapeMove(rawCoords.x, rawCoords.y);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    activePointerIdRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
    exitedOutsideWhilePointerDownRef.current = false;
    lastOutsidePointerRef.current = null;

    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;
    if (!canvas || !tempCanvas || !ctx || !tempCtx) return;

    if (!isDrawingRef.current) return;

    const activeTool = propsRef.current.tool;

    if (activeTool === 'pencil' || activeTool === 'eraser') {
      finishCurrentStroke();
    } else {
      const rawCoords = getLogicalCoords(e.clientX, e.clientY, canvas, false);
      finishShapeDrawing(rawCoords.x, rawCoords.y);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    activePointerIdRef.current = null;
    handlePointerUp(e);
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
      onPointerDown={(e) => {
        if (propsRef.current.readOnly) return;
        if (isDrawingRef.current) return;
        if (isZoomPinchingRef.current || activeTouchCountRef.current >= 2) return;
        if (!isCanvasResizeObserverReadyRef.current) return;
        const activeTool = propsRef.current.tool;
        const isShape = activeTool === 'line' || activeTool === 'strokeRect' || activeTool === 'fillRect' || activeTool === 'strokeCircle' || activeTool === 'fillCircle';
        if (isShape && e.target === containerRef.current) {
          const canvas = canvasRef.current;
          if (!canvas) return;
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch (err) {}
          const raw = getLogicalCoords(e.clientX, e.clientY, canvas, false);
          startShapeDrawing(raw.x, raw.y);
        } else if ((activeTool === 'pencil' || activeTool === 'eraser') && e.target === containerRef.current) {
          const canvas = canvasRef.current;
          if (!canvas) return;
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch (err) {}

          const useInputOptimizations = propsRef.current.isFreeDraw || Boolean(propsRef.current.enableInputOptimizations);
          if (useInputOptimizations) {
            // Free Draw & Experimental (Batch 1): Continuous un-clamped raw trajectory begins directly from the pointer position.
            // Native canvas context naturally clips any geometry outside (0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT).
            const rawCoords = getLogicalCoords(e.clientX, e.clientY, canvas, false);
            startPencilOrEraserStroke(rawCoords.x, rawCoords.y);
          } else {
            exitedOutsideWhilePointerDownRef.current = true;
            lastOutsidePointerRef.current = { clientX: e.clientX, clientY: e.clientY };
          }
        }
      }}
      onPointerMove={(e) => {
        if (isZoomPinchingRef.current || activeTouchCountRef.current >= 2) {
          return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        const activeTool = propsRef.current.tool;
        const isShape = activeTool === 'line' || activeTool === 'strokeRect' || activeTool === 'fillRect' || activeTool === 'strokeCircle' || activeTool === 'fillCircle';
        if (isDrawingRef.current && isShape) {
          const raw = getLogicalCoords(e.clientX, e.clientY, canvas, false);
          processShapeMove(raw.x, raw.y);
        } else if (activeTool === 'pencil' || activeTool === 'eraser') {
          const rawCoords = getLogicalCoords(e.clientX, e.clientY, canvas, false);
          const isInside = rawCoords.x >= 0 && rawCoords.x <= LOGICAL_WIDTH && rawCoords.y >= 0 && rawCoords.y <= LOGICAL_HEIGHT;
          const useInputOptimizations = propsRef.current.isFreeDraw || Boolean(propsRef.current.enableInputOptimizations);
          if (isDrawingRef.current) {
            if (useInputOptimizations) {
              const nativeEvt = e.nativeEvent as any;
              const rawEvents: PointerEvent[] = (nativeEvt && typeof nativeEvt.getCoalescedEvents === 'function')
                ? nativeEvt.getCoalescedEvents()
                : [];
              if (rawEvents.length > 0) {
                for (let i = 0; i < rawEvents.length; i++) {
                  const pt = getLogicalCoords(rawEvents[i].clientX, rawEvents[i].clientY, canvas, false);
                  processStrokeMove(pt.x, pt.y);
                }
              } else {
                processStrokeMove(rawCoords.x, rawCoords.y);
              }
            } else {
              if (isInside) {
                processStrokeMove(rawCoords.x, rawCoords.y);
              } else {
                const clamped = getLogicalCoords(e.clientX, e.clientY, canvas, true);
                processStrokeMove(clamped.x, clamped.y);
                finishCurrentStroke();
                exitedOutsideWhilePointerDownRef.current = true;
                lastOutsidePointerRef.current = { clientX: e.clientX, clientY: e.clientY };
              }
            }
          } else if (exitedOutsideWhilePointerDownRef.current && !useInputOptimizations) {
            if (isInside) {
              exitedOutsideWhilePointerDownRef.current = false;
              let entryX = rawCoords.x;
              let entryY = rawCoords.y;
              if (lastOutsidePointerRef.current) {
                const entryCoords = getLogicalCoords(lastOutsidePointerRef.current.clientX, lastOutsidePointerRef.current.clientY, canvas, true);
                entryX = entryCoords.x;
                entryY = entryCoords.y;
              }
              lastOutsidePointerRef.current = null;
              startPencilOrEraserStroke(entryX, entryY);
              processStrokeMove(rawCoords.x, rawCoords.y);
            } else {
              lastOutsidePointerRef.current = { clientX: e.clientX, clientY: e.clientY };
            }
          }
        }
      }}
      onPointerUp={(e) => {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch (err) {}
        exitedOutsideWhilePointerDownRef.current = false;
        lastOutsidePointerRef.current = null;
        if (isDrawingRef.current) {
          const activeTool = propsRef.current.tool;
          const isShape = activeTool === 'line' || activeTool === 'strokeRect' || activeTool === 'fillRect' || activeTool === 'strokeCircle' || activeTool === 'fillCircle';
          if (isShape) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const raw = getLogicalCoords(e.clientX, e.clientY, canvas, false);
            finishShapeDrawing(raw.x, raw.y);
          } else if (activeTool === 'pencil' || activeTool === 'eraser') {
            finishCurrentStroke();
          }
        }
      }}
      onPointerCancel={(e) => {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch (err) {}
        exitedOutsideWhilePointerDownRef.current = false;
        lastOutsidePointerRef.current = null;
        if (isDrawingRef.current) {
          const activeTool = propsRef.current.tool;
          const isShape = activeTool === 'line' || activeTool === 'strokeRect' || activeTool === 'fillRect' || activeTool === 'strokeCircle' || activeTool === 'fillCircle';
          if (isShape) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const raw = getLogicalCoords(e.clientX, e.clientY, canvas, false);
            finishShapeDrawing(raw.x, raw.y);
          } else if (activeTool === 'pencil' || activeTool === 'eraser') {
            finishCurrentStroke();
          }
        }
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
          className={`absolute inset-0 w-full h-full block ${(isFreeDraw || enableCanvasAlpha) ? 'bg-transparent' : 'bg-white'} touch-none ${readOnly ? 'object-contain pointer-events-none' : 'pointer-events-auto cursor-crosshair'}`}
          style={{
            zIndex: 10,
            imageRendering: 'auto'
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerEnter={(e) => {
            if (propsRef.current.readOnly) return;
            if (isDrawingRef.current) return;
            if (propsRef.current.isFreeDraw) return;
            if (e.pointerType === 'mouse' && e.buttons === 1) {
              const tool = propsRef.current.tool;
              if (tool === 'pencil' || tool === 'eraser') {
                if (!isCanvasResizeObserverReadyRef.current) return;
                try {
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                } catch (err) {}
                const canvas = canvasRef.current;
                if (!canvas) return;
                const { x, y } = getLogicalCoords(e.clientX, e.clientY, canvas, true);
                strokeHandlerRef.current?.start(x, y);
              }
            }
          }}
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

      {/* 📊 Temporary Free Draw Runtime Diagnostic Overlay (Local only & Opt-in) */}
      {ENABLE_FREE_DRAW_DIAGNOSTICS && isFreeDraw && !readOnly && (
        !isDiagnosticsVisible ? (
          <button
            onClick={() => setIsDiagnosticsVisible(true)}
            className="absolute top-2 left-2 z-40 bg-black/40 hover:bg-black/80 text-white/60 hover:text-white text-[10px] font-mono px-2 py-1 rounded-md border border-white/10 backdrop-blur-sm transition-all pointer-events-auto select-none flex items-center gap-1 shadow"
            title="Open Drawing Diagnostics"
          >
            <span>📊</span>
            <span className="hidden sm:inline">Stats</span>
          </button>
        ) : (
          <div
            className="absolute top-2 left-2 z-50 bg-[#120f2e]/95 text-white font-mono text-[10px] sm:text-[11px] p-2.5 rounded-xl border border-white/20 shadow-2xl backdrop-blur-md max-w-[275px] max-h-[90vh] overflow-y-auto pointer-events-auto select-none"
            dir="ltr"
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5 mb-2">
              <span className="font-bold text-amber-400">📊 Drawing Diagnostics</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={resetDiagnosticStats}
                  className="text-white/60 hover:text-white text-[9.5px] px-1.5 py-0.5 bg-white/10 hover:bg-white/20 rounded cursor-pointer"
                  title="Reset counters"
                >
                  Reset
                </button>
                <button
                  onClick={() => setIsDiagnosticsVisible(false)}
                  className="text-white/60 hover:text-rose-400 text-[11px] px-1.5 py-0.5 bg-white/10 hover:bg-white/20 rounded cursor-pointer font-bold leading-none"
                  title="Close Diagnostics"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              {/* Single-Source Canonical Geometry Pipeline Toggle */}
              <div className="flex items-center justify-between bg-emerald-950/70 border border-emerald-400/40 p-1.5 rounded text-[10px]">
                <div>
                  <span className="font-bold text-emerald-300">Single-Source Canonical:</span>
                  <div className="text-[8.5px] text-emerald-200/70">Unified Geometry Pipeline</div>
                </div>
                <button
                  onClick={() => setIsSingleSourceActive(!isSingleSourceActive)}
                  className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors text-[9.5px] ${
                    isSingleSourceActive
                      ? "bg-emerald-600 text-white shadow-sm shadow-emerald-500/50"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {isSingleSourceActive ? "ON (Canonical)" : "OFF (Baseline)"}
                </button>
              </div>

              {/* Phase 5A: Local Canonical Prototype Toggle */}
              <div className="flex items-center justify-between bg-indigo-950/70 border border-indigo-400/40 p-1.5 rounded text-[10px]">
                <div>
                  <span className="font-bold text-indigo-300">Phase 5A Canonical:</span>
                  <div className="text-[8.5px] text-indigo-200/70">Local-only prototype</div>
                </div>
                <button
                  onClick={() => setIsCanonicalLocalTestActive(!isCanonicalLocalTestActive)}
                  className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors text-[9.5px] ${
                    isCanonicalLocalTestActive
                      ? "bg-emerald-600 text-white shadow-sm shadow-emerald-500/50"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {isCanonicalLocalTestActive ? "ON (Active)" : "OFF (Dense)"}
                </button>
              </div>

              {/* Phase 5A: Points Ratio & Simulation Card */}
              <div className="bg-white/5 p-1.5 rounded border border-white/5 space-y-1 text-[9.5px]">
                <div className="font-bold text-amber-300 flex items-center justify-between">
                  <span>Stroke Points Ratio:</span>
                  <span className={isSingleSourceActive ? "text-emerald-400 font-bold" : (isCanonicalLocalTestActive ? "text-indigo-400 font-bold" : "text-gray-400 font-normal")}>
                    {isSingleSourceActive ? "Single Source" : (isCanonicalLocalTestActive ? "Live Canonical" : "Shadow Mode")}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[9px] bg-black/20 p-1 rounded text-center">
                  <div>
                    <div className="text-gray-400">Canonical</div>
                    <div className="font-bold text-amber-300">{diagSnapshot?.canonicalMetrics?.lastCanonicalPoints || 0}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Network</div>
                    <div className="font-bold text-sky-300">{diagSnapshot?.canonicalMetrics?.lastNetworkPoints || 0}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Dense</div>
                    <div className="font-bold text-purple-300">{diagSnapshot?.canonicalMetrics?.lastDensePoints || 0}</div>
                  </div>
                </div>

                {/* Invariance Indicator & Point Diff */}
                <div className="flex items-center justify-between text-[9px] bg-black/30 px-1.5 py-1 rounded">
                  <span className="text-gray-300">Invariance Match:</span>
                  {diagSnapshot?.canonicalMetrics && diagSnapshot.canonicalMetrics.lastCanonicalPoints > 0 ? (
                    diagSnapshot.canonicalMetrics.lastCanonicalPoints === diagSnapshot.canonicalMetrics.lastNetworkPoints ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                        ✓ MATCH (Diff: 0)
                      </span>
                    ) : (
                      <span className="text-rose-400 font-bold">
                        ✗ Diff: {Math.abs(diagSnapshot.canonicalMetrics.lastCanonicalPoints - diagSnapshot.canonicalMetrics.lastNetworkPoints)}
                      </span>
                    )
                  ) : (
                    <span className="text-gray-400">No stroke</span>
                  )}
                </div>

                {/* Total Bytes */}
                <div className="flex items-center justify-between text-[9px] px-0.5 text-gray-300">
                  <span>Total Bytes:</span>
                  <span className="text-emerald-400 font-bold">
                    {((diagSnapshot?.drawMove.bytes || 0) + (diagSnapshot?.drawStroke.bytes || 0) + (diagSnapshot?.drawStart.bytes || 0) + (diagSnapshot?.drawEnd.bytes || 0))} B
                  </span>
                </div>
                {diagSnapshot?.canonicalMetrics && diagSnapshot.canonicalMetrics.strokesCount > 0 && (
                  <div className="space-y-0.5 text-[9px] border-t border-white/5 pt-1 text-gray-300">
                    <div className="flex justify-between">
                      <span>Can / Net Ratio:</span>
                      <span className="font-bold text-white">
                        {(diagSnapshot.canonicalMetrics.totalCanonicalPoints / Math.max(1, diagSnapshot.canonicalMetrics.totalNetworkPoints)).toFixed(2)}x
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Can / Dense Ratio:</span>
                      <span className="font-bold text-white">
                        {(diagSnapshot.canonicalMetrics.totalCanonicalPoints / Math.max(1, diagSnapshot.canonicalMetrics.totalDensePoints)).toFixed(2)}x
                      </span>
                    </div>
                    <div className="flex justify-between text-amber-200/90">
                      <span>Simulated 30m:</span>
                      <span className="font-bold text-emerald-300">
                        {((diagSnapshot.canonicalMetrics.totalCanonicalPoints / Math.max(1, diagSnapshot.canonicalMetrics.totalNetworkPoints)) * 173.88).toFixed(1)} KB
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 🧪 Shadow Compression Diagnostic Card (Delta + VarInt on Canonical Stream) */}
              <div className="bg-white/5 p-1.5 rounded border border-purple-500/30 space-y-1 text-[9.5px]">
                <div className="font-bold text-purple-300 flex items-center justify-between">
                  <span>🧪 Shadow Compression (Delta + VarInt)</span>
                  <span className="text-[8px] bg-purple-900/60 text-purple-200 px-1 py-0.5 rounded border border-purple-400/30">
                    Measurement Only
                  </span>
                </div>

                {diagSnapshot?.canonicalMetrics?.shadow && diagSnapshot.canonicalMetrics.shadow.lastPoints > 0 ? (
                  <div className="space-y-1.5 pt-0.5">
                    {/* Last Stroke */}
                    <div className="bg-black/30 p-1.5 rounded border border-white/5 space-y-0.5">
                      <div className="font-bold text-amber-200/90 text-[9px] flex justify-between">
                        <span>Last Stroke:</span>
                        <span className="text-white font-mono">{diagSnapshot.canonicalMetrics.shadow.lastPoints} pts</span>
                      </div>
                      <div className="flex justify-between text-[9px]">
                        <span className="text-gray-400">Current Wire:</span>
                        <span className="text-sky-300 font-mono font-bold">
                          {diagSnapshot.canonicalMetrics.shadow.lastWireBytes.toLocaleString()} B
                          <span className="text-gray-400 font-normal ml-1">({diagSnapshot.canonicalMetrics.shadow.lastWireBpt.toFixed(1)} B/pt)</span>
                        </span>
                      </div>
                      <div className="flex justify-between text-[9px]">
                        <span className="text-gray-400">Shadow Size:</span>
                        <span className="text-purple-300 font-mono font-bold">
                          {diagSnapshot.canonicalMetrics.shadow.lastShadowBytes.toLocaleString()} B
                          <span className="text-gray-400 font-normal ml-1">({diagSnapshot.canonicalMetrics.shadow.lastShadowBpt.toFixed(1)} B/pt)</span>
                        </span>
                      </div>
                      <div className="flex justify-between text-[9px] border-t border-white/10 pt-0.5">
                        <span className="text-gray-300 font-semibold">Saved:</span>
                        <span className="text-emerald-400 font-mono font-bold">
                          {diagSnapshot.canonicalMetrics.shadow.lastSavedBytes.toLocaleString()} B
                          <span className="ml-1 text-emerald-300 font-normal">({diagSnapshot.canonicalMetrics.shadow.lastCompressionPercent.toFixed(1)}%)</span>
                        </span>
                      </div>
                    </div>

                    {/* Cumulative (All Strokes) */}
                    <div className="bg-black/30 p-1.5 rounded border border-white/5 space-y-0.5">
                      <div className="font-bold text-amber-200/90 text-[9px] flex justify-between">
                        <span>Cumulative ({diagSnapshot.canonicalMetrics.strokesCount} {diagSnapshot.canonicalMetrics.strokesCount === 1 ? 'stroke' : 'strokes'}):</span>
                        <span className="text-white font-mono">{diagSnapshot.canonicalMetrics.shadow.totalPoints.toLocaleString()} pts</span>
                      </div>
                      <div className="flex justify-between text-[9px]">
                        <span className="text-gray-400">Current Wire:</span>
                        <span className="text-sky-300 font-mono font-bold">
                          {diagSnapshot.canonicalMetrics.shadow.totalWireBytes.toLocaleString()} B
                          <span className="text-gray-400 font-normal ml-1">({diagSnapshot.canonicalMetrics.shadow.totalWireBpt.toFixed(1)} B/pt)</span>
                        </span>
                      </div>
                      <div className="flex justify-between text-[9px]">
                        <span className="text-gray-400">Shadow Size:</span>
                        <span className="text-purple-300 font-mono font-bold">
                          {diagSnapshot.canonicalMetrics.shadow.totalShadowBytes.toLocaleString()} B
                          <span className="text-gray-400 font-normal ml-1">({diagSnapshot.canonicalMetrics.shadow.totalShadowBpt.toFixed(1)} B/pt)</span>
                        </span>
                      </div>
                      <div className="flex justify-between text-[9px] border-t border-white/10 pt-0.5">
                        <span className="text-gray-300 font-semibold">Total Saved:</span>
                        <span className="text-emerald-400 font-mono font-bold">
                          {diagSnapshot.canonicalMetrics.shadow.totalSavedBytes.toLocaleString()} B
                          <span className="ml-1 text-emerald-300 font-normal">({diagSnapshot.canonicalMetrics.shadow.totalCompressionPercent.toFixed(1)}%)</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-[8.5px] text-gray-400 italic text-center py-1">
                    Draw a stroke to view shadow compression metrics
                  </div>
                )}
              </div>

              <div className="bg-white/5 p-1.5 rounded border border-white/5">
                <div className="font-bold text-sky-300">draw_move:</div>
                <div>events = <span className="text-white font-bold">{diagSnapshot?.drawMove.count || 0}</span></div>
                <div>points = <span className="text-white font-bold">{diagSnapshot?.drawMove.points || 0}</span> (avg {(diagSnapshot?.drawMove.points / (diagSnapshot?.drawMove.count || 1)).toFixed(1)}/evt)</div>
                <div>bytes = <span className="text-emerald-400 font-bold">{diagSnapshot?.drawMove.bytes || 0} B</span> (avg {(diagSnapshot?.drawMove.bytes / (diagSnapshot?.drawMove.count || 1)).toFixed(1)} B/evt)</div>
              </div>

              <div className="bg-white/5 p-1.5 rounded border border-white/5">
                <div className="font-bold text-purple-300">draw_stroke:</div>
                <div>count = <span className="text-white font-bold">{diagSnapshot?.drawStroke.count || 0}</span></div>
                <div>points = <span className="text-white font-bold">{diagSnapshot?.drawStroke.points || 0}</span> (avg {(diagSnapshot?.drawStroke.points / (diagSnapshot?.drawStroke.count || 1)).toFixed(1)}/evt)</div>
                <div>bytes = <span className="text-emerald-400 font-bold">{diagSnapshot?.drawStroke.bytes || 0} B</span> (avg {(diagSnapshot?.drawStroke.bytes / (diagSnapshot?.drawStroke.count || 1)).toFixed(1)} B/evt)</div>
              </div>

              <div className="bg-white/5 p-1.5 rounded border border-white/5 grid grid-cols-2 gap-1 text-[9.5px]">
                <div>
                  <div className="font-bold text-blue-300">draw_start:</div>
                  <div>count = {diagSnapshot?.drawStart.count || 0}</div>
                  <div>bytes = {diagSnapshot?.drawStart.bytes || 0} B</div>
                </div>
                <div>
                  <div className="font-bold text-pink-300">draw_end:</div>
                  <div>count = {diagSnapshot?.drawEnd.count || 0}</div>
                  <div>bytes = {diagSnapshot?.drawEnd.bytes || 0} B</div>
                </div>
              </div>

              {(() => {
                const totalBytes =
                  (diagSnapshot?.drawMove.bytes || 0) +
                  (diagSnapshot?.drawStroke.bytes || 0) +
                  (diagSnapshot?.drawStart.bytes || 0) +
                  (diagSnapshot?.drawEnd.bytes || 0);
                const totalEvents =
                  (diagSnapshot?.drawMove.count || 0) +
                  (diagSnapshot?.drawStroke.count || 0) +
                  (diagSnapshot?.drawStart.count || 0) +
                  (diagSnapshot?.drawEnd.count || 0);
                return (
                  <div className="bg-emerald-950/60 border border-emerald-500/30 p-1.5 rounded text-[10px]">
                    <div className="text-emerald-300 font-bold">TOTAL APP BYTES:</div>
                    <div className="text-base font-black text-emerald-400">
                      {(totalBytes / 1024).toFixed(2)} KB <span className="text-xs font-normal text-emerald-300">({totalBytes.toLocaleString()} B)</span>
                    </div>
                    <div className="text-emerald-200/70 text-[9px] mt-0.5">
                      Total Events: {totalEvents}
                    </div>
                  </div>
                );
              })()}

              <button
                onClick={resetDiagnosticStats}
                className="w-full mt-1.5 py-1 bg-red-600/80 hover:bg-red-500 text-white rounded font-bold text-center active:scale-95 transition-transform cursor-pointer"
              >
                Reset Stats
              </button>
            </div>
          </div>
        )
      )}

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
                  ? (readOnly ? "bg-transparent" : "bg-[#0c061d]/90 cursor-not-allowed")
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

const MemoizedDrawingCanvasCore = React.memo(DrawingCanvasCore, (prevProps, nextProps) => {
  // We decouple rapid brush/color updates from triggering heavy React reconciliations
  // of the massive DrawingCanvasCore JSX tree, because DrawingCanvasCore reads dynamic
  // live drawing parameters (color, thickness, opacity) synchronously from its internal propsRef.
  return (
    prevProps.readOnly === nextProps.readOnly &&
    prevProps.tool === nextProps.tool &&
    prevProps.currentDrawerId === nextProps.currentDrawerId &&
    prevProps.status === nextProps.status &&
    prevProps.isZoomEnabled === nextProps.isZoomEnabled &&
    prevProps.isFreeDraw === nextProps.isFreeDraw &&
    prevProps.isExperimental === nextProps.isExperimental &&
    prevProps.enableInputOptimizations === nextProps.enableInputOptimizations &&
    prevProps.enableBitmapUndoCache === nextProps.enableBitmapUndoCache &&
    prevProps.enableFixedDPR === nextProps.enableFixedDPR &&
    prevProps.enableCanvasAlpha === nextProps.enableCanvasAlpha &&
    prevProps.enableDestinationOutEraser === nextProps.enableDestinationOutEraser &&
    prevProps.enableNetworkSampling === nextProps.enableNetworkSampling &&
    prevProps.enableCanonicalLocalTest === nextProps.enableCanonicalLocalTest &&
    prevProps.deferredReset === nextProps.deferredReset &&
    prevProps.onHistoryStateChange === nextProps.onHistoryStateChange &&
    prevProps.onPipetteColorPicked === nextProps.onPipetteColorPicked &&
    prevProps.onSyncStateChange === nextProps.onSyncStateChange
  );
});

export default MemoizedDrawingCanvasCore;

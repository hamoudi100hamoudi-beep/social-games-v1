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
import { selectEvictionIndexMinimax } from '../../utils/bucketCheckpointPolicy';

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
export const FREE_DRAW_BUCKET_TAIL_THRESHOLD = 3;

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

interface UndoDiagnostics {
  opId: string;
  type: 'local_undo' | 'remote_undo';
  historyLengthBefore: number;
  targetInstanceId: string;
  targetStrokeId: number;
  targetIndex: number;
  targetDistanceFromEnd: number;
  fastPath: 'hit' | 'miss' | 'na';
  fastPathMissReason: string | null;
  baseIndexBefore: number;
  tailIndexBefore: number;
  baseValidBefore: boolean;
  tailValidBefore: boolean;
  baseIndexAfter: number;
  tailIndexAfter: number;
  baseValidAfter: boolean;
  tailValidAfter: boolean;
  replayStartIndex: number;
  commandsReplayed: number;
  bucketCommandsEncountered: number;
  floodFillExecutions: number;
  cumulativeFillDurationMs: number;
  maxFillDurationMs: number;
  totalSyncDurationMs: number;
  hints: {
    existedBefore: number;
    discarded: number;
    usedShortcut: number;
    forcedFill: number;
  };
  checkpointFacts: {
    stride: number;
    retainedCanvases: number;
    invalidationReason: string | null;
    bucketThresholdActive: boolean;
    adaptiveCheckpointExp?: boolean;
    bestCheckpointSlot?: 'base' | 'tail' | 'history' | 'none';
    bestCheckpointIndex?: number;
    checkpointCount?: number;
    approximateRetainedMemoryMB?: number;
    checkpointIndices?: number[];
    checkpointBucketCounts?: number[];
    maxBucketGap?: number;
  };
}

const isDiagEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('freedraw_bucket_undo_diag') === '1';
  } catch (e) {
    return false;
  }
};

const isBucketCheckpointExpEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('freedraw_bucket_checkpoint_exp') === '1';
  } catch (e) {
    return false;
  }
};

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
  isFullCanvasOpaque?: boolean;
  fillHex?: string;
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
): (TargetRGBA & { isFullCanvasOpaque?: boolean; fillHex?: string; isNoOp?: boolean }) | null => {
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
    return { r: tr, g: tg, b: tb, a: ta, isNoOp: true };
  }

  const visited = new Uint8Array(cw * ch);
  const queueX: number[] = [sx];
  const queueY: number[] = [sy];
  let head = 0;
  let filledPixelCount = 0;

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
      filledPixelCount++;

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
  const isFullCanvasOpaque = (filledPixelCount === cw * ch) && (fillOpacity >= 0.95);
  return { r: tr, g: tg, b: tb, a: ta, isFullCanvasOpaque, fillHex };
};

export interface DrawingCanvasCoreRef {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  resetState: () => void;
  getCanvasSnapshot: () => string | null;
  resetZoom?: () => void;
}

// Turn angle threshold for cusp clamping (~60 degrees) in Hybrid Spline Renderer
export const SPLINE_CUSP_COS = 0.5;

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
  showFloatingNames?: boolean;
  enableInputOptimizations?: boolean;
  enableBitmapUndoCache?: boolean;
  enableFixedDPR?: boolean;
  enableCanvasAlpha?: boolean;
  enableDestinationOutEraser?: boolean;
  isRoomJoined?: boolean;
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
    showFloatingNames = true,
    enableInputOptimizations = false,
    enableBitmapUndoCache = false,
    enableFixedDPR = false,
    enableCanvasAlpha = false,
    enableDestinationOutEraser = false,
    isRoomJoined = false
  },
  ref
) => {
  const instanceId = useMemo(() => Math.random().toString(36).substring(2, 9), []);
  const { socket, isConnected } = useSocket();

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
  const hasSyncedOnceRef = useRef(false);
  const isServerRoomJoinedRef = useRef(false);
  const pendingHistorySyncRef = useRef<any[] | null>(null);
  const syncRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const historySyncGenerationRef = useRef(0);
  const syncChunkRafRef = useRef<number | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const checkAndTriggerInitialSyncRef = useRef<(() => void) | null>(null);
  const processIncomingHistorySyncRef = useRef<((commands: any[]) => void) | null>(null);

  // Local drawing track refs
  const isDrawingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentPathRef = useRef<{ x: number; y: number }[]>([]);

  // Single-Source Canonical Stroke Ref (Unified Geometry Stream for Free Draw & Experimental)
  const canonicalStrokeRef = useRef<{ x: number; y: number }[]>([]);

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
    repairPending?: boolean;
    visualStatus?: 'LIVE' | 'DRAINING' | 'COMMITTED';
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
  const pendingBinaryQueueRef = useRef<any[]>([]);
  const onDrawBinaryRef = useRef<((raw: any) => void) | null>(null);

  // --- Free Draw Drawing Identity Registry Ref (Phase 1 & 1B) ---
  const drawingIdentitiesRef = useRef<Record<string, { socketId: string; playerName: string }>>({});

  // --- Floating Drawing Names Layer Refs & Helpers (Free Draw Only - Phase 2) ---
  const floatingLabelsLayerRef = useRef<HTMLDivElement>(null);
  const floatingLabelElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const requestedIdentitiesRef = useRef<Set<string>>(new Set());

  const clearFloatingLabels = () => {
    if (floatingLabelElementsRef.current.size > 0) {
      floatingLabelElementsRef.current.forEach((el) => {
        try {
          el.remove();
        } catch (e) {}
      });
      floatingLabelElementsRef.current.clear();
    }
    if (floatingLabelsLayerRef.current) {
      floatingLabelsLayerRef.current.innerHTML = '';
    }
  };

  useEffect(() => {
    if (!propsRef.current.isFreeDraw) return;
    if (showFloatingNames) {
      updateFloatingLabels();
    } else {
      clearFloatingLabels();
    }
  }, [showFloatingNames]);

  const updateFloatingLabels = () => {
    // 🛡️ Floating drawing names are strictly isolated to Free Draw only and enabled preference
    if (!propsRef.current.isFreeDraw || propsRef.current.showFloatingNames === false) {
      clearFloatingLabels();
      return;
    }

    const layer = floatingLabelsLayerRef.current;
    if (!layer) return;

    const currentElements = floatingLabelElementsRef.current;
    const activeKeys = new Set<string>();

    const sessions = activeSessionsRef.current;
    const identities = drawingIdentitiesRef.current;
    const localInstanceId = instanceId;

    for (const instId in sessions) {
      // 1. Never show over local drawer's own stroke or cursor
      if (instId === localInstanceId) continue;

      const session = sessions[instId];
      if (!session) continue;

      // 2. Only show for Pencil or Eraser tools (exclude shapes, bucket, etc.)
      if (session.tool !== 'pencil' && session.tool !== 'eraser') continue;

      // 3. Must have points in the active live path
      const path = session.path;
      if (!path || path.length === 0) continue;

      // 4. Resolve player display name from drawing identities registry
      const identity = identities[instId];
      let playerName = identity?.playerName?.trim();
      if (!playerName) {
        if (socket?.connected && !requestedIdentitiesRef.current.has(instId)) {
          requestedIdentitiesRef.current.add(instId);
          socket.emit('request_drawing_identities');
        }
        continue;
      }

      activeKeys.add(instId);

      // Latest point of the live stroke
      const tip = path[path.length - 1];

      // Keep within logical canvas bounds so name text is always fully visible
      const clampedX = Math.max(30, Math.min(LOGICAL_WIDTH - 30, tip.x));
      const clampedY = Math.max(20, Math.min(LOGICAL_HEIGHT - 6, tip.y));

      let el = currentElements.get(instId);
      if (!el || !layer.contains(el)) {
        if (el) {
          try { el.remove(); } catch (e) {}
        }
        const existingInDom = layer.querySelector(`[data-inst-id="${instId}"]`);
        if (existingInDom) {
          try { existingInDom.remove(); } catch (e) {}
        }

        el = document.createElement('div');
        el.setAttribute('data-inst-id', instId);
        // Phase 2.4 — Two-layer text outline structure:
        // Outer container: sizes and positions based on the foreground text in flow, with overflow: visible and normal line-height.
        el.className = "absolute pointer-events-none select-none whitespace-nowrap font-bold text-xs tracking-wide z-30";
        el.style.padding = "4px";
        el.style.overflow = "visible";
        el.style.lineHeight = "normal";
        el.style.textShadow = "none";
        el.style.filter = "none";
        el.style.transform = "translate(-50%, -100%) translateY(-6px)";
        el.style.willChange = "left, top";
        el.style.maxWidth = "200px";
        el.style.direction = "auto";

        // Inner positioned wrapper: wraps both identical layers to guarantee 1:1 baseline and geometry matching
        const inner = document.createElement('div');
        inner.className = "relative inline-block overflow-visible";
        inner.style.position = "relative";
        inner.style.display = "inline-block";
        inner.style.overflow = "visible";
        inner.style.lineHeight = "normal";

        // Layer 1: Background stroke layer (solid #000000 with 1.5px outline, zero drop-shadow/text-shadow)
        const strokeSpan = document.createElement('span');
        strokeSpan.className = "floating-name-stroke absolute select-none whitespace-nowrap";
        strokeSpan.style.position = "absolute";
        strokeSpan.style.top = "0";
        strokeSpan.style.left = "0";
        strokeSpan.style.right = "0";
        strokeSpan.style.bottom = "0";
        strokeSpan.style.color = "#000000";
        (strokeSpan.style as any).webkitTextStroke = "1.5px #000000";
        strokeSpan.style.fontFamily = "inherit";
        strokeSpan.style.fontSize = "inherit";
        strokeSpan.style.fontWeight = "inherit";
        strokeSpan.style.lineHeight = "inherit";
        strokeSpan.style.letterSpacing = "inherit";
        strokeSpan.style.direction = "inherit";
        strokeSpan.style.overflow = "visible";
        strokeSpan.style.textShadow = "none";
        strokeSpan.style.filter = "none";
        strokeSpan.style.zIndex = "1";
        strokeSpan.textContent = playerName;

        // Layer 2: Foreground fill layer (solid #ffffff, stroke explicitly 0, zero drop-shadow/text-shadow)
        // Kept in document flow so container dimensions naturally derive from this white text
        const fillSpan = document.createElement('span');
        fillSpan.className = "floating-name-fill relative inline-block select-none whitespace-nowrap";
        fillSpan.style.position = "relative";
        fillSpan.style.display = "inline-block";
        fillSpan.style.color = "#ffffff";
        (fillSpan.style as any).webkitTextStroke = "0px transparent";
        fillSpan.style.fontFamily = "inherit";
        fillSpan.style.fontSize = "inherit";
        fillSpan.style.fontWeight = "inherit";
        fillSpan.style.lineHeight = "inherit";
        fillSpan.style.letterSpacing = "inherit";
        fillSpan.style.direction = "inherit";
        fillSpan.style.overflow = "visible";
        fillSpan.style.textShadow = "none";
        fillSpan.style.filter = "none";
        fillSpan.style.zIndex = "2";
        fillSpan.textContent = playerName;

        inner.appendChild(strokeSpan);
        inner.appendChild(fillSpan);
        el.appendChild(inner);

        (el as any)._strokeSpan = strokeSpan;
        (el as any)._fillSpan = fillSpan;

        layer.appendChild(el);
        currentElements.set(instId, el);
      } else {
        const fillSpan = (el as any)._fillSpan || el.querySelector('.floating-name-fill');
        const strokeSpan = (el as any)._strokeSpan || el.querySelector('.floating-name-stroke');
        if (fillSpan && fillSpan.textContent !== playerName) {
          fillSpan.textContent = playerName;
        }
        if (strokeSpan && strokeSpan.textContent !== playerName) {
          strokeSpan.textContent = playerName;
        }
      }

      el.style.left = `${clampedX}px`;
      el.style.top = `${clampedY}px`;
    }

    // Clean up obsolete labels for sessions that ended (draw_commit, draw_end, draw_abort, draw_cancel, etc.)
    currentElements.forEach((el, instId) => {
      if (!activeKeys.has(instId)) {
        try {
          el.remove();
        } catch (e) {}
        currentElements.delete(instId);
      }
    });
  };

  // 🎯 Visual Ownership Invariant: Pending commits queue & last committed tracking
  interface PendingRemoteCommit {
    instanceId: string;
    strokeId: number;
    tool: ToolType;
    color: string;
    width: number;
    opacity: number;
    path: { x: number; y: number }[];
    rawPoints?: { x: number; y: number }[];
  }
  const pendingCommitsRef = useRef<PendingRemoteCommit[]>([]);
  const lastCommittedStrokeIdRef = useRef<Record<string, number>>({});

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

  useEffect(() => {
    return () => {
      if (bucketTimeoutRef.current) {
        clearTimeout(bucketTimeoutRef.current);
      }
      if (spectatorPlaybackRafRef.current !== null) {
        cancelAnimationFrame(spectatorPlaybackRafRef.current);
        spectatorPlaybackRafRef.current = null;
      }
      if (syncChunkRafRef.current !== null) {
        cancelAnimationFrame(syncChunkRafRef.current);
        syncChunkRafRef.current = null;
      }
      if (syncRetryTimerRef.current) {
        clearTimeout(syncRetryTimerRef.current);
        syncRetryTimerRef.current = null;
      }
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
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

  // 🛡️ Single-Flight Undo Guard (Locks concurrent/queued repeat invocations during undo processing)
  const undoInProgressRef = useRef<boolean>(false);

  // 🛡️ Free Draw Single Undo Cache Historical Metadata (Guarantees cache authenticity before restoration)
  interface FreeDrawUndoCacheMeta {
    baseHistoryLength: number;
    targetInstanceId: string;
    targetStrokeId: number;
    prevAnchorSignature: string | null;
  }
  const freeDrawUndoCacheMetaRef = useRef<FreeDrawUndoCacheMeta | null>(null);

  // ⚡ Local hint tracking for Full-Canvas Opaque Bucket fast replay
  const lastBucketHintRef = useRef<{ hint: string; color: string; opacity: number } | null>(null);

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

  const commitFreeDrawPendingCache = (targetInstId?: string, targetStrId?: number) => {
    const useCache = propsRef.current.isFreeDraw || Boolean(propsRef.current.enableBitmapUndoCache);
    if (!useCache) return;
    if (hasFreeDrawPendingUndoCacheRef.current && freeDrawPendingUndoCacheCanvasRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const undoCanvas = ensureCacheCanvas(freeDrawUndoCacheCanvasRef, canvas);
      copyCanvasContent(freeDrawPendingUndoCacheCanvasRef.current, undoCanvas);
      hasFreeDrawUndoCacheRef.current = true;
      hasFreeDrawPendingUndoCacheRef.current = false;
      hasFreeDrawRedoCacheRef.current = false;

      if (targetInstId !== undefined && targetStrId !== undefined) {
        const list = localCommandsRef.current;
        const baseLen = list.length;
        const prevSig = baseLen > 0 ? getCommandSignature(list[baseLen - 1]) : null;
        freeDrawUndoCacheMetaRef.current = {
          baseHistoryLength: baseLen,
          targetInstanceId: targetInstId,
          targetStrokeId: targetStrId,
          prevAnchorSignature: prevSig
        };
      } else {
        freeDrawUndoCacheMetaRef.current = null;
      }
    }
  };

  const captureDirectFreeDrawUndoCache = (targetInstId?: string, targetStrId?: number) => {
    const useCache = propsRef.current.isFreeDraw || Boolean(propsRef.current.enableBitmapUndoCache);
    if (!useCache) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const undoCanvas = ensureCacheCanvas(freeDrawUndoCacheCanvasRef, canvas);
    copyCanvasContent(canvas, undoCanvas);
    hasFreeDrawUndoCacheRef.current = true;
    hasFreeDrawPendingUndoCacheRef.current = false;
    hasFreeDrawRedoCacheRef.current = false;

    if (targetInstId !== undefined && targetStrId !== undefined) {
      const list = localCommandsRef.current;
      const baseLen = list.length;
      const prevSig = baseLen > 0 ? getCommandSignature(list[baseLen - 1]) : null;
      freeDrawUndoCacheMetaRef.current = {
        baseHistoryLength: baseLen,
        targetInstanceId: targetInstId,
        targetStrokeId: targetStrId,
        prevAnchorSignature: prevSig
      };
    } else {
      freeDrawUndoCacheMetaRef.current = null;
    }
  };

  const invalidateFreeDrawCaches = () => {
    const useCache = propsRef.current.isFreeDraw || Boolean(propsRef.current.enableBitmapUndoCache);
    if (!useCache) return;
    hasFreeDrawUndoCacheRef.current = false;
    hasFreeDrawRedoCacheRef.current = false;
    hasFreeDrawPendingUndoCacheRef.current = false;
    freeDrawUndoCacheMetaRef.current = null;
  };

  // 🛡️ Free Draw Dual Bounded Checkpoint Structure & Helpers (Base & Tail Snapshots)
  interface FreeDrawCheckpoint {
    canvas: HTMLCanvasElement | null;
    index: number; // Snapshot at index k represents canvas state after commands 0..k-1 (before command k)
    anchorSignature: string | null;
    lastClearIndex: number;
  }

  const baseCheckpointRef = useRef<FreeDrawCheckpoint>({
    canvas: null,
    index: 0,
    anchorSignature: null,
    lastClearIndex: -1
  });

  const tailCheckpointRef = useRef<FreeDrawCheckpoint>({
    canvas: null,
    index: 0,
    anchorSignature: null,
    lastClearIndex: -1
  });

  // 🛡️ History-Indexed Bucket Checkpoint Collection (Phase 1F.5)
  // Maintains an ordered, history-indexed collection of global canvas snapshots,
  // bounded by MAX_HISTORY_CHECKPOINTS to guarantee predictable RAM usage.
  // Free Draw canvas: 680x396x4 bytes = ~1,077,120 bytes (~1.03 MB) per snapshot.
  // 10 snapshots = ~10.3 MB maximum VRAM/RAM allocation.
  const MAX_HISTORY_CHECKPOINTS = 10;

  interface HistoryCheckpoint {
    canvas: HTMLCanvasElement;
    index: number; // Snapshot represents canvas state after commands 0..index-1 (before command index)
    anchorSignature: string;
    lastClearIndex: number;
    timestamp: number;
  }

  const historyCheckpointsRef = useRef<HistoryCheckpoint[]>([]);
  const checkpointCanvasPoolRef = useRef<HTMLCanvasElement[]>([]);

  const acquireRecycledCheckpointCanvas = (): HTMLCanvasElement => {
    const effectiveDPR = (propsRef.current.isFreeDraw || propsRef.current.isExperimental || enableFixedDPR) ? 1.0 : DPR;
    const targetW = Math.round(LOGICAL_WIDTH * effectiveDPR);
    const targetH = Math.round(LOGICAL_HEIGHT * effectiveDPR);

    let canvas: HTMLCanvasElement;
    if (checkpointCanvasPoolRef.current.length > 0) {
      canvas = checkpointCanvasPoolRef.current.pop()!;
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
  };

  const releaseCheckpointCanvas = (canvas: HTMLCanvasElement) => {
    if (!canvas) return;
    if (checkpointCanvasPoolRef.current.length < MAX_HISTORY_CHECKPOINTS + 4) {
      const cCtx = canvas.getContext('2d');
      if (cCtx) {
        cCtx.clearRect(0, 0, canvas.width, canvas.height);
      }
      checkpointCanvasPoolRef.current.push(canvas);
    }
  };

  const clearHistoryCheckpoints = () => {
    for (const cp of historyCheckpointsRef.current) {
      if (cp.canvas) releaseCheckpointCanvas(cp.canvas);
    }
    historyCheckpointsRef.current = [];
  };

  const captureHistoryCheckpoint = (index: number, commandList?: any[]) => {
    if (!propsRef.current.isFreeDraw || !isBucketCheckpointExpEnabled()) return;
    const ctx = ctxRef.current;
    if (!ctx || !ctx.canvas) return;

    const list = commandList || localCommandsRef.current;
    const lastClearIndex = findLatestClearIndex(list);
    if (index <= lastClearIndex) return;

    const existingIdx = historyCheckpointsRef.current.findIndex(cp => cp.index === index);
    if (existingIdx !== -1) {
      const existing = historyCheckpointsRef.current[existingIdx];
      const cCtx = existing.canvas.getContext('2d');
      if (cCtx) {
        cCtx.clearRect(0, 0, existing.canvas.width, existing.canvas.height);
        cCtx.save();
        cCtx.setTransform(1, 0, 0, 1, 0, 0);
        cCtx.drawImage(ctx.canvas, 0, 0);
        cCtx.restore();
        existing.anchorSignature = index > 0 ? getCommandSignature(list[index - 1]) : "";
        existing.lastClearIndex = lastClearIndex;
        existing.timestamp = Date.now();
      }
      return;
    }

    if (historyCheckpointsRef.current.length >= MAX_HISTORY_CHECKPOINTS) {
      const cps = historyCheckpointsRef.current;
      const evictIdx = selectEvictionIndexMinimax(cps, list, lastClearIndex, MAX_HISTORY_CHECKPOINTS);
      if (evictIdx >= 0 && evictIdx < cps.length) {
        const [evicted] = cps.splice(evictIdx, 1);
        if (evicted?.canvas) {
          releaseCheckpointCanvas(evicted.canvas);
        }
      }
    }

    const cCanvas = acquireRecycledCheckpointCanvas();
    const cCtx = cCanvas.getContext('2d');
    if (cCtx) {
      cCtx.save();
      cCtx.setTransform(1, 0, 0, 1, 0, 0);
      cCtx.drawImage(ctx.canvas, 0, 0);
      cCtx.restore();

      const cp: HistoryCheckpoint = {
        canvas: cCanvas,
        index,
        anchorSignature: index > 0 ? getCommandSignature(list[index - 1]) : "",
        lastClearIndex,
        timestamp: Date.now()
      };
      historyCheckpointsRef.current.push(cp);
      historyCheckpointsRef.current.sort((a, b) => a.index - b.index);
    }
  };

  const invalidateHistoryCheckpointsAfter = (targetIndex: number) => {
    const keep: HistoryCheckpoint[] = [];
    for (const cp of historyCheckpointsRef.current) {
      if (cp.index > targetIndex) {
        releaseCheckpointCanvas(cp.canvas);
      } else {
        keep.push(cp);
      }
    }
    historyCheckpointsRef.current = keep;
  };

  const getCommandSignature = (cmd: any): string => {
    if (!cmd) return "";
    const instId = cmd.instanceId || cmd.instId || (cmd.data && typeof cmd.data === 'object' ? (cmd.data.instanceId || cmd.data.instId) : "");
    let sId = cmd.strokeId !== undefined ? cmd.strokeId : -1;
    if (sId === -1 && cmd.data && typeof cmd.data === 'object' && cmd.data.strokeId !== undefined) {
      sId = cmd.data.strokeId;
    }
    return `${instId}_${sId}`;
  };

  const ensureCheckpointCanvas = (slot: 'base' | 'tail'): HTMLCanvasElement => {
    const cpRef = slot === 'base' ? baseCheckpointRef : tailCheckpointRef;
    if (!cpRef.current.canvas) {
      cpRef.current.canvas = document.createElement('canvas');
    }
    const canvas = cpRef.current.canvas;
    const effectiveDPR = (propsRef.current.isFreeDraw || propsRef.current.isExperimental || enableFixedDPR) ? 1.0 : DPR;
    const targetW = Math.round(LOGICAL_WIDTH * effectiveDPR);
    const targetH = Math.round(LOGICAL_HEIGHT * effectiveDPR);
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
  };

  const invalidateCheckpoint = (slot: 'base' | 'tail' | 'all' = 'all') => {
    if (slot === 'base' || slot === 'all') {
      baseCheckpointRef.current.index = 0;
      baseCheckpointRef.current.anchorSignature = null;
      baseCheckpointRef.current.lastClearIndex = -1;
      if (baseCheckpointRef.current.canvas) {
        const cCtx = baseCheckpointRef.current.canvas.getContext('2d');
        if (cCtx) {
          cCtx.clearRect(0, 0, baseCheckpointRef.current.canvas.width, baseCheckpointRef.current.canvas.height);
        }
      }
    }
    if (slot === 'tail' || slot === 'all') {
      tailCheckpointRef.current.index = 0;
      tailCheckpointRef.current.anchorSignature = null;
      tailCheckpointRef.current.lastClearIndex = -1;
      if (tailCheckpointRef.current.canvas) {
        const cCtx = tailCheckpointRef.current.canvas.getContext('2d');
        if (cCtx) {
          cCtx.clearRect(0, 0, tailCheckpointRef.current.canvas.width, tailCheckpointRef.current.canvas.height);
        }
      }
    }
    if (slot === 'all') {
      clearHistoryCheckpoints();
    }
  };

  const isClearCommand = (c: any): boolean => {
    if (!c) return false;
    if (c.event === 'draw_clear') return true;
    if (c.event === 'draw_binary' && c.data) {
      const byte0 = c.data instanceof ArrayBuffer 
        ? new Uint8Array(c.data)[0] 
        : (ArrayBuffer.isView(c.data) ? (c.data as Uint8Array)[0] : (Array.isArray(c.data) ? c.data[0] : 0));
      return byte0 === 5;
    }
    return false;
  };

  const findLatestClearIndex = (commands: any[], upToIndex?: number): number => {
    const end = upToIndex !== undefined ? Math.min(commands.length - 1, upToIndex) : commands.length - 1;
    for (let i = end; i >= 0; i--) {
      if (isClearCommand(commands[i])) return i;
    }
    return -1;
  };

  const isCheckpointValid = (
    cp: FreeDrawCheckpoint | HistoryCheckpoint,
    commands: any[],
    targetIndex?: number
  ): boolean => {
    if (!propsRef.current.isFreeDraw && !propsRef.current.isExperimental) return false;
    if (!cp.canvas || cp.index <= 0) return false;
    const N = commands.length;
    if (cp.index > N) return false;
    if (targetIndex !== undefined && cp.index > targetIndex) return false;

    const effectiveDPR = (propsRef.current.isFreeDraw || propsRef.current.isExperimental || enableFixedDPR) ? 1.0 : DPR;
    const targetW = Math.round(LOGICAL_WIDTH * effectiveDPR);
    const targetH = Math.round(LOGICAL_HEIGHT * effectiveDPR);
    if (cp.canvas.width !== targetW || cp.canvas.height !== targetH) return false;

    const currentClearIndex = findLatestClearIndex(commands);
    if (cp.index <= currentClearIndex) return false;
    if (cp.lastClearIndex !== currentClearIndex) return false;

    const sig = getCommandSignature(commands[cp.index - 1]);
    if (!cp.anchorSignature || sig !== cp.anchorSignature) return false;

    return true;
  };

  const getBestCheckpoint = (
    commands: any[],
    targetIndex?: number
  ): { slot: 'base' | 'tail' | 'history'; index: number; canvas: HTMLCanvasElement } | null => {
    // 🛡️ Phase 1F.5: Prioritize History-Indexed Checkpoint Collection when experimental flag is active
    if (isBucketCheckpointExpEnabled() && propsRef.current.isFreeDraw) {
      for (let i = historyCheckpointsRef.current.length - 1; i >= 0; i--) {
        const cp = historyCheckpointsRef.current[i];
        if (isCheckpointValid(cp, commands, targetIndex)) {
          return { slot: 'history', index: cp.index, canvas: cp.canvas };
        }
      }
    }

    const tailValid = isCheckpointValid(tailCheckpointRef.current, commands, targetIndex);
    const baseValid = isCheckpointValid(baseCheckpointRef.current, commands, targetIndex);

    if (tailValid && baseValid) {
      if (tailCheckpointRef.current.index >= baseCheckpointRef.current.index) {
        return { slot: 'tail', index: tailCheckpointRef.current.index, canvas: tailCheckpointRef.current.canvas! };
      } else {
        return { slot: 'base', index: baseCheckpointRef.current.index, canvas: baseCheckpointRef.current.canvas! };
      }
    } else if (tailValid) {
      return { slot: 'tail', index: tailCheckpointRef.current.index, canvas: tailCheckpointRef.current.canvas! };
    } else if (baseValid) {
      return { slot: 'base', index: baseCheckpointRef.current.index, canvas: baseCheckpointRef.current.canvas! };
    }
    return null;
  };

  const invalidateCheckpointsAfterIndex = (targetIndex: number) => {
    if (isBucketCheckpointExpEnabled() && propsRef.current.isFreeDraw) {
      invalidateHistoryCheckpointsAfter(targetIndex);
    }
    if (tailCheckpointRef.current.index > targetIndex) {
      invalidateCheckpoint('tail');
    }
    if (baseCheckpointRef.current.index > targetIndex) {
      invalidateCheckpoint('base');
    }
  };

  const isCommandHeavy = (cmd: any): boolean => {
    if (!cmd || !cmd.data) return false;
    if (cmd.data instanceof ArrayBuffer) {
      const byte0 = new Uint8Array(cmd.data)[0];
      return byte0 === 4 || byte0 === 5;
    }
    if (ArrayBuffer.isView(cmd.data)) {
      const byte0 = (cmd.data as Uint8Array)[0];
      return byte0 === 4 || byte0 === 5;
    }
    return false;
  };

  const isBucketCommand = (cmd: any): boolean => {
    if (!cmd) return false;
    if (cmd.event === 'draw_action' && (cmd.tool === 'bucket' || cmd.data?.tool === 'bucket')) return true;
    if (cmd.data) {
      let byte0 = 0;
      if (cmd.data instanceof ArrayBuffer) {
        byte0 = new Uint8Array(cmd.data)[0];
      } else if (ArrayBuffer.isView(cmd.data)) {
        byte0 = (cmd.data as Uint8Array)[0];
      } else if (Array.isArray(cmd.data)) {
        byte0 = cmd.data[0];
      }
      if (byte0 === 4) return true;
    }
    return false;
  };

  const countBucketsBeforeIndex = (commands: any[], k: number, lastClearIndex: number): number => {
    const start = lastClearIndex >= 0 ? lastClearIndex + 1 : 0;
    const end = Math.min(k, commands.length);
    let count = 0;
    for (let i = start; i < end; i++) {
      if (isBucketCommand(commands[i])) {
        count++;
      }
    }
    return count;
  };

  // 🛡️ Adaptive Checkpoint Pre-Bucket Capture (Free Draw Exp):
  // Captures the exact bitmap state of ctx BEFORE floodFill executes, at index `targetIndex`.
  const capturePreBucketCheckpoint = (targetIndex: number) => {
    if (!propsRef.current.isFreeDraw || !isBucketCheckpointExpEnabled()) return;
    const ctx = ctxRef.current;
    if (!ctx || !ctx.canvas) return;

    captureHistoryCheckpoint(targetIndex);

    const list = localCommandsRef.current;
    const lastClearIndex = findLatestClearIndex(list);
    if (targetIndex <= lastClearIndex) return;

    const priorBucketCount = countBucketsBeforeIndex(list, targetIndex, lastClearIndex);
    const baseValid = isCheckpointValid(baseCheckpointRef.current, list);

    // If there is no prior bucket since clear, base can hold the pre-bucket state at targetIndex.
    // If base is already holding an older bucket checkpoint, we do not overwrite base to preserve the older bucket.
    if (!baseValid || priorBucketCount === 0) {
      const bCanvas = ensureCheckpointCanvas('base');
      const bCtx = bCanvas.getContext('2d');
      if (bCtx) {
        bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
        bCtx.save();
        bCtx.setTransform(1, 0, 0, 1, 0, 0);
        bCtx.drawImage(ctx.canvas, 0, 0);
        bCtx.restore();
        baseCheckpointRef.current = {
          canvas: bCanvas,
          index: targetIndex,
          anchorSignature: targetIndex > 0 ? getCommandSignature(list[targetIndex - 1]) : "",
          lastClearIndex
        };
      }
    }
  };

  // 🛡️ Adaptive Checkpoint Post-Bucket Capture (Free Draw Exp):
  // Captures the exact bitmap state of ctx AFTER floodFill executes and the bucket command is pushed, at index `postIndex`.
  const advanceCheckpointBucketPost = (postIndex: number) => {
    if (!propsRef.current.isFreeDraw || !isBucketCheckpointExpEnabled()) {
      advanceCheckpointIncremental();
      return;
    }

    const ctx = ctxRef.current;
    if (!ctx || !ctx.canvas) return;

    captureHistoryCheckpoint(postIndex);

    const list = localCommandsRef.current;
    const lastClearIndex = findLatestClearIndex(list);
    if (postIndex <= lastClearIndex) return;

    const priorBucketCount = countBucketsBeforeIndex(list, postIndex - 1, lastClearIndex);
    const tailValid = isCheckpointValid(tailCheckpointRef.current, list);

    if (priorBucketCount > 0 && tailValid && tailCheckpointRef.current.index < postIndex) {
      // Rotate tail to base so base protects the previous bucket
      const bCanvas = ensureCheckpointCanvas('base');
      const bCtx = bCanvas.getContext('2d');
      if (bCtx && tailCheckpointRef.current.canvas) {
        bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
        bCtx.save();
        bCtx.setTransform(1, 0, 0, 1, 0, 0);
        bCtx.drawImage(tailCheckpointRef.current.canvas, 0, 0);
        bCtx.restore();
        baseCheckpointRef.current = {
          canvas: bCanvas,
          index: tailCheckpointRef.current.index,
          anchorSignature: tailCheckpointRef.current.anchorSignature,
          lastClearIndex: tailCheckpointRef.current.lastClearIndex
        };
      }
    }

    // Capture post-bucket into tail at postIndex
    const tCanvas = ensureCheckpointCanvas('tail');
    const tCtx = tCanvas.getContext('2d');
    if (tCtx) {
      tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
      tCtx.save();
      tCtx.setTransform(1, 0, 0, 1, 0, 0);
      tCtx.drawImage(ctx.canvas, 0, 0);
      tCtx.restore();
      tailCheckpointRef.current = {
        canvas: tCanvas,
        index: postIndex,
        anchorSignature: getCommandSignature(list[postIndex - 1]),
        lastClearIndex
      };
    }

    const baseValid = isCheckpointValid(baseCheckpointRef.current, list);
    if (baseValid && baseCheckpointRef.current.index > tailCheckpointRef.current.index) {
      const temp = baseCheckpointRef.current;
      baseCheckpointRef.current = tailCheckpointRef.current;
      tailCheckpointRef.current = temp;
    }
  };

  const advanceCheckpointIncremental = () => {
    if (!propsRef.current.isFreeDraw && !propsRef.current.isExperimental) return;
    const list = localCommandsRef.current;
    const N = list.length;
    const STRIDE = 8;

    const ctx = ctxRef.current;
    if (!ctx || !ctx.canvas) return;

    const lastClearIndex = findLatestClearIndex(list);
    const activeStart = lastClearIndex >= 0 ? lastClearIndex + 1 : 0;

    // 🛡️ Adaptive Checkpoint Stride Adjustment (when experimental flag is enabled in Free Draw)
    if (isBucketCheckpointExpEnabled() && propsRef.current.isFreeDraw) {
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

        const baseValid = isCheckpointValid(baseCheckpointRef.current, list);
        const tailValid = isCheckpointValid(tailCheckpointRef.current, list);

        if (tailValid && tailCheckpointRef.current.index === N) return;
        if (baseValid && baseCheckpointRef.current.index === N) return;

        // If tail is currently holding the postBucket checkpoint, promote it to base to preserve bucket protection:
        if (tailValid && tailCheckpointRef.current.index === postBucketIdx) {
          const bCanvas = ensureCheckpointCanvas('base');
          const bCtx = bCanvas.getContext('2d');
          if (bCtx && tailCheckpointRef.current.canvas) {
            bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
            bCtx.save();
            bCtx.setTransform(1, 0, 0, 1, 0, 0);
            bCtx.drawImage(tailCheckpointRef.current.canvas, 0, 0);
            bCtx.restore();
            baseCheckpointRef.current = {
              canvas: bCanvas,
              index: tailCheckpointRef.current.index,
              anchorSignature: tailCheckpointRef.current.anchorSignature,
              lastClearIndex: tailCheckpointRef.current.lastClearIndex
            };
          }
        }

        // Capture new stride snapshot into tail at N:
        const tCanvas = ensureCheckpointCanvas('tail');
        const tCtx = tCanvas.getContext('2d');
        if (tCtx) {
          tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
          tCtx.save();
          tCtx.setTransform(1, 0, 0, 1, 0, 0);
          tCtx.drawImage(ctx.canvas, 0, 0);
          tCtx.restore();
          tailCheckpointRef.current = {
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

    const baseValid = isCheckpointValid(baseCheckpointRef.current, list);
    const tailValid = isCheckpointValid(tailCheckpointRef.current, list);

    if (tailValid && tailCheckpointRef.current.index === N) return;
    if (baseValid && baseCheckpointRef.current.index === N) return;

    // Normalize order: Base should hold earlier index, Tail later index
    if (baseValid && tailValid && baseCheckpointRef.current.index > tailCheckpointRef.current.index) {
      const temp = baseCheckpointRef.current;
      baseCheckpointRef.current = tailCheckpointRef.current;
      tailCheckpointRef.current = temp;
    }

    if (!baseValid) {
      // Slot 1: Base is empty or invalidated, capture into Base
      const bCanvas = ensureCheckpointCanvas('base');
      const bCtx = bCanvas.getContext('2d');
      if (bCtx) {
        bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
        bCtx.save();
        bCtx.setTransform(1, 0, 0, 1, 0, 0);
        bCtx.drawImage(ctx.canvas, 0, 0);
        bCtx.restore();
        baseCheckpointRef.current = {
          canvas: bCanvas,
          index: N,
          anchorSignature: getCommandSignature(list[N - 1]),
          lastClearIndex
        };
      }
      if (tailValid && baseCheckpointRef.current.index > tailCheckpointRef.current.index) {
        const temp = baseCheckpointRef.current;
        baseCheckpointRef.current = tailCheckpointRef.current;
        tailCheckpointRef.current = temp;
      }
    } else if (!tailValid) {
      // Slot 2: Base is valid, Tail is empty or invalidated, capture into Tail
      const tCanvas = ensureCheckpointCanvas('tail');
      const tCtx = tCanvas.getContext('2d');
      if (tCtx) {
        tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
        tCtx.save();
        tCtx.setTransform(1, 0, 0, 1, 0, 0);
        tCtx.drawImage(ctx.canvas, 0, 0);
        tCtx.restore();
        tailCheckpointRef.current = {
          canvas: tCanvas,
          index: N,
          anchorSignature: getCommandSignature(list[N - 1]),
          lastClearIndex
        };
      }
    } else {
      // Both Base and Tail are valid: rotate snapshots
      // Recycle the older Base canvas for the new head checkpoint at index N
      const recycledCanvas = ensureCheckpointCanvas('base');
      const rCtx = recycledCanvas.getContext('2d');
      if (rCtx) {
        rCtx.clearRect(0, 0, recycledCanvas.width, recycledCanvas.height);
        rCtx.save();
        rCtx.setTransform(1, 0, 0, 1, 0, 0);
        rCtx.drawImage(ctx.canvas, 0, 0);
        rCtx.restore();

        // Previous Tail becomes the older checkpoint (Base)
        baseCheckpointRef.current = {
          canvas: tailCheckpointRef.current.canvas,
          index: tailCheckpointRef.current.index,
          anchorSignature: tailCheckpointRef.current.anchorSignature,
          lastClearIndex: tailCheckpointRef.current.lastClearIndex
        };

        // Recycled canvas becomes the newer checkpoint (Tail)
        tailCheckpointRef.current = {
          canvas: recycledCanvas,
          index: N,
          anchorSignature: getCommandSignature(list[N - 1]),
          lastClearIndex
        };
      }
    }
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
  const propsRef = useRef({ tool, color, thickness, opacity, readOnly, isFreeDraw, isExperimental, showFloatingNames, enableInputOptimizations, enableBitmapUndoCache, enableFixedDPR, enableCanvasAlpha, enableDestinationOutEraser });
  propsRef.current = { tool, color, thickness, opacity, readOnly, isFreeDraw, isExperimental, showFloatingNames, enableInputOptimizations, enableBitmapUndoCache, enableFixedDPR, enableCanvasAlpha, enableDestinationOutEraser };
  useEffect(() => {
    propsRef.current = { tool, color, thickness, opacity, readOnly, isFreeDraw, isExperimental, showFloatingNames, enableInputOptimizations, enableBitmapUndoCache, enableFixedDPR, enableCanvasAlpha, enableDestinationOutEraser };
  }, [tool, color, thickness, opacity, readOnly, isFreeDraw, isExperimental, showFloatingNames, enableInputOptimizations, enableBitmapUndoCache, enableFixedDPR, enableCanvasAlpha, enableDestinationOutEraser]);

  const applyTransformRef = useRef<(overrideBaseScale?: number) => void>(() => {});
  applyTransformRef.current = (overrideBaseScale?: number) => {
    if (transformWrapperRef.current) {
      if (propsRef.current.readOnly) {
        transformWrapperRef.current.style.transform = 'none';
        if (floatingLabelsLayerRef.current) {
          const currentBaseScale = overrideBaseScale !== undefined ? overrideBaseScale : baseScaleRef.current;
          const { x, y } = transformRef.current;
          floatingLabelsLayerRef.current.style.left = `${x}px`;
          floatingLabelsLayerRef.current.style.top = `${y}px`;
          floatingLabelsLayerRef.current.style.transform = `scale(${currentBaseScale})`;
          floatingLabelsLayerRef.current.style.transformOrigin = '0 0';
        }
        return;
      }
      const { x, y, scale } = transformRef.current;
      const currentBaseScale = overrideBaseScale !== undefined ? overrideBaseScale : baseScaleRef.current;
      transformWrapperRef.current.style.transform = `translate(${x}px, ${y}px) scale(${currentBaseScale * scale})`;
      if (floatingLabelsLayerRef.current) {
        floatingLabelsLayerRef.current.style.left = '0px';
        floatingLabelsLayerRef.current.style.top = '0px';
        floatingLabelsLayerRef.current.style.transform = 'none';
      }
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
      checkAndTriggerInitialSyncRef.current?.();
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

      if ((event === 'draw_move' || event === 'draw_move_compressed') && socket.volatile) {
        socket.volatile.emit('draw_binary', msg);
      } else {
        socket.emit('draw_binary', msg);
      }

      // Record local durable drawing history for deterministic undo / redo
      if (event === 'draw_stroke' || (event === 'draw_action' && payload.tool === 'bucket')) {
        prevCommandsCountRef.current = localCommandsRef.current.length;
        const cmdRecord: any = {
          event: 'draw_binary',
          data: msg,
          instanceId,
          strokeId: payload.strokeId || currentLocalStrokeIdRef.current
        };
        if (event === 'draw_action' && payload.tool === 'bucket' && lastBucketHintRef.current) {
          cmdRecord._replayHint = lastBucketHintRef.current.hint;
          cmdRecord._replayColor = lastBucketHintRef.current.color;
          cmdRecord._replayOpacity = lastBucketHintRef.current.opacity;
          lastBucketHintRef.current = null;
        }
        localCommandsRef.current.push(cmdRecord);
        if (event === 'draw_action' && payload.tool === 'bucket' && isBucketCheckpointExpEnabled() && propsRef.current.isFreeDraw) {
          advanceCheckpointBucketPost(localCommandsRef.current.length);
        } else {
          advanceCheckpointIncremental();
        }
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
        const isSingleSource = Boolean(propsRef.current.isFreeDraw || propsRef.current.isExperimental);

        if (isSingleSource && canonicalStrokeRef.current.length > 0) {
          drawEntirePath(tempCtx, canonicalStrokeRef.current, activeTool, activeColor, activeWidth, activeOpacity);
        } else if (currentPathRef.current.length > 0) {
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

    drainingStrokesRef.current.forEach((stroke) => {
      if (stroke && stroke.path && stroke.path.length > 0) {
        drawEntirePath(tempCtx, stroke.path, stroke.tool, stroke.color, stroke.width, stroke.opacity);
      }
    });

    // 🌟 Update minimal floating drawing names in Free Draw
    updateFloatingLabels();
  };

  const redrawTempLayer = () => {
    if (redrawRequestedRef.current) return;
    redrawRequestedRef.current = true;
    requestAnimationFrame(() => {
      redrawRequestedRef.current = false;
      executeRedrawTempLayer();
    });
  };

  // ⚡ Atomic Remote Stroke Handover Helper
  // Executes the handover from temporary canvas to permanent primary canvas atomically within
  // the current animation frame: draws authoritative final on main, updates temporary state,
  // and synchronously rebuilds remaining temp strokes before the browser paints.
  const commitRemoteStrokeAtomically = (
    instId: string,
    strId: number,
    tool: ToolType,
    color: string,
    width: number,
    opacity: number,
    path: { x: number; y: number }[],
    rawPoints?: { x: number; y: number }[],
    cleanupTemporaryState?: () => void
  ) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    if (path.length > 0) {
      captureDirectFreeDrawUndoCache(instId, strId);
      drawEntirePath(ctx, path, tool, color, width, opacity);

      // Record in localCommands history for viewer-side deterministic undo/redo sync
      const canonicalStrokeMsg = encodeBinaryDrawMessage('draw_stroke', {
        instanceId: instId,
        tool,
        color,
        width,
        opacity,
        points: rawPoints || []
      });
      prevCommandsCountRef.current = localCommandsRef.current.length;
      localCommandsRef.current.push({
        event: 'draw_binary',
        data: canonicalStrokeMsg,
        instanceId: instId,
        strokeId: strId
      });
      advanceCheckpointIncremental();
      if (!propsRef.current.isFreeDraw) {
        localRedoStackRef.current = [];
      }
      saveSnapshot();
      syncHistoryButtons();
    }

    if (cleanupTemporaryState) {
      cleanupTemporaryState();
    } else {
      delete activeSessionsRef.current[instId];
      drainingStrokesRef.current = drainingStrokesRef.current.filter(
        s => !(s.instanceId === instId && (strId === undefined || s.strokeId === strId))
      );
    }

    // Synchronously clear & rebuild the temp layer for remaining active strokes within the same frame
    executeRedrawTempLayer();
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
        const completedDraining: DrainingStroke[] = [];

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
            completedDraining.push(stroke);
          }
        }

        drainingStrokesRef.current = remainingDraining;

        // Atomically commit completed strokes to primary canvas within this rAF
        for (let i = 0; i < completedDraining.length; i++) {
          const stroke = completedDraining[i];
          commitRemoteStrokeAtomically(
            stroke.instanceId,
            stroke.strokeId,
            stroke.tool,
            stroke.color,
            stroke.width,
            stroke.opacity,
            stroke.path,
            stroke.rawPoints,
            () => {
              delete activeSessionsRef.current[stroke.instanceId];
              drainingStrokesRef.current = drainingStrokesRef.current.filter(
                s => !(s.instanceId === stroke.instanceId && s.strokeId === stroke.strokeId)
              );
            }
          );
        }
      }

      // Synchronously clear & redraw temp layer within this exact animation frame!
      executeRedrawTempLayer();

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
          captureDirectFreeDrawUndoCache(stroke.instanceId, stroke.strokeId);
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
      executeRedrawTempLayer();
      saveSnapshot();
      syncHistoryButtons();
    }
  };

  // 🛡️ Remote Bucket Raster/History Transaction Barrier (Free Draw only)
  // Flushes only already-committed strokes currently residing in drainingStrokesRef,
  // ensuring primary ctx and localCommandsRef are 100% causal and synchronized BEFORE Bucket captures cache or runs floodFill.
  // Strictly DOES NOT touch or prematurely commit uncommitted activeSessionsRef.
  const flushCommittedDrainingStrokesBarrier = (): number => {
    const ctx = ctxRef.current;
    if (!ctx || drainingStrokesRef.current.length === 0) {
      return 0;
    }

    const strokesToFlush = [...drainingStrokesRef.current];
    drainingStrokesRef.current = [];
    let flushedCount = 0;

    for (let i = 0; i < strokesToFlush.length; i++) {
      const stroke = strokesToFlush[i];
      if (stroke.pendingQueue && stroke.pendingQueue.length > 0) {
        while (stroke.pendingQueue.length > 0) {
          stroke.path.push(stroke.pendingQueue.shift()!);
        }
      }

      if (stroke.path.length > 0) {
        const alreadyInHistory = localCommandsRef.current.some(
          (cmd: any) => cmd && cmd.instanceId === stroke.instanceId && cmd.strokeId === stroke.strokeId
        );

        if (!alreadyInHistory) {
          captureDirectFreeDrawUndoCache(stroke.instanceId, stroke.strokeId);
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
          advanceCheckpointIncremental();
          if (!propsRef.current.isFreeDraw) {
            localRedoStackRef.current = [];
          }
          saveSnapshot();
          syncHistoryButtons();
          flushedCount++;
        }
      }

      if (activeSessionsRef.current[stroke.instanceId] && activeSessionsRef.current[stroke.instanceId].strokeId === stroke.strokeId) {
        delete activeSessionsRef.current[stroke.instanceId];
      }
    }

    executeRedrawTempLayer();

    if (spectatorPlaybackRafRef.current !== null && drainingStrokesRef.current.length === 0) {
      const sessions = activeSessionsRef.current;
      const hasUncommittedPending = Object.keys(sessions).some(k => sessions[k]?.pendingQueue?.length > 0);
      if (!hasUncommittedPending) {
        cancelAnimationFrame(spectatorPlaybackRafRef.current);
        spectatorPlaybackRafRef.current = null;
      }
    }

    return flushedCount;
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
    clearFloatingLabels();
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

  const applyClearEpoch = (rawBuf?: any) => {
    const ctx = ctxRef.current;
    const tempCtx = tempCtxRef.current;

    // 1. Invalidate Base & Tail checkpoints and all Undo/Redo caches
    invalidateCheckpoint('all');
    invalidateFreeDrawCaches();

    // 2. Discard and cancel any pending in-flight drawing sessions & spectator animations
    if (spectatorPlaybackRafRef.current !== null) {
      cancelAnimationFrame(spectatorPlaybackRafRef.current);
      spectatorPlaybackRafRef.current = null;
    }
    drainingStrokesRef.current = [];
    activeSessionsRef.current = {};
    clearFloatingLabels();

    isDrawingRef.current = false;
    currentPathRef.current = [];
    moveBatchRef.current = [];
    networkStrokePointsRef.current = [];
    activePointerIdRef.current = null;
    exitedOutsideWhilePointerDownRef.current = false;
    lastOutsidePointerRef.current = null;

    if (throttleTimeoutRef.current) {
      clearTimeout(throttleTimeoutRef.current);
      throttleTimeoutRef.current = null;
    }
    if (bucketTimeoutRef.current) {
      clearTimeout(bucketTimeoutRef.current);
      bucketTimeoutRef.current = null;
    }
    preventBucketRef.current = false;

    // 3. Reset canvas backing stores (physical framebuffers)
    if (ctx && tempCtx) {
      resetCanvasBackingStores(ctx, tempCtx);
    }

    // 4. Reset history to retain at most one non-undoable Clear marker without synthetic strokeId
    const clearData = rawBuf || encodeBinaryDrawMessage('draw_clear', {});
    localCommandsRef.current = [{
      event: 'draw_binary',
      data: clearData
    }];
    localRedoStackRef.current = [];
    prevCommandsCountRef.current = 0;

    // 5. Update history buttons
    syncHistoryButtons();
  };

  const executeClear = (emit: boolean = true) => {
    if (isResetPendingRef.current) {
      flushPendingReset();
    }

    let msg: ArrayBuffer | null = null;
    if (emit) {
      msg = encodeBinaryDrawMessage('draw_clear', {});
      if (socket?.connected && msg) {
        socket.emit('draw_binary', msg);
      }
    }

    applyClearEpoch(msg || undefined);
    saveSnapshot();
  };

  const syncHistoryButtons = () => {
    const list = localCommandsRef.current;
    let canUndo = false;
    if (propsRef.current.isFreeDraw || propsRef.current.isExperimental) {
      canUndo = list.some(cmd => {
        if (!cmd || isClearCommand(cmd)) return false;
        const cmdInstId = cmd.instanceId || (cmd.data && typeof cmd.data === 'object' ? cmd.data.instanceId : undefined);
        return cmdInstId === instanceId && cmd.strokeId !== undefined;
      });
    } else {
      const lastCmd = list.length > 0 ? list[list.length - 1] : null;
      canUndo = list.length > 0 && !isClearCommand(lastCmd) && localRedoStackRef.current.length === 0;
    }
    const canRedo = localRedoStackRef.current.length > 0;
    const index = canUndo ? 1 : 0;
    const length = index + (canRedo ? 1 : 0) + 1;
    onHistoryStateChange?.(index, length);
  };

  // ⚡ Fast-Path Undo Helper: Restores pre-target bitmap directly and replays ONLY subsequent commands (if any),
  // completely bypassing full historical replay and eliminating redundant floodFill executions.
  const tryFastPathUndo = (
    targetInst: string,
    targetStrId: number,
    targetIndex: number,
    list: any[],
    diag?: UndoDiagnostics | null
  ): boolean => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) {
      if (diag) { diag.fastPath = 'miss'; diag.fastPathMissReason = 'missing_canvas_or_context'; }
      return false;
    }

    // 1. Verify single-step cache exists
    if (!hasFreeDrawUndoCacheRef.current || !freeDrawUndoCacheCanvasRef.current) {
      if (diag) { diag.fastPath = 'miss'; diag.fastPathMissReason = 'missing_cache'; }
      return false;
    }
    const meta = freeDrawUndoCacheMetaRef.current;
    if (!meta) {
      if (diag) { diag.fastPath = 'miss'; diag.fastPathMissReason = 'missing_metadata'; }
      return false;
    }

    // 2. Strict Metadata & Chain Integrity Verification:
    // Ensure the cache was captured specifically for this target command at its exact historical offset
    if (meta.targetInstanceId !== targetInst || meta.targetStrokeId !== targetStrId) {
      if (diag) { diag.fastPath = 'miss'; diag.fastPathMissReason = 'target_mismatch'; }
      return false;
    }
    if (meta.baseHistoryLength !== targetIndex) {
      if (diag) { diag.fastPath = 'miss'; diag.fastPathMissReason = 'base_history_length_mismatch'; }
      return false;
    }

    if (targetIndex > 0) {
      const prevCmd = list[targetIndex - 1];
      if (getCommandSignature(prevCmd) !== meta.prevAnchorSignature) {
        if (diag) { diag.fastPath = 'miss'; diag.fastPathMissReason = 'anchor_mismatch'; }
        return false;
      }
    }
    const targetCmd = list[targetIndex];
    if (getCommandSignature(targetCmd) !== `${targetInst}_${targetStrId}`) {
      if (diag) { diag.fastPath = 'miss'; diag.fastPathMissReason = 'command_signature_mismatch'; }
      return false;
    }

    // 3. Pre-flight Cache Restoration (Non-destructive check & restore):
    // MUST succeed before mutating list or redo stack to prevent double-removal on failure
    const restored = restoreCanvasFromCache(freeDrawUndoCacheCanvasRef.current, canvas);
    if (!restored) {
      if (diag) { diag.fastPath = 'miss'; diag.fastPathMissReason = 'bitmap_restoration_failure'; }
      return false;
    }

    // 4. Fast-Path is 100% VALID: Commit state modifications only AFTER restoration succeeds
    if (diag) { diag.fastPath = 'hit'; }
    invalidateCheckpointsAfterIndex(targetIndex);

    if (diag) {
      diag.baseIndexAfter = baseCheckpointRef.current.index;
      diag.tailIndexAfter = tailCheckpointRef.current.index;
      diag.baseValidAfter = isCheckpointValid(baseCheckpointRef.current, list);
      diag.tailValidAfter = isCheckpointValid(tailCheckpointRef.current, list);
    }

    // Remove target command from list
    const [removedCmd] = list.splice(targetIndex, 1);
    if (removedCmd && targetInst === instanceId) {
      localRedoStackRef.current.push(removedCmd);
    }

    if (tempCtxRef.current) {
      tempCtxRef.current.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
    }

    // 5. Replay ONLY commands that occurred after target (if any)
    if (targetIndex < list.length) {
      isReplayingRef.current = true;
      const replayPaths: Record<string, { x: number; y: number }[]> = {};
      const replaySessions: Record<string, { tool: ToolType; color: string; width: number; opacity: number }> = {};

      if (diag) {
        diag.replayStartIndex = targetIndex;
      }

      for (let i = targetIndex; i < list.length; i++) {
        if (diag) {
          diag.commandsReplayed++;
          const cmd = list[i];
          if (isCommandHeavy(cmd) || (cmd && cmd.data)) {
            const dec = decodeBinaryDrawMessage(cmd.data);
            if (dec && dec.event === 'draw_action' && dec.data?.tool === 'bucket') {
              diag.bucketCommandsEncountered++;
            }
          }
          if (list[i]?._replayHint) {
            diag.hints.existedBefore++;
          }
        }
        applyReplayCommand(ctx, list[i], replayPaths, replaySessions, diag);
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
              drawShape(ctx, startPt.x, startPt.y, lastPt.x, lastPt.y, session.tool, session.color, session.width, session.opacity);
            } else {
              drawEntirePath(ctx, path, session.tool, session.color, session.width, session.opacity);
            }
          }
        } catch (itemErr) {
          // Ignore
        }
      });
      isReplayingRef.current = false;
    }

    // 6. Invalidate single-step cache once consumed
    hasFreeDrawUndoCacheRef.current = false;
    hasFreeDrawRedoCacheRef.current = false;
    freeDrawUndoCacheMetaRef.current = null;

    saveSnapshot();
    syncHistoryButtons();
    return true;
  };

  const executeUndo = (emit: boolean = true) => {
    // 🛡️ Single-Flight Undo Guard: Prevent double-undo on rapid presses or queued touch events
    if (undoInProgressRef.current) {
      return;
    }
    undoInProgressRef.current = true;

    try {
      if (isResetPendingRef.current) {
        flushPendingReset();
      }
      const list = localCommandsRef.current;

      // 🎯 Free Draw & Experimental: Per-User Undo (Exact Target Identification)
      // Searches backwards for the last completed stroke belonging to THIS player only (using their instanceId)
      // and extracts its strokeId. Strictly NO-OP if no stroke belongs to this player.
      if (propsRef.current.isFreeDraw || propsRef.current.isExperimental) {
        let targetIndex = -1;
        let targetStrokeId: number | undefined;

        for (let i = list.length - 1; i >= 0; i--) {
          const cmd = list[i];
          if (cmd && !isClearCommand(cmd)) {
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

        // 1. Filter local draining queue if present:
        const beforeDrainingCount = drainingStrokesRef.current.length;
        drainingStrokesRef.current = drainingStrokesRef.current.filter(
          s => !(s.instanceId === instanceId && s.strokeId === targetStrokeId)
        );
        if (drainingStrokesRef.current.length !== beforeDrainingCount) {
          redrawTempLayer();
        }

        // 2. Try Fast-Path Bitmap Undo:
        const listLengthBefore = list.length;
        const opId = Math.random().toString(36).substring(2, 9);
        const startTime = isDiagEnabled() ? performance.now() : 0;

        const diag: UndoDiagnostics | null = isDiagEnabled() ? {
          opId,
          type: 'local_undo',
          historyLengthBefore: listLengthBefore,
          targetInstanceId: instanceId,
          targetStrokeId: targetStrokeId,
          targetIndex,
          targetDistanceFromEnd: listLengthBefore - 1 - targetIndex,
          fastPath: 'na',
          fastPathMissReason: null,
          baseIndexBefore: baseCheckpointRef.current.index,
          tailIndexBefore: tailCheckpointRef.current.index,
          baseValidBefore: isCheckpointValid(baseCheckpointRef.current, list),
          tailValidBefore: isCheckpointValid(tailCheckpointRef.current, list),
          baseIndexAfter: 0,
          tailIndexAfter: 0,
          baseValidAfter: false,
          tailValidAfter: false,
          replayStartIndex: 0,
          commandsReplayed: 0,
          bucketCommandsEncountered: 0,
          floodFillExecutions: 0,
          cumulativeFillDurationMs: 0,
          maxFillDurationMs: 0,
          totalSyncDurationMs: 0,
          hints: { existedBefore: 0, discarded: 0, usedShortcut: 0, forcedFill: 0 },
          checkpointFacts: { stride: 8, retainedCanvases: 2, invalidationReason: null, bucketThresholdActive: false }
        } : null;

        const fastPathSucceeded = tryFastPathUndo(instanceId, targetStrokeId, targetIndex, list, diag);

        if (!fastPathSucceeded) {
          // 🛡️ Double-Removal Guard: If list length changed unexpectedly, do not splice again
          if (list.length !== listLengthBefore) {
            hasFreeDrawUndoCacheRef.current = false;
            hasFreeDrawRedoCacheRef.current = false;
            freeDrawUndoCacheMetaRef.current = null;
            replayFreeDrawHistorySafely(list, diag);
          } else {
            // Fallback: Safe Mid-History Replay
            invalidateCheckpointsAfterIndex(targetIndex);
            const [removedCmd] = list.splice(targetIndex, 1);
            if (removedCmd) {
              localRedoStackRef.current.push(removedCmd);
            }
            // 🛡️ Guard Hint validity on Mid-History Undo:
            // Invalidate hints of subsequent commands whose historical predecessor canvas has mutated
            if (targetIndex < list.length) {
              for (let i = targetIndex; i < list.length; i++) {
                if (list[i]?._replayHint) {
                  delete list[i]._replayHint;
                  delete list[i]._replayColor;
                  delete list[i]._replayOpacity;
                }
              }
            }
            hasFreeDrawUndoCacheRef.current = false;
            hasFreeDrawRedoCacheRef.current = false;
            freeDrawUndoCacheMetaRef.current = null;
            replayFreeDrawHistorySafely(list, diag);
          }
        }

        if (diag) {
          diag.totalSyncDurationMs = performance.now() - startTime;
          console.log("[FREE_DRAW_UNDO_DIAG]", JSON.stringify(diag));
        }

        // 3. Send authoritative draw_undo to server for room broadcast:
        if (emit) {
          emitDrawCommand('draw_undo', { strokeId: targetStrokeId });
        }
        return;
      }

      // Normal / Competitive Rooms: Keep existing global undo behavior intact
      const lastCmd = list.length > 0 ? list[list.length - 1] : null;
      const canUndo = list.length > 0 && !isClearCommand(lastCmd) && localRedoStackRef.current.length === 0;
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
    } finally {
      // Release lock on next frame to absorb any queued duplicate taps from same gesture
      requestAnimationFrame(() => {
        undoInProgressRef.current = false;
      });
    }
  };

  const executeRedo = (emit: boolean = true) => {
    if (isResetPendingRef.current) {
      flushPendingReset();
    }
    const canRedo = localRedoStackRef.current.length > 0;
    if (!canRedo) return;

    // 🎯 Free Draw & Experimental Branch: Collaborative Redo
    if (propsRef.current.isFreeDraw || propsRef.current.isExperimental) {
      const redoStartTime = isDiagEnabled() ? performance.now() : 0;
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

        // 1. Capture single-step Undo bitmap cache before applying the redone command
        captureDirectFreeDrawUndoCache(instanceId, newStrokeId);

        if (decoded.event === 'draw_action' && isBucketCheckpointExpEnabled() && propsRef.current.isFreeDraw) {
          captureHistoryCheckpoint(localCommandsRef.current.length);
        }

        const newCmdRecord = {
          event: 'draw_binary',
          data: newMsg,
          instanceId,
          strokeId: newStrokeId
        };
        localCommandsRef.current.push(newCmdRecord);

        // 2. Apply ONLY the redone command incrementally without full history rebuild
        const ctx = ctxRef.current;
        if (ctx) {
          isReplayingRef.current = true;
          const replayPaths: Record<string, { x: number; y: number }[]> = {};
          const replaySessions: Record<string, { tool: ToolType; color: string; width: number; opacity: number }> = {};
          applyReplayCommand(ctx, newCmdRecord, replayPaths, replaySessions);
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
            } catch (err) {}
          });
          isReplayingRef.current = false;
        }

        hasFreeDrawUndoCacheRef.current = true;
        hasFreeDrawRedoCacheRef.current = false;

        if (isBucketCheckpointExpEnabled() && propsRef.current.isFreeDraw) {
          if (decoded.event === 'draw_action') {
            advanceCheckpointBucketPost(localCommandsRef.current.length);
          } else {
            advanceCheckpointIncremental();
          }
        } else {
          advanceCheckpointIncremental();
        }
        syncHistoryButtons();
        saveSnapshot();

        if (emit && socket?.connected) {
          socket.emit('draw_binary', newMsg);
        }

        if (isDiagEnabled()) {
          const redoDuration = performance.now() - redoStartTime;
          console.log("[FREE_DRAW_REDO_DIAG]", JSON.stringify({
            opId: Math.random().toString(36).substring(2, 9),
            type: 'local_redo',
            historyLengthBefore: localCommandsRef.current.length - 1,
            redoDurationMs: Math.round(redoDuration * 100) / 100,
            checkpointCount: historyCheckpointsRef.current.length,
            isBucket: decoded.event === 'draw_action'
          }));
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
    replaySessions: Record<string, { tool: ToolType; color: string; width: number; opacity: number }>,
    diag?: UndoDiagnostics | null
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
          if (cmdObj && cmdObj._replayHint === 'full_canvas_opaque' && (cmdOpacity === undefined || cmdOpacity >= 0.95)) {
            if (diag) diag.hints.usedShortcut++;
            const fillHex = cmdObj._replayColor || cmdColor;
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = fillHex;
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.restore();
          } else if (cmdObj && cmdObj._replayHint === 'noop') {
            if (diag) diag.hints.usedShortcut++;
            // 🛡️ Verified No-Op check: test 1x1 candidate seed pixel
            let isVerifiedNoOp = false;
            try {
              const cw = ctx.canvas.width;
              const ch = ctx.canvas.height;
              const sx = Math.floor(data.x * cw);
              const sy = Math.floor(data.y * ch);
              if (sx >= 0 && sx < cw && sy >= 0 && sy < ch) {
                const p = ctx.getImageData(sx, sy, 1, 1).data;
                let fillHex = cmdColor;
                if (fillHex.length === 4) {
                  fillHex = '#' + fillHex[1] + fillHex[1] + fillHex[2] + fillHex[2] + fillHex[3] + fillHex[3];
                }
                const fr = parseInt(fillHex.slice(1, 3), 16) || 0;
                const fg = parseInt(fillHex.slice(3, 5), 16) || 0;
                const fb = parseInt(fillHex.slice(5, 7), 16) || 0;
                if (p[3] >= 240 && (cmdOpacity === undefined || cmdOpacity >= 0.95) &&
                    Math.abs(p[0] - fr) <= 5 && Math.abs(p[1] - fg) <= 5 && Math.abs(p[2] - fb) <= 5) {
                  isVerifiedNoOp = true;
                }
              }
            } catch (pErr) {
              isVerifiedNoOp = false;
            }

            if (!isVerifiedNoOp) {
              if (diag) {
                diag.hints.forcedFill++;
                if (cmdObj?._replayHint) diag.hints.discarded++;
              }
              const fillStart = diag ? performance.now() : 0;
              const fillRes = floodFill(ctx, data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT, cmdColor, cmdOpacity, LOGICAL_WIDTH, LOGICAL_HEIGHT, data.targetRGBA);
              if (diag) {
                diag.floodFillExecutions++;
                const dur = performance.now() - fillStart;
                diag.cumulativeFillDurationMs += dur;
                if (dur > diag.maxFillDurationMs) diag.maxFillDurationMs = dur;
              }
              if (cmdObj) {
                if (fillRes?.isFullCanvasOpaque) {
                  cmdObj._replayHint = 'full_canvas_opaque';
                  cmdObj._replayColor = fillRes.fillHex || cmdColor;
                  cmdObj._replayOpacity = cmdOpacity;
                } else if (fillRes?.isNoOp) {
                  cmdObj._replayHint = 'noop';
                } else {
                  delete cmdObj._replayHint;
                  delete cmdObj._replayColor;
                  delete cmdObj._replayOpacity;
                }
              }
            }
          } else {
            if (diag) {
              diag.hints.forcedFill++;
              if (cmdObj?._replayHint) diag.hints.discarded++;
            }
            const fillStart = diag ? performance.now() : 0;
            const fillRes = floodFill(ctx, data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT, cmdColor, cmdOpacity, LOGICAL_WIDTH, LOGICAL_HEIGHT, data.targetRGBA);
            if (diag) {
              diag.floodFillExecutions++;
              const dur = performance.now() - fillStart;
              diag.cumulativeFillDurationMs += dur;
              if (dur > diag.maxFillDurationMs) diag.maxFillDurationMs = dur;
            }
            if (cmdObj) {
              if (fillRes?.isFullCanvasOpaque) {
                cmdObj._replayHint = 'full_canvas_opaque';
                cmdObj._replayColor = fillRes.fillHex || cmdColor;
                cmdObj._replayOpacity = cmdOpacity;
              } else if (fillRes?.isNoOp) {
                cmdObj._replayHint = 'noop';
              } else {
                delete cmdObj._replayHint;
                delete cmdObj._replayColor;
                delete cmdObj._replayOpacity;
              }
            }
          }
          saveSnapshot();
        }
      } else if (event === 'draw_undo') {
        if (!propsRef.current.isFreeDraw && !propsRef.current.isExperimental) {
          executeUndo(false);
        }
      } else if (event === 'draw_redo') {
        if (!propsRef.current.isFreeDraw && !propsRef.current.isExperimental) {
          executeRedo(false);
        }
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

      invalidateCheckpoint('all');

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
      clearFloatingLabels();
    } catch (totalSyncErr) {
      console.error("[DrawingCanvasCore] Failed to reconstruct whole history accurately: ", totalSyncErr);
    } finally {
      // Deactivate replaying and save the final integrated snapshot
      isReplayingRef.current = false;
      saveSnapshot();
      syncHistoryButtons();
      if (propsRef.current.isFreeDraw || propsRef.current.isExperimental) {
        advanceCheckpointIncremental();
      }
    }
  };

  // 🛡️ Safe Mid-History Replay for Free Draw Per-User Undo:
  // Clears and reconstructs ONLY the committed base canvas (ctx).
  // Strictly PRESERVES tempCtx, activeSessionsRef, and drainingStrokesRef so ongoing live drawing is never interrupted.
  const replayFreeDrawHistorySafely = (commands: any[], diag?: UndoDiagnostics | null) => {
    const startTime = diag ? performance.now() : 0;
    try {
      const ctx = ctxRef.current;
      if (!ctx) return;

      const N = commands.length;
      let startIndex = 0;
      const lastClearIndex = findLatestClearIndex(commands);

      if (diag) {
        diag.baseIndexBefore = baseCheckpointRef.current.index;
        diag.tailIndexBefore = tailCheckpointRef.current.index;
        diag.baseValidBefore = isCheckpointValid(baseCheckpointRef.current, commands);
        diag.tailValidBefore = isCheckpointValid(tailCheckpointRef.current, commands);
      }

      // Best valid checkpoint strictly <= N
      const bestCp = getBestCheckpoint(commands, N);

      if (diag) {
        diag.checkpointFacts.bucketThresholdActive = isBucketCheckpointExpEnabled();
        diag.checkpointFacts.adaptiveCheckpointExp = isBucketCheckpointExpEnabled();
        diag.checkpointFacts.bestCheckpointSlot = bestCp ? bestCp.slot : 'none';
        diag.checkpointFacts.bestCheckpointIndex = bestCp ? bestCp.index : -1;

        const retainedCount = (isBucketCheckpointExpEnabled() && propsRef.current.isFreeDraw)
          ? historyCheckpointsRef.current.length
          : 2;
        const effectiveDPR = (propsRef.current.isFreeDraw || propsRef.current.isExperimental || enableFixedDPR) ? 1.0 : DPR;
        const memMB = (retainedCount * (Math.round(LOGICAL_WIDTH * effectiveDPR) * Math.round(LOGICAL_HEIGHT * effectiveDPR) * 4)) / (1024 * 1024);
        diag.checkpointFacts.retainedCanvases = retainedCount;
        diag.checkpointFacts.checkpointCount = retainedCount;
        diag.checkpointFacts.approximateRetainedMemoryMB = Math.round(memMB * 100) / 100;

        if (isBucketCheckpointExpEnabled() && propsRef.current.isFreeDraw) {
          const cps = historyCheckpointsRef.current;
          const indices = cps.map(cp => cp.index);
          const bucketCounts = cps.map(cp => countBucketsBeforeIndex(commands, cp.index, lastClearIndex));
          
          let maxGap = 0;
          const startBuckets = 0;
          const endBuckets = countBucketsBeforeIndex(commands, commands.length, lastClearIndex);
          
          if (cps.length > 0) {
            maxGap = Math.max(maxGap, bucketCounts[0] - startBuckets);
            for (let i = 0; i < cps.length - 1; i++) {
              maxGap = Math.max(maxGap, bucketCounts[i+1] - bucketCounts[i]);
            }
            maxGap = Math.max(maxGap, endBuckets - bucketCounts[cps.length - 1]);
          } else {
            maxGap = endBuckets - startBuckets;
          }

          diag.checkpointFacts.checkpointIndices = indices;
          diag.checkpointFacts.checkpointBucketCounts = bucketCounts;
          diag.checkpointFacts.maxBucketGap = maxGap;
        }
      }

      if (bestCp && bestCp.index > lastClearIndex) {
        // 1. Clear ONLY the permanent base canvas
        ctx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
        // 2. Blit baked checkpoint canvas instantly (1:1 pixel exact copy)
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(bestCp.canvas, 0, 0);
        ctx.restore();
        startIndex = bestCp.index;
      } else {
        // Fallback: Safe Clear-Barrier replay
        invalidateCheckpoint('all');
        ctx.clearRect(0, 0, LOGICAL_WIDTH * DPR, LOGICAL_HEIGHT * DPR);
        startIndex = lastClearIndex >= 0 ? lastClearIndex + 1 : 0;
      }

      if (diag) {
        diag.replayStartIndex = startIndex;
      }

      // 🛡️ Inline Checkpoint Recovery for Dual Checkpoints:
      const activeStart = lastClearIndex >= 0 ? lastClearIndex + 1 : 0;
      const M = N - activeStart;
      let candidateBaseIndex = -1;
      let candidateTailIndex = -1;

      const STRIDE = 8;
      const isExp = isBucketCheckpointExpEnabled() && (propsRef.current.isFreeDraw || propsRef.current.isExperimental);

      if (isExp) {
        // Adaptive Checkpoint Recovery:
        // Find buckets in replayed commands:
        const bucketIndices: number[] = [];
        for (let i = activeStart; i < N; i++) {
          if (isBucketCommand(commands[i])) {
            bucketIndices.push(i);
          }
        }

        if (bucketIndices.length > 0) {
          const lastB = bucketIndices[bucketIndices.length - 1];
          if (bucketIndices.length >= 2) {
            const secondLastB = bucketIndices[bucketIndices.length - 2];
            candidateBaseIndex = secondLastB + 1;
            candidateTailIndex = lastB + 1;
          } else {
            if (lastB > activeStart) {
              candidateBaseIndex = lastB;
              candidateTailIndex = lastB + 1;
            } else {
              candidateBaseIndex = lastB + 1;
              const afterCount = N - (lastB + 1);
              candidateTailIndex = afterCount >= STRIDE ? lastB + 1 + STRIDE : -1;
            }
          }
          if (candidateTailIndex >= N) candidateTailIndex = -1;
          if (candidateBaseIndex >= N) candidateBaseIndex = -1;
        } else {
          const numCheckpoints = Math.floor(M / STRIDE);
          if (numCheckpoints >= 1) {
            if (numCheckpoints >= 2) {
              candidateBaseIndex = activeStart + (numCheckpoints - 1) * STRIDE;
              candidateTailIndex = activeStart + numCheckpoints * STRIDE;
            } else {
              candidateBaseIndex = activeStart + STRIDE;
              candidateTailIndex = -1;
            }
            if (candidateTailIndex >= N) candidateTailIndex = -1;
            if (candidateBaseIndex >= N) candidateBaseIndex = -1;
          }
        }
      } else {
        const numCheckpoints = Math.floor(M / STRIDE);
        if ((propsRef.current.isFreeDraw || propsRef.current.isExperimental) && numCheckpoints >= 1) {
          if (numCheckpoints >= 2) {
            candidateBaseIndex = activeStart + (numCheckpoints - 1) * STRIDE;
            candidateTailIndex = activeStart + numCheckpoints * STRIDE;
          } else {
            candidateBaseIndex = activeStart + STRIDE;
            candidateTailIndex = -1;
          }
          if (candidateTailIndex >= N) candidateTailIndex = -1;
          if (candidateBaseIndex >= N) candidateBaseIndex = -1;
        }
      }

      // 2. Replay all remaining committed commands
      isReplayingRef.current = true;
      const replayPaths: Record<string, { x: number; y: number }[]> = {};
      const replaySessions: Record<string, { tool: ToolType; color: string; width: number; opacity: number }> = {};

      for (let i = startIndex; i < N; i++) {
        if (diag) {
          diag.commandsReplayed++;
          const cmd = commands[i];
          if (isCommandHeavy(cmd) || (cmd && cmd.data)) {
            const dec = decodeBinaryDrawMessage(cmd.data);
            if (dec && dec.event === 'draw_action' && dec.data?.tool === 'bucket') {
              diag.bucketCommandsEncountered++;
            }
          }
          if (commands[i]?._replayHint) {
            diag.hints.existedBefore++;
          }
        }

        if (i === candidateBaseIndex && !isCheckpointValid(baseCheckpointRef.current, commands)) {
          const bCanvas = ensureCheckpointCanvas('base');
          const bCtx = bCanvas.getContext('2d');
          if (bCtx) {
            bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
            bCtx.save();
            bCtx.setTransform(1, 0, 0, 1, 0, 0);
            bCtx.drawImage(ctx.canvas, 0, 0);
            bCtx.restore();
            baseCheckpointRef.current = {
              canvas: bCanvas,
              index: candidateBaseIndex,
              anchorSignature: getCommandSignature(commands[candidateBaseIndex - 1]),
              lastClearIndex
            };
          }
        }

        if (i === candidateTailIndex && !isCheckpointValid(tailCheckpointRef.current, commands)) {
          const tCanvas = ensureCheckpointCanvas('tail');
          const tCtx = tCanvas.getContext('2d');
          if (tCtx) {
            tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
            tCtx.save();
            tCtx.setTransform(1, 0, 0, 1, 0, 0);
            tCtx.drawImage(ctx.canvas, 0, 0);
            tCtx.restore();
            tailCheckpointRef.current = {
              canvas: tCanvas,
              index: candidateTailIndex,
              anchorSignature: getCommandSignature(commands[candidateTailIndex - 1]),
              lastClearIndex
            };
          }
        }

        applyReplayCommand(ctx, commands[i], replayPaths, replaySessions, diag);
        if (isBucketCheckpointExpEnabled() && propsRef.current.isFreeDraw && isBucketCommand(commands[i])) {
          captureHistoryCheckpoint(i + 1, commands);
        }
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

      if (diag) {
        diag.baseIndexAfter = baseCheckpointRef.current.index;
        diag.tailIndexAfter = tailCheckpointRef.current.index;
        diag.baseValidAfter = isCheckpointValid(baseCheckpointRef.current, commands);
        diag.tailValidAfter = isCheckpointValid(tailCheckpointRef.current, commands);
      }
    } catch (err) {
      console.error("[DrawingCanvasCore] Error in replayFreeDrawHistorySafely: ", err);
    } finally {
      isReplayingRef.current = false;
      saveSnapshot();
      syncHistoryButtons();
      if (diag) {
        diag.totalSyncDurationMs = performance.now() - startTime;
        console.log("[FREE_DRAW_UNDO_DIAG]", JSON.stringify(diag));
      }
    }
  };

  // --- Real-time Socket Event Receivers ---
  useEffect(() => {
    if (!socket) return;

    // Register modern client capabilities (supports Type 13 compressed transport)
    socket.emit('client_capabilities', { supportsType13: true });

    const onDrawBinary = (raw: any) => {
      if (isResetPendingRef.current) {
        flushPendingReset();
      }
      const decoded = decodeBinaryDrawMessage(raw);
      if (!decoded) return;
      const { event, data } = decoded;
      if (!data) return;

      // In Free Draw / Experimental, allow draw_undo to reach the sender so their canvas stays 100% authoritative and synchronized with the server broadcast
      const isFreeDrawUndo = Boolean(propsRef.current.isFreeDraw || propsRef.current.isExperimental) && event === 'draw_undo';
      if (data.instanceId === instanceId && !isFreeDrawUndo) return;

      const remoteTool = data.tool || 'pencil';
      const remoteColor = data.color || '#000000';
      const remoteWidth = data.width || 5;
      const remoteOpacity = data.opacity !== undefined ? data.opacity : 1;

      const ctx = ctxRef.current;
      const tempCtx = tempCtxRef.current;
      if (!ctx || !tempCtx) {
        if (pendingBinaryQueueRef.current.length < 500) {
          pendingBinaryQueueRef.current.push(raw);
        }
        return;
      }

      if (event === 'draw_stroke') {
        const session = activeSessionsRef.current[data.instanceId];
        const isRepairPending = Boolean(
          session &&
          session.repairPending &&
          (data.strokeId === undefined || session.strokeId === data.strokeId)
        );

        const isShape = remoteTool !== 'pencil' && remoteTool !== 'eraser';
        const scaledPoints = (data.points || []).map((pt: any) => ({
          x: pt.x * LOGICAL_WIDTH,
          y: pt.y * LOGICAL_HEIGHT
        }));
        if (scaledPoints.length > 0) {
          captureDirectFreeDrawUndoCache(data.instanceId, data.strokeId);
          if (isShape && scaledPoints.length >= 2) {
            const startPt = scaledPoints[0];
            const lastPt = scaledPoints[scaledPoints.length - 1];
            drawShape(ctx, startPt.x, startPt.y, lastPt.x, lastPt.y, remoteTool, remoteColor, remoteWidth, remoteOpacity);
          } else {
            drawEntirePath(ctx, scaledPoints, remoteTool, remoteColor, remoteWidth, remoteOpacity);
          }

          if (isRepairPending) {
            // 🎯 Repair Resolution Path (Seamless authoritative hand-off without visual gap)
            // 1. Authoritative canonical stroke has just been drawn directly onto ctx above.
            // 2. Remove the temporary session only after permanent ctx draw succeeds.
            delete activeSessionsRef.current[data.instanceId];
            // 3. Remove any drainingStrokesRef for this instanceId and strokeId.
            drainingStrokesRef.current = drainingStrokesRef.current.filter(
              s => !(s.instanceId === data.instanceId && (data.strokeId === undefined || s.strokeId === data.strokeId))
            );
            // 4. Record Type 9 into localCommandsRef history for deterministic undo/redo
            prevCommandsCountRef.current = localCommandsRef.current.length;
            localCommandsRef.current.push({
              event: 'draw_binary',
              data: raw,
              instanceId: data.instanceId,
              strokeId: data.strokeId
            });
            // 5. Update Undo/Redo/checkpoint/historical bookkeeping identically to normal path
            advanceCheckpointIncremental();
            if (!propsRef.current.isFreeDraw) {
              localRedoStackRef.current = [];
            }
            saveSnapshot();
            syncHistoryButtons();
            // 6. Redraw temp layer synchronously ONLY after transient state has been removed
            executeRedrawTempLayer();
          } else {
            // Normal Type 9 reception path (unaltered)
            delete activeSessionsRef.current[data.instanceId];
            drainingStrokesRef.current = drainingStrokesRef.current.filter(s => s.instanceId !== data.instanceId);
            executeRedrawTempLayer();

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
        }
      } else if (event === 'draw_start') {
        const rx = data.x * LOGICAL_WIDTH;
        const ry = data.y * LOGICAL_HEIGHT;

        // If there is any in-flight draining stroke for this drawer, finalize it immediately to permanent canvas
        if (drainingStrokesRef.current.some(s => s.instanceId === data.instanceId)) {
          const priorDraining = drainingStrokesRef.current.filter(s => s.instanceId === data.instanceId);
          drainingStrokesRef.current = drainingStrokesRef.current.filter(s => s.instanceId !== data.instanceId);
          for (let i = 0; i < priorDraining.length; i++) {
            const stroke = priorDraining[i];
            if (stroke.pendingQueue && stroke.pendingQueue.length > 0) {
              while (stroke.pendingQueue.length > 0) {
                stroke.path.push(stroke.pendingQueue.shift()!);
              }
            }
            commitRemoteStrokeAtomically(
              stroke.instanceId,
              stroke.strokeId,
              stroke.tool,
              stroke.color,
              stroke.width,
              stroke.opacity,
              stroke.path,
              stroke.rawPoints,
              () => {
                delete activeSessionsRef.current[stroke.instanceId];
                drainingStrokesRef.current = drainingStrokesRef.current.filter(
                  s => !(s.instanceId === stroke.instanceId && s.strokeId === stroke.strokeId)
                );
              }
            );
          }
        }

        // Clean up any stale active session for this instanceId
        if (activeSessionsRef.current[data.instanceId]) {
          delete activeSessionsRef.current[data.instanceId];
        }

        activeSessionsRef.current[data.instanceId] = {
          tool: remoteTool,
          color: remoteColor,
          width: remoteWidth,
          opacity: remoteOpacity,
          path: [{ x: rx, y: ry }],
          strokeId: data.strokeId || 0,
          networkPointCount: 1, // Includes p0
          rawPoints: [{ x: data.x, y: data.y }],
          pendingQueue: [],
          repairPending: false
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
              if (session.repairPending) {
                // If repair is pending, append directly to visible path so spectator immediately sees any late points
                session.path.push({ x: mx, y: my });
              } else {
                if (!session.pendingQueue) session.pendingQueue = [];
                session.pendingQueue.push({ x: mx, y: my });
              }
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

          if (isContinuousStream && !session.repairPending) {
            triggerSpectatorPlayback();
          } else {
            redrawTempLayer();
          }
        }
      } else if (event === 'draw_commit') {
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
              // Queue already fully drained: promote to permanent canvas atomically right now!
              // Single dot strokes, slow drawing, or paused touches have nothing left to drain.
              // Synchronous handover guarantees that the stroke is drawn on ctx and removed from tempCtx
              // in the exact same JavaScript transaction before the browser can paint.
              commitRemoteStrokeAtomically(
                data.instanceId,
                strokeId,
                session.tool,
                session.color,
                session.width,
                session.opacity,
                session.path,
                session.rawPoints,
                () => {
                  delete activeSessionsRef.current[data.instanceId];
                  drainingStrokesRef.current = drainingStrokesRef.current.filter(
                    s => !(s.instanceId === data.instanceId && s.strokeId === strokeId)
                  );
                }
              );
            }
          } else {
            // Count mismatch! Volatile packet loss occurred: request targeted canonical repair
            // Avoid duplicate repair requests if already pending for this stroke
            if (session.repairPending && session.strokeId === strokeId) {
              return;
            }

            // Mark session as repair pending
            session.repairPending = true;
            session.strokeId = strokeId;

            // Immediately flush any remaining points in pendingQueue into session.path
            // so spectator is viewing the fullest available trace while awaiting repair
            if (session.pendingQueue && session.pendingQueue.length > 0) {
              while (session.pendingQueue.length > 0) {
                session.path.push(session.pendingQueue.shift()!);
              }
            }

            // CRITICAL: DO NOT DELETE activeSessionsRef.current[data.instanceId]
            // DO NOT clear drainingStrokesRef
            // Keep current visible path intact on temp canvas
            redrawTempLayer();

            // Request targeted canonical repair once
            socket.emit('draw_repair_req', { instId: data.instanceId, strokeId });
          }
        } else {
          // If session is missing for a spectator when draw_commit arrives in Free Draw / Experimental,
          // request targeted canonical repair so this completed stroke is not lost
          if (propsRef.current.isFreeDraw || propsRef.current.isExperimental) {
            socket.emit('draw_repair_req', { instId: data.instanceId, strokeId });
          }
        }
      } else if (event === 'draw_abort') {
        delete activeSessionsRef.current[data.instanceId];
        drainingStrokesRef.current = drainingStrokesRef.current.filter(s => s.instanceId !== data.instanceId);
        executeRedrawTempLayer();
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
              captureDirectFreeDrawUndoCache(data.instanceId, session.strokeId);
              drawEntirePath(ctx, session.path, session.tool, session.color, session.width, session.opacity);
              committed = true;
              delete activeSessionsRef.current[data.instanceId];
            }
          } else {
            delete activeSessionsRef.current[data.instanceId];
          }

          if (!data.isCancelled && isShape && data.startX !== undefined && data.startY !== undefined) {
            captureDirectFreeDrawUndoCache(data.instanceId, session.strokeId);
            const sX = data.startX * LOGICAL_WIDTH;
            const sY = data.startY * LOGICAL_HEIGHT;
            const eX = (data.x !== undefined ? data.x : (data.endX !== undefined ? data.endX : 0)) * LOGICAL_WIDTH;
            const eY = (data.y !== undefined ? data.y : (data.endY !== undefined ? data.endY : 0)) * LOGICAL_HEIGHT;
            drawShape(ctx, sX, sY, eX, eY, session.tool, session.color, session.width, session.opacity);
            committed = true;
          }
        }
        executeRedrawTempLayer();
        if (!data.isCancelled) {
          saveSnapshot();
        }
      } else if (event === 'draw_cancel') {
        delete activeSessionsRef.current[data.instanceId];
        drainingStrokesRef.current = drainingStrokesRef.current.filter(s => s.instanceId !== data.instanceId);
        executeRedrawTempLayer();
      } else if (event === 'draw_clear') {
        applyClearEpoch(raw);
        saveSnapshot();
      } else if (event === 'draw_action') {
        if (remoteTool === 'bucket' && data.x !== undefined && data.y !== undefined) {
          // 🛡️ Remote Raster/History Transaction Barrier:
          // Synchronize committed draining strokes to ctx & localCommandsRef BEFORE Bucket
          if (propsRef.current.isFreeDraw) {
            flushCommittedDrainingStrokesBarrier();
          }

          // 1. Capture direct undo cache (guaranteed to include all preceding committed strokes on ctx)
          captureDirectFreeDrawUndoCache(data.instanceId, data.strokeId);

          // 🛡️ Adaptive Checkpoint Pre-Bucket Capture (Free Draw Exp):
          capturePreBucketCheckpoint(localCommandsRef.current.length);

          // 2. Perform authoritative flood fill on ctx
          const fillRes = floodFill(ctx, data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT, remoteColor, remoteOpacity, LOGICAL_WIDTH, LOGICAL_HEIGHT, data.targetRGBA);

          // 3. Append Bucket command to localCommandsRef
          prevCommandsCountRef.current = localCommandsRef.current.length;
          const remoteCmdRecord: any = {
            event: 'draw_binary',
            data: raw,
            instanceId: data.instanceId,
            strokeId: data.strokeId
          };
          if (fillRes?.isFullCanvasOpaque) {
            remoteCmdRecord._replayHint = 'full_canvas_opaque';
            remoteCmdRecord._replayColor = fillRes.fillHex || remoteColor;
            remoteCmdRecord._replayOpacity = remoteOpacity;
          }
          localCommandsRef.current.push(remoteCmdRecord);
          if (isBucketCheckpointExpEnabled() && propsRef.current.isFreeDraw) {
            advanceCheckpointBucketPost(localCommandsRef.current.length);
          } else {
            advanceCheckpointIncremental();
          }
          if (!propsRef.current.isFreeDraw) {
            localRedoStackRef.current = [];
          }
          saveSnapshot();
          syncHistoryButtons();

          // 4. Ensure temp layer is clean and properly rebuilt for any remaining uncommitted active sessions
          executeRedrawTempLayer();
        }
      } else if (event === 'draw_undo') {
        const isFreeDraw = Boolean(propsRef.current.isFreeDraw || propsRef.current.isExperimental);
        if (isFreeDraw) {
          // A. Local undo confirmation / ACK from server:
          if (data.instanceId === instanceId) {
            // Already applied optimistically and locally by executeUndo().
            // Strictly NO-OP: do NOT call executeUndo(false), do NOT modify history or redo stack.
            return;
          }

          // B. Remote undo from another player (data.instanceId !== instanceId):
          // If command identity (instanceId or strokeId) is missing, safely ignore (NO-OP).
          // NEVER fallback to undoing the last local command.
          if (!data.instanceId || data.strokeId === undefined) {
            return;
          }

          const targetInst = data.instanceId;
          const targetStrId = data.strokeId;

          // 1. Safe Filter of Spectator Playback Queue:
          // Filter OUT only the stroke matching (targetInst + targetStrId).
          // Strictly PRESERVE all other strokes in drainingStrokesRef!
          const beforeDrainingCount = drainingStrokesRef.current.length;
          drainingStrokesRef.current = drainingStrokesRef.current.filter(
            s => !(s.instanceId === targetInst && s.strokeId === targetStrId)
          );
          let sessionDeleted = false;
          if (activeSessionsRef.current[targetInst] && activeSessionsRef.current[targetInst].strokeId === targetStrId) {
            delete activeSessionsRef.current[targetInst];
            sessionDeleted = true;
          }
          if (drainingStrokesRef.current.length !== beforeDrainingCount || sessionDeleted) {
            redrawTempLayer();
          }

          // 2. Safe Targeted Undo on Committed Commands:
          const list = localCommandsRef.current;
          const index = list.findIndex(cmd => {
            if (!cmd) return false;
            let cmdInst = cmd.instanceId;
            let cmdStr = cmd.strokeId;
            if ((cmdInst === undefined || cmdStr === undefined) && cmd.data) {
              if (typeof cmd.data === 'object' && !(cmd.data instanceof ArrayBuffer)) {
                cmdInst = cmdInst ?? cmd.data.instanceId;
                cmdStr = cmdStr ?? cmd.data.strokeId;
              } else {
                const dec = decodeBinaryDrawMessage(cmd.data);
                if (dec?.data) {
                  cmdInst = cmdInst ?? dec.data.instanceId;
                  cmdStr = cmdStr ?? dec.data.strokeId;
                }
              }
            }
            return cmdInst === targetInst && cmdStr === targetStrId;
          });

          // C. Duplicate Prevention / Missing Target:
          // If no matching command found (already removed, duplicate message, or never arrived), safely ignore.
          if (index === -1) {
            return;
          }

          // 3. Invalidate Checkpoints after the target index:
          invalidateCheckpointsAfterIndex(index);

          // 4. Remove ONLY the matching remote command from history.
          // Strictly DO NOT add another player's command to localRedoStackRef!
          const historyLengthBefore = list.length;
          const remoteOpId = Math.random().toString(36).substring(2, 9);

          const remoteDiag: UndoDiagnostics | null = isDiagEnabled() ? {
            opId: remoteOpId,
            type: 'remote_undo',
            historyLengthBefore,
            targetInstanceId: targetInst,
            targetStrokeId: targetStrId,
            targetIndex: index,
            targetDistanceFromEnd: historyLengthBefore - 1 - index,
            fastPath: 'na',
            fastPathMissReason: 'remote_replay',
            baseIndexBefore: baseCheckpointRef.current.index,
            tailIndexBefore: tailCheckpointRef.current.index,
            baseValidBefore: isCheckpointValid(baseCheckpointRef.current, list),
            tailValidBefore: isCheckpointValid(tailCheckpointRef.current, list),
            baseIndexAfter: 0,
            tailIndexAfter: 0,
            baseValidAfter: false,
            tailValidAfter: false,
            replayStartIndex: 0,
            commandsReplayed: 0,
            bucketCommandsEncountered: 0,
            floodFillExecutions: 0,
            cumulativeFillDurationMs: 0,
            maxFillDurationMs: 0,
            totalSyncDurationMs: 0,
            hints: { existedBefore: 0, discarded: 0, usedShortcut: 0, forcedFill: 0 },
            checkpointFacts: { stride: 8, retainedCanvases: 2, invalidationReason: null, bucketThresholdActive: false }
          } : null;

          list.splice(index, 1);

          // 5. Invalidate replay hints for subsequent commands whose historical predecessor context has changed:
          if (index < list.length) {
            for (let i = index; i < list.length; i++) {
              if (list[i]?._replayHint) {
                delete list[i]._replayHint;
                delete list[i]._replayColor;
                delete list[i]._replayOpacity;
              }
            }
          }

          // 6. Invalidate single-step undo/redo caches:
          hasFreeDrawUndoCacheRef.current = false;
          hasFreeDrawRedoCacheRef.current = false;
          hasFreeDrawPendingUndoCacheRef.current = false;
          freeDrawUndoCacheMetaRef.current = null;

          // 7. Safely reconstruct canvas from history:
          replayFreeDrawHistorySafely(list, remoteDiag);

          // 8. Re-synchronize history buttons:
          syncHistoryButtons();
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

        // Cancel any pending chunk processing loop and advance generation ID
        if (syncChunkRafRef.current !== null) {
          cancelAnimationFrame(syncChunkRafRef.current);
          syncChunkRafRef.current = null;
        }
        const currentSyncGen = ++historySyncGenerationRef.current;

        invalidateCheckpoint('all');

        // Cancel in-flight spectator playback from previous state
        if (spectatorPlaybackRafRef.current !== null) {
          cancelAnimationFrame(spectatorPlaybackRafRef.current);
          spectatorPlaybackRafRef.current = null;
        }
        drainingStrokesRef.current = [];
        if (!propsRef.current.isFreeDraw && !propsRef.current.isExperimental) {
          activeSessionsRef.current = {};
        }
        clearFloatingLabels();

        resetCanvasBackingStores(ctx, tempCtx);
        if (propsRef.current.isFreeDraw || propsRef.current.isExperimental) {
          executeRedrawTempLayer();
        }

        hasFreeDrawUndoCacheRef.current = false;
        hasFreeDrawRedoCacheRef.current = false;
        hasFreeDrawPendingUndoCacheRef.current = false;

        localCommandsRef.current = [...commands];
        prevCommandsCountRef.current = -1;

        isReplayingRef.current = true;

        const replayPaths: Record<string, { x: number; y: number }[]> = {};
        const replaySessions: Record<string, { tool: ToolType; color: string; width: number; opacity: number }> = {};

        // Fast path for empty history
        if (commands.length === 0) {
          isReplayingRef.current = false;
          saveSnapshot();
          syncHistoryButtons();
          setIsSyncing(false);
          setHasSyncedOnce(true);
          hasSyncedOnceRef.current = true;
          if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
            syncTimeoutRef.current = null;
          }
          if (propsRef.current.isFreeDraw || propsRef.current.isExperimental) {
            advanceCheckpointIncremental();
            executeRedrawTempLayer();
          }
          console.log("[DrawingCanvasCore] Empty history sync completed.");
          return;
        }

        let currentIndex = 0;
        const CHUNK_SIZE = 50; 

        const processChunk = () => {
          // If a newer sync has started, abort this chunk loop immediately
          if (historySyncGenerationRef.current !== currentSyncGen) {
            return;
          }

          const endIndex = Math.min(currentIndex + CHUNK_SIZE, commands.length);
          
          for (let i = currentIndex; i < endIndex; i++) {
            applyReplayCommand(ctx, commands[i], replayPaths, replaySessions);
            if (isBucketCheckpointExpEnabled() && propsRef.current.isFreeDraw && isBucketCommand(commands[i])) {
              captureHistoryCheckpoint(i + 1, commands);
            }
          }

          currentIndex = endIndex;

          if (currentIndex < commands.length) {
            syncChunkRafRef.current = requestAnimationFrame(processChunk);
          } else {
            syncChunkRafRef.current = null;

            if (historySyncGenerationRef.current !== currentSyncGen) {
              return;
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
                    drawShape(ctx, startPt.x, startPt.y, lastPt.x, lastPt.y, session.tool, session.color, session.width, session.opacity);
                  } else {
                    drawEntirePath(ctx, path, session.tool, session.color, session.width, session.opacity);
                  }
                }
                if (path) path.length = 0;
              } catch (err) {}
            });

            // IMPORTANT: DO NOT wipe activeSessionsRef.current = {} here!
            // Live drawing sessions by other users that arrived while chunks were rendering are preserved.
            isReplayingRef.current = false;
            saveSnapshot();
            syncHistoryButtons();
            setIsSyncing(false);
            setHasSyncedOnce(true);
            hasSyncedOnceRef.current = true;
            if (syncTimeoutRef.current) {
              clearTimeout(syncTimeoutRef.current);
              syncTimeoutRef.current = null;
            }
            if (propsRef.current.isFreeDraw || propsRef.current.isExperimental) {
              advanceCheckpointIncremental();
              executeRedrawTempLayer();
            }
            console.log("[DrawingCanvasCore] Deferred queue fully rendered.");
          }
        };

        syncChunkRafRef.current = requestAnimationFrame(processChunk);

      } catch (err) {
        console.error("[DrawingCanvasCore] Sync Chunk Error:", err);
        setIsSyncing(false);
      }
    };

    const onDrawHistorySync = (commands: any[]) => {
      if (isResetPendingRef.current) {
        flushPendingReset();
      }
      const safeCommands = Array.isArray(commands) ? commands : [];
      console.log("[DrawingCanvasCore] Received draw_history_sync event, payload length:", safeCommands.length);
      
      const isCanvasReady = Boolean(isCanvasResizeObserverReadyRef.current && ctxRef.current && tempCtxRef.current);
      if (!isCanvasReady) {
        console.log("[DrawingCanvasCore] Canvas or ResizeObserver not ready. Buffering history sync...");
        pendingHistorySyncRef.current = safeCommands;
        if (syncRetryTimerRef.current) {
          clearTimeout(syncRetryTimerRef.current);
        }
        syncRetryTimerRef.current = setTimeout(() => {
          syncRetryTimerRef.current = null;
          if (pendingHistorySyncRef.current !== null && isCanvasResizeObserverReadyRef.current && ctxRef.current && tempCtxRef.current) {
            const cmds = pendingHistorySyncRef.current;
            pendingHistorySyncRef.current = null;
            processIncomingHistorySync(cmds);
            if (pendingBinaryQueueRef.current.length > 0) {
              const queued = pendingBinaryQueueRef.current;
              pendingBinaryQueueRef.current = [];
              for (let i = 0; i < queued.length; i++) {
                onDrawBinaryRef.current?.(queued[i]);
              }
            }
          }
        }, 50);
        return;
      }

      pendingHistorySyncRef.current = null;
      if (syncRetryTimerRef.current) {
        clearTimeout(syncRetryTimerRef.current);
        syncRetryTimerRef.current = null;
      }
      processIncomingHistorySync(safeCommands);
    };

    const onDrawRedoSync = (commands: any[]) => {
      console.log("[DrawingCanvasCore] Received draw_redo_sync event, payload length:", commands?.length);
      localRedoStackRef.current = commands || [];
      syncHistoryButtons();
    };

    processIncomingHistorySyncRef.current = processIncomingHistorySync;
    onDrawBinaryRef.current = onDrawBinary;

    socket.on('draw_binary', onDrawBinary);
    socket.on('draw_history_sync', onDrawHistorySync);
    socket.on('draw_redo_sync', onDrawRedoSync);

    return () => {
      processIncomingHistorySyncRef.current = null;
      onDrawBinaryRef.current = null;
      socket.off('draw_binary', onDrawBinary);
      socket.off('draw_history_sync', onDrawHistorySync);
      socket.off('draw_redo_sync', onDrawRedoSync);
    };
  }, [socket, instanceId]);

  // --- Free Draw Drawing Identity Registry & Subscription (Phase 1 & 1B.1) ---
  useEffect(() => {
    if (!isFreeDraw || !socket || !instanceId) return;

    const onIdentitiesUpdate = (identities: Record<string, { socketId: string; playerName: string }> | any) => {
      if (identities && typeof identities === 'object') {
        drawingIdentitiesRef.current = identities;
        requestedIdentitiesRef.current.clear();
        updateFloatingLabels();
      }
    };

    const onRoomStateUpdate = (state: any) => {
      if (state && state.drawingIdentities && typeof state.drawingIdentities === 'object') {
        drawingIdentitiesRef.current = state.drawingIdentities;
        requestedIdentitiesRef.current.clear();
        updateFloatingLabels();
      }
      // If our own instanceId is not yet registered in room identities, retry registering now that room state is active
      if (!drawingIdentitiesRef.current[instanceId]) {
        registerIdentity();
      }
    };

    const registerIdentity = () => {
      if (socket.connected) {
        socket.emit('register_drawing_identity', { instanceId });
      }
    };

    // Attach listeners before registering to ensure no early updates are missed
    socket.on('drawing_identities_update', onIdentitiesUpdate);
    socket.on('room_state_update', onRoomStateUpdate);
    socket.on('connect', registerIdentity);

    registerIdentity();

    // Redundant retry timeouts to eliminate any race condition with parent join_room
    const t1 = setTimeout(registerIdentity, 300);
    const t2 = setTimeout(registerIdentity, 1000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearFloatingLabels();
      socket.off('drawing_identities_update', onIdentitiesUpdate);
      socket.off('room_state_update', onRoomStateUpdate);
      socket.off('connect', registerIdentity);
      if (socket.connected) {
        socket.emit('unregister_drawing_identity', { instanceId });
      }
    };
  }, [isFreeDraw, socket, instanceId]);

  useEffect(() => {
    return () => {
      clearFloatingLabels();
    };
  }, []);

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
      hasSyncedOnceRef.current = true;
    }, 4000);

    socket?.emit('request_round_sync');
  };

  const checkAndTriggerInitialSync = () => {
    const isJoined = Boolean(isRoomJoined || isServerRoomJoinedRef.current);
    const isCanvasReady = Boolean(isCanvasResizeObserverReadyRef.current && ctxRef.current && tempCtxRef.current);

    if (pendingHistorySyncRef.current !== null && isCanvasReady) {
      const cmds = pendingHistorySyncRef.current;
      pendingHistorySyncRef.current = null;
      if (syncRetryTimerRef.current) {
        clearTimeout(syncRetryTimerRef.current);
        syncRetryTimerRef.current = null;
      }
      processIncomingHistorySyncRef.current?.(cmds);
      if (pendingBinaryQueueRef.current.length > 0) {
        const queued = pendingBinaryQueueRef.current;
        pendingBinaryQueueRef.current = [];
        for (let i = 0; i < queued.length; i++) {
          onDrawBinaryRef.current?.(queued[i]);
        }
      }
      return;
    }

    if (pendingBinaryQueueRef.current.length > 0 && isCanvasReady) {
      const queued = pendingBinaryQueueRef.current;
      pendingBinaryQueueRef.current = [];
      for (let i = 0; i < queued.length; i++) {
        onDrawBinaryRef.current?.(queued[i]);
      }
    }

    if (socket?.connected && isJoined && isCanvasReady && !hasSyncedOnceRef.current) {
      startSyncFlow();
    }
  };

  checkAndTriggerInitialSyncRef.current = checkAndTriggerInitialSync;

  // Universal Room State Tracker: guarantees room membership recognition
  useEffect(() => {
    if (!socket) return;
    const onRoomState = () => {
      isServerRoomJoinedRef.current = true;
      checkAndTriggerInitialSync();
    };
    socket.on('room_state_update', onRoomState);
    return () => {
      socket.off('room_state_update', onRoomState);
    };
  }, [socket]);

  // Readiness effect: triggers initial history fetch once room and canvas are confirmed ready
  useEffect(() => {
    checkAndTriggerInitialSync();
  }, [socket, isConnected, isRoomJoined]);

  // --- Network Connection Recovery Engine ---
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      console.log("[DrawingCanvasCore] System connection established.");
      socket.emit('client_capabilities', { supportsType13: true });
      hasSyncedOnceRef.current = false;
      setHasSyncedOnce(false);
      checkAndTriggerInitialSync();
    };

    const handleDisconnect = () => {
      console.log("[DrawingCanvasCore] System connection lost.");
      isServerRoomJoinedRef.current = false;
      setIsSyncing(true);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
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

      checkAndTriggerInitialSyncRef.current?.();
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

    const isSingleSource = Boolean(propsRef.current.isFreeDraw || propsRef.current.isExperimental);

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

    // Initialize Canonical Stroke for Single-Source Pipeline
    canonicalStrokeRef.current = [{ x: startX, y: startY }];
    
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
      (propsRef.current.isFreeDraw || propsRef.current.isExperimental) &&
      (activeTool === 'pencil' || activeTool === 'eraser')
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
      redrawTempLayer();

      const normX = roundedX / LOGICAL_WIDTH;
      const normY = roundedY / LOGICAL_HEIGHT;

      moveBatchRef.current.push({ x: normX, y: normY });
      networkStrokePointsRef.current.push({ x: normX, y: normY });
      lastNetworkPointRef.current = { x: roundedX, y: roundedY };
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
          const isCompressed = isContinuousMode;
          emitDrawCommand(isCompressed ? 'draw_move_compressed' : 'draw_move', {
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
          if (isContinuousMode) {
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
        const isCompressed = isContinuousMode;
        emitDrawCommand(isCompressed ? 'draw_move_compressed' : 'draw_move', {
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
          commitFreeDrawPendingCache(instanceId, currentLocalStrokeIdRef.current);

          const isSingleSource = Boolean(
            (propsRef.current.isFreeDraw || propsRef.current.isExperimental) &&
            (activeTool === 'pencil' || activeTool === 'eraser')
          );

          if (isSingleSource && canonicalStrokeRef.current.length > 0) {
            drawEntirePath(ctx, canonicalStrokeRef.current, activeTool, activeColor, activeWidth, activeOpacity);
          } else {
            drawEntirePath(ctx, currentPathRef.current, activeTool, activeColor, activeWidth, activeOpacity);
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

    const shapeStrokeId = currentLocalStrokeIdRef.current;
    commitFreeDrawPendingCache(instanceId, shapeStrokeId);

    // Draw shape to the primary canvas context (hardware-clipped naturally at canvas bounds)
    drawShape(ctx, startXRef.current, startYRef.current, rawX, rawY, activeTool, activeColor, activeWidth, activeOpacity);

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
        // Increment monotonic strokeId for this Bucket operation
        currentLocalStrokeIdRef.current = ((currentLocalStrokeIdRef.current || 0) + 1) & 0xFFFF;
        if (currentLocalStrokeIdRef.current === 0) currentLocalStrokeIdRef.current = 1;
        const thisBucketStrokeId = currentLocalStrokeIdRef.current;

        captureDirectFreeDrawUndoCache(instanceId, thisBucketStrokeId);
        // 🛡️ Adaptive Checkpoint Pre-Bucket Capture (Free Draw Exp):
        capturePreBucketCheckpoint(localCommandsRef.current.length);
        const sampledTarget = floodFill(ctx, x, y, activeColor, activeOpacity, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        if (sampledTarget?.isNoOp) {
          lastBucketHintRef.current = {
            hint: 'noop',
            color: activeColor,
            opacity: activeOpacity
          };
        } else if (sampledTarget?.isFullCanvasOpaque) {
          lastBucketHintRef.current = {
            hint: 'full_canvas_opaque',
            color: sampledTarget.fillHex || activeColor,
            opacity: activeOpacity
          };
        } else {
          lastBucketHintRef.current = null;
        }

        if (localRedoStackRef.current.length > 0) {
          localRedoStackRef.current = [];
          syncHistoryButtons();
        }

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

        {/* 🌟 Minimal Floating Drawing Names Layer (Free Draw Only - Phase 2) */}
        {isFreeDraw && (
          <div
            ref={floatingLabelsLayerRef}
            className="absolute left-0 top-0 pointer-events-none select-none z-30 overflow-visible"
            style={{
              width: LOGICAL_WIDTH,
              height: LOGICAL_HEIGHT
            }}
          />
        )}
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
    prevProps.showFloatingNames === nextProps.showFloatingNames &&
    prevProps.enableInputOptimizations === nextProps.enableInputOptimizations &&
    prevProps.enableBitmapUndoCache === nextProps.enableBitmapUndoCache &&
    prevProps.enableFixedDPR === nextProps.enableFixedDPR &&
    prevProps.enableCanvasAlpha === nextProps.enableCanvasAlpha &&
    prevProps.enableDestinationOutEraser === nextProps.enableDestinationOutEraser &&
    prevProps.deferredReset === nextProps.deferredReset &&
    prevProps.onHistoryStateChange === nextProps.onHistoryStateChange &&
    prevProps.onPipetteColorPicked === nextProps.onPipetteColorPicked &&
    prevProps.onSyncStateChange === nextProps.onSyncStateChange
  );
});

export default MemoizedDrawingCanvasCore;

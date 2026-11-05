/**
 * 🛡️ Single-Command Replay Engine (Phase 4E / Sub-Batch 4E-1C Stage 2A)
 *
 * Stateless execution module for single-command history replay.
 * Owns binary event interpretation, point scaling, vector stroke/shape rendering,
 * and raster flood-fill shortcut execution.
 */

import { ToolType } from '../types/draw';
import { decodeBinaryDrawMessage } from './drawBinaryHelper';
import { drawShape, drawEntirePath } from './canvasPathRenderer';
import type { TargetRGBA } from './canvasFloodFill';

export type ReplayEffect = 'none' | 'snapshot' | 'clear' | 'undo' | 'redo';

export interface ReplaySession {
  tool: ToolType;
  color: string;
  width: number;
  opacity: number;
}

export interface ReplayRenderOptions {
  logicalWidth: number;
  logicalHeight: number;
  isFreeDraw?: boolean;
  enableDestinationOutEraser?: boolean;
}

export interface ReplayCommandEnvelope {
  data?: unknown;
  _replayHint?: string;
  _replayColor?: string;
  _replayOpacity?: number;
}

export interface DecodedReplayData {
  instanceId?: string;
  tool?: ToolType;
  color?: string;
  width?: number;
  opacity?: number;
  x?: number;
  y?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  isCancelled?: boolean;
  points?: { x: number; y: number }[];
  moves?: { x: number; y: number }[];
  targetRGBA?: TargetRGBA;
}

export interface ReplayUndoDiagnostics {
  hints: {
    existedBefore: number;
    discarded: number;
    usedShortcut: number;
    forcedFill: number;
  };
  floodFillExecutions: number;
  cumulativeFillDurationMs: number;
  maxFillDurationMs: number;
  cumulativeFilledPixels: number;
  maxFillPixelCount: number;
}

export interface ReplayJoinSyncDiagnostics {
  floodFillExecutions: number;
  cumulativeFillDurationMs: number;
}

export type FloodFillFunction = (
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColorStr: string,
  fillOpacity?: number,
  logicalWidth?: number,
  logicalHeight?: number,
  expectedTarget?: TargetRGBA,
  joinDiag?: ReplayJoinSyncDiagnostics | null
) => (TargetRGBA & { isFullCanvasOpaque?: boolean; fillHex?: string; isNoOp?: boolean; filledPixelCount?: number }) | null;

/**
 * Replays a single command onto the target Canvas 2D Context.
 * Mutates replayPaths and replaySessions accumulators.
 * Returns a ReplayEffect indicating any higher-level orchestration effect needed by the parent.
 */
export function replaySingleCommand(
  ctx: CanvasRenderingContext2D,
  cmdObj: ReplayCommandEnvelope,
  replayPaths: Record<string, { x: number; y: number }[]>,
  replaySessions: Record<string, ReplaySession>,
  options: ReplayRenderOptions,
  floodFillFn: FloodFillFunction,
  diag?: ReplayUndoDiagnostics | null,
  joinDiag?: ReplayJoinSyncDiagnostics | null
): ReplayEffect {
  if (!cmdObj || !cmdObj.data) return 'none';

  const decoded = decodeBinaryDrawMessage(cmdObj.data);
  if (!decoded || !decoded.data) return 'none';

  const event: string = decoded.event;
  const data = decoded.data as DecodedReplayData;
  const instId: string = data.instanceId || 'default';
  const cmdTool: ToolType = data.tool || 'pencil';
  const cmdColor: string = data.color || '#000000';
  const cmdWidth: number = data.width || 5;
  const cmdOpacity: number = data.opacity !== undefined ? data.opacity : 1;

  if (!replayPaths[instId]) {
    replayPaths[instId] = [];
  }
  const path = replayPaths[instId];

  if (event === 'draw_stroke') {
    const isShape = cmdTool !== 'pencil' && cmdTool !== 'eraser';
    const scaledPoints = (data.points || []).map((pt: { x: number; y: number }) => ({
      x: pt.x * options.logicalWidth,
      y: pt.y * options.logicalHeight
    }));
    if (scaledPoints.length > 0) {
      if (isShape && scaledPoints.length >= 2) {
        const startPt = scaledPoints[0];
        const lastPt = scaledPoints[scaledPoints.length - 1];
        drawShape(ctx, startPt.x, startPt.y, lastPt.x, lastPt.y, cmdTool, cmdColor, cmdWidth, cmdOpacity, false);
      } else {
        drawEntirePath(
          ctx,
          scaledPoints,
          cmdTool,
          cmdColor,
          cmdWidth,
          cmdOpacity,
          Boolean(options.isFreeDraw || options.enableDestinationOutEraser)
        );
      }
    }
    return 'snapshot';
  }

  if (event === 'draw_start') {
    replaySessions[instId] = {
      tool: cmdTool,
      color: cmdColor,
      width: cmdWidth,
      opacity: cmdOpacity
    };
    const rx = (data.x || 0) * options.logicalWidth;
    const ry = (data.y || 0) * options.logicalHeight;
    path.length = 0;
    path.push({ x: rx, y: ry });
    return 'none';
  }

  if (event === 'draw_move') {
    const handleMovePoint = (mx: number, my: number) => {
      path.push({ x: mx, y: my });
    };

    if (data.moves && Array.isArray(data.moves)) {
      data.moves.forEach((m: { x: number; y: number }) => {
        handleMovePoint(m.x * options.logicalWidth, m.y * options.logicalHeight);
      });
    } else if (data.x !== undefined && data.y !== undefined) {
      handleMovePoint(data.x * options.logicalWidth, data.y * options.logicalHeight);
    }
    return 'none';
  }

  if (event === 'draw_end') {
    const session = replaySessions[instId] || {
      tool: 'pencil' as ToolType,
      color: '#000000',
      width: 5,
      opacity: 1
    };
    const isShape = session.tool !== 'pencil' && session.tool !== 'eraser';
    if (!data.isCancelled && path.length > 0 && !isShape) {
      drawEntirePath(
        ctx,
        path,
        session.tool,
        session.color,
        session.width,
        session.opacity,
        Boolean(options.isFreeDraw || options.enableDestinationOutEraser)
      );
    }

    if (!data.isCancelled && isShape && data.startX !== undefined && data.startY !== undefined) {
      const sX = data.startX * options.logicalWidth;
      const sY = data.startY * options.logicalHeight;
      const eX = (data.x !== undefined ? data.x : (data.endX !== undefined ? data.endX : 0)) * options.logicalWidth;
      const eY = (data.y !== undefined ? data.y : (data.endY !== undefined ? data.endY : 0)) * options.logicalHeight;
      drawShape(ctx, sX, sY, eX, eY, session.tool, session.color, session.width, session.opacity, false);
    }
    path.length = 0;
    delete replaySessions[instId];
    return data.isCancelled ? 'none' : 'snapshot';
  }

  if (event === 'draw_cancel') {
    path.length = 0;
    delete replaySessions[instId];
    return 'none';
  }

  if (event === 'draw_clear') {
    Object.keys(replayPaths).forEach((k) => delete replayPaths[k]);
    Object.keys(replaySessions).forEach((k) => delete replaySessions[k]);
    return 'clear';
  }

  if (event === 'draw_action') {
    if (cmdTool === 'bucket' && data.x !== undefined && data.y !== undefined) {
      if (cmdObj._replayHint === 'full_canvas_opaque' && (cmdOpacity === undefined || cmdOpacity >= 0.95)) {
        if (diag) diag.hints.usedShortcut++;
        const fillHex = cmdObj._replayColor || cmdColor;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = fillHex;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
      } else if (cmdObj._replayHint === 'noop') {
        if (diag) diag.hints.usedShortcut++;
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
            if (cmdObj._replayHint) diag.hints.discarded++;
          }
          const fillStart = (diag || joinDiag) ? performance.now() : 0;
          const fillRes = floodFillFn(
            ctx,
            data.x * options.logicalWidth,
            data.y * options.logicalHeight,
            cmdColor,
            cmdOpacity,
            options.logicalWidth,
            options.logicalHeight,
            data.targetRGBA,
            joinDiag
          );
          if (diag) {
            diag.floodFillExecutions++;
            const dur = performance.now() - fillStart;
            diag.cumulativeFillDurationMs += dur;
            if (dur > diag.maxFillDurationMs) diag.maxFillDurationMs = dur;
            if (fillRes) {
              const pCount = fillRes.filledPixelCount || 0;
              diag.cumulativeFilledPixels += pCount;
              if (pCount > diag.maxFillPixelCount) diag.maxFillPixelCount = pCount;
            }
          }
          if (joinDiag) {
            joinDiag.floodFillExecutions++;
            const dur = performance.now() - fillStart;
            joinDiag.cumulativeFillDurationMs += dur;
          }
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
      } else {
        if (diag) {
          diag.hints.forcedFill++;
          if (cmdObj._replayHint) diag.hints.discarded++;
        }
        const fillStart = (diag || joinDiag) ? performance.now() : 0;
        const fillRes = floodFillFn(
          ctx,
          data.x * options.logicalWidth,
          data.y * options.logicalHeight,
          cmdColor,
          cmdOpacity,
          options.logicalWidth,
          options.logicalHeight,
          data.targetRGBA,
          joinDiag
        );
        if (diag) {
          diag.floodFillExecutions++;
          const dur = performance.now() - fillStart;
          diag.cumulativeFillDurationMs += dur;
          if (dur > diag.maxFillDurationMs) diag.maxFillDurationMs = dur;
          if (fillRes) {
            const pCount = fillRes.filledPixelCount || 0;
            diag.cumulativeFilledPixels += pCount;
            if (pCount > diag.maxFillPixelCount) diag.maxFillPixelCount = pCount;
          }
        }
        if (joinDiag) {
          joinDiag.floodFillExecutions++;
          const dur = performance.now() - fillStart;
          joinDiag.cumulativeFillDurationMs += dur;
        }
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
      return 'snapshot';
    }
  }

  if (event === 'draw_undo') {
    return 'undo';
  }

  if (event === 'draw_redo') {
    return 'redo';
  }

  return 'none';
}

/**
 * Finalizes and renders all leftover mid-stroke paths accumulated in replaySessions
 * (e.g. drawers who disconnected mid-stroke or incomplete historical strokes).
 */
export function renderLeftoverReplaySessions(
  ctx: CanvasRenderingContext2D,
  replayPaths: Record<string, { x: number; y: number }[]>,
  replaySessions: Record<string, ReplaySession>,
  options: ReplayRenderOptions,
  onItemError?: (error: unknown) => void,
  clearPathsAfterRender?: boolean
): void {
  Object.keys(replaySessions).forEach((instId) => {
    try {
      const session = replaySessions[instId];
      const path = replayPaths[instId];
      if (session && path && path.length > 0) {
        const isShape = session.tool !== 'pencil' && session.tool !== 'eraser';
        if (isShape) {
          const startPt = path[0];
          const lastPt = path[path.length - 1];
          drawShape(ctx, startPt.x, startPt.y, lastPt.x, lastPt.y, session.tool, session.color, session.width, session.opacity, false);
        } else {
          drawEntirePath(
            ctx,
            path,
            session.tool,
            session.color,
            session.width,
            session.opacity,
            Boolean(options.isFreeDraw || options.enableDestinationOutEraser)
          );
        }
      }
      if (clearPathsAfterRender && path) {
        path.length = 0;
      }
    } catch (itemErr) {
      if (onItemError) {
        onItemError(itemErr);
      }
    }
  });
}

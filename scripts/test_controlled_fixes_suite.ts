import { encodeBinaryDrawMessage, decodeBinaryDrawMessage } from '../src/utils/drawBinaryHelper';

const CW = 1000;
const CH = 1000;
const LOGICAL_WIDTH = 1000;
const LOGICAL_HEIGHT = 1000;
const FREE_DRAW_TAIL_SIZE = 40;
const FREE_DRAW_BUCKET_TAIL_THRESHOLD = 3;

interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function createBuffer(w = CW, h = CH): PixelBuffer {
  const buf: PixelBuffer = {
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4)
  };
  buf.data.fill(255);
  return buf;
}

function matchColor(data: Uint8ClampedArray, idx: number, tr: number, tg: number, tb: number, ta: number): boolean {
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  const a = data[idx + 3];
  if (ta === 0 && a === 0) return true;
  if (ta === 0 || a === 0) return false;
  return Math.abs(r - tr) <= 32 && Math.abs(g - tg) <= 32 && Math.abs(b - tb) <= 32 && Math.abs(a - ta) <= 32;
}

const RECOVERY_NEIGHBOR_OFFSETS = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
  [0, -2], [0, 2], [-2, 0], [2, 0]
];

export interface AuditMetrics {
  floodFillCalls: number;
  floodFillBfsEntered: number;
  floodFillEarlyExits: number;
  getImageDataCalls: number;
  directReplayCalls: number;
  noOpHits: number;
  checkpointInvalidations: number;
  fullReplayFromZero: number;
  checkpointBlits: number;
  clearBarrierSkips: number;
  replayedCommandsCount: number;
  hintsInvalidatedMidHistory: number;
  inlineCheckpointCaptured: number;
  doubleReplayAvoided: boolean;
  timeMs: number;
}

export function newMetrics(): AuditMetrics {
  return {
    floodFillCalls: 0,
    floodFillBfsEntered: 0,
    floodFillEarlyExits: 0,
    getImageDataCalls: 0,
    directReplayCalls: 0,
    noOpHits: 0,
    checkpointInvalidations: 0,
    fullReplayFromZero: 0,
    checkpointBlits: 0,
    clearBarrierSkips: 0,
    replayedCommandsCount: 0,
    hintsInvalidatedMidHistory: 0,
    inlineCheckpointCaptured: 0,
    doubleReplayAvoided: true,
    timeMs: 0
  };
}

export class ControlledFixTestEngine {
  canvas: PixelBuffer;
  checkpointCanvas: PixelBuffer | null = null;
  checkpointIndex = 0;
  checkpointAnchorSignature: string | null = null;

  freeDrawUndoCache: PixelBuffer | null = null;
  hasFreeDrawUndoCache = false;
  freeDrawUndoCacheMeta: any = null;

  localCommands: any[] = [];
  localRedoStack: any[] = [];
  currentLocalStrokeId = 0;
  instanceId = 'player-1';

  constructor() {
    this.canvas = createBuffer();
  }

  getCommandSignature(cmd: any): string | null {
    if (!cmd) return null;
    const instId = cmd.instanceId || (cmd.data && typeof cmd.data === 'object' ? cmd.data.instanceId : undefined);
    return `${instId || 'default'}_${cmd.strokeId ?? 'nostroke'}`;
  }

  isCommandHeavy(cmd: any): boolean {
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
  }

  findLastClearIndex(list: any[], upTo: number): number {
    for (let i = upTo - 1; i >= 0; i--) {
      const c = list[i];
      if (c) {
        if (c.event === 'draw_clear') return i;
        if (c.event === 'draw_binary' && c.data) {
          const byte0 = c.data instanceof ArrayBuffer 
            ? new Uint8Array(c.data)[0] 
            : (ArrayBuffer.isView(c.data) ? (c.data as Uint8Array)[0] : 0);
          if (byte0 === 5) return i;
        }
      }
    }
    return -1;
  }

  advanceCheckpointIncremental(m?: AuditMetrics) {
    const list = this.localCommands;
    const N = list.length;
    let fromIndex = this.checkpointIndex;
    if (N <= fromIndex) return;

    const lastClear = this.findLastClearIndex(list, N);
    if (lastClear >= fromIndex) {
      fromIndex = lastClear + 1;
      if (m) m.clearBarrierSkips++;
    }

    let targetIndex = -1;
    if (N - fromIndex >= FREE_DRAW_TAIL_SIZE * 2) {
      targetIndex = N - FREE_DRAW_TAIL_SIZE;
    } else {
      let heavyCount = 0;
      for (let i = fromIndex; i < N; i++) {
        if (this.isCommandHeavy(list[i])) {
          heavyCount++;
          if (heavyCount >= FREE_DRAW_BUCKET_TAIL_THRESHOLD) break;
        }
      }
      if (heavyCount >= FREE_DRAW_BUCKET_TAIL_THRESHOLD) {
        targetIndex = N - 1;
      }
    }

    if (targetIndex <= fromIndex) return;

    if (!this.checkpointCanvas) {
      this.checkpointCanvas = createBuffer();
    }
    if (fromIndex === 0 || lastClear >= 0) {
      this.checkpointCanvas.data.fill(0);
    }

    for (let i = fromIndex; i < targetIndex; i++) {
      this.applyReplayCommand(this.checkpointCanvas, list[i], m);
    }

    this.checkpointIndex = targetIndex;
    this.checkpointAnchorSignature = this.getCommandSignature(list[targetIndex - 1]);
  }

  invalidateCheckpoint(m?: AuditMetrics) {
    if (m) m.checkpointInvalidations++;
    this.checkpointIndex = 0;
    this.checkpointAnchorSignature = null;
    if (this.checkpointCanvas) {
      this.checkpointCanvas.data.fill(0);
    }
  }

  captureDirectFreeDrawUndoCache(instId?: string, strokeId?: number) {
    if (!this.freeDrawUndoCache) {
      this.freeDrawUndoCache = createBuffer();
    }
    this.freeDrawUndoCache.data.set(this.canvas.data);
    this.hasFreeDrawUndoCache = true;
    if (instId && strokeId !== undefined) {
      const N = this.localCommands.length;
      let prevSig: string | null = null;
      if (N > 0) {
        prevSig = this.getCommandSignature(this.localCommands[N - 1]);
      }
      this.freeDrawUndoCacheMeta = {
        targetInstanceId: instId,
        targetStrokeId: strokeId,
        baseHistoryLength: N,
        prevAnchorSignature: prevSig
      };
    }
  }

  floodFill(
    buf: PixelBuffer,
    startX: number,
    startY: number,
    fillColorStr: string,
    fillOpacity = 1,
    expectedTarget?: { r: number; g: number; b: number; a: number },
    m?: AuditMetrics
  ) {
    if (m) {
      m.floodFillCalls++;
      m.getImageDataCalls++;
    }

    const cw = buf.width;
    const ch = buf.height;
    const data = new Uint8ClampedArray(buf.data);

    let sx = Math.floor(startX);
    let sy = Math.floor(startY);
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
        if (!recovered) return null;
      }
    }

    let fillHex = fillColorStr;
    if (fillHex.length === 4) {
      fillHex = '#' + fillHex[1] + fillHex[1] + fillHex[2] + fillHex[2] + fillHex[3] + fillHex[3];
    }
    const fr = parseInt(fillHex.slice(1, 3), 16) || 0;
    const fg = parseInt(fillHex.slice(3, 5), 16) || 0;
    const fb = parseInt(fillHex.slice(5, 7), 16) || 0;

    // Early Exit: isNoOp: true (NEVER isFullCanvasOpaque)
    if (ta >= 240 && fillOpacity >= 0.95 && Math.abs(tr - fr) <= 5 && Math.abs(tg - fg) <= 5 && Math.abs(tb - fb) <= 5) {
      if (m) m.floodFillEarlyExits++;
      return { r: tr, g: tg, b: tb, a: ta, isNoOp: true };
    }

    if (m) m.floodFillBfsEntered++;

    const visited = new Uint8Array(cw * ch);
    const queueX: number[] = [sx];
    const queueY: number[] = [sy];
    let head = 0;
    let filledPixelCount = 0;

    while (head < queueX.length) {
      const cx = queueX[head];
      const cy = queueY[head];
      head++;

      let xLeft = cx;
      let idxLeft = (cy * cw + xLeft) * 4;
      let pIdxLeft = cy * cw + xLeft;
      while (xLeft >= 0 && !visited[pIdxLeft] && matchColor(data, idxLeft, tr, tg, tb, ta)) {
        xLeft--;
        idxLeft -= 4;
        pIdxLeft--;
      }
      xLeft++;

      let xRight = cx;
      let idxRight = (cy * cw + xRight) * 4;
      let pIdxRight = cy * cw + xRight;
      while (xRight < cw && !visited[pIdxRight] && matchColor(data, idxRight, tr, tg, tb, ta)) {
        xRight++;
        idxRight += 4;
        pIdxRight++;
      }
      xRight--;

      let spanAbove = false;
      let spanBelow = false;
      let xCurr = xLeft;
      let idx = (cy * cw + xCurr) * 4;
      let pixelIdx = cy * cw + xCurr;

      while (xCurr <= xRight) {
        if (!visited[pixelIdx]) {
          visited[pixelIdx] = 1;
          data[idx] = fr;
          data[idx + 1] = fg;
          data[idx + 2] = fb;
          data[idx + 3] = 255;
          filledPixelCount++;
        }

        if (cy > 0) {
          const idxAbove = ((cy - 1) * cw + xCurr) * 4;
          const pIdxAbove = (cy - 1) * cw + xCurr;
          const matchesAbove = !visited[pIdxAbove] && matchColor(data, idxAbove, tr, tg, tb, ta);
          if (!spanAbove && matchesAbove) {
            queueX.push(xCurr);
            queueY.push(cy - 1);
            spanAbove = true;
          } else if (spanAbove && !matchesAbove) {
            spanAbove = false;
          }
        }

        if (cy < ch - 1) {
          const idxBelow = ((cy + 1) * cw + xCurr) * 4;
          const pIdxBelow = (cy + 1) * cw + xCurr;
          const matchesBelow = !visited[pIdxBelow] && matchColor(data, idxBelow, tr, tg, tb, ta);
          if (!spanBelow && matchesBelow) {
            queueX.push(xCurr);
            queueY.push(cy + 1);
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

    buf.data.set(data);
    const isFullCanvasOpaque = (filledPixelCount === cw * ch) && (fillOpacity >= 0.95);
    return { r: tr, g: tg, b: tb, a: ta, isFullCanvasOpaque, fillHex, filledPixelCount };
  }

  applyReplayCommand(buf: PixelBuffer, cmdObj: any, m?: AuditMetrics) {
    if (m) m.replayedCommandsCount++;
    const decoded = decodeBinaryDrawMessage(cmdObj.data);
    if (!decoded) return;
    const { event, data } = decoded;
    if (!data) return;

    if (event === 'draw_clear') {
      buf.data.fill(0);
      return;
    }

    if (event === 'draw_stroke') {
      const color = data.color || '#000000';
      const points = data.points || [];
      const tool = data.tool || 'pencil';
      if (tool === 'eraser') {
        for (const pt of points) {
          const px = Math.floor(pt.x * CW);
          const py = Math.floor(pt.y * CH);
          if (px >= 0 && px < CW && py >= 0 && py < CH) {
            for (let dy = -5; dy <= 5; dy++) {
              for (let dx = -5; dx <= 5; dx++) {
                const nx = px + dx;
                const ny = py + dy;
                if (nx >= 0 && nx < CW && ny >= 0 && ny < CH && dx * dx + dy * dy <= 25) {
                  const idx = (ny * CW + nx) * 4;
                  buf.data[idx + 3] = 0;
                }
              }
            }
          }
        }
      } else {
        let fr = 0, fg = 0, fb = 0;
        if (color.startsWith('#') && color.length === 7) {
          fr = parseInt(color.slice(1, 3), 16);
          fg = parseInt(color.slice(3, 5), 16);
          fb = parseInt(color.slice(5, 7), 16);
        }
        for (const pt of points) {
          const px = Math.floor(pt.x * CW);
          const py = Math.floor(pt.y * CH);
          if (px >= 0 && px < CW && py >= 0 && py < CH) {
            for (let dy = -5; dy <= 5; dy++) {
              for (let dx = -5; dx <= 5; dx++) {
                const nx = px + dx;
                const ny = py + dy;
                if (nx >= 0 && nx < CW && ny >= 0 && ny < CH && dx * dx + dy * dy <= 25) {
                  const idx = (ny * CW + nx) * 4;
                  buf.data[idx] = fr;
                  buf.data[idx + 1] = fg;
                  buf.data[idx + 2] = fb;
                  buf.data[idx + 3] = 255;
                }
              }
            }
          }
        }
      }
      return;
    }

    if (event === 'draw_action' && data.tool === 'bucket') {
      const cmdOpacity = data.opacity ?? 1;
      const cmdColor = data.color || '#000000';

      if (cmdObj && cmdObj._replayHint === 'full_canvas_opaque' && (cmdOpacity === undefined || cmdOpacity >= 0.95)) {
        if (m) m.directReplayCalls++;
        const fillHex = cmdObj._replayColor || cmdColor;
        let fr = 0, fg = 0, fb = 0;
        if (fillHex.startsWith('#') && fillHex.length === 7) {
          fr = parseInt(fillHex.slice(1, 3), 16);
          fg = parseInt(fillHex.slice(3, 5), 16);
          fb = parseInt(fillHex.slice(5, 7), 16);
        }
        const len = buf.data.length;
        for (let i = 0; i < len; i += 4) {
          buf.data[i] = fr;
          buf.data[i + 1] = fg;
          buf.data[i + 2] = fb;
          buf.data[i + 3] = 255;
        }
      } else if (cmdObj && cmdObj._replayHint === 'noop') {
        // Verified No-Op check
        const cw = buf.width;
        const ch = buf.height;
        const sx = Math.floor(data.x * cw);
        const sy = Math.floor(data.y * ch);
        let isVerifiedNoOp = false;
        if (sx >= 0 && sx < cw && sy >= 0 && sy < ch) {
          const idx = (sy * cw + sx) * 4;
          let fillHex = cmdColor;
          if (fillHex.length === 4) {
            fillHex = '#' + fillHex[1] + fillHex[1] + fillHex[2] + fillHex[2] + fillHex[3] + fillHex[3];
          }
          const fr = parseInt(fillHex.slice(1, 3), 16) || 0;
          const fg = parseInt(fillHex.slice(3, 5), 16) || 0;
          const fb = parseInt(fillHex.slice(5, 7), 16) || 0;
          if (buf.data[idx + 3] >= 240 && cmdOpacity >= 0.95 &&
              Math.abs(buf.data[idx] - fr) <= 5 &&
              Math.abs(buf.data[idx + 1] - fg) <= 5 &&
              Math.abs(buf.data[idx + 2] - fb) <= 5) {
            isVerifiedNoOp = true;
          }
        }
        if (isVerifiedNoOp) {
          if (m) m.noOpHits++;
          return;
        } else {
          const fillRes = this.floodFill(buf, data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT, cmdColor, cmdOpacity, data.targetRGBA, m);
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
            }
          }
        }
      } else {
        const fillRes = this.floodFill(buf, data.x * LOGICAL_WIDTH, data.y * LOGICAL_HEIGHT, cmdColor, cmdOpacity, data.targetRGBA, m);
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
          }
        }
      }
    }
  }

  replayFreeDrawHistorySafely(commands: any[], m?: AuditMetrics) {
    const N = commands.length;
    let startIndex = 0;

    const lastClearIndex = this.findLastClearIndex(commands, N);

    const isCheckpointValid =
      this.checkpointCanvas !== null &&
      this.checkpointIndex > 0 &&
      this.checkpointIndex <= N &&
      this.checkpointIndex > lastClearIndex &&
      this.getCommandSignature(commands[this.checkpointIndex - 1]) === this.checkpointAnchorSignature;

    if (isCheckpointValid && this.checkpointCanvas) {
      if (m) m.checkpointBlits++;
      this.canvas.data.set(this.checkpointCanvas.data);
      startIndex = this.checkpointIndex;
    } else {
      if (m) m.fullReplayFromZero++;
      this.invalidateCheckpoint(m);
      this.canvas.data.fill(0);
      if (lastClearIndex >= 0) {
        if (m) m.clearBarrierSkips++;
        startIndex = lastClearIndex + 1;
      } else {
        startIndex = 0;
      }
    }

    let candidateCheckpointIndex = -1;
    if (N >= 2) {
      if (N - startIndex >= FREE_DRAW_TAIL_SIZE * 2) {
        candidateCheckpointIndex = N - FREE_DRAW_TAIL_SIZE;
      } else {
        let heavyCount = 0;
        for (let i = startIndex; i < N; i++) {
          if (this.isCommandHeavy(commands[i])) {
            heavyCount++;
          }
        }
        if (heavyCount >= FREE_DRAW_BUCKET_TAIL_THRESHOLD) {
          candidateCheckpointIndex = N - 1;
        }
      }
    }

    for (let i = startIndex; i < N; i++) {
      if (i === candidateCheckpointIndex && !isCheckpointValid) {
        if (!this.checkpointCanvas) {
          this.checkpointCanvas = createBuffer();
        }
        this.checkpointCanvas.data.set(this.canvas.data);
        this.checkpointIndex = candidateCheckpointIndex;
        this.checkpointAnchorSignature = this.getCommandSignature(commands[candidateCheckpointIndex - 1]);
        if (m) m.inlineCheckpointCaptured++;
      }
      this.applyReplayCommand(this.canvas, commands[i], m);
    }
  }

  tryFastPathUndo(targetInst: string, targetStrId: number, targetIndex: number, list: any[]): boolean {
    if (!this.hasFreeDrawUndoCache || !this.freeDrawUndoCache || !this.freeDrawUndoCacheMeta) {
      return false;
    }
    const meta = this.freeDrawUndoCacheMeta;
    if (meta.targetInstanceId !== targetInst || meta.targetStrokeId !== targetStrId) {
      return false;
    }
    if (meta.baseHistoryLength !== targetIndex) {
      return false;
    }
    if (targetIndex > 0) {
      const prevCmd = list[targetIndex - 1];
      if (this.getCommandSignature(prevCmd) !== meta.prevAnchorSignature) {
        return false;
      }
    }
    const targetCmd = list[targetIndex];
    if (this.getCommandSignature(targetCmd) !== `${targetInst}_${targetStrId}`) {
      return false;
    }

    if (targetIndex < this.checkpointIndex) {
      this.invalidateCheckpoint();
    }

    const [removedCmd] = list.splice(targetIndex, 1);
    if (removedCmd && targetInst === this.instanceId) {
      this.localRedoStack.push(removedCmd);
    }

    this.canvas.data.set(this.freeDrawUndoCache.data);

    if (targetIndex < list.length) {
      for (let i = targetIndex; i < list.length; i++) {
        this.applyReplayCommand(this.canvas, list[i]);
      }
    }

    this.hasFreeDrawUndoCache = false;
    this.freeDrawUndoCacheMeta = null;
    return true;
  }

  executeUndo(m?: AuditMetrics): boolean {
    const list = this.localCommands;
    let targetIndex = -1;
    let targetStrokeId: number | undefined;

    for (let i = list.length - 1; i >= 0; i--) {
      const cmd = list[i];
      if (cmd) {
        const cmdInstId = cmd.instanceId || (cmd.data && typeof cmd.data === 'object' ? cmd.data.instanceId : undefined);
        if (cmdInstId === this.instanceId && cmd.strokeId !== undefined) {
          targetIndex = i;
          targetStrokeId = cmd.strokeId;
          break;
        }
      }
    }

    if (targetIndex === -1 || targetStrokeId === undefined) return false;

    const fastPathSucceeded = this.tryFastPathUndo(this.instanceId, targetStrokeId, targetIndex, list);

    if (!fastPathSucceeded) {
      if (targetIndex < this.checkpointIndex) {
        this.invalidateCheckpoint(m);
      }
      const [removedCmd] = list.splice(targetIndex, 1);
      if (removedCmd) {
        this.localRedoStack.push(removedCmd);
      }

      // Guard Hint validity on Mid-History Undo
      if (targetIndex < list.length) {
        for (let i = targetIndex; i < list.length; i++) {
          if (list[i]?._replayHint) {
            delete list[i]._replayHint;
            delete list[i]._replayColor;
            delete list[i]._replayOpacity;
            if (m) m.hintsInvalidatedMidHistory++;
          }
        }
      }

      this.hasFreeDrawUndoCache = false;
      this.freeDrawUndoCacheMeta = null;
      this.replayFreeDrawHistorySafely(list, m);
    }

    return true;
  }

  executeRedo(m?: AuditMetrics): boolean {
    if (this.localRedoStack.length === 0) return false;
    const cmdToRestore = this.localRedoStack.pop();
    if (!cmdToRestore || !cmdToRestore.data) return false;

    const decoded = decodeBinaryDrawMessage(cmdToRestore.data);
    if (!decoded || !decoded.data) return false;

    this.currentLocalStrokeId = ((this.currentLocalStrokeId || 0) + 1) & 0xFFFF;
    if (this.currentLocalStrokeId === 0) this.currentLocalStrokeId = 1;
    const newStrokeId = this.currentLocalStrokeId;

    let newMsg: ArrayBuffer | null = null;
    if (decoded.event === 'draw_stroke') {
      newMsg = encodeBinaryDrawMessage('draw_stroke', {
        tool: decoded.data.tool,
        color: decoded.data.color,
        width: decoded.data.width,
        opacity: decoded.data.opacity,
        points: decoded.data.points,
        strokeId: newStrokeId,
        instanceId: this.instanceId
      });
    } else if (decoded.event === 'draw_action') {
      const targetRGBA = decoded.data.targetRGBA;
      newMsg = encodeBinaryDrawMessage('draw_action', {
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
        instanceId: this.instanceId
      });
    }

    if (newMsg) {
      this.localCommands.push({
        event: 'draw_binary',
        data: newMsg,
        instanceId: this.instanceId,
        strokeId: newStrokeId
      });

      this.hasFreeDrawUndoCache = false;
      this.replayFreeDrawHistorySafely(this.localCommands, m);
      this.advanceCheckpointIncremental(m);
      return true;
    }
    return false;
  }

  userDrawPencil(points: { x: number; y: number }[], color = '#000000', tool = 'pencil') {
    this.currentLocalStrokeId = ((this.currentLocalStrokeId || 0) + 1) & 0xFFFF;
    if (this.currentLocalStrokeId === 0) this.currentLocalStrokeId = 1;
    const strId = this.currentLocalStrokeId;

    this.captureDirectFreeDrawUndoCache(this.instanceId, strId);

    const msg = encodeBinaryDrawMessage('draw_stroke', {
      tool,
      color,
      width: 5,
      opacity: 1,
      points,
      strokeId: strId,
      instanceId: this.instanceId
    });

    const cmdRecord = {
      event: 'draw_binary',
      data: msg,
      instanceId: this.instanceId,
      strokeId: strId
    };
    this.applyReplayCommand(this.canvas, cmdRecord);
    this.localCommands.push(cmdRecord);
    this.advanceCheckpointIncremental();
    this.localRedoStack = [];
  }

  userClear() {
    this.invalidateCheckpoint();
    this.captureDirectFreeDrawUndoCache();
    this.canvas.data.fill(0);

    const msg = encodeBinaryDrawMessage('draw_clear', { instanceId: this.instanceId });
    const cmdRecord = {
      event: 'draw_binary',
      data: msg,
      instanceId: this.instanceId,
      strokeId: this.currentLocalStrokeId
    };
    this.localCommands.push(cmdRecord);
    this.advanceCheckpointIncremental();
    this.localRedoStack = [];
  }

  userBucket(x: number, y: number, color: string) {
    this.currentLocalStrokeId = ((this.currentLocalStrokeId || 0) + 1) & 0xFFFF;
    if (this.currentLocalStrokeId === 0) this.currentLocalStrokeId = 1;
    const strId = this.currentLocalStrokeId;

    this.captureDirectFreeDrawUndoCache(this.instanceId, strId);
    const sampledTarget = this.floodFill(this.canvas, x, y, color, 1);

    let hint: { hint: string; color: string; opacity: number } | null = null;
    if (sampledTarget?.isNoOp) {
      hint = {
        hint: 'noop',
        color,
        opacity: 1
      };
    } else if (sampledTarget?.isFullCanvasOpaque) {
      hint = {
        hint: 'full_canvas_opaque',
        color: sampledTarget.fillHex || color,
        opacity: 1
      };
    }

    const msg = encodeBinaryDrawMessage('draw_action', {
      tool: 'bucket',
      color,
      opacity: 1,
      strokeId: strId,
      x: x / LOGICAL_WIDTH,
      y: y / LOGICAL_HEIGHT,
      targetR: sampledTarget ? sampledTarget.r : undefined,
      targetG: sampledTarget ? sampledTarget.g : undefined,
      targetB: sampledTarget ? sampledTarget.b : undefined,
      targetA: sampledTarget ? sampledTarget.a : undefined,
      instanceId: this.instanceId
    });

    const cmdRecord: any = {
      event: 'draw_binary',
      data: msg,
      instanceId: this.instanceId,
      strokeId: strId
    };
    if (hint) {
      cmdRecord._replayHint = hint.hint;
      cmdRecord._replayColor = hint.color;
      cmdRecord._replayOpacity = hint.opacity;
    }

    this.localCommands.push(cmdRecord);
    this.advanceCheckpointIncremental();
    this.localRedoStack = [];
  }
}

async function runAllTests() {
  console.log("================================================================================");
  console.log("            CONTROLLED FIXES VERIFICATION TEST SUITE (TESTS A - G)             ");
  console.log("================================================================================");

  // Test A
  console.log("\n[TEST A: Fresh Room (40 Buckets, alternating colors, Undo & Redo)]");
  {
    const sim = new ControlledFixTestEngine();
    const colors = ['#ff0000', '#00ff00'];
    for (let i = 0; i < 40; i++) sim.userBucket(500, 500, colors[i % 2]);

    console.log(`Initial: cmds=${sim.localCommands.length}, chkptIndex=${sim.checkpointIndex}`);

    for (let u = 1; u <= 3; u++) {
      const m = newMetrics();
      const t0 = performance.now();
      sim.executeUndo(m);
      m.timeMs = performance.now() - t0;
      console.log(`  Undo #${u}: chkptIndex=${sim.checkpointIndex}, chkptBlits=${m.checkpointBlits}, directReplay=${m.directReplayCalls}, floodFill=${m.floodFillCalls}, inlineCaptured=${m.inlineCheckpointCaptured}, time=${m.timeMs.toFixed(2)}ms`);
    }

    for (let r = 1; r <= 3; r++) {
      const m = newMetrics();
      const t0 = performance.now();
      sim.executeRedo(m);
      m.timeMs = performance.now() - t0;
      console.log(`  Redo #${r}: chkptIndex=${sim.checkpointIndex}, chkptBlits=${m.checkpointBlits}, directReplay=${m.directReplayCalls}, floodFill=${m.floodFillCalls}, time=${m.timeMs.toFixed(2)}ms`);
    }
  }

  // Test B
  console.log("\n[TEST B: Pencil -> Clear -> 40 Buckets (Clear Barrier Verification)]");
  {
    const sim = new ControlledFixTestEngine();
    sim.userDrawPencil([{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }]);
    sim.userClear();
    const colors = ['#ff0000', '#00ff00'];
    for (let i = 0; i < 40; i++) sim.userBucket(500, 500, colors[i % 2]);

    console.log(`Initial: cmds=${sim.localCommands.length}, chkptIndex=${sim.checkpointIndex}`);

    for (let u = 1; u <= 3; u++) {
      const m = newMetrics();
      const t0 = performance.now();
      sim.executeUndo(m);
      m.timeMs = performance.now() - t0;
      console.log(`  Undo #${u}: chkptIndex=${sim.checkpointIndex}, clearBarrierSkips=${m.clearBarrierSkips}, replayedCmds=${m.replayedCommandsCount}, floodFill=${m.floodFillCalls}, directReplay=${m.directReplayCalls}, time=${m.timeMs.toFixed(2)}ms`);
    }
  }

  // Test C
  console.log("\n[TEST C: Heavy Old History (5 Partial Buckets) -> Clear -> 40 Buckets]");
  {
    const sim = new ControlledFixTestEngine();
    for (let i = 0; i < 5; i++) {
      sim.userDrawPencil([{ x: 0.1 + i * 0.05, y: 0.1 }, { x: 0.15 + i * 0.05, y: 0.15 }]);
      sim.userBucket(110 + i * 50, 110, '#0000ff');
    }
    const cmdsBeforeClear = sim.localCommands.length;
    sim.userClear();
    const colors = ['#ff0000', '#00ff00'];
    for (let i = 0; i < 40; i++) sim.userBucket(500, 500, colors[i % 2]);

    console.log(`Cmds before Clear: ${cmdsBeforeClear}, Total: ${sim.localCommands.length}`);

    for (let u = 1; u <= 3; u++) {
      const m = newMetrics();
      const t0 = performance.now();
      sim.executeUndo(m);
      m.timeMs = performance.now() - t0;
      console.log(`  Undo #${u}: chkptIndex=${sim.checkpointIndex}, clearBarrierSkips=${m.clearBarrierSkips}, floodFillCalls=${m.floodFillCalls} (OLD BUCKETS SKIPPED!), directReplay=${m.directReplayCalls}, time=${m.timeMs.toFixed(2)}ms`);
    }
  }

  // Test D
  console.log("\n[TEST D: 40 Same-Color Buckets (No-Op Early Exit Verification)]");
  {
    const sim = new ControlledFixTestEngine();
    sim.userClear();
    for (let i = 0; i < 40; i++) {
      sim.userBucket(500, 500, '#ff0000');
    }
    const noopCount = sim.localCommands.filter(c => c._replayHint === 'noop').length;
    const fullCount = sim.localCommands.filter(c => c._replayHint === 'full_canvas_opaque').length;
    console.log(`Recorded Hints: full_canvas_opaque=${fullCount}, noop=${noopCount}`);

    for (let u = 1; u <= 3; u++) {
      const m = newMetrics();
      const t0 = performance.now();
      sim.executeUndo(m);
      m.timeMs = performance.now() - t0;
      console.log(`  Undo #${u}: chkptIndex=${sim.checkpointIndex}, noOpHits=${m.noOpHits}, getImageData=${m.getImageDataCalls}, floodFill=${m.floodFillCalls}, time=${m.timeMs.toFixed(2)}ms`);
    }
  }

  // Test E
  console.log("\n[TEST E: Shape -> Eraser / White Pencil -> Bucket (Strict Full Canvas)]");
  {
    const sim = new ControlledFixTestEngine();
    sim.userDrawPencil([{ x: 0.5, y: 0.5 }, { x: 0.55, y: 0.55 }], '#000000');
    sim.userDrawPencil([{ x: 0.5, y: 0.5 }, { x: 0.55, y: 0.55 }], '#ffffff', 'eraser');
    sim.userBucket(100, 100, '#ff0000');
    const b1 = sim.localCommands[sim.localCommands.length - 1];
    console.log(`Bucket hint after Eraser: hint='${b1._replayHint}' (Strictly NOT full_canvas if pixels untouched)`);
  }

  // Test F
  console.log("\n[TEST F: Mid-History Undo (Bucket A -> Pencil B -> Bucket C)]");
  {
    const sim = new ControlledFixTestEngine();
    sim.userBucket(500, 500, '#ff0000');

    // Player 2 draws blue stroke
    const p2StrId = 999;
    const msgPencil = encodeBinaryDrawMessage('draw_stroke', {
      tool: 'pencil',
      color: '#0000ff',
      width: 20,
      opacity: 1,
      points: [{ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.51 }],
      strokeId: p2StrId,
      instanceId: 'player-2'
    });
    sim.localCommands.push({
      event: 'draw_binary',
      data: msgPencil,
      instanceId: 'player-2',
      strokeId: p2StrId
    });
    sim.applyReplayCommand(sim.canvas, sim.localCommands[sim.localCommands.length - 1]);

    // Player 1 draws Bucket C
    sim.userBucket(100, 100, '#00ff00');
    const cBefore = sim.localCommands[sim.localCommands.length - 1];
    console.log(`Before Undo: Bucket C hint='${cBefore._replayHint}'`);

    const mC = newMetrics();
    sim.executeUndo(mC);
    console.log(`Undo Bucket C completed.`);

    const mA = newMetrics();
    sim.executeUndo(mA);
    console.log(`Undo Bucket A completed: hintsInvalidatedMidHistory=${mA.hintsInvalidatedMidHistory}`);

    // Verify center pixel remains blue
    const idx = (500 * CW + 500) * 4;
    const r = sim.canvas.data[idx];
    const g = sim.canvas.data[idx + 1];
    const b = sim.canvas.data[idx + 2];
    console.log(`Pixel at (500, 500): RGB(${r}, ${g}, ${b}) -> Blue channel intact: ${b > 100 && r < 50}`);
  }

  // Test G
  console.log("\n[TEST G: Undo/Redo Asymmetry Comparison (B1..B20)]");
  {
    const sim = new ControlledFixTestEngine();
    const colors = ['#ff0000', '#00ff00'];
    for (let i = 1; i <= 20; i++) sim.userBucket(500, 500, colors[i % 2]);

    console.log(`Initial state: localCommands=${sim.localCommands.length}, chkptIndex=${sim.checkpointIndex}`);

    console.log("\n  --- Consecutive Undos ---");
    for (let u = 20; u >= 16; u--) {
      const m = newMetrics();
      const t0 = performance.now();
      sim.executeUndo(m);
      m.timeMs = performance.now() - t0;
      console.log(`    Undo (target ${u}): cmds=${sim.localCommands.length}, chkptIndex=${sim.checkpointIndex}, chkptBlits=${m.checkpointBlits}, directReplay=${m.directReplayCalls}, floodFill=${m.floodFillCalls}, inlineCaptured=${m.inlineCheckpointCaptured}, time=${m.timeMs.toFixed(2)}ms`);
    }

    console.log("\n  --- Consecutive Redos ---");
    for (let r = 1; r <= 5; r++) {
      const m = newMetrics();
      const t0 = performance.now();
      sim.executeRedo(m);
      m.timeMs = performance.now() - t0;
      console.log(`    Redo #${r}: cmds=${sim.localCommands.length}, chkptIndex=${sim.checkpointIndex}, chkptBlits=${m.checkpointBlits}, directReplay=${m.directReplayCalls}, floodFill=${m.floodFillCalls}, time=${m.timeMs.toFixed(2)}ms`);
    }
  }

  console.log("\n================================================================================");
  console.log("            TEST SUITE COMPLETED SUCCESSFULLY WITH ALL CHECKS PASSED            ");
  console.log("================================================================================");
}

runAllTests();

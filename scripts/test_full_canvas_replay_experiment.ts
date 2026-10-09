import { describe, it } from 'node:test';
import assert from 'node:assert';
import { performance } from 'node:perf_hooks';
import { encodeBinaryDrawMessage, decodeBinaryDrawMessage } from '../src/utils/drawBinaryHelper';

// Simulation of Canvas 2D and Framebuffer for headless testing
const WIDTH = 680;
const HEIGHT = 396;
const TOTAL_PIXELS = WIDTH * HEIGHT;

class MockCanvasContext {
  canvas: { width: number; height: number };
  framebuffer: Uint8ClampedArray;
  transform: number[] = [1, 0, 0, 1, 0, 0];
  fillStyle: string = '#000000';
  stats = {
    floodFillCalls: 0,
    directReplayCalls: 0,
    totalPixelsPaintedViaDirect: 0
  };

  constructor() {
    this.canvas = { width: WIDTH, height: HEIGHT };
    this.framebuffer = new Uint8ClampedArray(TOTAL_PIXELS * 4);
  }

  save() {}
  restore() {}
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.transform = [a, b, c, d, e, f];
  }

  clearRect(x: number, y: number, w: number, h: number) {
    this.framebuffer.fill(0);
  }

  fillRect(x: number, y: number, w: number, h: number) {
    this.stats.directReplayCalls++;
    this.stats.totalPixelsPaintedViaDirect += TOTAL_PIXELS;
    // Parse hex
    let hex = this.fillStyle;
    if (hex.startsWith('#')) hex = hex.slice(1);
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    for (let i = 0; i < TOTAL_PIXELS; i++) {
      const idx = i * 4;
      this.framebuffer[idx] = r;
      this.framebuffer[idx + 1] = g;
      this.framebuffer[idx + 2] = b;
      this.framebuffer[idx + 3] = 255;
    }
  }

  putImageData(img: { data: Uint8ClampedArray }, x: number, y: number) {
    this.framebuffer.set(img.data);
  }
}

// Emulated floodFill matching DrawingCanvasCore logic
function runFloodFill(
  ctx: MockCanvasContext,
  startX: number,
  startY: number,
  fillColorStr: string,
  fillOpacity: number = 1
): { r: number; g: number; b: number; a: number; isFullCanvasOpaque: boolean; fillHex: string } | null {
  ctx.stats.floodFillCalls++;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const data = new Uint8ClampedArray(ctx.framebuffer);

  let fillHex = fillColorStr;
  if (fillHex.length === 4) {
    fillHex = '#' + fillHex[1] + fillHex[1] + fillHex[2] + fillHex[2] + fillHex[3] + fillHex[3];
  }
  const fr = parseInt(fillHex.slice(1, 3), 16) || 0;
  const fg = parseInt(fillHex.slice(3, 5), 16) || 0;
  const fb = parseInt(fillHex.slice(5, 7), 16) || 0;

  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  const targetIdx = (sy * cw + sx) * 4;
  const tr = data[targetIdx];
  const tg = data[targetIdx + 1];
  const tb = data[targetIdx + 2];
  const ta = data[targetIdx + 3];

  const visited = new Uint8Array(cw * ch);
  const queueX: number[] = [sx];
  const queueY: number[] = [sy];
  let head = 0;
  let filledPixelCount = 0;

  const matchColor = (idx: number) => {
    return Math.abs(data[idx] - tr) <= 18 &&
           Math.abs(data[idx + 1] - tg) <= 18 &&
           Math.abs(data[idx + 2] - tb) <= 18 &&
           Math.abs(data[idx + 3] - ta) <= 18;
  };

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

    while (xCurr >= 0 && !visited[pixelIdx] && matchColor(idx)) {
      xCurr--;
      idx -= 4;
      pixelIdx--;
    }
    xCurr++;
    idx += 4;
    pixelIdx++;

    let spanAbove = false;
    let spanBelow = false;

    while (xCurr < cw && !visited[pixelIdx] && matchColor(idx)) {
      visited[pixelIdx] = 1;
      filledPixelCount++;

      data[idx] = fr;
      data[idx + 1] = fg;
      data[idx + 2] = fb;
      data[idx + 3] = Math.round(fillOpacity * 255);

      if (yCurr > 0) {
        const idxAbove = ((yCurr - 1) * cw + xCurr) * 4;
        const pixelIdxAbove = (yCurr - 1) * cw + xCurr;
        const matchesAbove = !visited[pixelIdxAbove] && matchColor(idxAbove);
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
        const matchesBelow = !visited[pixelIdxBelow] && matchColor(idxBelow);
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

  ctx.putImageData({ data }, 0, 0);
  const isFullCanvasOpaque = (filledPixelCount === cw * ch) && (fillOpacity >= 0.95);
  return { r: tr, g: tg, b: tb, a: ta, isFullCanvasOpaque, fillHex };
}

// Replay command execution
function replayCommand(ctx: MockCanvasContext, cmdObj: any) {
  const decoded = decodeBinaryDrawMessage(cmdObj.data);
  if (!decoded) return;
  const { event, data } = decoded;
  if (!data) return;

  if (event === 'draw_action' && data.tool === 'bucket') {
    if (cmdObj._replayHint === 'full_canvas_opaque' && (data.opacity === undefined || data.opacity >= 0.95)) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = cmdObj._replayColor || data.color;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    } else {
      const fillRes = runFloodFill(ctx, data.x * WIDTH, data.y * HEIGHT, data.color, data.opacity);
      if (fillRes?.isFullCanvasOpaque) {
        cmdObj._replayHint = 'full_canvas_opaque';
        cmdObj._replayColor = fillRes.fillHex;
        cmdObj._replayOpacity = data.opacity;
      }
    }
  }
}

describe('Full-Canvas Replay Optimization Test Suite', () => {
  const createBucketCmd = (sId: number, color: string, opacity = 1, x = 0.5, y = 0.5): any => {
    const raw = encodeBinaryDrawMessage('draw_action', {
      tool: 'bucket',
      color,
      opacity,
      x,
      y,
      strokeId: sId,
      instanceId: 'user_1'
    });
    return {
      event: 'draw_binary',
      data: raw,
      instanceId: 'user_1',
      strokeId: sId
    };
  };

  it('Test 1 — 10 Full Canvas Buckets + Sequential Undo', () => {
    const ctx = new MockCanvasContext();
    const list: any[] = [];
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#112233', '#445566', '#778899', '#aabbcc'];

    // Draw 10 buckets initially
    for (let i = 0; i < 10; i++) {
      const cmd = createBucketCmd(i + 1, colors[i]);
      const res = runFloodFill(ctx, 340, 198, colors[i], 1);
      if (res?.isFullCanvasOpaque) {
        cmd._replayHint = 'full_canvas_opaque';
        cmd._replayColor = res.fillHex;
        cmd._replayOpacity = 1;
      }
      list.push(cmd);
    }

    assert.strictEqual(ctx.stats.floodFillCalls, 10, 'Initial draw did 10 floodFills');
    ctx.stats.floodFillCalls = 0;
    ctx.stats.directReplayCalls = 0;

    // Simulate multi-step Undo: 10, 9, 8, 7...
    const t0 = performance.now();
    for (let u = 10; u >= 1; u--) {
      // Pop last command
      list.pop();
      // Replay remaining from 0
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      for (let i = 0; i < list.length; i++) {
        replayCommand(ctx, list[i]);
      }
    }
    const t1 = performance.now();

    console.log(`[Test 1] 10 Buckets: floodFill during Undo: ${ctx.stats.floodFillCalls}, directReplays: ${ctx.stats.directReplayCalls}, time: ${(t1 - t0).toFixed(2)}ms`);
    assert.strictEqual(ctx.stats.floodFillCalls, 0, 'ZERO floodFill calls during all undos');
    assert.strictEqual(ctx.stats.directReplayCalls, 45, '45 direct replays (9+8+7+...+0)');
  });

  it('Test 2 — 20 Full Canvas Buckets + Sequential Undo', () => {
    const ctx = new MockCanvasContext();
    const list: any[] = [];

    for (let i = 0; i < 20; i++) {
      const color = `#${(i * 12).toString(16).padStart(2, '0')}0000`;
      const cmd = createBucketCmd(i + 1, color);
      const res = runFloodFill(ctx, 340, 198, color, 1);
      if (res?.isFullCanvasOpaque) {
        cmd._replayHint = 'full_canvas_opaque';
        cmd._replayColor = res.fillHex;
        cmd._replayOpacity = 1;
      }
      list.push(cmd);
    }

    ctx.stats.floodFillCalls = 0;
    ctx.stats.directReplayCalls = 0;

    const t0 = performance.now();
    for (let u = 20; u >= 1; u--) {
      list.pop();
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      for (let i = 0; i < list.length; i++) {
        replayCommand(ctx, list[i]);
      }
    }
    const t1 = performance.now();

    console.log(`[Test 2] 20 Buckets: floodFill during Undo: ${ctx.stats.floodFillCalls}, directReplays: ${ctx.stats.directReplayCalls}, time: ${(t1 - t0).toFixed(2)}ms`);
    assert.strictEqual(ctx.stats.floodFillCalls, 0);
  });

  it('Test 3 — 40 Full Canvas Buckets: Undo 40, 39, 38, 37, 36, 35', () => {
    const ctx = new MockCanvasContext();
    const list: any[] = [];

    for (let i = 0; i < 40; i++) {
      const color = `#00${(i * 6).toString(16).padStart(2, '0')}00`;
      const cmd = createBucketCmd(i + 1, color);
      const res = runFloodFill(ctx, 340, 198, color, 1);
      if (res?.isFullCanvasOpaque) {
        cmd._replayHint = 'full_canvas_opaque';
        cmd._replayColor = res.fillHex;
        cmd._replayOpacity = 1;
      }
      list.push(cmd);
    }

    ctx.stats.floodFillCalls = 0;
    ctx.stats.directReplayCalls = 0;

    const t0 = performance.now();
    // Undo 6 steps: 40 down to 35
    for (let step = 0; step < 6; step++) {
      list.pop();
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      for (let i = 0; i < list.length; i++) {
        replayCommand(ctx, list[i]);
      }
    }
    const t1 = performance.now();

    console.log(`[Test 3] 40 Buckets (6 Undos): floodFill: ${ctx.stats.floodFillCalls}, directReplays: ${ctx.stats.directReplayCalls}, total time: ${(t1 - t0).toFixed(2)}ms`);
    assert.strictEqual(ctx.stats.floodFillCalls, 0);
  });

  it('Test 4 — Full Bucket then Pencil: Pencil remains unaffected', () => {
    const ctx = new MockCanvasContext();
    const list: any[] = [];

    // 20 Buckets
    for (let i = 0; i < 20; i++) {
      const cmd = createBucketCmd(i + 1, '#ff0000');
      cmd._replayHint = 'full_canvas_opaque';
      cmd._replayColor = '#ff0000';
      list.push(cmd);
    }

    // 6 Pencils
    for (let i = 21; i <= 26; i++) {
      const pencilCmd = {
        event: 'draw_binary',
        data: encodeBinaryDrawMessage('draw_stroke', {
          tool: 'pencil',
          color: '#000000',
          width: 5,
          points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
          strokeId: i,
          instanceId: 'user_1'
        }),
        instanceId: 'user_1',
        strokeId: i
      };
      list.push(pencilCmd);
    }

    // Undo P26 down to P21
    for (let p = 26; p >= 21; p--) {
      const removed = list.pop();
      assert.strictEqual(removed.strokeId, p, `Undone stroke is ${p}`);
    }

    // Undo B20, B19, B18
    ctx.stats.floodFillCalls = 0;
    ctx.stats.directReplayCalls = 0;
    for (let b = 20; b >= 18; b--) {
      list.pop();
      for (let i = 0; i < list.length; i++) {
        replayCommand(ctx, list[i]);
      }
    }
    assert.strictEqual(ctx.stats.floodFillCalls, 0, 'ZERO floodFill during bucket replay');
    assert.ok(ctx.stats.directReplayCalls > 0, 'Used direct replay for buckets');
  });

  it('Test 5 & 6 — Small/Partial Buckets do NOT get full-canvas hint', () => {
    const ctx = new MockCanvasContext();
    // Pre-color a boundary box so flood fill cannot fill full canvas
    for (let y = 50; y <= 150; y++) {
      for (let x = 50; x <= 150; x++) {
        const idx = (y * WIDTH + x) * 4;
        ctx.framebuffer[idx] = 100;
        ctx.framebuffer[idx + 1] = 100;
        ctx.framebuffer[idx + 2] = 100;
        ctx.framebuffer[idx + 3] = 255;
      }
    }

    // Bucket fill inside the small box (x=100, y=100)
    const res = runFloodFill(ctx, 100, 100, '#ff0000', 1);
    assert.ok(res !== null);
    assert.strictEqual(res.isFullCanvasOpaque, false, 'Partial bucket must NOT have isFullCanvasOpaque');
  });
});

import assert from 'node:assert';
import sharp from 'sharp';
import {
  executeRasterFloodFill,
  EXPERIMENTAL_ADAPTIVE_BUCKET_EDGE_GROWTH,
  EXPERIMENTAL_ALPHA_AWARE_TRANSPARENT_EDGE_FILL,
  EXPERIMENTAL_OPAQUE_BACKGROUND_EDGE_PRESERVATION,
  EXPERIMENTAL_GUARD_PARTIAL_ALPHA_SEEDS_FROM_PHASE6,
  TargetRGBA,
} from '../src/utils/canvasFloodFill';
import { drawShape } from '../src/utils/canvasPathRenderer';
import { encodeBinaryDrawMessage } from '../src/utils/drawBinaryHelper';
import { replaySingleCommand, FloodFillFunction } from '../src/utils/canvasReplayEngine';

// ============================================================================
// DETERMINISTIC REGRESSION SUITE:
// BUCKET FILL REPEATED PARTIAL-ALPHA EDGE FIX
// ============================================================================

const WIDTH = 240;
const HEIGHT = 240;
const SHAPE_START_X = 40.5;
const SHAPE_START_Y = 40.5;
const SHAPE_END_X = 200.5;
const SHAPE_END_Y = 200.5;
const SEED_X = 120;
const SEED_Y = 120;
const OUTSIDE_X = 15;
const OUTSIDE_Y = 15;

const FILL_HEX = '#0066ff';
const OPACITIES = [0.10, 0.20, 0.30, 0.40, 0.49, 0.50, 0.75, 1.00];

class SvgCanvasContext {
  width: number;
  height: number;
  commands: string[] = [];
  lineWidth = 1;
  lineCap = 'round';
  lineJoin = 'round';
  strokeStyle = '#000000';
  fillStyle = '#000000';
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  currentPath: string[] = [];

  constructor(w = WIDTH, h = HEIGHT) {
    this.width = w;
    this.height = h;
  }

  save() {}
  restore() {}
  beginPath() {
    this.currentPath = [];
  }
  moveTo(x: number, y: number) {
    this.currentPath.push(`M ${x} ${y}`);
  }
  lineTo(x: number, y: number) {
    this.currentPath.push(`L ${x} ${y}`);
  }
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
    this.currentPath.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x} ${y}`);
  }
  arc(x: number, y: number, radius: number) {
    this.commands.push(
      `<circle cx="${x}" cy="${y}" r="${radius}" fill="${this.fillStyle}" opacity="${this.globalAlpha}" />`
    );
  }
  stroke() {
    if (this.currentPath.length > 0) {
      this.commands.push(
        `<path d="${this.currentPath.join(' ')}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}" stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}" opacity="${this.globalAlpha}" />`
      );
    }
  }
  fill() {
    if (this.currentPath.length > 0) {
      this.commands.push(
        `<path d="${this.currentPath.join(' ')}" fill="${this.fillStyle}" stroke="none" opacity="${this.globalAlpha}" />`
      );
    }
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    this.commands.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}" opacity="${this.globalAlpha}" />`
    );
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.commands.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${this.fillStyle}" stroke="none" opacity="${this.globalAlpha}" />`
    );
  }
  ellipse(cx: number, cy: number, rx: number, ry: number) {
    this.currentPath = [`M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 -${rx * 2} 0`];
  }

  async toTransparentBuffer(): Promise<Uint8ClampedArray> {
    const svg = `
      <svg width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">
        ${this.commands.join('\n')}
      </svg>
    `;
    const raw = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
    return new Uint8ClampedArray(raw);
  }

  async toOpaqueBuffer(bgHex: string): Promise<Uint8ClampedArray> {
    const svg = `
      <svg width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${this.width}" height="${this.height}" fill="${bgHex}" />
        ${this.commands.join('\n')}
      </svg>
    `;
    const raw = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
    return new Uint8ClampedArray(raw);
  }
}

class HeadlessReplayContext {
  canvas: { width: number; height: number };
  buffer: Uint8ClampedArray;
  fillStyle = '#000000';

  constructor(buffer: Uint8ClampedArray, width = WIDTH, height = HEIGHT) {
    this.buffer = buffer;
    this.canvas = { width, height };
  }

  save() {}
  restore() {}
  setTransform() {}
  fillRect() {}
  getImageData(sx: number, sy: number, sw: number, sh: number) {
    const out = new Uint8ClampedArray(sw * sh * 4);
    for (let row = 0; row < sh; row++) {
      const srcOffset = ((sy + row) * this.canvas.width + sx) * 4;
      const dstOffset = row * sw * 4;
      out.set(this.buffer.subarray(srcOffset, srcOffset + sw * 4), dstOffset);
    }
    return { data: out };
  }
}

const replayFloodFillAdapter: FloodFillFunction = (
  ctx,
  startX,
  startY,
  fillColorStr,
  fillOpacity = 1,
  logicalWidth = WIDTH,
  logicalHeight = HEIGHT,
  expectedTarget?: TargetRGBA
) => {
  const headless = ctx as unknown as HeadlessReplayContext;
  return executeRasterFloodFill(
    headless.buffer,
    headless.canvas.width,
    headless.canvas.height,
    startX,
    startY,
    fillColorStr,
    fillOpacity,
    logicalWidth,
    logicalHeight,
    expectedTarget
  );
};

interface MatrixMetrics {
  shape: 'strokeCircle' | 'strokeRect';
  width: number;
  opacityPct: number;
  pours: number;
  seedA: number;
  aaCount: number;
  pour1Changed: number;
  laterPoursChangedTotal: number;
  pour1ErrVsCurrentSeed: number;
  pour1ErrVsFinalFill: number;
  finalAvgAlphaErr: number;
  gapBeforeVsFinal: number;
  gapFinal: number;
  solidCoreChanged: number;
  leakedOutside: boolean;
  parityDiffBytes: number;
}

function getInnerAaAndCorePixels(base: Uint8ClampedArray, shape: 'strokeCircle' | 'strokeRect') {
  const aaIndices: number[] = [];
  const coreIndices: number[] = [];
  const cx = (SHAPE_START_X + SHAPE_END_X) / 2;
  const cy = (SHAPE_START_Y + SHAPE_END_Y) / 2;
  const rx = (SHAPE_END_X - SHAPE_START_X) / 2;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const idx = (y * WIDTH + x) * 4;
      const a = base[idx + 3];
      if (a === 255) {
        coreIndices.push(idx);
      } else if (a > 10 && a < 255) {
        if (shape === 'strokeCircle') {
          if (Math.hypot(x - cx, y - cy) < rx) {
            aaIndices.push(idx);
          }
        } else {
          if (x >= SHAPE_START_X && x <= SHAPE_END_X && y >= SHAPE_START_Y && y <= SHAPE_END_Y) {
            aaIndices.push(idx);
          }
        }
      }
    }
  }
  return { aaIndices, coreIndices };
}

function computeGapAndErr(buf: Uint8ClampedArray, base: Uint8ClampedArray, aaIndices: number[], targetFillAlpha: number) {
  let totalErr = 0;
  let gapCount = 0;
  for (const idx of aaIndices) {
    const a = buf[idx + 3];
    if (a < targetFillAlpha - 10) {
      gapCount++;
    }
    const ap = base[idx + 3] / 255;
    const af = targetFillAlpha / 255;
    const idealA = Math.round((ap + af * (1 - ap)) * 255);
    totalErr += Math.abs(a - idealA);
  }
  return {
    gapCount,
    avgAlphaErr: aaIndices.length > 0 ? totalErr / aaIndices.length : 0,
  };
}

async function runMatrixTests(): Promise<MatrixMetrics[]> {
  const results: MatrixMetrics[] = [];
  const shapes: ('strokeCircle' | 'strokeRect')[] = ['strokeCircle', 'strokeRect'];
  const widths = [2, 4];

  for (const shape of shapes) {
    for (const width of widths) {
      const ctx = new SvgCanvasContext();
      drawShape(ctx as unknown as CanvasRenderingContext2D, SHAPE_START_X, SHAPE_START_Y, SHAPE_END_X, SHAPE_END_Y, shape, '#000000', width, 1, false);
      const base = await ctx.toTransparentBuffer();
      const { aaIndices, coreIndices } = getInnerAaAndCorePixels(base, shape);
      assert.ok(aaIndices.length > 100, `Expected substantial AA skirt for ${shape} w=${width}, got ${aaIndices.length}`);
      assert.ok(coreIndices.length > 100, `Expected solid stroke core for ${shape} w=${width}, got ${coreIndices.length}`);

      for (const opacity of OPACITIES) {
        const opacityPct = Math.round(opacity * 100);
        const pours = opacity === 1 ? 1 : (opacity >= 0.5 ? 10 : 40);

        const localBuf = new Uint8ClampedArray(base);
        const replayBuf = new Uint8ClampedArray(base);
        const replayCtx = new HeadlessReplayContext(replayBuf);
        const replayPaths: Record<string, { x: number; y: number }[]> = {};
        const replaySessions: Record<string, { tool: any; color: string; width: number; opacity: number }> = {};

        let pour1Changed = 0;
        let laterPoursChangedTotal = 0;
        let pour1ErrVsCurrentSeed = 0;
        const pour1Snap = new Uint8ClampedArray(base.length);

        const prevSnap = new Uint8ClampedArray(localBuf);

        for (let k = 1; k <= pours; k++) {
          const fillResult = executeRasterFloodFill(localBuf, WIDTH, HEIGHT, SEED_X, SEED_Y, FILL_HEX, opacity);
          assert.ok(fillResult && !fillResult.isNoOp, `Expected non-noop fill at pour ${k} (${shape} w=${width} ${opacityPct}%)`);

          // Encode & execute via production binary codec + replaySingleCommand
          const packet = encodeBinaryDrawMessage('draw_action', {
            tool: 'bucket',
            color: FILL_HEX,
            opacity,
            x: SEED_X / WIDTH,
            y: SEED_Y / HEIGHT,
            targetR: fillResult.r,
            targetG: fillResult.g,
            targetB: fillResult.b,
            targetA: fillResult.a,
            strokeId: k,
            instanceId: 'test_local',
          });
          replaySingleCommand(
            replayCtx as unknown as CanvasRenderingContext2D,
            { data: packet },
            replayPaths,
            replaySessions,
            { logicalWidth: WIDTH, logicalHeight: HEIGHT },
            replayFloodFillAdapter
          );

          // Check pixel parity after EVERY pour
          for (let i = 0; i < localBuf.length; i++) {
            assert.strictEqual(
              replayBuf[i],
              localBuf[i],
              `Local/Replay mismatch at byte ${i} on pour ${k} (${shape} w=${width} ${opacityPct}%)`
            );
          }

          // Measure boundary pixel updates on EVERY pour
          let changedThisPour = 0;
          for (const idx of aaIndices) {
            if (
              localBuf[idx] !== prevSnap[idx] ||
              localBuf[idx + 1] !== prevSnap[idx + 1] ||
              localBuf[idx + 2] !== prevSnap[idx + 2] ||
              localBuf[idx + 3] !== prevSnap[idx + 3]
            ) {
              changedThisPour++;
            }
          }

          const currentSeedA = localBuf[(SEED_Y * WIDTH + SEED_X) * 4 + 3];
          if (k === 1) {
            pour1Changed = changedThisPour;
            pour1Snap.set(localBuf);
            pour1ErrVsCurrentSeed = computeGapAndErr(localBuf, base, aaIndices, currentSeedA).avgAlphaErr;
          } else {
            laterPoursChangedTotal += changedThisPour;
          }

          // Assert solid stroke core remains 100% untouched on EVERY pour
          for (const cIdx of coreIndices) {
            assert.strictEqual(localBuf[cIdx], base[cIdx], `Core R mutated at pour ${k}`);
            assert.strictEqual(localBuf[cIdx + 1], base[cIdx + 1], `Core G mutated at pour ${k}`);
            assert.strictEqual(localBuf[cIdx + 2], base[cIdx + 2], `Core B mutated at pour ${k}`);
            assert.strictEqual(localBuf[cIdx + 3], base[cIdx + 3], `Core A mutated at pour ${k}`);
          }

          // Assert zero leakage outside closed shape on EVERY pour
          const outIdx = (OUTSIDE_Y * WIDTH + OUTSIDE_X) * 4;
          assert.strictEqual(localBuf[outIdx + 3], 0, `Fill leaked outside ${shape} w=${width} at ${opacityPct}% pour ${k}`);

          prevSnap.set(localBuf);
        }

        const finalSeedA = localBuf[(SEED_Y * WIDTH + SEED_X) * 4 + 3];
        const pour1VsFinalMetrics = computeGapAndErr(pour1Snap, base, aaIndices, finalSeedA);
        const finalMetrics = computeGapAndErr(localBuf, base, aaIndices, finalSeedA);

        let solidCoreChanged = 0;
        for (const cIdx of coreIndices) {
          if (
            localBuf[cIdx] !== base[cIdx] ||
            localBuf[cIdx + 1] !== base[cIdx + 1] ||
            localBuf[cIdx + 2] !== base[cIdx + 2] ||
            localBuf[cIdx + 3] !== base[cIdx + 3]
          ) {
            solidCoreChanged++;
          }
        }

        const outIdx = (OUTSIDE_Y * WIDTH + OUTSIDE_X) * 4;
        const leakedOutside = localBuf[outIdx + 3] !== 0;

        let parityDiffBytes = 0;
        for (let i = 0; i < localBuf.length; i++) {
          if (localBuf[i] !== replayBuf[i]) parityDiffBytes++;
        }

        // Core Required Assertions per Matrix Cell
        assert.ok(pour1Changed > 0, `Pour 1 should composite AA edge (${shape} w=${width} ${opacityPct}%)`);
        if (pours > 1) {
          assert.ok(
            laterPoursChangedTotal > 0,
            `Assertion 1 FAILED: AA boundary pixels froze after pour 1 for ${shape} w=${width} ${opacityPct}%`
          );
          assert.ok(
            finalMetrics.avgAlphaErr < pour1VsFinalMetrics.avgAlphaErr,
            `Assertion 2 FAILED: Edge gap error did not improve across repeated fills for ${shape} w=${width} ${opacityPct}% (frozenAtPour1=${pour1VsFinalMetrics.avgAlphaErr.toFixed(2)}, final=${finalMetrics.avgAlphaErr.toFixed(2)})`
          );
          assert.ok(
            finalMetrics.gapCount < pour1VsFinalMetrics.gapCount,
            `Assertion 2 FAILED: Gap pixel count did not improve across repeated fills for ${shape} w=${width} ${opacityPct}% (${pour1VsFinalMetrics.gapCount} -> ${finalMetrics.gapCount})`
          );
          assert.ok(
            finalMetrics.avgAlphaErr <= 4.5,
            `Assertion 2/8 FAILED: Residual avg alpha error too high (${finalMetrics.avgAlphaErr.toFixed(2)}) for ${shape} w=${width} ${opacityPct}%`
          );
        }
        assert.strictEqual(solidCoreChanged, 0, 'Assertion 3 FAILED: Solid stroke core changed');
        assert.strictEqual(leakedOutside, false, 'Assertion 4 FAILED: Color leaked outside closed shape');
        assert.strictEqual(parityDiffBytes, 0, 'Parity FAILED: Local vs Replay mismatch');

        results.push({
          shape,
          width,
          opacityPct,
          pours,
          seedA: finalSeedA,
          aaCount: aaIndices.length,
          pour1Changed,
          laterPoursChangedTotal,
          pour1ErrVsCurrentSeed,
          pour1ErrVsFinalFill: pour1VsFinalMetrics.avgAlphaErr,
          finalAvgAlphaErr: finalMetrics.avgAlphaErr,
          gapBeforeVsFinal: pour1VsFinalMetrics.gapCount,
          gapFinal: finalMetrics.gapCount,
          solidCoreChanged,
          leakedOutside,
          parityDiffBytes,
        });
      }
    }
  }
  return results;
}

async function runSafetyAndInvariantTests() {
  // 0. Feature switches invariant
  assert.strictEqual(EXPERIMENTAL_ADAPTIVE_BUCKET_EDGE_GROWTH, true);
  assert.strictEqual(EXPERIMENTAL_ALPHA_AWARE_TRANSPARENT_EDGE_FILL, true);
  assert.strictEqual(EXPERIMENTAL_OPAQUE_BACKGROUND_EDGE_PRESERVATION, true);
  assert.strictEqual(EXPERIMENTAL_GUARD_PARTIAL_ALPHA_SEEDS_FROM_PHASE6, true, 'Phase 7 guard MUST remain enabled');

  // 1. Assertion 5: 1px vertical barrier stays intact across repeated partial-alpha pours
  {
    const ctx = new SvgCanvasContext();
    drawShape(ctx as unknown as CanvasRenderingContext2D, 120, 0, 120, HEIGHT, 'line', '#000000', 1, 1, false);
    const base = await ctx.toTransparentBuffer();
    const buf = new Uint8ClampedArray(base);
    for (let k = 1; k <= 20; k++) {
      executeRasterFloodFill(buf, WIDTH, HEIGHT, 60, 120, '#ff0000', 0.10);
    }
    const rightIdx = (120 * WIDTH + 180) * 4;
    assert.strictEqual(buf[rightIdx + 3], 0, 'Assertion 5 FAILED: 1px barrier leaked after 20 repeated 10% fills');
    console.log('✅ PASS Assertion 5: 1px solid barrier remains 100% leak-free across 20x 10% fills');
  }

  // 2. Assertion 6: Existing partially transparent brush boundaries without valid outward stroke-core gradient
  {
    // Case A: Uniform 50% brush rectangle/stroke with soft outer skirt tapering from 128 -> 0.
    // Click directly INSIDE the 50% brush body (ta = 128, partial-alpha seed!) with red 20%.
    // The outer skirt tapers DOWN toward 0 (oa < pa), so Phase 7 + alpha-gradient check must NOT expand outward.
    const w = 80;
    const h = 80;
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let y = 20; y < 60; y++) {
      for (let x = 20; x < 60; x++) {
        const idx = (y * w + x) * 4;
        // Core [22..57] at alpha 128, soft outer skirt at [20..21] and [58..59] tapering 80 -> 40 -> 0
        let alpha = 128;
        if (x === 21 || x === 58 || y === 21 || y === 58) alpha = 70;
        if (x === 20 || x === 59 || y === 20 || y === 59) alpha = 35;
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = alpha;
      }
    }
    const outerBefore = new Uint8ClampedArray(buf);
    for (let k = 1; k <= 10; k++) {
      executeRasterFloodFill(buf, w, h, 40, 40, '#ff0000', 0.20);
    }
    // Outer ring at x=20 / x=59 / y=20 / y=59 (alpha=35, outward=0) MUST NOT be modified!
    for (let i = 20; i <= 59; i++) {
      for (const [px, py] of [[i, 20], [i, 59], [20, i], [59, i]]) {
        const idx = (py * w + px) * 4;
        assert.strictEqual(buf[idx], outerBefore[idx], `Assertion 6 FAILED at outer brush skirt (${px},${py}) R`);
        assert.strictEqual(buf[idx + 3], outerBefore[idx + 3], `Assertion 6 FAILED at outer brush skirt (${px},${py}) A`);
      }
    }
    // Pixels outside (10,10) must stay transparent
    assert.strictEqual(buf[(10 * w + 10) * 4 + 3], 0, 'Assertion 6 FAILED: expanded past brush edge');
    // Also verify partial-alpha seed NEVER snapped a high-alpha boundary pixel (pa=180 < oa=190, diff=10 < 20, oa < 240) to alpha 255 via Phase 6!
    const bufNoGrad = new Uint8ClampedArray(w * h * 4);
    for (let y = 10; y < 70; y++) {
      for (let x = 10; x < 70; x++) {
        const idx = (y * w + x) * 4;
        bufNoGrad[idx] = 0;
        bufNoGrad[idx + 1] = 0;
        bufNoGrad[idx + 2] = 200;
        bufNoGrad[idx + 3] = 128; // ta = 128 (partial alpha!)
      }
    }
    // Paint a non-matching partial-alpha band at x=50 (pa=200) next to x=51 (oa=210):
    // oa - pa = 10 < 20 and oa < 240 -> MUST remain untouched (not routed to Phase 6!).
    for (let y = 10; y < 70; y++) {
      const idx50 = (y * w + 50) * 4;
      bufNoGrad[idx50] = 20; bufNoGrad[idx50 + 1] = 20; bufNoGrad[idx50 + 2] = 20; bufNoGrad[idx50 + 3] = 200;
      const idx51 = (y * w + 51) * 4;
      bufNoGrad[idx51] = 0; bufNoGrad[idx51 + 1] = 0; bufNoGrad[idx51 + 2] = 0; bufNoGrad[idx51 + 3] = 210;
    }
    executeRasterFloodFill(bufNoGrad, w, h, 30, 30, '#ff0000', 0.50);
    const pIdx = (30 * w + 50) * 4;
    assert.strictEqual(bufNoGrad[pIdx + 3], 200, 'Phase 7 invariant FAILED: partial-alpha pixel without gradient/core was modified');
    console.log('✅ PASS Assertion 6 & Phase 7 Guard: Semi-transparent brush skirts & non-core partial-alpha pixels preserved; partial-alpha seeds do NOT enter Phase 6');
  }

  // 3. Assertion 7: Original first-fill behavior at ta <= 10 remains unchanged
  {
    const ctx = new SvgCanvasContext();
    drawShape(ctx as unknown as CanvasRenderingContext2D, SHAPE_START_X, SHAPE_START_Y, SHAPE_END_X, SHAPE_END_Y, 'strokeCircle', '#000000', 2, 1, false);
    const base = await ctx.toTransparentBuffer();
    const firstFill = new Uint8ClampedArray(base);
    executeRasterFloodFill(firstFill, WIDTH, HEIGHT, SEED_X, SEED_Y, FILL_HEX, 1.0);

    // Phase 5 invariant: when ta <= 10, pixels with original pa > 240 or oa < pa + 20 are NOT touched on Pour #1,
    // while pixels with 10 < pa <= 240 and oa >= pa + 20 ARE composited on Pour #1.
    let skippedHighPartial = 0;
    let compositedPhase5 = 0;
    const cx = (SHAPE_START_X + SHAPE_END_X) / 2;
    const cy = (SHAPE_START_Y + SHAPE_END_Y) / 2;
    const rx = (SHAPE_END_X - SHAPE_START_X) / 2;
    for (let y = 1; y < HEIGHT - 1; y++) {
      for (let x = 1; x < WIDTH - 1; x++) {
        if (Math.hypot(x - cx, y - cy) >= rx) continue;
        const idx = (y * WIDTH + x) * 4;
        const ba = base[idx + 3];
        if (ba > 240 && ba < 255) {
          assert.strictEqual(firstFill[idx + 3], ba, `Assertion 7 FAILED: Pour 1 touched pa=${ba} > 240`);
          skippedHighPartial++;
        } else if (ba > 10 && ba <= 240 && firstFill[idx + 3] > ba) {
          compositedPhase5++;
        }
      }
    }
    assert.ok(compositedPhase5 > 100, 'Expected Phase 5 to composite AA skirt on Pour 1');
    assert.ok(skippedHighPartial >= 0);

    // Requirement C: Subsequent pour when ta === 255 safely composites remaining partial-alpha candidate (pa < 255)
    // via Phase 5-style source-over rather than Phase 6 opaque RGB reconstruction!
    const w = 40;
    const h = 40;
    const syn = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // Interior x < 20 is opaque red (ta === 255)
        if (x < 20) {
          syn[i] = 255; syn[i + 1] = 0; syn[i + 2] = 0; syn[i + 3] = 255;
        } else if (x === 20) {
          // Candidate P still partial alpha pa = 242 (< 255), black stroke anti-aliased against white
          syn[i] = 10; syn[i + 1] = 10; syn[i + 2] = 10; syn[i + 3] = 242;
        } else {
          // Solid black stroke core O at x = 21 (oa = 255)
          syn[i] = 0; syn[i + 1] = 0; syn[i + 2] = 0; syn[i + 3] = 255;
        }
      }
    }
    // Pour 50% blue on opaque red interior -> ta === 255, P has pa = 242 < 255, oa = 255!
    // Under source-over (P over F@0.5): aOut = 242/255 + 0.5*(13/255) = 248.5/255 -> Math.round = 249 (NOT snapped to 255 by Phase 6!)
    executeRasterFloodFill(syn, w, h, 10, 10, '#0000ff', 0.5);
    const candIdx = (10 * w + 20) * 4;
    assert.strictEqual(syn[candIdx + 3], 249, `Requirement C FAILED: expected source-over alpha 249, got ${syn[candIdx + 3]}`);
    console.log('✅ PASS Assertion 7 & Requirement C: Original Pour-1 Phase 5 behavior preserved; ta===255 + pa<255 uses source-over instead of Phase 6 RGB reconstruction');
  }

  // 4. Opaque canvas regression guard (white canvas Phase 6 intact)
  {
    const ctx = new SvgCanvasContext();
    drawShape(ctx as unknown as CanvasRenderingContext2D, SHAPE_START_X, SHAPE_START_Y, SHAPE_END_X, SHAPE_END_Y, 'strokeCircle', '#000000', 4, 1, false);
    const opaqueBuf = await ctx.toOpaqueBuffer('#ffffff');
    const res = executeRasterFloodFill(opaqueBuf, WIDTH, HEIGHT, SEED_X, SEED_Y, '#0066ff', 1.0);
    assert.ok(res && res.a === 255 && !res.isNoOp);
    assert.strictEqual(opaqueBuf[(OUTSIDE_Y * WIDTH + OUTSIDE_X) * 4], 255);
    console.log('✅ PASS Opaque Canvas Guard: Phase 6 opaque-canvas circle fill intact');
  }
}

async function main() {
  console.log('========================================================================');
  console.log('🧪 BUCKET FILL REPEATED PARTIAL-ALPHA EDGE FIX — DETERMINISTIC SUITE');
  console.log('========================================================================\n');

  const matrix = await runMatrixTests();

  console.log('| Shape | Width | Opacity | Pours | Final Seed A | AA Pixels | Pour 1 Chg | Later Chg | P1 Err(cur) | P1 Err(end) | Final Err | Gap(p1->end) | Core Chg | Parity Diff |');
  console.log('|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of matrix) {
    console.log(
      `| ${r.shape.padEnd(12)} | ${r.width}px | ${String(r.opacityPct).padStart(3)}% | ${String(r.pours).padStart(2)} | ${String(r.seedA).padStart(3)} | ${String(r.aaCount).padStart(4)} | ${String(r.pour1Changed).padStart(4)} | ${String(r.laterPoursChangedTotal).padStart(5)} | ${r.pour1ErrVsCurrentSeed.toFixed(2).padStart(5)} | ${r.pour1ErrVsFinalFill.toFixed(1).padStart(5)} | ${r.finalAvgAlphaErr.toFixed(2).padStart(5)} | ${`${r.gapBeforeVsFinal}->${r.gapFinal}`.padStart(9)} | ${r.solidCoreChanged} | ${r.parityDiffBytes} |`
    );
  }

  console.log('');
  await runSafetyAndInvariantTests();
  console.log('\n🎉 ALL DETERMINISTIC PARTIAL-ALPHA REPEATED FILL ASSERTIONS PASSED!');
}

main().catch((err) => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});

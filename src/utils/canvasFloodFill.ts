export interface TargetRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
  isFullCanvasOpaque?: boolean;
  fillHex?: string;
  isNoOp?: boolean;
  filledPixelCount?: number;
}

// 🛡️ Master Emergency Switch:
// When true, runs existing primary flood fill (T=40) followed by adaptive edge preservation.
// When false, completely bypasses edge processing and returns pure primary scanline fill.
export const EXPERIMENTAL_ADAPTIVE_BUCKET_EDGE_GROWTH = true;

// 🛡️ Experimental Feature Switch (Phase 5):
// When true, applies alpha-aware boundary compositing for transparent-seeded fills (target alpha <= 10).
// When false, skips transparent edge processing cleanly (zero modification).
export const EXPERIMENTAL_ALPHA_AWARE_TRANSPARENT_EDGE_FILL = true;

// 🛡️ Experimental Feature Switch (Phase 6):
// When true, applies mathematical alpha-reconstruction and edge preservation for opaque-seeded fills (target alpha > 10).
// When false, skips opaque edge processing cleanly (zero modification).
export const EXPERIMENTAL_OPAQUE_BACKGROUND_EDGE_PRESERVATION = true;

// 🛡️ Experimental Feature Switch (Phase 7):
// When true, guards partial-alpha seeds (10 < ta < 255) from entering Phase 6 opaque edge reconstruction.
// When false, restores original Phase 6 routing for partial-alpha seeds for controlled rollback.
export const EXPERIMENTAL_GUARD_PARTIAL_ALPHA_SEEDS_FROM_PHASE6 = true;

const MAX_BOUNDARY_CAPACITY = 32768;
const MIN_GRADIENT_STEP = 15;
const MIN_ALPHA_GRADIENT_STEP = 20;

let sharedBoundaryX: Int32Array | null = null;
let sharedBoundaryY: Int32Array | null = null;
let sharedBoundaryFromX: Int32Array | null = null;
let sharedBoundaryFromY: Int32Array | null = null;

const ensureBoundaryBuffers = () => {
  if (!sharedBoundaryX) {
    sharedBoundaryX = new Int32Array(MAX_BOUNDARY_CAPACITY);
    sharedBoundaryY = new Int32Array(MAX_BOUNDARY_CAPACITY);
    sharedBoundaryFromX = new Int32Array(MAX_BOUNDARY_CAPACITY);
    sharedBoundaryFromY = new Int32Array(MAX_BOUNDARY_CAPACITY);
  }
};

const matchColor = (data: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number) => {
  if (a <= 10) {
    return data[i + 3] <= 10;
  }
  if (data[i + 3] <= 10) {
    return false;
  }
  const tolerance = 40;
  return Math.abs(data[i] - r) <= tolerance &&
         Math.abs(data[i + 1] - g) <= tolerance &&
         Math.abs(data[i + 2] - b) <= tolerance &&
         Math.abs(data[i + 3] - a) <= tolerance;
};

// Bounded seed recovery search offsets within Euclidean distance <= 2.0 physical pixels, ordered by distance
const RECOVERY_NEIGHBOR_OFFSETS = [
  // Distance 1.0 (4 orthogonal neighbors)
  [0, -1], [0, 1], [-1, 0], [1, 0],
  // Distance ~1.414 (4 diagonal neighbors)
  [-1, -1], [1, -1], [-1, 1], [1, 1],
  // Distance 2.0 (4 orthogonal 2-step neighbors)
  [0, -2], [0, 2], [-2, 0], [2, 0]
];

export const executeRasterFloodFill = (
  data: Uint8ClampedArray,
  cw: number,
  ch: number,
  startX: number,
  startY: number,
  fillColorStr: string,
  fillOpacity: number = 1,
  logicalWidth: number = cw,
  logicalHeight: number = ch,
  expectedTarget?: TargetRGBA,
  reusableVisited?: Uint8Array,
  reusableQueueX?: number[],
  reusableQueueY?: number[]
): (TargetRGBA & { isFullCanvasOpaque?: boolean; fillHex?: string; isNoOp?: boolean; filledPixelCount?: number }) | null => {
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
    return { r: tr, g: tg, b: tb, a: ta, isNoOp: true, filledPixelCount: 0 };
  }

  let visited: Uint8Array;
  if (reusableVisited && reusableVisited.length >= cw * ch) {
    visited = reusableVisited;
    visited.fill(0);
  } else {
    visited = new Uint8Array(cw * ch);
  }

  let queueX: number[];
  let queueY: number[];
  if (reusableQueueX && reusableQueueY) {
    queueX = reusableQueueX;
    queueY = reusableQueueY;
    queueX.length = 0;
    queueY.length = 0;
    queueX.push(sx);
    queueY.push(sy);
  } else {
    queueX = [sx];
    queueY = [sy];
  }

  let boundaryCount = 0;
  let boundaryOverflow = false;

  if (EXPERIMENTAL_ADAPTIVE_BUCKET_EDGE_GROWTH) {
    ensureBoundaryBuffers();
  }

  const pushBoundaryCandidate = (bx: number, by: number, fx: number, fy: number) => {
    const bPixelIdx = by * cw + bx;
    if (visited[bPixelIdx] === 0) {
      if (boundaryCount < MAX_BOUNDARY_CAPACITY) {
        visited[bPixelIdx] = 2; // Marked as candidate (deduplicated)
        sharedBoundaryX![boundaryCount] = bx;
        sharedBoundaryY![boundaryCount] = by;
        sharedBoundaryFromX![boundaryCount] = fx;
        sharedBoundaryFromY![boundaryCount] = fy;
        boundaryCount++;
      } else {
        boundaryOverflow = true;
      }
    }
  };

  let head = 0;
  let filledPixelCount = 0;
  const byteStride = cw * 4;

  while (head < queueX.length) {
    const cx = queueX[head];
    const cy = queueY[head];
    head++;

    const seedIdx = cy * cw + cx;
    if (visited[seedIdx] === 1) continue;

    let xCurr = cx;
    let yCurr = cy;

    let idx = (yCurr * cw + xCurr) * 4;
    let pixelIdx = yCurr * cw + xCurr;

    while (xCurr >= 0 && visited[pixelIdx] !== 1 && matchColor(data, idx, tr, tg, tb, ta)) {
      xCurr--;
      idx -= 4;
      pixelIdx--;
    }
    if (EXPERIMENTAL_ADAPTIVE_BUCKET_EDGE_GROWTH && xCurr >= 0) {
      pushBoundaryCandidate(xCurr, yCurr, xCurr + 1, yCurr);
    }
    xCurr++;
    idx += 4;
    pixelIdx++;

    let spanAbove = false;
    let spanBelow = false;
    const hasAbove = yCurr > 0;
    const hasBelow = yCurr < ch - 1;
    const yAbove = yCurr - 1;
    const yBelow = yCurr + 1;

    while (xCurr < cw && visited[pixelIdx] !== 1 && matchColor(data, idx, tr, tg, tb, ta)) {
      visited[pixelIdx] = 1;
      filledPixelCount++;

      if (fillOpacity === 1) {
        data[idx] = fr;
        data[idx + 1] = fg;
        data[idx + 2] = fb;
        data[idx + 3] = 255;
      } else {
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
      }

      if (hasAbove) {
        const pixelIdxAbove = pixelIdx - cw;
        const idxAbove = idx - byteStride;
        const matchesAbove = visited[pixelIdxAbove] !== 1 && matchColor(data, idxAbove, tr, tg, tb, ta);
        if (!spanAbove && matchesAbove) {
          queueX.push(xCurr);
          queueY.push(yAbove);
          spanAbove = true;
        } else if (spanAbove && !matchesAbove) {
          spanAbove = false;
        }
        if (!matchesAbove && EXPERIMENTAL_ADAPTIVE_BUCKET_EDGE_GROWTH) {
          pushBoundaryCandidate(xCurr, yAbove, xCurr, yCurr);
        }
      }

      if (hasBelow) {
        const pixelIdxBelow = pixelIdx + cw;
        const idxBelow = idx + byteStride;
        const matchesBelow = visited[pixelIdxBelow] !== 1 && matchColor(data, idxBelow, tr, tg, tb, ta);
        if (!spanBelow && matchesBelow) {
          queueX.push(xCurr);
          queueY.push(yBelow);
          spanBelow = true;
        } else if (spanBelow && !matchesBelow) {
          spanBelow = false;
        }
        if (!matchesBelow && EXPERIMENTAL_ADAPTIVE_BUCKET_EDGE_GROWTH) {
          pushBoundaryCandidate(xCurr, yBelow, xCurr, yCurr);
        }
      }

      xCurr++;
      idx += 4;
      pixelIdx++;
    }

    if (EXPERIMENTAL_ADAPTIVE_BUCKET_EDGE_GROWTH && xCurr < cw) {
      pushBoundaryCandidate(xCurr, yCurr, xCurr - 1, yCurr);
    }
  }

  // Phase 2: Bounded Adaptive Edge Growth
  // If buffer overflow occurred, skip entire edge-growth pass to preserve primary flood fill result safely.
  if (
    EXPERIMENTAL_ADAPTIVE_BUCKET_EDGE_GROWTH &&
    !boundaryOverflow &&
    sharedBoundaryX &&
    sharedBoundaryY &&
    sharedBoundaryFromX &&
    sharedBoundaryFromY
  ) {
    const isTransparentSeed = ta <= 10;
    const isFullyOpaqueSeed = ta === 255;
    const isPartiallyTransparentSeed = ta > 10 && ta < 255;

    const canRunPhase5 = isTransparentSeed && EXPERIMENTAL_ALPHA_AWARE_TRANSPARENT_EDGE_FILL;
    const canRunPhase6 = (
      EXPERIMENTAL_GUARD_PARTIAL_ALPHA_SEEDS_FROM_PHASE6
        ? isFullyOpaqueSeed
        : (isFullyOpaqueSeed || isPartiallyTransparentSeed)
    ) && EXPERIMENTAL_OPAQUE_BACKGROUND_EDGE_PRESERVATION;

    // Phase 7: If neither Phase 5 nor Phase 6 can run (e.g. partially transparent seed with guard active),
    // skip boundary edge processing cleanly without mutating candidate pixels.
    const activeBoundaryCount = (canRunPhase5 || canRunPhase6) ? boundaryCount : 0;

    for (let b = 0; b < activeBoundaryCount; b++) {
      const bx = sharedBoundaryX[b];
      const by = sharedBoundaryY[b];
      const bPixelIdx = by * cw + bx;
      const bIdx = bPixelIdx * 4;

      const pr = data[bIdx];
      const pg = data[bIdx + 1];
      const pb = data[bIdx + 2];
      const pa = data[bIdx + 3];

      if (canRunPhase5) {
        // Phase 5: Alpha-Aware Boundary Compositing for Transparent-Seeded Fills
        // Candidate must have intermediate alpha: above transparent threshold (>10) and not already near-opaque (<=240)
        if (pa <= 10 || pa > 240) {
          continue;
        }

        const fx = sharedBoundaryFromX[b];
        const fy = sharedBoundaryFromY[b];
        const dx = bx - fx;
        const dy = by - fy;
        const ox = bx + dx;
        const oy = by + dy;

        if (ox >= 0 && ox < cw && oy >= 0 && oy < ch) {
          const oPixelIdx = oy * cw + ox;
          // Do not expand if outward neighbor is already part of the filled region
          if (visited[oPixelIdx] === 1) {
            continue;
          }

          const oIdx = oPixelIdx * 4;
          const oa = data[oIdx + 3];

          // Ascending Alpha Gradient Invariant:
          // The outward neighbor O must have materially higher alpha than candidate P.
          // If oa < pa + MIN_ALPHA_GRADIENT_STEP, P is the crest of a thin low-opacity line, flat, or ambiguous. DO NOT TOUCH.
          if (oa >= pa + MIN_ALPHA_GRADIENT_STEP) {
            // Standard source-over compositing of existing foreground pixel P over new fill background F:
            // Aout = Ap + Af * (1 - Ap)
            // Cout = (Ap * Cp + Af * (1 - Ap) * Cf) / Aout
            const ap = pa / 255;
            const af = fillOpacity;
            const aOut = ap + af * (1 - ap);

            if (aOut > 0.001) {
              const weightP = ap / aOut;
              const weightF = (af * (1 - ap)) / aOut;

              data[bIdx]     = Math.min(255, Math.max(0, Math.round(weightP * pr + weightF * fr)));
              data[bIdx + 1] = Math.min(255, Math.max(0, Math.round(weightP * pg + weightF * fg)));
              data[bIdx + 2] = Math.min(255, Math.max(0, Math.round(weightP * pb + weightF * fb)));
              data[bIdx + 3] = Math.min(255, Math.max(0, Math.round(aOut * 255)));

              visited[bPixelIdx] = 1;
              filledPixelCount++;
            }
          }
        }
      } else if (canRunPhase6) {
        // Phase 6: Opaque-Background Edge Preservation via Alpha Reconstruction
        const fx = sharedBoundaryFromX[b];
        const fy = sharedBoundaryFromY[b];
        const dx = bx - fx;
        const dy = by - fy;
        const ox = bx + dx;
        const oy = by + dy;

        if (ox >= 0 && ox < cw && oy >= 0 && oy < ch) {
          const oPixelIdx = oy * cw + ox;
          // Do not expand if outward neighbor is already part of the filled region
          if (visited[oPixelIdx] === 1) {
            continue;
          }

          const oIdx = oPixelIdx * 4;
          const or = data[oIdx];
          const og = data[oIdx + 1];
          const ob = data[oIdx + 2];
          const oa = data[oIdx + 3];

          // Outward neighbor must be opaque enough to serve as a reliable stroke core
          if (oa < 200) {
            continue;
          }

          const distP = Math.max(Math.abs(pr - tr), Math.abs(pg - tg), Math.abs(pb - tb));
          const distO = Math.max(Math.abs(or - tr), Math.abs(og - tg), Math.abs(ob - tb));

          // Gradient Step Invariant: Stroke core O must be strictly more contrasting with background B than candidate P
          if (distO < distP + MIN_GRADIENT_STEP) {
            continue;
          }

          // Vector from background B to stroke core O: v = O - B
          const vr = or - tr;
          const vg = og - tg;
          const vb = ob - tb;
          const vSq = vr * vr + vg * vg + vb * vb;

          // Core Distinction Invariant: O must be sufficiently distinct from B (||v||^2 >= 900, i.e. ||v|| >= 30)
          if (vSq < 900) {
            continue;
          }

          // Vector from background B to candidate pixel P: u = P - B
          const ur = pr - tr;
          const ug = pg - tg;
          const ub = pb - tb;
          const uDotV = ur * vr + ug * vg + ub * vb;

          // Positive projection along vector v
          if (uDotV <= 0) {
            continue;
          }

          // Estimated stroke coverage alpha
          const alpha = uDotV / vSq;

          // Valid antialiasing skirt range [0.10, 0.85]
          // Reject < 0.10 (essentially background) and > 0.85 (preserve stroke core untouched)
          if (alpha < 0.10 || alpha > 0.85) {
            continue;
          }

          // Directional Consistency / Residual Error Check
          // Check that P actually lies along the segment between B and O
          const predR = tr + alpha * vr;
          const predG = tg + alpha * vg;
          const predB = tb + alpha * vb;

          if (Math.abs(pr - predR) > 15 || Math.abs(pg - predG) > 15 || Math.abs(pb - predB) > 15) {
            continue;
          }

          // Reconstruct new pixel: P_new = alpha * O + (1 - alpha) * F_eff
          let newR: number;
          let newG: number;
          let newB: number;

          if (fillOpacity >= 0.99) {
            newR = Math.min(255, Math.max(0, Math.round(alpha * or + (1 - alpha) * fr)));
            newG = Math.min(255, Math.max(0, Math.round(alpha * og + (1 - alpha) * fg)));
            newB = Math.min(255, Math.max(0, Math.round(alpha * ob + (1 - alpha) * fb)));
          } else {
            const effFr = fillOpacity * fr + (1 - fillOpacity) * tr;
            const effFg = fillOpacity * fg + (1 - fillOpacity) * tg;
            const effFb = fillOpacity * fb + (1 - fillOpacity) * tb;

            newR = Math.min(255, Math.max(0, Math.round(alpha * or + (1 - alpha) * effFr)));
            newG = Math.min(255, Math.max(0, Math.round(alpha * og + (1 - alpha) * effFg)));
            newB = Math.min(255, Math.max(0, Math.round(alpha * ob + (1 - alpha) * effFb)));
          }

          data[bIdx] = newR;
          data[bIdx + 1] = newG;
          data[bIdx + 2] = newB;
          data[bIdx + 3] = 255;

          visited[bPixelIdx] = 1;
          filledPixelCount++;
        }
      }
    }
  }

  const isFullCanvasOpaque = (filledPixelCount === cw * ch) && (fillOpacity >= 0.95);
  return { r: tr, g: tg, b: tb, a: ta, isFullCanvasOpaque, fillHex, filledPixelCount };
};

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
// When true, guards partial-alpha seeds (10 < ta < 255) from entering Phase 6 opaque RGB reconstruction.
// When false, restores original Phase 6 routing for partial-alpha seeds for controlled rollback.
export const EXPERIMENTAL_GUARD_PARTIAL_ALPHA_SEEDS_FROM_PHASE6 = true;

// 🛡️ Experimental Feature Switch (Phase 1B — Unified 4D Premultiplied Edge Reconstruction):
// When true, uses edge-aware AA skirt stopping and unified 4D premultiplied RGBA (R*A, G*A, B*A, A)
// stroke-coverage projection + Source-Over background update, falling back to legacy paths when
// pixel information is insufficient or ambiguous. When false, executes the prior pipeline untouched.
export const EXPERIMENTAL_UNIFIED_4D_BUCKET_EDGE_RECONSTRUCTION = true;

const MAX_BOUNDARY_CAPACITY = 32768;
const MIN_GRADIENT_STEP = 15;
const MIN_ALPHA_GRADIENT_STEP = 20;
const EDGE_AWARE_INTERIOR_FAST_TOLERANCE = 12;
const UNIFIED_4D_CORE_MIN_ALPHA = 200;
const UNIFIED_4D_CORE_CONTRAST_SQ_MIN = 900;
const UNIFIED_4D_RESIDUAL_MAX = 15;
const UNIFIED_4D_COLLINEAR_RESIDUAL_MAX = 12;

const NEIGH8_DX = [-1, 0, 1, -1, 1, -1, 0, 1];
const NEIGH8_DY = [-1, -1, -1, 0, 0, 1, 1, 1];

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

// Edge-aware interior matcher scoped strictly to Unified 4D mode:
// Preserves tolerance=40 inside smooth interior regions, while stopping before low-coverage
// anti-aliased skirt pixels (12 < maxDiff <= 40) that border a non-matching stroke edge.
const matchColorEdgeAware = (
  data: Uint8ClampedArray,
  cw: number,
  ch: number,
  x: number,
  y: number,
  i: number,
  r: number,
  g: number,
  b: number,
  a: number
): boolean => {
  if (a <= 10) {
    return data[i + 3] <= 10;
  }
  if (data[i + 3] <= 10) {
    return false;
  }
  const dr = Math.abs(data[i] - r);
  const dg = Math.abs(data[i + 1] - g);
  const db = Math.abs(data[i + 2] - b);
  const da = Math.abs(data[i + 3] - a);
  if (dr > 40 || dg > 40 || db > 40 || da > 40) {
    return false;
  }
  if (
    dr <= EDGE_AWARE_INTERIOR_FAST_TOLERANCE &&
    dg <= EDGE_AWARE_INTERIOR_FAST_TOLERANCE &&
    db <= EDGE_AWARE_INTERIOR_FAST_TOLERANCE &&
    da <= EDGE_AWARE_INTERIOR_FAST_TOLERANCE
  ) {
    return true;
  }
  const stride = cw * 4;
  if (x > 0 && !matchColor(data, i - 4, r, g, b, a)) return false;
  if (x < cw - 1 && !matchColor(data, i + 4, r, g, b, a)) return false;
  if (y > 0 && !matchColor(data, i - stride, r, g, b, a)) return false;
  if (y < ch - 1 && !matchColor(data, i + stride, r, g, b, a)) return false;
  return true;
};

const tryCompositePartialAlphaBoundary = (
  data: Uint8ClampedArray,
  visited: Uint8Array,
  cw: number,
  ch: number,
  bx: number,
  by: number,
  fx: number,
  fy: number,
  bPixelIdx: number,
  bIdx: number,
  pr: number,
  pg: number,
  pb: number,
  pa: number,
  fr: number,
  fg: number,
  fb: number,
  fillOpacity: number,
  allowHighPartialAlpha: boolean
): boolean => {
  if (pa <= 10 || (allowHighPartialAlpha ? pa >= 255 : pa > 240)) {
    return false;
  }

  const dx = bx - fx;
  const dy = by - fy;
  const ox = bx + dx;
  const oy = by + dy;

  if (ox < 0 || ox >= cw || oy < 0 || oy >= ch) {
    return false;
  }

  const oPixelIdx = oy * cw + ox;
  // Do not expand if outward neighbor is already part of the filled region
  if (visited[oPixelIdx] === 1) {
    return false;
  }

  const oIdx = oPixelIdx * 4;
  const oa = data[oIdx + 3];

  // Ascending Alpha Gradient Invariant:
  // The outward neighbor O must provide convincing evidence of a stronger stroke edge than P.
  // For repeated partial-alpha seeds and partial-alpha candidates under opaque seeds,
  // also permit near-opaque stroke cores (oa >= 240 && oa > pa) so AA pixels > 220 can finish compositing safely.
  const hasConvincingOutwardEdge = allowHighPartialAlpha
    ? (oa >= pa + MIN_ALPHA_GRADIENT_STEP || (oa >= 240 && oa > pa))
    : (oa >= pa + MIN_ALPHA_GRADIENT_STEP);

  if (!hasConvincingOutwardEdge) {
    return false;
  }

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
    return true;
  }

  return false;
};

// Unified 4D Premultiplied RGBA Boundary Pass:
// Projects each boundary pixel P in premultiplied 4D space [R*A, G*A, B*A, A] onto [B_old_pm, O_pm]
// to recover stroke coverage `alpha`, updates the background fill via Source-Over (`F OVER B_old`),
// and recomposites `alpha * O_pm + (1 - alpha) * B_new_pm`.
// Falls back to legacy paths whenever stroke-core / background evidence is insufficient or ambiguous.
const runUnified4DBoundaryPass = (
  data: Uint8ClampedArray,
  visited: Uint8Array,
  cw: number,
  ch: number,
  boundaryCount: number,
  tr: number,
  tg: number,
  tb: number,
  ta: number,
  fr: number,
  fg: number,
  fb: number,
  fillOpacity: number
): number => {
  let updatedCount = 0;

  const isTransparentSeed = ta <= 10;
  const baOld = isTransparentSeed ? 0 : ta / 255;
  const bOldR = isTransparentSeed ? 0 : tr * baOld;
  const bOldG = isTransparentSeed ? 0 : tg * baOld;
  const bOldB = isTransparentSeed ? 0 : tb * baOld;
  const bOldA = isTransparentSeed ? 0 : ta;

  const baNew = fillOpacity + baOld * (1 - fillOpacity);
  const bNewR = fr * fillOpacity + bOldR * (1 - fillOpacity);
  const bNewG = fg * fillOpacity + bOldG * (1 - fillOpacity);
  const bNewB = fb * fillOpacity + bOldB * (1 - fillOpacity);
  const bNewA = baNew * 255;

  const maxAlpha = isTransparentSeed ? (240 / 255) : 0.96;

  for (let b = 0; b < boundaryCount; b++) {
    const bx = sharedBoundaryX![b];
    const by = sharedBoundaryY![b];
    const bp = by * cw + bx;
    if (visited[bp] === 1) {
      continue;
    }

    const bi = bp * 4;
    const pr = data[bi];
    const pg = data[bi + 1];
    const pb = data[bi + 2];
    const pa = data[bi + 3];

    // Preserve Pour-1 transparent-seed invariant for near-solid stroke edge pixels (pa > 240)
    if (isTransparentSeed && pa > 240) {
      continue;
    }

    const pFa = pa / 255;
    const pPmR = pr * pFa;
    const pPmG = pg * pFa;
    const pPmB = pb * pFa;
    const pPmA = pa;
    const distP = Math.max(
      Math.abs(pPmR - bOldR),
      Math.abs(pPmG - bOldG),
      Math.abs(pPmB - bOldB),
      Math.abs(pPmA - bOldA)
    );

    let bestAlpha = -1;
    let bestOR = 0;
    let bestOG = 0;
    let bestOB = 0;
    let bestOA = 0;
    let bestDistSq = -1;
    let bestResid = 999;

    const evalCandidate = (ox: number, oy: number) => {
      if (ox < 0 || ox >= cw || oy < 0 || oy >= ch) return;
      const op = oy * cw + ox;
      if (visited[op] === 1) return;
      const oi = op * 4;
      const oa = data[oi + 3];
      if (oa < UNIFIED_4D_CORE_MIN_ALPHA) return;

      // Convex-hull guard: when B_old is fully opaque (255) and O >= 240, a valid mixture
      // cannot produce pa < 250; such pixels are uncomposited partial-alpha edges -> delegate to legacy fallback.
      if (ta === 255 && oa >= 240 && pa < 250) return;

      // Ascending gradient invariant for non-opaque backgrounds (protects soft translucent brush skirts).
      if (ta !== 255 && oa < 240 && oa < pa + MIN_ALPHA_GRADIENT_STEP) return;

      const oFa = oa / 255;
      const oPmR = data[oi] * oFa;
      const oPmG = data[oi + 1] * oFa;
      const oPmB = data[oi + 2] * oFa;
      const oPmA = oa;

      const vr = oPmR - bOldR;
      const vg = oPmG - bOldG;
      const vb = oPmB - bOldB;
      const va = oPmA - bOldA;
      const vSq = vr * vr + vg * vg + vb * vb + va * va;
      if (vSq < UNIFIED_4D_CORE_CONTRAST_SQ_MIN || vSq <= bestDistSq) return;

      const distO = Math.max(Math.abs(vr), Math.abs(vg), Math.abs(vb), Math.abs(va));
      if (distO < distP + 12) return;

      const uDotV =
        (pPmR - bOldR) * vr +
        (pPmG - bOldG) * vg +
        (pPmB - bOldB) * vb +
        (pPmA - bOldA) * va;
      if (uDotV <= 0) return;

      const alpha = uDotV / vSq;
      if (alpha < 0.02 || alpha > maxAlpha) return;

      const r0 = Math.abs(pPmR - (bOldR + alpha * vr));
      const r1 = Math.abs(pPmG - (bOldG + alpha * vg));
      const r2 = Math.abs(pPmB - (bOldB + alpha * vb));
      const r3 = Math.abs(pPmA - (bOldA + alpha * va));
      const maxR = Math.max(r0, r1, r2, r3);
      if (maxR > UNIFIED_4D_RESIDUAL_MAX) return;

      bestDistSq = vSq;
      bestAlpha = alpha;
      bestOR = oPmR;
      bestOG = oPmG;
      bestOB = oPmB;
      bestOA = oPmA;
      bestResid = maxR;
    };

    const fx = sharedBoundaryFromX![b];
    const fy = sharedBoundaryFromY![b];
    const dx = bx - fx;
    const dy = by - fy;

    // 1. Direct outward neighbor + bounded collinear ridge refinement (max 2 steps along (dx, dy))
    let ox = bx + dx;
    let oy = by + dy;
    if (ox >= 0 && ox < cw && oy >= 0 && oy < ch && visited[oy * cw + ox] !== 1) {
      let oi = (oy * cw + ox) * 4;
      for (let step = 0; step < 2; step++) {
        const nx = ox + dx;
        const ny = oy + dy;
        if (nx < 0 || nx >= cw || ny < 0 || ny >= ch) break;
        const np = ny * cw + nx;
        if (visited[np] === 1) break;
        const ni = np * 4;
        const oa1 = data[oi + 3];
        const oa2 = data[ni + 3];
        if (oa2 < oa1 || oa2 < UNIFIED_4D_CORE_MIN_ALPHA) break;

        const f1 = oa1 / 255;
        const f2 = oa2 / 255;
        const v2r = data[ni] * f2 - bOldR;
        const v2g = data[ni + 1] * f2 - bOldG;
        const v2b = data[ni + 2] * f2 - bOldB;
        const v2a = oa2 - bOldA;
        const v2Sq = v2r * v2r + v2g * v2g + v2b * v2b + v2a * v2a;
        if (v2Sq < UNIFIED_4D_CORE_CONTRAST_SQ_MIN) break;

        const o1r = data[oi] * f1;
        const o1g = data[oi + 1] * f1;
        const o1b = data[oi + 2] * f1;
        const t = ((o1r - bOldR) * v2r + (o1g - bOldG) * v2g + (o1b - bOldB) * v2b + (oa1 - bOldA) * v2a) / v2Sq;
        if (t < 0.15 || t > 0.90) break;

        if (
          Math.abs(o1r - (bOldR + t * v2r)) > UNIFIED_4D_COLLINEAR_RESIDUAL_MAX ||
          Math.abs(o1g - (bOldG + t * v2g)) > UNIFIED_4D_COLLINEAR_RESIDUAL_MAX ||
          Math.abs(o1b - (bOldB + t * v2b)) > UNIFIED_4D_COLLINEAR_RESIDUAL_MAX ||
          Math.abs(oa1 - (bOldA + t * v2a)) > UNIFIED_4D_COLLINEAR_RESIDUAL_MAX
        ) {
          break;
        }
        ox = nx;
        oy = ny;
        oi = ni;
      }
      evalCandidate(ox, oy);
    }

    // Fast path: if direct outward core already hit a high-confidence solid core (>= 250 alpha, <= 10 residual),
    // skip scanning 8-neighbors to keep straight/normal edges near peak mobile throughput.
    if (!(bestAlpha > 0 && bestOA >= 250 && bestResid <= 10)) {
      for (let k = 0; k < 8; k++) {
        const nx = bx + NEIGH8_DX[k];
        const ny = by + NEIGH8_DY[k];
        evalCandidate(nx, ny);

        // One bounded collinear hop outward if (nx, ny) is an intermediate AA neighbor
        const nnx = nx + NEIGH8_DX[k];
        const nny = ny + NEIGH8_DY[k];
        if (nx >= 0 && nx < cw && ny >= 0 && ny < ch && nnx >= 0 && nnx < cw && nny >= 0 && nny < ch) {
          const np = ny * cw + nx;
          const nnp = nny * cw + nnx;
          if (visited[np] !== 1 && visited[nnp] !== 1) {
            const ni = np * 4;
            const nni = nnp * 4;
            const oa1 = data[ni + 3];
            const oa2 = data[nni + 3];
            if (oa2 >= oa1 && oa2 >= UNIFIED_4D_CORE_MIN_ALPHA) {
              const f1 = oa1 / 255;
              const f2 = oa2 / 255;
              const v2r = data[nni] * f2 - bOldR;
              const v2g = data[nni + 1] * f2 - bOldG;
              const v2b = data[nni + 2] * f2 - bOldB;
              const v2a = oa2 - bOldA;
              const v2Sq = v2r * v2r + v2g * v2g + v2b * v2b + v2a * v2a;
              if (v2Sq >= UNIFIED_4D_CORE_CONTRAST_SQ_MIN) {
                const o1r = data[ni] * f1;
                const o1g = data[ni + 1] * f1;
                const o1b = data[ni + 2] * f1;
                const t = ((o1r - bOldR) * v2r + (o1g - bOldG) * v2g + (o1b - bOldB) * v2b + (oa1 - bOldA) * v2a) / v2Sq;
                if (
                  t >= 0.15 && t <= 0.90 &&
                  Math.abs(o1r - (bOldR + t * v2r)) <= UNIFIED_4D_COLLINEAR_RESIDUAL_MAX &&
                  Math.abs(o1g - (bOldG + t * v2g)) <= UNIFIED_4D_COLLINEAR_RESIDUAL_MAX &&
                  Math.abs(o1b - (bOldB + t * v2b)) <= UNIFIED_4D_COLLINEAR_RESIDUAL_MAX &&
                  Math.abs(oa1 - (bOldA + t * v2a)) <= UNIFIED_4D_COLLINEAR_RESIDUAL_MAX
                ) {
                  evalCandidate(nnx, nny);
                }
              }
            }
          }
        }
      }
    }

    if (bestAlpha > 0) {
      const outPmR = bestAlpha * bestOR + (1 - bestAlpha) * bNewR;
      const outPmG = bestAlpha * bestOG + (1 - bestAlpha) * bNewG;
      const outPmB = bestAlpha * bestOB + (1 - bestAlpha) * bNewB;
      const outPmA = bestAlpha * bestOA + (1 - bestAlpha) * bNewA;
      const outA = outPmA / 255;

      if (outA > 0.001) {
        data[bi]     = Math.min(255, Math.max(0, Math.round(outPmR / outA)));
        data[bi + 1] = Math.min(255, Math.max(0, Math.round(outPmG / outA)));
        data[bi + 2] = Math.min(255, Math.max(0, Math.round(outPmB / outA)));
        data[bi + 3] = Math.min(255, Math.max(0, Math.round(outPmA)));
        visited[bp] = 1;
        updatedCount++;
      }
    } else {
      // Safe fallback when 4D reconstruction lacks confident core/background separation:
      // Preserves Phase 5 / Phase 7 partial-alpha handling without forcing unreliable estimates.
      if (isTransparentSeed && EXPERIMENTAL_ALPHA_AWARE_TRANSPARENT_EDGE_FILL) {
        if (tryCompositePartialAlphaBoundary(data, visited, cw, ch, bx, by, fx, fy, bp, bi, pr, pg, pb, pa, fr, fg, fb, fillOpacity, false)) {
          updatedCount++;
        }
      } else if (pa < 255 && EXPERIMENTAL_ALPHA_AWARE_TRANSPARENT_EDGE_FILL) {
        if (tryCompositePartialAlphaBoundary(data, visited, cw, ch, bx, by, fx, fy, bp, bi, pr, pg, pb, pa, fr, fg, fb, fillOpacity, true)) {
          updatedCount++;
        }
      }
    }
  }

  return updatedCount;
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

  const useUnified4D =
    EXPERIMENTAL_UNIFIED_4D_BUCKET_EDGE_RECONSTRUCTION &&
    EXPERIMENTAL_ADAPTIVE_BUCKET_EDGE_GROWTH &&
    EXPERIMENTAL_ALPHA_AWARE_TRANSPARENT_EDGE_FILL &&
    EXPERIMENTAL_OPAQUE_BACKGROUND_EDGE_PRESERVATION &&
    EXPERIMENTAL_GUARD_PARTIAL_ALPHA_SEEDS_FROM_PHASE6;

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

    while (
      xCurr >= 0 &&
      visited[pixelIdx] !== 1 &&
      (useUnified4D
        ? matchColorEdgeAware(data, cw, ch, xCurr, yCurr, idx, tr, tg, tb, ta)
        : matchColor(data, idx, tr, tg, tb, ta))
    ) {
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

    while (
      xCurr < cw &&
      visited[pixelIdx] !== 1 &&
      (useUnified4D
        ? matchColorEdgeAware(data, cw, ch, xCurr, yCurr, idx, tr, tg, tb, ta)
        : matchColor(data, idx, tr, tg, tb, ta))
    ) {
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
        const matchesAbove =
          visited[pixelIdxAbove] !== 1 &&
          (useUnified4D
            ? matchColorEdgeAware(data, cw, ch, xCurr, yAbove, idxAbove, tr, tg, tb, ta)
            : matchColor(data, idxAbove, tr, tg, tb, ta));
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
        const matchesBelow =
          visited[pixelIdxBelow] !== 1 &&
          (useUnified4D
            ? matchColorEdgeAware(data, cw, ch, xCurr, yBelow, idxBelow, tr, tg, tb, ta)
            : matchColor(data, idxBelow, tr, tg, tb, ta));
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
    if (useUnified4D) {
      filledPixelCount += runUnified4DBoundaryPass(
        data,
        visited,
        cw,
        ch,
        boundaryCount,
        tr,
        tg,
        tb,
        ta,
        fr,
        fg,
        fb,
        fillOpacity
      );
    } else {
      const isTransparentSeed = ta <= 10;
      const isFullyOpaqueSeed = ta === 255;
      const isPartiallyTransparentSeed = ta > 10 && ta < 255;

      const canRunPhase5 = isTransparentSeed && EXPERIMENTAL_ALPHA_AWARE_TRANSPARENT_EDGE_FILL;
      // Partial-alpha seeds (10 < ta < 255) remain guarded from Phase 6 opaque RGB reconstruction (Phase 7),
      // and instead use a dedicated Phase 5-style source-over edge-compositing path when transparent edge fill is active.
      const canRunPartialAlphaEdge = (
        isPartiallyTransparentSeed &&
        EXPERIMENTAL_GUARD_PARTIAL_ALPHA_SEEDS_FROM_PHASE6 &&
        EXPERIMENTAL_ALPHA_AWARE_TRANSPARENT_EDGE_FILL
      );
      const canRunPhase6 = (
        EXPERIMENTAL_GUARD_PARTIAL_ALPHA_SEEDS_FROM_PHASE6
          ? isFullyOpaqueSeed
          : (isFullyOpaqueSeed || isPartiallyTransparentSeed)
      ) && EXPERIMENTAL_OPAQUE_BACKGROUND_EDGE_PRESERVATION;

      const activeBoundaryCount = (canRunPhase5 || canRunPartialAlphaEdge || canRunPhase6) ? boundaryCount : 0;

      for (let b = 0; b < activeBoundaryCount; b++) {
        const bx = sharedBoundaryX[b];
        const by = sharedBoundaryY[b];
        const bPixelIdx = by * cw + bx;
        if (visited[bPixelIdx] === 1) {
          continue;
        }
        const bIdx = bPixelIdx * 4;

        const pr = data[bIdx];
        const pg = data[bIdx + 1];
        const pb = data[bIdx + 2];
        const pa = data[bIdx + 3];

        if (canRunPhase5) {
          // Phase 5: Original Alpha-Aware Boundary Compositing for Transparent-Seeded Fills (ta <= 10)
          if (tryCompositePartialAlphaBoundary(
            data,
            visited,
            cw,
            ch,
            bx,
            by,
            sharedBoundaryFromX[b],
            sharedBoundaryFromY[b],
            bPixelIdx,
            bIdx,
            pr,
            pg,
            pb,
            pa,
            fr,
            fg,
            fb,
            fillOpacity,
            false
          )) {
            filledPixelCount++;
          }
        } else if (canRunPartialAlphaEdge) {
          // Repeated Partial-Alpha Boundary Compositing (10 < ta < 255) with Phase 7 Guard Active
          if (tryCompositePartialAlphaBoundary(
            data,
            visited,
            cw,
            ch,
            bx,
            by,
            sharedBoundaryFromX[b],
            sharedBoundaryFromY[b],
            bPixelIdx,
            bIdx,
            pr,
            pg,
            pb,
            pa,
            fr,
            fg,
            fb,
            fillOpacity,
            true
          )) {
            filledPixelCount++;
          }
        } else if (canRunPhase6) {
          // Guard transition to fully opaque seed: partial-alpha boundary candidates must NOT enter opaque RGB reconstruction.
          if (pa < 255) {
            if (tryCompositePartialAlphaBoundary(
              data,
              visited,
              cw,
              ch,
              bx,
              by,
              sharedBoundaryFromX[b],
              sharedBoundaryFromY[b],
              bPixelIdx,
              bIdx,
              pr,
              pg,
              pb,
              pa,
              fr,
              fg,
              fb,
              fillOpacity,
              true
            )) {
              filledPixelCount++;
            }
            continue;
          }

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
  }

  const isFullCanvasOpaque = (filledPixelCount === cw * ch) && (fillOpacity >= 0.95);
  return { r: tr, g: tg, b: tb, a: ta, isFullCanvasOpaque, fillHex, filledPixelCount };
};

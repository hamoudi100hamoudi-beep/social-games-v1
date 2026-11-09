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

  let head = 0;
  let filledPixelCount = 0;
  const byteStride = cw * 4;

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
    const hasAbove = yCurr > 0;
    const hasBelow = yCurr < ch - 1;
    const yAbove = yCurr - 1;
    const yBelow = yCurr + 1;

    while (xCurr < cw && !visited[pixelIdx] && matchColor(data, idx, tr, tg, tb, ta)) {
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
        const matchesAbove = !visited[pixelIdxAbove] && matchColor(data, idxAbove, tr, tg, tb, ta);
        if (!spanAbove && matchesAbove) {
          queueX.push(xCurr);
          queueY.push(yAbove);
          spanAbove = true;
        } else if (spanAbove && !matchesAbove) {
          spanAbove = false;
        }
      }

      if (hasBelow) {
        const pixelIdxBelow = pixelIdx + cw;
        const idxBelow = idx + byteStride;
        const matchesBelow = !visited[pixelIdxBelow] && matchColor(data, idxBelow, tr, tg, tb, ta);
        if (!spanBelow && matchesBelow) {
          queueX.push(xCurr);
          queueY.push(yBelow);
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

  const isFullCanvasOpaque = (filledPixelCount === cw * ch) && (fillOpacity >= 0.95);
  return { r: tr, g: tg, b: tb, a: ta, isFullCanvasOpaque, fillHex, filledPixelCount };
};

import type { ToolType } from '../types/draw';

// Turn angle threshold for cusp clamping (~60 degrees) in Hybrid Spline Renderer
export const SPLINE_CUSP_COS = 0.5;

export const drawShape = (
  activeCtx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  drawTool: ToolType,
  drawColor: string,
  drawWidth: number,
  drawOpacity: number,
  isDestinationOut: boolean = false
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
    if (isDestinationOut) {
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

export const drawEntirePath = (
  activeCtx: CanvasRenderingContext2D,
  path: { x: number; y: number }[],
  drawTool: ToolType,
  drawColor: string,
  drawWidth: number,
  drawOpacity: number,
  isDestinationOut: boolean
) => {
  if (path.length === 0) return;

  activeCtx.save();
  activeCtx.lineWidth = drawWidth;
  activeCtx.lineCap = 'round';
  activeCtx.lineJoin = 'round';
  activeCtx.globalAlpha = drawOpacity;

  if (drawTool === 'eraser') {
    if (isDestinationOut) {
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

import type { ToolType } from '../types/draw';

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

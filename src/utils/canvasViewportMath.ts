export const computeCanvasFitScale = (
  containerWidth: number,
  containerHeight: number,
  logicalWidth: number,
  logicalHeight: number,
  readOnly: boolean
): number => {
  return readOnly
    ? Math.min(
        containerWidth / logicalWidth,
        containerHeight / logicalHeight
      )
    : containerHeight / logicalHeight;
};

export const calculateLogicalCoordinates = (
  clientX: number,
  clientY: number,
  rect: Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>,
  logicalWidth: number,
  logicalHeight: number,
  clamp: boolean = true
): { x: number; y: number } => {
  if (rect.width === 0 || rect.height === 0) {
    return { x: 0, y: 0 };
  }

  let x = ((clientX - rect.left) / rect.width) * logicalWidth;
  let y = ((clientY - rect.top) / rect.height) * logicalHeight;

  if (clamp) {
    x = Math.max(0, Math.min(logicalWidth, x));
    y = Math.max(0, Math.min(logicalHeight, y));
  }

  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10
  };
};

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

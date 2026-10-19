export type ToolType =
  | 'pencil'
  | 'eraser'
  | 'bucket'
  | 'picker'
  | 'pipette'
  | 'line'
  | 'strokeRect'
  | 'fillRect'
  | 'strokeCircle'
  | 'fillCircle';

export interface Point {
  x: number;
  y: number;
}

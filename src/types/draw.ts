export type ToolType = 'pencil' | 'eraser' | 'bucket' | 'line' | 'strokeRect' | 'fillRect' | 'strokeCircle' | 'fillCircle' | 'pipette';

export interface PooledPoint {
  x: number;
  y: number;
}

export interface StrokeObject {
  instanceId: string;
  tool: ToolType;
  color: string;
  width: number;
  opacity: number;
  points: PooledPoint[];
}


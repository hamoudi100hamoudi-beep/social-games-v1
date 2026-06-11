import { ToolType, PooledPoint } from '../types/draw';

export const TOP_COLORS = ['#000000', '#595959', '#0022ff', '#ffffff', '#bcbcbc', '#00d3ff', '#009e24', '#a21818', '#7e4419', '#00ff22', '#ff0000', '#ff7c00'];
export const BOT_COLORS = ['#c17a14', '#93003a', '#a56a56', '#ffc700', '#ff0084', '#ffc0b0', '#12cca2', '#91cc00', '#7900ff', '#0d2c54', '#b17dfd', '#ffff00'];

export const compressPayload = (data: any): any => {
  if (!data) return data;
  const comp: any = {};
  if (data.instanceId !== undefined) comp.i = data.instanceId;
  if (data.tool !== undefined) comp.t = data.tool;
  if (data.color !== undefined) comp.c = data.color;
  if (data.width !== undefined) comp.w = data.width;
  if (data.opacity !== undefined) comp.o = Math.round(data.opacity * 100) / 100;
  if (data.x !== undefined) comp.x = Math.round(data.x * 10000);
  if (data.y !== undefined) comp.y = Math.round(data.y * 10000);
  if (data.startX !== undefined) comp.sx = Math.round(data.startX * 10000);
  if (data.startY !== undefined) comp.sy = Math.round(data.startY * 10000);
  if (data.moves !== undefined && Array.isArray(data.moves)) {
    comp.m = data.moves.map((pt: any) => ({
      x: Math.round(pt.x * 10000),
      y: Math.round(pt.y * 10000)
    }));
  }
  return comp;
};

export const decompressPayload = (comp: any): any => {
  if (!comp) return comp;
  if (comp.instanceId !== undefined) return comp;
  const data: any = {};
  if (comp.i !== undefined) data.instanceId = comp.i;
  if (comp.t !== undefined) data.tool = comp.t;
  if (comp.c !== undefined) data.color = comp.c;
  if (comp.w !== undefined) data.width = comp.w;
  if (comp.o !== undefined) data.opacity = comp.o;
  if (comp.x !== undefined) data.x = comp.x / 10000;
  if (comp.y !== undefined) data.y = comp.y / 10000;
  if (comp.startX !== undefined) data.startX = comp.sx / 10000;
  if (comp.startY !== undefined) data.startY = comp.sy / 10000;
  if (comp.m !== undefined && Array.isArray(comp.m)) {
    data.moves = comp.m.map((pt: any) => ({
      x: pt.x / 10000,
      y: pt.y / 10000
    }));
  }
  return data;
};

const MSG_DRAW_START = 1;
const MSG_DRAW_MOVE = 2;
const MSG_DRAW_END = 3;
const MSG_DRAW_ACTION = 4;
const MSG_DRAW_CLEAR = 5;
const MSG_DRAW_CANCEL = 6;
const MSG_DRAW_UNDO = 7;
const MSG_DRAW_REDO = 8;

const TOOLS_LIST = ['pencil', 'eraser', 'bucket', 'line', 'strokeRect', 'fillRect', 'strokeCircle', 'fillCircle', 'pipette'];

export const getToolIndex = (toolName: string): number => {
  const idx = TOOLS_LIST.indexOf(toolName);
  return idx >= 0 ? idx : 0;
};

export const getToolName = (idx: number): string => {
  return TOOLS_LIST[idx] || 'pencil';
};

export const writeString7 = (view: DataView, offset: number, str: string) => {
  for (let i = 0; i < 7; i++) {
    const code = i < str.length ? str.charCodeAt(i) : 0;
    view.setUint8(offset + i, code);
  }
};

export const readString7 = (view: DataView, offset: number): string => {
  let str = '';
  for (let i = 0; i < 7; i++) {
    const code = view.getUint8(offset + i);
    if (code > 0) {
      str += String.fromCharCode(code);
    }
  }
  return str;
};

export const parseColorToRGB = (colorStr: string): {r: number, g: number, b: number} => {
  if (!colorStr) return { r: 0, g: 0, b: 0 };
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16) || 0;
      const g = parseInt(hex[1] + hex[1], 16) || 0;
      const b = parseInt(hex[2] + hex[2], 16) || 0;
      return { r, g, b };
    } else {
      const r = parseInt(hex.slice(0, 2), 16) || 0;
      const g = parseInt(hex.slice(2, 4), 16) || 0;
      const b = parseInt(hex.slice(4, 6), 16) || 0;
      return { r, g, b };
    }
  }
  return { r: 0, g: 0, b: 0 };
};

export const formatRGBToHex = (r: number, g: number, b: number): string => {
  const pad = (n: number) => n.toString(16).padStart(2, '0');
  return `#${pad(r)}${pad(g)}${pad(b)}`;
};

// High-performance static Point Pool to prevent Garbage Collection and heap allocations inside rendering/pointer loops
const pointPool: PooledPoint[] = [];

// Pre-hydrate point pool with healthy default slots to ensure instantaneous reuse at start
for (let i = 0; i < 400; i++) {
  pointPool.push({ x: 0, y: 0 });
}

export const acquirePoint = (x: number, y: number): PooledPoint => {
  const pt = pointPool.pop();
  if (pt) {
    pt.x = x;
    pt.y = y;
    return pt;
  }
  return { x, y };
};

export const releasePoints = (points: PooledPoint[]) => {
  const len = points.length;
  for (let i = 0; i < len; i++) {
    if (pointPool.length < 2000) {
      pointPool.push(points[i]);
    }
  }
  // Clear the array natively without creating a new reference
  points.length = 0;
};

export const encodeBinaryDrawMessage = (event: string, data: any): ArrayBuffer => {
  const instId = data.instanceId || '';
  
  if (event === 'draw_start') {
    const buffer = new ArrayBuffer(18);
    const view = new DataView(buffer);
    view.setUint8(0, MSG_DRAW_START);
    writeString7(view, 1, instId);
    
    view.setUint8(8, getToolIndex(data.tool));
    const rgb = parseColorToRGB(data.color);
    view.setUint8(9, rgb.r);
    view.setUint8(10, rgb.g);
    view.setUint8(11, rgb.b);
    
    const width = Math.min(255, Math.max(0, Math.round(data.width || 0)));
    view.setUint8(12, width);
    
    const opacityVal = Math.min(100, Math.max(0, Math.round((data.opacity !== undefined ? data.opacity : 1) * 100)));
    view.setUint8(13, opacityVal);
    
    const scaledX = Math.min(10000, Math.max(0, Math.round((data.x || 0) * 10000)));
    const scaledY = Math.min(10000, Math.max(0, Math.round((data.y || 0) * 10000)));
    view.setUint16(14, scaledX, true);
    view.setUint16(16, scaledY, true);
    
    return buffer;
  }
  
  if (event === 'draw_move') {
    const moves = Array.isArray(data.moves) ? data.moves : (data.x !== undefined ? [{ x: data.x, y: data.y }] : []);
    const movesLength = moves.length;
    
    const buffer = new ArrayBuffer(10 + movesLength * 4);
    const view = new DataView(buffer);
    view.setUint8(0, MSG_DRAW_MOVE);
    writeString7(view, 1, instId);
    
    view.setUint16(8, movesLength, true);
    for (let i = 0; i < movesLength; i++) {
      const pt = moves[i];
      const scaledPtX = Math.min(10000, Math.max(0, Math.round((pt.x || 0) * 10000)));
      const scaledPtY = Math.min(10000, Math.max(0, Math.round((pt.y || 0) * 10000)));
      view.setUint16(10 + i * 4, scaledPtX, true);
      view.setUint16(12 + i * 4, scaledPtY, true);
    }
    
    return buffer;
  }
  
  if (event === 'draw_end') {
    const buffer = new ArrayBuffer(23);
    const view = new DataView(buffer);
    view.setUint8(0, MSG_DRAW_END);
    writeString7(view, 1, instId);
    
    view.setUint8(8, getToolIndex(data.tool));
    const rgb = parseColorToRGB(data.color);
    view.setUint8(9, rgb.r);
    view.setUint8(10, rgb.g);
    view.setUint8(11, rgb.b);
    
    const width = Math.min(255, Math.max(0, Math.round(data.width || 0)));
    view.setUint8(12, width);
    
    const opacityVal = Math.min(100, Math.max(0, Math.round((data.opacity !== undefined ? data.opacity : 1) * 100)));
    view.setUint8(13, opacityVal);
    
    const scaledSX = Math.min(10000, Math.max(0, Math.round((data.startX || 0) * 10000)));
    const scaledSY = Math.min(10000, Math.max(0, Math.round((data.startY || 0) * 10000)));
    view.setUint16(14, scaledSX, true);
    view.setUint16(16, scaledSY, true);
    
    const scaledX = Math.min(10000, Math.max(0, Math.round((data.x || 0) * 10000)));
    const scaledY = Math.min(10000, Math.max(0, Math.round((data.y || 0) * 10000)));
    view.setUint16(18, scaledX, true);
    view.setUint16(20, scaledY, true);
    
    view.setUint8(22, data.isCancelled ? 1 : 0);
    
    return buffer;
  }
  
  if (event === 'draw_action') {
    const buffer = new ArrayBuffer(17);
    const view = new DataView(buffer);
    view.setUint8(0, MSG_DRAW_ACTION);
    writeString7(view, 1, instId);
    
    view.setUint8(8, getToolIndex(data.tool));
    const rgb = parseColorToRGB(data.color);
    view.setUint8(9, rgb.r);
    view.setUint8(10, rgb.g);
    view.setUint8(11, rgb.b);
    
    const opacityVal = Math.min(100, Math.max(0, Math.round((data.opacity !== undefined ? data.opacity : 1) * 100)));
    view.setUint8(12, opacityVal);
    
    const scaledX = Math.min(10000, Math.max(0, Math.round((data.x || 0) * 10000)));
    const scaledY = Math.min(10000, Math.max(0, Math.round((data.y || 0) * 10000)));
    view.setUint16(13, scaledX, true);
    view.setUint16(15, scaledY, true);
    
    return buffer;
  }
  
  let type = 5;
  if (event === 'draw_clear') type = MSG_DRAW_CLEAR;
  else if (event === 'draw_cancel') type = MSG_DRAW_CANCEL;
  else if (event === 'draw_undo') type = MSG_DRAW_UNDO;
  else if (event === 'draw_redo') type = MSG_DRAW_REDO;
  
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint8(0, type);
  writeString7(view, 1, instId);
  return buffer;
};

export const decodeBinaryDrawMessage = (input: any): { event: string, data: any } | null => {
  if (!input) return null;
  
  let buffer: ArrayBuffer;
  try {
    if (input instanceof ArrayBuffer) {
      buffer = input;
    } else if (input && input.buffer instanceof ArrayBuffer) {
      const offset = input.byteOffset || 0;
      const length = input.byteLength || input.buffer.byteLength;
      buffer = input.buffer.slice(offset, offset + length);
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
      buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    } else if (input && input.type === 'Buffer' && Array.isArray(input.data)) {
      buffer = new Uint8Array(input.data).buffer;
    } else if (Array.isArray(input)) {
      buffer = new Uint8Array(input).buffer;
    } else if (input && typeof input === 'object' && Array.isArray(input.data)) {
      buffer = new Uint8Array(input.data).buffer;
    } else {
      console.warn("[decodeBinaryDrawMessage] Unknown binary input type:", typeof input, input);
      return null;
    }
  } catch (e) {
    console.error("[decodeBinaryDrawMessage] Failed to slice/convert buffer:", e, input);
    return null;
  }
  
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 8) {
      console.warn("[decodeBinaryDrawMessage] DataView byteLength is too small:", view.byteLength);
      return null;
    }
    
    const type = view.getUint8(0);
    const instId = readString7(view, 1);
    
    if (type === MSG_DRAW_START) {
      const tool = getToolName(view.getUint8(8));
      const r = view.getUint8(9);
      const g = view.getUint8(10);
      const b = view.getUint8(11);
      const color = formatRGBToHex(r, g, b);
      const width = view.getUint8(12);
      const opacity = view.getUint8(13) / 100;
      const x = view.getUint16(14, true) / 10000;
      const y = view.getUint16(16, true) / 10000;
      
      return {
        event: 'draw_start',
        data: { instanceId: instId, tool, color, width, opacity, x, y }
      };
    }
    
    if (type === MSG_DRAW_MOVE) {
      const movesLength = view.getUint16(8, true);
      const moves = [];
      for (let i = 0; i < movesLength; i++) {
        const x = view.getUint16(10 + i * 4, true) / 10000;
        const y = view.getUint16(12 + i * 4, true) / 10000;
        moves.push({ x, y });
      }
      
      if (movesLength === 1) {
        return {
          event: 'draw_move',
          data: { instanceId: instId, x: moves[0].x, y: moves[0].y }
        };
      } else {
        return {
          event: 'draw_move',
          data: { instanceId: instId, moves }
        };
      }
    }
    
    if (type === MSG_DRAW_END) {
      const tool = getToolName(view.getUint8(8));
      const r = view.getUint8(9);
      const g = view.getUint8(10);
      const b = view.getUint8(11);
      const color = formatRGBToHex(r, g, b);
      const width = view.getUint8(12);
      const opacity = view.getUint8(13) / 100;
      const startX = view.getUint16(14, true) / 10000;
      const startY = view.getUint16(16, true) / 10000;
      const x = view.getUint16(18, true) / 10000;
      const y = view.getUint16(20, true) / 10000;
      
      const isCancelled = view.byteLength >= 23 ? (view.getUint8(22) === 1) : false;
      
      return {
        event: 'draw_end',
        data: { instanceId: instId, tool, color, width, opacity, startX, startY, x, y, isCancelled }
      };
    }
    
    if (type === MSG_DRAW_ACTION) {
      const tool = getToolName(view.getUint8(8));
      const r = view.getUint8(9);
      const g = view.getUint8(10);
      const b = view.getUint8(11);
      const color = formatRGBToHex(r, g, b);
      const opacity = view.getUint8(12) / 100;
      const x = view.getUint16(13, true) / 10000;
      const y = view.getUint16(15, true) / 10000;
      
      return {
        event: 'draw_action',
        data: { instanceId: instId, tool, color, opacity, x, y }
      };
    }
    
    let eventName = 'draw_clear';
    if (type === MSG_DRAW_CANCEL) eventName = 'draw_cancel';
    else if (type === MSG_DRAW_UNDO) eventName = 'draw_undo';
    else if (type === MSG_DRAW_REDO) eventName = 'draw_redo';
    
    return {
      event: eventName,
      data: { instanceId: instId }
    };
  } catch (parseError) {
    console.error("[decodeBinaryDrawMessage] RangeError or Parsing Exception:", parseError, input);
    return null;
  }
};

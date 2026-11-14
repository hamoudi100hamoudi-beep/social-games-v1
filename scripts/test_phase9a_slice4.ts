import {
  encodeBinaryDrawMessage,
  decodeBinaryDrawMessage,
  MSG_DRAW_COMMIT,
  MSG_DRAW_ABORT
} from '../src/utils/drawBinaryHelper.js';
import { getValidBatchBucketPayload } from '../src/components/game/DrawingCanvasCore.js';
import { replaySingleCommand } from '../src/utils/canvasReplayEngine.js';
import { executeRasterFloodFill } from '../src/utils/canvasFloodFill.js';
import { handleDrawBinary } from '../server/registerDrawBinaryHandler.js';
import { isValidType4Packet } from '../server/utils/binaryBufferHelpers.js';
import { RoomManager } from '../server/rooms.js';

console.log('==================================================================');
console.log('🛡️  PHASE 9A — SLICE 4: TYPE 4 VALIDATION & DECODER BOUNDS SAFETY');
console.log('==================================================================\n');

let passCount = 0;
let failCount = 0;

const origConsoleError = console.error;
const origConsoleWarn = console.warn;

function check(condition: boolean, label: string, details?: string) {
  if (condition) {
    passCount++;
    console.log(`✅ PASS: ${label}`);
  } else {
    failCount++;
    origConsoleError(`❌ FAIL: ${label}${details ? ` -> ${details}` : ''}`);
  }
}

function stopManagerTimer(rm: RoomManager) {
  if ((rm as any).tickInterval) {
    clearInterval((rm as any).tickInterval);
    (rm as any).tickInterval = null;
  }
}

function makeRawType4(opts: {
  type?: number;
  length?: number;
  instId?: string;
  instBytes?: number[];
  tool?: number;
  r?: number;
  g?: number;
  b?: number;
  opacity?: number;
  x?: number;
  y?: number;
  targetRGBA?: { r: number; g: number; b: number; a: number };
  strokeId?: number;
  strokeIdOffset?: number;
}): Buffer {
  const len = opts.length ?? 17;
  const buf = Buffer.alloc(len);
  if (len >= 1) buf.writeUInt8((opts.type ?? 4) & 0xFF, 0);

  if (opts.instBytes && len >= 8) {
    for (let i = 0; i < 7; i++) {
      buf.writeUInt8((opts.instBytes[i] ?? 0) & 0xFF, 1 + i);
    }
  } else {
    const inst = opts.instId !== undefined ? opts.instId : 'u000001';
    if (inst.length > 0 && len >= 8) {
      buf.write(inst.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
    }
  }

  if (len >= 9) buf.writeUInt8((opts.tool ?? 2) & 0xFF, 8);
  if (len >= 12) {
    buf.writeUInt8((opts.r ?? 0x11) & 0xFF, 9);
    buf.writeUInt8((opts.g ?? 0x22) & 0xFF, 10);
    buf.writeUInt8((opts.b ?? 0x33) & 0xFF, 11);
  }
  if (len >= 13) buf.writeUInt8((opts.opacity ?? 100) & 0xFF, 12);
  if (len >= 15) buf.writeUInt16LE((opts.x ?? 5000) & 0xFFFF, 13);
  if (len >= 17) buf.writeUInt16LE((opts.y ?? 5000) & 0xFFFF, 15);

  if (opts.targetRGBA && len >= 21) {
    buf.writeUInt8(opts.targetRGBA.r & 0xFF, 17);
    buf.writeUInt8(opts.targetRGBA.g & 0xFF, 18);
    buf.writeUInt8(opts.targetRGBA.b & 0xFF, 19);
    buf.writeUInt8(opts.targetRGBA.a & 0xFF, 20);
  }

  if (opts.strokeId !== undefined) {
    const off = opts.strokeIdOffset ?? (opts.targetRGBA ? 21 : 17);
    if (len >= off + 2) {
      buf.writeUInt16LE(opts.strokeId & 0xFFFF, off);
    }
  }
  return buf;
}

function setupModeRoom(mode: 'normal' | 'freedraw' | 'experimental') {
  const broadcasts: { event: string; payload: any; volatile?: boolean }[] = [];
  const createTargetSocket = (_id: string) => ({
    emit: (_event: string, _payload: any) => {}
  });
  const roomSocketsMap = new Map<string, any>([
    ['sock-drawer', createTargetSocket('sock-drawer')],
    ['sock-viewer', createTargetSocket('sock-viewer')]
  ]);
  const roomMemberSet = new Set<string>(['sock-drawer', 'sock-viewer']);

  const mockIo: any = {
    to: (_roomId: string) => ({
      emit: (_event: string, _payload: any) => {}
    }),
    sockets: {
      adapter: {
        rooms: new Map<string, Set<string>>([['R1', roomMemberSet]])
      },
      sockets: roomSocketsMap
    }
  };

  const rm = new RoomManager();
  rm.setIo(mockIo);
  const instId = 'u000001';
  const room = rm.createRoom('R1') as any;
  room.isFreeDraw = mode === 'freedraw';
  room.isExperimental = mode === 'experimental';

  rm.addPlayerToRoom('R1', {
    id: 'sock-drawer',
    name: 'Drawer',
    avatar: '🎨',
    score: 0,
    wins: 0,
    roomId: 'R1',
    persistentId: 'p1',
    isOffline: false
  });
  rm.addPlayerToRoom('R1', {
    id: 'sock-viewer',
    name: 'Viewer',
    avatar: '👁️',
    score: 0,
    wins: 0,
    roomId: 'R1',
    persistentId: 'p2',
    isOffline: false
  });

  if (mode === 'freedraw') {
    room.activeDrawers = ['p1'];
    room.gameState.status = 'WAITING';
  } else {
    room.gameState.status = 'DRAWING';
    room.gameState.currentDrawerId = 'p1';
  }
  room.drawingIdentities = {
    [instId]: { playerId: 'p1', socketId: 'sock-drawer', playerName: 'Drawer' }
  };
  room.gameState.drawHistory = [];
  room.gameState.redoStack = [];
  room.gameState.isDrawingActive = false;

  const drawerSocket: any = {
    id: 'sock-drawer',
    broadcast: {
      to: (_rid: string) => ({
        emit: (event: string, payload: any) => {
          broadcasts.push({ event, payload });
        },
        volatile: {
          emit: (event: string, payload: any) => {
            broadcasts.push({ event, payload, volatile: true });
          }
        }
      })
    }
  };

  const deps = { io: mockIo, roomManager: rm };

  return { rm, room, drawerSocket, deps, broadcasts };
}

function makeMockCanvasCtx() {
  const calls: string[] = [];
  const ctx: any = {
    canvas: { width: 680, height: 396 },
    fillStyle: '#000000',
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    setTransform: () => calls.push('setTransform'),
    fillRect: () => calls.push('fillRect'),
    clearRect: () => calls.push('clearRect'),
    beginPath: () => calls.push('beginPath'),
    moveTo: () => calls.push('moveTo'),
    lineTo: () => calls.push('lineTo'),
    stroke: () => calls.push('stroke'),
    closePath: () => calls.push('closePath'),
    getImageData: () => ({ data: new Uint8ClampedArray(4) })
  };
  return { ctx, calls };
}

// ── PART 1: SERVER TYPE 4 VALIDATION ACROSS ALL 3 ROOM MODES ──────────────────
console.log('── Part 1: Server Type 4 O(1) Validation Across All Modes ──');

for (const mode of ['normal', 'experimental', 'freedraw'] as const) {
  const { rm, room, drawerSocket, deps, broadcasts } = setupModeRoom(mode);
  try {

  // Valid 17, 19, 21, 23 byte forms
  const v17 = makeRawType4({ length: 17, instId: 'u000001', tool: 2, opacity: 100, x: 0, y: 10000 });
  const v19 = makeRawType4({ length: 19, instId: 'u000001', tool: 2, opacity: 50, x: 2500, y: 7500, strokeId: 42, strokeIdOffset: 17 });
  const v21 = makeRawType4({ length: 21, instId: 'u000001', tool: 2, opacity: 0, x: 10000, y: 0, targetRGBA: { r: 255, g: 254, b: 253, a: 255 } });
  const v23 = makeRawType4({ length: 23, instId: 'u000001', tool: 2, opacity: 80, x: 5000, y: 5000, targetRGBA: { r: 10, g: 20, b: 30, a: 255 }, strokeId: 99, strokeIdOffset: 21 });

  handleDrawBinary(drawerSocket, v17, deps);
  check(room.gameState.drawHistory.length === 1 && broadcasts.length === 1, `[${mode}] accepts valid 17B Type 4 (including first-action bucket on empty history)`);

  handleDrawBinary(drawerSocket, v19, deps);
  check(room.gameState.drawHistory.length === 2 && broadcasts.length === 2, `[${mode}] accepts valid 19B Type 4 (strokeId only)`);

  handleDrawBinary(drawerSocket, v21, deps);
  check(room.gameState.drawHistory.length === 3 && broadcasts.length === 3, `[${mode}] accepts valid 21B Type 4 (targetRGBA only)`);

  handleDrawBinary(drawerSocket, v23, deps);
  check(room.gameState.drawHistory.length === 4 && broadcasts.length === 4, `[${mode}] accepts valid 23B Type 4 (targetRGBA + strokeId)`);

  // Verify AGENTS.md invariant: valid Type 4 clears redoStack & records strokeId
  room.gameState.redoStack = [{ event: 'draw_binary', data: Buffer.from([9]) }];
  room.gameState.isDrawingActive = true;
  handleDrawBinary(drawerSocket, v23, deps);
  check(room.gameState.drawHistory.length === 5 && room.gameState.redoStack.length === 0, `[${mode}] valid Type 4 clears redoStack & appends history`);

  // Prepare sentinel state to verify ZERO mutation on rejected Type 4 packets
  const histBefore = room.gameState.drawHistory.length;
  const sentinelRedo = [{ event: 'draw_binary', data: Buffer.from([1, 2, 3]) }];
  room.gameState.redoStack = sentinelRedo;
  room.gameState.isDrawingActive = true;
  const bcastBefore = broadcasts.length;

  const invalidCases: { label: string; buf: Buffer }[] = [
    ...Array.from({ length: 17 }, (_, l) => ({ label: `len=${l}`, buf: makeRawType4({ length: l }) })),
    { label: 'len=18', buf: makeRawType4({ length: 18 }) },
    { label: 'len=20', buf: makeRawType4({ length: 20 }) },
    { label: 'len=22', buf: makeRawType4({ length: 22 }) },
    { label: 'len=24 (trailing 1B)', buf: makeRawType4({ length: 24 }) },
    { label: 'len=64', buf: makeRawType4({ length: 64 }) },
    { label: 'len=1024', buf: makeRawType4({ length: 1024 }) },
    { label: 'tool=0 (pencil)', buf: makeRawType4({ tool: 0 }) },
    { label: 'tool=1 (eraser)', buf: makeRawType4({ tool: 1 }) },
    { label: 'tool=3 (line)', buf: makeRawType4({ tool: 3 }) },
    { label: 'tool=8 (pipette)', buf: makeRawType4({ tool: 8 }) },
    { label: 'tool=255', buf: makeRawType4({ tool: 255 }) },
    { label: 'empty instId', buf: makeRawType4({ instId: '' }) },
    { label: 'embedded null instId', buf: makeRawType4({ instBytes: [0x61, 0x00, 0x62, 0, 0, 0, 0] }) },
    { label: 'control byte instId', buf: makeRawType4({ instBytes: [0x01, 0x62, 0, 0, 0, 0, 0] }) },
    { label: 'non-ASCII instId', buf: makeRawType4({ instBytes: [0x80, 0x62, 0, 0, 0, 0, 0] }) },
    { label: 'opacity=101', buf: makeRawType4({ opacity: 101 }) },
    { label: 'opacity=255', buf: makeRawType4({ opacity: 255 }) },
    { label: 'x=10001', buf: makeRawType4({ x: 10001 }) },
    { label: 'x=65535', buf: makeRawType4({ x: 65535 }) },
    { label: 'y=10001', buf: makeRawType4({ y: 10001 }) },
    { label: 'y=65535', buf: makeRawType4({ y: 65535 }) },
  ];

  let allRejectedCleanly = true;
  let firstFailure = '';
  for (const tc of invalidCases) {
    handleDrawBinary(drawerSocket, tc.buf, deps);
    if (
      room.gameState.drawHistory.length !== histBefore ||
      broadcasts.length !== bcastBefore ||
      room.gameState.redoStack !== sentinelRedo ||
      room.gameState.redoStack.length !== 1 ||
      room.gameState.isDrawingActive !== true
    ) {
      allRejectedCleanly = false;
      firstFailure = tc.label;
      break;
    }
  }
  check(
    allRejectedCleanly,
    `[${mode}] rejects all ${invalidCases.length} invalid Type 4 cases with zero history/redo/isDrawingActive/broadcast mutation`,
    firstFailure
  );

  // Verify AGENTS.md first-action invariant directly on fresh empty room history with valid 23B packet
  room.gameState.drawHistory = [];
  rm.recordDrawCommand(room.id, 'draw_binary', v23);
  check(room.gameState.drawHistory.length === 1, `[${mode}] AGENTS.md first-action Type 4 on empty history succeeds`);
  } finally {
    stopManagerTimer(rm);
  }
}

// Verify Type 10 legacy compatibility preserved cleanly alongside explicit Type 4 branch
{
  const { rm, room, drawerSocket, deps, broadcasts } = setupModeRoom('normal');
  try {
    const legacyType10 = Buffer.from([10, 0x75, 0x31, 0, 0, 0, 0, 0, 99, 88]);
    handleDrawBinary(drawerSocket, legacyType10, deps);
    check(
      room.gameState.drawHistory.length === 1 && broadcasts.length === 1,
      'Legacy Type 10 (>8B) still passes to recordDrawCommand and broadcasts normally'
    );
  } finally {
    stopManagerTimer(rm);
  }
}

// O(1) throughput sanity benchmark for isValidType4Packet
{
  const validSample = makeRawType4({ length: 23, instId: 'u000001', targetRGBA: { r: 1, g: 2, b: 3, a: 255 }, strokeId: 7 });
  const invalidSample = makeRawType4({ length: 20, instId: 'u000001' });
  const t0 = performance.now();
  let acc = 0;
  for (let i = 0; i < 50000; i++) {
    if (isValidType4Packet(i % 2 === 0 ? validSample : invalidSample)) acc++;
  }
  const dt = performance.now() - t0;
  check(acc === 25000 && dt < 200, `O(1) isValidType4Packet handles 50,000 checks fast (${dt.toFixed(2)} ms)`);
}

// ── PART 2: CLIENT DECODER BOUNDS SAFETY & ZERO CONSOLE NOISE ─────────────────
console.log('\n── Part 2: Client decodeBinaryDrawMessage Bounds Safety ──');

let consoleErrorCalls = 0;
let consoleWarnCalls = 0;

function withZeroNoiseSpy(fn: () => void) {
  consoleErrorCalls = 0;
  consoleWarnCalls = 0;
  console.error = () => { consoleErrorCalls++; };
  console.warn = () => { consoleWarnCalls++; };
  try {
    fn();
  } finally {
    console.error = origConsoleError;
    console.warn = origConsoleWarn;
  }
}

withZeroNoiseSpy(() => {
  // 2A. All 4 Type 4 forms round-trip accurately without cross-contamination
  const t4_17 = makeRawType4({ length: 17, instId: 'u123456', tool: 2, r: 0xAA, g: 0xBB, b: 0xCC, opacity: 75, x: 1234, y: 5678 });
  const d17 = decodeBinaryDrawMessage(t4_17);
  check(
    d17?.event === 'draw_action' &&
      d17.data.instanceId === 'u123456' &&
      d17.data.tool === 'bucket' &&
      d17.data.color === '#aabbcc' &&
      Math.abs(d17.data.opacity - 0.75) < 1e-6 &&
      Math.abs(d17.data.x - 0.1234) < 1e-6 &&
      Math.abs(d17.data.y - 0.5678) < 1e-6 &&
      d17.data.targetRGBA === undefined &&
      d17.data.strokeId === undefined,
    'Client decodes 17B Type 4 cleanly (no targetRGBA, no strokeId)'
  );

  const t4_19 = makeRawType4({ length: 19, instId: 'u123456', tool: 2, opacity: 100, x: 5000, y: 5000, strokeId: 4321, strokeIdOffset: 17 });
  const d19 = decodeBinaryDrawMessage(t4_19);
  check(
    d19?.event === 'draw_action' && d19.data.targetRGBA === undefined && d19.data.strokeId === 4321,
    'Client decodes 19B Type 4 cleanly (strokeId only at [17..18])'
  );

  const t4_21 = makeRawType4({ length: 21, instId: 'u123456', tool: 2, opacity: 100, x: 5000, y: 5000, targetRGBA: { r: 1, g: 2, b: 3, a: 4 } });
  const d21 = decodeBinaryDrawMessage(t4_21);
  check(
    d21?.event === 'draw_action' &&
      d21.data.targetRGBA?.r === 1 &&
      d21.data.targetRGBA?.g === 2 &&
      d21.data.targetRGBA?.b === 3 &&
      d21.data.targetRGBA?.a === 4 &&
      d21.data.strokeId === undefined,
    'Client decodes 21B Type 4 cleanly (targetRGBA at [17..20], no strokeId)'
  );

  const t4_23 = makeRawType4({ length: 23, instId: 'u123456', tool: 2, opacity: 100, x: 5000, y: 5000, targetRGBA: { r: 9, g: 8, b: 7, a: 6 }, strokeId: 9876, strokeIdOffset: 21 });
  const d23 = decodeBinaryDrawMessage(t4_23);
  check(
    d23?.event === 'draw_action' &&
      d23.data.targetRGBA?.r === 9 &&
      d23.data.targetRGBA?.a === 6 &&
      d23.data.strokeId === 9876,
    'Client decodes 23B Type 4 cleanly (targetRGBA at [17..20] + strokeId at [21..22])'
  );

  // Encoder -> Decoder roundtrip for all 4 Type 4 forms
  const e17 = encodeBinaryDrawMessage('draw_action', { instanceId: 'u1', tool: 'bucket', color: '#123456', opacity: 1, x: 0.25, y: 0.75 });
  const e19 = encodeBinaryDrawMessage('draw_action', { instanceId: 'u1', tool: 'bucket', color: '#123456', opacity: 1, x: 0.25, y: 0.75, strokeId: 55 });
  const e21 = encodeBinaryDrawMessage('draw_action', { instanceId: 'u1', tool: 'bucket', color: '#123456', opacity: 1, x: 0.25, y: 0.75, targetR: 10, targetG: 20, targetB: 30, targetA: 255 });
  const e23 = encodeBinaryDrawMessage('draw_action', { instanceId: 'u1', tool: 'bucket', color: '#123456', opacity: 1, x: 0.25, y: 0.75, targetR: 10, targetG: 20, targetB: 30, targetA: 255, strokeId: 77 });
  check(
    e17?.byteLength === 17 && decodeBinaryDrawMessage(e17)?.data.strokeId === undefined &&
    e19?.byteLength === 19 && decodeBinaryDrawMessage(e19)?.data.strokeId === 55 &&
    e21?.byteLength === 21 && decodeBinaryDrawMessage(e21)?.data.targetRGBA?.b === 30 &&
    e23?.byteLength === 23 && decodeBinaryDrawMessage(e23)?.data.strokeId === 77 && decodeBinaryDrawMessage(e23)?.data.targetRGBA?.b === 30,
    'Encoder/decoder roundtrip matches exact 17/19/21/23 byte Type 4 variants'
  );

  // 2B. Invalid Type 4 forms return null cleanly
  const badType4s: Buffer[] = [
    ...Array.from({ length: 17 }, (_, l) => makeRawType4({ length: l })),
    makeRawType4({ length: 18 }),
    makeRawType4({ length: 20 }),
    makeRawType4({ length: 22 }),
    makeRawType4({ length: 24 }),
    makeRawType4({ tool: 0 }),
    makeRawType4({ tool: 8 }),
    makeRawType4({ opacity: 101 }),
    makeRawType4({ x: 10001 }),
    makeRawType4({ y: 10001 }),
  ];
  check(
    badType4s.every((b) => decodeBinaryDrawMessage(b) === null),
    `Client decoder returns null for all ${badType4s.length} malformed Type 4 payloads`
  );

  // 2C. Valid packets Types 1..13 preserve decoding
  const valid1 = encodeBinaryDrawMessage('draw_start', { instanceId: 'u1', tool: 'pencil', color: '#ff0000', width: 5, opacity: 1, x: 0.5, y: 0.5 })!;
  const valid2_1 = encodeBinaryDrawMessage('draw_move', { instanceId: 'u1', x: 0.1, y: 0.2 })!; // 14B
  const valid2_0 = Buffer.from([2, 0x75, 0x31, 0, 0, 0, 0, 0, 0, 0]); // 10B count=0
  const valid3_23 = Buffer.alloc(23); valid3_23[0] = 3; valid3_23[1] = 0x75; valid3_23[22] = 1;
  const valid3_27 = encodeBinaryDrawMessage('draw_end', { instanceId: 'u1', tool: 'pencil', color: '#ff0000', width: 5, opacity: 1, startX: 0, startY: 0, x: 0.5, y: 0.5, strokeId: 1 })!;
  const valid5 = encodeBinaryDrawMessage('draw_clear', { instanceId: 'u1' })!;
  const valid6 = encodeBinaryDrawMessage('draw_cancel', { instanceId: 'u1' })!;
  const valid7_8 = encodeBinaryDrawMessage('draw_undo', { instanceId: 'u1' })!;
  const valid7_10 = encodeBinaryDrawMessage('draw_undo', { instanceId: 'u1', strokeId: 9 })!;
  const valid8 = encodeBinaryDrawMessage('draw_redo', { instanceId: 'u1' })!;
  const valid9_noId = Buffer.alloc(16 + 2 * 4); valid9_noId[0] = 9; valid9_noId[1] = 0x75; valid9_noId.writeUInt16LE(2, 14);
  const valid9_withId = encodeBinaryDrawMessage('draw_stroke', { instanceId: 'u1', tool: 'pencil', color: '#00ff00', width: 4, opacity: 1, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], strokeId: 88 })!;
  const valid10_8 = Buffer.from([10, 0x75, 0, 0, 0, 0, 0, 0]);
  const valid10_14 = Buffer.from([10, 0x75, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6]);
  const valid11 = Buffer.alloc(12); valid11[0] = MSG_DRAW_COMMIT; valid11[1] = 0x75; valid11.writeUInt16LE(12, 8); valid11.writeUInt16LE(50, 10);
  const valid12 = Buffer.alloc(10); valid12[0] = MSG_DRAW_ABORT; valid12[1] = 0x75; valid12.writeUInt16LE(12, 8);
  const valid13 = encodeBinaryDrawMessage('draw_move', { instanceId: 'u1', moves: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], isCompressed: true })!;

  check(
    decodeBinaryDrawMessage(valid1)?.event === 'draw_start' &&
    decodeBinaryDrawMessage(valid2_1)?.event === 'draw_move' &&
    decodeBinaryDrawMessage(valid2_0)?.data.moves?.length === 0 &&
    decodeBinaryDrawMessage(valid3_23)?.data.isCancelled === true &&
    decodeBinaryDrawMessage(valid3_27)?.event === 'draw_end' &&
    decodeBinaryDrawMessage(valid5)?.event === 'draw_clear' &&
    decodeBinaryDrawMessage(valid6)?.event === 'draw_cancel' &&
    decodeBinaryDrawMessage(valid7_8)?.data.strokeId === undefined &&
    decodeBinaryDrawMessage(valid7_10)?.data.strokeId === 9 &&
    decodeBinaryDrawMessage(valid8)?.event === 'draw_redo' &&
    decodeBinaryDrawMessage(valid9_noId)?.event === 'draw_stroke' &&
    decodeBinaryDrawMessage(valid9_withId)?.data.strokeId === 88 &&
    decodeBinaryDrawMessage(valid10_8)?.event === 'draw_clear' &&
    decodeBinaryDrawMessage(valid10_14)?.event === 'draw_clear' &&
    decodeBinaryDrawMessage(valid11)?.event === 'draw_commit' &&
    decodeBinaryDrawMessage(valid12)?.event === 'draw_abort' &&
    decodeBinaryDrawMessage(valid13)?.event === 'draw_move',
    'All valid packet types 1..13 (including Type 10 >= 8B and Type 13 compressed) decode properly'
  );

  // 2D. Exhaustive truncated prefixes (0..minLen-1) and trailing bytes for Types 1..9, 11, 12
  let truncationAndTrailingOk = true;
  let badTruncDetail = '';

  const checkAllTruncationsAndTrailing = (name: string, typeByte: number, validLengths: number[], validBufs: Buffer[]) => {
    const minLen = Math.min(...validLengths);
    const seed = Buffer.from(validBufs[0]);
    for (let l = 0; l < minLen; l++) {
      const b = Buffer.from(seed.subarray(0, l));
      if (l >= 1) b[0] = typeByte;
      if (decodeBinaryDrawMessage(b) !== null) {
        truncationAndTrailingOk = false;
        badTruncDetail = `${name} truncated len=${l} did not return null`;
        return;
      }
    }
    for (const v of validBufs) {
      for (const extra of [1, 3, 8]) {
        // Avoid accidentally landing on another valid length (e.g. Type 3 23+4=27, Type 7 8+2=10, Type 9 +2)
        if (validLengths.includes(v.byteLength + extra)) continue;
        const bigger = Buffer.concat([new Uint8Array(v), Buffer.alloc(extra, 0xAA)]);
        if (decodeBinaryDrawMessage(bigger) !== null) {
          truncationAndTrailingOk = false;
          badTruncDetail = `${name} baseLen=${v.byteLength} +${extra} trailing bytes did not return null`;
          return;
        }
      }
    }
  };

  checkAllTruncationsAndTrailing('Type 1', 1, [18], [Buffer.from(valid1)]);
  checkAllTruncationsAndTrailing('Type 2 (count=1)', 2, [14], [Buffer.from(valid2_1)]);
  checkAllTruncationsAndTrailing('Type 3', 3, [23, 27], [Buffer.from(valid3_23), Buffer.from(valid3_27)]);
  checkAllTruncationsAndTrailing('Type 4', 4, [17, 19, 21, 23], [t4_17, t4_19, t4_21, t4_23]);
  checkAllTruncationsAndTrailing('Type 5', 5, [8], [Buffer.from(valid5)]);
  checkAllTruncationsAndTrailing('Type 6', 6, [8], [Buffer.from(valid6)]);
  checkAllTruncationsAndTrailing('Type 7', 7, [8, 10], [Buffer.from(valid7_8), Buffer.from(valid7_10)]);
  checkAllTruncationsAndTrailing('Type 8', 8, [8], [Buffer.from(valid8)]);
  checkAllTruncationsAndTrailing('Type 9 (count=2)', 9, [24, 26], [valid9_noId, Buffer.from(valid9_withId)]);
  checkAllTruncationsAndTrailing('Type 11', 11, [12], [valid11]);
  checkAllTruncationsAndTrailing('Type 12', 12, [10], [valid12]);

  // Also test Type 3 intermediate invalid lengths (22, 24, 25, 26) & Type 7 intermediate (9) & Type 9 (+1, +3)
  for (const len of [22, 24, 25, 26]) {
    const b = Buffer.alloc(len); b[0] = 3;
    if (decodeBinaryDrawMessage(b) !== null) {
      truncationAndTrailingOk = false;
      badTruncDetail = `Type 3 len=${len}`;
    }
  }
  {
    const b = Buffer.alloc(9); b[0] = 7;
    if (decodeBinaryDrawMessage(b) !== null) {
      truncationAndTrailingOk = false;
      badTruncDetail = 'Type 7 len=9';
    }
  }
  {
    const b = Buffer.concat([valid9_noId, Buffer.from([1])]);
    if (decodeBinaryDrawMessage(b) !== null) {
      truncationAndTrailingOk = false;
      badTruncDetail = 'Type 9 expected+1';
    }
  }

  check(truncationAndTrailingOk, 'All truncated boundaries and trailing-byte mutations return null across Types 1..9, 11, 12', badTruncDetail);

  // 2E. DoS short buffer claiming count = 65535 on Type 2 and Type 9 returns null cleanly in < 1ms without pre-allocating 65k moves/points
  const dosType2 = Buffer.alloc(14); dosType2[0] = 2; dosType2.writeUInt16LE(65535, 8);
  const dosType9 = Buffer.alloc(20); dosType9[0] = 9; dosType9.writeUInt16LE(65535, 14);
  const unknown0 = Buffer.alloc(16); unknown0[0] = 0;
  const unknown14 = Buffer.alloc(16); unknown14[0] = 14;
  const unknown255 = Buffer.alloc(16); unknown255[0] = 255;
  check(
    decodeBinaryDrawMessage(dosType2) === null &&
    decodeBinaryDrawMessage(dosType9) === null &&
    decodeBinaryDrawMessage(unknown0) === null &&
    decodeBinaryDrawMessage(unknown14) === null &&
    decodeBinaryDrawMessage(unknown255) === null,
    'Short count=65535 DoS buffers (Type 2/9) and unknown opcodes (0/14/255) return null safely'
  );
});

check(
  consoleErrorCalls === 0 && consoleWarnCalls === 0,
  `Zero console.error (${consoleErrorCalls}) and console.warn (${consoleWarnCalls}) noise across malformed decode calls`
);

// ── PART 3: REPLAY GUARD & RASTER BUCKET FLOOD-FILL SAFETY ────────────────────
console.log('\n── Part 3: Batch Bucket Replay Guard & Flood-Fill Integration ──');

{
  // 3A. Malformed byte-4 entries returning null -> getValidBatchBucketPayload returns null (no NaN leak)
  const malformedBucket1 = makeRawType4({ length: 18 });
  const malformedBucket2 = makeRawType4({ length: 17, tool: 0 });
  const malformedBucket3 = makeRawType4({ length: 17, x: 10001 });
  const malformedBucket4 = makeRawType4({ length: 17, opacity: 101 });

  check(
    getValidBatchBucketPayload(decodeBinaryDrawMessage(malformedBucket1)) === null &&
    getValidBatchBucketPayload(decodeBinaryDrawMessage(malformedBucket2)) === null &&
    getValidBatchBucketPayload(decodeBinaryDrawMessage(malformedBucket3)) === null &&
    getValidBatchBucketPayload(decodeBinaryDrawMessage(malformedBucket4)) === null &&
    getValidBatchBucketPayload(null) === null &&
    getValidBatchBucketPayload({ event: 'draw_action', data: { tool: 'bucket', x: Number.NaN, y: 0.5 } }) === null &&
    getValidBatchBucketPayload({ event: 'draw_action', data: { tool: 'pencil', x: 0.5, y: 0.5 } }) === null,
    'getValidBatchBucketPayload blocks null/malformed/non-bucket/NaN payloads'
  );

  // 3B. Simulating batch replay sequence with injected malformed Type 4 followed by valid Type 4
  const cw = 8;
  const ch = 8;
  const pixels = new Uint8ClampedArray(cw * ch * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255; pixels[i + 3] = 255;
  }

  const batchCommands = [
    { data: malformedBucket1 },
    { data: malformedBucket3 },
    { data: encodeBinaryDrawMessage('draw_action', { instanceId: 'u1', tool: 'bucket', color: '#ff0000', opacity: 1, x: 0.5, y: 0.5, targetRGBA: { r: 255, g: 255, b: 255, a: 255 }, strokeId: 1 }) }
  ];

  let floodFillCalls = 0;
  for (const cmdObj of batchCommands) {
    const decoded = decodeBinaryDrawMessage(cmdObj.data);
    const validBucket = getValidBatchBucketPayload(decoded);
    if (!validBucket) continue;
    floodFillCalls++;
    executeRasterFloodFill(
      pixels,
      cw,
      ch,
      validBucket.x * cw,
      validBucket.y * ch,
      validBucket.color,
      validBucket.opacity,
      cw,
      ch,
      validBucket.targetRGBA
    );
  }

  check(
    floodFillCalls === 1 && pixels[0] === 255 && pixels[1] === 0 && pixels[2] === 0 && pixels[3] === 255,
    'Batch bucket replay skips malformed byte-4 entries (no NaN flood fill) and fills valid Type 4 cleanly'
  );

  // 3C. replaySingleCommand returns 'none' without invoking floodFillFn on malformed Type 4, and invokes on valid Type 4
  const { ctx } = makeMockCanvasCtx();
  let singleFillCalls = 0;
  const mockFloodFill: any = () => {
    singleFillCalls++;
    return { r: 255, g: 255, b: 255, a: 255 };
  };
  const rBad = replaySingleCommand(ctx, { data: malformedBucket1 }, {}, {}, { logicalWidth: 680, logicalHeight: 396 }, mockFloodFill);
  const rGood = replaySingleCommand(
    ctx,
    { data: encodeBinaryDrawMessage('draw_action', { instanceId: 'u1', tool: 'bucket', color: '#00ff00', opacity: 1, x: 0.5, y: 0.5 }) },
    {},
    {},
    { logicalWidth: 680, logicalHeight: 396 },
    mockFloodFill
  );
  check(
    rBad === 'none' && singleFillCalls === 1 && rGood === 'snapshot',
    'replaySingleCommand ignores malformed Type 4 and snapshots valid Type 4'
  );
}

console.log('\n==================================================================');
console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
console.log('==================================================================');

if (failCount > 0) {
  process.exit(1);
}
process.exit(0);

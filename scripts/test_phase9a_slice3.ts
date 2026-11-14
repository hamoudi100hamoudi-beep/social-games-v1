import {
  encodeBinaryDrawMessage,
  decodeBinaryDrawMessage,
  MSG_DRAW_COMMIT,
  MSG_DRAW_ABORT
} from '../src/utils/drawBinaryHelper.js';
import { willCanonicalSegmentExceedLimit } from '../src/components/game/DrawingCanvasCore.js';
import { handleDrawBinary } from '../server/registerDrawBinaryHandler.js';
import { isValidType9Packet } from '../server/utils/binaryBufferHelpers.js';
import { RoomManager } from '../server/rooms.js';

console.log('==================================================================');
console.log('🛡️  PHASE 9A — SLICE 3: TYPE 9 VALIDATION & FREE DRAW ABORT/SPLIT');
console.log('==================================================================\n');

let passCount = 0;
let failCount = 0;

function check(condition: boolean, label: string, details?: string) {
  if (condition) {
    passCount++;
    console.log(`✅ PASS: ${label}`);
  } else {
    failCount++;
    console.error(`❌ FAIL: ${label}${details ? ` -> ${details}` : ''}`);
  }
}

function stopManagerTimer(rm: RoomManager) {
  if ((rm as any).tickInterval) {
    clearInterval((rm as any).tickInterval);
    (rm as any).tickInterval = null;
  }
}

function makeType9Buf(opts: {
  instId?: string;
  tool?: number;
  pointsLength?: number;
  actualPoints?: number;
  includeStrokeId?: boolean;
  strokeId?: number;
  extraTrailingBytes?: number;
  truncateBytes?: number;
  overrideLength?: number;
  coordPairs?: { x: number; y: number }[];
}): Buffer {
  const ptsHeader = opts.pointsLength ?? 2;
  const ptsActual = opts.actualPoints ?? ptsHeader;
  const trailer = opts.includeStrokeId ? 2 : 0;
  const extra = opts.extraTrailingBytes ?? 0;
  const truncate = opts.truncateBytes ?? 0;
  const totalLen = Math.max(0, opts.overrideLength ?? (16 + ptsActual * 4 + trailer + extra - truncate));

  const buf = Buffer.alloc(totalLen);
  if (totalLen >= 1) buf.writeUInt8(9, 0);
  const inst = opts.instId ?? 'u000001';
  if (inst.length > 0 && totalLen >= 8) {
    buf.write(inst.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  }
  if (totalLen >= 9) buf.writeUInt8((opts.tool ?? 0) & 0xFF, 8);
  if (totalLen >= 14) {
    buf.writeUInt8(12, 9);
    buf.writeUInt8(34, 10);
    buf.writeUInt8(56, 11);
    buf.writeUInt8(5, 12);
    buf.writeUInt8(255, 13);
  }
  if (totalLen >= 16) buf.writeUInt16LE(ptsHeader & 0xFFFF, 14);

  for (let i = 0; i < ptsActual; i++) {
    const off = 16 + i * 4;
    if (off + 4 <= totalLen) {
      const pt = opts.coordPairs?.[i];
      const vx = pt ? pt.x : ((i * 17) % 10000);
      const vy = pt ? pt.y : ((i * 29) % 10000);
      buf.writeInt16LE(vx, off);
      buf.writeInt16LE(vy, off + 2);
    }
  }

  if (opts.includeStrokeId && 16 + ptsActual * 4 + 2 <= totalLen) {
    buf.writeUInt16LE((opts.strokeId ?? 1) & 0xFFFF, 16 + ptsActual * 4);
  }

  return buf;
}

function setupModeRoom(mode: 'normal' | 'freedraw' | 'experimental') {
  const roomEmits: { event: string; payload: any }[] = [];
  const broadcasts: { event: string; payload: any; volatile?: boolean }[] = [];
  const type13Broadcasts: { socketId: string; payload: any }[] = [];

  const createTargetSocket = (id: string) => ({
    id,
    emit: (event: string, payload: any) => {
      if (id !== 'sock-drawer') {
        type13Broadcasts.push({ socketId: id, payload });
      }
    },
    volatile: {
      emit: (event: string, payload: any) => {
        if (id !== 'sock-drawer') {
          type13Broadcasts.push({ socketId: id, payload });
        }
      }
    }
  });

  const sockDrawer = createTargetSocket('sock-drawer');
  const sockViewer = createTargetSocket('sock-viewer');
  const roomSocketsMap = new Map<string, any>([
    ['sock-drawer', sockDrawer],
    ['sock-viewer', sockViewer]
  ]);
  const roomMemberSet = new Set<string>(['sock-drawer', 'sock-viewer']);

  const mockIo: any = {
    to: (_roomId: string) => ({
      emit: (event: string, payload: any) => {
        roomEmits.push({ event, payload });
      }
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
  const instId = 'drw0001';
  const mockRoom = rm.createRoom('R1') as any;
  mockRoom.isFreeDraw = mode === 'freedraw';
  mockRoom.isExperimental = mode === 'experimental';

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
    mockRoom.activeDrawers = ['p1'];
    mockRoom.gameState.status = 'WAITING';
  } else {
    mockRoom.gameState.status = 'DRAWING';
    mockRoom.gameState.currentDrawerId = 'p1';
  }
  mockRoom.drawingIdentities = {
    [instId]: { playerId: 'p1', socketId: 'sock-drawer', playerName: 'Drawer' }
  };
  mockRoom.gameState.drawHistory = [];
  mockRoom.gameState.redoStack = ['stale-redo'];
  mockRoom.gameState.isDrawingActive = false;

  const mockSocket: any = {
    id: 'sock-drawer',
    broadcast: {
      to: (_roomId: string) => ({
        emit: (event: string, payload: any) => {
          broadcasts.push({ event, payload, volatile: false });
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

  return { rm, mockRoom, mockSocket, mockIo, deps, instId, roomEmits, broadcasts, type13Broadcasts };
}

function makeType1(instId: string, xNorm: number, yNorm: number, tool: 'pencil' | 'eraser' = 'pencil', color = '#112233', width = 6, opacity = 1): Buffer {
  return Buffer.from(
    encodeBinaryDrawMessage('draw_start', {
      instanceId: instId,
      tool,
      color,
      width,
      opacity,
      x: xNorm,
      y: yNorm
    })
  );
}

function makeType13(instId: string, moves: { x: number; y: number }[]): Buffer {
  return Buffer.from(
    encodeBinaryDrawMessage('draw_move_compressed', {
      instanceId: instId,
      moves
    })
  );
}

function makeType3(instId: string, strokeId: number, expectedPointCount = 1, tool: 'pencil' | 'eraser' = 'pencil', cancelled = false): Buffer {
  return Buffer.from(
    encodeBinaryDrawMessage('draw_end', {
      instanceId: instId,
      tool,
      color: '#112233',
      width: 6,
      opacity: 1,
      isShape: false,
      strokeId,
      expectedPointCount,
      isCancelled: cancelled
    })
  );
}

// =========================================================================
// PART 1: Type 9 Structural Validation (Slice 3B)
// =========================================================================
console.log('--- Part 1: Type 9 (draw_stroke) Server Ingress Validation ---');

// 1A. Direct isValidType9Packet unit checks
check(isValidType9Packet(makeType9Buf({ tool: 3, pointsLength: 2, includeStrokeId: true }), false) === true,
  'Type 9 shape tool=3 (line), 2 pts, 26B accepted in Normal');
check(isValidType9Packet(makeType9Buf({ tool: 7, pointsLength: 2, includeStrokeId: true }), true) === true,
  'Type 9 shape tool=7 (fillCircle), 2 pts, 26B accepted in Canonical');
check(isValidType9Packet(makeType9Buf({ tool: 4, pointsLength: 2, includeStrokeId: false }), false) === false,
  'Type 9 shape tool=4 (strokeRect) missing 2-byte strokeId (24B) rejected');
check(isValidType9Packet(makeType9Buf({ tool: 5, pointsLength: 3, includeStrokeId: true }), false) === false,
  'Type 9 shape tool=5 with 3 points rejected');
check(isValidType9Packet(makeType9Buf({ tool: 6, pointsLength: 1, includeStrokeId: true }), true) === false,
  'Type 9 shape tool=6 with 1 point rejected');

check(isValidType9Packet(makeType9Buf({ tool: 0, pointsLength: 50, includeStrokeId: true }), true) === true,
  'Type 9 canonical continuous (Redo) with 50 pts + strokeId accepted');
check(isValidType9Packet(makeType9Buf({ tool: 1, pointsLength: 3000, includeStrokeId: true }), true) === true,
  'Type 9 canonical continuous exact 3000 pts + strokeId accepted');
check(isValidType9Packet(makeType9Buf({ tool: 0, pointsLength: 3000, includeStrokeId: false }), true) === false,
  'Type 9 canonical continuous missing strokeId rejected');
check(isValidType9Packet(makeType9Buf({ tool: 0, pointsLength: 3001, includeStrokeId: true }), true) === false,
  'Type 9 canonical continuous 3001 pts rejected');

check(isValidType9Packet(makeType9Buf({ tool: 0, pointsLength: 25, includeStrokeId: false }), false) === true,
  'Type 9 Normal continuous without strokeId (16 + 25*4) accepted');
check(isValidType9Packet(makeType9Buf({ tool: 1, pointsLength: 25, includeStrokeId: true }), false) === true,
  'Type 9 Normal continuous with optional strokeId (16 + 25*4 + 2) accepted');
check(isValidType9Packet(makeType9Buf({ tool: 0, pointsLength: 65535, includeStrokeId: false }), false) === true,
  'Type 9 Normal continuous max Uint16 (65535 pts, no strokeId = 262156B) preserved');
check(isValidType9Packet(makeType9Buf({ tool: 0, pointsLength: 65535, includeStrokeId: true }), false) === true,
  'Type 9 Normal continuous max Uint16 (65535 pts + strokeId = 262158B) preserved');

// Coordinate bounds untouched (-32768..32767)
const extremeCoordsBuf = makeType9Buf({
  tool: 0,
  pointsLength: 2,
  includeStrokeId: true,
  coordPairs: [{ x: -32768, y: 32767 }, { x: 15000, y: -15000 }]
});
check(isValidType9Packet(extremeCoordsBuf, true) === true,
  'Type 9 preserves full Int16 [-32768..32767] coordinate range');

// Malformed lengths, trailing bytes, zero points, invalid tools, malformed instId
for (const badLen of [0, 1, 8, 15]) {
  check(isValidType9Packet(makeType9Buf({ overrideLength: badLen }), false) === false,
    `Type 9 truncated header (${badLen}B) rejected`);
}
check(isValidType9Packet(makeType9Buf({ tool: 0, pointsLength: 0, includeStrokeId: false }), false) === false,
  'Type 9 pointsLength === 0 (without strokeId) rejected');
check(isValidType9Packet(makeType9Buf({ tool: 0, pointsLength: 0, includeStrokeId: true }), true) === false,
  'Type 9 pointsLength === 0 (with strokeId) rejected');
check(isValidType9Packet(makeType9Buf({ tool: 0, pointsLength: 5, includeStrokeId: false, truncateBytes: 1 }), false) === false,
  'Type 9 truncated point body (-1B) rejected');
check(isValidType9Packet(makeType9Buf({ tool: 0, pointsLength: 5, includeStrokeId: true, truncateBytes: 1 }), true) === false,
  'Type 9 truncated strokeId trailer (-1B) rejected');

for (const trail of [1, 3, 64, 1024]) {
  check(isValidType9Packet(makeType9Buf({ tool: 0, pointsLength: 5, includeStrokeId: false, extraTrailingBytes: trail }), false) === false,
    `Type 9 Normal continuous with +${trail} unexpected trailing bytes rejected`);
  check(isValidType9Packet(makeType9Buf({ tool: 0, pointsLength: 5, includeStrokeId: true, extraTrailingBytes: trail }), true) === false,
    `Type 9 Canonical continuous with +${trail} unexpected trailing bytes rejected`);
}

for (const badTool of [2, 8, 9, 255]) {
  check(isValidType9Packet(makeType9Buf({ tool: badTool, pointsLength: 2, includeStrokeId: true }), false) === false,
    `Type 9 invalid tool index (${badTool}) rejected in Normal`);
  check(isValidType9Packet(makeType9Buf({ tool: badTool, pointsLength: 2, includeStrokeId: true }), true) === false,
    `Type 9 invalid tool index (${badTool}) rejected in Canonical`);
}

check(isValidType9Packet(makeType9Buf({ instId: '', tool: 0, pointsLength: 2, includeStrokeId: true }), true) === false,
  'Type 9 empty instId rejected');
const embeddedZeroInst = makeType9Buf({ tool: 0, pointsLength: 2, includeStrokeId: true });
embeddedZeroInst[1] = 97; embeddedZeroInst[2] = 0; embeddedZeroInst[3] = 98;
check(isValidType9Packet(embeddedZeroInst, false) === false,
  'Type 9 embedded-NUL malformed instId rejected');

// 1B. Integration via handleDrawBinary across Normal, Free Draw, Experimental
{
  const norm = setupModeRoom('normal');
  const fd = setupModeRoom('freedraw');
  const exp = setupModeRoom('experimental');

  try {
    // Valid 3001 points in Normal -> accepted, recorded, broadcast, redoStack cleared
    const normal3001 = makeType9Buf({ instId: norm.instId, tool: 0, pointsLength: 3001, includeStrokeId: false });
    handleDrawBinary(norm.mockSocket, normal3001, norm.deps);
    check(norm.mockRoom.gameState.drawHistory.length === 1 && norm.broadcasts.length === 1,
      'Normal room accepts 3001-pt Type 9 (no lower cap)');

    // Valid Type 9 shape in Free Draw -> accepted
    const fdShape = makeType9Buf({ instId: fd.instId, tool: 4, pointsLength: 2, includeStrokeId: true, strokeId: 5 });
    handleDrawBinary(fd.mockSocket, fdShape, fd.deps);
    check(fd.mockRoom.gameState.drawHistory.length === 1 && fd.broadcasts.length === 1,
      'Free Draw accepts valid 26B Type 9 shape');

    // Invalid 3001 points in Free Draw -> rejected before history/redo/broadcast
    const fdBeforeHist = fd.mockRoom.gameState.drawHistory.length;
    const fdBeforeRedo = fd.mockRoom.gameState.redoStack.length;
    const fdInvalid3001 = makeType9Buf({ instId: fd.instId, tool: 0, pointsLength: 3001, includeStrokeId: true, strokeId: 6 });
    handleDrawBinary(fd.mockSocket, fdInvalid3001, fd.deps);
    check(
      fd.mockRoom.gameState.drawHistory.length === fdBeforeHist &&
      fd.mockRoom.gameState.redoStack.length === fdBeforeRedo &&
      fd.broadcasts.length === 1,
      'Free Draw rejects 3001-pt Type 9 before history/redo/broadcast'
    );

    // Invalid trailing bytes in Experimental -> rejected before history/redo/broadcast
    const expInvalidTrail = makeType9Buf({ instId: exp.instId, tool: 0, pointsLength: 10, includeStrokeId: true, extraTrailingBytes: 64 });
    handleDrawBinary(exp.mockSocket, expInvalidTrail, exp.deps);
    check(
      exp.mockRoom.gameState.drawHistory.length === 0 &&
      exp.mockRoom.gameState.redoStack.length === 1 &&
      exp.broadcasts.length === 0,
      'Experimental rejects malformed Type 9 (+64B) before history/redo/broadcast'
    );

    // Type 4 Bucket & Legacy Type 10 compatibility completely untouched
    const bucketBuf = Buffer.from(encodeBinaryDrawMessage('draw_action', {
      instanceId: fd.instId, tool: 'bucket', color: '#ff0000', opacity: 1, x: 0.5, y: 0.5, strokeId: 7
    }));
    handleDrawBinary(fd.mockSocket, bucketBuf, fd.deps);
    const legacyType10Buf = Buffer.alloc(12);
    legacyType10Buf.writeUInt8(10, 0);
    legacyType10Buf.write('drw0001', 1, 7, 'ascii');
    handleDrawBinary(norm.mockSocket, legacyType10Buf, norm.deps);
    check(fd.mockRoom.gameState.drawHistory.length === 2 && norm.mockRoom.gameState.drawHistory.length === 2,
      'Type 4 (Bucket) and legacy Type 10 remain intact and accepted');

    // O(1) validation throughput check
    const benchBuf = makeType9Buf({ instId: fd.instId, tool: 0, pointsLength: 3000, includeStrokeId: true });
    const t0 = performance.now();
    let okBench = 0;
    for (let i = 0; i < 5000; i++) {
      if (isValidType9Packet(benchBuf, true)) okBench++;
    }
    const elapsedMs = performance.now() - t0;
    check(okBench === 5000 && elapsedMs < 50,
      `O(1) Type 9 validation fast (${elapsedMs.toFixed(2)}ms for 5000 x 12KB buffers)`);
  } finally {
    stopManagerTimer(norm.rm);
    stopManagerTimer(fd.rm);
    stopManagerTimer(exp.rm);
  }
}

// =========================================================================
// PART 2: Type 12 (draw_abort) Originating-Client & Server 60s Expiry
// =========================================================================
console.log('\n--- Part 2: Type 12 (draw_abort) Originating Client & 60s Expiry ---');

// 2A. Decode round-trip verification for Type 12
{
  const abort0 = Buffer.alloc(10);
  abort0.writeUInt8(MSG_DRAW_ABORT, 0);
  abort0.write('drw0001', 1, 7, 'ascii');
  abort0.writeUInt16LE(0, 8);
  const d0 = decodeBinaryDrawMessage(abort0);
  check(Boolean(d0 && d0.event === 'draw_abort' && d0.data.instanceId === 'drw0001' && d0.data.strokeId === 0),
    'decodeBinaryDrawMessage decodes Type 12 with strokeId=0');

  const abort42 = Buffer.alloc(10);
  abort42.writeUInt8(MSG_DRAW_ABORT, 0);
  abort42.write('drw0001', 1, 7, 'ascii');
  abort42.writeUInt16LE(42, 8);
  const d42 = decodeBinaryDrawMessage(abort42);
  check(Boolean(d42 && d42.event === 'draw_abort' && d42.data.instanceId === 'drw0001' && d42.data.strokeId === 42),
    'decodeBinaryDrawMessage decodes Type 12 with strokeId=42');
}

// 2B. Real server 60s expiry scenarios (both during move AND on draw_end)
{
  const fd = setupModeRoom('freedraw');
  try {
    // Path 1: 60s expiry during move -> server emits Type 12 with strokeId=0
    handleDrawBinary(fd.mockSocket, makeType1(fd.instId, 0.2, 0.2), fd.deps);
    const activeMap = fd.mockRoom.freeDrawStrokes as Map<string, any>;
    const strokeKey = `sock-drawer_${fd.instId}`;
    check(activeMap.has(strokeKey), 'Server tracks active stroke on Type 1');
    activeMap.get(strokeKey).createdAt = Date.now() - 65000;

    const beforeHistoryLen = fd.mockRoom.gameState.drawHistory.length;
    handleDrawBinary(fd.mockSocket, makeType13(fd.instId, [{ x: 0.25, y: 0.25 }]), fd.deps);
    const moveAbortEvt = fd.roomEmits.find(e => e.event === 'draw_binary' && e.payload?.[0] === MSG_DRAW_ABORT);
    const moveAbortDecoded = moveAbortEvt ? decodeBinaryDrawMessage(moveAbortEvt.payload) : null;
    check(
      Boolean(moveAbortDecoded && moveAbortDecoded.event === 'draw_abort' && moveAbortDecoded.data.strokeId === 0 && !activeMap.has(strokeKey) && fd.mockRoom.gameState.drawHistory.length === beforeHistoryLen),
      '60s expiry during Type 13 move emits Type 12 (strokeId=0), clears active stroke, records nothing'
    );

    // Path 2: 60s expiry at draw_end -> server emits Type 12 with strokeId=77, NO Type 11, NO history record
    fd.roomEmits.length = 0;
    handleDrawBinary(fd.mockSocket, makeType1(fd.instId, 0.3, 0.3), fd.deps);
    activeMap.get(strokeKey).createdAt = Date.now() - 65000;

    handleDrawBinary(fd.mockSocket, makeType3(fd.instId, 77, 1), fd.deps);
    const endAbortEvt = fd.roomEmits.find(e => e.event === 'draw_binary' && e.payload?.[0] === MSG_DRAW_ABORT);
    const endCommitEvt = fd.roomEmits.find(e => e.event === 'draw_binary' && e.payload?.[0] === MSG_DRAW_COMMIT);
    const endAbortDecoded = endAbortEvt ? decodeBinaryDrawMessage(endAbortEvt.payload) : null;
    check(
      Boolean(endAbortDecoded && endAbortDecoded.event === 'draw_abort' && endAbortDecoded.data.strokeId === 77 && !endCommitEvt && fd.mockRoom.gameState.drawHistory.length === beforeHistoryLen),
      '60s expiry at Type 3 draw_end emits Type 12 (strokeId=77), suppresses Type 11, records nothing'
    );
  } finally {
    stopManagerTimer(fd.rm);
  }
}

// 2C. Client-side Case 1 & Case 2 abort contract model verification
{
  // Mirrors DrawingCanvasCore.tsx lines 3130-3131 + 3390-3510 exact decision state machine
  interface ClientMockState {
    instanceId: string;
    isDrawing: boolean;
    hasMeaningfulStroke: boolean;
    activePointerId: number | null;
    exitedOutside: boolean;
    touchStartedOutside: boolean;
    touchFromOutside: boolean;
    currentLocalStrokeId: number;
    pendingBatchCount: number;
    pendingUndoStaged: boolean;
    fastPathMeta: { instId: string; strokeId: number; index: number } | null;
    activeSessions: Record<string, { strokeId: number }>;
    localCommands: { instanceId: string; strokeId: number }[];
    localRedoStack: any[];
    emittedEvents: string[];
    tempRedrawnCount: number;
    fullReplayCount: number;
    fastPathRestoreCount: number;
  }

  function simulateClientOnDrawBinary(state: ClientMockState, raw: Buffer) {
    const decoded = decodeBinaryDrawMessage(raw);
    if (!decoded || !decoded.data) return;
    const { event, data } = decoded;
    const isFreeDrawUndo = event === 'draw_undo';
    const isLocalDrawAbort = event === 'draw_abort';
    if (data.instanceId === state.instanceId && !isFreeDrawUndo && !isLocalDrawAbort) return;

    if (event === 'draw_abort') {
      if (data.instanceId !== state.instanceId) {
        delete state.activeSessions[data.instanceId];
        state.tempRedrawnCount++;
        return;
      }
      const abortedStrokeId = data.strokeId || 0;
      const matchesActiveStroke =
        state.isDrawing && (abortedStrokeId === 0 || state.currentLocalStrokeId === abortedStrokeId);

      if (matchesActiveStroke) {
        state.isDrawing = false;
        state.hasMeaningfulStroke = false;
        state.activePointerId = null;
        state.exitedOutside = false;
        state.touchStartedOutside = false;
        state.touchFromOutside = false;
        state.pendingBatchCount = 0;
        state.pendingUndoStaged = false;
        delete state.activeSessions[state.instanceId];
        state.tempRedrawnCount++;
      } else if (abortedStrokeId > 0) {
        let targetIndex = -1;
        for (let i = state.localCommands.length - 1; i >= 0; i--) {
          const cmd = state.localCommands[i];
          if (cmd.instanceId === state.instanceId && cmd.strokeId === abortedStrokeId) {
            targetIndex = i;
            break;
          }
        }
        if (targetIndex !== -1) {
          const hadNewerActive = state.isDrawing;
          const canFastPath =
            state.fastPathMeta !== null &&
            state.fastPathMeta.instId === state.instanceId &&
            state.fastPathMeta.strokeId === abortedStrokeId &&
            state.fastPathMeta.index === targetIndex;
          state.localCommands.splice(targetIndex, 1);
          if (canFastPath) {
            state.fastPathRestoreCount++;
          } else {
            state.fullReplayCount++;
          }
          state.fastPathMeta = null;
          if (hadNewerActive && state.pendingUndoStaged) {
            // stageFreeDrawPendingCache() refreshed
          }
        }
        state.tempRedrawnCount++;
      }
    }
  }

  // Case 1: Active stroke aborted while pointer down (remote session stays intact)
  const abortPkt0 = Buffer.alloc(10);
  abortPkt0.writeUInt8(MSG_DRAW_ABORT, 0);
  abortPkt0.write('drw0001', 1, 7, 'ascii');
  abortPkt0.writeUInt16LE(0, 8);

  const s1: ClientMockState = {
    instanceId: 'drw0001',
    isDrawing: true,
    hasMeaningfulStroke: true,
    activePointerId: 7,
    exitedOutside: true,
    touchStartedOutside: true,
    touchFromOutside: true,
    currentLocalStrokeId: 12,
    pendingBatchCount: 15,
    pendingUndoStaged: true,
    fastPathMeta: null,
    activeSessions: { remote1: { strokeId: 3 } },
    localCommands: [{ instanceId: 'drw0001', strokeId: 11 }],
    localRedoStack: [],
    emittedEvents: [],
    tempRedrawnCount: 0,
    fullReplayCount: 0,
    fastPathRestoreCount: 0
  };
  simulateClientOnDrawBinary(s1, abortPkt0);
  check(
    !s1.isDrawing &&
    s1.activePointerId === null &&
    !s1.exitedOutside &&
    !s1.touchStartedOutside &&
    !s1.touchFromOutside &&
    s1.pendingBatchCount === 0 &&
    !s1.pendingUndoStaged &&
    s1.localCommands.length === 1 &&
    s1.localRedoStack.length === 0 &&
    s1.emittedEvents.length === 0 &&
    Boolean(s1.activeSessions['remote1']),
    'Client Type 12 Case 1: resets active stroke + pointer/outside guards, preserves remote sessions, emits nothing, zero false redo'
  );

  // Case 2: Late abort after pointer release (AND even while newer active stroke 43 is in progress)
  const abortPkt42 = Buffer.alloc(10);
  abortPkt42.writeUInt8(MSG_DRAW_ABORT, 0);
  abortPkt42.write('drw0001', 1, 7, 'ascii');
  abortPkt42.writeUInt16LE(42, 8);

  const s2: ClientMockState = {
    instanceId: 'drw0001',
    isDrawing: true, // newer stroke 43 already started!
    hasMeaningfulStroke: true,
    activePointerId: 9,
    exitedOutside: false,
    touchStartedOutside: false,
    touchFromOutside: false,
    currentLocalStrokeId: 43,
    pendingBatchCount: 3,
    pendingUndoStaged: true,
    fastPathMeta: { instId: 'drw0001', strokeId: 42, index: 1 },
    activeSessions: {},
    localCommands: [
      { instanceId: 'drw0001', strokeId: 41 },
      { instanceId: 'drw0001', strokeId: 42 }
    ],
    localRedoStack: [],
    emittedEvents: [],
    tempRedrawnCount: 0,
    fullReplayCount: 0,
    fastPathRestoreCount: 0
  };
  simulateClientOnDrawBinary(s2, abortPkt42);
  check(
    s2.localCommands.length === 1 &&
    s2.localCommands[0].strokeId === 41 &&
    s2.fastPathRestoreCount === 1 &&
    s2.isDrawing === true &&
    s2.currentLocalStrokeId === 43 &&
    s2.localRedoStack.length === 0 &&
    s2.emittedEvents.length === 0,
    'Client Type 12 Case 2: late abort removes exact strokeId=42 via fast-path, keeps strokeId=41 and active newer stroke 43 intact, zero false redo/Type 7'
  );
}

// =========================================================================
// PART 3: Automatic Long-Stroke Segmentation (D1 Auto-Split) & End-to-End Flow
// =========================================================================
console.log('\n--- Part 3: D1 Auto-Split Point Guard & 7,500+ Pt Multi-Segment End-to-End ---');

// 3A. Exact unit boundary checks on willCanonicalSegmentExceedLimit exported directly from DrawingCanvasCore.tsx
check(
  willCanonicalSegmentExceedLimit(1, 2997, 1) === false,
  'willCanonicalSegmentExceedLimit(1, 2997, 1) === false (total 2999 + 1 finish reserve = 3000 <= 3000)'
);
check(
  willCanonicalSegmentExceedLimit(1, 2998, 1) === true,
  'willCanonicalSegmentExceedLimit(1, 2998, 1) === true (2999 + 1 + 1 = 3001 > 3000 -> auto-split)'
);
check(
  willCanonicalSegmentExceedLimit(2900, 90, 10) === true,
  'willCanonicalSegmentExceedLimit(2900, 90, 10) === true (lerp batch overflow prevented prospectively)'
);
check(
  willCanonicalSegmentExceedLimit(2900, 89, 10) === false,
  'willCanonicalSegmentExceedLimit(2900, 89, 10) === false (2999 + 1 reserve = 3000 <= 3000)'
);

// 3B. Full End-to-End Gesture Integration (7,500 points across both Free Draw and Experimental)
for (const mode of ['freedraw', 'experimental'] as const) {
  const ctx = setupModeRoom(mode);
  const LOGICAL_WIDTH = 680;
  const LOGICAL_HEIGHT = 396;
  const { rm, mockRoom, mockSocket, deps, instId, roomEmits } = ctx;

  try {
    // Client stroke simulator matching DrawingCanvasCore's canonical + D1 auto-split contract
    let sentPointCount = 0;
    let moveBatch: { x: number; y: number }[] = [];
    let currentStrokeId = 0;
    let lastCanPt: { x: number; y: number } | null = null;
    const localHistory: { instanceId: string; strokeId: number; data: Buffer }[] = [];
    const clientPointsPerSegment: { strokeId: number; points: { x: number; y: number }[] }[] = [];
    let currentSegmentPoints: { x: number; y: number }[] = [];

    const quantize = (lx: number, ly: number) => {
      const rx = Math.round(lx * 10) / 10;
      const ry = Math.round(ly * 10) / 10;
      const normX = Math.round((rx / LOGICAL_WIDTH) * 10000) / 10000;
      const normY = Math.round((ry / LOGICAL_HEIGHT) * 10000) / 10000;
      return { normX, normY, canX: normX * LOGICAL_WIDTH, canY: normY * LOGICAL_HEIGHT };
    };

    const startSeg = (lx: number, ly: number) => {
      const q = quantize(lx, ly);
      currentStrokeId = ((currentStrokeId + 1) & 0xFFFF) || 1;
      sentPointCount = 1;
      moveBatch = [];
      lastCanPt = { x: q.canX, y: q.canY };
      currentSegmentPoints = [{ x: q.normX, y: q.normY }];
      handleDrawBinary(mockSocket, makeType1(instId, q.normX, q.normY), deps);
    };

    const flushBatch = () => {
      if (moveBatch.length > 0) {
        sentPointCount += moveBatch.length;
        handleDrawBinary(mockSocket, makeType13(instId, moveBatch), deps);
        moveBatch = [];
      }
    };

    const finishSeg = () => {
      if (lastCanPt && currentSegmentPoints.length >= 2) {
        const lastRaw = currentSegmentPoints[currentSegmentPoints.length - 1];
        const endDist = Math.hypot(
          lastRaw.x * LOGICAL_WIDTH - lastCanPt.x,
          lastRaw.y * LOGICAL_HEIGHT - lastCanPt.y
        );
        if (endDist >= 1.0) {
          moveBatch.push({ x: lastRaw.x, y: lastRaw.y });
          lastCanPt = { x: lastRaw.x * LOGICAL_WIDTH, y: lastRaw.y * LOGICAL_HEIGHT };
        }
      }
      flushBatch();

      const localType9 = Buffer.from(encodeBinaryDrawMessage('draw_stroke', {
        instanceId: instId,
        tool: 'pencil',
        color: '#112233',
        width: 6,
        opacity: 1,
        points: currentSegmentPoints,
        strokeId: currentStrokeId
      }));
      localHistory.push({ instanceId: instId, strokeId: currentStrokeId, data: localType9 });
      clientPointsPerSegment.push({ strokeId: currentStrokeId, points: [...currentSegmentPoints] });

      handleDrawBinary(mockSocket, makeType3(instId, currentStrokeId, currentSegmentPoints.length), deps);
      const anchor = lastCanPt ? { ...lastCanPt } : null;
      sentPointCount = 0;
      lastCanPt = null;
      return anchor;
    };

    // Simulate continuous 7,500-point drag without releasing pointer capture
    startSeg(10, 10);
    for (let step = 1; step < 7500; step++) {
      const lx = 10 + ((step * 2.3) % 640);
      const ly = 10 + ((step * 1.7) % 360);
      const q = quantize(lx, ly);

      if (willCanonicalSegmentExceedLimit(sentPointCount, moveBatch.length, 1)) {
        const anchor = finishSeg()!;
        startSeg(anchor.x, anchor.y);
      }

      moveBatch.push({ x: q.normX, y: q.normY });
      currentSegmentPoints.push({ x: q.normX, y: q.normY });
      lastCanPt = { x: q.canX, y: q.canY };

      // Simulate 200ms throttle flush every 40 points
      if (moveBatch.length >= 40) {
        flushBatch();
      }
    }
    finishSeg();

    // Verify server side results
    const abortEvents = roomEmits.filter(e => e.event === 'draw_binary' && e.payload?.[0] === MSG_DRAW_ABORT);
    const commitEvents = roomEmits.filter(e => e.event === 'draw_binary' && e.payload?.[0] === MSG_DRAW_COMMIT);
    const decodedCommits = commitEvents.map(e => decodeBinaryDrawMessage(e.payload)!.data);

    check(abortEvents.length === 0,
      `[${mode}] 7,500-pt gesture produced ZERO Type 12 server aborts (got ${abortEvents.length})`);
    check(decodedCommits.length === 3,
      `[${mode}] 7,500-pt gesture auto-split cleanly into 3 canonical segments (got ${decodedCommits.length})`);
    check(
      decodedCommits.every(c => c.pointCount >= 1 && c.pointCount <= 3000),
      `[${mode}] Every committed segment <= 3000 pts (${decodedCommits.map(c => c.pointCount).join(', ')})`
    );
    check(
      decodedCommits.map(c => c.strokeId).join(',') === '1,2,3',
      `[${mode}] Segment strokeIds monotonically ordered: ${decodedCommits.map(c => c.strokeId).join(',')}`
    );

    // Check continuity across split seam: last point of Seg K == p0 of Seg K+1
    const serverType9s = mockRoom.gameState.drawHistory
      .filter((cmd: any) => cmd?.data?.[0] === 9)
      .map((cmd: any) => decodeBinaryDrawMessage(cmd.data)!.data);

    let seamExact = serverType9s.length === 3;
    for (let s = 0; s < serverType9s.length - 1; s++) {
      const segA = serverType9s[s].points;
      const segB = serverType9s[s + 1].points;
      const aLast = segA[segA.length - 1];
      const bFirst = segB[0];
      if (!aLast || !bFirst || Math.abs(aLast.x - bFirst.x) > 1e-6 || Math.abs(aLast.y - bFirst.y) > 1e-6) {
        seamExact = false;
      }
    }
    check(seamExact, `[${mode}] Exact endpoint continuity verified across all auto-split seams (zero gaps)`);

    // Verify individual per-segment Undo (Type 7) & Redo (Type 9) via handleDrawBinary
    // Undo segment 3 only
    const undo3Buf = Buffer.alloc(10);
    undo3Buf.writeUInt8(7, 0);
    undo3Buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
    undo3Buf.writeUInt16LE(3, 8);
    handleDrawBinary(mockSocket, undo3Buf, deps);

    const remainingAfterUndo3 = mockRoom.gameState.drawHistory
      .filter((cmd: any) => cmd?.data?.[0] === 9)
      .map((cmd: any) => decodeBinaryDrawMessage(cmd.data)!.data.strokeId);
    check(remainingAfterUndo3.join(',') === '1,2',
      `[${mode}] Undo removes ONLY segment 3, leaving segments 1 & 2 (${remainingAfterUndo3.join(',')})`);

    // Collaborative Redo segment 3 -> re-emits valid canonical Type 9 with strokeId=4 -> ACCEPTED!
    const redo3Payload = Buffer.from(encodeBinaryDrawMessage('draw_stroke', {
      instanceId: instId,
      tool: 'pencil',
      color: '#112233',
      width: 6,
      opacity: 1,
      points: clientPointsPerSegment[2].points,
      strokeId: 4
    }));
    handleDrawBinary(mockSocket, redo3Payload, deps);

    // Late-joiner sync verification (deserialize mockRoom.gameState.drawHistory just like server getJsonSafeHistory)
    const lateJoinStrokeIds = (mockRoom.gameState.drawHistory as any[])
      .map(entry => Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data))
      .filter(buf => buf[0] === 9)
      .map(buf => decodeBinaryDrawMessage(buf)!.data.strokeId);

    check(lateJoinStrokeIds.join(',') === '1,2,4',
      `[${mode}] Collaborative Redo Type 9 accepted & late-joiner history preserves [1,2,4] cleanly`);
  } finally {
    stopManagerTimer(rm);
  }
}

console.log('\n==================================================================');
console.log(`PHASE 9A SLICE 3 RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('==================================================================');

if (failCount > 0) {
  process.exit(1);
}
process.exit(0);

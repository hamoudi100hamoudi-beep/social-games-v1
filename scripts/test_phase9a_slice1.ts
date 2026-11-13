import assert from 'node:assert';
import {
  encodeBinaryDrawMessage,
  decodeBinaryDrawMessage,
  MSG_DRAW_START,
  MSG_DRAW_MOVE,
  MSG_DRAW_END,
  MSG_DRAW_ACTION,
  MSG_DRAW_CLEAR,
  MSG_DRAW_CANCEL,
  MSG_DRAW_UNDO,
  MSG_DRAW_REDO,
  MSG_DRAW_STROKE,
  MSG_DRAW_COMMIT,
  MSG_DRAW_ABORT,
  MSG_DRAW_MOVE_COMPRESSED
} from '../src/utils/drawBinaryHelper.js';
import { replaySingleCommand } from '../src/utils/canvasReplayEngine.js';
import { handleDrawBinary } from '../server/registerDrawBinaryHandler.js';
import { RoomManager } from '../server/rooms.js';

console.log('====================================================');
console.log('🛡️  PHASE 9A — SLICE 1: PROTOCOL DIRECTION & DECODER SAFETY');
console.log('====================================================\n');

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

function makeControlBuf(type: number, instId = 'inst001', extraByteLen = 0): Buffer {
  const buf = Buffer.alloc(8 + extraByteLen);
  buf.writeUInt8(type, 0);
  buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  return buf;
}

function makeSpySetup(roomOptions: { isFreeDraw?: boolean; isExperimental?: boolean }) {
  const rm = new RoomManager();
  const roomId = `slice1-${Math.random().toString(36).slice(2, 8)}`;
  const room = rm.createRoom(roomId);
  room.isFreeDraw = Boolean(roomOptions.isFreeDraw);
  room.isExperimental = Boolean(roomOptions.isExperimental);
  room.gameState.status = 'DRAWING';

  const socketId = 'sock-drawer-1';
  const persistentId = 'pid-drawer-1';
  rm.addPlayerToRoom(roomId, {
    id: socketId,
    name: 'Drawer1',
    avatar: '🎨',
    score: 0,
    wins: 0,
    roomId,
    persistentId,
    isOffline: false
  });

  if (room.isFreeDraw) {
    room.activeDrawers = [persistentId];
  } else {
    room.gameState.currentDrawerId = persistentId;
  }

  const broadcasts: any[] = [];
  const ioEmits: any[] = [];
  const relayed13: any[] = [];

  const mockSocket: any = {
    id: socketId,
    broadcast: {
      to: (targetRoom: string) => ({
        emit: (ev: string, payload: any) => broadcasts.push({ targetRoom, ev, payload, volatile: false }),
        volatile: {
          emit: (ev: string, payload: any) => broadcasts.push({ targetRoom, ev, payload, volatile: true })
        }
      })
    }
  };

  const mockIo: any = {
    to: (targetRoom: string) => ({
      emit: (ev: string, payload: any) => ioEmits.push({ targetRoom, ev, payload })
    })
  };

  const deps = {
    io: mockIo,
    roomManager: rm,
    relayFreeDrawMove: (rId: string, _sock: any, buf: Buffer, instId: string, pts: any[]) => {
      relayed13.push({ rId, buf, instId, pts });
    }
  };

  return { rm, room, roomId, socketId, mockSocket, deps, broadcasts, ioEmits, relayed13 };
}

// -----------------------------------------------------------------
// 1. Client Decoder: Type 5 & Synthetic Type 10 Explicit Clears
// -----------------------------------------------------------------
console.log('--- 1. Client Decoder: Explicit Type 5 & Synthetic Type 10 Compatibility ---');
{
  const type5Buf = encodeBinaryDrawMessage('draw_clear', { instanceId: 'clr0001' });
  const dec5 = decodeBinaryDrawMessage(type5Buf);
  check(dec5 !== null && dec5.event === 'draw_clear', 'Type 5 continues decoding as draw_clear');
  check(dec5?.data?.instanceId === 'clr0001', 'Type 5 preserves instanceId');

  // Synthetic compatibility-behavior test ONLY (does NOT prove historical external Type 10 wire layout)
  const syntheticType10 = makeControlBuf(10, 'leg0001');
  const dec10 = decodeBinaryDrawMessage(syntheticType10);
  check(
    dec10 !== null && dec10.event === 'draw_clear' && dec10.data?.instanceId === 'leg0001',
    'Synthetic minimal Type 10 explicitly decodes as draw_clear (compatibility-behavior check)'
  );
}

// -----------------------------------------------------------------
// 2. Client Decoder: Unknown Opcodes Return null & Never Clear Canvas
// -----------------------------------------------------------------
console.log('\n--- 2. Client Decoder: Unknown Opcodes Return null & Never Clear Canvas ---');
{
  const unknownTypes = [0, 14, 15, 99, 255];
  const mockCtx: any = { canvas: { width: 1200, height: 800 } };
  const noopFloodFill = () => null;
  const replayOpts = { logicalWidth: 1200, logicalHeight: 800, isFreeDraw: true, enableDestinationOutEraser: true };

  for (const t of unknownTypes) {
    const unknownBuf = makeControlBuf(t, 'unk0001');
    const dec = decodeBinaryDrawMessage(unknownBuf);
    check(dec === null, `Unknown Type ${t} returns null in decodeBinaryDrawMessage`);

    const paths: Record<string, { x: number; y: number }[]> = { p1: [{ x: 1, y: 1 }] };
    const sessions: Record<string, any> = { p1: { tool: 'pencil', color: '#000', width: 5, opacity: 1 } };
    const effect = replaySingleCommand(
      mockCtx,
      { data: unknownBuf },
      paths,
      sessions,
      replayOpts,
      noopFloodFill
    );
    check(effect === 'none', `Unknown Type ${t} produces replay effect "none" (never "clear")`);
    check(Boolean(paths.p1 && sessions.p1), `Unknown Type ${t} leaves active replay paths/sessions untouched`);
  }

  // Confirm Type 5 and synthetic Type 10 still return 'clear' in replaySingleCommand
  const type5Replay = replaySingleCommand(
    mockCtx,
    { data: encodeBinaryDrawMessage('draw_clear', { instanceId: 'clr0001' }) },
    { p1: [{ x: 1, y: 1 }] },
    { p1: { tool: 'pencil', color: '#000', width: 5, opacity: 1 } },
    replayOpts,
    noopFloodFill
  );
  check(type5Replay === 'clear', 'Type 5 produces replay effect "clear"');

  const type10Replay = replaySingleCommand(
    mockCtx,
    { data: makeControlBuf(10, 'leg0001') },
    { p1: [{ x: 1, y: 1 }] },
    { p1: { tool: 'pencil', color: '#000', width: 5, opacity: 1 } },
    replayOpts,
    noopFloodFill
  );
  check(type10Replay === 'clear', 'Synthetic Type 10 produces replay effect "clear"');
}

// -----------------------------------------------------------------
// 3. Server Ingress: Reject Client Type 11, Type 12, 0, 14, 255
// -----------------------------------------------------------------
console.log('\n--- 3. Server Ingress: Reject Client Type 11, 12, 0, 14, 255 ---');
{
  const roomModes = [
    { name: 'Free Draw', opts: { isFreeDraw: true, isExperimental: false } },
    { name: 'Experimental', opts: { isFreeDraw: false, isExperimental: true } },
    { name: 'Normal/Competitive', opts: { isFreeDraw: false, isExperimental: false } }
  ];

  for (const mode of roomModes) {
    const { room, roomId, mockSocket, deps, broadcasts, ioEmits, relayed13 } = makeSpySetup(mode.opts);

    // Seed 1 valid command first so drawHistory is non-empty (ensuring rejections aren't masked by empty-history guard)
    const validStart = Buffer.from(
      encodeBinaryDrawMessage('draw_start', {
        instanceId: 'seed001',
        tool: 'pencil',
        color: '#000000',
        width: 5,
        opacity: 1,
        x: 0.2,
        y: 0.2
      })
    );
    handleDrawBinary(mockSocket, validStart, deps);
    const baselineHistoryLen = room.gameState.drawHistory.length;
    const baselineDrawingActive = room.gameState.isDrawingActive;
    broadcasts.length = 0;
    ioEmits.length = 0;
    relayed13.length = 0;

    // Attempt Type 11 (commit), Type 12 (abort), and unknown types 0, 14, 255
    const blockedPayloads = [
      { label: 'Type 11 (spoofed commit)', buf: Buffer.from(encodeBinaryDrawMessage('draw_commit', { instanceId: 'seed001', strokeId: 1, pointCount: 5 })) },
      { label: 'Type 12 (spoofed abort)', buf: Buffer.from(encodeBinaryDrawMessage('draw_abort', { instanceId: 'seed001', strokeId: 1 })) },
      { label: 'Type 0 (unknown)', buf: makeControlBuf(0, 'bad0000') },
      { label: 'Type 14 (unknown)', buf: makeControlBuf(14, 'bad0014') },
      { label: 'Type 255 (unknown)', buf: makeControlBuf(255, 'bad0255') }
    ];

    for (const item of blockedPayloads) {
      handleDrawBinary(mockSocket, item.buf, deps);
      check(
        broadcasts.length === 0 && ioEmits.length === 0 && relayed13.length === 0,
        `${mode.name}: Client ${item.label} is not broadcast or emitted`
      );
      check(
        room.gameState.drawHistory.length === baselineHistoryLen,
        `${mode.name}: Client ${item.label} is not recorded in drawHistory`
      );
      check(
        room.gameState.isDrawingActive === baselineDrawingActive,
        `${mode.name}: Client ${item.label} does not mutate isDrawingActive`
      );
    }

    // Synthetic Type 10 compatibility check on server ingress (must still pass through & preserve history rule)
    const { room: legRoom, mockSocket: legSock, deps: legDeps, broadcasts: legBroadcasts } = makeSpySetup(mode.opts);
    const syntheticType10 = makeControlBuf(10, 'leg0001');
    handleDrawBinary(legSock, syntheticType10, legDeps);
    check(
      legBroadcasts.length === 1 && legBroadcasts[0].payload[0] === 10,
      `${mode.name}: Synthetic Type 10 remains relayed by server ingress`
    );
    check(
      legRoom.gameState.drawHistory.length === 1 && legRoom.gameState.drawHistory[0].data[0] === 10,
      `${mode.name}: Synthetic Type 10 remains accepted into drawHistory on empty history`
    );
    void roomId;
  }
}

// -----------------------------------------------------------------
// 4. Server-Originated Type 11 & Type 12 Remain Functional & Decodable
// -----------------------------------------------------------------
console.log('\n--- 4. Legitimate Server-Originated Type 11 & Type 12 ---');
{
  const { rm, room, roomId, socketId, mockSocket, deps, ioEmits } = makeSpySetup({ isFreeDraw: true });
  rm.registerDrawingIdentity(socketId, 'srv0001');

  const startBuf = Buffer.from(
    encodeBinaryDrawMessage('draw_start', {
      instanceId: 'srv0001',
      tool: 'pencil',
      color: '#112233',
      width: 6,
      opacity: 1,
      x: 0.1,
      y: 0.1,
      strokeId: 7
    })
  );
  handleDrawBinary(mockSocket, startBuf, deps);

  const endBuf = Buffer.from(
    encodeBinaryDrawMessage('draw_end', {
      instanceId: 'srv0001',
      tool: 'pencil',
      color: '#112233',
      width: 6,
      opacity: 1,
      startX: 0.1,
      startY: 0.1,
      x: 0.2,
      y: 0.2,
      isCancelled: false,
      strokeId: 7,
      expectedPointCount: 1
    })
  );
  handleDrawBinary(mockSocket, endBuf, deps);

  const commitEmit = ioEmits.find(e => e.ev === 'draw_binary' && Buffer.isBuffer(e.payload) && e.payload[0] === MSG_DRAW_COMMIT);
  check(Boolean(commitEmit), 'Server emits legitimate Type 11 (MSG_DRAW_COMMIT) on stroke end');
  const decCommit = decodeBinaryDrawMessage(commitEmit?.payload);
  check(
    decCommit?.event === 'draw_commit' && decCommit.data?.instanceId === 'srv0001' && decCommit.data?.strokeId === 7,
    'Client decodes server-originated Type 11 correctly'
  );

  // Server-originated Type 12 via abortFreeDrawStroke
  const startBuf2 = Buffer.from(
    encodeBinaryDrawMessage('draw_start', {
      instanceId: 'srv0001',
      tool: 'pencil',
      color: '#112233',
      width: 6,
      opacity: 1,
      x: 0.3,
      y: 0.3
    })
  );
  handleDrawBinary(mockSocket, startBuf2, deps);
  ioEmits.length = 0;
  rm.setIo(deps.io);
  rm.abortFreeDrawStroke(roomId, socketId, 'srv0001');
  if ((rm as any).tickInterval) {
    clearInterval((rm as any).tickInterval);
    (rm as any).tickInterval = null;
  }

  const abortEmit = ioEmits.find(e => e.ev === 'draw_binary' && Buffer.isBuffer(e.payload) && e.payload[0] === MSG_DRAW_ABORT);
  check(Boolean(abortEmit), 'Server emits legitimate Type 12 (MSG_DRAW_ABORT) via abortFreeDrawStroke');
  const decAbort = decodeBinaryDrawMessage(abortEmit?.payload);
  check(
    decAbort?.event === 'draw_abort' && decAbort.data?.instanceId === 'srv0001',
    'Client decodes server-originated Type 12 correctly'
  );
  void room;
}

// -----------------------------------------------------------------
// 5. Non-Canonical vs Canonical Type 13 Routing
// -----------------------------------------------------------------
console.log('\n--- 5. Non-Canonical Type 13 Rejection vs Canonical Type 13 Acceptance ---');
{
  const compressedBuf = Buffer.from(
    encodeBinaryDrawMessage('draw_move_compressed', {
      instanceId: 'cmp0001',
      moves: [{ x: 0.2, y: 0.2 }, { x: 0.21, y: 0.21 }]
    })
  );

  // Non-canonical room (!isFreeDraw && !isExperimental): MUST reject Type 13
  const nonCanon = makeSpySetup({ isFreeDraw: false, isExperimental: false });
  handleDrawBinary(nonCanon.mockSocket, compressedBuf, nonCanon.deps);
  check(
    nonCanon.broadcasts.length === 0 && nonCanon.relayed13.length === 0 && nonCanon.room.gameState.drawHistory.length === 0,
    'Non-canonical Type 13 rejected cleanly without relay or drawHistory fallback insertion'
  );

  // Canonical room (Free Draw): Type 13 still validates and relays normally after draw_start
  const canon = makeSpySetup({ isFreeDraw: true, isExperimental: false });
  const startBuf = Buffer.from(
    encodeBinaryDrawMessage('draw_start', {
      instanceId: 'cmp0001',
      tool: 'pencil',
      color: '#000000',
      width: 4,
      opacity: 1,
      x: 0.19,
      y: 0.19
    })
  );
  handleDrawBinary(canon.mockSocket, startBuf, canon.deps);
  handleDrawBinary(canon.mockSocket, compressedBuf, canon.deps);
  check(
    canon.relayed13.length === 1 && canon.relayed13[0].pts.length === 2,
    'Canonical Type 13 continues succeeding and relaying points normally'
  );
}

// -----------------------------------------------------------------
// 6. Supported Client Types 1..9 Compatibility Across Tools & Modes
// -----------------------------------------------------------------
console.log('\n--- 6. Supported Client Drawing Types 1..9 Compatibility ---');
{
  // Decoder coverage for all legitimate client types
  const codecCases = [
    { name: 'Type 1 (pencil start)', ev: 'draw_start', data: { instanceId: 'tool001', tool: 'pencil', color: '#123456', width: 8, opacity: 1, x: 0.1, y: 0.2 }, expectedEv: 'draw_start' },
    { name: 'Type 2 (move)', ev: 'draw_move', data: { instanceId: 'tool001', moves: [{ x: 0.12, y: 0.22 }, { x: 0.14, y: 0.24 }] }, expectedEv: 'draw_move' },
    { name: 'Type 3 (end)', ev: 'draw_end', data: { instanceId: 'tool001', tool: 'line', color: '#123456', width: 8, opacity: 1, startX: 0.1, startY: 0.2, x: 0.5, y: 0.6, isCancelled: false }, expectedEv: 'draw_end' },
    { name: 'Type 4 (bucket action)', ev: 'draw_action', data: { instanceId: 'tool001', tool: 'bucket', color: '#ff0000', opacity: 1, x: 0.5, y: 0.5, targetR: 255, targetG: 255, targetB: 255, targetA: 255, strokeId: 3 }, expectedEv: 'draw_action' },
    { name: 'Type 5 (clear)', ev: 'draw_clear', data: { instanceId: 'tool001' }, expectedEv: 'draw_clear' },
    { name: 'Type 6 (cancel)', ev: 'draw_cancel', data: { instanceId: 'tool001' }, expectedEv: 'draw_cancel' },
    { name: 'Type 7 (undo with strokeId)', ev: 'draw_undo', data: { instanceId: 'tool001', strokeId: 12 }, expectedEv: 'draw_undo' },
    { name: 'Type 8 (redo)', ev: 'draw_redo', data: { instanceId: 'tool001' }, expectedEv: 'draw_redo' },
    { name: 'Type 9 (stroke)', ev: 'draw_stroke', data: { instanceId: 'tool001', tool: 'fillRect', color: '#00ff00', width: 4, opacity: 1, points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }], strokeId: 9 }, expectedEv: 'draw_stroke' },
    { name: 'Type 13 (compressed move)', ev: 'draw_move_compressed', data: { instanceId: 'tool001', moves: [{ x: 0.2, y: 0.2 }, { x: 0.21, y: 0.22 }] }, expectedEv: 'draw_move' }
  ];

  for (const tc of codecCases) {
    const enc = encodeBinaryDrawMessage(tc.ev, tc.data);
    const dec = decodeBinaryDrawMessage(enc);
    check(dec !== null && dec.event === tc.expectedEv, `Codec roundtrip preserved for ${tc.name}`);
  }

  // Server flow check for bucket (Type 4), shape stroke (Type 9), and Type 6/8 in supported modes
  const norm = makeSpySetup({ isFreeDraw: false, isExperimental: false });
  handleDrawBinary(norm.mockSocket, Buffer.from(encodeBinaryDrawMessage('draw_action', { instanceId: 'nrm0001', tool: 'bucket', color: '#ff0000', opacity: 1, x: 0.5, y: 0.5 })), norm.deps);
  handleDrawBinary(norm.mockSocket, Buffer.from(encodeBinaryDrawMessage('draw_stroke', { instanceId: 'nrm0001', tool: 'strokeRect', color: '#0000ff', width: 3, opacity: 1, points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }], strokeId: 2 })), norm.deps);
  handleDrawBinary(norm.mockSocket, Buffer.from(encodeBinaryDrawMessage('draw_redo', { instanceId: 'nrm0001' })), norm.deps);
  check(
    norm.broadcasts.length === 2 && norm.ioEmits.length === 1 && norm.room.gameState.drawHistory.length >= 2,
    'Normal mode supports Type 4 bucket, Type 9 shape stroke, and Type 8 redo flows'
  );

  // Confirm constants remain unchanged
  assert.strictEqual(MSG_DRAW_START, 1);
  assert.strictEqual(MSG_DRAW_MOVE, 2);
  assert.strictEqual(MSG_DRAW_END, 3);
  assert.strictEqual(MSG_DRAW_ACTION, 4);
  assert.strictEqual(MSG_DRAW_CLEAR, 5);
  assert.strictEqual(MSG_DRAW_CANCEL, 6);
  assert.strictEqual(MSG_DRAW_UNDO, 7);
  assert.strictEqual(MSG_DRAW_REDO, 8);
  assert.strictEqual(MSG_DRAW_STROKE, 9);
  assert.strictEqual(MSG_DRAW_COMMIT, 11);
  assert.strictEqual(MSG_DRAW_ABORT, 12);
  assert.strictEqual(MSG_DRAW_MOVE_COMPRESSED, 13);
  check(true, 'All MSG_DRAW_* opcode constants preserved');
}

console.log('\n====================================================');
console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
if (failCount === 0) {
  console.log('🎉 ALL PHASE 9A SLICE 1 TESTS PASSED!');
  console.log('====================================================');
  process.exit(0);
} else {
  console.error('❌ PHASE 9A SLICE 1 TESTS FAILED!');
  console.log('====================================================');
  process.exit(1);
}

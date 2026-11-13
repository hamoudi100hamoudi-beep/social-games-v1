import {
  encodeBinaryDrawMessage,
  MSG_DRAW_COMMIT,
  MSG_DRAW_ABORT
} from '../src/utils/drawBinaryHelper.js';
import { handleDrawBinary } from '../server/registerDrawBinaryHandler.js';
import {
  handleFreeDrawStart,
  handleFreeDrawMove,
  handleFreeDrawEnd
} from '../server/roomCanonicalStrokeEngine.js';
import {
  isValidInstIdBytes,
  extractValidatedInstId,
  createType1Buffer,
  createType2Buffer
} from '../server/utils/binaryBufferHelpers.js';
import { RoomManager } from '../server/rooms.js';

console.log('====================================================');
console.log('🛡️  PHASE 9A — SLICE 2: STRUCTURAL PACKET VALIDATION');
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

function stopManagerTimer(rm: RoomManager) {
  if ((rm as any).tickInterval) {
    clearInterval((rm as any).tickInterval);
    (rm as any).tickInterval = null;
  }
}

function makeRawInstBuf(totalLen: number, type: number, instBytes: number[]): Buffer {
  const buf = Buffer.alloc(totalLen);
  buf[0] = type & 0xFF;
  for (let i = 0; i < 7 && i < instBytes.length; i++) {
    buf[1 + i] = instBytes[i] & 0xFF;
  }
  return buf;
}

function makeControlBuf(type: number, instId: string, byteLen = 8): Buffer {
  const buf = Buffer.alloc(byteLen);
  buf.writeUInt8(type, 0);
  if (instId.length > 0) {
    buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  }
  return buf;
}

function makeType3Buf(opts: {
  instId?: string;
  tool?: number;
  length?: 23 | 27 | number;
  cancelled?: boolean;
  strokeId?: number;
}): Buffer {
  const len = opts.length ?? 27;
  const buf = Buffer.alloc(len);
  buf.writeUInt8(3, 0);
  const inst = opts.instId ?? 'str0001';
  if (inst.length > 0) {
    buf.write(inst.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  }
  if (len > 8) buf.writeUInt8((opts.tool ?? 0) & 0xFF, 8);
  if (len >= 23 && opts.cancelled) buf.writeUInt8(1, 22);
  if (len >= 25 && opts.strokeId !== undefined) buf.writeUInt16LE(opts.strokeId & 0xFFFF, 23);
  return buf;
}

function makeSpySetup(roomOptions: { isFreeDraw?: boolean; isExperimental?: boolean }) {
  const rm = new RoomManager();
  const roomId = `slice2-${Math.random().toString(36).slice(2, 8)}`;
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
  rm.setIo(mockIo);

  const deps = {
    io: mockIo,
    roomManager: rm
  };

  return { rm, room, roomId, socketId, mockSocket, deps, broadcasts, ioEmits };
}

// -----------------------------------------------------------------
// 1. instId Validator Rules & Production Compatibility
// -----------------------------------------------------------------
console.log('--- 1. instId Validator Rules & Production Compatibility ---');
{
  const validIds = ['server', 'loss_te', 'user_01', 'player-', 'a', 'abc123_', 'Z9-a_0b'];
  for (const id of validIds) {
    const buf = makeControlBuf(6, id, 8);
    check(isValidInstIdBytes(buf, false), `Accepts valid ASCII instId "${id}"`);
    check(extractValidatedInstId(buf, false) === id, `Extracts exact ASCII instId "${id}"`);
  }

  // Empty all-zero instId
  const emptyBuf = Buffer.alloc(8);
  emptyBuf[0] = 5;
  check(!isValidInstIdBytes(emptyBuf, false), 'Rejects empty instId when allowEmpty=false');
  check(isValidInstIdBytes(emptyBuf, true), 'Allows empty instId when allowEmpty=true (Type 5)');
  check(extractValidatedInstId(emptyBuf, true) === '', 'Extracts empty string when allowEmpty=true');

  // Embedded null after padding: ['a', 0, 'b', 0, 0, 0, 0]
  const embeddedNull = makeRawInstBuf(8, 5, [97, 0, 98, 0, 0, 0, 0]);
  check(!isValidInstIdBytes(embeddedNull, false), 'Rejects non-zero byte after null padding (allowEmpty=false)');
  check(!isValidInstIdBytes(embeddedNull, true), 'Rejects non-zero byte after null padding even on Type 5');

  // Control characters, space, non-ASCII
  const controlChar = makeRawInstBuf(8, 5, [97, 7, 0, 0, 0, 0, 0]);
  const spaceChar = makeRawInstBuf(8, 5, [97, 32, 98, 0, 0, 0, 0]);
  const nonAscii = makeRawInstBuf(8, 5, [97, 0xE9, 0, 0, 0, 0, 0]);
  check(!isValidInstIdBytes(controlChar, true), 'Rejects ASCII control character (0x07)');
  check(!isValidInstIdBytes(spaceChar, true), 'Rejects ASCII space (0x20)');
  check(!isValidInstIdBytes(nonAscii, true), 'Rejects non-ASCII byte (0xE9)');
}

// -----------------------------------------------------------------
// 2. Type 1 (DRAW_START) Structural & Tool Allowlist Validation
// -----------------------------------------------------------------
console.log('\n--- 2. Type 1 (DRAW_START) Structural & Tool Allowlist Validation ---');
{
  const allowedTools = [0, 1, 3, 4, 5, 6, 7];
  const disallowedTools = [2, 8, 9, 255];

  for (const mode of [
    { name: 'Free Draw', opts: { isFreeDraw: true, isExperimental: false } },
    { name: 'Experimental', opts: { isFreeDraw: false, isExperimental: true } },
    { name: 'Normal', opts: { isFreeDraw: false, isExperimental: false } }
  ]) {
    const setup = makeSpySetup(mode.opts);

    // Allowed tools with exact 18B
    for (const tool of allowedTools) {
      setup.broadcasts.length = 0;
      const buf = createType1Buffer(`t1_${tool}`, tool, 10, 20, 30, 5, 255, 100, 120);
      handleDrawBinary(setup.mockSocket, buf, setup.deps);
      check(setup.broadcasts.length === 1, `${mode.name}: Type 1 accepts tool ${tool} (18B)`);
    }

    // Disallowed tools (2=bucket, 8=pipette, 9, 255)
    for (const tool of disallowedTools) {
      setup.broadcasts.length = 0;
      const prevHist = setup.room.gameState.drawHistory.length;
      const buf = createType1Buffer(`bad_${tool}`, tool, 10, 20, 30, 5, 255, 100, 120);
      handleDrawBinary(setup.mockSocket, buf, setup.deps);
      check(
        setup.broadcasts.length === 0 && setup.room.gameState.drawHistory.length === prevHist,
        `${mode.name}: Type 1 rejects disallowed tool ${tool}`
      );
    }

    // Wrong lengths (<18, >18) and invalid instId
    for (const badBuf of [
      createType1Buffer('short01', 0, 0, 0, 0, 4, 255, 10, 10).subarray(0, 17),
      Buffer.concat([createType1Buffer('long001', 0, 0, 0, 0, 4, 255, 10, 10), Buffer.from([1])]),
      Buffer.concat([createType1Buffer('long002', 3, 0, 0, 0, 4, 255, 10, 10), Buffer.alloc(64)]),
      createType1Buffer('', 0, 0, 0, 0, 4, 255, 10, 10),
      makeRawInstBuf(18, 1, [97, 0, 98])
    ]) {
      setup.broadcasts.length = 0;
      const prevHist = setup.room.gameState.drawHistory.length;
      handleDrawBinary(setup.mockSocket, badBuf, setup.deps);
      check(
        setup.broadcasts.length === 0 && setup.room.gameState.drawHistory.length === prevHist,
        `${mode.name}: Type 1 rejects invalid length/instId (len=${badBuf.length})`
      );
    }

    stopManagerTimer(setup.rm);
  }

  // Canonical direct call handleFreeDrawStart also enforces exact length & tool allowlist
  const canon = makeSpySetup({ isFreeDraw: true });
  check(!handleFreeDrawStart(canon.room, canon.socketId, Buffer.concat([createType1Buffer('x01', 0, 0, 0, 0, 2, 255, 1, 1), Buffer.from([9])])), 'Direct handleFreeDrawStart rejects 19B trailing-byte buffer');
  check(!handleFreeDrawStart(canon.room, canon.socketId, createType1Buffer('x02', 8, 0, 0, 0, 2, 255, 1, 1)), 'Direct handleFreeDrawStart rejects pipette tool 8');
  stopManagerTimer(canon.rm);
}

// -----------------------------------------------------------------
// 3. Type 2 (DRAW_MOVE) Exact Byte-Length Validation
// -----------------------------------------------------------------
console.log('\n--- 3. Type 2 (DRAW_MOVE) Exact Byte-Length Validation ---');
{
  // Free Draw & Experimental (Canonical)
  for (const mode of [
    { name: 'Free Draw', opts: { isFreeDraw: true, isExperimental: false } },
    { name: 'Experimental', opts: { isFreeDraw: false, isExperimental: true } }
  ]) {
    const setup = makeSpySetup(mode.opts);
    handleDrawBinary(setup.mockSocket, createType1Buffer('mv00001', 0, 0, 0, 0, 4, 255, 10, 10), setup.deps);

    // Valid count = 0 (10B no-op) & count = 2 (18B)
    setup.broadcasts.length = 0;
    handleDrawBinary(setup.mockSocket, createType2Buffer('mv00001', []), setup.deps);
    check(setup.broadcasts.length === 1 && setup.broadcasts[0].payload.length === 10, `${mode.name}: Type 2 accepts exact 10B count=0 packet`);

    setup.broadcasts.length = 0;
    handleDrawBinary(setup.mockSocket, createType2Buffer('mv00001', [{ x: 11, y: 12 }, { x: 13, y: 14 }]), setup.deps);
    check(setup.broadcasts.length === 1 && setup.broadcasts[0].payload.length === 18, `${mode.name}: Type 2 accepts exact 18B count=2 packet`);

    // Trailing bytes (+1B, +1024B) rejected even with valid active stroke
    const valid2 = createType2Buffer('mv00001', [{ x: 15, y: 16 }]); // 14B
    for (const extra of [1, 1024]) {
      setup.broadcasts.length = 0;
      const bloated = Buffer.concat([valid2, Buffer.alloc(extra, 0xAA)]);
      handleDrawBinary(setup.mockSocket, bloated, setup.deps);
      check(setup.broadcasts.length === 0, `${mode.name}: Type 2 rejects +${extra} trailing bytes`);
      check(handleFreeDrawMove(setup.room, setup.socketId, bloated) === false, `${mode.name}: Direct handleFreeDrawMove rejects +${extra} trailing bytes`);
    }

    // Truncated header (<10B) and truncated body (<10 + count*4) rejected
    const truncBody = Buffer.from(valid2);
    truncBody.writeUInt16LE(3, 8); // claims 3 points (22B) but length is 14B
    for (const truncBuf of [valid2.subarray(0, 9), truncBody]) {
      setup.broadcasts.length = 0;
      handleDrawBinary(setup.mockSocket, truncBuf, setup.deps);
      check(setup.broadcasts.length === 0, `${mode.name}: Type 2 rejects truncated packet (len=${truncBuf.length})`);
    }

    // Invalid instId rejected
    setup.broadcasts.length = 0;
    const emptyInst2 = createType2Buffer('', [{ x: 20, y: 20 }]);
    handleDrawBinary(setup.mockSocket, emptyInst2, setup.deps);
    check(setup.broadcasts.length === 0, `${mode.name}: Type 2 rejects empty instId`);

    // Canonical 3000-point boundary preserved (p0=1 + 2999=3000 OK; +1 more triggers Type 12 abort)
    handleDrawBinary(setup.mockSocket, createType1Buffer('lim0001', 0, 0, 0, 0, 4, 255, 0, 0), setup.deps);
    const pts2999 = Array.from({ length: 2999 }, (_, i) => ({ x: i, y: i }));
    setup.broadcasts.length = 0;
    setup.ioEmits.length = 0;
    handleDrawBinary(setup.mockSocket, createType2Buffer('lim0001', pts2999), setup.deps);
    check(setup.broadcasts.length === 1 && setup.ioEmits.length === 0, `${mode.name}: Type 2 allows max canonical count=2999 (total 3000 pts)`);

    setup.broadcasts.length = 0;
    setup.ioEmits.length = 0;
    handleDrawBinary(setup.mockSocket, createType2Buffer('lim0001', [{ x: 1, y: 1 }]), setup.deps);
    check(
      setup.broadcasts.length === 0 && setup.ioEmits.some(e => e.payload[0] === MSG_DRAW_ABORT),
      `${mode.name}: Type 2 exceeding 3000 pts still triggers Type 12 abort`
    );

    stopManagerTimer(setup.rm);
  }

  // Normal / Competitive Mode (Non-Canonical)
  {
    const norm = makeSpySetup({ isFreeDraw: false, isExperimental: false });
    handleDrawBinary(norm.mockSocket, createType1Buffer('nrm0001', 0, 0, 0, 0, 4, 255, 10, 10), norm.deps);
    const baselineLen = norm.room.gameState.drawHistory.length;

    // Valid count=0 (10B) & large batch count=3005 (proving zero invented point cap in Normal mode!)
    norm.broadcasts.length = 0;
    handleDrawBinary(norm.mockSocket, createType2Buffer('nrm0001', []), norm.deps);
    check(norm.broadcasts.length === 1 && norm.room.gameState.drawHistory.length === baselineLen + 1, 'Normal: Type 2 accepts exact 10B count=0');

    const bigNormalPts = Array.from({ length: 3005 }, (_, i) => ({ x: i % 1200, y: i % 800 }));
    norm.broadcasts.length = 0;
    handleDrawBinary(norm.mockSocket, createType2Buffer('nrm0001', bigNormalPts), norm.deps);
    check(norm.broadcasts.length === 1 && norm.room.gameState.drawHistory.length === baselineLen + 2, 'Normal: Type 2 preserves large valid batch without invented point cap');

    // Trailing bytes (+1B, +1024B) & truncated rejected in Normal mode
    const histBeforeReject = norm.room.gameState.drawHistory.length;
    const validNorm2 = createType2Buffer('nrm0001', [{ x: 50, y: 60 }]);
    for (const extra of [1, 1024]) {
      norm.broadcasts.length = 0;
      handleDrawBinary(norm.mockSocket, Buffer.concat([validNorm2, Buffer.alloc(extra)]), norm.deps);
      check(
        norm.broadcasts.length === 0 && norm.room.gameState.drawHistory.length === histBeforeReject,
        `Normal: Type 2 rejects +${extra} trailing bytes`
      );
    }

    const truncNormBody = Buffer.from(validNorm2);
    truncNormBody.writeUInt16LE(4, 8);
    norm.broadcasts.length = 0;
    handleDrawBinary(norm.mockSocket, truncNormBody, norm.deps);
    check(
      norm.broadcasts.length === 0 && norm.room.gameState.drawHistory.length === histBeforeReject,
      'Normal: Type 2 rejects truncated body'
    );

    stopManagerTimer(norm.rm);
  }
}

// -----------------------------------------------------------------
// 4. Type 3 (DRAW_END) Variants, Edge States & No Raw Fallback
// -----------------------------------------------------------------
console.log('\n--- 4. Type 3 (DRAW_END) Variants, Edge States & Spurious Broadcast Removal ---');
{
  // Free Draw Continuous (23B & 27B commit; cancel/expired -> ONLY Type 12; orphan/duplicate -> ZERO emit)
  const fd = makeSpySetup({ isFreeDraw: true });

  // 4a. Valid 23B commit
  handleDrawBinary(fd.mockSocket, createType1Buffer('end23_1', 0, 0, 0, 0, 4, 255, 10, 10), fd.deps);
  fd.broadcasts.length = 0;
  fd.ioEmits.length = 0;
  handleDrawBinary(fd.mockSocket, makeType3Buf({ instId: 'end23_1', tool: 0, length: 23 }), fd.deps);
  check(
    fd.ioEmits.length === 1 && fd.ioEmits[0].payload[0] === MSG_DRAW_COMMIT && fd.broadcasts.length === 0,
    'Free Draw: Valid 23B Type 3 commits with Type 11 and no raw Type 3 broadcast'
  );

  // 4b. Duplicate Type 3 for already-committed stroke drops silently
  fd.broadcasts.length = 0;
  fd.ioEmits.length = 0;
  const histAfterCommit = fd.room.gameState.drawHistory.length;
  handleDrawBinary(fd.mockSocket, makeType3Buf({ instId: 'end23_1', tool: 0, length: 23 }), fd.deps);
  check(
    fd.ioEmits.length === 0 && fd.broadcasts.length === 0 && fd.room.gameState.drawHistory.length === histAfterCommit,
    'Free Draw: Duplicate Type 3 drops silently without Type 11, Type 12, or raw Type 3 broadcast'
  );

  // 4c. Valid 27B commit
  handleDrawBinary(fd.mockSocket, createType1Buffer('end27_1', 1, 0, 0, 0, 8, 255, 20, 20), fd.deps);
  fd.broadcasts.length = 0;
  fd.ioEmits.length = 0;
  handleDrawBinary(fd.mockSocket, makeType3Buf({ instId: 'end27_1', tool: 1, length: 27, strokeId: 42 }), fd.deps);
  check(
    fd.ioEmits.length === 1 && fd.ioEmits[0].payload[0] === MSG_DRAW_COMMIT && fd.broadcasts.length === 0,
    'Free Draw: Valid 27B eraser Type 3 commits cleanly with Type 11'
  );

  // 4d. Cancelled Type 3 (buf[22] === 1): emits ONLY Type 12 abort, ZERO raw Type 3 broadcast
  handleDrawBinary(fd.mockSocket, createType1Buffer('cncl001', 0, 0, 0, 0, 4, 255, 10, 10), fd.deps);
  fd.broadcasts.length = 0;
  fd.ioEmits.length = 0;
  handleDrawBinary(fd.mockSocket, makeType3Buf({ instId: 'cncl001', tool: 0, length: 27, cancelled: true, strokeId: 9 }), fd.deps);
  check(
    fd.ioEmits.length === 1 && fd.ioEmits[0].payload[0] === MSG_DRAW_ABORT && fd.broadcasts.length === 0,
    'Free Draw: Cancelled Type 3 emits ONLY Type 12 abort (zero raw Type 3 broadcast)'
  );

  // 4e. Expired Type 3 (>60s): emits ONLY Type 12 abort, ZERO raw Type 3 broadcast
  handleDrawBinary(fd.mockSocket, createType1Buffer('exp0001', 0, 0, 0, 0, 4, 255, 10, 10), fd.deps);
  const expiredStroke = fd.room.freeDrawStrokes?.get(`${fd.socketId}_exp0001`);
  if (expiredStroke) expiredStroke.createdAt = Date.now() - 65000;
  fd.broadcasts.length = 0;
  fd.ioEmits.length = 0;
  handleDrawBinary(fd.mockSocket, makeType3Buf({ instId: 'exp0001', tool: 0, length: 27, strokeId: 11 }), fd.deps);
  check(
    fd.ioEmits.length === 1 && fd.ioEmits[0].payload[0] === MSG_DRAW_ABORT && fd.broadcasts.length === 0,
    'Free Draw: Expired (>60s) Type 3 emits ONLY Type 12 abort (zero raw Type 3 broadcast)'
  );

  // 4f. Orphaned Type 3 (never started): drops silently, ZERO raw Type 3 / Type 11 / Type 12
  fd.broadcasts.length = 0;
  fd.ioEmits.length = 0;
  handleDrawBinary(fd.mockSocket, makeType3Buf({ instId: 'orph001', tool: 0, length: 27 }), fd.deps);
  check(
    fd.ioEmits.length === 0 && fd.broadcasts.length === 0,
    'Free Draw: Orphaned continuous Type 3 drops silently with zero broadcast/emit'
  );

  // 4g. Shape Type 3 (tool 3 line) still routes through recordDrawCommand + broadcast
  const histBeforeShape = fd.room.gameState.drawHistory.length;
  fd.broadcasts.length = 0;
  handleDrawBinary(fd.mockSocket, createType1Buffer('shp0001', 3, 0, 0, 0, 4, 255, 0, 0), fd.deps);
  handleDrawBinary(fd.mockSocket, makeType3Buf({ instId: 'shp0001', tool: 3, length: 27, strokeId: 5 }), fd.deps);
  check(
    fd.broadcasts.length === 2 && fd.room.gameState.drawHistory.length === histBeforeShape + 2,
    'Free Draw: Shape Type 3 preserves recordDrawCommand + broadcast'
  );

  // 4h. Invalid lengths (22, 24, 26, 28) & disallowed tools (2, 8, 9) rejected even on active stroke
  handleDrawBinary(fd.mockSocket, createType1Buffer('badend1', 0, 0, 0, 0, 4, 255, 0, 0), fd.deps);
  for (const badEnd of [
    makeType3Buf({ instId: 'badend1', tool: 0, length: 22 }),
    makeType3Buf({ instId: 'badend1', tool: 0, length: 24 }),
    makeType3Buf({ instId: 'badend1', tool: 0, length: 26 }),
    makeType3Buf({ instId: 'badend1', tool: 0, length: 28 }),
    makeType3Buf({ instId: 'badend1', tool: 2, length: 27 }),
    makeType3Buf({ instId: 'badend1', tool: 8, length: 27 }),
    makeType3Buf({ instId: 'badend1', tool: 9, length: 27 }),
    makeType3Buf({ instId: '', tool: 0, length: 27 })
  ]) {
    fd.broadcasts.length = 0;
    fd.ioEmits.length = 0;
    const prevHist = fd.room.gameState.drawHistory.length;
    handleDrawBinary(fd.mockSocket, badEnd, fd.deps);
    check(
      fd.broadcasts.length === 0 && fd.ioEmits.length === 0 && fd.room.gameState.drawHistory.length === prevHist,
      `Free Draw: Type 3 rejects malformed packet (len=${badEnd.length}, tool=${badEnd[8]})`
    );
    check(handleFreeDrawEnd(fd.room, fd.socketId, badEnd, () => {}) === null, `Direct handleFreeDrawEnd rejects (len=${badEnd.length}, tool=${badEnd[8]})`);
  }
  stopManagerTimer(fd.rm);

  // Normal mode Type 3 (23B & 27B preserved, invalid rejected)
  const norm = makeSpySetup({ isFreeDraw: false, isExperimental: false });
  handleDrawBinary(norm.mockSocket, createType1Buffer('nend001', 0, 0, 0, 0, 4, 255, 0, 0), norm.deps);
  norm.broadcasts.length = 0;
  const normHist = norm.room.gameState.drawHistory.length;
  handleDrawBinary(norm.mockSocket, makeType3Buf({ instId: 'nend001', tool: 0, length: 23 }), norm.deps);
  check(
    norm.broadcasts.length === 1 && norm.room.gameState.drawHistory.length === normHist + 1,
    'Normal: Type 3 23B valid pencil end records & broadcasts'
  );
  norm.broadcasts.length = 0;
  handleDrawBinary(norm.mockSocket, makeType3Buf({ instId: 'nend001', tool: 2, length: 27 }), norm.deps);
  handleDrawBinary(norm.mockSocket, makeType3Buf({ instId: 'nend001', tool: 0, length: 28 }), norm.deps);
  check(
    norm.broadcasts.length === 0 && norm.room.gameState.drawHistory.length === normHist + 1,
    'Normal: Type 3 rejects bucket tool 2 and 28B trailing packet'
  );
  stopManagerTimer(norm.rm);
}

// -----------------------------------------------------------------
// 5. Type 5 (DRAW_CLEAR) & Type 6 (DRAW_CANCEL) Validation
// -----------------------------------------------------------------
console.log('\n--- 5. Type 5 (DRAW_CLEAR) & Type 6 (DRAW_CANCEL) Validation ---');
{
  // Type 5 allows empty all-zero instId ("") AND valid non-empty instId at exact 8B
  for (const mode of [
    { name: 'Free Draw', opts: { isFreeDraw: true, isExperimental: false } },
    { name: 'Normal', opts: { isFreeDraw: false, isExperimental: false } }
  ]) {
    const setup = makeSpySetup(mode.opts);

    // Production DrawingCanvasCore.tsx:2100/2119 emits encodeBinaryDrawMessage('draw_clear', {}) -> 8 zero-instId bytes
    const emptyClear = Buffer.from(encodeBinaryDrawMessage('draw_clear', {}));
    check(emptyClear.length === 8, 'Production encodeBinaryDrawMessage("draw_clear", {}) produces 8 bytes');
    handleDrawBinary(setup.mockSocket, emptyClear, setup.deps);
    check(
      setup.broadcasts.length === 1 && setup.room.gameState.drawHistory.length === 1,
      `${mode.name}: Type 5 accepts 8B empty all-zero instId (AGENTS.md first-action & DrawingCanvasCore compat)`
    );

    // Non-empty valid Type 5
    setup.broadcasts.length = 0;
    handleDrawBinary(setup.mockSocket, makeControlBuf(5, 'clr0001', 8), setup.deps);
    check(setup.broadcasts.length === 1, `${mode.name}: Type 5 accepts 8B valid non-empty instId`);

    // Invalid Type 5 lengths (7B, 9B, 64B) & malformed instId bytes rejected
    for (const bad5 of [
      makeControlBuf(5, 'clr0001', 7),
      makeControlBuf(5, 'clr0001', 9),
      makeControlBuf(5, 'clr0001', 64),
      makeRawInstBuf(8, 5, [97, 0, 98]),
      makeRawInstBuf(8, 5, [97, 0x01])
    ]) {
      setup.broadcasts.length = 0;
      const hist = setup.room.gameState.drawHistory.length;
      handleDrawBinary(setup.mockSocket, bad5, setup.deps);
      check(
        setup.broadcasts.length === 0 && setup.room.gameState.drawHistory.length === hist,
        `${mode.name}: Type 5 rejects malformed buffer (len=${bad5.length})`
      );
    }

    // Type 6 requires exact 8B and NON-EMPTY valid instId
    // Seed a valid Type 1 first so recordRoomDrawCommand accepts legitimate Type 6
    handleDrawBinary(setup.mockSocket, createType1Buffer('cnl0001', 0, 0, 0, 0, 4, 255, 5, 5), setup.deps);
    setup.broadcasts.length = 0;
    const histBefore6 = setup.room.gameState.drawHistory.length;
    handleDrawBinary(setup.mockSocket, makeControlBuf(6, 'cnl0001', 8), setup.deps);
    check(
      setup.broadcasts.length === 1 && setup.room.gameState.drawHistory.length === histBefore6 + 1,
      `${mode.name}: Type 6 accepts exact 8B with valid non-empty instId`
    );

    for (const bad6 of [
      makeControlBuf(6, '', 8),
      makeControlBuf(6, 'cnl0001', 7),
      makeControlBuf(6, 'cnl0001', 9),
      makeControlBuf(6, 'cnl0001', 32),
      makeRawInstBuf(8, 6, [97, 0xFF])
    ]) {
      setup.broadcasts.length = 0;
      const hist = setup.room.gameState.drawHistory.length;
      handleDrawBinary(setup.mockSocket, bad6, setup.deps);
      check(
        setup.broadcasts.length === 0 && setup.room.gameState.drawHistory.length === hist,
        `${mode.name}: Type 6 rejects invalid buffer (len=${bad6.length})`
      );
    }
    stopManagerTimer(setup.rm);
  }
}

// -----------------------------------------------------------------
// 6. Type 7 (DRAW_UNDO) & Type 8 (DRAW_REDO) Mode-Specific Rules
// -----------------------------------------------------------------
console.log('\n--- 6. Type 7 (DRAW_UNDO) & Type 8 (DRAW_REDO) Mode-Specific Rules ---');
{
  // Free Draw (Type 7 = exact 10B + ownership; Type 8 = rejected)
  {
    const fd = makeSpySetup({ isFreeDraw: true });
    fd.rm.registerDrawingIdentity(fd.socketId, 'fd00001');
    handleDrawBinary(fd.mockSocket, createType1Buffer('fd00001', 0, 0, 0, 0, 4, 255, 10, 10), fd.deps);
    handleDrawBinary(fd.mockSocket, makeType3Buf({ instId: 'fd00001', tool: 0, length: 27, strokeId: 3 }), fd.deps);

    const histAfterCommit = fd.room.gameState.drawHistory.length;
    for (const badFdUndo of [
      makeControlBuf(7, 'fd00001', 8),
      makeControlBuf(7, 'fd00001', 9),
      makeControlBuf(7, 'fd00001', 11),
      makeControlBuf(7, 'fd00001', 64),
      makeControlBuf(7, '', 10)
    ]) {
      fd.ioEmits.length = 0;
      handleDrawBinary(fd.mockSocket, badFdUndo, fd.deps);
      check(
        fd.ioEmits.length === 0 && fd.room.gameState.drawHistory.length === histAfterCommit,
        `Free Draw: Type 7 rejects invalid length/instId (len=${badFdUndo.length})`
      );
    }

    // Valid 10B FD undo succeeds
    const validFdUndo = Buffer.from(encodeBinaryDrawMessage('draw_undo', { instanceId: 'fd00001', strokeId: 3 }));
    fd.ioEmits.length = 0;
    handleDrawBinary(fd.mockSocket, validFdUndo, fd.deps);
    check(
      fd.ioEmits.length === 1 && fd.ioEmits[0].payload[0] === 7 && fd.room.gameState.drawHistory.length === 0,
      'Free Draw: Valid 10B Type 7 performs targeted stroke undo'
    );

    // Type 8 always rejected in Free Draw
    fd.ioEmits.length = 0;
    handleDrawBinary(fd.mockSocket, makeControlBuf(8, 'fd00001', 8), fd.deps);
    check(fd.ioEmits.length === 0, 'Free Draw: Type 8 redo remains rejected');
    stopManagerTimer(fd.rm);
  }

  // Experimental (Type 7 = exact 10B; Type 8 = rejected)
  {
    const exp = makeSpySetup({ isExperimental: true });
    handleDrawBinary(exp.mockSocket, createType1Buffer('exp0002', 0, 0, 0, 0, 4, 255, 10, 10), exp.deps);
    handleDrawBinary(exp.mockSocket, makeType3Buf({ instId: 'exp0002', tool: 0, length: 27, strokeId: 8 }), exp.deps);

    exp.ioEmits.length = 0;
    handleDrawBinary(exp.mockSocket, makeControlBuf(7, 'exp0002', 8), exp.deps);
    handleDrawBinary(exp.mockSocket, makeControlBuf(7, 'exp0002', 11), exp.deps);
    check(exp.ioEmits.length === 0, 'Experimental: Type 7 rejects 8B and 11B packets');

    const validExpUndo = Buffer.from(encodeBinaryDrawMessage('draw_undo', { instanceId: 'exp0002', strokeId: 8 }));
    handleDrawBinary(exp.mockSocket, validExpUndo, exp.deps);
    check(exp.ioEmits.length === 1 && exp.room.gameState.drawHistory.length === 0, 'Experimental: Valid 10B Type 7 undoes stroke');

    exp.ioEmits.length = 0;
    handleDrawBinary(exp.mockSocket, makeControlBuf(8, 'exp0002', 8), exp.deps);
    check(exp.ioEmits.length === 0, 'Experimental: Type 8 redo remains rejected');
    stopManagerTimer(exp.rm);
  }

  // Normal / Competitive (Type 7 = exact 8B; Type 8 = exact 8B)
  {
    const norm = makeSpySetup({ isFreeDraw: false, isExperimental: false });
    handleDrawBinary(norm.mockSocket, createType1Buffer('nrm0002', 0, 0, 0, 0, 4, 255, 10, 10), norm.deps);
    handleDrawBinary(norm.mockSocket, Buffer.from(encodeBinaryDrawMessage('draw_action', { instanceId: 'nrm0002', tool: 'bucket', color: '#ff0000', opacity: 1, x: 0.5, y: 0.5 })), norm.deps);

    const histBeforeUndo = norm.room.gameState.drawHistory.length;
    for (const badNormUndo of [
      makeControlBuf(7, 'nrm0002', 7),
      makeControlBuf(7, 'nrm0002', 9),
      makeControlBuf(7, 'nrm0002', 10),
      makeControlBuf(7, 'nrm0002', 20),
      makeControlBuf(7, '', 8)
    ]) {
      norm.ioEmits.length = 0;
      handleDrawBinary(norm.mockSocket, badNormUndo, norm.deps);
      check(
        norm.ioEmits.length === 0 && norm.room.gameState.drawHistory.length === histBeforeUndo,
        `Normal: Type 7 rejects invalid length/instId (len=${badNormUndo.length})`
      );
    }

    // Valid 8B Normal undo
    const validNormUndo = Buffer.from(encodeBinaryDrawMessage('draw_undo', { instanceId: 'nrm0002' }));
    check(validNormUndo.length === 8, 'Production encodeBinaryDrawMessage("draw_undo", {instanceId}) emits 8B in Normal mode');
    norm.ioEmits.length = 0;
    handleDrawBinary(norm.mockSocket, validNormUndo, norm.deps);
    check(
      norm.ioEmits.length === 1 &&
      norm.room.gameState.drawHistory.length === histBeforeUndo - 1 &&
      norm.room.gameState.redoStack.length === 1,
      'Normal: Valid 8B Type 7 triggers global undo and populates redoStack'
    );

    // Invalid Type 8 redo lengths/instId rejected
    for (const badNormRedo of [
      makeControlBuf(8, 'nrm0002', 7),
      makeControlBuf(8, 'nrm0002', 9),
      makeControlBuf(8, 'nrm0002', 16),
      makeControlBuf(8, '', 8)
    ]) {
      norm.ioEmits.length = 0;
      handleDrawBinary(norm.mockSocket, badNormRedo, norm.deps);
      check(
        norm.ioEmits.length === 0 && norm.room.gameState.redoStack.length === 1,
        `Normal: Type 8 rejects invalid length/instId (len=${badNormRedo.length})`
      );
    }

    // Valid 8B Normal redo
    norm.ioEmits.length = 0;
    handleDrawBinary(norm.mockSocket, makeControlBuf(8, 'nrm0002', 8), norm.deps);
    check(
      norm.ioEmits.length === 1 &&
      norm.room.gameState.drawHistory.length === histBeforeUndo &&
      norm.room.gameState.redoStack.length === 0,
      'Normal: Valid 8B Type 8 triggers global redo cleanly'
    );

    stopManagerTimer(norm.rm);
  }
}

console.log('\n====================================================');
console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
if (failCount === 0) {
  console.log('🎉 ALL PHASE 9A SLICE 2 TESTS PASSED!');
  console.log('====================================================');
  process.exit(0);
} else {
  console.error('❌ PHASE 9A SLICE 2 TESTS FAILED!');
  console.log('====================================================');
  process.exit(1);
}

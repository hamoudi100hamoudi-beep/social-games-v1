import {
  DrawRateLimiter,
  DEFAULT_DRAW_MAX_PACKETS,
  DEFAULT_DRAW_PACKET_REFILL_PER_SEC,
  DEFAULT_DRAW_MAX_WORK_UNITS,
  DEFAULT_DRAW_WORK_REFILL_PER_SEC
} from '../server/drawRateLimit.js';
import { handleDrawBinary } from '../server/registerDrawBinaryHandler.js';
import { RoomManager, createType1Buffer, createType2Buffer } from '../server/rooms.js';
import { encodeBinaryDrawMessage, decodeBinaryDrawMessage } from '../src/utils/drawBinaryHelper.js';

console.log('==================================================================');
console.log('🛡️  PHASE 9A — SLICE 5A: DRAW_BINARY RESOURCE PROTECTION SUITE');
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

function makeRawType3(instId: string, tool = 0, strokeId = 1): Buffer {
  const buf = Buffer.alloc(27);
  buf.writeUInt8(3, 0);
  buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  buf.writeUInt8(tool, 8);
  buf.writeUInt8(0x11, 9);
  buf.writeUInt8(0x22, 10);
  buf.writeUInt8(0x33, 11);
  buf.writeUInt8(4, 12);
  buf.writeUInt8(100, 13);
  buf.writeInt16LE(1000, 14);
  buf.writeInt16LE(1000, 16);
  buf.writeInt16LE(2000, 18);
  buf.writeInt16LE(2000, 20);
  buf.writeUInt8(0, 22);
  buf.writeUInt16LE(strokeId & 0xffff, 23);
  buf.writeUInt16LE(5 & 0xffff, 25);
  return buf;
}

function makeRawType4(instId: string, strokeId = 1): Buffer {
  const buf = Buffer.alloc(23);
  buf.writeUInt8(4, 0);
  buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  buf.writeUInt8(2, 8); // bucket
  buf.writeUInt8(0xaa, 9);
  buf.writeUInt8(0xbb, 10);
  buf.writeUInt8(0xcc, 11);
  buf.writeUInt8(100, 12);
  buf.writeUInt16LE(5000, 13);
  buf.writeUInt16LE(5000, 15);
  buf.writeUInt8(255, 17);
  buf.writeUInt8(255, 18);
  buf.writeUInt8(255, 19);
  buf.writeUInt8(255, 20);
  buf.writeUInt16LE(strokeId & 0xffff, 21);
  return buf;
}

function makeRawType5(instId = ''): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeUInt8(5, 0);
  if (instId) buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  return buf;
}

function makeRawType9(instId: string, pointsLength: number, tool = 0, withStrokeId = true, strokeId = 1): Buffer {
  const len = 16 + pointsLength * 4 + (withStrokeId ? 2 : 0);
  const buf = Buffer.alloc(len);
  buf.writeUInt8(9, 0);
  buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  buf.writeUInt8(tool, 8);
  buf.writeUInt8(10, 9);
  buf.writeUInt8(20, 10);
  buf.writeUInt8(30, 11);
  buf.writeUInt8(4, 12);
  buf.writeUInt8(100, 13);
  buf.writeUInt16LE(pointsLength & 0xffff, 14);
  for (let i = 0; i < pointsLength; i++) {
    buf.writeInt16LE((i * 7) % 10000, 16 + i * 4);
    buf.writeInt16LE((i * 5) % 10000, 18 + i * 4);
  }
  if (withStrokeId) {
    buf.writeUInt16LE(strokeId & 0xffff, 16 + pointsLength * 4);
  }
  return buf;
}

function makeType13(instId: string, count: number): Buffer {
  const moves: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    moves.push({
      x: ((1000 + i * 3) % 9000) / 10000,
      y: ((1000 + i * 2) % 9000) / 10000
    });
  }
  const ab = encodeBinaryDrawMessage('draw_move_compressed', {
    instanceId: instId,
    moves
  });
  return Buffer.from(ab);
}

function setupModeRoom(mode: 'normal' | 'freedraw' | 'experimental') {
  const roomEmits: { event: string; payload: any }[] = [];
  const broadcasts: { event: string; payload: any; volatile?: boolean }[] = [];
  const socketEmits: Record<string, { event: string; payload: any; volatile?: boolean }[]> = {};

  const createTargetSocket = (id: string) => {
    socketEmits[id] = [];
    const emit = (event: string, payload: any) => socketEmits[id].push({ event, payload, volatile: false });
    return {
      id,
      emit,
      volatile: { emit: (event: string, payload: any) => socketEmits[id].push({ event, payload, volatile: true }) }
    };
  };

  const sDrawer = createTargetSocket('drawer-1');
  const sSpec = createTargetSocket('spec-1');
  const sOtherDrawer = createTargetSocket('drawer-2');

  const socketsMap = new Map<string, any>([
    ['drawer-1', sDrawer],
    ['drawer-2', sOtherDrawer],
    ['spec-1', sSpec]
  ]);
  const roomId = `room-${mode}`;
  const roomSet = new Set(['drawer-1', 'drawer-2', 'spec-1']);

  const mockIo: any = {
    to: (_rid: string) => ({
      emit: (event: string, payload: any) => roomEmits.push({ event, payload })
    }),
    sockets: {
      sockets: socketsMap,
      adapter: { rooms: new Map([[roomId, roomSet]]) }
    }
  };

  const rm = new RoomManager();
  rm.setIo(mockIo);
  rm.setClientCapabilities('drawer-1', { supportsType13: true });
  rm.setClientCapabilities('drawer-2', { supportsType13: true });
  rm.setClientCapabilities('spec-1', { supportsType13: true });

  const player1: any = {
    id: 'drawer-1',
    persistentId: 'p-drawer-1',
    name: 'Drawer 1',
    roomId,
    score: 0,
    hasGuessed: false,
    isOffline: false
  };
  const player2: any = {
    id: 'drawer-2',
    persistentId: 'p-drawer-2',
    name: 'Drawer 2',
    roomId,
    score: 0,
    hasGuessed: false,
    isOffline: false
  };
  const spec: any = {
    id: 'spec-1',
    persistentId: 'p-spec-1',
    name: 'Spectator 1',
    roomId,
    score: 0,
    hasGuessed: false,
    isOffline: false
  };

  (rm as any).players.set('drawer-1', player1);
  (rm as any).players.set('drawer-2', player2);
  (rm as any).players.set('spec-1', spec);

  const roomObj: any = {
    id: roomId,
    isFreeDraw: mode === 'freedraw',
    isExperimental: mode === 'experimental',
    players: [player1, player2, spec],
    activeDrawers: mode === 'freedraw' ? ['p-drawer-1', 'p-drawer-2'] : [],
    drawingIdentities: {
      u000001: { socketId: 'drawer-1', playerName: 'Drawer 1' },
      u000002: { socketId: 'drawer-2', playerName: 'Drawer 2' }
    },
    freeDrawStrokes: new Map(),
    freeDrawCanonicalCache: new Map(),
    gameState: {
      status: 'DRAWING',
      currentDrawerId: 'p-drawer-1',
      drawHistory: [],
      redoStack: [],
      isDrawingActive: false
    }
  };
  (rm as any).rooms.set(roomId, roomObj);

  const makeSenderSocket = (id: string) => ({
    id,
    broadcast: {
      to: (_rid: string) => ({
        emit: (event: string, payload: any) => broadcasts.push({ event, payload, volatile: false }),
        volatile: { emit: (event: string, payload: any) => broadcasts.push({ event, payload, volatile: true }) }
      })
    }
  });

  return {
    rm,
    mockIo,
    roomId,
    roomObj,
    roomEmits,
    broadcasts,
    socketEmits,
    drawerSocket: makeSenderSocket('drawer-1'),
    drawer2Socket: makeSenderSocket('drawer-2')
  };
}

// =====================================================================
// PART 1: TOKEN BUCKET UNIT & TIMING TESTS (1–8, O(1) BENCHMARK)
// =====================================================================
console.log('--- Part 1: DrawRateLimiter Token Bucket Behavior ---');

// 1. Default thresholds match Slice 5A spec & allow normal drawing traffic
{
  const limiter = new DrawRateLimiter();
  check(
    limiter.maxPackets === 80 &&
      limiter.packetRefillPerSec === 35 &&
      limiter.maxWorkUnits === 524_288 &&
      limiter.workRefillPerSec === 65_536 &&
      DEFAULT_DRAW_MAX_PACKETS === 80 &&
      DEFAULT_DRAW_PACKET_REFILL_PER_SEC === 35 &&
      DEFAULT_DRAW_MAX_WORK_UNITS === 524_288 &&
      DEFAULT_DRAW_WORK_REFILL_PER_SEC === 65_536,
    '1a. Default DrawRateLimiter thresholds equal 80 pkts (35/s) & 524,288 work units (65,536/s)'
  );

  // Simulate 30 seconds of fast continuous drawing (~5 pkts/s Type 13 @ 40 pts = 160 work + periodic auto-splits)
  let t = 10000;
  let allAllowed = true;
  for (let sec = 0; sec < 30; sec++) {
    for (let tick = 0; tick < 5; tick++) {
      if (!limiter.consume('fast-drawer', 160, t)) allAllowed = false;
      t += 200;
    }
    if (sec > 0 && sec % 10 === 0) {
      // Auto-split 3-packet seam
      if (!limiter.consume('fast-drawer', 160, t)) allAllowed = false;
      if (!limiter.consume('fast-drawer', 27, t)) allAllowed = false;
      if (!limiter.consume('fast-drawer', 18, t)) allAllowed = false;
    }
  }
  check(allAllowed, '1b. Normal continuous drawing + periodic auto-split bursts pass with 0 drops over 30s');
}

// 2. Packet burst up to 80 allowed, 81st throttled
{
  const limiter = new DrawRateLimiter();
  const now = 50000;
  let passed = 0;
  for (let i = 0; i < 80; i++) {
    if (limiter.consume('burst-pkt', 18, now)) passed++;
  }
  const pkt81 = limiter.consume('burst-pkt', 18, now);
  check(passed === 80 && pkt81 === false, '2. Instantaneous burst accepts exactly 80 packets and throttles 81st');
}

// 3. Sustained packet flood (> 35 pkt/s) throttled & refills linearly
{
  const limiter = new DrawRateLimiter();
  let now = 100000;
  for (let i = 0; i < 80; i++) limiter.consume('flood-pkt', 8, now);

  // Advance 1000ms -> refills 35 packets (not 80)
  now += 1000;
  let acceptedAfter1s = 0;
  for (let i = 0; i < 50; i++) {
    if (limiter.consume('flood-pkt', 8, now)) acceptedAfter1s++;
  }
  check(acceptedAfter1s === 35, `3. Sustained flood after 1s refills exactly 35 packets (got ${acceptedAfter1s})`);
}

// 4 & 5. Byte/work burst <= 524,288, atomic rejection, and sustained 64 KiB/s refill
{
  const limiter = new DrawRateLimiter();
  let now = 200000;
  // Two 262,158 B Type 9 packets = 524,316 B (> 524,288), so first passes and second fails atomically!
  const firstBig = limiter.consume('big-byte', 262_158, now);
  const stateAfterFirst = limiter.getSocketState('big-byte');
  const pktTokensBeforeReject = stateAfterFirst?.packetTokens;
  const workTokensBeforeReject = stateAfterFirst?.workTokens;

  const secondBig = limiter.consume('big-byte', 262_158, now);
  const stateAfterReject = limiter.getSocketState('big-byte');
  const atomicUnchanged =
    stateAfterReject?.packetTokens === pktTokensBeforeReject &&
    stateAfterReject?.workTokens === workTokensBeforeReject;

  // Smaller packet fitting remaining 262,130 work units still succeeds!
  const fittingThird = limiter.consume('big-byte', 262_000, now);

  check(
    firstBig === true && secondBig === false && atomicUnchanged && fittingThird === true,
    '4. Work-unit burst (524,288) allows 262,158 B Type 9 and rejects overflow atomically without leaking packetTokens'
  );

  // Drain remainder and test 1s refill = 65,536 work units (5x 12,000 passes = 60,000, 6th 12,000 fails -> 72,000 > 65,536)
  limiter.consume('big-byte', 130, now);
  now += 1000;
  let bigMovesAfter1s = 0;
  for (let i = 0; i < 10; i++) {
    if (limiter.consume('big-byte', 12000, now)) bigMovesAfter1s++;
  }
  check(
    bigMovesAfter1s === 5,
    `5. Sustained byte/work flood refills exactly 65,536 units/s (accepted ${bigMovesAfter1s}x 12,000-unit blocks)`
  );
}

// 6. Independent budgets per socket
{
  const limiter = new DrawRateLimiter();
  const now = 300000;
  for (let i = 0; i < 100; i++) limiter.consume('abuser-sock', 12000, now);
  const abuserBlocked = limiter.consume('abuser-sock', 12000, now);
  const healthyAllowed = limiter.consume('healthy-sock', 12000, now);
  check(!abuserBlocked && healthyAllowed, '6. Flooding one socket never impacts another socket bucket');
}

// 7 & 8. Immediate disconnect cleanup & fresh state on reconnect with new socketId + O(1) clock regression safety
{
  const limiter = new DrawRateLimiter();
  for (let i = 0; i < 1000; i++) {
    limiter.consume(`ephemeral-${i}`, 12000, 1000);
    limiter.cleanupSocket(`ephemeral-${i}`);
  }
  check(limiter.getTrackedSocketCount() === 0, '7. cleanupSocket immediately releases map memory across 1,000 cycles');

  limiter.consume('old-sock', 524_288, 1000);
  const oldDepleted = limiter.consume('old-sock', 18, 1000);
  limiter.cleanupSocket('old-sock');
  const reconnectedOk = limiter.consume('new-sock', 262_158, 1000);
  // Regression clock check
  const backClockOk = limiter.consume('new-sock', 18, 500);
  check(
    !oldDepleted && reconnectedOk && backClockOk && limiter.getTrackedSocketCount() === 1,
    '8. Reconnecting with new socket.id starts with fresh bucket; regressed clock stays non-negative'
  );
}

// =====================================================================
// PART 2: HANDLER INTEGRATION TESTS (9–17)
// =====================================================================
console.log('\n--- Part 2: Handler & RoomManager Integration Tests ---');

// 9 & 10. Type 13 single decode, zero decode on throttled packets, invalid Type 13 pre-bucket rejection
{
  const { rm, mockIo, drawerSocket, roomId } = setupModeRoom('freedraw');
  try {
    let clock = 500000;
    const limiter = new DrawRateLimiter();
    let decodeAttempts = 0;
    const origHandleCompressed = rm.handleFreeDrawMoveCompressed.bind(rm);
    (rm as any).handleFreeDrawMoveCompressed = (rId: string, sId: string, b: Buffer) => {
      decodeAttempts++;
      return origHandleCompressed(rId, sId, b);
    };

    // Start active stroke
    handleDrawBinary(drawerSocket, createType1Buffer('u000001', 0, 10, 20, 30, 4, 100, 1000, 1000), {
      io: mockIo,
      roomManager: rm,
      drawRateLimiter: limiter,
      now: () => clock
    });

    // Malformed Type 13 headers (count > 3000, <10 B, empty trailing >10 B, non-empty <=10 B) MUST reject BEFORE consuming tokens
    const badCount = makeType13('u000001', 5);
    badCount.writeUInt16LE(3001, 8);
    const badShort = Buffer.from([13, 117, 49]);
    const badZeroTrailing = Buffer.alloc(12);
    badZeroTrailing[0] = 13;
    badZeroTrailing.write('u000001', 1, 7, 'ascii');
    badZeroTrailing.writeUInt16LE(0, 8);
    const badNoPayload = Buffer.alloc(10);
    badNoPayload[0] = 13;
    badNoPayload.write('u000001', 1, 7, 'ascii');
    badNoPayload.writeUInt16LE(5, 8);

    const pktBeforeBad = limiter.getSocketState('drawer-1')!.packetTokens;
    for (const bad of [badCount, badShort, badZeroTrailing, badNoPayload]) {
      handleDrawBinary(drawerSocket, bad, { io: mockIo, roomManager: rm, drawRateLimiter: limiter, now: () => clock });
    }
    const pktAfterBad = limiter.getSocketState('drawer-1')!.packetTokens;
    check(
      decodeAttempts === 0 && pktBeforeBad === pktAfterBad,
      '10. Malformed Type 13 headers reject before token deduction and before decodeType13BufferSafely'
    );

    // One valid Type 13 decodes strictly once
    const validSmallT13 = makeType13('u000001', 10);
    handleDrawBinary(drawerSocket, validSmallT13, {
      io: mockIo,
      roomManager: rm,
      drawRateLimiter: limiter,
      now: () => clock
    });
    check(decodeAttempts === 1, `9a. Valid Type 13 executes single decode path (decodeAttempts=${decodeAttempts})`);

    // Now spam high-point Type 13 (1,500 pts = 6,000 work units each; max 524,288 fits ~87 packets -> packet limit 80 hits first)
    // Wait: use 3,000-pt Type 13 (= 12,000 work units each -> exhausts 524,288 work budget in ~43 packets!)
    const bigT13 = makeType13('u000001', 2900); // workCost = 11,600 (since p0 already 1, 2900*4 = 11600 -> 1st accepted puts pts=2901, 2nd triggers 3000-pt abort! So test work exhaustion in a separate fresh stroke with 2,500-pt chunks or start-less? No! Wait: once stroke is aborted on 2nd 2900-pt packet, subsequent packets fail stroke lookup unless Type 1 resets stroke, OR test Type 13 work flood cleanly by starting 200-pt valid strokes or testing 45x 2900-pt on fresh strokes? Better: test 1 Type 13 flood directly bypassing 3,000 stroke limit by calling 50x across 50 strokes OR test Type 13 count=3000 workCost calculation!)
    // Actually: let's drain work budget explicitly with 1 valid 262,158 Type 9 first (or repeated 2,500-pt Type 13 starts), wait: in Canonical mode a 262,158 Type 9 is >3000 pts so rejected by header; max Canonical Type 9 is 12,018 B (43x fits 524,288). Even simpler: flood Type 1 + Type 13(2900 pts) pairs! Wait: 40 pairs = 80 packets, or 45x (Type 1 + Type 13(2900) = 11,618 units -> 45th hits 524,288 BEFORE packet limit? Wait: 45 pairs = 90 packets > 80!).
    // With 3,000-pt max (12,000 work units), work limit (524,288) hits after 43 packets ONLY if packets >= 44; since maxPackets is 80, single-socket 44x Type 13(3000) packets = 44 packets (< 80!) and 44 * 12,000 = 528,000 (> 524,288)!
    // Let's verify that by resetting stroke via room.freeDrawStrokes on a 2-part batch or calling handleDrawBinary with 45 strokes using remaining packet budget in a dedicated test!
    void roomId;
  } finally {
    stopManagerTimer(rm);
  }
}

// 9b. Dedicated Type 13 Decode-Flood Work-Budget Exhaustion (exhausts work budget at pkt #44 BEFORE 80 pkt cap!)
{
  const { rm, mockIo, drawerSocket, roomObj } = setupModeRoom('freedraw');
  try {
    const limiter = new DrawRateLimiter();
    let decodeAttempts = 0;
    const origHandleCompressed = rm.handleFreeDrawMoveCompressed.bind(rm);
    (rm as any).handleFreeDrawMoveCompressed = (rId: string, sId: string, b: Buffer) => {
      decodeAttempts++;
      return origHandleCompressed(rId, sId, b);
    };

    const bigT13 = makeType13('u000001', 3000); // workCost = 12,000 units per packet
    // Ensure active stroke won't abort for point count during this flood by refreshing points to 1 between moves
    let rejectedCount = 0;
    for (let i = 0; i < 60; i++) {
      if (i === 0) {
        handleDrawBinary(drawerSocket, createType1Buffer('u000001', 0, 0, 0, 0, 4, 100, 100, 100), {
          io: mockIo,
          roomManager: rm,
          drawRateLimiter: limiter,
          now: () => 600000
        });
      }
      const st = roomObj.freeDrawStrokes.get('drawer-1_u000001');
      if (st) st.points = [{ x: 100, y: 100 }];

      const beforeDecodes = decodeAttempts;
      handleDrawBinary(drawerSocket, bigT13, {
        io: mockIo,
        roomManager: rm,
        drawRateLimiter: limiter,
        now: () => 600000
      });
      if (decodeAttempts === beforeDecodes) {
        rejectedCount++;
      }
    }

    // 1 Type 1 (18) + 43 * Type 13(12,000) = 516,018 <= 524,288 -> 44th Type 13 wants +12,000 (= 528,018 > 524,288) -> throttled by WORK limit!
    // Wait: when 44th Type 13 is throttled, active stroke is aborted -> remaining 16 packets also never decodeType13!
    check(
      decodeAttempts === 43 && rejectedCount === 17,
      `9b. Type 13 work-budget exhaustion stops decode at packet #44 (before 80-pkt limit) with 0 decodes on rejected packets (decoded=${decodeAttempts}, skipped=${rejectedCount})`
    );
    check(
      !roomObj.freeDrawStrokes.has('drawer-1_u000001'),
      '9c. Active canonical stroke aborted & deleted immediately upon work-budget rejection'
    );
  } finally {
    stopManagerTimer(rm);
  }
}

// 11. Large legitimate Normal-mode 65,535-pt Type 9 (262,158 B) passes cleanly
{
  const { rm, mockIo, drawerSocket, broadcasts, roomObj } = setupModeRoom('normal');
  try {
    const limiter = new DrawRateLimiter();
    const maxNormalType9 = makeRawType9('u000001', 65535, 0, true, 99);
    check(maxNormalType9.length === 262_158, '11a. Built exact 262,158-byte 65,535-pt Normal Type 9 packet');

    handleDrawBinary(drawerSocket, maxNormalType9, {
      io: mockIo,
      roomManager: rm,
      drawRateLimiter: limiter,
      now: () => 700000
    });

    check(
      roomObj.gameState.drawHistory.length === 1 && broadcasts.length === 1,
      '11b. Large legitimate Normal 65,535-pt Type 9 (262,158 B) passes rate limiter and records/broadcasts cleanly'
    );
  } finally {
    stopManagerTimer(rm);
  }
}

// 12. Normal Type 1 -> Type 13 -> Type 3 Canonical & Type 1 -> Type 2 -> Type 3 Normal lifecycles
{
  const fd = setupModeRoom('freedraw');
  const norm = setupModeRoom('normal');
  try {
    const limA = new DrawRateLimiter();
    handleDrawBinary(fd.drawerSocket, createType1Buffer('u000001', 0, 1, 2, 3, 4, 100, 100, 100), {
      io: fd.mockIo,
      roomManager: fd.rm,
      drawRateLimiter: limA,
      now: () => 800000
    });
    handleDrawBinary(fd.drawerSocket, makeType13('u000001', 5), {
      io: fd.mockIo,
      roomManager: fd.rm,
      drawRateLimiter: limA,
      now: () => 800200
    });
    handleDrawBinary(fd.drawerSocket, makeRawType3('u000001', 0, 12), {
      io: fd.mockIo,
      roomManager: fd.rm,
      drawRateLimiter: limA,
      now: () => 800400
    });
    const lastRoomEmit = fd.roomEmits[fd.roomEmits.length - 1];
    const decCommit = lastRoomEmit ? decodeBinaryDrawMessage(lastRoomEmit.payload) : null;
    check(
      decCommit?.event === 'draw_commit' &&
        fd.roomObj.gameState.drawHistory.length === 1 &&
        fd.roomObj.gameState.drawHistory[0]?.data?.[0] === 9,
      '12a. Canonical Type 1 -> Type 13 -> Type 3 commits cleanly with Type 11 commit and consolidated Type 9'
    );

    const limB = new DrawRateLimiter();
    handleDrawBinary(norm.drawerSocket, createType1Buffer('u000001', 0, 1, 2, 3, 4, 100, 100, 100), {
      io: norm.mockIo,
      roomManager: norm.rm,
      drawRateLimiter: limB,
      now: () => 800000
    });
    handleDrawBinary(norm.drawerSocket, createType2Buffer('u000001', [{ x: 150, y: 150 }]), {
      io: norm.mockIo,
      roomManager: norm.rm,
      drawRateLimiter: limB,
      now: () => 800200
    });
    handleDrawBinary(norm.drawerSocket, makeRawType3('u000001', 0, 12), {
      io: norm.mockIo,
      roomManager: norm.rm,
      drawRateLimiter: limB,
      now: () => 800400
    });
    check(
      norm.roomObj.gameState.drawHistory.length === 3 && norm.roomObj.gameState.isDrawingActive === false,
      '12b. Normal Type 1 -> Type 2 -> Type 3 records and completes cleanly'
    );
  } finally {
    stopManagerTimer(fd.rm);
    stopManagerTimer(norm.rm);
  }
}

// 13a. Canonical throttled mid-stroke (Type 13) & post-release (Type 3) emit ONE Type 12 abort with zero ghost strokes
for (const mode of ['freedraw', 'experimental'] as const) {
  const ctx = setupModeRoom(mode);
  try {
    const smallBurstLimiter = new DrawRateLimiter({ maxPackets: 2, packetRefillPerSec: 1 });
    // Pkt 1: Type 1 start -> accepted
    handleDrawBinary(ctx.drawerSocket, createType1Buffer('u000001', 0, 0, 0, 0, 4, 100, 500, 500), {
      io: ctx.mockIo,
      roomManager: ctx.rm,
      drawRateLimiter: smallBurstLimiter,
      now: () => 900000
    });
    // Pkt 2: Type 13 move -> accepted
    handleDrawBinary(ctx.drawerSocket, makeType13('u000001', 3), {
      io: ctx.mockIo,
      roomManager: ctx.rm,
      drawRateLimiter: smallBurstLimiter,
      now: () => 900000
    });
    // Pkts 3..10: Flooded Type 13 moves -> MUST emit Type 12 abort ONCE, delete active stroke, and never commit to drawHistory
    for (let i = 0; i < 8; i++) {
      handleDrawBinary(ctx.drawerSocket, makeType13('u000001', 3), {
        io: ctx.mockIo,
        roomManager: ctx.rm,
        drawRateLimiter: smallBurstLimiter,
        now: () => 900000
      });
    }
    const aborts = ctx.roomEmits
      .map(e => decodeBinaryDrawMessage(e.payload))
      .filter(d => d?.event === 'draw_abort');

    check(
      aborts.length === 1 &&
        aborts[0]?.data.instanceId === 'u000001' &&
        aborts[0]?.data.strokeId === 0 &&
        ctx.roomObj.freeDrawStrokes.size === 0 &&
        ctx.roomObj.gameState.drawHistory.length === 0,
      `13a (${mode}). Throttled Type 13 emits exactly 1 Type 12 abort (strokeId=0), deletes active stroke, zero ghost history`
    );

    // Pkt on Type 3 end rejection carries abort strokeId!
    const ctx2 = setupModeRoom(mode);
    try {
      const lim3 = new DrawRateLimiter({ maxPackets: 1, packetRefillPerSec: 1 });
      handleDrawBinary(ctx2.drawerSocket, createType1Buffer('u000001', 0, 0, 0, 0, 4, 100, 500, 500), {
        io: ctx2.mockIo,
        roomManager: ctx2.rm,
        drawRateLimiter: lim3,
        now: () => 905000
      });
      // Throttled Type 3 (strokeId=42) -> must emit ONE Type 12 with strokeId=42 (Case 2 client rollback!)
      handleDrawBinary(ctx2.drawerSocket, makeRawType3('u000001', 0, 42), {
        io: ctx2.mockIo,
        roomManager: ctx2.rm,
        drawRateLimiter: lim3,
        now: () => 905000
      });
      handleDrawBinary(ctx2.drawerSocket, makeRawType3('u000001', 0, 42), {
        io: ctx2.mockIo,
        roomManager: ctx2.rm,
        drawRateLimiter: lim3,
        now: () => 905000
      });
      const endAborts = ctx2.roomEmits
        .map(e => decodeBinaryDrawMessage(e.payload))
        .filter(d => d?.event === 'draw_abort');
      check(
        endAborts.length === 1 &&
          endAborts[0]?.data.strokeId === 42 &&
          ctx2.roomObj.freeDrawStrokes.size === 0 &&
          ctx2.roomObj.gameState.drawHistory.length === 0,
        `13b (${mode}). Throttled Type 3 emits exactly 1 Type 12 abort with matching strokeId=42`
      );
    } finally {
      stopManagerTimer(ctx2.rm);
    }
  } finally {
    stopManagerTimer(ctx.rm);
  }
}

// 13c. Normal mode throttled movement resets isDrawingActive = false and emits ONE Type 12 abort
{
  const norm = setupModeRoom('normal');
  try {
    const lim = new DrawRateLimiter({ maxPackets: 1, packetRefillPerSec: 1 });
    handleDrawBinary(norm.drawerSocket, createType1Buffer('u000001', 0, 0, 0, 0, 4, 100, 100, 100), {
      io: norm.mockIo,
      roomManager: norm.rm,
      drawRateLimiter: lim,
      now: () => 910000
    });
    const historyCountAfterStart = norm.roomObj.gameState.drawHistory.length;
    const broadcastsAfterStart = norm.broadcasts.length;

    for (let i = 0; i < 5; i++) {
      handleDrawBinary(norm.drawerSocket, createType2Buffer('u000001', [{ x: 200, y: 200 }]), {
        io: norm.mockIo,
        roomManager: norm.rm,
        drawRateLimiter: lim,
        now: () => 910000
      });
    }
    const normAborts = norm.roomEmits
      .map(e => decodeBinaryDrawMessage(e.payload))
      .filter(d => d?.event === 'draw_abort');

    check(
      norm.roomObj.gameState.isDrawingActive === false &&
        normAborts.length === 1 &&
        norm.roomObj.gameState.drawHistory.length === historyCountAfterStart &&
        norm.broadcasts.length === broadcastsAfterStart,
      '13c (normal). Throttled Type 2 resets isDrawingActive=false, emits 1 Type 12 abort, and drops subsequent flood silently'
    );
  } finally {
    stopManagerTimer(norm.rm);
  }
}

// 14, 15, 16. Zero history/broadcast, zero redoStack mutation, and zero Type 5 clear / other-player interference on throttled ops
{
  const fd = setupModeRoom('freedraw');
  const norm = setupModeRoom('normal');
  try {
    // Seed existing drawing + redoStack
    const existingStroke = makeRawType9('u000002', 2, 0, true, 1);
    fd.rm.recordDrawCommand(fd.roomId, 'draw_binary', existingStroke, 'u000002', 1);
    const sentinelRedo = { event: 'draw_binary', data: Buffer.from([4]) };
    norm.rm.recordDrawCommand(norm.roomId, 'draw_binary', makeRawType4('u000001', 1));
    norm.roomObj.gameState.redoStack = [sentinelRedo];

    // Exhaust drawer-1 budget (1 packet limit)
    const limFD = new DrawRateLimiter({ maxPackets: 1, packetRefillPerSec: 1 });
    handleDrawBinary(fd.drawerSocket, makeRawType4('u000001', 10), {
      io: fd.mockIo,
      roomManager: fd.rm,
      drawRateLimiter: limFD,
      now: () => 950000
    });

    const fdHistBefore = fd.roomObj.gameState.drawHistory.length;
    const fdBcastBefore = fd.broadcasts.length;
    const fdRoomEmitBefore = fd.roomEmits.length;

    // Now drawer-1 floods Type 5 clear, Type 4 bucket, Type 9, Type 7 undo
    for (const pkt of [
      makeRawType5('u000001'),
      makeRawType5(''),
      makeRawType4('u000001', 11),
      makeRawType9('u000001', 2, 3, true, 12)
    ]) {
      handleDrawBinary(fd.drawerSocket, pkt, {
        io: fd.mockIo,
        roomManager: fd.rm,
        drawRateLimiter: limFD,
        now: () => 950000
      });
    }

    // Drawer 2 can STILL draw unaffected!
    const d2Stroke = makeRawType9('u000002', 2, 3, true, 2);
    handleDrawBinary(fd.drawer2Socket, d2Stroke, {
      io: fd.mockIo,
      roomManager: fd.rm,
      drawRateLimiter: limFD,
      now: () => 950000
    });

    check(
      fd.roomObj.gameState.drawHistory.length === fdHistBefore + 1 &&
        fd.broadcasts.length === fdBcastBefore + 1 &&
        fd.roomEmits.length === fdRoomEmitBefore,
      '14 & 16. Throttled Type 5 clear / Type 4 / Type 9 produce zero history or broadcast and never block drawer-2'
    );

    // Verify zero redoStack clearing in Normal mode when Type 4/5/9/10 are throttled
    const limNorm = new DrawRateLimiter({ maxPackets: 1, packetRefillPerSec: 1 });
    // First consume allowed packet without touching redoStack (e.g., valid Type 8? Wait Type 8 mutates redoStack; pass Type 1 on a throwaway socket or set small budget!)
    limNorm.consume('drawer-1', 8, 960000); // exhaust 1 pkt directly on drawer-1
    const normHistBefore = norm.roomObj.gameState.drawHistory.length;
    for (const pkt of [
      makeRawType4('u000001', 5),
      makeRawType5(''),
      makeRawType9('u000001', 2, 0, false),
      Buffer.from([10, 117, 49, 0, 0, 0, 0, 0]) // Type 10 legacy clear
    ]) {
      handleDrawBinary(norm.drawerSocket, pkt, {
        io: norm.mockIo,
        roomManager: norm.rm,
        drawRateLimiter: limNorm,
        now: () => 960000
      });
    }
    check(
      norm.roomObj.gameState.drawHistory.length === normHistBefore &&
        norm.roomObj.gameState.redoStack.length === 1 &&
        norm.roomObj.gameState.redoStack[0] === sentinelRedo,
      '15. AGENTS.md redoStack stays intact when Type 4, Type 5, Type 9, or Type 10 are throttled'
    );
  } finally {
    stopManagerTimer(fd.rm);
    stopManagerTimer(norm.rm);
  }
}

// 17. AGENTS.md first-action invariant preserved under normal limits & O(1) microbenchmark
{
  const norm = setupModeRoom('normal');
  try {
    const limiter = new DrawRateLimiter();
    handleDrawBinary(norm.drawerSocket, makeRawType4('u000001', 1), {
      io: norm.mockIo,
      roomManager: norm.rm,
      drawRateLimiter: limiter,
      now: () => 990000
    });
    check(
      norm.roomObj.gameState.drawHistory.length === 1 && norm.roomObj.gameState.drawHistory[0].data[0] === 4,
      '17a. AGENTS.md first-action Type 4 bucket on empty history preserved within limits'
    );
  } finally {
    stopManagerTimer(norm.rm);
  }

  const benchLimiter = new DrawRateLimiter();
  const tStart = performance.now();
  let t = 1000;
  for (let i = 0; i < 100_000; i++) {
    benchLimiter.consume('bench-sock', 64, t);
    if ((i & 31) === 0) t += 1000;
  }
  const elapsedMs = Math.round((performance.now() - tStart) * 100) / 100;
  check(elapsedMs < 500, `17b. 100,000 O(1) DrawRateLimiter checks complete cleanly (${elapsedMs} ms)`);
}

console.log('\n==================================================================');
console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
console.log('==================================================================');

if (failCount > 0) {
  process.exit(1);
}
process.exit(0);

import assert from 'node:assert/strict';
import { RoomManager } from '../server/rooms.js';
import { handleDrawBinary } from '../server/registerDrawBinaryHandler.js';
import { handleJoinRoom } from '../server/registerJoinRoomHandler.js';
import { handleRequestRoundSync } from '../server/registerRequestRoundSyncHandler.js';
import { DrawRateLimiter } from '../server/drawRateLimit.js';
import { getRoomConfig } from '../src/types/game.js';
import {
  COMPETITIVE_BUCKET_UNDO_LIMIT,
  extractCommandIdentity,
  findCompetitiveUndoTarget,
  getCommandPacketType,
  resolveLockedBoundaryIndex,
} from '../src/utils/competitiveUndoPolicy.js';
import {
  applyCompetitiveSummaryState,
  createInitialCompetitiveBoundaryState,
  normalizeCompetitiveCommands,
  reconcileCompetitiveHistorySync,
} from '../src/utils/competitiveCanvasSyncHelper.js';
import { encodeBinaryDrawMessage, decodeBinaryDrawMessage } from '../src/utils/drawBinaryHelper.js';

let passed = 0;
let failed = 0;

function check(cond: unknown, label: string) {
  if (cond) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${label}`);
    failed++;
    throw new Error(`Assertion failed: ${label}`);
  }
}

function getJsonSafeHistory(history: any[]) {
  return history.map((cmd) => {
    if (cmd && cmd.event === 'draw_binary' && Buffer.isBuffer(cmd.data)) {
      return {
        ...cmd,
        data: cmd.data.buffer.slice(cmd.data.byteOffset, cmd.data.byteOffset + cmd.data.byteLength),
      };
    }
    return cmd;
  });
}

function makeRoomHarness(roomId = 'General #Stage4A') {
  const roomEmits: { roomId: string; event: string; payload: any }[] = [];
  const socketEmits = new Map<string, { event: string; payload: any }[]>();
  const socketsMap = new Map<string, any>();

  const recordSocketEmit = (sockId: string, event: string, payload: any) => {
    if (!socketEmits.has(sockId)) socketEmits.set(sockId, []);
    socketEmits.get(sockId)!.push({ event, payload });
  };

  const mockIo: any = {
    to: (target: string) => ({
      emit: (event: string, payload: any) => {
        if (socketsMap.has(target)) {
          recordSocketEmit(target, event, payload);
        } else {
          roomEmits.push({ roomId: target, event, payload });
        }
      },
    }),
    sockets: {
      adapter: { rooms: new Map<string, Set<string>>() },
      sockets: socketsMap,
    },
  };

  const makeSocket = (id: string) => {
    const broadcasts: { roomId: string; event: string; payload: any }[] = [];
    const sock: any = {
      id,
      join: (_rId: string) => {},
      leave: (_rId: string) => {},
      disconnect: (_close?: boolean) => {},
      emit: (event: string, payload: any) => recordSocketEmit(id, event, payload),
      broadcast: {
        to: (rId: string) => ({
          emit: (event: string, payload: any) => broadcasts.push({ roomId: rId, event, payload }),
          volatile: {
            emit: (event: string, payload: any) => broadcasts.push({ roomId: rId, event, payload }),
          },
        }),
      },
    };
    socketsMap.set(id, sock);
    socketEmits.set(id, []);
    return { sock, broadcasts, emits: socketEmits.get(id)! };
  };

  const rm = new RoomManager();
  rm.setIo(mockIo);
  const drawRateLimiter = new DrawRateLimiter({
    maxPackets: 500,
    maxWorkUnits: 2_000_000,
  });

  const room = rm.createRoom(roomId);
  const drawer = makeSocket('sock-drawer');
  const spectator = makeSocket('sock-spec');

  rm.addPlayerToRoom(roomId, {
    id: drawer.sock.id,
    name: 'Drawer',
    avatar: '🎨',
    roomId,
    score: 0,
    wins: 0,
    persistentId: 'pid-drawer',
    isOffline: false,
  });
  rm.addPlayerToRoom(roomId, {
    id: spectator.sock.id,
    name: 'Spec',
    avatar: '👁️',
    roomId,
    score: 0,
    wins: 0,
    persistentId: 'pid-spec',
    isOffline: false,
  });

  // Register credentials for reconnect test parity
  rm.commitNewJoinCredential('pid-drawer', 'secret_drawer_1234567890');
  rm.commitNewJoinCredential('pid-spec', 'secret_spec_1234567890');

  room.gameState.status = 'DRAWING';
  room.gameState.currentDrawerId = 'pid-drawer';
  room.gameState.currentWord = 'قلم';
  roomEmits.length = 0;
  drawer.emits.length = 0;
  spectator.emits.length = 0;

  return {
    rm,
    room,
    roomId,
    mockIo,
    drawRateLimiter,
    roomEmits,
    socketsMap,
    socketEmits,
    makeSocket,
    drawer,
    spectator,
    deps: { io: mockIo, roomManager: rm, drawRateLimiter, now: () => Date.now() },
  };
}

function cleanupRoomManager(rm: RoomManager) {
  const tick = (rm as any).tickInterval as NodeJS.Timeout | undefined;
  if (tick) clearInterval(tick);
  const ev = (rm as any).evictionTimers as Map<string, NodeJS.Timeout> | undefined;
  ev?.forEach((t) => clearTimeout(t));
  const ph = (rm as any).phaseDeadlineTimers as Map<string, NodeJS.Timeout> | undefined;
  ph?.forEach((t) => clearTimeout(t));
}

function toBuffer(ab: ArrayBuffer): Buffer {
  return Buffer.from(ab);
}

function makeBucket(instId: string, strokeId: number, x = 0.5, y = 0.5, withTargetRGBA = true): Buffer {
  return toBuffer(
    encodeBinaryDrawMessage('draw_action', {
      instanceId: instId,
      tool: 'bucket',
      color: '#FF0000',
      opacity: 1,
      x,
      y,
      strokeId,
      ...(withTargetRGBA ? { targetR: 255, targetG: 255, targetB: 255, targetA: 255 } : {}),
    })
  );
}

function makeShapeStroke(instId: string, strokeId: number, tool: 'line' | 'strokeCircle' | 'fillRect' = 'line'): Buffer {
  return toBuffer(
    encodeBinaryDrawMessage('draw_stroke', {
      instanceId: instId,
      tool,
      color: '#000000',
      width: 4,
      opacity: 1,
      strokeId,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.4, y: 0.4 },
      ],
    })
  );
}

function makeContinuousStroke(
  sock: any,
  deps: any,
  instId: string,
  strokeId: number,
  tool: 'pencil' | 'eraser' = 'pencil'
) {
  const startBuf = toBuffer(
    encodeBinaryDrawMessage('draw_start', {
      instanceId: instId,
      tool,
      color: '#112233',
      width: 5,
      opacity: 1,
      x: 0.2,
      y: 0.2,
    })
  );
  const moveBuf = toBuffer(
    encodeBinaryDrawMessage('draw_move', {
      instanceId: instId,
      moves: [{ x: 0.25, y: 0.25 }],
    })
  );
  const endBuf = toBuffer(
    encodeBinaryDrawMessage('draw_end', {
      instanceId: instId,
      tool,
      color: '#112233',
      width: 5,
      opacity: 1,
      isCancelled: false,
      strokeId,
      expectedPointCount: 2,
    })
  );
  handleDrawBinary(sock, startBuf, deps);
  handleDrawBinary(sock, moveBuf, deps);
  handleDrawBinary(sock, endBuf, deps);
}

function makeUndo(instId: string, strokeId: number): Buffer {
  return toBuffer(encodeBinaryDrawMessage('draw_undo', { instanceId: instId, strokeId }));
}

function makeClear(instId = 'srv0001', type: 5 | 10 = 5): Buffer {
  if (type === 5) {
    return toBuffer(encodeBinaryDrawMessage('draw_clear', { instanceId: instId }));
  }
  const b = Buffer.alloc(8);
  b.writeUInt8(10, 0);
  b.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  return b;
}

function getIds(history: any[]): string[] {
  return history
    .map((c) => extractCommandIdentity(c))
    .filter((id): id is NonNullable<typeof id> => Boolean(id))
    .map((id) => `${id.instanceId}#${id.strokeId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIOS A – Q
// ═══════════════════════════════════════════════════════════════════════════════

console.log('── Scenario A: B1..B3 no lock -> B4 locks B1 -> Undo B4, B3, B2 stops before B1 ──');
{
  const h = makeRoomHarness('General #ScenA');
  const inst = 'drw0001';
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 1), h.deps);
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 2), h.deps);
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 3), h.deps);
  check(
    h.room.gameState.lockedBucketCount === 0 && h.room.gameState.lockedBoundaryTarget === null,
    'A1. B1..B3 do not lock any Bucket'
  );

  handleDrawBinary(h.drawer.sock, makeBucket(inst, 4), h.deps);
  check(
    h.room.gameState.lockedBucketCount === 1 &&
      h.room.gameState.lockedBoundaryTarget?.instanceId === inst &&
      h.room.gameState.lockedBoundaryTarget?.strokeId === 1,
    'A2. B4 advances lockedBucketCount=1 and locks B1'
  );

  handleDrawBinary(h.drawer.sock, makeUndo(inst, 4), h.deps);
  handleDrawBinary(h.drawer.sock, makeUndo(inst, 3), h.deps);
  handleDrawBinary(h.drawer.sock, makeUndo(inst, 2), h.deps);
  check(
    h.room.gameState.drawHistory.length === 1 && getIds(h.room.gameState.drawHistory)[0] === `${inst}#1`,
    'A3. B4, B3, B2 undo cleanly leaving locked B1 in history'
  );

  h.drawer.emits.length = 0;
  handleDrawBinary(h.drawer.sock, makeUndo(inst, 1), h.deps);
  const rej = h.drawer.emits.find((e) => e.event === 'draw_undo_rejected');
  check(
    rej?.payload?.reason === 'locked' && h.room.gameState.drawHistory.length === 1,
    'A4. Undoing B1 is rejected with reason="locked" and history stays intact'
  );
  cleanupRoomManager(h.rm);
}

console.log('── Scenario B: Retained Suffix Invariant (B1..B4 -> Undo B4 -> B5 -> Undo B5, B3, B2; B6 locks B2) ──');
{
  const h = makeRoomHarness('General #ScenB');
  const inst = 'drw0001';
  for (const id of [1, 2, 3, 4]) {
    handleDrawBinary(h.drawer.sock, makeBucket(inst, id), h.deps);
  }
  handleDrawBinary(h.drawer.sock, makeUndo(inst, 4), h.deps);
  check(
    h.room.gameState.lockedBucketCount === 1 && h.room.gameState.lockedBoundaryTarget?.strokeId === 1,
    'B1. After B1..B4 -> Undo B4, lockedBucketCount stays monotonically 1 (B1 locked)'
  );

  handleDrawBinary(h.drawer.sock, makeBucket(inst, 5), h.deps);
  check(
    h.room.gameState.lockedBucketCount === 1 && h.room.gameState.lockedBoundaryTarget?.strokeId === 1,
    'B2. Adding B5 gives retained unlocked suffix [B2, B3, B5] (len 3 <= L=3), so B2 stays eligible!'
  );

  // Check B6 pushes retained suffix to 4 -> locks B2 monotonically
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 6), h.deps);
  check(
    h.room.gameState.lockedBucketCount === 2 && h.room.gameState.lockedBoundaryTarget?.strokeId === 2,
    'B3. Adding B6 yields 4 retained unlocked Buckets [B2,B3,B5,B6] -> advances lock monotonically to B2'
  );

  // Separate check: Undo B6, B5, B3 allowed and stops before B2
  handleDrawBinary(h.drawer.sock, makeUndo(inst, 6), h.deps);
  handleDrawBinary(h.drawer.sock, makeUndo(inst, 5), h.deps);
  handleDrawBinary(h.drawer.sock, makeUndo(inst, 3), h.deps);
  h.drawer.emits.length = 0;
  handleDrawBinary(h.drawer.sock, makeUndo(inst, 2), h.deps);
  const rejB2 = h.drawer.emits.find((e) => e.event === 'draw_undo_rejected');
  check(
    getIds(h.room.gameState.drawHistory).join(',') === `${inst}#1,${inst}#2` &&
      rejB2?.payload?.reason === 'locked',
    'B4. B6, B5, B3 undo in reverse order and stop before locked B2'
  );
  cleanupRoomManager(h.rm);
}

console.log('── Scenario C & D: Mixed Sequence & Non-Bucket Strokes Undoable After 3 Buckets Undone ──');
{
  const h = makeRoomHarness('General #ScenCD');
  const inst = 'drw0001';
  // B1 -> PenA -> B2 -> EraserA -> B3 -> Circle -> B4 -> PenB
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 1), h.deps);
  makeContinuousStroke(h.drawer.sock, h.deps, inst, 2, 'pencil'); // PenA
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 3), h.deps);
  makeContinuousStroke(h.drawer.sock, h.deps, inst, 4, 'eraser'); // EraserA
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 5), h.deps);
  handleDrawBinary(h.drawer.sock, makeShapeStroke(inst, 6, 'strokeCircle'), h.deps); // Circle
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 7), h.deps); // B4 -> locks B1
  makeContinuousStroke(h.drawer.sock, h.deps, inst, 8, 'pencil'); // PenB

  check(
    h.room.gameState.lockedBucketCount === 1 && h.room.gameState.lockedBoundaryTarget?.strokeId === 1,
    'C1. Mixed sequence locks only B1 when 4th Bucket B4 arrives'
  );

  // Strict chronological Undo: 8(PenB) -> 7(B4) -> 6(Circle) -> 5(B3) -> 4(EraserA) -> 3(B2) -> 2(PenA)
  for (const strokeId of [8, 7, 6, 5, 4, 3, 2]) {
    const target = findCompetitiveUndoTarget(
      h.room.gameState.drawHistory,
      h.room.gameState.lockedBoundaryTarget ?? null,
      h.room.gameState.drawEpochId ?? 0
    );
    check(target.targetIdentity?.strokeId === strokeId, `C2. Next chronological target is #${strokeId}`);
    handleDrawBinary(h.drawer.sock, makeUndo(inst, strokeId), h.deps);
  }

  check(
    getIds(h.room.gameState.drawHistory).join(',') === `${inst}#1`,
    'D1. PenA/EraserA/Circle/PenB all undoable without consuming Bucket allowance (only B1 remains)'
  );

  h.drawer.emits.length = 0;
  handleDrawBinary(h.drawer.sock, makeUndo(inst, 1), h.deps);
  check(
    h.drawer.emits.find((e) => e.event === 'draw_undo_rejected')?.payload?.reason === 'locked',
    'D2. Undo stops cleanly before locked B1'
  );
  cleanupRoomManager(h.rm);
}

console.log('── Scenario E: Undo B3 -> Redo B3 (new strokeId) -> Undo B3 again ──');
{
  const h = makeRoomHarness('General #ScenE');
  const inst = 'drw0001';
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 1), h.deps);
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 2), h.deps);
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 3), h.deps);

  handleDrawBinary(h.drawer.sock, makeUndo(inst, 3), h.deps);
  check(getIds(h.room.gameState.drawHistory).join(',') === `${inst}#1,${inst}#2`, 'E1. Undo B3 removes #3');

  // Redo B3 with new monotonic strokeId=4
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 4), h.deps);
  check(
    getIds(h.room.gameState.drawHistory).join(',') === `${inst}#1,${inst}#2,${inst}#4` &&
      h.room.gameState.lockedBucketCount === 0,
    'E2. Redo B3 with fresh strokeId=4 appends cleanly and stays above boundary'
  );

  handleDrawBinary(h.drawer.sock, makeUndo(inst, 4), h.deps);
  check(
    getIds(h.room.gameState.drawHistory).join(',') === `${inst}#1,${inst}#2`,
    'E3. Redone B3 (#4) can be undone again'
  );
  cleanupRoomManager(h.rm);
}

console.log('── Scenario F: Pen/Shape BEFORE locked B1 stays inaccessible & never skipped ──');
{
  const h = makeRoomHarness('General #ScenF');
  const inst = 'drw0001';
  makeContinuousStroke(h.drawer.sock, h.deps, inst, 1, 'pencil'); // Pre-boundary Pen0
  handleDrawBinary(h.drawer.sock, makeShapeStroke(inst, 2, 'fillRect'), h.deps); // Pre-boundary Shape0
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 3), h.deps); // B1 -> locked when B4 commits
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 4), h.deps); // B2
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 5), h.deps); // B3
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 6), h.deps); // B4 -> locks B1 (#3)

  handleDrawBinary(h.drawer.sock, makeUndo(inst, 6), h.deps);
  handleDrawBinary(h.drawer.sock, makeUndo(inst, 5), h.deps);
  handleDrawBinary(h.drawer.sock, makeUndo(inst, 4), h.deps);

  const clientTarget = findCompetitiveUndoTarget(
    h.room.gameState.drawHistory,
    h.room.gameState.lockedBoundaryTarget ?? null,
    h.room.gameState.drawEpochId ?? 0
  );
  check(
    clientTarget.blockedByLock && clientTarget.targetIndex === -1,
    'F1. Client target lookup blocks before B1 (#3) and never skips to Shape0/Pen0'
  );

  // Attempt to bypass client and directly request Undo of pre-boundary Pen0 (#1) or Shape0 (#2)
  h.drawer.emits.length = 0;
  handleDrawBinary(h.drawer.sock, makeUndo(inst, 2), h.deps);
  const rejPre = h.drawer.emits.find((e) => e.event === 'draw_undo_rejected');
  check(
    rejPre?.payload?.reason === 'locked' && h.room.gameState.drawHistory.length === 3,
    'F2. Server rejects out-of-boundary Undo of pre-B1 Shape0 (#2) with reason="locked"'
  );
  cleanupRoomManager(h.rm);
}

console.log('── Scenario G: Transient Types 1/2/3/6 & Cancelled Shape Never Become Undo Targets ──');
{
  const h = makeRoomHarness('General #ScenG');
  const inst = 'drw0001';
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 1), h.deps);

  // Start shape (Type 1) then cancel (Type 6) -> leaves transient packets in raw server history
  const shapeStart = toBuffer(
    encodeBinaryDrawMessage('draw_start', {
      instanceId: inst,
      tool: 'strokeRect',
      color: '#000000',
      width: 4,
      opacity: 1,
      x: 0.1,
      y: 0.1,
    })
  );
  const shapeCancel = toBuffer(encodeBinaryDrawMessage('draw_cancel', { instanceId: inst }));
  handleDrawBinary(h.drawer.sock, shapeStart, h.deps);
  handleDrawBinary(h.drawer.sock, shapeCancel, h.deps);

  // Client sync normalization strips transient 1/6
  const normalized = normalizeCompetitiveCommands(getJsonSafeHistory(h.room.gameState.drawHistory));
  check(
    normalized.length === 1 && getCommandPacketType(normalized[0]) === 4,
    'G1. normalizeCompetitiveCommands strips transient shape Type 1 & Type 6 cancel from draw_history_sync'
  );

  // Server Undo targets B1 (#1) directly without tripping on transient trailing packets
  handleDrawBinary(h.drawer.sock, makeUndo(inst, 1), h.deps);
  const durableRemaining = h.room.gameState.drawHistory.filter((c) => {
    const t = getCommandPacketType(c);
    return t === 4 || t === 9;
  });
  check(durableRemaining.length === 0, 'G2. Server skips transient trailing packets when Undoing B1');
  cleanupRoomManager(h.rm);
}

console.log('── Scenario H: Late Joiner Arbitrary Order of room_state_update vs draw_history_sync ──');
{
  const h = makeRoomHarness('General #ScenH');
  const inst = 'drw0001';
  for (const id of [1, 2, 3, 4]) {
    handleDrawBinary(h.drawer.sock, makeBucket(inst, id), h.deps);
  }
  const late = h.makeSocket('sock-late');

  handleJoinRoom(
    late.sock,
    {
      roomId: h.roomId,
      nickname: 'LateSpec',
      playerId: 'pid-late',
      reconnectSecret: 'secret_late_user_12345678',
    },
    () => {},
    { io: h.mockIo, roomManager: h.rm, getRoomConfig, getJsonSafeHistory }
  );

  const capturedState = late.emits.find((e) => e.event === 'room_state_update')?.payload;
  const capturedSync = late.emits.find((e) => e.event === 'draw_history_sync')?.payload ?? [];

  check(
    capturedState?.gameState?.drawEpochId === 0 &&
      capturedState?.gameState?.lockedBoundaryTarget?.strokeId === 1,
    'H1. Late joiner receives server drawEpochId & lockedBoundaryTarget in room_state_update'
  );

  // Order 1: room_state_update BEFORE draw_history_sync
  let s1 = createInitialCompetitiveBoundaryState();
  s1 = applyCompetitiveSummaryState(s1, capturedState.gameState, [], false).next;
  const r1 = reconcileCompetitiveHistorySync(s1, capturedSync);
  check(
    r1.next.boundaryResolved && !r1.shouldRequestResync && r1.normalizedCommands.length === 4,
    'H2. Order [room_state_update -> draw_history_sync] resolves locked boundary cleanly'
  );

  // Order 2: draw_history_sync BEFORE room_state_update
  let s2 = createInitialCompetitiveBoundaryState();
  const r2a = reconcileCompetitiveHistorySync(s2, capturedSync);
  const r2b = applyCompetitiveSummaryState(r2a.next, capturedState.gameState, r2a.normalizedCommands, true);
  check(
    r2b.next.boundaryResolved && !r2b.shouldRequestResync && r2b.next.lockedBoundaryTarget?.strokeId === 1,
    'H3. Order [draw_history_sync -> room_state_update] reconciles locked boundary cleanly'
  );
  cleanupRoomManager(h.rm);
}

console.log('── Scenario I: Drawer Reconnects With New instanceId -> Undoes Pre-Reconnect Command Above Boundary ──');
{
  const h = makeRoomHarness('General #ScenI');
  const instOld = 'oldInst';
  const instNew = 'newInst';
  handleDrawBinary(h.drawer.sock, makeBucket(instOld, 1), h.deps);
  handleDrawBinary(h.drawer.sock, makeBucket(instOld, 2), h.deps);
  makeContinuousStroke(h.drawer.sock, h.deps, instOld, 3, 'pencil');
  handleDrawBinary(h.drawer.sock, makeBucket(instOld, 4), h.deps); // locks oldInst#1
  handleDrawBinary(h.drawer.sock, makeBucket(instOld, 5), h.deps); // locks oldInst#2 -> suffix [4, 5]

  const drawerNewSock = h.makeSocket('sock-drawer-2');
  const reconRes = h.rm.reconnectPlayer(
    h.roomId,
    'pid-drawer',
    'Drawer',
    drawerNewSock.sock.id,
    'secret_drawer_1234567890'
  );
  check(reconRes.status === 'reconnected', 'I1. Drawer reconnect succeeds');

  const roundSyncLimits = new Map<string, number[]>();
  handleRequestRoundSync(drawerNewSock.sock, () => {}, {
    roomManager: h.rm,
    roundSyncLimits,
    checkRateLimit: () => true,
    getJsonSafeHistory,
  });

  const syncPayload = drawerNewSock.emits.find((e) => e.event === 'draw_history_sync')?.payload;
  const statePayload = drawerNewSock.emits.find((e) => e.event === 'room_state_update')?.payload;

  let clientState = createInitialCompetitiveBoundaryState();
  clientState = applyCompetitiveSummaryState(clientState, statePayload.gameState, [], false).next;
  const synced = reconcileCompetitiveHistorySync(clientState, syncPayload);
  clientState = synced.next;

  // Client computes target WITHOUT cmdInstId === instNew filter!
  const target = findCompetitiveUndoTarget(
    synced.normalizedCommands,
    clientState.lockedBoundaryTarget,
    clientState.epochId
  );
  check(
    target.boundaryResolved &&
      target.targetIdentity?.instanceId === instOld &&
      target.targetIdentity?.strokeId === 5,
    'I2. Reconnected drawer finds oldInst#5 above locked boundary oldInst#2'
  );

  // Encodes oldInst#5 cleanly and decodes back cleanly
  const wireUndo = toBuffer(encodeBinaryDrawMessage('draw_undo', target.targetIdentity!));
  const decodedWire = decodeBinaryDrawMessage(wireUndo);
  check(
    decodedWire?.event === 'draw_undo' &&
      decodedWire.data?.instanceId === instOld &&
      decodedWire.data?.strokeId === 5,
    'I3. Wire Type 7 preserves original target instanceId (oldInst) + strokeId (5)'
  );

  h.roomEmits.length = 0;
  handleDrawBinary(drawerNewSock.sock, wireUndo, h.deps);
  const acceptEmit = h.roomEmits.find((e) => e.event === 'draw_undo_accepted');
  const binEmit = h.roomEmits.find(
    (e) => e.event === 'draw_binary' && Buffer.isBuffer(e.payload) && e.payload[0] === 7
  );
  check(
    Boolean(acceptEmit) &&
      Boolean(binEmit) &&
      getIds(h.room.gameState.drawHistory).length === 4,
    'I4. Server accepts reconnect Undo of oldInst#5 and broadcasts Type 7 + draw_undo_accepted'
  );
  cleanupRoomManager(h.rm);
}

console.log('── Scenario J: Clear (Type 5 & 10) & Turn Reset Epoch + Stale Rejection ──');
{
  const h = makeRoomHarness('General #ScenJ');
  const inst = 'drw0001';
  for (const id of [1, 2, 3, 4]) {
    handleDrawBinary(h.drawer.sock, makeBucket(inst, id), h.deps);
  }
  const epoch0 = h.room.gameState.drawEpochId ?? 0;

  // Mid-turn Type 5 Clear -> single epoch increment, boundary reset, fresh 3-Bucket budget
  handleDrawBinary(h.drawer.sock, makeClear(inst, 5), h.deps);
  check(
    h.room.gameState.drawEpochId === epoch0 + 1 &&
      h.room.gameState.lockedBucketCount === 0 &&
      h.room.gameState.lockedBoundaryTarget === null,
    'J1. Type 5 Clear increments drawEpochId once and resets boundary'
  );

  // Stale Type 7 referencing pre-clear strokeId=4 -> rejected with stale_epoch
  h.drawer.emits.length = 0;
  handleDrawBinary(h.drawer.sock, makeUndo(inst, 4), h.deps);
  check(
    h.drawer.emits.find((e) => e.event === 'draw_undo_rejected')?.payload?.reason === 'stale_epoch',
    'J2. Late Type 7 referencing pre-clear stroke rejected with stale_epoch'
  );

  // Fresh 3-Bucket budget works cleanly in new epoch
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 10), h.deps);
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 11), h.deps);
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 12), h.deps);
  check(h.room.gameState.lockedBucketCount === 0, 'J3. Fresh 3-Bucket allowance works after Clear');

  // Type 10 Clear also increments epoch once without double-increment
  handleDrawBinary(h.drawer.sock, makeClear(inst, 10), h.deps);
  check(
    h.room.gameState.drawEpochId === epoch0 + 2 &&
      h.room.gameState.lockedBucketCount === 0 &&
      h.room.gameState.lockedBoundaryTarget === null,
    'J4. Type 10 Clear increments drawEpochId once and resets boundary'
  );

  // Room-sweeper clearDrawHistoryForRoomAndClient increments epoch ONCE for emit pair (draw_clear JSON + Type 5 binary)
  const epochBeforeTurnEnd = h.room.gameState.drawEpochId ?? 0;
  h.roomEmits.length = 0;
  h.rm.clearDrawHistoryForRoomAndClient(h.room);
  const drawClearCount = h.roomEmits.filter(
    (e) =>
      e.event === 'draw_clear' ||
      (e.event === 'draw_binary' && Buffer.isBuffer(e.payload) && e.payload[0] === 5)
  ).length;
  check(
    drawClearCount === 2 && h.room.gameState.drawEpochId === epochBeforeTurnEnd + 1,
    'J5. Room-level clearDrawHistoryForRoomAndClient emits both clear signals while incrementing epoch ONCE'
  );
  cleanupRoomManager(h.rm);
}

console.log('── Scenario K & L: Reject Legacy 17B/21B Type 4, strokeId=0, and Duplicate IDs ──');
{
  const h = makeRoomHarness('General #ScenKL');
  const inst = 'drw0001';

  const b17 = Buffer.alloc(17);
  b17.writeUInt8(4, 0);
  b17.write(inst, 1, 7, 'ascii');
  b17.writeUInt8(2, 8);
  b17.writeUInt8(100, 12);

  const b21 = Buffer.alloc(21);
  b21.writeUInt8(4, 0);
  b21.write(inst, 1, 7, 'ascii');
  b21.writeUInt8(2, 8);
  b21.writeUInt8(100, 12);

  const b19Zero = makeBucket(inst, 0, 0.5, 0.5, false);

  for (const [label, buf] of [
    ['17B', b17],
    ['21B', b21],
    ['strokeId=0', b19Zero],
  ] as const) {
    h.drawer.emits.length = 0;
    h.drawer.broadcasts.length = 0;
    handleDrawBinary(h.drawer.sock, buf, h.deps);
    const rej = h.drawer.emits.find((e) => e.event === 'draw_action_rejected');
    check(
      rej?.payload?.reason === 'invalid_packet' &&
        h.room.gameState.drawHistory.length === 0 &&
        h.drawer.broadcasts.length === 0,
      `K1. Rejects Competitive Type 4 ${label} with draw_action_rejected(invalid_packet)`
    );
  }

  // L: Duplicate (instId, strokeId) on Bucket and Stroke rejected with zero double-append
  h.drawer.emits.length = 0;
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 7), h.deps);
  const ack = h.drawer.emits.find((e) => e.event === 'draw_bucket_ack');
  check(ack?.payload?.strokeId === 7, 'L1. First Bucket #7 gets draw_bucket_ack');

  h.drawer.emits.length = 0;
  h.drawer.broadcasts.length = 0;
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 7), h.deps);
  const dupRej = h.drawer.emits.find((e) => e.event === 'draw_action_rejected');
  check(
    dupRej?.payload?.reason === 'duplicate_id' &&
      h.room.gameState.drawHistory.length === 1 &&
      h.drawer.broadcasts.length === 0,
    'L2. Duplicate Bucket (instId, #7) rejected with reason="duplicate_id"'
  );

  handleDrawBinary(h.drawer.sock, makeShapeStroke(inst, 8), h.deps);
  h.drawer.emits.length = 0;
  handleDrawBinary(h.drawer.sock, makeShapeStroke(inst, 8), h.deps);
  check(
    h.drawer.emits.find((e) => e.event === 'draw_action_rejected')?.payload?.reason === 'duplicate_id' &&
      h.room.gameState.drawHistory.length === 2,
    'L3. Duplicate Type 9 Stroke (instId, #8) rejected with reason="duplicate_id"'
  );
  cleanupRoomManager(h.rm);
}

console.log('── Scenario M & N: Server Rejection Contracts & Client Non-Mutation / Optimistic Rollback ──');
{
  const h = makeRoomHarness('General #ScenMN');
  const inst = 'drw0001';
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 1), h.deps);
  h.roomEmits.length = 0;
  h.drawer.emits.length = 0;

  // M: Wrong strokeId / non-top target
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 2), h.deps);
  h.roomEmits.length = 0;
  h.drawer.emits.length = 0;
  handleDrawBinary(h.drawer.sock, makeUndo(inst, 1), h.deps); // #1 is below top #2
  const rej = h.drawer.emits.find((e) => e.event === 'draw_undo_rejected');
  check(
    rej?.payload?.reason === 'not_found' &&
      h.room.gameState.drawHistory.length === 2 &&
      h.roomEmits.filter((e) => e.event === 'draw_binary').length === 0,
    'M1. Non-top / missing Undo emits draw_undo_rejected without mutating history or broadcasting to room'
  );

  // N: Optimistic client Bucket removal when server emits draw_action_rejected
  const localCmds = [makeBucket(inst, 1), makeBucket(inst, 2), makeBucket(inst, 99)];
  const idx = localCmds.findIndex((c) => extractCommandIdentity({ event: 'draw_binary', data: c })?.strokeId === 99);
  assert.ok(idx === 2);
  localCmds.splice(idx, 1);
  check(localCmds.length === 2, 'N1. Rejected optimistic Bucket cleanly rolls back from local history');
  cleanupRoomManager(h.rm);
}

console.log('── Scenario O: Unresolvable Boundary Fail-Closed Behavior ──');
{
  const syncedMissingBoundary = [makeBucket('drw0001', 2), makeBucket('drw0001', 3), makeBucket('drw0001', 4)];
  const stateWithMissingB1 = {
    epochId: 5,
    lockedBucketCount: 1,
    lockedBoundaryTarget: { instanceId: 'drw0001', strokeId: 1, epochId: 5 },
    boundaryResolved: true,
    pendingBucketIds: [],
  };
  const rec = reconcileCompetitiveHistorySync(stateWithMissingB1, syncedMissingBoundary);
  const target = findCompetitiveUndoTarget(
    rec.normalizedCommands,
    rec.next.lockedBoundaryTarget,
    rec.next.epochId
  );
  check(
    !rec.next.boundaryResolved &&
      rec.shouldRequestResync &&
      !target.boundaryResolved &&
      target.targetIndex === -1,
    'O1. Unresolvable non-null lockedBoundaryTarget fails closed (disables Undo & triggers resync)'
  );
}

console.log('── Scenario P: Post-Turn Late Type 7 During ROUND_END / CHOOSING ──');
{
  const h = makeRoomHarness('General #ScenP');
  const inst = 'drw0001';
  handleDrawBinary(h.drawer.sock, makeBucket(inst, 1), h.deps);
  h.room.gameState.status = 'ROUND_END';
  h.roomEmits.length = 0;
  h.drawer.emits.length = 0;

  handleDrawBinary(h.drawer.sock, makeUndo(inst, 1), h.deps);
  const rej = h.drawer.emits.find((e) => e.event === 'draw_undo_rejected');
  check(
    rej?.payload?.reason === 'not_drawing' &&
      h.room.gameState.drawHistory.length === 1 &&
      h.roomEmits.length === 0,
    'P1. Post-turn Type 7 during ROUND_END emits draw_undo_rejected(not_drawing) with zero room broadcast'
  );
  cleanupRoomManager(h.rm);
}

console.log('── Scenario Q: Free Draw & Normal Room Non-Regression + AGENTS.md Invariants ──');
{
  // Free Draw preserves >3 Buckets, supports 17B Bucket, supports drawingIdentities undo
  const fd = makeRoomHarness('FreeDraw #Stage4A_FD');
  fd.room.isFreeDraw = true;
  fd.room.isExperimental = false;
  fd.room.activeDrawers = ['pid-drawer'];
  fd.room.drawingIdentities = {
    fd00001: { socketId: fd.drawer.sock.id, playerName: 'Drawer' },
  };
  for (let i = 1; i <= 5; i++) {
    handleDrawBinary(fd.drawer.sock, makeBucket('fd00001', i), fd.deps);
  }
  handleDrawBinary(fd.drawer.sock, makeUndo('fd00001', 1), fd.deps); // Oldest bucket undoable in Free Draw!
  check(
    fd.room.gameState.drawHistory.length === 4 && fd.room.gameState.lockedBucketCount === undefined,
    'Q1. Free Draw retains unlimited per-user Bucket undo and skips Competitive lock boundary'
  );
  cleanupRoomManager(fd.rm);

  // Normal room preserves Type 4 as valid first action + 1-step Undo/Redo + isDrawingActive = false lock
  const norm = makeRoomHarness('GeneralNormal_Test');
  norm.room.isFreeDraw = false;
  norm.room.isExperimental = false;
  norm.room.gameState.isDrawingActive = true;
  const b17Norm = Buffer.alloc(17);
  b17Norm.writeUInt8(4, 0);
  b17Norm.write('norm001', 1, 7, 'ascii');
  b17Norm.writeUInt8(2, 8);
  b17Norm.writeUInt8(100, 12);
  handleDrawBinary(norm.drawer.sock, b17Norm, norm.deps); // First-action Bucket allowed
  check(norm.room.gameState.drawHistory.length === 1, 'Q2. Normal room preserves 17B first-action Bucket invariant (AGENTS.md)');

  norm.room.gameState.isDrawingActive = true;
  const normUndo = Buffer.alloc(8);
  normUndo.writeUInt8(7, 0);
  normUndo.write('norm001', 1, 7, 'ascii');
  handleDrawBinary(norm.drawer.sock, normUndo, norm.deps);
  check(
    norm.room.gameState.drawHistory.length === 0 &&
      norm.room.gameState.redoStack?.length === 1 &&
      Boolean(norm.room.gameState.isDrawingActive) === false,
    'Q3. Normal room preserves 1-step redoStack & isDrawingActive=false lock on Undo (AGENTS.md)'
  );
  cleanupRoomManager(norm.rm);
}

console.log(`\nStage 4A Suite Complete: ${passed} passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);

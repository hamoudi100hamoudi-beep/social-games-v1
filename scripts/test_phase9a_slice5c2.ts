import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import customParser from 'socket.io-msgpack-parser';

import {
  checkRateLimit,
  ControlRateLimiter,
  CONTROL_RATE_LIMITS,
  defaultControlRateLimiter,
  cleanupControlRateLimit,
  type ControlRateLimitGroup,
} from '../server/rateLimit.js';
import { DrawRateLimiter, defaultDrawRateLimiter } from '../server/drawRateLimit.js';
import { MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES } from '../server/transportConfig.js';
import { RoomManager, normalizeArabic } from '../server/rooms.js';
import { getRoomConfig, ROOM_PRESETS } from '../src/types/game.js';
import {
  handleGetRoomInfo,
  handleStartFreeDraw,
  handleStopFreeDraw,
  handleRequestDrawingIdentities,
  handleDrawRepairReq,
  sanitizeClientCapabilities,
} from '../server/controlInputValidation.js';
import { handleJoinRoom, registerJoinRoomHandler } from '../server/registerJoinRoomHandler.js';
import { registerLeaveRoomHandler } from '../server/registerLeaveRoomHandler.js';
import { registerGetRoomsInfoHandler } from '../server/registerGetRoomsInfoHandler.js';
import {
  handleRegisterDrawingIdentity,
  handleUnregisterDrawingIdentity,
  registerDrawingIdentityHandlers,
} from '../server/registerDrawingIdentityHandlers.js';
import { registerSendMessageHandler } from '../server/registerSendMessageHandler.js';
import { registerSubmitGuessHandler } from '../server/registerSubmitGuessHandler.js';
import { registerVoteKickHandler } from '../server/registerVoteKickHandler.js';
import { registerRequestRoundSyncHandler } from '../server/registerRequestRoundSyncHandler.js';
import { registerSelectWordHandler } from '../server/registerSelectWordHandler.js';
import { registerDrawBinaryHandler } from '../server/registerDrawBinaryHandler.js';

console.log('==================================================================');
console.log('🛡️  PHASE 9A — SLICE 5C-2: CONTROL EVENT RATE LIMITING SUITE');
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

function stopManagerTimers(rm: RoomManager) {
  if ((rm as any).tickInterval) {
    clearInterval((rm as any).tickInterval);
    (rm as any).tickInterval = null;
  }
  const evictionTimers: Map<string, NodeJS.Timeout> | undefined = (rm as any).evictionTimers;
  if (evictionTimers) {
    for (const timer of evictionTimers.values()) clearTimeout(timer);
    evictionTimers.clear();
  }
  const phaseTimers: Map<string, NodeJS.Timeout> | undefined = (rm as any).phaseDeadlineTimers;
  if (phaseTimers) {
    for (const timer of phaseTimers.values()) clearTimeout(timer);
    phaseTimers.clear();
  }
}

function createRecordingSocket(id: string) {
  const joinedRooms: string[] = [];
  const socketEmits: { event: string; payload: any }[] = [];
  return {
    id,
    joinedRooms,
    socketEmits,
    join(roomId: string) {
      joinedRooms.push(roomId);
    },
    emit(event: string, payload: any) {
      socketEmits.push({ event, payload });
    },
  };
}

function waitForEvent<T = any>(socket: ClientSocket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for event "${event}"`));
    }, timeoutMs);
    const onEvent = (data: T) => {
      clearTimeout(timer);
      resolve(data);
    };
    socket.once(event, onEvent);
  });
}

function emitWithAck<T = any>(
  socket: ClientSocket,
  event: string,
  ...args: any[]
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ack on "${event}"`));
    }, 4000);
    socket.emit(event, ...args, (res: T) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

function makeType1(instId: string): Buffer {
  const buf = Buffer.alloc(18);
  buf.writeUInt8(1, 0);
  buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  buf.writeUInt8(0, 8);
  buf.writeUInt8(0, 9);
  buf.writeUInt8(0, 10);
  buf.writeUInt8(0, 11);
  buf.writeUInt8(4, 12);
  buf.writeUInt8(100, 13);
  buf.writeInt16LE(1000, 14);
  buf.writeInt16LE(1000, 16);
  return buf;
}

async function runTests() {
  // =========================================================================
  // PART 1: ControlRateLimiter Bucket Math, Isolation, No Bloat & Cleanup
  // =========================================================================
  console.log('--- Part 1: Token Bucket Math, Isolation, State Bound & Cleanup ---');
  {
    const limiter = new ControlRateLimiter();
    let t = 1_000_000;

    // 1A. Exact approved bursts and refills for every group
    const expectedLimits: Record<ControlRateLimitGroup, { burst: number; refillPerSec: number }> = {
      join_room: { burst: 4, refillPerSec: 0.5 },
      get_room_info: { burst: 10, refillPerSec: 5 },
      get_rooms_info: { burst: 4, refillPerSec: 1 },
      free_draw_toggle: { burst: 4, refillPerSec: 1 },
      drawing_identity: { burst: 8, refillPerSec: 2 },
      request_drawing_identities: { burst: 4, refillPerSec: 1 },
    };

    let allBurstRefillOk = true;
    for (const [group, spec] of Object.entries(expectedLimits) as [
      ControlRateLimitGroup,
      { burst: number; refillPerSec: number }
    ][]) {
      const sockId = `math-${group}`;
      for (let i = 0; i < spec.burst; i++) {
        if (!limiter.consume(sockId, group, t)) allBurstRefillOk = false;
      }
      // Next call immediately rejected
      if (limiter.consume(sockId, group, t)) allBurstRefillOk = false;

      // Advance by slightly less than 1 token refill -> still rejected
      const msPerToken = 1000 / spec.refillPerSec;
      if (limiter.consume(sockId, group, t + msPerToken - 50)) allBurstRefillOk = false;

      // Advance past full 1-token refill -> 1 allowed, then rejected again
      if (!limiter.consume(sockId, group, t + msPerToken + 50)) allBurstRefillOk = false;
      if (limiter.consume(sockId, group, t + msPerToken + 50)) allBurstRefillOk = false;

      // Refill capped at maxTokens after huge idle duration
      const hugeIdle = t + msPerToken * 1000;
      for (let i = 0; i < spec.burst; i++) {
        if (!limiter.consume(sockId, group, hugeIdle)) allBurstRefillOk = false;
      }
      if (limiter.consume(sockId, group, hugeIdle)) allBurstRefillOk = false;
    }
    check(
      allBurstRefillOk &&
        CONTROL_RATE_LIMITS.join_room.maxTokens === 4 &&
        CONTROL_RATE_LIMITS.join_room.refillPerSec === 0.5 &&
        CONTROL_RATE_LIMITS.get_room_info.maxTokens === 10 &&
        CONTROL_RATE_LIMITS.get_room_info.refillPerSec === 5 &&
        CONTROL_RATE_LIMITS.get_rooms_info.maxTokens === 4 &&
        CONTROL_RATE_LIMITS.get_rooms_info.refillPerSec === 1 &&
        CONTROL_RATE_LIMITS.free_draw_toggle.maxTokens === 4 &&
        CONTROL_RATE_LIMITS.free_draw_toggle.refillPerSec === 1 &&
        CONTROL_RATE_LIMITS.drawing_identity.maxTokens === 8 &&
        CONTROL_RATE_LIMITS.drawing_identity.refillPerSec === 2 &&
        CONTROL_RATE_LIMITS.request_drawing_identities.maxTokens === 4 &&
        CONTROL_RATE_LIMITS.request_drawing_identities.refillPerSec === 1,
      '1A. All 6 control rate-limit groups match exact burst/refill thresholds and cap at burst'
    );

    // 1B. Independent per-socket and per-event isolation + single socket-keyed record
    limiter.clear();
    for (let i = 0; i < 4; i++) limiter.consume('sock-iso-1', 'join_room', t);
    const joinBlocked = !limiter.consume('sock-iso-1', 'join_room', t);
    const roomInfoStillAllowed = limiter.consume('sock-iso-1', 'get_room_info', t);
    const otherSocketStillAllowed = limiter.consume('sock-iso-2', 'join_room', t);
    const rec1 = limiter.getSocketRecord('sock-iso-1');
    check(
      joinBlocked &&
        roomInfoStillAllowed &&
        otherSocketStillAllowed &&
        limiter.getTrackedSocketCount() === 2 &&
        rec1?.join_room !== undefined &&
        rec1?.get_room_info !== undefined &&
        !Array.isArray(rec1.join_room),
      '1B. Per-socket and per-event buckets are isolated inside a single fixed record per socket'
    );

    // 1C. Rejected requests & invalid socketIds do not create unbounded state
    const beforeFloodCount = limiter.getTrackedSocketCount();
    const invalidOk =
      !limiter.consume('', 'join_room', t) &&
      !limiter.consume(null as any, 'get_room_info', t) &&
      !limiter.consume(undefined as any, 'free_draw_toggle', t);
    for (let i = 0; i < 5000; i++) {
      limiter.consume('sock-iso-1', 'join_room', t);
    }
    const recAfterFlood = limiter.getSocketRecord('sock-iso-1');
    check(
      invalidOk &&
        limiter.getTrackedSocketCount() === beforeFloodCount &&
        recAfterFlood?.join_room?.tokens !== undefined &&
        recAfterFlood.join_room.tokens >= 0,
      '1C. Invalid socketIds allocate nothing and 5,000 rejected floods keep bounded state'
    );

    // 1D. 1,000 simulated socket connect/consume/disconnect lifecycles leave 0 leaked records
    limiter.clear();
    const startPerf = performance.now();
    for (let i = 0; i < 1000; i++) {
      const sid = `sim-sock-${i}`;
      limiter.consume(sid, 'get_room_info', t + i);
      limiter.consume(sid, 'join_room', t + i);
      limiter.consume(sid, 'free_draw_toggle', t + i);
      limiter.consume(sid, 'drawing_identity', t + i);
      limiter.cleanupSocket(sid);
    }
    const elapsedMs = performance.now() - startPerf;
    check(
      limiter.getTrackedSocketCount() === 0 && elapsedMs < 200,
      `1D. 1,000 socket lifecycles cleaned in O(1) (${Math.round(elapsedMs * 100) / 100}ms, 0 leaked records)`
    );

    // Verify helper cleanupControlRateLimit delegates cleanly
    defaultControlRateLimiter.consume('helper-cleanup-sock', 'join_room', t);
    cleanupControlRateLimit('helper-cleanup-sock');
    check(
      defaultControlRateLimiter.getSocketRecord('helper-cleanup-sock') === undefined,
      '1E. cleanupControlRateLimit removes socket record in O(1)'
    );
  }

  // =========================================================================
  // PART 2: Shared Buckets & Handler Callback Contracts (Unit)
  // =========================================================================
  console.log('\n--- Part 2: Shared Buckets & Throttled Callback Contracts ---');
  {
    const rm = new RoomManager();
    const ioBroadcasts: { room: string; event: string; payload: any }[] = [];
    const io = {
      to(room: string) {
        return {
          emit(event: string, payload: any) {
            ioBroadcasts.push({ room, event, payload });
          },
        };
      },
      sockets: { sockets: new Map() },
    };
    rm.setIo(io as any);

    try {
      const limiter = new ControlRateLimiter();
      const origNow = Date.now;
      let fakeNow = 2_000_000;
      Date.now = () => fakeNow;

      try {
        // 2A. join_room callback on throttle & new socket reconnect
        const joinSock1 = createRecordingSocket('sock-join-1');
        const joinAcks: any[] = [];
        for (let i = 0; i < 6; i++) {
          handleJoinRoom(
            joinSock1,
            {
              roomId: 'General #Test',
              nickname: 'JoinTester',
              playerId: 'usr-join-tester-1',
              reconnectSecret: 'sec-join-tester-secret-12345',
            },
            (r) => joinAcks.push(r),
            { io, roomManager: rm, getRoomConfig, controlRateLimiter: limiter }
          );
        }
        // Automatic reconnect on NEW socket.id must succeed immediately
        const joinSockNew = createRecordingSocket('sock-join-new');
        let newSocketAck: any = null;
        handleJoinRoom(
          joinSockNew,
          {
            roomId: 'General #Test',
            nickname: 'JoinTester',
            playerId: 'usr-join-tester-1',
            reconnectSecret: 'sec-join-tester-secret-12345',
            reconnectOnly: true,
          },
          (r) => (newSocketAck = r),
          { io, roomManager: rm, getRoomConfig, controlRateLimiter: limiter }
        );
        check(
          joinAcks.slice(0, 4).every((a) => a?.success === true) &&
            joinAcks[4]?.success === false &&
            joinAcks[4]?.error === 'rate_limited' &&
            joinAcks[5]?.success === false &&
            joinAcks[5]?.error === 'rate_limited' &&
            newSocketAck?.success === true &&
            newSocketAck?.reconnected === true,
          '2A. join_room allows burst=4, rejects 5th+ with {success:false, error:"rate_limited"}, and allows new socket reconnect'
        );

        // 2B. get_room_info callback on throttle
        const roomInfoAcks: any[] = [];
        for (let i = 0; i < 12; i++) {
          handleGetRoomInfo('Free Draw', (r) => roomInfoAcks.push(r), {
            roomManager: rm,
            getRoomConfig,
            controlRateLimiter: limiter,
            socketId: 'sock-info-1',
          });
        }
        check(
          roomInfoAcks.slice(0, 10).every((r) => typeof r?.count === 'number' && r?.theme === 'Free Draw') &&
            roomInfoAcks[10]?.error === 'rate_limited' &&
            roomInfoAcks[10]?.count === undefined &&
            roomInfoAcks[11]?.error === 'rate_limited',
          '2B. get_room_info allows burst=10 and throttles 11th+ with {error:"rate_limited"} without hanging callback'
        );

        // 2C. Shared start_free_draw + stop_free_draw bucket
        const fdSock = createRecordingSocket('sock-fd-toggle');
        handleJoinRoom(
          fdSock,
          {
            roomId: 'Free Draw',
            nickname: 'ToggleUser',
            playerId: 'usr-fd-toggle-1',
            reconnectSecret: 'sec-fd-toggle-secret-12345',
          },
          () => {},
          { io, roomManager: rm, getRoomConfig, controlRateLimiter: limiter }
        );
        const fdRoom = rm.getRoom('Free Draw')!;
        const stateCountBefore = ioBroadcasts.length;
        // 4 alternations consume the entire shared burst of 4
        handleStartFreeDraw(fdSock, { roomManager: rm, controlRateLimiter: limiter });
        const after1 = fdRoom.activeDrawers?.includes('usr-fd-toggle-1') === true;
        handleStopFreeDraw(fdSock, { roomManager: rm, controlRateLimiter: limiter });
        const after2 = fdRoom.activeDrawers?.includes('usr-fd-toggle-1') === false;
        handleStartFreeDraw(fdSock, { roomManager: rm, controlRateLimiter: limiter });
        const after3 = fdRoom.activeDrawers?.includes('usr-fd-toggle-1') === true;
        handleStopFreeDraw(fdSock, { roomManager: rm, controlRateLimiter: limiter });
        const after4 = fdRoom.activeDrawers?.includes('usr-fd-toggle-1') === false;
        // 5th call (start_free_draw) must be silently throttled
        handleStartFreeDraw(fdSock, { roomManager: rm, controlRateLimiter: limiter });
        const after5 = fdRoom.activeDrawers?.includes('usr-fd-toggle-1') === false;
        const broadcastsDuringToggle = ioBroadcasts.length - stateCountBefore;
        // Advance 1s -> 1 toggle allowed
        fakeNow += 1050;
        handleStartFreeDraw(fdSock, { roomManager: rm, controlRateLimiter: limiter });
        const afterRefill = fdRoom.activeDrawers?.includes('usr-fd-toggle-1') === true;
        check(
          after1 && after2 && after3 && after4 && after5 && afterRefill && broadcastsDuringToggle === 4,
          '2C. start_free_draw and stop_free_draw share one 4-burst / 1-per-sec bucket'
        );

        // 2D. Shared register_drawing_identity + unregister_drawing_identity bucket (8 burst, 2/s)
        const idSock = createRecordingSocket('sock-id-shared');
        handleJoinRoom(
          idSock,
          {
            roomId: 'Free Draw',
            nickname: 'IdSharer',
            playerId: 'usr-id-shared-1',
            reconnectSecret: 'sec-id-shared-secret-12345',
          },
          () => {},
          { io, roomManager: rm, getRoomConfig, controlRateLimiter: limiter }
        );
        // 4 reg/unreg pairs = 8 operations succeed cleanly
        let alternatingOk = true;
        for (let i = 0; i < 4; i++) {
          handleRegisterDrawingIdentity(idSock, { instanceId: 'shr1' }, { roomManager: rm, controlRateLimiter: limiter });
          if (fdRoom.drawingIdentities?.['shr1']?.socketId !== 'sock-id-shared') alternatingOk = false;
          handleUnregisterDrawingIdentity(idSock, { instanceId: 'shr1' }, { roomManager: rm, controlRateLimiter: limiter });
          if (fdRoom.drawingIdentities?.['shr1'] !== undefined) alternatingOk = false;
        }
        const idBroadcastsBefore9th = ioBroadcasts.filter((b) => b.event === 'drawing_identities_update').length;
        // 9th call rejected silently
        handleRegisterDrawingIdentity(idSock, { instanceId: 'shr1' }, { roomManager: rm, controlRateLimiter: limiter });
        const throttled9th = fdRoom.drawingIdentities?.['shr1'] === undefined;
        const idBroadcastsAfter9th = ioBroadcasts.filter((b) => b.event === 'drawing_identities_update').length;
        // Advance 500ms -> 1 token refilled (2/s)
        fakeNow += 550;
        handleRegisterDrawingIdentity(idSock, { instanceId: 'shr1' }, { roomManager: rm, controlRateLimiter: limiter });
        const refilled10th = fdRoom.drawingIdentities?.['shr1']?.socketId === 'sock-id-shared';
        check(
          alternatingOk &&
            throttled9th &&
            idBroadcastsAfter9th === idBroadcastsBefore9th &&
            refilled10th,
          '2D. register/unregister_drawing_identity share one 8-burst / 2-per-sec bucket'
        );

        // 2E. request_drawing_identities bucket (4 burst, 1/s)
        const reqSock = createRecordingSocket('sock-id-shared');
        // Note reqSock shares sock.id 'sock-id-shared' and is already in Free Draw
        for (let i = 0; i < 6; i++) {
          handleRequestDrawingIdentities(reqSock, { roomManager: rm, controlRateLimiter: limiter });
        }
        const reqEmitsCount = reqSock.socketEmits.filter((e) => e.event === 'drawing_identities_update').length;
        fakeNow += 1050;
        handleRequestDrawingIdentities(reqSock, { roomManager: rm, controlRateLimiter: limiter });
        const reqEmitsAfterRefill = reqSock.socketEmits.filter((e) => e.event === 'drawing_identities_update').length;
        check(
          reqEmitsCount === 4 && reqEmitsAfterRefill === 5,
          '2E. request_drawing_identities allows burst=4, drops 5th/6th, and refills at 1/sec'
        );
      } finally {
        Date.now = origNow;
      }
    } finally {
      stopManagerTimers(rm);
    }
  }

  // =========================================================================
  // PART 3: Live Socket.IO + MsgPack Integration, Exclusions & Disconnect
  // =========================================================================
  console.log('\n--- Part 3: Live Socket.IO + MsgPack Integration & Preservation ---');
  {
    const httpServer: HttpServer = createServer();
    const io = new Server(httpServer, {
      cors: { origin: '*' },
      transports: ['websocket'],
      maxHttpBufferSize: MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES,
      parser: customParser,
    });
    const rm = new RoomManager();
    rm.setIo(io);

    const controlRateLimiter = new ControlRateLimiter();
    const drawRateLimiter = new DrawRateLimiter();
    const chatMessageLimits = new Map<string, number[]>();
    const guessLimits = new Map<string, number[]>();
    const voteKickLimits = new Map<string, number[]>();
    const roundSyncLimits = new Map<string, number[]>();
    const drawRepairLimits = new Map<string, number[]>();

    let forceDisconnectErr = false;

    io.on('connection', (socket) => {
      socket.on('get_room_info', (roomId, cb) => {
        handleGetRoomInfo(roomId, cb, {
          roomManager: rm,
          getRoomConfig,
          controlRateLimiter,
          socketId: socket.id,
        });
      });

      registerGetRoomsInfoHandler(socket, {
        roomManager: rm,
        getRoomConfig,
        ROOM_PRESETS,
        controlRateLimiter,
      });

      socket.on('client_capabilities', (caps) => {
        const parsed = sanitizeClientCapabilities(caps);
        if (parsed.valid) {
          rm.setClientCapabilities(
            socket.id,
            parsed.hasSupportsType13 ? { supportsType13: parsed.supportsType13 } : {}
          );
        }
      });

      registerJoinRoomHandler(socket, {
        io,
        roomManager: rm,
        getRoomConfig,
        controlRateLimiter,
      });

      registerRequestRoundSyncHandler(socket, {
        roomManager: rm,
        roundSyncLimits,
        checkRateLimit,
        getJsonSafeHistory: (h) => h,
      });

      registerLeaveRoomHandler(socket, { io, roomManager: rm });

      registerDrawBinaryHandler(socket, {
        io,
        roomManager: rm,
        drawRateLimiter,
      });

      socket.on('draw_repair_req', (data) => {
        handleDrawRepairReq(socket, data, {
          roomManager: rm,
          drawRepairLimits,
          checkRateLimit,
          limit: 20,
          windowMs: 1000,
        });
      });

      socket.on('start_free_draw', () => {
        handleStartFreeDraw(socket, { roomManager: rm, controlRateLimiter });
      });

      registerDrawingIdentityHandlers(socket, { roomManager: rm, controlRateLimiter });

      socket.on('request_drawing_identities', () => {
        handleRequestDrawingIdentities(socket, { roomManager: rm, controlRateLimiter });
      });

      socket.on('stop_free_draw', () => {
        handleStopFreeDraw(socket, { roomManager: rm, controlRateLimiter });
      });

      socket.on('skip_turn', () => {
        const p = rm.getPlayer(socket.id);
        if (p && p.roomId) rm.handleSkipTurn(p.roomId, socket.id);
      });

      registerSelectWordHandler(socket, { roomManager: rm });
      registerSubmitGuessHandler(socket, { roomManager: rm, guessLimits, checkRateLimit });
      socket.on('request_hint', () => {
        const p = rm.getPlayer(socket.id);
        if (p && p.roomId) rm.requestHint(p.roomId, socket.id);
      });
      socket.on('report_draw', () => {
        const p = rm.getPlayer(socket.id);
        if (p && p.roomId) rm.reportDrawing(p.roomId, socket.id);
      });
      registerSendMessageHandler(socket, {
        io,
        roomManager: rm,
        chatLimits: chatMessageLimits,
        checkRateLimit,
        normalizeArabic,
      });
      registerVoteKickHandler(socket, {
        io,
        roomManager: rm,
        voteKickLimits,
        checkRateLimit,
      });
      socket.on('ping_activity', () => {
        const p = rm.getPlayer(socket.id);
        if (p) {
          p.lastActivity = Date.now();
          p.afkWarningSent = false;
        }
      });

      socket.on('disconnect', () => {
        try {
          if (forceDisconnectErr) {
            throw new Error('simulated_disconnect_error');
          }
          rm.handleDisconnect(socket.id);
        } catch {
          // Swallow simulated error to test finally cleanup
        } finally {
          try {
            drawRateLimiter.cleanupSocket(socket.id);
          } finally {
            controlRateLimiter.cleanupSocket(socket.id);
          }
        }
      });
    });

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const port = (httpServer.address() as AddressInfo).port;
    const url = `http://127.0.0.1:${port}`;
    const clients: ClientSocket[] = [];

    const connectClient = async (): Promise<ClientSocket> => {
      const c = ioClient(url, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        parser: customParser,
      });
      clients.push(c);
      await waitForEvent(c, 'connect');
      return c;
    };

    try {
      const attacker = await connectClient();
      const bystander = await connectClient();

      // 3A. Live get_rooms_info burst=4 + throttled empty object callback
      const roomsAcks: any[] = [];
      for (let i = 0; i < 6; i++) {
        roomsAcks.push(await emitWithAck(attacker, 'get_rooms_info'));
      }
      check(
        roomsAcks.slice(0, 4).every((r) => r && r['General #Test'] !== undefined) &&
          Object.keys(roomsAcks[4] || {}).length === 0 &&
          Object.keys(roomsAcks[5] || {}).length === 0,
        '3A. Live get_rooms_info allows burst=4 and replies empty object on 5th+ throttled acks'
      );

      // 3B. Live StrictMode-like legitimate workflow on bystander (info + play + 2x join + capabilities + identity burst)
      const bInfo1 = await emitWithAck(bystander, 'get_room_info', 'Free Draw');
      const bInfo2 = await emitWithAck(bystander, 'get_room_info', 'Free Draw');
      const bJoin1 = await emitWithAck(bystander, 'join_room', {
        roomId: 'Free Draw',
        nickname: 'StrictUser',
        avatar: '🎨',
        playerId: 'usr-live-strict-1',
        reconnectSecret: 'sec-live-strict-123456',
      });
      // StrictMode second immediate join_room on same socket
      const bJoin2 = await emitWithAck(bystander, 'join_room', {
        roomId: 'Free Draw',
        nickname: 'StrictUser',
        avatar: '🎨',
        playerId: 'usr-live-strict-1',
        reconnectSecret: 'sec-live-strict-123456',
        reconnectOnly: true,
      });
      // StrictMode mount/unmount/remount + room_state_update + t1/t2 identity registration sequence (6 events < 8)
      bystander.emit('register_drawing_identity', { instanceId: 'str1' });
      bystander.emit('unregister_drawing_identity', { instanceId: 'str1' });
      bystander.emit('register_drawing_identity', { instanceId: 'str1' });
      bystander.emit('register_drawing_identity', { instanceId: 'str1' });
      bystander.emit('register_drawing_identity', { instanceId: 'str1' });
      bystander.emit('register_drawing_identity', { instanceId: 'str1' });
      await new Promise((r) => setTimeout(r, 120));

      const liveFdRoom = rm.getRoom('Free Draw')!;
      check(
        bInfo1?.theme === 'Free Draw' &&
          bInfo2?.theme === 'Free Draw' &&
          bJoin1?.success === true &&
          bJoin2?.success === true &&
          liveFdRoom.drawingIdentities?.['str1']?.socketId === bystander.id,
        '3B. Live StrictMode-like join + drawing identity burst passes without friction even when attacker is throttled'
      );

      // 3C. Attacker joins room, exhausts join_room & get_room_info, bystander unaffected
      const aJoin1 = await emitWithAck(attacker, 'join_room', {
        roomId: 'Free Draw',
        nickname: 'Attacker',
        playerId: 'usr-live-atk-1',
        reconnectSecret: 'sec-live-atk-123456',
      });
      // Exhaust remaining 3 join_room tokens then test 5th
      await emitWithAck(attacker, 'join_room', {
        roomId: 'Free Draw',
        nickname: 'Attacker',
        playerId: 'usr-live-atk-1',
        reconnectSecret: 'sec-live-atk-123456',
      });
      await emitWithAck(attacker, 'join_room', {
        roomId: 'Free Draw',
        nickname: 'Attacker',
        playerId: 'usr-live-atk-1',
        reconnectSecret: 'sec-live-atk-123456',
      });
      await emitWithAck(attacker, 'join_room', {
        roomId: 'Free Draw',
        nickname: 'Attacker',
        playerId: 'usr-live-atk-1',
        reconnectSecret: 'sec-live-atk-123456',
      });
      const aJoinThrottled = await emitWithAck(attacker, 'join_room', {
        roomId: 'Free Draw',
        nickname: 'Attacker',
        playerId: 'usr-live-atk-1',
        reconnectSecret: 'sec-live-atk-123456',
      });
      // Exhaust attacker get_room_info (10 burst)
      const atkRoomInfos: any[] = [];
      for (let i = 0; i < 12; i++) {
        atkRoomInfos.push(await emitWithAck(attacker, 'get_room_info', 'Free Draw'));
      }
      const bystanderRoomInfo = await emitWithAck(bystander, 'get_room_info', 'Free Draw');
      check(
        aJoin1?.success === true &&
          aJoinThrottled?.success === false &&
          aJoinThrottled?.error === 'rate_limited' &&
          atkRoomInfos[9]?.theme === 'Free Draw' &&
          atkRoomInfos[10]?.error === 'rate_limited' &&
          bystanderRoomInfo?.theme === 'Free Draw',
        '3C. Live attacker join_room & get_room_info throttled cleanly; bystander completely isolated'
      );

      // 3D. Attacker free_draw_toggle & drawing_identity & request_drawing_identities bursts over wire
      let bIdentityUpdates = 0;
      bystander.on('drawing_identities_update', () => bIdentityUpdates++);

      for (let i = 0; i < 5; i++) {
        attacker.emit(i % 2 === 0 ? 'start_free_draw' : 'stop_free_draw');
      }
      await new Promise((r) => setTimeout(r, 80));
      // 4th event was stop_free_draw, 5th (start_free_draw) must be throttled -> attacker is NOT in activeDrawers
      const toggleThrottledOk = !liveFdRoom.activeDrawers?.includes('usr-live-atk-1');

      const updatesBeforeIdFlood = bIdentityUpdates;
      for (let i = 0; i < 12; i++) {
        attacker.emit(i % 2 === 0 ? 'register_drawing_identity' : 'unregister_drawing_identity', {
          instanceId: 'atk1',
        });
      }
      await new Promise((r) => setTimeout(r, 100));
      const idBroadcastDelta = bIdentityUpdates - updatesBeforeIdFlood;

      let atkReceivedIdentitySyncs = 0;
      attacker.on('drawing_identities_update', () => atkReceivedIdentitySyncs++);
      for (let i = 0; i < 7; i++) {
        attacker.emit('request_drawing_identities');
      }
      await new Promise((r) => setTimeout(r, 80));
      check(
        toggleThrottledOk && idBroadcastDelta === 8 && atkReceivedIdentitySyncs === 4,
        `3D. Live start/stop (<=4), register/unregister (8 broadcasts not 12, got ${idBroadcastDelta}), & request_drawing_identities (4 replies not 7, got ${atkReceivedIdentitySyncs}) enforced`
      );

      // 3E. Excluded events & existing 5 rate limits + Slice 5A draw_binary preserved cleanly
      // Test that exhausting all attacker control buckets did NOT affect send_message (5/2s) or draw_binary (Slice 5A)
      const receivedChats: any[] = [];
      bystander.on('receive_message', (m) => receivedChats.push(m));
      for (let i = 0; i < 6; i++) {
        attacker.emit('send_message', { text: `msg-${i}` });
      }
      await new Promise((r) => setTimeout(r, 80));
      const chatMsgs = receivedChats.filter((m) => m.type === 'message' && m.text?.startsWith('msg-'));

      // client_capabilities remains excluded from Slice 5C-2 throttling (6 rapid emits update cleanly)
      for (let i = 0; i < 6; i++) {
        attacker.emit('client_capabilities', { supportsType13: i % 2 === 1 });
      }
      await new Promise((r) => setTimeout(r, 60));
      const capUpdatedAfterSpam = rm.isClientType13Capable(attacker.id!) === true;

      // request_round_sync preserves exact 1/1s limit
      const sync1 = await emitWithAck(attacker, 'request_round_sync');
      const sync2 = await emitWithAck(attacker, 'request_round_sync');

      // Slice 5A draw_binary works immediately on bystander despite control usage
      bystander.emit('start_free_draw');
      await new Promise((r) => setTimeout(r, 50));
      let drawReceived = false;
      attacker.on('draw_binary', () => {
        drawReceived = true;
      });
      bystander.emit('draw_binary', makeType1('str1'));
      await new Promise((r) => setTimeout(r, 80));

      // Check remaining existing protections (submit_guess 5/2s, submit_vote_kick 3/2s, draw_repair_req 20/1s)
      const vk1 = await emitWithAck(attacker, 'submit_vote_kick', { targetPlayerId: 'usr-live-strict-1' });
      const vk2 = await emitWithAck(attacker, 'submit_vote_kick', { targetPlayerId: 'usr-live-strict-1' });
      const vk3 = await emitWithAck(attacker, 'submit_vote_kick', { targetPlayerId: 'usr-live-strict-1' });
      const vk4 = await emitWithAck(attacker, 'submit_vote_kick', { targetPlayerId: 'usr-live-strict-1' });

      check(
        chatMsgs.length === 5 &&
          capUpdatedAfterSpam &&
          sync1?.success === true &&
          sync2?.error === 'rate_limited' &&
          drawReceived &&
          vk1?.success === true &&
          vk2?.success === true &&
          vk3?.success === true &&
          vk4?.error === 'rate_limited',
        '3E. Excluded events (client_capabilities) and preserved protections (send_message 5/2s, request_round_sync 1/1s, submit_vote_kick 3/2s, draw_binary 5A) work without double throttling'
      );

      // Verify leave_room remains excluded & works even after attacker exhausted join_room
      attacker.emit('leave_room');
      await new Promise((r) => setTimeout(r, 80));
      const attackerLeft = !rm.getRoom('Free Draw')?.players.some((p) => p.id === attacker.id);
      check(attackerLeft, '3F. leave_room remains excluded and succeeds even when join_room bucket is empty');

      // 3G. Unconditional disconnect cleanup (even when handleDisconnect throws!)
      const attackerId = attacker.id!;
      const bystanderId = bystander.id!;
      const hadBeforeDisconnect =
        controlRateLimiter.getSocketRecord(attackerId) !== undefined &&
        controlRateLimiter.getSocketRecord(bystanderId) !== undefined;
      forceDisconnectErr = true;
      attacker.disconnect();
      bystander.disconnect();
      await new Promise((r) => setTimeout(r, 120));
      forceDisconnectErr = false;
      check(
        hadBeforeDisconnect &&
          controlRateLimiter.getTrackedSocketCount() === 0 &&
          drawRateLimiter.getTrackedSocketCount() === 0,
        '3G. Disconnect cleanup frees all ControlRateLimiter & DrawRateLimiter state unconditionally even if handleDisconnect throws'
      );
    } finally {
      for (const c of clients) {
        try {
          c.disconnect();
        } catch {}
      }
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (httpServer.listening) {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
      stopManagerTimers(rm);
    }
  }

  console.log('\n==================================================================');
  console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
  console.log('==================================================================');
  if (failCount > 0) {
    process.exit(1);
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Unhandled error in Slice 5C-2 test suite:', err);
    process.exit(1);
  });

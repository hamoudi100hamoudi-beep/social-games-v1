import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import customParser from 'socket.io-msgpack-parser';

import {
  checkRateLimit,
  ControlRateLimiter,
} from '../server/rateLimit.js';
import { DrawRateLimiter } from '../server/drawRateLimit.js';
import { RoomManager, normalizeArabic } from '../server/rooms.js';
import { getRoomConfig, ROOM_PRESETS, type Player, type Room } from '../src/types/game.js';
import {
  handleGetRoomInfo,
  handleDrawRepairReq,
  handleStartFreeDraw,
  handleStopFreeDraw,
  handleRequestDrawingIdentities,
  handlePingActivity,
  sanitizeClientCapabilities,
} from '../server/controlInputValidation.js';
import { registerJoinRoomHandler } from '../server/registerJoinRoomHandler.js';
import { registerLeaveRoomHandler } from '../server/registerLeaveRoomHandler.js';
import { handleGetRoomsInfo, registerGetRoomsInfoHandler } from '../server/registerGetRoomsInfoHandler.js';
import {
  handleRegisterDrawingIdentity,
  handleUnregisterDrawingIdentity,
  registerDrawingIdentityHandlers,
} from '../server/registerDrawingIdentityHandlers.js';
import { handleSendMessage, registerSendMessageHandler } from '../server/registerSendMessageHandler.js';
import { handleSubmitGuess, registerSubmitGuessHandler } from '../server/registerSubmitGuessHandler.js';
import { handleSelectWord, registerSelectWordHandler } from '../server/registerSelectWordHandler.js';
import { handleRequestRoundSync, registerRequestRoundSyncHandler } from '../server/registerRequestRoundSyncHandler.js';
import { handleSubmitVoteKick, registerVoteKickHandler } from '../server/registerVoteKickHandler.js';
import { handleDrawBinary, registerDrawBinaryHandler } from '../server/registerDrawBinaryHandler.js';

console.log('==================================================================');
console.log('🛡️  PHASE 9A — SLICE 5C-3B: AFK ACTIVITY ACCURACY SUITE');
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

function makePlayer(id: string, name: string, avatar: string, persistentId?: string): Player {
  return {
    id,
    name,
    avatar,
    roomId: null,
    score: 0,
    wins: 0,
    persistentId,
  };
}

function readGameStatus(room: Room): Room['gameState']['status'] {
  return room.gameState.status;
}

function readAfkWarning(player: Player): boolean | undefined {
  return player.afkWarningSent;
}

function makeBucketType4(instId = 'inst001', x = 0.5, y = 0.5, strokeId?: number): Buffer {
  const buf = Buffer.alloc(strokeId !== undefined ? 19 : 17);
  buf.writeUInt8(4, 0);
  buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  buf.writeUInt8(2, 8); // bucket tool = 2
  buf.writeUInt8(255, 9);
  buf.writeUInt8(0, 10);
  buf.writeUInt8(0, 11);
  buf.writeUInt8(100, 12);
  buf.writeUInt16LE(Math.round(x * 10000), 13);
  buf.writeUInt16LE(Math.round(y * 10000), 15);
  if (strokeId !== undefined) {
    buf.writeUInt16LE(strokeId & 0xFFFF, 17);
  }
  return buf;
}

function makeType1Start(instId = 'inst001', tool = 0): Buffer {
  const buf = Buffer.alloc(18);
  buf.writeUInt8(1, 0);
  buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  buf.writeUInt8(tool, 8);
  buf.writeUInt8(0, 9);
  buf.writeUInt8(0, 10);
  buf.writeUInt8(0, 11);
  buf.writeUInt8(4, 12);
  buf.writeUInt8(100, 13);
  buf.writeInt16LE(1000, 14);
  buf.writeInt16LE(1000, 16);
  return buf;
}

function makeType2Move(instId = 'inst001', x = 1500, y = 1500): Buffer {
  const buf = Buffer.alloc(14);
  buf.writeUInt8(2, 0);
  buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  buf.writeUInt16LE(1, 8);
  buf.writeInt16LE(x, 10);
  buf.writeInt16LE(y, 12);
  return buf;
}

function makeType3End(instId = 'inst001', tool = 0, strokeId = 1, expectedCount = 2): Buffer {
  const buf = Buffer.alloc(27);
  buf.writeUInt8(3, 0);
  buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  buf.writeUInt8(tool, 8);
  buf.writeUInt8(0, 9);
  buf.writeUInt8(0, 10);
  buf.writeUInt8(0, 11);
  buf.writeUInt8(4, 12);
  buf.writeUInt8(100, 13);
  buf.writeInt16LE(2000, 14);
  buf.writeInt16LE(2000, 16);
  buf.writeInt16LE(1000, 18);
  buf.writeInt16LE(1000, 20);
  buf.writeUInt8(0, 22);
  buf.writeUInt16LE(strokeId, 23);
  buf.writeUInt16LE(expectedCount, 25);
  return buf;
}

function makeType5Clear(instId = ''): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeUInt8(5, 0);
  if (instId.length > 0) {
    buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  }
  return buf;
}

function makeType10LegacyClear(instId = 'legacy1'): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeUInt8(10, 0);
  buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
  return buf;
}

function createMockIo() {
  const roomEmits: { roomId: string; event: string; payload: any }[] = [];
  const socketEmits: { targetId: string; event: string; payload: any }[] = [];
  const disconnects: string[] = [];
  const mockSockets = new Map<string, any>();

  const registerSocket = (id: string) => {
    const s = {
      id,
      leave: () => {},
      emit: (event: string, payload?: any) => {
        socketEmits.push({ targetId: id, event, payload });
      },
      broadcast: {
        to: (roomId: string) => ({
          emit: (event: string, payload?: any) => {
            roomEmits.push({ roomId, event, payload });
          },
          volatile: {
            emit: (event: string, payload?: any) => {
              roomEmits.push({ roomId, event, payload });
            },
          },
        }),
      },
      disconnect: (close?: boolean) => {
        if (close !== undefined) disconnects.push(id);
        else disconnects.push(id);
      },
    };
    mockSockets.set(id, s);
    return s;
  };

  const io = {
    to(targetId: string) {
      return {
        emit(event: string, payload?: any) {
          if (mockSockets.has(targetId)) {
            socketEmits.push({ targetId, event, payload });
          } else {
            roomEmits.push({ roomId: targetId, event, payload });
          }
        },
      };
    },
    sockets: {
      sockets: mockSockets,
      adapter: { rooms: new Map<string, Set<string>>() },
    },
  };

  return { io, roomEmits, socketEmits, disconnects, registerSocket };
}

function setStale(player: Player, staleTs: number) {
  player.lastActivity = staleTs;
  player.afkWarningSent = true;
}

function isUnchanged(player: Player, expectedTs: number): boolean {
  return player.lastActivity === expectedTs && player.afkWarningSent === true;
}

function isRefreshed(player: Player, expectedTs: number): boolean {
  return player.lastActivity === expectedTs && player.afkWarningSent === false;
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

async function runDeterministicPartAandB() {
  console.log('--- PART A & B: INVALID VS GENUINE ACTIVITY UPDATES ---');
  const realDateNow = Date.now;
  let mockNow = 1_750_000_000_000;
  Date.now = () => mockNow;

  const { io, roomEmits, registerSocket } = createMockIo();
  const rm = new RoomManager();
  rm.setIo(io as any);
  stopManagerTimers(rm);

  const chatLimits = new Map<string, number[]>();
  const guessLimits = new Map<string, number[]>();
  const voteKickLimits = new Map<string, number[]>();
  const roundSyncLimits = new Map<string, number[]>();
  const drawRepairLimits = new Map<string, number[]>();
  const drawRateLimiter = new DrawRateLimiter();
  const controlRateLimiter = new ControlRateLimiter();

  try {
    // Experimental / Competitive Room
    const compRoomId = 'General #Test';
    const compRoom = rm.createRoom(compRoomId);
    const drawerPlayer = makePlayer('sock-drawer', 'Drawer', 'avatar1', 'pid-drawer');
    const guesserPlayer = makePlayer('sock-guesser', 'Guesser', 'avatar2', 'pid-guesser');
    const spectatorPlayer = makePlayer('sock-spec', 'Spectator', 'avatar3', 'pid-spec');
    rm.addPlayerToRoom(compRoomId, drawerPlayer);
    rm.addPlayerToRoom(compRoomId, guesserPlayer);
    rm.addPlayerToRoom(compRoomId, spectatorPlayer);

    const drawerSock = registerSocket('sock-drawer');
    const guesserSock = registerSocket('sock-guesser');
    const specSock = registerSocket('sock-spec');

    // Free Draw Room
    const freeRoomId = 'free';
    const freeRoom = rm.createRoom(freeRoomId);
    const fdPlayer = makePlayer('sock-fd1', 'FreeDrawer', 'avatar4', 'pid-fd1');
    const fdSpec = makePlayer('sock-fd2', 'FreeSpec', 'avatar5', 'pid-fd2');
    rm.addPlayerToRoom(freeRoomId, fdPlayer);
    rm.addPlayerToRoom(freeRoomId, fdSpec);
    const fdSock = registerSocket('sock-fd1');
    const fdSpecSock = registerSocket('sock-fd2');

    const staleTs = mockNow - 150_000; // 150s stale (warning already sent)
    mockNow += 1_000;

    // ────────── PART A: INVALID & PASSIVE ACTIVITY MUST NOT REFRESH ──────────

    // A2. Invalid chat payloads + answer leak + rate-limited chat
    setStale(guesserPlayer, staleTs);
    compRoom.gameState.status = 'DRAWING';
    compRoom.gameState.currentDrawerId = 'pid-drawer';
    compRoom.gameState.currentWord = 'قطة';

    handleSendMessage(guesserSock, null, { io, roomManager: rm, chatLimits, checkRateLimit, normalizeArabic });
    handleSendMessage(guesserSock, { text: '   ' }, { io, roomManager: rm, chatLimits, checkRateLimit, normalizeArabic });
    handleSendMessage(guesserSock, { text: 'x'.repeat(1001) }, { io, roomManager: rm, chatLimits, checkRateLimit, normalizeArabic });
    handleSendMessage(guesserSock, { text: 'الإجابة قطة' }, { io, roomManager: rm, chatLimits, checkRateLimit, normalizeArabic });
    check(
      isUnchanged(guesserPlayer, staleTs),
      'A2a. Invalid chat payloads & word-leak warning leave lastActivity and afkWarningSent unchanged'
    );

    // Exhaust chat RL (5 allowed) then make stale and send 6th rate-limited chat
    for (let i = 0; i < 5; i++) {
      handleSendMessage(specSock, { text: `hi ${i}` }, { io, roomManager: rm, chatLimits, checkRateLimit, normalizeArabic });
    }
    setStale(spectatorPlayer, staleTs);
    handleSendMessage(specSock, { text: 'rate limited msg' }, { io, roomManager: rm, chatLimits, checkRateLimit, normalizeArabic });
    check(
      isUnchanged(spectatorPlayer, staleTs),
      'A2b. Rate-limited chat leaves lastActivity and afkWarningSent unchanged'
    );

    // A3. Invalid, unauthorized, wrong-phase, duplicate, rate-limited guess
    setStale(drawerPlayer, staleTs);
    handleSubmitGuess(drawerSock, { guess: 'قطة' }, { roomManager: rm, guessLimits, checkRateLimit }); // drawer cannot guess
    check(
      isUnchanged(drawerPlayer, staleTs),
      'A3a. Drawer submitting guess (unauthorized) leaves activity unchanged'
    );

    setStale(guesserPlayer, staleTs);
    handleSubmitGuess(guesserSock, ['bad'], { roomManager: rm, guessLimits, checkRateLimit });
    handleSubmitGuess(guesserSock, { guess: '   ' }, { roomManager: rm, guessLimits, checkRateLimit });
    handleSubmitGuess(guesserSock, { guess: 'a'.repeat(1001) }, { roomManager: rm, guessLimits, checkRateLimit });
    compRoom.gameState.status = 'WAITING';
    handleSubmitGuess(guesserSock, { guess: 'قطة' }, { roomManager: rm, guessLimits, checkRateLimit }); // wrong phase
    compRoom.gameState.status = 'DRAWING';
    compRoom.gameState.correctGuessers.push('pid-guesser');
    handleSubmitGuess(guesserSock, { guess: 'كلمة' }, { roomManager: rm, guessLimits, checkRateLimit }); // already guessed
    compRoom.gameState.correctGuessers = [];
    check(
      isUnchanged(guesserPlayer, staleTs),
      'A3b. Invalid payload, wrong-phase, and duplicate guesses leave activity unchanged'
    );

    // Exhaust guess RL then test rate-limited guess
    mockNow += 5_000;
    for (let i = 0; i < 5; i++) {
      handleSubmitGuess(specSock, { guess: `wrong_${i}` }, { roomManager: rm, guessLimits, checkRateLimit });
    }
    setStale(spectatorPlayer, staleTs);
    handleSubmitGuess(specSock, { guess: 'wrong_rl' }, { roomManager: rm, guessLimits, checkRateLimit });
    check(
      isUnchanged(spectatorPlayer, staleTs),
      'A3c. Rate-limited guess leaves lastActivity and afkWarningSent unchanged'
    );

    // A4. Unauthorized skip_turn
    setStale(guesserPlayer, staleTs);
    rm.handleSkipTurn(compRoomId, 'sock-guesser');
    check(
      isUnchanged(guesserPlayer, staleTs),
      'A4a. Non-drawer skip_turn leaves activity unchanged'
    );
    setStale(drawerPlayer, staleTs);
    compRoom.gameState.status = 'ROUND_END';
    rm.handleSkipTurn(compRoomId, 'sock-drawer');
    compRoom.gameState.status = 'DRAWING';
    check(
      isUnchanged(drawerPlayer, staleTs),
      'A4b. Drawer skip_turn during invalid phase (ROUND_END) leaves activity unchanged'
    );

    // A5. Invalid word selection
    compRoom.gameState.status = 'CHOOSING';
    compRoom.gameState.wordOptions = ['سيارة', 'بيت'];
    setStale(guesserPlayer, staleTs);
    handleSelectWord(guesserSock, { word: 'سيارة' }, { roomManager: rm });
    check(
      isUnchanged(guesserPlayer, staleTs),
      'A5a. Non-drawer select_word leaves activity unchanged'
    );
    setStale(drawerPlayer, staleTs);
    handleSelectWord(drawerSock, { word: 'غير_موجود' }, { roomManager: rm });
    handleSelectWord(drawerSock, { word: 'a'.repeat(129) }, { roomManager: rm });
    handleSelectWord(drawerSock, ['سيارة'], { roomManager: rm });
    compRoom.gameState.status = 'WAITING';
    handleSelectWord(drawerSock, { word: 'سيارة' }, { roomManager: rm });
    check(
      isUnchanged(drawerPlayer, staleTs),
      'A5b. Invalid/wrong-phase word selection leaves drawer activity unchanged'
    );

    // A6. Unauthorized drawing & rate-limited draw_binary & Free Draw non-active drawer
    compRoom.gameState.status = 'DRAWING';
    setStale(guesserPlayer, staleTs);
    handleDrawBinary(guesserSock, makeBucketType4(), { io, roomManager: rm, drawRateLimiter, now: () => mockNow });
    check(
      isUnchanged(guesserPlayer, staleTs),
      'A6a. Unauthorized draw_binary in competitive room leaves non-drawer activity unchanged'
    );

    setStale(fdSpec, staleTs); // not in activeDrawers
    handleDrawBinary(fdSpecSock, makeBucketType4(), { io, roomManager: rm, drawRateLimiter, now: () => mockNow });
    handleStartFreeDraw(guesserSock, { roomManager: rm, controlRateLimiter }); // non-FreeDraw room
    setStale(guesserPlayer, staleTs);
    handleStartFreeDraw(guesserSock, { roomManager: rm, controlRateLimiter });
    check(
      isUnchanged(fdSpec, staleTs) && isUnchanged(guesserPlayer, staleTs),
      'A6b. Non-active Free Draw drawing and start_free_draw in competitive room leave activity unchanged'
    );

    // Rate-limited draw_binary & rejected canonical draw_end (orphaned Type 3)
    setStale(drawerPlayer, staleTs);
    handleDrawBinary(drawerSock, makeType3End('orphan1', 0, 99, 2), { io, roomManager: rm, drawRateLimiter, now: () => mockNow });
    check(
      isUnchanged(drawerPlayer, staleTs),
      'A6c. Orphaned canonical Type 3 draw_end rejected without refreshing activity'
    );
    const exhaustedLimiter = new DrawRateLimiter({ maxPackets: 1, packetRefillPerSec: 0, maxWorkUnits: 1000, workRefillPerSec: 0 });
    exhaustedLimiter.consume('sock-drawer', 17, mockNow); // consume the 1 token
    setStale(drawerPlayer, staleTs);
    handleDrawBinary(drawerSock, makeBucketType4(), { io, roomManager: rm, drawRateLimiter: exhaustedLimiter, now: () => mockNow });
    check(
      isUnchanged(drawerPlayer, staleTs),
      'A6d. Rate-limited draw_binary leaves lastActivity and afkWarningSent unchanged'
    );

    // A7. Invalid vote-kick (self-vote, unknown target, invalid payload, rate-limited)
    setStale(drawerPlayer, staleTs);
    handleSubmitVoteKick(drawerSock, { targetPlayerId: 'pid-drawer' }, undefined, { io, roomManager: rm, voteKickLimits, checkRateLimit });
    handleSubmitVoteKick(drawerSock, { targetPlayerId: 'pid-unknown' }, undefined, { io, roomManager: rm, voteKickLimits, checkRateLimit });
    handleSubmitVoteKick(drawerSock, ['bad'], undefined, { io, roomManager: rm, voteKickLimits, checkRateLimit });
    check(
      isUnchanged(drawerPlayer, staleTs),
      'A7a. Self-vote, missing target, and invalid vote-kick payload leave activity unchanged'
    );

    mockNow += 5_000;
    for (let i = 0; i < 3; i++) {
      handleSubmitVoteKick(spectatorPlayer.id === 'sock-spec' ? specSock : specSock, { targetPlayerId: 'pid-guesser' }, undefined, { io, roomManager: rm, voteKickLimits, checkRateLimit });
    }
    setStale(spectatorPlayer, staleTs);
    handleSubmitVoteKick(specSock, { targetPlayerId: 'pid-guesser' }, undefined, { io, roomManager: rm, voteKickLimits, checkRateLimit });
    check(
      isUnchanged(spectatorPlayer, staleTs),
      'A7b. Rate-limited vote-kick leaves activity unchanged'
    );

    // A8. Passive events never refresh activity
    setStale(fdPlayer, staleTs);
    handleGetRoomInfo(freeRoomId, () => {}, { roomManager: rm, getRoomConfig, controlRateLimiter, socketId: 'sock-fd1' });
    handleGetRoomsInfo([], () => {}, { roomManager: rm, getRoomConfig, ROOM_PRESETS, controlRateLimiter });
    handleRequestRoundSync(fdSock, () => {}, { roomManager: rm, roundSyncLimits, checkRateLimit, getJsonSafeHistory: (h) => h });
    const capsRes = sanitizeClientCapabilities({ supportsType13: true });
    if (capsRes.valid) rm.setClientCapabilities('sock-fd1', { supportsType13: true });
    handleRegisterDrawingIdentity(fdSock, { instanceId: 'instFD1' }, { roomManager: rm, controlRateLimiter });
    handleRequestDrawingIdentities(fdSock, { roomManager: rm, controlRateLimiter });
    handleUnregisterDrawingIdentity(fdSock, { instanceId: 'instFD1' }, { roomManager: rm, controlRateLimiter });
    handleDrawRepairReq(fdSock, { instId: 'instFD1', strokeId: 1 }, { roomManager: rm, drawRepairLimits, checkRateLimit });
    check(
      isUnchanged(fdPlayer, staleTs),
      'A8. All passive events (get_room_info, get_rooms_info, request_round_sync, client_capabilities, register/unregister/request_drawing_identities, draw_repair_req) leave activity unchanged'
    );

    // ────────── PART B: GENUINE ACTIVITY MUST UPDATE & CLEAR WARNING ──────────

    // B1. Accepted drawing (Type 1 start, Type 2 move, Type 3 commit, Type 4 bucket, Type 7 undo)
    setStale(drawerPlayer, staleTs);
    mockNow += 1_000;
    handleDrawBinary(drawerSock, makeType1Start('brush1', 0), { io, roomManager: rm, drawRateLimiter, now: () => mockNow });
    check(
      isRefreshed(drawerPlayer, mockNow),
      'B1a. Accepted draw_binary Type 1 start updates lastActivity and resets afkWarningSent'
    );

    setStale(drawerPlayer, staleTs);
    mockNow += 1_000;
    handleDrawBinary(drawerSock, makeType2Move('brush1'), { io, roomManager: rm, drawRateLimiter, now: () => mockNow });
    check(
      isRefreshed(drawerPlayer, mockNow),
      'B1b. Accepted draw_binary Type 2 move updates lastActivity and resets afkWarningSent'
    );

    setStale(drawerPlayer, staleTs);
    mockNow += 1_000;
    handleDrawBinary(drawerSock, makeType3End('brush1', 0, 1, 2), { io, roomManager: rm, drawRateLimiter, now: () => mockNow });
    check(
      isRefreshed(drawerPlayer, mockNow),
      'B1c. Accepted canonical Type 3 draw_end commit updates lastActivity and resets afkWarningSent'
    );

    setStale(drawerPlayer, staleTs);
    mockNow += 1_000;
    handleDrawBinary(drawerSock, makeBucketType4('bkt1', 0.5, 0.5, 1), { io, roomManager: rm, drawRateLimiter, now: () => mockNow });
    check(
      isRefreshed(drawerPlayer, mockNow),
      'B1d. Accepted Type 4 bucket fill updates lastActivity and resets afkWarningSent'
    );

    setStale(drawerPlayer, staleTs);
    mockNow += 1_000;
    handleDrawBinary(drawerSock, makeType5Clear('clr1'), { io, roomManager: rm, drawRateLimiter, now: () => mockNow });
    check(
      isRefreshed(drawerPlayer, mockNow),
      'B1e. Accepted Type 5 clear refreshes lastActivity and resets afkWarningSent'
    );

    setStale(drawerPlayer, staleTs);
    mockNow += 1_000;
    const type10Buf = makeType10LegacyClear('leg10');
    const epochBefore10 = compRoom.gameState.drawEpochId ?? 0;
    roomEmits.length = 0;
    handleDrawBinary(drawerSock, type10Buf, { io, roomManager: rm, drawRateLimiter, now: () => mockNow });
    const historyLenAfter10 = compRoom.gameState.drawHistory.length;
    const epochAfter10 = compRoom.gameState.drawEpochId ?? 0;
    const type10Broadcasted = roomEmits.some(
      (e) => e.roomId === compRoomId && e.event === 'draw_binary' && Buffer.isBuffer(e.payload) && e.payload.readUInt8(0) === 10
    );
    check(
      historyLenAfter10 === 1 &&
        Buffer.isBuffer(compRoom.gameState.drawHistory[0]?.data) &&
        compRoom.gameState.drawHistory[0].data[0] === 10 &&
        epochAfter10 === epochBefore10 + 1 &&
        type10Broadcasted &&
        isUnchanged(drawerPlayer, staleTs),
      'B1f. Competitive Type 10 clear resets history to Type 10 marker, advances drawEpochId once, broadcasts cleanly without refreshing activity'
    );

    // B2. Valid chat
    mockNow += 5_000;
    setStale(guesserPlayer, staleTs);
    handleSendMessage(guesserSock, { text: 'hello room' }, { io, roomManager: rm, chatLimits, checkRateLimit, normalizeArabic });
    check(
      isRefreshed(guesserPlayer, mockNow),
      'B2. Valid send_message updates lastActivity and resets afkWarningSent'
    );

    // B3. Valid wrong guess
    mockNow += 5_000;
    setStale(spectatorPlayer, staleTs);
    compRoom.gameState.status = 'DRAWING';
    compRoom.gameState.currentWord = 'تفاحة';
    handleSubmitGuess(specSock, { guess: 'تخمين_خاطئ_تماما' }, { roomManager: rm, guessLimits, checkRateLimit });
    check(
      isRefreshed(spectatorPlayer, mockNow),
      'B3. Valid wrong submit_guess updates lastActivity and resets afkWarningSent'
    );

    // B4. Accepted word selection
    compRoom.gameState.status = 'CHOOSING';
    compRoom.gameState.currentDrawerId = 'pid-drawer';
    compRoom.gameState.wordOptions = ['تفاحة', 'قمر'];
    setStale(drawerPlayer, staleTs);
    mockNow += 1_000;
    handleSelectWord(drawerSock, { word: 'تفاحة' }, { roomManager: rm });
    check(
      isRefreshed(drawerPlayer, mockNow) && readGameStatus(compRoom) === 'DRAWING',
      'B4. Accepted select_word updates lastActivity and resets afkWarningSent'
    );

    // B5. Consumed hint (then rejected extra hint after maxHints)
    setStale(drawerPlayer, staleTs);
    mockNow += 1_000;
    compRoom.gameState.hintsUsed = 0;
    rm.requestHint(compRoomId, 'sock-drawer'); // 5 chars ('تفاحة') -> maxHints = 3, consumes 1st
    check(
      isRefreshed(drawerPlayer, mockNow),
      'B5a. Successfully consumed request_hint updates lastActivity and resets afkWarningSent'
    );
    compRoom.gameState.hintsUsed = 3; // exhausted
    setStale(drawerPlayer, staleTs);
    mockNow += 1_000;
    rm.requestHint(compRoomId, 'sock-drawer');
    check(
      isUnchanged(drawerPlayer, staleTs),
      'B5b. Exhausted request_hint (no hint consumed) leaves activity unchanged'
    );

    // B6. Accepted report (then duplicate report)
    compRoom.gameState.reports = [];
    setStale(guesserPlayer, staleTs);
    mockNow += 1_000;
    rm.reportDrawing(compRoomId, 'sock-guesser');
    check(
      isRefreshed(guesserPlayer, mockNow),
      'B6a. Accepted new report_draw updates lastActivity and resets afkWarningSent'
    );
    setStale(guesserPlayer, staleTs);
    mockNow += 1_000;
    rm.reportDrawing(compRoomId, 'sock-guesser'); // duplicate
    check(
      isUnchanged(guesserPlayer, staleTs),
      'B6b. Duplicate report_draw leaves activity unchanged'
    );

    // B7. Accepted skip_turn
    setStale(drawerPlayer, staleTs);
    mockNow += 1_000;
    rm.handleSkipTurn(compRoomId, 'sock-drawer');
    check(
      isRefreshed(drawerPlayer, mockNow) && readGameStatus(compRoom) === 'ROUND_END',
      'B7. Accepted skip_turn updates lastActivity and resets afkWarningSent'
    );

    // B8. Valid vote and vote withdrawal
    mockNow += 5_000;
    setStale(guesserPlayer, staleTs);
    handleSubmitVoteKick(guesserSock, { targetPlayerId: 'pid-spec' }, undefined, { io, roomManager: rm, voteKickLimits, checkRateLimit });
    check(
      isRefreshed(guesserPlayer, mockNow),
      'B8a. Valid submit_vote_kick vote updates lastActivity and resets afkWarningSent'
    );
    setStale(guesserPlayer, staleTs);
    mockNow += 1_000;
    handleSubmitVoteKick(guesserSock, { targetPlayerId: 'pid-spec' }, undefined, { io, roomManager: rm, voteKickLimits, checkRateLimit });
    check(
      isRefreshed(guesserPlayer, mockNow),
      'B8b. Valid submit_vote_kick withdrawal updates lastActivity and resets afkWarningSent'
    );

    // B9. Accepted Free Draw start & stop toggles
    setStale(fdPlayer, staleTs);
    mockNow += 1_000;
    handleStartFreeDraw(fdSock, { roomManager: rm, controlRateLimiter });
    check(
      isRefreshed(fdPlayer, mockNow),
      'B9a. Accepted start_free_draw updates lastActivity and resets afkWarningSent'
    );
    setStale(fdPlayer, staleTs);
    mockNow += 1_000;
    handleStopFreeDraw(fdSock, { roomManager: rm, controlRateLimiter });
    check(
      isRefreshed(fdPlayer, mockNow),
      'B9b. Accepted stop_free_draw updates lastActivity and resets afkWarningSent'
    );
    // Rate-limited Free Draw toggle does NOT refresh activity
    const fdRl = new ControlRateLimiter();
    for (let i = 0; i < 4; i++) {
      handleStartFreeDraw(fdSock, { roomManager: rm, controlRateLimiter: fdRl });
    }
    setStale(fdPlayer, staleTs);
    handleStopFreeDraw(fdSock, { roomManager: rm, controlRateLimiter: fdRl });
    check(
      isUnchanged(fdPlayer, staleTs),
      'B9c. Rate-limited stop_free_draw (Slice 5C-2) leaves activity unchanged'
    );

    // B10. Explicit ping_activity requires afkWarningSent === true (closed bypass)
    const noWarnTs = mockNow - 50_000;
    fdPlayer.lastActivity = noWarnTs;
    fdPlayer.afkWarningSent = false;
    mockNow += 1_000;
    handlePingActivity(fdSock, rm, mockNow);
    check(
      fdPlayer.lastActivity === noWarnTs && readAfkWarning(fdPlayer) === false,
      'B10a. ping_activity when afkWarningSent is false does not refresh activity'
    );

    mockNow += 2_000;
    handlePingActivity(fdSock, rm, mockNow);
    handlePingActivity(fdSock, rm, mockNow + 500);
    handlePingActivity(fdSock, rm, mockNow + 1_000);
    check(
      fdPlayer.lastActivity === noWarnTs && readAfkWarning(fdPlayer) === false,
      'B10b. Repeated ping_activity while no warning is active never refreshes activity'
    );

    setStale(fdPlayer, staleTs);
    mockNow += 2_000;
    const recoveryTs = mockNow;
    handlePingActivity(fdSock, rm, recoveryTs);
    check(
      isRefreshed(fdPlayer, recoveryTs),
      'B10c. ping_activity when afkWarningSent is true updates lastActivity and resets afkWarningSent'
    );

    mockNow += 5_000;
    handlePingActivity(fdSock, rm, mockNow);
    handlePingActivity(fdSock, rm, mockNow + 1_000);
    check(
      fdPlayer.lastActivity === recoveryTs && readAfkWarning(fdPlayer) === false,
      'B10d. Repeated ping_activity after successful recovery is ignored'
    );
  } finally {
    Date.now = realDateNow;
    stopManagerTimers(rm);
  }
}

async function runLifecycleAndSecurityPartCandD() {
  console.log('\n--- PART C & D: JOIN/RECONNECT LIFECYCLE & AFK EVICTION SECURITY ---');
  const realDateNow = Date.now;
  let mockNow = 1_800_000_000_000;
  Date.now = () => mockNow;

  const { io, socketEmits, disconnects, registerSocket } = createMockIo();
  const rm = new RoomManager();
  rm.setIo(io as any);
  stopManagerTimers(rm);

  const chatLimits = new Map<string, number[]>();
  const roundSyncLimits = new Map<string, number[]>();
  const drawRepairLimits = new Map<string, number[]>();
  const controlRateLimiter = new ControlRateLimiter();

  try {
    const roomId = 'classic';
    const room = rm.createRoom(roomId);
    const p1 = makePlayer('s-life-1', 'LifeOne', 'avatar1', 'pid-life-1');
    p1.afkWarningSent = true;
    p1.lastActivity = 12345;

    // C1. Successful join resets lastActivity and afkWarningSent
    rm.addPlayerToRoom(roomId, p1);
    registerSocket('s-life-1');
    rm.commitNewJoinCredential('pid-life-1', 'secret-life-1-0123456789ab');
    check(
      p1.lastActivity === mockNow && readAfkWarning(p1) === false,
      'C1. Successful addPlayerToRoom sets lastActivity and resets afkWarningSent = false'
    );

    // C2 & C3. Failed reconnect leaves activity stale; valid reconnect refreshes
    const staleTs = mockNow - 160_000;
    p1.lastActivity = staleTs;
    p1.afkWarningSent = true;
    mockNow += 1_000;

    const badRecon = rm.reconnectPlayer(roomId, 'pid-life-1', 'LifeOne', 's-life-attacker', 'wrong-secret');
    const missingRecon = rm.reconnectPlayer(roomId, 'pid-nope', 'Ghost', 's-life-attacker', 'wrong-secret');
    check(
      badRecon.status === 'auth_failed' &&
        missingRecon.status === 'not_found' &&
        p1.lastActivity === staleTs &&
        p1.afkWarningSent === true,
      'C2. Failed reconnect (auth_failed / not_found) does not refresh lastActivity or afkWarningSent'
    );

    const goodRecon = rm.reconnectPlayer(roomId, 'pid-life-1', 'LifeOne', 's-life-2', 'secret-life-1-0123456789ab');
    registerSocket('s-life-2');
    check(
      goodRecon.status === 'reconnected' && p1.lastActivity === mockNow && readAfkWarning(p1) === false,
      'C3. Successful reconnectPlayer updates lastActivity and resets afkWarningSent = false'
    );

    // C4 & D1/D2/D3. Exact 140s warning + 230s eviction thresholds hold despite passive & rate-limited floods
    // Add p2 to test concurrent AFK timer with passive/RL floods
    const p2 = makePlayer('s-life-bystander', 'Bystander', 'avatar2', 'pid-life-2');
    rm.addPlayerToRoom(roomId, p2);
    registerSocket('s-life-bystander');

    const startTs = mockNow;
    // Advance +139s -> NO warning yet
    mockNow = startTs + 139_000;
    (rm as any).tick();
    check(
      readAfkWarning(p1) === false &&
        !socketEmits.some((e) => e.targetId === 's-life-2' && e.event === 'afk_warning'),
      'C4a. At 139s idle (below 140s threshold), no afk_warning is emitted'
    );

    // Flood passive events & rate-limited chat right before 140s..230s
    for (let i = 0; i < 6; i++) {
      handleSendMessage({ id: 's-life-2' }, { text: `spam ${i}` }, { io, roomManager: rm, chatLimits, checkRateLimit, normalizeArabic });
    }
    // Wait: first 5 chat messages above succeeded and refreshed p1 at +139s!
    // Reset test anchor cleanly: let p1 go stale from anchorTs without genuine events!
    const anchorTs = mockNow;
    p1.lastActivity = anchorTs;
    p1.afkWarningSent = false;
    // Also exhaust p1's chat RL quota at anchorTs, then freeze p1 at anchorTs!
    // Use separate test user p3 whose chat RL was exhausted at anchorTs and then ONLY gets flooded with RL + passive events:
    const p3 = makePlayer('s-evade', 'Evader', 'avatar3', 'pid-evade');
    rm.addPlayerToRoom(roomId, p3);
    const evadeSock = registerSocket('s-evade');
    for (let i = 0; i < 5; i++) {
      handleSendMessage({ id: 's-evade' }, { text: `burst ${i}` }, { io, roomManager: rm, chatLimits, checkRateLimit, normalizeArabic });
    }
    const evadeStartTs = p3.lastActivity!;

    // At +141s: fire rate-limited chat, passive events, and unauthorized draw, then run tick()
    mockNow = evadeStartTs + 141_000;
    // Rate-limited? Wait: 141s passed so chat RL window reset; test short window first at +1s:
    mockNow = evadeStartTs + 500;
    p3.lastActivity = evadeStartTs;
    for (let i = 0; i < 10; i++) {
      handleSendMessage({ id: 's-evade' }, { text: 'rl_blocked' }, { io, roomManager: rm, chatLimits, checkRateLimit, normalizeArabic });
    }
    check(
      p3.lastActivity === evadeStartTs,
      'D3a. Rate-limited chat burst at +500ms does not advance lastActivity'
    );

    // Advance +141s while hammering passive events & unauthorized actions
    mockNow = evadeStartTs + 141_000;
    for (let i = 0; i < 5; i++) {
      handleGetRoomInfo(roomId, () => {}, { roomManager: rm, getRoomConfig, controlRateLimiter, socketId: 's-evade' });
      handleRequestRoundSync(evadeSock, () => {}, { roomManager: rm, roundSyncLimits, checkRateLimit, getJsonSafeHistory: (h) => h });
      handleDrawRepairReq(evadeSock, { instId: 'inst1', strokeId: 1 }, { roomManager: rm, drawRepairLimits, checkRateLimit });
      rm.handleSkipTurn(roomId, 's-evade');
    }
    socketEmits.length = 0;
    p1.lastActivity = mockNow; // keep p1 active so only p3 hits AFK
    p2.lastActivity = mockNow;
    (rm as any).tick();

    const p3Warned = socketEmits.some(
      (e) => e.targetId === 's-evade' && e.event === 'afk_warning' && e.payload?.secondsLeft === 89
    );
    check(
      p3.afkWarningSent === true && p3Warned,
      'C4b & D2. Passive + unauthorized flood does not prevent 140s afk_warning (secondsLeft=89)'
    );

    // Advance +231s (past 140s + 90s = 230s), continue hammering passive/unauthorized/invalid events -> MUST evict p3
    mockNow = evadeStartTs + 231_000;
    p1.lastActivity = mockNow;
    p2.lastActivity = mockNow;
    for (let i = 0; i < 5; i++) {
      handleGetRoomsInfo([], () => {}, { roomManager: rm, getRoomConfig, ROOM_PRESETS, controlRateLimiter });
      handleGetRoomInfo(roomId, () => {}, { roomManager: rm, getRoomConfig, controlRateLimiter, socketId: 's-evade' });
      handleSendMessage({ id: 's-evade' }, { text: '   ' }, { io, roomManager: rm, chatLimits, checkRateLimit, normalizeArabic });
    }
    socketEmits.length = 0;
    disconnects.length = 0;
    (rm as any).tick();

    const p3Expired = socketEmits.some(
      (e) => e.targetId === 's-evade' && e.event === 'session_expired' && e.payload?.reason === 'afk_idle'
    );
    const p3StillPresent = room.players.some((p) => p.id === 's-evade');
    check(
      p3Expired && !p3StillPresent && disconnects.includes('s-evade'),
      'C4c. At >230s (140s + 90s), passive & malformed event floods do not prevent AFK eviction (afk_idle)'
    );
  } finally {
    Date.now = realDateNow;
    stopManagerTimers(rm);
  }
}

async function runLiveSocketIoPartD() {
  console.log('\n--- PART E: LIVE SOCKET.IO + MSGPACK (NO socket.onAny UNKNOWN-EVENT BYPASS) ---');
  let httpServer: HttpServer | null = null;
  let io: Server | null = null;
  let rm: RoomManager | null = null;
  const clients: ClientSocket[] = [];

  try {
    httpServer = createServer();
    io = new Server(httpServer, {
      parser: customParser,
      cors: { origin: '*' },
    });
    rm = new RoomManager();
    rm.setIo(io);
    stopManagerTimers(rm);

    const chatLimits = new Map<string, number[]>();
    const guessLimits = new Map<string, number[]>();
    const voteKickLimits = new Map<string, number[]>();
    const roundSyncLimits = new Map<string, number[]>();
    const drawRepairLimits = new Map<string, number[]>();
    const drawRateLimiter = new DrawRateLimiter();
    const controlRateLimiter = new ControlRateLimiter();

    io.on('connection', (socket) => {
      // Production wiring WITHOUT socket.onAny / PASSIVE_BACKGROUND_EVENTS
      socket.on('get_room_info', (roomId, cb) => {
        handleGetRoomInfo(roomId, cb, {
          roomManager: rm!,
          getRoomConfig,
          controlRateLimiter,
          socketId: socket.id,
        });
      });
      registerGetRoomsInfoHandler(socket, {
        roomManager: rm!,
        getRoomConfig,
        ROOM_PRESETS,
        controlRateLimiter,
      });
      socket.on('client_capabilities', (caps) => {
        const parsed = sanitizeClientCapabilities(caps);
        if (parsed.valid) {
          rm!.setClientCapabilities(
            socket.id,
            parsed.hasSupportsType13 ? { supportsType13: parsed.supportsType13 } : {}
          );
        }
      });
      registerJoinRoomHandler(socket, { io: io!, roomManager: rm!, controlRateLimiter });
      registerRequestRoundSyncHandler(socket, {
        roomManager: rm!,
        roundSyncLimits,
        checkRateLimit,
        getJsonSafeHistory: (h) => h,
      });
      registerLeaveRoomHandler(socket, { io: io!, roomManager: rm! });
      registerDrawBinaryHandler(socket, { io: io!, roomManager: rm!, drawRateLimiter });
      socket.on('draw_repair_req', (data) => {
        handleDrawRepairReq(socket, data, {
          roomManager: rm!,
          drawRepairLimits,
          checkRateLimit,
        });
      });
      socket.on('start_free_draw', () => {
        handleStartFreeDraw(socket, { roomManager: rm!, controlRateLimiter });
      });
      registerDrawingIdentityHandlers(socket, { roomManager: rm!, controlRateLimiter });
      socket.on('request_drawing_identities', () => {
        handleRequestDrawingIdentities(socket, { roomManager: rm!, controlRateLimiter });
      });
      socket.on('stop_free_draw', () => {
        handleStopFreeDraw(socket, { roomManager: rm!, controlRateLimiter });
      });
      registerSelectWordHandler(socket, { roomManager: rm! });
      registerSubmitGuessHandler(socket, { roomManager: rm!, guessLimits, checkRateLimit });
      registerSendMessageHandler(socket, {
        io: io!,
        roomManager: rm!,
        chatLimits,
        checkRateLimit,
        normalizeArabic,
      });
      registerVoteKickHandler(socket, {
        io: io!,
        roomManager: rm!,
        voteKickLimits,
        checkRateLimit,
      });
      socket.on('ping_activity', () => {
        handlePingActivity(socket, rm!);
      });
    });

    await new Promise<void>((resolve) => httpServer!.listen(0, '127.0.0.1', resolve));
    const port = (httpServer.address() as AddressInfo).port;
    const url = `http://127.0.0.1:${port}`;

    const c1 = ioClient(url, { parser: customParser, transports: ['websocket'], forceNew: true });
    clients.push(c1);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Connect timeout')), 4000);
      c1.once('connect', () => {
        clearTimeout(t);
        resolve();
      });
      c1.once('connect_error', reject);
    });

    const roomId = 'free';
    rm.createRoom(roomId);
    const j1 = await emitWithAck<any>(c1, 'join_room', {
      roomId,
      nickname: 'LiveAfkTester',
      playerId: 'live-afk-1',
      reconnectSecret: 'secret-live-afk-0123456789abcdef',
    });
    check(j1?.success === true, 'Live client joined Free Draw room');

    const p = rm.getPlayer(c1.id!)!;
    const staleLiveTs = Date.now() - 160_000;
    p.lastActivity = staleLiveTs;
    p.afkWarningSent = true;

    // Hammer unknown events & passive events over real Socket.IO + MsgPack wire
    c1.emit('unknown_spoof_keepalive', { keep: true });
    c1.emit('arbitrary_custom_event_xyz', 123);
    c1.emit('client_capabilities', { supportsType13: true });
    c1.emit('register_drawing_identity', { instanceId: 'live1' });
    c1.emit('request_drawing_identities');
    c1.emit('unregister_drawing_identity', { instanceId: 'live1' });
    await emitWithAck(c1, 'get_room_info', roomId);
    await emitWithAck(c1, 'get_rooms_info', [roomId]);
    await emitWithAck(c1, 'request_round_sync');
    await new Promise((r) => setTimeout(r, 60));

    check(
      p.lastActivity === staleLiveTs && p.afkWarningSent === true,
      'D1. Repeated unknown events & passive requests over live Socket.IO leave lastActivity and afkWarningSent unchanged'
    );

    // Failed join_room (invalid auth / invalid payload) leaves existing player activity stale
    const badJoinAck = await emitWithAck<any>(c1, 'join_room', {
      roomId,
      nickname: 'LiveAfkTester',
      playerId: 'live-afk-1',
      reconnectSecret: 'wrong-secret-0123456789abcdef',
    });
    check(
      badJoinAck?.success === false && p.lastActivity === staleLiveTs && p.afkWarningSent === true,
      'C2b. Failed join_room reconnect leaves lastActivity and afkWarningSent unchanged'
    );

    // Unwarned ping_activity spam over live Socket.IO is ignored (cannot bypass AFK clock)
    const unwarnedTs = Date.now() - 80_000;
    p.lastActivity = unwarnedTs;
    p.afkWarningSent = false;
    c1.emit('ping_activity');
    c1.emit('ping_activity');
    c1.emit('ping_activity');
    await new Promise((r) => setTimeout(r, 60));
    check(
      p.lastActivity === unwarnedTs && readAfkWarning(p) === false,
      'Live repeated ping_activity while afkWarningSent is false does not refresh activity'
    );

    // Genuine ping_activity over live Socket.IO when afkWarningSent === true refreshes p, then subsequent spam is ignored
    p.lastActivity = staleLiveTs;
    p.afkWarningSent = true;
    c1.emit('ping_activity');
    await new Promise((r) => setTimeout(r, 60));
    const liveRecoveryTs = p.lastActivity || 0;
    check(
      liveRecoveryTs > staleLiveTs && readAfkWarning(p) === false,
      'Live ping_activity when afkWarningSent is true refreshes lastActivity and clears afkWarningSent'
    );

    await new Promise((r) => setTimeout(r, 30));
    c1.emit('ping_activity');
    c1.emit('ping_activity');
    await new Promise((r) => setTimeout(r, 60));
    check(
      p.lastActivity === liveRecoveryTs && readAfkWarning(p) === false,
      'Live repeated ping_activity after recovery does not advance lastActivity'
    );

    // Genuine send_message over live Socket.IO refreshes p
    p.lastActivity = staleLiveTs;
    p.afkWarningSent = true;
    c1.emit('send_message', { text: 'genuine live chat' });
    await new Promise((r) => setTimeout(r, 60));
    check(
      (p.lastActivity || 0) > staleLiveTs && readAfkWarning(p) === false,
      'Live genuine send_message refreshes lastActivity and clears afkWarningSent'
    );
  } finally {
    for (const c of clients) {
      try {
        c.disconnect();
      } catch {
        // ignore
      }
    }
    if (rm) stopManagerTimers(rm);
    if (io) {
      await new Promise<void>((resolve) => io!.close(() => resolve()));
    } else if (httpServer) {
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    }
  }
}

async function main() {
  try {
    await runDeterministicPartAandB();
    await runLifecycleAndSecurityPartCandD();
    await runLiveSocketIoPartD();
  } catch (err) {
    failCount++;
    console.error('❌ UNHANDLED ERROR:', err);
  }

  console.log('\n==================================================================');
  console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
  console.log('==================================================================');
  process.exit(failCount === 0 ? 0 : 1);
}

main();

import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import customParser from 'socket.io-msgpack-parser';

import { RoomManager, normalizeArabic } from '../server/rooms.js';
import { MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES } from '../server/transportConfig.js';
import { getRoomConfig } from '../src/types/game.js';
import { extractFirstEmoji } from '../src/components/game/CustomEmojiModal.js';
import { handleJoinRoom } from '../server/registerJoinRoomHandler.js';
import {
  handleRegisterDrawingIdentity,
  handleUnregisterDrawingIdentity,
} from '../server/registerDrawingIdentityHandlers.js';
import { handleSendMessage } from '../server/registerSendMessageHandler.js';
import { handleSubmitGuess } from '../server/registerSubmitGuessHandler.js';
import { handleSelectWord } from '../server/registerSelectWordHandler.js';
import { handleSubmitVoteKick } from '../server/registerVoteKickHandler.js';
import { checkRateLimit } from '../server/rateLimit.js';
import {
  sanitizeClientCapabilities,
  handleGetRoomInfo,
  handleDrawRepairReq,
} from '../server/controlInputValidation.js';

console.log('==================================================================');
console.log('🛡️  PHASE 9A — SLICE 5C-1: INPUT BOUNDARIES & IDENTITY PROTECTION');
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
  const phaseDeadlineTimers: Map<string, NodeJS.Timeout> | undefined = (rm as any).phaseDeadlineTimers;
  if (phaseDeadlineTimers) {
    for (const timer of phaseDeadlineTimers.values()) clearTimeout(timer);
    phaseDeadlineTimers.clear();
  }
}

function createRecordingSocket(id: string) {
  const joinedRooms: string[] = [];
  const socketEmits: { event: string; payload: any }[] = [];
  const socket = {
    id,
    join: (rId: string) => joinedRooms.push(rId),
    emit: (event: string, payload: any) => socketEmits.push({ event, payload }),
    joinedRooms,
    socketEmits,
  };
  return socket;
}

function createRecordingIo(activeSocketIds: Set<string>) {
  const broadcasts: { roomId: string; event: string; payload: any }[] = [];
  const socketsMap = new Map<string, any>();
  for (const id of activeSocketIds) {
    socketsMap.set(id, { id, emit: () => {}, leave: () => {}, disconnect: () => {} });
  }
  const io: any = {
    to: (roomId: string) => ({
      emit: (event: string, payload: any) => {
        broadcasts.push({ roomId, event, payload });
      },
    }),
    sockets: {
      sockets: socketsMap,
    },
  };
  return { io, broadcasts, socketsMap };
}

async function waitForEvent(socket: ClientSocket, event: string, timeoutMs = 1500): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for "${event}"`));
    }, timeoutMs);
    socket.once(event, (data: any) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function emitWithAck(socket: ClientSocket, event: string, payload: any, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ack of "${event}"`));
    }, timeoutMs);
    socket.emit(event, payload, (res: any) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

async function runTests() {
  // =========================================================================
  // PART A: join_room Server-Side Input Boundaries
  // =========================================================================
  console.log('--- Part A: join_room Input Boundaries ---');
  {
    const rm = new RoomManager();
    const { io, broadcasts } = createRecordingIo(new Set(['s-valid-1', 's-valid-2', 's-valid-3', 's-valid-4']));
    rm.setIo(io);
    try {
      const deps = { io, roomManager: rm, getRoomConfig };

      // A1. Valid current client payload (with emoji avatar & supportsType13)
      {
        const sock = createRecordingSocket('s-valid-1');
        let ack: any = null;
        handleJoinRoom(
          sock,
          {
            roomId: 'General #Test',
            nickname: 'NetDrawerAuth',
            avatar: '🎨',
            playerId: 'usr-valid-alice-001',
            reconnectSecret: 'sec-valid-alice-secret-123456',
            reconnectOnly: false,
            supportsType13: true,
          },
          (r) => (ack = r),
          deps
        );
        check(
          ack?.success === true &&
            rm.getPlayer('s-valid-1')?.name === 'NetDrawerAuth' &&
            rm.isClientType13Capable('s-valid-1') === true,
          'A1. Valid join_room with "NetDrawerAuth" (13 chars), emoji avatar, and supportsType13 succeeds'
        );
      }

      // A2. Compatibility: '  أحمد  ' with surrounding whitespace
      {
        const sock = createRecordingSocket('s-valid-2');
        let ack: any = null;
        handleJoinRoom(
          sock,
          {
            roomId: 'General #Test',
            nickname: '  أحمد  ',
            playerId: 'usr-valid-ahmed-002',
            reconnectSecret: 'sec-valid-ahmed-secret-123456',
          },
          (r) => (ack = r),
          deps
        );
        check(
          ack?.success === true && rm.getPlayer('s-valid-2')?.name === '  أحمد  ',
          'A2. Compatibility: "  أحمد  " (surrounding whitespace + omitted optional avatar) succeeds'
        );
      }

      // A3. Compatibility: country flags, subdivision tag flags, and ZWJ emoji sequences (<= 32 UTF-16 code units)
      {
        const saFlag = extractFirstEmoji('🇸🇦') || '🇸🇦';
        const familyZwj = extractFirstEmoji('👨‍👩‍👧‍👦') || '👨‍👩‍👧‍👦';
        const coupleSkinZwj = extractFirstEmoji('👩🏽‍❤️‍💋‍👨🏿') || '👩🏽‍❤️‍💋‍👨🏿';
        const scotlandTagFlag = '🏴󠁧󠁢󠁳󠁣󠁴󠁿';

        const validAvatars = [
          { sockId: 's-valid-3', pid: 'usr-valid-flag-003', nick: 'FlagUser', av: saFlag },
          { sockId: 's-valid-4', pid: 'usr-valid-zwj-004', nick: 'ZwjUser', av: coupleSkinZwj },
        ];
        let allAvatarOk = true;
        for (const item of validAvatars) {
          const sock = createRecordingSocket(item.sockId);
          let ack: any = null;
          handleJoinRoom(
            sock,
            {
              roomId: 'General #10P',
              nickname: item.nick,
              avatar: item.av,
              playerId: item.pid,
              reconnectSecret: `sec-${item.pid}-123456`,
            },
            (r) => (ack = r),
            deps
          );
          if (!ack?.success) allAvatarOk = false;
        }

        // Also test tag flag (14 UTF-16 code units) and 4-person family ZWJ (11 UTF-16 code units)
        const s5 = createRecordingSocket('s-valid-5');
        let ack5: any = null;
        handleJoinRoom(
          s5,
          {
            roomId: 'General #10P',
            nickname: 'TagFlag',
            avatar: scotlandTagFlag,
            playerId: 'usr-valid-tagflag-005',
            reconnectSecret: 'sec-valid-tagflag-123456',
          },
          (r) => (ack5 = r),
          deps
        );
        const s6 = createRecordingSocket('s-valid-6');
        let ack6: any = null;
        handleJoinRoom(
          s6,
          {
            roomId: 'General #10P',
            nickname: 'FamilyZwj',
            avatar: familyZwj,
            playerId: 'usr-valid-fam-006',
            reconnectSecret: 'sec-valid-fam-123456',
          },
          (r) => (ack6 = r),
          deps
        );

        check(
          allAvatarOk && ack5?.success === true && ack6?.success === true &&
            scotlandTagFlag.length === 14 && coupleSkinZwj.length === 15,
          `A3. Flags & complex ZWJ emojis pass (flag=${saFlag.length}, family=${familyZwj.length}, tag=${scotlandTagFlag.length}, coupleSkin=${coupleSkinZwj.length} <= 32 UTF-16)`
        );
      }

      // A4. Reject invalid payloads with zero room/player/authStore/capabilities/broadcast side effects
      {
        const genRoomBefore = rm.getRoom('General #Test')!;
        const playersBefore = genRoomBefore.players.length;
        const chatBefore = (genRoomBefore.chatMessages || []).length;
        const authSizeBefore = rm.authStore.size;
        const broadcastsBefore = broadcasts.length;

        const invalidCases: { label: string; payload: any; expectError?: string }[] = [
          { label: 'null payload', payload: null, expectError: 'invalid_payload' },
          { label: 'undefined payload', payload: undefined, expectError: 'invalid_payload' },
          { label: 'primitive string payload', payload: 'General #Test', expectError: 'invalid_payload' },
          { label: 'primitive number payload', payload: 12345, expectError: 'invalid_payload' },
          { label: 'array payload', payload: ['General #Test'], expectError: 'invalid_payload' },
          {
            label: 'empty nickname',
            payload: { roomId: 'General #Test', nickname: '', playerId: 'usr-rej-1', reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'invalid_payload',
          },
          {
            label: 'whitespace-only nickname',
            payload: { roomId: 'General #Test', nickname: '    ', playerId: 'usr-rej-2', reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'invalid_payload',
          },
          {
            label: 'nickname with newline control char',
            payload: { roomId: 'General #Test', nickname: 'Bad\nName', playerId: 'usr-rej-3', reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'invalid_payload',
          },
          {
            label: 'nickname with NUL control char',
            payload: { roomId: 'General #Test', nickname: 'Bad\x00Name', playerId: 'usr-rej-4', reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'invalid_payload',
          },
          {
            label: 'excessive raw nickname (> 32)',
            payload: { roomId: 'General #Test', nickname: 'a'.repeat(33), playerId: 'usr-rej-5', reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'invalid_payload',
          },
          {
            label: 'excessive raw spaces around short nickname (> 32)',
            payload: { roomId: 'General #Test', nickname: ' '.repeat(25) + 'Ali' + ' '.repeat(10), playerId: 'usr-rej-6', reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'invalid_payload',
          },
          {
            label: 'trimmed nickname > 24',
            payload: { roomId: 'General #Test', nickname: '  ' + 'b'.repeat(25) + '  ', playerId: 'usr-rej-7', reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'invalid_payload',
          },
          {
            label: 'non-string avatar (number)',
            payload: { roomId: 'General #Test', nickname: 'GoodName', avatar: 999, playerId: 'usr-rej-8', reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'invalid_payload',
          },
          {
            label: 'non-string avatar (array)',
            payload: { roomId: 'General #Test', nickname: 'GoodName', avatar: ['🎨'], playerId: 'usr-rej-9', reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'invalid_payload',
          },
          {
            label: 'whitespace-only avatar',
            payload: { roomId: 'General #Test', nickname: 'GoodName', avatar: '   ', playerId: 'usr-rej-10', reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'invalid_payload',
          },
          {
            label: 'control-char avatar',
            payload: { roomId: 'General #Test', nickname: 'GoodName', avatar: '🎨\n', playerId: 'usr-rej-11', reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'invalid_payload',
          },
          {
            label: 'excessively long avatar (> 32 UTF-16)',
            payload: { roomId: 'General #Test', nickname: 'GoodName', avatar: '🎨'.repeat(17), playerId: 'usr-rej-12', reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'invalid_payload',
          },
          {
            label: 'excessive roomId (> 100)',
            payload: { roomId: 'General #Test' + 'x'.repeat(90), nickname: 'GoodName', avatar: '🎨', playerId: 'usr-rej-13', reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'invalid_payload',
          },
          {
            label: 'non-string roomId',
            payload: { roomId: 123, nickname: 'GoodName', avatar: '🎨', playerId: 'usr-rej-14', reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'invalid_payload',
          },
          {
            label: 'invalid playerId type',
            payload: { roomId: 'General #Test', nickname: 'GoodName', avatar: '🎨', playerId: 12345, reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'unauthorized',
          },
          {
            label: 'too-long playerId (> 64)',
            payload: { roomId: 'General #Test', nickname: 'GoodName', avatar: '🎨', playerId: 'u'.repeat(65), reconnectSecret: 'sec-rej-secret-123456' },
            expectError: 'unauthorized',
          },
          {
            label: 'invalid reconnectSecret type (array)',
            payload: { roomId: 'General #Test', nickname: 'GoodName', avatar: '🎨', playerId: 'usr-rej-15', reconnectSecret: ['sec'] },
            expectError: 'unauthorized',
          },
          {
            label: 'excessive reconnectSecret (> 128)',
            payload: { roomId: 'General #Test', nickname: 'GoodName', avatar: '🎨', playerId: 'usr-rej-16', reconnectSecret: 's'.repeat(129) },
            expectError: 'unauthorized',
          },
          {
            label: 'invalid reconnectOnly type',
            payload: { roomId: 'General #Test', nickname: 'GoodName', playerId: 'usr-rej-17', reconnectSecret: 'sec-rej-secret-123456', reconnectOnly: 'true' },
            expectError: 'invalid_payload',
          },
          {
            label: 'invalid supportsType13 type (rejected even if invalid + does not set cap)',
            payload: { roomId: 'General #Test', nickname: 'GoodName', playerId: 'usr-rej-18', reconnectSecret: 'sec-rej-secret-123456', supportsType13: 1 },
            expectError: 'invalid_payload',
          },
          {
            label: 'supportsType13: true paired with invalid nickname MUST NOT set capabilities',
            payload: { roomId: 'General #Test', nickname: '', playerId: 'usr-rej-19', reconnectSecret: 'sec-rej-secret-123456', supportsType13: true },
            expectError: 'invalid_payload',
          },
        ];

        let allRejectedCleanly = true;
        for (let i = 0; i < invalidCases.length; i++) {
          const c = invalidCases[i];
          const sockId = `s-rej-${i}`;
          const sock = createRecordingSocket(sockId);
          let ack: any = null;
          handleJoinRoom(sock, c.payload, (r) => (ack = r), deps);

          const pid = c.payload && typeof c.payload === 'object' ? c.payload.playerId : undefined;
          const okErr = ack?.success === false && (!c.expectError || ack?.error === c.expectError);
          const noSideEffects =
            sock.joinedRooms.length === 0 &&
            sock.socketEmits.length === 0 &&
            rm.getPlayer(sockId) === undefined &&
            rm.isClientType13Capable(sockId) === false &&
            (typeof pid !== 'string' || !rm.authStore.hasCredential(pid));

          if (!okErr || !noSideEffects) {
            allRejectedCleanly = false;
            console.error(`  [Debug failure in A4 case "${c.label}"]:`, { ack, joined: sock.joinedRooms, emits: sock.socketEmits });
          }
        }

        check(
          allRejectedCleanly &&
            genRoomBefore.players.length === playersBefore &&
            (genRoomBefore.chatMessages || []).length === chatBefore &&
            rm.authStore.size === authSizeBefore &&
            broadcasts.length === broadcastsBefore &&
            rm.getRoom('Free Draw') === undefined,
          `A4. All ${invalidCases.length} invalid join_room cases rejected with 0 player/authStore/capability/room/broadcast side effects`
        );
      }
    } finally {
      stopManagerTimers(rm);
    }
  }

  // =========================================================================
  // PART B: Drawing Identity Ownership Limit (max 2 per socket per room)
  // =========================================================================
  console.log('\n--- Part B: Drawing Identity Ownership Limit ---');
  {
    const rm = new RoomManager();
    const sock1 = 'sock-id-1';
    const sock2 = 'sock-id-2';
    const { io, broadcasts, socketsMap } = createRecordingIo(new Set([sock1, sock2]));
    rm.setIo(io);
    try {
      rm.addPlayerToRoom('Free Draw', {
        id: sock1,
        name: 'Drawer1',
        avatar: '🎨',
        roomId: 'Free Draw',
        score: 0,
        wins: 0,
        persistentId: 'usr-drawer-1',
      });
      rm.addPlayerToRoom('Free Draw', {
        id: sock2,
        name: 'Drawer2',
        avatar: '🖌️',
        roomId: 'Free Draw',
        score: 0,
        wins: 0,
        persistentId: 'usr-drawer-2',
      });

      const idBroadcastCount = () => broadcasts.filter((b) => b.event === 'drawing_identities_update').length;
      const room = rm.getRoom('Free Draw')!;

      // B1. First identity succeeds
      const bBefore1 = idBroadcastCount();
      handleRegisterDrawingIdentity({ id: sock1 }, { instanceId: 'id1a' }, { roomManager: rm });
      check(
        room.drawingIdentities?.['id1a']?.socketId === sock1 && idBroadcastCount() === bBefore1 + 1,
        'B1. First drawing identity succeeds and broadcasts once'
      );

      // B2. Second identity for same socket succeeds
      const bBefore2 = idBroadcastCount();
      handleRegisterDrawingIdentity({ id: sock1 }, { instanceId: 'id1b' }, { roomManager: rm });
      check(
        room.drawingIdentities?.['id1a']?.socketId === sock1 &&
          room.drawingIdentities?.['id1b']?.socketId === sock1 &&
          idBroadcastCount() === bBefore2 + 1,
        'B2. Second drawing identity for same socket succeeds'
      );

      // B3. Third distinct identity for same socket is rejected before mutating map or broadcasting
      const bBefore3 = idBroadcastCount();
      handleRegisterDrawingIdentity({ id: sock1 }, { instanceId: 'id1c' }, { roomManager: rm });
      check(
        room.drawingIdentities?.['id1c'] === undefined &&
          Object.keys(room.drawingIdentities || {}).length === 2 &&
          idBroadcastCount() === bBefore3,
        'B3. Third distinct identity rejected without modifying drawingIdentities or broadcasting'
      );

      // B4. Re-registering already-owned identity remains idempotent even at limit (0 unnecessary broadcasts)
      const bBefore4 = idBroadcastCount();
      handleRegisterDrawingIdentity({ id: sock1 }, { instanceId: 'id1a' }, { roomManager: rm });
      check(
        room.drawingIdentities?.['id1a']?.socketId === sock1 && idBroadcastCount() === bBefore4,
        'B4. Re-registering existing owned identity remains idempotent with 0 extra broadcasts'
      );

      // B5. Second socket can register its own 2 identities and is blocked on its 3rd
      handleRegisterDrawingIdentity({ id: sock2 }, { instanceId: 'id2a' }, { roomManager: rm });
      handleRegisterDrawingIdentity({ id: sock2 }, { instanceId: 'id2b' }, { roomManager: rm });
      const bBefore5 = idBroadcastCount();
      handleRegisterDrawingIdentity({ id: sock2 }, { instanceId: 'id2c' }, { roomManager: rm });
      check(
        room.drawingIdentities?.['id2a']?.socketId === sock2 &&
          room.drawingIdentities?.['id2b']?.socketId === sock2 &&
          room.drawingIdentities?.['id2c'] === undefined &&
          idBroadcastCount() === bBefore5,
        'B5. Second socket registers 2 identities independently and is blocked on 3rd'
      );

      // B6. Active ownership steal prevention preserved
      const bBeforeSteal = idBroadcastCount();
      handleRegisterDrawingIdentity({ id: sock1 }, { instanceId: 'id2a' }, { roomManager: rm });
      check(
        room.drawingIdentities?.['id2a']?.socketId === sock2 && idBroadcastCount() === bBeforeSteal,
        'B6. Cannot steal active identity owned by another socket'
      );

      // B7. Unregistering frees the slot so a new identity succeeds
      handleUnregisterDrawingIdentity({ id: sock1 }, { instanceId: 'id1a' }, { roomManager: rm });
      const afterUnreg = room.drawingIdentities?.['id1a'] === undefined;
      handleRegisterDrawingIdentity({ id: sock1 }, { instanceId: 'id1c' }, { roomManager: rm });
      check(
        afterUnreg &&
          room.drawingIdentities?.['id1c']?.socketId === sock1 &&
          room.drawingIdentities?.['id1b']?.socketId === sock1,
        'B7. Unregistering frees slot and allows new identity registration'
      );

      // B8. Disconnect cleanup removes all identities owned by disconnected socket without affecting sock1
      socketsMap.delete(sock2);
      rm.handleDisconnect(sock2);
      check(
        room.drawingIdentities?.['id2a'] === undefined &&
          room.drawingIdentities?.['id2b'] === undefined &&
          room.drawingIdentities?.['id1b']?.socketId === sock1 &&
          room.drawingIdentities?.['id1c']?.socketId === sock1,
        'B8. Disconnect cleanup deletes all identities for disconnected socket cleanly'
      );

      // B9. REG-1.V2 compatibility: direct handler with mock roomManager accepts 'inst-direct-123'
      let mockDirectArgs: any = null;
      handleRegisterDrawingIdentity(
        { id: 'sock-direct-test' },
        { instanceId: 'inst-direct-123' },
        { roomManager: { registerDrawingIdentity: (s: string, id: string) => (mockDirectArgs = { s, id }) } }
      );
      // Also verify oversized > 64 string is blocked pre-trim
      let oversizedCalled = false;
      handleRegisterDrawingIdentity(
        { id: 'sock-direct-test' },
        { instanceId: '  ' + 'a'.repeat(65) + '  ' },
        { roomManager: { registerDrawingIdentity: () => (oversizedCalled = true) } }
      );
      check(
        mockDirectArgs?.s === 'sock-direct-test' &&
          mockDirectArgs?.id === 'inst-direct-123' &&
          oversizedCalled === false,
        'B9. REG-1.V2 ("inst-direct-123") passes while >64 raw instanceId is blocked pre-trim'
      );
    } finally {
      stopManagerTimers(rm);
    }
  }

  // =========================================================================
  // PART C: client_capabilities Strict Allowlist
  // =========================================================================
  console.log('\n--- Part C: client_capabilities Strict Allowlist ---');
  {
    const rm = new RoomManager();
    try {
      // C1. Valid boolean true and false
      rm.setClientCapabilities('cap-s1', { supportsType13: true });
      const cap1Ok = rm.isClientType13Capable('cap-s1') === true;
      rm.setClientCapabilities('cap-s1', { supportsType13: false });
      const cap1FalseOk = rm.isClientType13Capable('cap-s1') === false;
      check(cap1Ok && cap1FalseOk, 'C1. Valid supportsType13 booleans (true -> false) stored and read accurately');

      // C2. Missing optional capability preserves default behavior (false if new, existing if present)
      rm.setClientCapabilities('cap-legacy', {});
      const legacyDefaultFalse = rm.isClientType13Capable('cap-legacy') === false;
      rm.setClientCapabilities('cap-keep', { supportsType13: true });
      rm.setClientCapabilities('cap-keep', {});
      const legacyKeepsExisting = rm.isClientType13Capable('cap-keep') === true;
      check(
        legacyDefaultFalse && legacyKeepsExisting,
        'C2. Missing optional supportsType13 preserves default false and existing true'
      );

      // C3. Reject Arrays, null, primitives, and invalid supportsType13 types
      const invalidCaps: any[] = [
        null,
        undefined,
        'true',
        123,
        true,
        [],
        [true],
        { supportsType13: 'true' },
        { supportsType13: 1 },
        { supportsType13: null },
        { supportsType13: {} },
      ];
      let allInvalidCapRejected = true;
      for (const bad of invalidCaps) {
        if (sanitizeClientCapabilities(bad).valid) allInvalidCapRejected = false;
        rm.setClientCapabilities('cap-bad-target', bad);
      }
      check(
        allInvalidCapRejected && (rm as any).clientCapabilities.get('cap-bad-target') === undefined,
        'C3. Null, primitives, Arrays, and non-boolean supportsType13 rejected with zero map writes'
      );

      // C4. Extra properties / nested blobs stripped (never spread into stored object)
      rm.setClientCapabilities('cap-extra', {
        supportsType13: true,
        maliciousBlob: 'x'.repeat(5000),
        nested: { deep: [1, 2, 3] },
        role: 'admin',
      });
      const storedExtra = (rm as any).clientCapabilities.get('cap-extra');
      const keysOnly = storedExtra ? Object.keys(storedExtra) : [];
      rm.setClientCapabilities('cap-extra-only', {
        unknownField: 'abc',
        nested: { x: 1 },
      });
      const storedExtraOnly = (rm as any).clientCapabilities.get('cap-extra-only');
      check(
        keysOnly.length === 1 &&
          keysOnly[0] === 'supportsType13' &&
          storedExtra?.supportsType13 === true &&
          storedExtraOnly === undefined,
        'C4. Extra properties & nested blobs never retained in clientCapabilities'
      );
    } finally {
      stopManagerTimers(rm);
    }
  }

  // =========================================================================
  // PART D: get_room_info Early Input Validation
  // =========================================================================
  console.log('\n--- Part D: get_room_info Validation & Zero Error Spam ---');
  {
    const rm = new RoomManager();
    try {
      rm.addPlayerToRoom('General #Test', {
        id: 's-info-1',
        name: 'InfoPlayer',
        avatar: '🎨',
        roomId: 'General #Test',
        score: 0,
        wins: 0,
        persistentId: 'usr-info-1',
      });

      // D1. Valid room IDs return live count & config
      let resValid: any = null;
      handleGetRoomInfo('General #Test', (r: any) => (resValid = r), { roomManager: rm, getRoomConfig });
      let resFree: any = null;
      handleGetRoomInfo('Free Draw', (r: any) => (resFree = r), { roomManager: rm, getRoomConfig });
      check(
        resValid?.count === 1 && resValid?.max === 5 && resFree?.count === 0 && resFree?.theme === 'Free Draw',
        'D1. Valid room IDs return accurate count and config'
      );

      // D2. Invalid types / empty / >100 strings return default cleanly with ZERO console.error
      const badInputs: any[] = [123, {}, ['General #Test'], null, undefined, '', '   ', 'a'.repeat(101), 'bad\nroom'];
      let allCallbacksClean = true;
      let threw = false;
      const originalConsoleError = console.error;
      const loggedErrors: any[][] = [];
      console.error = (...args: any[]) => {
        loggedErrors.push(args);
      };
      try {
        for (const bad of badInputs) {
          let cbRes: any = null;
          try {
            handleGetRoomInfo(bad, (r: any) => (cbRes = r), { roomManager: rm, getRoomConfig });
          } catch {
            threw = true;
          }
          if (
            !cbRes ||
            cbRes.count !== 0 ||
            cbRes.max !== 5 ||
            cbRes.winningScore !== 30 ||
            cbRes.theme !== 'General'
          ) {
            allCallbacksClean = false;
          }
        }
      } finally {
        console.error = originalConsoleError;
      }

      if (loggedErrors.length > 0) {
        for (const errArgs of loggedErrors) {
          console.error('  [Captured D2 console.error]:', ...errArgs);
        }
      }
      check(
        !threw && allCallbacksClean && loggedErrors.length === 0,
        'D2. Invalid get_room_info inputs return default response without TypeError or console.error spam'
      );
    } finally {
      stopManagerTimers(rm);
    }
  }

  // =========================================================================
  // PART E: Raw String Boundaries Before trim() Across Control Handlers
  // =========================================================================
  console.log('\n--- Part E: Raw String Boundaries Before trim() ---');
  {
    const rm = new RoomManager();
    const broadcasts: { roomId: string; event: string; payload: any }[] = [];
    const io: any = {
      to: (rId: string) => ({
        emit: (ev: string, p: any) => broadcasts.push({ roomId: rId, event: ev, payload: p }),
      }),
      sockets: { sockets: new Map() },
    };
    rm.setIo(io);
    try {
      const room = rm.createRoom('General #Test');
      room.gameState.status = 'DRAWING';
      room.gameState.currentDrawerId = 'usr-e-drawer';
      room.gameState.currentWord = 'تفاحة';
      room.gameState.wordOptions = ['تفاحة', 'سيارة'];
      rm.addPlayerToRoom('General #Test', {
        id: 'sock-e-drawer',
        name: 'EDrawer',
        avatar: '🎨',
        roomId: 'General #Test',
        score: 0,
        wins: 0,
        persistentId: 'usr-e-drawer',
      });
      rm.addPlayerToRoom('General #Test', {
        id: 'sock-e-guesser',
        name: 'EGuesser',
        avatar: '👀',
        roomId: 'General #Test',
        score: 0,
        wins: 0,
        persistentId: 'usr-e-guesser',
      });

      // E1. send_message: > 1000 raw rejected before trim(), <= 250 trimmed succeeds, 5/2s rate limit preserved
      {
        const chatLimits = new Map<string, number[]>();
        const origTrim = String.prototype.trim;
        let hugeTrimCalls = 0;
        const hugeMsg = 'hi' + ' '.repeat(1000); // 1002 > 1000
        String.prototype.trim = function (this: string) {
          if (this.length > 1000) hugeTrimCalls++;
          return origTrim.call(this);
        };
        try {
          const msgCountBefore = (room.chatMessages || []).length;
          handleSendMessage({ id: 'sock-e-guesser' }, { text: hugeMsg }, { io, roomManager: rm, chatLimits, normalizeArabic });
          const rejectedHugePreTrim = hugeTrimCalls === 0 && (room.chatMessages || []).length === msgCountBefore;

          // Valid 250 trimmed chars padded slightly within <= 1000 raw passes
          const valid250 = '  ' + 'x'.repeat(250) + '  ';
          handleSendMessage({ id: 'sock-e-guesser' }, { text: valid250 }, { io, roomManager: rm, chatLimits, normalizeArabic });
          const accepted250 = (room.chatMessages || []).length === msgCountBefore + 1;

          // 251 trimmed rejected
          handleSendMessage({ id: 'sock-e-guesser' }, { text: 'x'.repeat(251) }, { io, roomManager: rm, chatLimits, normalizeArabic });
          const rejected251 = (room.chatMessages || []).length === msgCountBefore + 1;

          // Preserved 5 / 2s rate limit (already used 3 tokens above: hugeMsg, valid250, 251; send 2 valid then 6th throttled)
          handleSendMessage({ id: 'sock-e-guesser' }, { text: 'ok4' }, { io, roomManager: rm, chatLimits, normalizeArabic });
          handleSendMessage({ id: 'sock-e-guesser' }, { text: 'ok5' }, { io, roomManager: rm, chatLimits, normalizeArabic });
          const before6th = (room.chatMessages || []).length;
          handleSendMessage({ id: 'sock-e-guesser' }, { text: 'throttled6' }, { io, roomManager: rm, chatLimits, normalizeArabic });
          check(
            rejectedHugePreTrim && accepted250 && rejected251 && (room.chatMessages || []).length === before6th,
            'E1. send_message rejects >1000 raw pre-trim, keeps 250 trimmed cap and 5/2s rate limit'
          );
        } finally {
          String.prototype.trim = origTrim;
        }
      }

      // E2. submit_guess: Arrays rejected, > 1000 raw rejected before trim(), <= 250 trimmed works, 5/2s rate limit preserved
      {
        const guessLimits = new Map<string, number[]>();
        const origTrim = String.prototype.trim;
        let hugeTrimCalls = 0;
        const hugeGuess = 'تفاحة' + ' '.repeat(1000);
        String.prototype.trim = function (this: string) {
          if (this.length > 1000) hugeTrimCalls++;
          return origTrim.call(this);
        };
        try {
          const arrPayload: any = [];
          arrPayload.guess = 'تفاحة';
          handleSubmitGuess({ id: 'sock-e-guesser' }, arrPayload, { roomManager: rm, guessLimits });
          handleSubmitGuess({ id: 'sock-e-guesser' }, { guess: hugeGuess }, { roomManager: rm, guessLimits });
          const notGuessedYet = !room.gameState.correctGuessers.includes('usr-e-guesser');

          handleSubmitGuess({ id: 'sock-e-guesser' }, { guess: 'تفاحة' }, { roomManager: rm, guessLimits });
          const guessedOk = room.gameState.correctGuessers.includes('usr-e-guesser');
          check(
            hugeTrimCalls === 0 && notGuessedYet && guessedOk,
            'E2. submit_guess rejects Array payloads & >1000 raw pre-trim while preserving valid guess'
          );
        } finally {
          String.prototype.trim = origTrim;
        }
      }

      // E3. select_word: Arrays rejected, > 128 raw rejected before trim(), valid wordOptions selection works
      {
        room.gameState.status = 'CHOOSING';
        room.gameState.wordOptions = ['تفاحة', 'سيارة'];
        const origTrim = String.prototype.trim;
        let hugeTrimCalls = 0;
        const hugeWord = 'تفاحة' + ' '.repeat(130);
        String.prototype.trim = function (this: string) {
          if (this.length > 128) hugeTrimCalls++;
          return origTrim.call(this);
        };
        try {
          const arrWordPayload: any = [];
          arrWordPayload.word = 'تفاحة';
          handleSelectWord({ id: 'sock-e-drawer' }, arrWordPayload, { roomManager: rm });
          handleSelectWord({ id: 'sock-e-drawer' }, { word: hugeWord }, { roomManager: rm });
          const stillChoosing = room.gameState.status === 'CHOOSING';

          handleSelectWord({ id: 'sock-e-drawer' }, { word: 'سيارة' }, { roomManager: rm });
          check(
            hugeTrimCalls === 0 && stillChoosing && room.gameState.status === 'DRAWING' && room.gameState.currentWord === 'سيارة',
            'E3. select_word rejects Arrays & >128 raw pre-trim while preserving valid wordOptions matching'
          );
        } finally {
          String.prototype.trim = origTrim;
        }
      }

      // E4. draw_repair_req: raw instId > 16 rejected pre-trim; valid instId returns canonical Type 9; 20/s rate limit preserved
      {
        const fdRoom = rm.createRoom('Free Draw');
        const cache = rm.getOrCreateFreeDrawStrokes(fdRoom);
        void cache;
        const canonicalBuf = Buffer.from([9, 97, 98, 99, 0, 0, 0, 0, 0, 0, 0, 0, 2, 100, 1, 0, 0, 0, 0, 0, 1, 0]);
        fdRoom.freeDrawCanonicalCache = fdRoom.freeDrawCanonicalCache || new Map();
        fdRoom.freeDrawCanonicalCache.set('abc_1', { buffer: canonicalBuf, createdAt: Date.now() });
        rm.addPlayerToRoom('Free Draw', {
          id: 'sock-e-repair',
          name: 'RepairPlayer',
          avatar: '🔧',
          roomId: 'Free Draw',
          score: 0,
          wins: 0,
          persistentId: 'usr-e-repair',
        });

        const drawRepairLimits = new Map<string, number[]>();
        const origTrim = String.prototype.trim;
        let hugeTrimCalls = 0;
        String.prototype.trim = function (this: string) {
          if (this.length > 16 && this.includes('abc')) hugeTrimCalls++;
          return origTrim.call(this);
        };
        try {
          const sock = createRecordingSocket('sock-e-repair');
          handleDrawRepairReq(sock, { instId: 'abc' + ' '.repeat(14), strokeId: 1 }, { roomManager: rm, drawRepairLimits, checkRateLimit });
          handleDrawRepairReq(sock, { instId: 'bad-id!', strokeId: 1 }, { roomManager: rm, drawRepairLimits, checkRateLimit });
          const noEmitOnBad = sock.socketEmits.length === 0;

          handleDrawRepairReq(sock, { instId: 'abc', strokeId: 1 }, { roomManager: rm, drawRepairLimits, checkRateLimit });
          const emittedOnValid = sock.socketEmits.length === 1 && sock.socketEmits[0].event === 'draw_binary';
          check(
            hugeTrimCalls === 0 && noEmitOnBad && emittedOnValid,
            'E4. draw_repair_req rejects raw instId > 16 pre-trim while returning valid canonical Type 9'
          );
        } finally {
          String.prototype.trim = origTrim;
        }
      }

      // E5. submit_vote_kick: structural bounds + rate-limit BEFORE O(N) room.players.find scan
      {
        const voteKickLimits = new Map<string, number[]>();
        let findCalls = 0;
        const origFind = room.players.find.bind(room.players);
        room.players.find = ((predicate: any, thisArg?: any) => {
          findCalls++;
          return origFind(predicate, thisArg);
        }) as any;

        try {
          let badAck1: any = null;
          handleSubmitVoteKick(
            { id: 'sock-e-guesser' },
            ['usr-e-drawer'],
            (r: any) => (badAck1 = r),
            { io, roomManager: rm, voteKickLimits, checkRateLimit }
          );
          let badAck2: any = null;
          handleSubmitVoteKick(
            { id: 'sock-e-guesser' },
            { targetPlayerId: 'u'.repeat(65) },
            (r: any) => (badAck2 = r),
            { io, roomManager: rm, voteKickLimits, checkRateLimit }
          );
          const findsAfterInvalid = findCalls;

          // Consume 3/3 rate limit slots (with find)
          for (let i = 0; i < 3; i++) {
            handleSubmitVoteKick(
              { id: 'sock-e-guesser' },
              { targetPlayerId: 'usr-e-drawer' },
              () => {},
              { io, roomManager: rm, voteKickLimits, checkRateLimit }
            );
          }
          const findsBefore4th = findCalls;
          let rlAck: any = null;
          handleSubmitVoteKick(
            { id: 'sock-e-guesser' },
            { targetPlayerId: 'usr-e-drawer' },
            (r: any) => (rlAck = r),
            { io, roomManager: rm, voteKickLimits, checkRateLimit }
          );
          check(
            badAck1?.error === 'invalid_payload' &&
              badAck2?.error === 'invalid_payload' &&
              findsAfterInvalid === 0 &&
              rlAck?.error === 'rate_limited' &&
              findCalls === findsBefore4th,
            'E5. submit_vote_kick rejects invalid payloads & rate-limited bursts BEFORE O(N) room.players.find scan'
          );
        } finally {
          room.players.find = origFind;
        }
      }
    } finally {
      stopManagerTimers(rm);
    }
  }

  // =========================================================================
  // PART F: Live Socket.IO + MsgPack Transport Integration
  // =========================================================================
  console.log('\n--- Part F: Live Socket.IO + MsgPack Integration ---');
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
    const drawRepairLimits = new Map<string, number[]>();

    io.on('connection', (socket) => {
      socket.on('get_room_info', (roomId, cb) => {
        handleGetRoomInfo(roomId, cb, { roomManager: rm, getRoomConfig });
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
      socket.on('join_room', (payload, cb) => {
        handleJoinRoom(socket, payload, cb, { io, roomManager: rm, getRoomConfig });
      });
      socket.on('register_drawing_identity', (data) => {
        handleRegisterDrawingIdentity(socket, data, { roomManager: rm });
      });
      socket.on('unregister_drawing_identity', (data) => {
        handleUnregisterDrawingIdentity(socket, data, { roomManager: rm });
      });
      socket.on('draw_repair_req', (data) => {
        handleDrawRepairReq(socket, data, { roomManager: rm, drawRepairLimits, checkRateLimit });
      });
      socket.on('disconnect', () => {
        rm.handleDisconnect(socket.id);
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
      const c1 = await connectClient();
      const c2 = await connectClient();

      // F1. get_room_info invalid + valid over wire
      const badRoomInfo = await emitWithAck(c1, 'get_room_info', { bad: true });
      const goodRoomInfo = await emitWithAck(c1, 'get_room_info', 'Free Draw');
      check(
        badRoomInfo?.count === 0 && badRoomInfo?.theme === 'General' && goodRoomInfo?.theme === 'Free Draw',
        'F1. Live Socket.IO get_room_info handles malformed and valid room queries cleanly'
      );

      // F2. Malformed join_room over wire rejected cleanly without mutating room or clientCapabilities
      const badJoinAck = await emitWithAck(c1, 'join_room', {
        roomId: 'Free Draw',
        nickname: 'a'.repeat(40),
        avatar: '🎨',
        playerId: 'usr-live-bad-1',
        reconnectSecret: 'sec-live-bad-secret-123456',
        supportsType13: true,
      });
      check(
        badJoinAck?.success === false &&
          badJoinAck?.error === 'invalid_payload' &&
          rm.getRoom('Free Draw') === undefined &&
          rm.isClientType13Capable(c1.id!) === false,
        'F2. Live Socket.IO invalid join_room rejected without creating room or setting capabilities'
      );

      // F3. Valid join + capabilities allowlist + 2-identity cap over wire
      c1.emit('client_capabilities', { supportsType13: true, extraEvil: { nested: 'drop-me' } });
      c2.emit('client_capabilities', { supportsType13: false });
      const join1Ack = await emitWithAck(c1, 'join_room', {
        roomId: 'Free Draw',
        nickname: 'LiveDrawer1',
        avatar: '🇸🇦',
        playerId: 'usr-live-1',
        reconnectSecret: 'sec-live-secret-1-123456',
      });
      const join2Ack = await emitWithAck(c2, 'join_room', {
        roomId: 'Free Draw',
        nickname: 'LiveDrawer2',
        avatar: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
        playerId: 'usr-live-2',
        reconnectSecret: 'sec-live-secret-2-123456',
      });

      const identityUpdates: Record<string, any>[] = [];
      c2.on('drawing_identities_update', (m: any) => identityUpdates.push(m));

      c1.emit('register_drawing_identity', { instanceId: 'live1a' });
      c1.emit('register_drawing_identity', { instanceId: 'live1b' });
      c1.emit('register_drawing_identity', { instanceId: 'live1c' }); // 3rd should be blocked
      await new Promise((r) => setTimeout(r, 120));

      const liveRoom = rm.getRoom('Free Draw')!;
      const cap1Stored = (rm as any).clientCapabilities.get(c1.id!);
      check(
        join1Ack?.success === true &&
          join2Ack?.success === true &&
          Object.keys(cap1Stored || {}).length === 1 &&
          cap1Stored?.supportsType13 === true &&
          liveRoom.drawingIdentities?.['live1a']?.socketId === c1.id &&
          liveRoom.drawingIdentities?.['live1b']?.socketId === c1.id &&
          liveRoom.drawingIdentities?.['live1c'] === undefined,
        'F3. Live Socket.IO enforces capability allowlist & max 2 drawing identities per socket'
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

runTests().catch((err) => {
  console.error('Unhandled error in Slice 5C-1 test suite:', err);
  process.exit(1);
});

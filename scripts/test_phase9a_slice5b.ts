import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import customParser from 'socket.io-msgpack-parser';

import { MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES } from '../server/transportConfig.js';
import { RoomManager, normalizeArabic } from '../server/rooms.js';
import { getRoomConfig } from '../src/types/game.js';
import { handleJoinRoom } from '../server/registerJoinRoomHandler.js';
import { handleDrawBinary } from '../server/registerDrawBinaryHandler.js';
import { handleSendMessage } from '../server/registerSendMessageHandler.js';
import { handleSubmitGuess } from '../server/registerSubmitGuessHandler.js';
import { DrawRateLimiter } from '../server/drawRateLimit.js';
import { encodeBinaryDrawMessage } from '../src/utils/drawBinaryHelper.js';

console.log('==================================================================');
console.log('🛡️  PHASE 9A — SLICE 5B: SOCKET.IO TRANSPORT SIZE PROTECTION');
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

function encodeWireBytes(eventName: string, payload: any, ackId?: number): number {
  const encoder = new (customParser as any).Encoder();
  const packet: any = {
    type: 2,
    nsp: '/',
    data: payload === undefined ? [eventName] : [eventName, payload],
    options: { compress: true }
  };
  if (ackId !== undefined) {
    packet.id = ackId;
  }
  const [pkt] = encoder.encode(packet);
  return pkt.length;
}

function getJsonSafeHistoryForTest(history: any[]): any[] {
  if (!Array.isArray(history)) return [];
  const safeList: any[] = [];
  for (const cmd of history) {
    if (!cmd) continue;
    const safeData = cmd.data && Buffer.isBuffer(cmd.data) ? Array.from(cmd.data) : cmd.data;
    const entry: any = { event: cmd.event, data: safeData };
    if (cmd.instId) entry.instanceId = cmd.instId;
    if (cmd.strokeId !== undefined && cmd.strokeId !== null) entry.strokeId = cmd.strokeId;
    safeList.push(entry);
  }
  return safeList;
}

function makeRawType1(instId: string, tool = 0): ArrayBuffer {
  const ab = new ArrayBuffer(18);
  const view = new DataView(ab);
  view.setUint8(0, 1);
  for (let i = 0; i < 7; i++) {
    view.setUint8(1 + i, i < instId.length ? instId.charCodeAt(i) : 0);
  }
  view.setUint8(8, tool);
  view.setUint8(9, 0x11);
  view.setUint8(10, 0x22);
  view.setUint8(11, 0x33);
  view.setUint8(12, 4);
  view.setUint8(13, 100);
  view.setInt16(14, 1000, true);
  view.setInt16(16, 1000, true);
  return ab;
}

function makeRawType3(instId: string, tool = 0, strokeId = 1, pointCount = 1): ArrayBuffer {
  const ab = new ArrayBuffer(27);
  const view = new DataView(ab);
  view.setUint8(0, 3);
  for (let i = 0; i < 7; i++) {
    view.setUint8(1 + i, i < instId.length ? instId.charCodeAt(i) : 0);
  }
  view.setUint8(8, tool);
  view.setUint8(9, 0x11);
  view.setUint8(10, 0x22);
  view.setUint8(11, 0x33);
  view.setUint8(12, 4);
  view.setUint8(13, 100);
  view.setInt16(14, 1000, true);
  view.setInt16(16, 1000, true);
  view.setInt16(18, 2000, true);
  view.setInt16(20, 2000, true);
  view.setUint8(22, 0);
  view.setUint16(23, strokeId & 0xffff, true);
  view.setUint16(25, pointCount & 0xffff, true);
  return ab;
}

function makeRawType4(instId: string, strokeId = 1): ArrayBuffer {
  const ab = new ArrayBuffer(23);
  const view = new DataView(ab);
  view.setUint8(0, 4);
  for (let i = 0; i < 7; i++) {
    view.setUint8(1 + i, i < instId.length ? instId.charCodeAt(i) : 0);
  }
  view.setUint8(8, 2); // bucket
  view.setUint8(9, 0xaa);
  view.setUint8(10, 0xbb);
  view.setUint8(11, 0xcc);
  view.setUint8(12, 100);
  view.setUint16(13, 5000, true);
  view.setUint16(15, 5000, true);
  view.setUint8(17, 255);
  view.setUint8(18, 255);
  view.setUint8(19, 255);
  view.setUint8(20, 255);
  view.setUint16(21, strokeId & 0xffff, true);
  return ab;
}

function makeRawType9ArrayBuffer(
  instId: string,
  pointsLength: number,
  tool = 0,
  withStrokeId = true,
  strokeId = 1
): ArrayBuffer {
  const len = 16 + pointsLength * 4 + (withStrokeId ? 2 : 0);
  const ab = new ArrayBuffer(len);
  const view = new DataView(ab);
  view.setUint8(0, 9);
  for (let i = 0; i < 7; i++) {
    view.setUint8(1 + i, i < instId.length ? instId.charCodeAt(i) : 0);
  }
  view.setUint8(8, tool);
  view.setUint8(9, 10);
  view.setUint8(10, 20);
  view.setUint8(11, 30);
  view.setUint8(12, 4);
  view.setUint8(13, 100);
  view.setUint16(14, pointsLength & 0xffff, true);
  for (let i = 0; i < pointsLength; i++) {
    view.setInt16(16 + i * 4, (i * 7) % 10000, true);
    view.setInt16(18 + i * 4, (i * 5) % 10000, true);
  }
  if (withStrokeId) {
    view.setUint16(16 + pointsLength * 4, strokeId & 0xffff, true);
  }
  return ab;
}

function makeWorstCaseType13(instId: string, count = 3000): ArrayBuffer {
  // Alternating [-3.0, +3.0] normalized coordinates -> clamped [-30000, 30000], max delta 60000 -> 3-byte VarInt per axis (6 B/pt)
  const moves: { x: number; y: number }[] = new Array(count);
  for (let i = 0; i < count; i++) {
    moves[i] = i % 2 === 0 ? { x: -3.0, y: 3.0 } : { x: 3.0, y: -3.0 };
  }
  return encodeBinaryDrawMessage('draw_move_compressed', {
    instanceId: instId,
    moves
  });
}

function makeBoundaryProbeBuffer(byteLength: number, markerByte = 250): ArrayBuffer {
  const ab = new ArrayBuffer(byteLength);
  const u8 = new Uint8Array(ab);
  // First byte 250 (>13) safely bypasses drawHistory/broadcast if passed on draw_binary
  if (byteLength > 0) u8[0] = markerByte;
  if (byteLength > 1) u8[byteLength - 1] = 0x5a;
  return ab;
}

function cleanupRoomManagerTimers(rm: RoomManager) {
  const anyRm = rm as any;
  if (anyRm.tickInterval) {
    clearInterval(anyRm.tickInterval);
    anyRm.tickInterval = null;
  }
  if (anyRm.phaseDeadlineTimers instanceof Map) {
    for (const t of anyRm.phaseDeadlineTimers.values()) clearTimeout(t);
    anyRm.phaseDeadlineTimers.clear();
  }
  if (anyRm.evictionTimers instanceof Map) {
    for (const t of anyRm.evictionTimers.values()) clearTimeout(t);
    anyRm.evictionTimers.clear();
  }
}

function waitForEvent<T = any>(
  emitter: { once: (ev: string, fn: (arg: T) => void) => void },
  event: string,
  timeoutMs = 3000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for event "${event}"`)), timeoutMs);
    emitter.once(event, (arg: T) => {
      clearTimeout(timer);
      resolve(arg);
    });
  });
}

function waitForPredicate(fn: () => boolean, label = 'condition', timeoutMs = 3000, intervalMs = 10): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      if (fn()) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error(`Timeout waiting for: ${label}`));
        return;
      }
      setTimeout(poll, intervalMs);
    };
    poll();
  });
}

function emitWithAck<T = any>(socket: ClientSocket, event: string, payload?: any, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ack of "${event}"`)), timeoutMs);
    const cb = (res: T) => {
      clearTimeout(timer);
      resolve(res);
    };
    if (payload === undefined) {
      socket.emit(event, cb);
    } else {
      socket.emit(event, payload, cb);
    }
  });
}

async function connectClient(
  url: string,
  opts: { reconnection?: boolean } = {}
): Promise<ClientSocket> {
  const sock = ioClient(url, {
    autoConnect: true,
    reconnection: opts.reconnection ?? false,
    reconnectionDelay: 50,
    reconnectionDelayMax: 100,
    transports: ['websocket'],
    parser: customParser
  });
  await waitForEvent(sock, 'connect');
  return sock;
}

async function run() {
  // ── 1. SHARED CONFIG & ACTUAL MSGPACK WIRE SIZE MEASUREMENTS ──
  check(
    MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES === 512 * 1024 && MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES === 524288,
    '1. MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES equals exact 512 KiB (524,288 bytes)'
  );

  const sampleJoinWire = encodeWireBytes('join_room', {
    roomId: 'freedraw',
    nickname: 'Alice',
    avatar: '🎨',
    playerId: 'player-alice-1',
    reconnectOnly: false,
    supportsType13: true,
    reconnectSecret: 'secret-token-alice-0123456789abcdef'
  });
  const sampleMsgWire = encodeWireBytes('send_message', { text: 'مرحبا بالجميع في الرسم' });
  const sampleGuessWire = encodeWireBytes('submit_guess', { guess: 'قلم' });
  const smallDrawWire = encodeWireBytes('draw_binary', makeRawType4('u000001', 1));
  const maxType13Raw = makeWorstCaseType13('u000001', 3000);
  const maxType13Wire = encodeWireBytes('draw_binary', maxType13Raw);
  const maxCanonType9Raw = makeRawType9ArrayBuffer('u000001', 3000, 0, true, 1);
  const maxCanonType9Wire = encodeWireBytes('draw_binary', maxCanonType9Raw);
  const maxNormalType9Raw = makeRawType9ArrayBuffer('n000001', 65535, 0, true, 1);
  const maxNormalType9Wire = encodeWireBytes('draw_binary', maxNormalType9Raw);

  console.log(
    `   Measured wire sizes (MsgPack ArrayBuffer): join_room=${sampleJoinWire}B, ` +
      `send_message=${sampleMsgWire}B, submit_guess=${sampleGuessWire}B, ` +
      `small draw_binary(Type4)=${smallDrawWire}B, max Type13=${maxType13Raw.byteLength}B raw -> ${maxType13Wire}B wire, ` +
      `max canon Type9=${maxCanonType9Raw.byteLength}B raw -> ${maxCanonType9Wire}B wire, ` +
      `max Normal 65535-pt Type9=${maxNormalType9Raw.byteLength}B raw -> ${maxNormalType9Wire}B wire`
  );

  check(
    maxType13Raw.byteLength <= 18010 &&
      maxType13Wire < MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES &&
      maxCanonType9Wire < MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES &&
      maxNormalType9Wire === 262214 &&
      maxNormalType9Wire < MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES,
    '2. Canonical Type 13, canonical Type 9, and theoretical 65,535-pt Normal Type 9 wire sizes all stay well below 524,288 B'
  );

  // Compute exact 524,287 / 524,288 / 524,289 boundary payload sizes dynamically using actual Encoder
  const drawBinaryOverhead64k = encodeWireBytes('draw_binary', makeBoundaryProbeBuffer(100_000)) - 100_000; // 56 B on real socket.io-client
  const boundaryBelowRawLen = 524287 - drawBinaryOverhead64k; // 524,231 B
  const boundaryExactRawLen = 524288 - drawBinaryOverhead64k; // 524,232 B
  const boundaryOverRawLen = 524289 - drawBinaryOverhead64k;  // 524,233 B
  const wireBelow = encodeWireBytes('draw_binary', makeBoundaryProbeBuffer(boundaryBelowRawLen));
  const wireExact = encodeWireBytes('draw_binary', makeBoundaryProbeBuffer(boundaryExactRawLen));
  const wireOver = encodeWireBytes('draw_binary', makeBoundaryProbeBuffer(boundaryOverRawLen));

  check(
    wireBelow === 524287 && wireExact === 524288 && wireOver === 524289,
    `3. Exact MsgPack boundary framing calibrated (${wireBelow} B / ${wireExact} B / ${wireOver} B; draw_binary >=64KiB overhead=${drawBinaryOverhead64k} B)`
  );

  // ── SETUP REAL EPHEMERAL SOCKET.IO + ENGINE.IO + MSGPACK SERVER ──
  const httpServer: HttpServer = createServer();
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket'],
    maxHttpBufferSize: MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES,
    parser: customParser
  });

  const rm = new RoomManager();
  rm.setIo(io);
  const limiter = new DrawRateLimiter();
  const chatLimits = new Map<string, number[]>();
  const guessLimits = new Map<string, number[]>();

  let drawBinaryHandlerCalls = 0;
  let sendMessageHandlerCalls = 0;
  let submitGuessHandlerCalls = 0;
  let joinRoomHandlerCalls = 0;
  let lastEngineIncomingBytes = 0;
  const serverDisconnectReasons: { socketId: string; reason: string }[] = [];

  const checkRateLimit = (map: Map<string, number[]>, key: string, maxMessages: number, windowMs: number) => {
    const now = Date.now();
    const recent = (map.get(key) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxMessages) return false;
    recent.push(now);
    map.set(key, recent);
    return true;
  };

  io.on('connection', (socket) => {
    socket.conn.on('data', (rawPacket: any) => {
      lastEngineIncomingBytes = rawPacket instanceof ArrayBuffer ? rawPacket.byteLength : rawPacket?.length ?? 0;
    });
    socket.on('client_capabilities', (caps: any) => {
      if (caps && typeof caps === 'object') {
        rm.setClientCapabilities(socket.id, caps);
      }
    });

    socket.on('join_room', (payload: any, cb?: any) => {
      joinRoomHandlerCalls++;
      handleJoinRoom(socket, payload, cb, {
        io,
        roomManager: rm,
        getRoomConfig,
        getJsonSafeHistory: getJsonSafeHistoryForTest
      });
    });

    socket.on('draw_binary', (rawBuf: any) => {
      drawBinaryHandlerCalls++;
      handleDrawBinary(socket, rawBuf, {
        io,
        roomManager: rm,
        drawRateLimiter: limiter
      });
    });

    socket.on('send_message', (data: any) => {
      sendMessageHandlerCalls++;
      handleSendMessage(socket, data, {
        io,
        roomManager: rm,
        chatLimits,
        checkRateLimit,
        normalizeArabic
      });
    });

    socket.on('submit_guess', (data: any) => {
      submitGuessHandlerCalls++;
      handleSubmitGuess(socket, data, {
        roomManager: rm,
        guessLimits,
        checkRateLimit
      });
    });

    socket.on('start_free_draw', () => {
      const p = rm.getPlayer(socket.id);
      if (p && p.roomId) rm.startFreeDraw(p.roomId, socket.id);
    });

    socket.on('transport_probe', (rawBuf: any, ack?: (res: any) => void) => {
      const len = rawBuf instanceof ArrayBuffer ? rawBuf.byteLength : rawBuf?.length ?? 0;
      if (typeof ack === 'function') ack({ receivedBytes: len });
    });

    socket.on('disconnect', (reason: string) => {
      serverDisconnectReasons.push({ socketId: socket.id, reason });
      rm.handleDisconnect(socket.id);
      limiter.cleanupSocket(socket.id);
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
  const { port } = httpServer.address() as AddressInfo;
  const serverUrl = `http://127.0.0.1:${port}`;
  const trackedClients: ClientSocket[] = [];

  try {
    // ── PART A: VALID INCOMING MESSAGES OVER REAL WEBSOCKET + MSGPACK ──
    // A1. Normal mode room ('norm-5b')
    const normalRoom = rm.createRoom('norm-5b');
    normalRoom.isExperimental = false;
    normalRoom.isFreeDraw = false;

    const normDrawer = await connectClient(serverUrl);
    const normGuesser = await connectClient(serverUrl);
    trackedClients.push(normDrawer, normGuesser);

    const normJoinDrawer = await emitWithAck(normDrawer, 'join_room', {
      roomId: 'norm-5b',
      nickname: 'NormDrawer',
      avatar: '✏️',
      playerId: 'norm-drawer-1',
      reconnectSecret: 'secret-norm-drawer-123456',
      supportsType13: false
    });
    const normJoinGuesser = await emitWithAck(normGuesser, 'join_room', {
      roomId: 'norm-5b',
      nickname: 'NormGuesser',
      avatar: '👀',
      playerId: 'norm-guesser-1',
      reconnectSecret: 'secret-norm-guesser-123456',
      supportsType13: false
    });
    check(
      Boolean(normJoinDrawer?.success && normJoinGuesser?.success),
      'A1. Typical join_room messages delivered & acknowledged over real WebSocket + MsgPack'
    );

    // Put Normal room into DRAWING with a fixed word
    normalRoom.gameState.status = 'DRAWING';
    normalRoom.gameState.currentDrawerId = 'norm-drawer-1';
    normalRoom.gameState.currentWord = 'تفاحة';

    // Typical send_message & submit_guess
    const msgPromise = waitForPredicate(
      () => (normalRoom.chatMessages || []).some((m) => m.text === 'مرحبا بالجميع'),
      'normalRoom.chatMessages receive send_message'
    );
    normGuesser.emit('send_message', { text: 'مرحبا بالجميع' });
    await msgPromise;

    const guessBroadcastPromise = new Promise<boolean>((resolve) => {
      const deadline = setTimeout(() => resolve(false), 3000);
      const handler = (m: any) => {
        if (m && m.text === 'قلم') {
          clearTimeout(deadline);
          normDrawer.off('receive_guess', handler);
          resolve(true);
        }
      };
      normDrawer.on('receive_guess', handler);
    });
    normGuesser.emit('submit_guess', { guess: 'قلم' });
    const guessDelivered = await guessBroadcastPromise;
    check(
      guessDelivered && (normalRoom.chatMessages || []).some((m) => m.text === 'مرحبا بالجميع'),
      'A2. Typical send_message and submit_guess delivered cleanly over real WebSocket + MsgPack'
    );

    // Small draw_binary (Type 4 bucket) + Theoretical max Normal Type 9 (65,535 points = 262,158 B raw -> 262,195 B wire)
    const receivedOnGuesser: ArrayBuffer[] = [];
    normGuesser.on('draw_binary', (raw: any) => {
      receivedOnGuesser.push(raw);
    });

    normDrawer.emit('draw_binary', makeRawType4('ndrw001', 1));
    await waitForPredicate(
      () => normalRoom.gameState.drawHistory.length === 1 && receivedOnGuesser.length === 1,
      'normalRoom Type 4 drawHistory + broadcast'
    );

    normDrawer.emit('draw_binary', maxNormalType9Raw);
    await waitForPredicate(
      () => normalRoom.gameState.drawHistory.length === 2 && receivedOnGuesser.length === 2,
      'normalRoom 65,535-pt Type 9 drawHistory + broadcast'
    );

    const relayedRaw = receivedOnGuesser[1] as any;
    const relayedMaxNormalView =
      relayedRaw instanceof ArrayBuffer
        ? new DataView(relayedRaw)
        : new DataView(relayedRaw.buffer, relayedRaw.byteOffset, relayedRaw.byteLength);
    check(
      normalRoom.gameState.drawHistory[0].data[0] === 4 &&
        normalRoom.gameState.drawHistory[1].data[0] === 9 &&
        normalRoom.gameState.drawHistory[1].data.length === 262158 &&
        relayedMaxNormalView.byteLength === 262158 &&
        relayedMaxNormalView.getUint16(14, true) === 65535,
      `A3. Small Type 4 & theoretical 65,535-pt Normal Type 9 (${maxNormalType9Wire} B wire) accepted & relayed intact`
    );

    // A4. Free Draw canonical room ('freedraw'): max Type 13 (3,000 pts) & max canonical Type 9 (3,000 pts)
    const fdRoom = rm.createRoom('freedraw');
    const fdDrawer = await connectClient(serverUrl);
    const fdViewer = await connectClient(serverUrl);
    trackedClients.push(fdDrawer, fdViewer);

    await emitWithAck(fdDrawer, 'join_room', {
      roomId: 'freedraw',
      nickname: 'FdDrawer',
      playerId: 'fd-drawer-1',
      reconnectSecret: 'secret-fd-drawer-123456',
      supportsType13: true
    });
    await emitWithAck(fdViewer, 'join_room', {
      roomId: 'freedraw',
      nickname: 'FdViewer',
      playerId: 'fd-viewer-1',
      reconnectSecret: 'secret-fd-viewer-123456',
      supportsType13: true
    });
    fdDrawer.emit('start_free_draw');
    await waitForPredicate(() => fdRoom.activeDrawers?.includes('fd-drawer-1') ?? false, 'fdRoom activeDrawers fd-drawer-1');

    const fdViewerBinaries: number[] = [];
    fdViewer.on('draw_binary', (raw: any) => {
      const len = raw instanceof ArrayBuffer ? raw.byteLength : raw?.length ?? 0;
      const t = raw instanceof ArrayBuffer ? new Uint8Array(raw)[0] : raw?.[0];
      fdViewerBinaries.push(t * 1_000_000 + len);
    });

    // Type 1 -> wait for room ready -> Type 13 (2,999 pts since Type 1 carries p0, total 3,000 canonical pts!) -> Type 3
    const maxCanonType13_2999 = makeWorstCaseType13('fd00001', 2999);
    const maxCanonType13Wire2999 = encodeWireBytes('draw_binary', maxCanonType13_2999);
    // Let initial room_state_update flush before volatile Type 13 emit
    await new Promise((r) => setTimeout(r, 25));
    fdDrawer.emit('draw_binary', makeRawType1('fd00001', 0));
    await waitForPredicate(
      () => fdViewerBinaries.some((v) => Math.floor(v / 1_000_000) === 1),
      'fdViewer received Type 1 start'
    );
    fdDrawer.emit('draw_binary', maxCanonType13_2999);
    await waitForPredicate(
      () => fdViewerBinaries.some((v) => Math.floor(v / 1_000_000) === 13),
      'fdViewer received Type 13 move'
    );
    fdDrawer.emit('draw_binary', makeRawType3('fd00001', 0, 1, 3000));
    await waitForPredicate(() => fdRoom.gameState.drawHistory.length >= 1, 'fdRoom Type 13 stroke commit'); // consolidated canonical Type 9

    // Also verify standalone canonical Type 9 (3,000 pts + strokeId = 12,018 B raw -> 12,053 B wire)
    const fdDrawerMax9 = await connectClient(serverUrl);
    trackedClients.push(fdDrawerMax9);
    await emitWithAck(fdDrawerMax9, 'join_room', {
      roomId: 'freedraw',
      nickname: 'FdDrawer2',
      playerId: 'fd-drawer-2',
      reconnectSecret: 'secret-fd-drawer-234567',
      supportsType13: true
    });
    fdDrawerMax9.emit('start_free_draw');
    await waitForPredicate(() => fdRoom.activeDrawers?.includes('fd-drawer-2') ?? false, 'fdRoom activeDrawers fd-drawer-2');

    const histBeforeRedo = fdRoom.gameState.drawHistory.length;
    fdDrawerMax9.emit('draw_binary', maxCanonType9Raw); // 3,000 pts + strokeId (12,018 B raw -> 12,053 B wire)
    await waitForPredicate(() => fdRoom.gameState.drawHistory.length === histBeforeRedo + 1, 'fdRoom canonical Type 9 redo commit');

    check(
      maxCanonType13Wire2999 < MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES &&
        fdRoom.gameState.drawHistory.some((h) => h.data[0] === 9 && h.data.length === 12018) &&
        fdViewerBinaries.some((v) => Math.floor(v / 1_000_000) === 13),
      'A4. Max canonical Type 13 stroke (2,999 moves + start = 3,000 pts) & max canonical Type 9 (3,000 pts) succeed over WebSocket'
    );

    // ── PART B: EXACT ENCODED WIRE-SIZE BOUNDARY (524,287 / 524,288 / 524,289 B) ──
    const probeSockBelow = await connectClient(serverUrl);
    const probeSockExact = await connectClient(serverUrl);
    trackedClients.push(probeSockBelow, probeSockExact);

    // Calibrate 'transport_probe' WITH ack id=0 raw payload length to exact wire 524,287 and 524,288
    const probeHeaderOverheadWithAck = encodeWireBytes('transport_probe', makeBoundaryProbeBuffer(100_000), 0) - 100_000;
    const probeBelowAck = await emitWithAck<{ receivedBytes: number }>(
      probeSockBelow,
      'transport_probe',
      makeBoundaryProbeBuffer(524287 - probeHeaderOverheadWithAck)
    );
    const probeBelowWireObserved = lastEngineIncomingBytes;
    const probeExactAck = await emitWithAck<{ receivedBytes: number }>(
      probeSockExact,
      'transport_probe',
      makeBoundaryProbeBuffer(524288 - probeHeaderOverheadWithAck)
    );
    const probeExactWireObserved = lastEngineIncomingBytes;

    // Also test exact wire 524,287 & 524,288 directly on production event 'draw_binary'
    const callsBeforeBoundaryDraw = drawBinaryHandlerCalls;
    probeSockBelow.emit('draw_binary', makeBoundaryProbeBuffer(boundaryBelowRawLen));
    await waitForPredicate(() => drawBinaryHandlerCalls === callsBeforeBoundaryDraw + 1, 'draw_binary MAX-1 handler');
    const drawBelowWireObserved = lastEngineIncomingBytes;
    probeSockExact.emit('draw_binary', makeBoundaryProbeBuffer(boundaryExactRawLen));
    await waitForPredicate(() => drawBinaryHandlerCalls === callsBeforeBoundaryDraw + 2, 'draw_binary exact MAX handler');
    const drawExactWireObserved = lastEngineIncomingBytes;

    check(
      probeBelowWireObserved === 524287 &&
        probeExactWireObserved === 524288 &&
        drawBelowWireObserved === 524287 &&
        drawExactWireObserved === 524288 &&
        probeBelowAck.receivedBytes === 524287 - probeHeaderOverheadWithAck &&
        probeExactAck.receivedBytes === 524288 - probeHeaderOverheadWithAck &&
        drawBinaryHandlerCalls === callsBeforeBoundaryDraw + 2,
      `B1 & B2. Observed live Engine.IO wire bytes ${probeBelowWireObserved}/${probeExactWireObserved} (probe) and ${drawBelowWireObserved}/${drawExactWireObserved} (draw_binary) accepted`
    );

    // ── PART C: OVERSIZED BINARY & NON-BINARY REJECTION + HEALTHY BYSTANDER ──
    const badBinSock = await connectClient(serverUrl);
    const badTextSock = await connectClient(serverUrl);
    trackedClients.push(badBinSock, badTextSock);

    await emitWithAck(badBinSock, 'join_room', {
      roomId: 'freedraw',
      nickname: 'BadBin',
      playerId: 'bad-bin-1',
      reconnectSecret: 'secret-bad-bin-123456'
    });
    await emitWithAck(badTextSock, 'join_room', {
      roomId: 'freedraw',
      nickname: 'BadText',
      playerId: 'bad-text-1',
      reconnectSecret: 'secret-bad-text-123456'
    });

    const fdHistBeforeAttack = fdRoom.gameState.drawHistory.length;
    const fdMsgsBeforeAttack = (fdRoom.chatMessages || []).length;
    let bystanderEventsDuringAttack = 0;
    const attackListener = () => {
      bystanderEventsDuringAttack++;
    };
    fdViewer.on('draw_binary', attackListener);
    fdViewer.on('receive_message', attackListener);

    // C1. Oversized binary: 524,289 B encoded MsgPack frame (MAX + 1 byte!)
    const drawCallsBeforeBadBin = drawBinaryHandlerCalls;
    const badBinClientDisconnect = new Promise<string>((resolve) => {
      badBinSock.once('disconnect', (reason) => resolve(reason));
    });
    badBinSock.emit('draw_binary', makeBoundaryProbeBuffer(boundaryOverRawLen));
    const badBinDisconnectReason = await badBinClientDisconnect;
    await new Promise((r) => setTimeout(r, 40));

    check(
      drawBinaryHandlerCalls === drawCallsBeforeBadBin &&
        fdRoom.gameState.drawHistory.length === fdHistBeforeAttack &&
        bystanderEventsDuringAttack === 0 &&
        badBinDisconnectReason === 'transport close',
      `C1. Oversized binary (524,289 B wire = MAX+1) rejected pre-handler (calls=+0, reason="${badBinDisconnectReason}")`
    );

    // C2. Oversized non-binary payload (large string on send_message > 524,288 B)
    const oversizedStringPayload = { text: 'أ'.repeat(270_000) }; // 270k Arabic 2-byte UTF-8 chars ~ 540 KB > 524,288 B
    const oversizedTextWire = encodeWireBytes('send_message', oversizedStringPayload);
    const sendMsgCallsBefore = sendMessageHandlerCalls;
    const badTextClientDisconnect = new Promise<string>((resolve) => {
      badTextSock.once('disconnect', (reason) => resolve(reason));
    });
    badTextSock.emit('send_message', oversizedStringPayload);
    const badTextDisconnectReason = await badTextClientDisconnect;
    await new Promise((r) => setTimeout(r, 40));

    fdViewer.off('draw_binary', attackListener);
    fdViewer.off('receive_message', attackListener);

    check(
      oversizedTextWire > MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES &&
        sendMessageHandlerCalls === sendMsgCallsBefore &&
        (fdRoom.chatMessages || []).length === fdMsgsBeforeAttack &&
        bystanderEventsDuringAttack === 0 &&
        badTextDisconnectReason === 'transport close',
      `C2. Oversized non-binary send_message (${oversizedTextWire} B wire) rejected pre-handler (calls=+0, reason="${badTextDisconnectReason}")`
    );

    // Also test oversized non-binary join_room before handler runs
    const badJoinSock = await connectClient(serverUrl);
    trackedClients.push(badJoinSock);
    const oversizedJoinPayload = {
      roomId: 'freedraw',
      nickname: 'x'.repeat(530_000),
      playerId: 'bad-join-1',
      reconnectSecret: 'secret-bad-join-123456'
    };
    const oversizedJoinWire = encodeWireBytes('join_room', oversizedJoinPayload);
    const joinCallsBefore = joinRoomHandlerCalls;
    const badJoinDisconnect = new Promise<string>((resolve) => {
      badJoinSock.once('disconnect', (r) => resolve(r));
    });
    badJoinSock.emit('join_room', oversizedJoinPayload);
    const badJoinReason = await badJoinDisconnect;
    check(
      oversizedJoinWire > MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES &&
        joinRoomHandlerCalls === joinCallsBefore &&
        badJoinReason === 'transport close',
      `C2b. Oversized non-binary join_room (${oversizedJoinWire} B wire) rejected pre-handler (calls=+0, reason="${badJoinReason}")`
    );

    // C3. Oversized probe exceeding 524,288 B also closes transport cleanly (verify exact MAX+1 on probe too)
    const probeOverSock = await connectClient(serverUrl);
    trackedClients.push(probeOverSock);
    const probeOverWire = encodeWireBytes('transport_probe', makeBoundaryProbeBuffer(524289 - probeHeaderOverheadWithAck), 0);
    const probeOverDisconnect = new Promise<string>((resolve) => {
      probeOverSock.once('disconnect', (reason) => resolve(reason));
    });
    let probeOverAcked = false;
    probeOverSock.emit('transport_probe', makeBoundaryProbeBuffer(524289 - probeHeaderOverheadWithAck), () => {
      probeOverAcked = true;
    });
    const probeOverReason = await probeOverDisconnect;
    check(
      probeOverWire === 524289 && !probeOverAcked && probeOverReason === 'transport close',
      `B3. Exact MAX+1 probe (524,289 B) rejected pre-handler without ack (reason="${probeOverReason}")`
    );

    // Verify healthy bystander remains connected & functional
    const healthyChatPromise = waitForPredicate(() => (fdRoom.chatMessages || []).some((m) => m.text === 'سليم'));
    fdViewer.emit('send_message', { text: 'سليم' });
    await healthyChatPromise;
    check(
      fdViewer.connected && (fdRoom.chatMessages || []).some((m) => m.text === 'سليم'),
      'C3. Healthy bystander client remains connected and functional after oversized attacks'
    );

    // ── PART D: RECONNECTION & APPLICATION REJOIN AFTER OVERSIZED DISCONNECT ──
    const expRoom = rm.createRoom('general');
    const recoSock = await connectClient(serverUrl, { reconnection: true });
    trackedClients.push(recoSock);

    const recoPid = 'reco-player-1';
    const recoSecret = 'reco-secret-999999999999';
    const initialJoin = await emitWithAck(recoSock, 'join_room', {
      roomId: 'general',
      nickname: 'RecoTester',
      playerId: recoPid,
      reconnectSecret: recoSecret,
      supportsType13: true
    });
    expRoom.gameState.status = 'DRAWING';
    expRoom.gameState.currentDrawerId = recoPid;
    expRoom.gameState.currentWord = 'شمس';

    // Commit 1 valid stroke before disconnect
    recoSock.emit('draw_binary', makeRawType1('rec0001', 0));
    recoSock.emit('draw_binary', makeWorstCaseType13('rec0001', 5));
    recoSock.emit('draw_binary', makeRawType3('rec0001', 0, 1, 6));
    await waitForPredicate(() => expRoom.gameState.drawHistory.length >= 1, 'expRoom stroke before disconnect');
    const idBeforeDisconnect = recoSock.id;

    // Arm disconnect + auto transport reconnect listeners BEFORE emitting oversize packet
    const transportDisconnectP = new Promise<string>((resolve) => {
      recoSock.once('disconnect', (r) => resolve(r));
    });
    const transportReconnectP = new Promise<string | undefined>((resolve) => {
      // Wait for the NEXT connect after disconnect
      recoSock.once('disconnect', () => {
        recoSock.once('connect', () => resolve(recoSock.id));
      });
    });

    recoSock.emit('draw_binary', makeBoundaryProbeBuffer(boundaryOverRawLen)); // 524,289 B -> kicks transport error
    const recoDisconnectReason = await transportDisconnectP;
    const idAfterReconnect = await transportReconnectP;

    check(
      recoDisconnectReason === 'transport close' &&
        typeof idAfterReconnect === 'string' &&
        idAfterReconnect.length > 0 &&
        idAfterReconnect !== idBeforeDisconnect &&
        recoSock.connected,
      `D1. Transport auto-reconnected after oversized disconnect (reason="${recoDisconnectReason}", oldId=${idBeforeDisconnect} -> newId=${idAfterReconnect})`
    );

    // Application-level room rejoin with reconnectSecret + history sync verification
    const historySyncPromise = waitForEvent<any[]>(recoSock, 'draw_history_sync');
    const rejoinAck = await emitWithAck(recoSock, 'join_room', {
      roomId: 'general',
      nickname: 'RecoTester',
      playerId: recoPid,
      reconnectOnly: true,
      reconnectSecret: recoSecret,
      supportsType13: true
    });
    const syncedHistory = await historySyncPromise;

    // Verify reconnected player can continue drawing normally
    const histLenBeforeNewStroke = expRoom.gameState.drawHistory.length;
    recoSock.emit('draw_binary', makeRawType1('rec0001', 0));
    recoSock.emit('draw_binary', makeWorstCaseType13('rec0001', 5));
    recoSock.emit('draw_binary', makeRawType3('rec0001', 0, 2, 6));
    await waitForPredicate(() => expRoom.gameState.drawHistory.length >= histLenBeforeNewStroke + 1, 'expRoom stroke after rejoin');

    check(
      Boolean(rejoinAck?.success && rejoinAck?.reconnected === true) &&
        Array.isArray(syncedHistory) &&
        syncedHistory.length >= 1 &&
        expRoom.gameState.drawHistory.length >= histLenBeforeNewStroke + 1,
      'D2. Application-level room rejoin via reconnectSecret restored history and resumed drawing cleanly'
    );

    // ── PART E: OUTBOUND > 512 KiB MESSAGE UNRESTRICTED BY INBOUND LIMIT ──
    const outClient = await connectClient(serverUrl);
    trackedClients.push(outClient);

    const largeOutboundEntries = Array.from({ length: 50 }, (_, idx) => ({
      event: 'draw_binary',
      data: Array.from(Buffer.from(makeRawType9ArrayBuffer('out0001', 3000, 0, true, idx + 1)))
    }));
    const outboundWireBytes = encodeWireBytes('draw_history_sync', largeOutboundEntries);
    const outSyncPromise = waitForEvent<any[]>(outClient, 'draw_history_sync');
    io.to(outClient.id!).emit('draw_history_sync', largeOutboundEntries);
    const receivedOutboundSync = await outSyncPromise;

    check(
      outboundWireBytes > MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES &&
        Array.isArray(receivedOutboundSync) &&
        receivedOutboundSync.length === 50 &&
        outClient.connected,
      `E. Server emitted ${outboundWireBytes} B (> 512 KiB) outbound draw_history_sync cleanly without connection drop`
    );
  } finally {
    // Deterministic cleanup of all client sockets, Socket.IO, HTTP server, and then timers
    for (const sock of trackedClients) {
      try {
        (sock as any).io.opts.reconnection = false;
        sock.disconnect();
      } catch {}
    }
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
    if (httpServer.listening) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
    cleanupRoomManagerTimers(rm);
  }

  console.log('\n==================================================================');
  console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
  console.log('==================================================================');

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('❌ UNHANDLED TEST ERROR:', err);
  process.exitCode = 1;
});

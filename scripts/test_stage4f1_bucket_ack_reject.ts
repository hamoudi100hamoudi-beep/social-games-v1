import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, Page } from 'playwright';
import { createServer as createViteServer, ViteDevServer } from 'vite';
import { roomManager } from '../server/rooms.js';
import { handleDrawBinary } from '../server/registerDrawBinaryHandler.js';
import { handleJoinRoom } from '../server/registerJoinRoomHandler.js';
import { handleRequestRoundSync } from '../server/registerRequestRoundSyncHandler.js';
import { DrawRateLimiter } from '../server/drawRateLimit.js';
import { ControlRateLimiter } from '../server/rateLimit.js';
import { encodeBinaryDrawMessage } from '../src/utils/drawBinaryHelper.js';

function findChromiumExecutable(): string | undefined {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
    '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
    '/ms-playwright/chromium-1247/chrome-linux64/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome'
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const getJsonSafeHistory = (history: any[]): any[] => {
  if (!Array.isArray(history)) return [];
  return history.map((cmd) => {
    const entry: any = {
      event: cmd.event,
      data: Buffer.isBuffer(cmd.data) ? Array.from(cmd.data) : cmd.data
    };
    if (cmd.instId || cmd.instanceId) entry.instanceId = cmd.instId || cmd.instanceId;
    if (cmd.strokeId !== undefined) entry.strokeId = cmd.strokeId;
    return entry;
  });
};

function makeBucketBuf(
  instId: string,
  strokeId: number,
  x = 0.5,
  y = 0.5,
  color = '#ef4444',
  opacity = 1
): Buffer {
  const ab = encodeBinaryDrawMessage('draw_action', {
    tool: 'bucket',
    color,
    opacity,
    x,
    y,
    targetR: 255,
    targetG: 255,
    targetB: 255,
    targetA: 255,
    strokeId,
    instanceId: instId
  });
  return Buffer.from(ab);
}

function makeUndoBuf(instId: string, strokeId: number): Buffer {
  const ab = encodeBinaryDrawMessage('draw_undo', {
    instanceId: instId,
    strokeId
  });
  return Buffer.from(ab);
}

function makeClearBuf(instId: string): Buffer {
  const ab = encodeBinaryDrawMessage('draw_clear', {
    instanceId: instId
  });
  return Buffer.from(ab);
}

function createServerHarness(roomId: string, options?: { drawRateLimiter?: DrawRateLimiter }) {
  const emittedSocket: { event: string; payload: any }[] = [];
  const emittedRoom: { event: string; payload: any }[] = [];
  const roundSyncLimits = new Map<string, number[]>();
  const controlLimiter = new ControlRateLimiter();
  const drawLimiter = options?.drawRateLimiter ?? new DrawRateLimiter();

  const mockIo: any = {
    to: (_targetRoomOrSocket: string) => ({
      emit: (event: string, payload: any) => {
        emittedRoom.push({ event, payload });
      }
    }),
    sockets: {
      sockets: new Map(),
      adapter: { rooms: new Map() }
    }
  };
  roomManager.setIo(mockIo);

  const mockSocket: any = {
    id: `sock-${roomId}-${Math.random().toString(36).slice(2, 7)}`,
    connected: true,
    join: () => {},
    emit: (event: string, payload: any) => {
      emittedSocket.push({ event, payload });
    },
    broadcast: {
      to: (_rid: string) => ({
        emit: (event: string, payload: any) => {
          emittedRoom.push({ event, payload });
        }
      })
    }
  };

  mockIo.sockets.sockets.set(mockSocket.id, mockSocket);

  const playerId = `pid-${roomId}-drawer-${Math.random().toString(36).slice(2, 6)}`;
  const secret = `secret_token_${roomId}_0123456789`;
  const nickname = `Drw_${Math.random().toString(36).slice(2, 7)}`;
  const existingBeforeJoin = roomManager.getRoom(roomId);
  if (existingBeforeJoin && existingBeforeJoin.players.length > 0) {
    existingBeforeJoin.players.slice().forEach((p) => {
      try {
        roomManager.removePlayer(p.id);
      } catch {}
    });
    existingBeforeJoin.players = [];
  }

  let joinRes: any = null;
  handleJoinRoom(
    mockSocket,
    {
      roomId,
      nickname,
      playerId,
      reconnectSecret: secret
    },
    (res) => {
      joinRes = res;
    },
    {
      io: mockIo,
      roomManager,
      getJsonSafeHistory,
      controlRateLimiter: controlLimiter
    }
  );
  assert.strictEqual(joinRes?.success, true, `Failed to join room ${roomId}: ${JSON.stringify(joinRes)}`);

  const room = roomManager.getRoom(roomId)!;
  if (!room.isFreeDraw) {
    room.gameState.status = 'DRAWING';
    room.gameState.currentDrawerId = playerId;
    room.gameState.timeLeft = 100;
  } else {
    room.activeDrawers = [playerId, mockSocket.id];
  }

  return {
    room,
    playerId,
    secret,
    mockIo,
    mockSocket,
    drawLimiter,
    emittedSocket,
    emittedRoom,
    sendBinary: (buf: Buffer, nowOverride?: number) =>
      handleDrawBinary(mockSocket, buf, {
        io: mockIo,
        roomManager,
        drawRateLimiter: drawLimiter,
        ...(nowOverride !== undefined ? { now: () => nowOverride } : {})
      }),
    requestSync: () => {
      const prevLen = emittedSocket.length;
      handleRequestRoundSync(mockSocket, () => {}, {
        roomManager,
        roundSyncLimits,
        checkRateLimit: () => true,
        getJsonSafeHistory
      });
      return emittedSocket.slice(prevLen);
    }
  };
}

async function runServerUnitTests() {
  console.log('--- Running Stage 4F-1 Server ACK / REJECT Unit Tests ---');
  const inst = 'inst4F1';

  // 1. Competitive Experimental Accepted Type 4 -> ACK to drawer only, NOT room
  {
    roomManager.clearDrawHistory('General #Test');
    const h = createServerHarness('General #Test');
    h.room.gameState.drawEpoch = 0;
    h.room.gameState.lockedBucketTarget = null;
    h.room.gameState.drawHistory = [];
    h.emittedSocket.length = 0;
    h.emittedRoom.length = 0;

    h.sendBinary(makeBucketBuf(inst, 11));

    const acks = h.emittedSocket.filter((e) => e.event === 'draw_action_ack');
    const roomAcks = h.emittedRoom.filter((e) => e.event === 'draw_action_ack');
    assert.strictEqual(acks.length, 1, 'Accepted Type 4 must emit draw_action_ack to drawer socket');
    assert.deepStrictEqual(acks[0].payload, { drawEpoch: 0, instId: inst, strokeId: 11 });
    assert.strictEqual(roomAcks.length, 0, 'draw_action_ack must never be broadcast to room spectators');
    assert.strictEqual(
      h.emittedRoom.filter((e) => e.event === 'draw_binary').length,
      1,
      'Accepted Type 4 must broadcast binary command to room'
    );
    assert.strictEqual(h.room.gameState.drawHistory?.length, 1);
  }

  // 2. Rate Limiter Rejection -> draw_action_rejected(rate_limit) to drawer only, NO room broadcast
  {
    roomManager.clearDrawHistory('General #Test');
    const customLimiter = { consume: () => false } as unknown as DrawRateLimiter;
    const h = createServerHarness('General #Test', { drawRateLimiter: customLimiter });
    h.room.gameState.drawEpoch = 2;
    h.room.gameState.drawHistory = [];
    h.emittedSocket.length = 0;
    h.emittedRoom.length = 0;

    h.sendBinary(makeBucketBuf(inst, 21));

    const rejects = h.emittedSocket.filter((e) => e.event === 'draw_action_rejected');
    const roomEvents = h.emittedRoom.length;
    assert.strictEqual(rejects.length, 1, 'Rate-limited Type 4 must emit draw_action_rejected to drawer');
    assert.deepStrictEqual(rejects[0].payload, {
      drawEpoch: 2,
      instId: inst,
      strokeId: 21,
      reason: 'rate_limit'
    });
    assert.strictEqual(roomEvents, 0, 'Rejected Type 4 must never emit or abort to room');
    assert.strictEqual(h.room.gameState.drawHistory?.length, 0);
  }

  // 3. Turn ended & not_drawer rejection paths
  {
    roomManager.clearDrawHistory('Experimental Draw');
    const h = createServerHarness('Experimental Draw');
    h.room.gameState.drawEpoch = 1;
    h.room.gameState.drawHistory = [];

    // 3a. turn_ended
    h.room.gameState.status = 'ROUND_END';
    h.emittedSocket.length = 0;
    h.emittedRoom.length = 0;
    h.sendBinary(makeBucketBuf(inst, 31));
    assert.deepStrictEqual(
      h.emittedSocket.filter((e) => e.event === 'draw_action_rejected').map((e) => e.payload),
      [{ drawEpoch: 1, instId: inst, strokeId: 31, reason: 'turn_ended' }]
    );
    assert.strictEqual(h.emittedRoom.length, 0);

    // 3b. not_drawer
    h.room.gameState.status = 'DRAWING';
    h.room.gameState.currentDrawerId = 'someone-else';
    h.emittedSocket.length = 0;
    h.emittedRoom.length = 0;
    h.sendBinary(makeBucketBuf(inst, 32));
    assert.deepStrictEqual(
      h.emittedSocket.filter((e) => e.event === 'draw_action_rejected').map((e) => e.payload),
      [{ drawEpoch: 1, instId: inst, strokeId: 32, reason: 'not_drawer' }]
    );
    assert.strictEqual(h.emittedRoom.length, 0);
  }

  // 4. Structural validation failure with trusted vs untrusted identity
  {
    roomManager.clearDrawHistory('General #Test');
    const h = createServerHarness('General #Test');
    h.room.gameState.drawEpoch = 0;
    h.room.gameState.drawHistory = [];
    h.emittedSocket.length = 0;
    h.emittedRoom.length = 0;

    // Valid instId + strokeId but invalid opacity = 150
    const badOpacity = makeBucketBuf(inst, 41);
    badOpacity[12] = 150;
    h.sendBinary(badOpacity);
    assert.deepStrictEqual(
      h.emittedSocket.filter((e) => e.event === 'draw_action_rejected').map((e) => e.payload),
      [{ drawEpoch: 0, instId: inst, strokeId: 41, reason: 'invalid_packet' }]
    );
    assert.strictEqual(h.emittedRoom.length, 0);

    // Untrusted identity: corrupt instId byte + invalid packet -> NO reject event emitted
    h.emittedSocket.length = 0;
    const untrustedInst = makeBucketBuf(inst, 42);
    untrustedInst[1] = 0x01; // control char
    untrustedInst[12] = 150;
    h.sendBinary(untrustedInst);
    assert.strictEqual(h.emittedSocket.length, 0, 'Untrusted instId must not trigger draw_action_rejected');

    // Missing strokeId (strokeId=0) -> NO reject event emitted
    const zeroStroke = makeBucketBuf(inst, 0);
    zeroStroke[12] = 150;
    h.sendBinary(zeroStroke);
    assert.strictEqual(h.emittedSocket.length, 0, 'Zero/untrusted strokeId must not trigger draw_action_rejected');
  }

  // 5. Actual recording failure -> not_recorded
  {
    roomManager.clearDrawHistory('General #Test');
    const h = createServerHarness('General #Test');
    h.room.gameState.drawEpoch = 4;
    h.emittedSocket.length = 0;
    h.emittedRoom.length = 0;

    const spyRoomManager = Object.create(roomManager);
    spyRoomManager.recordDrawCommand = () => ({ recorded: false, drawEpoch: 4 });

    handleDrawBinary(h.mockSocket, makeBucketBuf(inst, 51), {
      io: h.mockIo,
      roomManager: spyRoomManager,
      drawRateLimiter: new DrawRateLimiter()
    });

    assert.deepStrictEqual(
      h.emittedSocket.filter((e) => e.event === 'draw_action_rejected').map((e) => e.payload),
      [{ drawEpoch: 4, instId: inst, strokeId: 51, reason: 'not_recorded' }]
    );
    assert.strictEqual(h.emittedRoom.length, 0);
  }

  // 6. Mode Isolation: Free Draw & Normal rooms NEVER emit draw_action_ack or draw_action_rejected
  {
    roomManager.clearDrawHistory('Free Draw');
    const hFree = createServerHarness('Free Draw');
    hFree.emittedSocket.length = 0;
    hFree.sendBinary(makeBucketBuf(inst, 61));
    assert.strictEqual(
      hFree.emittedSocket.filter((e) => e.event === 'draw_action_ack' || e.event === 'draw_action_rejected').length,
      0,
      'Free Draw must never emit Competitive ACK/REJECT events'
    );

    const hFreeLimited = createServerHarness('Free Draw', {
      drawRateLimiter: { consume: () => false } as unknown as DrawRateLimiter
    });
    hFreeLimited.emittedSocket.length = 0;
    hFreeLimited.sendBinary(makeBucketBuf(inst, 62));
    assert.strictEqual(
      hFreeLimited.emittedSocket.filter((e) => e.event === 'draw_action_rejected').length,
      0,
      'Free Draw rate limit must not emit Competitive REJECT event'
    );

    // Normal (non-experimental, non-freedraw) room isolation check
    const normEmittedSocket: { event: string; payload: any }[] = [];
    const normEmittedRoom: { event: string; payload: any }[] = [];
    const normRoom: any = {
      id: 'norm-4f1',
      isExperimental: false,
      isFreeDraw: false,
      gameState: { status: 'DRAWING', currentDrawerId: 'p-norm', drawHistory: [], redoStack: [], drawEpoch: 0 }
    };
    const normRoomManager: any = {
      getPlayer: () => ({ id: 'sock-norm', persistentId: 'p-norm', roomId: 'norm-4f1' }),
      getRoom: () => normRoom,
      recordDrawCommand: () => ({ recorded: true, drawEpoch: 0 })
    };
    const normSock: any = {
      id: 'sock-norm',
      emit: (event: string, payload: any) => normEmittedSocket.push({ event, payload }),
      broadcast: { to: () => ({ emit: (event: string, payload: any) => normEmittedRoom.push({ event, payload }) }) }
    };
    handleDrawBinary(normSock, makeBucketBuf(inst, 63), { roomManager: normRoomManager, drawRateLimiter: new DrawRateLimiter() });
    handleDrawBinary(normSock, makeBucketBuf(inst, 64), {
      roomManager: normRoomManager,
      drawRateLimiter: { consume: () => false } as unknown as DrawRateLimiter
    });
    assert.strictEqual(
      normEmittedSocket.filter((e) => e.event === 'draw_action_ack' || e.event === 'draw_action_rejected').length,
      0,
      'Normal room must never emit Competitive ACK/REJECT events'
    );
  }

  console.log('✅ Server Unit Tests PASSED');
}

const HARNESS_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Stage 4F-1 Test</title>
    <style>
      html, body { margin: 0; padding: 0; background: #fff; }
      #harness-root { position: relative; width: 740px; height: 430px; background: #ffffff; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="harness-root"></div>
    <script type="module" src="/__stage4f1_main.js"></script>
  </body>
</html>`;

const HARNESS_MAIN_TSX = `
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SocketProvider } from '/src/components/SocketProvider.tsx';
import DrawingCanvasCore from '/src/components/game/DrawingCanvasCore.tsx';

const urlParams = new URLSearchParams(window.location.search);
let __initialCfgOverrides = {};
try {
  const raw = urlParams.get('cfg');
  if (raw) __initialCfgOverrides = JSON.parse(raw);
} catch {}

function getPixelRGBA(xNorm, yNorm) {
  const c = document.getElementById('drawing-board-layer-primary');
  if (!c) return null;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const x = Math.max(0, Math.min(c.width - 1, Math.floor(xNorm * c.width)));
  const y = Math.max(0, Math.min(c.height - 1, Math.floor(yNorm * c.height)));
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

function getCanvasHash() {
  const c = document.getElementById('drawing-board-layer-primary');
  if (!c) return '';
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let h = 2166136261;
  for (let i = 0; i < data.length; i += 4) {
    h ^= data[i];
    h = Math.imul(h, 16777619);
    h ^= data[i + 1];
    h = Math.imul(h, 16777619);
    h ^= data[i + 2];
    h = Math.imul(h, 16777619);
    h ^= data[i + 3];
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function TestStage4F1App() {
  const canvasRef = useRef(null);
  const [config, setConfig] = useState(() => ({
    readOnly: false,
    tool: 'pencil',
    color: '#000000',
    thickness: 8,
    opacity: 1,
    isFreeDraw: false,
    isExperimental: true,
    enableBitmapUndoCache: true,
    enableCanvasAlpha: true,
    enableDestinationOutEraser: true,
    enableInputOptimizations: true,
    isRoomJoined: true,
    status: 'DRAWING',
    currentDrawerId: 'player-drawer-1',
    deferredReset: false,
    ...__initialCfgOverrides
  }));
  const historyRef = useRef({ index: 0, length: 1 });

  useEffect(() => {
    window.__STAGE4F1__ = {
      setConfig: (patch) => setConfig((prev) => ({ ...prev, ...patch })),
      undo: () => canvasRef.current?.undo(),
      redo: () => canvasRef.current?.redo(),
      clear: () => canvasRef.current?.clear(),
      getHistoryState: () => ({
        ...historyRef.current,
        canUndo: historyRef.current.index > 0,
        canRedo: historyRef.current.length > historyRef.current.index + 1
      }),
      getCompetitiveCommandSnapshot: () => canvasRef.current?.getCompetitiveCommandSnapshot?.() || [],
      getCanvasDimensions: () => {
        const c = document.getElementById('drawing-board-layer-primary');
        return c ? { width: c.width, height: c.height, rect: c.getBoundingClientRect().toJSON() } : null;
      },
      getPixelRGBA,
      getCanvasHash,
      getEmitted: () => window.__STAGE4F1_EMITS__ || [],
      clearEmitted: () => { window.__STAGE4F1_EMITS__ = []; },
      dispatchSocket: (event, payload) => window.__STAGE4F1_DISPATCH__?.(event, payload)
    };
  }, []);

  return React.createElement(
    'div',
    { style: { position: 'relative', width: '740px', height: '430px' } },
    React.createElement(DrawingCanvasCore, {
      ref: canvasRef,
      ...config,
      onHistoryStateChange: (index, length) => {
        historyRef.current = { index, length };
      }
    })
  );
}

createRoot(document.getElementById('harness-root')).render(
  React.createElement(SocketProvider, null, React.createElement(TestStage4F1App))
);
`;

const MOCK_SOCKET_PROVIDER_JS = `
import React, { createContext, useContext } from 'react';

const listeners = {};
window.__STAGE4F1_EMITS__ = [];

const mockSocket = {
  id: 'stage4f1_test_socket',
  connected: true,
  emit: (event, payload, ack) => {
    const entry = {
      event,
      payloadBytes: payload && payload.byteLength ? Array.from(new Uint8Array(payload)) : null
    };
    window.__STAGE4F1_EMITS__.push(entry);
    if (typeof window.__STAGE4F1_SERVER_BRIDGE__ === 'function') {
      window.__STAGE4F1_SERVER_BRIDGE__(event, entry.payloadBytes);
    }
    if (typeof ack === 'function') {
      ack({ success: true });
    }
  },
  on: (event, cb) => {
    if (!listeners[event]) listeners[event] = new Set();
    listeners[event].add(cb);
  },
  off: (event, cb) => {
    if (listeners[event]) listeners[event].delete(cb);
  },
  volatile: {
    emit: (event, payload) => {
      const bytes = payload && payload.byteLength ? Array.from(new Uint8Array(payload)) : null;
      if (typeof window.__STAGE4F1_SERVER_BRIDGE__ === 'function') {
        window.__STAGE4F1_SERVER_BRIDGE__(event, bytes);
      }
    }
  }
};

window.__STAGE4F1_DISPATCH__ = (event, payload) => {
  if (event === 'disconnect') {
    mockSocket.connected = false;
  } else if (event === 'connect') {
    mockSocket.connected = true;
  }
  const set = listeners[event];
  if (set) {
    for (const cb of Array.from(set)) {
      cb(payload);
    }
  }
};

const SocketContext = createContext({
  socket: mockSocket,
  isConnected: true,
  transport: 'websocket',
  connectError: null,
  lastHeartbeatAck: Date.now()
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) =>
  React.createElement(
    SocketContext.Provider,
    {
      value: {
        socket: mockSocket,
        isConnected: true,
        transport: 'websocket',
        connectError: null,
        lastHeartbeatAck: Date.now()
      }
    },
    children
  );
`;

async function startHarnessViteServer(): Promise<{ server: ViteDevServer; url: string }> {
  const rootDir = path.resolve(process.cwd());
  const socketProviderPath = path.resolve(rootDir, 'src/components/SocketProvider.tsx').replace(/\\/g, '/');

  const server = await createViteServer({
    root: rootDir,
    logLevel: 'silent',
    server: { port: 0, strictPort: false, hmr: false },
    plugins: [
      {
        name: 'stage4f1-harness-plugin',
        enforce: 'pre',
        resolveId(id, importer) {
          if (id === '/__stage4f1_main.js') return '\0stage4f1-main.js';
          if (id.endsWith('SocketProvider') || id.endsWith('SocketProvider.tsx')) {
            const resolved = id.startsWith('/src/')
              ? path.resolve(rootDir, id.slice(1)).replace(/\\/g, '/')
              : (importer ? path.resolve(path.dirname(importer), id).replace(/\\/g, '/') : id);
            if (resolved === socketProviderPath || resolved + '.tsx' === socketProviderPath) {
              return '\0stage4f1-mock-socket';
            }
          }
          return null;
        },
        load(id) {
          if (id === '\0stage4f1-main.js') return HARNESS_MAIN_TSX;
          if (id === '\0stage4f1-mock-socket') return MOCK_SOCKET_PROVIDER_JS;
          return null;
        },
        configureServer(srv) {
          srv.middlewares.use((req, res, next) => {
            if (req.url && req.url.startsWith('/__stage4f1_harness.html')) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'text/html');
              srv.transformIndexHtml(req.url, HARNESS_HTML).then((html) => res.end(html)).catch(next);
              return;
            }
            next();
          });
        }
      }
    ]
  });

  await server.listen();
  const addr = server.httpServer?.address();
  const port = typeof addr === 'object' && addr ? addr.port : 5174;
  return { server, url: `http://127.0.0.1:${port}/__stage4f1_harness.html` };
}

async function waitRaf(page: Page, frames = 3) {
  for (let i = 0; i < frames; i++) {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
}

async function attachPageToHarness(
  drawerPage: Page,
  spectatorPage: Page | null,
  url: string,
  roomId: string,
  configOverrides: Record<string, any> = {}
) {
  roomManager.clearDrawHistory(roomId);
  const existingRoom = roomManager.getRoom(roomId);
  if (existingRoom) {
    existingRoom.gameState.drawEpoch = 0;
    existingRoom.gameState.lockedBucketTarget = null;
  }

  let rejectRateLimitOnServer = false;
  const customLimiter = {
    consume: () => !rejectRateLimitOnServer
  } as unknown as DrawRateLimiter;

  const srv = createServerHarness(roomId, { drawRateLimiter: customLimiter });
  srv.room.gameState.drawEpoch = 0;
  srv.room.gameState.lockedBucketTarget = null;
  srv.room.gameState.drawHistory = [];
  srv.room.gameState.timeLeft = 100;

  let delayServerDelivery = false;
  let queuedToServer: { event: string; payloadBytes: number[] | null }[] = [];
  const spectatorReceivedEvents: { event: string; payload: any }[] = [];

  const dispatchServerPacket = (event: string, payloadBytes: number[] | null) => {
    if (event === 'draw_binary' && Array.isArray(payloadBytes)) {
      const prevSockLen = srv.emittedSocket.length;
      const prevRoomLen = srv.emittedRoom.length;
      srv.sendBinary(Buffer.from(payloadBytes));

      const newRoomEvents = srv.emittedRoom.slice(prevRoomLen);
      const newSockEvents = srv.emittedSocket.slice(prevSockLen);

      queueMicrotask(async () => {
        for (const ev of newRoomEvents) {
          if (ev.event === 'bucket_lock_sync') {
            await drawerPage.evaluate(
              (p) => (window as any).__STAGE4F1__?.dispatchSocket('bucket_lock_sync', p),
              ev.payload
            );
            if (spectatorPage) {
              spectatorReceivedEvents.push(ev);
              await spectatorPage.evaluate(
                (p) => (window as any).__STAGE4F1__?.dispatchSocket('bucket_lock_sync', p),
                ev.payload
              );
            }
          } else if (ev.event === 'draw_binary' && Buffer.isBuffer(ev.payload)) {
            const firstByte = ev.payload[0];
            const byteArr = Array.from(ev.payload);
            if (firstByte === 7 || firstByte === 11) {
              await drawerPage.evaluate(
                (arr) => (window as any).__STAGE4F1__?.dispatchSocket('draw_binary', new Uint8Array(arr).buffer),
                byteArr
              );
            }
            // Broadcasts go to spectators
            if (spectatorPage) {
              spectatorReceivedEvents.push({ event: 'draw_binary', payload: byteArr });
              await spectatorPage.evaluate(
                (arr) => (window as any).__STAGE4F1__?.dispatchSocket('draw_binary', new Uint8Array(arr).buffer),
                byteArr
              );
            }
          }
        }
        for (const ev of newSockEvents) {
          if (
            ev.event === 'draw_action_ack' ||
            ev.event === 'draw_action_rejected' ||
            ev.event === 'draw_undo_rejected'
          ) {
            await drawerPage.evaluate(
              ({ eName, p }) => (window as any).__STAGE4F1__?.dispatchSocket(eName, p),
              { eName: ev.event, p: ev.payload }
            );
          }
        }
      });
    } else if (event === 'request_round_sync') {
      const emits = srv.requestSync();
      queueMicrotask(async () => {
        for (const ev of emits) {
          await drawerPage.evaluate(
            ({ eName, p }) => (window as any).__STAGE4F1__?.dispatchSocket(eName, p),
            { eName: ev.event, p: ev.payload }
          );
        }
      });
    }
  };

  const bridgeName = `__bridge_4f1_${Math.random().toString(36).slice(2, 8)}`;
  await drawerPage.exposeFunction(bridgeName, (event: string, payloadBytes: number[] | null) => {
    if (delayServerDelivery) {
      queuedToServer.push({ event, payloadBytes });
      return;
    }
    dispatchServerPacket(event, payloadBytes);
  });

  const cfgParam = encodeURIComponent(JSON.stringify(configOverrides));
  await drawerPage.goto(`${url}?cfg=${cfgParam}`, { waitUntil: 'networkidle' });
  await drawerPage.waitForFunction(() => Boolean((window as any).__STAGE4F1__));
  await drawerPage.evaluate((bName) => {
    (window as any).__STAGE4F1_SERVER_BRIDGE__ = (event: string, bytes: number[] | null) =>
      (window as any)[bName](event, bytes);
  }, bridgeName);

  await drawerPage.waitForFunction(() => {
    const dims = (window as any).__STAGE4F1__?.getCanvasDimensions();
    return dims && dims.width > 0 && dims.height > 0 && dims.rect.width > 0;
  });

  const initPayloads = (isReadOnly: boolean) => ({
    readOnly: isReadOnly,
    syncState: {
      gameState: {
        status: 'DRAWING',
        currentDrawerId: 'player-drawer-1',
        drawEpoch: 0,
        lockedBucketTarget: null
      }
    }
  });

  await drawerPage.evaluate((p) => {
    const h = (window as any).__STAGE4F1__;
    h.dispatchSocket('room_state_update', p.syncState);
    h.dispatchSocket('draw_history_sync', []);
    h.dispatchSocket('draw_redo_sync', []);
    h.dispatchSocket('bucket_lock_sync', { drawEpoch: 0, lockedBucket: null });
  }, initPayloads(false));

  if (spectatorPage) {
    const specCfgParam = encodeURIComponent(JSON.stringify({ ...configOverrides, readOnly: true }));
    await spectatorPage.goto(`${url}?cfg=${specCfgParam}`, { waitUntil: 'networkidle' });
    await spectatorPage.waitForFunction(() => Boolean((window as any).__STAGE4F1__));
    await spectatorPage.waitForFunction(() => {
      const dims = (window as any).__STAGE4F1__?.getCanvasDimensions();
      return dims && dims.width > 0 && dims.height > 0 && dims.rect.width > 0;
    });
    await spectatorPage.evaluate((p) => {
      const h = (window as any).__STAGE4F1__;
      h.dispatchSocket('room_state_update', p.syncState);
      h.dispatchSocket('draw_history_sync', []);
      h.dispatchSocket('draw_redo_sync', []);
      h.dispatchSocket('bucket_lock_sync', { drawEpoch: 0, lockedBucket: null });
    }, initPayloads(true));
    await waitRaf(spectatorPage, 3);
  }

  await waitRaf(drawerPage, 3);

  return {
    srv,
    spectatorReceivedEvents,
    setRateLimitReject: (v: boolean) => {
      rejectRateLimitOnServer = v;
    },
    setDelayServerDelivery: (v: boolean) => {
      delayServerDelivery = v;
    },
    flushDelayedToServer: async () => {
      const items = queuedToServer;
      queuedToServer = [];
      for (const item of items) {
        dispatchServerPacket(item.event, item.payloadBytes);
      }
      await waitRaf(drawerPage, 5);
      if (spectatorPage) await waitRaf(spectatorPage, 5);
    },
    clearQueuedToServer: () => {
      queuedToServer = [];
    }
  };
}

async function clickBucket(page: Page, xNorm: number, yNorm: number, color: string) {
  await page.evaluate((c) => {
    (window as any).__STAGE4F1__.setConfig({ tool: 'bucket', color: c, opacity: 1 });
  }, color);
  await waitRaf(page, 1);
  const rect = await page.evaluate(() => (window as any).__STAGE4F1__.getCanvasDimensions().rect);
  await page.mouse.click(rect.left + xNorm * rect.width, rect.top + yNorm * rect.height);
  await waitRaf(page, 4);
}

async function drawVerticalBox(page: Page, xStartNorm: number, xEndNorm: number, color = '#000000') {
  await page.evaluate((c) => {
    (window as any).__STAGE4F1__.setConfig({ tool: 'strokeRect', color: c, thickness: 6, opacity: 1 });
  }, color);
  await waitRaf(page, 1);

  const rect = await page.evaluate(() => (window as any).__STAGE4F1__.getCanvasDimensions().rect);
  const x0 = rect.left + xStartNorm * rect.width;
  const y0 = rect.top + 0.15 * rect.height;
  const x1 = rect.left + xEndNorm * rect.width;
  const y1 = rect.top + 0.85 * rect.height;

  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 3 });
  await page.mouse.up();
  await waitRaf(page, 4);
}

async function drawHorizontalPencil(page: Page, yNorm: number, color = '#000000') {
  await page.evaluate((c) => {
    (window as any).__STAGE4F1__.setConfig({ tool: 'pencil', color: c, thickness: 8, opacity: 1 });
  }, color);
  await waitRaf(page, 1);

  const rect = await page.evaluate(() => (window as any).__STAGE4F1__.getCanvasDimensions().rect);
  const y = rect.top + yNorm * rect.height;
  await page.mouse.move(rect.left + 0.12 * rect.width, y);
  await page.mouse.down();
  await page.mouse.move(rect.left + 0.35 * rect.width, y, { steps: 3 });
  await page.mouse.up();
  await waitRaf(page, 4);
}

async function runBrowserE2ETests() {
  console.log('--- Running Stage 4F-1 Browser E2E Tests (Tests A - F) ---');
  const { server: viteServer, url } = await startHarnessViteServer();
  const executablePath = findChromiumExecutable();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
    const drawerPage = await context.newPage();
    const spectatorPage = await context.newPage();
    drawerPage.on('pageerror', (err) => console.error('[DRAWER PAGEERROR]', err));
    spectatorPage.on('pageerror', (err) => console.error('[SPECTATOR PAGEERROR]', err));

    // -------------------------------------------------------------------------
    // TEST A: Accept Bucket -> ACK to drawer only, _serverConfirmed=true, spectator parity
    // -------------------------------------------------------------------------
    {
      const sess = await attachPageToHarness(drawerPage, spectatorPage, url, 'General #Test');
      await clickBucket(drawerPage, 0.5, 0.5, '#ef4444');
      await waitRaf(spectatorPage, 4);

      const drawerCmds = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getCompetitiveCommandSnapshot());
      const bucketCmd = drawerCmds.find((c: any) => c.isBucket);
      assert.ok(bucketCmd, 'Test A: Bucket command recorded locally');
      assert.strictEqual(bucketCmd.serverConfirmed, true, 'Test A: Bucket must be marked _serverConfirmed = true after ACK');
      assert.strictEqual(bucketCmd.drawEpoch, 0, 'Test A: _drawEpoch recorded on command');

      assert.strictEqual(
        sess.spectatorReceivedEvents.some((e) => e.event === 'draw_action_ack'),
        false,
        'Test A: Spectator must never receive draw_action_ack'
      );

      const drawerHash = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getCanvasHash());
      const spectatorHash = await spectatorPage.evaluate(() => (window as any).__STAGE4F1__.getCanvasHash());
      assert.strictEqual(drawerHash, spectatorHash, 'Test A: Drawer & spectator pixels must match');
      console.log('✅ Test A (Accept Bucket + ACK + Spectator Parity) PASSED');
    }

    // -------------------------------------------------------------------------
    // TEST B: Reject Bucket (Last Command UndoCache + Newer Stroke Replay)
    // -------------------------------------------------------------------------
    {
      const sess = await attachPageToHarness(drawerPage, spectatorPage, url, 'Experimental Draw');
      await drawVerticalBox(drawerPage, 0.08, 0.35, '#111827'); // prior box
      await clickBucket(drawerPage, 0.20, 0.50, '#3b82f6'); // B1 accepted (blue)
      await waitRaf(spectatorPage, 4);

      const hashBeforeReject = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getCanvasHash());

      // Now rate-limit rejects B2 (fast path: last command)
      sess.setRateLimitReject(true);
      await clickBucket(drawerPage, 0.70, 0.50, '#ef4444'); // B2 rejected!
      await waitRaf(drawerPage, 4);

      const hashAfterReject1 = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getCanvasHash());
      assert.strictEqual(hashAfterReject1, hashBeforeReject, 'Test B (fast-path): Rejected B2 must be completely rolled back from canvas');
      assert.strictEqual(sess.srv.room.gameState.drawHistory?.length, 2, 'Test B: Server history unaffected');
      assert.strictEqual(
        (await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getHistoryState())).canRedo,
        false,
        'Test B: Rejected fresh bucket must not enter redo stack'
      );

      // Now test REJECTION AFTER NEWER STROKE was drawn while B3 was in-flight!
      sess.setDelayServerDelivery(true);
      sess.setRateLimitReject(true);
      await clickBucket(drawerPage, 0.70, 0.50, '#22c55e'); // B3 delayed & will reject
      await drawHorizontalPencil(drawerPage, 0.08, '#eab308'); // S_newer drawn after B3
      await sess.flushDelayedToServer();

      const snapAfterMidReject = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getCompetitiveCommandSnapshot());
      assert.strictEqual(
        snapAfterMidReject.filter((c: any) => c.isBucket).length,
        1,
        'Test B (mid-history): Rejected B3 removed while B1 preserved'
      );
      const isBlankPixel = (px: number[] | null) =>
        Boolean(px && (px[3] === 0 || (px[0] > 230 && px[1] > 230 && px[2] > 230)));

      const pxRightSide = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getPixelRGBA(0.70, 0.50));
      assert.ok(
        isBlankPixel(pxRightSide),
        `Test B (mid-history): Rejected green fill at 0.70 must revert to blank/white, got ${JSON.stringify(pxRightSide)}`
      );
      const pxNewerPencil = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getPixelRGBA(0.22, 0.08));
      assert.ok(
        pxNewerPencil && pxNewerPencil[0] > 200 && pxNewerPencil[1] > 140 && pxNewerPencil[2] < 80,
        `Test B (mid-history): Newer yellow pencil stroke after B3 must be preserved! got ${JSON.stringify(pxNewerPencil)}`
      );
      console.log('✅ Test B (Reject Bucket + Fast Rollback + Preserve Newer Strokes) PASSED');
    }

    // -------------------------------------------------------------------------
    // TEST C: Undo while waiting for ACK (1: late ACK, 2: late REJECT + not_found Undo)
    // -------------------------------------------------------------------------
    {
      const isBlankPixel = (px: number[] | null) =>
        Boolean(px && (px[3] === 0 || (px[0] > 230 && px[1] > 230 && px[2] > 230)));
      const sess = await attachPageToHarness(drawerPage, spectatorPage, url, 'General #10P');

      // C1: Bucket -> Undo before delivery -> server ACCEPTS Bucket then accepts Undo -> Redo stays intact
      sess.setDelayServerDelivery(true);
      sess.setRateLimitReject(false);
      await clickBucket(drawerPage, 0.5, 0.5, '#ef4444');
      await drawerPage.evaluate(() => (window as any).__STAGE4F1__.undo());
      await waitRaf(drawerPage, 2);
      await sess.flushDelayedToServer();

      const c1Hist = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getHistoryState());
      const c1Px = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getPixelRGBA(0.5, 0.5));
      assert.strictEqual(c1Hist.canRedo, true, 'Test C1: Late ACK of already-undone bucket must keep Redo intact');
      assert.strictEqual(sess.srv.room.gameState.drawHistory?.length, 0, 'Test C1: Server processed Bucket then Undo cleanly');
      assert.ok(isBlankPixel(c1Px), `Test C1: Canvas remains blank after late ACK, got ${JSON.stringify(c1Px)}`);

      // C2: Bucket -> Undo before delivery -> server REJECTS Bucket -> then draw_undo gets not_found
      await drawerPage.evaluate(() => (window as any).__STAGE4F1__.clearEmitted());
      sess.setDelayServerDelivery(true);
      sess.setRateLimitReject(true);
      await clickBucket(drawerPage, 0.5, 0.5, '#3b82f6');
      await drawerPage.evaluate(() => (window as any).__STAGE4F1__.undo());
      await waitRaf(drawerPage, 2);
      await sess.flushDelayedToServer();

      const c2Hist = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getHistoryState());
      const c2Px = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getPixelRGBA(0.5, 0.5));
      const c2Emits = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getEmitted());
      assert.strictEqual(c2Hist.canRedo, false, 'Test C2: Rejected undone bucket must be purged from localRedoStackRef');
      assert.ok(isBlankPixel(c2Px), `Test C2: Rejected bucket must NOT return via draw_undo_rejected, got ${JSON.stringify(c2Px)}`);
      assert.strictEqual(
        c2Emits.some((e: any) => e.event === 'request_round_sync'),
        false,
        'Test C2: Must NOT fire spurious request_round_sync on suppressed not_found undo'
      );
      console.log('✅ Test C (Undo While Waiting ACK / REJECT) PASSED');
    }

    // -------------------------------------------------------------------------
    // TEST D: Redo Bucket (1: Accepted Redo, 2: Rejected Redo, 3: Redo invalidated by new draw)
    // -------------------------------------------------------------------------
    {
      const isBlankPixel = (px: number[] | null) =>
        Boolean(px && (px[3] === 0 || (px[0] > 230 && px[1] > 230 && px[2] > 230)));
      const sess = await attachPageToHarness(drawerPage, spectatorPage, url, 'General #Test');
      await clickBucket(drawerPage, 0.5, 0.5, '#ef4444'); // B1
      await drawerPage.evaluate(() => (window as any).__STAGE4F1__.undo());
      await waitRaf(drawerPage, 3);

      // D1: Rejected Redo -> rolls back bucket AND restores Redo availability
      sess.setRateLimitReject(true);
      await drawerPage.evaluate(() => (window as any).__STAGE4F1__.redo());
      await waitRaf(drawerPage, 4);

      const d1Hist = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getHistoryState());
      const d1Px = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getPixelRGBA(0.5, 0.5));
      assert.strictEqual(d1Hist.canRedo, true, 'Test D1: Rejected Redo must restore Redo availability');
      assert.ok(isBlankPixel(d1Px), `Test D1: Rejected Redo pixels reverted, got ${JSON.stringify(d1Px)}`);
      assert.strictEqual(sess.srv.room.gameState.drawHistory?.length, 0, 'Test D1: Server history has no rejected Redo');

      // D2: Retry Redo with Rate Limit OFF -> Accepted & confirmed + spectator parity
      sess.setRateLimitReject(false);
      await drawerPage.evaluate(() => (window as any).__STAGE4F1__.redo());
      await waitRaf(drawerPage, 4);
      await waitRaf(spectatorPage, 4);

      const d2Cmds = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getCompetitiveCommandSnapshot());
      assert.strictEqual(d2Cmds.length, 1);
      assert.strictEqual(d2Cmds[0].serverConfirmed, true, 'Test D2: Accepted Redo Bucket marked _serverConfirmed = true');
      const d2DrawerHash = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getCanvasHash());
      const d2SpecHash = await spectatorPage.evaluate(() => (window as any).__STAGE4F1__.getCanvasHash());
      assert.strictEqual(d2DrawerHash, d2SpecHash, 'Test D2: Drawer & spectator match after Redo ACK');

      // D3: Redo followed by newer draw before delayed rejection -> newer draw invalidates Redo restore
      await drawerPage.evaluate(() => (window as any).__STAGE4F1__.undo());
      await waitRaf(drawerPage, 3);
      sess.setDelayServerDelivery(true);
      sess.setRateLimitReject(true);
      await drawerPage.evaluate(() => (window as any).__STAGE4F1__.redo()); // Delayed Redo B1' (rejected later)
      await drawHorizontalPencil(drawerPage, 0.25, '#111827'); // Newer pencil stroke invalidates redo
      await sess.flushDelayedToServer();

      const d3Hist = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getHistoryState());
      assert.strictEqual(d3Hist.canRedo, false, 'Test D3: Newer drawing after Redo must keep Redo invalidated even if Redo rejected');
      const d3Cmds = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getCompetitiveCommandSnapshot());
      assert.strictEqual(d3Cmds.filter((c: any) => c.isBucket).length, 0, 'Test D3: Rejected Redo removed');
      assert.strictEqual(d3Cmds.length, 1, 'Test D3: Newer pencil stroke preserved');
      console.log('✅ Test D (Redo Bucket Accept + Reject + New Draw Invalidation) PASSED');
    }

    // -------------------------------------------------------------------------
    // TEST E: Epoch & Clear -> Stale ACK/REJECT ignored after Clear
    // -------------------------------------------------------------------------
    {
      const sess = await attachPageToHarness(drawerPage, spectatorPage, url, 'General #Test');
      await clickBucket(drawerPage, 0.5, 0.5, '#ef4444'); // Epoch 0 Bucket
      const cmdsBeforeClear = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getCompetitiveCommandSnapshot());
      const epoch0StrokeId = cmdsBeforeClear[0].strokeId;
      const epoch0InstId = cmdsBeforeClear[0].instId;

      await drawerPage.evaluate(() => (window as any).__STAGE4F1__.clear());
      await waitRaf(drawerPage, 4);
      assert.strictEqual(sess.srv.room.gameState.drawEpoch, 1);

      // New Epoch 1 Bucket
      await clickBucket(drawerPage, 0.5, 0.5, '#3b82f6');
      await waitRaf(drawerPage, 4);

      // Inject stale draw_action_rejected and stale draw_action_ack for Epoch 0 using same instId
      await drawerPage.evaluate(
        ({ instId, strokeId }) => {
          const h = (window as any).__STAGE4F1__;
          h.dispatchSocket('draw_action_rejected', {
            drawEpoch: 0,
            instId,
            strokeId,
            reason: 'rate_limit'
          });
          h.dispatchSocket('draw_action_ack', {
            drawEpoch: 0,
            instId,
            strokeId
          });
        },
        { instId: epoch0InstId, strokeId: epoch0StrokeId }
      );
      await waitRaf(drawerPage, 3);

      const pxEpoch1 = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getPixelRGBA(0.5, 0.5));
      const cmdsEpoch1 = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getCompetitiveCommandSnapshot());
      assert.ok(pxEpoch1 && pxEpoch1[2] > 200, 'Test E: Stale Epoch 0 rejection must not disturb Epoch 1 blue canvas');
      assert.strictEqual(
        cmdsEpoch1.filter((c: any) => c.isBucket && c.serverConfirmed === true).length,
        1,
        'Test E: Epoch 1 confirmed bucket remains intact'
      );
      console.log('✅ Test E (Epoch & Clear Stale ACK/REJECT Isolation) PASSED');
    }

    // -------------------------------------------------------------------------
    // TEST F: Mode Isolation (Free Draw & Normal Room unaffected)
    // -------------------------------------------------------------------------
    {
      // F1: Free Draw
      const fdSess = await attachPageToHarness(drawerPage, null, url, 'Free Draw', {
        isFreeDraw: true,
        isExperimental: false
      });
      await clickBucket(drawerPage, 0.5, 0.5, '#ef4444');
      assert.strictEqual(
        fdSess.srv.emittedSocket.filter((e) => e.event === 'draw_action_ack' || e.event === 'draw_action_rejected').length,
        0,
        'Test F1: Free Draw must not emit Competitive ACK/REJECT'
      );
      // Even if a spurious draw_action_rejected arrives in Free Draw, must be ignored
      await drawerPage.evaluate(() => {
        (window as any).__STAGE4F1__.dispatchSocket('draw_action_rejected', {
          drawEpoch: 0,
          instId: 'any',
          strokeId: 1,
          reason: 'rate_limit'
        });
      });
      const fdPx = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getPixelRGBA(0.5, 0.5));
      assert.ok(fdPx && fdPx[0] > 200, 'Test F1: Free Draw canvas stays red');

      // F2: Normal room (non-experimental)
      await drawerPage.goto(
        `${url}?cfg=${encodeURIComponent(JSON.stringify({ isFreeDraw: false, isExperimental: false }))}`,
        { waitUntil: 'networkidle' }
      );
      await drawerPage.waitForFunction(() => Boolean((window as any).__STAGE4F1__));
      await drawerPage.evaluate(() => {
        const h = (window as any).__STAGE4F1__;
        h.dispatchSocket('room_state_update', {
          gameState: { status: 'DRAWING', currentDrawerId: 'player-drawer-1', drawEpoch: 0, lockedBucketTarget: null }
        });
        h.dispatchSocket('draw_history_sync', []);
      });
      await waitRaf(drawerPage, 3);
      await clickBucket(drawerPage, 0.5, 0.5, '#22c55e');
      await drawerPage.evaluate(() => {
        (window as any).__STAGE4F1__.dispatchSocket('draw_action_rejected', {
          drawEpoch: 0,
          instId: 'any',
          strokeId: 1,
          reason: 'rate_limit'
        });
      });
      const normPx = await drawerPage.evaluate(() => (window as any).__STAGE4F1__.getPixelRGBA(0.5, 0.5));
      assert.ok(normPx && normPx[1] > 150, 'Test F2: Normal room unaffected by Competitive ACK/REJECT events');

      console.log('✅ Test F (Free Draw & Normal Room Mode Isolation) PASSED');
    }
  } finally {
    await browser.close();
    await viteServer.close();
  }
}

async function main() {
  await runServerUnitTests();
  await runBrowserE2ETests();
  console.log('\n✅ ALL STAGE 4F-1 TESTS (SERVER + BROWSER A-F) PASSED!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ STAGE 4F-1 TEST FAILED:', err);
  process.exit(1);
});

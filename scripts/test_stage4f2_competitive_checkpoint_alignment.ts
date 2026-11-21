import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, Page } from 'playwright';
import { createServer as createViteServer, ViteDevServer } from 'vite';
import { roomManager } from '../server/rooms.js';
import { handleDrawBinary } from '../server/registerDrawBinaryHandler.js';
import { handleJoinRoom } from '../server/registerJoinRoomHandler.js';
import { handleRequestRoundSync } from '../server/registerRequestRoundSyncHandler.js';
import { handleDrawRepairReq } from '../server/controlInputValidation.js';
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

function createServerHarness(roomId: string, withSpectatorSocket = false) {
  const emittedSocket: { event: string; payload: any }[] = [];
  const emittedSpecSocket: { event: string; payload: any }[] = [];
  const emittedRoom: { event: string; payload: any }[] = [];
  const roundSyncLimits = new Map<string, number[]>();
  const drawRepairLimits = new Map<string, number[]>();
  const controlLimiter = new ControlRateLimiter();
  const drawLimiter = new DrawRateLimiter();

  // Disable burst limits for deterministic 20+ sequential bucket test while still testing custom rejections
  const unlimitedDrawLimiter = {
    consume: () => true
  } as unknown as DrawRateLimiter;

  const adapterRooms = new Map<string, Set<string>>();
  const joinRoomSet = (rid: string, sid: string) => {
    let set = adapterRooms.get(rid);
    if (!set) {
      set = new Set<string>();
      adapterRooms.set(rid, set);
    }
    set.add(sid);
  };

  const mockIo: any = {
    to: (_targetRoomOrSocket: string) => ({
      emit: (event: string, payload: any) => {
        emittedRoom.push({ event, payload });
      }
    }),
    sockets: {
      sockets: new Map(),
      adapter: { rooms: adapterRooms }
    }
  };
  roomManager.setIo(mockIo);

  const mockSocket: any = {
    id: `sock-${roomId}-${Math.random().toString(36).slice(2, 7)}`,
    connected: true,
    join: (rid: string) => joinRoomSet(rid, mockSocket.id),
    emit: (event: string, payload: any) => {
      emittedSocket.push({ event, payload });
    },
    broadcast: {
      to: (_rid: string) => ({
        emit: (event: string, payload: any) => {
          emittedRoom.push({ event, payload });
        },
        volatile: {
          emit: (event: string, payload: any) => {
            emittedRoom.push({ event, payload });
          }
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

  let specSocket: any = null;
  if (withSpectatorSocket) {
    specSocket = {
      id: `sock-spec-${roomId}-${Math.random().toString(36).slice(2, 7)}`,
      connected: true,
      join: (rid: string) => joinRoomSet(rid, specSocket.id),
      emit: (event: string, payload: any) => {
        emittedSpecSocket.push({ event, payload });
      },
      volatile: {
        emit: (event: string, payload: any) => {
          emittedSpecSocket.push({ event, payload });
        }
      },
      broadcast: { to: () => ({ emit: () => {} }) }
    };
    mockIo.sockets.sockets.set(specSocket.id, specSocket);
    let specJoinRes: any = null;
    handleJoinRoom(
      specSocket,
      {
        roomId,
        nickname: `Spec_${Math.random().toString(36).slice(2, 6)}`,
        playerId: `pid-spec-${roomId}-${Math.random().toString(36).slice(2, 6)}`,
        reconnectSecret: `secret_spec_${roomId}_0123456789`
      },
      (res) => {
        specJoinRes = res;
      },
      {
        io: mockIo,
        roomManager,
        getJsonSafeHistory,
        controlRateLimiter: controlLimiter
      }
    );
    assert.strictEqual(specJoinRes?.success, true, `Failed to join spec to ${roomId}: ${JSON.stringify(specJoinRes)}`);
  }

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
    specSocket,
    drawLimiter,
    emittedSocket,
    emittedSpecSocket,
    emittedRoom,
    sendBinary: (buf: Buffer, rejectRateLimit = false) =>
      handleDrawBinary(mockSocket, buf, {
        io: mockIo,
        roomManager,
        drawRateLimiter: rejectRateLimit
          ? ({ consume: () => false } as unknown as DrawRateLimiter)
          : unlimitedDrawLimiter
      }),
    requestRepairForSpec: (payload: any) => {
      if (!specSocket) return [];
      const prevLen = emittedSpecSocket.length;
      handleDrawRepairReq(specSocket, payload, {
        roomManager,
        drawRepairLimits
      });
      return emittedSpecSocket.slice(prevLen);
    },
    requestSync: () => {
      const prevLen = emittedSocket.length;
      handleRequestRoundSync(mockSocket, () => {}, {
        roomManager,
        roundSyncLimits,
        checkRateLimit: () => true,
        getJsonSafeHistory
      });
      return emittedSocket.slice(prevLen);
    },
    simulateLateJoin: () => {
      const joinSocketId = `sock-join-${Math.random().toString(36).slice(2, 7)}`;
      const joinEmits: { event: string; payload: any }[] = [];
      const joinSock: any = {
        id: joinSocketId,
        connected: true,
        join: () => {},
        emit: (event: string, payload: any) => {
          joinEmits.push({ event, payload });
        },
        broadcast: { to: () => ({ emit: () => {} }) }
      };
      mockIo.sockets.sockets.set(joinSocketId, joinSock);
      const specPid = `pid-spec-${Math.random().toString(36).slice(2, 6)}`;
      let ackRes: any = null;
      handleJoinRoom(
        joinSock,
        {
          roomId,
          nickname: `Spec_${Math.random().toString(36).slice(2, 6)}`,
          playerId: specPid,
          reconnectSecret: `secret_spec_${Math.random().toString(36).slice(2, 10)}`
        },
        (res) => {
          ackRes = res;
        },
        {
          io: mockIo,
          roomManager,
          getJsonSafeHistory,
          controlRateLimiter: controlLimiter
        }
      );
      assert.strictEqual(ackRes?.success, true, `Late join failed: ${JSON.stringify(ackRes)}`);
      return { joinEmits, specPid };
    },
    simulateReconnectDrawer: () => {
      const prevLen = emittedSocket.length;
      let ackRes: any = null;
      handleJoinRoom(
        mockSocket,
        {
          roomId,
          nickname,
          playerId,
          reconnectSecret: secret
        },
        (res) => {
          ackRes = res;
        },
        {
          io: mockIo,
          roomManager,
          getJsonSafeHistory,
          controlRateLimiter: controlLimiter
        }
      );
      assert.strictEqual(ackRes?.success, true, `Reconnect failed: ${JSON.stringify(ackRes)}`);
      return emittedSocket.slice(prevLen);
    }
  };
}

const HARNESS_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Stage 4F-2 Competitive Checkpoint Alignment Harness</title>
    <script>
      (function () {
        var params = new URLSearchParams(window.location.search);
        var isOpt = params.get('opt') !== '0';
        localStorage.setItem('freedraw_bucket_undo_diag', '1');
        localStorage.setItem('freedraw_bucket_checkpoint_exp', '1');
        localStorage.setItem('freedraw_bucket_batch_replay_exp', '1');
        localStorage.setItem('competitive_replay_perf_stage4c', isOpt ? '1' : '0');
      })();
    </script>
    <style>
      html, body { margin: 0; padding: 0; background: #111; }
      #harness-root {
        position: relative;
        width: 740px;
        height: 430px;
        background: #ffffff;
        overflow: hidden;
      }
    </style>
  </head>
  <body>
    <div id="harness-root"></div>
    <script type="module" src="/__stage4f2_harness.js"></script>
  </body>
</html>
`;

const HARNESS_JS = `
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DrawingCanvasCore from '/src/components/game/DrawingCanvasCore.tsx';
import { SocketProvider } from '/src/components/SocketProvider.tsx';

const __urlParams = new URLSearchParams(window.location.search);
let __initialCfgOverrides = {};
try {
  const rawCfg = __urlParams.get('cfg');
  if (rawCfg) __initialCfgOverrides = JSON.parse(rawCfg);
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

function getFullRgbaBase64() {
  const c = document.getElementById('drawing-board-layer-primary');
  if (!c) return null;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  return { width: c.width, height: c.height, sum: data.reduce((a, b, idx) => (idx % 97 === 0 ? a + b : a), 0), arr: Array.from(data) };
}

function TestStage4F2App() {
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
    window.__STAGE4F2__ = {
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
      getCompetitiveCheckpointSnapshot: (sx, sy) => canvasRef.current?.getCompetitiveCheckpointSnapshot?.(sx, sy) || null,
      getCanvasDimensions: () => {
        const c = document.getElementById('drawing-board-layer-primary');
        return c ? { width: c.width, height: c.height, rect: c.getBoundingClientRect().toJSON() } : null;
      },
      getDomCanvasCount: () => document.querySelectorAll('canvas').length,
      getPixelRGBA,
      getCanvasHash,
      getFullRgba: () => {
        const c = document.getElementById('drawing-board-layer-primary');
        if (!c) return null;
        const ctx = c.getContext('2d');
        return ctx ? Array.from(ctx.getImageData(0, 0, c.width, c.height).data) : null;
      },
      getEmitted: () => window.__STAGE4F2_EMITS__ || [],
      clearEmitted: () => { window.__STAGE4F2_EMITS__ = []; },
      dispatchSocket: (event, payload) => window.__STAGE4F2_DISPATCH__?.(event, payload)
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
  React.createElement(SocketProvider, null, React.createElement(TestStage4F2App))
);
`;

const MOCK_SOCKET_PROVIDER_JS = `
import React, { createContext, useContext } from 'react';

const listeners = {};
window.__STAGE4F2_EMITS__ = [];

const mockSocket = {
  id: 'stage4f2_test_socket',
  connected: true,
  emit: (event, payload, ack) => {
    const entry = {
      event,
      payloadBytes: payload && payload.byteLength ? Array.from(new Uint8Array(payload)) : null,
      payloadJson: !(payload && payload.byteLength) ? payload : null
    };
    window.__STAGE4F2_EMITS__.push(entry);
    if (typeof window.__STAGE4F2_SERVER_BRIDGE__ === 'function') {
      window.__STAGE4F2_SERVER_BRIDGE__(event, entry.payloadBytes ?? entry.payloadJson);
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
      if (typeof window.__STAGE4F2_SERVER_BRIDGE__ === 'function') {
        window.__STAGE4F2_SERVER_BRIDGE__(event, bytes);
      }
    }
  }
};

window.__STAGE4F2_DISPATCH__ = (event, payload) => {
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
        name: 'stage4f2-test-harness',
        enforce: 'pre',
        resolveId(id, importer) {
          if (id === '/__stage4f2_harness.js') return '\0stage4f2-harness.js';
          if (id.endsWith('SocketProvider') || id.endsWith('SocketProvider.tsx')) {
            const resolved = importer
              ? path.resolve(path.dirname(importer), id).replace(/\\/g, '/')
              : id;
            if (resolved === socketProviderPath || resolved + '.tsx' === socketProviderPath) {
              return '\0stage4f2-mock-socket';
            }
          }
          return null;
        },
        load(id) {
          if (id === '\0stage4f2-harness.js') return HARNESS_JS;
          if (id === '\0stage4f2-mock-socket') return MOCK_SOCKET_PROVIDER_JS;
          return null;
        },
        configureServer(srv) {
          srv.middlewares.use((req, res, next) => {
            if (req.url && req.url.startsWith('/__stage4f2_harness.html')) {
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
  const port = typeof addr === 'object' && addr ? addr.port : 5173;
  return { server, url: `http://127.0.0.1:${port}/__stage4f2_harness.html` };
}

async function waitRaf(page: Page, frames = 3) {
  for (let i = 0; i < frames; i++) {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
}

interface DiagFrame {
  type: 'local_undo' | 'remote_undo' | string;
  fastPath: string;
  baseIndexBefore: number;
  tailIndexBefore: number;
  baseValidBefore: boolean;
  tailValidBefore: boolean;
  baseIndexAfter: number;
  tailIndexAfter: number;
  baseValidAfter: boolean;
  tailValidAfter: boolean;
  replayStartIndex: number;
  commandsReplayed: number;
  floodFillExecutions: number;
  replayDurationMs: number;
  totalUndoDurationMs: number;
  checkpointFacts?: {
    retainedCanvases?: number;
    checkpointCount?: number;
    bestCheckpointSlot?: string;
    bestCheckpointIndex?: number;
  };
}

function attachDiagListener(page: Page, queue: DiagFrame[]) {
  page.removeAllListeners('console');
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[FREE_DRAW_UNDO_DIAG]')) {
      const idx = text.indexOf('{');
      if (idx !== -1) {
        try {
          queue.push(JSON.parse(text.slice(idx)));
        } catch {}
      }
    }
  });
}

async function setupRoomPages(
  drawerPage: Page,
  spectatorPage: Page | null,
  url: string,
  roomId: string,
  options: { opt?: boolean; configOverrides?: Record<string, any>; roomOverrides?: { isExperimental?: boolean; isFreeDraw?: boolean } } = {}
) {
  const opt = options.opt !== false;
  const configOverrides = options.configOverrides || {};

  roomManager.clearDrawHistory(roomId);
  const existingRoom = roomManager.getRoom(roomId);
  if (existingRoom) {
    existingRoom.gameState.drawEpoch = 0;
    existingRoom.gameState.lockedBucketTarget = null;
  }

  const srv = createServerHarness(roomId, Boolean(spectatorPage));
  if (options.roomOverrides) {
    if (options.roomOverrides.isExperimental !== undefined) srv.room.isExperimental = options.roomOverrides.isExperimental;
    if (options.roomOverrides.isFreeDraw !== undefined) srv.room.isFreeDraw = options.roomOverrides.isFreeDraw;
  }
  srv.room.gameState.drawEpoch = 0;
  srv.room.gameState.lockedBucketTarget = null;
  srv.room.gameState.drawHistory = [];
  srv.room.gameState.timeLeft = 100;

  let rejectRateLimitOnServer = false;
  let holdDrawerResponses = false;
  let reorderLockBeforeAck = false;
  const heldResponses: (() => Promise<void>)[] = [];
  let deliveryQueue: Promise<void> = Promise.resolve();
  let activeSpectatorPage: Page | null = spectatorPage;

  const deliverPacket = (event: string, payloadBytes: any) => {
    if (event === 'draw_binary' && Array.isArray(payloadBytes)) {
      const prevSockLen = srv.emittedSocket.length;
      const prevSpecSockLen = srv.emittedSpecSocket.length;
      const prevRoomLen = srv.emittedRoom.length;
      srv.sendBinary(Buffer.from(payloadBytes), rejectRateLimitOnServer);

      const newRoomEvents = srv.emittedRoom.slice(prevRoomLen);
      const newSockEvents = srv.emittedSocket.slice(prevSockLen);
      const newSpecSockEvents = srv.emittedSpecSocket.slice(prevSpecSockLen);

      const deliverDrawer = async () => {
        const deliverLocks = async () => {
          for (const ev of newRoomEvents) {
            if (ev.event === 'bucket_lock_sync') {
              await drawerPage.evaluate(
                (p) => (window as any).__STAGE4F2__?.dispatchSocket('bucket_lock_sync', p),
                ev.payload
              );
            }
          }
        };
        const deliverAcksAndBroadcasts = async () => {
          for (const ev of newRoomEvents) {
            if (ev.event === 'draw_binary' && Buffer.isBuffer(ev.payload)) {
              const firstByte = ev.payload[0];
              if (firstByte === 7 || firstByte === 11) {
                await drawerPage.evaluate(
                  (arr) => (window as any).__STAGE4F2__?.dispatchSocket('draw_binary', new Uint8Array(arr).buffer),
                  Array.from(ev.payload)
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
                ({ eName, p }) => (window as any).__STAGE4F2__?.dispatchSocket(eName, p),
                { eName: ev.event, p: ev.payload }
              );
            }
          }
        };

        if (reorderLockBeforeAck) {
          await deliverLocks();
          await deliverAcksAndBroadcasts();
        } else {
          await deliverAcksAndBroadcasts();
          await deliverLocks();
        }
      };

      const deliverSpectator = async () => {
        if (!activeSpectatorPage) return;
        for (const ev of newSpecSockEvents) {
          if (ev.event === 'draw_binary' && Buffer.isBuffer(ev.payload)) {
            await activeSpectatorPage.evaluate(
              (arr) => (window as any).__STAGE4F2__?.dispatchSocket('draw_binary', new Uint8Array(arr).buffer),
              Array.from(ev.payload)
            );
          }
        }
        for (const ev of newRoomEvents) {
          if (ev.event === 'bucket_lock_sync') {
            await activeSpectatorPage.evaluate(
              (p) => (window as any).__STAGE4F2__?.dispatchSocket('bucket_lock_sync', p),
              ev.payload
            );
          } else if (ev.event === 'draw_binary' && Buffer.isBuffer(ev.payload)) {
            await activeSpectatorPage.evaluate(
              (arr) => (window as any).__STAGE4F2__?.dispatchSocket('draw_binary', new Uint8Array(arr).buffer),
              Array.from(ev.payload)
            );
          }
        }
      };

      deliveryQueue = deliveryQueue.then(async () => {
        if (holdDrawerResponses) {
          heldResponses.push(deliverDrawer);
        } else {
          await deliverDrawer();
        }
        await deliverSpectator();
      });
    } else if (event === 'request_round_sync') {
      const emits = srv.requestSync();
      deliveryQueue = deliveryQueue.then(async () => {
        for (const ev of emits) {
          await drawerPage.evaluate(
            ({ eName, p }) => (window as any).__STAGE4F2__?.dispatchSocket(eName, p),
            { eName: ev.event, p: ev.payload }
          );
        }
      });
    } else if (event === 'spec_draw_repair_req' && spectatorPage) {
      const emits = srv.requestRepairForSpec(payloadBytes);
      deliveryQueue = deliveryQueue.then(async () => {
        for (const ev of emits) {
          if (ev.event === 'draw_binary' && Buffer.isBuffer(ev.payload)) {
            await spectatorPage.evaluate(
              (arr) => (window as any).__STAGE4F2__?.dispatchSocket('draw_binary', new Uint8Array(arr).buffer),
              Array.from(ev.payload)
            );
          }
        }
      });
    }
  };

  const bridgeName = `__bridge_4f2_${Math.random().toString(36).slice(2, 8)}`;
  await drawerPage.exposeFunction(bridgeName, (event: string, payloadBytes: any) => {
    deliverPacket(event, payloadBytes);
  });

  const cfgParam = encodeURIComponent(JSON.stringify(configOverrides));
  await drawerPage.goto(`${url}?opt=${opt ? '1' : '0'}&cfg=${cfgParam}`, { waitUntil: 'networkidle' });
  await drawerPage.waitForFunction(() => Boolean((window as any).__STAGE4F2__));
  await drawerPage.evaluate((bName) => {
    (window as any).__STAGE4F2_SERVER_BRIDGE__ = (event: string, bytes: any) =>
      (window as any)[bName](event, bytes);
  }, bridgeName);
  await drawerPage.waitForFunction(() => {
    const dims = (window as any).__STAGE4F2__?.getCanvasDimensions();
    return dims && dims.width > 0 && dims.height > 0 && dims.rect.width > 0;
  });

  const initPayload = {
    gameState: {
      status: 'DRAWING',
      currentDrawerId: 'player-drawer-1',
      drawEpoch: 0,
      lockedBucketTarget: null
    }
  };

  await drawerPage.evaluate((syncState) => {
    const h = (window as any).__STAGE4F2__;
    h.dispatchSocket('room_state_update', syncState);
    h.dispatchSocket('draw_history_sync', []);
    h.dispatchSocket('draw_redo_sync', []);
    h.dispatchSocket('bucket_lock_sync', { drawEpoch: 0, lockedBucket: null });
  }, initPayload);
  await waitRaf(drawerPage, 3);

  if (spectatorPage) {
    const specBridgeName = `__bridge_4f2_spec_${Math.random().toString(36).slice(2, 8)}`;
    await spectatorPage.exposeFunction(specBridgeName, (event: string, payload: any) => {
      if (event === 'draw_repair_req') {
        deliverPacket('spec_draw_repair_req', payload);
      }
    });
    const specCfgParam = encodeURIComponent(JSON.stringify({ ...configOverrides, readOnly: true }));
    await spectatorPage.goto(`${url}?opt=${opt ? '1' : '0'}&cfg=${specCfgParam}`, { waitUntil: 'networkidle' });
    await spectatorPage.waitForFunction(() => Boolean((window as any).__STAGE4F2__));
    await spectatorPage.evaluate((sbName) => {
      (window as any).__STAGE4F2_SERVER_BRIDGE__ = (event: string, payload: any) =>
        (window as any)[sbName](event, payload);
    }, specBridgeName);
    await spectatorPage.waitForFunction(() => {
      const dims = (window as any).__STAGE4F2__?.getCanvasDimensions();
      return dims && dims.width > 0 && dims.height > 0 && dims.rect.width > 0;
    });
    await spectatorPage.evaluate((syncState) => {
      const h = (window as any).__STAGE4F2__;
      h.dispatchSocket('room_state_update', syncState);
      h.dispatchSocket('draw_history_sync', []);
      h.dispatchSocket('draw_redo_sync', []);
      h.dispatchSocket('bucket_lock_sync', { drawEpoch: 0, lockedBucket: null });
    }, initPayload);
    await waitRaf(spectatorPage, 3);
  }

  return {
    srv,
    setRejectRateLimit: (v: boolean) => {
      rejectRateLimitOnServer = v;
    },
    setHoldDrawerResponses: (v: boolean) => {
      holdDrawerResponses = v;
    },
    setReorderLockBeforeAck: (v: boolean) => {
      reorderLockBeforeAck = v;
    },
    attachSpectatorPage: (p: Page | null) => {
      activeSpectatorPage = p;
    },
    flushDelivery: () => deliveryQueue,
    flushHeldDrawerResponses: async () => {
      await deliveryQueue;
      const fns = heldResponses.splice(0, heldResponses.length);
      for (const fn of fns) {
        await fn();
      }
      await waitRaf(drawerPage, 4);
    }
  };
}

async function clickBucket(page: Page, xNorm: number, yNorm: number, color: string) {
  await page.evaluate((c) => {
    (window as any).__STAGE4F2__.setConfig({ tool: 'bucket', color: c, opacity: 1 });
  }, color);
  await waitRaf(page, 1);
  const rect = await page.evaluate(() => (window as any).__STAGE4F2__.getCanvasDimensions().rect);
  await page.mouse.click(rect.left + xNorm * rect.width, rect.top + yNorm * rect.height);
  await waitRaf(page, 4);
}

async function drawStrokeLine(
  page: Page,
  tool: 'pencil' | 'eraser' | 'strokeRect',
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  color = '#111827',
  thickness = 8
) {
  await page.evaluate(
    ({ tool, color, thickness }) => {
      (window as any).__STAGE4F2__.setConfig({ tool, color, thickness, opacity: 1 });
    },
    { tool, color, thickness }
  );
  await waitRaf(page, 1);
  const rect = await page.evaluate(() => (window as any).__STAGE4F2__.getCanvasDimensions().rect);
  await page.mouse.move(rect.left + p0.x * rect.width, rect.top + p0.y * rect.height);
  await page.mouse.down();
  await page.mouse.move(rect.left + p1.x * rect.width, rect.top + p1.y * rect.height, { steps: 4 });
  await page.mouse.up();
  await waitRaf(page, 4);
}

const BUCKET_COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6',
  '#6366f1', '#eab308', '#dc2626', '#2563eb', '#059669',
  '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d',
  '#ea580c', '#0d9488'
];

async function runUndoWithDiag(page: Page, diagQueue: DiagFrame[]): Promise<DiagFrame | null> {
  diagQueue.length = 0;
  await waitRaf(page, 2); // Ensure single-flight rAF lock clears
  await page.evaluate(() => (window as any).__STAGE4F2__.undo());
  await waitRaf(page, 4);
  return diagQueue.length > 0 ? diagQueue[diagQueue.length - 1] : null;
}

async function runTests() {
  console.log('==================================================================');
  console.log('STAGE 4F-2 — SERVER-CONFIRMED COMPETITIVE CHECKPOINT ALIGNMENT');
  console.log('==================================================================');

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
    const baselinePage = await context.newPage();

    drawerPage.on('pageerror', (err) => console.error('[DRAWER PAGEERROR]', err));
    spectatorPage.on('pageerror', (err) => console.error('[SPECTATOR PAGEERROR]', err));
    baselinePage.on('pageerror', (err) => console.error('[BASELINE PAGEERROR]', err));

    const drawerDiag: DiagFrame[] = [];
    const specDiag: DiagFrame[] = [];
    const baseDiag: DiagFrame[] = [];
    attachDiagListener(drawerPage, drawerDiag);
    attachDiagListener(spectatorPage, specDiag);
    attachDiagListener(baselinePage, baseDiag);

    // =========================================================================
    // TEST 1: 20 Consecutive Buckets (B1..B20) -> Undo 1, 2, 3 (Drawer + Spectator + Baseline Parity)
    // =========================================================================
    {
      // 1A: Baseline (Stage 4F-2 / Stage 4C Opt OFF) for pixel & Flood Fill comparison
      const baseSess = await setupRoomPages(baselinePage, null, url, 'General #Test', {
        opt: false,
        roomOverrides: { isExperimental: true, isFreeDraw: false }
      });
      await drawStrokeLine(baselinePage, 'pencil', { x: 0.1, y: 0.05 }, { x: 0.1, y: 0.95 }, '#000000', 8);
      for (let i = 0; i < 20; i++) {
        await clickBucket(baselinePage, 0.5, 0.5, BUCKET_COLORS[i]);
      }
      await baseSess.flushDelivery();
      await waitRaf(baselinePage, 4);
      const baseHash20 = await baselinePage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash());
      const baseUndo1 = await runUndoWithDiag(baselinePage, baseDiag);
      await baseSess.flushDelivery();
      const baseHash19 = await baselinePage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash());
      const baseUndo2 = await runUndoWithDiag(baselinePage, baseDiag);
      await baseSess.flushDelivery();
      const baseHash18 = await baselinePage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash());
      const baseUndo3 = await runUndoWithDiag(baselinePage, baseDiag);
      await baseSess.flushDelivery();
      const baseHash17 = await baselinePage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash());

      // 1B: Optimized Stage 4F-2 (Drawer + Spectator)
      const sess = await setupRoomPages(drawerPage, spectatorPage, url, 'General #Test', { opt: true });
      await drawStrokeLine(drawerPage, 'pencil', { x: 0.1, y: 0.05 }, { x: 0.1, y: 0.95 }, '#000000', 8);
      for (let i = 0; i < 20; i++) {
        await clickBucket(drawerPage, 0.5, 0.5, BUCKET_COLORS[i]);
      }
      await sess.flushDelivery();
      await waitRaf(drawerPage, 4);
      await waitRaf(spectatorPage, 5);

      const drawerCp20 = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
      const specCp20 = await spectatorPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
      assert.strictEqual(drawerCp20.baseIndex, 18, `Drawer Base at Divider+B20 must be 18, got ${drawerCp20.baseIndex}`);
      assert.strictEqual(drawerCp20.tailIndex, 21, `Drawer Tail at Divider+B20 must be 21, got ${drawerCp20.tailIndex}`);
      assert.strictEqual(drawerCp20.baseValid, true);
      assert.strictEqual(drawerCp20.tailValid, true);
      assert.strictEqual(drawerCp20.historyCheckpointCount, 0, 'Competitive mode must never allocate 10-checkpoint pool');

      assert.strictEqual(specCp20.baseIndex, 18, `Spectator Base at Divider+B20 must be 18, got ${specCp20.baseIndex}`);
      assert.strictEqual(specCp20.tailIndex, 21, `Spectator Tail at Divider+B20 must be 21, got ${specCp20.tailIndex}`);
      assert.strictEqual(specCp20.baseValid, true);
      assert.strictEqual(specCp20.tailValid, true);
      assert.strictEqual(specCp20.historyCheckpointCount, 0);

      assert.strictEqual(await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getDomCanvasCount()), 2, 'Zero extra DOM canvases');
      assert.strictEqual(await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash()), baseHash20, 'B20 pixel parity vs baseline');
      assert.strictEqual(await spectatorPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash()), baseHash20, 'Spectator B20 pixel parity');

      // Undo 1 (B20)
      specDiag.length = 0;
      const drUndo1 = await runUndoWithDiag(drawerPage, drawerDiag);
      await sess.flushDelivery();
      await waitRaf(spectatorPage, 5);
      const spUndo1 = specDiag[specDiag.length - 1] || null;
      assert.ok(drUndo1 && spUndo1, 'Both drawer and spectator must emit undo diags on Undo 1');
      assert.strictEqual(drUndo1.floodFillExecutions, 0, `Drawer Undo 1 must execute 0 Flood Fills, got ${drUndo1.floodFillExecutions}`);
      assert.ok(spUndo1.floodFillExecutions <= 2, `Spectator Undo 1 must execute <= 2 Flood Fills, got ${spUndo1.floodFillExecutions}`);
      assert.strictEqual(await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash()), baseHash19, 'Undo 1 pixel parity');
      assert.strictEqual(await spectatorPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash()), baseHash19, 'Spectator Undo 1 parity');

      // Undo 2 (B19)
      specDiag.length = 0;
      const drUndo2 = await runUndoWithDiag(drawerPage, drawerDiag);
      await sess.flushDelivery();
      await waitRaf(spectatorPage, 5);
      const spUndo2 = specDiag[specDiag.length - 1] || null;
      assert.ok(drUndo2 && spUndo2);
      assert.strictEqual(drUndo2.floodFillExecutions, 1, `Drawer Undo 2 must execute 1 Flood Fill, got ${drUndo2.floodFillExecutions}`);
      assert.strictEqual(spUndo2.floodFillExecutions, 0, `Spectator Undo 2 must execute 0 Flood Fills, got ${spUndo2.floodFillExecutions}`);
      assert.ok(
        baseUndo2 && drUndo2.floodFillExecutions < baseUndo2.floodFillExecutions,
        `Stage 4F-2 Undo 2 fills (${drUndo2.floodFillExecutions}) must be < baseline opt=0 (${baseUndo2?.floodFillExecutions})`
      );
      assert.strictEqual(await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash()), baseHash18, 'Undo 2 pixel parity');
      assert.strictEqual(await spectatorPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash()), baseHash18, 'Spectator Undo 2 parity');

      // Undo 3 (B18)
      specDiag.length = 0;
      const drUndo3 = await runUndoWithDiag(drawerPage, drawerDiag);
      await sess.flushDelivery();
      await waitRaf(spectatorPage, 5);
      const spUndo3 = specDiag[specDiag.length - 1] || null;
      assert.ok(drUndo3 && spUndo3);
      assert.strictEqual(drUndo3.floodFillExecutions, 0, `Drawer Undo 3 must execute 0 Flood Fills, got ${drUndo3.floodFillExecutions}`);
      assert.strictEqual(spUndo3.floodFillExecutions, 0, `Spectator Undo 3 must execute 0 Flood Fills, got ${spUndo3.floodFillExecutions}`);
      assert.strictEqual(await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash()), baseHash17, 'Undo 3 pixel parity');
      assert.strictEqual(await spectatorPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash()), baseHash17, 'Spectator Undo 3 parity');

      // Undo 4 must remain locked by server 3-bucket limit
      assert.strictEqual((await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getHistoryState())).canUndo, false, '4th Undo locked at B17');
      assert.strictEqual(sess.srv.room.gameState.drawHistory?.length, 18);

      console.log('✅ Test 1 (B1..B20 -> Undo 1,2,3 Drawer & Spectator + Baseline Comparison) PASSED', {
        baselineUndo2Fills: baseUndo2?.floodFillExecutions,
        drawerFills: [drUndo1.floodFillExecutions, drUndo2.floodFillExecutions, drUndo3.floodFillExecutions],
        spectatorFills: [spUndo1.floodFillExecutions, spUndo2.floodFillExecutions, spUndo3.floodFillExecutions]
      });
    }

    // =========================================================================
    // TEST 2: Interleaved Buckets + Pencils + Shapes + Eraser + Undo/Redo
    // =========================================================================
    {
      const sess = await setupRoomPages(drawerPage, spectatorPage, url, 'Experimental Draw', { opt: true });
      // Draw 2 vertical divider boxes (Shapes), fill alternating halves with 6 Buckets, interleaved with Pencil & Eraser
      await drawStrokeLine(drawerPage, 'strokeRect', { x: 0.08, y: 0.12 }, { x: 0.44, y: 0.88 }, '#000000', 6);
      await drawStrokeLine(drawerPage, 'strokeRect', { x: 0.56, y: 0.12 }, { x: 0.92, y: 0.88 }, '#000000', 6);
      await clickBucket(drawerPage, 0.25, 0.5, '#ef4444'); // B1
      await drawStrokeLine(drawerPage, 'pencil', { x: 0.1, y: 0.05 }, { x: 0.9, y: 0.05 }, '#111827', 6);
      await clickBucket(drawerPage, 0.74, 0.5, '#3b82f6'); // B2
      await clickBucket(drawerPage, 0.25, 0.5, '#10b981'); // B3
      await drawStrokeLine(drawerPage, 'eraser', { x: 0.2, y: 0.05 }, { x: 0.4, y: 0.05 }, '#ffffff', 10);
      await clickBucket(drawerPage, 0.74, 0.5, '#f59e0b'); // B4 -> locks B1
      await clickBucket(drawerPage, 0.25, 0.5, '#8b5cf6'); // B5 -> locks B2
      await drawStrokeLine(drawerPage, 'pencil', { x: 0.2, y: 0.94 }, { x: 0.8, y: 0.94 }, '#2563eb', 6);
      await sess.flushDelivery();
      await waitRaf(spectatorPage, 5);

      const cpBefore = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
      assert.ok(cpBefore.baseIndex <= cpBefore.bounds.safeBaseUpperBound, 'Base must never exceed safeBaseUpperBound in interleaved mode');

      // Undo Pencil -> B5 -> B4 -> Eraser -> B3 (last unlocked bucket!), Redo B3, then new B6
      await runUndoWithDiag(drawerPage, drawerDiag); // Undo bottom pencil
      const uB5 = await runUndoWithDiag(drawerPage, drawerDiag); // Undo B5
      const uB4 = await runUndoWithDiag(drawerPage, drawerDiag); // Undo B4
      const uEr = await runUndoWithDiag(drawerPage, drawerDiag); // Undo eraser
      const uB3 = await runUndoWithDiag(drawerPage, drawerDiag); // Undo B3 -> stops at B2 lock!
      await sess.flushDelivery();
      await waitRaf(spectatorPage, 5);

      assert.strictEqual(
        (await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getHistoryState())).canUndo,
        false,
        'Interleaved Undo must still stop cleanly at locked B2'
      );
      const drHash2 = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash());
      const spHash2 = await spectatorPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash());
      assert.strictEqual(
        drHash2,
        spHash2,
        'Interleaved Undo Drawer/Spectator parity'
      );
      assert.ok(
        uB5 && uB4 && uEr && uB3 &&
        (uB4.floodFillExecutions + uEr.floodFillExecutions + uB3.floodFillExecutions) <= 3,
        'Checkpoints keep interleaved replay fills bounded'
      );

      // Redo B3 then apply fresh B6 -> checkpoints & parity remain intact
      await drawerPage.evaluate(() => (window as any).__STAGE4F2__.redo());
      await waitRaf(drawerPage, 4);
      await clickBucket(drawerPage, 0.25, 0.5, '#ec4899');
      await waitRaf(spectatorPage, 5);
      assert.strictEqual(
        await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash()),
        await spectatorPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash()),
        'Redo + fresh bucket Drawer/Spectator parity'
      );
      assert.strictEqual(sess.srv.room.gameState.drawEpoch, 0);
      console.log('✅ Test 2 (Interleaved Buckets + Pencils + Shapes + Eraser + Undo/Redo) PASSED');
    }

    // =========================================================================
    // TEST 3: Clear & Epoch Boundaries + Stale Epoch ACK/Lock Isolation
    // =========================================================================
    {
      const sess = await setupRoomPages(drawerPage, spectatorPage, url, 'General #Test', { opt: true });
      for (let i = 0; i < 6; i++) {
        await clickBucket(drawerPage, 0.5, 0.5, BUCKET_COLORS[i]);
      }
      await sess.flushDelivery();
      await waitRaf(spectatorPage, 4);

      const cpEp0 = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
      assert.ok(cpEp0.baseValid && cpEp0.tailValid, 'Epoch 0 checkpoints valid before Clear');

      // Clear canvas -> Epoch 1
      await drawerPage.evaluate(() => (window as any).__STAGE4F2__.clear());
      await sess.flushDelivery();
      await waitRaf(drawerPage, 4);
      await waitRaf(spectatorPage, 4);

      const cpAfterClear = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
      assert.strictEqual(cpAfterClear.baseIndex, 0);
      assert.strictEqual(cpAfterClear.tailIndex, 0);
      assert.strictEqual(cpAfterClear.baseValid, false);
      assert.strictEqual(cpAfterClear.tailValid, false);
      assert.strictEqual(sess.srv.room.gameState.drawEpoch, 1);

      // Inject stale Epoch 0 bucket_lock_sync & draw_action_ack -> MUST be ignored
      await drawerPage.evaluate(() => {
        const h = (window as any).__STAGE4F2__;
        h.dispatchSocket('bucket_lock_sync', { drawEpoch: 0, lockedBucket: { instId: 'stale', strokeId: 999 } });
        h.dispatchSocket('draw_action_ack', { drawEpoch: 0, instId: 'stale', strokeId: 999 });
      });
      await waitRaf(drawerPage, 2);

      // Draw 5 buckets in Epoch 1
      for (let i = 0; i < 5; i++) {
        await clickBucket(drawerPage, 0.5, 0.5, BUCKET_COLORS[i + 6]);
      }
      await sess.flushDelivery();
      await waitRaf(spectatorPage, 4);

      const cpEp1 = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
      assert.strictEqual(cpEp1.baseIndex, 3, `Epoch 1 Base should sit after Clear + B1'+B2' (idx 3), got ${cpEp1.baseIndex}`);
      assert.strictEqual(cpEp1.tailIndex, 6, `Epoch 1 Tail should sit at idx 6, got ${cpEp1.tailIndex}`);
      assert.strictEqual(cpEp1.baseValid, true);
      assert.strictEqual(cpEp1.tailValid, true);

      await runUndoWithDiag(drawerPage, drawerDiag); // B5'
      await runUndoWithDiag(drawerPage, drawerDiag); // B4'
      const uEp1_3 = await runUndoWithDiag(drawerPage, drawerDiag); // B3'
      await sess.flushDelivery();
      assert.strictEqual(uEp1_3?.floodFillExecutions, 0, 'Epoch 1 Undo 3 hits Epoch 1 Base with 0 Flood Fills');
      assert.strictEqual((await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getHistoryState())).canUndo, false);
      console.log('✅ Test 3 (Clear + Epoch Isolation + Stale ACK/Lock Rejection) PASSED');
    }

    // =========================================================================
    // TEST 4: Late Joiner / Reconnect Sync Builds Aligned Base & Tail
    // =========================================================================
    {
      const sess = await setupRoomPages(drawerPage, null, url, 'General #10P', { opt: true });
      await drawStrokeLine(drawerPage, 'pencil', { x: 0.1, y: 0.05 }, { x: 0.1, y: 0.95 }, '#000000', 8);
      for (let i = 0; i < 20; i++) {
        await clickBucket(drawerPage, 0.5, 0.5, BUCKET_COLORS[i]);
      }
      await sess.flushDelivery();
      await waitRaf(drawerPage, 4);
      const expectedHash20 = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash());

      // Late join on fresh spectator page receiving real room_state_update -> draw_history_sync -> draw_redo_sync -> bucket_lock_sync
      const { joinEmits } = sess.srv.simulateLateJoin();
      await spectatorPage.goto(`${url}?opt=1&cfg=${encodeURIComponent(JSON.stringify({ readOnly: true }))}`, {
        waitUntil: 'networkidle'
      });
      await spectatorPage.waitForFunction(() => Boolean((window as any).__STAGE4F2__));
      await spectatorPage.waitForFunction(() => {
        const dims = (window as any).__STAGE4F2__?.getCanvasDimensions();
        return dims && dims.width > 0 && dims.height > 0 && dims.rect.width > 0;
      });
      await spectatorPage.evaluate((emits) => {
        const h = (window as any).__STAGE4F2__;
        for (const ev of emits) {
          h.dispatchSocket(ev.event, ev.payload);
        }
      }, joinEmits);
      await waitRaf(spectatorPage, 6);
      sess.attachSpectatorPage(spectatorPage);

      const joinHash = await spectatorPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash());
      assert.strictEqual(joinHash, expectedHash20, 'Late Joiner must render identical canvas to Drawer');

      const joinCp = await spectatorPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
      assert.strictEqual(joinCp.baseIndex, 18, `Late Joiner Base must align at 18, got ${joinCp.baseIndex}`);
      assert.strictEqual(joinCp.tailIndex, 19, `Late Joiner Tail must align at 19, got ${joinCp.tailIndex}`);
      assert.strictEqual(joinCp.baseValid, true);
      assert.strictEqual(joinCp.tailValid, true);

      // Now Drawer undoes B20, B19, B18 -> Late Joiner handles all 3 with (<=1, 0, 0) fills!
      specDiag.length = 0;
      await runUndoWithDiag(drawerPage, drawerDiag); // B20
      await sess.flushDelivery();
      await waitRaf(spectatorPage, 5);
      const lateU1 = specDiag[specDiag.length - 1];

      specDiag.length = 0;
      await runUndoWithDiag(drawerPage, drawerDiag); // B19
      await sess.flushDelivery();
      await waitRaf(spectatorPage, 5);
      const lateU2 = specDiag[specDiag.length - 1];

      specDiag.length = 0;
      await runUndoWithDiag(drawerPage, drawerDiag); // B18
      await sess.flushDelivery();
      await waitRaf(spectatorPage, 5);
      const lateU3 = specDiag[specDiag.length - 1];

      assert.ok(lateU1 && lateU1.floodFillExecutions <= 1, `Late Joiner Undo 1 <= 1 fill, got ${lateU1?.floodFillExecutions}`);
      assert.strictEqual(lateU2?.floodFillExecutions, 0, `Late Joiner Undo 2 = 0 fills, got ${lateU2?.floodFillExecutions}`);
      assert.strictEqual(lateU3?.floodFillExecutions, 0, `Late Joiner Undo 3 = 0 fills, got ${lateU3?.floodFillExecutions}`);
      assert.strictEqual(
        await spectatorPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash()),
        await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash()),
        'Late Joiner matches Drawer after Undo 1..3'
      );
      console.log('✅ Test 4 (Late Joiner / Reconnect Checkpoint Alignment + Undo 1..3) PASSED', {
        lateJoinFills: [lateU1.floodFillExecutions, lateU2.floodFillExecutions, lateU3.floodFillExecutions]
      });
    }

    // =========================================================================
    // TEST 5: Delayed ACK, Rejection Unpolluted Checkpoints, Out-of-Order Lock vs ACK
    // =========================================================================
    {
      // 5A & 5B: Hold ACK for B18 -> verify Base/Tail NEVER include B18 -> reject B18
      const sess = await setupRoomPages(drawerPage, spectatorPage, url, 'General #Test', { opt: true });
      for (let i = 0; i < 17; i++) {
        await clickBucket(drawerPage, 0.5, 0.5, BUCKET_COLORS[i]); // B1..B17 confirmed (idx 0..16)
      }
      await sess.flushDelivery();
      await waitRaf(drawerPage, 4);
      const cpAt17 = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot(0.5, 0.5));
      assert.ok(cpAt17.baseIndex <= 14 || cpAt17.tailIndex <= 17);

      sess.setHoldDrawerResponses(true);
      sess.setRejectRateLimit(true);
      await clickBucket(drawerPage, 0.5, 0.5, '#000000'); // B18 unconfirmed! (black)
      await sess.flushDelivery();
      sess.setRejectRateLimit(false);
      await drawStrokeLine(drawerPage, 'pencil', { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, '#22c55e', 8); // Pencil after unconfirmed B18
      await sess.flushDelivery();
      await waitRaf(drawerPage, 4);

      const cpWhileUnconfirmed = await drawerPage.evaluate(() =>
        (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot(0.5, 0.5)
      );
      assert.strictEqual(cpWhileUnconfirmed.bounds.maxConfirmedIdx, 17, 'maxConfirmedIdx stops right before unconfirmed B18');
      assert.ok(cpWhileUnconfirmed.baseIndex <= 17, 'Base must not advance past unconfirmed B18');
      assert.ok(cpWhileUnconfirmed.tailIndex <= 17, 'Tail must not advance past unconfirmed B18');
      if (cpWhileUnconfirmed.tailSampleRGBA) {
        assert.notDeepStrictEqual(
          cpWhileUnconfirmed.tailSampleRGBA,
          [0, 0, 0, 255],
          'Tail canvas pixels must never be polluted by unconfirmed black B18!'
        );
      }

      // Now release draw_action_rejected for B18
      await sess.flushHeldDrawerResponses();
      await waitRaf(drawerPage, 4);
      const cpAfterReject = await drawerPage.evaluate(() =>
        (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot(0.5, 0.5)
      );
      const pxMidAfterReject = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getPixelRGBA(0.5, 0.5));
      assert.notDeepStrictEqual(pxMidAfterReject, [0, 0, 0, 255], 'Rejected B18 black color must be gone');
      assert.strictEqual(cpAfterReject.bounds.maxConfirmedIdx, 18, 'Pencil after rejected B18 is cleanly confirmed');

      // 5C: Out-of-order: bucket_lock_sync(B17) arrives BEFORE draw_action_ack(B20)
      sess.setHoldDrawerResponses(false);
      sess.setRejectRateLimit(false);
      await runUndoWithDiag(drawerPage, drawerDiag); // remove green pencil back to B17
      await sess.flushDelivery();
      await clickBucket(drawerPage, 0.5, 0.5, BUCKET_COLORS[17]); // B18
      await clickBucket(drawerPage, 0.5, 0.5, BUCKET_COLORS[18]); // B19
      await sess.flushDelivery();
      await waitRaf(drawerPage, 4);

      const cpAt19 = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
      assert.strictEqual(cpAt19.tailIndex, 17, 'At B19, Tail is pinned at 17 awaiting lock advance');

      // Send B20 with lock_sync delivered BEFORE draw_action_ack!
      sess.setReorderLockBeforeAck(true);
      await clickBucket(drawerPage, 0.5, 0.5, BUCKET_COLORS[19]); // B20
      await sess.flushDelivery();
      await waitRaf(drawerPage, 4);
      const cpAfterOutOfOrder = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
      assert.strictEqual(cpAfterOutOfOrder.baseIndex, 17, `Out-of-order lock+ack promotes Tail(17) -> Base(17), got ${cpAfterOutOfOrder.baseIndex}`);
      assert.strictEqual(cpAfterOutOfOrder.tailIndex, 20, `Out-of-order lock+ack captures Tail(20), got ${cpAfterOutOfOrder.tailIndex}`);
      assert.strictEqual(cpAfterOutOfOrder.baseValid, true);
      assert.strictEqual(cpAfterOutOfOrder.tailValid, true);

      console.log('✅ Test 5 (Delayed ACK + Rejected Bucket Unpolluted Checkpoints + Out-of-Order Lock/ACK) PASSED');
    }

    // =========================================================================
    // TEST 6: Mode Isolation (Free Draw & Normal Rooms Unaffected)
    // =========================================================================
    {
      // 6A: Free Draw
      await setupRoomPages(drawerPage, null, url, 'Free Draw', {
        opt: true,
        configOverrides: { isFreeDraw: true, isExperimental: false }
      });
      for (let i = 0; i < 6; i++) {
        await clickBucket(drawerPage, 0.5, 0.5, BUCKET_COLORS[i]);
      }
      const fdCp = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
      assert.ok(fdCp.historyCheckpointCount >= 5, `Free Draw must keep 10-checkpoint history pool, got ${fdCp.historyCheckpointCount}`);
      // Undo all 6 in Free Draw (no 3-bucket competitive lock!)
      for (let i = 0; i < 6; i++) {
        await runUndoWithDiag(drawerPage, drawerDiag);
      }
      assert.strictEqual((await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getHistoryState())).canUndo, false);

      // 6B: Normal Room (non-experimental)
      const normSess = await setupRoomPages(drawerPage, null, url, 'General #Test', {
        opt: true,
        configOverrides: { isFreeDraw: false, isExperimental: false, enableCanvasAlpha: false },
        roomOverrides: { isExperimental: false, isFreeDraw: false }
      });
      try {
        const normDims = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasDimensions());
        assert.strictEqual(normDims.width, 592);
        assert.strictEqual(normDims.height, 344);
        await clickBucket(drawerPage, 0.5, 0.5, '#ef4444');
        await clickBucket(drawerPage, 0.5, 0.5, '#3b82f6');
        await runUndoWithDiag(drawerPage, drawerDiag); // 1st undo allowed
        const normHist1 = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getHistoryState());
        assert.strictEqual(normHist1.canUndo, false, 'Normal room preserves 1-step undo limit');
      } finally {
        normSess.srv.room.isExperimental = true;
      }
      console.log('✅ Test 6 (Free Draw & Normal Room Isolation) PASSED');
    }

    // =========================================================================
    // TEST 7: 20 Confirmed Buckets -> 16 Consecutive Pencil Strokes -> Repeated Pencil Undo
    // =========================================================================
    {
      const sess = await setupRoomPages(drawerPage, spectatorPage, url, 'General #Test', { opt: true });
      await drawStrokeLine(drawerPage, 'pencil', { x: 0.1, y: 0.05 }, { x: 0.1, y: 0.95 }, '#000000', 8);
      for (let i = 0; i < 20; i++) {
        await clickBucket(drawerPage, 0.5, 0.5, BUCKET_COLORS[i]);
      }
      await sess.flushDelivery();
      await waitRaf(drawerPage, 4);
      await waitRaf(spectatorPage, 5);

      const cpAtB20 = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
      const spAtB20 = await spectatorPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
      assert.strictEqual(cpAtB20.baseIndex, 18, `Drawer Base at Divider+B20 must be 18, got ${cpAtB20.baseIndex}`);
      assert.strictEqual(cpAtB20.tailIndex, 21, `Drawer Tail at Divider+B20 must be 21, got ${cpAtB20.tailIndex}`);
      assert.strictEqual(spAtB20.baseIndex, 18, `Spectator Base at Divider+B20 must be 18, got ${spAtB20.baseIndex}`);
      assert.strictEqual(spAtB20.tailIndex, 21, `Spectator Tail at Divider+B20 must be 21, got ${spAtB20.tailIndex}`);
      const hashAtB20 = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash());

      // Draw 16 consecutive Pencil strokes after the 20 Buckets (P1..P16)
      for (let i = 0; i < 16; i++) {
        const y = 0.14 + i * 0.048;
        await drawStrokeLine(drawerPage, 'pencil', { x: 0.25, y }, { x: 0.85, y }, '#111827', 6);
        if (i === 7 || i === 14) {
          await sess.flushDelivery();
          await waitRaf(spectatorPage, 5);
          const drMidCp = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
          const spMidCp = await spectatorPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
          assert.strictEqual(
            drMidCp.tailIndex,
            21,
            `Drawer Tail after Pencil #${i + 1} must remain aligned at 21 (stride=16), got ${drMidCp.tailIndex}`
          );
          assert.strictEqual(
            spMidCp.tailIndex,
            21,
            `Spectator Tail after Pencil #${i + 1} must remain aligned at 21 (stride=16), got ${spMidCp.tailIndex}`
          );
        }
      }

      await sess.flushDelivery();
      await waitRaf(drawerPage, 4);
      await waitRaf(spectatorPage, 5);

      const cpAtP16 = await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
      const spAtP16 = await spectatorPage.evaluate(() => (window as any).__STAGE4F2__.getCompetitiveCheckpointSnapshot());
      assert.strictEqual(cpAtP16.baseIndex, 18);
      assert.strictEqual(cpAtP16.tailIndex, 37, `Drawer live Tail at Pencil #16 must advance to 37 (21+16), got ${cpAtP16.tailIndex}`);
      assert.strictEqual(spAtP16.baseIndex, 18);
      assert.strictEqual(spAtP16.tailIndex, 37, `Spectator live Tail at Pencil #16 must advance to 37 (21+16), got ${spAtP16.tailIndex}`);
      assert.strictEqual(cpAtP16.historyCheckpointCount, 0);
      assert.strictEqual(await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getDomCanvasCount()), 2);

      // Undo all 16 Pencil strokes sequentially and track Flood Fill executions on both Drawer & Spectator
      const drawerPencilFills: number[] = [];
      const specPencilFills: number[] = [];

      for (let step = 0; step < 16; step++) {
        specDiag.length = 0;
        const drUndo = await runUndoWithDiag(drawerPage, drawerDiag);
        await sess.flushDelivery();
        await waitRaf(spectatorPage, 5);
        const spUndo = specDiag[specDiag.length - 1] || null;
        assert.ok(drUndo && spUndo, `Step ${step + 1} must emit diag for both Drawer and Spectator`);
        drawerPencilFills.push(drUndo.floodFillExecutions);
        specPencilFills.push(spUndo.floodFillExecutions);

        if (step === 0) {
          // Step 1 (P16 undone): Drawer hits fast-path (0 fills); Spectator crosses Tail(37) -> captures Tail=21 (NOT postPivot 19!)
          assert.strictEqual(drUndo.floodFillExecutions, 0, `Drawer Undo 1 must execute 0 fills, got ${drUndo.floodFillExecutions}`);
          assert.ok(spUndo.floodFillExecutions <= 3, `Spectator Undo 1 crosses Tail(37) with <=3 fills, got ${spUndo.floodFillExecutions}`);
          assert.strictEqual(
            spUndo.tailIndexAfter,
            21,
            `Spectator Replay must place Tail at lastB+1 (21), not postPivot (19); got ${spUndo.tailIndexAfter}`
          );
        } else if (step === 1) {
          // Step 2 (P15 undone): Drawer crosses Tail(37) -> captures Tail=21; Spectator hits Tail=21 with 0 fills!
          assert.ok(drUndo.floodFillExecutions <= 3, `Drawer Undo 2 crosses Tail(37) with <=3 fills, got ${drUndo.floodFillExecutions}`);
          assert.strictEqual(
            drUndo.tailIndexAfter,
            21,
            `Drawer Replay must place Tail at lastB+1 (21), not postPivot (19); got ${drUndo.tailIndexAfter}`
          );
          assert.strictEqual(spUndo.floodFillExecutions, 0, `Spectator Undo 2 must hit Tail(21) with 0 fills, got ${spUndo.floodFillExecutions}`);
        } else {
          // Steps 3..16 (P14..P1): BOTH Drawer and Spectator must execute 0 Flood Fills on every subsequent Pencil Undo!
          assert.strictEqual(
            drUndo.floodFillExecutions,
            0,
            `Drawer Pencil Undo step ${step + 1} must execute 0 Flood Fills, got ${drUndo.floodFillExecutions}`
          );
          assert.strictEqual(
            spUndo.floodFillExecutions,
            0,
            `Spectator Pencil Undo step ${step + 1} must execute 0 Flood Fills, got ${spUndo.floodFillExecutions}`
          );
          assert.strictEqual(drUndo.tailIndexAfter, 21);
          assert.strictEqual(spUndo.tailIndexAfter, 21);
        }
      }

      assert.strictEqual(
        await drawerPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash()),
        hashAtB20,
        'Drawer canvas after undoing all 16 Pencils must match post-B20 hash'
      );
      assert.strictEqual(
        await spectatorPage.evaluate(() => (window as any).__STAGE4F2__.getCanvasHash()),
        hashAtB20,
        'Spectator canvas after undoing all 16 Pencils must match post-B20 hash'
      );
      console.log('✅ Test 7 (20 Buckets -> 16 Pencils -> Repeated Pencil Undo) PASSED', {
        drawerPencilFills,
        specPencilFills
      });
    }

    console.log('\n✅ ALL STAGE 4F-2 COMPETITIVE CHECKPOINT ALIGNMENT TESTS PASSED!');
  } finally {
    await browser.close();
    await viteServer.close();
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ STAGE 4F-2 TEST FAILED:', err);
    process.exit(1);
  });

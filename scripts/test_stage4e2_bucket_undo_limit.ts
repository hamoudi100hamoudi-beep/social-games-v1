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

function makeBucketBuf(instId: string, strokeId: number, x = 0.5, y = 0.5, color = '#ef4444'): Buffer {
  const ab = encodeBinaryDrawMessage('draw_action', {
    tool: 'bucket',
    color,
    opacity: 1,
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

function makeStrokeBuf(instId: string, strokeId: number, tool: 'pencil' | 'strokeRect' = 'pencil'): Buffer {
  const ab = encodeBinaryDrawMessage('draw_stroke', {
    tool,
    color: '#111827',
    width: 6,
    opacity: 1,
    points: [
      { x: 0.2, y: 0.2 },
      { x: 0.4, y: 0.2 }
    ],
    strokeId,
    instanceId: instId
  });
  return Buffer.from(ab);
}

function makeType3EndBuf(instId: string, strokeId: number): Buffer {
  const ab = encodeBinaryDrawMessage('draw_end', {
    tool: 'pencil',
    color: '#111827',
    width: 6,
    opacity: 1,
    x: 0.4,
    y: 0.2,
    isCancelled: false,
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

function createServerHarness(roomId: string) {
  const emittedSocket: { event: string; payload: any }[] = [];
  const emittedRoom: { event: string; payload: any }[] = [];
  const roundSyncLimits = new Map<string, number[]>();
  const controlLimiter = new ControlRateLimiter();
  const drawLimiter = new DrawRateLimiter();

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
    emittedSocket,
    emittedRoom,
    sendBinary: (buf: Buffer) =>
      handleDrawBinary(mockSocket, buf, {
        io: mockIo,
        roomManager,
        drawRateLimiter: drawLimiter
      }),
    reconnectSocket: () => {
      // Re-use same socket id via handleJoinRoom reconnect path (persistentId match)
      const prevLen = emittedSocket.length;
      let reRes: any = null;
      handleJoinRoom(
        mockSocket,
        {
          roomId,
          nickname,
          playerId,
          reconnectSecret: secret
        },
        (res) => {
          reRes = res;
        },
        {
          io: mockIo,
          roomManager,
          getJsonSafeHistory,
          controlRateLimiter: controlLimiter
        }
      );
      return { reRes, newEmits: emittedSocket.slice(prevLen) };
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
    }
  };
}

async function runServerUnitTests() {
  console.log('--- Running Stage 4E-2 Server Authoritative Tests (Cases A-G) ---');
  const inst = 'instS4E';

  // CASE A: 3-Bucket Limit
  {
    roomManager.clearDrawHistory('General #Test');
    const h = createServerHarness('General #Test');
    h.room.gameState.drawEpoch = 0;
    h.room.gameState.lockedBucketTarget = null;
    h.room.gameState.drawHistory = [];
    h.emittedSocket.length = 0;
    h.emittedRoom.length = 0;

    h.sendBinary(makeBucketBuf(inst, 1));
    h.sendBinary(makeBucketBuf(inst, 2));
    h.sendBinary(makeBucketBuf(inst, 3));
    assert.strictEqual(h.room.gameState.lockedBucketTarget, null, 'Case A: B1..B3 must not lock yet');

    h.sendBinary(makeBucketBuf(inst, 4));
    assert.deepStrictEqual(
      h.room.gameState.lockedBucketTarget,
      { drawEpoch: 0, instId: inst, strokeId: 1 },
      'Case A: B4 must lock B1'
    );
    const lockBroadcast = h.emittedRoom.filter((e) => e.event === 'bucket_lock_sync').pop();
    assert.deepStrictEqual(lockBroadcast?.payload, {
      drawEpoch: 0,
      lockedBucket: { instId: inst, strokeId: 1 }
    });

    // Undo B4, B3, B2 succeed
    h.sendBinary(makeUndoBuf(inst, 4));
    h.sendBinary(makeUndoBuf(inst, 3));
    h.sendBinary(makeUndoBuf(inst, 2));
    assert.strictEqual(h.room.gameState.drawHistory?.length, 1, 'Case A: Only B1 should remain');

    // Undo B1 must be rejected!
    h.emittedSocket.length = 0;
    h.emittedRoom.length = 0;
    h.sendBinary(makeUndoBuf(inst, 1));
    assert.strictEqual(h.room.gameState.drawHistory?.length, 1, 'Case A: B1 must remain after rejected undo');
    assert.strictEqual(
      h.emittedRoom.filter((e) => e.event === 'draw_binary').length,
      0,
      'Case A: Rejected undo must NOT broadcast draw_binary Type 7'
    );
    const rej = h.emittedSocket.find((e) => e.event === 'draw_undo_rejected');
    assert.ok(rej, 'Case A: Server must emit draw_undo_rejected');
    assert.strictEqual(rej.payload.reason, 'bucket_locked');
    assert.strictEqual(rej.payload.strokeId, 1);
    assert.deepStrictEqual(rej.payload.lockedBucket, { instId: inst, strokeId: 1 });
    console.log('✅ Server Case A PASSED');
  }

  // CASE B: Interleaved Pencil/Shape + No Bypass across locked B1
  {
    const rid = 'Experimental Draw';
    roomManager.clearDrawHistory(rid);
    const h = createServerHarness(rid);
    h.room.gameState.drawEpoch = 0;
    h.room.gameState.lockedBucketTarget = null;
    h.room.gameState.drawHistory = [];

    // P0(1) -> B1(2) -> P1(3, recorded as Type9+Type3) -> B2(4) -> S1(5) -> B3(6) -> P2(7) -> B4(8)
    h.sendBinary(makeStrokeBuf(inst, 1, 'pencil'));
    h.sendBinary(makeBucketBuf(inst, 2));
    h.sendBinary(makeStrokeBuf(inst, 3, 'pencil'));
    h.sendBinary(makeType3EndBuf(inst, 3)); // simulate paired [Type 9, Type 3]
    h.sendBinary(makeBucketBuf(inst, 4));
    h.sendBinary(makeStrokeBuf(inst, 5, 'strokeRect'));
    assert.strictEqual(h.room.gameState.lockedBucketTarget, null, 'Case B: Pencil & Shape must not trigger bucket lock');
    h.sendBinary(makeBucketBuf(inst, 6));
    h.sendBinary(makeStrokeBuf(inst, 7, 'pencil'));
    assert.strictEqual(h.room.gameState.lockedBucketTarget, null, 'Case B: Still 3 buckets, no lock yet');
    h.sendBinary(makeBucketBuf(inst, 8));
    assert.deepStrictEqual(
      h.room.gameState.lockedBucketTarget,
      { drawEpoch: 0, instId: inst, strokeId: 2 },
      'Case B: B4(8) must lock B1(2)'
    );

    // Undo in reverse chronological order: B4(8), P2(7), B3(6), S1(5), B2(4), P1(3)
    for (const sId of [8, 7, 6, 5, 4, 3]) {
      h.emittedSocket.length = 0;
      h.sendBinary(makeUndoBuf(inst, sId));
      assert.strictEqual(
        h.emittedSocket.some((e) => e.event === 'draw_undo_rejected'),
        false,
        `Case B: Stroke ${sId} after locked B1 must be undoable`
      );
    }
    // Only P0(1) and B1(2) should remain! Both Type 9 and Type 3 of P1(3) must be gone.
    assert.strictEqual(h.room.gameState.drawHistory?.length, 2, 'Case B: P0(1) and B1(2) must remain (P1 pair removed)');

    // Trying to undo B1(2) OR bypass B1(2) to undo P0(1) must both fail!
    h.emittedSocket.length = 0;
    h.sendBinary(makeUndoBuf(inst, 2));
    assert.strictEqual(h.emittedSocket.find((e) => e.event === 'draw_undo_rejected')?.payload.reason, 'bucket_locked');

    h.emittedSocket.length = 0;
    h.sendBinary(makeUndoBuf(inst, 1));
    assert.strictEqual(h.emittedSocket.find((e) => e.event === 'draw_undo_rejected')?.payload.reason, 'bucket_locked');
    assert.strictEqual(h.room.gameState.drawHistory?.length, 2, 'Case B: P0(1) must NOT be bypassed/undone');
    console.log('✅ Server Case B PASSED');
  }

  // CASE C: Monotonic lock stability (never moves backward)
  {
    const rid = 'General #10P';
    roomManager.clearDrawHistory(rid);
    const h = createServerHarness(rid);
    h.room.gameState.drawEpoch = 0;
    h.room.gameState.lockedBucketTarget = null;
    h.room.gameState.drawHistory = [];

    h.sendBinary(makeBucketBuf(inst, 1));
    h.sendBinary(makeBucketBuf(inst, 2));
    h.sendBinary(makeBucketBuf(inst, 3));
    h.sendBinary(makeBucketBuf(inst, 4));
    assert.strictEqual(h.room.gameState.lockedBucketTarget?.strokeId, 1);

    h.sendBinary(makeUndoBuf(inst, 4));
    assert.strictEqual(h.room.gameState.lockedBucketTarget?.strokeId, 1, 'Case C: Lock must stay at B1 after undo B4');

    h.sendBinary(makeBucketBuf(inst, 5));
    assert.strictEqual(h.room.gameState.lockedBucketTarget?.strokeId, 1, 'Case C: B5 keeps 3 unlocked (B2,B3,B5), lock stays B1');

    h.sendBinary(makeBucketBuf(inst, 6));
    assert.strictEqual(h.room.gameState.lockedBucketTarget?.strokeId, 2, 'Case C: B6 advances lock to B2');

    // Undo B6, B5, B3 -> B2 must reject
    h.sendBinary(makeUndoBuf(inst, 6));
    h.sendBinary(makeUndoBuf(inst, 5));
    h.sendBinary(makeUndoBuf(inst, 3));
    h.emittedSocket.length = 0;
    h.sendBinary(makeUndoBuf(inst, 2));
    assert.strictEqual(h.emittedSocket.find((e) => e.event === 'draw_undo_rejected')?.payload.reason, 'bucket_locked');
    console.log('✅ Server Case C PASSED');
  }

  // CASE D: Clear & Single Epoch increment
  {
    const rid = 'General #Test';
    roomManager.clearDrawHistory(rid);
    const h = createServerHarness(rid);
    h.room.gameState.drawEpoch = 0;
    h.room.gameState.lockedBucketTarget = null;
    h.room.gameState.drawHistory = [];

    h.sendBinary(makeBucketBuf(inst, 1));
    h.sendBinary(makeBucketBuf(inst, 2));
    h.sendBinary(makeBucketBuf(inst, 3));
    h.sendBinary(makeBucketBuf(inst, 4));
    assert.strictEqual(h.room.gameState.drawEpoch, 0);
    assert.strictEqual(h.room.gameState.lockedBucketTarget?.strokeId, 1);

    // Client Type 5 Clear -> must advance epoch strictly by 1
    h.emittedRoom.length = 0;
    h.sendBinary(makeClearBuf(inst));
    assert.strictEqual(h.room.gameState.drawEpoch, 1, 'Case D: Type 5 Clear must increment drawEpoch once (0->1)');
    assert.strictEqual(h.room.gameState.lockedBucketTarget, null, 'Case D: Clear must reset lockedBucketTarget');

    // New Epoch fresh 3-bucket limit
    h.sendBinary(makeBucketBuf(inst, 10));
    h.sendBinary(makeBucketBuf(inst, 11));
    h.sendBinary(makeBucketBuf(inst, 12));
    assert.strictEqual(h.room.gameState.lockedBucketTarget, null);
    h.sendBinary(makeBucketBuf(inst, 13));
    assert.deepStrictEqual(h.room.gameState.lockedBucketTarget, {
      drawEpoch: 1,
      instId: inst,
      strokeId: 10
    });

    // Server clearDrawHistoryForRoomAndClient (emits both draw_clear & Type 5) -> must also increment strictly once!
    roomManager.clearDrawHistoryForRoomAndClient(h.room);
    assert.strictEqual(h.room.gameState.drawEpoch, 2, 'Case D: clearDrawHistoryForRoomAndClient must increment drawEpoch once (1->2)');
    assert.strictEqual(h.room.gameState.lockedBucketTarget, null);
    console.log('✅ Server Case D PASSED');
  }

  // CASE G: Isolation (Free Draw & Normal rooms)
  {
    // Free Draw
    const hFree = createServerHarness('Free Draw');
    hFree.room.drawingIdentities = {
      [inst]: { socketId: hFree.mockSocket.id, playerName: 'FreeDrawer' }
    };
    for (let i = 1; i <= 5; i++) {
      hFree.sendBinary(makeBucketBuf(inst, i));
    }
    assert.strictEqual(hFree.room.gameState.lockedBucketTarget, null, 'Case G: Free Draw must never set lockedBucketTarget');
    hFree.emittedSocket.length = 0;
    for (let i = 5; i >= 1; i--) {
      hFree.sendBinary(makeUndoBuf(inst, i));
    }
    assert.strictEqual(hFree.room.gameState.drawHistory?.length, 0, 'Case G: Free Draw must undo all 5 buckets');
    assert.strictEqual(
      hFree.emittedSocket.some((e) => e.event === 'draw_undo_rejected' || e.event === 'bucket_lock_sync'),
      false,
      'Case G: Free Draw must not emit competitive bucket lock events'
    );

    // Normal Room (custom room config override with isExperimental: false, isFreeDraw: false)
    const normalId = '__normal_isolation_test__';
    const normalRoom = roomManager.createRoom(normalId);
    normalRoom.isExperimental = false;
    normalRoom.isFreeDraw = false;
    const hNorm = createServerHarness(normalId);
    hNorm.sendBinary(makeBucketBuf(inst, 1));
    hNorm.sendBinary(makeBucketBuf(inst, 2));
    hNorm.sendBinary(makeBucketBuf(inst, 3));
    hNorm.sendBinary(makeBucketBuf(inst, 4));
    assert.strictEqual(hNorm.room.gameState.lockedBucketTarget, null, 'Case G: Normal room must not set bucket lock');
    hNorm.sendBinary(Buffer.from(encodeBinaryDrawMessage('draw_undo', { instanceId: inst })));
    assert.strictEqual(hNorm.room.gameState.drawHistory?.length, 3, 'Case G: Normal room global 1-step undo works');
    assert.strictEqual(hNorm.room.gameState.redoStack?.length, 1, 'Case G: Normal room redoStack works');
    console.log('✅ Server Case G (Isolation) PASSED');
  }
}

// ============================================================================
// BROWSER E2E HARNESS WIRED TO REAL SERVER HANDLERS (Cases A-F Client+Server)
// ============================================================================
const HARNESS_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Stage 4E-2 Bucket Undo Limit E2E</title>
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
    <script type="module" src="/__stage4e2_harness.js"></script>
  </body>
</html>`;

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

function countNonWhitePixels() {
  const c = document.getElementById('drawing-board-layer-primary');
  if (!c) return -1;
  const ctx = c.getContext('2d');
  if (!ctx) return -1;
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0 && (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250)) {
      count++;
    }
  }
  return count;
}

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

function TestStage4E2App() {
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
  const [historyState, setHistoryState] = useState({ index: 0, length: 1 });
  const historyRef = useRef({ index: 0, length: 1 });

  useEffect(() => {
    window.__STAGE4E2__ = {
      setConfig: (patch) => setConfig((prev) => ({ ...prev, ...patch })),
      undo: () => canvasRef.current?.undo(),
      redo: () => canvasRef.current?.redo(),
      clear: () => canvasRef.current?.clear(),
      getHistoryState: () => ({
        ...historyRef.current,
        canUndo: historyRef.current.index > 0,
        canRedo: historyRef.current.length > historyRef.current.index + 1
      }),
      getCanvasDimensions: () => {
        const c = document.getElementById('drawing-board-layer-primary');
        return c ? { width: c.width, height: c.height, rect: c.getBoundingClientRect().toJSON() } : null;
      },
      countNonWhitePixels,
      getPixelRGBA,
      getEmitted: () => window.__STAGE4E2_EMITS__ || [],
      clearEmitted: () => { window.__STAGE4E2_EMITS__ = []; },
      dispatchSocket: (event, payload) => window.__STAGE4E2_DISPATCH__?.(event, payload),
      sendRawUndoViaSocket: (instId, strokeId) => window.__STAGE4E2_RAW_UNDO__?.(instId, strokeId),
      setDropIncomingBucketLockSync: (drop) => { window.__STAGE4E2_DROP_LOCK_SYNC__ = Boolean(drop); }
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
        setHistoryState({ index, length });
      }
    })
  );
}

createRoot(document.getElementById('harness-root')).render(
  React.createElement(SocketProvider, null, React.createElement(TestStage4E2App))
);
`;

const MOCK_SOCKET_PROVIDER_JS = `
import React, { createContext, useContext, useState } from 'react';
import { encodeBinaryDrawMessage } from '/src/utils/drawBinaryHelper.ts';

const listeners = {};
window.__STAGE4E2_EMITS__ = [];
window.__STAGE4E2_DROP_LOCK_SYNC__ = false;

const mockSocket = {
  id: 'stage4e2_test_socket',
  connected: true,
  emit: (event, payload, ack) => {
    const entry = {
      event,
      payloadBytes: payload && payload.byteLength ? Array.from(new Uint8Array(payload)) : null
    };
    window.__STAGE4E2_EMITS__.push(entry);
    if (typeof window.__STAGE4E2_SERVER_BRIDGE__ === 'function') {
      window.__STAGE4E2_SERVER_BRIDGE__(event, entry.payloadBytes);
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
      if (typeof window.__STAGE4E2_SERVER_BRIDGE__ === 'function') {
        window.__STAGE4E2_SERVER_BRIDGE__(event, bytes);
      }
    }
  }
};

let setConnectedHook = null;

window.__STAGE4E2_DISPATCH__ = (event, payload) => {
  if (event === 'bucket_lock_sync' && window.__STAGE4E2_DROP_LOCK_SYNC__) {
    return;
  }
  if (event === 'disconnect') {
    mockSocket.connected = false;
    setConnectedHook?.(false);
  } else if (event === 'connect') {
    mockSocket.connected = true;
    setConnectedHook?.(true);
  }
  if (listeners[event]) {
    listeners[event].forEach((cb) => cb(payload));
  }
};

window.__STAGE4E2_RAW_UNDO__ = (instId, strokeId) => {
  const ab = encodeBinaryDrawMessage('draw_undo', { instanceId: instId, strokeId });
  mockSocket.emit('draw_binary', ab);
};

const SocketContext = createContext({
  socket: mockSocket,
  isConnected: true,
  socketId: 'stage4e2_test_socket'
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(true);
  setConnectedHook = setIsConnected;
  return React.createElement(
    SocketContext.Provider,
    { value: { socket: mockSocket, isConnected, socketId: 'stage4e2_test_socket' } },
    children
  );
};
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
        name: 'stage4e2-test-harness',
        enforce: 'pre',
        resolveId(id, importer) {
          if (id === '/__stage4e2_harness.js') return '\0stage4e2-harness.js';
          if (id.endsWith('SocketProvider') || id.endsWith('SocketProvider.tsx')) {
            const resolved = importer
              ? path.resolve(path.dirname(importer), id).replace(/\\/g, '/')
              : id;
            if (resolved === socketProviderPath || resolved + '.tsx' === socketProviderPath) {
              return '\0stage4e2-mock-socket';
            }
          }
          return null;
        },
        load(id) {
          if (id === '\0stage4e2-harness.js') return HARNESS_JS;
          if (id === '\0stage4e2-mock-socket') return MOCK_SOCKET_PROVIDER_JS;
          return null;
        },
        configureServer(srv) {
          srv.middlewares.use((req, res, next) => {
            if (req.url && req.url.startsWith('/__stage4e2_harness.html')) {
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
  return { server, url: `http://127.0.0.1:${port}/__stage4e2_harness.html` };
}

async function waitRaf(page: Page, frames = 3) {
  for (let i = 0; i < frames; i++) {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
}

async function setupBrowserSession(
  page: Page,
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

  const srv = createServerHarness(roomId);
  srv.room.gameState.drawEpoch = 0;
  srv.room.gameState.lockedBucketTarget = null;
  srv.room.gameState.drawHistory = [];
  srv.room.gameState.timeLeft = 100;

  const bridgeName = `__bridge_${Math.random().toString(36).slice(2, 8)}`;
  let suppressReconnectHistoryUntilManual = false;

  await page.exposeFunction(bridgeName, (event: string, payloadBytes: number[] | null) => {
    if (event === 'draw_binary' && Array.isArray(payloadBytes)) {
      const prevSockLen = srv.emittedSocket.length;
      const prevRoomLen = srv.emittedRoom.length;
      srv.sendBinary(Buffer.from(payloadBytes));

      const newRoomEvents = srv.emittedRoom.slice(prevRoomLen);
      const newSockEvents = srv.emittedSocket.slice(prevSockLen);

      // Deliver server responses asynchronously back to browser socket
      queueMicrotask(async () => {
        for (const ev of newRoomEvents) {
          if (ev.event === 'bucket_lock_sync') {
            await page.evaluate(
              (p) => (window as any).__STAGE4E2__?.dispatchSocket('bucket_lock_sync', p),
              ev.payload
            );
          } else if (ev.event === 'draw_binary' && Buffer.isBuffer(ev.payload)) {
            // Type 7 / Type 11 broadcasts via io.to(roomId) go to sender too
            const firstByte = ev.payload[0];
            if (firstByte === 7 || firstByte === 11) {
              await page.evaluate(
                (arr) => (window as any).__STAGE4E2__?.dispatchSocket('draw_binary', new Uint8Array(arr).buffer),
                Array.from(ev.payload)
              );
            }
          }
        }
        for (const ev of newSockEvents) {
          if (ev.event === 'draw_undo_rejected') {
            await page.evaluate(
              (p) => (window as any).__STAGE4E2__?.dispatchSocket('draw_undo_rejected', p),
              ev.payload
            );
          }
        }
      });
    } else if (event === 'request_round_sync' && !suppressReconnectHistoryUntilManual) {
      const emits = srv.requestSync();
      queueMicrotask(async () => {
        for (const ev of emits) {
          await page.evaluate(
            ({ eName, p }) => (window as any).__STAGE4E2__?.dispatchSocket(eName, p),
            { eName: ev.event, p: ev.payload }
          );
        }
      });
    }
  });

  const cfgParam = encodeURIComponent(JSON.stringify(configOverrides));
  await page.goto(`${url}?cfg=${cfgParam}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean((window as any).__STAGE4E2__));
  await page.evaluate((bName) => {
    (window as any).__STAGE4E2_SERVER_BRIDGE__ = (event: string, bytes: number[] | null) =>
      (window as any)[bName](event, bytes);
  }, bridgeName);

  await page.waitForFunction(() => {
    const dims = (window as any).__STAGE4E2__?.getCanvasDimensions();
    return dims && dims.width > 0 && dims.height > 0 && dims.rect.width > 0;
  });
  await waitRaf(page, 2);

  await page.evaluate(() => {
    const h = (window as any).__STAGE4E2__;
    h.dispatchSocket('room_state_update', {
      gameState: {
        status: 'DRAWING',
        currentDrawerId: 'player-drawer-1',
        drawEpoch: 0,
        lockedBucketTarget: null
      }
    });
    h.dispatchSocket('draw_history_sync', []);
    h.dispatchSocket('draw_redo_sync', []);
    h.dispatchSocket('bucket_lock_sync', { drawEpoch: 0, lockedBucket: null });
  });
  await waitRaf(page, 3);

  return {
    srv,
    setSuppressAutoSync: (v: boolean) => {
      suppressReconnectHistoryUntilManual = v;
    }
  };
}

async function drawVerticalBox(page: Page, xStartNorm: number, xEndNorm: number, color = '#000000') {
  await page.evaluate((c) => {
    (window as any).__STAGE4E2__.setConfig({ tool: 'strokeRect', color: c, thickness: 6, opacity: 1 });
  }, color);
  await waitRaf(page, 1);

  const rect = await page.evaluate(() => (window as any).__STAGE4E2__.getCanvasDimensions().rect);
  const x0 = rect.left + xStartNorm * rect.width;
  const y0 = rect.top + 0.15 * rect.height;
  const x1 = rect.left + xEndNorm * rect.width;
  const y1 = rect.top + 0.85 * rect.height;

  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 3 });
  await page.mouse.up();
  await waitRaf(page, 3);
}

async function drawHorizontalPencil(page: Page, yNorm: number, color = '#000000') {
  await page.evaluate((c) => {
    (window as any).__STAGE4E2__.setConfig({ tool: 'pencil', color: c, thickness: 8, opacity: 1 });
  }, color);
  await waitRaf(page, 1);

  const rect = await page.evaluate(() => (window as any).__STAGE4E2__.getCanvasDimensions().rect);
  const y = rect.top + yNorm * rect.height;
  await page.mouse.move(rect.left + 0.12 * rect.width, y);
  await page.mouse.down();
  await page.mouse.move(rect.left + 0.35 * rect.width, y, { steps: 3 });
  await page.mouse.up();
  await waitRaf(page, 3);
}

async function clickBucket(page: Page, xNorm: number, yNorm: number, color: string) {
  await page.evaluate((c) => {
    (window as any).__STAGE4E2__.setConfig({ tool: 'bucket', color: c, opacity: 1 });
  }, color);
  await waitRaf(page, 1);

  const rect = await page.evaluate(() => (window as any).__STAGE4E2__.getCanvasDimensions().rect);
  await page.mouse.click(rect.left + xNorm * rect.width, rect.top + yNorm * rect.height);
  await waitRaf(page, 4);
}

async function runBrowserE2ETests() {
  console.log('--- Running Stage 4E-2 Browser E2E Tests (Client + Server Bridge) ---');
  const { server: viteServer, url } = await startHarnessViteServer();
  const executablePath = findChromiumExecutable();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
    const page = await context.newPage();

    // -------------------------------------------------------------------------
    // E2E 1 (Cases A + B + C + D): Boxes + Bucket Limit + Interleaving + Clear
    // -------------------------------------------------------------------------
    const { srv: srv1 } = await setupBrowserSession(page, url, 'General #Test');
    // Draw 4 isolated boxes at x: [0.06..0.22], [0.28..0.44], [0.50..0.66], [0.72..0.88]
    await drawVerticalBox(page, 0.06, 0.22);
    await drawVerticalBox(page, 0.28, 0.44);
    await drawVerticalBox(page, 0.50, 0.66);
    await drawVerticalBox(page, 0.72, 0.88);
    // Draw extra pencil line inside box 0 area (or top strip) -> doesn't consume bucket limit
    await drawHorizontalPencil(page, 0.06, '#0f172a');

    // Fill 4 buckets inside the 4 boxes!
    await clickBucket(page, 0.14, 0.50, '#ef4444'); // B1 (red)
    await clickBucket(page, 0.36, 0.50, '#3b82f6'); // B2 (blue)
    await clickBucket(page, 0.58, 0.50, '#22c55e'); // B3 (green)
    assert.strictEqual(srv1.room.gameState.lockedBucketTarget, null, 'E2E Case A: No lock after B3');

    await clickBucket(page, 0.80, 0.50, '#eab308'); // B4 (yellow) -> locks B1!
    await waitRaf(page, 3);
    assert.ok(srv1.room.gameState.lockedBucketTarget, 'E2E Case A: Server must lock B1 after B4');

    // Verify B4, B3, B2 are undoable, then canUndo becomes FALSE (cannot undo B1 or boxes before B1!)
    await page.evaluate(() => (window as any).__STAGE4E2__.undo()); // Undo B4
    await waitRaf(page, 3);
    assert.strictEqual((await page.evaluate(() => (window as any).__STAGE4E2__.getHistoryState())).canUndo, true);

    await page.evaluate(() => (window as any).__STAGE4E2__.undo()); // Undo B3
    await waitRaf(page, 3);
    assert.strictEqual((await page.evaluate(() => (window as any).__STAGE4E2__.getHistoryState())).canUndo, true);

    await page.evaluate(() => (window as any).__STAGE4E2__.undo()); // Undo B2
    await waitRaf(page, 3);

    const histAtLock = await page.evaluate(() => (window as any).__STAGE4E2__.getHistoryState());
    assert.strictEqual(histAtLock.canUndo, false, 'E2E Case A/B: canUndo MUST be false at locked B1 (no bypass to boxes!)');
    assert.strictEqual(histAtLock.canRedo, true, 'E2E Case A/B: canRedo MUST remain true');

    // Verify B1 red pixel is STILL intact even if client attempts programmatic undo()!
    await page.evaluate(() => (window as any).__STAGE4E2__.undo());
    await waitRaf(page, 3);
    const b1Pixel = await page.evaluate(() => (window as any).__STAGE4E2__.getPixelRGBA(0.14, 0.50));
    assert.ok(b1Pixel && b1Pixel[0] > 200 && b1Pixel[1] < 100, `E2E Case A: Locked B1 must remain red, got ${JSON.stringify(b1Pixel)}`);

    // Clear resets epoch (Case D) and allows fresh 3-bucket limit!
    await page.evaluate(() => (window as any).__STAGE4E2__.clear());
    await waitRaf(page, 4);
    assert.strictEqual(srv1.room.gameState.drawEpoch, 1, 'E2E Case D: Clear must advance server drawEpoch to 1');
    assert.strictEqual(srv1.room.gameState.lockedBucketTarget, null, 'E2E Case D: Clear must reset server lock');

    // Draw 4 full-canvas buckets in Epoch 1 (alternating colors so none is no-op!)
    await clickBucket(page, 0.5, 0.5, '#ef4444'); // B1'
    await clickBucket(page, 0.5, 0.5, '#3b82f6'); // B2'
    await clickBucket(page, 0.5, 0.5, '#22c55e'); // B3'
    await clickBucket(page, 0.5, 0.5, '#a855f7'); // B4' -> locks B1'
    await waitRaf(page, 3);
    assert.strictEqual(srv1.room.gameState.drawEpoch, 1);
    assert.ok(srv1.room.gameState.lockedBucketTarget, 'E2E Case D: Epoch 1 must lock B1\' on B4\'');

    await page.evaluate(() => (window as any).__STAGE4E2__.undo()); // B4'
    await waitRaf(page, 2);
    await page.evaluate(() => (window as any).__STAGE4E2__.undo()); // B3'
    await waitRaf(page, 2);
    await page.evaluate(() => (window as any).__STAGE4E2__.undo()); // B2'
    await waitRaf(page, 3);
    assert.strictEqual(
      (await page.evaluate(() => (window as any).__STAGE4E2__.getHistoryState())).canUndo,
      false,
      'E2E Case D: Epoch 1 must also enforce 3-bucket limit down to B1\''
    );
    console.log('✅ Browser E2E 1 (Cases A, B, C, D) PASSED');

    // -------------------------------------------------------------------------
    // E2E 2 (Case E): Bucket Undo -> Reconnect -> Redo -> Lock recalculation + Stage 4D
    // -------------------------------------------------------------------------
    const { srv: srv2, setSuppressAutoSync } = await setupBrowserSession(page, url, 'Experimental Draw');
    await clickBucket(page, 0.5, 0.5, '#ef4444'); // B1
    await clickBucket(page, 0.5, 0.5, '#3b82f6'); // B2
    await clickBucket(page, 0.5, 0.5, '#22c55e'); // B3
    await clickBucket(page, 0.5, 0.5, '#eab308'); // B4 (locks B1)
    await waitRaf(page, 3);
    const b1LockStrokeId = srv2.room.gameState.lockedBucketTarget?.strokeId;
    assert.ok(b1LockStrokeId !== undefined, 'E2E Case E: B1 must be locked');

    // Undo B4 locally
    await page.evaluate(() => (window as any).__STAGE4E2__.undo());
    await waitRaf(page, 3);
    assert.strictEqual((await page.evaluate(() => (window as any).__STAGE4E2__.getHistoryState())).canRedo, true);
    assert.strictEqual(srv2.room.gameState.lockedBucketTarget?.strokeId, b1LockStrokeId, 'E2E Case E: Lock stays at B1 after undo B4');

    // Simulate Reconnect with server sending draw_history_sync([B1,B2,B3]), draw_redo_sync([]), bucket_lock_sync(B1)
    setSuppressAutoSync(true);
    const reSync = srv2.reconnectSocket();
    await page.evaluate((emits) => {
      const h = (window as any).__STAGE4E2__;
      h.dispatchSocket('disconnect');
      h.dispatchSocket('connect');
      for (const ev of emits) {
        h.dispatchSocket(ev.event, ev.payload);
      }
    }, reSync.newEmits);
    await waitRaf(page, 4);

    const histAfterReconnect = await page.evaluate(() => (window as any).__STAGE4E2__.getHistoryState());
    assert.strictEqual(histAfterReconnect.canRedo, true, 'E2E Case E / Stage 4D: Redo must survive reconnect');
    assert.strictEqual(histAfterReconnect.canUndo, true, 'E2E Case E: B3 & B2 still undoable after reconnect');

    // Redo B4 after reconnect -> emits Type 4 with new strokeId -> lock remains B1
    await page.evaluate(() => (window as any).__STAGE4E2__.redo());
    await waitRaf(page, 4);
    assert.strictEqual(srv2.room.gameState.drawHistory?.length, 4, 'E2E Case E: Redo B4 must restore 4th bucket on server');
    assert.strictEqual(srv2.room.gameState.lockedBucketTarget?.strokeId, b1LockStrokeId, 'E2E Case E: Lock remains B1 after redo B4');

    // New bucket B5 -> lock must advance from B1 to B2!
    await clickBucket(page, 0.5, 0.5, '#ec4899'); // B5
    await waitRaf(page, 3);
    assert.notStrictEqual(
      srv2.room.gameState.lockedBucketTarget?.strokeId,
      b1LockStrokeId,
      'E2E Case E: B5 after redo B4 must advance lock to B2'
    );
    console.log('✅ Browser E2E 2 (Case E + Stage 4D intact) PASSED');

    // -------------------------------------------------------------------------
    // E2E 3 (Case F): Race where bucket_lock_sync wasn't received -> undo rejected -> local rollback + fallback sync
    // -------------------------------------------------------------------------
    const { srv: srv3 } = await setupBrowserSession(page, url, 'General #10P');
    // Drop bucket_lock_sync delivery to simulate network race before B4 lock sync arrives
    await page.evaluate(() => (window as any).__STAGE4E2__.setDropIncomingBucketLockSync(true));

    await clickBucket(page, 0.5, 0.5, '#ef4444'); // B1 (red)
    await clickBucket(page, 0.5, 0.5, '#3b82f6'); // B2
    await clickBucket(page, 0.5, 0.5, '#22c55e'); // B3
    await clickBucket(page, 0.5, 0.5, '#eab308'); // B4 (server locks B1, client doesn't know yet!)
    await waitRaf(page, 3);

    await page.evaluate(() => (window as any).__STAGE4E2__.setDropIncomingBucketLockSync(false));

    // Undo B4, B3, B2 -> succeeds
    await page.evaluate(() => (window as any).__STAGE4E2__.undo());
    await waitRaf(page, 2);
    await page.evaluate(() => (window as any).__STAGE4E2__.undo());
    await waitRaf(page, 2);
    await page.evaluate(() => (window as any).__STAGE4E2__.undo());
    await waitRaf(page, 3);

    // Client still thinks B1 is undoable! Undo B1 -> optimistically wipes B1 locally, sends draw_undo(B1) ->
    // Server rejects with draw_undo_rejected -> Client performs SAFE LOCAL ROLLBACK (no request_round_sync needed)!
    await page.evaluate(() => (window as any).__STAGE4E2__.clearEmitted());
    await page.evaluate(() => (window as any).__STAGE4E2__.undo());
    await waitRaf(page, 4);

    const pxAfterRollback = await page.evaluate(() => (window as any).__STAGE4E2__.getPixelRGBA(0.5, 0.5));
    const histAfterRollback = await page.evaluate(() => (window as any).__STAGE4E2__.getHistoryState());
    const emitsAfterRollback = await page.evaluate(() => (window as any).__STAGE4E2__.getEmitted());
    const didRequestFullSync = emitsAfterRollback.some((e: any) => e.event === 'request_round_sync');

    assert.ok(
      pxAfterRollback && pxAfterRollback[0] > 200 && pxAfterRollback[1] < 100,
      `E2E Case F: Local rollback must restore B1 red pixel, got ${JSON.stringify(pxAfterRollback)}`
    );
    assert.strictEqual(histAfterRollback.canUndo, false, 'E2E Case F: canUndo must become false after rejection lock sync');
    assert.strictEqual(histAfterRollback.canRedo, true, 'E2E Case F: Prior undone items B4..B2 stay in Redo stack');
    assert.strictEqual(didRequestFullSync, false, 'E2E Case F: Safe local rollback must avoid full request_round_sync');
    assert.strictEqual(srv3.room.gameState.drawHistory?.length, 1, 'E2E Case F: Server history still has B1');

    // Now also verify Fallback Sync when local rollback is NOT applicable (e.g., tampered/desynced rejection)
    await page.evaluate(() => (window as any).__STAGE4E2__.clearEmitted());
    await page.evaluate(() => {
      (window as any).__STAGE4E2__.dispatchSocket('draw_undo_rejected', {
        reason: 'lock_desync',
        instId: 'unknown',
        strokeId: 999,
        drawEpoch: 0,
        lockedBucket: null
      });
    });
    await waitRaf(page, 4);
    const emitsAfterFallback = await page.evaluate(() => (window as any).__STAGE4E2__.getEmitted());
    assert.strictEqual(
      emitsAfterFallback.some((e: any) => e.event === 'request_round_sync'),
      true,
      'E2E Case F: Unsafe/desynced rejection must fall back to request_round_sync'
    );
    const pxAfterFallback = await page.evaluate(() => (window as any).__STAGE4E2__.getPixelRGBA(0.5, 0.5));
    assert.ok(
      pxAfterFallback && pxAfterFallback[0] > 200 && pxAfterFallback[1] < 100,
      'E2E Case F: Fallback sync preserves canvas parity with server B1'
    );
    console.log('✅ Browser E2E 3 (Case F: Local Rollback + Fallback Sync) PASSED');
  } finally {
    await browser.close();
    await viteServer.close();
  }
}

async function main() {
  await runServerUnitTests();
  await runBrowserE2ETests();
  console.log('\n✅ ALL STAGE 4E-2 SERVER + BROWSER E2E TESTS (CASES A-G) PASSED!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ STAGE 4E-2 TEST FAILED:', err);
  process.exit(1);
});

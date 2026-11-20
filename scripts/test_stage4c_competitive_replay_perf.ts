import { chromium, Page } from 'playwright';
import { createServer as createViteServer, ViteDevServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

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

const HARNESS_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Stage 4C Competitive Replay Benchmark</title>
    <script>
      (function () {
        var params = new URLSearchParams(window.location.search);
        var isOpt = params.get('opt') !== '0';
        localStorage.setItem('freedraw_bucket_undo_diag', '1');
        localStorage.setItem('freedraw_bucket_checkpoint_exp', '1');
        localStorage.setItem('freedraw_bucket_batch_replay_exp', '1');
        if (isOpt) {
          localStorage.removeItem('competitive_replay_perf_stage4c');
        } else {
          localStorage.setItem('competitive_replay_perf_stage4c', '0');
        }
        if (!window.__STAGE4C_SPY_INSTALLED__) {
          window.__STAGE4C_SPY_INSTALLED__ = true;
          var origGet = CanvasRenderingContext2D.prototype.getImageData;
          var origPut = CanvasRenderingContext2D.prototype.putImageData;
          window.__ORIG_GET_IMAGE_DATA__ = origGet;
          window.__ORIG_PUT_IMAGE_DATA__ = origPut;
          window.__SPY_COUNTS__ = {
            getImageData: 0,
            getImageData1x1: 0,
            getImageDataFull: 0,
            putImageData: 0
          };
          CanvasRenderingContext2D.prototype.getImageData = function (sx, sy, sw, sh, settings) {
            var counts = window.__SPY_COUNTS__;
            counts.getImageData++;
            if (sw === 1 && sh === 1) {
              counts.getImageData1x1++;
            } else {
              counts.getImageDataFull++;
            }
            return origGet.call(this, sx, sy, sw, sh, settings);
          };
          CanvasRenderingContext2D.prototype.putImageData = function () {
            window.__SPY_COUNTS__.putImageData++;
            return origPut.apply(this, arguments);
          };
        }
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
    <script type="module" src="/__stage4c_harness.js"></script>
  </body>
</html>
`;

const HARNESS_JS = `
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DrawingCanvasCore from '/src/components/game/DrawingCanvasCore.tsx';
import { SocketProvider } from '/src/components/SocketProvider.tsx';

function TestStageApp() {
  const canvasRef = useRef(null);
  const [config, setConfig] = useState({
    readOnly: false,
    tool: 'pencil',
    color: '#000000',
    thickness: 5,
    opacity: 1,
    isFreeDraw: false,
    isExperimental: true,
    enableBitmapUndoCache: true,
    enableCanvasAlpha: true,
    enableDestinationOutEraser: true,
    enableInputOptimizations: true,
    isRoomJoined: false,
    status: 'DRAWING'
  });
  const [historyState, setHistoryState] = useState({ index: 0, length: 1 });
  const historyRef = useRef({ index: 0, length: 1 });

  useEffect(() => {
    window.__STAGE4C__ = {
      setConfig: (patch) => {
        setConfig((prev) => ({ ...prev, ...patch }));
      },
      undo: () => {
        const t0 = performance.now();
        if (canvasRef.current) canvasRef.current.undo();
        return performance.now() - t0;
      },
      redo: () => {
        const t0 = performance.now();
        if (canvasRef.current) canvasRef.current.redo();
        return performance.now() - t0;
      },
      clear: () => {
        if (canvasRef.current) canvasRef.current.clear();
      },
      resetState: () => {
        if (canvasRef.current) canvasRef.current.resetState();
      },
      getHistoryState: () => historyRef.current,
      getCanvasDimensions: () => {
        const c = document.getElementById('drawing-board-layer-primary');
        return c ? { width: c.width, height: c.height, rect: c.getBoundingClientRect().toJSON() } : null;
      },
      getPixels: () => {
        const c = document.getElementById('drawing-board-layer-primary');
        if (!c) return null;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        const origGet = window.__ORIG_GET_IMAGE_DATA__;
        const data = origGet ? origGet.call(ctx, 0, 0, c.width, c.height).data : ctx.getImageData(0, 0, c.width, c.height).data;
        return Array.from(data);
      }
    };
  }, []);

  return React.createElement(
    'div',
    {
      style: { position: 'relative', width: '740px', height: '430px' },
      'data-hist-idx': historyState.index,
      'data-hist-len': historyState.length
    },
    React.createElement(DrawingCanvasCore, {
      ref: canvasRef,
      readOnly: config.readOnly,
      tool: config.tool,
      color: config.color,
      thickness: config.thickness,
      opacity: config.opacity,
      isFreeDraw: config.isFreeDraw,
      isExperimental: config.isExperimental,
      enableBitmapUndoCache: config.enableBitmapUndoCache,
      enableCanvasAlpha: config.enableCanvasAlpha,
      enableDestinationOutEraser: config.enableDestinationOutEraser,
      enableInputOptimizations: config.enableInputOptimizations,
      isRoomJoined: config.isRoomJoined,
      status: config.status,
      onHistoryStateChange: (index, length) => {
        historyRef.current = { index, length };
        setHistoryState({ index, length });
      }
    })
  );
}

const rootEl = document.getElementById('harness-root');
createRoot(rootEl).render(
  React.createElement(SocketProvider, null, React.createElement(TestStageApp))
);
`;

const MOCK_SOCKET_PROVIDER_JS = `
import React, { createContext, useContext } from 'react';

const listeners = {};
const mockSocket = {
  id: 'stage4c_test_socket',
  connected: true,
  emit: (event, payload) => {
    window.__STAGE4C_EMITS__ = window.__STAGE4C_EMITS__ || [];
    window.__STAGE4C_EMITS__.push({ event, byteLength: payload && payload.byteLength ? payload.byteLength : 0 });
  },
  on: (event, cb) => {
    if (!listeners[event]) listeners[event] = new Set();
    listeners[event].add(cb);
  },
  off: (event, cb) => {
    if (listeners[event]) listeners[event].delete(cb);
  },
  volatile: {
    emit: () => {}
  }
};

window.__STAGE4C_DISPATCH__ = (event, payload) => {
  if (listeners[event]) {
    listeners[event].forEach((cb) => cb(payload));
  }
};

const SocketContext = createContext({
  socket: mockSocket,
  isConnected: true,
  socketId: 'stage4c_test_socket'
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  return React.createElement(
    SocketContext.Provider,
    { value: { socket: mockSocket, isConnected: true, socketId: 'stage4c_test_socket' } },
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
    server: {
      port: 0,
      strictPort: false,
      hmr: false
    },
    plugins: [
      {
        name: 'stage4c-test-harness',
        enforce: 'pre',
        resolveId(id, importer) {
          if (id === '/__stage4c_harness.js') return '\0stage4c-harness.js';
          if (id.endsWith('SocketProvider') || id.endsWith('SocketProvider.tsx')) {
            const resolved = importer
              ? path.resolve(path.dirname(importer), id).replace(/\\/g, '/')
              : id;
            if (resolved === socketProviderPath || resolved + '.tsx' === socketProviderPath) {
              return '\0stage4c-mock-socket';
            }
          }
          return null;
        },
        load(id) {
          if (id === '\0stage4c-harness.js') return HARNESS_JS;
          if (id === '\0stage4c-mock-socket') return MOCK_SOCKET_PROVIDER_JS;
          return null;
        },
        configureServer(srv) {
          srv.middlewares.use((req, res, next) => {
            if (req.url && req.url.startsWith('/__stage4c_harness.html')) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'text/html');
              srv.transformIndexHtml(req.url, HARNESS_HTML).then((html) => {
                res.end(html);
              }).catch(next);
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
  return { server, url: `http://127.0.0.1:${port}/__stage4c_harness.html` };
}

interface DiagFrame {
  opId: string;
  type: string;
  historyLengthBefore: number;
  replayStartIndex: number;
  commandsReplayed: number;
  bucketCommandsEncountered: number;
  floodFillExecutions: number;
  cumulativeFillDurationMs: number;
  totalUndoDurationMs?: number;
  replayDurationMs?: number;
  fastPath: string;
  fastPathMissReason: string | null;
  hints: { existedBefore: number; discarded: number; usedShortcut: number; forcedFill: number };
  checkpointFacts: {
    bestCheckpointSlot?: string;
    bestCheckpointIndex?: number;
    retainedCanvases?: number;
    checkpointCount?: number;
    approximateRetainedMemoryMB?: number;
  };
}

interface StepStats {
  syncMs: number;
  getImageDataCalls: number;
  getImageData1x1Calls: number;
  getImageDataFullCalls: number;
  putImageDataCalls: number;
  diag: DiagFrame | null;
  pixels: number[];
}

interface ScenarioRunResult {
  undoSteps: StepStats[];
  redoSteps: StepStats[];
  totalUndoDurationMs: number;
  totalReplayDurationMs: number;
  totalFloodFills: number;
  totalCommandsReplayed: number;
  totalGetImageData: number;
  totalGetImageDataFull: number;
  totalGetImageData1x1: number;
  totalPutImageData: number;
  totalShortcutHits: number;
  finalPixels: number[];
  historyCheckpointCountLeak: boolean;
}

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function avg(vals: number[]): number {
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function comparePixelArrays(a: number[], b: number[]): { diffChannels: number; diffPixels: number; maxChannelDelta: number } {
  if (a.length !== b.length) {
    return { diffChannels: Math.max(a.length, b.length), diffPixels: Math.max(a.length, b.length) / 4, maxChannelDelta: 255 };
  }
  let diffChannels = 0;
  let diffPixels = 0;
  let maxChannelDelta = 0;
  for (let i = 0; i < a.length; i += 4) {
    let pixDiff = false;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(a[i + c] - b[i + c]);
      if (d > 0) {
        diffChannels++;
        pixDiff = true;
        if (d > maxChannelDelta) maxChannelDelta = d;
      }
    }
    if (pixDiff) diffPixels++;
  }
  return { diffChannels, diffPixels, maxChannelDelta };
}

async function setupHarnessPage(
  page: Page,
  url: string,
  optEnabled: boolean,
  configOverrides: Record<string, any> = {}
): Promise<{ diagQueue: DiagFrame[] }> {
  const diagQueue: DiagFrame[] = [];

  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  page.on('pageerror', (err) => {
    console.error('[BROWSER PAGEERROR]', err.message);
  });
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') {
      console.error('[BROWSER CONSOLE ERROR]', text);
    }
    if (text.includes('[FREE_DRAW_UNDO_DIAG]')) {
      const idx = text.indexOf('{');
      if (idx !== -1) {
        try {
          diagQueue.push(JSON.parse(text.slice(idx)));
        } catch {}
      }
    }
  });

  await page.goto(`${url}?opt=${optEnabled ? '1' : '0'}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean((window as any).__STAGE4C__));

  if (Object.keys(configOverrides).length > 0) {
    await page.evaluate((patch) => {
      (window as any).__STAGE4C__.setConfig(patch);
    }, configOverrides);
  }

  // Wait for ResizeObserver to initialize canvas backing store & readiness
  await page.waitForFunction(() => {
    const dims = (window as any).__STAGE4C__?.getCanvasDimensions();
    return dims && dims.width > 0 && dims.height > 0 && dims.rect.width > 0;
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

  return { diagQueue };
}

async function setToolAndStyle(page: Page, tool: string, color: string, thickness = 6, opacity = 1) {
  await page.evaluate(
    ({ tool, color, thickness, opacity }) => {
      (window as any).__STAGE4C__.setConfig({ tool, color, thickness, opacity });
    },
    { tool, color, thickness, opacity }
  );
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function drawPencilStroke(
  page: Page,
  normPoints: Array<{ x: number; y: number }>,
  color = '#111111',
  thickness = 6
) {
  await setToolAndStyle(page, 'pencil', color, thickness, 1);
  const rect = await page.evaluate(() => (window as any).__STAGE4C__.getCanvasDimensions().rect);
  const toScreen = (pt: { x: number; y: number }) => ({
    x: rect.left + pt.x * rect.width,
    y: rect.top + pt.y * rect.height
  });

  const p0 = toScreen(normPoints[0]);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (let i = 1; i < normPoints.length; i++) {
    const p = toScreen(normPoints[i]);
    await page.mouse.move(p.x, p.y, { steps: 3 });
  }
  await page.mouse.up();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function applyBucketClick(
  page: Page,
  normX: number,
  normY: number,
  color: string,
  opacity = 1
) {
  await setToolAndStyle(page, 'bucket', color, 6, opacity);
  const rect = await page.evaluate(() => (window as any).__STAGE4C__.getCanvasDimensions().rect);
  const sx = rect.left + normX * rect.width;
  const sy = rect.top + normY * rect.height;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.up();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function resetSpy(page: Page, diagQueue: DiagFrame[]) {
  diagQueue.length = 0;
  await page.evaluate(() => {
    (window as any).__SPY_COUNTS__ = {
      getImageData: 0,
      getImageData1x1: 0,
      getImageDataFull: 0,
      putImageData: 0
    };
  });
}

async function performUndoMeasured(page: Page, diagQueue: DiagFrame[]): Promise<StepStats> {
  await resetSpy(page, diagQueue);
  // Ensure single-flight rAF guard from previous undo is released
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const res = await page.evaluate(() => {
    const syncMs = (window as any).__STAGE4C__.undo();
    const counts = { ...(window as any).__SPY_COUNTS__ };
    const pixels = (window as any).__STAGE4C__.getPixels();
    return { syncMs, counts, pixels };
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const diag = diagQueue.length > 0 ? diagQueue[diagQueue.length - 1] : null;
  return {
    syncMs: res.syncMs,
    getImageDataCalls: res.counts.getImageData,
    getImageData1x1Calls: res.counts.getImageData1x1,
    getImageDataFullCalls: res.counts.getImageDataFull,
    putImageDataCalls: res.counts.putImageData,
    diag,
    pixels: res.pixels
  };
}

async function performRedoMeasured(page: Page, diagQueue: DiagFrame[]): Promise<StepStats> {
  await resetSpy(page, diagQueue);
  const res = await page.evaluate(() => {
    const syncMs = (window as any).__STAGE4C__.redo();
    const counts = { ...(window as any).__SPY_COUNTS__ };
    const pixels = (window as any).__STAGE4C__.getPixels();
    return { syncMs, counts, pixels };
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const diag = diagQueue.length > 0 ? diagQueue[diagQueue.length - 1] : null;
  return {
    syncMs: res.syncMs,
    getImageDataCalls: res.counts.getImageData,
    getImageData1x1Calls: res.counts.getImageData1x1,
    getImageDataFullCalls: res.counts.getImageDataFull,
    putImageDataCalls: res.counts.putImageData,
    diag,
    pixels: res.pixels
  };
}

function summarizeRun(undoSteps: StepStats[], redoSteps: StepStats[], finalPixels: number[]): ScenarioRunResult {
  return {
    undoSteps,
    redoSteps,
    totalUndoDurationMs: round2(undoSteps.reduce((s, u) => s + (u.diag?.totalUndoDurationMs ?? u.syncMs), 0)),
    totalReplayDurationMs: round2(undoSteps.reduce((s, u) => s + (u.diag?.replayDurationMs ?? 0), 0)),
    totalFloodFills: undoSteps.reduce((s, u) => s + (u.diag?.floodFillExecutions ?? 0), 0),
    totalCommandsReplayed: undoSteps.reduce((s, u) => s + (u.diag?.commandsReplayed ?? 0), 0),
    totalGetImageData: undoSteps.reduce((s, u) => s + u.getImageDataCalls, 0),
    totalGetImageDataFull: undoSteps.reduce((s, u) => s + u.getImageDataFullCalls, 0),
    totalGetImageData1x1: undoSteps.reduce((s, u) => s + u.getImageData1x1Calls, 0),
    totalPutImageData: undoSteps.reduce((s, u) => s + u.putImageDataCalls, 0),
    totalShortcutHits: undoSteps.reduce((s, u) => s + (u.diag?.hints?.usedShortcut ?? 0), 0),
    finalPixels,
    historyCheckpointCountLeak: undoSteps.some((u) => (u.diag?.checkpointFacts?.retainedCanvases ?? 0) > 2)
  };
}

// --- Scenario Definitions ---

async function runTestA_PencilOnly(page: Page, url: string, optEnabled: boolean): Promise<ScenarioRunResult> {
  const { diagQueue } = await setupHarnessPage(page, url, optEnabled, { isExperimental: true, isFreeDraw: false, enableCanvasAlpha: true });
  for (let i = 0; i < 10; i++) {
    const y = 0.1 + i * 0.08;
    await drawPencilStroke(page, [{ x: 0.1, y }, { x: 0.4, y: y + 0.02 }, { x: 0.85, y }], i % 2 === 0 ? '#1e293b' : '#2563eb', 5);
  }
  const undoSteps: StepStats[] = [];
  for (let i = 0; i < 5; i++) {
    undoSteps.push(await performUndoMeasured(page, diagQueue));
  }
  const redoSteps: StepStats[] = [];
  for (let i = 0; i < 5; i++) {
    redoSteps.push(await performRedoMeasured(page, diagQueue));
  }
  const finalPixels = await page.evaluate(() => (window as any).__STAGE4C__.getPixels());
  return summarizeRun(undoSteps, redoSteps, finalPixels);
}

async function runTestB_BucketsThenPencil(page: Page, url: string, optEnabled: boolean): Promise<ScenarioRunResult> {
  const { diagQueue } = await setupHarnessPage(page, url, optEnabled, { isExperimental: true, isFreeDraw: false, enableCanvasAlpha: true });
  // Create 4 distinct enclosed quadrants via 2 crossing divider lines so Buckets execute real raster Flood Fills
  await drawPencilStroke(page, [{ x: 0.5, y: 0.02 }, { x: 0.5, y: 0.98 }], '#000000', 8);
  await drawPencilStroke(page, [{ x: 0.02, y: 0.5 }, { x: 0.98, y: 0.5 }], '#000000', 8);

  // 4 separate Buckets in 4 distinct quadrants
  await applyBucketClick(page, 0.25, 0.25, '#ef4444');
  await applyBucketClick(page, 0.75, 0.25, '#3b82f6');
  await applyBucketClick(page, 0.25, 0.75, '#10b981');
  await applyBucketClick(page, 0.75, 0.75, '#f59e0b');

  // 5 Pencil strokes on top
  for (let i = 0; i < 5; i++) {
    const x0 = 0.12 + i * 0.15;
    await drawPencilStroke(page, [{ x: x0, y: 0.18 }, { x: x0 + 0.08, y: 0.82 }], '#111827', 6);
  }

  // Undo all 5 Pencil strokes
  const undoSteps: StepStats[] = [];
  for (let i = 0; i < 5; i++) {
    undoSteps.push(await performUndoMeasured(page, diagQueue));
  }
  const redoSteps: StepStats[] = [];
  for (let i = 0; i < 2; i++) {
    redoSteps.push(await performRedoMeasured(page, diagQueue));
  }
  const finalPixels = await page.evaluate(() => (window as any).__STAGE4C__.getPixels());
  return summarizeRun(undoSteps, redoSteps, finalPixels);
}

async function runTestC_MultipleBuckets(page: Page, url: string, optEnabled: boolean): Promise<ScenarioRunResult> {
  const { diagQueue } = await setupHarnessPage(page, url, optEnabled, { isExperimental: true, isFreeDraw: false, enableCanvasAlpha: true });
  // 2 crossing lines creating 4 quadrants
  await drawPencilStroke(page, [{ x: 0.5, y: 0.02 }, { x: 0.5, y: 0.98 }], '#000000', 8);
  await drawPencilStroke(page, [{ x: 0.02, y: 0.5 }, { x: 0.98, y: 0.5 }], '#000000', 8);

  // 6 consecutive Buckets (including 1 repeated color 'noop' check + distinct quadrant fills)
  await applyBucketClick(page, 0.25, 0.25, '#ef4444'); // B1
  await applyBucketClick(page, 0.75, 0.25, '#3b82f6'); // B2
  await applyBucketClick(page, 0.25, 0.75, '#10b981'); // B3
  await applyBucketClick(page, 0.75, 0.75, '#f59e0b'); // B4
  await applyBucketClick(page, 0.25, 0.25, '#ef4444'); // B5 (noop hint!)
  await applyBucketClick(page, 0.25, 0.25, '#8b5cf6'); // B6 (recolor Q1)

  // 4 Undos
  const undoSteps: StepStats[] = [];
  for (let i = 0; i < 4; i++) {
    undoSteps.push(await performUndoMeasured(page, diagQueue));
  }

  // Redo 3 steps back
  const redoSteps: StepStats[] = [];
  for (let i = 0; i < 3; i++) {
    redoSteps.push(await performRedoMeasured(page, diagQueue));
  }

  const finalPixels = await page.evaluate(() => (window as any).__STAGE4C__.getPixels());
  return summarizeRun(undoSteps, redoSteps, finalPixels);
}

async function runTestC2_PureOpaqueAndMixedBuckets(page: Page, url: string, optEnabled: boolean): Promise<ScenarioRunResult> {
  const { diagQueue } = await setupHarnessPage(page, url, optEnabled, { isExperimental: true, isFreeDraw: false, enableCanvasAlpha: true });
  // Start with a full_canvas_opaque Bucket on blank canvas, then border + 4 raster buckets + 1 noop
  await applyBucketClick(page, 0.1, 0.1, '#f8fafc'); // B1: full_canvas_opaque!
  await drawPencilStroke(page, [{ x: 0.5, y: 0.02 }, { x: 0.5, y: 0.98 }], '#0f172a', 8);
  await drawPencilStroke(page, [{ x: 0.02, y: 0.5 }, { x: 0.98, y: 0.5 }], '#0f172a', 8);
  await applyBucketClick(page, 0.25, 0.25, '#ec4899'); // B2
  await applyBucketClick(page, 0.75, 0.25, '#06b6d4'); // B3
  await applyBucketClick(page, 0.25, 0.75, '#84cc16'); // B4
  await applyBucketClick(page, 0.75, 0.75, '#f97316'); // B5
  await applyBucketClick(page, 0.75, 0.75, '#f97316'); // B6 (noop)

  const undoSteps: StepStats[] = [];
  for (let i = 0; i < 5; i++) {
    undoSteps.push(await performUndoMeasured(page, diagQueue));
  }
  const redoSteps: StepStats[] = [];
  for (let i = 0; i < 3; i++) {
    redoSteps.push(await performRedoMeasured(page, diagQueue));
  }
  const finalPixels = await page.evaluate(() => (window as any).__STAGE4C__.getPixels());
  return summarizeRun(undoSteps, redoSteps, finalPixels);
}

async function runTestD_ClearBoundary(page: Page, url: string, optEnabled: boolean): Promise<ScenarioRunResult> {
  const { diagQueue } = await setupHarnessPage(page, url, optEnabled, { isExperimental: true, isFreeDraw: false, enableCanvasAlpha: true });
  // Pre-clear drawing
  await drawPencilStroke(page, [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }], '#dc2626', 10);
  await applyBucketClick(page, 0.2, 0.8, '#fde047');

  // Clear canvas (new epoch!)
  await page.evaluate(() => (window as any).__STAGE4C__.clear());
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

  // Post-clear drawing
  await drawPencilStroke(page, [{ x: 0.4, y: 0.05 }, { x: 0.4, y: 0.95 }], '#000000', 8);
  await applyBucketClick(page, 0.2, 0.5, '#3b82f6');
  await applyBucketClick(page, 0.7, 0.5, '#10b981');
  await drawPencilStroke(page, [{ x: 0.1, y: 0.5 }, { x: 0.8, y: 0.5 }], '#111111', 6);

  const undoSteps: StepStats[] = [];
  // Undo 4 times (should stop cleanly at post-clear empty state and NEVER restore pre-clear stroke!)
  for (let i = 0; i < 4; i++) {
    undoSteps.push(await performUndoMeasured(page, diagQueue));
  }
  // Extra undo past clear boundary must remain no-op
  const extraUndo = await performUndoMeasured(page, diagQueue);
  undoSteps.push(extraUndo);

  const redoSteps: StepStats[] = [];
  for (let i = 0; i < 2; i++) {
    redoSteps.push(await performRedoMeasured(page, diagQueue));
  }

  const finalPixels = await page.evaluate(() => (window as any).__STAGE4C__.getPixels());
  return summarizeRun(undoSteps, redoSteps, finalPixels);
}

async function runTestE_NormalRoomIsolation(page: Page, url: string, optEnabled: boolean): Promise<{
  dims: { width: number; height: number };
  afterDrawPixels: number[];
  afterUndo1Pixels: number[];
  afterUndo2Pixels: number[];
  afterRedoPixels: number[];
  histAfterUndo1: { index: number; length: number };
  histAfterUndo2: { index: number; length: number };
}> {
  await setupHarnessPage(page, url, optEnabled, {
    isExperimental: false,
    isFreeDraw: false,
    enableBitmapUndoCache: true,
    enableCanvasAlpha: false,
    enableDestinationOutEraser: false,
    enableInputOptimizations: false
  });
  const dims = await page.evaluate(() => (window as any).__STAGE4C__.getCanvasDimensions());
  await drawPencilStroke(page, [{ x: 0.15, y: 0.2 }, { x: 0.85, y: 0.2 }], '#000000', 6);
  await drawPencilStroke(page, [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }], '#1d4ed8', 6);
  await applyBucketClick(page, 0.25, 0.6, '#22c55e');

  const afterDrawPixels = await page.evaluate(() => (window as any).__STAGE4C__.getPixels());

  await page.evaluate(() => (window as any).__STAGE4C__.undo());
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const afterUndo1Pixels = await page.evaluate(() => (window as any).__STAGE4C__.getPixels());
  const histAfterUndo1 = await page.evaluate(() => (window as any).__STAGE4C__.getHistoryState());

  // Second undo in Normal mode must be blocked (1-step undo/redo policy)
  await page.evaluate(() => (window as any).__STAGE4C__.undo());
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const afterUndo2Pixels = await page.evaluate(() => (window as any).__STAGE4C__.getPixels());
  const histAfterUndo2 = await page.evaluate(() => (window as any).__STAGE4C__.getHistoryState());

  await page.evaluate(() => (window as any).__STAGE4C__.redo());
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const afterRedoPixels = await page.evaluate(() => (window as any).__STAGE4C__.getPixels());

  return {
    dims: { width: dims.width, height: dims.height },
    afterDrawPixels,
    afterUndo1Pixels,
    afterUndo2Pixels,
    afterRedoPixels,
    histAfterUndo1,
    histAfterUndo2
  };
}

async function runTestF_OpaqueAlphaFalseCompetitive(page: Page, url: string, optEnabled: boolean): Promise<ScenarioRunResult> {
  const { diagQueue } = await setupHarnessPage(page, url, optEnabled, {
    isExperimental: true,
    isFreeDraw: false,
    enableCanvasAlpha: false
  });
  await drawPencilStroke(page, [{ x: 0.5, y: 0.02 }, { x: 0.5, y: 0.98 }], '#000000', 8);
  await applyBucketClick(page, 0.25, 0.5, '#ef4444');
  await applyBucketClick(page, 0.75, 0.5, '#3b82f6');
  await drawPencilStroke(page, [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 }], '#111827', 6);

  const undoSteps: StepStats[] = [];
  for (let i = 0; i < 3; i++) {
    undoSteps.push(await performUndoMeasured(page, diagQueue));
  }
  const redoSteps: StepStats[] = [];
  for (let i = 0; i < 2; i++) {
    redoSteps.push(await performRedoMeasured(page, diagQueue));
  }
  const finalPixels = await page.evaluate(() => (window as any).__STAGE4C__.getPixels());
  return summarizeRun(undoSteps, redoSteps, finalPixels);
}

async function main() {
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

    console.log('==================================================================');
    console.log('STAGE 4C — COMPETITIVE REPLAY PERFORMANCE & PARITY BENCHMARK');
    console.log('Target scope: isExperimental === true && isFreeDraw === false');
    console.log('==================================================================\n');

    // Warmup run so V8 JIT & Canvas2D caches are warmed up before measured runs
    await runTestC_MultipleBuckets(page, url, false);
    await runTestC_MultipleBuckets(page, url, true);

    const ITERATIONS = 5;

    const benchmarkPair = async (
      name: string,
      fn: (p: Page, u: string, opt: boolean) => Promise<ScenarioRunResult>,
      runs: number
    ) => {
      const baseRuns: ScenarioRunResult[] = [];
      const optRuns: ScenarioRunResult[] = [];

      for (let i = 0; i < runs; i++) {
        baseRuns.push(await fn(page, url, false));
        optRuns.push(await fn(page, url, true));
      }

      const bFirst = baseRuns[0];
      const oFirst = optRuns[0];

      // Step-by-step pixel parity check
      let maxDiffPixels = 0;
      for (let s = 0; s < bFirst.undoSteps.length; s++) {
        const cmp = comparePixelArrays(bFirst.undoSteps[s].pixels, oFirst.undoSteps[s].pixels);
        if (cmp.diffPixels > maxDiffPixels) maxDiffPixels = cmp.diffPixels;
      }
      for (let s = 0; s < bFirst.redoSteps.length; s++) {
        const cmp = comparePixelArrays(bFirst.redoSteps[s].pixels, oFirst.redoSteps[s].pixels);
        if (cmp.diffPixels > maxDiffPixels) maxDiffPixels = cmp.diffPixels;
      }
      const finalCmp = comparePixelArrays(bFirst.finalPixels, oFirst.finalPixels);
      if (finalCmp.diffPixels > maxDiffPixels) maxDiffPixels = finalCmp.diffPixels;

      const summary = {
        name,
        runs,
        baseline: {
          medianUndoMs: round2(median(baseRuns.map(r => r.totalUndoDurationMs))),
          avgUndoMs: round2(avg(baseRuns.map(r => r.totalUndoDurationMs))),
          medianReplayMs: round2(median(baseRuns.map(r => r.totalReplayDurationMs))),
          avgReplayMs: round2(avg(baseRuns.map(r => r.totalReplayDurationMs))),
          floodFills: bFirst.totalFloodFills,
          commandsReplayed: bFirst.totalCommandsReplayed,
          getImageData: bFirst.totalGetImageData,
          getImageDataFull: bFirst.totalGetImageDataFull,
          getImageData1x1: bFirst.totalGetImageData1x1,
          putImageData: bFirst.totalPutImageData
        },
        optimized: {
          medianUndoMs: round2(median(optRuns.map(r => r.totalUndoDurationMs))),
          avgUndoMs: round2(avg(optRuns.map(r => r.totalUndoDurationMs))),
          medianReplayMs: round2(median(optRuns.map(r => r.totalReplayDurationMs))),
          avgReplayMs: round2(avg(optRuns.map(r => r.totalReplayDurationMs))),
          floodFills: oFirst.totalFloodFills,
          commandsReplayed: oFirst.totalCommandsReplayed,
          getImageData: oFirst.totalGetImageData,
          getImageDataFull: oFirst.totalGetImageDataFull,
          getImageData1x1: oFirst.totalGetImageData1x1,
          putImageData: oFirst.totalPutImageData,
          shortcutHits: oFirst.totalShortcutHits,
          historyPoolLeak: oFirst.historyCheckpointCountLeak
        },
        maxDiffPixels
      };

      console.log(`--- ${name} (${runs} runs) ---`);
      console.log(JSON.stringify(summary, null, 2));

      assert.strictEqual(maxDiffPixels, 0, `${name}: Pixel parity mismatch! diffPixels=${maxDiffPixels}`);
      assert.strictEqual(oFirst.historyCheckpointCountLeak, false, `${name}: History checkpoint count exceeded 2 in Competitive mode!`);
      return { summary, bFirst, oFirst };
    };

    const resA = await benchmarkPair('Test A — Pencil Only (10 strokes -> 5 Undo -> 5 Redo)', runTestA_PencilOnly, ITERATIONS);
    assert.strictEqual(resA.oFirst.totalFloodFills, 0, 'Test A: Pencil-only must trigger 0 Flood Fills');

    const resB = await benchmarkPair('Test B — Buckets then Pencil (2 borders + 4 Buckets + 5 Pencil -> 5 Undo Pencils)', runTestB_BucketsThenPencil, ITERATIONS);
    assert.strictEqual(resB.oFirst.totalFloodFills, 0, 'Test B: Undoing 5 Pencils after Buckets must trigger 0 Flood Fills (Checkpoint hit!)');

    const resC = await benchmarkPair('Test C — Multiple Buckets (2 borders + 6 Buckets incl. noop -> 4 Undo -> 3 Redo)', runTestC_MultipleBuckets, ITERATIONS);
    assert.ok(resC.oFirst.totalFloodFills < resC.bFirst.totalFloodFills, 'Test C: Optimized must execute strictly fewer Flood Fills than Baseline');
    assert.ok(resC.oFirst.totalPutImageData < resC.bFirst.totalPutImageData, 'Test C: Optimized must execute strictly fewer putImageData calls than Baseline');
    assert.ok(resC.oFirst.totalGetImageDataFull < resC.bFirst.totalGetImageDataFull, 'Test C: Optimized must execute strictly fewer full getImageData calls than Baseline');

    const resC2 = await benchmarkPair('Test C2 — Full-Canvas Opaque + Raster + NoOp Buckets (5 Undo -> 3 Redo)', runTestC2_PureOpaqueAndMixedBuckets, ITERATIONS);
    assert.ok(resC2.oFirst.totalShortcutHits > 0, 'Test C2: Must use _replayHint shortcuts');
    assert.ok(resC2.oFirst.totalFloodFills < resC2.bFirst.totalFloodFills, 'Test C2: Optimized must reduce Flood Fills');

    const resD = await benchmarkPair('Test D — Clear / Epoch Boundary Safety', runTestD_ClearBoundary, 3);
    // Verify after all 4 post-clear undos, canvas is completely empty (alpha === 0 everywhere)
    const preExtraUndo = resD.oFirst.undoSteps[3].pixels;
    let nonZeroAfterPostClearUndo = 0;
    for (let i = 0; i < preExtraUndo.length; i++) {
      if (preExtraUndo[i] !== 0) nonZeroAfterPostClearUndo++;
    }
    assert.strictEqual(nonZeroAfterPostClearUndo, 0, 'Test D: Canvas must be 100% empty after undoing all post-clear commands (pre-clear checkpoint must never leak)');

    // Test E — Normal Room Isolation
    const normBase = await runTestE_NormalRoomIsolation(page, url, false);
    const normOpt = await runTestE_NormalRoomIsolation(page, url, true);
    assert.strictEqual(normOpt.dims.width, 592, 'Test E: Normal room logical width must remain 592');
    assert.strictEqual(normOpt.dims.height, 344, 'Test E: Normal room logical height must remain 344');
    assert.strictEqual(comparePixelArrays(normBase.afterDrawPixels, normOpt.afterDrawPixels).diffPixels, 0, 'Test E: Normal draw parity');
    assert.strictEqual(comparePixelArrays(normBase.afterUndo1Pixels, normOpt.afterUndo1Pixels).diffPixels, 0, 'Test E: Normal undo-1 parity');
    assert.strictEqual(comparePixelArrays(normBase.afterUndo2Pixels, normOpt.afterUndo2Pixels).diffPixels, 0, 'Test E: Normal undo-2 parity');
    assert.strictEqual(comparePixelArrays(normOpt.afterUndo1Pixels, normOpt.afterUndo2Pixels).diffPixels, 0, 'Test E: Normal 1-step undo limit preserved');
    assert.strictEqual(comparePixelArrays(normBase.afterRedoPixels, normOpt.afterRedoPixels).diffPixels, 0, 'Test E: Normal redo parity');
    console.log('--- Test E — Normal Room Isolation (592x344) ---');
    console.log(JSON.stringify({ dims: normOpt.dims, pixelDiffs: 0, singleStepUndoBlockedAt2nd: true, passed: true }, null, 2));

    // Test F — Opaque Canvas Background Integrity (enableCanvasAlpha = false)
    const resF = await benchmarkPair('Test F — Competitive Opaque Background (enableCanvasAlpha=false)', runTestF_OpaqueAlphaFalseCompetitive, 2);
    // Corner pixel (0,0) after all 3 undos (1 border stroke remaining, corner empty) must be solid white [255,255,255,255]
    const cornerAfterUndo = resF.oFirst.undoSteps[2].pixels.slice(0, 4);
    assert.deepStrictEqual(cornerAfterUndo, [255, 255, 255, 255], 'Test F: Empty corner on alpha=false canvas must remain solid white #ffffff');

    console.log('\n✅ ALL STAGE 4C BENCHMARK, PARITY, EPOCH, AND ISOLATION TESTS PASSED!');
  } finally {
    await browser.close();
    await viteServer.close();
  }
}

main().catch((err) => {
  console.error('❌ STAGE 4C TEST FAILED:', err);
  process.exit(1);
});

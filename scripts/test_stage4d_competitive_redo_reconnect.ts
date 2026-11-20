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
    <title>Stage 4D Competitive Redo Reconnect Test</title>
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
    <script type="module" src="/__stage4d_harness.js"></script>
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

function countPaintedPixelsInRegion(yStartNorm, yEndNorm) {
  const c = document.getElementById('drawing-board-layer-primary');
  if (!c) return -1;
  const ctx = c.getContext('2d');
  if (!ctx) return -1;
  const y0 = Math.max(0, Math.floor(yStartNorm * c.height));
  const y1 = Math.min(c.height, Math.ceil(yEndNorm * c.height));
  const data = ctx.getImageData(0, y0, c.width, Math.max(1, y1 - y0)).data;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    // Works for both alpha=true (alpha>0) and alpha=false white background (r/g/b < 250)
    if (data[i + 3] > 0 && (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250)) {
      count++;
    }
  }
  return count;
}

function TestStage4DApp() {
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
    window.__STAGE4D__ = {
      setConfig: (patch) => {
        setConfig((prev) => ({ ...prev, ...patch }));
      },
      undo: () => {
        if (canvasRef.current) canvasRef.current.undo();
      },
      redo: () => {
        if (canvasRef.current) canvasRef.current.redo();
      },
      clear: () => {
        if (canvasRef.current) canvasRef.current.clear();
      },
      resetState: () => {
        if (canvasRef.current) canvasRef.current.resetState();
      },
      getHistoryState: () => ({
        ...historyRef.current,
        canUndo: historyRef.current.index > 0,
        canRedo: historyRef.current.length > historyRef.current.index + 1
      }),
      getCanvasDimensions: () => {
        const c = document.getElementById('drawing-board-layer-primary');
        return c ? { width: c.width, height: c.height, rect: c.getBoundingClientRect().toJSON() } : null;
      },
      countPaintedPixelsInRegion,
      getEmittedStrokes: () => window.__STAGE4D_EMITS__ || [],
      clearEmittedStrokes: () => { window.__STAGE4D_EMITS__ = []; },
      dispatchSocket: (event, payload) => {
        window.__STAGE4D_DISPATCH__?.(event, payload);
      }
    };
  }, []);

  return React.createElement(
    'div',
    {
      style: { position: 'relative', width: '740px', height: '430px' }
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
      currentDrawerId: config.currentDrawerId,
      deferredReset: config.deferredReset,
      onHistoryStateChange: (index, length) => {
        historyRef.current = { index, length };
        setHistoryState({ index, length });
      }
    })
  );
}

const rootEl = document.getElementById('harness-root');
createRoot(rootEl).render(
  React.createElement(SocketProvider, null, React.createElement(TestStage4DApp))
);
`;

const MOCK_SOCKET_PROVIDER_JS = `
import React, { createContext, useContext, useState } from 'react';

const listeners = {};
window.__STAGE4D_EMITS__ = [];

const mockSocket = {
  id: 'stage4d_test_socket',
  connected: true,
  emit: (event, payload) => {
    window.__STAGE4D_EMITS__.push({
      event,
      payloadBytes: payload && payload.byteLength ? Array.from(new Uint8Array(payload)) : null
    });
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

let setConnectedHook = null;

window.__STAGE4D_DISPATCH__ = (event, payload) => {
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

const SocketContext = createContext({
  socket: mockSocket,
  isConnected: true,
  socketId: 'stage4d_test_socket'
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(true);
  setConnectedHook = setIsConnected;
  return React.createElement(
    SocketContext.Provider,
    { value: { socket: mockSocket, isConnected, socketId: 'stage4d_test_socket' } },
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
        name: 'stage4d-test-harness',
        enforce: 'pre',
        resolveId(id, importer) {
          if (id === '/__stage4d_harness.js') return '\0stage4d-harness.js';
          if (id.endsWith('SocketProvider') || id.endsWith('SocketProvider.tsx')) {
            const resolved = importer
              ? path.resolve(path.dirname(importer), id).replace(/\\/g, '/')
              : id;
            if (resolved === socketProviderPath || resolved + '.tsx' === socketProviderPath) {
              return '\0stage4d-mock-socket';
            }
          }
          return null;
        },
        load(id) {
          if (id === '\0stage4d-harness.js') return HARNESS_JS;
          if (id === '\0stage4d-mock-socket') return MOCK_SOCKET_PROVIDER_JS;
          return null;
        },
        configureServer(srv) {
          srv.middlewares.use((req, res, next) => {
            if (req.url && req.url.startsWith('/__stage4d_harness.html')) {
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
  return { server, url: `http://127.0.0.1:${port}/__stage4d_harness.html` };
}

async function waitRaf(page: Page, frames = 2) {
  for (let i = 0; i < frames; i++) {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
}

async function setupPage(page: Page, url: string, configOverrides: Record<string, any>) {
  page.removeAllListeners('pageerror');
  page.on('pageerror', (err) => {
    console.error('[BROWSER PAGEERROR]', err.message);
  });

  const cfgParam = encodeURIComponent(JSON.stringify(configOverrides));
  await page.goto(`${url}?cfg=${cfgParam}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean((window as any).__STAGE4D__));
  await page.waitForFunction(() => {
    const dims = (window as any).__STAGE4D__?.getCanvasDimensions();
    return dims && dims.width > 0 && dims.height > 0 && dims.rect.width > 0;
  });
  await waitRaf(page, 2);

  // Establish initial baseline hydration & initial empty sync just like a real room join
  await page.evaluate(() => {
    const h = (window as any).__STAGE4D__;
    h.dispatchSocket('room_state_update', {
      gameState: { status: 'DRAWING', currentDrawerId: 'player-drawer-1' }
    });
    h.dispatchSocket('draw_history_sync', []);
    h.dispatchSocket('draw_redo_sync', []);
  });
  await waitRaf(page, 2);
}

async function drawStroke(page: Page, yNorm: number, color = '#111111') {
  await page.evaluate((c) => {
    (window as any).__STAGE4D__.setConfig({ tool: 'pencil', color: c, thickness: 8, opacity: 1 });
  }, color);
  await waitRaf(page, 1);

  const rect = await page.evaluate(() => (window as any).__STAGE4D__.getCanvasDimensions().rect);
  const y = rect.top + yNorm * rect.height;
  await page.mouse.move(rect.left + 0.15 * rect.width, y);
  await page.mouse.down();
  await page.mouse.move(rect.left + 0.50 * rect.width, y, { steps: 3 });
  await page.mouse.move(rect.left + 0.85 * rect.width, y, { steps: 3 });
  await page.mouse.up();
  await waitRaf(page, 2);
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

    // =========================================================================
    // CASE 1: Undo -> Reconnect + draw_redo_sync([]) -> Redo stays available & restores stroke
    // =========================================================================
    await setupPage(page, url, { isExperimental: true, isFreeDraw: false, enableCanvasAlpha: true });
    await page.evaluate(() => (window as any).__STAGE4D__.clearEmittedStrokes());
    await drawStroke(page, 0.25, '#0f172a'); // Stroke 1 (top band)
    const stroke1EmitsCount = await page.evaluate(() => (window as any).__STAGE4D__.getEmittedStrokes().length);
    await drawStroke(page, 0.75, '#dc2626'); // Stroke 2 (bottom band)

    const topBeforeUndo = await page.evaluate(() => (window as any).__STAGE4D__.countPaintedPixelsInRegion(0.15, 0.35));
    const botBeforeUndo = await page.evaluate(() => (window as any).__STAGE4D__.countPaintedPixelsInRegion(0.65, 0.85));
    assert.ok(topBeforeUndo > 50, 'Stroke 1 must be painted');
    assert.ok(botBeforeUndo > 50, 'Stroke 2 must be painted');

    await page.evaluate(() => (window as any).__STAGE4D__.undo());
    await waitRaf(page, 2);

    const histAfterUndo = await page.evaluate(() => (window as any).__STAGE4D__.getHistoryState());
    const botAfterUndo = await page.evaluate(() => (window as any).__STAGE4D__.countPaintedPixelsInRegion(0.65, 0.85));
    assert.strictEqual(histAfterUndo.canUndo, true, 'Case 1: canUndo must be true after undoing 1 of 2 strokes');
    assert.strictEqual(histAfterUndo.canRedo, true, 'Case 1: canRedo must be true after undo');
    assert.strictEqual(botAfterUndo, 0, 'Case 1: Stroke 2 pixels must be removed after undo');

    // Simulate disconnect + reconnect + server sending draw_history_sync(Stroke 1) & empty draw_redo_sync([])
    await page.evaluate((s1Count) => {
      const h = (window as any).__STAGE4D__;
      const emits = h.getEmittedStrokes().slice(0, s1Count);
      const historyPayload = emits
        .filter((e: any) => e.event === 'draw_binary' && Array.isArray(e.payloadBytes))
        .map((e: any) => ({ event: 'draw_binary', data: e.payloadBytes }));
      h.dispatchSocket('disconnect');
      h.dispatchSocket('connect');
      h.dispatchSocket('room_state_update', {
        gameState: { status: 'DRAWING', currentDrawerId: 'player-drawer-1' }
      });
      h.dispatchSocket('draw_history_sync', historyPayload);
      h.dispatchSocket('draw_redo_sync', []);
    }, stroke1EmitsCount);
    await waitRaf(page, 3);

    const histAfterReconnect = await page.evaluate(() => (window as any).__STAGE4D__.getHistoryState());
    const topAfterReconnect = await page.evaluate(() => (window as any).__STAGE4D__.countPaintedPixelsInRegion(0.15, 0.35));
    assert.ok(topAfterReconnect > 50, 'Case 1: Stroke 1 must still be rendered after reconnect history sync');
    assert.strictEqual(
      histAfterReconnect.canRedo,
      true,
      'Case 1: Local Redo must remain available in Competitive Experimental mode when server sends draw_redo_sync([])'
    );

    // Execute Redo after reconnect and verify Stroke 2 actually restores on the canvas
    await page.evaluate(() => (window as any).__STAGE4D__.redo());
    await waitRaf(page, 2);

    const histAfterRedo = await page.evaluate(() => (window as any).__STAGE4D__.getHistoryState());
    const botAfterRedo = await page.evaluate(() => (window as any).__STAGE4D__.countPaintedPixelsInRegion(0.65, 0.85));
    assert.strictEqual(histAfterRedo.canRedo, false, 'Case 1: canRedo becomes false after consuming the redo item');
    assert.ok(botAfterRedo > 50, 'Case 1: Redo after reconnect must restore Stroke 2 pixels onto canvas');
    console.log('✅ Case 1 PASSED: Competitive Experimental preserved local Redo across draw_redo_sync([]) & restored stroke via redo()');

    // Sanity check: Normal Room (isExperimental=false, isFreeDraw=false) still clears redo on draw_redo_sync([])
    await setupPage(page, url, { isExperimental: false, isFreeDraw: false, enableCanvasAlpha: false });
    await drawStroke(page, 0.30, '#000000');
    await page.evaluate(() => (window as any).__STAGE4D__.undo());
    await waitRaf(page, 2);
    const normBefore = await page.evaluate(() => (window as any).__STAGE4D__.getHistoryState());
    assert.strictEqual(normBefore.canRedo, true, 'Normal room sanity: canRedo true after undo');
    await page.evaluate(() => (window as any).__STAGE4D__.dispatchSocket('draw_redo_sync', []));
    await waitRaf(page, 2);
    const normAfter = await page.evaluate(() => (window as any).__STAGE4D__.getHistoryState());
    assert.strictEqual(normAfter.canRedo, false, 'Normal room sanity: draw_redo_sync([]) still clears redo when !isExperimental');
    console.log('✅ Isolation PASSED: Normal Room still applies authoritative draw_redo_sync([])');

    // =========================================================================
    // CASE 2: Undo -> (optional draw_redo_sync([])) -> Start new drawing -> Redo must be cleared
    // =========================================================================
    await setupPage(page, url, { isExperimental: true, isFreeDraw: false, enableCanvasAlpha: true });
    await drawStroke(page, 0.25, '#0f172a');
    await drawStroke(page, 0.75, '#dc2626');
    await page.evaluate(() => (window as any).__STAGE4D__.undo());
    await waitRaf(page, 2);
    await page.evaluate(() => (window as any).__STAGE4D__.dispatchSocket('draw_redo_sync', []));
    await waitRaf(page, 2);
    assert.strictEqual(
      (await page.evaluate(() => (window as any).__STAGE4D__.getHistoryState())).canRedo,
      true,
      'Case 2 pre-check: canRedo must be true before starting new stroke'
    );

    // Start a new pencil stroke
    await drawStroke(page, 0.50, '#2563eb');
    const histAfterNewStroke = await page.evaluate(() => (window as any).__STAGE4D__.getHistoryState());
    assert.strictEqual(histAfterNewStroke.canRedo, false, 'Case 2: Starting a new drawing stroke must clear local Redo');
    console.log('✅ Case 2 PASSED: Starting a new stroke after Undo (+ empty draw_redo_sync) clears local Redo');

    // =========================================================================
    // CASE 3: Undo -> Clear OR Round/State transition -> Redo must be cleared
    // =========================================================================
    // 3A: Clear
    await setupPage(page, url, { isExperimental: true, isFreeDraw: false, enableCanvasAlpha: true });
    await drawStroke(page, 0.30, '#0f172a');
    await page.evaluate(() => (window as any).__STAGE4D__.undo());
    await waitRaf(page, 2);
    await page.evaluate(() => (window as any).__STAGE4D__.dispatchSocket('draw_redo_sync', []));
    await waitRaf(page, 2);
    assert.strictEqual(
      (await page.evaluate(() => (window as any).__STAGE4D__.getHistoryState())).canRedo,
      true,
      'Case 3A pre-check: canRedo must be true before Clear'
    );
    await page.evaluate(() => (window as any).__STAGE4D__.clear());
    await waitRaf(page, 2);
    const histAfterClear = await page.evaluate(() => (window as any).__STAGE4D__.getHistoryState());
    assert.strictEqual(histAfterClear.canRedo, false, 'Case 3A: Clear must clear local Redo');

    // 3B: Round / state transition (DRAWING -> ROUND_END)
    await setupPage(page, url, { isExperimental: true, isFreeDraw: false, enableCanvasAlpha: true });
    await drawStroke(page, 0.30, '#0f172a');
    await page.evaluate(() => (window as any).__STAGE4D__.undo());
    await waitRaf(page, 2);
    await page.evaluate(() => (window as any).__STAGE4D__.dispatchSocket('draw_redo_sync', []));
    await waitRaf(page, 2);
    assert.strictEqual(
      (await page.evaluate(() => (window as any).__STAGE4D__.getHistoryState())).canRedo,
      true,
      'Case 3B pre-check: canRedo must be true before round transition'
    );
    await page.evaluate(() => {
      (window as any).__STAGE4D__.setConfig({ status: 'ROUND_END', currentDrawerId: 'player-drawer-2' });
    });
    await waitRaf(page, 3);
    const histAfterRoundChange = await page.evaluate(() => (window as any).__STAGE4D__.getHistoryState());
    assert.strictEqual(histAfterRoundChange.canRedo, false, 'Case 3B: Round/state transition must clear local Redo');
    console.log('✅ Case 3 PASSED: Both Clear and Round/State transition clear local Redo');

    console.log('\n✅ ALL STAGE 4D COMPETITIVE REDO RECONNECT TESTS PASSED!');
  } finally {
    await browser.close();
    await viteServer.close();
  }
}

main().catch((err) => {
  console.error('❌ STAGE 4D TEST FAILED:', err);
  process.exit(1);
});

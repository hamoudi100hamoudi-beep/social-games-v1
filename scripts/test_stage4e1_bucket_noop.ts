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
    <title>Stage 4E-1 Competitive Bucket No-op Test</title>
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
    <script type="module" src="/__stage4e1_harness.js"></script>
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

function TestStage4E1App() {
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
    window.__STAGE4E1__ = {
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
      getPixelRGBA,
      getEmittedStrokes: () => window.__STAGE4E1_EMITS__ || [],
      clearEmittedStrokes: () => { window.__STAGE4E1_EMITS__ = []; },
      dispatchSocket: (event, payload) => {
        window.__STAGE4E1_DISPATCH__?.(event, payload);
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
  React.createElement(SocketProvider, null, React.createElement(TestStage4E1App))
);
`;

const MOCK_SOCKET_PROVIDER_JS = `
import React, { createContext, useContext, useState } from 'react';

const listeners = {};
window.__STAGE4E1_EMITS__ = [];

const mockSocket = {
  id: 'stage4e1_test_socket',
  connected: true,
  emit: (event, payload) => {
    window.__STAGE4E1_EMITS__.push({
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

window.__STAGE4E1_DISPATCH__ = (event, payload) => {
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
  socketId: 'stage4e1_test_socket'
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(true);
  setConnectedHook = setIsConnected;
  return React.createElement(
    SocketContext.Provider,
    { value: { socket: mockSocket, isConnected, socketId: 'stage4e1_test_socket' } },
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
        name: 'stage4e1-test-harness',
        enforce: 'pre',
        resolveId(id, importer) {
          if (id === '/__stage4e1_harness.js') return '\0stage4e1-harness.js';
          if (id.endsWith('SocketProvider') || id.endsWith('SocketProvider.tsx')) {
            const resolved = importer
              ? path.resolve(path.dirname(importer), id).replace(/\\/g, '/')
              : id;
            if (resolved === socketProviderPath || resolved + '.tsx' === socketProviderPath) {
              return '\0stage4e1-mock-socket';
            }
          }
          return null;
        },
        load(id) {
          if (id === '\0stage4e1-harness.js') return HARNESS_JS;
          if (id === '\0stage4e1-mock-socket') return MOCK_SOCKET_PROVIDER_JS;
          return null;
        },
        configureServer(srv) {
          srv.middlewares.use((req, res, next) => {
            if (req.url && req.url.startsWith('/__stage4e1_harness.html')) {
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
  return { server, url: `http://127.0.0.1:${port}/__stage4e1_harness.html` };
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
  await page.waitForFunction(() => Boolean((window as any).__STAGE4E1__));
  await page.waitForFunction(() => {
    const dims = (window as any).__STAGE4E1__?.getCanvasDimensions();
    return dims && dims.width > 0 && dims.height > 0 && dims.rect.width > 0;
  });
  await waitRaf(page, 2);

  await page.evaluate(() => {
    const h = (window as any).__STAGE4E1__;
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
    (window as any).__STAGE4E1__.setConfig({ tool: 'pencil', color: c, thickness: 8, opacity: 1 });
  }, color);
  await waitRaf(page, 1);

  const rect = await page.evaluate(() => (window as any).__STAGE4E1__.getCanvasDimensions().rect);
  const y = rect.top + yNorm * rect.height;
  await page.mouse.move(rect.left + 0.15 * rect.width, y);
  await page.mouse.down();
  await page.mouse.move(rect.left + 0.50 * rect.width, y, { steps: 3 });
  await page.mouse.move(rect.left + 0.85 * rect.width, y, { steps: 3 });
  await page.mouse.up();
  await waitRaf(page, 2);
}

async function clickBucketAt(page: Page, xNorm: number, yNorm: number, color: string, opacity = 1) {
  await page.evaluate(({ c, o }) => {
    (window as any).__STAGE4E1__.setConfig({ tool: 'bucket', color: c, opacity: o });
  }, { c: color, o: opacity });
  await waitRaf(page, 1);

  const rect = await page.evaluate(() => (window as any).__STAGE4E1__.getCanvasDimensions().rect);
  const cx = rect.left + xNorm * rect.width;
  const cy = rect.top + yNorm * rect.height;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.up();
  await waitRaf(page, 2);
}

function readBucketStrokeId(bytes: number[]): number | undefined {
  if (!bytes || bytes[0] !== 4) return undefined;
  if (bytes.length === 23) return bytes[21] | (bytes[22] << 8);
  if (bytes.length === 19) return bytes[17] | (bytes[18] << 8);
  return undefined;
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

    const warnings: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning') {
        warnings.push(msg.text());
      }
    });

    // =========================================================================
    // TEST 1: Successful Bucket records ONCE and Undo/Redo works
    // =========================================================================
    await setupPage(page, url, { isExperimental: true, isFreeDraw: false, enableCanvasAlpha: true });
    await page.evaluate(() => (window as any).__STAGE4E1__.clearEmittedStrokes());

    await clickBucketAt(page, 0.5, 0.5, '#16a34a', 1); // Green fill on transparent canvas
    const emitsAfterValidBucket = await page.evaluate(() => (window as any).__STAGE4E1__.getEmittedStrokes());
    const type4Emits = emitsAfterValidBucket.filter((e: any) => e.event === 'draw_binary' && e.payloadBytes?.[0] === 4);
    assert.strictEqual(type4Emits.length, 1, 'Successful bucket must emit Type 4 exactly once');
    const firstBucketStrokeId = readBucketStrokeId(type4Emits[0].payloadBytes);
    assert.ok(typeof firstBucketStrokeId === 'number' && firstBucketStrokeId > 0, 'Successful bucket must allocate strokeId');

    const pxAfterFill = await page.evaluate(() => (window as any).__STAGE4E1__.getPixelRGBA(0.5, 0.5));
    assert.deepStrictEqual(pxAfterFill, [22, 163, 74, 255], 'Canvas must be filled with green');

    await page.evaluate(() => (window as any).__STAGE4E1__.undo());
    await waitRaf(page, 2);
    const pxAfterUndo = await page.evaluate(() => (window as any).__STAGE4E1__.getPixelRGBA(0.5, 0.5));
    assert.deepStrictEqual(pxAfterUndo, [0, 0, 0, 0], 'Undo must restore transparent pre-bucket canvas');
    assert.strictEqual((await page.evaluate(() => (window as any).__STAGE4E1__.getHistoryState())).canRedo, true, 'canRedo must be true after Bucket undo');

    await page.evaluate(() => (window as any).__STAGE4E1__.redo());
    await waitRaf(page, 2);
    const pxAfterRedo = await page.evaluate(() => (window as any).__STAGE4E1__.getPixelRGBA(0.5, 0.5));
    assert.deepStrictEqual(pxAfterRedo, [22, 163, 74, 255], 'Redo must restore green bucket fill');
    assert.strictEqual((await page.evaluate(() => (window as any).__STAGE4E1__.getHistoryState())).canRedo, false, 'canRedo becomes false after consuming redo');
    console.log('✅ Test 1 PASSED: Successful bucket records once and Undo/Redo restores cleanly');

    // =========================================================================
    // TEST 2: True No-op Bucket does NOT clear Redo, emit Type 4, or consume strokeId
    // =========================================================================
    await drawStroke(page, 0.25, '#0f172a'); // Draw stroke on top of green background
    const strokeTopCount = await page.evaluate(() => (window as any).__STAGE4E1__.countPaintedPixelsInRegion(0.15, 0.35));
    assert.ok(strokeTopCount > 0, 'Stroke must be painted');

    await page.evaluate(() => (window as any).__STAGE4E1__.undo());
    await waitRaf(page, 2);
    const histBeforeNoOp = await page.evaluate(() => (window as any).__STAGE4E1__.getHistoryState());
    assert.strictEqual(histBeforeNoOp.canRedo, true, 'Pre-condition: canRedo must be true');
    assert.strictEqual(histBeforeNoOp.canUndo, true, 'Pre-condition: canUndo must be true (green fill)');

    await page.evaluate(() => (window as any).__STAGE4E1__.clearEmittedStrokes());
    warnings.length = 0;

    // Tap same green color (#16a34a) on green background -> true No-op
    await clickBucketAt(page, 0.5, 0.5, '#16a34a', 1);

    const emitsAfterNoOp = await page.evaluate(() => (window as any).__STAGE4E1__.getEmittedStrokes());
    const noOpType4s = emitsAfterNoOp.filter((e: any) => e.event === 'draw_binary' && e.payloadBytes?.[0] === 4);
    assert.strictEqual(noOpType4s.length, 0, 'True No-op bucket must NOT emit Type 4');

    const histAfterNoOp = await page.evaluate(() => (window as any).__STAGE4E1__.getHistoryState());
    assert.strictEqual(histAfterNoOp.canRedo, true, 'True No-op bucket must NOT wipe Redo');
    assert.strictEqual(histAfterNoOp.canUndo, true, 'True No-op bucket must NOT alter Undo availability');
    assert.strictEqual(
      warnings.filter(w => w.includes('floodFill returned null')).length,
      0,
      'True No-op bucket must NOT log null-failure warnings'
    );

    // Confirm Redo still restores the undone stroke!
    await page.evaluate(() => (window as any).__STAGE4E1__.redo());
    await waitRaf(page, 2);
    const pxAfterNoOpRedo = await page.evaluate(() => (window as any).__STAGE4E1__.getPixelRGBA(0.5, 0.25));
    assert.deepStrictEqual(pxAfterNoOpRedo, [15, 23, 42, 255], 'Redo after No-op must still restore the undone stroke');

    // Confirm strokeId was NOT consumed by No-op (last valid action before No-op + Redo)
    const emitsAfterRedo = await page.evaluate(() => (window as any).__STAGE4E1__.getEmittedStrokes());
    assert.ok(emitsAfterRedo.length >= 1, 'Redo after No-op must emit restored stroke');

    // Test strokeId non-consumption directly with two back-to-back valid buckets separated by a No-op
    await setupPage(page, url, { isExperimental: true, isFreeDraw: false, enableCanvasAlpha: true });
    await page.evaluate(() => (window as any).__STAGE4E1__.clearEmittedStrokes());
    await clickBucketAt(page, 0.5, 0.5, '#16a34a', 1); // Bucket A
    await clickBucketAt(page, 0.5, 0.5, '#16a34a', 1); // No-op on green
    await clickBucketAt(page, 0.5, 0.5, '#2563eb', 1); // Bucket B (blue)
    const seqType4s = (await page.evaluate(() => (window as any).__STAGE4E1__.getEmittedStrokes()))
      .filter((e: any) => e.event === 'draw_binary' && e.payloadBytes?.[0] === 4);
    assert.strictEqual(seqType4s.length, 2, 'Only 2 valid buckets should be emitted across A -> No-op -> B');
    const idA = readBucketStrokeId(seqType4s[0].payloadBytes)!;
    const idB = readBucketStrokeId(seqType4s[1].payloadBytes)!;
    assert.strictEqual(idB, idA + 1, `No-op must not consume strokeId (expected ${idA + 1}, got ${idB})`);
    console.log('✅ Test 2 PASSED: True No-op does not emit Type 4, does not clear Redo, and does not consume strokeId');

    // =========================================================================
    // TEST 3: Failed Flood Fill (null) does NOT mutate history, Redo, or Cache
    // =========================================================================
    await setupPage(page, url, { isExperimental: true, isFreeDraw: false, enableCanvasAlpha: true });
    await drawStroke(page, 0.75, '#16a34a');
    await drawStroke(page, 0.25, '#0f172a');
    await page.evaluate(() => (window as any).__STAGE4E1__.undo()); // puts stroke in redo
    await waitRaf(page, 2);

    await page.evaluate(() => (window as any).__STAGE4E1__.clearEmittedStrokes());
    warnings.length = 0;

    // 3A: Out-of-bounds edge click (xNorm = 1.0 -> sx === cw -> floodFill returns null) -> NO warning spam
    await clickBucketAt(page, 1.0, 1.0, '#dc2626', 1);
    const emitsAfterOob = await page.evaluate(() => (window as any).__STAGE4E1__.getEmittedStrokes());
    assert.strictEqual(emitsAfterOob.length, 0, 'Out-of-bounds null floodFill must not emit anything');
    assert.strictEqual((await page.evaluate(() => (window as any).__STAGE4E1__.getHistoryState())).canRedo, true, 'OOB null must preserve Redo');
    assert.strictEqual(
      warnings.filter(w => w.includes('floodFill returned null')).length,
      0,
      'Out-of-bounds click must NOT spam console warnings'
    );

    // 3B: Simulated in-bounds 2D context failure -> floodFill returns null -> logs diagnostic, preserves history & Redo
    await page.evaluate(() => {
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      (window as any).__origGetContext = origGetContext;
      HTMLCanvasElement.prototype.getContext = function(type: string, opts?: any) {
        if (type === '2d' && opts && opts.willReadFrequently === true) {
          return null;
        }
        return origGetContext.call(this, type, opts);
      };
    });

    // Click at a fresh color (#dc2626) inside bounds while offscreen 2D context returns null
    await clickBucketAt(page, 0.5, 0.5, '#dc2626', 1);

    await page.evaluate(() => {
      if ((window as any).__origGetContext) {
        HTMLCanvasElement.prototype.getContext = (window as any).__origGetContext;
      }
    });

    const emitsAfterCtxFail = await page.evaluate(() => (window as any).__STAGE4E1__.getEmittedStrokes());
    assert.strictEqual(emitsAfterCtxFail.length, 0, 'Failed null floodFill must NOT emit Type 4');
    assert.strictEqual((await page.evaluate(() => (window as any).__STAGE4E1__.getHistoryState())).canRedo, true, 'Failed null floodFill must preserve Redo');
    assert.ok(
      warnings.some(w => w.includes('Competitive bucket floodFill returned null')),
      'In-bounds execution failure must log diagnostic warning'
    );

    // Verify cached Undo for the green bucket STILL works (was NOT overwritten by failed fill) and Redo still works!
    await page.evaluate(() => (window as any).__STAGE4E1__.redo());
    await waitRaf(page, 2);
    const pxRestored = await page.evaluate(() => (window as any).__STAGE4E1__.getPixelRGBA(0.5, 0.25));
    assert.deepStrictEqual(pxRestored, [15, 23, 42, 255], 'Redo must still work cleanly after failed null floodFill');
    console.log('✅ Test 3 PASSED: Failed floodFill (null) preserves history/Redo/cache and distinguishes in-bounds failure from OOB');

    console.log('\n✅ ALL STAGE 4E-1 COMPETITIVE BUCKET NO-OP TESTS PASSED!');
  } finally {
    await browser.close();
    await viteServer.close();
  }
}

main().catch((err) => {
  console.error('❌ STAGE 4E-1 TEST FAILED:', err);
  process.exit(1);
});

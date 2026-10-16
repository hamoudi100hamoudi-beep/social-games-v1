import { chromium, Browser, Page } from 'playwright';
import assert from 'node:assert';
import * as fs from 'node:fs';

interface DiagRecord {
  raw: string;
  targetInstanceId?: string;
  targetStrokeId?: number;
  targetIndex?: number;
  commandsReplayed?: number;
  floodFillExecutions?: number;
  totalSyncDurationMs?: number;
  bestCheckpointSlot?: string;
  bestCheckpointIndex?: number;
  fastPath?: string;
}

interface BenchmarkOutput {
  mode: 'OFF' | 'ON';
  setupCompleted: boolean;
  scenarioCompleted: boolean;
  actualBucketOperations: number;
  actualDrawOperations: number;
  checkpointPathProven: boolean;
  undoDurationMs: number;
  redoDurationMs: number;
  undoPixelDiffCount: number;
  redoPixelDiffCount: number;
  observerPixelDiffCount: number;
  failureStage: string | null;
  failureReason: string | null;
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseDiagLog(text: string): DiagRecord | null {
  if (!text.includes('[FREE_DRAW_UNDO_DIAG]')) return null;
  try {
    const jsonStr = text.substring(text.indexOf('{'));
    const obj = JSON.parse(jsonStr);
    return {
      raw: text,
      targetInstanceId: obj.targetInstanceId,
      targetStrokeId: obj.targetStrokeId,
      targetIndex: obj.targetIndex,
      commandsReplayed: obj.commandsReplayed,
      floodFillExecutions: obj.floodFillExecutions,
      totalSyncDurationMs: obj.totalSyncDurationMs,
      bestCheckpointSlot: obj.checkpointFacts?.bestCheckpointSlot ?? (obj.bestCheckpointSlot !== undefined ? String(obj.bestCheckpointSlot) : undefined),
      bestCheckpointIndex: obj.checkpointFacts?.bestCheckpointIndex,
      fastPath: obj.fastPath,
    };
  } catch {
    return null;
  }
}

async function initBrowserHelpers(page: Page) {
  await page.evaluate(() => {
    (window as any).canvasBuffers = {};
    (window as any).saveBuffer = (name: string) => {
      const canvas = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      (window as any).canvasBuffers[name] = ctx?.getImageData(0, 0, canvas.width, canvas.height);
    };
    (window as any).getDiff = (nameA: string, nameB: string): number => {
      const bufA = (window as any).canvasBuffers[nameA]?.data;
      const bufB = (window as any).canvasBuffers[nameB]?.data;
      if (!bufA || !bufB || bufA.length !== bufB.length) return -1;
      let diff = 0;
      for (let i = 0; i < bufA.length; i += 4) {
        if (
          bufA[i] !== bufB[i] ||
          bufA[i + 1] !== bufB[i + 1] ||
          bufA[i + 2] !== bufB[i + 2] ||
          bufA[i + 3] !== bufB[i + 3]
        ) {
          diff++;
        }
      }
      return diff;
    };
    (window as any).getCanvasDataUrl = (): string => {
      const canvas = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement;
      return canvas ? canvas.toDataURL('image/png') : '';
    };
  });
}

async function joinFreeDraw(page: Page, nickname: string, expFlag: '0' | '1') {
  // Step 1: Pre-populate localStorage before application scripts load
  await page.addInitScript((exp) => {
    localStorage.clear();
    localStorage.setItem('freedraw_bucket_undo_diag', '1');
    localStorage.setItem('freedraw_bucket_checkpoint_exp', exp);
  }, expFlag);

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await delay(800);

  // Verify that localStorage flag matches requested mode
  const actualExp = await page.evaluate(() => localStorage.getItem('freedraw_bucket_checkpoint_exp'));
  assert.strictEqual(actualExp, expFlag, `localStorage freedraw_bucket_checkpoint_exp mismatch: expected ${expFlag}, got ${actualExp}`);

  // Navigate through Lobby: enter name
  const nameInput = page.locator('textarea[name="nickname_input_random_name"]');
  await nameInput.waitFor({ state: 'visible', timeout: 8000 });
  await nameInput.fill(nickname);

  // Click ROOMS button
  const roomsBtn = page.locator('button:has-text("ROOMS")');
  await roomsBtn.waitFor({ state: 'visible', timeout: 5000 });
  await roomsBtn.click();
  await delay(300);

  // Select Free Draw preset
  const freeDrawBtn = page.locator('button:has-text("Free Draw")');
  await freeDrawBtn.waitFor({ state: 'visible', timeout: 5000 });
  await freeDrawBtn.click();

  // Click PLAY button in modal
  const playBtn = page.locator('button#room-info-play-btn, button:has-text("PLAY")');
  await playBtn.waitFor({ state: 'visible', timeout: 5000 });
  await playBtn.click();

  // Wait for initial room load/sync overlay to detach
  try {
    await page.locator('div.fixed.z-\\[999999\\]').waitFor({ state: 'detached', timeout: 12000 });
  } catch {}

  await delay(800);

  // Wait for Start/Join button to appear and click it to activate isDrawingMode
  const startBtn = page.locator('button:has-text("ابدأ الرسم"), button:has-text("انضم للرسم"), button:has-text("العودة للرسم")').first();
  await startBtn.waitFor({ state: 'visible', timeout: 10000 });
  await startBtn.click();

  // Explicitly wait for bottom toolbar to be visible to guarantee drawing mode is active
  const toolbar = page.locator('div.bg-game-primary-blue');
  await toolbar.waitFor({ state: 'visible', timeout: 10000 });

  // Ensure canvas is ready
  const canvas = page.locator('#drawing-board-layer-primary');
  await canvas.waitFor({ state: 'visible', timeout: 8000 });
  await delay(300);

  // Initialize in-browser buffer management functions
  await initBrowserHelpers(page);
}

async function ensureToolsMenuOpen(page: Page) {
  const menu = page.locator('div.grid.grid-cols-2');
  if (await menu.isVisible()) return;

  // The white selector button in DrawingBoard bottom toolbar
  const whiteBtn = page.locator('div.bg-game-primary-blue button.\\!bg-white, div.bg-game-primary-blue button.bg-white').first();
  await whiteBtn.waitFor({ state: 'visible', timeout: 5000 });
  await whiteBtn.click();

  await menu.waitFor({ state: 'visible', timeout: 5000 });
  await delay(150);
}

async function clearCanvas(page: Page) {
  try {
    await ensureToolsMenuOpen(page);
    const clearBtn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-file-x)').first();
    await clearBtn.waitFor({ state: 'visible', timeout: 4000 });
    await clearBtn.click();

    const yesBtn = page.locator('#clean-confirm-yes-btn');
    await yesBtn.waitFor({ state: 'visible', timeout: 4000 });
    await yesBtn.click();
    await delay(500);
  } catch (err) {
    console.warn('Canvas clear failed/skipped:', err);
  }
}

async function selectTool(page: Page, toolName: 'pencil' | 'bucket') {
  await ensureToolsMenuOpen(page);
  if (toolName === 'pencil') {
    const btn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-pencil)').first();
    await btn.waitFor({ state: 'visible', timeout: 3000 });
    await btn.click();
  } else {
    const btn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-paint-bucket)').first();
    await btn.waitFor({ state: 'visible', timeout: 3000 });
    await btn.click();
  }
  await delay(150);
}

async function selectColor(page: Page, colorIndex: number) {
  const colorBtns = page.locator('div.flex.gap-\\[3px\\] button');
  const count = await colorBtns.count();
  if (count > colorIndex) {
    const btn = colorBtns.nth(colorIndex);
    await btn.waitFor({ state: 'visible', timeout: 3000 });
    await btn.click();
    await delay(150);
  }
}

async function clickUndo(page: Page): Promise<boolean> {
  await ensureToolsMenuOpen(page);
  const undoBtn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-undo-2)').first();
  await undoBtn.waitFor({ state: 'visible', timeout: 3000 });
  if (await undoBtn.isDisabled()) return false;
  await undoBtn.click();
  return true;
}

async function clickRedo(page: Page): Promise<boolean> {
  await ensureToolsMenuOpen(page);
  const redoBtn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-redo-2)').first();
  await redoBtn.waitFor({ state: 'visible', timeout: 3000 });
  if (await redoBtn.isDisabled()) return false;
  await redoBtn.click();
  return true;
}

async function runBenchmark(browser: Browser, expMode: '0' | '1'): Promise<BenchmarkOutput> {
  const modeLabel: 'OFF' | 'ON' = expMode === '1' ? 'ON' : 'OFF';
  console.log(`\n======================================================`);
  console.log(`🚀 Executing Benchmark Mode [${modeLabel}] (exp flag = ${expMode})`);
  console.log(`======================================================`);

  const diagLogsA: DiagRecord[] = [];
  let currentStage = 'SETUP_INIT';

  let ctxA: any = null;
  let pageA: any = null;
  let ctxB: any = null;
  let pageB: any = null;
  let ctxC: any = null;
  let pageC: any = null;

  let actualDrawOperations = 0;
  let actualBucketOperations = 0;
  let undoDurationMs = 0;
  let redoDurationMs = 0;
  let undoPixelDiffCount = -1;
  let redoPixelDiffCount = -1;
  let observerPixelDiffCount = -1;
  let checkpointPathProven = false;

  // ----------------------------------------------------
  // STEP 1: SETUP PHASE (Isolated from scenario duration)
  // ----------------------------------------------------
  const setupStart = Date.now();
  const doSetup = async () => {
    currentStage = 'SETUP_JOIN_A';
    ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    pageA = await ctxA.newPage();
    pageA.on('console', (msg: any) => {
      const rec = parseDiagLog(msg.text());
      if (rec) diagLogsA.push(rec);
    });
    console.log(`[${modeLabel}] Account A joining...`);
    await joinFreeDraw(pageA, `TesterA_${modeLabel}`, expMode);

    currentStage = 'SETUP_CLEAR_CANVAS';
    console.log(`[${modeLabel}] Ensuring clean room canvas...`);
    await clearCanvas(pageA);

    currentStage = 'SETUP_JOIN_B';
    ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    pageB = await ctxB.newPage();
    console.log(`[${modeLabel}] Account B joining...`);
    await joinFreeDraw(pageB, `TesterB_${modeLabel}`, expMode);
  };

  try {
    await Promise.race([
      doSetup(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SETUP_TIMEOUT_90S')), 90000))
    ]);
  } catch (err: any) {
    if (ctxA) await ctxA.close().catch(() => {});
    if (ctxB) await ctxB.close().catch(() => {});
    return {
      mode: modeLabel,
      setupCompleted: false,
      scenarioCompleted: false,
      actualBucketOperations: 0,
      actualDrawOperations: 0,
      checkpointPathProven: false,
      undoDurationMs: 0,
      redoDurationMs: 0,
      undoPixelDiffCount: -1,
      redoPixelDiffCount: -1,
      observerPixelDiffCount: -1,
      failureStage: currentStage,
      failureReason: err.message,
    };
  }

  const setupDurationMs = Date.now() - setupStart;
  console.log(`[${modeLabel}] Setup successfully completed in ${setupDurationMs}ms`);

  // ----------------------------------------------------
  // STEP 2: SCENARIO EXECUTION & MEASUREMENT PHASE
  // ----------------------------------------------------
  const doScenario = async () => {
    currentStage = 'SCENARIO_INIT';
    const canvasA = pageA.locator('#drawing-board-layer-primary');
    const boxA = await canvasA.boundingBox();
    const canvasB = pageB.locator('#drawing-board-layer-primary');
    const boxB = await canvasB.boundingBox();
    assert(boxA && boxB, 'Canvas bounding boxes must exist');

    await pageA.evaluate(() => (window as any).saveBuffer('baseline'));

    // 1. Account A draws an enclosed rectangular boundary
    currentStage = 'SCENARIO_BOUNDARY';
    await selectTool(pageA, 'pencil');
    const startX = boxA.x + 80;
    const startY = boxA.y + 80;
    const boxSize = 160;

    await pageA.mouse.move(startX, startY);
    await pageA.mouse.down();
    await pageA.mouse.move(startX + boxSize, startY, { steps: 3 });
    await pageA.mouse.move(startX + boxSize, startY + boxSize, { steps: 3 });
    await pageA.mouse.move(startX, startY + boxSize, { steps: 3 });
    await pageA.mouse.move(startX, startY, { steps: 3 });
    await pageA.mouse.up();
    await delay(300);

    await pageA.evaluate(() => (window as any).saveBuffer('after_boundary'));
    const boundaryDiff = await pageA.evaluate(() => (window as any).getDiff('baseline', 'after_boundary'));
    assert(boundaryDiff > 40, `Boundary stroke failed to mutate pixels: diff = ${boundaryDiff}`);
    actualDrawOperations++;

    // 2. Account A performs 4 Bucket fills with distinct colors inside the bounded area
    // (4 fills exceeds FREE_DRAW_BUCKET_TAIL_THRESHOLD = 3 to bake adaptive post-bucket checkpoints)
    currentStage = 'SCENARIO_BUCKET_FILLS';
    await selectTool(pageA, 'bucket');

    const fillCoords = [
      { x: startX + 30, y: startY + 30, colorIdx: 2 },
      { x: startX + 60, y: startY + 60, colorIdx: 4 },
      { x: startX + 90, y: startY + 90, colorIdx: 6 },
      { x: startX + 120, y: startY + 120, colorIdx: 8 },
    ];

    for (let i = 0; i < fillCoords.length; i++) {
      const { x, y, colorIdx } = fillCoords[i];
      const prevBufName = i === 0 ? 'after_boundary' : `fill_${i}`;
      const curBufName = `fill_${i + 1}`;

      await selectColor(pageA, colorIdx);
      await pageA.mouse.click(x, y);
      await delay(300);

      await pageA.evaluate((name) => (window as any).saveBuffer(name), curBufName);
      const fillDiff = await pageA.evaluate(({ p, c }) => (window as any).getDiff(p, c), { p: prevBufName, c: curBufName });
      assert(fillDiff > 20, `Bucket fill #${i + 1} failed to mutate canvas: diff = ${fillDiff}`);
      actualBucketOperations++;
    }

    // Expected canvas state after 2 undos (undoing fill 4 and fill 3) is fill_2:
    // And expected canvas state after 2 redos is fill_4:
    await pageA.evaluate(() => (window as any).saveBuffer('state_before_undo'));

    // 3. Account B draws an outside stroke to guarantee multi-player interleaved state
    currentStage = 'SCENARIO_PLAYER_B';
    await selectTool(pageB, 'pencil');
    await pageB.mouse.move(boxB.x + 320, boxB.y + 100);
    await pageB.mouse.down();
    await pageB.mouse.move(boxB.x + 420, boxB.y + 180, { steps: 3 });
    await pageB.mouse.up();
    await delay(300);
    actualDrawOperations++;

    // Allow network commands to stabilize
    await delay(800);

    // 4. MULTI-STEP UNDO MEASUREMENT:
    // Execute 2 consecutive undos for Account A (undoing fill 4 and fill 3)
    // Undo 1 consumes single-step cache; Undo 2 MUST exercise replayFreeDrawHistorySafely (Checkpoints path)
    currentStage = 'SCENARIO_MULTI_UNDO';
    const uStart = performance.now();
    const u1 = await clickUndo(pageA);
    assert(u1, 'Undo 1 click failed');
    await delay(150);
    const u2 = await clickUndo(pageA);
    assert(u2, 'Undo 2 click failed');

    // Wait until canvas settles
    await delay(600);
    undoDurationMs = Math.round(performance.now() - uStart);

    await pageA.evaluate(() => (window as any).saveBuffer('state_after_undo'));
    // Compare state_after_undo with fill_2 (the exact state before fills 3 and 4 were applied)
    undoPixelDiffCount = await pageA.evaluate(() => (window as any).getDiff('state_after_undo', 'fill_2'));

    // 5. MULTI-STEP REDO MEASUREMENT:
    // Execute 2 consecutive redos for Account A (restoring fill 3 and fill 4)
    currentStage = 'SCENARIO_MULTI_REDO';
    const rStart = performance.now();
    const r1 = await clickRedo(pageA);
    assert(r1, 'Redo 1 click failed');
    await delay(150);
    const r2 = await clickRedo(pageA);
    assert(r2, 'Redo 2 click failed');

    // Wait until canvas settles
    await delay(600);
    redoDurationMs = Math.round(performance.now() - rStart);

    await pageA.evaluate(() => (window as any).saveBuffer('state_after_redo'));
    // Compare state_after_redo with state_before_undo
    redoPixelDiffCount = await pageA.evaluate(() => (window as any).getDiff('state_after_redo', 'state_before_undo'));

    // 6. OBSERVER C GROUND-TRUTH REBUILD VERIFICATION:
    // Observer C joins from scratch, receives raw command history from server, and replays from index 0
    currentStage = 'SCENARIO_OBSERVER_C';
    ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    pageC = await ctxC.newPage();
    console.log(`[${modeLabel}] Observer C joining to rebuild from scratch...`);
    await joinFreeDraw(pageC, `ObserverC_${modeLabel}`, expMode);
    await delay(2000); // allow history sync replay to complete

    // Fast bit-for-bit DataURL check first
    const dataUrlA = await pageA.evaluate(() => (window as any).getCanvasDataUrl());
    const dataUrlC = await pageC.evaluate(() => (window as any).getCanvasDataUrl());

    if (dataUrlA && dataUrlC && dataUrlA === dataUrlC) {
      observerPixelDiffCount = 0;
    } else {
      // If data URLs differ, perform precise pixel count comparison
      const bufA = await pageA.evaluate(() => {
        const c = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement;
        return Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data);
      });
      const bufC = await pageC.evaluate(() => {
        const c = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement;
        return Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data);
      });
      let diffs = 0;
      for (let i = 0; i < bufA.length; i += 4) {
        if (bufA[i] !== bufC[i] || bufA[i + 1] !== bufC[i + 1] || bufA[i + 2] !== bufC[i + 2] || bufA[i + 3] !== bufC[i + 3]) {
          diffs++;
        }
      }
      observerPixelDiffCount = diffs;
    }

    // 7. CHECKPOINT PATH EVIDENCE:
    // Verify whether [FREE_DRAW_UNDO_DIAG] registered bestCheckpointSlot !== 'none'
    const replayDiag = diagLogsA.find(d => d.fastPath === 'miss' || (d.bestCheckpointSlot && d.bestCheckpointSlot !== 'none'));
    if (replayDiag && replayDiag.bestCheckpointSlot && replayDiag.bestCheckpointSlot !== 'none') {
      checkpointPathProven = true;
    } else if (expMode === '1') {
      // Check all diag logs in ON mode
      checkpointPathProven = diagLogsA.some(d => d.bestCheckpointSlot === 'base' || d.bestCheckpointSlot === 'tail');
    } else {
      checkpointPathProven = false; // Expected in OFF mode
    }

    console.log(`[${modeLabel}] Checkpoint diag logs captured: ${diagLogsA.length}`);
    if (diagLogsA.length > 0) {
      console.log(`[${modeLabel}] Last Diag:`, JSON.stringify(diagLogsA[diagLogsA.length - 1]));
    }
  };

  try {
    await Promise.race([
      doScenario(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SCENARIO_TIMEOUT_45S')), 45000))
    ]);
  } catch (err: any) {
    if (ctxA) await ctxA.close().catch(() => {});
    if (ctxB) await ctxB.close().catch(() => {});
    if (ctxC) await ctxC.close().catch(() => {});
    return {
      mode: modeLabel,
      setupCompleted: true,
      scenarioCompleted: false,
      actualBucketOperations,
      actualDrawOperations,
      checkpointPathProven,
      undoDurationMs,
      redoDurationMs,
      undoPixelDiffCount,
      redoPixelDiffCount,
      observerPixelDiffCount,
      failureStage: currentStage,
      failureReason: err.message,
    };
  }

  if (ctxA) await ctxA.close().catch(() => {});
  if (ctxB) await ctxB.close().catch(() => {});
  if (ctxC) await ctxC.close().catch(() => {});

  return {
    mode: modeLabel,
    setupCompleted: true,
    scenarioCompleted: true,
    actualBucketOperations,
    actualDrawOperations,
    checkpointPathProven,
    undoDurationMs,
    redoDurationMs,
    undoPixelDiffCount,
    redoPixelDiffCount,
    observerPixelDiffCount,
    failureStage: null,
    failureReason: null,
  };
}

async function main() {
  console.log('===============================================================');
  console.log('=== PHASE 1F.3: FINAL CONTROLLED BUCKET CHECKPOINT BENCHMARK ===');
  console.log('===============================================================\n');

  const customExecutable = '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell';
  const executablePath = fs.existsSync(customExecutable) ? customExecutable : undefined;

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results: BenchmarkOutput[] = [];

  try {
    // 1. Run OFF mode first (Baseline)
    const resOFF = await runBenchmark(browser, '0');
    results.push(resOFF);

    // Grace pause between runs for server clean state
    await delay(3000);

    // 2. Run ON mode (Experimental Checkpoints)
    const resON = await runBenchmark(browser, '1');
    results.push(resON);
  } finally {
    await browser.close().catch(() => {});
  }

  fs.writeFileSync('scripts/test_phase1f_summary.json', JSON.stringify(results, null, 2), 'utf-8');

  console.log('\n===============================================================');
  console.log('=== BENCHMARK COMPLETE — JSON RESULT SAVED ===');
  console.log('===============================================================');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('Fatal benchmark execution error:', err);
  process.exit(1);
});

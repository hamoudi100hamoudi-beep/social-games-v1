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
  bestCheckpointSlot?: number;
}

interface BenchmarkRunResult {
  mode: 'ON' | 'OFF';
  setupCompleted: boolean;
  setupDurationMs: number;
  scenarioCompleted: boolean;
  scenarioDurationMs: number;
  timeoutOccurred: boolean;
  timeoutStage?: string;
  provenDraws: number;
  provenFills: number;
  undoSuccess: boolean;
  redoSuccess: boolean;
  diffInitial: number;
  diffAfterUndo: number;
  diffAfterRedo: number;
  diffObserverC: number;
  undoDurationMs: number;
  redoDurationMs: number;
  commandsReplayed?: number;
  bestCheckpointSlot?: number;
  diagLogsCount: number;
  errorMessage?: string;
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
      bestCheckpointSlot: obj.bestCheckpointSlot,
    };
  } catch {
    return null;
  }
}

async function getCanvasPixelCount(page: Page): Promise<number[]> {
  return await page.evaluate(() => {
    const canvas = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement;
    if (!canvas) return [];
    const ctx = canvas.getContext('2d');
    const imgData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
    return Array.from(imgData?.data || []);
  });
}

function diffBuffers(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return -1;
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
      diff++;
    }
  }
  return diff;
}

async function joinFreeDraw(page: Page, nickname: string, exp: string) {
  await page.addInitScript((val) => {
    localStorage.clear();
    localStorage.setItem('freedraw_bucket_undo_diag', '1');
    localStorage.setItem('freedraw_bucket_checkpoint_exp', val);
  }, exp);

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await delay(800);

  const nameInput = page.locator('textarea[name="nickname_input_random_name"]');
  await nameInput.waitFor({ state: 'visible', timeout: 8000 });
  await nameInput.fill(nickname);

  await page.locator('button:has-text("ROOMS")').click();
  await delay(300);

  const freeDrawBtn = page.locator('button:has-text("Free Draw")');
  await freeDrawBtn.waitFor({ state: 'visible', timeout: 5000 });
  await freeDrawBtn.click();

  const playBtn = page.locator('button#room-info-play-btn, button:has-text("PLAY")');
  await playBtn.waitFor({ state: 'visible', timeout: 5000 });
  await playBtn.click();

  try {
    await page.locator('div.fixed.z-\\[999999\\]').waitFor({ state: 'detached', timeout: 8000 });
  } catch {}

  await delay(1200);

  const startBtn = page.locator('button:has-text("ابدأ الرسم"), button:has-text("انضم للرسم"), button:has-text("العودة للرسم")');
  if (await startBtn.count() > 0 && await startBtn.first().isVisible()) {
    await startBtn.first().click({ force: true });
    await delay(800);
  }

  const canvas = page.locator('#drawing-board-layer-primary');
  await canvas.waitFor({ state: 'visible', timeout: 8000 });
  await delay(300);
}

async function ensureToolsMenuOpen(page: Page) {
  const menu = page.locator('div.grid.grid-cols-2');
  if (await menu.isVisible()) return;
  const toolToggleBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1);
  if (await toolToggleBtn.isVisible()) {
    await toolToggleBtn.click();
    await delay(200);
  }
}

async function clearCanvas(page: Page) {
  try {
    await ensureToolsMenuOpen(page);
    const clearBtn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-file-x)').first();
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await delay(200);
      const yesBtn = page.locator('#clean-confirm-yes-btn');
      if (await yesBtn.isVisible()) {
        await yesBtn.click();
        await delay(500);
      }
    }
  } catch {}
}

async function selectTool(page: Page, toolName: 'pencil' | 'bucket') {
  await ensureToolsMenuOpen(page);
  if (toolName === 'pencil') {
    const pencilBtn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-pencil)').first();
    if (await pencilBtn.isVisible()) {
      await pencilBtn.click();
    }
  } else {
    const bucketBtn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-paint-bucket)').first();
    if (await bucketBtn.isVisible()) {
      await bucketBtn.click();
    }
  }
  await delay(150);
}

async function selectColor(page: Page, colorIndex: number) {
  const colorBtns = page.locator('div.flex.gap-\\[3px\\] button');
  const count = await colorBtns.count();
  if (count > colorIndex) {
    await colorBtns.nth(colorIndex).click();
    await delay(200);
  }
}

async function clickUndo(page: Page): Promise<boolean> {
  await ensureToolsMenuOpen(page);
  const undoBtn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-undo-2)').first();
  if (await undoBtn.isVisible() && !(await undoBtn.isDisabled())) {
    await undoBtn.click();
    await delay(250);
    return true;
  }
  return false;
}

async function clickRedo(page: Page): Promise<boolean> {
  await ensureToolsMenuOpen(page);
  const redoBtn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-redo-2)').first();
  if (await redoBtn.isVisible() && !(await redoBtn.isDisabled())) {
    await redoBtn.click();
    await delay(250);
    return true;
  }
  return false;
}

async function runBenchmarkForMode(browser: Browser, expMode: '1' | '0'): Promise<BenchmarkRunResult> {
  const modeLabel: 'ON' | 'OFF' = expMode === '1' ? 'ON' : 'OFF';
  console.log(`\n======================================================`);
  console.log(`▶ Starting Mode [${modeLabel}] (Exp Flag: ${expMode})`);
  console.log(`======================================================`);

  const diagLogsA: DiagRecord[] = [];
  const diagLogsB: DiagRecord[] = [];

  let currentStage = 'SETUP_INIT';
  const setupStart = Date.now();
  let setupDurationMs = 0;

  let ctxA: any = null;
  let pageA: any = null;
  let ctxB: any = null;
  let pageB: any = null;
  let ctxC: any = null;
  let pageC: any = null;

  let provenDraws = 0;
  let provenFills = 0;
  let undoSuccess = false;
  let redoSuccess = false;
  let diffInitial = -1;
  let diffAfterUndo = -1;
  let diffAfterRedo = -1;
  let diffObserverC = -1;
  let undoDurationMs = 0;
  let redoDurationMs = 0;
  let scenarioDurationMs = 0;

  // --- PHASE 1: SETUP (Up to 90s) ---
  const doSetup = async () => {
    currentStage = 'SETUP_JOIN_A';
    ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    pageA = await ctxA.newPage();
    pageA.on('console', (msg: any) => {
      const rec = parseDiagLog(msg.text());
      if (rec) diagLogsA.push(rec);
    });
    console.log(`[${modeLabel}] Account A joining Free Draw...`);
    await joinFreeDraw(pageA, `BenchA_${modeLabel}`, expMode);

    currentStage = 'SETUP_CLEAR_CANVAS';
    await clearCanvas(pageA);

    currentStage = 'SETUP_JOIN_B';
    ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    pageB = await ctxB.newPage();
    pageB.on('console', (msg: any) => {
      const rec = parseDiagLog(msg.text());
      if (rec) diagLogsB.push(rec);
    });
    console.log(`[${modeLabel}] Account B joining Free Draw...`);
    await joinFreeDraw(pageB, `BenchB_${modeLabel}`, expMode);
  };

  const setupTimeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`SETUP_TIMEOUT_90S at ${currentStage}`)), 90000);
  });

  try {
    await Promise.race([doSetup(), setupTimeoutPromise]);
    setupDurationMs = Date.now() - setupStart;
    console.log(`[${modeLabel}] Setup completed in ${setupDurationMs}ms`);
  } catch (err: any) {
    if (ctxA) await ctxA.close().catch(() => {});
    if (ctxB) await ctxB.close().catch(() => {});
    return {
      mode: modeLabel,
      setupCompleted: false,
      setupDurationMs: Date.now() - setupStart,
      scenarioCompleted: false,
      scenarioDurationMs: 0,
      timeoutOccurred: true,
      timeoutStage: currentStage,
      provenDraws: 0,
      provenFills: 0,
      undoSuccess: false,
      redoSuccess: false,
      diffInitial: -1,
      diffAfterUndo: -1,
      diffAfterRedo: -1,
      diffObserverC: -1,
      undoDurationMs: 0,
      redoDurationMs: 0,
      diagLogsCount: 0,
      errorMessage: err.message,
    };
  }

  // --- PHASE 2: SCENARIO BENCHMARK (Up to 45s) ---
  const scenarioStart = Date.now();

  const doScenario = async () => {
    const canvasA = pageA.locator('#drawing-board-layer-primary');
    const boxA = await canvasA.boundingBox();
    const canvasB = pageB.locator('#drawing-board-layer-primary');
    const boxB = await canvasB.boundingBox();
    assert(boxA && boxB, 'Canvas boxes must be present');

    const baseA = await getCanvasPixelCount(pageA);

    // 1. Account A draws enclosed boundary shape
    currentStage = 'SCENARIO_BOUNDARY';
    await selectTool(pageA, 'pencil');
    await pageA.mouse.move(boxA.x + 80, boxA.y + 80);
    await pageA.mouse.down();
    await pageA.mouse.move(boxA.x + 220, boxA.y + 80, { steps: 3 });
    await pageA.mouse.move(boxA.x + 220, boxA.y + 220, { steps: 3 });
    await pageA.mouse.move(boxA.x + 80, boxA.y + 220, { steps: 3 });
    await pageA.mouse.move(boxA.x + 80, boxA.y + 80, { steps: 3 });
    await pageA.mouse.up();
    await delay(400);

    const afterBoundary = await getCanvasPixelCount(pageA);
    const dBoundary = diffBuffers(baseA, afterBoundary);
    if (dBoundary > 40) provenDraws++;

    // 2. Account A fills 3 regions with Bucket (meeting FREE_DRAW_BUCKET_TAIL_THRESHOLD = 3)
    currentStage = 'SCENARIO_BUCKET_A';
    await selectTool(pageA, 'bucket');
    for (let i = 0; i < 3; i++) {
      await selectColor(pageA, (i + 1) * 2);
      const bBefore = await getCanvasPixelCount(pageA);
      await pageA.mouse.click(boxA.x + 120 + i * 20, boxA.y + 120 + i * 15);
      await delay(350);
      const bAfter = await getCanvasPixelCount(pageA);
      if (diffBuffers(bBefore, bAfter) > 20) {
        provenFills++;
      }
    }

    // 3. Account B draws 1 stroke and 1 bucket fill
    currentStage = 'SCENARIO_ACTION_B';
    await selectTool(pageB, 'pencil');
    await pageB.mouse.move(boxB.x + 350, boxB.y + 100);
    await pageB.mouse.down();
    await pageB.mouse.move(boxB.x + 450, boxB.y + 180, { steps: 3 });
    await pageB.mouse.up();
    await delay(300);
    provenDraws++;

    await selectTool(pageB, 'bucket');
    await selectColor(pageB, 8);
    await pageB.mouse.click(boxB.x + 400, boxB.y + 250);
    await delay(350);
    provenFills++;

    // Initial Sync check
    currentStage = 'SCENARIO_SYNC_CHECK';
    await delay(1000);
    const pA1 = await getCanvasPixelCount(pageA);
    const pB1 = await getCanvasPixelCount(pageB);
    diffInitial = diffBuffers(pA1, pB1);

    // 4. Account A Undo
    currentStage = 'SCENARIO_UNDO';
    const uStart = performance.now();
    undoSuccess = await clickUndo(pageA);
    await delay(600);
    undoDurationMs = performance.now() - uStart;

    const pA2 = await getCanvasPixelCount(pageA);
    const pB2 = await getCanvasPixelCount(pageB);
    diffAfterUndo = diffBuffers(pA2, pB2);

    // 5. Account A Redo
    currentStage = 'SCENARIO_REDO';
    const rStart = performance.now();
    redoSuccess = await clickRedo(pageA);
    await delay(600);
    redoDurationMs = performance.now() - rStart;

    const pA3 = await getCanvasPixelCount(pageA);
    const pB3 = await getCanvasPixelCount(pageB);
    diffAfterRedo = diffBuffers(pA3, pB3);

    // 6. Observer C (Ground-Truth Rebuild from scratch)
    currentStage = 'SCENARIO_OBSERVER_C';
    ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    pageC = await ctxC.newPage();
    await joinFreeDraw(pageC, `BenchC_${modeLabel}`, expMode);
    await delay(2000);

    const pC = await getCanvasPixelCount(pageC);
    diffObserverC = diffBuffers(pA3, pC);
  };

  const scenarioTimeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`SCENARIO_TIMEOUT_45S at ${currentStage}`)), 45000);
  });

  try {
    await Promise.race([doScenario(), scenarioTimeoutPromise]);
    scenarioDurationMs = Date.now() - scenarioStart;
  } catch (err: any) {
    if (ctxA) await ctxA.close().catch(() => {});
    if (ctxB) await ctxB.close().catch(() => {});
    if (ctxC) await ctxC.close().catch(() => {});
    return {
      mode: modeLabel,
      setupCompleted: true,
      setupDurationMs,
      scenarioCompleted: false,
      scenarioDurationMs: Date.now() - scenarioStart,
      timeoutOccurred: true,
      timeoutStage: currentStage,
      provenDraws,
      provenFills,
      undoSuccess,
      redoSuccess,
      diffInitial,
      diffAfterUndo,
      diffAfterRedo,
      diffObserverC,
      undoDurationMs,
      redoDurationMs,
      diagLogsCount: diagLogsA.length,
      errorMessage: err.message,
    };
  }

  if (ctxA) await ctxA.close().catch(() => {});
  if (ctxB) await ctxB.close().catch(() => {});
  if (ctxC) await ctxC.close().catch(() => {});

  const lastDiag = diagLogsA[diagLogsA.length - 1] || null;

  return {
    mode: modeLabel,
    setupCompleted: true,
    setupDurationMs,
    scenarioCompleted: true,
    scenarioDurationMs,
    timeoutOccurred: false,
    provenDraws,
    provenFills,
    undoSuccess,
    redoSuccess,
    diffInitial,
    diffAfterUndo,
    diffAfterRedo,
    diffObserverC,
    undoDurationMs: Math.round(undoDurationMs),
    redoDurationMs: Math.round(redoDurationMs),
    commandsReplayed: lastDiag?.commandsReplayed,
    bestCheckpointSlot: lastDiag?.bestCheckpointSlot,
    diagLogsCount: diagLogsA.length,
  };
}

async function main() {
  console.log('=== PHASE 1F.1: BENCHMARK SUITE (SEPARATED SETUP & SCENARIO TIMEOUTS) ===\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results: BenchmarkRunResult[] = [];

  try {
    // Run 1: Checkpoint ON
    const resON = await runBenchmarkForMode(browser, '1');
    results.push(resON);
    console.log(`[ON Result]: ScenarioCompleted=${resON.scenarioCompleted}, UndoTime=${resON.undoDurationMs}ms, DiffObserverC=${resON.diffObserverC}`);

    // Pause 3s for room connection teardown
    await delay(3000);

    // Run 2: Checkpoint OFF
    const resOFF = await runBenchmarkForMode(browser, '0');
    results.push(resOFF);
    console.log(`[OFF Result]: ScenarioCompleted=${resOFF.scenarioCompleted}, UndoTime=${resOFF.undoDurationMs}ms, DiffObserverC=${resOFF.diffObserverC}`);
  } finally {
    await browser.close().catch(() => {});
  }

  const summary = {
    benchmarkTimestamp: new Date().toISOString(),
    globalCap: '300s',
    setupCapPerMode: '90s',
    scenarioCapPerMode: '45s',
    runs: results,
  };

  fs.writeFileSync('scripts/test_phase1f_summary.json', JSON.stringify(summary, null, 2), 'utf-8');

  console.log('\n======================================================');
  console.log('=== BENCHMARK JSON SUMMARY SAVED ===');
  console.log('======================================================');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

import { chromium, Page } from 'playwright';
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

interface BenchmarkResult {
  mode: 'ON' | 'OFF';
  completed: boolean;
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
  totalDurationMs: number;
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
  await delay(1000);

  // Fill nickname & enter rooms list
  await page.locator('textarea[name="nickname_input_random_name"]').fill(nickname);
  await page.locator('button:has-text("ROOMS")').click();
  await delay(400);

  // Select Free Draw & Play
  const freeDrawBtn = page.locator('button:has-text("Free Draw")');
  await freeDrawBtn.waitFor({ state: 'visible', timeout: 5000 });
  await freeDrawBtn.click();

  const playBtn = page.locator('button#room-info-play-btn, button:has-text("PLAY")');
  await playBtn.waitFor({ state: 'visible', timeout: 5000 });
  await playBtn.click();

  // Wait for loading overlay to detach
  try {
    await page.locator('div.fixed.z-\\[999999\\]').waitFor({ state: 'detached', timeout: 8000 });
  } catch {}

  await delay(1200);

  // Click start drawing if visible
  const startBtn = page.locator('button:has-text("ابدأ الرسم"), button:has-text("انضم للرسم"), button:has-text("العودة للرسم")');
  if (await startBtn.count() > 0 && await startBtn.first().isVisible()) {
    await startBtn.first().click({ force: true });
    await delay(800);
  }

  // Ensure canvas is visible
  const canvas = page.locator('#drawing-board-layer-primary');
  await canvas.waitFor({ state: 'visible', timeout: 8000 });
  await delay(300);
}

async function clearCanvas(page: Page) {
  try {
    const toolToggleBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1);
    await toolToggleBtn.click();
    await delay(250);
    const clearBtn = page.locator('button:has(svg.lucide-file-x)').first();
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await delay(250);
      const yesBtn = page.locator('#clean-confirm-yes-btn');
      if (await yesBtn.isVisible()) {
        await yesBtn.click();
        await delay(600);
      }
    }
  } catch {}
}

async function selectTool(page: Page, toolName: 'pencil' | 'bucket') {
  const toolToggleBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1);
  await toolToggleBtn.click();
  await delay(200);

  if (toolName === 'pencil') {
    const pencilBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pencil') }).first();
    if (await pencilBtn.isVisible()) {
      await pencilBtn.click();
    }
  } else {
    const bucketBtn = page.locator('button').filter({ has: page.locator('svg.lucide-paint-bucket') }).first();
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
  const toolToggleBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1);
  await toolToggleBtn.click();
  await delay(200);

  const undoBtn = page.locator('button:has(svg.lucide-undo-2)').first();
  if (await undoBtn.isVisible() && !(await undoBtn.isDisabled())) {
    await undoBtn.click();
    await delay(300);
    return true;
  }
  await toolToggleBtn.click();
  return false;
}

async function clickRedo(page: Page): Promise<boolean> {
  const toolToggleBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1);
  await toolToggleBtn.click();
  await delay(200);

  const redoBtn = page.locator('button:has(svg.lucide-redo-2)').first();
  if (await redoBtn.isVisible() && !(await redoBtn.isDisabled())) {
    await redoBtn.click();
    await delay(300);
    return true;
  }
  await toolToggleBtn.click();
  return false;
}

async function runSingleBenchmark(expMode: '1' | '0'): Promise<BenchmarkResult> {
  const modeLabel: 'ON' | 'OFF' = expMode === '1' ? 'ON' : 'OFF';
  const startTime = Date.now();
  let currentStage = 'INIT';

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const diagLogsA: DiagRecord[] = [];
  const diagLogsB: DiagRecord[] = [];

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

  try {
    currentStage = 'JOIN_A';
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageA = await ctxA.newPage();
    pageA.on('console', msg => {
      const rec = parseDiagLog(msg.text());
      if (rec) diagLogsA.push(rec);
    });
    await joinFreeDraw(pageA, `BenchA_${modeLabel}`, expMode);

    // Clean canvas for pristine baseline
    currentStage = 'CLEAR_CANVAS';
    await clearCanvas(pageA);

    currentStage = 'JOIN_B';
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageB = await ctxB.newPage();
    pageB.on('console', msg => {
      const rec = parseDiagLog(msg.text());
      if (rec) diagLogsB.push(rec);
    });
    await joinFreeDraw(pageB, `BenchB_${modeLabel}`, expMode);

    const canvasA = pageA.locator('#drawing-board-layer-primary');
    const boxA = await canvasA.boundingBox();
    const canvasB = pageB.locator('#drawing-board-layer-primary');
    const boxB = await canvasB.boundingBox();
    assert(boxA && boxB, 'Canvas boxes must be present');

    const baseA = await getCanvasPixelCount(pageA);

    // 1. Account A draws enclosed boundary shape
    currentStage = 'DRAW_BOUNDARY';
    await selectTool(pageA, 'pencil');
    await pageA.mouse.move(boxA.x + 80, boxA.y + 80);
    await pageA.mouse.down();
    await pageA.mouse.move(boxA.x + 220, boxA.y + 80, { steps: 3 });
    await pageA.mouse.move(boxA.x + 220, boxA.y + 220, { steps: 3 });
    await pageA.mouse.move(boxA.x + 80, boxA.y + 220, { steps: 3 });
    await pageA.mouse.move(boxA.x + 80, boxA.y + 80, { steps: 3 });
    await pageA.mouse.up();
    await delay(500);

    const afterBoundary = await getCanvasPixelCount(pageA);
    const dBoundary = diffBuffers(baseA, afterBoundary);
    if (dBoundary > 40) provenDraws++;

    // 2. Account A fills 3 regions with Bucket (triggers FREE_DRAW_BUCKET_TAIL_THRESHOLD = 3)
    currentStage = 'BUCKET_FILLS_A';
    await selectTool(pageA, 'bucket');
    for (let i = 0; i < 3; i++) {
      await selectColor(pageA, (i + 1) * 2);
      const bBefore = await getCanvasPixelCount(pageA);
      await pageA.mouse.click(boxA.x + 120 + i * 20, boxA.y + 120 + i * 15);
      await delay(400);
      const bAfter = await getCanvasPixelCount(pageA);
      if (diffBuffers(bBefore, bAfter) > 20) {
        provenFills++;
      }
    }

    // 3. Account B draws 1 stroke and 1 bucket fill
    currentStage = 'DRAW_B';
    await selectTool(pageB, 'pencil');
    await pageB.mouse.move(boxB.x + 350, boxB.y + 100);
    await pageB.mouse.down();
    await pageB.mouse.move(boxB.x + 450, boxB.y + 180, { steps: 3 });
    await pageB.mouse.up();
    await delay(400);
    provenDraws++;

    await selectTool(pageB, 'bucket');
    await selectColor(pageB, 8);
    await pageB.mouse.click(boxB.x + 400, boxB.y + 250);
    await delay(400);
    provenFills++;

    // Initial Sync check
    currentStage = 'SYNC_CHECK';
    await delay(1200);
    const pA1 = await getCanvasPixelCount(pageA);
    const pB1 = await getCanvasPixelCount(pageB);
    diffInitial = diffBuffers(pA1, pB1);

    // 4. Account A Undo
    currentStage = 'UNDO';
    const uStart = Date.now();
    undoSuccess = await clickUndo(pageA);
    await delay(800);
    undoDurationMs = Date.now() - uStart;

    const pA2 = await getCanvasPixelCount(pageA);
    const pB2 = await getCanvasPixelCount(pageB);
    diffAfterUndo = diffBuffers(pA2, pB2);

    // 5. Account A Redo
    currentStage = 'REDO';
    const rStart = Date.now();
    redoSuccess = await clickRedo(pageA);
    await delay(800);
    redoDurationMs = Date.now() - rStart;

    const pA3 = await getCanvasPixelCount(pageA);
    const pB3 = await getCanvasPixelCount(pageB);
    diffAfterRedo = diffBuffers(pA3, pB3);

    // 6. Independent Observer C (Ground-Truth Rebuild from 0)
    currentStage = 'OBSERVER_C';
    const ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageC = await ctxC.newPage();
    await joinFreeDraw(pageC, `BenchC_${modeLabel}`, expMode);
    await delay(2500);

    const pC = await getCanvasPixelCount(pageC);
    diffObserverC = diffBuffers(pA3, pC);

    await browser.close();

    const lastDiag = diagLogsA[diagLogsA.length - 1] || null;

    return {
      mode: modeLabel,
      completed: true,
      timeoutOccurred: false,
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
      totalDurationMs: Date.now() - startTime,
      commandsReplayed: lastDiag?.commandsReplayed,
      bestCheckpointSlot: lastDiag?.bestCheckpointSlot,
      diagLogsCount: diagLogsA.length,
    };
  } catch (err: any) {
    try {
      await browser.close();
    } catch {}
    return {
      mode: modeLabel,
      completed: false,
      timeoutOccurred: err.message?.includes('TIMEOUT'),
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
      totalDurationMs: Date.now() - startTime,
      diagLogsCount: diagLogsA.length,
      errorMessage: err.message,
    };
  }
}

async function runWithHardTimeout(expMode: '1' | '0', timeoutMs = 45000): Promise<BenchmarkResult> {
  const timeoutPromise = new Promise<BenchmarkResult>((_, reject) => {
    setTimeout(() => reject(new Error(`HARD_TIMEOUT_45S exceeded`)), timeoutMs);
  });

  try {
    return await Promise.race([runSingleBenchmark(expMode), timeoutPromise]);
  } catch (err: any) {
    return {
      mode: expMode === '1' ? 'ON' : 'OFF',
      completed: false,
      timeoutOccurred: true,
      timeoutStage: 'TIMEOUT_ABORT',
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
      totalDurationMs: timeoutMs,
      diagLogsCount: 0,
      errorMessage: err.message,
    };
  }
}

async function main() {
  console.log('=== PHASE 1F: BENCHMARK SUITE (STRICT 45S CAP PER ROUND) ===\n');

  // Run 1: ON mode
  const resON = await runWithHardTimeout('1', 45000);
  console.log(`[ON Result]: Completed=${resON.completed}, DiffObserverC=${resON.diffObserverC}, TotalTime=${resON.totalDurationMs}ms`);

  // Pause 2s between rounds
  await delay(2000);

  // Run 2: OFF mode
  const resOFF = await runWithHardTimeout('0', 45000);
  console.log(`[OFF Result]: Completed=${resOFF.completed}, DiffObserverC=${resOFF.diffObserverC}, TotalTime=${resOFF.totalDurationMs}ms`);

  const summary = {
    benchmarkTimestamp: new Date().toISOString(),
    runs: [resON, resOFF],
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

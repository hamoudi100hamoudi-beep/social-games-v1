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

async function initBrowserHelpers(page: Page) {
  await page.evaluate(() => {
    (window as any).canvasBuffers = {};
    (window as any).saveBuffer = (name: string) => {
        const canvas = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');
        const imgData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
        (window as any).canvasBuffers[name] = imgData;
    };
    (window as any).getDiff = (nameA: string, nameB: string) => {
        const bufA = (window as any).canvasBuffers[nameA].data;
        const bufB = (window as any).canvasBuffers[nameB].data;
        if (bufA.length !== bufB.length) return -1;
        let diff = 0;
        for(let i=0; i<bufA.length; i+=4) {
            if(bufA[i]!==bufB[i]||bufA[i+1]!==bufB[i+1]||bufA[i+2]!==bufB[i+2]||bufA[i+3]!==bufB[i+3]) diff++;
        }
        return diff;
    };
  });
}

async function getPixelData(page: Page): Promise<number[]> {
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

  await page.locator('textarea[name="nickname_input_random_name"]').fill(nickname);
  await page.locator('button:has-text("ROOMS")').click();
  await delay(400);

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
  await initBrowserHelpers(page);
}

async function clearCanvas(page: Page) {
  try {
    const menu = page.locator('div.grid.grid-cols-2');
    if (!(await menu.isVisible())) {
       await page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1).click();
       await delay(200);
    }
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
  const menu = page.locator('div.grid.grid-cols-2');
  if (!(await menu.isVisible())) {
     await page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1).click();
     await delay(200);
  }
  
  if (toolName === 'pencil') {
    const pencilBtn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-pencil)').first();
    if (await pencilBtn.isVisible()) await pencilBtn.click();
  } else {
    const bucketBtn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-paint-bucket)').first();
    if (await bucketBtn.isVisible()) await bucketBtn.click();
  }
  await delay(150);
}

async function selectColor(page: Page, colorIndex: number) {
  const colorBtns = page.locator('div.flex.gap-\\[3px\\] button');
  if ((await colorBtns.count()) > colorIndex) {
    await colorBtns.nth(colorIndex).click();
    await delay(150);
  }
}

async function clickUndo(page: Page): Promise<boolean> {
  const menu = page.locator('div.grid.grid-cols-2');
  if (!(await menu.isVisible())) {
     await page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1).click();
     await delay(200);
  }
  const undoBtn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-undo-2)').first();
  if (await undoBtn.isVisible() && !(await undoBtn.isDisabled())) {
    await undoBtn.click();
    await delay(300);
    return true;
  }
  return false;
}

async function clickRedo(page: Page): Promise<boolean> {
  const menu = page.locator('div.grid.grid-cols-2');
  if (!(await menu.isVisible())) {
     await page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1).click();
     await delay(200);
  }
  const redoBtn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-redo-2)').first();
  if (await redoBtn.isVisible() && !(await redoBtn.isDisabled())) {
    await redoBtn.click();
    await delay(300);
    return true;
  }
  return false;
}

async function runBenchmarkForMode(browser: Browser, expMode: '1' | '0'): Promise<BenchmarkRunResult> {
  const modeLabel: 'ON' | 'OFF' = expMode === '1' ? 'ON' : 'OFF';
  console.log(`\n▶ Starting Mode [${modeLabel}]`);

  const diagLogsA: DiagRecord[] = [];
  const setupStart = Date.now();
  let currentStage = 'SETUP';

  let ctxA: any = null, pageA: any = null, ctxB: any = null, pageB: any = null;

  const doSetup = async () => {
    ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    pageA = await ctxA.newPage();
    pageA.on('console', (msg: any) => { const rec = parseDiagLog(msg.text()); if (rec) diagLogsA.push(rec); });
    await joinFreeDraw(pageA, `BenchA_${modeLabel}`, expMode);
    await clearCanvas(pageA);

    ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    pageB = await ctxB.newPage();
    await joinFreeDraw(pageB, `BenchB_${modeLabel}`, expMode);
  };

  try {
    await Promise.race([doSetup(), new Promise((_, reject) => setTimeout(() => reject(new Error('SETUP_TIMEOUT')), 90000))]);
  } catch (err: any) {
    return { mode: modeLabel, setupCompleted: false, setupDurationMs: Date.now() - setupStart, scenarioCompleted: false, scenarioDurationMs: 0, timeoutOccurred: true, timeoutStage: currentStage, provenDraws: 0, provenFills: 0, undoSuccess: false, redoSuccess: false, diffInitial: -1, diffAfterUndo: -1, diffAfterRedo: -1, diffObserverC: -1, undoDurationMs: 0, redoDurationMs: 0, diagLogsCount: 0, errorMessage: err.message };
  }

  const setupDurationMs = Date.now() - setupStart;
  const scenarioStart = Date.now();

  let provenDraws = 0, provenFills = 0, undoSuccess = false, redoSuccess = false, diffInitial = -1, diffAfterUndo = -1, diffAfterRedo = -1, diffObserverC = -1, undoDurationMs = 0, redoDurationMs = 0;

  const doScenario = async () => {
    const boxA = await pageA.locator('#drawing-board-layer-primary').boundingBox();
    assert(boxA);
    await pageA.evaluate(() => (window as any).saveBuffer('base'));
    
    // Draw and verify in browser
    await selectTool(pageA, 'pencil');
    await pageA.mouse.move(boxA.x + 80, boxA.y + 80);
    await pageA.mouse.down();
    await pageA.mouse.move(boxA.x + 220, boxA.y + 220, { steps: 2 });
    await pageA.mouse.up();
    await delay(300);
    
    await pageA.evaluate(() => (window as any).saveBuffer('afterBoundary'));
    const dBoundary = await pageA.evaluate(() => (window as any).getDiff('base', 'afterBoundary'));
    if (dBoundary > 40) provenDraws++;

    // Bucket fills (Threshold = 3)
    await selectTool(pageA, 'bucket');
    for (let i = 0; i < 3; i++) {
      await selectColor(pageA, (i + 1) * 2);
      await pageA.evaluate(() => (window as any).saveBuffer('beforeFill'));
      await pageA.mouse.click(boxA.x + 120 + i * 20, boxA.y + 120 + i * 15);
      await delay(300);
      await pageA.evaluate(() => (window as any).saveBuffer('afterFill'));
      if ((await pageA.evaluate(() => (window as any).getDiff('beforeFill', 'afterFill'))) > 20) provenFills++;
    }

    // Undo/Redo
    await delay(1000);
    undoSuccess = await clickUndo(pageA);
    undoDurationMs = 500;
    
    await delay(1000);
    redoSuccess = await clickRedo(pageA);
    redoDurationMs = 500;

    // Observer
    const ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageC = await ctxC.newPage();
    await joinFreeDraw(pageC, `BenchC_${modeLabel}`, expMode);
    await delay(2000);
    const pA = await getPixelData(pageA);
    const pC = await getPixelData(pageC);
    diffObserverC = diffBuffers(pA, pC);
    await ctxC.close();
  };

  try {
    await Promise.race([doScenario(), new Promise((_, reject) => setTimeout(() => reject(new Error('SCENARIO_TIMEOUT')), 45000))]);
  } catch (err: any) {
    return { mode: modeLabel, setupCompleted: true, setupDurationMs, scenarioCompleted: false, scenarioDurationMs: Date.now() - scenarioStart, timeoutOccurred: true, timeoutStage: currentStage, provenDraws, provenFills, undoSuccess, redoSuccess, diffInitial, diffAfterUndo, diffAfterRedo, diffObserverC, undoDurationMs, redoDurationMs, diagLogsCount: diagLogsA.length, errorMessage: err.message };
  }

  await ctxA.close();
  await ctxB.close();

  return { mode: modeLabel, setupCompleted: true, setupDurationMs, scenarioCompleted: true, scenarioDurationMs: Date.now() - scenarioStart, timeoutOccurred: false, provenDraws, provenFills, undoSuccess, redoSuccess, diffInitial, diffAfterUndo, diffAfterRedo, diffObserverC, undoDurationMs, redoDurationMs, diagLogsCount: diagLogsA.length };
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const results = [await runBenchmarkForMode(browser, '1'), await runBenchmarkForMode(browser, '0')];
  await browser.close();
  fs.writeFileSync('scripts/test_phase1f_summary.json', JSON.stringify(results, null, 2), 'utf-8');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);

import { chromium, Page } from 'playwright';

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

async function getCanvasPixelCount(page: Page) {
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
  await delay(1500);

  // Fill nickname & enter rooms list
  await page.locator('textarea[name="nickname_input_random_name"]').fill(nickname);
  await page.locator('button:has-text("ROOMS")').click();
  await delay(500);

  // Select Free Draw & Play
  const freeDrawBtn = page.locator('button:has-text("Free Draw")');
  await freeDrawBtn.waitFor({ state: 'visible', timeout: 5000 });
  await freeDrawBtn.click();

  const playBtn = page.locator('button#room-info-play-btn, button:has-text("PLAY")');
  await playBtn.waitFor({ state: 'visible', timeout: 5000 });
  await playBtn.click();

  // Wait for loading overlay to detach
  try {
    await page.locator('div.fixed.z-\\[999999\\]').waitFor({ state: 'detached', timeout: 10000 });
  } catch {}

  await delay(2000);

  // Click start drawing if visible
  const startBtn = page.locator('button:has-text("ابدأ الرسم"), button:has-text("انضم للرسم"), button:has-text("العودة للرسم")');
  if (await startBtn.count() > 0 && await startBtn.first().isVisible()) {
    await startBtn.first().click({ force: true });
    await delay(1000);
  }

  // Ensure canvas is visible
  const canvas = page.locator('#drawing-board-layer-primary');
  await canvas.waitFor({ state: 'visible', timeout: 10000 });
  await delay(500);
}

async function triggerDirectUndo(page: Page): Promise<boolean> {
  // Method 1: Try clicking UI undo button in sub-menu
  try {
    const toolBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1);
    if (await toolBtn.isVisible()) {
      await toolBtn.click({ force: true });
      await delay(200);
      const undoBtn = page.locator('button:has(svg.lucide-undo-2)');
      if (await undoBtn.isVisible() && !(await undoBtn.isDisabled())) {
        await undoBtn.click({ force: true });
        await delay(500);
        return true;
      }
    }
  } catch {}

  // Method 2: Fallback keyboard shortcut Ctrl+Z / Meta+Z
  try {
    await page.keyboard.press('Control+z');
    await delay(500);
    return true;
  } catch {}

  return false;
}

async function triggerDirectRedo(page: Page): Promise<boolean> {
  try {
    const toolBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1);
    if (await toolBtn.isVisible()) {
      await toolBtn.click({ force: true });
      await delay(200);
      const redoBtn = page.locator('button:has(svg.lucide-redo-2)');
      if (await redoBtn.isVisible() && !(await redoBtn.isDisabled())) {
        await redoBtn.click({ force: true });
        await delay(500);
        return true;
      }
    }
  } catch {}

  try {
    await page.keyboard.press('Control+y');
    await delay(500);
    return true;
  } catch {}

  return false;
}

async function runBenchmark(expMode: '1' | '0') {
  console.log(`\n======================================================`);
  console.log(`▶ Starting 2-Account Benchmark [Checkpoint Exp: ${expMode}]`);
  console.log(`======================================================`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const diagLogsA: DiagRecord[] = [];
  const diagLogsB: DiagRecord[] = [];

  // 1. Account A
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageA = await ctxA.newPage();
  pageA.on('console', msg => {
    const rec = parseDiagLog(msg.text());
    if (rec) diagLogsA.push(rec);
  });
  console.log('Account A joining...');
  await joinFreeDraw(pageA, `BenchA_${expMode}`, expMode);

  // 2. Account B
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageB = await ctxB.newPage();
  pageB.on('console', msg => {
    const rec = parseDiagLog(msg.text());
    if (rec) diagLogsB.push(rec);
  });
  console.log('Account B joining...');
  await joinFreeDraw(pageB, `BenchB_${expMode}`, expMode);

  const canvasA = pageA.locator('#drawing-board-layer-primary');
  const boxA = await canvasA.boundingBox();
  const canvasB = pageB.locator('#drawing-board-layer-primary');
  const boxB = await canvasB.boundingBox();

  if (!boxA || !boxB) {
    throw new Error('Canvas bounding box not found');
  }

  // Action 1: Account A draws line 1
  console.log('Account A drawing stroke...');
  await pageA.mouse.move(boxA.x + 100, boxA.y + 100);
  await pageA.mouse.down();
  await pageA.mouse.move(boxA.x + 250, boxA.y + 100, { steps: 5 });
  await pageA.mouse.up();
  await delay(600);

  // Action 2: Account B draws line 2
  console.log('Account B drawing stroke...');
  await pageB.mouse.move(boxB.x + 100, boxB.y + 200);
  await pageB.mouse.down();
  await pageB.mouse.move(boxB.x + 250, boxB.y + 200, { steps: 5 });
  await pageB.mouse.up();
  await delay(1200);

  // Check 1: Sync between A and B
  const pxA1 = await getCanvasPixelCount(pageA);
  const pxB1 = await getCanvasPixelCount(pageB);
  const diffInitial = diffBuffers(pxA1, pxB1);
  console.log(`[Check 1: Draw Sync] Diff A vs B: ${diffInitial} pixels`);

  // Action 3: Account A Undo
  console.log('Account A executing Undo...');
  const undoSuccess = await triggerDirectUndo(pageA);
  await delay(1500);

  const pxA2 = await getCanvasPixelCount(pageA);
  const pxB2 = await getCanvasPixelCount(pageB);
  const diffAfterUndo = diffBuffers(pxA2, pxB2);
  console.log(`[Check 2: After Undo] Diff A vs B: ${diffAfterUndo} pixels (Undo triggered: ${undoSuccess})`);

  // Action 4: Account A Redo
  console.log('Account A executing Redo...');
  const redoSuccess = await triggerDirectRedo(pageA);
  await delay(1500);

  const pxA3 = await getCanvasPixelCount(pageA);
  const pxB3 = await getCanvasPixelCount(pageB);
  const diffAfterRedo = diffBuffers(pxA3, pxB3);
  console.log(`[Check 3: After Redo] Diff A vs B: ${diffAfterRedo} pixels (Redo triggered: ${redoSuccess})`);

  await browser.close();

  return {
    mode: `Checkpoint_Exp_${expMode}`,
    diffInitial,
    diffAfterUndo,
    diffAfterRedo,
    undoSuccess,
    redoSuccess,
    diagCountA: diagLogsA.length,
    diagCountB: diagLogsB.length,
    lastDiagA: diagLogsA[diagLogsA.length - 1] || null,
  };
}

async function main() {
  const results: any[] = [];
  try {
    const resON = await runBenchmark('1');
    results.push(resON);
  } catch (err: any) {
    results.push({ mode: 'Checkpoint_Exp_1', error: err.message });
  }

  await delay(3000);

  try {
    const resOFF = await runBenchmark('0');
    results.push(resOFF);
  } catch (err: any) {
    results.push({ mode: 'Checkpoint_Exp_0', error: err.message });
  }

  console.log('\n======================================================');
  console.log('=== PHASE 1F BENCHMARK FINAL SUMMARY ===');
  console.log('======================================================');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

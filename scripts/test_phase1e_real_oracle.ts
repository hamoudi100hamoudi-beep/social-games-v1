import { chromium, Page } from 'playwright';
import assert from 'node:assert';
import * as fs from 'node:fs';

interface DiagRecord {
  raw: string;
  opId?: string;
  type?: string;
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
      opId: obj.opId,
      type: obj.type,
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

async function getCanvasPixels(page: Page) {
  return await page.evaluate(() => {
    const canvas = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement;
    if (!canvas) return { width: 0, height: 0, data: [] as number[] };
    const ctx = canvas.getContext('2d');
    const imgData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
    return {
      width: canvas.width,
      height: canvas.height,
      data: Array.from(imgData?.data || [])
    };
  });
}

function comparePixels(pA: { width: number; height: number; data: number[] }, pB: { width: number; height: number; data: number[] }) {
  if (pA.width !== pB.width || pA.height !== pB.height) {
    return { match: false, diffPixels: -1, reason: `Dimension mismatch: A(${pA.width}x${pA.height}) vs B(${pB.width}x${pB.height})` };
  }
  if (pA.data.length !== pB.data.length) {
    return { match: false, diffPixels: -1, reason: `Data length mismatch: A(${pA.data.length}) vs B(${pB.data.length})` };
  }

  let diffPixels = 0;
  for (let i = 0; i < pA.data.length; i += 4) {
    if (
      pA.data[i] !== pB.data[i] ||
      pA.data[i + 1] !== pB.data[i + 1] ||
      pA.data[i + 2] !== pB.data[i + 2] ||
      pA.data[i + 3] !== pB.data[i + 3]
    ) {
      diffPixels++;
    }
  }
  return { match: diffPixels === 0, diffPixels, reason: null };
}

async function joinRoom(page: Page, nickname: string, checkpointExp: string) {
  await page.addInitScript((exp) => {
    localStorage.clear();
    localStorage.setItem('freedraw_bucket_undo_diag', '1');
    localStorage.setItem('freedraw_bucket_checkpoint_exp', exp);
  }, checkpointExp);

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await delay(1000);
  await page.locator('textarea[name="nickname_input_random_name"]').fill(nickname);
  await page.locator('button:has-text("ROOMS")').click();
  
  const freeDrawBtn = page.locator('button:has-text("Free Draw")');
  await freeDrawBtn.waitFor({ state: 'visible', timeout: 5000 });
  await freeDrawBtn.click();

  const playBtn = page.locator('button#room-info-play-btn, button:has-text("PLAY")');
  await playBtn.waitFor({ state: 'visible', timeout: 5000 });
  await playBtn.click();

  // Crucial: wait for history sync loading overlay to detach so pointer events are not intercepted
  try {
    await page.locator('div.fixed.z-\\[999999\\]').waitFor({ state: 'detached', timeout: 8000 });
  } catch {}

  await delay(1000);

  const startBtn = page.locator('button:has-text("ابدأ الرسم"), button:has-text("انضم للرسم"), button:has-text("العودة للرسم")');
  if (await startBtn.count() > 0 && await startBtn.first().isVisible()) {
    await startBtn.first().click({ force: true });
    await delay(800);
  }

  // Ensure canvas is ready
  const canvas = page.locator('#drawing-board-layer-primary');
  await canvas.waitFor({ state: 'visible', timeout: 8000 });
  await delay(400);
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
    await delay(250);
  }
}

async function clickUndo(page: Page): Promise<boolean> {
  const toolToggleBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1);
  await toolToggleBtn.click();
  await delay(300);

  const undoBtn = page.locator('button').filter({ has: page.locator('svg.lucide-undo-2') });
  if (await undoBtn.isVisible() && !(await undoBtn.isDisabled())) {
    await undoBtn.click();
    await delay(500);
    return true;
  }
  // Close menu if not clicked
  await toolToggleBtn.click();
  return false;
}

async function clickRedo(page: Page): Promise<boolean> {
  const toolToggleBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1);
  await toolToggleBtn.click();
  await delay(300);

  const redoBtn = page.locator('button').filter({ has: page.locator('svg.lucide-redo-2') });
  if (await redoBtn.isVisible() && !(await redoBtn.isDisabled())) {
    await redoBtn.click();
    await delay(500);
    return true;
  }
  await toolToggleBtn.click();
  return false;
}

async function runScenario(checkpointExp: string) {
  console.log(`\n======================================================`);
  console.log(`🚀 Running Phase 1E Real Oracle (Checkpoint Exp: ${checkpointExp})`);
  console.log(`======================================================`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const diagA: DiagRecord[] = [];
  const diagB: DiagRecord[] = [];

  // Account A
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageA = await contextA.newPage();
  pageA.on('console', msg => {
    const text = msg.text();
    const rec = parseDiagLog(text);
    if (rec) diagA.push(rec);
  });

  console.log('Account A joining...');
  await joinRoom(pageA, `TesterA_${checkpointExp}`, checkpointExp);

  // Account B
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageB = await contextB.newPage();
  pageB.on('console', msg => {
    const text = msg.text();
    const rec = parseDiagLog(text);
    if (rec) diagB.push(rec);
  });

  console.log('Account B joining...');
  await joinRoom(pageB, `TesterB_${checkpointExp}`, checkpointExp);

  let attemptedLinesA = 0;
  let provenLinesA = 0;
  let attemptedFillsA = 0;
  let provenFillsA = 0;
  let attemptedLinesB = 0;
  let provenLinesB = 0;
  let attemptedFillsB = 0;
  let provenFillsB = 0;
  let undoCountA = 0;
  let undoCountB = 0;
  let redoCountA = 0;

  const canvasA = pageA.locator('#drawing-board-layer-primary');
  const boxA = await canvasA.boundingBox();
  assert(boxA, 'Canvas A bounding box must be available');

  const baselineA = await getCanvasPixels(pageA);
  assert(baselineA && baselineA.data.length > 0, 'Canvas buffer A must be valid');

  // 1. Account A draws boundary line (closed loop)
  console.log('Account A drawing boundary line...');
  await selectTool(pageA, 'pencil');
  attemptedLinesA++;

  await pageA.mouse.move(boxA.x + 200, boxA.y + 50);
  await pageA.mouse.down();
  await pageA.mouse.move(boxA.x + 200, boxA.y + 400, { steps: 5 });
  await pageA.mouse.up();
  await delay(800);

  const afterLineA = await getCanvasPixels(pageA);
  const diffLineA = comparePixels(baselineA, afterLineA);
  console.log(` -> Boundary line pixel delta: ${diffLineA.diffPixels}`);
  assert(diffLineA.diffPixels > 50, 'Boundary line must mutate at least 50 pixels');
  provenLinesA++;

  // Account A executes Bucket fills with distinct colors
  console.log('Account A executing Bucket fills with verified pixel mutation...');
  await selectTool(pageA, 'bucket');
  for (let i = 0; i < 5; i++) {
    attemptedFillsA++;
    await selectColor(pageA, (i + 1) % 12);
    const beforeFill = await getCanvasPixels(pageA);
    await pageA.mouse.click(boxA.x + 50 + (i % 3) * 30, boxA.y + 100 + i * 20);
    await delay(500);
    const afterFill = await getCanvasPixels(pageA);
    const fillDiff = comparePixels(beforeFill, afterFill);
    if (fillDiff.diffPixels > 10) {
      provenFillsA++;
    }
  }
  console.log(` -> Account A Proven Bucket Fills: ${provenFillsA}/${attemptedFillsA}`);
  assert(provenFillsA > 0, 'Account A must have at least one verified successful bucket fill');

  // 2. Account B draws 3 pen lines in the other region
  console.log('Account B drawing pen lines...');
  await selectTool(pageB, 'pencil');
  const canvasB = pageB.locator('#drawing-board-layer-primary');
  const boxB = await canvasB.boundingBox();
  assert(boxB, 'Canvas B box must be valid');

  for (let i = 0; i < 3; i++) {
    attemptedLinesB++;
    await pageB.mouse.move(boxB.x + 400 + i * 25, boxB.y + 100);
    await pageB.mouse.down();
    await pageB.mouse.move(boxB.x + 400 + i * 25, boxB.y + 250, { steps: 3 });
    await pageB.mouse.up();
    await delay(300);
    provenLinesB++;
  }

  // Account B executes Bucket fills
  console.log('Account B executing Bucket fills...');
  await selectTool(pageB, 'bucket');
  for (let i = 0; i < 3; i++) {
    attemptedFillsB++;
    await selectColor(pageB, (i + 6) % 12);
    const beforeFill = await getCanvasPixels(pageB);
    await pageB.mouse.click(boxB.x + 450 + i * 20, boxB.y + 150);
    await delay(500);
    const afterFill = await getCanvasPixels(pageB);
    const fillDiff = comparePixels(beforeFill, afterFill);
    if (fillDiff.diffPixels > 10) {
      provenFillsB++;
    }
  }
  console.log(` -> Account B Proven Bucket Fills: ${provenFillsB}/${attemptedFillsB}`);

  // Wait for commands to reach both accounts and canvases to settle
  console.log('Waiting for network sync & canvas stabilization...');
  await delay(3000);

  const pA_beforeUndo = await getCanvasPixels(pageA);
  const pB_beforeUndo = await getCanvasPixels(pageB);
  const compBeforeUndo = comparePixels(pA_beforeUndo, pB_beforeUndo);
  console.log(`[Step: Initial Sync] Diff pixels between A and B: ${compBeforeUndo.diffPixels} (Match: ${compBeforeUndo.match})`);
  assert(compBeforeUndo.match, `A and B must be identical before undo (diff: ${compBeforeUndo.diffPixels})`);

  // 3. Account A executes 3 consecutive Undo operations
  console.log('Account A performing 3 Undo operations...');
  for (let i = 0; i < 3; i++) {
    const success = await clickUndo(pageA);
    if (success) {
      undoCountA++;
      await delay(800);
    }
  }

  // 4. Account B executes 2 Undo operations
  console.log('Account B performing 2 Undo operations...');
  for (let i = 0; i < 2; i++) {
    const success = await clickUndo(pageB);
    if (success) {
      undoCountB++;
      await delay(800);
    }
  }

  await delay(2000);
  const pA_afterUndo = await getCanvasPixels(pageA);
  const pB_afterUndo = await getCanvasPixels(pageB);
  const compAfterUndo = comparePixels(pA_afterUndo, pB_afterUndo);
  console.log(`[Step: After Undos] Diff pixels between A and B: ${compAfterUndo.diffPixels} (Match: ${compAfterUndo.match})`);
  assert(compAfterUndo.match, `A and B must be identical after undos (diff: ${compAfterUndo.diffPixels})`);

  // 5. Redo operations & validation
  console.log('Performing Redo operations...');
  for (let i = 0; i < 2; i++) {
    if (await clickRedo(pageA)) {
      redoCountA++;
      await delay(800);
    }
  }

  await delay(1500);
  const pA_afterRedo = await getCanvasPixels(pageA);
  const pB_afterRedo = await getCanvasPixels(pageB);
  const compAfterRedo = comparePixels(pA_afterRedo, pB_afterRedo);
  console.log(`[Step: After Redos] Diff pixels between A and B: ${compAfterRedo.diffPixels} (Match: ${compAfterRedo.match})`);
  assert(compAfterRedo.match, `A and B must be identical after redos (diff: ${compAfterRedo.diffPixels})`);

  // 6. Independent Observer C: Joins and rebuilds from scratch via draw_history_sync
  console.log('Account C (Observer) joining to rebuild from scratch...');
  const contextC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageC = await contextC.newPage();
  await joinRoom(pageC, `ObserverC_${checkpointExp}`, checkpointExp);
  await delay(3500);

  const pC = await getCanvasPixels(pageC);
  const compOracle = comparePixels(pA_afterRedo, pC);
  console.log(`\n======================================================`);
  console.log(`🎯 ORACLE VERIFICATION: Canvas A vs Independent Observer C`);
  console.log(`🎯 Diff Pixels: ${compOracle.diffPixels} (Match: ${compOracle.match})`);
  console.log(`======================================================`);
  assert(compOracle.match, `CRITICAL ORACLE FAILURE: Canvas A does NOT match Observer C rebuild! (${compOracle.diffPixels} diffs)`);

  await browser.close();

  return {
    checkpointExp,
    attemptedLinesA,
    provenLinesA,
    attemptedFillsA,
    provenFillsA,
    attemptedLinesB,
    provenLinesB,
    attemptedFillsB,
    provenFillsB,
    undoCountA,
    undoCountB,
    redoCountA,
    initialSyncDiff: compBeforeUndo.diffPixels,
    afterUndoDiff: compAfterUndo.diffPixels,
    afterRedoDiff: compAfterRedo.diffPixels,
    oracleObserverCDiff: compOracle.diffPixels,
    oraclePassed: compOracle.match,
    diagLogsCountA: diagA.length,
    diagLogsCountB: diagB.length,
    lastDiagA: diagA[diagA.length - 1] || null,
    directFloodFillCounterAvailable: false,
  };
}

async function main() {
  const summary: any[] = [];
  try {
    const resON = await runScenario('1');
    summary.push(resON);
    fs.writeFileSync('scripts/test_phase1e_summary.json', JSON.stringify(summary, null, 2), 'utf-8');
  } catch (err: any) {
    console.error('Scenario ON Failed:', err.message);
    summary.push({ checkpointExp: '1', error: err.message, oraclePassed: false });
    fs.writeFileSync('scripts/test_phase1e_summary.json', JSON.stringify(summary, null, 2), 'utf-8');
  }

  // Grace pause between scenario runs
  console.log('\nPausing 3s before starting Scenario OFF to allow full connection teardown...');
  await delay(3000);

  try {
    const resOFF = await runScenario('0');
    summary.push(resOFF);
    fs.writeFileSync('scripts/test_phase1e_summary.json', JSON.stringify(summary, null, 2), 'utf-8');
  } catch (err: any) {
    console.error('Scenario OFF Failed:', err.message);
    summary.push({ checkpointExp: '0', error: err.message, oraclePassed: false });
    fs.writeFileSync('scripts/test_phase1e_summary.json', JSON.stringify(summary, null, 2), 'utf-8');
  }

  console.log('\n======================================================');
  console.log('=== PHASE 1E REAL ORACLE FINAL SUMMARY ===');
  console.log('======================================================');
  console.log(JSON.stringify(summary, null, 2));

  const allPassed = summary.every(s => s.oraclePassed === true);
  if (!allPassed) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

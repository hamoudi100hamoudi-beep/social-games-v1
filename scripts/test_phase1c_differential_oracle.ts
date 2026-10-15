import { chromium, Page } from 'playwright';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface DiagRecord {
  raw: string;
  targetInstanceId?: string;
  targetStrokeId?: string;
  targetIndex?: number;
  bestCheckpointSlot?: number;
  bestCheckpointIndex?: number;
  replayStartIndex?: number;
  commandsReplayed?: number;
  floodFillExecutions?: number;
  totalSyncDurationMs?: number;
}

function parseDiagLog(text: string): DiagRecord | null {
  if (!text.includes('[FREE_DRAW_UNDO_DIAG]')) return null;
  const record: DiagRecord = { raw: text };
  try {
    const jsonStr = text.substring(text.indexOf('{'));
    const obj = JSON.parse(jsonStr);
    record.targetInstanceId = obj.targetInstanceId;
    record.targetStrokeId = obj.targetStrokeId;
    record.targetIndex = obj.targetIndex;
    record.bestCheckpointSlot = obj.bestCheckpointSlot;
    record.bestCheckpointIndex = obj.bestCheckpointIndex;
    record.replayStartIndex = obj.replayStartIndex;
    record.commandsReplayed = obj.commandsReplayed;
    record.floodFillExecutions = obj.floodFillExecutions;
    record.totalSyncDurationMs = obj.totalSyncDurationMs;
  } catch {
    // regex fallback if needed
  }
  return record;
}

async function joinRoom(page: Page, nickname: string, checkpointExp: string) {
  await page.addInitScript((exp) => {
    localStorage.clear();
    localStorage.setItem('freedraw_bucket_undo_diag', '1');
    localStorage.setItem('freedraw_bucket_checkpoint_exp', exp);
  }, checkpointExp);

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await delay(2000);
  await page.locator('textarea[name="nickname_input_random_name"]').fill(nickname);
  await page.locator('button:has-text("ROOMS")').click();
  
  const freeDrawBtn = page.locator('button:has-text("Free Draw")');
  await freeDrawBtn.waitFor({ state: 'visible', timeout: 5000 });
  await freeDrawBtn.click();

  const playBtn = page.locator('button#room-info-play-btn, button:has-text("PLAY")');
  await playBtn.waitFor({ state: 'visible', timeout: 5000 });
  await playBtn.click();

  await delay(2500);

  const startBtn = page.locator('button:has-text("ابدأ الرسم"), button:has-text("انضم للرسم"), button:has-text("العودة للرسم")');
  if (await startBtn.count() > 0 && await startBtn.first().isVisible()) {
    await startBtn.first().click();
    await delay(1500);
  }
}

async function selectTool(page: Page, toolName: 'pencil' | 'bucket') {
  // Open tools menu
  const toolToggleBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1);
  await toolToggleBtn.click();
  await delay(300);

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
  await delay(200);
}

async function clickUndo(page: Page) {
  const toolToggleBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1);
  await toolToggleBtn.click();
  await delay(300);

  const undoBtn = page.locator('button').filter({ has: page.locator('svg.lucide-undo-2') });
  if (await undoBtn.isVisible() && !(await undoBtn.isDisabled())) {
    await undoBtn.click();
    await delay(300);
    return true;
  }
  // Close menu if not clicked
  await toolToggleBtn.click();
  return false;
}

async function clickRedo(page: Page) {
  const toolToggleBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pencil, svg.lucide-paint-bucket') }).nth(1);
  await toolToggleBtn.click();
  await delay(300);

  const redoBtn = page.locator('button').filter({ has: page.locator('svg.lucide-redo-2') });
  if (await redoBtn.isVisible() && !(await redoBtn.isDisabled())) {
    await redoBtn.click();
    await delay(300);
    return true;
  }
  await toolToggleBtn.click();
  return false;
}

async function selectColor(page: Page, colorIndex: number) {
  const colorBtns = page.locator('div.flex.gap-\\[3px\\] button');
  const count = await colorBtns.count();
  if (count > colorIndex) {
    await colorBtns.nth(colorIndex).click();
    await delay(1500);
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

async function runScenario(checkpointExp: string) {
  console.log(`\n========================================`);
  console.log(`=== Running Phase 1C Scenario (Checkpoint Exp: ${checkpointExp}) ===`);
  console.log(`========================================`);

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
  await joinRoom(pageA, 'TesterA', checkpointExp);

  // Account B
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageB = await contextB.newPage();
  pageB.on('console', msg => {
    const text = msg.text();
    const rec = parseDiagLog(text);
    if (rec) diagB.push(rec);
  });

  console.log('Account B joining...');
  await joinRoom(pageB, 'TesterB', checkpointExp);

  let successfulLinesA = 0;
  let successfulFillsA = 0;
  let successfulLinesB = 0;
  let successfulFillsB = 0;

  // 1. Account A draws boundary line (using pencil)
  console.log('Account A drawing boundary line...');
  await selectTool(pageA, 'pencil');
  const canvasA = pageA.locator('#drawing-board-layer-primary');
  const boxA = await canvasA.boundingBox();
  if (boxA) {
    await pageA.mouse.move(boxA.x + 200, boxA.y + 50);
    await pageA.mouse.down();
    await pageA.mouse.move(boxA.x + 200, boxA.y + 400, { steps: 5 });
    await pageA.mouse.up();
    successfulLinesA++;
    await delay(500);
  }

  // Account A executes 15 successful Bucket fills with color changes
  console.log('Account A executing 15 bucket fills...');
  await selectTool(pageA, 'bucket');
  for (let i = 0; i < 15; i++) {
    await selectColor(pageA, i % 12);
    if (boxA) {
      // fill inside region on left of boundary
      await pageA.mouse.click(boxA.x + 50 + (i % 5) * 20, boxA.y + 100 + Math.floor(i / 5) * 30);
      successfulFillsA++;
      await delay(200);
    }
  }

  // 2. Account B draws 5 pen lines in the other region
  console.log('Account B drawing 5 pen lines...');
  await selectTool(pageB, 'pencil');
  const canvasB = pageB.locator('#drawing-board-layer-primary');
  const boxB = await canvasB.boundingBox();
  if (boxB) {
    for (let i = 0; i < 5; i++) {
      await pageB.mouse.move(boxB.x + 400 + i * 20, boxB.y + 100);
      await pageB.mouse.down();
      await pageB.mouse.move(boxB.x + 400 + i * 20, boxB.y + 300, { steps: 3 });
      await pageB.mouse.up();
      successfulLinesB++;
      await delay(200);
    }
  }

  // Account B executes 5 successful Bucket fills
  console.log('Account B executing 5 bucket fills...');
  await selectTool(pageB, 'bucket');
  for (let i = 0; i < 5; i++) {
    await selectColor(pageB, (i + 5) % 12);
    if (boxB) {
      await pageB.mouse.click(boxB.x + 500 + i * 15, boxB.y + 150);
      successfulFillsB++;
      await delay(200);
    }
  }

  // Wait for commands to reach both accounts and canvases to settle
  console.log('Waiting for network sync & canvas stabilization...');
  await delay(3000);

  const pA_beforeUndo = await getCanvasPixels(pageA);
  const pB_beforeUndo = await getCanvasPixels(pageB);
  const compBeforeUndo = comparePixels(pA_beforeUndo, pB_beforeUndo);
  console.log(`[Step: Initial Sync] Diff pixels between A and B: ${compBeforeUndo.diffPixels} (Match: ${compBeforeUndo.match})`);

  // 3. Account A executes 3 consecutive Undo operations
  console.log('Account A performing 3 Undo operations...');
  let undoCountA = 0;
  for (let i = 0; i < 3; i++) {
    const success = await clickUndo(pageA);
    if (success) {
      undoCountA++;
      await delay(800);
    }
  }

  // 4. Account B executes 2 Undo operations
  console.log('Account B performing 2 Undo operations...');
  let undoCountB = 0;
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

  // 5. Redo operations & validation
  console.log('Performing Redo operations...');
  let redoCountA = 0;
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

  // 6. Observer C: Open 3rd context and join room after undos/redos
  console.log('Account C (Observer) joining room...');
  const contextC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageC = await contextC.newPage();
  await joinRoom(pageC, 'TesterC', checkpointExp);
  await delay(3000);

  const pC = await getCanvasPixels(pageC);
  const compC = comparePixels(pA_afterRedo, pC);
  console.log(`[Step: Observer C vs A] Diff pixels between A and C: ${compC.diffPixels} (Match: ${compC.match})`);

  await browser.close();

  return {
    checkpointExp,
    stats: {
      successfulLinesA,
      successfulFillsA,
      successfulLinesB,
      successfulFillsB,
      undoCountA,
      undoCountB,
      redoCountA,
    },
    pixelDiffs: {
      beforeUndo: compBeforeUndo.diffPixels,
      afterUndo: compAfterUndo.diffPixels,
      afterRedo: compAfterRedo.diffPixels,
      observerC: compC.diffPixels,
    },
    diagSummary: {
      diagACount: diagA.length,
      diagBCount: diagB.length,
      sampleDiagA: diagA[0] || null,
      sampleDiagB: diagB[0] || null,
    }
  };
}

async function main() {
  const r1 = await runScenario('1');
  const r2 = await runScenario('0');

  console.log('\n========================================');
  console.log('=== PHASE 1C DIFFERENTIAL TEST REPORT ===');
  console.log('========================================');
  console.log(JSON.stringify({ r1, r2 }, null, 2));
}

main().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});

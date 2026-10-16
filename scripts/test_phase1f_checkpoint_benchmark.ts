import { chromium, Browser, Page } from 'playwright';
import assert from 'node:assert';
import * as fs from 'node:fs';

interface DiagRecord {
  raw: string;
  targetInstanceId?: string;
  targetStrokeId?: number;
  targetIndex?: number;
  commandsReplayed?: number;
  bucketCommandsEncountered?: number;
  floodFillExecutions?: number;
  cumulativeFillDurationMs?: number;
  maxFillDurationMs?: number;
  totalSyncDurationMs?: number;
  bestCheckpointSlot?: string;
  bestCheckpointIndex?: number;
  checkpointCount?: number;
  approximateRetainedMemoryMB?: number;
  fastPath?: string;
}

interface BenchmarkOutput {
  mode: 'OFF' | 'ON';
  setupCompleted: boolean;
  scenarioCompleted: boolean;
  actualBucketOperations: number;
  actualDrawOperations: number;
  checkpointSlotSelected: string;
  checkpointPathProven: boolean;
  replayedBucketCount: number;
  floodFillExecutionsCount: number;
  undoDurationMs: number;
  redoDurationMs: number;
  undoPixelDiffCount: number;
  redoPixelDiffCount: number;
  retainedCheckpointsCount: number;
  retainedMemoryMB: number;
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
      bucketCommandsEncountered: obj.bucketCommandsEncountered,
      floodFillExecutions: obj.floodFillExecutions,
      cumulativeFillDurationMs: obj.cumulativeFillDurationMs,
      maxFillDurationMs: obj.maxFillDurationMs,
      totalSyncDurationMs: obj.totalSyncDurationMs,
      bestCheckpointSlot: obj.checkpointFacts?.bestCheckpointSlot ?? (obj.bestCheckpointSlot !== undefined ? String(obj.bestCheckpointSlot) : undefined),
      bestCheckpointIndex: obj.checkpointFacts?.bestCheckpointIndex,
      checkpointCount: obj.checkpointFacts?.checkpointCount,
      approximateRetainedMemoryMB: obj.checkpointFacts?.approximateRetainedMemoryMB,
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
  });
}

async function joinFreeDraw(page: Page, nickname: string, expFlag: '0' | '1') {
  await page.addInitScript((exp) => {
    localStorage.clear();
    localStorage.setItem('freedraw_bucket_undo_diag', '1');
    localStorage.setItem('freedraw_bucket_checkpoint_exp', exp);
  }, expFlag);

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await delay(800);

  const actualExp = await page.evaluate(() => localStorage.getItem('freedraw_bucket_checkpoint_exp'));
  assert.strictEqual(actualExp, expFlag, `freedraw_bucket_checkpoint_exp mismatch: expected ${expFlag}, got ${actualExp}`);

  const nameInput = page.locator('textarea[name="nickname_input_random_name"]');
  await nameInput.waitFor({ state: 'visible', timeout: 8000 });
  await nameInput.fill(nickname);

  const roomsBtn = page.locator('button:has-text("ROOMS")');
  await roomsBtn.waitFor({ state: 'visible', timeout: 5000 });
  await roomsBtn.click();
  await delay(300);

  const freeDrawBtn = page.locator('button:has-text("Free Draw")');
  await freeDrawBtn.waitFor({ state: 'visible', timeout: 5000 });
  await freeDrawBtn.click();

  const playBtn = page.locator('button#room-info-play-btn, button:has-text("PLAY")');
  await playBtn.waitFor({ state: 'visible', timeout: 5000 });
  await playBtn.click();

  try {
    await page.locator('div.fixed.z-\\[999999\\]').waitFor({ state: 'detached', timeout: 12000 });
  } catch {}

  await delay(800);

  const startBtn = page.locator('button:has-text("ابدأ الرسم"), button:has-text("انضم للرسم"), button:has-text("العودة للرسم")').first();
  await startBtn.waitFor({ state: 'visible', timeout: 10000 });
  await startBtn.click();

  const toolbar = page.locator('div.bg-game-primary-blue');
  await toolbar.waitFor({ state: 'visible', timeout: 10000 });

  const canvas = page.locator('#drawing-board-layer-primary');
  await canvas.waitFor({ state: 'visible', timeout: 8000 });
  await delay(300);

  await initBrowserHelpers(page);
}

async function ensureToolsMenuOpen(page: Page) {
  const menu = page.locator('div.grid.grid-cols-2');
  if (await menu.isVisible()) return;

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

async function clickUndoMultiple(page: Page, count: number): Promise<number> {
  await ensureToolsMenuOpen(page);
  const undoBtn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-undo-2)').first();
  let done = 0;
  for (let i = 0; i < count; i++) {
    if (await undoBtn.isDisabled()) break;
    await undoBtn.click();
    await delay(120);
    done++;
  }
  return done;
}

async function clickRedoMultiple(page: Page, count: number): Promise<number> {
  await ensureToolsMenuOpen(page);
  const redoBtn = page.locator('div.grid.grid-cols-2 button:has(svg.lucide-redo-2)').first();
  let done = 0;
  for (let i = 0; i < count; i++) {
    if (await redoBtn.isDisabled()) break;
    await redoBtn.click();
    await delay(120);
    done++;
  }
  return done;
}

async function runBenchmark(browser: Browser, expMode: '0' | '1'): Promise<BenchmarkOutput> {
  const modeLabel: 'OFF' | 'ON' = expMode === '1' ? 'ON' : 'OFF';
  console.log(`\n======================================================`);
  console.log(`🚀 Executing 100-Bucket Benchmark Mode [${modeLabel}] (exp = ${expMode})`);
  console.log(`======================================================`);

  const diagLogsA: DiagRecord[] = [];
  let currentStage = 'SETUP_INIT';

  let ctxA: any = null;
  let pageA: any = null;
  let ctxB: any = null;
  let pageB: any = null;

  let actualDrawOperations = 0;
  let actualBucketOperations = 0;
  let undoDurationMs = 0;
  let redoDurationMs = 0;
  let undoPixelDiffCount = -1;
  let redoPixelDiffCount = -1;
  let checkpointSlotSelected = 'none';
  let checkpointPathProven = false;
  let replayedBucketCount = 0;
  let floodFillExecutionsCount = 0;
  let retainedCheckpointsCount = 0;
  let retainedMemoryMB = 0;

  // 1. SETUP
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
      checkpointSlotSelected: 'none',
      checkpointPathProven: false,
      replayedBucketCount: 0,
      floodFillExecutionsCount: 0,
      undoDurationMs: 0,
      redoDurationMs: 0,
      undoPixelDiffCount: -1,
      redoPixelDiffCount: -1,
      retainedCheckpointsCount: 0,
      retainedMemoryMB: 0,
      failureStage: currentStage,
      failureReason: err.message,
    };
  }

  // 2. SCENARIO: 100 REAL BUCKET OPERATIONS
  const doScenario = async () => {
    currentStage = 'SCENARIO_INIT';
    const canvasA = pageA.locator('#drawing-board-layer-primary');
    const boxA = await canvasA.boundingBox();
    const canvasB = pageB.locator('#drawing-board-layer-primary');
    const boxB = await canvasB.boundingBox();
    assert(boxA && boxB, 'Canvas bounding boxes must exist');

    await pageA.evaluate(() => (window as any).saveBuffer('baseline'));

    // Draw grid to create 100 distinct bounded cells (10x10 grid)
    currentStage = 'SCENARIO_GRID_DRAW';
    await selectTool(pageA, 'pencil');
    const gridRows = 10;
    const gridCols = 10;
    const startX = boxA.x + 30;
    const startY = boxA.y + 20;
    const cellW = 58;
    const cellH = 34;
    const totalW = cellW * gridCols;
    const totalH = cellH * gridRows;

    // Draw horizontal grid lines
    for (let r = 0; r <= gridRows; r++) {
      const y = startY + r * cellH;
      await pageA.mouse.move(startX, y);
      await pageA.mouse.down();
      await pageA.mouse.move(startX + totalW, y, { steps: 2 });
      await pageA.mouse.up();
      actualDrawOperations++;
    }

    // Draw vertical grid lines
    for (let c = 0; c <= gridCols; c++) {
      const x = startX + c * cellW;
      await pageA.mouse.move(x, startY);
      await pageA.mouse.down();
      await pageA.mouse.move(x, startY + totalH, { steps: 2 });
      await pageA.mouse.up();
      actualDrawOperations++;
    }
    await delay(300);

    // Account A fills all 100 cells with distinct colors
    currentStage = 'SCENARIO_100_BUCKET_FILLS';
    console.log(`[${modeLabel}] Executing 100 real Bucket operations...`);
    await selectTool(pageA, 'bucket');

    const colors = ['#0018F6', '#25C8FF', '#008D25', '#A9220C', '#954112', '#00FF4C', '#FF0012', '#FF7729', '#B1701C', '#99014E', '#FFCA26', '#7F00FF'];

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const fillIndex = r * gridCols + c + 1; // 1..100
        const clickX = startX + c * cellW + Math.floor(cellW / 2);
        const clickY = startY + r * cellH + Math.floor(cellH / 2);

        // Snapshot state at fill 90 (which is the expected state after 10 undos!)
        if (fillIndex === 90) {
          await delay(200);
          await pageA.evaluate(() => (window as any).saveBuffer('state_at_fill_90'));
        }

        // Change color periodically
        if (c % 2 === 0) {
          const colorHex = colors[(r + c) % colors.length];
          await pageA.evaluate((hex) => {
            const btn = document.querySelector(`button[style*="background-color: ${hex}"], button[data-color="${hex}"]`) as HTMLElement;
            if (btn) btn.click();
          }, colorHex);
        }

        await pageA.mouse.click(clickX, clickY);
        actualBucketOperations++;
        await delay(35);
      }
    }
    console.log(`[${modeLabel}] Completed ${actualBucketOperations} bucket fills.`);
    await delay(800);

    // Save exact state before Account B's stroke and Undos
    await pageA.evaluate(() => (window as any).saveBuffer('state_after_100_fills'));

    // 3. ACCOUNT B: INTERLEAVED STROKE (breaks single-step tail cache)
    currentStage = 'SCENARIO_PLAYER_B_STROKE';
    console.log(`[${modeLabel}] Player B drawing interleaved stroke...`);
    await selectTool(pageB, 'pencil');
    await pageB.mouse.move(boxB.x + 20, boxB.y + 380);
    await pageB.mouse.down();
    await pageB.mouse.move(boxB.x + 200, boxB.y + 380, { steps: 2 });
    await pageB.mouse.up();
    actualDrawOperations++;
    await delay(600);

    // Save state before undos (includes Player B's stroke)
    await pageA.evaluate(() => (window as any).saveBuffer('state_before_undos'));

    // Expected state after 10 undos: state_at_fill_90 + Player B's bottom stroke!
    // We construct the expected buffer in browser by combining fill 90 with bottom stroke region:
    await pageA.evaluate(() => {
      const cur = (window as any).canvasBuffers['state_before_undos'];
      const f90 = (window as any).canvasBuffers['state_at_fill_90'];
      const canvas = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      // Expected state has fill 90 in grid region, plus Player B's stroke at y > 360
      const exp = ctx.createImageData(canvas.width, canvas.height);
      exp.data.set(f90.data);
      // Copy Player B stroke (bottom row) from cur to exp
      const startIdx = Math.floor(360 * (canvas.height / 396)) * canvas.width * 4;
      for (let i = startIdx; i < cur.data.length; i++) {
        exp.data[i] = cur.data[i];
      }
      (window as any).canvasBuffers['expected_after_10_undos'] = exp;
    });

    // 4. MULTI-STEP UNDO: 10 CONSECUTIVE UNDOS FOR ACCOUNT A
    currentStage = 'SCENARIO_10_CONSECUTIVE_UNDOS';
    console.log(`[${modeLabel}] Executing 10 consecutive Undos for Account A...`);
    const diagCountBefore = diagLogsA.length;
    const uStart = performance.now();
    const undosDone = await clickUndoMultiple(pageA, 10);
    assert.strictEqual(undosDone, 10, `Expected 10 undos, executed ${undosDone}`);

    // Wait until canvas rendering settles
    await delay(600);
    undoDurationMs = Math.round(performance.now() - uStart);

    await pageA.evaluate(() => (window as any).saveBuffer('state_after_10_undos'));
    undoPixelDiffCount = await pageA.evaluate(() => (window as any).getDiff('state_after_10_undos', 'expected_after_10_undos'));

    // Check diagnostics captured during the 10 undos
    const newDiags = diagLogsA.slice(diagCountBefore);
    for (const d of newDiags) {
      if (d.commandsReplayed !== undefined) replayedBucketCount += (d.bucketCommandsEncountered || 0);
      if (d.floodFillExecutions !== undefined) floodFillExecutionsCount += d.floodFillExecutions;
      if (d.bestCheckpointSlot && d.bestCheckpointSlot !== 'none') {
        checkpointSlotSelected = d.bestCheckpointSlot;
        checkpointPathProven = true;
      }
      if (d.checkpointCount !== undefined) retainedCheckpointsCount = d.checkpointCount;
      if (d.approximateRetainedMemoryMB !== undefined) retainedMemoryMB = d.approximateRetainedMemoryMB;
    }

    // 5. MULTI-STEP REDO: 10 CONSECUTIVE REDOS FOR ACCOUNT A
    currentStage = 'SCENARIO_10_CONSECUTIVE_REDOS';
    console.log(`[${modeLabel}] Executing 10 consecutive Redos for Account A...`);
    const rStart = performance.now();
    const redosDone = await clickRedoMultiple(pageA, 10);
    assert.strictEqual(redosDone, 10, `Expected 10 redos, executed ${redosDone}`);

    await delay(600);
    redoDurationMs = Math.round(performance.now() - rStart);

    await pageA.evaluate(() => (window as any).saveBuffer('state_after_10_redos'));
    redoPixelDiffCount = await pageA.evaluate(() => (window as any).getDiff('state_after_10_redos', 'state_before_undos'));
  };

  try {
    await Promise.race([
      doScenario(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SCENARIO_TIMEOUT_75S')), 75000))
    ]);
  } catch (err: any) {
    if (ctxA) await ctxA.close().catch(() => {});
    if (ctxB) await ctxB.close().catch(() => {});
    return {
      mode: modeLabel,
      setupCompleted: true,
      scenarioCompleted: false,
      actualBucketOperations,
      actualDrawOperations,
      checkpointSlotSelected,
      checkpointPathProven,
      replayedBucketCount,
      floodFillExecutionsCount,
      undoDurationMs,
      redoDurationMs,
      undoPixelDiffCount,
      redoPixelDiffCount,
      retainedCheckpointsCount,
      retainedMemoryMB,
      failureStage: currentStage,
      failureReason: err.message,
    };
  }

  if (ctxA) await ctxA.close().catch(() => {});
  if (ctxB) await ctxB.close().catch(() => {});

  return {
    mode: modeLabel,
    setupCompleted: true,
    scenarioCompleted: true,
    actualBucketOperations,
    actualDrawOperations,
    checkpointSlotSelected,
    checkpointPathProven,
    replayedBucketCount,
    floodFillExecutionsCount,
    undoDurationMs,
    redoDurationMs,
    undoPixelDiffCount,
    redoPixelDiffCount,
    retainedCheckpointsCount,
    retainedMemoryMB,
    failureStage: null,
    failureReason: null,
  };
}

async function main() {
  console.log('========================================================================');
  console.log('=== PHASE 1F.5: CONTROLLED 100-BUCKET CHECKPOINT BENCHMARK (OFF & ON) ===');
  console.log('========================================================================\n');

  const customExecutable = '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell';
  const executablePath = fs.existsSync(customExecutable) ? customExecutable : undefined;

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results: BenchmarkOutput[] = [];

  try {
    // 1. Run OFF mode (Baseline)
    const resOFF = await runBenchmark(browser, '0');
    results.push(resOFF);
    console.log(`[OFF Summary]: Completed=${resOFF.scenarioCompleted}, UndoTime=${resOFF.undoDurationMs}ms, CheckpointSlot=${resOFF.checkpointSlotSelected}`);

    await delay(3000);

    // 2. Run ON mode (History-Indexed Checkpoint Collection)
    const resON = await runBenchmark(browser, '1');
    results.push(resON);
    console.log(`[ON Summary]: Completed=${resON.scenarioCompleted}, UndoTime=${resON.undoDurationMs}ms, CheckpointSlot=${resON.checkpointSlotSelected}`);
  } finally {
    await browser.close().catch(() => {});
  }

  fs.writeFileSync('scripts/test_phase1f_summary.json', JSON.stringify(results, null, 2), 'utf-8');

  console.log('\n========================================================================');
  console.log('=== BENCHMARK FINAL SUMMARY ===');
  console.log('========================================================================');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

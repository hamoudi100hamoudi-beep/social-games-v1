const { chromium } = require('playwright');
const fs = require('fs');

const LOG_FILE = '/diag_results.txt';
fs.writeFileSync(LOG_FILE, '=== DIAGNOSTIC RUN STARTED ===\n');

function log(msg) {
  console.log(msg);
  fs.appendFileSync(LOG_FILE, (typeof msg === 'string' ? msg : JSON.stringify(msg)) + '\n');
}

async function setupRoom(browser, roomName, isFreeDraw) {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const tracesB = [];
  pageB.on('console', msg => {
    const text = msg.text();
    if (text.includes('[DIAG_TRACE]')) {
      tracesB.push(text);
      log(`[TRACE_B] ${text}`);
    }
  });

  // Player A joins
  await pageA.goto('http://localhost:3000');
  await pageA.fill('textarea', 'PlayerA_' + Math.random().toString(36).slice(2, 6));
  await pageA.click('button:has-text("ROOMS")');
  await pageA.waitForTimeout(400);
  await pageA.click(`button:has-text("${roomName}")`);
  await pageA.waitForTimeout(400);
  await pageA.click('#room-info-play-btn');

  // Player B joins
  await pageB.goto('http://localhost:3000');
  await pageB.fill('textarea', 'PlayerB_' + Math.random().toString(36).slice(2, 6));
  await pageB.click('button:has-text("ROOMS")');
  await pageB.waitForTimeout(400);
  await pageB.click(`button:has-text("${roomName}")`);
  await pageB.waitForTimeout(400);
  await pageB.click('#room-info-play-btn');

  await pageA.waitForTimeout(2000);
  await pageB.waitForTimeout(2000);

  if (isFreeDraw) {
    const startBtn = pageA.locator('button:has-text("ابدأ الرسم")');
    if (await startBtn.isVisible()) {
      await startBtn.click();
      await pageA.waitForTimeout(1000);
    }
  } else {
    // In Experimental, wait for CHOOSING phase
    log('Waiting for CHOOSING phase in Experimental...');
    await pageA.waitForTimeout(1500);
    
    // Check which one is the drawer
    let drawerPage = pageA;
    let guesserPage = pageB;
    const isADrawer = await pageA.locator('text=Choose a word to draw').isVisible().catch(() => false);
    const isBDrawer = await pageB.locator('text=Choose a word to draw').isVisible().catch(() => false);
    
    if (isBDrawer && !isADrawer) {
      log('Player B was chosen as drawer, swapping roles for Experimental test...');
      drawerPage = pageB;
      guesserPage = pageA;
      guesserPage.on('console', msg => {
        const text = msg.text();
        if (text.includes('[DIAG_TRACE]')) {
          tracesB.push(text);
          log(`[TRACE_VIEWER] ${text}`);
        }
      });
    }

    // Click word choice on drawer page
    const wordBtns = drawerPage.locator('div:has-text("IT\'S YOUR TURN!") ~ div button, div:has-text("Choose a word") ~ * button');
    if (await wordBtns.count() > 0) {
      await wordBtns.first().click();
    } else {
      const anyModalBtn = drawerPage.locator('.fixed button');
      if (await anyModalBtn.count() > 0) {
        await anyModalBtn.first().click();
      }
    }
    await drawerPage.waitForTimeout(1000);
    return { contextA, contextB, pageA: drawerPage, pageB: guesserPage, tracesB };
  }

  return { contextA, contextB, pageA, pageB, tracesB };
}

async function selectTool(page, toolName) {
  // Click main action button to toggle tool menu
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const toolBtn = btns.find(b => b.querySelector('svg.lucide-pencil, svg.lucide-eraser, svg.lucide-circle, svg.lucide-paint-bucket, svg.lucide-minus, svg.lucide-square'));
    if (toolBtn) toolBtn.click();
  });
  await page.waitForTimeout(300);

  // Click specific tool sub-button
  await page.evaluate((tName) => {
    const btns = Array.from(document.querySelectorAll('button'));
    let selector = '';
    if (tName === 'strokeCircle') selector = 'svg.lucide-circle';
    else if (tName === 'bucket') selector = 'svg.lucide-paint-bucket';
    else if (tName === 'pencil') selector = 'svg.lucide-pencil';
    else if (tName === 'undo') selector = 'svg.lucide-undo-2';
    
    const targetBtn = btns.find(b => b.querySelector(selector));
    if (targetBtn) targetBtn.click();
  }, toolName);
  await page.waitForTimeout(300);
}

async function clickUndo(page) {
  await selectTool(page, 'undo');
  await page.waitForTimeout(500);
}

async function runSingleTest(testName, roomName, isFreeDraw, shapeType, bucketLocation) {
  log(`\n======================================================`);
  log(`RUNNING: ${testName} (${roomName}, ${shapeType}, Bucket ${bucketLocation})`);
  log(`======================================================`);

  const browser = await chromium.launch({ headless: true });
  const { pageA, pageB, tracesB } = await setupRoom(browser, roomName, isFreeDraw);

  const canvasA = pageA.locator('canvas').first();
  await canvasA.waitFor({ state: 'visible' });
  const box = await canvasA.boundingBox();

  const cX1 = box.x + 120;
  const cY1 = box.y + 120;
  const cX2 = box.x + 220;
  const cY2 = box.y + 220;
  const insideX = (cX1 + cX2) / 2;
  const insideY = (cY1 + cY2) / 2;
  const outsideX = box.x + 320;
  const outsideY = box.y + 320;

  if (shapeType === 'shape') {
    log('[ACTION] Drawing Shape Circle on A...');
    await selectTool(pageA, 'strokeCircle');
    await pageA.mouse.move(cX1, cY1);
    await pageA.mouse.down();
    await pageA.mouse.move(cX2, cY2, { steps: 5 });
    await pageA.mouse.up();
  } else {
    log('[ACTION] Drawing Freehand Circle on A...');
    await selectTool(pageA, 'pencil');
    const r = 50;
    const centerX = 170;
    const centerY = 170;
    await pageA.mouse.move(box.x + centerX + r, box.y + centerY);
    await pageA.mouse.down();
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const px = box.x + centerX + Math.cos(angle) * r;
      const py = box.y + centerY + Math.sin(angle) * r;
      await pageA.mouse.move(px, py);
    }
    await pageA.mouse.up();
  }
  await pageA.waitForTimeout(800);

  // Bucket Tool
  log(`[ACTION] Selecting Bucket and clicking ${bucketLocation}...`);
  await selectTool(pageA, 'bucket');
  const targetX = bucketLocation === 'inside' ? insideX : outsideX;
  const targetY = bucketLocation === 'inside' ? insideY : outsideY;
  await pageA.mouse.move(targetX, targetY);
  await pageA.mouse.down();
  await pageA.mouse.up();
  await pageA.waitForTimeout(800);

  // Undo
  log('[ACTION] Clicking Undo on A...');
  await clickUndo(pageA);
  await pageA.waitForTimeout(1500);

  await browser.close();
  return { testName, traces: tracesB };
}

async function runAll() {
  const results = [];

  try {
    results.push(await runSingleTest('Test A', 'Free Draw', true, 'shape', 'inside'));
    results.push(await runSingleTest('Test B', 'Free Draw', true, 'freehand', 'inside'));
    results.push(await runSingleTest('Test C', 'Free Draw', true, 'shape', 'outside'));
    results.push(await runSingleTest('Test D', 'Experimental Draw', false, 'shape', 'inside'));
    results.push(await runSingleTest('Test E', 'Experimental Draw', false, 'freehand', 'inside'));
    results.push(await runSingleTest('Test F', 'Experimental Draw', false, 'shape', 'outside'));
  } catch (err) {
    log(`FATAL ERROR IN RUNALL: ${err.message}\n${err.stack}`);
  }

  log('\n\n=================== ALL TESTS COMPLETED ===================');
  for (const r of results) {
    log(`\n--- SUMMARY FOR ${r.testName} ---`);
    for (const t of r.traces) {
      log(t);
    }
  }
}

runAll().catch(err => log(`TOP ERROR: ${err}`));

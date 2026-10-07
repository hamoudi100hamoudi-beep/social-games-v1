const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const tracesB = [];
  pageB.on('console', msg => {
    const text = msg.text();
    if (text.includes('[DIAG_TRACE]')) {
      tracesB.push(text);
      console.log('TRACE_B:', text);
    }
  });

  const randA = 'UserA_' + Math.random().toString(36).slice(2, 6);
  const randB = 'UserB_' + Math.random().toString(36).slice(2, 6);

  console.log('1. Joining A...');
  await pageA.goto('http://localhost:3000');
  await pageA.fill('textarea', randA);
  await pageA.click('button:has-text("ROOMS")');
  await pageA.waitForTimeout(400);
  await pageA.click('button:has-text("Free Draw")');
  await pageA.waitForTimeout(400);
  await pageA.click('#room-info-play-btn');

  console.log('2. Joining B...');
  await pageB.goto('http://localhost:3000');
  await pageB.fill('textarea', randB);
  await pageB.click('button:has-text("ROOMS")');
  await pageB.waitForTimeout(400);
  await pageB.click('button:has-text("Free Draw")');
  await pageB.waitForTimeout(400);
  await pageB.click('#room-info-play-btn');

  await pageA.waitForTimeout(2000);
  await pageB.waitForTimeout(2000);

  // A enters drawing mode
  console.log('3. A clicking join drawing...');
  await pageA.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.innerText.includes('ابدأ الرسم') || b.innerText.includes('انضم للرسم'));
    if (btn) btn.click();
  });
  await pageA.waitForTimeout(1000);

  // Helper to open tool menu and select a tool
  async function chooseTool(toolIdx) {
    // Click tool menu button (index 1 in toolbar)
    await pageA.evaluate(() => {
      const toolbar = document.querySelector('.bg-game-primary-blue');
      const btns = Array.from(toolbar.querySelectorAll('button'));
      btns[1].click();
    });
    await pageA.waitForTimeout(300);
    // Click subtool
    await pageA.evaluate((idx) => {
      const popup = document.querySelector('.absolute.bottom-\\[56px\\]');
      const btns = Array.from(popup.querySelectorAll('button'));
      btns[idx].click();
    }, toolIdx);
    await pageA.waitForTimeout(300);
  }

  const canvasA = pageA.locator('canvas').first();
  const box = await canvasA.boundingBox();
  console.log('Canvas box:', box);

  // Draw Circle Shape: toolIdx 5 (strokeCircle)
  console.log('4. Selecting strokeCircle (tool 5) and drawing...');
  await chooseTool(5);

  const cX1 = box.x + 150;
  const cY1 = box.y + 150;
  const cX2 = box.x + 250;
  const cY2 = box.y + 250;
  await pageA.mouse.move(cX1, cY1);
  await pageA.mouse.down();
  await pageA.mouse.move(cX2, cY2, { steps: 5 });
  await pageA.mouse.up();
  await pageA.waitForTimeout(800);

  // Select Bucket: toolIdx 6
  console.log('5. Selecting Bucket (tool 6) and clicking inside...');
  await chooseTool(6);
  const insideX = (cX1 + cX2) / 2;
  const insideY = (cY1 + cY2) / 2;
  await pageA.mouse.move(insideX, insideY);
  await pageA.mouse.down();
  await pageA.mouse.up();
  await pageA.waitForTimeout(800);

  // Click Undo: toolIdx 10
  console.log('6. Clicking Undo (tool 10)...');
  await chooseTool(10);
  await pageA.waitForTimeout(1500);

  console.log('7. Done! Total traces on B:', tracesB.length);
  await browser.close();
}

run().catch(console.error);

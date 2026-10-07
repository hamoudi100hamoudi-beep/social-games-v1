const { chromium } = require('playwright');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  pageA.on('console', msg => console.log('[A LOG]:', msg.text()));
  pageB.on('console', msg => console.log('[B LOG]:', msg.text()));

  console.log('Navigating A...');
  await pageA.goto('http://localhost:3000');
  await pageA.fill('textarea', 'PlayerA_Test');
  await pageA.click('button:has-text("ROOMS")');
  await pageA.waitForTimeout(500);
  await pageA.click('button:has-text("Free Draw")');
  await pageA.waitForTimeout(500);
  await pageA.click('#room-info-play-btn');

  console.log('Navigating B...');
  await pageB.goto('http://localhost:3000');
  await pageB.fill('textarea', 'PlayerB_Test');
  await pageB.click('button:has-text("ROOMS")');
  await pageB.waitForTimeout(500);
  await pageB.click('button:has-text("Free Draw")');
  await pageB.waitForTimeout(500);
  await pageB.click('#room-info-play-btn');

  await pageA.waitForTimeout(2000);
  await pageB.waitForTimeout(2000);

  // Click "ابدأ الرسم" on A
  const startBtnA = pageA.locator('button:has-text("ابدأ الرسم")');
  if (await startBtnA.isVisible()) {
    console.log('Clicking "ابدأ الرسم" on A...');
    await startBtnA.click();
    await pageA.waitForTimeout(1000);
  }

  // Draw something on A
  const canvasA = pageA.locator('canvas').first();
  const box = await canvasA.boundingBox();
  console.log('Canvas A box:', box);

  console.log('Drawing stroke on A...');
  await pageA.mouse.move(box.x + 100, box.y + 100);
  await pageA.mouse.down();
  await pageA.mouse.move(box.x + 200, box.y + 200, { steps: 5 });
  await pageA.mouse.up();

  await pageA.waitForTimeout(2000);
  await pageB.waitForTimeout(2000);

  await browser.close();
  console.log('Done test_debug_b');
}

test().catch(console.error);

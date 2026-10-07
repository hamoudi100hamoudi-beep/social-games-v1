const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  pageB.on('console', msg => {
    const text = msg.text();
    if (text.includes('[DIAG_TRACE]')) {
      console.log('TRACE_B:', text);
    }
  });

  // Init localStorage for room 'Free Draw'
  await pageA.goto('http://localhost:3000');
  await pageA.evaluate(() => {
    localStorage.setItem('gartic_player_nickname', 'PlayerA');
    localStorage.setItem('gartic_player_room', 'Free Draw');
    localStorage.setItem('gartic_player_avatar', '😀');
  });
  await pageA.goto('http://localhost:3000');

  await pageB.goto('http://localhost:3000');
  await pageB.evaluate(() => {
    localStorage.setItem('gartic_player_nickname', 'PlayerB');
    localStorage.setItem('gartic_player_room', 'Free Draw');
    localStorage.setItem('gartic_player_avatar', '😎');
  });
  await pageB.goto('http://localhost:3000');

  await pageA.waitForTimeout(1500);
  await pageB.waitForTimeout(1500);

  // In Free Draw, check for "ابدأ الرسم" button on page A
  const startBtn = pageA.locator('button:has-text("ابدأ الرسم")');
  if (await startBtn.isVisible()) {
    console.log('Clicking start free draw on A...');
    await startBtn.click();
    await pageA.waitForTimeout(1000);
  }

  // Look for canvas on A
  const canvasA = pageA.locator('canvas').first();
  await canvasA.waitFor({ state: 'visible' });
  const box = await canvasA.boundingBox();
  console.log('Canvas A bounding box:', box);

  // Now open tools menu to pick shape circle
  // Tool selector button
  console.log('Selecting strokeCircle tool...');
  // Find action button that opens tools menu
  await pageA.evaluate(() => {
    // Click tool selector
    const btns = Array.from(document.querySelectorAll('button'));
    const toolBtn = btns.find(b => b.querySelector('svg.lucide-pencil, svg.lucide-eraser, svg.lucide-paint-bucket'));
    if (toolBtn) toolBtn.click();
  });
  await pageA.waitForTimeout(300);

  await pageA.evaluate(() => {
    // Select strokeCircle button in menu
    const btns = Array.from(document.querySelectorAll('button'));
    const circleBtn = btns.find(b => b.querySelector('svg.lucide-circle'));
    if (circleBtn) circleBtn.click();
  });
  await pageA.waitForTimeout(300);

  // Draw circle from (box.x + 150, box.y + 150) to (box.x + 250, box.y + 250)
  const cX1 = box.x + 150;
  const cY1 = box.y + 150;
  const cX2 = box.x + 250;
  const cY2 = box.y + 250;
  console.log('Drawing shape circle on A...');
  await pageA.mouse.move(cX1, cY1);
  await pageA.mouse.down();
  await pageA.mouse.move(cX2, cY2, { steps: 5 });
  await pageA.mouse.up();
  await pageA.waitForTimeout(500);

  // Now select bucket tool
  console.log('Selecting bucket tool...');
  await pageA.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const toolBtn = btns.find(b => b.querySelector('svg.lucide-pencil, svg.lucide-eraser, svg.lucide-circle'));
    if (toolBtn) toolBtn.click();
  });
  await pageA.waitForTimeout(300);

  await pageA.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const bucketBtn = btns.find(b => b.querySelector('svg.lucide-paint-bucket'));
    if (bucketBtn) bucketBtn.click();
  });
  await pageA.waitForTimeout(300);

  // Click INSIDE the circle: center is at ((cX1+cX2)/2, (cY1+cY2)/2) = (200, 200)
  const insideX = (cX1 + cX2) / 2;
  const insideY = (cY1 + cY2) / 2;
  console.log(`Clicking bucket inside circle at (${insideX}, ${insideY})...`);
  await pageA.mouse.move(insideX, insideY);
  await pageA.mouse.down();
  await pageA.mouse.up();
  await pageA.waitForTimeout(600);

  // Now click UNDO
  console.log('Clicking Undo on A...');
  await pageA.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const toolBtn = btns.find(b => b.querySelector('svg.lucide-paint-bucket'));
    if (toolBtn) toolBtn.click();
  });
  await pageA.waitForTimeout(300);

  await pageA.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const undoBtn = btns.find(b => b.querySelector('svg.lucide-undo-2'));
    if (undoBtn) undoBtn.click();
  });
  await pageA.waitForTimeout(1000);

  console.log('Test A Prototype completed.');
  await browser.close();
}

run().catch(console.error);

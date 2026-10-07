const { chromium } = require('playwright');

async function testJoin() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('LOG:', msg.text()));

  await page.goto('http://localhost:3000');
  await page.fill('textarea', 'PlayerA');
  await page.click('button:has-text("ROOMS")');
  await page.waitForTimeout(500);

  // Click Free Draw
  const freeDrawBtn = page.locator('button:has-text("Free Draw")');
  await freeDrawBtn.click();
  await page.waitForTimeout(500);

  // Click PLAY
  const playBtn = page.locator('#room-info-play-btn');
  await playBtn.click();
  console.log('Clicked PLAY, waiting for room to load...');

  await page.waitForTimeout(2000);
  const startBtn = page.locator('button:has-text("ابدأ الرسم")');
  if (await startBtn.isVisible()) {
    console.log('SUCCESS: "ابدأ الرسم" is visible!');
    await startBtn.click();
    await page.waitForTimeout(1000);
    const canvas = page.locator('canvas').first();
    console.log('Canvas visible:', await canvas.isVisible());
  } else {
    console.log('startBtn NOT visible, checking canvas directly...');
    const canvas = page.locator('canvas').first();
    console.log('Canvas visible:', await canvas.isVisible());
  }

  await browser.close();
}

testJoin().catch(console.error);

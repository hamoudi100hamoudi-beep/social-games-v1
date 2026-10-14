import { chromium } from 'playwright';

async function main() {
  console.log('Testing joining Free Draw through real UI flow...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[GameRoom]') || text.includes('Undo') || text.includes('diag') || text.includes('Error')) {
      console.log('BROWSER LOG:', text);
    }
  });

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('freedraw_bucket_undo_diag', '1');
    localStorage.setItem('freedraw_bucket_checkpoint_exp', '1');
  });

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  console.log('Loaded home page.');

  // Fill in nickname directly without waitFor
  const nameInput = page.locator('input[name="nickname_input_random_name"]');
  await nameInput.fill('TesterA');
  console.log('Filled nickname.');

  // Click ROOMS
  const roomsBtn = page.locator('button:has-text("ROOMS")');
  await roomsBtn.click();
  console.log('Clicked ROOMS.');

  // Wait for rooms list and click Free Draw
  const freeDrawBtn = page.locator('button:has-text("Free Draw")');
  await freeDrawBtn.waitFor({ state: 'visible', timeout: 5000 });
  await freeDrawBtn.click();
  console.log('Clicked Free Draw in room list.');

  // Click PLAY in modal
  const playBtn = page.locator('button#room-info-play-btn, button:has-text("PLAY")');
  await playBtn.waitFor({ state: 'visible', timeout: 5000 });
  await playBtn.click();
  console.log('Clicked PLAY button.');

  // Wait for room to enter and check for canvas or start button
  await page.waitForTimeout(3000);

  const state = await page.evaluate(() => {
    const primaryCanvas = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement | null;
    const startBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.innerText.includes('ابدأ الرسم') || b.innerText.includes('انضم للرسم') || b.innerText.includes('العودة للرسم')
    );
    return {
      hasPrimaryCanvas: !!primaryCanvas,
      canvasWidth: primaryCanvas?.width,
      canvasHeight: primaryCanvas?.height,
      hasStartBtn: !!startBtn,
      startBtnText: startBtn?.innerText.trim(),
    };
  });

  console.log('Game Room State:', state);

  if (state.hasStartBtn) {
    const startBtnLocator = page.locator('button:has-text("ابدأ الرسم"), button:has-text("انضم للرسم")');
    await startBtnLocator.first().click();
    console.log('Clicked start/join drawing button.');
    await page.waitForTimeout(2000);
  }

  const drawingState = await page.evaluate(() => {
    const primaryCanvas = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement | null;
    return {
      hasPrimaryCanvas: !!primaryCanvas,
      canvasWidth: primaryCanvas?.width,
      canvasHeight: primaryCanvas?.height,
      canvasVisible: primaryCanvas ? window.getComputedStyle(primaryCanvas).visibility : null,
      canvasPointerEvents: primaryCanvas ? window.getComputedStyle(primaryCanvas).pointerEvents : null,
    };
  });

  console.log('Drawing State after start:', drawingState);

  await browser.close();
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

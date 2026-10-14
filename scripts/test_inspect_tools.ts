import { chromium } from 'playwright';

async function main() {
  console.log('Testing tools menu interaction in Free Draw...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[UndoDiag]') || text.includes('Undo') || text.includes('floodFill') || text.includes('checkpoint')) {
      console.log('DIAG LOG:', text);
    }
  });

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('freedraw_bucket_undo_diag', '1');
    localStorage.setItem('freedraw_bucket_checkpoint_exp', '1');
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

  // Enter room via Lobby
  await page.locator('input[name="nickname_input_random_name"]').fill('TesterA');
  await page.locator('button:has-text("ROOMS")').click();
  await page.locator('button:has-text("Free Draw")').waitFor({ state: 'visible' });
  await page.locator('button:has-text("Free Draw")').click();
  await page.locator('button#room-info-play-btn, button:has-text("PLAY")').click();

  // Wait for GameRoom
  await page.waitForTimeout(2500);

  // Click start drawing button
  const startBtn = page.locator('button:has-text("ابدأ الرسم"), button:has-text("انضم للرسم")');
  if (await startBtn.isVisible()) {
    await startBtn.first().click();
    await page.waitForTimeout(1000);
  }

  // Find tool selector button
  // In the bottom toolbar, there are action buttons.
  const toolsMenuBtn = page.locator('button.bg-white.text-primary-brand, button:has(svg.lucide-pencil)');
  console.log('Clicking tools menu button...');
  await toolsMenuBtn.first().click();
  await page.waitForTimeout(500);

  // Check items in grid-cols-2
  const menuButtons = await page.evaluate(() => {
    const popup = document.querySelector('div.grid.grid-cols-2');
    if (!popup) return null;
    const btns = Array.from(popup.querySelectorAll('button')).map((b, idx) => {
      const svgs = Array.from(b.querySelectorAll('svg')).map(s => s.getAttribute('class') || s.tagName);
      return {
        idx,
        disabled: b.disabled,
        title: b.title,
        ariaLabel: b.getAttribute('aria-label'),
        svgClasses: svgs,
      };
    });
    return btns;
  });

  console.log('Menu buttons found:', JSON.stringify(menuButtons, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

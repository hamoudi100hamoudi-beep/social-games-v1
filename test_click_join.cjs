const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto('http://localhost:3000');
  await page.fill('textarea', 'Tester');
  await page.click('button:has-text("ROOMS")');
  await page.waitForTimeout(500);
  await page.click('button:has-text("Free Draw")');
  await page.waitForTimeout(500);
  await page.click('#room-info-play-btn');
  await page.waitForTimeout(2000);

  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.innerText.includes('ابدأ الرسم') || b.innerText.includes('انضم للرسم'));
    if (btn) {
      btn.click();
      return btn.innerText.trim();
    }
    return null;
  });

  console.log('Clicked button:', clicked);
  await page.waitForTimeout(1000);

  // Check if tools appear
  const toolsInfo = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.map(b => ({
      text: b.innerText.trim(),
      title: b.getAttribute('title'),
      hasSvg: b.querySelector('svg') !== null
    }));
  });
  console.log('Buttons after click:', JSON.stringify(toolsInfo.filter(b => b.hasSvg || b.text), null, 2));

  await browser.close();
  console.log('Test complete');
})().catch(console.error);

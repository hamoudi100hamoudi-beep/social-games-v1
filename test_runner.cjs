const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const pageA = await browser.newPage();
  const pageB = await browser.newPage();

  pageB.on('console', msg => {
    if (msg.text().includes('[DIAG_TRACE]')) {
      console.log('TRACE_B:', msg.text());
    }
  });

  console.log('Navigating pageA...');
  await pageA.goto('http://localhost:3000');
  await pageA.waitForSelector('input[placeholder*="Nickname"], input[placeholder*="الاسم"], input[type="text"]');
  console.log('PageA loaded lobby');

  await browser.close();
  console.log('Test runner done');
})().catch(err => {
  console.error('Error in test runner:', err);
  process.exit(1);
});

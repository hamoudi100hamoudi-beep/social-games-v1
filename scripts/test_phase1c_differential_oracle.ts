import { chromium, Page } from 'playwright';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function joinRoom(page: Page, nickname: string, checkpointExp: string) {
  await page.addInitScript((exp) => {
    localStorage.clear();
    localStorage.setItem('freedraw_bucket_undo_diag', '1');
    localStorage.setItem('freedraw_bucket_checkpoint_exp', exp);
  }, checkpointExp);

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await delay(2000);
  await page.locator('textarea[name="nickname_input_random_name"]').fill(nickname);
  await page.locator('button:has-text("ROOMS")').click();
  
  const freeDrawBtn = page.locator('button:has-text("Free Draw")');
  await freeDrawBtn.waitFor({ state: 'visible', timeout: 5000 });
  await freeDrawBtn.click();

  const playBtn = page.locator('button#room-info-play-btn, button:has-text("PLAY")');
  await playBtn.waitFor({ state: 'visible', timeout: 5000 });
  await playBtn.click();

  await delay(2500);

  const startBtn = page.locator('button:has-text("ابدأ الرسم"), button:has-text("انضم للرسم"), button:has-text("العودة للرسم")');
  if (await startBtn.count() > 0 && await startBtn.first().isVisible()) {
    await startBtn.first().click();
    await delay(1500);
  }
}

async function runScenario(checkpointExp: string) {
  console.log(`\n=== Running Phase 1C Scenario (Checkpoint Exp: ${checkpointExp}) ===`);
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageA = await contextA.newPage();
  const diagLogsA: string[] = [];
  pageA.on('console', msg => {
    const text = msg.text();
    if (text.includes('[UndoDiag]') || text.includes('floodFill') || text.includes('checkpoint')) {
      diagLogsA.push(text);
    }
  });

  console.log('Account A joining...');
  await joinRoom(pageA, 'TesterA', checkpointExp);

  const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageB = await contextB.newPage();
  const diagLogsB: string[] = [];
  pageB.on('console', msg => {
    const text = msg.text();
    if (text.includes('[UndoDiag]') || text.includes('floodFill') || text.includes('checkpoint')) {
      diagLogsB.push(text);
    }
  });

  console.log('Account B joining...');
  await joinRoom(pageB, 'TesterB', checkpointExp);

  // Perform interactions on Canvas A
  console.log('Account A drawing/bucket fills...');
  const canvasA = pageA.locator('#drawing-board-layer-primary');
  const boxA = await canvasA.boundingBox();
  if (boxA) {
    // Click tools menu
    await pageA.locator('button:has(svg.lucide-pencil), button:has(svg.lucide-paint-bucket)').first().click();
    await delay(200);
    // Select bucket
    const bucketBtnA = pageA.locator('div.grid.grid-cols-2 button:has(svg.lucide-paint-bucket)');
    if (await bucketBtnA.isVisible()) {
      await bucketBtnA.click();
      await delay(200);
      for (let i = 0; i < 5; i++) {
        await pageA.mouse.click(boxA.x + 50 + i * 15, boxA.y + 50);
        await delay(100);
      }
    }
  }

  // Perform interactions on Canvas B
  console.log('Account B drawing/bucket fills...');
  const canvasB = pageB.locator('#drawing-board-layer-primary');
  const boxB = await canvasB.boundingBox();
  if (boxB) {
    await pageB.locator('button:has(svg.lucide-pencil), button:has(svg.lucide-paint-bucket)').first().click();
    await delay(200);
    const bucketBtnB = pageB.locator('div.grid.grid-cols-2 button:has(svg.lucide-paint-bucket)');
    if (await bucketBtnB.isVisible()) {
      await bucketBtnB.click();
      await delay(200);
      for (let i = 0; i < 5; i++) {
        await pageB.mouse.click(boxB.x + 200 + i * 15, boxB.y + 100);
        await delay(100);
      }
    }
  }

  await delay(1000);

  // Capture pixels
  const pixelsA = await pageA.evaluate(() => {
    const canvas = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement;
    const ctx = canvas?.getContext('2d');
    const imgData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
    return Array.from(imgData?.data || []);
  });

  const pixelsB = await pageB.evaluate(() => {
    const canvas = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement;
    const ctx = canvas?.getContext('2d');
    const imgData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
    return Array.from(imgData?.data || []);
  });

  let diff = 0;
  for (let i = 0; i < Math.min(pixelsA.length, pixelsB.length); i++) {
    if (pixelsA[i] !== pixelsB[i]) diff++;
  }

  console.log(`Scenario (checkpoint=${checkpointExp}) diff pixels between A and B: ${diff}`);
  console.log(`Diag logs count A: ${diagLogsA.length}, B: ${diagLogsB.length}`);

  await browser.close();
  return { checkpointExp, diff, logsA: diagLogsA.length, logsB: diagLogsB.length };
}

async function main() {
  const r1 = await runScenario('1');
  const r2 = await runScenario('0');
  console.log('\n=== PHASE 1C FINAL SUMMARY ===');
  console.log(JSON.stringify({ r1, r2 }, null, 2));
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

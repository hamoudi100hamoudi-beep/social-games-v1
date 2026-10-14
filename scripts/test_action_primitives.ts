import { chromium } from 'playwright';

async function main() {
  console.log('Testing action primitives (draw, bucket, undo, redo, pixels)...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const undoDiags: any[] = [];

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[FREE_DRAW_UNDO_DIAG]')) {
      try {
        const jsonStr = text.substring(text.indexOf('{'));
        undoDiags.push(JSON.parse(jsonStr));
        console.log('CAPTURED UNDO DIAG:', jsonStr);
      } catch (e) {
        console.log('RAW UNDO DIAG:', text);
      }
    }
  });

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('freedraw_bucket_undo_diag', '1');
    localStorage.setItem('freedraw_bucket_checkpoint_exp', '1');
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

  // 1. Join room
  await page.locator('input[name="nickname_input_random_name"]').fill('ActionTester');
  await page.locator('button:has-text("ROOMS")').click();
  await page.locator('button:has-text("Free Draw")').waitFor({ state: 'visible' });
  await page.locator('button:has-text("Free Draw")').click();
  await page.locator('button#room-info-play-btn, button:has-text("PLAY")').click();

  await page.waitForTimeout(2000);

  // Click start drawing if visible
  const startBtn = page.locator('button:has-text("ابدأ الرسم"), button:has-text("انضم للرسم")');
  if (await startBtn.isVisible()) {
    await startBtn.first().click();
    await page.waitForTimeout(1000);
  }

  // 2. Measure initial pixels
  const initialPixelsBase64 = await page.evaluate(() => {
    const canvas = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // count non-zero pixels
    let nonZero = 0;
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i + 3] > 0) nonZero++;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      nonZero,
    };
  });
  console.log('Initial Canvas:', initialPixelsBase64);

  // 3. Draw a line with Pencil
  const canvasLocator = page.locator('#drawing-board-layer-primary');
  const box = await canvasLocator.boundingBox();
  if (!box) throw new Error('Canvas not found');

  console.log('Canvas bounding box:', box);

  // Draw stroke from (100, 100) to (200, 200)
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const strokePixels = await page.evaluate(() => {
    const canvas = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let nonZero = 0;
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i + 3] > 0) nonZero++;
    }
    return { nonZero };
  });
  console.log('After Stroke Canvas Non-Zero Pixels:', strokePixels);

  // 4. Select Bucket Tool
  // Open tools menu
  const menuBtn = page.locator('button.bg-white.text-primary-brand, button:has(svg.lucide-pencil)').first();
  await menuBtn.click();
  await page.waitForTimeout(300);

  // Click bucket
  const bucketBtn = page.locator('button:has(svg.lucide-paint-bucket)').first();
  await bucketBtn.click();
  await page.waitForTimeout(300);

  // Click canvas to fill background
  await page.mouse.click(box.x + 50, box.y + 50);
  await page.waitForTimeout(600);

  const bucketPixels = await page.evaluate(() => {
    const canvas = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let nonZero = 0;
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i + 3] > 0) nonZero++;
    }
    return { nonZero };
  });
  console.log('After Bucket Canvas Non-Zero Pixels:', bucketPixels);

  // 5. Perform Undo (undo bucket)
  // Open tools menu
  await menuBtn.click();
  await page.waitForTimeout(300);
  const undoBtn = page.locator('button:has(svg.lucide-undo-2)').first();
  await undoBtn.click();
  await page.waitForTimeout(600);

  const afterUndoPixels = await page.evaluate(() => {
    const canvas = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let nonZero = 0;
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i + 3] > 0) nonZero++;
    }
    return { nonZero };
  });
  console.log('After Undo Bucket Non-Zero Pixels (should match after stroke):', afterUndoPixels);

  // 6. Perform Redo (redo bucket)
  const redoBtn = page.locator('button:has(svg.lucide-redo-2)').first();
  await redoBtn.click();
  await page.waitForTimeout(600);

  const afterRedoPixels = await page.evaluate(() => {
    const canvas = document.getElementById('drawing-board-layer-primary') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let nonZero = 0;
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i + 3] > 0) nonZero++;
    }
    return { nonZero };
  });
  console.log('After Redo Bucket Non-Zero Pixels (should match after bucket):', afterRedoPixels);

  console.log('Total Captured Undo Diagnostics:', undoDiags.length);

  await browser.close();
}

main().catch((err) => {
  console.error('Primitive test failed:', err);
  process.exit(1);
});

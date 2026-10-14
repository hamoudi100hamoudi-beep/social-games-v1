import { chromium } from 'playwright';

async function main() {
  console.log('=== Phase 1B Browser Runtime Verification ===');
  let browser;
  try {
    console.log('1. Launching Chromium in headless mode...');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    console.log('-> Chromium launched successfully.');

    console.log('2. Creating new browser context and page...');
    const context = await browser.newContext();
    const page = await context.newPage();
    console.log('-> Page context created.');

    console.log('3. Creating HTML5 Canvas in browser page and testing 2D context...');
    const canvasResult = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return { success: false, error: 'Failed to get 2d context' };
      }

      // Fill background with white
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 400, 300);

      // Draw red rectangle at (10, 10, 50, 50)
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(10, 10, 50, 50);

      // Read pixel inside the red rectangle (20, 20)
      const redPixel = ctx.getImageData(20, 20, 1, 1).data;

      // Read pixel outside the red rectangle (100, 100)
      const whitePixel = ctx.getImageData(100, 100, 1, 1).data;

      return {
        success: true,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        redPixel: Array.from(redPixel),
        whitePixel: Array.from(whitePixel)
      };
    });

    console.log('-> Canvas Evaluation Result:', JSON.stringify(canvasResult, null, 2));

    const isRed =
      canvasResult.redPixel[0] === 255 &&
      canvasResult.redPixel[1] === 0 &&
      canvasResult.redPixel[2] === 0 &&
      canvasResult.redPixel[3] === 255;

    const isWhite =
      canvasResult.whitePixel[0] === 255 &&
      canvasResult.whitePixel[1] === 255 &&
      canvasResult.whitePixel[2] === 255 &&
      canvasResult.whitePixel[3] === 255;

    if (!canvasResult.success || !isRed || !isWhite) {
      throw new Error(`Pixel verification failed: red=${canvasResult.redPixel}, white=${canvasResult.whitePixel}`);
    }

    console.log('4. Pixel verification PASSED: Red pixel is [255, 0, 0, 255] and White pixel is [255, 255, 255, 255].');

    console.log('5. Closing browser and verifying clean shutdown...');
    await context.close();
    await browser.close();
    browser = null;
    console.log('-> Browser closed cleanly without process leaks.');

    console.log('=== ALL RUNTIME VERIFICATION CHECKS PASSED ===');
    process.exit(0);
  } catch (err: any) {
    console.error('VERIFICATION ERROR:', err);
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        // ignore
      }
    }
    process.exit(1);
  }
}

main();

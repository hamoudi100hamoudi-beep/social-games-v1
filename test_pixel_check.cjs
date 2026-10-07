const { chromium } = require('playwright');

async function testPixel(name, roomName, isFreeDraw, isShape, bucketLoc) {
  const browser = await chromium.launch({ headless: true });
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const tracesB = [];
  pageB.on('console', msg => {
    const text = msg.text();
    if (text.includes('[DIAG_TRACE]')) {
      tracesB.push(text);
      console.log(`[${name} B TRACE]:`, text);
    }
  });

  const randA = 'UserA_' + Math.random().toString(36).slice(2, 6);
  const randB = 'UserB_' + Math.random().toString(36).slice(2, 6);

  await pageA.goto('http://localhost:3000');
  await pageA.fill('textarea', randA);
  await pageA.click('button:has-text("ROOMS")');
  await pageA.waitForTimeout(400);
  await pageA.click(`button:has-text("${roomName}")`);
  await pageA.waitForTimeout(400);
  await pageA.click('#room-info-play-btn');

  await pageB.goto('http://localhost:3000');
  await pageB.fill('textarea', randB);
  await pageB.click('button:has-text("ROOMS")');
  await pageB.waitForTimeout(400);
  await pageB.click(`button:has-text("${roomName}")`);
  await pageB.waitForTimeout(400);
  await pageB.click('#room-info-play-btn');

  await pageA.waitForTimeout(2000);
  await pageB.waitForTimeout(2000);

  let drawerPage = pageA;
  let viewerPage = pageB;

  if (isFreeDraw) {
    await drawerPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.innerText.includes('ابدأ الرسم') || b.innerText.includes('انضم للرسم'));
      if (btn) btn.click();
    });
    await drawerPage.waitForTimeout(1000);
  } else {
    // Experimental room
    await drawerPage.waitForTimeout(1500);
    const isADrawer = await drawerPage.locator('text=Choose a word to draw').isVisible().catch(() => false);
    const isBDrawer = await viewerPage.locator('text=Choose a word to draw').isVisible().catch(() => false);
    if (isBDrawer && !isADrawer) {
      drawerPage = pageB;
      viewerPage = pageA;
      viewerPage.on('console', msg => {
        const text = msg.text();
        if (text.includes('[DIAG_TRACE]')) {
          tracesB.push(text);
          console.log(`[${name} VIEWER TRACE]:`, text);
        }
      });
    }
    const wordBtns = drawerPage.locator('div:has-text("IT\'S YOUR TURN!") ~ div button, div:has-text("Choose a word") ~ * button');
    if (await wordBtns.count() > 0) {
      await wordBtns.first().click();
    } else {
      const anyModalBtn = drawerPage.locator('.fixed button');
      if (await anyModalBtn.count() > 0) {
        await anyModalBtn.first().click();
      }
    }
    await drawerPage.waitForTimeout(1000);
  }

  async function chooseTool(toolIdx) {
    await drawerPage.evaluate(() => {
      const toolbar = document.querySelector('.bg-game-primary-blue');
      const btns = Array.from(toolbar.querySelectorAll('button'));
      btns[1].click();
    });
    await drawerPage.waitForTimeout(300);
    await drawerPage.evaluate((idx) => {
      const popup = document.querySelector('.absolute.bottom-\\[56px\\]');
      const btns = Array.from(popup.querySelectorAll('button'));
      btns[idx].click();
    }, toolIdx);
    await drawerPage.waitForTimeout(300);
  }

  async function getPixelColor(page, x, y) {
    return await page.evaluate(({ px, py }) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const ctx = canvas.getContext('2d');
      const p = ctx.getImageData(Math.floor((px - rect.left) * scaleX), Math.floor((py - rect.top) * scaleY), 1, 1).data;
      return { r: p[0], g: p[1], b: p[2], a: p[3] };
    }, { px: x, py: y });
  }

  const canvasA = drawerPage.locator('canvas').first();
  const box = await canvasA.boundingBox();

  const cX1 = box.x + 150;
  const cY1 = box.y + 150;
  const cX2 = box.x + 250;
  const cY2 = box.y + 250;
  const insideX = (cX1 + cX2) / 2;
  const insideY = (cY1 + cY2) / 2;
  const outsideX = box.x + 350;
  const outsideY = box.y + 350;

  if (isShape) {
    await chooseTool(5); // strokeCircle
    await drawerPage.mouse.move(cX1, cY1);
    await drawerPage.mouse.down();
    await drawerPage.mouse.move(cX2, cY2, { steps: 5 });
    await drawerPage.mouse.up();
  } else {
    await chooseTool(0); // pencil
    const r = 50;
    const centerX = 200;
    const centerY = 200;
    await drawerPage.mouse.move(box.x + centerX + r, box.y + centerY);
    await drawerPage.mouse.down();
    const steps = 30;
    for (let i = 1; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const px = box.x + centerX + Math.cos(angle) * r;
      const py = box.y + centerY + Math.sin(angle) * r;
      await drawerPage.mouse.move(px, py);
    }
    await drawerPage.mouse.up();
  }

  await drawerPage.waitForTimeout(600);
  await viewerPage.waitForTimeout(600);

  const pixBeforeA = await getPixelColor(drawerPage, insideX, insideY);
  const pixBeforeB = await getPixelColor(viewerPage, insideX, insideY);
  console.log(`[${name}] Pixel BEFORE Bucket: Drawer=`, pixBeforeA, 'Viewer=', pixBeforeB);

  // Bucket
  await chooseTool(6); // bucket
  const targetX = bucketLoc === 'inside' ? insideX : outsideX;
  const targetY = bucketLoc === 'inside' ? insideY : outsideY;
  await drawerPage.mouse.move(targetX, targetY);
  await drawerPage.mouse.down();
  await drawerPage.mouse.up();

  await drawerPage.waitForTimeout(600);
  await viewerPage.waitForTimeout(600);

  const pixAfterBucketA = await getPixelColor(drawerPage, insideX, insideY);
  const pixAfterBucketB = await getPixelColor(viewerPage, insideX, insideY);
  console.log(`[${name}] Pixel AFTER Bucket: Drawer=`, pixAfterBucketA, 'Viewer=', pixAfterBucketB);

  // Undo
  await chooseTool(10); // undo
  await drawerPage.waitForTimeout(1000);
  await viewerPage.waitForTimeout(1000);

  const pixAfterUndoA = await getPixelColor(drawerPage, insideX, insideY);
  const pixAfterUndoB = await getPixelColor(viewerPage, insideX, insideY);
  console.log(`[${name}] Pixel AFTER Undo: Drawer=`, pixAfterUndoA, 'Viewer=', pixAfterUndoB);

  await browser.close();
  return {
    name,
    tracesB,
    pixBeforeA,
    pixBeforeB,
    pixAfterBucketA,
    pixAfterBucketB,
    pixAfterUndoA,
    pixAfterUndoB
  };
}

async function main() {
  console.log('=== TEST 1: Free Draw - Shape Circle - Bucket Inside ===');
  await testPixel('Test1_FreeDraw_Shape_Inside', 'Free Draw', true, true, 'inside');

  console.log('\n=== TEST 2: Free Draw - Freehand Circle - Bucket Inside ===');
  await testPixel('Test2_FreeDraw_Freehand_Inside', 'Free Draw', true, false, 'inside');

  console.log('\n=== TEST 3: Free Draw - Shape Circle - Bucket Outside ===');
  await testPixel('Test3_FreeDraw_Shape_Outside', 'Free Draw', true, true, 'outside');

  console.log('\n=== TEST 4: Experimental - Shape Circle - Bucket Inside ===');
  await testPixel('Test4_Exp_Shape_Inside', 'Experimental Draw', false, true, 'inside');

  console.log('\n=== TEST 5: Experimental - Freehand Circle - Bucket Inside ===');
  await testPixel('Test5_Exp_Freehand_Inside', 'Experimental Draw', false, false, 'inside');
}

main().catch(console.error);

const { chromium } = require('playwright');

async function runSuite() {
  const browser = await chromium.launch({ headless: true });

  async function createRoom(roomName, isFreeDraw) {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const logsB = [];
    pageB.on('console', msg => {
      const txt = msg.text();
      if (txt.includes('[BucketBarrier]') || txt.includes('[DIAG_TRACE]')) {
        logsB.push(txt);
        console.log('TRACE_B:', txt);
      }
    });

    const randA = 'A_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);
    const randB = 'B_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);

    await pageA.goto('http://localhost:3000');
    await pageA.fill('textarea', randA);
    await pageA.click('button:has-text("ROOMS")');
    await pageA.waitForTimeout(300);
    await pageA.click(`button:has-text("${roomName}")`);
    await pageA.waitForTimeout(300);
    await pageA.click('#room-info-play-btn');

    await pageB.goto('http://localhost:3000');
    await pageB.fill('textarea', randB);
    await pageB.click('button:has-text("ROOMS")');
    await pageB.waitForTimeout(300);
    await pageB.click(`button:has-text("${roomName}")`);
    await pageB.waitForTimeout(300);
    await pageB.click('#room-info-play-btn');

    await pageA.waitForTimeout(2000);
    await pageB.waitForTimeout(2000);

    let drawer = pageA;
    let viewer = pageB;

    if (isFreeDraw) {
      await drawer.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText.includes('ابدأ الرسم') || b.innerText.includes('انضم للرسم'));
        if (btn) btn.click();
      });
      await drawer.waitForTimeout(1000);
    } else {
      await drawer.waitForTimeout(1500);
      const isADrawer = await drawer.locator('text=Choose a word to draw').isVisible().catch(() => false);
      const isBDrawer = await viewer.locator('text=Choose a word to draw').isVisible().catch(() => false);
      if (isBDrawer && !isADrawer) {
        drawer = pageB;
        viewer = pageA;
        viewer.on('console', msg => {
          const txt = msg.text();
          if (txt.includes('[BucketBarrier]') || txt.includes('[DIAG_TRACE]')) {
            logsB.push(txt);
            console.log('TRACE_VIEWER:', txt);
          }
        });
      }
      const wordBtns = drawer.locator('div:has-text("IT\'S YOUR TURN!") ~ div button, div:has-text("Choose a word") ~ * button');
      if (await wordBtns.count() > 0) {
        await wordBtns.first().click();
      } else {
        const anyModalBtn = drawer.locator('.fixed button');
        if (await anyModalBtn.count() > 0) {
          await anyModalBtn.first().click();
        }
      }
      await drawer.waitForTimeout(1000);
    }

    async function selectTool(idx) {
      await drawer.evaluate(() => {
        const toolbar = document.querySelector('.bg-game-primary-blue');
        if (!toolbar) return;
        const btns = Array.from(toolbar.querySelectorAll('button'));
        if (btns[1]) btns[1].click();
      });
      await drawer.waitForTimeout(250);
      await drawer.evaluate((i) => {
        const popup = document.querySelector('.absolute.bottom-\\[56px\\]');
        if (!popup) return;
        const btns = Array.from(popup.querySelectorAll('button'));
        if (btns[i]) btns[i].click();
      }, idx);
      await drawer.waitForTimeout(250);
    }

    async function getCanvasPixel(page, x, y) {
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

    return { contextA, contextB, drawer, viewer, selectTool, getCanvasPixel, logsB };
  }

  console.log('\n--- Running Test 1 (Free Draw, Shape Circle, Inside Bucket, Undo) ---');
  {
    const room = await createRoom('Free Draw', true);
    const canvas = room.drawer.locator('canvas').first();
    const box = await canvas.boundingBox();
    const cX1 = box.x + 150, cY1 = box.y + 150;
    const cX2 = box.x + 250, cY2 = box.y + 250;
    const insideX = (cX1 + cX2) / 2, insideY = (cY1 + cY2) / 2;

    await room.selectTool(5); // strokeCircle
    await room.drawer.mouse.move(cX1, cY1);
    await room.drawer.mouse.down();
    await room.drawer.mouse.move(cX2, cY2, { steps: 5 });
    await room.drawer.mouse.up();
    await room.drawer.waitForTimeout(600);

    await room.selectTool(6); // bucket
    await room.drawer.mouse.move(insideX, insideY);
    await room.drawer.mouse.down();
    await room.drawer.mouse.up();
    await room.drawer.waitForTimeout(600);

    const pixAfterBucketA = await room.getCanvasPixel(room.drawer, insideX, insideY);
    console.log('T1: After Bucket on A:', pixAfterBucketA);

    await room.selectTool(10); // undo
    await room.drawer.waitForTimeout(800);
    await room.viewer.waitForTimeout(800);

    const pixAfterUndoA = await room.getCanvasPixel(room.drawer, insideX, insideY);
    const pixAfterUndoB = await room.getCanvasPixel(room.viewer, insideX, insideY);
    console.log('T1: After Undo -> A:', pixAfterUndoA, 'B:', pixAfterUndoB);
    await room.contextA.close();
    await room.contextB.close();
  }

  console.log('\n--- Running Test 2 (Free Draw, Freehand Circle, Inside Bucket, Undo) ---');
  {
    const room = await createRoom('Free Draw', true);
    const canvas = room.drawer.locator('canvas').first();
    const box = await canvas.boundingBox();
    const centerX = 200, centerY = 200, r = 50;
    const insideX = box.x + centerX, insideY = box.y + centerY;

    await room.selectTool(0); // pencil
    await room.drawer.mouse.move(box.x + centerX + r, box.y + centerY);
    await room.drawer.mouse.down();
    for (let i = 1; i <= 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const px = box.x + centerX + Math.cos(angle) * r;
      const py = box.y + centerY + Math.sin(angle) * r;
      await room.drawer.mouse.move(px, py);
    }
    await room.drawer.mouse.up();
    await room.drawer.waitForTimeout(300); // Bucket sent quickly while draining

    await room.selectTool(6); // bucket
    await room.drawer.mouse.move(insideX, insideY);
    await room.drawer.mouse.down();
    await room.drawer.mouse.up();
    await room.drawer.waitForTimeout(600);

    await room.selectTool(10); // undo
    await room.drawer.waitForTimeout(800);
    await room.viewer.waitForTimeout(800);

    const pixAfterUndoA = await room.getCanvasPixel(room.drawer, insideX, insideY);
    const pixAfterUndoB = await room.getCanvasPixel(room.viewer, insideX, insideY);
    console.log('T2: After Undo -> A:', pixAfterUndoA, 'B:', pixAfterUndoB);
    await room.contextA.close();
    await room.contextB.close();
  }

  console.log('\n--- Running Test 3 (Free Draw, Shape Circle, Outside Bucket, Undo) ---');
  {
    const room = await createRoom('Free Draw', true);
    const canvas = room.drawer.locator('canvas').first();
    const box = await canvas.boundingBox();
    const cX1 = box.x + 150, cY1 = box.y + 150;
    const cX2 = box.x + 250, cY2 = box.y + 250;
    const outsideX = box.x + 350, outsideY = box.y + 350;

    await room.selectTool(5); // strokeCircle
    await room.drawer.mouse.move(cX1, cY1);
    await room.drawer.mouse.down();
    await room.drawer.mouse.move(cX2, cY2, { steps: 5 });
    await room.drawer.mouse.up();
    await room.drawer.waitForTimeout(600);

    await room.selectTool(6); // bucket
    await room.drawer.mouse.move(outsideX, outsideY);
    await room.drawer.mouse.down();
    await room.drawer.mouse.up();
    await room.drawer.waitForTimeout(600);

    await room.selectTool(10); // undo
    await room.drawer.waitForTimeout(800);
    await room.viewer.waitForTimeout(800);

    const pixAfterUndoA = await room.getCanvasPixel(room.drawer, outsideX, outsideY);
    const pixAfterUndoB = await room.getCanvasPixel(room.viewer, outsideX, outsideY);
    console.log('T3: After Undo -> A:', pixAfterUndoA, 'B:', pixAfterUndoB);
    await room.contextA.close();
    await room.contextB.close();
  }

  console.log('\n--- Running Test 4 (Free Draw, Multi-Bucket Sequential Undo) ---');
  {
    const room = await createRoom('Free Draw', true);
    const canvas = room.drawer.locator('canvas').first();
    const box = await canvas.boundingBox();
    const cX1 = box.x + 150, cY1 = box.y + 150;
    const cX2 = box.x + 250, cY2 = box.y + 250;
    const insideX = (cX1 + cX2) / 2, insideY = (cY1 + cY2) / 2;
    const outsideX = box.x + 350, outsideY = box.y + 350;

    await room.selectTool(5); // strokeCircle
    await room.drawer.mouse.move(cX1, cY1);
    await room.drawer.mouse.down();
    await room.drawer.mouse.move(cX2, cY2, { steps: 5 });
    await room.drawer.mouse.up();
    await room.drawer.waitForTimeout(600);

    await room.selectTool(6); // bucket 1 inside
    await room.drawer.mouse.move(insideX, insideY);
    await room.drawer.mouse.down();
    await room.drawer.mouse.up();
    await room.drawer.waitForTimeout(600);

    await room.drawer.mouse.move(outsideX, outsideY); // bucket 2 outside
    await room.drawer.mouse.down();
    await room.drawer.mouse.up();
    await room.drawer.waitForTimeout(600);

    await room.selectTool(10); // undo bucket 2
    await room.drawer.waitForTimeout(800);
    await room.viewer.waitForTimeout(800);

    const insideAfterA = await room.getCanvasPixel(room.drawer, insideX, insideY);
    const insideAfterB = await room.getCanvasPixel(room.viewer, insideX, insideY);
    const outsideAfterA = await room.getCanvasPixel(room.drawer, outsideX, outsideY);
    const outsideAfterB = await room.getCanvasPixel(room.viewer, outsideX, outsideY);
    console.log('T4: Multi-Bucket -> Inside A:', insideAfterA, 'B:', insideAfterB, '| Outside A:', outsideAfterA, 'B:', outsideAfterB);
    await room.contextA.close();
    await room.contextB.close();
  }

  await browser.close();
  console.log('\n--- All Automated Verification Tests Finished ---');
}

runSuite().catch(console.error);

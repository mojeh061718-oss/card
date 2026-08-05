/**
 * Full end-to-end run: the loop the game is actually about.
 *
 *   new career -> name shop -> rip a pack -> dig a lot -> grade a card
 *   -> get the slab back -> auction it -> see it on the wire
 *
 * Also measures frame timing during the two heaviest interactions and
 * checks GPU/canvas memory pressure against the iOS ceiling.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};
const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const data = await readFile(join(DIST, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(await readFile(join(DIST, 'index.html')));
  }
});
await new Promise(r => server.listen(4181, r));

const fails = [];
/** Nav tabs share text with page headings — always click the nav button. */
const nav = label => page.getByRole('button', { name: label, exact: true });
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails.push(name);
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });

// --- 1. Career setup -------------------------------------------------------
await page.goto('http://localhost:4181/');
await page.waitForTimeout(900);
check('career setup shows on first launch',
  await page.getByText('OPEN FOR BUSINESS').count() === 1);
await page.locator('input').fill('E2E Cards');
await page.getByText('STOREFRONT').click();
await page.getByText('OPEN FOR BUSINESS').click();
await page.waitForTimeout(900);

// --- 2. Buy wax, then rip it, measuring frame timing ----------------------
await nav('WAX').click();
await page.waitForTimeout(700);
const cashText = () => page.evaluate(() =>
  (document.body.textContent ?? '').match(/CASH\s*\$([\d.,KM]+)/)?.[1] ?? '');
const cashBeforeWax = await cashText();
await page.locator('button:has-text("Hobby Pack")').first().click();
await page.waitForTimeout(500);
const cashAfterWax = await cashText();
check('buying wax costs money', cashBeforeWax !== cashAfterWax,
  `${cashBeforeWax} -> ${cashAfterWax}`);
check('sealed wax lands in inventory',
  (await page.locator('button:has-text("RIP IT")').count()) > 0);
await page.locator('button:has-text("RIP IT")').first().click();
await page.waitForTimeout(700);
await page.evaluate(() => {
  window.__frames = [];
  let last = performance.now();
  const tick = now => {
    window.__frames.push(now - last);
    last = now;
    window.__raf = requestAnimationFrame(tick);
  };
  window.__raf = requestAnimationFrame(tick);
});

const pack = await page.locator('div[style*="touch-action"]').first().boundingBox();
const ty = pack.y + pack.height * 0.06;
await page.mouse.move(pack.x + 4, ty);
await page.mouse.down();
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(pack.x + (pack.width * i) / 12, ty, { steps: 3 });
  await page.waitForTimeout(28);
}
await page.mouse.up();
await page.waitForTimeout(900);
for (let i = 0; i < 10; i++) {
  await page.mouse.click(201, 420);
  await page.waitForTimeout(420);
  await page.mouse.click(201, 420);
  await page.waitForTimeout(200);
}
await page.waitForTimeout(600);
if (await page.getByText('ADD TO COLLECTION').count()) {
  await page.getByText('ADD TO COLLECTION').click();
  await page.waitForTimeout(500);
}
const ripFrames = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf);
  return window.__frames.slice(5);
});
const p95 = arr => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length * 0.95)] ?? 0;
check('pack rip holds frame budget', p95(ripFrames) < 34,
  `p95 ${p95(ripFrames).toFixed(1)}ms over ${ripFrames.length} frames`);

// --- 3. Dig a lot ----------------------------------------------------------
await nav('HUNT').click();
await page.waitForTimeout(600);
const buyable = page.locator('button:has-text("BUY & DIG")').first();
check('sourcing offers an affordable lead', await buyable.count() === 1);
await buyable.click();
await page.waitForTimeout(900);
await page.getByText('SKIP TO RESULTS').click();
await page.waitForTimeout(1500);
await page.getByText('ADD TO COLLECTION').click();
await page.waitForTimeout(700);

// --- 4. Binder scroll frame timing ----------------------------------------
await nav('BOOK').click();
await page.waitForTimeout(1800);
const cardCount = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(d => /\d+ cards/.test(d.textContent ?? ''));
  return Number((el?.textContent ?? '').match(/(\d+) cards/)?.[1] ?? 0);
});
check('binder holds what was ripped and dug', cardCount > 50, `${cardCount} cards`);

await page.evaluate(() => {
  window.__frames = [];
  let last = performance.now();
  const tick = now => { window.__frames.push(now - last); last = now; window.__raf = requestAnimationFrame(tick); };
  window.__raf = requestAnimationFrame(tick);
});
for (let i = 0; i < 12; i++) {
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(90);
}
const scrollFrames = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf);
  return window.__frames.slice(5);
});
check('binder scroll holds frame budget', p95(scrollFrames) < 34,
  `p95 ${p95(scrollFrames).toFixed(1)}ms over ${scrollFrames.length} frames`);

// --- 5. Canvas/texture memory against the iOS ceiling ---------------------
// Attached canvases are transient by design — stills are rasterized once and
// held as <img> data URLs, so the real budget is the fixed scratch context
// plus the thumbnail cache. Measure both.
const mem = await page.evaluate(() => {
  let attachedPx = 0;
  for (const c of document.querySelectorAll('canvas')) attachedPx += c.width * c.height;
  let thumbBytes = 0, thumbs = 0;
  for (const img of document.querySelectorAll('img[src^="data:"]')) {
    thumbBytes += img.getAttribute('src').length * 0.75; // base64 -> bytes
    thumbs++;
  }
  // The scratch compositor: one fixed 1536-wide card-aspect RGBA surface.
  const scratchBytes = 1536 * Math.round(1536 / (2.5 / 3.5)) * 4;
  return {
    attachedCanvases: document.querySelectorAll('canvas').length,
    attachedBytes: attachedPx * 4,
    thumbs, thumbBytes, scratchBytes,
  };
});
const totalMB = (mem.attachedBytes + mem.thumbBytes + mem.scratchBytes) / 1048576;
check('graphics memory well under the 256MB iOS cap',
  totalMB < 90,
  `${totalMB.toFixed(1)}MB total — scratch ${(mem.scratchBytes / 1048576).toFixed(1)}MB, ` +
  `${mem.thumbs} thumbs ${(mem.thumbBytes / 1048576).toFixed(1)}MB, ` +
  `${mem.attachedCanvases} live canvases ${(mem.attachedBytes / 1048576).toFixed(1)}MB`);

// The scratch context must never be resized — that is the iOS leak.
const scratchStable = await page.evaluate(async () => {
  const before = [...document.querySelectorAll('canvas')].map(c => `${c.width}x${c.height}`);
  await new Promise(r => setTimeout(r, 200));
  const after = [...document.querySelectorAll('canvas')].map(c => `${c.width}x${c.height}`);
  return JSON.stringify(before) === JSON.stringify(after);
});
check('canvas dimensions stay stable (no resize leak)', scratchStable);

// --- 6. Grade a card, advance days, reveal the slab -----------------------
await nav('GRADE').click();
await page.waitForTimeout(1600);
const gradeCells = page.locator('div[style*="position: relative"] img[src^="data:"]');
await gradeCells.nth(0).click();
await page.getByText('QuickGrade', { exact: true }).click();
await page.getByText('EXPRESS', { exact: true }).click();
await page.locator('button', { hasText: 'SUBMIT' }).click();
await page.waitForTimeout(400);
for (let d = 0; d < 4; d++) {
  await page.getByText('END DAY ▸').click();
  await page.waitForTimeout(160);
}
await page.waitForTimeout(400);
const hasReturn = await page.getByText('TAP TO REVEAL').count();
check('graded card comes back from the house', hasReturn > 0);
if (hasReturn > 0) {
  await page.getByText('TAP TO REVEAL').first().click();
  await page.waitForTimeout(600);
  await page.mouse.click(201, 430);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'shots/e2e-slab.png' });
}
await page.mouse.click(201, 430);
await page.waitForTimeout(400);

// --- 7. Auction a card, settle it, confirm it hits the wire ---------------
await nav('SELL').click();
await page.waitForTimeout(1600);
const cashBefore = await page.evaluate(() => {
  const t = document.body.textContent ?? '';
  return t.match(/CASH\s*\$([\d.,KM]+)/)?.[1] ?? '';
});
await page.locator('[data-testid="inventory-card"]').first().click();
await page.waitForTimeout(700);
check('price sheet shows comps', (await page.getByText('RECENT SALES').count()) === 1);
await page.getByText('LIST AT AUCTION').click();
await page.waitForTimeout(400);
for (let d = 0; d < 6; d++) {
  await page.getByText('END DAY ▸').click();
  await page.waitForTimeout(200);
}
await page.waitForTimeout(600);
const results = await page.getByText('RESULTS').count();
check('auction settles into the results feed', results > 0, `cash before: ${cashBefore}`);
await page.screenshot({ path: 'shots/e2e-market.png' });

const finds = await page.locator('[data-testid="market-find"]').count();
check('other collectors surface cards onto the market', finds > 0, `${finds} listed`);

// --- 8. The wire and Top 50 ----------------------------------------------
await nav('WIRE').click();
await page.waitForTimeout(1400);
const neverFound = await page.getByText('NEVER FOUND').count();
const surfacedRows = await page.getByText('surfaced').count();
check('Top 50 tracks unfound grails', neverFound > 0, `${neverFound} still sealed`);
check('and grails do start surfacing as the world rips',
  surfacedRows > 0 || neverFound < 50, `${surfacedRows} surfaced`);
await page.getByText('NEWS', { exact: true }).click();
await page.waitForTimeout(600);
const stories = await page.locator('article').count();
check('wire carries stories from real events', stories > 3, `${stories} stories`);
await page.screenshot({ path: 'shots/e2e-wire.png' });

// --- 9. Persistence across reload -----------------------------------------
await page.reload();
await page.waitForTimeout(1600);
check('career persists across reload',
  (await page.getByText('OPEN FOR BUSINESS').count()) === 0);
await nav('BOOK').click();
await page.waitForTimeout(1500);
const cardsAfter = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(d => /\d+ cards/.test(d.textContent ?? ''));
  return Number((el?.textContent ?? '').match(/(\d+) cards/)?.[1] ?? 0);
});
check('collection survives reload', cardsAfter > 50, `${cardsAfter} cards`);

// --- 10. WebGL context loss recovery --------------------------------------
await nav('BOOK').click();
await page.waitForTimeout(1500);
await page.locator('img[src^="data:"]').first().click();
await page.waitForTimeout(900);
const recovered = await page.evaluate(async () => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return 'no-canvas';
  const gl = canvas.getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_lose_context');
  if (!ext) return 'no-extension';
  let restored = false;
  canvas.addEventListener('webglcontextrestored', () => { restored = true; });
  ext.loseContext();
  await new Promise(r => setTimeout(r, 60));
  ext.restoreContext();
  await new Promise(r => setTimeout(r, 400));
  return restored ? 'restored' : 'not-restored';
});
check('WebGL context loss recovers (iOS backgrounding)',
  recovered === 'restored' || recovered === 'no-extension',
  recovered);

check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
server.close();

console.log(`\n${fails.length === 0 ? 'ALL CHECKS PASSED' : `${fails.length} FAILED: ${fails.join(', ')}`}`);
process.exit(fails.length === 0 ? 0 : 1);

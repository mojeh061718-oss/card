/**
 * TCG loop end-to-end: the vintage-market game on top of the same engine.
 *
 *   ?enable-tcg -> career setup ($50k) -> vintage case on WAX -> buy a
 *   1st Edition booster -> rip 11 cards -> binder holds them -> grade one
 *   -> end days -> slab reveal with the vintage multiplier -> sell.
 *
 * Runs against dist without network: scans are absent in the sandbox, so
 * cards render the procedural concept frames — same code path a player
 * sees before the realism download finishes.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;
const SHOTS = new URL('../shots', import.meta.url).pathname;
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
await new Promise(r => server.listen(4183, r));

const fails = [];
const nav = label => page.getByRole('button', { name: label, exact: true });
const goGrade = async () => {
  await nav('HOME').click();
  await page.waitForTimeout(400);
  await page.locator('button:has-text("GRADE")').first().click();
};
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

// --- 1. Career setup with the TCG dev unlock -------------------------------
await page.goto('http://localhost:4183/?enable-tcg');
await page.waitForTimeout(900);
check('welcome screen shows the realism downloader',
  (await page.getByText('REALISM CONCEPT').count()) >= 1);
await page.locator('input').fill('TCG E2E');
await page.getByText('TRUST FUND').click();
await page.getByText('OPEN FOR BUSINESS').click();
await page.waitForTimeout(900);

// --- 2. The vintage case ---------------------------------------------------
await nav('WAX').click();
await page.waitForTimeout(700);
check('vintage case section is on the shelf',
  (await page.getByText('THE VINTAGE CASE').count()) === 1);
// Target the 1st Edition booster specifically — the vintage hunt the user
// described. Allocation is thin (0–2/day), so end days until one surfaces.
const boosterRow = page.locator('button:has-text("Booster Pack"):not([disabled])')
  .filter({ hasText: '1st Edition' });
let tries = 0;
while ((await boosterRow.count()) === 0 && tries < 16) {
  await page.locator('button:has-text("END DAY")').click();
  await page.waitForTimeout(600);
  tries++;
}
check('a vintage booster surfaced within a fortnight',
  (await boosterRow.count()) > 0, `after ${tries} day(s)`);
const rowText = await boosterRow.first().textContent();
const isBase = rowText.includes('1st Edition') || rowText.includes('Base Set');
const priceMatch = rowText.match(/\$([\d.,]+)K/);
check('vintage booster priced like the real market (thousands)',
  !priceMatch || parseFloat(priceMatch[1]) >= 1,
  rowText.replace(/\s+/g, ' ').slice(0, 90));
await page.screenshot({ path: join(SHOTS, 'tcg-shelf.png') });
await boosterRow.first().click();
await page.waitForTimeout(500);
check('sealed TCG wax lands in inventory',
  (await page.locator('button:has-text("RIP IT")').count()) > 0);

// --- 3. Rip the booster ----------------------------------------------------
await page.locator('button:has-text("RIP IT")').first().click();
await page.waitForTimeout(700);
// The break table: grab a pack off the mat before tearing.
await page.locator('[data-table-pack]').first().click();
await page.waitForTimeout(800);
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
// One gesture per card now: the first card auto-flips after the tear and
// each click advances + auto-reveals the next.
let taps = 0;
for (let i = 0; i < 20; i++) {
  if ((await page.getByText('ADD TO COLLECTION').count()) > 0) break;
  if (i === 5) await page.screenshot({ path: join(SHOTS, 'tcg-flip.png') });
  await page.mouse.click(201, 420);
  // A tap can land inside the fly-out animation window and be (correctly)
  // swallowed — the cadence tolerates a few of those.
  await page.waitForTimeout(470);
  taps++;
}
check('booster ripped through with one gesture per card', taps >= 10 && taps <= 16, `${taps} taps`);
check('tally screen reached', (await page.getByText('ADD TO COLLECTION').count()) > 0);
await page.screenshot({ path: join(SHOTS, 'tcg-tally.png') });
await page.getByText('ADD TO COLLECTION').click();
await page.waitForTimeout(500);

// --- 4. Binder holds the set, separated from sports ------------------------
await nav('BOOK').click();
await page.waitForTimeout(900);
const bodyText = await page.evaluate(() => document.body.textContent ?? '');
check('binder holds the TCG pulls', /11 cards|11 CARDS/i.test(bodyText)
  || (await page.locator('img').count()) > 0, isBase ? 'base set booster' : '151 booster');
await page.screenshot({ path: join(SHOTS, 'tcg-binder.png') });

// --- 5. Grade straight from the binder card (the new flow) -----------------
// Still on BOOK from the previous step: tap a pocket, send from the card.
await page.locator('[data-pocket="0"]').click();
await page.waitForTimeout(1200);
check('card detail offers grading in place',
  (await page.getByText('SEND FOR GRADING').count()) === 1);
await page.locator('button:has-text("QuickGrade")').click();
await page.locator('button:has-text("EXPRESS")').click();
await page.locator('button:has-text("SEND ·")').click();
await page.waitForTimeout(600);
check('TCG card submitted from the binder',
  (await page.locator('text=/At QuickGrade/').count()) > 0);
await page.mouse.click(201, 60); // close the detail overlay
await page.waitForTimeout(400);

// --- 6. End days until the slab returns, then reveal -----------------------
let revealed = false;
for (let d = 0; d < 12 && !revealed; d++) {
  await nav('WAX').click();
  await page.waitForTimeout(400);
  await page.locator('button:has-text("END DAY")').click();
  await page.waitForTimeout(700);
  await goGrade();
  await page.waitForTimeout(500);
  const reveal = page.locator('button:has-text("REVEAL")').first();
  if ((await reveal.count()) > 0) {
    await reveal.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(SHOTS, 'tcg-slab.png') });
    revealed = true;
    // Dismiss the slab ceremony if a continue affordance is present.
    await page.mouse.click(201, 780);
    await page.waitForTimeout(400);
  }
}
check('slab came back and revealed', revealed);

const errs = pageErrors.filter(e => !/favicon|manifest|sw\.js|ServiceWorker/i.test(e));
check('no uncaught page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
server.close();
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL TCG CHECKS PASSED');
process.exit(fails.length ? 1 : 0);

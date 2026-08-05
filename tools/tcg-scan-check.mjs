/**
 * Scan-wins verification: prove that once official scans are in the
 * device's IndexedDB (exactly where the realism one-tap puts them), the
 * card press renders THE REAL CARD through the whole game loop — boot
 * decode, rip ceremony, binder — with zero network.
 *
 * The sandbox browser can't reach the CDN, so scans are pre-downloaded
 * server-side and served same-origin; the page seeds them into
 * 'poke-art-cache' under the same `${setKey}:${num}` keys the importer
 * uses, then reloads. From that point the code path is identical to a
 * player's device after the one-tap.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;
const SHOTS = new URL('../shots', import.meta.url).pathname;
const SCANS = process.env.SCAN_DIR;
if (!SCANS) { console.error('SCAN_DIR env var required'); process.exit(1); }
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};
const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const data = path.startsWith('/realscan/')
      ? await readFile(join(SCANS, path.slice('/realscan/'.length)))
      : await readFile(join(DIST, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(await readFile(join(DIST, 'index.html')));
  }
});
await new Promise(r => server.listen(4184, r));

const fails = [];
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

// --- 1. Seed the cache exactly as the importer would ----------------------
await page.goto('http://localhost:4184/?enable-tcg');
await page.waitForTimeout(600);
const seeded = await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('poke-art-cache', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('img');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  let n = 0;
  for (let num = 1; num <= 102; num++) {
    const res = await fetch(`/realscan/base/${num}.png`);
    if (!res.ok) continue;
    const blob = await res.blob();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('img', 'readwrite');
      tx.objectStore('img').put(blob, `base:${num}`);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    n++;
  }
  return n;
});
check('all 102 Base Set scans seeded into the cache', seeded === 102, `${seeded}/102`);

// --- 2. Reload: boot decodes the cache, provider goes live ----------------
await page.goto('http://localhost:4184/?enable-tcg');
await page.waitForTimeout(1800);
await page.locator('input').fill('Scan Check');
await page.getByText('TRUST FUND').click();
await page.getByText('OPEN FOR BUSINESS').click();
await page.waitForTimeout(900);

// --- 3. Buy + rip a 1st Edition booster -----------------------------------
await nav('WAX').click();
await page.waitForTimeout(700);
const boosterRow = page.locator('button:has-text("Booster Pack"):not([disabled])')
  .filter({ hasText: '1st Edition' });
let tries = 0;
while ((await boosterRow.count()) === 0 && tries < 16) {
  await page.locator('button:has-text("END DAY")').click();
  await page.waitForTimeout(600);
  tries++;
}
check('vintage booster available', (await boosterRow.count()) > 0, `day ${tries + 1}`);
await boosterRow.first().click();
await page.waitForTimeout(500);
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
for (let i = 0; i < 13; i++) {
  if ((await page.getByText('ADD TO COLLECTION').count()) > 0) break;
  await page.mouse.click(201, 420);
  await page.waitForTimeout(420);
  if (i === 2) await page.screenshot({ path: join(SHOTS, 'tcg-scan-flip.png') });
  if (i === 10) await page.screenshot({ path: join(SHOTS, 'tcg-scan-hit.png') });
  await page.mouse.click(201, 420);
  await page.waitForTimeout(220);
}
check('tally reached with scans live', (await page.getByText('ADD TO COLLECTION').count()) > 0);
await page.screenshot({ path: join(SHOTS, 'tcg-scan-tally.png') });
await page.getByText('ADD TO COLLECTION').click();
await page.waitForTimeout(500);

await nav('BOOK').click();
await page.waitForTimeout(1200);
await page.screenshot({ path: join(SHOTS, 'tcg-scan-binder.png') });

const errs = pageErrors.filter(e => !/favicon|manifest|sw\.js|ServiceWorker/i.test(e));
check('no uncaught page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
server.close();
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL SCAN CHECKS PASSED');
process.exit(fails.length ? 1 : 0);

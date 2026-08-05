/**
 * Full-app UI audit — walks every screen at 402x874@3x and captures each
 * state into shots/audit-*.png. This is the enforcement pass for
 * docs/UI-RULES.md: run it, look at every image, fix violations.
 *
 * Covers: career setup, WAX shelf + rip (tear/flip/summary), HUNT + dig,
 * BOOK + detail, GRADE, SELL + price sheet, WIRE + Top 50, EDIT with the
 * one-tap real-league preset, and BOOK again with real (long) names.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
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
await new Promise(r => server.listen(4179, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
page.on('pageerror', e => console.error('[pageerror]', e.message));
const nav = label => page.getByRole('button', { name: label, exact: true });
const shot = name => page.screenshot({ path: `shots/audit-${name}.png` });

// --- Career setup ---
await page.goto('http://localhost:4179/');
await page.waitForTimeout(1000);
await shot('01-career-setup');
await page.locator('input').fill('Audit Cards');
await page.getByText('HOBBY MONEY').click().catch(() => page.getByText('STOREFRONT').click());
await page.getByText('OPEN FOR BUSINESS').click();
await page.waitForTimeout(900);

// --- WAX shelf ---
await nav('WAX').click();
await page.waitForTimeout(900);
await shot('02-wax-shelf');

// Buy + rip a hobby pack: tear, first flip, summary.
await page.locator('button:has-text("Hobby Pack")').first().click();
await page.waitForTimeout(400);
await page.locator('button:has-text("RIP IT")').first().click();
await page.waitForTimeout(800);
await shot('03-rip-sealed');
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
await page.mouse.click(201, 420);
await page.waitForTimeout(1400);
await shot('04-rip-flip');
for (let i = 0; i < 10; i++) {
  await page.mouse.click(201, 420);
  await page.waitForTimeout(300);
  await page.mouse.click(201, 420);
  await page.waitForTimeout(700);
}
await page.waitForTimeout(600);
await shot('05-rip-summary');
if (await page.getByText('ADD TO COLLECTION').count()) {
  await page.getByText('ADD TO COLLECTION').click();
}
await page.waitForTimeout(500);

// --- HUNT + dig ---
await nav('HUNT').click();
await page.waitForTimeout(800);
await shot('06-hunt-leads');
const lead = page.locator('button:has-text("BUY & DIG")').first();
if (await lead.count()) {
  await lead.click();
  await page.waitForTimeout(1200);
  await shot('07-dig-reel');
  await page.getByText('SKIP TO RESULTS').click();
  await page.waitForTimeout(1600);
  await shot('08-dig-summary');
  await page.getByText('ADD TO COLLECTION').click();
  await page.waitForTimeout(500);
}

// --- BOOK + detail ---
await nav('BOOK').click();
await page.waitForTimeout(1800);
await shot('09-book');
await page.locator('img[src^="data:"]').first().click();
await page.waitForTimeout(1400);
await shot('10-book-detail');
await page.mouse.click(30, 100); // close overlay
await page.waitForTimeout(400);

// --- GRADE ---
await nav('GRADE').click();
await page.waitForTimeout(1200);
await shot('11-grade');

// --- SELL + price sheet ---
await nav('SELL').click();
await page.waitForTimeout(1600);
await shot('12-sell');
await page.locator('[data-testid="inventory-card"]').first().click();
await page.waitForTimeout(1000);
await shot('13-price-sheet');
await page.mouse.click(201, 60); // close sheet
await page.waitForTimeout(400);

// --- WIRE ---
await nav('WIRE').click();
await page.waitForTimeout(900);
await shot('14-wire');
const topBtn = page.getByText('TOP 50', { exact: false }).first();
if (await topBtn.count()) {
  await topBtn.click();
  await page.waitForTimeout(1200);
  await shot('15-top50');
}

// --- EDIT: one-tap real-league preset ---
await nav('EDIT').click();
await page.waitForTimeout(700);
await page.getByText('FILE', { exact: true }).click();
await page.waitForTimeout(400);
await shot('16-edit-file');
await page.getByText('LOAD REAL-LEAGUE NAMES', { exact: false }).click();
await page.waitForTimeout(1500);
await shot('17-edit-imported');

// --- BOOK with real (long) names: banner overflow check ---
await nav('BOOK').click();
await page.waitForTimeout(2000);
await shot('18-book-realnames');
await page.locator('img[src^="data:"]').first().click();
await page.waitForTimeout(1400);
await shot('19-book-realname-detail');
await page.mouse.click(30, 100); // close the detail overlay before nav
await page.waitForTimeout(500);

// --- Top 50 with real names ---
await nav('WIRE').click();
await page.waitForTimeout(900);
if (await topBtn.count()) {
  await topBtn.click();
  await page.waitForTimeout(1200);
  await shot('20-top50-realnames');
}

console.log('audit shots saved');
await browser.close();
server.close();

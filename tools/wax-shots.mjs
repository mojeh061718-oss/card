/** Buy a hobby box, verify cash moves, rip it, check the guarantees. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
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
await new Promise(r => server.listen(4182, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto('http://localhost:4182/');
await page.waitForTimeout(900);
await page.getByText('STOREFRONT').click();
await page.getByText('OPEN FOR BUSINESS').click();
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/wax-1-shelf.png' });

const cashOf = () => page.evaluate(() =>
  (document.body.textContent ?? '').match(/CASH\s*\$([\d.,KM]+)/)?.[1] ?? '');
const before = await cashOf();

// Buy a hobby box.
await page.locator('button:has-text("Hobby Box")').first().click();
await page.waitForTimeout(600);
const after = await cashOf();
console.log(`cash ${before} -> ${after} after buying a box`);
await page.screenshot({ path: 'shots/wax-2-sealed.png' });

// Rip it, skipping the per-pack ceremony.
await page.locator('button:has-text("RIP IT")').first().click();
await page.waitForTimeout(900);
await page.getByText('SKIP TO RESULTS').click();
await page.waitForTimeout(2200);
await page.screenshot({ path: 'shots/wax-3-break.png' });

const summary = await page.evaluate(() => document.body.textContent ?? '');
console.log('break line:', summary.match(/(\d+) cards worth ([^·]+)·\s*paid\s*(\S+)/)?.[0] ?? '?');
await page.getByText('ADD TO COLLECTION').click();
await page.waitForTimeout(700);
console.log('cash after break:', await cashOf());
await browser.close();
server.close();

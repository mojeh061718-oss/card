/** Drive the market: price a card, list it, settle the auction. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
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
await new Promise(r => server.listen(4177, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto('http://localhost:4177/?seed-collection=10');
await page.waitForTimeout(1400);
await page.getByText('MARKET', { exact: true }).click();
await page.waitForTimeout(1600);
await page.screenshot({ path: 'shots/market-1-inventory.png' });

// Price the most valuable card.
await page.locator('button:has(img)').first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/market-2-comps.png' });

// List it at auction, then run days until it settles.
await page.getByText('LIST AT AUCTION').click();
await page.waitForTimeout(400);
for (let d = 0; d < 6; d++) {
  await page.getByText('END DAY ▸').click();
  await page.waitForTimeout(200);
}
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/market-3-results.png' });
console.log('saved market shots');
await browser.close();
server.close();

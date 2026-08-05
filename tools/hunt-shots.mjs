/** Buy a lot and dig through it. */
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
await new Promise(r => server.listen(4178, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto('http://localhost:4178/');
await page.waitForTimeout(1000);
await page.getByText('HUNT', { exact: true }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/hunt-1-leads.png' });

// Buy the first affordable lot.
const buyable = page.locator('button:has-text("BUY & DIG")').first();
await buyable.click();
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/hunt-2-dig.png' });

// Hold to rip through the pile.
await page.mouse.move(201, 430);
await page.mouse.down();
await page.waitForTimeout(2600);
await page.mouse.up();
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/hunt-3-mid.png' });

await page.getByText('SKIP TO RESULTS').click();
await page.waitForTimeout(1400);
await page.screenshot({ path: 'shots/hunt-4-results.png' });
console.log('saved hunt shots');
await browser.close();
server.close();

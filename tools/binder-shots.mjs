/** Seed a collection, open the binder, capture list + detail views. */
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
await new Promise(r => server.listen(4175, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto('http://localhost:4175/?seed-collection=6');
await page.waitForTimeout(1200);
await page.getByText('BINDER', { exact: true }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/binder-1-book.png' });

// Sort by heat, filter hits.
await page.getByText('🔥').click();
await page.waitForTimeout(900);
await page.getByText('HITS', { exact: true }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/binder-2-hits.png' });

// Open the top card's detail.
const pocket = await page.locator('img[src^="data:"]').first();
await pocket.click();
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/binder-3-detail.png' });
console.log('saved binder shots');
await browser.close();
server.close();

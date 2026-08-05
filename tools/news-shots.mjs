/** Capture the Top 50 board and the news wire after some play. */
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
await new Promise(r => server.listen(4179, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto('http://localhost:4179/?seed-collection=30');
await page.waitForTimeout(2200);
// Dismiss any breaking takeover triggered by the seeded rips.
await page.mouse.click(201, 430);
await page.waitForTimeout(300);

await page.getByText('WIRE', { exact: true }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/news-1-top50.png' });

// Generate wire traffic.
for (let d = 0; d < 4; d++) {
  await page.getByText('END DAY ▸').click();
  await page.waitForTimeout(250);
}
await page.getByText('NEWS', { exact: true }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/news-2-wire.png' });
console.log('saved news shots');
await browser.close();
server.close();

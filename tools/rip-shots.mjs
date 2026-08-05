/** Drive the rip flow and capture each beat. */
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
await new Promise(r => server.listen(4174, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto('http://localhost:4174/');
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/rip-1-sealed.png' });

// Tear: drag across the pack top.
const pack = await page.locator('div[style*="touch-action"]').first().boundingBox();
const ty = pack.y + pack.height * 0.06;
await page.mouse.move(pack.x + 4, ty);
await page.mouse.down();
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(pack.x + (pack.width * i) / 12, ty, { steps: 3 });
  await page.waitForTimeout(28);
}
await page.mouse.up();
await page.waitForTimeout(320);
await page.screenshot({ path: 'shots/rip-2-torn.png' });
await page.waitForTimeout(400);

// Flip through the pack: tap to flip, screenshot interesting beats.
for (let card = 0; card < 10; card++) {
  await page.mouse.click(201, 420); // flip
  await page.waitForTimeout(650);
  if (card === 0) await page.screenshot({ path: 'shots/rip-3-first-flip.png' });
  if (card === 9) await page.screenshot({ path: 'shots/rip-4-last.png' });
  await page.mouse.click(201, 420); // next
  await page.waitForTimeout(250);
}
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/rip-5-summary.png' });
console.log('saved rip shots');
await browser.close();
server.close();

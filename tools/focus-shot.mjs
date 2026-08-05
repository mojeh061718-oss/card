/** Screenshot one lab card at full size: node tools/focus-shot.mjs <idx> <out> */
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
await new Promise(r => server.listen(4183, r));

const idx = process.argv[2] ?? '10';
const out = process.argv[3] ?? 'shots/focus.png';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 500, height: 760 }, deviceScaleFactor: 3 });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto(`http://localhost:4183/?lab&focus=${idx}`);
await page.waitForSelector('[data-testid="focus-card"]');
await page.waitForTimeout(1500);
await page.locator('[data-testid="focus-card"]').screenshot({ path: out });
console.log(`saved ${out}`);
await browser.close();
server.close();

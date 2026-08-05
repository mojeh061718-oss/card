import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = '/home/user/card/dist';
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
await new Promise(r => server.listen(4188, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 500, height: 760 } });
page.on('pageerror', e => console.error('[pageerror]', e.message, e.stack?.slice(0, 800)));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 300)); });
await page.goto('http://localhost:4188/?lab&focus=10');
await page.waitForTimeout(20000);
const found = await page.locator('[data-testid="focus-card"]').count();
console.log('focus-card count:', found);
const stills = await page.locator('img').count();
console.log('stills:', stills);
await page.screenshot({ path: '/home/user/card/shots/labdebug.png' });
await browser.close();
server.close();

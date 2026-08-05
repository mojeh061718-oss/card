/** Verify career setup gate, then a full loop through the shop. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
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
await new Promise(r => server.listen(4180, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto('http://localhost:4180/');
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/career-1-setup.png' });

await page.locator('input').fill("Jesse's Card Corner");
await page.getByText('STOREFRONT').click();
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/career-2-filled.png' });
await page.getByText('OPEN FOR BUSINESS').click();
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/career-3-shop.png' });

// The manifest must actually serve for install to work.
const manifest = await page.evaluate(async () => {
  const r = await fetch('/manifest.webmanifest');
  return { ok: r.ok, json: await r.json() };
});
console.log('manifest ok:', manifest.ok, '| name:', manifest.json.name,
  '| icons:', manifest.json.icons.length);

// Reload must skip setup — the career persisted.
await page.reload();
await page.waitForTimeout(1200);
const stillSetup = await page.getByText('OPEN FOR BUSINESS').count();
console.log('setup re-shown after reload (want 0):', stillSetup);
await page.screenshot({ path: 'shots/career-4-persisted.png' });
await browser.close();
server.close();

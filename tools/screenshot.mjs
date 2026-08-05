/**
 * Render-lab screenshot harness. Serves the built app, loads the dev lab at
 * the iPhone 16 Pro viewport, and captures the gallery so card art can be
 * reviewed at real resolution. Usage: node tools/screenshot.mjs [outPath]
 */
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
    const data = await readFile(join(DIST, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(data);
  }
});
await new Promise(r => server.listen(4173, r));

const out = process.argv[2] ?? 'shots/devlab.png';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
});
page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto('http://localhost:4173/');
await page.waitForSelector('[data-testid="gallery"] img', { timeout: 15000 });
await page.waitForTimeout(600);
await page.screenshot({ path: out, fullPage: true });
console.log(`saved ${out}`);
await browser.close();
server.close();

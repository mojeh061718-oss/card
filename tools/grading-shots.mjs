/** Drive the grading flow: pick, submit, end days, reveal the slab. */
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
await new Promise(r => server.listen(4176, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto('http://localhost:4176/?seed-collection=8');
await page.waitForTimeout(1400);
await page.getByText('GRADE', { exact: true }).click();
await page.waitForTimeout(1800);
await page.screenshot({ path: 'shots/grade-1-pick.png' });

// Pick the top two candidates and submit to the strict house, Express.
const cells = page.locator('div[style*="position: relative"] img[src^="data:"]');
await cells.nth(0).click();
await cells.nth(1).click();
await page.getByText('Beacon', { exact: true }).click();
await page.getByText('EXPRESS', { exact: true }).click();
await page.waitForTimeout(300);
await page.locator('button', { hasText: 'SUBMIT' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/grade-2-queue.png' });

// End days until the return shows up.
for (let d = 0; d < 7; d++) {
  await page.getByText('END DAY ▸').click();
  await page.waitForTimeout(150);
}
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/grade-3-returns.png' });

// Reveal the first slab.
await page.getByText('TAP TO REVEAL').first().click();
await page.waitForTimeout(700);
await page.mouse.click(201, 430); // open the box
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/grade-4-slab.png' });
console.log('saved grading shots');
await browser.close();
server.close();

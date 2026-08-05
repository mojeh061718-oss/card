/** Screenshot the creature TCG concept lab. Usage: node tools/poke-shot.mjs [set] [focus] */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
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
await new Promise(r => server.listen(4195, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto('http://localhost:4195/?pokelab');
await page.waitForSelector('[data-testid="poke-focus"]', { timeout: 60000 });
await page.waitForTimeout(12000);

const setBtn = process.argv[2];
if (setBtn === '151') {
  await page.getByText('POKEMON 151', { exact: false }).click();
  await page.waitForTimeout(12000);
}
const focus = Number(process.argv[3] ?? -1);
if (focus >= 0) {
  await page.locator('figure').nth(focus).click();
  await page.waitForTimeout(2500);
}
await page.screenshot({ path: `shots/poke-${setBtn ?? 'base'}${focus >= 0 ? `-f${focus}` : ''}.png` });
await page.locator('[data-testid="poke-focus"]').screenshot({ path: `shots/poke-${setBtn ?? 'base'}-focus.png` });
console.log('saved');
await browser.close();
server.close();

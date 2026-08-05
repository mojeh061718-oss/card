/** Rename a team, confirm it propagates to rendered cards, and persists. */
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
await new Promise(r => server.listen(4184, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
page.on('pageerror', e => console.error('[pageerror]', e.message));
const nav = l => page.getByRole('button', { name: l, exact: true });

await page.goto('http://localhost:4184/?seed-collection=3');
await page.waitForTimeout(1400);
await page.getByText('OPEN FOR BUSINESS').click();
await page.waitForTimeout(700);

await nav('EDIT').click();
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/editor-1-teams.png' });

// Rename the first team, then blur to commit.
const city = page.locator('input[placeholder="City"]').first();
const nick = page.locator('input[placeholder="Nickname"]').first();
await city.fill('Brooklyn');
await nick.fill('Bridges');
await nick.blur();
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/editor-2-renamed.png' });

// Players tab, renaming inside the same team.
await nav('PLAYERS').click().catch(() => page.getByText('PLAYERS', { exact: true }).click());
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/editor-3-players.png' });

// Reload: names must survive, and nothing else may break.
await page.reload();
await page.waitForTimeout(1600);
await nav('EDIT').click();
await page.waitForTimeout(700);
const persisted = await page.locator('input[placeholder="City"]').first().inputValue();
console.log('city after reload:', persisted);

await nav('BOOK').click();
await page.waitForTimeout(1600);
const cards = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(d => /\d+ cards/.test(d.textContent ?? ''));
  return Number((el?.textContent ?? '').match(/(\d+) cards/)?.[1] ?? 0);
});
console.log('collection intact after rename:', cards, 'cards');
await page.screenshot({ path: 'shots/editor-4-binder.png' });
await browser.close();
server.close();

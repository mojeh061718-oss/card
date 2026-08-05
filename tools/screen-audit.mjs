/**
 * Screen-by-screen visual audit with realism assets loaded: seeds the
 * caches, plays to a representative state, and screenshots every screen
 * for review against docs/UI-RULES.md. Pure capture — the judgement pass
 * is human/model review of the PNGs.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;
const SHOTS = new URL('../shots/audit', import.meta.url).pathname;
const ASSETS = process.env.ASSET_DIR;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json',
};
const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const data = path.startsWith('/asset/')
      ? await readFile(join(ASSETS, path.slice('/asset/'.length)))
      : await readFile(join(DIST, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(await readFile(join(DIST, 'index.html')));
  }
});
await new Promise(r => server.listen(4191, r));

import { mkdir } from 'node:fs/promises';
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
page.on('pageerror', e => console.error('PAGE ERROR', e.message));
const nav = label => page.getByRole('button', { name: label, exact: true });
const shot = name => page.screenshot({ path: join(SHOTS, `${name}.png`) });

// Seed caches + collection.
await page.goto('http://localhost:4191/?enable-tcg&seed-collection=8');
await page.waitForTimeout(1200);
const manifest = JSON.parse(await readFile(join(ASSETS, 'photos/manifest.json'), 'utf8'));
await page.evaluate(async (jobs) => {
  const open = name => new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('img');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const put = (db, key, blob) => new Promise((resolve, reject) => {
    const tx = db.transaction('img', 'readwrite');
    tx.objectStore('img').put(blob, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  const photoDb = await open('real-art-cache');
  await put(photoDb, '__gen', 2);
  for (const j of jobs) {
    const res = await fetch(`/asset/${j.file}`);
    if (res.ok) await put(photoDb, `${j.sport}:${j.name}`, await res.blob());
  }
  const scanDb = await open('poke-art-cache');
  for (let num = 1; num <= 102; num++) {
    const res = await fetch(`/asset/scans/base/${num}.png`);
    if (res.ok) await put(scanDb, `base:${num}`, await res.blob());
  }
}, manifest);

// Welcome screen (fresh state).
await page.goto('http://localhost:4191/?enable-tcg&seed-collection=8');
await page.waitForTimeout(2200);
await shot('00-welcome');
await page.locator('input').fill('Audit Shop');
await page.getByText('STOREFRONT').click();
await page.getByText('OPEN FOR BUSINESS').click();
await page.waitForTimeout(600);
await page.evaluate(async () => {
  const { useCollection } = window.__cardboard;
  const raw = await fetch('presets/real-world.json').then(r => r.json());
  useCollection.getState().setOverrides(raw);
});
await page.waitForTimeout(600);
await shot('01-home');
await nav('HUNT').click(); await page.waitForTimeout(900); await shot('02-hunt');
await nav('WAX').click(); await page.waitForTimeout(900); await shot('03-wax');
await nav('BOOK').click(); await page.waitForTimeout(1800); await shot('04-book');
await page.locator('[data-pocket="0"]').click(); await page.waitForTimeout(1400); await shot('05-card-detail');
await page.mouse.click(201, 60); await page.waitForTimeout(400);
await nav('SELL').click(); await page.waitForTimeout(1500); await shot('06-sell');
await nav('WIRE').click(); await page.waitForTimeout(1200); await shot('07-wire');
await nav('HOME').click(); await page.waitForTimeout(400);
await page.locator('button:has-text("GRADE")').first().click(); await page.waitForTimeout(1500); await shot('08-grade');
await nav('HOME').click(); await page.waitForTimeout(400);
await page.locator('button:has-text("EDITOR")').first().click(); await page.waitForTimeout(700); await shot('09-editor');

await browser.close();
server.close();
console.log('audit shots saved');

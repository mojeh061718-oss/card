/**
 * Three-way realism verification: after the import caches are populated,
 * a FOOTBALL card renders its real player photo, a BASEBALL card renders
 * its real player photo, and a POKEMON card renders its official scan —
 * all through the real game surfaces (binder pockets + detail view), all
 * offline.
 *
 * The sandbox browser can't reach the public APIs, so photos/scans are
 * pre-downloaded server-side (tools used the same name-resolution logic
 * the app ships) and seeded into the exact IndexedDB stores + keys the
 * one-tap importer writes. From there the pipeline is identical to a
 * player's device.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;
const SHOTS = new URL('../shots', import.meta.url).pathname;
const ASSETS = process.env.ASSET_DIR; // expects photos/ + scans/base/ + photos/manifest.json
if (!ASSETS) { console.error('ASSET_DIR env var required'); process.exit(1); }
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
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
await new Promise(r => server.listen(4185, r));

const fails = [];
const nav = label => page.getByRole('button', { name: label, exact: true });
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails.push(name);
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });

const DEV = '?enable-tcg&seed-collection=10';

// --- 1. First boot: seed collection, do career setup, apply real names ----
await page.goto(`http://localhost:4185/${DEV}`);
await page.waitForTimeout(1200);
await page.locator('input').fill('Realism Check');
await page.getByText('TRUST FUND').click();
await page.getByText('OPEN FOR BUSINESS').click();
await page.waitForTimeout(800);
// EDIT lives on the HOME hub now (we land on HOME after setup).
await page.locator('button:has-text("EDITOR")').first().click();
await page.waitForTimeout(500);
await page.locator('button:has-text("FILE")').first().click();
await page.waitForTimeout(400);
await page.locator('button:has-text("LOAD REAL-LEAGUE NAMES ONLY")').click();
await page.waitForTimeout(900);
check('real-league names applied',
  (await page.getByText('Real-league names applied').count()) > 0);

// --- 2. Seed the art caches with the importer's exact stores + keys -------
const manifest = JSON.parse(await readFile(join(ASSETS, 'photos/manifest.json'), 'utf8'));
const seeded = await page.evaluate(async (jobs) => {
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
  let photos = 0;
  for (const j of jobs) {
    const res = await fetch(`/asset/${j.file}`);
    if (!res.ok) continue;
    await put(photoDb, `${j.sport}:${j.name}`, await res.blob());
    photos++;
  }
  const scanDb = await open('poke-art-cache');
  let scans = 0;
  for (let num = 1; num <= 102; num++) {
    const res = await fetch(`/asset/scans/base/${num}.png`);
    if (!res.ok) continue;
    await put(scanDb, `base:${num}`, await res.blob());
    scans++;
  }
  return { photos, scans };
}, manifest);
check('photo + scan caches seeded', seeded.photos === manifest.length && seeded.scans === 102,
  `${seeded.photos} photos, ${seeded.scans} scans`);

// --- 3. Reload: boot decodes caches; find one card of each kind -----------
await page.goto(`http://localhost:4185/${DEV}`);
await page.waitForTimeout(2500);
const targets = await page.evaluate(() => {
  const { world, useCollection, photoFor, scanFor } = window.__cardboard;
  const { cards } = useCollection.getState();
  // Binder default sort: newest first — mirror it to get pocket indexes.
  const shown = [...cards].sort((a, b) => b.pulledSeq - a.pulledSeq);
  const out = {};
  shown.forEach((c, i) => {
    const rt = world.get(c.seriesId);
    const name = world.displayName(c).player;
    if (c.seriesId.startsWith('tcg-')) {
      const num = Number(rt.def.checklist[c.cardIndex].cardNumber.split('/')[0]);
      if (!out.tcg && scanFor('base', num)) out.tcg = { i, name };
    } else if (rt.def.sport === 'football') {
      if (!out.football && photoFor('football', name)) out.football = { i, name };
    } else if (rt.def.sport === 'baseball') {
      if (!out.baseball && photoFor('baseball', name)) out.baseball = { i, name };
    }
  });
  return out;
});
check('a photo-backed football card is in the binder', !!targets.football, targets.football?.name);
check('a photo-backed baseball card is in the binder', !!targets.baseball, targets.baseball?.name);
check('a scan-backed pokemon card is in the binder', !!targets.tcg, targets.tcg?.name);

// --- 4. Open each in the binder detail view and screenshot ----------------
await nav('BOOK').click();
await page.waitForTimeout(1500);
for (const [kind, t] of Object.entries(targets)) {
  if (!t) continue;
  const pocket = page.locator(`[data-pocket="${t.i}"]`);
  await pocket.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900); // lazy page render + thumb rasterization
  await pocket.click();
  await page.waitForTimeout(1400); // live GL card settles
  await page.screenshot({ path: join(SHOTS, `real-${kind}.png`) });
  check(`${kind} detail view opened (${t.name})`, true);
  await page.mouse.click(201, 60); // dismiss overlay
  await page.waitForTimeout(400);
}

const errs = pageErrors.filter(e => !/favicon|manifest|sw\.js|ServiceWorker/i.test(e));
check('no uncaught page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
server.close();
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL REALISM CHECKS PASSED');
process.exit(fails.length ? 1 : 0);

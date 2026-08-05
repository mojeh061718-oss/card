/**
 * Fast iteration harness: seed the art caches, then render single cards
 * (one football, one baseball with photos) straight to PNG stills at
 * high resolution — no UI navigation, just the card press output.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;
const SHOTS = new URL('../shots', import.meta.url).pathname;
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
await new Promise(r => server.listen(4188, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
page.on('pageerror', e => console.error('PAGE ERROR', e.message));

// Seed caches (photos + scans) once.
await page.goto('http://localhost:4188/?seed-collection=10');
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
  const db = await open('real-art-cache');
  for (const j of jobs) {
    const res = await fetch(`/asset/${j.file}`);
    if (res.ok) await put(db, `${j.sport}:${j.name}`, await res.blob());
  }
}, manifest);

// Reload so boot decodes the cache, apply names, then render stills.
await page.goto('http://localhost:4188/?seed-collection=10');
await page.waitForTimeout(2500);
const stills = await page.evaluate(async () => {
  const { world, useCollection, photoFor, snapshotCard } = window.__cardboard;
  // Apply the real names so binder cards resolve to photo-backed players.
  const raw = await fetch('presets/real-world.json').then(r => r.json());
  useCollection.getState().setOverrides(raw);
  await new Promise(r => setTimeout(r, 300));
  const { cards } = useCollection.getState();
  const out = {};
  for (const c of cards) {
    const rt = world.get(c.seriesId);
    if (c.seriesId.startsWith('tcg-')) continue;
    const name = world.displayName(c).player;
    const sport = rt.def.sport;
    if (!out[sport] && photoFor(sport, name)) {
      out[sport] = { name, url: snapshotCard(world.specFor(c), 700) };
    }
    if (out.football && out.baseball) break;
  }
  return out;
});
for (const [sport, s] of Object.entries(stills)) {
  const b64 = s.url.split(',')[1];
  await writeFile(join(SHOTS, `still-${sport}.png`), Buffer.from(b64, 'base64'));
  console.log('saved', sport, s.name);
}
await browser.close();
server.close();

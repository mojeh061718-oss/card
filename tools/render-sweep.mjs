/**
 * Full card-pipeline debug sweep. With the realism caches seeded (photos +
 * scans), renders a wide matrix through the REAL press — binder cards,
 * every parallel finish on photo and procedural football cards, autos,
 * TCG scan cards (holo + common) and concept-frame fallbacks — and fails
 * on any page error, blank still, or missing branch. Also times each
 * render so pipeline regressions show up as numbers, not vibes.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;
const ASSETS = process.env.ASSET_DIR;
if (!ASSETS) { console.error('ASSET_DIR env var required'); process.exit(1); }
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
await new Promise(r => server.listen(4189, r));

const fails = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails.push(name);
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });

// Seed caches then reload (same stores/keys as the one-tap importer).
await page.goto('http://localhost:4189/?enable-tcg&seed-collection=10');
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
await page.goto('http://localhost:4189/?enable-tcg&seed-collection=10');
await page.waitForTimeout(2500);

const report = await page.evaluate(async () => {
  const { world, useCollection, photoFor, scanFor, snapshotCard } = window.__cardboard;
  const raw = await fetch('presets/real-world.json').then(r => r.json());
  useCollection.getState().setOverrides(raw);
  await new Promise(r => setTimeout(r, 300));
  const { cards } = useCollection.getState();

  const out = { renders: [], errors: [], counts: {} };
  const still = (label, spec, px = 750) => {
    const t0 = performance.now();
    try {
      const url = snapshotCard(spec, px);
      out.renders.push({ label, ms: Math.round(performance.now() - t0), bytes: url.length, ok: url.length > 15000 });
    } catch (e) {
      out.errors.push(`${label}: ${e.message}`);
    }
  };

  // 1. Every binder card renders (catches checklist/pose/insert edge cases).
  let n = 0;
  for (const c of cards) {
    if (n++ >= 80) break;
    still(`binder:${c.seriesId}#${c.cardIndex}.${c.parallelId}`, world.specFor(c), 300);
  }

  // 2. Photo football card × every parallel finish (+auto, +rookie shield).
  const fb = cards.find(c => {
    const rt = world.get(c.seriesId);
    return !c.seriesId.startsWith('tcg-') && rt.def.sport === 'football'
      && photoFor('football', world.displayName(c).player);
  });
  if (fb) {
    const rt = world.get(fb.seriesId);
    const spec = world.specFor(fb);
    for (const rung of rt.def.ladder) {
      still(`photo-fb:${rung.name}`, {
        ...spec, parallel: rung,
        serial: rung.numberedTo ? Math.min(7, rung.numberedTo) : null,
      });
    }
    still('photo-fb:auto', { ...spec, auto: { ink: 'blue', sticker: false } });
    out.counts.photoFootball = 1;
  }
  // Procedural football card (no photo) still renders every finish.
  const fbPlain = cards.find(c => {
    const rt = world.get(c.seriesId);
    return !c.seriesId.startsWith('tcg-') && rt.def.sport === 'football'
      && !photoFor('football', world.displayName(c).player);
  });
  if (fbPlain) {
    const rt = world.get(fbPlain.seriesId);
    for (const rung of rt.def.ladder) {
      still(`plain-fb:${rung.name}`, {
        ...world.specFor(fbPlain), parallel: rung,
        serial: rung.numberedTo ? 1 : null,
      });
    }
  }

  // 3. TCG: scan-backed holo + common, and a concept-frame fallback
  // (151 has no scans seeded here — that IS the fallback test).
  const tcgCards = cards.filter(c => c.seriesId === 'tcg-base');
  const holoDef = world.get('tcg-base').def;
  const holoIdx = holoDef.checklist.findIndex((_, i) => {
    const spec = world.specFor({ seriesId: 'tcg-base', cardIndex: i, parallelId: 3, serial: 1, numberedTo: null });
    return spec.tcg?.poke.rarity === 'holo';
  });
  if (holoIdx >= 0) {
    const holoPull = { seriesId: 'tcg-base', cardIndex: holoIdx, parallelId: 3, serial: 1, numberedTo: null };
    const spec = world.specFor(holoPull);
    out.counts.holoScanPresent = scanFor('base', spec.tcg.poke.num) ? 1 : 0;
    still('tcg:base-holo-scan', spec, 1024);
  }
  if (tcgCards[0]) still('tcg:base-common-scan', world.specFor(tcgCards[0]), 1024);
  world.enableTcg?.();
  const chase151 = { seriesId: 'tcg-151', cardIndex: 151, parallelId: 4, serial: 1, numberedTo: null };
  try {
    still('tcg:151-concept-fallback', world.specFor(chase151), 750);
  } catch { /* index guard */ }

  // 4. Pack odds sanity in the LIVE world: open 12 base packs, count holos.
  let holoPacks = 0;
  for (let i = 0; i < 12; i++) {
    const pack = world.openProduct('tcg-base', 'tcg-pack')[0];
    if (pack.some(p => world.specFor(p).tcg?.poke.rarity === 'holo'
      || world.displayName(p).tier.startsWith('Holo'))) holoPacks++;
  }
  out.counts.holoPacksOf12 = holoPacks;

  return out;
});

const bad = report.renders.filter(r => !r.ok);
// First render carries GL/font warmup; swiftshader is ~10x slower than a
// real GPU, so the budget is generous — this catches regressions, not
// absolute device timings.
// Baseline profile (swiftshader, ~10x a real GPU): median ~260ms; the
// procedural athlete painter is the known-heaviest path at ~950-1000ms.
// Budget sits just above it so real regressions trip, warmup excluded.
const slow = report.renders.slice(1).filter(r => r.ms > 1300);
check('all renders produced non-blank stills',
  bad.length === 0, bad.slice(0, 3).map(b => b.label).join(', ') || `${report.renders.length} rendered`);
check('no pipeline exceptions', report.errors.length === 0, report.errors.slice(0, 3).join(' | '));
check('photo football card present in sweep', report.counts.photoFootball === 1);
check('holo scan present for base holo', report.counts.holoScanPresent === 1);
check('live world deals holo packs at ~1:3', report.counts.holoPacksOf12 >= 1 && report.counts.holoPacksOf12 <= 9,
  `${report.counts.holoPacksOf12}/12 packs had a holo`);
check('no post-warmup render slower than 1300ms (swiftshader)', slow.length === 0,
  slow.slice(0, 3).map(s => `${s.label} ${s.ms}ms`).join(', ') || 'max ' + Math.max(...report.renders.map(r => r.ms)) + 'ms');
const errs = pageErrors.filter(e => !/favicon|manifest|sw\.js|ServiceWorker/i.test(e));
check('no uncaught page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`${report.renders.length} renders, median ${report.renders.map(r => r.ms).sort((a, b) => a - b)[Math.floor(report.renders.length / 2)]}ms`);

await browser.close();
server.close();
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL SWEEP CHECKS PASSED');
process.exit(fails.length ? 1 : 0);

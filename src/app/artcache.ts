/**
 * Runtime art caches for the REALISM CONCEPT — private-use experiment.
 *
 * Everything here fetches from PUBLIC endpoints at the player's own request
 * (a one-tap import) and stores blobs in the device's IndexedDB. Nothing is
 * bundled, committed, or redistributed; clearing site data wipes it all.
 *
 * Two stores:
 *  - 'poke-art-cache' / img:  `${setKey}:${num}` → card scan blob
 *  - 'real-art-cache' / img:  `${sport}:${Full Name}` → player photo blob
 *
 * Photos resolve by NAME at runtime (MLB StatsAPI people/search, ESPN
 * search v2), so no hand-maintained id tables that could pin the wrong
 * face to a name. Blobs are drawn via object URLs, which never taint the
 * canvas — if a fetch is CORS-blocked it simply fails and the procedural
 * art stays.
 */

import { openDB, type IDBPDatabase } from 'idb';
import { setPhotoProvider, setScanProvider } from '../render/photodb';

function makeDb(name: string): () => Promise<IDBPDatabase> {
  let p: Promise<IDBPDatabase> | null = null;
  return () => {
    if (!p) p = openDB(name, 1, { upgrade(d) { d.createObjectStore('img'); } });
    return p;
  };
}

// ---------------------------------------------------------------------------
// Creature card scans
// ---------------------------------------------------------------------------

const pokeDb = makeDb('poke-art-cache');

export async function cachedArtCount(setKey: string, nums: number[]): Promise<number> {
  const db = await pokeDb();
  let n = 0;
  for (const num of nums) {
    if (await db.get('img', `${setKey}:${num}`) !== undefined) n++;
  }
  return n;
}

/**
 * Fetch a set's scans into the cache. `hiresNums` are fetched at the CDN's
 * high-resolution variant (the chase-card crispness is the whole point);
 * an already-cached low-res copy of a hires target is UPGRADED in place,
 * so re-tapping the importer sharpens old caches instead of skipping them.
 */
export async function importSetArt(
  setKey: string, urlPattern: string, nums: number[],
  onProgress: (done: number, failed: number, lastNum?: number) => void,
  hiresNums?: Set<number>,
): Promise<{ done: number; failed: number }> {
  const db = await pokeDb();
  let done = 0, failed = 0;
  const WORKERS = 6;
  await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
    for (let i = w; i < nums.length; i += WORKERS) {
      const num = nums[i];
      const key = `${setKey}:${num}`;
      const wantHires = hiresNums?.has(num) ?? false;
      try {
        const cached = await db.get('img', key) as Blob | undefined;
        // A `__hi:` marker records that the stored blob IS the hires
        // variant — size heuristics would re-download small files forever.
        const isHi = cached !== undefined && await db.get('img', `__hi:${key}`) === true;
        if (cached === undefined || (wantHires && !isHi)) {
          const slug = wantHires ? `${num}_hires` : String(num);
          const res = await fetch(urlPattern.replace('{num}', slug));
          if (!res.ok) throw new Error(String(res.status));
          await db.put('img', await res.blob(), key);
          if (wantHires) await db.put('img', true, `__hi:${key}`);
        }
        done++;
        onProgress(done, failed, num);
      } catch {
        failed++;
        onProgress(done, failed);
      }
    }
  }));
  return { done, failed };
}

export async function loadArtUrls(setKey: string, nums: number[]): Promise<Record<number, string>> {
  const db = await pokeDb();
  const out: Record<number, string> = {};
  for (const num of nums) {
    const blob = await db.get('img', `${setKey}:${num}`);
    if (blob) out[num] = URL.createObjectURL(blob as Blob);
  }
  return out;
}

/** In-memory decoded scans the card press reads synchronously. */
const scanMap = new Map<string, HTMLImageElement>();

export function scanFor(setKey: string, num: number): HTMLImageElement | null {
  const img = scanMap.get(`${setKey}:${num}`);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

// The card press pulls official scans through the render-layer seam.
setScanProvider(scanFor);

export function scanCount(): number {
  return scanMap.size;
}

/** Decode every cached scan into memory at boot. Returns how many. */
export async function loadCachedScans(): Promise<number> {
  const db = await pokeDb();
  const keys = await db.getAllKeys('img');
  for (const key of keys) {
    const k = String(key);
    if (k.startsWith('__') || scanMap.has(k)) continue;
    const blob = await db.get('img', key);
    if (!(blob instanceof Blob)) continue;
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    try {
      await img.decode();
      scanMap.set(k, img);
    } catch {
      URL.revokeObjectURL(img.src);
    }
  }
  return scanMap.size;
}

/**
 * THE VAULT: fetch each grail's verified public image URL into the scan
 * cache (same store + keys the render seam reads). URLs are listing-bound
 * on some hosts, so failures are tolerated — whatever lands is cached
 * forever and works offline.
 */
/** A manifest entry: a bare URL, or a URL plus the fractional [x, y, w, h]
 *  window holding the subject (pack photos come with table around them —
 *  only the pack itself should land in the cache). */
export type VaultArtEntry = string | { url: string; crop?: [number, number, number, number] };

async function cropBlob(blob: Blob, [fx, fy, fw, fh]: [number, number, number, number]): Promise<Blob> {
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  try {
    await img.decode();
    const sx = img.naturalWidth * fx, sy = img.naturalHeight * fy;
    const sw = img.naturalWidth * fw, sh = img.naturalHeight * fh;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw));
    c.height = Math.max(1, Math.round(sh));
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.92));
    return out ?? blob;
  } catch {
    return blob;
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

export async function importVaultArt(
  sets: Record<string, Record<string, VaultArtEntry>>,
  onProgress: (done: number, failed: number, total: number, lastKey?: string) => void,
): Promise<{ done: number; failed: number }> {
  const db = await pokeDb();
  const jobs = Object.entries(sets).flatMap(([setKey, nums]) =>
    Object.entries(nums).map(([num, entry]) => ({ key: `${setKey}:${num}`, entry })));
  let done = 0, failed = 0;
  const WORKERS = 6;
  await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
    for (let i = w; i < jobs.length; i += WORKERS) {
      const { key, entry } = jobs[i];
      try {
        if (await db.get('img', key) === undefined) {
          const url = typeof entry === 'string' ? entry : entry.url;
          const crop = typeof entry === 'string' ? undefined : entry.crop;
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          let blob = await res.blob();
          if (crop) blob = await cropBlob(blob, crop);
          await db.put('img', blob, key);
        }
        done++;
        onProgress(done, failed, jobs.length, key);
      } catch {
        failed++;
        onProgress(done, failed, jobs.length);
      }
    }
  }));
  return { done, failed };
}

// ---------------------------------------------------------------------------
// Real player photos
// ---------------------------------------------------------------------------

const photoDb = makeDb('real-art-cache');

/** In-memory decoded photos the card press reads synchronously. */
const photoMap = new Map<string, HTMLImageElement>();

export function photoFor(sport: string, fullName: string): HTMLImageElement | null {
  const img = photoMap.get(`${sport}:${fullName}`);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

// The card press pulls hero photos through the render-layer seam.
setPhotoProvider(photoFor);

export function photoCount(): number {
  return photoMap.size;
}

async function decodeInto(key: string, blob: Blob): Promise<void> {
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  try {
    await img.decode();
    photoMap.set(key, img);
  } catch {
    URL.revokeObjectURL(img.src);
  }
}

/** Load every cached photo into memory at boot. Returns how many. */
export async function loadCachedPhotos(): Promise<number> {
  const db = await photoDb();
  const keys = await db.getAllKeys('img');
  for (const key of keys) {
    const k = String(key);
    if (k.startsWith('__') || photoMap.has(k)) continue; // skip meta records
    const blob = await db.get('img', key);
    if (blob instanceof Blob) await decodeInto(k, blob);
  }
  return photoMap.size;
}

async function resolveNflPhoto(name: string): Promise<string | null> {
  const res = await fetch(
    `https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&limit=5`,
  );
  if (!res.ok) return null;
  const d = await res.json();
  const players = (d.results ?? []).find((r: { type?: string }) => r.type === 'player')?.contents ?? [];
  const hit = players.find((p: { description?: string }) => p.description === 'NFL') ?? players[0];
  const id = String(hit?.uid ?? '').match(/a:(\d+)/)?.[1];
  return id ? `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png` : null;
}

async function resolveMlbPhoto(name: string): Promise<string | null> {
  const res = await fetch(
    `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name)}`,
  );
  if (!res.ok) return null;
  const d = await res.json();
  const id = d.people?.[0]?.id;
  return id
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_1000,q_auto:best/v1/people/${id}/headshot/67/current`
    : null;
}

/**
 * Photo cache generation. Bump when the fetch URLs improve (e.g. w_640 →
 * w_1000): the next import wipes the store and refetches everything sharp,
 * instead of skipping the stale low-res blobs forever.
 */
const PHOTO_GEN = 2;

export interface PhotoRoster { sport: 'football' | 'baseball'; names: string[] }

/**
 * Resolve every roster name to a photo URL via the public search APIs,
 * fetch the images, cache them, and decode them for the card press.
 */
export async function importRealPhotos(
  rosters: PhotoRoster[],
  onProgress: (done: number, failed: number, total: number, lastName?: string) => void,
): Promise<{ done: number; failed: number }> {
  const db = await photoDb();
  // Stale-generation cache (older, lower-res URLs): wipe and refetch sharp.
  if (await db.get('img', '__gen') !== PHOTO_GEN) {
    for (const key of await db.getAllKeys('img')) await db.delete('img', key);
    await db.put('img', PHOTO_GEN, '__gen');
  }
  const jobs = rosters.flatMap(r => r.names.map(name => ({ sport: r.sport, name })));
  let done = 0, failed = 0;
  const WORKERS = 4;
  await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
    for (let i = w; i < jobs.length; i += WORKERS) {
      const { sport, name } = jobs[i];
      const key = `${sport}:${name}`;
      try {
        let blob = await db.get('img', key) as Blob | undefined;
        if (!blob) {
          const url = sport === 'football'
            ? await resolveNflPhoto(name)
            : await resolveMlbPhoto(name);
          if (!url) throw new Error('no match');
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          blob = await res.blob();
          await db.put('img', blob, key);
        }
        if (!photoMap.has(key)) await decodeInto(key, blob);
        done++;
        onProgress(done, failed, jobs.length, name);
      } catch {
        failed++;
        onProgress(done, failed, jobs.length);
      }
    }
  }));
  return { done, failed };
}

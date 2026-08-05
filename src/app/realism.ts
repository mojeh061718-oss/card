/**
 * The REALISM CONCEPT pipeline — one tap, everything, offline after.
 *
 * Runs the full import in order: real-league names/colors, real player
 * photos resolved by name from public APIs, official card scans for both
 * TCG sets, and the TCG unlock itself. Every asset lands in this device's
 * IndexedDB, so once the run completes the game renders the real cards
 * with no network at all. Private use only; nothing ships in the app.
 */

import { sanitizeOverrides } from '../state/overrides';
import { useCollection } from '../state/collection';
import { world } from '../state/world';
import {
  importRealPhotos, importSetArt, loadCachedPhotos, loadCachedScans,
  photoCount, scanCount,
} from './artcache';

export interface RealismSummary {
  photos: { done: number; failed: number };
  scans: { done: number; failed: number };
}

/** How much of the realism bundle is already on this device. */
export function realismCached(): { photos: number; scans: number } {
  return { photos: photoCount(), scans: scanCount() };
}

export async function runRealismImport(
  onProgress: (message: string) => void,
): Promise<RealismSummary> {
  // 1. Names + colors for every team and the top 75 players per sport.
  onProgress('1/4 — applying real-league names…');
  const raw = await fetch('presets/real-world.json').then(r => r.json());
  const clean = sanitizeOverrides(raw).set;
  useCollection.getState().setOverrides(clean);

  // 2. Player photos, resolved by name via the public search APIs.
  const rosters = [
    { sport: 'football' as const, names: (raw.rosterByRank?.football ?? []) as string[] },
    { sport: 'baseball' as const, names: (raw.rosterByRank?.baseball ?? []) as string[] },
  ];
  const photos = await importRealPhotos(rosters, (done, failed, total) =>
    onProgress(`2/4 — player photos… ${done + failed}/${total}`));

  // 3. Official card scans for both TCG sets, cached for offline play.
  const poke = await fetch('presets/pokemon-concept.json').then(r => r.json());
  let scansDone = 0, scansFailed = 0;
  for (const s of poke.sets ?? []) {
    const nums = (s.cards as { num: number }[]).map(c => c.num);
    const r = await importSetArt(s.key, s.officialArt, nums, (done, failed) =>
      onProgress(`3/4 — ${s.name} scans… ${done + failed}/${nums.length}`));
    scansDone += r.done;
    scansFailed += r.failed;
  }

  // 4. Unlock the TCG sets and decode everything into the card press.
  onProgress('4/4 — unlocking sets…');
  useCollection.getState().enableTcg();
  await loadCachedScans();
  await loadCachedPhotos();
  // Bump the revision so every cached card re-renders with the real art.
  world.applyOverrides(world.currentOverrides);

  return { photos, scans: { done: scansDone, failed: scansFailed } };
}

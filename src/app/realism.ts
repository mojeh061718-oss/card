/**
 * The REALISM CONCEPT pipeline — one tap, everything, offline after.
 *
 * Runs the full import in order: real-league names/colors, real player
 * photos resolved by name from public APIs, official card scans for the
 * TCG sets (holos, chases AND rares at the CDN's high-resolution
 * variant), and the TCG unlock itself. Every asset lands in this
 * device's IndexedDB, so once the run completes the game renders the
 * real cards with no network at all. Private use only.
 *
 * Progress is emitted as structured events so the UI can stage it like
 * an acquisition ceremony — marquee names and chase-card scans get
 * `highlight` events the moment they're secured.
 */

import { sanitizeOverrides } from '../state/overrides';
import { useCollection } from '../state/collection';
import { world } from '../state/world';
import {
  importRealPhotos, importSetArt, importVaultArt, loadCachedPhotos, loadCachedScans,
  photoCount, scanCount,
} from './artcache';

export interface RealismEvent {
  /** 1-based stage index and its display name. */
  stage: number;
  stageName: string;
  done: number;
  total: number;
  /** A marquee acquisition worth flashing in the ticker. */
  highlight?: { label: string; hot: boolean };
}

export interface RealismSummary {
  photos: { done: number; failed: number };
  scans: { done: number; failed: number };
  hires: number;
}

export function realismCached(): { photos: number; scans: number } {
  return { photos: photoCount(), scans: scanCount() };
}

const STAGES = ['League offices', 'Player photos', 'Vintage vault', 'Unlocking'];

export async function runRealismImport(
  onProgress: (message: string) => void,
  onEvent?: (e: RealismEvent) => void,
): Promise<RealismSummary> {
  const emit = (e: RealismEvent) => onEvent?.(e);

  // 1. Names + colors for every team and 150 players per sport.
  onProgress('1/4 — signing the leagues…');
  emit({ stage: 1, stageName: STAGES[0], done: 0, total: 1 });
  const raw = await fetch('presets/real-world.json').then(r => r.json());
  const clean = sanitizeOverrides(raw).set;
  useCollection.getState().setOverrides(clean);
  emit({
    stage: 1, stageName: STAGES[0], done: 1, total: 1,
    highlight: { label: '62 teams · 300 players signed', hot: false },
  });

  // 2. Player photos, resolved by name via the public search APIs. The
  // top of each ranked roster is marquee — those get ticker moments.
  const fbNames = (raw.rosterByRank?.football ?? []) as string[];
  const bbNames = (raw.rosterByRank?.baseball ?? []) as string[];
  const marquee = new Set([...fbNames.slice(0, 10), ...bbNames.slice(0, 10)]);
  const rosters = [
    { sport: 'football' as const, names: fbNames },
    { sport: 'baseball' as const, names: bbNames },
  ];
  const photos = await importRealPhotos(rosters, (done, failed, total, lastName) => {
    onProgress(`2/4 — player photos… ${done + failed}/${total}`);
    emit({
      stage: 2, stageName: STAGES[1], done: done + failed, total,
      highlight: lastName && marquee.has(lastName)
        ? { label: `${lastName} — photo secured`, hot: true } : undefined,
    });
  });

  // 3. Official card scans — EVERY card at the CDN's high-resolution
  // variant. No shortcuts on graphics: commons deserve device pixels too.
  const poke = await fetch('presets/pokemon-concept.json').then(r => r.json());
  let scansDone = 0, scansFailed = 0, hires = 0;
  const sets = (poke.sets ?? []) as {
    key: string; name: string; officialArt: string;
    cards: { num: number; name: string; rarity: string }[];
  }[];
  const grandTotal = sets.reduce((a, s) => a + s.cards.length, 0);
  for (const s of sets) {
    const nums = s.cards.map(c => c.num);
    const nameOf = new Map(s.cards.map(c => [c.num, c.name]));
    const hiresNums = new Set(nums);
    const hot = new Set(
      s.cards.filter(c => ['holo', 'chase'].includes(c.rarity)).map(c => c.num));
    const before = scansDone + scansFailed;
    const r = await importSetArt(s.key, s.officialArt, nums, (done, failed, lastNum) => {
      onProgress(`3/4 — ${s.name} scans… ${done + failed}/${nums.length}`);
      emit({
        stage: 3, stageName: STAGES[2], done: before + done + failed, total: grandTotal,
        highlight: lastNum !== undefined && hot.has(lastNum)
          ? { label: `${nameOf.get(lastNum)} — scan vaulted (hi-res)`, hot: true }
          : undefined,
      });
    }, hiresNums);
    scansDone += r.done;
    scansFailed += r.failed;
    hires += hiresNums.size;
  }

  // 3b. THE VAULT — real images of the top-30 grails per sport, from
  // CORS-verified public sources straight into the device cache.
  const vaultCards = new Map<string, string>();
  try {
    const vault = await fetch('presets/vault-art.json').then(x => x.json());
    const { world: w2 } = await import('../state/world');
    for (const vs of (await import('../engine/cards/tcg')).VAULT_SETS) {
      for (const c of vs.cards) vaultCards.set(`${vs.id.replace('tcg-', '')}:${c.num}`, `${c.name} — ${c.type}`);
    }
    // Sealed-pack photos ride the same manifest; give them ticker names.
    const wrapNames: Record<string, string> = {
      'wrap-base': 'Base Set sealed booster', 'wrap-151': '151 sealed booster',
      'wrap-currency': 'Currency S5 sealed pack',
    };
    for (const [wk, label] of Object.entries(wrapNames))
      for (let n = 0; n < 3; n++) vaultCards.set(`${wk}:${n}`, label);
    void w2;
    const vr = await importVaultArt(vault.sets ?? {}, (done, failed, total, lastKey) => {
      onProgress(`3/4 — THE VAULT… ${done + failed}/${total}`);
      emit({
        stage: 3, stageName: STAGES[2], done: grandTotal + done + failed, total: grandTotal + total,
        highlight: lastKey ? { label: `${vaultCards.get(lastKey) ?? lastKey} — GRAIL VAULTED`, hot: true } : undefined,
      });
    });
    scansDone += vr.done;
    scansFailed += vr.failed;
  } catch { /* manifest missing — vault art arrives next import */ }

  // 4. Unlock the TCG sets and decode everything into the card press.
  onProgress('4/4 — unlocking the vault…');
  emit({ stage: 4, stageName: STAGES[3], done: 0, total: 1 });
  useCollection.getState().enableTcg();
  await loadCachedScans();
  await loadCachedPhotos();
  // Bump the revision so every cached card re-renders with the real art.
  world.applyOverrides(world.currentOverrides);
  emit({
    stage: 4, stageName: STAGES[3], done: 1, total: 1,
    highlight: { label: 'Base Set · 151 · Currency — unlocked', hot: true },
  });

  return { photos, scans: { done: scansDone, failed: scansFailed }, hires };
}

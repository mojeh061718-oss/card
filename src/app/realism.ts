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

/**
 * Full-league rosters from the public league APIs, with each player's
 * headshot URL where the payload carries one. The curated ranked list in
 * the preset stays the head (it encodes who the STARS are); these fill
 * every remaining checklist slot so no card is left with an invented name.
 * Failures return empty lists — offline imports keep the curated head.
 */
async function fetchLeagueRosters(): Promise<{
  football: { name: string; photo: string | null }[];
  baseball: { name: string; photo: string | null }[];
}> {
  const football: { name: string; photo: string | null }[] = [];
  const baseball: { name: string; photo: string | null }[] = [];
  try {
    const teams = await fetch('https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/teams')
      .then(r => r.json());
    const ids: string[] = (teams.sports?.[0]?.leagues?.[0]?.teams ?? [])
      .map((t: { team: { id: string } }) => t.team.id);
    // Kickers, punters, snappers and interior linemen don't get cards.
    const EXCLUDE = new Set(['G', 'C', 'OG', 'OC', 'K', 'PK', 'P', 'LS', 'FB']);
    const perTeam = await Promise.all(ids.map(async id => {
      try {
        const d = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster`)
          .then(r => r.json());
        const out: { name: string; photo: string | null }[] = [];
        for (const g of d.athletes ?? []) {
          for (const a of g.items ?? []) {
            if (!a.displayName || EXCLUDE.has(a.position?.abbreviation ?? '')) continue;
            out.push({ name: a.displayName as string, photo: (a.headshot?.href as string) ?? null });
          }
        }
        return out;
      } catch { return []; }
    }));
    // Round-robin across teams so the depth tail mixes franchises.
    for (let i = 0; perTeam.some(t => i < t.length); i++) {
      for (const t of perTeam) if (i < t.length) football.push(t[i]);
    }
  } catch { /* tolerated */ }
  try {
    const teams = await fetch('https://statsapi.mlb.com/api/v1/teams?sportId=1').then(r => r.json());
    const ids: number[] = (teams.teams ?? []).map((t: { id: number }) => t.id);
    const perTeam = await Promise.all(ids.map(async id => {
      try {
        const d = await fetch(`https://statsapi.mlb.com/api/v1/teams/${id}/roster?rosterType=40Man`)
          .then(r => r.json());
        return ((d.roster ?? []) as { person: { id: number; fullName: string } }[]).map(r2 => ({
          name: r2.person.fullName,
          photo: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_640,q_auto:best/v1/people/${r2.person.id}/headshot/67/current`,
        }));
      } catch { return []; }
    }));
    for (let i = 0; perTeam.some(t => i < t.length); i++) {
      for (const t of perTeam) if (i < t.length) baseball.push(t[i]);
    }
  } catch { /* tolerated */ }
  return { football, baseball };
}

export async function runRealismImport(
  onProgress: (message: string) => void,
  onEvent?: (e: RealismEvent) => void,
): Promise<RealismSummary> {
  const emit = (e: RealismEvent) => onEvent?.(e);

  // 1. Names + colors for every team, and a real name for EVERY player
  // slot: curated stars at the head, live league rosters filling the rest.
  onProgress('1/4 — signing the leagues…');
  emit({ stage: 1, stageName: STAGES[0], done: 0, total: 1 });
  const raw = await fetch('presets/real-world.json').then(r => r.json());
  const live = await fetchLeagueRosters();
  const directPhoto = new Map<string, string>();
  raw.rosterByRank = raw.rosterByRank ?? {};
  for (const sport of ['football', 'baseball'] as const) {
    const slots = world.leagues[sport].players.length;
    const curated: string[] = raw.rosterByRank[sport] ?? [];
    const seen = new Set(curated.map(n => n.toLowerCase()));
    const ext = [...curated];
    for (const p of live[sport]) {
      if (ext.length >= slots) break;
      const k = p.name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      ext.push(p.name);
      if (p.photo) directPhoto.set(`${sport}:${p.name}`, p.photo);
    }
    raw.rosterByRank[sport] = ext;
  }
  const clean = sanitizeOverrides(raw).set;
  useCollection.getState().setOverrides(clean);
  const signed = (clean.rosterByRank.football?.length ?? 0) + (clean.rosterByRank.baseball?.length ?? 0);
  emit({
    stage: 1, stageName: STAGES[0], done: 1, total: 1,
    highlight: { label: `62 teams · ${signed} players signed`, hot: false },
  });

  // 2. Player photos: the curated head resolves through the search APIs
  // (best-quality picks); the league tail fetches its roster headshots
  // directly. The top of each list is marquee — those get ticker moments.
  const fbNames = (clean.rosterByRank.football ?? []) as string[];
  const bbNames = (clean.rosterByRank.baseball ?? []) as string[];
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
  }, directPhoto);

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

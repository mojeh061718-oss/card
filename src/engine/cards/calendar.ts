/**
 * The release calendar — new cardboard keeps coming.
 *
 * A deterministic schedule of product releases stretches out from day 1:
 * every ~45 days a new series hits shelves, alternating sports, rotating
 * through brand/line identities and ladder archetypes. Each release is a
 * pure function of the world seed and its index, so the schedule is
 * identical on every boot and only ever *extends* — never reshuffles.
 *
 * The first two releases are pinned to the original launch products so
 * existing saves keep their series ids and populations.
 */

import { Rng, childSeedN } from '../rng';
import type { Sport } from '../world/teams';

export interface Release {
  index: number;
  year: number;
  brand: string;
  line: string;
  sport: Sport;
  archetypeKey: string;
  releaseDay: number;
}

const BRANDS = ['Pinnacle Press', 'Apex', 'Crown & Ink', 'Halcyon', 'Meridian West'];
const LINES = [
  'Chromium', 'Prizmatic', 'Ignite', 'Obsidian', 'First Edition',
  'Skyline', 'Monolith', 'Vault', 'Cornerstone', 'Eclipse',
];
const ARCHETYPES = ['chromium', 'prizmatic', 'premium', 'heritage'];

const SPACING_DAYS = 45;

/** The k-th release on the calendar. */
export function releaseAt(worldSeed: bigint, k: number): Release {
  const releaseDay = 1 + k * SPACING_DAYS;
  const year = 2027 + Math.floor((releaseDay - 1) / 360);
  const sport: Sport = k % 2 === 0 ? 'football' : 'baseball';
  // Launch pair is pinned to day 1 — BOTH sports must be on the shelf from
  // the first morning, not football-only for 45 days.
  if (k === 0) return { index: 0, year: 2027, brand: 'Pinnacle Press', line: 'Chromium', sport, archetypeKey: 'chromium', releaseDay: 1 };
  if (k === 1) return { index: 1, year: 2027, brand: 'Apex', line: 'Prizmatic', sport: 'baseball', archetypeKey: 'prizmatic', releaseDay: 1 };

  // Brand/line walk is jitter-free so (year, brand, line, sport) — the
  // series id — cannot collide: the combo cycle is 10 sport-slots (~2.5
  // years), by which point the year in the id has moved on.
  const slot = Math.floor(k / 2);
  const brand = BRANDS[slot % BRANDS.length];
  const line = LINES[(slot * 7) % LINES.length];
  const rng = new Rng(childSeedN(worldSeed, 0xca1e0000 + k));
  const archetypeKey = ARCHETYPES[rng.int(ARCHETYPES.length)];
  return { index: k, year, brand, line, sport, archetypeKey, releaseDay };
}

/** Every release with releaseDay <= throughDay (plus `horizon` days ahead). */
export function releasesThrough(worldSeed: bigint, throughDay: number, horizon = 0): Release[] {
  const out: Release[] = [];
  for (let k = 0; ; k++) {
    const r = releaseAt(worldSeed, k);
    if (r.releaseDay > throughDay + horizon) break;
    out.push(r);
  }
  return out;
}

/** How long a product stays on the distributor sheet after release. */
export const SHELF_LIFE_DAYS = 150;

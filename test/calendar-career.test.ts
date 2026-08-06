/**
 * Release calendar + career sim guardrails.
 *
 * The calendar must be a pure, extend-only schedule with collision-free
 * series identities, pinned at launch to the original two products so old
 * saves keep their populations. The career sim must open neutral (hype 1.0
 * on day 1 — the calibrated market IS the opening market) and be a pure
 * function of (seed, player, day).
 */

import { describe, it, expect } from 'vitest';
import { seedFromText } from '../src/engine/rng';
import { releaseAt, releasesThrough } from '../src/engine/cards/calendar';
import { playerForm, hotMovers } from '../src/engine/world/career';
import { generateLeague } from '../src/engine/world/teams';

const SEED = seedFromText('career-dev');

describe('release calendar', () => {
  it('pins the launch pair to the original products', () => {
    const r0 = releaseAt(SEED, 0);
    const r1 = releaseAt(SEED, 1);
    expect(r0).toMatchObject({ year: 2027, brand: 'Pinnacle Press', line: 'Chromium', sport: 'football', releaseDay: 1 });
    expect(r1).toMatchObject({ year: 2027, brand: 'Apex', line: 'Prizmatic', sport: 'baseball', releaseDay: 1 });
  });

  it('produces collision-free series identities across a decade', () => {
    const releases = releasesThrough(SEED, 3600);
    const ids = releases.map(r => `${r.year}-${r.brand}-${r.line}-${r.sport}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(releases.length).toBeGreaterThan(70);
  });

  it('is deterministic and extend-only', () => {
    const a = releasesThrough(SEED, 900);
    const b = releasesThrough(SEED, 1800);
    expect(b.slice(0, a.length)).toEqual(a);
  });

  it('alternates sports so both hobbies keep getting product', () => {
    const releases = releasesThrough(SEED, 720);
    const football = releases.filter(r => r.sport === 'football').length;
    const baseball = releases.filter(r => r.sport === 'baseball').length;
    expect(Math.abs(football - baseball)).toBeLessThanOrEqual(1);
  });
});

describe('career sim', () => {
  const lg = generateLeague(SEED, 'football', 2027);
  const star = [...lg.players].sort((a, b) => b.talent - a.talent)[0];

  it('opens the market neutral: hype is exactly 1.0 for everyone on day 1', () => {
    for (const p of lg.players.slice(0, 200)) {
      expect(playerForm(SEED, p, 1).hype).toBe(1);
    }
  });

  it('is deterministic: same (seed, player, day) → same reading', () => {
    const a = playerForm(SEED, star, 100);
    const b = playerForm(SEED, star, 100);
    expect(a).toEqual(b);
  });

  it('moves values but never absurdly: hype stays within [0.5, 2.6]', () => {
    for (let day = 1; day <= 720; day += 13) {
      for (const p of lg.players.slice(0, 60)) {
        const { hype } = playerForm(SEED, p, day);
        expect(hype).toBeGreaterThanOrEqual(0.5);
        expect(hype).toBeLessThanOrEqual(2.6);
      }
    }
  });

  it('actually moves: some player is meaningfully hot or cold within a season', () => {
    let moved = false;
    for (let day = 30; day <= 180 && !moved; day += 7) {
      moved = lg.players.slice(0, 100).some(p => {
        const h = playerForm(SEED, p, day).hype;
        return h > 1.2 || h < 0.8;
      });
    }
    expect(moved).toBe(true);
  });

  it('surfaces weekly movers for the wire', () => {
    let any = 0;
    for (let day = 14; day <= 98; day += 7) {
      any += hotMovers(SEED, lg.players, day, 3).length;
    }
    expect(any).toBeGreaterThan(3);
  });
});

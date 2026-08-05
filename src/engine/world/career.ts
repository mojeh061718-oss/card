/**
 * Player career simulation — the reason card values move.
 *
 * Every player has a deterministic FORM curve over the calendar: a smooth
 * momentum line (value noise interpolated week to week), a career arc that
 * rises to a prime and decays, and rare seeded season events — breakouts,
 * injuries, slumps — that bend a whole stretch of the schedule.
 *
 * HYPE is form relative to the player's day-1 baseline, mapped to a
 * multiplier applied to card valuations. At day 1 hype is exactly 1.0 for
 * everyone, which keeps the calibration and wax-EV pins meaningful: the
 * *opening* market is the tuned market, and it moves from there.
 *
 * Everything is a pure function of (worldSeed, player, day) — no state, no
 * Math.random, no Date. Same save, same day, same prices.
 */

import { Rng, childSeed, childSeedN } from '../rng';
import type { Player } from './teams';

export interface FormReading {
  /** Current performance level, roughly talent-scaled 0..110. */
  form: number;
  /** Value multiplier vs the day-1 market. */
  hype: number;
  /** Sustained season event in effect today, if any. */
  event: 'breakout' | 'injury' | 'slump' | null;
}

const SEASON_DAYS = 180;

function playerSeed(worldSeed: bigint, player: Player): bigint {
  return childSeedN(childSeed(worldSeed, `career:${player.sport}`), player.id);
}

/** Smooth week-to-week momentum noise in [-1, 1]. */
function weekNoise(seed: bigint, week: number): number {
  return Rng.from(seed, `w:${week}`).float() * 2 - 1;
}

interface SeasonEvents {
  breakoutWeek: number | null;  // form +boost from that week to season end
  injuryWeek: number | null;    // form craters for 3 weeks
  slumpWeek: number | null;     // form sags for 5 weeks
  boost: number;
}

function seasonEvents(seed: bigint, season: number, player: Player): SeasonEvents {
  const rng = Rng.from(seed, `season:${season}`);
  const weeks = Math.floor(SEASON_DAYS / 7);
  // Young unproven players breakout; anyone can get hurt; stars can slump.
  const canBreakout = player.talent < 88;
  const breakout = canBreakout && rng.chance(0.09)
    ? rng.range(2, weeks - 6) : null;
  const injury = rng.chance(0.13) ? rng.range(1, weeks - 3) : null;
  const slump = rng.chance(0.12) ? rng.range(2, weeks - 5) : null;
  return {
    breakoutWeek: breakout,
    injuryWeek: injury,
    slumpWeek: slump,
    boost: 8 + rng.float() * 9,
  };
}

/** Raw form value on a given day (no baseline subtraction). */
function rawForm(worldSeed: bigint, player: Player, day: number): { form: number; event: FormReading['event'] } {
  const seed = playerSeed(worldSeed, player);
  const rng = new Rng(seed);
  const volatility = 4 + rng.float() * 8;          // per-player streakiness
  const primeAge = 26 + rng.float() * 3;

  // Career arc: age vs prime, in form points.
  const age = 2027 - player.bornYear + day / 365;
  const fromPrime = age - primeAge;
  const arc = fromPrime < 0
    ? fromPrime * 1.1          // still climbing toward the prime
    : -fromPrime * 1.7;        // decline is faster than the rise

  // Momentum: value noise across weeks, smooth-stepped inside the week.
  const w = Math.floor((day - 1) / 7);
  const frac = ((day - 1) % 7) / 7;
  const s = frac * frac * (3 - 2 * frac);
  const momentum = (weekNoise(seed, w) * (1 - s) + weekNoise(seed, w + 1) * s) * volatility;

  // Season events.
  const season = Math.floor((day - 1) / SEASON_DAYS);
  const weekInSeason = Math.floor(((day - 1) % SEASON_DAYS) / 7);
  const ev = seasonEvents(seed, season, player);
  let eventAdj = 0;
  let event: FormReading['event'] = null;
  if (ev.breakoutWeek !== null && weekInSeason >= ev.breakoutWeek) {
    eventAdj += ev.boost;
    event = 'breakout';
  }
  if (ev.slumpWeek !== null && weekInSeason >= ev.slumpWeek && weekInSeason < ev.slumpWeek + 5) {
    eventAdj -= ev.boost * 0.9;
    event = 'slump';
  }
  if (ev.injuryWeek !== null && weekInSeason >= ev.injuryWeek && weekInSeason < ev.injuryWeek + 3) {
    eventAdj -= 24;
    event = 'injury';
  }

  return { form: player.talent + arc + momentum + eventAdj, event };
}

/** Form + hype for a player on a day. Hype is 1.0 for everyone at day <= 1. */
export function playerForm(worldSeed: bigint, player: Player, day: number): FormReading {
  const today = rawForm(worldSeed, player, Math.max(1, day));
  if (day <= 1) return { form: today.form, hype: 1, event: today.event };
  const baseline = rawForm(worldSeed, player, 1).form;
  const delta = today.form - baseline;
  // Stars' hype swings matter more in dollars but less in multiple; the
  // exponent keeps a +20 form breakout from 10x-ing a card overnight.
  const hype = Math.min(2.6, Math.max(0.5, 1 + delta * 0.028));
  return { form: today.form, hype, event: today.event };
}

export interface Mover {
  player: Player;
  delta: number;        // week-over-week form change
  event: FormReading['event'];
}

/** Biggest week-over-week movers — the players worth a wire story today. */
export function hotMovers(
  worldSeed: bigint, players: Player[], day: number, count = 3,
): Mover[] {
  if (day <= 7) return [];
  const scored: Mover[] = [];
  for (const p of players) {
    const now = rawForm(worldSeed, p, day);
    const then = rawForm(worldSeed, p, day - 7);
    const delta = now.form - then.form;
    if (Math.abs(delta) >= 6 || now.event === 'injury' || now.event === 'breakout') {
      scored.push({ player: p, delta, event: now.event });
    }
  }
  return scored.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, count);
}

/** Deterministic stat line for a performance story. */
export function statLine(player: Player, day: number, up: boolean): string {
  const rng = Rng.from(childSeedN(BigInt(day), player.id), 'stat');
  if (player.sport === 'football') {
    const byPos: Record<string, string[]> = {
      QB: up
        ? [`throws for ${rng.range(310, 460)} and ${rng.range(3, 6)} scores`, `posts a perfect passer rating through three quarters`]
        : [`is picked off ${rng.range(2, 4)} times`, `is sacked ${rng.range(5, 9)} times in a blowout loss`],
      RB: up
        ? [`rushes for ${rng.range(140, 240)} and ${rng.range(2, 4)} touchdowns`, `breaks a ${rng.range(65, 95)}-yard run in the fourth`]
        : [`is held to ${rng.range(9, 28)} yards`, `loses a fumble at the goal line`],
      WR: up
        ? [`hauls in ${rng.range(9, 14)} catches for ${rng.range(150, 230)}`, `burns double coverage for ${rng.range(2, 3)} scores`]
        : [`is blanketed all afternoon — ${rng.range(1, 3)} catches`, `drops the game-winner in the corner`],
    };
    const lines = byPos[player.position] ?? (up
      ? [`dominates on national television`, `takes over the game in the second half`]
      : [`has a night to forget`, `is benched in the third quarter`]);
    return rng.pick(lines);
  }
  return up
    ? rng.pick([
      `goes ${rng.range(3, 4)}-for-4 with ${rng.range(2, 3)} homers`,
      `drives in ${rng.range(5, 7)} against first-place pitching`,
      `extends the hitting streak to ${rng.range(12, 22)} games`,
      `strikes out ${rng.range(11, 15)} over seven shutout innings`,
    ])
    : rng.pick([
      `is now ${rng.range(1, 4)} for the last ${rng.range(28, 44)}`,
      `gets pulled in the ${['2nd', '3rd', '4th'][rng.range(0, 2)]} after ${rng.range(6, 9)} earned`,
      `sits again with the injury lingering`,
    ]);
}

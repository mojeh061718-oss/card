/**
 * Card valuation and price discovery.
 *
 * There is a true intrinsic value, but the player never sees it — they see
 * *comps*: recent sales with real noise. Thin markets for rare cards mean
 * few comps and wide uncertainty, which is exactly where the gambling
 * thrill of the hobby lives.
 *
 * Intrinsic = playerHype × scarcity × parallelDesire × gradeMult × autoMult
 */

import { Rng, childSeed } from '../rng';
import type { Player } from '../world/teams';
import type { ParallelDef } from '../cards/parallels';
import type { GradeResult, GradingCompany } from '../condition/grading';

export interface ValuationInputs {
  player: Player;
  parallel: ParallelDef;
  isRookie: boolean;
  isAuto: boolean;
  /** Series-wide desirability multiplier (premium brands carry more). */
  setFactor: number;
  grade?: { result: GradeResult; company: GradingCompany } | null;
  /** Error cards are their own collectible axis. */
  errorKind?: string | null;
}

/**
 * Player hype: talent drives it superlinearly — the difference between a
 * star and a superstar is worth far more than the difference in talent.
 */
export function playerHype(player: Player): number {
  const t = Math.max(0, player.talent - 30) / 70; // 0..1
  return 1 + Math.pow(t, 3.2) * 260;
}

/** Grade multiplier. A 10 is worth a multiple of a 9, which is the hobby. */
export function gradeMultiplier(result: GradeResult, company: GradingCompany): number {
  const g = result.overall;
  let base: number;
  if (g >= 10) base = 7.5;
  else if (g >= 9.5) base = 3.4;
  else if (g >= 9) base = 2.1;
  else if (g >= 8.5) base = 1.5;
  else if (g >= 8) base = 1.2;
  else if (g >= 7) base = 0.85;
  else if (g >= 6) base = 0.6;
  else base = 0.4;
  // Company premium only really matters at the top of the scale.
  const premiumWeight = Math.max(0, (g - 8) / 2);
  return base * (1 + (company.premium - 1) * premiumWeight);
}

/** Intrinsic value in dollars. */
export function intrinsicValue(v: ValuationInputs): number {
  const hype = playerHype(v.player);
  // Scarcity: value scales with rarity but with diminishing exponent so a
  // 1/1 is extraordinary without being absurd relative to a /5.
  const scarcity = Math.pow(20000 / Math.max(1, v.parallel.printRun), 0.62);
  let value = 0.35 * hype * scarcity * Math.pow(v.parallel.desirability, 0.25);
  if (v.isRookie) value *= 2.6;      // rookie cards carry the hobby
  if (v.isAuto) value *= 4.2;
  value *= v.setFactor;
  if (v.grade) value *= gradeMultiplier(v.grade.result, v.grade.company);
  if (v.errorKind) value *= 1.8;     // errors are their own chase
  return Math.max(0.25, value);
}

export interface Comp {
  price: number;
  /** How long ago the sale happened, in in-game days. */
  daysAgo: number;
  /** Sale venue, shown in the comp list. */
  venue: 'auction' | 'marketplace' | 'private';
  /** Grade label at time of sale, e.g. "PSG 9" or "RAW". */
  gradeLabel: string;
}

/**
 * Generate the visible comp history for a card. Sparse for rare cards
 * (few copies exist to trade), dense for commons. Prices scatter around
 * intrinsic with heavy tails — the occasional whale overpay.
 */
export function generateComps(
  identityKey: string, intrinsic: number, printRun: number, _today: number,
  gradeLabel: string,
): Comp[] {
  const rng = new Rng(childSeed(0x51ced5eedn, identityKey));
  // Liquidity: how many sales the market has seen lately.
  const liquidity = Math.min(8, Math.max(0, Math.round(Math.log10(printRun + 1) * 2.2 - 0.5)));
  const n = liquidity === 0 ? 0 : rng.range(Math.max(1, liquidity - 2), liquidity);
  const comps: Comp[] = [];
  for (let i = 0; i < n; i++) {
    // Log-normal scatter: most near intrinsic, occasional blowout.
    const mult = Math.exp(rng.gaussian(0, 0.28)) * (rng.chance(0.08) ? 1.6 + rng.float() : 1);
    comps.push({
      price: Math.max(0.5, intrinsic * mult),
      daysAgo: rng.range(1, 90),
      venue: rng.pickWeighted(
        ['auction', 'marketplace', 'private'] as const, [3, 5, 1],
      ),
      gradeLabel,
    });
  }
  return comps.sort((a, b) => a.daysAgo - b.daysAgo);
}

/** Median of visible comps — what a collector would quote you. */
export function compValue(comps: Comp[]): number | null {
  if (comps.length === 0) return null;
  const sorted = comps.map(c => c.price).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Dealer quick-sell: instant cash at a haircut. Worse for illiquid cards. */
export function dealerOffer(intrinsic: number, compCount: number, rng: Rng): number {
  const base = compCount >= 3 ? 0.72 : compCount >= 1 ? 0.64 : 0.55;
  return Math.round(intrinsic * (base + rng.float() * 0.06) * 100) / 100;
}

export function formatMoney(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 10000) return `$${Math.round(n / 1000)}K`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  if (n >= 100) return `$${Math.round(n)}`;
  return `$${n.toFixed(2)}`;
}

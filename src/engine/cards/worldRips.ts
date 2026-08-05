/**
 * The rest of the hobby opens packs too.
 *
 * Without this, the player is the only person on earth ripping wax, so a
 * Superfractor stays sealed forever unless they personally beat 1-in-2000-case
 * odds. That is the wrong feeling: in the real hobby you almost never pull the
 * grail — you watch somebody else pull it, and then you go buy it.
 *
 * So every in-game day the world consumes from the same finite populations,
 * on a release-decay curve. Grails surface elsewhere, the Top 50's counts tick
 * up, the wire reports the pulls, and the cards become chaseable on the market.
 */

import type { Rng } from '../rng';
import type { Population } from './population';

/**
 * Cards the world opens on a given day of a product's life.
 *
 * Paced so a Superfractor surfaces somewhere every few days — often enough
 * that the Top 50 visibly fills in and grails reach the market, rare enough
 * that each one is still news. Release is a frenzy; the tail runs for years.
 */
export function dailyVolume(totalPrinted: number, ageDays: number): number {
  const peak = totalPrinted / 900;
  return Math.max(totalPrinted / 120000, peak * Math.exp(-Math.max(0, ageDays) / 400));
}

export interface WorldRipResult {
  /** Slot ids the world surfaced, with the serial each copy carries. */
  notable: { slotId: number; serial: number }[];
  opened: number;
}

/**
 * Consume a day of world ripping. `isNotable` marks the slots worth telling
 * the player about — everything else is decremented silently.
 *
 * Supply floor: the world never opens the last `reserveFraction` of a
 * population. A third of every print run stays sealed forever, so some
 * grails are never found by anyone — the board keeps its mystery.
 */
export function ripWorldDay(
  pop: Population, rng: Rng, totalPrinted: number, ageDays: number,
  isNotable: (slotId: number) => boolean,
  reserveFraction = 0.35,
): WorldRipResult {
  const floor = Math.ceil(totalPrinted * reserveFraction);
  const budget = Math.min(
    Math.round(dailyVolume(totalPrinted, ageDays)),
    Math.max(0, pop.totalRemaining - floor),
  );
  const notable: WorldRipResult['notable'] = [];
  let opened = 0;
  for (let i = 0; i < budget; i++) {
    if (pop.totalRemaining <= floor) break;
    // Serials are expensive; only mint one for a card worth reporting.
    const { slotId, copyIndex } = pop.drawIndex(rng);
    opened++;
    if (isNotable(slotId)) {
      notable.push({ slotId, serial: pop.serialFor(slotId, copyIndex) });
    }
  }
  return { notable, opened };
}

/**
 * Auctions — where thin markets get exciting.
 *
 * Bidders are drawn from NPC archetypes whose willingness-to-pay is sampled
 * around the card's intrinsic value with archetype-specific bias. The final
 * price is set by the *second*-highest bidder plus an increment (English
 * auction logic), which is what produces the two-whales-fighting outcome
 * that blows past comp — and the dead-quiet auction that ends at reserve.
 */

import { Rng } from '../rng';

export type BidderArchetype =
  | 'playerCollector'  // wants their guy at any price
  | 'setBuilder'       // needs it for a set, disciplined
  | 'flipper'          // buys under comp only
  | 'whale'            // chases trophies, deep pockets
  | 'shark';           // lowballs, hopes nobody shows

interface ArchetypeProfile {
  /** Multiplier on intrinsic they'd pay at most. */
  wtpMean: number;
  wtpSigma: number;
  /** Relative frequency in the bidder pool. */
  weight: number;
  /** Extra interest in trophy cards (low print runs). */
  trophyPull: number;
}

const PROFILES: Record<BidderArchetype, ArchetypeProfile> = {
  playerCollector: { wtpMean: 1.25, wtpSigma: 0.35, weight: 3, trophyPull: 0.3 },
  setBuilder: { wtpMean: 0.95, wtpSigma: 0.18, weight: 4, trophyPull: 0 },
  flipper: { wtpMean: 0.72, wtpSigma: 0.12, weight: 5, trophyPull: 0.1 },
  whale: { wtpMean: 1.7, wtpSigma: 0.5, weight: 1, trophyPull: 1 },
  shark: { wtpMean: 0.5, wtpSigma: 0.15, weight: 4, trophyPull: 0 },
};

const ALL: BidderArchetype[] = ['playerCollector', 'setBuilder', 'flipper', 'whale', 'shark'];

export interface Bid {
  bidder: string;
  archetype: BidderArchetype;
  amount: number;
  /** Seconds-from-end when placed; small values are snipes. */
  atSecondsLeft: number;
}

export interface AuctionResult {
  sold: boolean;
  finalPrice: number;
  bids: Bid[];
  bidderCount: number;
  /** True when the top two fought past 1.4× intrinsic. */
  biddingWar: boolean;
}

const NAMES = [
  'cardvault88', 'gridironGus', 'DiamondDaveC', 'thehobbyshark', 'PSGqueen',
  'rookiehunter', 'waxwolf', 'slabhoarder', 'chromedreams', 'nineties_kid',
  'BigBoxBrandon', 'patchwork', 'serialseeker', 'coldcorners', 'MintMitch',
  'refractorRon', 'thevaultkeeper', 'onepercenter', 'papertrail', 'sundayswaps',
];

/**
 * Run an auction. `interest` scales the bidder pool (hot players and low
 * print runs draw crowds); `reserve` is the seller's floor.
 */
export function runAuction(
  intrinsic: number, printRun: number, interest: number,
  reserve: number, rng: Rng,
): AuctionResult {
  // Pool size: liquid commons draw many small bidders; trophies draw few
  // but rich ones. Both can produce a war, for opposite reasons.
  const trophy = printRun <= 25 ? 1 : printRun <= 199 ? 0.5 : 0;
  const expected = 1.5 + interest * 5 + (trophy ? 1.5 : Math.log10(printRun + 1));
  const poolSize = Math.max(0, Math.round(rng.gaussian(expected, expected * 0.45)));

  const weights = ALL.map(a => PROFILES[a].weight + PROFILES[a].trophyPull * trophy * 6);
  const bidders: { name: string; archetype: BidderArchetype; wtp: number }[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < poolSize; i++) {
    const archetype = rng.pickWeighted(ALL, weights);
    const p = PROFILES[archetype];
    let name = rng.pick(NAMES);
    while (usedNames.has(name)) name = `${rng.pick(NAMES)}${rng.range(2, 99)}`;
    usedNames.add(name);
    const wtp = intrinsic * Math.max(0.1, rng.gaussian(p.wtpMean, p.wtpSigma));
    bidders.push({ name, archetype, wtp });
  }
  bidders.sort((a, b) => b.wtp - a.wtp);

  const serious = bidders.filter(b => b.wtp >= reserve);
  if (serious.length === 0) {
    return { sold: false, finalPrice: 0, bids: [], bidderCount: bidders.length, biddingWar: false };
  }

  // English auction: price settles just above the second-highest willingness.
  const top = serious[0];
  const second = serious[1];
  const increment = (p: number) => Math.max(1, p * 0.03);
  const finalPrice = second
    ? Math.min(top.wtp, second.wtp + increment(second.wtp))
    : Math.max(reserve, reserve * (1 + rng.float() * 0.08));

  // Reconstruct a plausible bid ladder for the UI, with late snipes.
  const bids: Bid[] = [];
  const ladderSize = Math.min(serious.length, 8);
  let price = Math.max(reserve * 0.7, finalPrice / Math.pow(1.35, ladderSize));
  for (let i = 0; i < ladderSize; i++) {
    const b = serious[Math.min(serious.length - 1, ladderSize - 1 - i)];
    price = Math.min(finalPrice, price * (1.15 + rng.float() * 0.35));
    // Later bids cluster into the final minutes — sniping is real.
    const t = Math.pow(1 - i / ladderSize, 2.4);
    bids.push({
      bidder: b.name,
      archetype: b.archetype,
      amount: Math.round(price * 100) / 100,
      atSecondsLeft: Math.round(t * 86400 * 3 + rng.float() * 60),
    });
  }
  if (bids.length > 0) bids[bids.length - 1].amount = Math.round(finalPrice * 100) / 100;

  return {
    sold: true,
    finalPrice: Math.round(finalPrice * 100) / 100,
    bids,
    bidderCount: bidders.length,
    biddingWar: !!second && finalPrice > intrinsic * 1.4,
  };
}

/** Marketplace fee taken off the top of any sale. */
export const MARKETPLACE_FEE = 0.12;
/** Consignment reaches whales but costs more. */
export const CONSIGNMENT_FEE = 0.2;

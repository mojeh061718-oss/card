/**
 * Sourcing — the treasure hunt.
 *
 * Lots are bulk cardboard of unknown contents: a shoebox from a garage
 * sale, an estate collection, a storage unit nobody opened. The hidden
 * variable that makes this a game is `pickedOver` — whether someone
 * already pulled the hits. You can't see it. You can only read the seller's
 * story, the price, and your own gut.
 *
 * Contents draw from the same finite populations as packs, so a grail
 * found in a shoebox is a grail genuinely removed from the world's supply.
 */

import { Rng, childSeed } from '../rng';

export type LotKind = 'shoebox' | 'garageSale' | 'estate' | 'storageUnit' | 'dealerTable';

export interface LotTemplate {
  kind: LotKind;
  label: string;
  /** Blurb pool — flavor that hints (unreliably) at what's inside. */
  blurbs: string[];
  cardRange: [number, number];
  priceRange: [number, number];
  /** Chance the hits are already gone. */
  pickedOverChance: number;
  /** Weight of hit-class draws when NOT picked over. */
  hitWeight: number;
  /** Chance of a genuinely special lot — the attic find. */
  jackpotChance: number;
}

export const LOT_TEMPLATES: LotTemplate[] = [
  {
    kind: 'shoebox', label: 'Shoebox',
    blurbs: [
      'Found in a closet. No idea what it is.',
      'My kid collected these years ago.',
      'Mixed cards, some look shiny.',
    ],
    cardRange: [40, 90], priceRange: [15, 60],
    pickedOverChance: 0.5, hitWeight: 0.008, jackpotChance: 0.02,
  },
  {
    kind: 'garageSale', label: 'Garage Sale Box',
    blurbs: [
      'Whole box, everything must go.',
      'Cleaning out the garage. Make an offer.',
      'Been in the attic since forever.',
    ],
    cardRange: [80, 200], priceRange: [30, 140],
    pickedOverChance: 0.45, hitWeight: 0.010, jackpotChance: 0.035,
  },
  {
    kind: 'estate', label: 'Estate Collection',
    blurbs: [
      'Estate of a lifelong collector. Untouched.',
      'Family is downsizing. Sold as-is.',
      'From a collection built over decades.',
    ],
    cardRange: [150, 400], priceRange: [200, 900],
    pickedOverChance: 0.3, hitWeight: 0.020, jackpotChance: 0.07,
  },
  {
    kind: 'storageUnit', label: 'Storage Unit',
    blurbs: [
      'Unit auction. Contents unverified.',
      'Locker went unpaid. Cards visible through the door.',
      'Bought the unit, found these inside.',
    ],
    cardRange: [100, 500], priceRange: [150, 1200],
    pickedOverChance: 0.55, hitWeight: 0.018, jackpotChance: 0.09,
  },
  {
    kind: 'dealerTable', label: 'Dealer Bulk Box',
    blurbs: [
      'Dealer clearing inventory at the show.',
      'Bulk box, dealer says he already searched it.',
      'End-of-show deal, priced to move.',
    ],
    cardRange: [60, 150], priceRange: [40, 200],
    pickedOverChance: 0.75, hitWeight: 0.009, jackpotChance: 0.015,
  },
];

export interface LotOffer {
  id: string;
  kind: LotKind;
  label: string;
  blurb: string;
  cardCount: number;
  price: number;
  seriesId: string;
  /** Hidden until dug. */
  pickedOver: boolean;
  jackpot: boolean;
  /** Seed driving the actual contents draw. */
  seed: bigint;
}

/** Generate the lots on offer for a given day. */
export function generateLotOffers(
  worldSeed: bigint, day: number, seriesIds: string[], count = 4,
): LotOffer[] {
  const rng = new Rng(childSeed(worldSeed, `lots:${day}`));
  const offers: LotOffer[] = [];
  for (let i = 0; i < count; i++) {
    const t = rng.pick(LOT_TEMPLATES);
    const cardCount = rng.range(t.cardRange[0], t.cardRange[1]);
    const jackpot = rng.chance(t.jackpotChance);
    const pickedOver = jackpot ? false : rng.chance(t.pickedOverChance);
    // Price scales with size, with seller-mood noise. A mispriced gem and an
    // overpriced dud both exist, and they look identical from outside.
    const sizeFactor = cardCount / t.cardRange[1];
    const price = Math.round(
      (t.priceRange[0] + (t.priceRange[1] - t.priceRange[0]) * sizeFactor)
      * (0.7 + rng.float() * 0.7),
    );
    offers.push({
      id: `${day}-${i}`,
      kind: t.kind,
      label: t.label,
      blurb: rng.pick(t.blurbs),
      cardCount,
      price,
      seriesId: rng.pick(seriesIds),
      pickedOver,
      jackpot,
      seed: childSeed(worldSeed, `lot:${day}:${i}`),
    });
  }
  return offers;
}

/**
 * Draw class weights for a lot's contents. Picked-over lots are almost pure
 * base; jackpots skew hard toward the good stuff.
 */
export function lotClassWeights(offer: LotOffer): { base: number; foil: number; numbered: number; auto: number } {
  const t = LOT_TEMPLATES.find(x => x.kind === offer.kind)!;
  if (offer.jackpot) {
    return { base: 0.90, foil: 0.065, numbered: 0.03, auto: 0.005 };
  }
  if (offer.pickedOver) {
    return { base: 0.995, foil: 0.005, numbered: 0, auto: 0 };
  }
  const hit = t.hitWeight;
  return {
    base: 1 - hit * 3,
    foil: hit * 2,
    numbered: hit * 0.9,
    auto: hit * 0.1,
  };
}

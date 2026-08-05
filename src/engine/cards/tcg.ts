/**
 * TCG sets as first-class series — the vintage-market game.
 *
 * The same invariants as the sports engine: finite Populations drawn
 * without replacement (the world genuinely runs out of 1st Edition
 * Charizards), Feistel copy serials for deterministic per-copy condition,
 * and pure functions of seeds throughout.
 *
 * A booster is 11 cards with the real structure: 7 commons, 3 uncommons,
 * and one rare slot that hits a HOLO 1 in 3 (Base Set) — plus, in the
 * modern set, a secret-rare chase that replaces the rare slot at long
 * odds. Valuation is authored per card (raw near-mint) and multiplied by
 * a vintage grading curve: a gem-mint slab of a 1st Edition holo is a
 * different asset class from the raw card, exactly like the real hobby.
 */

import { Rng, childSeed, hashString } from '../rng';
import { Population, type DrawResult } from './population';
import type { PulledCard } from './series';
import { TCG_SETS, VAULT_SETS, type TcgCardData, type TcgSetData } from './tcgdata';

export type { TcgCardData, TcgSetData };
export { TCG_SETS, VAULT_SETS };

/** Ladder rung per rarity — slotId = cardIndex * 5 + rung. */
export const TCG_RUNGS = ['common', 'uncommon', 'rare', 'holo', 'chase'] as const;
export const TCG_P = TCG_RUNGS.length;

export function tcgRung(rarity: TcgCardData['rarity']): number {
  return TCG_RUNGS.indexOf(rarity);
}

export interface TcgClasses {
  common: number[];
  uncommon: number[];
  /** Non-holo rares (and rare trainers). */
  rare: number[];
  holo: number[];
  chase: number[];
}

export function tcgClasses(set: TcgSetData): TcgClasses {
  const out: TcgClasses = { common: [], uncommon: [], rare: [], holo: [], chase: [] };
  set.cards.forEach((card, index) => {
    out[card.rarity].push(index * TCG_P + tcgRung(card.rarity));
  });
  return out;
}

export function tcgPopulation(set: TcgSetData, worldSeed: bigint): Population {
  // Population requires DENSE slot ids 0..n-1, so every (card × rung) slot
  // exists; a card only prints copies on its own rarity rung, the rest sit
  // at zero and can never draw.
  const slots = set.cards.flatMap((card, index) =>
    TCG_RUNGS.map((_, rung) => ({
      slotId: index * TCG_P + rung,
      printed: rung === tcgRung(card.rarity) ? card.printRun : 0,
    })));
  return new Population(slots, childSeed(worldSeed, `tcg-pop:${set.id}`));
}

export function tcgCardOf(set: TcgSetData, cardIndex: number): TcgCardData {
  return set.cards[cardIndex];
}

function toPull(set: TcgSetData, d: DrawResult): PulledCard {
  return {
    seriesId: set.id,
    cardIndex: Math.floor(d.slotId / TCG_P),
    parallelId: d.slotId % TCG_P,
    serial: d.serial,
    numberedTo: null, // vintage cards carry no serial stamp
  };
}

export const TCG_CARDS_PER_PACK = 11;
export const TCG_PACKS_PER_BOX = 36;
/** Base Set rare slot goes holo 1 in 3 — the number every collector knows. */
const HOLO_ODDS = 1 / 3;
/** Modern chase replaces the rare slot at 1:150 packs. */
const CHASE_ODDS = 1 / 150;

/**
 * Open one booster with the real slot structure. Draws are without
 * replacement from the shared population; when a class runs dry the slot
 * falls back down the rarity ladder rather than shorting the pack.
 */
export function openTcgPack(
  set: TcgSetData, pop: Population, classes: TcgClasses, rng: Rng,
): PulledCard[] {
  const draw = (ids: number[]): PulledCard | null => {
    const d = pop.drawFrom(rng, ids);
    return d ? toPull(set, d) : null;
  };
  const fallback = (...tiers: number[][]): PulledCard | null => {
    for (const ids of tiers) {
      const p = draw(ids);
      if (p) return p;
    }
    return null;
  };
  const out: PulledCard[] = [];
  for (let i = 0; i < 7; i++) {
    const p = fallback(classes.common, classes.uncommon, classes.rare);
    if (p) out.push(p);
  }
  for (let i = 0; i < 3; i++) {
    const p = fallback(classes.uncommon, classes.common, classes.rare);
    if (p) out.push(p);
  }
  // The rare slot: chase (modern only) → holo → rare, honest odds.
  const wantChase = classes.chase.length > 0 && rng.chance(CHASE_ODDS);
  const wantHolo = rng.chance(HOLO_ODDS);
  const rareSlot = (wantChase && draw(classes.chase))
    || (wantHolo && draw(classes.holo))
    || fallback(classes.rare, classes.holo, classes.uncommon, classes.common);
  if (rareSlot) out.push(rareSlot);
  // Reveal order: cheapest first, the hit last — the drama is the point.
  return out.sort((a, b) =>
    tcgCardOf(set, a.cardIndex).value - tcgCardOf(set, b.cardIndex).value);
}

export function openTcgBox(
  set: TcgSetData, pop: Population, classes: TcgClasses, rng: Rng,
): PulledCard[][] {
  return Array.from({ length: TCG_PACKS_PER_BOX }, () => openTcgPack(set, pop, classes, rng));
}

/**
 * Vintage grading curve: multiplier on the raw NM value by overall grade.
 * Tuned to the real shape of the market — a 10 is a different asset, a 9
 * roughly doubles, an 8 barely moves, and damaged goods trade at a
 * fraction of raw.
 */
export function tcgGradeMultiplier(overall: number, companyPremium: number): number {
  const base = overall >= 10 ? 8.5
    : overall >= 9.5 ? 4
      : overall >= 9 ? 2.2
        : overall >= 8.5 ? 1.5
          : overall >= 8 ? 1.15
            : overall >= 7 ? 0.85
              : overall >= 6 ? 0.6
                : 0.4;
  // Company reputation moves the top end far more than the bottom.
  const rep = 1 + (companyPremium - 1) * (overall >= 9 ? 0.6 : 0.15);
  return base * rep;
}

/** Deterministic per-copy identity seed (condition, comps). */
export function tcgCopySeed(set: TcgSetData, cardIndex: number, serial: number): bigint {
  return childSeed(hashString(`${set.id}:${cardIndex}`), `copy:${serial}`);
}

export interface TcgProductConfig {
  key: 'tcg-pack' | 'tcg-box';
  name: string;
  cardsPerPack: number;
  packs: number;
  msrp: number;
}

export function tcgProducts(set: TcgSetData): TcgProductConfig[] {
  return [
    { key: 'tcg-pack', name: 'Booster Pack', cardsPerPack: TCG_CARDS_PER_PACK, packs: 1, msrp: set.packPrice },
    { key: 'tcg-box', name: 'Booster Box', cardsPerPack: TCG_CARDS_PER_PACK, packs: TCG_PACKS_PER_BOX, msrp: set.boxPrice },
  ];
}

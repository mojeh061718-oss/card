/**
 * TCG engine guardrails — the vintage-market game must be honest.
 *
 * Pack structure, holo/chase odds, set separation (a Base booster can never
 * yield a 151 card), authored value coverage, and the vintage grading curve
 * are all pinned here. Everything is a pure function of seeds, so these
 * tests are exact, not flaky.
 */

import { describe, it, expect } from 'vitest';
import { Rng, seedFromText } from '../src/engine/rng';
import {
  TCG_SETS, TCG_CARDS_PER_PACK, TCG_PACKS_PER_BOX,
  tcgClasses, tcgPopulation, tcgCardOf, tcgRung,
  openTcgPack, openTcgBox, tcgGradeMultiplier, tcgProducts,
} from '../src/engine/cards/tcg';

const SEED = seedFromText('tcg-test');
const base = TCG_SETS.find(s => s.id === 'tcg-base')!;
const modern = TCG_SETS.find(s => s.id === 'tcg-151')!;

describe('tcg data', () => {
  it('carries both sets with full checklists', () => {
    expect(base.cards.length).toBe(102);
    // 151 checklist: all 151 creatures plus the secret-rare chase, numbered
    // out of the set's printed size (165).
    expect(modern.cards.length).toBe(152);
    expect(modern.size).toBe(165);
    expect(modern.cards.some(c => c.rarity === 'chase' && c.num > modern.size)).toBe(true);
  });

  it('every card has an honest value and print run', () => {
    for (const set of TCG_SETS) {
      for (const card of set.cards) {
        expect(card.value).toBeGreaterThan(0);
        expect(card.printRun).toBeGreaterThan(0);
      }
    }
  });

  it('prices Base Set like 1st Edition vintage with the holo Charizard chase', () => {
    expect(base.packPrice).toBeGreaterThanOrEqual(1000); // packs go for thousands
    expect(base.boxPrice).toBeGreaterThanOrEqual(50000); // boxes for tens of thousands
    const zard = base.cards.find(c => c.name === 'Charizard')!;
    expect(zard.rarity).toBe('holo');
    // The most valuable card in the set, by a wide margin.
    const rest = base.cards.filter(c => c !== zard);
    expect(zard.value).toBeGreaterThan(Math.max(...rest.map(c => c.value)) * 3);
  });

  it('duplicate names across sets never collide (separate populations)', () => {
    // Same creature, different set: distinct series ids keep them apart.
    expect(base.id).not.toBe(modern.id);
    expect(tcgProducts(base)[0].msrp).toBe(base.packPrice);
    expect(tcgProducts(modern)[0].msrp).toBe(modern.packPrice);
  });
});

describe('tcg packs', () => {
  it('opens 11-card boosters with the 7/3/1 structure', () => {
    const pop = tcgPopulation(base, SEED);
    const classes = tcgClasses(base);
    const rng = new Rng(seedFromText('pack-structure'));
    for (let i = 0; i < 50; i++) {
      const pack = openTcgPack(base, pop, classes, rng);
      expect(pack.length).toBe(TCG_CARDS_PER_PACK);
      const rungs = pack.map(p => tcgCardOf(base, p.cardIndex).rarity);
      expect(rungs.filter(r => r === 'common').length).toBe(7);
      expect(rungs.filter(r => r === 'uncommon').length).toBe(3);
      expect(rungs.filter(r => r === 'rare' || r === 'holo').length).toBe(1);
    }
  });

  it('every pull stays inside its own set', () => {
    const pop = tcgPopulation(base, SEED);
    const classes = tcgClasses(base);
    const rng = new Rng(seedFromText('separation'));
    const packs = openTcgBox(base, pop, classes, rng);
    expect(packs.length).toBe(TCG_PACKS_PER_BOX);
    for (const pack of packs.flat()) {
      expect(pack.seriesId).toBe('tcg-base');
      expect(pack.cardIndex).toBeLessThan(base.cards.length);
      // parallelId encodes the card's own rarity rung — no cross-set rungs.
      expect(pack.parallelId).toBe(tcgRung(tcgCardOf(base, pack.cardIndex).rarity));
    }
  });

  it('hits holos roughly 1 in 3 rare slots on Base Set', () => {
    const pop = tcgPopulation(base, SEED);
    const classes = tcgClasses(base);
    const rng = new Rng(seedFromText('holo-odds'));
    let holos = 0;
    const N = 900;
    for (let i = 0; i < N; i++) {
      const pack = openTcgPack(base, pop, classes, rng);
      if (pack.some(p => tcgCardOf(base, p.cardIndex).rarity === 'holo')) holos++;
    }
    expect(holos / N).toBeGreaterThan(0.26);
    expect(holos / N).toBeLessThan(0.41);
  });

  it('hits the modern chase at long odds, and never in Base Set', () => {
    expect(tcgClasses(base).chase.length).toBe(0);
    const pop = tcgPopulation(modern, SEED);
    const classes = tcgClasses(modern);
    expect(classes.chase.length).toBeGreaterThan(0);
    const rng = new Rng(seedFromText('chase-odds'));
    let chases = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const pack = openTcgPack(modern, pop, classes, rng);
      if (pack.some(p => tcgCardOf(modern, p.cardIndex).rarity === 'chase')) chases++;
    }
    // 1:150 → expect ~20 in 3000; allow wide but honest bounds.
    expect(chases).toBeGreaterThan(4);
    expect(chases).toBeLessThan(50);
  });

  it('draws without replacement — serials never repeat per card', () => {
    const pop = tcgPopulation(base, SEED);
    const classes = tcgClasses(base);
    const rng = new Rng(seedFromText('serials'));
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      for (const p of openTcgPack(base, pop, classes, rng)) {
        const key = `${p.cardIndex}:${p.serial}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('reveals cheapest-first so the hit lands last', () => {
    const pop = tcgPopulation(base, SEED);
    const classes = tcgClasses(base);
    const rng = new Rng(seedFromText('reveal-order'));
    for (let i = 0; i < 20; i++) {
      const pack = openTcgPack(base, pop, classes, rng);
      const values = pack.map(p => tcgCardOf(base, p.cardIndex).value);
      expect([...values].sort((a, b) => a - b)).toEqual(values);
    }
  });
});

describe('tcg grading curve', () => {
  it('rewards gems and punishes damage', () => {
    expect(tcgGradeMultiplier(10, 1)).toBe(8.5);
    expect(tcgGradeMultiplier(9.5, 1)).toBe(4);
    expect(tcgGradeMultiplier(9, 1)).toBe(2.2);
    expect(tcgGradeMultiplier(8, 1)).toBe(1.15);
    expect(tcgGradeMultiplier(5, 1)).toBe(0.4);
  });

  it('company premium moves the top end more than the bottom', () => {
    const topLift = tcgGradeMultiplier(10, 1.3) / tcgGradeMultiplier(10, 1);
    const lowLift = tcgGradeMultiplier(6, 1.3) / tcgGradeMultiplier(6, 1);
    expect(topLift).toBeGreaterThan(lowLift);
  });

  it('a gem-mint 1st Edition Charizard is a six-figure asset', () => {
    const zard = base.cards.find(c => c.name === 'Charizard')!;
    expect(zard.value * tcgGradeMultiplier(10, 1.3)).toBeGreaterThan(100000);
  });
});

/**
 * Wax must be a gamble, not a job.
 *
 * Sealed product is priced to be -EV on the mean and sharply -EV on the
 * median: most boxes lose money and a few pay for the year. If a tuning
 * change ever makes ripping a reliable profit, buying wax becomes the
 * dominant strategy and every other system in the game stops mattering —
 * so these bounds are load-bearing, not cosmetic.
 */

import { describe, it, expect } from 'vitest';
import { seedFromText, Rng, childSeed } from '../src/engine/rng';
import { generateLeague } from '../src/engine/world/teams';
import {
  buildSeries, makePopulation, openBox, renderInputs, PRODUCTS,
} from '../src/engine/cards/series';
import { intrinsicValue } from '../src/engine/economy/valuation';

const SEED = seedFromText('career-dev');
const lg = generateLeague(SEED, 'football', 2027);
const def = buildSeries(SEED, 2027, 'Pinnacle Press', 'Chromium', 'football', lg.players, 'chromium');
const setFactor = 1 + (20000 / def.archetype.baseRunPerCard) * 0.05;

function sampleProduct(key: string, n: number): number[] {
  const product = PRODUCTS.find(p => p.key === key)!;
  const pop = makePopulation(def);
  const rng = new Rng(childSeed(SEED, `ev:${key}`));
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const pack of openBox(def, pop, rng, product)) {
      for (const c of pack) {
        const { player, card, parallel } = renderInputs(def, c, lg.players, lg.teams);
        v += intrinsicValue({
          player, parallel, isRookie: card.isRookie, isAuto: card.isAuto, setFactor,
        });
      }
    }
    values.push(v);
  }
  return values.sort((a, b) => a - b);
}

const stats = (v: number[]) => ({
  mean: v.reduce((a, b) => a + b, 0) / v.length,
  median: v[Math.floor(v.length / 2)],
  p90: v[Math.floor(v.length * 0.9)],
  max: v[v.length - 1],
});

describe('wax expected value', () => {
  it('a hobby pack loses money on the median and on the mean', () => {
    const msrp = PRODUCTS.find(p => p.key === 'hobbyPack')!.msrp;
    const s = stats(sampleProduct('hobbyPack', 2000));
    expect(s.median).toBeLessThan(msrp * 0.6);
    expect(s.mean).toBeLessThan(msrp);
  });

  it('a hobby box loses money on the median and on the mean', () => {
    const msrp = PRODUCTS.find(p => p.key === 'hobbyBox')!.msrp;
    const s = stats(sampleProduct('hobbyBox', 300));
    expect(s.median).toBeLessThan(msrp * 0.75);
    expect(s.mean).toBeLessThan(msrp);
  });

  it('but the tail is real — some boxes pay for the year', () => {
    const msrp = PRODUCTS.find(p => p.key === 'hobbyBox')!.msrp;
    const s = stats(sampleProduct('hobbyBox', 300));
    expect(s.max).toBeGreaterThan(msrp * 6);
    expect(s.p90).toBeGreaterThan(msrp * 0.9);
  });

  it('a box beats the same money in loose packs on guarantees alone', () => {
    // 12 packs' worth of cash spent on singles vs. one box: the box should
    // win on the low end, because guarantees are what you're paying for.
    const box = PRODUCTS.find(p => p.key === 'hobbyBox')!;
    const pack = PRODUCTS.find(p => p.key === 'hobbyPack')!;
    const boxMedian = stats(sampleProduct('hobbyBox', 200)).median;
    const packMedian = stats(sampleProduct('hobbyPack', 2000)).median;
    const packsForBoxPrice = box.msrp / pack.msrp;
    expect(boxMedian).toBeGreaterThan(packMedian * packsForBoxPrice);
  });

  it('every product is priced above its own mean return', () => {
    for (const product of PRODUCTS) {
      // Cases are slow to sample but heavy-tailed, so give them more runs.
      const n = product.packs > 20 ? 120 : product.packs > 1 ? 250 : 1500;
      const s = stats(sampleProduct(product.key, n));
      expect(s.mean, `${product.key} mean $${s.mean.toFixed(0)} vs msrp $${product.msrp}`)
        .toBeLessThan(product.msrp);
    }
  });
});

/**
 * The rest of the hobby has to rip too.
 *
 * Pulling a specific Superfractor yourself is a 1-in-2000-case proposition,
 * which is correct and should stay correct. What makes those cards chaseable
 * is that other collectors open wax on the same finite populations, so grails
 * surface, hit the market, and can be bought. These tests pin that the world
 * consumes at a believable rate and never exhausts the supply.
 */

import { describe, it, expect } from 'vitest';
import { Rng, seedFromText, childSeed } from '../src/engine/rng';
import { generateLeague } from '../src/engine/world/teams';
import { buildSeries, makePopulation, seriesSlots } from '../src/engine/cards/series';
import { ripWorldDay, dailyVolume } from '../src/engine/cards/worldRips';

const SEED = seedFromText('career-dev');
const lg = generateLeague(SEED, 'football', 2027);
const def = buildSeries(SEED, 2027, 'Pinnacle Press', 'Chromium', 'football', lg.players, 'chromium');
const totalPrinted = seriesSlots(def).reduce((a, s) => a + s.printed, 0);
const P = def.ladder.length;

const isOneOfOne = (slotId: number) => def.ladder[slotId % P].printRun === 1;

describe('world consumption', () => {
  it('opens hardest at release and tapers over years, not months', () => {
    const release = dailyVolume(totalPrinted, 0);
    const midSeason = dailyVolume(totalPrinted, 150);
    const nextYear = dailyVolume(totalPrinted, 400);
    const oldNews = dailyVolume(totalPrinted, 900);
    // Monotonic decay...
    expect(release).toBeGreaterThan(midSeason);
    expect(midSeason).toBeGreaterThan(nextYear);
    expect(nextYear).toBeGreaterThan(oldNews);
    // ...but gentle enough that a product is still being opened a year on.
    expect(midSeason).toBeGreaterThan(release * 0.5);
    expect(release).toBeGreaterThan(oldNews * 4);
    expect(oldNews).toBeGreaterThan(0);
  });

  it('surfaces 1/1s at a pace a career can actually chase', () => {
    const pop = makePopulation(def);
    const rng = new Rng(childSeed(SEED, 'world'));
    let found = 0;
    for (let day = 0; day < 365; day++) {
      found += ripWorldDay(pop, rng, totalPrinted, day, isOneOfOne).notable.length;
    }
    // Over a season the world should turn up a meaningful handful of 1/1s —
    // enough that the Top 50 comes alive, not so many they stop mattering.
    expect(found).toBeGreaterThan(3);
    expect(found).toBeLessThan(60);
  });

  it('never exhausts the population — sealed wax stays meaningful', () => {
    const pop = makePopulation(def);
    const rng = new Rng(childSeed(SEED, 'world2'));
    for (let day = 0; day < 4000; day++) {
      ripWorldDay(pop, rng, totalPrinted, day, isOneOfOne);
    }
    const remainingFrac = pop.totalRemaining / totalPrinted;
    expect(remainingFrac).toBeGreaterThanOrEqual(0.34);
  });

  it('leaves plenty of 1/1s unfound after a full career', () => {
    const pop = makePopulation(def);
    const rng = new Rng(childSeed(SEED, 'world3'));
    let found = 0;
    for (let day = 0; day < 365 * 5; day++) {
      found += ripWorldDay(pop, rng, totalPrinted, day, isOneOfOne).notable.length;
    }
    const totalOnes = seriesSlots(def)
      .filter(s => s.printed > 0 && def.ladder[s.slotId % P].printRun === 1).length;
    // Five seasons in, a real share of the crowns are still sealed — the
    // board should never read as fully solved.
    expect(found).toBeLessThan(totalOnes * 0.8);
    expect(found).toBeGreaterThan(totalOnes * 0.1);
  });

  it('respects the population — never draws more than exists', () => {
    const pop = makePopulation(def);
    const rng = new Rng(childSeed(SEED, 'world4'));
    let opened = 0;
    for (let day = 0; day < 2000; day++) {
      opened += ripWorldDay(pop, rng, totalPrinted, day, isOneOfOne).opened;
    }
    expect(opened).toBeLessThanOrEqual(totalPrinted);
    expect(pop.totalRemaining).toBeGreaterThan(0);
  });
});

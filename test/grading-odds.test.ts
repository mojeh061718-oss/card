/**
 * Grading has to feel like a mystery without being a slot machine.
 *
 * The contract: a clean card is a near-lock, a flawed card is a real
 * gamble, and the surprise is always earned by something actually on the
 * cardboard. Above all, a 1/1 must not come back chewed — those cards are
 * made carefully and handled carefully, and the generator must respect it.
 */

import { describe, it, expect } from 'vitest';
import { seedFromText, childSeedN } from '../src/engine/rng';
import { conditionFor, pressProfile, careFactor } from '../src/engine/condition/condition';
import { gradeCard, mishapChance, flawPressure, COMPANIES } from '../src/engine/condition/grading';

const SEED = seedFromText('grade-odds');
const press = pressProfile(SEED);
const psg = COMPANIES.find(c => c.key === 'psg')!;

/** Grade N copies of a tier and report how often they gem. */
function gemRate(printRun: number, n = 600, company = psg): number {
  let gems = 0;
  for (let i = 1; i <= n; i++) {
    const cond = conditionFor(SEED, 7, 3, i, press, printRun);
    if (gradeCard(cond, company, childSeedN(SEED, i)).overall === 10) gems++;
  }
  return gems / n;
}

describe('care scales with scarcity', () => {
  it('rarer tiers are made and handled better', () => {
    expect(careFactor(1)).toBeLessThan(careFactor(5));
    expect(careFactor(5)).toBeLessThan(careFactor(99));
    expect(careFactor(99)).toBeLessThan(careFactor(20000));
  });

  it('a 1/1 is essentially always a gem', () => {
    const rate = gemRate(1, 400);
    expect(rate).toBeGreaterThan(0.9);
  });

  it('a 1/1 never comes back badly damaged', () => {
    for (let i = 1; i <= 400; i++) {
      const cond = conditionFor(SEED, 7, 11, i, press, 1);
      const g = gradeCard(cond, psg, childSeedN(SEED, i));
      expect(g.overall).toBeGreaterThanOrEqual(9);
    }
  });

  it('gem rate falls off steadily as print runs grow', () => {
    const one = gemRate(1, 300);
    const low = gemRate(25, 400);
    const mid = gemRate(299, 500);
    const base = gemRate(20000, 600);
    expect(one).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(base);
    // Base commons are a genuine lottery — most are not 10s.
    expect(base).toBeLessThan(0.45);
  });
});

describe('the mishap is earned, never free', () => {
  const pristine = {
    offX: 0, offY: 0, corners: [0, 0, 0, 0] as [number, number, number, number],
    edges: [0, 0, 0, 0] as [number, number, number, number],
    scratches: 0, printLines: 0, printDots: 0, error: null,
  };
  const offCenter = { ...pristine, offX: 0.021 };
  const softCorner = {
    ...pristine, corners: [0.3, 0.02, 0.02, 0.02] as [number, number, number, number],
  };

  it('a pristine card carries almost no risk', () => {
    expect(flawPressure(pristine)).toBe(0);
    expect(mishapChance(pristine, psg)).toBeLessThan(0.04);
  });

  it('centering is the flaw that hurts most', () => {
    expect(flawPressure(offCenter)).toBeGreaterThan(flawPressure(softCorner));
    expect(mishapChance(offCenter, psg)).toBeGreaterThan(mishapChance(pristine, psg) * 6);
  });

  it('an off-center card really can lose its 10', () => {
    let tens = 0;
    for (let i = 0; i < 400; i++) {
      if (gradeCard(offCenter, psg, childSeedN(SEED, 900 + i)).overall === 10) tens++;
    }
    // Possible, but far from a lock.
    expect(tens / 400).toBeLessThan(0.5);
  });

  it('strict houses find more of what is there', () => {
    const strict = COMPANIES.find(c => c.key === 'bvs')!;
    const lenient = COMPANIES.find(c => c.key === 'qcg')!;
    expect(mishapChance(offCenter, strict)).toBeGreaterThan(mishapChance(offCenter, lenient));
  });

  it('graders stay consistent — the same card lands in a tight band', () => {
    const grades = new Set<number>();
    for (let i = 0; i < 60; i++) {
      grades.add(gradeCard(pristine, psg, childSeedN(SEED, 5000 + i)).overall);
    }
    // A clean card should not scatter across half the scale.
    expect(Math.max(...grades) - Math.min(...grades)).toBeLessThanOrEqual(2);
  });
});

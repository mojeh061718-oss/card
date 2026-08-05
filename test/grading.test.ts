import { describe, it, expect } from 'vitest';
import { conditionFor, pressProfile, centeringSplit } from '../src/engine/condition/condition';
import { gradeCard, rawSubs, COMPANIES } from '../src/engine/condition/grading';
import { seedFromText, childSeedN } from '../src/engine/rng';

const SEED = seedFromText('grading-test');

describe('condition generation', () => {
  it('is deterministic per copy identity', () => {
    const prof = pressProfile(SEED);
    const a = conditionFor(SEED, 10, 3, 47, prof);
    const b = conditionFor(SEED, 10, 3, 47, prof);
    expect(a).toEqual(b);
  });

  it('different copies of the same card differ', () => {
    const prof = pressProfile(SEED);
    const a = conditionFor(SEED, 10, 3, 47, prof);
    const b = conditionFor(SEED, 10, 3, 48, prof);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('press profiles measurably shift outcomes', () => {
    // Find a notoriously bad press vs a clean one across candidate seeds.
    const profiles = Array.from({ length: 40 }, (_, i) => pressProfile(childSeedN(SEED, i)));
    profiles.sort((a, b) => a.centeringSigma - b.centeringSigma);
    const clean = profiles[0], dirty = profiles[profiles.length - 1];
    let cleanOff = 0, dirtyOff = 0;
    const N = 800;
    for (let s = 1; s <= N; s++) {
      cleanOff += Math.abs(conditionFor(SEED, 1, 1, s, clean).offX);
      dirtyOff += Math.abs(conditionFor(SEED, 1, 1, s, dirty).offX);
    }
    expect(dirtyOff / N).toBeGreaterThan(cleanOff / N * 1.5);
  });

  it('factory errors are rare but exist', () => {
    const prof = { ...pressProfile(SEED), errorRate: 0.001 };
    let errors = 0;
    for (let s = 1; s <= 20000; s++) {
      if (conditionFor(SEED, 2, 0, s, prof).error) errors++;
    }
    expect(errors).toBeGreaterThan(3);
    expect(errors).toBeLessThan(60);
  });

  it('centering splits read like the hobby', () => {
    expect(centeringSplit(0)).toBe('50/50');
    expect(centeringSplit(0.02)).toBe('60/40');
    expect(centeringSplit(-0.02)).toBe('40/60');
  });
});

describe('grading', () => {
  it('perfect condition grades at or near gem from every company', () => {
    const perfect = {
      offX: 0, offY: 0, corners: [0, 0, 0, 0] as [number, number, number, number],
      edges: [0, 0, 0, 0] as [number, number, number, number],
      scratches: 0, printLines: 0, printDots: 0, error: null,
    };
    for (const co of COMPANIES) {
      let gems = 0;
      for (let i = 0; i < 50; i++) {
        const g = gradeCard(perfect, co, childSeedN(SEED, i));
        expect(g.overall).toBeGreaterThanOrEqual(9);
        if (g.overall === 10) gems++;
      }
      expect(gems).toBeGreaterThan(10);
    }
  });

  it('one soft corner drags a legendary card down — the 9 heartbreak', () => {
    const oneBadCorner = {
      offX: 0.002, offY: 0.001,
      corners: [0.55, 0.02, 0.02, 0.02] as [number, number, number, number],
      edges: [0.02, 0.02, 0.02, 0.02] as [number, number, number, number],
      scratches: 0, printLines: 0, printDots: 0, error: null,
    };
    const raw = rawSubs(oneBadCorner);
    expect(raw.corners).toBeLessThan(7.5);
    const results = COMPANIES.map(co => gradeCard(oneBadCorner, co, 1n));
    for (const r of results) expect(r.overall).toBeLessThanOrEqual(9);
  });

  it('strict companies grade lower on the same card', () => {
    const meh = {
      offX: 0.012, offY: 0.008,
      corners: [0.15, 0.2, 0.1, 0.12] as [number, number, number, number],
      edges: [0.15, 0.1, 0.18, 0.1] as [number, number, number, number],
      scratches: 1, printLines: 0, printDots: 1, error: null,
    };
    const avg = (key: string) => {
      const co = COMPANIES.find(c => c.key === key)!;
      let sum = 0;
      for (let i = 0; i < 200; i++) sum += gradeCard(meh, co, childSeedN(SEED, i)).overall;
      return sum / 200;
    };
    expect(avg('qcg')).toBeGreaterThan(avg('bvs') + 0.3); // lenient vs strict
  });

  it('resubmission rerolls variance — crack-and-resubmit is a real gamble', () => {
    const decent = {
      offX: 0.006, offY: 0.004,
      corners: [0.08, 0.06, 0.1, 0.05] as [number, number, number, number],
      edges: [0.06, 0.08, 0.05, 0.07] as [number, number, number, number],
      scratches: 0, printLines: 0, printDots: 1, error: null,
    };
    const co = COMPANIES[0];
    const grades = new Set<number>();
    for (let i = 0; i < 40; i++) grades.add(gradeCard(decent, co, childSeedN(SEED, 500 + i)).overall);
    expect(grades.size).toBeGreaterThan(1);
    // But same submission seed = same grade (no save-scumming one submission).
    expect(gradeCard(decent, co, 7n)).toEqual(gradeCard(decent, co, 7n));
  });
});

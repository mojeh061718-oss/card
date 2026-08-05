import { describe, it, expect } from 'vitest';
import { Rng, childSeed, seedFromText, mix64 } from '../src/engine/rng';
import { FeistelPermutation } from '../src/engine/feistel';
import { Population, type PopulationSlot } from '../src/engine/cards/population';

describe('Rng (PCG32)', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(12345n);
    const b = new Rng(12345n);
    for (let i = 0; i < 100; i++) expect(a.next32()).toBe(b.next32());
  });

  it('diverges across seeds and labels', () => {
    const a = new Rng(childSeed(1n, 'league:football'));
    const b = new Rng(childSeed(1n, 'league:baseball'));
    let same = 0;
    for (let i = 0; i < 64; i++) if (a.next32() === b.next32()) same++;
    expect(same).toBe(0);
  });

  it('int(n) is unbiased-ish and in range', () => {
    const rng = new Rng(seedFromText('bias test'));
    const counts = new Array(7).fill(0);
    const N = 70000;
    for (let i = 0; i < N; i++) counts[rng.int(7)]++;
    for (const c of counts) {
      expect(c).toBeGreaterThan(N / 7 * 0.9);
      expect(c).toBeLessThan(N / 7 * 1.1);
    }
  });

  it('float() stays in [0,1)', () => {
    const rng = new Rng(7n);
    for (let i = 0; i < 10000; i++) {
      const f = rng.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('mix64 avalanches single-bit differences', () => {
    const a = mix64(0n);
    const b = mix64(1n);
    let diff = 0;
    for (let i = 0n; i < 64n; i++) if (((a >> i) & 1n) !== ((b >> i) & 1n)) diff++;
    expect(diff).toBeGreaterThan(20); // ~32 expected
  });
});

describe('FeistelPermutation', () => {
  it('is a bijection on small domains', () => {
    for (const n of [1, 2, 5, 99, 100, 256, 1000]) {
      const perm = new FeistelPermutation(n, 42n);
      const seen = new Set<number>();
      for (let i = 0; i < n; i++) {
        const p = perm.permute(i);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(n);
        seen.add(p);
      }
      expect(seen.size).toBe(n);
    }
  });

  it('issues every serial 1..n exactly once', () => {
    const perm = new FeistelPermutation(99, 7n);
    const serials = new Set<number>();
    for (let i = 0; i < 99; i++) serials.add(perm.serialFor(i));
    expect(serials.size).toBe(99);
    expect(Math.min(...serials)).toBe(1);
    expect(Math.max(...serials)).toBe(99);
  });

  it('actually scrambles (not identity) and differs per key', () => {
    const a = new FeistelPermutation(1000, 1n);
    const b = new FeistelPermutation(1000, 2n);
    let fixedPoints = 0;
    let sameAsOtherKey = 0;
    for (let i = 0; i < 1000; i++) {
      if (a.permute(i) === i) fixedPoints++;
      if (a.permute(i) === b.permute(i)) sameAsOtherKey++;
    }
    expect(fixedPoints).toBeLessThan(20);
    expect(sameAsOtherKey).toBeLessThan(20);
  });

  it('handles a large domain bijectively on a sample', () => {
    const n = 4_000_000;
    const perm = new FeistelPermutation(n, 99n);
    const seen = new Set<number>();
    for (let i = 0; i < 20000; i++) {
      const p = perm.permute(i);
      expect(p).toBeLessThan(n);
      seen.add(p);
    }
    expect(seen.size).toBe(20000); // injective on the sample
  });
});

describe('Population', () => {
  function makeSlots(counts: number[]): PopulationSlot[] {
    return counts.map((printed, slotId) => ({ slotId, printed }));
  }

  it('conserves copies: total drawn never exceeds printed, exhausts exactly', () => {
    const pop = new Population(makeSlots([5, 3, 1]), 11n);
    const rng = new Rng(1n);
    const perSlot = [0, 0, 0];
    for (let i = 0; i < 9; i++) {
      const d = pop.draw(rng);
      perSlot[d.slotId]++;
    }
    expect(perSlot).toEqual([5, 3, 1]);
    expect(pop.totalRemaining).toBe(0);
    expect(() => pop.draw(rng)).toThrow('exhausted');
  });

  it('serials within each slot are unique and complete', () => {
    const pop = new Population(makeSlots([99]), 5n);
    const rng = new Rng(2n);
    const serials = new Set<number>();
    for (let i = 0; i < 99; i++) serials.add(pop.draw(rng).serial);
    expect(serials.size).toBe(99);
    expect(Math.min(...serials)).toBe(1);
    expect(Math.max(...serials)).toBe(99);
  });

  it('draw frequencies match print-run proportions', () => {
    // 90% base, 9% mid, ~1% rare, 1-in-10000 crown.
    const pop = new Population(makeSlots([90000, 9000, 990, 10]), 3n);
    const rng = new Rng(4n);
    const N = 50000;
    const hits = [0, 0, 0, 0];
    for (let i = 0; i < N; i++) hits[pop.draw(rng).slotId]++;
    expect(hits[0] / N).toBeGreaterThan(0.88);
    expect(hits[0] / N).toBeLessThan(0.92);
    expect(hits[1] / N).toBeGreaterThan(0.075);
    expect(hits[1] / N).toBeLessThan(0.105);
    expect(hits[3]).toBeLessThan(25); // crown stays crown-rare
  });

  it('drawFrom restricts to a subset', () => {
    const pop = new Population(makeSlots([100, 100, 100]), 8n);
    const rng = new Rng(9n);
    for (let i = 0; i < 150; i++) {
      const d = pop.drawFrom(rng, [1, 2]);
      expect(d).not.toBeNull();
      expect([1, 2]).toContain(d!.slotId);
    }
    expect(pop.remaining(0)).toBe(100);
  });

  it('save/restore round-trips draw state', () => {
    const pop = new Population(makeSlots([50, 20, 3]), 21n);
    const rng = new Rng(6n);
    for (let i = 0; i < 30; i++) pop.draw(rng);
    const state = pop.saveState();

    const pop2 = new Population(makeSlots([50, 20, 3]), 21n);
    pop2.restoreState(state);
    expect(pop2.totalRemaining).toBe(pop.totalRemaining);
    for (let s = 0; s < 3; s++) expect(pop2.remaining(s)).toBe(pop.remaining(s));

    // Serial continuity: next serial from a slot matches what the original
    // would have issued (same seed, same copyIndex).
    const nextA = pop.take(0).serial;
    const nextB = pop2.take(0).serial;
    expect(nextB).toBe(nextA);
  });

  it('a full 1/1 chase: exactly one superfractor exists', () => {
    const pop = new Population(makeSlots([10000, 1]), 33n);
    const rng = new Rng(77n);
    let crowns = 0;
    while (pop.totalRemaining > 0) {
      const d = pop.draw(rng);
      if (d.slotId === 1) {
        crowns++;
        expect(d.serial).toBe(1);
      }
    }
    expect(crowns).toBe(1);
  });
});

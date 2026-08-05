import { describe, it, expect } from 'vitest';
import { Rng, seedFromText, childSeedN } from '../src/engine/rng';
import {
  intrinsicValue, playerHype, gradeMultiplier, generateComps, compValue, dealerOffer,
} from '../src/engine/economy/valuation';
import { runAuction } from '../src/engine/economy/auction';
import { COMPANIES, gradeCard } from '../src/engine/condition/grading';
import type { Player } from '../src/engine/world/teams';
import type { ParallelDef } from '../src/engine/cards/parallels';

const SEED = seedFromText('econ-test');

function mkPlayer(talent: number): Player {
  return {
    id: 1, sport: 'football', teamId: 0, first: 'Test', last: 'Player',
    position: 'QB', jersey: 7, bornYear: 2000, debutYear: 2027, talent,
    appearanceSeed: 1n, signatureSeed: 2n,
  };
}

function mkParallel(printRun: number, desirability: number): ParallelDef {
  return {
    id: 1, name: 'Test', numberedTo: printRun <= 299 ? printRun : null,
    printRun, finish: 'refractor', colorHex: null, desirability,
  };
}

const base = mkParallel(18000, 1);
const gold = mkParallel(50, 900);
const one = mkParallel(1, 20000);

describe('valuation', () => {
  it('star hype dwarfs journeyman hype', () => {
    expect(playerHype(mkPlayer(95))).toBeGreaterThan(playerHype(mkPlayer(60)) * 8);
    expect(playerHype(mkPlayer(40))).toBeLessThan(3);
  });

  it('rarity ladder is monotonic and steep', () => {
    const p = mkPlayer(88);
    const v = (par: ParallelDef) => intrinsicValue({
      player: p, parallel: par, isRookie: false, isAuto: false, setFactor: 1,
    });
    expect(v(gold)).toBeGreaterThan(v(base) * 8);
    expect(v(one)).toBeGreaterThan(v(gold) * 4);
  });

  it('rookie autos of stars are the chase', () => {
    const p = mkPlayer(92);
    const plain = intrinsicValue({ player: p, parallel: gold, isRookie: false, isAuto: false, setFactor: 1 });
    const rcAuto = intrinsicValue({ player: p, parallel: gold, isRookie: true, isAuto: true, setFactor: 1 });
    expect(rcAuto).toBeGreaterThan(plain * 10);
  });

  it('a 10 is worth a multiple of a 9', () => {
    const co = COMPANIES[0];
    const perfect = {
      offX: 0, offY: 0, corners: [0, 0, 0, 0] as [number, number, number, number],
      edges: [0, 0, 0, 0] as [number, number, number, number],
      scratches: 0, printLines: 0, printDots: 0, error: null,
    };
    // Find a submission seed producing a 10 and one producing a 9.
    let ten = null, nine = null;
    for (let i = 0; i < 400 && (!ten || !nine); i++) {
      const g = gradeCard(perfect, co, childSeedN(SEED, i));
      if (g.overall === 10 && !ten) ten = g;
      if (g.overall === 9 && !nine) nine = g;
    }
    if (ten && nine) {
      expect(gradeMultiplier(ten, co)).toBeGreaterThan(gradeMultiplier(nine, co) * 2.5);
    }
    expect(ten).not.toBeNull();
  });

  it('strict-house premium only matters at the top', () => {
    const strict = COMPANIES.find(c => c.key === 'bvs')!;
    const lenient = COMPANIES.find(c => c.key === 'qcg')!;
    const g10 = { overall: 10, subs: { centering: 10, corners: 10, edges: 10, surface: 10 }, certNo: '1', gem: true, altered: false };
    const g7 = { overall: 7, subs: { centering: 7, corners: 7, edges: 7, surface: 7 }, certNo: '1', gem: false, altered: false };
    expect(gradeMultiplier(g10, strict)).toBeGreaterThan(gradeMultiplier(g10, lenient) * 1.3);
    expect(Math.abs(gradeMultiplier(g7, strict) - gradeMultiplier(g7, lenient))).toBeLessThan(0.05);
  });
});

describe('comps', () => {
  it('rare cards have thin comps, commons have many', () => {
    const rareComps = generateComps('rare-key', 5000, 5, 100, 'RAW');
    const commonComps = generateComps('common-key', 3, 18000, 100, 'RAW');
    expect(rareComps.length).toBeLessThan(3);
    expect(commonComps.length).toBeGreaterThan(3);
  });

  it('comp median tracks intrinsic within a sane band', () => {
    let within = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const comps = generateComps(`k${i}`, 100, 5000, 200, 'RAW');
      const median = compValue(comps);
      if (median !== null && median > 55 && median < 190) within++;
    }
    expect(within).toBeGreaterThan(N * 0.7);
  });

  it('sales read as relative history, newest first', () => {
    const comps = generateComps('hist', 100, 18000, 1, 'RAW');
    expect(comps.length).toBeGreaterThan(1);
    for (const c of comps) {
      expect(c.daysAgo).toBeGreaterThanOrEqual(1);
      expect(c.daysAgo).toBeLessThanOrEqual(90);
    }
    for (let i = 1; i < comps.length; i++) {
      expect(comps[i].daysAgo).toBeGreaterThanOrEqual(comps[i - 1].daysAgo);
    }
  });

  it('is deterministic per identity key', () => {
    expect(generateComps('same', 100, 500, 50, 'RAW'))
      .toEqual(generateComps('same', 100, 500, 50, 'RAW'));
  });

  it('dealer always offers below comp — that is the convenience tax', () => {
    const rng = new Rng(5n);
    for (let i = 0; i < 100; i++) {
      expect(dealerOffer(100, 5, rng)).toBeLessThan(80);
      expect(dealerOffer(100, 0, rng)).toBeLessThan(dealerOffer(100, 5, rng) + 20);
    }
  });
});

describe('auctions', () => {
  it('a hot trophy card draws bidders and can blow past comp', () => {
    let wars = 0, sold = 0;
    for (let i = 0; i < 300; i++) {
      const r = runAuction(10000, 5, 0.8, 100, new Rng(childSeedN(SEED, i)));
      if (r.sold) sold++;
      if (r.biddingWar) wars++;
    }
    expect(sold).toBeGreaterThan(250);
    expect(wars).toBeGreaterThan(20); // the whale fight is a real outcome
  });

  it('a high reserve on a cheap card fails to sell', () => {
    let unsold = 0;
    for (let i = 0; i < 100; i++) {
      const r = runAuction(10, 18000, 0.05, 500, new Rng(childSeedN(SEED, 900 + i)));
      if (!r.sold) unsold++;
    }
    expect(unsold).toBeGreaterThan(90);
  });

  it('final price respects the top bidder ceiling and the reserve floor', () => {
    for (let i = 0; i < 200; i++) {
      const reserve = 50;
      const r = runAuction(500, 99, 0.4, reserve, new Rng(childSeedN(SEED, 2000 + i)));
      if (r.sold) {
        expect(r.finalPrice).toBeGreaterThanOrEqual(reserve * 0.99);
        expect(r.finalPrice).toBeLessThan(500 * 6);
      }
    }
  });

  it('bid ladders end at the final price and snipe late', () => {
    for (let i = 0; i < 50; i++) {
      const r = runAuction(2000, 25, 0.6, 100, new Rng(childSeedN(SEED, 3000 + i)));
      if (r.sold && r.bids.length > 1) {
        expect(r.bids[r.bids.length - 1].amount).toBeCloseTo(r.finalPrice, 1);
        // Bids ascend and the last one lands in the final stretch.
        for (let k = 1; k < r.bids.length; k++) {
          expect(r.bids[k].amount).toBeGreaterThanOrEqual(r.bids[k - 1].amount);
        }
        expect(r.bids[r.bids.length - 1].atSecondsLeft)
          .toBeLessThan(r.bids[0].atSecondsLeft);
      }
    }
  });

  it('is deterministic per rng seed', () => {
    const a = runAuction(1000, 99, 0.5, 50, new Rng(42n));
    const b = runAuction(1000, 99, 0.5, 50, new Rng(42n));
    expect(a).toEqual(b);
  });
});

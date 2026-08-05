/**
 * Price calibration guardrails.
 *
 * These assert the shape of the economy against hobby intuition: junk must
 * be junk, stars' rookies are real money, and a 1/1 rookie auto is a
 * life-changing card. If a tuning change breaks these, the game's feel
 * changed — not just a number.
 */

import { describe, it, expect } from 'vitest';
import { intrinsicValue } from '../src/engine/economy/valuation';
import type { Player } from '../src/engine/world/teams';
import type { ParallelDef } from '../src/engine/cards/parallels';

function player(talent: number): Player {
  return {
    id: 1, sport: 'football', teamId: 0, first: 'A', last: 'B', position: 'QB',
    jersey: 1, bornYear: 2000, debutYear: 2027, talent,
    appearanceSeed: 1n, signatureSeed: 2n,
  };
}

// Mirrors the chromium ladder's real print runs and desirability curve.
function rung(printRun: number): ParallelDef {
  const desirability = printRun >= 18000 ? 1 : 4 * Math.pow(18000 / printRun, 0.82);
  return {
    id: 1, name: 'R', numberedTo: printRun <= 299 ? printRun : null,
    printRun, finish: 'refractor', colorHex: null, desirability,
  };
}

const v = (p: Player, par: ParallelDef, isRookie = false, isAuto = false) =>
  intrinsicValue({ player: p, parallel: par, isRookie, isAuto, setFactor: 1 });

describe('price calibration', () => {
  it('base commons of journeymen are pocket change — bulk is bulk', () => {
    const price = v(player(55), rung(18000));
    expect(price).toBeLessThan(2);
  });

  it('a star base card is a few bucks, not a payday', () => {
    const price = v(player(90), rung(18000));
    expect(price).toBeGreaterThan(2);
    expect(price).toBeLessThan(20);
  });

  it("a star's rookie card is real money but not absurd", () => {
    const price = v(player(90), rung(18000), true);
    expect(price).toBeGreaterThan(8);
    expect(price).toBeLessThan(60);
  });

  it('a /99 of a star lands in the hundreds', () => {
    const price = v(player(90), rung(99));
    expect(price).toBeGreaterThan(80);
    expect(price).toBeLessThan(1200);
  });

  it('a /10 of a star is four figures', () => {
    const price = v(player(92), rung(10));
    expect(price).toBeGreaterThan(700);
    expect(price).toBeLessThan(20000);
  });

  it('a superfractor rookie auto of a superstar is life-changing', () => {
    const price = v(player(96), rung(1), true, true);
    expect(price).toBeGreaterThan(50000);
    expect(price).toBeLessThan(3000000);
  });

  it('a superfractor of a nobody is still worth real money — 1/1 is 1/1', () => {
    const price = v(player(45), rung(1));
    expect(price).toBeGreaterThan(150);
    expect(price).toBeLessThan(20000);
  });

  it('an unsearched bulk box of ~170 commons is worth tens, not thousands', () => {
    // Roughly the mix a non-picked-over garage box yields.
    let total = 0;
    for (let i = 0; i < 165; i++) total += v(player(45 + (i % 40)), rung(18000));
    for (let i = 0; i < 3; i++) total += v(player(60 + i * 8), rung(1500));
    total += v(player(78), rung(199));
    expect(total).toBeGreaterThan(30);
    expect(total).toBeLessThan(900);
  });
});

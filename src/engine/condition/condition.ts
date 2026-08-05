/**
 * Card condition — generated, not rolled at grade time.
 *
 * Every physical copy has immutable condition attributes derived from its
 * identity (series, card, parallel, serial). The defects exist the moment
 * the pack is sealed: you can find them with the loupe BEFORE paying for
 * grading, and the same copy grades consistently forever (minus company
 * variance). Press profiles make some series notorious for bad centering
 * or chippy edges — knowledge players learn and exploit.
 */

import { Rng, childSeed, hashString } from '../rng';

export interface Condition {
  /** Print offset as fraction of card size: 0 = perfectly centered. */
  offX: number;          // -0.045..0.045 (55/45 is ~0.01, miscut-ish is 0.04)
  offY: number;
  /** Wear per corner (TL, TR, BR, BL), 0 = sharp, 1 = destroyed. */
  corners: [number, number, number, number];
  /** Chipping per edge (top, right, bottom, left), 0..1. */
  edges: [number, number, number, number];
  /** Surface defects. */
  scratches: number;     // count of visible surface scratches
  printLines: number;    // roller lines from the press
  printDots: number;     // ink specks
  /** Factory error, if the copy mutated on press. */
  error: CardError | null;
}

export type CardError =
  | 'miscut'        // wild off-center, neighbor card sliver visible
  | 'missingFoil'   // foil layer never applied
  | 'inkSmear'      // dramatic ink smear band
  | 'doubleStamp'   // serial stamped twice, offset
  | 'wrongBack';    // paired with another card's back (flavor; back render later)

export interface PressProfile {
  /** Std-dev of centering offset (fraction). Bad presses ~0.018+. */
  centeringSigma: number;
  /** Mean edge chip tendency 0..1. */
  edgeChip: number;
  /** Corner softness tendency 0..1. */
  cornerSoft: number;
  /** Surface junk rate 0..1. */
  surfaceNoise: number;
  /** Factory error rate (per copy). Real-world-ish: ~1 in 2500. */
  errorRate: number;
}

/** Per-series press personality, derived from the series seed. */
export function pressProfile(seriesSeed: bigint): PressProfile {
  const rng = Rng.from(seriesSeed, 'press');
  return {
    centeringSigma: 0.006 + rng.float() * 0.014,
    edgeChip: 0.04 + rng.float() * 0.16,
    cornerSoft: 0.04 + rng.float() * 0.12,
    surfaceNoise: 0.05 + rng.float() * 0.2,
    errorRate: 0.0002 + rng.float() * 0.0008,
  };
}

const ERRORS: CardError[] = ['miscut', 'missingFoil', 'inkSmear', 'doubleStamp', 'wrongBack'];

/** Deterministic condition for one physical copy. */
export function conditionFor(
  seriesSeed: bigint, cardIndex: number, parallelId: number, serial: number,
  profile: PressProfile,
): Condition {
  const seed = childSeed(
    seriesSeed,
    `cond:${cardIndex}:${parallelId}:${serial}`,
  ) ^ hashString('copy');
  const rng = new Rng(seed);

  const wear = (tendency: number): number => {
    const base = Math.abs(rng.gaussian(0, tendency));
    // Occasional real ding regardless of press quality.
    return Math.min(1, base + (rng.chance(0.03) ? rng.float() * 0.5 : 0));
  };

  const isError = rng.chance(profile.errorRate);
  const error = isError ? ERRORS[rng.int(ERRORS.length)] : null;

  let offX = rng.gaussian(0, profile.centeringSigma);
  let offY = rng.gaussian(0, profile.centeringSigma);
  if (error === 'miscut') {
    offX = (rng.chance(0.5) ? 1 : -1) * (0.03 + rng.float() * 0.02);
    offY = rng.gaussian(0, profile.centeringSigma * 2);
  }
  offX = Math.max(-0.05, Math.min(0.05, offX));
  offY = Math.max(-0.05, Math.min(0.05, offY));

  return {
    offX, offY,
    corners: [wear(profile.cornerSoft), wear(profile.cornerSoft), wear(profile.cornerSoft), wear(profile.cornerSoft)],
    edges: [wear(profile.edgeChip), wear(profile.edgeChip), wear(profile.edgeChip), wear(profile.edgeChip)],
    scratches: rng.chance(profile.surfaceNoise) ? rng.range(1, 3) : 0,
    printLines: rng.chance(profile.surfaceNoise * 0.5) ? rng.range(1, 2) : 0,
    printDots: rng.chance(profile.surfaceNoise) ? rng.range(1, 4) : 0,
    error,
  };
}

/** Centering as the familiar "55/45" style split for a given axis. */
export function centeringSplit(off: number): string {
  const pct = Math.round(50 + off * 500);
  const a = Math.min(95, Math.max(5, pct));
  return `${a}/${100 - a}`;
}

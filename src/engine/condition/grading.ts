/**
 * Grading companies — four houses with real personalities.
 *
 * Subgrades are computed from the card's true condition through each
 * company's strictness curve plus a small grader-variance roll (crack it
 * out and resubmit: you might get the bump, you might get burned). Overall
 * grade is a weakest-link rollup, which is exactly how a legendary pull
 * comes back a 9 because of one soft corner.
 */

import { Rng, childSeed } from '../rng';
import type { Condition } from './condition';

export interface GradingCompany {
  key: string;
  name: string;
  color: string;         // slab label color
  /** Higher = harsher on defects. 1 = neutral. */
  strictness: number;
  /** Grader-to-grader noise (std-dev in grade points). */
  variance: number;
  /** In-game days per tier. */
  turnaroundDays: [number, number, number]; // economy / standard / express
  fees: [number, number, number];
  /** Shows subgrades on the label. */
  subgrades: boolean;
  /** Market multiplier a top grade from this house commands. */
  premium: number;
  /** Name for the perfect grade. */
  gemName: string;
}

export const COMPANIES: GradingCompany[] = [
  {
    key: 'psg', name: 'PSG', color: '#c8102e', strictness: 1.15, variance: 0.22,
    turnaroundDays: [25, 12, 4], fees: [12, 30, 100], subgrades: false,
    premium: 1.35, gemName: 'GEM MINT 10',
  },
  {
    key: 'bvs', name: 'Beacon', color: '#0b2545', strictness: 1.3, variance: 0.18,
    turnaroundDays: [30, 15, 6], fees: [15, 35, 120], subgrades: true,
    premium: 1.5, gemName: 'PRISTINE 10',
  },
  {
    key: 'qcg', name: 'QuickGrade', color: '#1e9e56', strictness: 0.85, variance: 0.4,
    turnaroundDays: [10, 5, 2], fees: [8, 15, 40], subgrades: false,
    premium: 0.9, gemName: 'GEM 10',
  },
  {
    key: 'axm', name: 'Axiom', color: '#4b1d78', strictness: 1.05, variance: 0.28,
    turnaroundDays: [18, 9, 3], fees: [10, 22, 70], subgrades: true,
    premium: 1.1, gemName: 'FLAWLESS 10',
  },
];

export interface GradeResult {
  overall: number;         // 1..10 in 0.5 steps
  subs: { centering: number; corners: number; edges: number; surface: number };
  certNo: string;
  gem: boolean;
  /** Refused to grade (evidence of trimming/alteration — future hook). */
  altered: boolean;
}

function clampGrade(g: number): number {
  return Math.max(1, Math.min(10, Math.round(g * 2) / 2));
}

/** Raw 1-10 quality per dimension from true condition (before strictness). */
export function rawSubs(c: Condition): { centering: number; corners: number; edges: number; surface: number } {
  const off = Math.max(Math.abs(c.offX), Math.abs(c.offY));
  // 50/50 → 10; 60/40 (0.02) → ~8.6; miscut 0.04+ → ≤6.
  const centering = 10 - off * 72 - Math.min(Math.abs(c.offX), Math.abs(c.offY)) * 30;
  const worstCorner = Math.max(...c.corners);
  const cornerAvg = c.corners.reduce((a, b) => a + b, 0) / 4;
  const corners = 10 - worstCorner * 6.5 - cornerAvg * 3;
  const worstEdge = Math.max(...c.edges);
  const edgeAvg = c.edges.reduce((a, b) => a + b, 0) / 4;
  const edges = 10 - worstEdge * 6 - edgeAvg * 3;
  const surface = 10 - c.scratches * 1.1 - c.printLines * 1.4 - c.printDots * 0.4
    - (c.error === 'inkSmear' ? 2.5 : 0);
  return { centering, corners, edges, surface };
}

export function gradeCard(
  condition: Condition,
  company: GradingCompany,
  /** Unique per submission so crack-and-resubmit rerolls variance. */
  submissionSeed: bigint,
): GradeResult {
  const rng = new Rng(childSeed(submissionSeed, `grade:${company.key}`));
  const raw = rawSubs(condition);
  const grade = (v: number): number =>
    clampGrade(10 - (10 - v) * company.strictness + rng.gaussian(0, company.variance));
  const subs = {
    centering: grade(raw.centering),
    corners: grade(raw.corners),
    edges: grade(raw.edges),
    surface: grade(raw.surface),
  };
  const vals = [subs.centering, subs.corners, subs.edges, subs.surface];
  const min = Math.min(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / 4;
  // Weakest link dominates; a strong rest can pull up half a point.
  const overall = clampGrade(Math.min(min + 1, min * 0.6 + mean * 0.4));
  const certNo = String(10000000 + Number(childSeed(submissionSeed, 'cert') % 89999999n));
  return {
    overall,
    subs,
    certNo,
    gem: overall === 10,
    altered: false,
  };
}

/** Submission tiers shown in the UI. */
export const TIERS = ['Economy', 'Standard', 'Express'] as const;
export type Tier = 0 | 1 | 2;

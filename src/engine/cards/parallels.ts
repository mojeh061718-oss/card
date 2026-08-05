/**
 * Parallel ladders — the rainbow.
 *
 * Modeled on the real hobby's structure: a base card, an unnumbered foil
 * tier, colored numbered tiers descending in print run, then the 1/1 crown
 * and printing plates. Each series instantiates a ladder from an archetype,
 * with the finish/color names drawn from its design DNA so no two brands'
 * rainbows read identically.
 */

export type FoilFinish =
  | 'none'        // base paper/chromium stock
  | 'refractor'   // smooth rainbow sheen
  | 'prism'       // geometric facet sparkle
  | 'crackedIce'  // shattered-glass facets
  | 'wave'        // flowing interference bands
  | 'pulsar'      // radial starburst
  | 'mojo'        // vertical streak refractor
  | 'disco'       // dense glitter dots
  | 'shimmer'     // fine anisotropic brush
  | 'superfractor'; // full-bleed swirling foil — the 1/1 look

export interface ParallelDef {
  /** Stable id within the series. 0 is always base. */
  id: number;
  name: string;
  /** null = unnumbered (print run exists internally but isn't stamped). */
  numberedTo: number | null;
  /** Copies printed PER CARD in the checklist. */
  printRun: number;
  finish: FoilFinish;
  /** Tint applied to the foil layer; null = neutral/spectral. */
  colorHex: string | null;
  /** Rough desirability multiplier vs. base — feeds valuation. */
  desirability: number;
}

export interface LadderArchetype {
  /** e.g. 'chromium' | 'prizmatic' | 'heritage' */
  key: string;
  baseRunPerCard: number;
  unnumberedFoilRun: number;
  /** Numbered rungs from most to least printed. */
  numberedRuns: number[];
}

/** Named color pool a series draws its rainbow from (order = ladder order). */
export const RAINBOW_COLORS: { name: string; hex: string }[] = [
  { name: 'Sky', hex: '#7ec8e3' },
  { name: 'Aqua', hex: '#2bb5b8' },
  { name: 'Emerald', hex: '#1e9e56' },
  { name: 'Violet', hex: '#7a4fd3' },
  { name: 'Rose', hex: '#e05a9d' },
  { name: 'Gold', hex: '#d4a017' },
  { name: 'Copper', hex: '#b46a3c' },
  { name: 'Crimson', hex: '#c81e3c' },
  { name: 'Obsidian', hex: '#23252b' },
];

const MID_FINISHES: FoilFinish[] = ['prism', 'crackedIce', 'wave', 'pulsar', 'mojo', 'disco', 'shimmer'];

export const LADDER_ARCHETYPES: LadderArchetype[] = [
  // Flagship chromium: big base run, deep rainbow.
  { key: 'chromium', baseRunPerCard: 18000, unnumberedFoilRun: 1500, numberedRuns: [299, 199, 150, 99, 75, 50, 25, 10, 5] },
  // Prizmatic: retail monster, slightly shallower.
  { key: 'prizmatic', baseRunPerCard: 24000, unnumberedFoilRun: 2200, numberedRuns: [249, 149, 99, 49, 24, 10, 5] },
  // Premium: tiny base run, everything numbered.
  { key: 'premium', baseRunPerCard: 499, unnumberedFoilRun: 0, numberedRuns: [99, 49, 25, 10, 5] },
  // Heritage/retro: huge base, thin rainbow — set-builder product.
  { key: 'heritage', baseRunPerCard: 32000, unnumberedFoilRun: 900, numberedRuns: [99, 25, 5] },
];

import type { Rng } from '../rng';

/**
 * Instantiate a concrete ladder for one series. `rng` must be derived from
 * the series seed so the rainbow is stable forever.
 */
export function buildLadder(archetype: LadderArchetype, rng: Rng): ParallelDef[] {
  const defs: ParallelDef[] = [];
  let id = 0;
  defs.push({
    id: id++, name: 'Base', numberedTo: null, printRun: archetype.baseRunPerCard,
    finish: 'none', colorHex: null, desirability: 1,
  });
  if (archetype.unnumberedFoilRun > 0) {
    defs.push({
      id: id++, name: 'Refractor', numberedTo: null, printRun: archetype.unnumberedFoilRun,
      finish: 'refractor', colorHex: null, desirability: 4,
    });
  }
  // Assign colors walking down the pool; occasionally swap in a fancy finish.
  // Each color is used at most once per ladder — "Rose /99" and "Rose /75"
  // in the same rainbow reads like a data error.
  const colors = [...RAINBOW_COLORS];
  const usedColors = new Set<number>();
  const runs = archetype.numberedRuns;
  for (let i = 0; i < runs.length; i++) {
    let colorIdx = Math.min(
      colors.length - 1,
      Math.floor((i / runs.length) * colors.length) + rng.int(2),
    );
    while (usedColors.has(colorIdx) && usedColors.size < colors.length) {
      colorIdx = (colorIdx + 1) % colors.length;
    }
    usedColors.add(colorIdx);
    const color = colors[colorIdx];
    const fancy = rng.chance(0.35);
    const finish: FoilFinish = fancy ? rng.pick(MID_FINISHES) : 'refractor';
    const finishLabel = fancy
      ? ` ${finish === 'crackedIce' ? 'Cracked Ice' : finish[0].toUpperCase() + finish.slice(1)}`
      : '';
    // Desirability grows superlinearly as print runs shrink — /10 is worth
    // far more than 10× a /100.
    const desirability = 4 * Math.pow(archetype.baseRunPerCard / runs[i], 0.82);
    defs.push({
      id: id++,
      name: `${color.name}${finishLabel}`,
      numberedTo: runs[i],
      printRun: runs[i],
      finish,
      colorHex: color.hex,
      desirability,
    });
  }
  // The crown.
  defs.push({
    id: id++, name: 'Superfractor', numberedTo: 1, printRun: 1,
    finish: 'superfractor', colorHex: '#d4a017',
    desirability: 4 * Math.pow(archetype.baseRunPerCard / 1, 0.82) * 2.5,
  });
  return defs;
}

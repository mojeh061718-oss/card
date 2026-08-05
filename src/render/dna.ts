/**
 * Design DNA — the per-series visual identity.
 *
 * Every series deterministically expands into a coherent design system:
 * layout archetype, background pattern, frame treatment, nameplate style,
 * type pairing, foil behavior. Two series never share DNA, which is what
 * keeps year-over-year products feeling like real annual releases.
 */

import { Rng } from '../engine/rng';
import type { FoilFinish } from '../engine/cards/parallels';

export type LayoutArchetype =
  | 'fullBleed'     // photo edge-to-edge, floating nameplate
  | 'framed'        // classic border with inner window
  | 'diagonalSplit' // angled color panel behind the figure
  | 'lowerThird'    // heavy design band across the bottom
  | 'archWindow';   // arched/geometric die-cut window look

export type PatternKind =
  | 'rays' | 'halftone' | 'pinstripe' | 'tessellation'
  | 'wave' | 'circuit' | 'marble' | 'starburst' | 'velocity';

export type NameplateStyle = 'bar' | 'chip' | 'slant' | 'stacked' | 'outline';

export interface DesignDna {
  layout: LayoutArchetype;
  pattern: PatternKind;
  /** Pattern params consumed by the GL background shader. */
  patternScale: number;
  patternAngle: number;
  patternIntensity: number;
  nameplate: NameplateStyle;
  /** Border inset as a fraction of card width (0 for fullBleed). */
  borderFrac: number;
  /** Corner radius fraction. */
  cornerFrac: number;
  /** Display + label font stacks (curated pairings). */
  displayFont: string;
  labelFont: string;
  /** Whether base (non-parallel) stock has a subtle sheen. */
  glossyStock: boolean;
  /** Series accent hue rotation applied over team colors, degrees. */
  accentHueShift: number;
  /** Foil mask emphasis: how much foil bleeds into frame vs background. */
  foilOnFrame: number;
}

const LAYOUTS: LayoutArchetype[] = ['fullBleed', 'framed', 'diagonalSplit', 'lowerThird', 'archWindow'];
const PATTERNS: PatternKind[] = ['rays', 'halftone', 'pinstripe', 'tessellation', 'wave', 'circuit', 'marble', 'starburst', 'velocity'];
const NAMEPLATES: NameplateStyle[] = ['bar', 'chip', 'slant', 'stacked', 'outline'];

/** Curated display/label pairings — system stacks tuned to look print-grade. */
const TYPE_PAIRINGS: [string, string][] = [
  ['900 italic "Avenir Next Condensed", "Arial Narrow", sans-serif', '600 "Avenir Next", "Helvetica Neue", sans-serif'],
  ['800 "Futura-CondensedExtraBold", Futura, "Trebuchet MS", sans-serif', '500 Futura, "Gill Sans", sans-serif'],
  ['700 Georgia, "Times New Roman", serif', '600 "Helvetica Neue", Arial, sans-serif'],
  ['900 "Helvetica Neue", Impact, sans-serif', '500 "Helvetica Neue", Arial, sans-serif'],
];

export function deriveDna(seriesSeed: bigint, productLine: string): DesignDna {
  const rng = Rng.from(seriesSeed, `dna:${productLine}`);
  const layout = rng.pick(LAYOUTS);
  const pairing = rng.pick(TYPE_PAIRINGS);
  return {
    layout,
    pattern: rng.pick(PATTERNS),
    patternScale: 6 + rng.float() * 22,
    patternAngle: rng.float() * Math.PI,
    patternIntensity: 0.35 + rng.float() * 0.45,
    nameplate: rng.pick(NAMEPLATES),
    borderFrac: layout === 'fullBleed' ? 0 : 0.035 + rng.float() * 0.035,
    cornerFrac: 0.045,
    displayFont: pairing[0],
    labelFont: pairing[1],
    glossyStock: rng.chance(0.6),
    accentHueShift: (rng.float() - 0.5) * 40,
    foilOnFrame: 0.4 + rng.float() * 0.6,
  };
}

/** Numeric finish id passed to the foil shader. */
export function finishId(f: FoilFinish): number {
  switch (f) {
    case 'none': return 0;
    case 'refractor': return 1;
    case 'prism': return 2;
    case 'crackedIce': return 3;
    case 'wave': return 4;
    case 'pulsar': return 5;
    case 'mojo': return 6;
    case 'disco': return 7;
    case 'shimmer': return 8;
    case 'superfractor': return 9;
  }
}

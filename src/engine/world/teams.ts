/**
 * League + team generation. Teams carry the color identities that drive
 * card palettes, so color pairing quality matters more here than anywhere.
 */

import { Rng, childSeed } from '../rng';
import { cityName, teamNickname, playerName } from './names';

export type Sport = 'football' | 'baseball';

export interface Team {
  id: number;
  sport: Sport;
  city: string;
  nickname: string;
  abbrev: string;
  /** Primary/secondary in hex — chosen as a curated pairing, never random RGB. */
  primary: string;
  secondary: string;
  /** Simple mark descriptor for logo rendering. */
  logoSeed: bigint;
}

export interface Player {
  id: number;
  sport: Sport;
  teamId: number;
  first: string;
  last: string;
  position: string;
  jersey: number;
  /** Birth year in game calendar. */
  bornYear: number;
  /** Draft/debut year — cards before this can't exist. */
  debutYear: number;
  /** 0-100 latent talent; drives career sim + hype. */
  talent: number;
  /** Visual identity for the athlete renderer. */
  appearanceSeed: bigint;
  /** Signature style seed (autograph rendering). */
  signatureSeed: bigint;
}

/** Curated team color pairings that read "pro franchise", not random. */
const COLOR_PAIRS: [string, string][] = [
  ['#0b2545', '#d9a621'], // navy / gold
  ['#7a0c0c', '#e8e3d5'], // maroon / cream
  ['#0e5135', '#c8c8c8'], // forest / silver
  ['#1a1a1e', '#e0432d'], // black / vermilion
  ['#123f77', '#78b7e0'], // royal / powder
  ['#4b1d78', '#d4a017'], // purple / gold
  ['#b34700', '#12233d'], // burnt orange / midnight
  ['#155e75', '#e6b422'], // teal / mustard
  ['#8c1d40', '#ffc627'], // cardinal / sun
  ['#2d2d78', '#c81e3c'], // indigo / red
  ['#00553f', '#e87722'], // pine / orange
  ['#3d3d3d', '#9ad0ec'], // charcoal / ice
  ['#1b3a2f', '#e8b04b'], // hunter / amber
  ['#5a1d2e', '#d9c7a3'], // wine / bone
  ['#0f3d56', '#f0663f'], // petrol / coral
  ['#3f2a17', '#c9a227'], // umber / brass
  ['#2b2f6b', '#8fd6c1'], // lapis / mint
  ['#6b2312', '#e2d3b0'], // rust / sand
  ['#14342b', '#c2e05a'], // moss / lime
  ['#402045', '#f2a3c7'], // aubergine / blush
];

const FOOTBALL_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OT', 'EDGE', 'LB', 'CB', 'S', 'DT'];
const BASEBALL_POSITIONS = ['SP', 'RP', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

// Position weights: card-relevant positions appear more (QBs get printed).
const FOOTBALL_POS_WEIGHTS = [3, 2.5, 3, 1.5, 0.8, 1.2, 1, 1.5, 1, 0.8];
const BASEBALL_POS_WEIGHTS = [2.5, 0.8, 1.2, 1.2, 1, 1, 2, 1, 2, 1.2, 1];

export function generateLeague(worldSeed: bigint, sport: Sport, foundedYear: number): {
  teams: Team[];
  players: Player[];
} {
  const rng = Rng.from(worldSeed, `league:${sport}`);
  // Real league sizes, so the world feels like a league and the importable
  // name presets map cleanly onto team ids.
  const teamCount = sport === 'football' ? 32 : 30;
  const teams: Team[] = [];
  const usedCities = new Set<string>();
  const usedNicks = new Set<string>();
  const pairs = rng.shuffle([...COLOR_PAIRS]);

  for (let t = 0; t < teamCount; t++) {
    let city = cityName(rng);
    while (usedCities.has(city)) city = cityName(rng);
    usedCities.add(city);
    let nick = teamNickname(rng, sport);
    while (usedNicks.has(nick)) nick = teamNickname(rng, sport);
    usedNicks.add(nick);
    const [primary, secondary] = pairs[t % pairs.length];
    teams.push({
      id: t,
      sport,
      city,
      nickname: nick,
      abbrev: (city.replace(/[^A-Za-z]/g, '').slice(0, 2) + nick[0]).toUpperCase(),
      primary,
      secondary,
      logoSeed: childSeed(worldSeed, `logo:${sport}:${t}`),
    });
  }

  // Rosters: ~28 card-relevant players per team.
  const players: Player[] = [];
  const positions = sport === 'football' ? FOOTBALL_POSITIONS : BASEBALL_POSITIONS;
  const posWeights = sport === 'football' ? FOOTBALL_POS_WEIGHTS : BASEBALL_POS_WEIGHTS;
  let pid = 0;
  for (const team of teams) {
    const prng = Rng.from(worldSeed, `roster:${sport}:${team.id}`);
    const usedJerseys = new Set<number>();
    for (let i = 0; i < 28; i++) {
      const { first, last } = playerName(prng);
      let jersey = prng.range(0, 99);
      while (usedJerseys.has(jersey)) jersey = prng.range(0, 99);
      usedJerseys.add(jersey);
      // Talent: mostly journeymen, thin elite tail — stars must be scarce for
      // their cards to matter.
      const talent = Math.min(99, Math.max(20,
        40 + prng.gaussian(0, 14) + (prng.chance(0.04) ? prng.range(18, 30) : 0)));
      const age = prng.range(21, 34);
      players.push({
        id: pid,
        sport,
        teamId: team.id,
        first,
        last,
        position: prng.pickWeighted(positions, posWeights),
        jersey,
        bornYear: foundedYear - age,
        debutYear: foundedYear - Math.min(age - 21, prng.range(0, 9)),
        talent: Math.round(talent),
        appearanceSeed: childSeed(worldSeed, `appearance:${sport}:${pid}`),
        signatureSeed: childSeed(worldSeed, `signature:${sport}:${pid}`),
      });
      pid++;
    }
  }
  return { teams, players };
}

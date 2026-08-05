/**
 * Procedural naming: players, cities, team nicknames, brands.
 * Syllable-assembly with curated pools so output reads plausible, not
 * alphabet soup. All draws flow through a caller-provided Rng.
 */

import type { Rng } from '../rng';

const FIRST_NAMES = [
  'Marcus', 'DeAndre', 'Jalen', 'Tyreke', 'Austin', 'Cole', 'Hunter', 'Xavier',
  'Dominic', 'Elijah', 'Andre', 'Darius', 'Trent', 'Kade', 'Roman', 'Silas',
  'Jaxon', 'Micah', 'Zion', 'Tobias', 'Rashad', 'Kendall', 'Bryce', 'Donovan',
  'Emmett', 'Grady', 'Holden', 'Isaiah', 'Jonas', 'Kellen', 'Landon', 'Mateo',
  'Nolan', 'Omar', 'Preston', 'Quentin', 'Ruben', 'Santiago', 'Tanner', 'Victor',
  'Wes', 'Yusuf', 'Zeke', 'Abel', 'Brooks', 'Cyrus', 'Dante', 'Ezra',
  'Finn', 'Gideon', 'Hector', 'Ivan', 'Jude', 'Knox', 'Luca', 'Moses',
  'Nico', 'Otto', 'Pierce', 'Reid', 'Shane', 'Theo', 'Uriel', 'Vince',
  'Walt', 'Yosef', 'Amos', 'Boone', 'Cassius', 'Deacon', 'Enzo', 'Ford',
] as const;

const LAST_NAMES = [
  'Whitfield', 'Calloway', 'Braddock', 'Santana', 'Okafor', 'Delgado', 'Marsh',
  'Vance', 'Holloway', 'Trask', 'Bellamy', 'Crowder', 'Duval', 'Everly',
  'Fontaine', 'Garrison', 'Hale', 'Ibarra', 'Jennings', 'Kessler', 'Lachance',
  'Mercer', 'Navarro', 'Osborne', 'Pruitt', 'Quintero', 'Rockwell', 'Slater',
  'Thorne', 'Umber', 'Valdez', 'Wilder', 'Yates', 'Zamora', 'Ashford',
  'Boykin', 'Colter', 'Draper', 'Ellison', 'Foss', 'Granger', 'Hutch',
  'Irons', 'Jaramillo', 'Kirkland', 'Lockhart', 'Maddox', 'North', 'Ocampo',
  'Palmer', 'Quill', 'Renner', 'Stroud', 'Tatum', 'Underwood', 'Vega',
  'Winslow', 'Xiong', 'York', 'Zeller', 'Ames', 'Blackwood', 'Creed',
  'Dansby', 'Eastman', 'Farrow', 'Godfrey', 'Hollis', 'Ingram', 'Judkins',
] as const;

// Deep enough to fill a 32-team league without repeats, with room to spare.
const CITIES = [
  'Ashland', 'Bridgeport', 'Cascade', 'Denton', 'Eastvale', 'Fairbanks',
  'Grandview', 'Harborside', 'Ironton', 'Jasper', 'Kingsport', 'Lakemont',
  'Meridian', 'Northgate', 'Oakhurst', 'Port Vale', 'Queensbury', 'Redstone',
  'Southport', 'Trenholm', 'Union Falls', 'Vantage', 'Westbrook', 'Yorkfield',
  'Zephyr Bay', 'Alton', 'Bayside', 'Crestline', 'Dockside', 'Elmwood',
  'Foxhill', 'Galena', 'Halcyon', 'Inglewood', 'Juniper', 'Keystone',
  'Larkspur', 'Marbury', 'Nokomis', 'Overton', 'Pinehurst', 'Quarry Hill',
  'Rockford', 'Silverton', 'Thornbury', 'Ustica', 'Verdant', 'Wexford',
  'Ymir', 'Zanesville', 'Bellcourt', 'Colter', 'Dunmore', 'Everest',
  'Fairhaven', 'Glenview', 'Hollowbrook', 'Ivywood', 'Junction City',
  'Kearny', 'Lyndon', 'Mossvale', 'Norwood', 'Ollinger', 'Prescott',
] as const;

const FOOTBALL_NICKNAMES = [
  'Stampede', 'Ironhawks', 'Marauders', 'Nightwolves', 'Regiment', 'Sabercats',
  'Thunder', 'Vipers', 'Wardens', 'Bulldozers', 'Colossals', 'Dreadnoughts',
  'Enforcers', 'Firebirds', 'Gladiators', 'Hammers', 'Avalanche', 'Bruisers',
  'Chargers', 'Dynamos', 'Express', 'Fury', 'Grizzlies', 'Havoc',
  'Juggernauts', 'Kodiaks', 'Legion', 'Mustangs', 'Outlaws', 'Predators',
  'Rampage', 'Sentinels', 'Titans', 'Vanguard', 'Warhawks', 'Wolfpack',
] as const;

const BASEBALL_NICKNAMES = [
  'Aces', 'Barnstormers', 'Cannons', 'Drifters', 'Emperors', 'Foxes',
  'Grays', 'Herons', 'Islanders', 'Jackrabbits', 'Kings', 'Loggers',
  'Mudcats', 'Nine', 'Otters', 'Pilots', 'Quarrymen', 'Rivermen',
  'Sandhogs', 'Threshers', 'Union', 'Voyagers', 'Whalers', 'Yardbirds',
  'Anchors', 'Blues', 'Crushers', 'Dukes', 'Eagles', 'Flyers',
  'Hornets', 'Ironsides',
] as const;

export function playerName(rng: Rng): { first: string; last: string } {
  return { first: rng.pick(FIRST_NAMES), last: rng.pick(LAST_NAMES) };
}

export function cityName(rng: Rng): string {
  return rng.pick(CITIES);
}

export function teamNickname(rng: Rng, sport: 'football' | 'baseball'): string {
  return rng.pick(sport === 'football' ? FOOTBALL_NICKNAMES : BASEBALL_NICKNAMES);
}

/** Card brand names — evocative of the hobby without cloning trademarks. */
export const BRAND_NAMES = ['Pinnacle Press', 'Apex', 'Monument', 'Crown & Ink'] as const;

export const PRODUCT_LINES: Record<string, string[]> = {
  'Pinnacle Press': ['Chromium', 'Heritage Stock', 'Vault'],
  'Apex': ['Prizmatic', 'Ignite', 'Blackout'],
  'Monument': ['Gallery', 'Cornerstone', 'Immortal'],
  'Crown & Ink': ['Signature Series', 'First Edition', 'Dynasty'],
};

/**
 * Build importable name-override presets for the in-game editor.
 *
 * These are plain reference data — league, city, club name and the club's
 * published colors — mapped onto the generator's team ids. They are NOT
 * bundled into the game; the generator stays fictional and you import a
 * preset from the EDIT tab if you want one for private use.
 *
 * Team ids are assigned alphabetically so a preset maps deterministically
 * onto whatever roster the world seed produced.
 *
 *   node tools/make-presets.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';

/** [city, nickname, abbrev, primary, secondary] */
const NFL = [
  ['Arizona', 'Cardinals', 'ARI', '#97233f', '#ffb612'],
  ['Atlanta', 'Falcons', 'ATL', '#a71930', '#000000'],
  ['Baltimore', 'Ravens', 'BAL', '#241773', '#9e7c0c'],
  ['Buffalo', 'Bills', 'BUF', '#00338d', '#c60c30'],
  ['Carolina', 'Panthers', 'CAR', '#0085ca', '#101820'],
  ['Chicago', 'Bears', 'CHI', '#0b162a', '#c83803'],
  ['Cincinnati', 'Bengals', 'CIN', '#fb4f14', '#000000'],
  ['Cleveland', 'Browns', 'CLE', '#311d00', '#ff3c00'],
  ['Dallas', 'Cowboys', 'DAL', '#003594', '#869397'],
  ['Denver', 'Broncos', 'DEN', '#fb4f14', '#002244'],
  ['Detroit', 'Lions', 'DET', '#0076b6', '#b0b7bc'],
  ['Green Bay', 'Packers', 'GB', '#203731', '#ffb612'],
  ['Houston', 'Texans', 'HOU', '#03202f', '#a71930'],
  ['Indianapolis', 'Colts', 'IND', '#002c5f', '#a2aaad'],
  ['Jacksonville', 'Jaguars', 'JAX', '#101820', '#d7a22a'],
  ['Kansas City', 'Chiefs', 'KC', '#e31837', '#ffb81c'],
  ['Las Vegas', 'Raiders', 'LV', '#000000', '#a5acaf'],
  ['Los Angeles', 'Chargers', 'LAC', '#0080c6', '#ffc20e'],
  ['Los Angeles', 'Rams', 'LAR', '#003594', '#ffa300'],
  ['Miami', 'Dolphins', 'MIA', '#008e97', '#fc4c02'],
  ['Minnesota', 'Vikings', 'MIN', '#4f2683', '#ffc62f'],
  ['New England', 'Patriots', 'NE', '#002244', '#c60c30'],
  ['New Orleans', 'Saints', 'NO', '#101820', '#d3bc8d'],
  ['New York', 'Giants', 'NYG', '#0b2265', '#a71930'],
  ['New York', 'Jets', 'NYJ', '#125740', '#000000'],
  ['Philadelphia', 'Eagles', 'PHI', '#004c54', '#a5acaf'],
  ['Pittsburgh', 'Steelers', 'PIT', '#ffb612', '#101820'],
  ['San Francisco', '49ers', 'SF', '#aa0000', '#b3995d'],
  ['Seattle', 'Seahawks', 'SEA', '#002244', '#69be28'],
  ['Tampa Bay', 'Buccaneers', 'TB', '#d50a0a', '#ff7900'],
  ['Tennessee', 'Titans', 'TEN', '#0c2340', '#4b92db'],
  ['Washington', 'Commanders', 'WAS', '#5a1414', '#ffb612'],
];

const MLB = [
  ['Arizona', 'Diamondbacks', 'ARI', '#a71930', '#e3d4ad'],
  ['Atlanta', 'Braves', 'ATL', '#ce1141', '#13274f'],
  ['Baltimore', 'Orioles', 'BAL', '#df4601', '#000000'],
  ['Boston', 'Red Sox', 'BOS', '#bd3039', '#0c2340'],
  ['Chicago', 'Cubs', 'CHC', '#0e3386', '#cc3433'],
  ['Chicago', 'White Sox', 'CWS', '#27251f', '#c4ced4'],
  ['Cincinnati', 'Reds', 'CIN', '#c6011f', '#000000'],
  ['Cleveland', 'Guardians', 'CLE', '#00385d', '#e50022'],
  ['Colorado', 'Rockies', 'COL', '#33006f', '#c4ced4'],
  ['Detroit', 'Tigers', 'DET', '#0c2340', '#fa4616'],
  ['Houston', 'Astros', 'HOU', '#002d62', '#eb6e1f'],
  ['Kansas City', 'Royals', 'KC', '#004687', '#bd9b60'],
  ['Los Angeles', 'Angels', 'LAA', '#ba0021', '#003263'],
  ['Los Angeles', 'Dodgers', 'LAD', '#005a9c', '#ef3e42'],
  ['Miami', 'Marlins', 'MIA', '#00a3e0', '#ef3340'],
  ['Milwaukee', 'Brewers', 'MIL', '#12284b', '#ffc52f'],
  ['Minnesota', 'Twins', 'MIN', '#002b5c', '#d31145'],
  ['New York', 'Mets', 'NYM', '#002d72', '#ff5910'],
  ['New York', 'Yankees', 'NYY', '#0c2340', '#c4ced3'],
  ['Oakland', 'Athletics', 'OAK', '#003831', '#efb21e'],
  ['Philadelphia', 'Phillies', 'PHI', '#e81828', '#002d72'],
  ['Pittsburgh', 'Pirates', 'PIT', '#27251f', '#fdb827'],
  ['San Diego', 'Padres', 'SD', '#2f241d', '#ffc425'],
  ['San Francisco', 'Giants', 'SF', '#fd5a1e', '#27251f'],
  ['Seattle', 'Mariners', 'SEA', '#0c2c56', '#005c5c'],
  ['St. Louis', 'Cardinals', 'STL', '#c41e3a', '#0c2340'],
  ['Tampa Bay', 'Rays', 'TB', '#092c5c', '#8fbce6'],
  ['Texas', 'Rangers', 'TEX', '#003278', '#c0111f'],
  ['Toronto', 'Blue Jays', 'TOR', '#134a8e', '#1d2d5c'],
  ['Washington', 'Nationals', 'WSH', '#ab0003', '#14225a'],
];

function build(sport, rows) {
  const teams = {};
  rows.forEach(([city, nickname, abbrev, primary, secondary], i) => {
    teams[`${sport}:${i}`] = { city, nickname, abbrev, primary, secondary };
  });
  return { version: 1, teams, players: {}, series: {} };
}

const OUT = new URL('../presets/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

await writeFile(
  `${OUT}nfl-teams.json`,
  JSON.stringify(build('football', NFL), null, 2) + '\n',
);
await writeFile(
  `${OUT}mlb-teams.json`,
  JSON.stringify(build('baseball', MLB), null, 2) + '\n',
);
// A combined file so one import covers both leagues.
const combined = {
  version: 1,
  teams: { ...build('football', NFL).teams, ...build('baseball', MLB).teams },
  players: {},
  series: {},
};
await writeFile(`${OUT}real-teams.json`, JSON.stringify(combined, null, 2) + '\n');

console.log(`wrote presets/nfl-teams.json  (${NFL.length} teams)`);
console.log(`wrote presets/mlb-teams.json  (${MLB.length} teams)`);
console.log(`wrote presets/real-teams.json (${NFL.length + MLB.length} teams)`);

/**
 * Build importable name-override presets for the in-game editor.
 *
 * These are plain reference data — league, city, club name, published colors,
 * and ordered player-name lists — mapped onto the generator's ids. They are
 * NOT bundled into the game; the generator stays fictional and you import a
 * preset from the EDIT tab if you want one for private use.
 *
 * Team ids are assigned alphabetically so a preset maps deterministically
 * onto whatever roster the world seed produced. Player names use
 * `rosterByRank` — an ordered list applied to the league's best players by
 * talent — so the file keeps working even if the world seed changes.
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

/**
 * Player names, in chase order.
 *
 * Rank 1 lands on the league's highest-talent generated player, rank 2 on the
 * next, and so on — so position in this list decides who anchors the
 * checklist and whose 1/1 sits at the top of the board. The ordering below is
 * *card-market* order, not a power ranking: quarterbacks, bats and arms that
 * actually drive hobby prices lead, which is why a top-five NFL lineman is
 * further down than his on-field grade would put him.
 *
 * CURRENT = the 25 names driving each sport's 2026 market.
 * LEGACY  = 50 names that hold value in the vintage/legends market, applied
 *           after the current class so they fill the back of the checklist
 *           the way a legends subset does.
 *
 * Edit freely — it is a plain ordered list of strings and nothing downstream
 * cares what the names are.
 */
const NFL_CURRENT = [
  'Patrick Mahomes', 'Josh Allen', "Ja'Marr Chase", 'Justin Jefferson',
  'Drake Maye', 'Lamar Jackson', 'Jahmyr Gibbs', 'Bijan Robinson',
  'Puka Nacua', 'Saquon Barkley', 'Jaxon Smith-Njigba', 'Micah Parsons',
  'Myles Garrett', 'Christian McCaffrey', 'Amon-Ra St. Brown',
  'Matthew Stafford', 'Will Anderson Jr.', 'Maxx Crosby', 'James Cook',
  'Aidan Hutchinson', 'Patrick Surtain II', 'Nik Bonitto', 'Penei Sewell',
  'Tristan Wirfs', 'Trent Williams',
];

const NFL_LEGACY = [
  'Tom Brady', 'Joe Montana', 'Jerry Rice', 'Peyton Manning', 'Walter Payton',
  'Barry Sanders', 'Emmitt Smith', 'Lawrence Taylor', 'Jim Brown',
  'Johnny Unitas', 'Dan Marino', 'John Elway', 'Brett Favre', 'Aaron Rodgers',
  'Drew Brees', 'Randy Moss', 'Terrell Owens', 'Deion Sanders', 'Ray Lewis',
  'Reggie White', 'Bruce Smith', 'Rod Woodson', 'Ronnie Lott', 'Dick Butkus',
  'Bart Starr', 'Joe Namath', 'Roger Staubach', 'Terry Bradshaw',
  'Steve Young', 'Troy Aikman', 'Marshall Faulk', 'LaDainian Tomlinson',
  'Adrian Peterson', 'Eric Dickerson', 'Tony Dorsett', 'Earl Campbell',
  'Gale Sayers', 'Marcus Allen', 'Thurman Thomas', 'Curtis Martin',
  'Michael Irvin', 'Cris Carter', 'Tim Brown', 'Steve Largent', 'Lynn Swann',
  'Ozzie Newsome', 'Tony Gonzalez', 'Rob Gronkowski', 'Ed Reed',
  'Champ Bailey',
];

const MLB_CURRENT = [
  'Shohei Ohtani', 'Paul Skenes', 'Aaron Judge', 'Juan Soto',
  'Bobby Witt Jr.', 'Mookie Betts', 'Yordan Alvarez', 'Pete Crow-Armstrong',
  'Kyle Schwarber', 'Corbin Carroll', 'Bryce Harper', 'James Wood',
  'Junior Caminero', 'Jacob Misiorowski', 'Nick Kurtz', 'Mike Trout',
  'Cristopher Sanchez', 'Corey Seager', 'Mason Miller', 'Cam Schlittler',
  'Kevin McGonigle', 'JJ Wetherholt', 'Chase Burns', 'Ben Rice',
  'Byron Buxton',
];

const MLB_LEGACY = [
  'Mickey Mantle', 'Babe Ruth', 'Willie Mays', 'Hank Aaron', 'Ted Williams',
  'Ken Griffey Jr.', 'Roberto Clemente', 'Jackie Robinson', 'Lou Gehrig',
  'Joe DiMaggio', 'Sandy Koufax', 'Nolan Ryan', 'Cal Ripken Jr.',
  'Derek Jeter', 'Barry Bonds', 'Tony Gwynn', 'Rickey Henderson',
  'Mike Piazza', 'Chipper Jones', 'Frank Thomas', 'Greg Maddux',
  'Pedro Martinez', 'Randy Johnson', 'Roger Clemens', 'Tom Seaver',
  'Bob Gibson', 'Stan Musial', 'Honus Wagner', 'Ty Cobb', 'Yogi Berra',
  'Johnny Bench', 'Reggie Jackson', 'Mike Schmidt', 'George Brett',
  'Eddie Murray', 'Ozzie Smith', 'Wade Boggs', 'Kirby Puckett',
  'Dave Winfield', 'Ryne Sandberg', 'Don Mattingly', 'Ivan Rodriguez',
  'Jeff Bagwell', 'Craig Biggio', 'Vladimir Guerrero', 'Manny Ramirez',
  'David Ortiz', 'Albert Pujols', 'Ichiro Suzuki', 'Mariano Rivera',
];

function teamsFor(sport, rows) {
  const teams = {};
  rows.forEach(([city, nickname, abbrev, primary, secondary], i) => {
    teams[`${sport}:${i}`] = { city, nickname, abbrev, primary, secondary };
  });
  return teams;
}

function file({ teams = {}, rosterByRank = {} } = {}) {
  return { version: 1, teams, players: {}, series: {}, rosterByRank };
}

const NFL_ROSTER = [...NFL_CURRENT, ...NFL_LEGACY];
const MLB_ROSTER = [...MLB_CURRENT, ...MLB_LEGACY];

// A duplicate name would silently overwrite a rank, so fail loudly here
// rather than shipping a preset with a missing player.
for (const [label, list] of [['football', NFL_ROSTER], ['baseball', MLB_ROSTER]]) {
  const dupes = list.filter((n, i) => list.indexOf(n) !== i);
  if (dupes.length > 0) throw new Error(`${label} roster has duplicates: ${dupes.join(', ')}`);
}

const OUT = new URL('../presets/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

const outputs = {
  'nfl-teams.json': file({ teams: teamsFor('football', NFL) }),
  'mlb-teams.json': file({ teams: teamsFor('baseball', MLB) }),
  'real-teams.json': file({
    teams: { ...teamsFor('football', NFL), ...teamsFor('baseball', MLB) },
  }),
  'nfl-players.json': file({ rosterByRank: { football: NFL_ROSTER } }),
  'mlb-players.json': file({ rosterByRank: { baseball: MLB_ROSTER } }),
  'real-players.json': file({
    rosterByRank: { football: NFL_ROSTER, baseball: MLB_ROSTER },
  }),
  // One import that covers both leagues, teams and players.
  'real-world.json': file({
    teams: { ...teamsFor('football', NFL), ...teamsFor('baseball', MLB) },
    rosterByRank: { football: NFL_ROSTER, baseball: MLB_ROSTER },
  }),
};

for (const [name, data] of Object.entries(outputs)) {
  await writeFile(`${OUT}${name}`, JSON.stringify(data, null, 2) + '\n');
  const teamCount = Object.keys(data.teams).length;
  const nameCount = Object.values(data.rosterByRank).reduce((a, l) => a + l.length, 0);
  console.log(
    `wrote presets/${name.padEnd(18)} ${String(teamCount).padStart(2)} teams, `
    + `${String(nameCount).padStart(3)} player names`,
  );
}

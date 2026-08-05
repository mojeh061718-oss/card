/**
 * The news wire — procedural hobby journalism.
 *
 * Stories are templated but drawn from real world state: an actual sale, an
 * actual card surfacing, an actual pop-report milestone. The headline that
 * matters most is a Top-50 card being found, and when it's yours the whole
 * app is supposed to stop.
 */

import { Rng, childSeed } from '../rng';

export type NewsKind =
  | 'grailFound'      // a Top 50 card surfaced
  | 'bigSale'         // an auction result worth talking about
  | 'playerHeat'      // breakout / injury / award moves a market
  | 'popMilestone'    // grading population crossed a line
  | 'productDrop'     // a new series hits shelves
  | 'marketReport';   // index-level color

export interface NewsItem {
  id: string;
  day: number;
  kind: NewsKind;
  headline: string;
  body: string;
  /** Top-tier stories take over the screen. */
  breaking: boolean;
  /** Player the story is about, when it is about one. */
  subject?: string;
}

const OUTLETS = ['The Cardboard Wire', 'Hobby Desk', 'Slab Report', 'Wax & Ink'];
const CITIES = [
  'Ashland', 'Bridgeport', 'Meridian', 'Northgate', 'Redstone', 'Westbrook',
  'Port Vale', 'Kingsport', 'Lakemont', 'Fairbanks',
];

export function outletFor(seed: bigint): string {
  return OUTLETS[Number(seed % BigInt(OUTLETS.length))];
}

export function grailFoundStory(
  day: number, player: string, tier: string, seriesName: string,
  finderIsPlayer: boolean, shopName: string, seed: bigint,
  value?: number,
): NewsItem {
  const rng = new Rng(seed);
  const city = rng.pick(CITIES);
  const headline = finderIsPlayer
    ? `${tier} ${player} SURFACES AT ${shopName.toUpperCase()}`
    : `${tier} ${player} PULLED IN ${city.toUpperCase()}`;
  // Honest money talk: a /5 of a bench guy is not "six figures", and players
  // who cross-reference the wire with SELL will notice.
  const offerLine = value === undefined
    ? 'Offers are already coming in.'
    : value >= 100000 ? 'Offers are already reported to be in the six figures.'
      : value >= 10000 ? 'Five-figure offers landed within the hour.'
        : value >= 1000 ? `Early offers are said to be around $${(Math.round(value / 100) * 100).toLocaleString()}.`
          : 'Collectors of the player are circling, though the market for it is a thin one.';
  const body = finderIsPlayer
    ? `The hobby's most-wanted list just got shorter. ${shopName} has surfaced the ${seriesName} ${tier} of ${player} — a card collectors have chased since the product released. Expect the phone to ring.`
    : `A collector in ${city} has surfaced the ${seriesName} ${tier} of ${player}. The card had never been seen publicly. ${offerLine}`;
  return {
    id: `grail-${day}-${player}-${tier}`,
    day, kind: 'grailFound', headline, body, breaking: true,
  };
}

export function bigSaleStory(
  day: number, player: string, tier: string, price: number,
  biddingWar: boolean, seed: bigint,
): NewsItem {
  const rng = new Rng(seed);
  const money = price >= 1000 ? `$${Math.round(price / 1000)}K` : `$${Math.round(price)}`;
  const headline = biddingWar
    ? `BIDDING WAR SENDS ${player.toUpperCase()} ${tier.toUpperCase()} TO ${money}`
    : `${player.toUpperCase()} ${tier.toUpperCase()} HAMMERS AT ${money}`;
  const body = biddingWar
    ? `Two bidders refused to blink. The ${tier} of ${player} closed at ${money} after a run of late bids, well clear of recent comps for the tier.`
    : `The ${tier} of ${player} closed at ${money} on ${rng.pick(['a seven-day', 'a five-day', 'a three-day'])} auction, landing in line with where the market has been trading.`;
  return { id: `sale-${day}-${player}-${price}`, day, kind: 'bigSale', headline, body, breaking: false };
}

const HEAT_TEMPLATES = [
  { up: true, head: '{P} BREAKS OUT — ROOKIE MARKET FOLLOWS', body: '{P} has forced the hobby to pay attention. Rookie cards are up sharply on the week and sellers are pulling listings.' },
  { up: true, head: 'AWARD BUZZ LIFTS {P}', body: 'Award chatter around {P} has collectors moving. Numbered parallels are the first to dry up, as usual.' },
  { up: false, head: '{P} INJURY COOLS A HOT MARKET', body: 'The run on {P} has stopped cold. Buyers who chased the top are quiet, and the bid side has thinned out.' },
  { up: false, head: 'SLUMP TAKES THE AIR OUT OF {P}', body: 'A rough stretch for {P} has the market resetting. Comps from the peak are not finding takers.' },
];

export function playerHeatStory(day: number, player: string, seed: bigint): NewsItem {
  const rng = new Rng(seed);
  const t = rng.pick(HEAT_TEMPLATES);
  return {
    id: `heat-${day}-${player}`,
    day, kind: 'playerHeat',
    headline: t.head.replace('{P}', player.toUpperCase()),
    body: t.body.replaceAll('{P}', player),
    breaking: false,
    subject: player,
  };
}

/**
 * A performance story from the career sim — real form movement behind it,
 * so the market reaction the body promises actually happens in valuations.
 */
export function performanceStory(
  day: number, player: string, line: string, delta: number,
  event: 'breakout' | 'injury' | 'slump' | null, seed: bigint,
): NewsItem {
  const rng = new Rng(seed);
  const up = delta > 0;
  const head = event === 'injury'
    ? `${player.toUpperCase()} LEAVES GAME — MARKET HOLDS ITS BREATH`
    : event === 'breakout'
      ? `${player.toUpperCase()} HAS ARRIVED`
      : up
        ? rng.pick([`${player.toUpperCase()} GOES OFF`, `MONSTER DAY FOR ${player.toUpperCase()}`])
        : rng.pick([`ROUGH WEEK FOR ${player.toUpperCase()}`, `${player.toUpperCase()} COMES BACK TO EARTH`]);
  const move = Math.min(45, Math.abs(Math.round(delta * 2.8)));
  const body = `${player} ${line}. ` + (up
    ? `Cards moved before the final whistle — the market is paying roughly ${move}% more than last week.`
    : `Sellers hit the bid all evening; the market is off roughly ${move}% on the week.`);
  return {
    id: `perf-${day}-${player}`,
    day, kind: 'playerHeat', headline: head, body,
    breaking: false, subject: player,
  };
}

export function popMilestoneStory(
  day: number, player: string, tier: string, company: string,
  grade: number, count: number, seed: bigint,
): NewsItem {
  void seed;
  const gradeLabel = grade === 10 ? 'a 10' : `a ${grade}`;
  return {
    id: `pop-${day}-${player}-${grade}`,
    day, kind: 'popMilestone',
    headline: `POP REPORT: ${count} ${player.toUpperCase()} ${tier.toUpperCase()} NOW GRADED ${grade}`,
    body: `${company} has now certified ${count} cop${count === 1 ? 'y' : 'ies'} of the ${tier} ${player} at ${gradeLabel}. Registry collectors track these numbers closely — every new one dilutes the last.`,
    breaking: false,
  };
}

export function productDropStory(day: number, seriesName: string, seed: bigint): NewsItem {
  const rng = new Rng(seed);
  return {
    id: `drop-${day}-${seriesName}`,
    day, kind: 'productDrop',
    headline: `${seriesName.toUpperCase()} HITS SHELVES`,
    body: `${seriesName} is out. ${rng.pick([
      'Early breaks show the checklist is deep at the top.',
      'Case breakers report the parallels are falling close to advertised.',
      'Shops are reporting allocation limits on hobby cases.',
    ])}`,
    breaking: false,
  };
}

const MARKET_LINES = [
  'The rookie index closed up on the week, led by numbered parallels.',
  'Graded 10s continue to command a widening premium over 9s.',
  'Raw card volume is down; sellers are sending more to grading first.',
  'Sealed wax from older series keeps grinding higher as supply gets opened.',
  'Bulk lots are moving fast — searchers are betting on picked-over boxes.',
];

export function marketReportStory(day: number, seed: bigint): NewsItem {
  const rng = new Rng(seed);
  const line = rng.pick(MARKET_LINES);
  return {
    id: `market-${day}-${MARKET_LINES.indexOf(line)}`,
    day, kind: 'marketReport',
    headline: 'MARKET REPORT',
    body: line,
    breaking: false,
  };
}

/**
 * Fill a quiet day with ambient wire traffic.
 *
 * `recentSubjects` are players the wire already covered — a market that
 * reports a breakout and an injury for the same guy in the same week reads
 * as noise, not a world. Recently-covered players are skipped, and market
 * color fills in when nobody fresh is available.
 */
export function ambientStories(
  day: number, worldSeed: bigint, hotPlayers: string[],
  count = 2, recentSubjects: readonly string[] = [],
): NewsItem[] {
  const rng = new Rng(childSeed(worldSeed, `wire:${day}`));
  const used = new Set(recentSubjects);
  const available = hotPlayers.filter(p => !used.has(p));
  const out: NewsItem[] = [];
  for (let i = 0; i < count; i++) {
    const seed = childSeed(worldSeed, `wire:${day}:${i}`);
    const fresh = available.filter(p => !used.has(p));
    if (fresh.length > 0 && rng.chance(0.6)) {
      const player = rng.pick(fresh);
      used.add(player);
      out.push(playerHeatStory(day, player, seed));
    } else {
      out.push(marketReportStory(day, seed));
    }
  }
  return out;
}

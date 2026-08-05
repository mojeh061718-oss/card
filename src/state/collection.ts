/**
 * The player's collection + IndexedDB persistence.
 *
 * Card instances are tiny records (the art regenerates from seeds); the save
 * also carries population draw states so the world's scarcity survives
 * reloads. JSON is fine at shop scale; typed-array packing arrives when
 * collections hit five digits.
 */

import { create } from 'zustand';
import { openDB, type IDBPDatabase } from 'idb';
import type { PulledCard } from '../engine/cards/series';
import { world } from './world';
import { gradeCard, COMPANIES, type GradeResult, type Tier } from '../engine/condition/grading';
import { childSeedN, hashString, Rng } from '../engine/rng';
import { runAuction, MARKETPLACE_FEE, type AuctionResult } from '../engine/economy/auction';
import { dealerOffer } from '../engine/economy/valuation';
import {
  bigSaleStory, grailFoundStory, ambientStories, productDropStory,
  performanceStory, type NewsItem,
} from '../engine/news/wire';
import type { PulledCard as Pull } from '../engine/cards/series';
import { emptyOverrides, sanitizeOverrides, type OverrideSet } from './overrides';

export interface CardInstance extends PulledCard {
  /** Unique ownership id (monotonic per save). */
  uid: number;
  /** Acquisition sequence — doubles as "newest" sort key. */
  pulledSeq: number;
  /** Slabbed grade, once returned. */
  grade?: { companyKey: string; result: GradeResult; gradedDay: number };
}

export interface Listing {
  uid: number;
  /** Days the auction runs. */
  days: number;
  reserve: number;
  listedDay: number;
  endsDay: number;
}

export interface SaleRecord {
  uid: number;
  player: string;
  tier: string;
  price: number;
  net: number;
  day: number;
  kind: 'dealer' | 'auction';
  auction?: AuctionResult;
}

/** Unopened wax you own. Rip it, or sit on it and let it appreciate. */
export interface SealedItem {
  id: number;
  seriesId: string;
  productKey: string;
  boughtDay: number;
  pricePaid: number;
}

/**
 * A rip ceremony in progress. Persisted so closing the app mid-box (a
 * guaranteed event on a phone) RESUMES the reveal instead of silently
 * dumping a $500 box into the binder unseen.
 */
export interface RipSessionState {
  seriesId: string;
  productKey: string;
  pricePaid: number;
  packs: PulledCard[][];
}

/** A card somebody else pulled and put up for sale. */
export interface MarketFind {
  pull: Pull;
  ask: number;
  listedDay: number;
}

export interface Submission {
  uids: number[];
  companyKey: string;
  tier: Tier;
  submittedDay: number;
  dueDay: number;
  feePaid: number;
}

interface CollectionState {
  cards: CardInstance[];
  nextUid: number;
  hydrated: boolean;
  day: number;
  cash: number;
  submissions: Submission[];
  /** Slabs that came back and await the reveal ceremony. */
  returns: number[];
  listings: Listing[];
  /** Settled auctions awaiting acknowledgement. */
  saleFeed: SaleRecord[];
  /** Lot offer ids already bought, so leads don't repeat. */
  dugLots: string[];
  sealed: SealedItem[];
  nextSealedId: number;
  /** Rip ceremony awaiting its reveals (survives reloads). */
  ripSession: RipSessionState | null;
  /** productKey:seriesId:day -> units bought, for daily allocation limits. */
  bought: Record<string, number>;
  marketFinds: MarketFind[];
  news: NewsItem[];
  /** Unread breaking story awaiting its takeover. */
  breaking: NewsItem | null;
  /**
   * Breaking story held back while a reveal ceremony (rip, dig) is running —
   * the banner must never name the hit before the flip does.
   */
  pendingBreaking: NewsItem | null;
  shopName: string;
  overrides: OverrideSet;
  /** False until the player has completed career setup. */
  careerStarted: boolean;
  addPulls(pulls: PulledCard[], opts?: { quiet?: boolean }): void;
  /** Promote a held-back breaking story once the reveal ceremony is over. */
  releaseBreaking(): void;
  submitForGrading(uids: number[], companyKey: string, tier: Tier): void;
  endDay(): void;
  /** Reveal one returned slab: applies the grade, returns the instance. */
  revealReturn(uid: number): CardInstance | null;
  quickSell(uid: number): SaleRecord | null;
  spendCash(amount: number): void;
  markLotDug(id: string): void;
  pushNews(items: NewsItem[]): void;
  clearBreaking(): void;
  setShopName(name: string): void;
  setOverrides(set: OverrideSet): void;
  buyWax(seriesId: string, productKey: string, price: number): SealedItem | null;
  beginRip(session: RipSessionState): void;
  endRip(): void;
  buyFind(listedDay: number, uidKey: string): boolean;
  openSealed(id: number): void;
  setCash(amount: number): void;
  startCareer(): void;
  listAtAuction(uid: number, days: number, reserve: number): void;
  dismissSale(uid: number): void;
}

const DB_NAME = 'cardboard';
const STORE = 'save';
let db: IDBPDatabase | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (!db) {
    db = await openDB(DB_NAME, 1, {
      upgrade(d) { d.createObjectStore(STORE); },
    });
  }
  return db;
}

/**
 * When hydrate fails we must never write: the first debounced save would
 * overwrite the (possibly intact) existing record with defaults — total loss
 * of the only copy of the game.
 */
let saveBlocked = false;

function saveRecord(state: CollectionState): Record<string, unknown> {
  return {
    version: 1,
    cards: state.cards,
    nextUid: state.nextUid,
    day: state.day,
    cash: state.cash,
    submissions: state.submissions,
    returns: state.returns,
    returnCompanies: Object.fromEntries(arrivedCompanies),
    listings: state.listings,
    saleFeed: state.saleFeed,
    dugLots: state.dugLots,
    sealed: state.sealed,
    marketFinds: state.marketFinds,
    nextSealedId: state.nextSealedId,
    ripSession: state.ripSession,
    bought: state.bought,
    news: state.news.slice(0, 60),
    shopName: state.shopName,
    overrides: state.overrides,
    careerStarted: state.careerStarted,
    populations: world.savePopulations(),
  };
}

function scheduleSave(state: CollectionState): void {
  if (saveBlocked) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const d = await getDb();
      await d.put(STORE, saveRecord(state), 'save-v1');
    } catch (err) {
      console.warn('save failed', err);
    }
  }, 400);
}

/** Serialize the current save for download. Null if nothing to export. */
export function exportSaveJson(): string {
  return JSON.stringify(saveRecord(useCollection.getState()));
}

/**
 * Import a previously exported save: validate, write to IndexedDB, then
 * reload so the whole app rehydrates from it.
 */
export async function importSaveJson(text: string): Promise<string | null> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'That file is not valid JSON.';
  }
  if (parsed?.version !== 1 || !Array.isArray(parsed.cards)) {
    return 'That file is not a Cardboard save.';
  }
  const d = await getDb();
  await d.put(STORE, parsed, 'save-v1');
  saveBlocked = true; // nothing may overwrite the imported record pre-reload
  location.reload();
  return null;
}

export const useCollection = create<CollectionState>((set, get) => ({
  cards: [],
  nextUid: 1,
  hydrated: false,
  day: 1,
  cash: 2500,
  submissions: [],
  returns: [],
  listings: [],
  saleFeed: [],
  dugLots: [],
  sealed: [],
  nextSealedId: 1,
  ripSession: null,
  bought: {},
  marketFinds: [],
  news: [],
  breaking: null,
  pendingBreaking: null,
  shopName: 'Corner Store Cards',
  overrides: emptyOverrides(),
  careerStarted: false,
  addPulls(pulls, opts) {
    const { cards, nextUid } = get();
    const stamped: CardInstance[] = pulls.map((p, i) => ({
      ...p, uid: nextUid + i, pulledSeq: nextUid + i,
    }));
    set({ cards: [...cards, ...stamped], nextUid: nextUid + pulls.length });
    // Anything genuinely scarce that surfaces is news, and a 1/1 stops the app.
    const { day, shopName, news } = get();
    const stories: NewsItem[] = [];
    for (const p of pulls) {
      if (world.printRunOf(p) > 25) continue;
      const info = world.displayName(p);
      stories.push(grailFoundStory(
        day, info.player, info.tier, info.series, true, shopName,
        childSeedN(hashString(world.identityKey(p)), day),
      ));
    }
    if (stories.length > 0) {
      // During a rip/dig ceremony the banner is held back — it must not
      // name the hit while the pack is still sealed.
      const key = opts?.quiet ? 'pendingBreaking' as const : 'breaking' as const;
      set({
        news: [...stories, ...news].slice(0, 60),
        [key]: get()[key] ?? stories[0],
      });
    }
    scheduleSave(get());
  },
  releaseBreaking() {
    const { pendingBreaking, breaking } = get();
    if (!pendingBreaking) return;
    set({ breaking: breaking ?? pendingBreaking, pendingBreaking: null });
  },
  submitForGrading(uids, companyKey, tier) {
    const co = COMPANIES.find(c => c.key === companyKey);
    if (!co || uids.length === 0) return;
    const { day, submissions, cash, cards, returns, listings } = get();
    // A card can only be in one place: owned, ungraded-in-hand, not already
    // at a grader, not sitting in returns, not live at auction.
    const busy = new Set<number>([
      ...submissions.flatMap(s => s.uids),
      ...returns,
      ...listings.map(l => l.uid),
    ]);
    const valid = [...new Set(uids)].filter(uid =>
      !busy.has(uid) && cards.some(c => c.uid === uid && !c.grade));
    if (valid.length === 0) return;
    const fee = co.fees[tier] * valid.length;
    if (fee > cash) return; // can't front the grading bill
    set({
      cash: cash - fee,
      submissions: [...submissions, {
        uids: valid, companyKey, tier,
        submittedDay: day,
        dueDay: day + co.turnaroundDays[tier],
        feePaid: fee,
      }],
    });
    scheduleSave(get());
  },
  endDay() {
    const { day, submissions, returns, listings, cards, cash, saleFeed } = get();
    const newDay = day + 1;
    // Advance the release calendar first: today's drops join the world
    // before anyone rips, prices, or reports on them.
    const droppedToday = world.syncCalendar(newDay);
    const arrived = submissions.filter(s => s.dueDay <= newDay);
    const pending = submissions.filter(s => s.dueDay > newDay);

    // Settle auctions that closed overnight.
    const closed = listings.filter(l => l.endsDay <= newDay);
    const openListings = listings.filter(l => l.endsDay > newDay);
    let earned = 0;
    const newSales: SaleRecord[] = [];
    const soldUids = new Set<number>();
    for (const listing of closed) {
      const card = cards.find(c => c.uid === listing.uid);
      if (!card) continue;
      const intrinsic = world.valuation(card, card.grade);
      const rng = new Rng(childSeedN(
        hashString(world.identityKey(card)), listing.listedDay * 977 + listing.uid,
      ));
      const result = runAuction(
        intrinsic, world.printRunOf(card), world.interest(card), listing.reserve, rng,
      );
      const info = world.displayName(card);
      if (result.sold) {
        const net = result.finalPrice * (1 - MARKETPLACE_FEE);
        earned += net;
        soldUids.add(listing.uid);
        newSales.push({
          uid: listing.uid, player: info.player, tier: info.tier,
          price: result.finalPrice, net, day: newDay, kind: 'auction', auction: result,
        });
      } else {
        newSales.push({
          uid: listing.uid, player: info.player, tier: info.tier,
          price: 0, net: 0, day: newDay, kind: 'auction', auction: result,
        });
      }
    }

    // The rest of the hobby rips too. Grails surface elsewhere, which is how
    // a 1-in-2000-case card becomes something you can realistically chase.
    const surfaced = world.ripWorld(newDay);
    const forSale: MarketFind[] = [];
    const stories: NewsItem[] = [];
    for (const { pull } of surfaced) {
      const run = world.printRunOf(pull);
      const info = world.displayName(pull);
      // Only crown jewels make the wire, capped so a busy day cannot flood it.
      if (run <= 5 && stories.length < 2) {
        stories.push(grailFoundStory(
          newDay, info.player, info.tier, info.series, false, get().shopName,
          childSeedN(hashString(world.identityKey(pull)), newDay),
          world.valuation(pull),
        ));
      }
      // A slice of what surfaces gets listed for sale by whoever found it.
      const askRng = new Rng(childSeedN(hashString(world.identityKey(pull)), newDay + 7));
      if (askRng.chance(run <= 25 ? 0.35 : 0.6)) {
        const value = world.valuation(pull);
        forSale.push({
          pull,
          // Sellers ask above comp; the rarer it is, the bolder the ask.
          ask: Math.round(value * (1.05 + askRng.float() * (run <= 25 ? 0.9 : 0.35))),
          listedDay: newDay,
        });
      }
    }
    for (const sale of newSales) {
      if (sale.price >= 250) {
        stories.push(bigSaleStory(
          newDay, sale.player, sale.tier, sale.price,
          !!sale.auction?.biddingWar, childSeedN(hashString(sale.player), newDay),
        ));
      }
    }
    // Real product drops from the release calendar, plus street-date hype
    // exactly a week out so a drop never lands unannounced.
    for (const sid of droppedToday) {
      stories.push(productDropStory(newDay, world.seriesName(sid), BigInt(newDay)));
    }
    for (const r of world.upcomingReleases(newDay, 7)) {
      if (r.releaseDay === newDay + 7) {
        stories.push({
          id: `tease-${newDay}-${r.brand}-${r.line}`,
          day: newDay, kind: 'productDrop',
          headline: `${r.year} ${r.brand.toUpperCase()} ${r.line.toUpperCase()} STREET DATE SET`,
          body: `Distributors confirm ${r.year} ${r.brand} ${r.line} (${r.sport}) lands in one week. Allocations are already spoken for — expect the shelf to move.`,
          breaking: false,
        });
      }
    }
    // Career-sim performance stories: real form movement, real market moves.
    const movers = world.moversToday(newDay, 2);
    for (const m of movers) {
      stories.push(performanceStory(
        newDay, `${m.player.first} ${m.player.last}`,
        world.statLineFor(m, newDay), m.delta, m.event,
        childSeedN(hashString(`perf:${m.player.sport}:${m.player.id}`), newDay),
      ));
    }
    // Don't re-cover a player the wire touched in the last week.
    const recentSubjects = [
      ...get().news.filter(n => n.day > newDay - 7 && n.subject).map(n => n.subject!),
      ...movers.map(m => `${m.player.first} ${m.player.last}`),
    ];
    stories.push(...ambientStories(
      newDay, hashString('career-dev'), world.hotPlayers(12), 1, recentSubjects,
    ));

    set({
      day: newDay,
      cash: cash + earned,
      submissions: pending,
      listings: openListings,
      cards: cards.filter(c => !soldUids.has(c.uid)),
      saleFeed: [...newSales, ...saleFeed].slice(0, 40),
      // Finds age off the board after a week so the market stays fresh.
      marketFinds: [...forSale, ...get().marketFinds.filter(f => f.listedDay > newDay - 7)]
        .slice(0, 60),
      news: [...stories, ...get().news].slice(0, 60),
      returns: [...returns, ...arrived.flatMap(s => s.uids.map(uid => uid))],
    });
    // Stash which company each arrived uid used, via a lookup on reveal.
    arrivedCompanies = new Map([
      ...arrivedCompanies,
      ...arrived.flatMap(s => s.uids.map(uid => [uid, s.companyKey] as [number, string])),
    ]);
    scheduleSave(get());
  },
  revealReturn(uid) {
    const { cards, returns, day } = get();
    const card = cards.find(c => c.uid === uid);
    const companyKey = arrivedCompanies.get(uid);
    if (!card || !companyKey) {
      // The card is gone (or the company unknowable) — prune the orphan so
      // it can't wedge the reveal queue forever.
      set({ returns: returns.filter(r => r !== uid) });
      arrivedCompanies.delete(uid);
      scheduleSave(get());
      return null;
    }
    const co = COMPANIES.find(c => c.key === companyKey)!;
    const condition = world.conditionOf(card);
    // Submission seed: unique per (card identity, grading event) — cracking
    // and resubmitting later rerolls because day differs.
    const subSeed = childSeedN(hashString(`${card.seriesId}:${card.cardIndex}:${card.parallelId}:${card.serial}`), day * 1000 + uid);
    const result = gradeCard(condition, co, subSeed);
    const graded: CardInstance = { ...card, grade: { companyKey, result, gradedDay: day } };
    set({
      cards: cards.map(c => (c.uid === uid ? graded : c)),
      returns: returns.filter(r => r !== uid),
    });
    scheduleSave(get());
    return graded;
  },
  quickSell(uid) {
    const { cards, cash, day, saleFeed, submissions, returns, listings } = get();
    const card = cards.find(c => c.uid === uid);
    if (!card) return null;
    // Can't sell a card that is physically at the grader or live at auction.
    if (submissions.some(s => s.uids.includes(uid))) return null;
    if (returns.includes(uid)) return null;
    if (listings.some(l => l.uid === uid)) return null;
    const intrinsic = world.valuation(card, card.grade);
    const { comps } = world.comps(card, day, card.grade);
    const rng = new Rng(childSeedN(hashString(world.identityKey(card)), day));
    const price = dealerOffer(intrinsic, comps.length, rng);
    const info = world.displayName(card);
    const record: SaleRecord = {
      uid, player: info.player, tier: info.tier,
      price, net: price, day, kind: 'dealer',
    };
    set({
      cards: cards.filter(c => c.uid !== uid),
      cash: cash + price,
      saleFeed: [record, ...saleFeed].slice(0, 40),
    });
    scheduleSave(get());
    return record;
  },
  listAtAuction(uid, days, reserve) {
    const { listings, day, cards, submissions, returns } = get();
    if (!cards.some(c => c.uid === uid)) return;
    if (listings.some(l => l.uid === uid)) return;
    if (submissions.some(s => s.uids.includes(uid))) return;
    if (returns.includes(uid)) return;
    set({
      listings: [...listings, { uid, days, reserve, listedDay: day, endsDay: day + days }],
    });
    scheduleSave(get());
  },
  buyWax(seriesId, productKey, price) {
    const { cash, day, sealed, nextSealedId, bought } = get();
    if (price > cash) return null;
    const key = `${productKey}:${seriesId}:${day}`;
    const item: SealedItem = {
      id: nextSealedId, seriesId, productKey, boughtDay: day, pricePaid: price,
    };
    set({
      cash: cash - price,
      sealed: [...sealed, item],
      nextSealedId: nextSealedId + 1,
      bought: { ...bought, [key]: (bought[key] ?? 0) + 1 },
    });
    scheduleSave(get());
    return item;
  },
  buyFind(listedDay, uidKey) {
    const { marketFinds, cash, cards, nextUid } = get();
    const idx = marketFinds.findIndex(
      f => f.listedDay === listedDay && world.identityKey(f.pull) === uidKey,
    );
    if (idx < 0) return false;
    const find = marketFinds[idx];
    if (find.ask > cash) return false;
    set({
      cash: cash - find.ask,
      cards: [...cards, { ...find.pull, uid: nextUid, pulledSeq: nextUid }],
      nextUid: nextUid + 1,
      marketFinds: marketFinds.filter((_, i) => i !== idx),
    });
    scheduleSave(get());
    return true;
  },
  openSealed(id) {
    set({ sealed: get().sealed.filter(s => s.id !== id) });
    scheduleSave(get());
  },
  beginRip(session) {
    set({ ripSession: session });
    scheduleSave(get());
  },
  endRip() {
    set({ ripSession: null });
    scheduleSave(get());
  },
  spendCash(amount) {
    set({ cash: Math.max(0, get().cash - amount) });
    scheduleSave(get());
  },
  markLotDug(id) {
    set({ dugLots: [...get().dugLots, id].slice(-200) });
    scheduleSave(get());
  },
  pushNews(items) {
    if (items.length === 0) return;
    set({ news: [...items, ...get().news].slice(0, 60) });
    scheduleSave(get());
  },
  clearBreaking() {
    set({ breaking: null });
  },
  setShopName(name) {
    set({ shopName: name.trim() || 'Corner Store Cards' });
    scheduleSave(get());
  },
  setOverrides(set) {
    // Sanitize on EVERY path, not just import/hydrate — a malformed hex or
    // blank name typed into the editor corrupts all of a team's art until
    // reload otherwise.
    const clean = sanitizeOverrides(set).set;
    world.applyOverrides(clean);
    useCollection.setState({ overrides: world.currentOverrides });
    scheduleSave(useCollection.getState());
  },
  setCash(amount) {
    set({ cash: Math.max(0, amount) });
    scheduleSave(get());
  },
  startCareer() {
    set({ careerStarted: true });
    scheduleSave(get());
  },
  dismissSale(uid) {
    set({ saleFeed: get().saleFeed.filter(s => s.uid !== uid) });
    scheduleSave(get());
  },
}));

/** uid -> companyKey for slabs in transit back to the shop. */
let arrivedCompanies = new Map<number, string>();

/** Load the save before first render; safe to call once from main. */
export async function hydrateCollection(): Promise<void> {
  try {
    const d = await getDb();
    const save = await d.get(STORE, 'save-v1');
    if (save?.version === 1) {
      // The calendar must catch up to the save's day BEFORE populations
      // restore, or late-released series would boot with fresh supply.
      world.syncCalendar(save.day ?? 1);
      world.restorePopulations(save.populations ?? {});
      // Names must be applied before any card renders from the save.
      world.applyOverrides(sanitizeOverrides(save.overrides ?? {}).set);
      useCollection.setState({
        cards: save.cards ?? [],
        nextUid: save.nextUid ?? 1,
        day: save.day ?? 1,
        cash: save.cash ?? 2500,
        submissions: save.submissions ?? [],
        returns: save.returns ?? [],
        listings: save.listings ?? [],
        saleFeed: save.saleFeed ?? [],
        dugLots: save.dugLots ?? [],
        sealed: save.sealed ?? [],
        marketFinds: save.marketFinds ?? [],
        nextSealedId: save.nextSealedId ?? 1,
        ripSession: save.ripSession ?? null,
        bought: save.bought ?? {},
        news: save.news ?? [],
        shopName: save.shopName ?? 'Corner Store Cards',
        overrides: sanitizeOverrides(save.overrides ?? {}).set,
        careerStarted: save.careerStarted ?? false,
        hydrated: true,
      });
      // Restore the uid→company map for arrived-but-unrevealed slabs. The
      // save carries it since the returnCompanies field shipped; legacy
      // saves without it re-queue the orphans as a free overnight PSG
      // submission (the old, lossy fallback).
      arrivedCompanies = new Map(
        Object.entries((save.returnCompanies ?? {}) as Record<string, string>)
          .map(([uid, co]) => [Number(uid), co] as [number, string]),
      );
      const orphaned: number[] = (save.returns ?? [])
        .filter((uid: number) => !arrivedCompanies.has(uid));
      if (orphaned.length > 0) {
        const state = useCollection.getState();
        useCollection.setState({
          returns: state.returns.filter(uid => arrivedCompanies.has(uid)),
          submissions: [...state.submissions, {
            uids: orphaned, companyKey: 'psg', tier: 0 as Tier,
            submittedDay: state.day, dueDay: state.day, feePaid: 0,
          }],
        });
      }
      return;
    }
  } catch (err) {
    console.warn('hydrate failed — saving disabled to protect the existing record', err);
    saveBlocked = true;
  }
  useCollection.setState({ hydrated: true });
}

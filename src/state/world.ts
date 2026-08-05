/**
 * The game world singleton: leagues, series, and live populations.
 *
 * Definitions are pure derivations of the world seed (rebuilt identically on
 * every boot); only population draw state is mutable and persisted. One
 * module owns it so the rip screen, binder, and (later) market all see the
 * same finite world.
 */

import { seedFromText, Rng, childSeed } from '../engine/rng';
import { generateLeague, type Player, type Team, type Sport } from '../engine/world/teams';
import {
  buildSeries, makePopulation, classifySlots, openPack, openBox, renderInputs, rankOf,
  decodeSlot, slotOf, PRODUCTS, INSERT_SETS,
  type SeriesDef, type PulledCard, type ProductConfig,
} from '../engine/cards/series';
import { generateLotOffers, lotClassWeights, type LotOffer } from '../engine/economy/lots';
import { buildTop50, type Top50Entry } from '../engine/news/top50';
import { ripWorldDay } from '../engine/cards/worldRips';
import {
  emptyOverrides, teamKey, playerKey, splitName, type OverrideSet,
} from './overrides';
import { deriveDna, type DesignDna } from '../render/dna';
import { artSeedFor, type CardRenderSpec } from '../render/layers';
import type { Population } from '../engine/cards/population';
import { conditionFor, pressProfile, type Condition, type PressProfile } from '../engine/condition/condition';
import { intrinsicValue, generateComps, compValue, type Comp } from '../engine/economy/valuation';
import { COMPANIES, type GradeResult } from '../engine/condition/grading';
import { releasesThrough, SHELF_LIFE_DAYS, type Release } from '../engine/cards/calendar';
import { playerForm, hotMovers, statLine, type Mover } from '../engine/world/career';

export interface SeriesRuntime {
  def: SeriesDef;
  dna: DesignDna;
  pop: Population;
  classes: ReturnType<typeof classifySlots>;
  /** Repointed when name overrides are applied. */
  players: Player[];
  teams: Team[];
  press: PressProfile;
}

const WORLD_SEED = seedFromText('career-dev');

class World {
  /** Generated, pristine. Never mutated — overrides are applied on read. */
  private readonly baseLeagues: Record<Sport, { players: Player[]; teams: Team[] }>;
  readonly leagues: Record<Sport, { players: Player[]; teams: Team[] }>;
  readonly series: Map<string, SeriesRuntime> = new Map();
  private packRng: Rng;
  private overrides: OverrideSet = emptyOverrides();
  /**
   * Bumped every time names change. Card art bakes in names, team colors and
   * badges, so any cached bitmap keyed only by card identity goes stale on a
   * rename — callers key their caches on this, or clear on the callback.
   */
  namesRevision = 0;
  private nameListeners: (() => void)[] = [];
  /** Bumped whenever any population is drawn from — shelf prices key on it. */
  supplyRevision = 0;
  /** The collection's current day, mirrored here so valuations can read form. */
  currentDay = 1;
  private releaseDays = new Map<string, number>();

  constructor() {
    this.baseLeagues = {
      football: generateLeague(WORLD_SEED, 'football', 2027),
      baseball: generateLeague(WORLD_SEED, 'baseball', 2027),
    };
    this.leagues = {
      football: this.baseLeagues.football,
      baseball: this.baseLeagues.baseball,
    };
    this.packRng = Rng.from(childSeed(WORLD_SEED, 'shop-rips'), 'packs');
    // Launch pair. Everything after arrives via the release calendar.
    this.syncCalendar(1);
    // The baseball flagship is announced from day 1 (it was in the original
    // build and e2e/lab flows expect both), but its releaseDay still gates
    // the shelf and world rips.
    this.registerRelease(releasesThrough(WORLD_SEED, 46)[1]);
  }

  private registerRelease(r: Release): string | null {
    const lg = this.leagues[r.sport];
    const def = buildSeries(WORLD_SEED, r.year, r.brand, r.line, r.sport, lg.players, r.archetypeKey);
    if (this.series.has(def.id)) return null;
    this.series.set(def.id, {
      def,
      dna: deriveDna(def.seed, def.line),
      pop: makePopulation(def),
      classes: classifySlots(def),
      players: lg.players,
      teams: lg.teams,
      press: pressProfile(def.seed),
    });
    this.releaseDays.set(def.id, r.releaseDay);
    return def.id;
  }

  /**
   * Advance the release calendar: register every series whose release day
   * has arrived. Returns the ids of series that release exactly on `day`,
   * so the caller can put the drop on the wire.
   */
  syncCalendar(day: number): string[] {
    this.currentDay = Math.max(this.currentDay, day);
    const dropped: string[] = [];
    for (const r of releasesThrough(WORLD_SEED, day)) {
      const id = this.registerRelease(r);
      if (id && r.releaseDay === day) dropped.push(id);
    }
    return dropped;
  }

  /** Releases coming inside `horizon` days — shelf teasers and wire hype. */
  upcomingReleases(day: number, horizon = 14): Release[] {
    return releasesThrough(WORLD_SEED, day, horizon)
      .filter(r => r.releaseDay > day);
  }

  /** Is this product still on the distributor sheet? */
  onShelf(seriesId: string, day: number): boolean {
    const rel = this.releaseDay(seriesId);
    return day >= rel && day < rel + SHELF_LIFE_DAYS;
  }

  /** Series ids currently buyable on the shelf. */
  shelfSeries(day: number): string[] {
    return this.seriesIds.filter(id => this.onShelf(id, day));
  }

  /**
   * Apply name overrides. Only display fields change — ids, seeds, talent,
   * jersey numbers and populations are untouched, so a rename can never
   * re-price a collection or invalidate a save.
   */
  applyOverrides(set: OverrideSet): void {
    this.overrides = set;
    for (const sport of ['football', 'baseball'] as Sport[]) {
      const base = this.baseLeagues[sport];

      // Ranked rosters resolve to concrete ids here rather than in the file,
      // so a name list keeps working if the world seed ever changes.
      const byRank = new Map<number, { first: string; last: string }>();
      const names = set.rosterByRank[sport];
      if (names && names.length > 0) {
        const ordered = [...base.players].sort((a, b) => b.talent - a.talent);
        names.slice(0, ordered.length).forEach((name, i) => {
          byRank.set(ordered[i].id, splitName(name));
        });
      }

      this.leagues[sport] = {
        teams: base.teams.map(t => {
          const o = set.teams[teamKey(sport, t.id)];
          return o ? { ...t, ...o } : t;
        }),
        players: base.players.map(p => {
          // An explicit per-id override always wins over the ranked list.
          const ranked = byRank.get(p.id);
          const o = set.players[playerKey(sport, p.id)];
          if (!ranked && !o) return p;
          return { ...p, ...(ranked ?? {}), ...(o ?? {}) };
        }),
      };
    }
    // Series runtimes hold their own roster references; repoint them.
    for (const rt of this.series.values()) {
      const lg = this.leagues[rt.def.sport];
      rt.players = lg.players;
      rt.teams = lg.teams;
    }
    this.namesRevision++;
    for (const fn of this.nameListeners) fn();
  }

  /** Drop cached artwork when names change. Returns an unsubscribe. */
  onNamesChanged(fn: () => void): () => void {
    this.nameListeners.push(fn);
    return () => {
      const i = this.nameListeners.indexOf(fn);
      if (i >= 0) this.nameListeners.splice(i, 1);
    };
  }

  get currentOverrides(): OverrideSet {
    return this.overrides;
  }

  /** Display name for a series, honoring any brand/line override. */
  seriesName(seriesId: string): string {
    const rt = this.get(seriesId);
    const o = this.overrides.series[seriesId];
    if (!o) return rt.def.name;
    return `${rt.def.year} ${o.brand ?? rt.def.brand} ${o.line ?? rt.def.line}`;
  }

  get(seriesId: string): SeriesRuntime {
    const rt = this.series.get(seriesId);
    if (!rt) throw new Error(`Unknown series ${seriesId}`);
    return rt;
  }

  ripPack(seriesId: string): PulledCard[] {
    const rt = this.get(seriesId);
    this.supplyRevision++;
    return openPack(rt.def, rt.pop, this.packRng, rt.classes, 10, []);
  }

  /**
   * Open a sealed product. Boxes and cases carry real per-box guarantees —
   * the factory seeds a guaranteed auto and numbered cards into specific
   * packs, which is why buying a box is a different decision from buying
   * twelve packs.
   */
  openProduct(seriesId: string, productKey: string): PulledCard[][] {
    const rt = this.get(seriesId);
    const product = PRODUCTS.find(p => p.key === productKey);
    if (!product) throw new Error(`Unknown product ${productKey}`);
    this.supplyRevision++;
    if (product.packs === 1) {
      return [openPack(rt.def, rt.pop, this.packRng, rt.classes, product.cardsPerPack, [])];
    }
    return openBox(rt.def, rt.pop, this.packRng, product);
  }

  product(key: string): ProductConfig {
    const p = PRODUCTS.find(x => x.key === key);
    if (!p) throw new Error(`Unknown product ${key}`);
    return p;
  }

  get products(): ProductConfig[] {
    return PRODUCTS;
  }

  /**
   * Shelf price. Hot product carries a premium over MSRP, and sealed wax
   * appreciates as the population gets opened — which is what makes sitting
   * on cases a real strategy rather than a waste of shelf space.
   */
  waxPrice(seriesId: string, productKey: string, day: number): number {
    const rt = this.get(seriesId);
    const product = this.product(productKey);
    const openedFraction = 1 - rt.pop.totalRemaining / rt.pop.totalPrinted;
    // Supply drying up lifts the price of what's left, superlinearly at the end.
    const scarcityLift = 1 + Math.pow(openedFraction, 1.6) * 2.2;
    // Gentle drift so shelf prices aren't frozen across a career.
    const drift = 1 + Math.sin(day / 40 + Number(rt.def.seed % 100n) / 16) * 0.08;
    return Math.round(product.msrp * scarcityLift * drift * 100) / 100;
  }

  /** How much of a series' print run is still sealed, 0..1. */
  sealedFraction(seriesId: string): number {
    const rt = this.get(seriesId);
    return rt.pop.totalRemaining / rt.pop.totalPrinted;
  }

  /**
   * Daily allocation. Distributors ration hot product, so you can't simply
   * buy your way to every grail with a big bankroll.
   */
  allocation(seriesId: string, productKey: string, day: number): number {
    const product = this.product(productKey);
    const rt = this.get(seriesId);
    const rng = Rng.from(rt.def.seed, `alloc:${productKey}:${day}`);
    if (product.key === 'case') return rng.chance(0.45) ? 1 : 0;
    if (product.key === 'hobbyBox') return rng.range(1, 3);
    return rng.range(4, 12);
  }

  get seriesIds(): string[] {
    return [...this.series.keys()];
  }

  lotOffers(day: number): LotOffer[] {
    // Estate finds can only contain product that has actually been released.
    const released = this.seriesIds.filter(id => this.releaseDay(id) <= day);
    return generateLotOffers(WORLD_SEED, day, released);
  }

  /**
   * Dig a lot: draws its contents from the same finite populations packs
   * use, so anything found here is genuinely removed from world supply.
   */
  digLot(offer: LotOffer): PulledCard[] {
    const rt = this.get(offer.seriesId);
    this.supplyRevision++;
    const rng = new Rng(offer.seed);
    const w = lotClassWeights(offer);
    const out: PulledCard[] = [];
    const classNames = ['base', 'foil', 'numbered', 'auto'] as const;
    const weights = [w.base, w.foil, w.numbered, w.auto];
    for (let i = 0; i < offer.cardCount; i++) {
      const cls = rng.pickWeighted(classNames, weights);
      const ids = cls === 'base' ? rt.classes.base
        : cls === 'foil' ? rt.classes.foil
        : cls === 'numbered' ? rt.classes.numbered
        : rt.classes.autos;
      const drawn = rt.pop.drawFrom(rng, ids) ?? rt.pop.drawFrom(rng, rt.classes.base);
      if (!drawn) break;
      const { cardIndex, parallelId } = decodeSlot(rt.def, drawn.slotId);
      out.push({
        seriesId: rt.def.id,
        cardIndex,
        parallelId,
        serial: drawn.serial,
        numberedTo: rt.def.ladder[parallelId].numberedTo,
      });
    }
    return out;
  }

  conditionOf(pull: PulledCard): Condition {
    const rt = this.get(pull.seriesId);
    return conditionFor(
      rt.def.seed, pull.cardIndex, pull.parallelId, pull.serial, rt.press,
      this.printRunOf(pull),
    );
  }

  specFor(pull: PulledCard): CardRenderSpec {
    const rt = this.get(pull.seriesId);
    const { player, team, card, parallel } = renderInputs(rt.def, pull, rt.players, rt.teams);
    return {
      condition: this.conditionOf(pull),
      player, team, dna: rt.dna, parallel,
      serial: parallel.numberedTo !== null ? pull.serial : null,
      seriesName: this.seriesName(rt.def.id),
      cardNumber: card.cardNumber,
      isRookie: card.isRookie,
      auto: card.isAuto ? { ink: card.autoInk ?? 'blueSharpie', sticker: card.autoSticker } : null,
      insertName: card.insertName,
      artSeed: artSeedFor(rt.def.seed, pull.cardIndex),
    };
  }

  /** Stable identity string for a physical copy — keys comps and caches. */
  identityKey(pull: PulledCard): string {
    return `${pull.seriesId}:${pull.cardIndex}:${pull.parallelId}:${pull.serial}`;
  }

  /** Series desirability: premium/short-print brands carry more weight. */
  private setFactor(rt: SeriesRuntime): number {
    return 1 + 20000 / rt.def.archetype.baseRunPerCard * 0.05;
  }

  valuation(
    pull: PulledCard,
    grade?: { companyKey: string; result: GradeResult } | null,
  ): number {
    const rt = this.get(pull.seriesId);
    const card = rt.def.checklist[pull.cardIndex];
    const player = rt.players[card.playerId];
    const parallel = rt.def.ladder[pull.parallelId];
    const company = grade ? COMPANIES.find(c => c.key === grade.companyKey) : null;
    const effective = card.insertName
      ? { ...parallel, printRun: this.printRunOf(pull), desirability: parallel.desirability }
      : parallel;
    const base = intrinsicValue({
      player, parallel: effective,
      isRookie: card.isRookie,
      isAuto: card.isAuto,
      setFactor: this.setFactor(rt),
      grade: grade && company ? { result: grade.result, company } : null,
      errorKind: this.conditionOf(pull).error,
      insert: !!card.insertName,
    });
    // The career sim moves the market: current form vs the day-1 baseline.
    return base * this.hypeOf(player);
  }

  /** Value multiplier for a player's cards today, from the career sim. */
  hypeOf(player: Player): number {
    return playerForm(WORLD_SEED, player, this.currentDay).hype;
  }

  /** Current form reading for a player (for UI chips + stories). */
  formOf(player: Player): ReturnType<typeof playerForm> {
    return playerForm(WORLD_SEED, player, this.currentDay);
  }

  /** This week's biggest form movers across both leagues. */
  moversToday(day: number, count = 3): Mover[] {
    const pool = [...this.leagues.football.players, ...this.leagues.baseball.players];
    return hotMovers(WORLD_SEED, pool, day, count);
  }

  /** Stat line for a mover's wire story. */
  statLineFor(mover: Mover, day: number): string {
    return statLine(mover.player, day, mover.delta > 0);
  }

  gradeLabel(grade?: { companyKey: string; result: GradeResult } | null): string {
    if (!grade) return 'RAW';
    const co = COMPANIES.find(c => c.key === grade.companyKey);
    return `${co?.name ?? '?'} ${grade.result.overall.toFixed(1).replace('.0', '')}`;
  }

  comps(
    pull: PulledCard, today: number,
    grade?: { companyKey: string; result: GradeResult } | null,
  ): { comps: Comp[]; median: number | null; intrinsic: number } {
    const intrinsic = this.valuation(pull, grade);
    const key = `${this.identityKey(pull)}:${grade ? grade.companyKey + grade.result.overall : 'raw'}`;
    // Print run of the actual copy — an insert /199 must not show the base
    // rung's market depth.
    const comps = generateComps(key, intrinsic, this.printRunOf(pull), today, this.gradeLabel(grade));
    return { comps, median: compValue(comps), intrinsic };
  }

  /** Market interest 0..1 — drives auction crowd size. */
  interest(pull: PulledCard): number {
    const rt = this.get(pull.seriesId);
    const card = rt.def.checklist[pull.cardIndex];
    const player = rt.players[card.playerId];
    const talentPull = Math.max(0, player.talent - 55) / 45;
    return Math.min(1, talentPull * 0.7 + (card.isRookie ? 0.2 : 0) + (card.isAuto ? 0.2 : 0));
  }

  printRunOf(pull: PulledCard): number {
    const rt = this.get(pull.seriesId);
    const card = rt.def.checklist[pull.cardIndex];
    if (card.insertName) {
      return INSERT_SETS.find(s => s.name === card.insertName)?.printRun
        ?? rt.def.ladder[pull.parallelId].printRun;
    }
    return rt.def.ladder[pull.parallelId].printRun;
  }

  heat(pull: PulledCard): number {
    const rt = this.get(pull.seriesId);
    return rankOf(rt.def, pull);
  }

  displayName(pull: PulledCard): { player: string; tier: string; series: string } {
    const rt = this.get(pull.seriesId);
    const card = rt.def.checklist[pull.cardIndex];
    const player = rt.players[card.playerId];
    const par = rt.def.ladder[pull.parallelId];
    const tier = card.insertName
      ? `${card.insertName} #${pull.serial}/${this.printRunOf(pull)}`
      : par.numberedTo !== null
        ? `${par.name} #${pull.serial}/${par.numberedTo}`
        : par.name;
    return {
      player: `${player.first} ${player.last}`,
      tier: `${card.isAuto ? 'AUTO · ' : ''}${tier}`,
      series: this.seriesName(rt.def.id),
    };
  }

  /**
   * Advance the world by a day: everyone else opens wax too.
   *
   * Returns only the notable surfacings — scarce parallels, autos and
   * illustrated inserts — so the caller can put them on the wire and on the
   * market. Commons are consumed silently.
   */
  ripWorld(day: number): { pull: PulledCard; seriesId: string }[] {
    const surfaced: { pull: PulledCard; seriesId: string }[] = [];
    this.supplyRevision++;
    for (const [seriesId, rt] of this.series) {
      const P = rt.def.ladder.length;
      // Unreleased product is still in the warehouse — nobody rips it.
      const ageDays = day - this.releaseDay(seriesId);
      if (ageDays < 0) continue;
      const { notable } = ripWorldDay(
        rt.pop, this.packRng, rt.pop.totalPrinted, ageDays,
        (slotId) => {
          const card = rt.def.checklist[Math.floor(slotId / P)];
          const par = rt.def.ladder[slotId % P];
          return !!card.insertName || card.isAuto || par.printRun <= 299;
        },
      );
      for (const n of notable) {
        const { cardIndex, parallelId } = decodeSlot(rt.def, n.slotId);
        surfaced.push({
          seriesId,
          pull: {
            seriesId, cardIndex, parallelId,
            serial: n.serial,
            numberedTo: rt.def.ladder[parallelId].numberedTo,
          },
        });
      }
    }
    return surfaced;
  }

  /** In-game day a product hit shelves, from the release calendar. */
  releaseDay(seriesId: string): number {
    return this.releaseDays.get(seriesId) ?? 1;
  }

  /**
   * The Top 50 board. Candidates are the genuinely scarce slots — anything
   * with a print run of 199 or fewer, plus every auto — scored by value.
   * Surfaced counts read live from the populations.
   */
  top50(ownedKeys: Set<string>): Top50Entry[] {
    // Announced series ride the board even before street date — checklist
    // previews are how the chase starts. (Registration itself is
    // release-gated, so nothing leaks from the far future.)
    return buildTop50({
      seriesIds: this.seriesIds,
      candidates: (seriesId) => {
        const rt = this.get(seriesId);
        const out: { cardIndex: number; parallelId: number }[] = [];
        for (const card of rt.def.checklist) {
          for (const par of rt.def.ladder) {
            if (card.insertName ? par.id === 0
              : par.printRun <= 199 || (card.isAuto && par.printRun <= 1500)) {
              out.push({ cardIndex: card.index, parallelId: par.id });
            }
          }
        }
        return out;
      },
      valueOf: (seriesId, cardIndex, parallelId) =>
        this.valuation({ seriesId, cardIndex, parallelId, serial: 1, numberedTo: null }),
      surfacedOf: (seriesId, cardIndex, parallelId) => {
        const rt = this.get(seriesId);
        return rt.pop.drawnCount(slotOf(rt.def, cardIndex, parallelId));
      },
      describe: (seriesId, cardIndex, parallelId) => {
        const rt = this.get(seriesId);
        const card = rt.def.checklist[cardIndex];
        const player = rt.players[card.playerId];
        const team = rt.teams[player.teamId];
        const par = rt.def.ladder[parallelId];
        return {
          player: `${player.first} ${player.last}`,
          team: `${team.city} ${team.nickname}`,
          seriesName: this.seriesName(rt.def.id),
          tierName: card.insertName
            ? `${card.insertName} /${INSERT_SETS.find(s => s.name === card.insertName)?.printRun ?? par.printRun}`
            : par.numberedTo === 1 ? 'Superfractor 1/1'
              : par.numberedTo !== null ? `${par.name} /${par.numberedTo}` : par.name,
          printRun: card.insertName
            ? INSERT_SETS.find(s => s.name === card.insertName)?.printRun ?? par.printRun
            : par.printRun,
          isAuto: card.isAuto,
          isRookie: card.isRookie,
        };
      },
    }, ownedKeys);
  }

  /** Players whose markets are currently worth writing about. */
  hotPlayers(count = 8): string[] {
    const all = [...this.series.values()].flatMap(rt =>
      rt.def.checklist.slice(0, 12).map(c => rt.players[c.playerId]));
    return [...new Set(all.sort((a, b) => b.talent - a.talent)
      .map(p => `${p.first} ${p.last}`))].slice(0, count);
  }

  /** Persistable population states, keyed by series id. */
  savePopulations(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (const [id, rt] of this.series) out[id] = Array.from(rt.pop.saveState());
    return out;
  }

  restorePopulations(data: Record<string, number[]>): void {
    for (const [id, drawn] of Object.entries(data)) {
      const rt = this.series.get(id);
      if (rt) rt.pop.restoreState(Uint32Array.from(drawn));
    }
  }
}

export const world = new World();

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
import { deriveDna, type DesignDna } from '../render/dna';
import { artSeedFor, type CardRenderSpec } from '../render/layers';
import type { Population } from '../engine/cards/population';
import { conditionFor, pressProfile, type Condition, type PressProfile } from '../engine/condition/condition';
import { intrinsicValue, generateComps, compValue, type Comp } from '../engine/economy/valuation';
import { COMPANIES, type GradeResult } from '../engine/condition/grading';

export interface SeriesRuntime {
  def: SeriesDef;
  dna: DesignDna;
  pop: Population;
  classes: ReturnType<typeof classifySlots>;
  players: Player[];
  teams: Team[];
  press: PressProfile;
}

const WORLD_SEED = seedFromText('career-dev');

class World {
  readonly leagues: Record<Sport, { players: Player[]; teams: Team[] }>;
  readonly series: Map<string, SeriesRuntime> = new Map();
  private packRng: Rng;

  constructor() {
    this.leagues = {
      football: generateLeague(WORLD_SEED, 'football', 2027),
      baseball: generateLeague(WORLD_SEED, 'baseball', 2027),
    };
    this.packRng = Rng.from(childSeed(WORLD_SEED, 'shop-rips'), 'packs');
    this.register(2027, 'Pinnacle Press', 'Chromium', 'football', 'chromium');
    this.register(2027, 'Apex', 'Prizmatic', 'baseball', 'prizmatic');
  }

  private register(year: number, brand: string, line: string, sport: Sport, archetype: string) {
    const lg = this.leagues[sport];
    const def = buildSeries(WORLD_SEED, year, brand, line, sport, lg.players, archetype);
    this.series.set(def.id, {
      def,
      dna: deriveDna(def.seed, def.line),
      pop: makePopulation(def),
      classes: classifySlots(def),
      players: lg.players,
      teams: lg.teams,
      press: pressProfile(def.seed),
    });
  }

  get(seriesId: string): SeriesRuntime {
    const rt = this.series.get(seriesId);
    if (!rt) throw new Error(`Unknown series ${seriesId}`);
    return rt;
  }

  ripPack(seriesId: string): PulledCard[] {
    const rt = this.get(seriesId);
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
    return generateLotOffers(WORLD_SEED, day, this.seriesIds);
  }

  /**
   * Dig a lot: draws its contents from the same finite populations packs
   * use, so anything found here is genuinely removed from world supply.
   */
  digLot(offer: LotOffer): PulledCard[] {
    const rt = this.get(offer.seriesId);
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
      seriesName: rt.def.name,
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
    return intrinsicValue({
      player, parallel: effective,
      isRookie: card.isRookie,
      isAuto: card.isAuto,
      setFactor: this.setFactor(rt),
      grade: grade && company ? { result: grade.result, company } : null,
      errorKind: this.conditionOf(pull).error,
      insert: !!card.insertName,
    });
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
    const rt = this.get(pull.seriesId);
    const parallel = rt.def.ladder[pull.parallelId];
    const intrinsic = this.valuation(pull, grade);
    const key = `${this.identityKey(pull)}:${grade ? grade.companyKey + grade.result.overall : 'raw'}`;
    const comps = generateComps(key, intrinsic, parallel.printRun, today, this.gradeLabel(grade));
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
      series: rt.def.name,
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
    for (const [seriesId, rt] of this.series) {
      const P = rt.def.ladder.length;
      const ageDays = Math.max(0, day - this.releaseDay(seriesId));
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

  /** In-game day a product hit shelves. Staggered so releases feel like a calendar. */
  releaseDay(seriesId: string): number {
    return this.seriesIds.indexOf(seriesId) * 45 + 1;
  }

  /**
   * The Top 50 board. Candidates are the genuinely scarce slots — anything
   * with a print run of 199 or fewer, plus every auto — scored by value.
   * Surfaced counts read live from the populations.
   */
  top50(ownedKeys: Set<string>): Top50Entry[] {
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
          seriesName: rt.def.name,
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

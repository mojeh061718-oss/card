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
  buildSeries, makePopulation, classifySlots, openPack, renderInputs, rankOf, decodeSlot,
  type SeriesDef, type PulledCard,
} from '../engine/cards/series';
import { generateLotOffers, lotClassWeights, type LotOffer } from '../engine/economy/lots';
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
    return conditionFor(rt.def.seed, pull.cardIndex, pull.parallelId, pull.serial, rt.press);
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
    return intrinsicValue({
      player, parallel,
      isRookie: card.isRookie,
      isAuto: card.isAuto,
      setFactor: this.setFactor(rt),
      grade: grade && company ? { result: grade.result, company } : null,
      errorKind: this.conditionOf(pull).error,
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
    return this.get(pull.seriesId).def.ladder[pull.parallelId].printRun;
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
    const tier = par.numberedTo !== null
      ? `${par.name} #${pull.serial}/${par.numberedTo}`
      : par.name;
    return {
      player: `${player.first} ${player.last}`,
      tier: `${card.isAuto ? 'AUTO · ' : ''}${tier}`,
      series: rt.def.name,
    };
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

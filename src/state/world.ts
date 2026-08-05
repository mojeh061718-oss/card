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
  buildSeries, makePopulation, classifySlots, openPack, renderInputs, rankOf,
  type SeriesDef, type PulledCard,
} from '../engine/cards/series';
import { deriveDna, type DesignDna } from '../render/dna';
import { artSeedFor, type CardRenderSpec } from '../render/layers';
import type { Population } from '../engine/cards/population';
import { conditionFor, pressProfile, type Condition, type PressProfile } from '../engine/condition/condition';

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

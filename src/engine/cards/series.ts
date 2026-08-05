/**
 * Series generation — a full annual product release.
 *
 * A series expands deterministically from (worldSeed, year, brand, line,
 * sport) into: a checklist of card definitions (veterans, rookies, auto
 * subset), a parallel ladder, and a finite Population covering every
 * (cardDef × parallel) slot. Packs draw from that population without
 * replacement, so the world genuinely runs out of superfractors.
 */

import { Rng, childSeed } from '../rng';
import { Population, type PopulationSlot, type DrawResult } from './population';
import { buildLadder, LADDER_ARCHETYPES, type ParallelDef, type LadderArchetype } from './parallels';
import type { Player, Sport, Team } from '../world/teams';
import type { InkKind } from '../../render/signature';

export interface CardDef {
  /** Index within the series checklist. */
  index: number;
  playerId: number;
  cardNumber: string;      // printed number, e.g. "PC-147"
  isRookie: boolean;
  /** Autographed subset cards are separate checklist entries, like real sets. */
  isAuto: boolean;
  autoInk: InkKind | null;
  autoSticker: boolean;
}

export interface SeriesDef {
  id: string;              // "2027-pinnacle-press-chromium-football"
  seed: bigint;
  year: number;
  brand: string;
  line: string;
  sport: Sport;
  name: string;            // "2027 Pinnacle Press Chromium"
  archetype: LadderArchetype;
  ladder: ParallelDef[];
  checklist: CardDef[];
  /** slotId = cardIndex * ladder.length + parallelId */
  slotCount: number;
}

export interface PulledCard {
  seriesId: string;
  cardIndex: number;
  parallelId: number;
  serial: number;          // 1-based within print run
  numberedTo: number | null;
}

const AUTO_INKS: InkKind[] = ['blueSharpie', 'blueSharpie', 'blackSharpie', 'silverPaint', 'goldPaint'];

/** Build the series definition (pure; population state lives separately). */
export function buildSeries(
  worldSeed: bigint, year: number, brand: string, line: string, sport: Sport,
  players: Player[], archetypeKey = 'chromium',
): SeriesDef {
  const id = `${year}-${brand}-${line}-${sport}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const seed = childSeed(worldSeed, `series:${id}`);
  const rng = new Rng(seed);
  const archetype = LADDER_ARCHETYPES.find(a => a.key === archetypeKey) ?? LADDER_ARCHETYPES[0];
  const ladder = buildLadder(archetype, Rng.from(seed, 'ladder'));

  // Checklist: top talents headline; rookies flagged; ~20% get auto variants.
  const pool = [...players].sort((a, b) => b.talent - a.talent);
  const checklistSize = Math.min(150, pool.length);
  const prefix = line.split(/\s+/).map(s => s[0]).join('').toUpperCase() || 'X';
  const checklist: CardDef[] = [];
  for (let i = 0; i < checklistSize; i++) {
    const p = pool[i];
    checklist.push({
      index: checklist.length,
      playerId: p.id,
      cardNumber: `${prefix}-${i + 1}`,
      isRookie: p.debutYear === year,
      isAuto: false,
      autoInk: null,
      autoSticker: false,
    });
  }
  // Auto subset: best 30 players sign; sticker vs on-card split per series.
  const onCardSeries = rng.chance(0.6);
  for (let i = 0; i < Math.min(30, checklistSize); i++) {
    const p = pool[i];
    checklist.push({
      index: checklist.length,
      playerId: p.id,
      cardNumber: `${prefix}A-${i + 1}`,
      isRookie: p.debutYear === year,
      isAuto: true,
      autoInk: rng.pick(AUTO_INKS),
      autoSticker: !onCardSeries,
    });
  }

  return {
    id, seed, year, brand, line, sport,
    name: `${year} ${brand} ${line}`,
    archetype, ladder, checklist,
    slotCount: checklist.length * ladder.length,
  };
}

/** Print runs per slot. Autos are short-printed versions of the same ladder. */
export function seriesSlots(def: SeriesDef): PopulationSlot[] {
  const P = def.ladder.length;
  const slots: PopulationSlot[] = [];
  for (const card of def.checklist) {
    for (const par of def.ladder) {
      // Auto checklist entries: drastically shorter runs (real autos are
      // /499-style even at "base"), numbered rungs keep their stamp size.
      let printed = par.printRun;
      if (card.isAuto) {
        printed = par.numberedTo !== null
          ? par.printRun
          : Math.max(25, Math.round(par.printRun / 40));
      }
      slots.push({ slotId: card.index * P + par.id, printed });
    }
  }
  return slots;
}

export function makePopulation(def: SeriesDef): Population {
  return new Population(seriesSlots(def), childSeed(def.seed, 'population'));
}

export function slotOf(def: SeriesDef, cardIndex: number, parallelId: number): number {
  return cardIndex * def.ladder.length + parallelId;
}

export function decodeSlot(def: SeriesDef, slotId: number): { cardIndex: number; parallelId: number } {
  const P = def.ladder.length;
  return { cardIndex: Math.floor(slotId / P), parallelId: slotId % P };
}

function toPull(def: SeriesDef, d: DrawResult): PulledCard {
  const { cardIndex, parallelId } = decodeSlot(def, d.slotId);
  const par = def.ladder[parallelId];
  return {
    seriesId: def.id,
    cardIndex,
    parallelId,
    serial: d.serial,
    numberedTo: par.numberedTo,
  };
}

// ---------------------------------------------------------------------------
// Products and pack construction
// ---------------------------------------------------------------------------

export interface ProductConfig {
  key: 'retailPack' | 'hobbyPack' | 'hobbyBox' | 'case';
  name: string;
  cardsPerPack: number;
  packs: number;           // 1 for loose packs
  /** Guaranteed hits per box (drawn from auto slots). */
  guaranteedAutos: number;
  /** Guaranteed numbered parallels per box. */
  guaranteedNumbered: number;
  msrp: number;
}

export const PRODUCTS: ProductConfig[] = [
  { key: 'retailPack', name: 'Retail Pack', cardsPerPack: 8, packs: 1, guaranteedAutos: 0, guaranteedNumbered: 0, msrp: 6 },
  { key: 'hobbyPack', name: 'Hobby Pack', cardsPerPack: 10, packs: 1, guaranteedAutos: 0, guaranteedNumbered: 0, msrp: 14 },
  { key: 'hobbyBox', name: 'Hobby Box', cardsPerPack: 10, packs: 12, guaranteedAutos: 1, guaranteedNumbered: 3, msrp: 150 },
  { key: 'case', name: 'Hobby Case', cardsPerPack: 10, packs: 144, guaranteedAutos: 12, guaranteedNumbered: 36, msrp: 1700 },
];

interface SlotClasses {
  base: number[];
  foil: number[];
  numbered: number[];
  autos: number[];
}

export function classifySlots(def: SeriesDef): SlotClasses {
  const classes: SlotClasses = { base: [], foil: [], numbered: [], autos: [] };
  for (const card of def.checklist) {
    for (const par of def.ladder) {
      const slot = slotOf(def, card.index, par.id);
      if (card.isAuto) classes.autos.push(slot);
      else if (par.id === 0) classes.base.push(slot);
      else if (par.numberedTo === null) classes.foil.push(slot);
      else classes.numbered.push(slot);
    }
  }
  return classes;
}

/**
 * Open one pack. `hitSlots` optionally forces guaranteed content (box logic
 * decides which packs carry the box's auto / numbered hits — real wax seeds
 * hits into specific packs at the factory).
 */
export function openPack(
  def: SeriesDef, pop: Population, rng: Rng, classes: SlotClasses,
  cardsInPack: number, guarantees: ('auto' | 'numbered')[],
): PulledCard[] {
  const out: PulledCard[] = [];
  const drawClass = (ids: number[]): PulledCard | null => {
    const d = pop.drawFrom(rng, ids);
    return d ? toPull(def, d) : null;
  };

  // Guaranteed hits first (they occupy card slots in the pack).
  for (const g of guarantees) {
    const pulled = g === 'auto'
      ? drawClass(classes.autos) ?? drawClass(classes.numbered)
      : drawClass(classes.numbered) ?? drawClass(classes.foil);
    if (pulled) out.push(pulled);
  }

  // Remaining slots: mostly base; foil odds ~1:4 packs; numbered leaks in at
  // population-proportional odds (the "loose" hit that makes retail fun).
  while (out.length < cardsInPack) {
    const roll = rng.float();
    let pulled: PulledCard | null = null;
    if (roll < 0.94) {
      pulled = drawClass(classes.base);
    } else if (roll < 0.985) {
      pulled = drawClass(classes.foil) ?? drawClass(classes.base);
    } else {
      pulled = drawClass(classes.numbered) ?? drawClass(classes.foil) ?? drawClass(classes.base);
    }
    if (!pulled) pulled = drawClass(classes.base) ?? drawClass(classes.foil) ?? drawClass(classes.numbered) ?? drawClass(classes.autos);
    if (!pulled) break; // series fully exhausted
    out.push(pulled);
  }
  // Hits reveal last — pack order is part of the drama.
  return out.sort((a, b) => rankOf(def, a) - rankOf(def, b));
}

/** Crude heat rank for reveal ordering + escalation cues. */
export function rankOf(def: SeriesDef, c: PulledCard): number {
  const par = def.ladder[c.parallelId];
  const card = def.checklist[c.cardIndex];
  let r = Math.log2(1 + par.desirability);
  if (card.isAuto) r += 6;
  if (card.isRookie) r += 1.5;
  if (par.numberedTo === 1) r += 10;
  return r;
}

/**
 * Open a full box: distributes guaranteed hits into random packs, then
 * opens every pack. Returns packs in rip order.
 */
export function openBox(
  def: SeriesDef, pop: Population, rng: Rng, product: ProductConfig,
): PulledCard[][] {
  const classes = classifySlots(def);
  const guaranteeByPack: ('auto' | 'numbered')[][] = Array.from({ length: product.packs }, () => []);
  for (let i = 0; i < product.guaranteedAutos; i++) {
    guaranteeByPack[rng.int(product.packs)].push('auto');
  }
  for (let i = 0; i < product.guaranteedNumbered; i++) {
    guaranteeByPack[rng.int(product.packs)].push('numbered');
  }
  return guaranteeByPack.map(g => openPack(def, pop, rng, classes, product.cardsPerPack, g));
}

/** World context needed to render any pulled card. */
export function renderInputs(
  def: SeriesDef, pull: PulledCard, players: Player[], teams: Team[],
): { player: Player; team: Team; card: CardDef; parallel: ParallelDef } {
  const card = def.checklist[pull.cardIndex];
  const player = players[card.playerId];
  return { player, team: teams[player.teamId], card, parallel: def.ladder[pull.parallelId] };
}

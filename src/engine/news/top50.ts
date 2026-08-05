/**
 * The Top 50 — the world's most sought-after cards.
 *
 * Every entry is a real slot in a real print run. "Surfaced" counts come
 * straight from the live Population, so the board answers the question that
 * makes the whole game tick: has anyone found it yet, and is it you?
 */

export interface Top50Entry {
  rank: number;
  seriesId: string;
  cardIndex: number;
  parallelId: number;
  /** Display fields resolved by the caller from world state. */
  player: string;
  team: string;
  seriesName: string;
  tierName: string;
  printRun: number;
  surfaced: number;
  value: number;
  isAuto: boolean;
  isRookie: boolean;
  /** True when the player owns at least one copy. */
  owned: boolean;
}

export interface Top50Source {
  seriesIds: string[];
  /** Enumerate every (cardIndex, parallelId) slot worth considering. */
  candidates(seriesId: string): { cardIndex: number; parallelId: number }[];
  valueOf(seriesId: string, cardIndex: number, parallelId: number): number;
  surfacedOf(seriesId: string, cardIndex: number, parallelId: number): number;
  describe(seriesId: string, cardIndex: number, parallelId: number): {
    player: string; team: string; seriesName: string; tierName: string;
    printRun: number; isAuto: boolean; isRookie: boolean;
  };
}

/**
 * Build the board. Only genuinely scarce slots qualify — a big-print base
 * card is never "sought after" no matter whose face is on it.
 */
export function buildTop50(
  src: Top50Source,
  ownedKeys: Set<string>,
  limit = 50,
): Top50Entry[] {
  const scored: {
    seriesId: string; cardIndex: number; parallelId: number;
    value: number; printRun: number; player: string;
  }[] = [];
  for (const seriesId of src.seriesIds) {
    for (const { cardIndex, parallelId } of src.candidates(seriesId)) {
      const d = src.describe(seriesId, cardIndex, parallelId);
      scored.push({
        seriesId, cardIndex, parallelId,
        value: src.valueOf(seriesId, cardIndex, parallelId),
        printRun: d.printRun,
        player: d.player,
      });
    }
  }
  scored.sort((a, b) => b.value - a.value);

  // Diversity: 1/1s outvalue everything, so a pure value sort produces a
  // board of nothing but superfractors. Real most-wanted lists carry a mix
  // of tiers, so cap 1/1s at 60% and cap any one player at two entries.
  const oneOfOneCap = Math.round(limit * 0.6);
  const perPlayerCap = 2;
  const picked: typeof scored = [];
  const playerCounts = new Map<string, number>();
  let oneOfOnes = 0;
  for (const pass of [0, 1]) {
    for (const s of scored) {
      if (picked.length >= limit) break;
      if (picked.includes(s)) continue;
      const isOne = s.printRun === 1;
      const seen = playerCounts.get(s.player) ?? 0;
      // First pass enforces the caps; second pass backfills if we came up
      // short (small worlds may not have enough non-1/1 candidates).
      if (pass === 0 && isOne && oneOfOnes >= oneOfOneCap) continue;
      if (pass === 0 && seen >= perPlayerCap) continue;
      picked.push(s);
      playerCounts.set(s.player, seen + 1);
      if (isOne) oneOfOnes++;
    }
  }

  return picked.slice(0, limit).map((s, i) => {
    const d = src.describe(s.seriesId, s.cardIndex, s.parallelId);
    return {
      rank: i + 1,
      seriesId: s.seriesId,
      cardIndex: s.cardIndex,
      parallelId: s.parallelId,
      value: s.value,
      surfaced: src.surfacedOf(s.seriesId, s.cardIndex, s.parallelId),
      owned: ownedKeys.has(`${s.seriesId}:${s.cardIndex}:${s.parallelId}`),
      ...d,
    };
  });
}

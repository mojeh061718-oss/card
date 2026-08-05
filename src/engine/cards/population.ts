/**
 * Finite print-run populations with O(log n) draw-without-replacement.
 *
 * The core fidelity decision of the game: we don't roll loot-table odds, we
 * model the actual print run. A series declares its population as slots —
 * (cardDef × parallel) pairs each with a printed count — and every pack pull
 * anywhere in the world (player or NPC) consumes from the same finite pool.
 *
 * A Fenwick (binary indexed) tree over remaining counts gives:
 *   - draw: pick a uniform random remaining copy, decrement, O(log n)
 *   - remaining(slot), totalRemaining: O(log n) / O(1)
 *
 * Serial numbers are handed out lazily per slot via a keyed Feistel
 * permutation — drawing the k-th copy of a /99 slot yields a unique serial
 * in 1..99 with zero stored state beyond k.
 */

import { FeistelPermutation } from '../feistel';
import { childSeedN } from '../rng';
import type { Rng } from '../rng';

export interface PopulationSlot {
  /** Opaque slot id — index into the series checklist expansion. */
  readonly slotId: number;
  /** Copies printed for this (cardDef × parallel). */
  readonly printed: number;
}

export interface DrawResult {
  slotId: number;
  /** 1-based serial number within the slot's print run. */
  serial: number;
  /** Copies of this slot remaining after this draw. */
  remainingInSlot: number;
}

export class Population {
  private readonly tree: Float64Array; // Fenwick tree, 1-indexed
  private readonly printed: Uint32Array;
  private readonly drawn: Uint32Array;
  private readonly serialPerms: (FeistelPermutation | null)[];
  private readonly seed: bigint;
  private readonly size: number;
  private total: number;

  constructor(slots: readonly PopulationSlot[], seed: bigint) {
    this.size = slots.length;
    this.tree = new Float64Array(this.size + 1);
    this.printed = new Uint32Array(this.size);
    this.drawn = new Uint32Array(this.size);
    this.serialPerms = new Array(this.size).fill(null);
    this.seed = seed;
    this.total = 0;
    for (const s of slots) {
      if (s.slotId < 0 || s.slotId >= this.size) {
        throw new RangeError(`slotId ${s.slotId} out of range for ${this.size} slots`);
      }
      this.printed[s.slotId] = s.printed;
    }
    // Build Fenwick in O(n).
    for (let i = 0; i < this.size; i++) {
      this.tree[i + 1] += this.printed[i];
      const j = i + 1 + ((i + 1) & -(i + 1));
      if (j <= this.size) this.tree[j] += this.tree[i + 1];
      this.total += this.printed[i];
    }
  }

  get totalPrinted(): number {
    let t = 0;
    for (let i = 0; i < this.size; i++) t += this.printed[i];
    return t;
  }

  get totalRemaining(): number {
    return this.total;
  }

  remaining(slotId: number): number {
    return this.printed[slotId] - this.drawn[slotId];
  }

  drawnCount(slotId: number): number {
    return this.drawn[slotId];
  }

  private update(slotId: number, delta: number): void {
    for (let j = slotId + 1; j <= this.size; j += j & -j) this.tree[j] += delta;
  }

  /**
   * Find the slot containing the k-th remaining copy (0-based k) by
   * descending the Fenwick tree — O(log n), no scan.
   */
  private findKth(k: number): number {
    let idx = 0;
    let bit = 1 << (31 - Math.clz32(this.size));
    let rem = k + 1; // 1-based rank
    while (bit > 0) {
      const next = idx + bit;
      if (next <= this.size && this.tree[next] < rem) {
        idx = next;
        rem -= this.tree[next];
      }
      bit >>= 1;
    }
    return idx; // 0-based slotId
  }

  /** Draw one uniform random remaining copy from the whole population. */
  draw(rng: Rng): DrawResult {
    if (this.total <= 0) throw new RangeError('Population exhausted');
    const k = rng.int(this.total);
    return this.take(this.findKth(k));
  }

  /**
   * Draw without issuing a serial number.
   *
   * Serial assignment runs a Feistel permutation over BigInt, which is
   * ~100x the cost of the draw itself. The world opens tens of thousands of
   * cards a day and only cares about the handful worth reporting, so this
   * decrements the population and hands back the copy index — call
   * `serialFor` later for just the copies that matter.
   */
  drawIndex(rng: Rng): { slotId: number; copyIndex: number } {
    if (this.total <= 0) throw new RangeError('Population exhausted');
    const slotId = this.findKth(rng.int(this.total));
    const copyIndex = this.drawn[slotId];
    this.drawn[slotId]++;
    this.update(slotId, -1);
    this.total--;
    return { slotId, copyIndex };
  }

  /** Serial for a given copy index of a slot, computed on demand. */
  serialFor(slotId: number, copyIndex: number): number {
    let perm = this.serialPerms[slotId];
    if (perm === null) {
      perm = new FeistelPermutation(this.printed[slotId], childSeedN(this.seed, slotId));
      this.serialPerms[slotId] = perm;
    }
    return perm.serialFor(copyIndex);
  }

  /**
   * Draw one uniform random remaining copy from a subset of slots (e.g. "the
   * insert slots of this product's hobby-box hit table"). O(m + log n) for m
   * subset slots.
   */
  drawFrom(rng: Rng, slotIds: readonly number[]): DrawResult | null {
    let subTotal = 0;
    for (const id of slotIds) subTotal += this.remaining(id);
    if (subTotal <= 0) return null;
    let k = rng.int(subTotal);
    for (const id of slotIds) {
      const r = this.remaining(id);
      if (k < r) return this.take(id);
      k -= r;
    }
    return null; // unreachable
  }

  /** Consume one copy of a specific slot and issue its serial. */
  take(slotId: number): DrawResult {
    const rem = this.remaining(slotId);
    if (rem <= 0) throw new RangeError(`Slot ${slotId} exhausted`);
    const copyIndex = this.drawn[slotId];
    this.drawn[slotId]++;
    this.update(slotId, -1);
    this.total--;

    let perm = this.serialPerms[slotId];
    if (perm === null) {
      perm = new FeistelPermutation(this.printed[slotId], childSeedN(this.seed, slotId));
      this.serialPerms[slotId] = perm;
    }
    return {
      slotId,
      serial: perm.serialFor(copyIndex),
      remainingInSlot: rem - 1,
    };
  }

  /** Serialize draw state (printed counts are re-derivable from the seed). */
  saveState(): Uint32Array {
    return this.drawn.slice();
  }

  /** Restore draw state produced by `saveState`. */
  restoreState(drawn: Uint32Array): void {
    if (drawn.length !== this.size) throw new RangeError('Population state size mismatch');
    // Reset then replay counts into the Fenwick tree.
    this.tree.fill(0);
    this.total = 0;
    for (let i = 0; i < this.size; i++) {
      this.drawn[i] = drawn[i];
      if (drawn[i] > this.printed[i]) throw new RangeError(`Slot ${i} over-drawn in state`);
      const rem = this.printed[i] - drawn[i];
      this.tree[i + 1] += rem;
      const j = i + 1 + ((i + 1) & -(i + 1));
      if (j <= this.size) this.tree[j] += this.tree[i + 1];
      this.total += rem;
    }
  }
}

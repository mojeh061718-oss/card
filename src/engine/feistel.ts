/**
 * Format-preserving permutation over [0, n) via a balanced Feistel network
 * with cycle-walking.
 *
 * Why this exists: a print run of N copies must hand out each serial number
 * 1..N exactly once, in a scrambled order, without storing a shuffled array
 * (populations run to millions of virtual copies). `permute(i)` maps the
 * i-th copy drawn to a unique serial, deterministically per key.
 *
 * Construction: split indices into two halves over `half` bits, run 4 Feistel
 * rounds with a keyed round function, and cycle-walk any output >= n back
 * through the permutation until it lands inside the domain. Cycle-walking
 * preserves bijectivity on [0, n) exactly.
 */

import { mix64 } from './rng';

const ROUNDS = 4;

export class FeistelPermutation {
  private readonly n: number;
  private readonly halfBits: number;
  private readonly halfMask: number;
  private readonly roundKeys: bigint[];

  constructor(n: number, key: bigint) {
    if (!Number.isInteger(n) || n < 1) {
      throw new RangeError(`Feistel domain must be a positive integer, got ${n}`);
    }
    // The recombine uses 32-bit shifts, which silently overflow (negative
    // outputs escaping cycle-walking) once 2*halfBits exceeds 31 — so the
    // honest ceiling is 2^30, far above any real print run.
    if (n > 2 ** 30) {
      throw new RangeError(`Feistel domain too large: ${n} (max 2^30)`);
    }
    this.n = n;
    // Smallest even bit-width covering n, split into two halves.
    let bits = 2;
    while (2 ** bits < n) bits += 2;
    this.halfBits = bits / 2;
    this.halfMask = (1 << this.halfBits) - 1;
    this.roundKeys = [];
    for (let r = 0; r < ROUNDS; r++) {
      this.roundKeys.push(mix64(key ^ BigInt(r) * 0x9e3779b97f4a7c15n));
    }
  }

  get size(): number {
    return this.n;
  }

  private roundF(right: number, roundKey: bigint): number {
    // Mix the half-block with the round key; output confined to halfBits.
    const h = mix64(roundKey ^ BigInt(right) ^ 0xa5a5a5a5a5a5n);
    return Number(h & BigInt(this.halfMask));
  }

  private encryptOnce(x: number): number {
    let left = (x >> this.halfBits) & this.halfMask;
    let right = x & this.halfMask;
    for (let r = 0; r < ROUNDS; r++) {
      const t = left ^ this.roundF(right, this.roundKeys[r]);
      left = right;
      right = t;
    }
    return (left << this.halfBits) | right;
  }

  /** Bijective map [0, n) -> [0, n). */
  permute(i: number): number {
    if (!Number.isInteger(i) || i < 0 || i >= this.n) {
      throw new RangeError(`Feistel input out of domain: ${i} (n=${this.n})`);
    }
    let x = this.encryptOnce(i);
    // Cycle-walk: domain of encryptOnce is [0, 2^(2*halfBits)) ⊇ [0, n).
    while (x >= this.n) x = this.encryptOnce(x);
    return x;
  }

  /**
   * Serial number (1-based) for the i-th copy drawn from a print run of n.
   * Copy 0 might be serial #37/99; copy 1 might be #4/99; every serial in
   * 1..n is issued exactly once across i in [0, n).
   */
  serialFor(i: number): number {
    return this.permute(i) + 1;
  }
}

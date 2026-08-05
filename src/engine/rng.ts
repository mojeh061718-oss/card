/**
 * Deterministic randomness core.
 *
 * Everything in the game world derives from a single 64-bit world seed via
 * pure functions. Two primitives:
 *
 *  - `hash64` — SplitMix64-style avalanche mixer used to derive child seeds
 *    from (parentSeed, label) pairs. Labels are strings so derivation sites
 *    read as documentation: `childSeed(world, 'league:football')`.
 *  - `Rng` — PCG32 (PCG-XSH-RR) stream for sequential draws once you hold a
 *    derived seed.
 *
 * All state is BigInt 64-bit internally; public draws return JS numbers.
 */

const U64 = (1n << 64n) - 1n;

/** SplitMix64 finalizer — good avalanche, cheap, well-studied. */
export function mix64(x: bigint): bigint {
  x = x & U64;
  x = (x + 0x9e3779b97f4a7c15n) & U64;
  let z = x;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64;
  return (z ^ (z >> 31n)) & U64;
}

/** FNV-1a over UTF-8 bytes, widened to 64-bit, then avalanched. */
export function hashString(s: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) {
    // charCodeAt is fine: labels are ASCII by convention.
    h = (h ^ BigInt(s.charCodeAt(i))) & U64;
    h = (h * 0x100000001b3n) & U64;
  }
  return mix64(h);
}

/** Combine a parent seed with a string label into a child seed. */
export function childSeed(parent: bigint, label: string): bigint {
  return mix64(parent ^ hashString(label));
}

/** Combine a parent seed with an integer index into a child seed. */
export function childSeedN(parent: bigint, n: number | bigint): bigint {
  return mix64(parent ^ ((BigInt(n) * 0x9e3779b97f4a7c15n) & U64));
}

const MULT = 6364136223846793005n;
const INC_DEFAULT = 1442695040888963407n;

/** PCG32 (PCG-XSH-RR). Small, fast, excellent statistical quality. */
export class Rng {
  private state: bigint;
  private readonly inc: bigint;

  constructor(seed: bigint, streamId: bigint = INC_DEFAULT) {
    this.inc = ((streamId << 1n) | 1n) & U64;
    this.state = 0n;
    this.next32();
    this.state = (this.state + mix64(seed)) & U64;
    this.next32();
  }

  static from(parent: bigint, label: string): Rng {
    return new Rng(childSeed(parent, label));
  }

  /** Core generator: 32 uniform random bits. */
  next32(): number {
    const old = this.state;
    this.state = (old * MULT + this.inc) & U64;
    const xorshifted = Number(((old >> 18n) ^ old) >> 27n & 0xffffffffn);
    const rot = Number(old >> 59n);
    return ((xorshifted >>> rot) | (xorshifted << (-rot & 31))) >>> 0;
  }

  /** Uniform float in [0, 1). 32 bits of precision — plenty for gameplay. */
  float(): number {
    return this.next32() / 4294967296;
  }

  /** Uniform integer in [0, n). Unbiased via rejection sampling. */
  int(n: number): number {
    if (n <= 0) throw new RangeError(`Rng.int bound must be positive, got ${n}`);
    if (n > 4294967296) throw new RangeError(`Rng.int bound too large: ${n}`);
    const bound = n >>> 0 || 4294967296; // n === 2^32 wraps to 0
    const threshold = (4294967296 - bound) % bound;
    for (;;) {
      const r = this.next32();
      if (r >= threshold) return r % bound;
    }
  }

  /** Uniform integer in [lo, hi] inclusive. */
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.float() < p;
  }

  /** Pick a uniform random element. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new RangeError('Rng.pick on empty array');
    return arr[this.int(arr.length)];
  }

  /** Weighted pick: weights need not sum to 1. */
  pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length !== weights.length || items.length === 0) {
      throw new RangeError('Rng.pickWeighted: bad inputs');
    }
    let total = 0;
    for (const w of weights) total += w;
    let r = this.float() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** In-place Fisher–Yates shuffle; returns the same array. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /**
   * Standard normal via Box–Muller (single value; second discarded to keep
   * the stream position deterministic per call count).
   */
  gaussian(mean = 0, stddev = 1): number {
    let u = 0;
    while (u === 0) u = this.float();
    const v = this.float();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + z * stddev;
  }

  /**
   * Sample from a log-normal-ish "hobby value" distribution: most draws are
   * small, occasional draws are huge. Used for lot contents, comps noise, etc.
   */
  heavyTail(median: number, sigma = 1): number {
    return median * Math.exp(this.gaussian(0, sigma));
  }
}

/** Parse a user-facing seed string (any text) into a 64-bit world seed. */
export function seedFromText(text: string): bigint {
  return hashString(text.trim() === '' ? 'cardboard' : text.trim());
}

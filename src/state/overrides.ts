/**
 * Name overrides — safe editing of a generated world.
 *
 * Everything in the game is keyed by numeric ids derived from the world
 * seed: populations, serials, saved cards, comps and Top 50 entries all
 * reference `playerId` and `teamId`, never names. That makes renaming
 * completely safe — an override is a display-layer lookup that never
 * touches a seed, a print run, or a saved card.
 *
 * What is deliberately NOT overridable: talent, jersey numbers, positions,
 * team ids. Those feed valuation and art generation, so changing them would
 * silently re-price a collection you already own.
 */

export interface TeamOverride {
  city?: string;
  nickname?: string;
  abbrev?: string;
  primary?: string;
  secondary?: string;
}

export interface PlayerOverride {
  first?: string;
  last?: string;
}

export interface OverrideSet {
  version: 1;
  /** Keyed by `${sport}:${teamId}`. */
  teams: Record<string, TeamOverride>;
  /** Keyed by `${sport}:${playerId}`. */
  players: Record<string, PlayerOverride>;
  /** Keyed by series id — rename a product line. */
  series: Record<string, { brand?: string; line?: string }>;
}

export function emptyOverrides(): OverrideSet {
  return { version: 1, teams: {}, players: {}, series: {} };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Trim, cap length, and drop anything blank. Names are display-only. */
function cleanName(v: unknown, max = 28): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t.length > 0 ? t : undefined;
}

function cleanColor(v: unknown): string | undefined {
  return typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : undefined;
}

/**
 * Validate an arbitrary parsed JSON blob into an OverrideSet.
 *
 * Anything unrecognized is dropped rather than rejected, so a hand-edited
 * file with a typo still loads the parts that are valid instead of wiping
 * the player's work.
 */
export function sanitizeOverrides(raw: unknown): { set: OverrideSet; dropped: string[] } {
  const out = emptyOverrides();
  const dropped: string[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { set: out, dropped: ['file is not a JSON object'] };
  }
  const obj = raw as Record<string, unknown>;

  const teams = obj.teams;
  if (typeof teams === 'object' && teams !== null) {
    for (const [key, val] of Object.entries(teams as Record<string, unknown>)) {
      if (!/^(football|baseball):\d+$/.test(key)) { dropped.push(`team key "${key}"`); continue; }
      if (typeof val !== 'object' || val === null) { dropped.push(`team "${key}"`); continue; }
      const v = val as Record<string, unknown>;
      const entry: TeamOverride = {};
      const city = cleanName(v.city);
      const nickname = cleanName(v.nickname);
      const abbrev = cleanName(v.abbrev, 4);
      const primary = cleanColor(v.primary);
      const secondary = cleanColor(v.secondary);
      if (city) entry.city = city;
      if (nickname) entry.nickname = nickname;
      if (abbrev) entry.abbrev = abbrev.toUpperCase();
      if (primary) entry.primary = primary;
      if (secondary) entry.secondary = secondary;
      if ((v.primary && !primary) || (v.secondary && !secondary)) {
        dropped.push(`team "${key}" color (must be #rrggbb)`);
      }
      if (Object.keys(entry).length > 0) out.teams[key] = entry;
    }
  }

  const players = obj.players;
  if (typeof players === 'object' && players !== null) {
    for (const [key, val] of Object.entries(players as Record<string, unknown>)) {
      if (!/^(football|baseball):\d+$/.test(key)) { dropped.push(`player key "${key}"`); continue; }
      if (typeof val !== 'object' || val === null) { dropped.push(`player "${key}"`); continue; }
      const v = val as Record<string, unknown>;
      const entry: PlayerOverride = {};
      const first = cleanName(v.first, 18);
      const last = cleanName(v.last, 20);
      if (first) entry.first = first;
      if (last) entry.last = last;
      if (Object.keys(entry).length > 0) out.players[key] = entry;
    }
  }

  const series = obj.series;
  if (typeof series === 'object' && series !== null) {
    for (const [key, val] of Object.entries(series as Record<string, unknown>)) {
      if (typeof val !== 'object' || val === null) { dropped.push(`series "${key}"`); continue; }
      const v = val as Record<string, unknown>;
      const entry: { brand?: string; line?: string } = {};
      const brand = cleanName(v.brand, 24);
      const line = cleanName(v.line, 24);
      if (brand) entry.brand = brand;
      if (line) entry.line = line;
      if (Object.keys(entry).length > 0) out.series[key] = entry;
    }
  }

  return { set: out, dropped };
}

export function teamKey(sport: string, teamId: number): string {
  return `${sport}:${teamId}`;
}

export function playerKey(sport: string, playerId: number): string {
  return `${sport}:${playerId}`;
}

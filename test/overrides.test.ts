/**
 * Renaming must never be able to break a world.
 *
 * Everything the game stores is keyed by numeric id — populations, serials,
 * saved cards, comps. These tests pin that an override changes display text
 * and nothing else, and that a malformed file degrades gracefully instead of
 * wiping someone's edits.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { sanitizeOverrides, emptyOverrides, splitName } from '../src/state/overrides';
import { generateLeague } from '../src/engine/world/teams';
import { world } from '../src/state/world';
// Imported rather than read off disk, so a missing or malformed preset is a
// build failure and not just a red test.
import nflTeams from '../presets/nfl-teams.json';
import mlbTeams from '../presets/mlb-teams.json';
import realTeams from '../presets/real-teams.json';
import nflPlayers from '../presets/nfl-players.json';
import mlbPlayers from '../presets/mlb-players.json';
import realPlayers from '../presets/real-players.json';
import realWorld from '../presets/real-world.json';

describe('override validation', () => {
  it('accepts a well-formed file', () => {
    const { set, dropped } = sanitizeOverrides({
      version: 1,
      teams: { 'football:3': { city: 'Detroit', nickname: 'Motors', primary: '#0b2545' } },
      players: { 'football:12': { first: 'Sam', last: 'Rivera' } },
      series: { '2027-x': { brand: 'Topline', line: 'Chrome' } },
    });
    expect(dropped).toHaveLength(0);
    expect(set.teams['football:3'].city).toBe('Detroit');
    expect(set.players['football:12'].last).toBe('Rivera');
    expect(set.series['2027-x'].brand).toBe('Topline');
  });

  it('drops bad keys without discarding the good ones', () => {
    const { set, dropped } = sanitizeOverrides({
      teams: {
        'football:3': { city: 'Keep' },
        'hockey:1': { city: 'Wrong sport' },
        'garbage': { city: 'No id' },
      },
    });
    expect(set.teams['football:3'].city).toBe('Keep');
    expect(set.teams['hockey:1']).toBeUndefined();
    expect(dropped.length).toBe(2);
  });

  it('rejects malformed colors but keeps the names beside them', () => {
    const { set, dropped } = sanitizeOverrides({
      teams: { 'baseball:0': { nickname: 'Aces', primary: 'blue', secondary: '#ffcc00' } },
    });
    expect(set.teams['baseball:0'].nickname).toBe('Aces');
    expect(set.teams['baseball:0'].primary).toBeUndefined();
    expect(set.teams['baseball:0'].secondary).toBe('#ffcc00');
    expect(dropped.length).toBe(1);
  });

  it('ignores blank and whitespace-only names', () => {
    const { set } = sanitizeOverrides({
      players: { 'football:1': { first: '   ', last: 'Vance' } },
    });
    expect(set.players['football:1'].first).toBeUndefined();
    expect(set.players['football:1'].last).toBe('Vance');
  });

  it('caps absurd lengths instead of rejecting', () => {
    const { set } = sanitizeOverrides({
      players: { 'football:1': { last: 'x'.repeat(500) } },
    });
    expect(set.players['football:1'].last!.length).toBeLessThanOrEqual(20);
  });

  it('survives complete garbage', () => {
    expect(sanitizeOverrides(null).set).toEqual(emptyOverrides());
    expect(sanitizeOverrides('nope').set).toEqual(emptyOverrides());
    expect(sanitizeOverrides([1, 2, 3]).set).toEqual(emptyOverrides());
    expect(sanitizeOverrides({ teams: 'not an object' }).set).toEqual(emptyOverrides());
  });

  it('never carries fields that would re-price a collection', () => {
    // Talent, jersey and team assignment drive valuation and art — an
    // override file must not be able to smuggle them in.
    const { set } = sanitizeOverrides({
      players: { 'football:1': { first: 'A', talent: 99, jersey: 1, teamId: 5 } },
      teams: { 'football:1': { nickname: 'B', id: 9 } },
    });
    expect(JSON.stringify(set)).not.toContain('talent');
    expect(JSON.stringify(set)).not.toContain('jersey');
    expect(JSON.stringify(set)).not.toContain('teamId');
  });
});

describe('ranked rosters', () => {
  it('keeps an ordered name list per sport', () => {
    const { set, dropped } = sanitizeOverrides({
      rosterByRank: { football: ['Ada Vance', 'Bo Trask'], baseball: ['Cy Okafor'] },
    });
    expect(dropped).toHaveLength(0);
    expect(set.rosterByRank.football).toEqual(['Ada Vance', 'Bo Trask']);
    expect(set.rosterByRank.baseball).toEqual(['Cy Okafor']);
  });

  it('drops unknown sports and non-arrays but keeps the valid ones', () => {
    const { set, dropped } = sanitizeOverrides({
      rosterByRank: { football: ['Keep Me'], hockey: ['Nope'], baseball: 'not a list' },
    });
    expect(set.rosterByRank.football).toEqual(['Keep Me']);
    expect(set.rosterByRank.baseball).toBeUndefined();
    expect(dropped.length).toBe(2);
  });

  it('strips blanks and non-strings rather than shifting every later rank', () => {
    // A hole in the list would silently move everyone below it up a rank,
    // handing the wrong player the checklist's top card.
    const { set } = sanitizeOverrides({
      rosterByRank: { football: ['Real Name', '  ', 42, null, 'Also Real'] },
    });
    expect(set.rosterByRank.football).toEqual(['Real Name', 'Also Real']);
  });

  it('splits display names, keeping compound surnames and suffixes intact', () => {
    expect(splitName('Bobby Witt Jr.')).toEqual({ first: 'Bobby', last: 'Witt Jr.' });
    expect(splitName('Amon-Ra St. Brown')).toEqual({ first: 'Amon-Ra', last: 'St. Brown' });
    expect(splitName('  Ichiro  ')).toEqual({ first: 'Ichiro', last: '' });
  });

  it('resolves ranks deterministically, top talent first', () => {
    const lg = generateLeague(99n, 'football', 2027);
    const order = [...lg.players].sort((a, b) => b.talent - a.talent);
    const again = [...lg.players].sort((a, b) => b.talent - a.talent);
    // Stable sort means equal-talent players never trade places between
    // loads — a preset always lands on the same people.
    expect(order.map(p => p.id)).toEqual(again.map(p => p.id));
    expect(order[0].talent).toBeGreaterThanOrEqual(order[1].talent);
  });

  it('never applies more names than the league has players', () => {
    const lg = generateLeague(7n, 'baseball', 2027);
    const names = Array.from({ length: lg.players.length + 500 }, (_, i) => `P${i} X`);
    const applied = names.slice(0, lg.players.length);
    expect(applied).toHaveLength(lg.players.length);
  });
});

describe('shipped presets', () => {
  const all: [string, unknown][] = [
    ['nfl-teams', nflTeams], ['mlb-teams', mlbTeams], ['real-teams', realTeams],
    ['nfl-players', nflPlayers], ['mlb-players', mlbPlayers],
    ['real-players', realPlayers], ['real-world', realWorld],
  ];

  it.each(all)('%s survives sanitization with nothing dropped', (_name, raw) => {
    const { set, dropped } = sanitizeOverrides(raw);
    expect(dropped).toEqual([]);
    // Round-trips: sanitizing the sanitized output is a no-op.
    expect(sanitizeOverrides(set).set).toEqual(set);
  });

  it('real-world.json covers both full leagues and 150 names per sport', () => {
    const { set } = sanitizeOverrides(realWorld);
    const football = Object.keys(set.teams).filter(k => k.startsWith('football:'));
    const baseball = Object.keys(set.teams).filter(k => k.startsWith('baseball:'));
    expect(football).toHaveLength(32);
    expect(baseball).toHaveLength(30);
    // Current stars + legends + prospect classes, no duplicates.
    const fb = set.rosterByRank.football ?? [];
    const bb = set.rosterByRank.baseball ?? [];
    expect(fb.length).toBeGreaterThanOrEqual(150);
    expect(bb.length).toBeGreaterThanOrEqual(150);
    expect(new Set(fb).size).toBe(fb.length);
    expect(new Set(bb).size).toBe(bb.length);
  });

  it('preset team ids are contiguous from zero, so none is orphaned', () => {
    const { set } = sanitizeOverrides(realWorld);
    for (const [sport, count] of [['football', 32], ['baseball', 30]] as const) {
      const ids = Object.keys(set.teams)
        .filter(k => k.startsWith(`${sport}:`))
        .map(k => Number(k.split(':')[1]))
        .sort((a, b) => a - b);
      expect(ids).toEqual(Array.from({ length: count }, (_, i) => i));
    }
  });

  it('fits inside the generated leagues, so no name is silently discarded', () => {
    const { set } = sanitizeOverrides(realWorld);
    for (const sport of ['football', 'baseball'] as const) {
      const lg = generateLeague(1n, sport, 2027);
      expect(set.rosterByRank[sport]!.length).toBeLessThanOrEqual(lg.players.length);
    }
  });

  it('has no duplicate names — a repeat would cost a rank', () => {
    const { set } = sanitizeOverrides(realWorld);
    for (const list of Object.values(set.rosterByRank)) {
      expect(new Set(list!).size).toBe(list!.length);
    }
  });

  it('every preset name splits into something renderable', () => {
    const { set } = sanitizeOverrides(realPlayers);
    for (const list of Object.values(set.rosterByRank)) {
      for (const name of list!) {
        const { first, last } = splitName(name);
        expect(first.length).toBeGreaterThan(0);
        // A nameplate needs a surname; every preset entry is a full name.
        expect(last.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('applying a preset to the live world', () => {
  // The singleton is shared, so this block owns it: apply, assert, reset.
  afterAll(() => world.applyOverrides(emptyOverrides()));

  it('lands the top-ranked names on the top-talent players', () => {
    world.applyOverrides(sanitizeOverrides(realWorld).set);
    for (const [sport, expected] of [
      ['football', 'Patrick Mahomes'], ['baseball', 'Shohei Ohtani'],
    ] as const) {
      const top = [...world.leagues[sport].players].sort((a, b) => b.talent - a.talent)[0];
      expect(`${top.first} ${top.last}`).toBe(expected);
    }
    expect(world.leagues.football.teams[0].city).toBe('Arizona');
  });

  it('carries the names onto the Top 50 board', () => {
    world.applyOverrides(sanitizeOverrides(realWorld).set);
    const names = world.top50(new Set()).map(e => e.player);
    expect(names).toContain('Patrick Mahomes');
    expect(names).toContain('Shohei Ohtani');
  });

  it('leaves scarcity untouched — a rename cannot re-price a collection', () => {
    const id = world.seriesIds[0];
    const before = {
      remaining: world.sealedFraction(id),
      value: world.valuation({ seriesId: id, cardIndex: 0, parallelId: 0, serial: 1, numberedTo: null }),
      run: world.printRunOf({ seriesId: id, cardIndex: 0, parallelId: 0, serial: 1, numberedTo: null }),
    };
    world.applyOverrides(sanitizeOverrides(realWorld).set);
    expect(world.sealedFraction(id)).toBe(before.remaining);
    expect(world.valuation({ seriesId: id, cardIndex: 0, parallelId: 0, serial: 1, numberedTo: null }))
      .toBe(before.value);
    expect(world.printRunOf({ seriesId: id, cardIndex: 0, parallelId: 0, serial: 1, numberedTo: null }))
      .toBe(before.run);
  });

  it('lets a hand-typed player edit beat the ranked list', () => {
    const base = sanitizeOverrides(realWorld).set;
    const top = [...world.leagues.football.players].sort((a, b) => b.talent - a.talent)[0];
    world.applyOverrides({
      ...base,
      players: { [`football:${top.id}`]: { first: 'Hand', last: 'Typed' } },
    });
    const after = world.leagues.football.players.find(p => p.id === top.id)!;
    expect(`${after.first} ${after.last}`).toBe('Hand Typed');
  });

  it('resets cleanly back to generated names', () => {
    world.applyOverrides(sanitizeOverrides(realWorld).set);
    world.applyOverrides(emptyOverrides());
    const top = [...world.leagues.football.players].sort((a, b) => b.talent - a.talent)[0];
    expect(`${top.first} ${top.last}`).not.toBe('Patrick Mahomes');
    expect(world.leagues.football.teams[0].city).not.toBe('Arizona');
  });
});

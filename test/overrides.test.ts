/**
 * Renaming must never be able to break a world.
 *
 * Everything the game stores is keyed by numeric id — populations, serials,
 * saved cards, comps. These tests pin that an override changes display text
 * and nothing else, and that a malformed file degrades gracefully instead of
 * wiping someone's edits.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeOverrides, emptyOverrides } from '../src/state/overrides';

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

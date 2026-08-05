/**
 * Series editor — rename the world without breaking it.
 *
 * Everything the game stores references numeric ids, never names, so
 * renaming is a pure display-layer change. Teams, players and product lines
 * can all be edited freely; talent, jersey numbers, print runs and anything
 * already in your binder are untouched.
 */

import { useMemo, useState } from 'react';
import { world } from '../state/world';
import { useCollection, exportSaveJson, importSaveJson, resetToWelcome } from '../state/collection';
import { photoCount } from './artcache';
import { runRealismImport } from './realism';
import type { Sport } from '../engine/world/teams';
import { sanitizeOverrides, teamKey, playerKey, emptyOverrides } from '../state/overrides';
import { sfx } from './feel';

type Tab = 'teams' | 'players' | 'brands' | 'file';

export function EditorScreen() {
  const { overrides, setOverrides } = useCollection();
  const [sport, setSport] = useState<Sport>('football');
  const [tab, setTab] = useState<Tab>('teams');
  const [teamFilter, setTeamFilter] = useState<number>(0);
  const [notice, setNotice] = useState<string | null>(null);

  const league = world.leagues[sport];
  // League-wide talent rank — this is exactly the ordering an imported
  // `rosterByRank` list is applied in, so showing it makes the file legible:
  // rank 1 is who your #1 chase card is built around.
  const rankOf = useMemo(() => {
    const m = new Map<number, number>();
    [...league.players]
      .sort((a, b) => b.talent - a.talent)
      .forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [league]);
  const roster = useMemo(
    () => league.players
      .filter(p => p.teamId === teamFilter)
      .sort((a, b) => b.talent - a.talent),
    [league, teamFilter],
  );
  const rankedCount = overrides.rosterByRank[sport]?.length ?? 0;

  const patchTeam = (id: number, field: string, value: string) => {
    const key = teamKey(sport, id);
    const next = {
      ...overrides,
      teams: { ...overrides.teams, [key]: { ...overrides.teams[key], [field]: value } },
    };
    setOverrides(next);
  };
  const patchPlayer = (id: number, field: string, value: string) => {
    const key = playerKey(sport, id);
    const next = {
      ...overrides,
      players: { ...overrides.players, [key]: { ...overrides.players[key], [field]: value } },
    };
    setOverrides(next);
  };

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(overrides, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cardboard-names.json';
    a.click();
    URL.revokeObjectURL(url);
    setNotice('Exported cardboard-names.json');
  };

  const importFile = async (file: File) => {
    try {
      const { set, dropped } = sanitizeOverrides(JSON.parse(await file.text()));
      setOverrides(set);
      sfx.tap();
      setNotice(
        dropped.length > 0
          ? `Loaded, ignoring ${dropped.length} bad entr${dropped.length === 1 ? 'y' : 'ies'}: ${dropped.slice(0, 3).join(', ')}`
          : 'Loaded name overrides.',
      );
    } catch {
      setNotice("That file isn't valid JSON — nothing was changed.");
    }
  };

  // THE REALISM CONCEPT — one tap, everything: real-league names, real
  // player photos, official card scans, and the TCG unlock. When the import
  // finishes it restarts the career at the welcome screen (names, photos,
  // scans and the unlock all survive the reset — only the career resets).
  const [realismBusy, setRealismBusy] = useState(false);
  const realismOneTap = async () => {
    if (realismBusy) return;
    setRealismBusy(true);
    try {
      const r = await runRealismImport(setNotice);
      setNotice(
        `Realism loaded — ${r.photos.done} photos, ${r.scans.done} scans cached. ` +
        'Restarting at the welcome screen…',
      );
      await resetToWelcome();
    } catch {
      setNotice('Realism import hit a network error — whatever finished is kept; tap again to resume.');
      setRealismBusy(false);
    }
  };

  // One tap: the bundled real-league preset (every team + the top 75
  // players per sport, applied by talent rank). Same explicit-user-action
  // contract as a file import — nothing loads without this tap.
  const importBundled = async () => {
    try {
      const res = await fetch('presets/real-world.json');
      if (!res.ok) throw new Error(String(res.status));
      const { set, dropped } = sanitizeOverrides(await res.json());
      setOverrides(set);
      sfx.tap();
      setNotice(
        `Real-league names applied — all teams, colors and the top 75 players per sport.` +
        (dropped.length > 0 ? ` (${dropped.length} entries skipped.)` : '') +
        ' Every card, banner and the Top 50 now use them.',
      );
    } catch {
      setNotice('Could not load the bundled preset.');
    }
  };

  const S = styles;
  const editCount = Object.keys(overrides.teams).length
    + Object.keys(overrides.players).length
    + Object.keys(overrides.series).length
    + Object.values(overrides.rosterByRank).reduce((a, l) => a + (l?.length ?? 0), 0);

  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={S.title}>EDITOR</div>
          <div style={S.sub}>{editCount} edit{editCount === 1 ? '' : 's'}</div>
        </div>
        <div style={S.note}>
          Renaming is safe. Everything is stored by id, so your collection,
          print runs and serial numbers are untouched.
        </div>
        <div style={S.chips}>
          {(['football', 'baseball'] as Sport[]).map(sp => (
            <button key={sp} onClick={() => { setSport(sp); setTeamFilter(0); }}
              style={{ ...S.chip, ...(sport === sp ? S.chipOn : {}) }}>
              {sp.toUpperCase()}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          {(['teams', 'players', 'brands', 'file'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ ...S.chip, ...(tab === t ? S.chipOn : {}) }}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <div style={S.scroll}>
        {notice && <div style={S.notice}>{notice}</div>}

        {tab === 'teams' && league.teams.map(t => (
          <div key={t.id} style={S.row}>
            <div style={{ ...S.swatch, background: t.primary, borderColor: t.secondary }} />
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <input style={S.input} defaultValue={t.city} placeholder="City"
                onBlur={e => patchTeam(t.id, 'city', e.target.value)} />
              <input style={S.input} defaultValue={t.nickname} placeholder="Nickname"
                onBlur={e => patchTeam(t.id, 'nickname', e.target.value)} />
              <input style={{ ...S.input, fontFamily: 'monospace' }} defaultValue={t.primary}
                placeholder="#primary"
                onBlur={e => patchTeam(t.id, 'primary', e.target.value)} />
              <input style={{ ...S.input, fontFamily: 'monospace' }} defaultValue={t.secondary}
                placeholder="#secondary"
                onBlur={e => patchTeam(t.id, 'secondary', e.target.value)} />
            </div>
          </div>
        ))}

        {tab === 'players' && (
          <>
            <select
              style={S.select}
              value={teamFilter}
              onChange={e => setTeamFilter(Number(e.target.value))}
            >
              {league.teams.map(t => (
                <option key={t.id} value={t.id}>{t.city} {t.nickname}</option>
              ))}
            </select>
            {rankedCount > 0 && (
              <p style={{ ...S.note, marginBottom: 10 }}>
                A ranked roster of {rankedCount} names is loaded. It fills league
                talent ranks 1–{rankedCount}; typing over a name here pins that
                one player and always wins.
              </p>
            )}
            {roster.map(p => {
              const rank = rankOf.get(p.id) ?? 0;
              return (
                <div key={p.id} style={S.row}>
                  <div style={S.jersey}>{p.jersey}</div>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <input key={`f${p.first}`} style={S.input} defaultValue={p.first}
                      placeholder="First"
                      onBlur={e => patchPlayer(p.id, 'first', e.target.value)} />
                    <input key={`l${p.last}`} style={S.input} defaultValue={p.last}
                      placeholder="Last"
                      onBlur={e => patchPlayer(p.id, 'last', e.target.value)} />
                  </div>
                  <div style={S.meta}>
                    {p.position}<br />{p.talent} OVR<br />
                    <span style={rank <= rankedCount ? S.rankOn : undefined}>#{rank}</span>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab === 'brands' && world.seriesIds.map(id => {
          const def = world.get(id).def;
          const o = overrides.series[id] ?? {};
          return (
            <div key={id} style={S.row}>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <input style={S.input} defaultValue={o.brand ?? def.brand} placeholder="Brand"
                  onBlur={e => setOverrides({
                    ...overrides,
                    series: { ...overrides.series, [id]: { ...o, brand: e.target.value } },
                  })} />
                <input style={S.input} defaultValue={o.line ?? def.line} placeholder="Line"
                  onBlur={e => setOverrides({
                    ...overrides,
                    series: { ...overrides.series, [id]: { ...o, line: e.target.value } },
                  })} />
              </div>
              <div style={S.meta}>{def.year}<br />{def.sport}</div>
            </div>
          );
        })}

        {tab === 'file' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={S.note}>
              Export your edits to a JSON file you can hand-edit and re-import.
              Unrecognized entries are skipped rather than wiping the rest.
            </p>
            <p style={S.note}>
              The <code>rosterByRank</code> field is the one worth editing by
              hand: an ordered list of names per sport, applied to the league's
              best players by talent. Rank 1 anchors the checklist, so put the
              biggest market name first. Ready-made lists live in{' '}
              <code>presets/</code>.
            </p>
            <button
              style={{
                ...S.action,
                background: 'rgba(142,224,142,0.14)',
                borderColor: 'rgba(142,224,142,0.55)',
                color: '#8ee08e',
                fontWeight: 900,
              }}
              disabled={realismBusy}
              onClick={realismOneTap}
            >
              {realismBusy ? 'IMPORTING REALISM CONCEPT…'
                : `🌎 REALISM CONCEPT — ONE TAP${photoCount() > 0 ? ` (${photoCount()} photos cached)` : ''}`}
            </button>
            <p style={S.note}>
              One tap loads everything: real-league names and colors, real
              player photos onto the cards, and both vintage TCG sets with
              official card scans — all cached on this device only, for
              private use. When it finishes, the game restarts fresh at the
              welcome screen (your imported assets survive; the career resets).
            </p>
            <button
              style={{
                ...S.action,
                background: 'rgba(212,160,23,0.16)',
                borderColor: 'rgba(212,160,23,0.55)',
                color: '#e8c86a',
                fontWeight: 900,
              }}
              onClick={importBundled}
            >
              ⚡ LOAD REAL-LEAGUE NAMES ONLY
            </button>
            <button style={S.action} onClick={exportFile}>EXPORT NAMES JSON</button>
            <label style={{ ...S.action, textAlign: 'center', cursor: 'pointer' }}>
              IMPORT NAMES JSON
              <input
                type="file" accept="application/json" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); }}
              />
            </label>
            <button
              style={{ ...S.action, background: 'rgba(224,138,106,0.15)', borderColor: 'rgba(224,138,106,0.4)' }}
              onClick={() => { setOverrides(emptyOverrides()); setNotice('Reset to generated names.'); }}
            >
              RESET TO GENERATED NAMES
            </button>

            <p style={{ ...S.note, marginTop: 16 }}>
              FULL SAVE BACKUP — your whole career lives in one browser
              record, and the browser is allowed to evict it. Export a backup
              file once in a while; importing one replaces the current game
              and reloads.
            </p>
            <button
              style={S.action}
              onClick={() => {
                const blob = new Blob([exportSaveJson()], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `cardboard-save-day${useCollection.getState().day}.json`;
                a.click();
                URL.revokeObjectURL(a.href);
                setNotice('Save exported. Keep that file somewhere safe.');
              }}
            >
              EXPORT FULL SAVE
            </button>
            <label style={{ ...S.action, textAlign: 'center', cursor: 'pointer' }}>
              IMPORT FULL SAVE (REPLACES CURRENT GAME)
              <input
                type="file" accept="application/json" style={{ display: 'none' }}
                onChange={async e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const err = await importSaveJson(await f.text());
                  if (err) setNotice(err);
                }}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { height: '100%', display: 'flex', flexDirection: 'column', background: '#0c0c10' },
  header: { padding: '14px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)' },
  title: { fontSize: 16, fontWeight: 800, letterSpacing: 4 },
  sub: { fontSize: 11, color: '#e8c86a' },
  note: { fontSize: 10, opacity: 0.5, lineHeight: 1.6, marginTop: 4 },
  chips: { display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' },
  chip: {
    background: 'rgba(255,255,255,0.06)', color: 'rgba(244,242,236,0.6)', border: 'none',
    borderRadius: 20, padding: '5px 9px', fontSize: 10, fontWeight: 700, letterSpacing: 1,
  },
  chipOn: { background: '#d4a017', color: '#1a1405' },
  scroll: { flex: 1, overflowY: 'auto', padding: '12px 14px 30px' },
  notice: {
    fontSize: 11, color: '#8ee08e', background: 'rgba(142,224,142,0.08)',
    border: '1px solid rgba(142,224,142,0.3)', borderRadius: 8, padding: 9, marginBottom: 12,
    lineHeight: 1.5,
  },
  row: {
    display: 'flex', gap: 9, alignItems: 'center', padding: 9, marginBottom: 7,
    background: 'rgba(255,255,255,0.035)', borderRadius: 9,
  },
  swatch: { width: 26, height: 26, borderRadius: 6, border: '2px solid', flexShrink: 0 },
  jersey: {
    width: 26, textAlign: 'center', fontSize: 13, fontWeight: 900,
    opacity: 0.5, flexShrink: 0,
  },
  meta: { fontSize: 9, opacity: 0.4, textAlign: 'right', lineHeight: 1.4, flexShrink: 0 },
  rankOn: { color: '#e8c86a', fontWeight: 800 },
  input: {
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6, padding: '7px 8px', fontSize: 12, color: '#f4f2ec',
    fontFamily: 'inherit', minWidth: 0,
  },
  select: {
    width: '100%', background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '9px 10px',
    fontSize: 13, color: '#f4f2ec', marginBottom: 10, fontFamily: 'inherit',
  },
  action: {
    background: 'rgba(212,160,23,0.12)', color: '#f4f2ec',
    border: '1px solid rgba(212,160,23,0.4)', borderRadius: 10, padding: '12px 0',
    fontSize: 12, fontWeight: 800, letterSpacing: 1,
  },
};

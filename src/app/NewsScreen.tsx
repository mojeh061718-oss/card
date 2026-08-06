/**
 * The wire and the Top 50.
 *
 * The board is the game's aspirational spine: fifty cards the world wants,
 * each showing how many copies have actually surfaced. An unfound grail
 * reads as still out there — and when one turns up, the app says so.
 */

import { useMemo, useState } from 'react';
import { useCollection } from '../state/collection';
import { world } from '../state/world';
import { formatMoney } from '../engine/economy/valuation';
import type { NewsItem } from '../engine/news/wire';
import type { Top50Entry } from '../engine/news/top50';
import { snapshotCard } from './cardview';

/** Tap a board row, see the card itself — the poster on the shop wall. */
function Top50CardView({ entry, onClose }: { entry: Top50Entry; onClose: () => void }) {
  const S = styles;
  const url = useMemo(() => {
    const pull = {
      seriesId: entry.seriesId, cardIndex: entry.cardIndex, parallelId: entry.parallelId,
      serial: 1, numberedTo: entry.printRun <= 2500 ? entry.printRun : null,
    };
    try {
      return snapshotCard(world.specFor(pull), Math.min(1080, Math.round(346 * Math.min(3, window.devicePixelRatio || 2))));
    } catch {
      return null;
    }
  }, [entry]);
  return (
    <div style={S.viewOverlay} onClick={onClose}>
      <div style={S.viewRank}>Nº {entry.rank} · THE TOP 50</div>
      {url && <img src={url} alt="" style={S.viewCard} />}
      <div style={S.viewName}>
        {entry.player}
        {entry.isRookie && <span style={S.rcTag}>RC</span>}
        {entry.isAuto && <span style={S.autoTag}>AUTO</span>}
      </div>
      <div style={S.viewTier}>{entry.tierName} · {entry.seriesName}</div>
      <div style={S.viewMeta}>
        <span style={{ color: '#8ee08e', fontWeight: 900 }}>{formatMoney(entry.value)}</span>
        <span style={{ color: entry.surfaced === 0 ? '#e8c86a' : 'rgba(244,242,236,0.55)' }}>
          {entry.surfaced === 0 ? 'NEVER FOUND' : `${entry.surfaced}/${entry.printRun} surfaced`}
        </span>
      </div>
      {entry.owned && <div style={{ ...S.ownedTag, fontSize: 11, marginTop: 10 }}>YOU OWN THIS</div>}
      <div style={{ fontSize: 11, opacity: 0.45, marginTop: 18 }}>tap anywhere to close</div>
    </div>
  );
}

export function NewsScreen() {
  const { cards, news, day, endDay } = useCollection();
  const [tab, setTab] = useState<'wire' | 'top50'>('top50');
  const [viewing, setViewing] = useState<Top50Entry | null>(null);

  const ownedKeys = useMemo(
    () => new Set(cards.map(c => `${c.seriesId}:${c.cardIndex}:${c.parallelId}`)),
    [cards],
  );
  const board = useMemo(() => world.top50(ownedKeys), [ownedKeys]);

  const S = styles;
  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={S.title}>THE WIRE</div>
          <div style={S.day}>DAY {day}</div>
          <span style={{ flex: 1 }} />
          <button style={S.endDay} onClick={endDay}>END DAY ▸</button>
        </div>
        <div style={S.tabs}>
          {(['top50', 'wire'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ ...S.tab, ...(tab === t ? S.tabOn : {}) }}>
              {t === 'top50' ? 'TOP 50' : 'NEWS'}
            </button>
          ))}
        </div>
      </header>

      <div style={S.scroll}>
        {tab === 'top50' ? (
          <>
            <div style={S.blurb}>
              The fifty cards the hobby wants most. "Surfaced" counts every copy
              that has left a pack anywhere in the world.
            </div>
            {board.map(e => (
              <button key={`${e.seriesId}-${e.cardIndex}-${e.parallelId}`}
                onClick={() => setViewing(e)}
                style={{ ...S.row, width: '100%', color: '#f4f2ec', textAlign: 'left', ...(e.owned ? S.rowOwned : {}) }}>
                <div style={S.rank}>{e.rank}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.rowPlayer}>
                    {e.player}
                    {e.isRookie && <span style={S.rcTag}>RC</span>}
                    {e.isAuto && <span style={S.autoTag}>AUTO</span>}
                  </div>
                  <div style={S.rowTier}>{e.tierName}</div>
                  <div style={S.rowSeries}>{e.seriesName}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={S.rowValue}>{formatMoney(e.value)}</div>
                  <div style={{
                    ...S.rowPop,
                    color: e.surfaced === 0 ? '#e8c86a' : 'rgba(244,242,236,0.45)',
                  }}>
                    {e.surfaced === 0
                      ? 'NEVER FOUND'
                      : `${e.surfaced}/${e.printRun} surfaced`}
                  </div>
                  {e.owned && <div style={S.ownedTag}>YOU OWN THIS</div>}
                </div>
              </button>
            ))}
          </>
        ) : (
          <>
            {news.length === 0 && (
              <div style={S.blurb}>The wire is quiet. End a day to see what moves.</div>
            )}
            {news.map(item => <NewsCard key={item.id} item={item} />)}
          </>
        )}
      </div>

      {viewing && <Top50CardView entry={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const S = styles;
  return (
    <article style={{ ...S.article, ...(item.breaking ? S.articleBreaking : {}) }}>
      {item.breaking && <div style={S.breakingTag}>BREAKING</div>}
      <div style={S.headline}>{item.headline}</div>
      <div style={S.body}>{item.body}</div>
      <div style={S.byline}>DAY {item.day}</div>
    </article>
  );
}

/** Full-screen takeover when a grail surfaces. */
export function BreakingOverlay() {
  const { breaking, clearBreaking } = useCollection();
  if (!breaking) return null;
  const S = styles;
  return (
    <div style={S.overlay} onClick={clearBreaking}>
      <div style={S.breakingBanner}>BREAKING</div>
      <div style={S.breakingHead}>{breaking.headline}</div>
      <div style={S.breakingBody}>{breaking.body}</div>
      <div style={{ fontSize: 11, opacity: 0.5, marginTop: 20 }}>tap to dismiss</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { height: '100%', display: 'flex', flexDirection: 'column', background: '#0c0c10' },
  header: { padding: '14px 16px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' },
  title: { fontSize: 16, fontWeight: 800, letterSpacing: 4 },
  day: { fontSize: 11, color: '#e8c86a', letterSpacing: 2 },
  endDay: { background: 'rgba(255,255,255,0.08)', color: '#e8c86a', border: '1px solid rgba(232,200,106,0.4)', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 800, letterSpacing: 1 },
  tabs: { display: 'flex', gap: 16, marginTop: 12 },
  tab: { background: 'none', border: 'none', borderBottom: '2px solid transparent', color: 'rgba(244,242,236,0.45)', fontSize: 11, fontWeight: 800, letterSpacing: 2, padding: '0 0 8px' },
  tabOn: { color: '#d4a017', borderBottomColor: '#d4a017' },
  scroll: { flex: 1, overflowY: 'auto', padding: '12px 14px 30px' },
  blurb: { fontSize: 11, opacity: 0.45, lineHeight: 1.6, marginBottom: 14 },
  row: { display: 'flex', gap: 10, alignItems: 'center', padding: '9px 10px', marginBottom: 6, background: 'rgba(255,255,255,0.035)', borderRadius: 9, border: '1px solid transparent' },
  rowOwned: { borderColor: 'rgba(212,160,23,0.5)', background: 'rgba(212,160,23,0.07)' },
  rank: { width: 24, fontSize: 15, fontWeight: 900, opacity: 0.35, textAlign: 'right' },
  rowPlayer: { fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 },
  rowTier: { fontSize: 11, color: '#e8c86a', fontWeight: 700 },
  rowSeries: { fontSize: 9, opacity: 0.4 },
  rowValue: { fontSize: 13, fontWeight: 900, color: '#8ee08e' },
  rowPop: { fontSize: 9, letterSpacing: 0.5, marginTop: 2 },
  ownedTag: { fontSize: 8, color: '#d4a017', fontWeight: 900, letterSpacing: 1, marginTop: 2 },
  rcTag: { fontSize: 8, background: '#d4af37', color: '#241d05', borderRadius: 3, padding: '1px 3px', fontWeight: 900 },
  autoTag: { fontSize: 8, background: 'rgba(122,79,211,0.9)', color: '#fff', borderRadius: 3, padding: '1px 3px', fontWeight: 900 },
  article: { padding: 12, marginBottom: 10, background: 'rgba(255,255,255,0.035)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' },
  articleBreaking: { borderColor: 'rgba(232,200,106,0.5)', background: 'rgba(212,160,23,0.08)' },
  breakingTag: { fontSize: 9, letterSpacing: 2, color: '#ffd75e', fontWeight: 900, marginBottom: 4 },
  headline: { fontSize: 14, fontWeight: 900, lineHeight: 1.3, letterSpacing: 0.3 },
  body: { fontSize: 11, opacity: 0.65, lineHeight: 1.6, marginTop: 6 },
  byline: { fontSize: 9, opacity: 0.3, marginTop: 8, letterSpacing: 1 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,4,7,0.97)', zIndex: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, paddingTop: 'calc(28px + env(safe-area-inset-top))', paddingBottom: 'calc(28px + env(safe-area-inset-bottom))', textAlign: 'center' },
  breakingBanner: { fontSize: 13, letterSpacing: 8, color: '#ffd75e', fontWeight: 900, marginBottom: 16, textShadow: '0 0 24px rgba(255,215,94,0.5)' },
  breakingHead: { fontSize: 24, fontWeight: 900, lineHeight: 1.25 },
  breakingBody: { fontSize: 13, opacity: 0.7, lineHeight: 1.7, marginTop: 14, maxWidth: 330 },
  viewOverlay: { position: 'fixed', inset: 0, background: 'rgba(5,5,8,0.97)', zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, paddingTop: 'calc(20px + env(safe-area-inset-top))', paddingBottom: 'calc(72px + env(safe-area-inset-bottom))', textAlign: 'center' },
  viewRank: { fontSize: 11, letterSpacing: 4, color: '#e8c86a', fontWeight: 900, marginBottom: 14 },
  viewCard: { width: '86%', maxWidth: 346, borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,0.75)' },
  viewName: { fontSize: 18, fontWeight: 900, marginTop: 16, display: 'flex', alignItems: 'center', gap: 6 },
  viewTier: { fontSize: 12, color: '#e8c86a', fontWeight: 700, marginTop: 4 },
  viewMeta: { display: 'flex', gap: 14, fontSize: 12, marginTop: 8, letterSpacing: 0.5 },
};

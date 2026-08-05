/**
 * The binder — 9-pocket pages you scroll like a real book.
 *
 * Pages render lazily (IntersectionObserver) and thumbnails come from an
 * LRU-capped snapshot cache, so a big collection never blows the iOS canvas
 * memory ceiling. Tap a pocket for the live foil view.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useCollection, type CardInstance } from '../state/collection';
import { world } from '../state/world';
import { snapshotCard, LiveCard } from './cardview';

const THUMB_W = 220;
const CACHE_MAX = 360;
const thumbCache = new Map<string, string>();

function thumbFor(card: CardInstance): string {
  const key = `${card.seriesId}:${card.cardIndex}:${card.parallelId}:${card.serial}`;
  const hit = thumbCache.get(key);
  if (hit) {
    // Refresh LRU position.
    thumbCache.delete(key);
    thumbCache.set(key, hit);
    return hit;
  }
  const url = snapshotCard(world.specFor(card), THUMB_W);
  thumbCache.set(key, url);
  if (thumbCache.size > CACHE_MAX) {
    thumbCache.delete(thumbCache.keys().next().value!);
  }
  return url;
}

type SortKey = 'newest' | 'heat' | 'player';
type FilterKey = 'all' | 'hits' | 'rc' | 'autos';

function isHit(c: CardInstance): boolean {
  return c.numberedTo !== null || world.heat(c) >= 4;
}

export function BinderScreen() {
  const cards = useCollection(s => s.cards);
  const [sort, setSort] = useState<SortKey>('newest');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [focus, setFocus] = useState<CardInstance | null>(null);

  const shown = useMemo(() => {
    let list = cards;
    if (filter === 'hits') list = list.filter(isHit);
    if (filter === 'rc') {
      list = list.filter(c => {
        const rt = world.get(c.seriesId);
        return rt.def.checklist[c.cardIndex].isRookie;
      });
    }
    if (filter === 'autos') {
      list = list.filter(c => world.get(c.seriesId).def.checklist[c.cardIndex].isAuto);
    }
    const sorted = [...list];
    if (sort === 'newest') sorted.sort((a, b) => b.pulledSeq - a.pulledSeq);
    if (sort === 'heat') sorted.sort((a, b) => world.heat(b) - world.heat(a));
    if (sort === 'player') {
      sorted.sort((a, b) =>
        world.displayName(a).player.localeCompare(world.displayName(b).player));
    }
    return sorted;
  }, [cards, sort, filter]);

  const pages = useMemo(() => {
    const out: CardInstance[][] = [];
    for (let i = 0; i < shown.length; i += 9) out.push(shown.slice(i, i + 9));
    if (out.length === 0) out.push([]);
    return out;
  }, [shown]);

  const S = styles;
  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={S.title}>COLLECTION</div>
        <div style={S.count}>{cards.length} cards · {cards.filter(isHit).length} {cards.filter(isHit).length === 1 ? 'hit' : 'hits'}</div>
        <div style={S.chips}>
          {(['all', 'hits', 'rc', 'autos'] as FilterKey[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ ...S.chip, ...(filter === f ? S.chipOn : {}) }}>
              {f.toUpperCase()}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          {(['newest', 'heat', 'player'] as SortKey[]).map(k => (
            <button key={k} onClick={() => setSort(k)}
              style={{ ...S.chip, ...(sort === k ? S.chipOn : {}) }}>
              {k === 'newest' ? '◷' : k === 'heat' ? '🔥' : 'A-Z'}
            </button>
          ))}
        </div>
      </header>

      <div style={S.book}>
        {pages.map((page, i) => (
          <PocketPage key={i} page={page} pageNo={i} onFocus={setFocus} />
        ))}
      </div>

      {focus && <DetailOverlay card={focus} onClose={() => setFocus(null)} />}
    </div>
  );
}

function PocketPage({ page, pageNo, onFocus }: {
  page: CardInstance[]; pageNo: number; onFocus: (c: CardInstance) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(pageNo < 2);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) { setVisible(true); io.disconnect(); } },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const S = styles;
  return (
    <div ref={ref} style={S.page}>
      <div style={S.pageLabel}>PAGE {pageNo + 1}</div>
      <div style={S.pocketGrid}>
        {Array.from({ length: 9 }, (_, i) => {
          const card = page[i];
          return (
            <div key={i} style={S.pocket} onClick={card ? () => onFocus(card) : undefined}>
              {card && visible ? (
                <img src={thumbFor(card)} alt="" style={S.pocketImg} />
              ) : card ? (
                <div style={S.pocketLoading} />
              ) : (
                <div style={S.pocketEmpty} />
              )}
              {card && card.numberedTo !== null && (
                <div style={{
                  ...S.pocketBadge,
                  background: card.numberedTo === 1 ? '#ffd75e' : 'rgba(8,8,12,0.85)',
                  color: card.numberedTo === 1 ? '#241d05' : '#e8c86a',
                }}>
                  {card.numberedTo === 1 ? '1/1' : `/${card.numberedTo}`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailOverlay({ card, onClose }: { card: CardInstance; onClose: () => void }) {
  const info = world.displayName(card);
  const rt = world.get(card.seriesId);
  const par = rt.def.ladder[card.parallelId];
  const popLeft = rt.pop.remaining(card.cardIndex * rt.def.ladder.length + card.parallelId);
  const surfaced = rt.pop.drawnCount(card.cardIndex * rt.def.ladder.length + card.parallelId);
  const S = styles;
  return (
    <div style={S.overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}>
        <LiveCard spec={world.specFor(card)} width={300} />
      </div>
      <div style={S.detailName}>{info.player}</div>
      <div style={S.detailTier}>{info.tier}</div>
      <div style={S.detailMeta}>
        {info.series} · {par.printRun.toLocaleString()} printed · {surfaced.toLocaleString()} surfaced · {popLeft.toLocaleString()} still sealed
      </div>
      <div style={{ ...S.count, marginTop: 6 }}>tap outside the card to close</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { height: '100%', display: 'flex', flexDirection: 'column', background: '#0c0c10' },
  header: { padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)' },
  title: { fontSize: 16, fontWeight: 800, letterSpacing: 4 },
  count: { fontSize: 12, opacity: 0.55, marginTop: 2 },
  chips: { display: 'flex', gap: 6, marginTop: 10 },
  chip: {
    background: 'rgba(255,255,255,0.06)', color: 'rgba(244,242,236,0.6)', border: 'none',
    borderRadius: 20, padding: '5px 10px', fontSize: 11, fontWeight: 700, letterSpacing: 1,
  },
  chipOn: { background: '#d4a017', color: '#1a1405' },
  book: { flex: 1, overflowY: 'auto', padding: '14px 12px 30px', WebkitOverflowScrolling: 'touch' },
  page: {
    background: 'linear-gradient(160deg, #1a1a22 0%, #131318 100%)',
    borderRadius: 14, padding: 10, marginBottom: 16,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 30px rgba(0,0,0,0.45)',
  },
  pageLabel: { fontSize: 9, letterSpacing: 2, opacity: 0.35, margin: '2px 4px 8px' },
  pocketGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  pocket: { position: 'relative', aspectRatio: '2.5 / 3.5', borderRadius: 8 },
  pocketImg: { width: '100%', height: '100%', borderRadius: 8, display: 'block' },
  pocketLoading: { width: '100%', height: '100%', borderRadius: 8, background: 'rgba(255,255,255,0.04)' },
  pocketEmpty: {
    width: '100%', height: '100%', borderRadius: 8,
    border: '1.5px dashed rgba(255,255,255,0.08)',
  },
  pocketBadge: {
    position: 'absolute', top: 5, right: 5, borderRadius: 5, padding: '2px 5px',
    fontSize: 10, fontWeight: 900, letterSpacing: 0.5,
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(4,4,7,0.94)', zIndex: 40,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 6, padding: 20, textAlign: 'center',
  },
  detailName: { fontSize: 20, fontWeight: 800, marginTop: 14 },
  detailTier: { fontSize: 13, color: '#e8c86a', fontWeight: 700, letterSpacing: 1 },
  detailMeta: { fontSize: 11, opacity: 0.6, maxWidth: 300, lineHeight: 1.5 },
};

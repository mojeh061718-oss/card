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
import { renderSlab } from '../render/slab';
import { COMPANIES, TIERS, type Tier } from '../engine/condition/grading';
import { formatMoney } from '../engine/economy/valuation';
import { sfx } from './feel';

// Pocket ≈ 110pt on a 3x display → 330px, or scans read soft. The cache
// cap drops to keep the data-URL heap in check at the bigger size.
const THUMB_W = 330;
const CACHE_MAX = 240;
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
  // '' means the GL context is lost — the still is blank. Hand it back for
  // this frame but NEVER cache it, or the binder shows blank cards forever.
  if (!url) return '';
  thumbCache.set(key, url);
  if (thumbCache.size > CACHE_MAX) {
    thumbCache.delete(thumbCache.keys().next().value!);
  }
  return url;
}

const SLAB_CACHE_MAX = 200;
const slabCache = new Map<number, string>();
const slabPending = new Set<number>();

// Names, team colors and badges are baked into the bitmap, so a rename makes
// every cached thumbnail and slab wrong. Drop them and let them re-render.
world.onNamesChanged(() => {
  thumbCache.clear();
  slabCache.clear();
});

/** Kick off slab rasterization; resolves to a data URL via `onReady`. */
function ensureSlab(card: CardInstance, onReady: () => void): string | null {
  const cached = slabCache.get(card.uid);
  if (cached) return cached;
  if (slabPending.has(card.uid) || !card.grade) return null;
  const still = snapshotCard(world.specFor(card), 320);
  if (!still) return null; // context lost — retry on a later render
  slabPending.add(card.uid);
  const co = COMPANIES.find(c => c.key === card.grade!.companyKey)!;
  const info = world.displayName(card);
  // If a rename lands while the async render is in flight, the result was
  // drawn with the old world — drop it instead of poisoning the fresh cache.
  const revAtStart = world.namesRevision;
  void renderSlab(still, co, card.grade.result, {
    player: info.player, seriesLine: info.series, tierLine: info.tier,
  }, 360).then(canvas => {
    if (world.namesRevision === revAtStart) {
      slabCache.set(card.uid, canvas.toDataURL());
      if (slabCache.size > SLAB_CACHE_MAX) {
        slabCache.delete(slabCache.keys().next().value!);
      }
    }
    onReady();
  }).finally(() => {
    slabPending.delete(card.uid);
  });
  return null;
}

type SortKey = 'newest' | 'heat' | 'player';
type FilterKey = 'all' | 'hits' | 'rc' | 'autos' | 'graded';

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
    if (filter === 'graded') list = list.filter(c => c.grade);
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
        {/* Two labeled rows — a single row clipped the sort chips off the
            right edge of the viewport, and icon-only buttons read as
            mystery meat. */}
        <div style={S.chips}>
          {(['all', 'hits', 'rc', 'autos', 'graded'] as FilterKey[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ ...S.chip, ...(filter === f ? S.chipOn : {}) }}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ ...S.chips, marginTop: 6 }}>
          <span style={{ fontSize: 9, letterSpacing: 1.5, opacity: 0.4, alignSelf: 'center' }}>SORT</span>
          {(['newest', 'heat', 'player'] as SortKey[]).map(k => (
            <button key={k} onClick={() => setSort(k)}
              style={{ ...S.chip, ...(sort === k ? S.chipOn : {}) }}>
              {k === 'newest' ? 'NEWEST' : k === 'heat' ? 'HEAT' : 'A–Z'}
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
  const [, setTick] = useState(0); // repaint when an async slab lands
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
          const slabUrl = card?.grade && visible ? ensureSlab(card, () => setTick(t => t + 1)) : null;
          return (
            <div key={i} data-pocket={pageNo * 9 + i} style={S.pocket}
              onClick={card ? () => onFocus(card) : undefined}>
              {card && visible ? (
                <img
                  src={slabUrl ?? thumbFor(card)}
                  alt=""
                  style={card.grade && slabUrl ? S.pocketSlab : S.pocketImg}
                />
              ) : card ? (
                <div style={S.pocketLoading} />
              ) : (
                <div style={S.pocketEmpty} />
              )}
              {card?.grade && (
                <div style={{
                  ...S.pocketBadge, left: 5, right: 'auto',
                  background: card.grade.result.overall === 10 ? '#ffd75e' : 'rgba(8,8,12,0.9)',
                  color: card.grade.result.overall === 10 ? '#241d05' : '#8ee08e',
                }}>
                  {card.grade.result.overall.toFixed(1).replace('.0', '')}
                </div>
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

/**
 * Everything about one card, including sending it off: grading lives right
 * here in the binder, so "tap the card → pick a house → send it" is the
 * whole flow. The GRADING screen remains for bulk submissions, the loupe,
 * and the slab-reveal ceremony (reachable from HOME).
 */
function DetailOverlay({ card, onClose }: { card: CardInstance; onClose: () => void }) {
  const info = world.displayName(card);
  const rt = world.get(card.seriesId);
  const popLeft = rt.pop.remaining(card.cardIndex * rt.def.ladder.length + card.parallelId);
  const surfaced = rt.pop.drawnCount(card.cardIndex * rt.def.ladder.length + card.parallelId);
  const S = styles;
  const [slabUrl, setSlabUrl] = useState<string | null>(null);
  const { submissions, returns, listings, cash, day, submitForGrading } = useCollection();
  const [companyKey, setCompanyKey] = useState('psg');
  const [tier, setTier] = useState<Tier>(1);
  const atGrader = submissions.find(s => s.uids.includes(card.uid));
  const arrived = returns.includes(card.uid);
  const listed = listings.some(l => l.uid === card.uid);
  const company = COMPANIES.find(c => c.key === companyKey)!;
  const fee = company.fees[tier];
  useEffect(() => {
    if (!card.grade) return;
    const co = COMPANIES.find(c => c.key === card.grade!.companyKey)!;
    let alive = true;
    void renderSlab(snapshotCard(world.specFor(card), 640), co, card.grade.result, {
      player: info.player, seriesLine: info.series, tierLine: info.tier,
    }).then(c => { if (alive) setSlabUrl(c.toDataURL()); });
    return () => { alive = false; };
  }, [card, info.player, info.series, info.tier]);

  return (
    <div style={S.overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}>
        {card.grade
          ? (slabUrl
              ? <img src={slabUrl} alt="graded slab" style={{ width: 290, display: 'block', filter: 'drop-shadow(0 18px 44px rgba(0,0,0,0.7))' }} />
              : <LiveCard spec={world.specFor(card)} width={290} />)
          : <LiveCard spec={world.specFor(card)} width={252} />}
      </div>
      <div style={S.detailName}>{info.player}</div>
      <div style={S.detailTier}>{info.tier}</div>
      {(() => {
        // Estimated value + form, so the binder finally SAYS what a card is
        // worth and why it might be moving.
        const player = rt.players[rt.def.checklist[card.cardIndex].playerId];
        const { hype, event } = world.formOf(player);
        const value = world.valuation(card, card.grade);
        return (
          <div style={{ fontSize: 15, fontWeight: 900, color: '#8ee08e', marginTop: 2 }}>
            EST {formatMoney(value)}
            {event === 'injury' && <span style={{ color: '#e08a6a', fontSize: 10 }}> · INJURED</span>}
            {event !== 'injury' && hype >= 1.15 && (
              <span style={{ color: '#ffb35e', fontSize: 10 }}> · HOT +{Math.round((hype - 1) * 100)}%</span>
            )}
            {event !== 'injury' && hype <= 0.87 && (
              <span style={{ color: '#7ab8e8', fontSize: 10 }}> · COLD −{Math.round((1 - hype) * 100)}%</span>
            )}
          </div>
        );
      })()}
      {card.grade && (
        <div style={{ fontSize: 12, color: '#8ee08e', fontWeight: 700 }}>
          {COMPANIES.find(c => c.key === card.grade!.companyKey)!.name} {card.grade.result.overall.toFixed(1).replace('.0', '')}
          {' · '}cent {card.grade.result.subs.centering.toFixed(1).replace('.0', '')}
          {' · '}corn {card.grade.result.subs.corners.toFixed(1).replace('.0', '')}
          {' · '}edge {card.grade.result.subs.edges.toFixed(1).replace('.0', '')}
          {' · '}surf {card.grade.result.subs.surface.toFixed(1).replace('.0', '')}
        </div>
      )}
      <div style={S.detailMeta}>
        {info.series} · {world.printRunOf(card).toLocaleString()} printed · {surfaced.toLocaleString()} surfaced · {popLeft.toLocaleString()} still sealed
      </div>

      {/* Send-for-grading, right here. States: raw & free → the form;
          in transit / arrived / at auction → an honest status line. */}
      {!card.grade && (
        <div style={S.gradePanel} onClick={e => e.stopPropagation()}>
          {atGrader ? (
            <div style={S.gradeStatus}>
              At {COMPANIES.find(c => c.key === atGrader.companyKey)?.name} —
              back in {Math.max(0, atGrader.dueDay - day)} day{atGrader.dueDay - day !== 1 ? 's' : ''}
            </div>
          ) : arrived ? (
            <div style={S.gradeStatus}>Slab arrived — reveal it from HOME → GRADE</div>
          ) : listed ? (
            <div style={S.gradeStatus}>Live at auction — settles overnight</div>
          ) : (
            <>
              <div style={S.gradeTitle}>SEND FOR GRADING</div>
              <div style={S.gradeRow}>
                {COMPANIES.map(co => (
                  <button key={co.key} onClick={() => setCompanyKey(co.key)}
                    style={{
                      ...S.gradeChip,
                      outline: co.key === companyKey ? `2px solid ${co.color === '#0b2545' ? '#78b7e0' : co.color}` : 'none',
                    }}>
                    <div style={{ fontWeight: 900, fontSize: 12 }}>{co.name}</div>
                    <div style={{ fontSize: 9, opacity: 0.6 }}>${co.fees[tier]} · {co.turnaroundDays[tier]}d</div>
                  </button>
                ))}
              </div>
              <div style={S.gradeRow}>
                {TIERS.map((t, i) => (
                  <button key={t} onClick={() => setTier(i as Tier)}
                    style={{
                      ...S.gradeChip, flex: 1,
                      background: tier === i ? 'rgba(212,160,23,0.2)' : 'rgba(255,255,255,0.06)',
                      outline: tier === i ? '1px solid rgba(212,160,23,0.6)' : 'none',
                      fontSize: 11, fontWeight: 800, padding: '9px 0',
                    }}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
              <button
                style={{ ...S.gradeSend, opacity: fee > cash ? 0.4 : 1 }}
                disabled={fee > cash}
                onClick={() => { sfx.tap(); submitForGrading([card.uid], companyKey, tier); }}
              >
                {fee > cash ? `NEED ${formatMoney(fee)} TO SEND` : `SEND · ${formatMoney(fee)}`}
              </button>
            </>
          )}
        </div>
      )}
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
  pocketSlab: { width: '100%', height: '100%', objectFit: 'contain', borderRadius: 6, display: 'block' },
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
    gap: 6, padding: 20, textAlign: 'center', overflowY: 'auto',
    paddingTop: 'calc(20px + env(safe-area-inset-top))',
    paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
  },
  gradePanel: {
    width: '100%', maxWidth: 340, marginTop: 8, padding: 11,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 7,
  },
  gradeTitle: { fontSize: 10, letterSpacing: 2, opacity: 0.55, fontWeight: 800 },
  gradeRow: { display: 'flex', gap: 6 },
  gradeChip: {
    flex: 1, background: 'rgba(255,255,255,0.06)', color: '#f4f2ec', border: 'none',
    borderRadius: 9, padding: '7px 2px', fontFamily: 'inherit',
  },
  gradeSend: {
    background: '#d4a017', color: '#1a1405', border: 'none', borderRadius: 10,
    padding: '13px 0', fontSize: 13, fontWeight: 900, letterSpacing: 1,
  },
  gradeStatus: { fontSize: 12, color: '#e8c86a', fontWeight: 700, padding: '4px 0' },
  detailName: { fontSize: 20, fontWeight: 800, marginTop: 14 },
  detailTier: { fontSize: 13, color: '#e8c86a', fontWeight: 700, letterSpacing: 1 },
  detailMeta: { fontSize: 11, opacity: 0.6, maxWidth: 300, lineHeight: 1.5 },
};

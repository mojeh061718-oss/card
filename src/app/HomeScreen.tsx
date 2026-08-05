/**
 * HOME — the shop hub. The first thing the app opens to.
 *
 * Not a store shelf: a dashboard. Cash, day, collection value, what needs
 * attention (slabs back, live auctions, an unfinished rip), the latest
 * wire story, and big tap targets into each part of the loop.
 */

import { useMemo } from 'react';
import { world } from '../state/world';
import { useCollection } from '../state/collection';
import { formatMoney } from '../engine/economy/valuation';
import { sfx } from './feel';

export function HomeScreen({ go }: { go: (route: string) => void }) {
  const {
    cash, day, cards, sealed, returns, listings, news, shopName, ripSession, endDay,
  } = useCollection();

  const supplyRev = world.supplyRevision;
  const collectionValue = useMemo(
    () => cards.reduce((sum, c) => sum + world.valuation(c, c.grade), 0),
    [cards, day, supplyRev],
  );
  const best = useMemo(() => {
    let top = null as (typeof cards)[number] | null;
    let topV = 0;
    for (const c of cards) {
      const v = world.valuation(c, c.grade);
      if (v > topV) { topV = v; top = c; }
    }
    return top ? { card: top, value: topV } : null;
  }, [cards, day, supplyRev]);
  const headline = news[0];

  const attention: { label: string; route: string }[] = [];
  if (ripSession) attention.push({ label: 'A rip is waiting — finish the reveal', route: 'wax' });
  if (returns.length > 0) attention.push({ label: `${returns.length} slab${returns.length > 1 ? 's' : ''} back from grading`, route: 'grade' });
  if (listings.length > 0) attention.push({ label: `${listings.length} auction${listings.length > 1 ? 's' : ''} live`, route: 'market' });
  if (sealed.length > 0) attention.push({ label: `${sealed.length} sealed item${sealed.length > 1 ? 's' : ''} to rip or hold`, route: 'wax' });

  const S = styles;
  const tiles: { key: string; title: string; sub: string }[] = [
    { key: 'wax', title: 'WAX', sub: 'Buy & rip sealed product' },
    { key: 'hunt', title: 'HUNT', sub: 'Dig lots & estate finds' },
    { key: 'binder', title: 'BOOK', sub: `${cards.length} card${cards.length === 1 ? '' : 's'} in the binder` },
    { key: 'grade', title: 'GRADE', sub: 'Slab the best pulls' },
    { key: 'market', title: 'SELL', sub: 'Comps, dealers & auctions' },
    { key: 'news', title: 'WIRE', sub: headline ? 'Fresh stories' : 'The hobby news feed' },
  ];

  return (
    <div style={S.root}>
      <div style={S.scroll}>
        <div style={S.kicker}>YOUR SHOP</div>
        <h1 style={S.title}>{shopName}</h1>
        <div style={S.statRow}>
          <div style={S.stat}>
            <div style={S.statLabel}>CASH</div>
            <div style={{ ...S.statValue, color: '#8ee08e' }}>{formatMoney(cash)}</div>
          </div>
          <div style={S.stat}>
            <div style={S.statLabel}>COLLECTION</div>
            <div style={S.statValue}>{formatMoney(collectionValue)}</div>
          </div>
          <div style={S.stat}>
            <div style={S.statLabel}>DAY</div>
            <div style={{ ...S.statValue, color: '#e8c86a' }}>{day}</div>
          </div>
        </div>

        {best && (
          <div style={S.crown}>
            <span style={{ opacity: 0.55 }}>Crown jewel:&nbsp;</span>
            <b>{world.displayName(best.card).player}</b>
            <span style={{ opacity: 0.55 }}>&nbsp;·&nbsp;{world.displayName(best.card).tier}&nbsp;·&nbsp;</span>
            <b style={{ color: '#8ee08e' }}>{formatMoney(best.value)}</b>
          </div>
        )}

        {attention.length > 0 && (
          <div style={S.section}>
            <div style={S.sectionTitle}>NEEDS ATTENTION</div>
            {attention.map(a => (
              <button key={a.label} style={S.attnRow} onClick={() => { sfx.tap(); go(a.route); }}>
                <span>{a.label}</span>
                <span style={{ color: '#e8c86a', fontWeight: 800 }}>GO ▸</span>
              </button>
            ))}
          </div>
        )}

        <div style={S.section}>
          <div style={S.sectionTitle}>THE SHOP FLOOR</div>
          <div style={S.grid}>
            {tiles.map(t => (
              <button key={t.key} style={S.tile} onClick={() => { sfx.tap(); go(t.key); }}>
                <div style={S.tileTitle}>{t.title}</div>
                <div style={S.tileSub}>{t.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {headline && (
          <button style={S.wire} onClick={() => { sfx.tap(); go('news'); }}>
            <div style={S.sectionTitle}>LATEST FROM THE WIRE</div>
            <div style={S.wireHead}>{headline.headline}</div>
            <div style={S.wireBody}>{headline.body.slice(0, 110)}…</div>
          </button>
        )}

        <button style={S.endDay} onClick={() => { sfx.tap(); endDay(); }}>
          END DAY {day} ▸
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { height: '100%', display: 'flex', flexDirection: 'column', background: 'radial-gradient(120% 70% at 50% 0%, #16161f 0%, #0c0c10 60%)' },
  scroll: { flex: 1, overflowY: 'auto', padding: '18px 16px 30px' },
  kicker: { fontSize: 10, letterSpacing: 4, color: '#d4a017', fontWeight: 800 },
  title: { fontSize: 26, fontWeight: 900, letterSpacing: -0.5, marginTop: 4, marginBottom: 14 },
  statRow: { display: 'flex', gap: 8 },
  stat: {
    flex: 1, background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 12, padding: '10px 12px',
  },
  statLabel: { fontSize: 9, letterSpacing: 1.5, opacity: 0.45 },
  statValue: { fontSize: 17, fontWeight: 900, marginTop: 3 },
  crown: {
    marginTop: 10, fontSize: 11, lineHeight: 1.5, padding: '9px 12px',
    background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.3)',
    borderRadius: 10,
  },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 10, letterSpacing: 2, opacity: 0.5, marginBottom: 8 },
  attnRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
    padding: '12px 13px', marginBottom: 7, fontSize: 12, color: '#f4f2ec',
    background: 'rgba(232,200,106,0.07)', border: '1px solid rgba(232,200,106,0.3)',
    borderRadius: 11, textAlign: 'left',
  },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  tile: {
    textAlign: 'left', background: 'rgba(255,255,255,0.045)', color: '#f4f2ec',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 13, padding: '14px 13px',
  },
  tileTitle: { fontSize: 14, fontWeight: 900, letterSpacing: 2, color: '#d4a017' },
  tileSub: { fontSize: 10, opacity: 0.55, marginTop: 4, lineHeight: 1.4 },
  wire: {
    display: 'block', width: '100%', textAlign: 'left', marginTop: 18,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 12, padding: 13, color: '#f4f2ec',
  },
  wireHead: { fontSize: 13, fontWeight: 800, lineHeight: 1.35 },
  wireBody: { fontSize: 11, opacity: 0.55, marginTop: 5, lineHeight: 1.5 },
  endDay: {
    width: '100%', marginTop: 20, background: 'rgba(255,255,255,0.07)', color: '#e8c86a',
    border: '1px solid rgba(232,200,106,0.4)', borderRadius: 12, padding: '14px 0',
    fontSize: 13, fontWeight: 900, letterSpacing: 2,
  },
};

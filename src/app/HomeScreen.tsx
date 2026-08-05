/**
 * HOME — the shop hub. The first thing the app opens to.
 *
 * Not a store shelf: a dashboard. Cash, day, collection value, what needs
 * attention (slabs back, live auctions, an unfinished rip), the latest
 * wire story, and big tap targets into each part of the loop.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { world } from '../state/world';
import { useCollection } from '../state/collection';
import { formatMoney } from '../engine/economy/valuation';
import { sfx } from './feel';

/** Cash that ROLLS when it changes — money should feel alive. */
function CashTicker({ value, color }: { value: number; color: string }) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current, to = value;
    prev.current = value;
    if (from === to) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / 600);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <div style={{ fontSize: 17, fontWeight: 900, marginTop: 3, color, fontVariantNumeric: 'tabular-nums' }}>
      {formatMoney(Math.round(shown))}
    </div>
  );
}

/** Morning flavor — the shop has a life of its own. */
const FLAVOR = [
  'The shop bell rings as you flip the sign to OPEN.',
  'Fresh coffee, fresh wax. The regulars are already outside.',
  'A courier drops a padded box by the till.',
  'Someone taped a want-list to the front window overnight.',
  'The display case could use a new crown jewel.',
  'Rumor is a grail changed hands across town.',
  'The mail truck slows down... then keeps going. Tomorrow.',
  'Two kids press their noses against the case.',
];

interface NightSummary {
  endedDay: number;
  earned: number;
  slabsBack: number;
  freshFinds: number;
  headline: string | null;
}

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

  const [night, setNight] = useState<NightSummary | null>(null);
  const [dawn, setDawn] = useState(false);
  const sleep = () => {
    sfx.tap();
    const before = useCollection.getState();
    const endedDay = before.day;
    const cashBefore = before.cash;
    const returnsBefore = before.returns.length;
    const findsBefore = before.marketFinds.length;
    endDay();
    const after = useCollection.getState();
    setNight({
      endedDay,
      earned: after.cash - cashBefore,
      slabsBack: after.returns.length - returnsBefore,
      freshFinds: Math.max(0, after.marketFinds.length - findsBefore),
      headline: after.news[0]?.headline ?? null,
    });
    setDawn(false);
    setTimeout(() => setDawn(true), 750);
  };

  const attention: { label: string; route: string }[] = [];
  if (ripSession) attention.push({ label: 'A rip is waiting — finish the reveal', route: 'wax' });
  if (returns.length > 0) attention.push({ label: `${returns.length} slab${returns.length > 1 ? 's' : ''} back from grading`, route: 'grade' });
  if (listings.length > 0) attention.push({ label: `${listings.length} auction${listings.length > 1 ? 's' : ''} live`, route: 'market' });
  if (sealed.length > 0) attention.push({ label: `${sealed.length} sealed item${sealed.length > 1 ? 's' : ''} to rip or hold`, route: 'wax' });

  const S = styles;
  const tiles: { key: string; title: string; sub: string }[] = [
    { key: 'wax', title: 'WAX', sub: 'Rip today\'s wax' },
    { key: 'hunt', title: 'HUNT', sub: 'Dig for buried treasure' },
    { key: 'binder', title: 'BOOK', sub: `${cards.length} card${cards.length === 1 ? '' : 's'} in the binder` },
    { key: 'grade', title: 'GRADE', sub: returns.length > 0 ? `${returns.length} slab${returns.length > 1 ? 's' : ''} to reveal!` : 'Bulk submit · reveal slabs' },
    { key: 'market', title: 'SELL', sub: 'Flip cards for profit' },
    { key: 'news', title: 'WIRE', sub: headline ? 'Fresh stories' : 'The hobby news feed' },
  ];

  return (
    <div style={S.root}>
      <div style={S.scroll}>
        <div style={S.awning} />
        <div style={S.kicker}>DAY {day} · DOORS OPEN</div>
        <h1 style={S.title}>{shopName}</h1>
        <div style={S.flavor}>{FLAVOR[day % FLAVOR.length]}</div>
        <div style={S.statRow}>
          <div style={S.stat}>
            <div style={S.statLabel}>CASH</div>
            <CashTicker value={cash} color="#8ee08e" />
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

        <button style={S.editorRow} onClick={() => { sfx.tap(); go('edit'); }}>
          EDITOR — names, realism import & save backup ▸
        </button>

        {headline && (
          <button style={S.wire} onClick={() => { sfx.tap(); go('news'); }}>
            <div style={S.sectionTitle}>LATEST FROM THE WIRE</div>
            <div style={S.wireHead}>{headline.headline}</div>
            <div style={S.wireBody}>{headline.body.slice(0, 110)}…</div>
          </button>
        )}

        <button style={S.endDay} onClick={sleep}>
          CLOSE UP SHOP · END DAY {day}
        </button>
      </div>

      {night && (
        <div style={S.night} onClick={() => dawn && setNight(null)}>
          <div style={{ ...S.nightSky, opacity: dawn ? 0 : 1 }} />
          <div style={{ ...S.nightInner, opacity: dawn ? 1 : 0 }}>
            <div style={S.nightKicker}>DAY {night.endedDay} · CLOSED</div>
            <div style={S.nightTitle}>While you slept…</div>
            <div style={S.nightRows}>
              <div style={S.nightRow}>
                <span>Overnight sales</span>
                <b style={{ color: night.earned > 0 ? '#8ee08e' : 'rgba(244,242,236,0.5)' }}>
                  {night.earned > 0 ? `+${formatMoney(night.earned)}` : '—'}
                </b>
              </div>
              <div style={S.nightRow}>
                <span>Slabs back from grading</span>
                <b style={{ color: night.slabsBack > 0 ? '#ffd75e' : 'rgba(244,242,236,0.5)' }}>
                  {night.slabsBack > 0 ? night.slabsBack : '—'}
                </b>
              </div>
              <div style={S.nightRow}>
                <span>Fresh cards on the market</span>
                <b>{night.freshFinds > 0 ? night.freshFinds : '—'}</b>
              </div>
            </div>
            {night.headline && (
              <div style={S.nightHeadline}>WIRE · {night.headline}</div>
            )}
            <button style={S.nightOpen} onClick={() => setNight(null)}>
              OPEN THE SHOP · DAY {night.endedDay + 1}
            </button>
          </div>
        </div>
      )}
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
  editorRow: {
    width: '100%', marginTop: 10, background: 'rgba(255,255,255,0.04)',
    color: 'rgba(244,242,236,0.65)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 11, padding: '12px 0', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
  },
  endDay: {
    width: '100%', marginTop: 20, background: 'rgba(90,70,160,0.22)', color: '#c9baf5',
    border: '1px solid rgba(150,130,220,0.45)', borderRadius: 12, padding: '15px 0',
    fontSize: 13, fontWeight: 900, letterSpacing: 1.5,
  },
  awning: {
    height: 10, borderRadius: 5, marginBottom: 12,
    background: 'repeating-linear-gradient(90deg, #d4a017 0 26px, #17263d 26px 52px)',
    boxShadow: '0 3px 8px rgba(0,0,0,0.4)',
  },
  flavor: { fontSize: 12, color: 'rgba(244,242,236,0.6)', fontStyle: 'italic', marginTop: 4, marginBottom: 12, lineHeight: 1.5 },
  night: {
    position: 'fixed', inset: 0, zIndex: 80, background: '#05060c',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  nightSky: {
    position: 'absolute', inset: 0, transition: 'opacity 900ms ease',
    background: 'linear-gradient(180deg, #2b1a4d 0%, #0c1030 55%, #05060c 100%)',
  },
  nightInner: {
    position: 'relative', width: '100%', maxWidth: 360, transition: 'opacity 500ms ease',
    background: 'rgba(16,18,30,0.96)', border: '1px solid rgba(150,130,220,0.35)',
    borderRadius: 18, padding: 22,
  },
  nightKicker: { fontSize: 10, letterSpacing: 3, color: '#c9baf5', fontWeight: 800 },
  nightTitle: { fontSize: 22, fontWeight: 900, marginTop: 6 },
  nightRows: { marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 },
  nightRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(244,242,236,0.8)' },
  nightHeadline: {
    marginTop: 14, fontSize: 11, lineHeight: 1.5, color: '#e8c86a',
    background: 'rgba(232,200,106,0.08)', border: '1px solid rgba(232,200,106,0.25)',
    borderRadius: 10, padding: 10,
  },
  nightOpen: {
    width: '100%', marginTop: 16, background: '#d4a017', color: '#1a1405', border: 'none',
    borderRadius: 12, padding: '14px 0', fontSize: 13, fontWeight: 900, letterSpacing: 1,
  },
};

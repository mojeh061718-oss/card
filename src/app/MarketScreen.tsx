/**
 * The market: comps, quick-sell, and auctions.
 *
 * You never see intrinsic value — you see recent sales. Rare cards have
 * almost no comps, which is exactly when an auction is a gamble worth
 * taking.
 */

import { useMemo, useState } from 'react';
import { useCollection, type CardInstance, type SaleRecord } from '../state/collection';
import { world } from '../state/world';
import { snapshotCard } from './cardview';
import { formatMoney } from '../engine/economy/valuation';
import { MARKETPLACE_FEE } from '../engine/economy/auction';
import { sfx, unlockAudio } from './feel';

export function MarketScreen() {
  const {
    cards, cash, day, listings, saleFeed,
    quickSell, listAtAuction, dismissSale, endDay,
  } = useCollection();
  const [selected, setSelected] = useState<CardInstance | null>(null);

  const listedUids = useMemo(() => new Set(listings.map(l => l.uid)), [listings]);
  const sellable = useMemo(
    () => cards
      .filter(c => !listedUids.has(c.uid))
      .map(c => ({ card: c, value: world.valuation(c, c.grade) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 60),
    [cards, listedUids],
  );
  const bookValue = useMemo(
    () => cards.reduce((sum, c) => sum + world.valuation(c, c.grade), 0),
    [cards],
  );

  const S = styles;
  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={S.title}>MARKET</div>
          <div style={S.day}>DAY {day}</div>
          <span style={{ flex: 1 }} />
          <button style={S.endDay} onClick={() => { unlockAudio(); endDay(); sfx.gavel(); }}>END DAY ▸</button>
        </div>
        <div style={S.moneyRow}>
          <div><span style={S.moneyLabel}>CASH</span> <span style={S.cash}>{formatMoney(cash)}</span></div>
          <div><span style={S.moneyLabel}>BOOK</span> <span style={S.book}>{formatMoney(bookValue)}</span></div>
          <div><span style={S.moneyLabel}>LISTED</span> <span style={S.book}>{listings.length}</span></div>
        </div>
      </header>

      <div style={S.scroll}>
        {saleFeed.length > 0 && (
          <section style={S.section}>
            <div style={S.sectionTitle}>RESULTS</div>
            {saleFeed.slice(0, 6).map(sale => (
              <SaleRow key={`${sale.uid}-${sale.day}`} sale={sale} onDismiss={() => dismissSale(sale.uid)} />
            ))}
          </section>
        )}

        {listings.length > 0 && (
          <section style={S.section}>
            <div style={S.sectionTitle}>LIVE AUCTIONS</div>
            {listings.map(l => {
              const card = cards.find(c => c.uid === l.uid);
              if (!card) return null;
              const info = world.displayName(card);
              return (
                <div key={l.uid} style={S.queueRow}>
                  <span style={{ fontWeight: 700 }}>{info.player}</span>
                  <span style={{ opacity: 0.55, fontSize: 10 }}>{info.tier}</span>
                  <span style={{ marginLeft: 'auto', color: '#e8c86a' }}>
                    ends in {l.endsDay - day}d · reserve {formatMoney(l.reserve)}
                  </span>
                </div>
              );
            })}
          </section>
        )}

        <section style={S.section}>
          <div style={S.sectionTitle}>YOUR INVENTORY — tap a card to price it</div>
          <div style={S.grid}>
            {sellable.map(({ card, value }) => (
              <button key={card.uid} style={S.cell} onClick={() => setSelected(card)}>
                <img src={snapshotCard(world.specFor(card), 180)} alt="" style={S.cellImg} />
                <div style={S.cellValue}>{formatMoney(value)}</div>
              </button>
            ))}
            {sellable.length === 0 && (
              <div style={S.empty}>Nothing to sell yet — rip some packs.</div>
            )}
          </div>
        </section>
      </div>

      {selected && (
        <PriceSheet
          card={selected}
          day={day}
          onClose={() => setSelected(null)}
          onQuickSell={() => { sfx.cash(); quickSell(selected.uid); setSelected(null); }}
          onList={(days, reserve) => { sfx.tap(); listAtAuction(selected.uid, days, reserve); setSelected(null); }}
        />
      )}
    </div>
  );
}

function SaleRow({ sale, onDismiss }: { sale: SaleRecord; onDismiss: () => void }) {
  const S = styles;
  const sold = sale.price > 0;
  const war = sale.auction?.biddingWar;
  return (
    <button style={{ ...S.saleRow, borderColor: sold ? 'rgba(142,224,142,0.35)' : 'rgba(255,255,255,0.12)' }}
      onClick={onDismiss}>
      <div style={{ textAlign: 'left', flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>
          {war && '🔥 '}{sale.player}
        </div>
        <div style={{ fontSize: 10, opacity: 0.55 }}>
          {sale.tier} · {sale.kind === 'dealer' ? 'dealer' : `auction · ${sale.auction?.bidderCount ?? 0} watching`}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        {sold ? (
          <>
            <div style={{ color: '#8ee08e', fontWeight: 800, fontSize: 13 }}>{formatMoney(sale.net)}</div>
            {sale.kind === 'auction' && (
              <div style={{ fontSize: 9, opacity: 0.5 }}>hammer {formatMoney(sale.price)}</div>
            )}
          </>
        ) : (
          <div style={{ color: '#e08a6a', fontSize: 11, fontWeight: 700 }}>NO SALE</div>
        )}
      </div>
    </button>
  );
}

function PriceSheet({ card, day, onClose, onQuickSell, onList }: {
  card: CardInstance; day: number; onClose: () => void;
  onQuickSell: () => void; onList: (days: number, reserve: number) => void;
}) {
  const info = world.displayName(card);
  const { comps, median, intrinsic } = useMemo(
    () => world.comps(card, day, card.grade), [card, day],
  );
  const dealerQuote = useMemo(() => {
    // Mirror the store's quick-sell math for an honest preview.
    const base = comps.length >= 3 ? 0.72 : comps.length >= 1 ? 0.64 : 0.55;
    return intrinsic * base;
  }, [comps.length, intrinsic]);
  const [days, setDays] = useState(5);
  const [reserve, setReserve] = useState(() => Math.round((median ?? intrinsic) * 0.5));

  const S = styles;
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.sheet} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 12 }}>
          <img src={snapshotCard(world.specFor(card), 220)} alt="" style={{ width: 92, borderRadius: 7 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{info.player}</div>
            <div style={{ fontSize: 11, color: '#e8c86a', fontWeight: 700 }}>{info.tier}</div>
            <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>{info.series}</div>
            <div style={{ fontSize: 10, opacity: 0.5 }}>{world.gradeLabel(card.grade)}</div>
          </div>
        </div>

        <div style={S.compBox}>
          <div style={S.sectionTitle}>RECENT SALES</div>
          {comps.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.55, padding: '6px 0', lineHeight: 1.5 }}>
              No comps. Nothing like this has traded — pricing is a guess, and
              an auction is the only way to find the market.
            </div>
          ) : (
            <>
              {comps.slice(0, 5).map((c, i) => (
                <div key={i} style={S.compRow}>
                  <span style={{ opacity: 0.55 }}>{c.venue}</span>
                  <span style={{ opacity: 0.4, fontSize: 10 }}>{c.daysAgo}d ago</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{formatMoney(c.price)}</span>
                </div>
              ))}
              <div style={{ ...S.compRow, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6, marginTop: 4 }}>
                <span style={{ opacity: 0.7, fontWeight: 700 }}>median</span>
                <span style={{ marginLeft: 'auto', fontWeight: 900, color: '#e8c86a' }}>
                  {formatMoney(median!)}
                </span>
              </div>
            </>
          )}
        </div>

        <button style={S.dealerBtn} onClick={onQuickSell}>
          QUICK-SELL TO DEALER · {formatMoney(dealerQuote)}
        </button>

        <div style={S.auctionBox}>
          <div style={S.sectionTitle}>OR RUN AN AUCTION</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {[3, 5, 7].map(d => (
              <button key={d} onClick={() => setDays(d)}
                style={{ ...S.chip, ...(days === d ? S.chipOn : {}) }}>
                {d} DAYS
              </button>
            ))}
          </div>
          <label style={{ fontSize: 10, opacity: 0.6, letterSpacing: 1 }}>
            RESERVE · {formatMoney(reserve)}
          </label>
          <input
            type="range" min={0} max={Math.round((median ?? intrinsic) * 2.5)}
            value={reserve} onChange={e => setReserve(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#d4a017', marginTop: 4 }}
          />
          <div style={{ fontSize: 10, opacity: 0.45, marginTop: 2 }}>
            High reserve protects you but risks no sale. Fee {Math.round(MARKETPLACE_FEE * 100)}%.
          </div>
          <button style={S.listBtn} onClick={() => onList(days, reserve)}>
            LIST AT AUCTION
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { height: '100%', display: 'flex', flexDirection: 'column', background: '#0c0c10' },
  header: { padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)' },
  title: { fontSize: 16, fontWeight: 800, letterSpacing: 4 },
  day: { fontSize: 11, color: '#e8c86a', letterSpacing: 2 },
  endDay: { background: 'rgba(255,255,255,0.08)', color: '#e8c86a', border: '1px solid rgba(232,200,106,0.4)', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 800, letterSpacing: 1 },
  moneyRow: { display: 'flex', gap: 18, marginTop: 8 },
  moneyLabel: { fontSize: 9, opacity: 0.45, letterSpacing: 1.5 },
  cash: { fontSize: 15, fontWeight: 900, color: '#8ee08e' },
  book: { fontSize: 15, fontWeight: 900, color: '#f4f2ec' },
  scroll: { flex: 1, overflowY: 'auto', padding: '12px 14px 30px' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 10, letterSpacing: 2, opacity: 0.5, marginBottom: 8 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  cell: { background: 'none', border: 'none', padding: 0 },
  cellImg: { width: '100%', borderRadius: 6, display: 'block' },
  cellValue: { fontSize: 10, fontWeight: 800, color: '#8ee08e', marginTop: 3 },
  empty: { opacity: 0.5, fontSize: 12, gridColumn: '1 / -1', padding: 20, textAlign: 'center' },
  queueRow: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, padding: '7px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, marginBottom: 6 },
  saleRow: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', marginBottom: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid', borderRadius: 8, color: '#f4f2ec' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,4,7,0.9)', zIndex: 50, display: 'flex', alignItems: 'flex-end' },
  sheet: { background: '#15151c', borderRadius: '18px 18px 0 0', padding: 18, width: '100%', maxHeight: '88%', overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,0.1)' },
  compBox: { marginTop: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10 },
  compRow: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, padding: '3px 0' },
  dealerBtn: { width: '100%', marginTop: 12, background: 'rgba(255,255,255,0.08)', color: '#f4f2ec', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '11px 0', fontSize: 12, fontWeight: 800, letterSpacing: 1 },
  auctionBox: { marginTop: 14, background: 'rgba(212,160,23,0.06)', border: '1px solid rgba(212,160,23,0.25)', borderRadius: 10, padding: 12 },
  chip: { background: 'rgba(255,255,255,0.06)', color: 'rgba(244,242,236,0.6)', border: 'none', borderRadius: 20, padding: '5px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 1 },
  chipOn: { background: '#d4a017', color: '#1a1405' },
  listBtn: { width: '100%', marginTop: 10, background: '#d4a017', color: '#1a1405', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 12, fontWeight: 900, letterSpacing: 1 },
};

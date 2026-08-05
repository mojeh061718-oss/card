/**
 * Sourcing — buy unsearched cardboard and dig through it.
 *
 * The dig is the whole point: you flip fast through a pile of junk, and
 * every so often something stops your hand. Cards are revealed one at a
 * time at speed, with the heat glow doing the same honest work it does in
 * a pack rip.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useCollection } from '../state/collection';
import { world } from '../state/world';
import { cachedSnapshot } from './cardview';
import { formatMoney } from '../engine/economy/valuation';
import type { LotOffer } from '../engine/economy/lots';
import type { PulledCard } from '../engine/cards/series';
import { sfx, unlockAudio, heatTier } from './feel';

const LOT_ICON: Record<string, string> = {
  shoebox: '👟', garageSale: '📦', estate: '🏚️', storageUnit: '🔐', dealerTable: '🎪',
};

export function SourcingScreen() {
  const { cash, day, addPulls, releaseBreaking, spendCash, endDay, dugLots, markLotDug } = useCollection();
  const offers = useMemo(() => world.lotOffers(day), [day]);
  const [digging, setDigging] = useState<{ offer: LotOffer; cards: PulledCard[] } | null>(null);

  const buy = (offer: LotOffer) => {
    unlockAudio();
    if (cash < offer.price || dugLots.includes(offer.id)) return;
    sfx.cash();
    spendCash(offer.price);
    const cards = world.digLot(offer);
    markLotDug(offer.id);
    // quiet: a grail in the pile must be found by the reel, not a banner.
    addPulls(cards, { quiet: true });
    setDigging({ offer, cards });
  };

  const closeDig = () => {
    setDigging(null);
    releaseBreaking();
  };

  const S = styles;
  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={S.title}>SOURCING</div>
          <div style={S.day}>DAY {day}</div>
          <span style={{ flex: 1 }} />
          <button style={S.endDay} onClick={endDay}>END DAY ▸</button>
        </div>
        <div style={{ marginTop: 8 }}>
          <span style={S.moneyLabel}>CASH</span> <span style={S.cash}>{formatMoney(cash)}</span>
        </div>
      </header>

      <div style={S.scroll}>
        <div style={S.sectionTitle}>TODAY'S LEADS — nobody knows what's inside, including the seller</div>
        {offers.map(offer => {
          const dug = dugLots.includes(offer.id);
          const affordable = cash >= offer.price;
          return (
            <button
              key={offer.id}
              style={{ ...S.lot, opacity: dug ? 0.35 : affordable ? 1 : 0.55 }}
              disabled={dug || !affordable}
              onClick={() => buy(offer)}
            >
              <div style={S.lotIcon}>{LOT_ICON[offer.kind]}</div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={S.lotLabel}>{offer.label}</div>
                <div style={S.lotBlurb}>"{offer.blurb}"</div>
                <div style={S.lotMeta}>
                  ~{offer.cardCount} cards · {world.get(offer.seriesId).def.name}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={S.lotPrice}>{formatMoney(offer.price)}</div>
                <div style={S.lotCta}>{dug ? 'BOUGHT' : affordable ? 'BUY & DIG' : 'TOO RICH'}</div>
              </div>
            </button>
          );
        })}
        <div style={S.tip}>
          Leads refresh each day. Most boxes have been picked over — the trick
          is spotting the one that hasn't.
        </div>
      </div>

      {digging && (
        <DigOverlay
          offer={digging.offer}
          cards={digging.cards}
          onClose={closeDig}
        />
      )}
    </div>
  );
}

/** Fast flip-through: hold to rip through the pile, hits pause the reel. */
function DigOverlay({ offer, cards, onClose }: {
  offer: LotOffer; cards: PulledCard[]; onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const [done, setDone] = useState(false);
  const holding = useRef(false);
  const rafRef = useRef(0);

  // Anything above this heat stops the reel and demands you look at it.
  const heats = useMemo(() => cards.map(c => world.heat(c)), [cards]);
  const keepers = useMemo(
    () => cards.map((c, i) => ({ c, i })).filter(({ i }) => heats[i] >= 2.2),
    [cards, heats],
  );

  useEffect(() => {
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (holding.current) {
        acc += dt;
        // ~14 cards/sec while held. Side effects live OUT here, not in a
        // setState updater React may replay.
        while (acc > 70) {
          acc -= 70;
          const i = idxRef.current;
          if (i >= cards.length - 1) { setDone(true); break; }
          const next = i + 1;
          // Stop the reel on anything worth a second look.
          if (heats[next] >= 4) {
            holding.current = false;
            sfx.hit(heatTier(heats[next]) as 1 | 2 | 3);
          } else {
            sfx.riffle();
          }
          idxRef.current = next;
          setIdx(next);
          if (!holding.current) break;
        }
      } else {
        acc = 0;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cards.length, heats]);

  const current = cards[idx];
  const heat = heats[idx] ?? 0;
  const glow = heat >= 11 ? '#ffd75e' : heat >= 7 ? '#d4a017' : heat >= 4 ? '#a06bff' : heat >= 2.2 ? '#4f9dde' : null;
  const url = useMemo(() => current ? cachedSnapshot(world.specFor(current), world.identityKey(current), 420) : null, [current]);

  const S = styles;
  if (done) {
    const value = cards.reduce((sum, c) => sum + world.valuation(c), 0);
    const profit = value - offer.price;
    return (
      <div style={S.overlay}>
        <div style={S.digDone}>
          <div style={{ fontSize: 12, letterSpacing: 3, opacity: 0.6 }}>DIG COMPLETE</div>
          <div style={{ fontSize: 34, fontWeight: 900, color: profit >= 0 ? '#8ee08e' : '#e08a6a' }}>
            {profit >= 0 ? '+' : ''}{formatMoney(profit)}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            {cards.length} cards worth {formatMoney(value)} · paid {formatMoney(offer.price)}
          </div>
          {offer.jackpot && (
            <div style={S.jackpot}>🏆 UNTOUCHED COLLECTION — the hits were still in there</div>
          )}
          {offer.pickedOver && (
            <div style={S.picked}>Somebody got here first. Pure filler.</div>
          )}
          {keepers.length > 0 && (
            <>
              <div style={{ ...S.sectionTitle, marginTop: 12 }}>WORTH KEEPING</div>
              <div style={S.keeperGrid}>
                {keepers.slice(0, 12).map(({ c, i }) => (
                  <div key={i}>
                    <img src={cachedSnapshot(world.specFor(c), world.identityKey(c), 200)} alt=""
                      style={{ width: '100%', borderRadius: 6 }} />
                    <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(142,224,142,0.9)', marginTop: 2 }}>
                      {formatMoney(world.valuation(c))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <button style={S.doneBtn} onClick={onClose}>ADD TO COLLECTION</button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={S.overlay}
      onPointerDown={() => { holding.current = true; }}
      onPointerUp={() => { holding.current = false; }}
      onPointerLeave={() => { holding.current = false; }}
    >
      <div style={S.digStage}>
        <div style={S.digCount}>{idx + 1} / {cards.length}</div>
        <div style={{ ...S.digCard, filter: glow ? `drop-shadow(0 0 24px ${glow})` : undefined }}>
          {url && <img src={url} alt="" style={{ width: 240, borderRadius: 10, display: 'block' }} />}
        </div>
        <div style={S.digHint}>
          {heat >= 4 ? '👀 hold on — look at this one' : 'hold anywhere to dig'}
        </div>
        <button style={S.skipBtn} onClick={() => { idxRef.current = cards.length - 1; setIdx(cards.length - 1); setDone(true); }}>
          SKIP TO RESULTS
        </button>
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
  moneyLabel: { fontSize: 9, opacity: 0.45, letterSpacing: 1.5 },
  cash: { fontSize: 15, fontWeight: 900, color: '#8ee08e' },
  scroll: { flex: 1, overflowY: 'auto', padding: '12px 14px 30px' },
  sectionTitle: { fontSize: 10, letterSpacing: 2, opacity: 0.5, marginBottom: 10, lineHeight: 1.5 },
  lot: { display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: 12, marginBottom: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, color: '#f4f2ec' },
  lotIcon: { fontSize: 30 },
  lotLabel: { fontSize: 14, fontWeight: 800 },
  lotBlurb: { fontSize: 11, opacity: 0.6, fontStyle: 'italic', margin: '2px 0' },
  lotMeta: { fontSize: 10, opacity: 0.4 },
  lotPrice: { fontSize: 16, fontWeight: 900, color: '#e8c86a' },
  lotCta: { fontSize: 9, opacity: 0.6, letterSpacing: 1, marginTop: 2 },
  tip: { fontSize: 11, opacity: 0.4, lineHeight: 1.6, marginTop: 14, textAlign: 'center' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,4,7,0.97)', zIndex: 55, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' },
  digStage: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 20 },
  digCount: { fontSize: 12, letterSpacing: 3, opacity: 0.6 },
  digCard: { transition: 'filter 160ms' },
  digHint: { fontSize: 12, opacity: 0.65, height: 18 },
  skipBtn: { background: 'rgba(255,255,255,0.08)', color: 'rgba(244,242,236,0.7)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 14px', fontSize: 10, letterSpacing: 1, fontWeight: 700 },
  digDone: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 24, maxHeight: '90%', overflowY: 'auto', textAlign: 'center' },
  jackpot: { marginTop: 8, color: '#ffd75e', fontSize: 12, fontWeight: 800, letterSpacing: 1 },
  picked: { marginTop: 8, color: '#e08a6a', fontSize: 11, opacity: 0.8 },
  keeperGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, width: '100%', maxWidth: 340 },
  doneBtn: { marginTop: 16, background: '#d4a017', color: '#1a1405', border: 'none', borderRadius: 10, padding: '11px 22px', fontSize: 12, fontWeight: 900, letterSpacing: 1 },
};

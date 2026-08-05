/**
 * Wax — buy sealed product, then rip it.
 *
 * Packs cost money, distributors ration hot product, and boxes carry real
 * per-box guarantees, so "one box" and "twelve packs" are genuinely
 * different bets. Sealed wax also appreciates as the population gets
 * opened, which makes sitting on a case a strategy instead of a delay.
 */

import { useMemo, useRef, useState } from 'react';
import { renderPackWrapper, renderCardBack } from '../render/pack';
import { snapshotCard, cachedSnapshot, LiveCard } from './cardview';
import { world } from '../state/world';
import { useCollection, type SealedItem, type RipSessionState } from '../state/collection';
import { formatMoney } from '../engine/economy/valuation';
import { sfx, unlockAudio, heatTier } from './feel';

/**
 * Real product art on the shelf — the same procedural wrapper the rip
 * ceremony uses, at thumbnail size, instead of an emoji placeholder.
 * Cached per (series, product); the key carries `namesRevision` because the
 * wrapper bakes in brand names (HANDOFF §6.1 — renames must invalidate).
 */
const wrapThumbCache = new Map<string, string>();

function ProductArt({ seriesId, productKey }: { seriesId: string; productKey: string }) {
  const rev = world.namesRevision;
  const url = useMemo(() => {
    const key = `${seriesId}:${rev}`;
    let u = wrapThumbCache.get(key);
    if (!u) {
      if (wrapThumbCache.size > 24) wrapThumbCache.clear();
      u = renderPackWrapper(world.get(seriesId).def, 96, 136).toDataURL();
      wrapThumbCache.set(key, u);
    }
    return u;
  }, [seriesId, rev]);
  const stack = productKey === 'case' ? 3 : productKey === 'hobbyBox' ? 2 : 1;
  return (
    <div style={{ position: 'relative', width: 38, height: 54, flexShrink: 0 }}>
      {Array.from({ length: stack }, (_, i) => {
        const k = stack - 1 - i; // back to front
        return (
          <img
            key={i} src={url} alt=""
            style={{
              position: 'absolute',
              left: -k * 4, top: -k * 3,
              width: 38, height: 54,
              borderRadius: 4,
              boxShadow: '0 3px 10px rgba(0,0,0,0.55)',
              filter: k > 0 ? `brightness(${1 - k * 0.25})` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

export function WaxScreen() {
  const {
    cash, day, sealed, bought, buyWax, openSealed, addPulls,
    releaseBreaking, endDay, ripSession, beginRip, endRip,
  } = useCollection();

  // supplyRevision: ripping moves scarcity-lifted prices, so the shelf must
  // reprice after a break, not just at the day tick.
  const supplyRev = world.supplyRevision;
  const shelf = useMemo(() => world.shelfSeries(day).flatMap(seriesId =>
    world.products.map(p => {
      const price = world.waxPrice(seriesId, p.key, day);
      const limit = world.allocation(seriesId, p.key, day);
      const used = bought[`${p.key}:${seriesId}:${day}`] ?? 0;
      return { seriesId, product: p, price, limit, used };
    })), [day, bought, supplyRev]);

  const upcoming = useMemo(() => world.upcomingReleases(day, 14), [day]);

  const buy = (seriesId: string, productKey: string, price: number) => {
    unlockAudio();
    const item = buyWax(seriesId, productKey, price);
    if (item) sfx.cash();
  };

  const rip = (item: SealedItem) => {
    unlockAudio();
    const packs = world.openProduct(item.seriesId, item.productKey);
    openSealed(item.id);
    // quiet: the breaking banner must not name the hit before the flip.
    addPulls(packs.flat(), { quiet: true });
    // Persisted: closing the app mid-box resumes the reveal on next boot.
    beginRip({
      seriesId: item.seriesId, productKey: item.productKey,
      pricePaid: item.pricePaid, packs,
    });
  };

  const closeSession = () => {
    endRip();
    releaseBreaking();
  };

  const S = styles;
  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={S.title}>WAX</div>
          <div style={S.day}>DAY {day}</div>
          <span style={{ flex: 1 }} />
          <button style={S.endDay} onClick={() => { endDay(); sfx.tap(); }}>END DAY ▸</button>
        </div>
        <div style={{ marginTop: 8 }}>
          <span style={S.moneyLabel}>CASH</span> <span style={S.cash}>{formatMoney(cash)}</span>
        </div>
      </header>

      <div style={S.scroll}>
        {sealed.length > 0 && (
          <section style={S.section}>
            <div style={S.sectionTitle}>YOUR SEALED WAX — tap to rip, or hold and let it appreciate</div>
            {sealed.map(item => {
              const p = world.product(item.productKey);
              const now = world.waxPrice(item.seriesId, item.productKey, day);
              const delta = now - item.pricePaid;
              return (
                <button key={item.id} style={S.sealedRow} onClick={() => rip(item)}>
                  <ProductArt seriesId={item.seriesId} productKey={item.productKey} />
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={S.sealedName}>{p.name}</div>
                    <div style={S.sealedMeta}>{world.get(item.seriesId).def.name}</div>
                    <div style={S.sealedMeta}>
                      bought day {item.boughtDay} for {formatMoney(item.pricePaid)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...S.sealedValue, color: delta >= 0 ? '#8ee08e' : '#e08a6a' }}>
                      {delta >= 0 ? '+' : ''}{formatMoney(delta)}
                    </div>
                    <div style={S.ripCta}>RIP IT ▸</div>
                  </div>
                </button>
              );
            })}
          </section>
        )}

        <section style={S.section}>
          <div style={S.sectionTitle}>THE SHELF — distributors ration the good stuff</div>
          {shelf.map(({ seriesId, product, price, limit, used }) => {
            const soldOut = used >= limit;
            const affordable = cash >= price;
            const def = world.get(seriesId).def;
            return (
              <button
                key={`${seriesId}-${product.key}`}
                style={{ ...S.shelfRow, opacity: soldOut ? 0.35 : affordable ? 1 : 0.55 }}
                disabled={soldOut || !affordable}
                onClick={() => buy(seriesId, product.key, price)}
              >
                <ProductArt seriesId={seriesId} productKey={product.key} />
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={S.shelfName}>{product.name}</div>
                  <div style={S.shelfMeta}>{def.name}</div>
                  <div style={S.shelfOdds}>
                    {product.packs > 1
                      ? `${product.packs} packs · guaranteed ${product.guaranteedAutos} auto${product.guaranteedAutos > 1 ? 's' : ''} + ${product.guaranteedNumbered} numbered`
                      : `${product.cardsPerPack} cards · no guarantees`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={S.shelfPrice}>{formatMoney(price)}</div>
                  <div style={S.shelfStock}>
                    {soldOut ? 'ALLOCATED OUT' : `${limit - used} left today`}
                  </div>
                </div>
              </button>
            );
          })}
        </section>

        {upcoming.length > 0 && (
          <section style={S.section}>
            <div style={S.sectionTitle}>COMING SOON — mark the calendar</div>
            {upcoming.map(r => (
              <div key={`up-${r.index}`} style={{ ...S.shelfRow, opacity: 0.6 }}>
                <div style={{
                  width: 38, height: 54, flexShrink: 0, borderRadius: 4,
                  border: '1px dashed rgba(232,200,106,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: '#e8c86a', fontWeight: 800,
                }}>
                  D{r.releaseDay}
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={S.shelfName}>{r.year} {r.brand} {r.line}</div>
                  <div style={S.shelfMeta}>{r.sport} · new checklist, new rainbow</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...S.shelfStock, color: '#e8c86a' }}>
                    DROPS IN {r.releaseDay - day} DAY{r.releaseDay - day > 1 ? 'S' : ''}
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {sealed.length === 0 && (
          <div style={S.tip}>
            Buy a pack to get started. A box costs more than its packs but
            guarantees hits — that's the whole decision.
          </div>
        )}
      </div>

      {ripSession && (
        <RipSession
          session={ripSession}
          onClose={closeSession}
        />
      )}
    </div>
  );
}

type Phase = 'sealed' | 'stack' | 'takeover' | 'done';

/** Rip one product: tear each pack, flip each card, then the tally. */
function RipSession({ session, onClose }: {
  session: RipSessionState; onClose: () => void;
}) {
  const packs = session.packs;
  const rt = useMemo(() => world.get(session.seriesId), [session]);
  const product = world.product(session.productKey);
  const wrapperUrl = useMemo(() => renderPackWrapper(rt.def, 640, 900).toDataURL(), [rt]);
  const backUrl = useMemo(() => renderCardBack(rt.def, 500).toDataURL(), [rt]);

  const [packIdx, setPackIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('sealed');
  const [tear, setTear] = useState(0);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stillUrl, setStillUrl] = useState<string | null>(null);
  const tearing = useRef(false);

  const cards = packs[packIdx] ?? [];
  const current = idx < cards.length ? cards[idx] : null;
  const heat = current ? world.heat(current) : 0;
  const tier = heatTier(heat);
  const glow = tier === 3 ? '#ffd75e' : tier === 2 ? '#d4a017' : tier === 1 ? '#a06bff'
    : heat >= 2.2 ? '#4f9dde' : null;
  const isOne = current?.numberedTo === 1;

  const tearRef = useRef(0);
  const onTearMove = (e: React.PointerEvent) => {
    if (!tearing.current) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    // Side effects (sfx) stay OUT of the setState updater — React may run
    // updaters more than once.
    const next = Math.max(tearRef.current, p);
    if (Math.floor(next * 12) > Math.floor(tearRef.current * 12)) sfx.tear();
    tearRef.current = next;
    setTear(next);
    if (p > 0.92) {
      tearing.current = false;
      setTimeout(() => { setPhase('stack'); setIdx(0); setFlipped(false); }, 380);
    }
  };

  const reveal = () => {
    if (!current || flipped) return;
    if (tier > 0) sfx.riser(tier as 1 | 2 | 3);
    setStillUrl(snapshotCard(world.specFor(current), 640));
    setFlipped(true);
    setTimeout(() => (tier > 0 ? sfx.hit(tier as 1 | 2 | 3) : sfx.flip()), tier > 0 ? 260 : 0);
  };

  const nextCard = () => {
    if (!flipped) return;
    if (isOne) { setPhase('takeover'); return; }
    advance();
  };

  const advance = () => {
    sfx.cardSlide();
    setFlipped(false);
    setStillUrl(null);
    if (idx + 1 < cards.length) { setIdx(idx + 1); return; }
    // Pack finished — next pack, or the box tally.
    if (packIdx + 1 < packs.length) {
      setPackIdx(packIdx + 1);
      tearRef.current = 0;
      setTear(0);
      setPhase('sealed');
    } else {
      setPhase('done');
    }
  };

  /** Skip the ceremony: jump straight to the tally. */
  const ripAll = () => {
    sfx.gavel();
    setPhase('done');
  };

  const all = packs.flat();
  const best = useMemo(
    () => [...all].sort((a, b) => world.heat(b) - world.heat(a)).slice(0, 12),
    [all],
  );
  const totalValue = useMemo(
    () => all.reduce((sum, c) => sum + world.valuation(c), 0),
    [all],
  );

  const S = styles;
  return (
    <div style={S.overlay}>
      {phase === 'sealed' && (
        <div style={S.center}>
          {packs.length > 1 && (
            <div style={S.packCounter}>PACK {packIdx + 1} OF {packs.length}</div>
          )}
          <div
            style={S.packWrap}
            onPointerDown={() => { tearing.current = true; }}
            onPointerMove={onTearMove}
            onPointerUp={() => { tearing.current = false; }}
          >
            <div style={{
              ...S.tearStrip,
              backgroundImage: `url(${wrapperUrl})`,
              transform: `translate(${tear * 130}%, ${-tear * 30}%) rotate(${tear * 18}deg)`,
              opacity: tear > 0.92 ? 0 : 1,
            }} />
            <div style={{
              ...S.packBody,
              backgroundImage: `url(${wrapperUrl})`,
              clipPath: tear > 0
                ? `polygon(0 ${13 + Math.sin(tear * 20) * 1.2}%, 8% 12%, 20% 14%, 33% 11.5%, 47% 14%, 60% 12%, 74% 14.5%, 88% 12%, 100% 13.5%, 100% 100%, 0 100%)`
                : 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
            }} />
            {tear === 0 && <div style={S.tearHint}>drag across the top to rip ⟶</div>}
          </div>
          <div style={S.caption}>{rt.def.name} — {product.name}</div>
          {packs.length > 1 && (
            <button style={S.skip} onClick={ripAll}>SKIP TO RESULTS</button>
          )}
        </div>
      )}

      {phase === 'stack' && current && (
        <div style={S.center} onClick={flipped ? nextCard : reveal}>
          <div style={S.counter}>
            {packs.length > 1 && `PACK ${packIdx + 1}/${packs.length} · `}
            {idx + 1} / {cards.length}
          </div>
          <div style={{ ...S.flipScene, filter: glow && !flipped ? `drop-shadow(0 0 26px ${glow})` : undefined }}>
            <div style={{ ...S.flipInner, transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
              <img src={backUrl} alt="card back" style={{ ...S.face, backfaceVisibility: 'hidden' }} />
              {stillUrl && (
                <img src={stillUrl} alt="card" style={{
                  ...S.face, position: 'absolute', inset: 0,
                  transform: 'rotateY(180deg)', backfaceVisibility: 'hidden',
                }} />
              )}
            </div>
          </div>
          {flipped ? (
            // The number is the payoff — say it the moment the card lands.
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 17, fontWeight: 900,
                color: glow ?? (world.valuation(current) >= 20 ? '#8ee08e' : 'rgba(244,242,236,0.75)'),
              }}>
                {formatMoney(world.valuation(current))}
              </div>
              <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
                {world.displayName(current).tier}
              </div>
              <div style={{ ...S.caption, marginTop: 6 }}>tap for next card</div>
            </div>
          ) : (
            <div style={S.caption}>tap to flip</div>
          )}
        </div>
      )}

      {phase === 'takeover' && current && (
        <div style={S.takeover} onClick={() => { setPhase('stack'); advance(); }}>
          <div style={S.oneBanner}>ONE OF ONE</div>
          <LiveCard spec={world.specFor(current)} width={300} />
          <div style={S.oneSub}>{rt.def.name} · Superfractor · #{current.serial}/1</div>
          <div style={{ ...S.caption, color: '#ffd75e' }}>tap to continue</div>
        </div>
      )}

      {phase === 'done' && (
        <div style={S.doneStage}>
          <div style={S.counter}>{product.name.toUpperCase()} COMPLETE</div>
          {/* Lead with the HIT — real breakers talk about the pull, not the
              invoice. The honest net still prints, in its place: last. */}
          {best[0] && (
            <>
              <div style={{ ...S.sectionTitle, marginTop: 8 }}>THE HEADLINER</div>
              <img
                src={cachedSnapshot(world.specFor(best[0]), world.identityKey(best[0]), 420)}
                alt=""
                style={{ width: 172, borderRadius: 10, boxShadow: '0 16px 44px rgba(0,0,0,0.6)' }}
              />
              <div style={{ fontSize: 15, fontWeight: 900, marginTop: 4 }}>
                {world.displayName(best[0]).player}
              </div>
              <div style={{ fontSize: 10, color: '#e8c86a', fontWeight: 700 }}>
                {world.displayName(best[0]).tier}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#8ee08e' }}>
                {formatMoney(world.valuation(best[0]))}
              </div>
            </>
          )}
          {best.length > 1 && (
            <>
              <div style={{ ...S.sectionTitle, marginTop: 12 }}>REST OF THE BREAK</div>
              <div style={S.grid}>
                {best.slice(1).map((p, i) => (
                  <div key={i}>
                    <img src={cachedSnapshot(world.specFor(p), world.identityKey(p), 220)} alt=""
                      style={{ width: '100%', borderRadius: 7 }} />
                    <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(142,224,142,0.9)', marginTop: 2 }}>
                      {formatMoney(world.valuation(p))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 12 }}>
            {all.length} cards worth {formatMoney(totalValue)} · paid {formatMoney(session.pricePaid)} ·{' '}
            <span style={{ color: totalValue >= session.pricePaid ? '#8ee08e' : '#e08a6a', fontWeight: 800 }}>
              {totalValue >= session.pricePaid ? '+' : ''}{formatMoney(totalValue - session.pricePaid)}
            </span>
          </div>
          <button style={S.button} onClick={onClose}>ADD TO COLLECTION</button>
        </div>
      )}
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
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 10, letterSpacing: 2, opacity: 0.5, marginBottom: 8, lineHeight: 1.5 },
  sealedRow: { display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: 12, marginBottom: 8, background: 'rgba(212,160,23,0.07)', border: '1px solid rgba(212,160,23,0.3)', borderRadius: 12, color: '#f4f2ec' },
  sealedName: { fontSize: 14, fontWeight: 800 },
  sealedMeta: { fontSize: 10, opacity: 0.5, marginTop: 1 },
  sealedValue: { fontSize: 13, fontWeight: 900 },
  ripCta: { fontSize: 9, letterSpacing: 1, color: '#e8c86a', fontWeight: 800, marginTop: 2 },
  shelfRow: { display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: 11, marginBottom: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, color: '#f4f2ec' },
  shelfName: { fontSize: 13, fontWeight: 800 },
  shelfMeta: { fontSize: 10, opacity: 0.5 },
  shelfOdds: { fontSize: 9, opacity: 0.4, marginTop: 2 },
  shelfPrice: { fontSize: 15, fontWeight: 900, color: '#e8c86a' },
  shelfStock: { fontSize: 9, opacity: 0.45, marginTop: 2 },
  tip: { fontSize: 11, opacity: 0.4, lineHeight: 1.6, textAlign: 'center', padding: '0 20px' },
  overlay: { position: 'fixed', inset: 0, zIndex: 55, background: 'radial-gradient(120% 90% at 50% 0%, #16161f 0%, #0a0a0d 70%)', display: 'flex', flexDirection: 'column' },
  center: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16 },
  packCounter: { fontSize: 11, letterSpacing: 3, color: '#e8c86a' },
  packWrap: { position: 'relative', width: 250, height: 352, touchAction: 'none' },
  packBody: { position: 'absolute', inset: 0, backgroundSize: 'cover', borderRadius: 8, transition: 'clip-path 80ms linear', boxShadow: '0 24px 60px rgba(0,0,0,0.65)' },
  tearStrip: { position: 'absolute', left: 0, right: 0, top: 0, height: '13%', backgroundSize: 'cover', borderRadius: '8px 8px 0 0', transition: 'transform 120ms linear, opacity 200ms', zIndex: 2 },
  tearHint: { position: 'absolute', top: '15%', width: '100%', textAlign: 'center', fontSize: 12, letterSpacing: 1, color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 4px #000' },
  caption: { fontSize: 13, opacity: 0.6, letterSpacing: 1 },
  counter: { fontSize: 12, letterSpacing: 3, opacity: 0.7 },
  skip: { background: 'rgba(255,255,255,0.08)', color: 'rgba(244,242,236,0.7)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 14px', fontSize: 10, letterSpacing: 1, fontWeight: 700 },
  flipScene: { perspective: '1200px', width: 260, transition: 'filter 300ms' },
  flipInner: { position: 'relative', width: '100%', transformStyle: 'preserve-3d', transition: 'transform 520ms cubic-bezier(0.2, 0.8, 0.25, 1)' },
  face: { width: '100%', borderRadius: 12, display: 'block', boxShadow: '0 18px 50px rgba(0,0,0,0.6)' },
  takeover: { position: 'fixed', inset: 0, background: '#050507', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 60 },
  oneBanner: { fontSize: 26, fontWeight: 900, letterSpacing: 10, color: '#ffd75e', textShadow: '0 0 30px rgba(255, 215, 94, 0.5)' },
  oneSub: { fontSize: 13, opacity: 0.75, letterSpacing: 1 },
  doneStage: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 24, overflowY: 'auto', textAlign: 'center' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, width: '100%', maxWidth: 360 },
  button: { marginTop: 18, background: '#d4a017', color: '#1a1405', border: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 13, fontWeight: 900, letterSpacing: 1 },
};

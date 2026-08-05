/**
 * Wax — buy sealed product, then rip it.
 *
 * Packs cost money, distributors ration hot product, and boxes carry real
 * per-box guarantees, so "one box" and "twelve packs" are genuinely
 * different bets. Sealed wax also appreciates as the population gets
 * opened, which makes sitting on a case a strategy instead of a delay.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { renderPackWrapper, renderCardBack } from '../render/pack';
import { renderBreakTable } from '../render/table';
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
  const stack = productKey === 'case' ? 3
    : (productKey === 'hobbyBox' || productKey === 'tcg-box') ? 2 : 1;
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
    releaseBreaking, endDay, ripSession, beginRip, endRip, tcgEnabled,
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

  // The vintage case — TCG boosters and boxes, once the realism import (or
  // dev flag) has unlocked them. Vintage allocation is brutally thin: some
  // days the case simply has nothing, which is the point.
  const vintage = useMemo(() => (tcgEnabled
    ? world.tcgShelf(day).map(row => ({
      ...row,
      used: bought[`${row.productKey}:${row.seriesId}:${day}`] ?? 0,
    }))
    : []), [tcgEnabled, day, bought, supplyRev]);

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

        {vintage.length > 0 && (
          <section style={S.section}>
            <div style={{ ...S.sectionTitle, color: '#8ee08e', opacity: 0.85 }}>
              THE VINTAGE CASE — sealed TCG product, priced like the real market
            </div>
            {vintage.map(({ seriesId, productKey, price, left, blurb, used }) => {
              const soldOut = used >= left;
              const affordable = cash >= price;
              return (
                <button
                  key={`${seriesId}-${productKey}`}
                  style={{
                    ...S.shelfRow,
                    border: '1px solid rgba(142,224,142,0.28)',
                    background: 'rgba(142,224,142,0.05)',
                    opacity: soldOut ? 0.35 : affordable ? 1 : 0.55,
                  }}
                  disabled={soldOut || !affordable}
                  onClick={() => buy(seriesId, productKey, price)}
                >
                  <ProductArt seriesId={seriesId} productKey={productKey} />
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={S.shelfName}>{world.product(productKey).name}</div>
                    <div style={S.shelfMeta}>{world.get(seriesId).def.name}</div>
                    <div style={S.shelfOdds}>{blurb}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={S.shelfPrice}>{formatMoney(price)}</div>
                    <div style={S.shelfStock}>
                      {soldOut ? (left === 0 ? 'NONE SURFACED TODAY' : 'GONE') : `${left - used} available`}
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
        )}

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

type Phase = 'table' | 'sealed' | 'stack' | 'takeover' | 'done';

/** One-shot gold confetti burst for monster pulls — pure canvas, ~1s. */
function ConfettiBurst({ trigger }: { trigger: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!trigger) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width = canvas.offsetWidth * 2;
    const H = canvas.height = canvas.offsetHeight * 2;
    const colors = ['#ffd75e', '#d4a017', '#ffffff', '#8ee08e', '#a06bff'];
    const parts = Array.from({ length: 90 }, (_, i) => ({
      x: W / 2, y: H * 0.45,
      vx: Math.cos((i / 90) * Math.PI * 2) * (3 + (i % 7)) * 2.2,
      vy: Math.sin((i / 90) * Math.PI * 2) * (3 + (i % 5)) * 2.2 - 5,
      r: 3 + (i % 4) * 2, c: colors[i % colors.length], a: 1, spin: (i % 9) / 3,
    }));
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.32; p.a = Math.max(0, 1 - t / 1.1);
        ctx.save();
        ctx.globalAlpha = p.a;
        ctx.translate(p.x, p.y);
        ctx.rotate(t * p.spin * 6);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx.restore();
      }
      if (t < 1.15) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [trigger]);
  return (
    <canvas ref={ref} style={{
      position: 'absolute', inset: '-15%', width: '130%', height: '130%',
      pointerEvents: 'none', zIndex: 3,
    }} />
  );
}

// The reveal stage card: as big as the viewport allows, and its still is
// rendered at device pixels so it's crisp on a 3x display (the shared
// scratch GL is 1536px wide — headroom without ever resizing a canvas).
const REVEAL_W = Math.min(342, (typeof window !== 'undefined' ? window.innerWidth : 402) - 56);
const REVEAL_STILL_PX = Math.min(1152, Math.round(
  REVEAL_W * (typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 2) : 2),
));

/** Rip one product: tear each pack, flip each card, then the tally. */
function RipSession({ session, onClose }: {
  session: RipSessionState; onClose: () => void;
}) {
  const packs = session.packs;
  const rt = useMemo(() => world.get(session.seriesId), [session]);
  const product = world.product(session.productKey);
  const backUrl = useMemo(() => renderCardBack(rt.def, 500).toDataURL(), [rt]);

  const [packIdx, setPackIdx] = useState(0);
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [grabbed, setGrabbed] = useState<number | null>(null);

  // The break table: a top-down desk the packs physically sit on.
  const tableUrl = useMemo(() => {
    const w = Math.min(1000, window.innerWidth * 2);
    const h = Math.round(w * ((window.innerHeight - 100) / window.innerWidth));
    return renderBreakTable(w, h, session.seriesId).toDataURL();
  }, [session.seriesId]);
  // One wrapper thumb per pack (TCG wraps rotate their featured art).
  const packThumbs = useMemo(
    () => packs.map((_, i) => renderPackWrapper(rt.def, 128, 180, i).toDataURL()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rt, packs.length, world.namesRevision],
  );
  // Deterministic scatter: grid with jitter and a lazy rotation, like packs
  // tossed on the mat rather than machine-aligned.
  const layout = useMemo(() => {
    const n = packs.length;
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 12 ? 3 : 6;
    const rows = Math.ceil(n / cols);
    return packs.map((_, i) => {
      const cx = (i % cols + 0.5) / cols;
      const cy = (Math.floor(i / cols) + 0.5) / rows;
      const j1 = Math.sin(i * 12.9898) * 0.5;
      const j2 = Math.sin(i * 78.233) * 0.5;
      return {
        left: 8 + cx * 84 + j1 * (cols > 1 ? 3 : 0),
        top: 20 + cy * 56 + j2 * (rows > 1 ? 2.5 : 0),
        rot: j1 * 14,
        w: n <= 1 ? 46 : n <= 4 ? 34 : n <= 12 ? 26 : 14.5,
      };
    });
  }, [packs.length]);

  const grabPack = (i: number) => {
    if (opened.has(i) || grabbed !== null) return;
    unlockAudio();
    sfx.cardSlide();
    setPackIdx(i);
    setIdx(0);
    setFlipped(false);
    setStillUrl(null);
    tearRef.current = 0;
    setTear(0);
    setGrabbed(i);
    setTimeout(() => { setGrabbed(null); setPhase('sealed'); }, 420);
  };
  // TCG wraps rotate their featured art per pack in a box.
  const wrapperUrl = useMemo(
    () => renderPackWrapper(rt.def, 640, 900, packIdx).toDataURL(),
    [rt, packIdx],
  );
  const [phase, setPhase] = useState<Phase>('table');
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
    // updaters more than once. Renders are quantized to 1/40 steps: the
    // clip-path repaint is the most expensive thing on this screen and a
    // 120Hz pointer stream would otherwise render every wiggle.
    const next = Math.max(tearRef.current, p);
    if (Math.floor(next * 12) > Math.floor(tearRef.current * 12)) sfx.tear();
    const stepped = Math.floor(next * 40) !== Math.floor(tearRef.current * 40);
    tearRef.current = next;
    if (stepped || next > 0.92) setTear(next);
    if (p > 0.92) {
      tearing.current = false;
      setTimeout(() => { setPhase('stack'); setIdx(0); setFlipped(false); }, 380);
      // First card flips itself — the tear is the only wind-up.
      setTimeout(() => revealAt(0), 700);
    }
  };

  // One gesture per card: tap OR swipe advances, and the next card flips
  // itself. The card FOLLOWS the finger during the drag (direct DOM
  // transform, no per-move React render — ProMotion needs the full 120Hz),
  // then flicks away with momentum or springs back.
  // Two-stage reveal: flip INSTANTLY on a fast still, then swap in the
  // device-pixel render once the card has been on screen long enough to be
  // looked at. Rapid swiping never pays the hi-res cost (motion hides the
  // softness); pausing on a card gets it crisp.
  const revealSeq = useRef(0);
  const [burst, setBurst] = useState(0);
  const revealAt = (i: number) => {
    const c = cards[i];
    if (!c) return;
    const t = heatTier(world.heat(c));
    if (t > 0) sfx.riser(t as 1 | 2 | 3);
    setStillUrl(snapshotCard(world.specFor(c), 520));
    setFlipped(true);
    if (t >= 3) setTimeout(() => setBurst(b => b + 1), 300);
    setTimeout(() => (t > 0 ? sfx.hit(t as 1 | 2 | 3) : sfx.flip()), t > 0 ? 180 : 0);
    const seq = ++revealSeq.current;
    setTimeout(() => {
      if (revealSeq.current !== seq) return; // already moved on
      const url = snapshotCard(world.specFor(c), REVEAL_STILL_PX);
      if (url && revealSeq.current === seq) setStillUrl(url);
    }, 950);
  };

  const reveal = () => { if (current && !flipped) revealAt(idx); };

  const advance = () => {
    revealSeq.current++; // cancel any pending hi-res upgrade
    sfx.cardSlide();
    setFlipped(false);
    setStillUrl(null);
    if (idx + 1 < cards.length) {
      setIdx(idx + 1);
      // Auto-reveal the incoming card after the slide beat.
      setTimeout(() => revealAt(idx + 1), 150);
      return;
    }
    // Pack finished — back to the table for the next grab, or the tally.
    const nowOpened = new Set(opened);
    nowOpened.add(packIdx);
    setOpened(nowOpened);
    tearRef.current = 0;
    setTear(0);
    if (nowOpened.size >= packs.length) setPhase('done');
    else setPhase('table');
  };

  const dragEl = useRef<HTMLDivElement>(null);
  const drag = useRef({ x0: 0, t0: 0, dx: 0, active: false });
  const animating = useRef(false);

  /** Fly the card off screen with momentum, then bring in the next one. */
  const flyOut = (dir: number) => {
    const el = dragEl.current;
    animating.current = true;
    if (el) {
      el.style.transition = 'transform 220ms cubic-bezier(0.3, 0.6, 0.4, 1), opacity 220ms linear';
      el.style.transform = `translateX(${dir * (window.innerWidth + 220)}px) rotate(${dir * 24}deg)`;
      el.style.opacity = '0';
    }
    setTimeout(() => {
      advance();
      if (el) {
        el.style.transition = 'none';
        el.style.transform = '';
        el.style.opacity = '1';
      }
      animating.current = false;
    }, 200);
  };

  const gestureAdvance = (dir: number) => {
    if (!flipped) {
      reveal();
      return;
    }
    if (isOne) { setPhase('takeover'); return; }
    flyOut(dir);
  };

  const onStagePointerDown = (e: React.PointerEvent) => {
    if (animating.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x0: e.clientX, t0: performance.now(), dx: 0, active: true };
    if (dragEl.current) dragEl.current.style.transition = 'none';
  };
  const onStagePointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active || animating.current) return;
    d.dx = e.clientX - d.x0;
    // Only a flipped card rides the finger — the face-down card flips in place.
    if (flipped && dragEl.current) {
      dragEl.current.style.transform =
        `translateX(${d.dx}px) rotate(${d.dx * 0.05}deg)`;
    }
  };
  const onStagePointerUp = () => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    const el = dragEl.current;
    const dt = Math.max(1, performance.now() - d.t0);
    const flick = Math.abs(d.dx) / dt > 0.45;
    if (Math.abs(d.dx) < 8) {
      // Tap.
      if (el) el.style.transform = '';
      gestureAdvance(-1);
    } else if (Math.abs(d.dx) > 64 || flick) {
      if (!flipped) {
        if (el) el.style.transform = '';
        reveal();
      } else if (isOne) {
        if (el) { el.style.transition = 'transform 260ms cubic-bezier(0.34,1.56,0.64,1)'; el.style.transform = ''; }
        setPhase('takeover');
      } else {
        flyOut(d.dx >= 0 ? 1 : -1);
      }
    } else if (el) {
      // Spring back.
      el.style.transition = 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)';
      el.style.transform = '';
    }
  };

  /** Skip the ceremony: jump straight to the tally. */
  const ripAll = () => {
    sfx.gavel();
    setPhase('done');
  };

  const all = packs.flat();
  // Headliner = the most VALUABLE card. Heat flavors the reveal order, but
  // the tally is about money, and a $0.25 rookie must not outrank a $7 hit.
  const best = useMemo(
    () => [...all].sort((a, b) => world.valuation(b) - world.valuation(a)).slice(0, 12),
    [all],
  );
  const totalValue = useMemo(
    () => all.reduce((sum, c) => sum + world.valuation(c), 0),
    [all],
  );

  const S = styles;
  return (
    <div style={S.overlay}>
      {phase === 'table' && (
        <div style={S.tableWrap}>
          <img src={tableUrl} alt="" style={S.tableBg} />
          <div style={S.tableTitle}>
            {rt.def.name}
            <span style={S.tableCount}> · {packs.length - opened.size} of {packs.length} sealed</span>
          </div>
          <div style={S.tableHint}>
            {grabbed !== null ? '' : 'grab a pack off the mat'}
          </div>
          {packs.map((_, i) => {
            const L = layout[i];
            const isOpen = opened.has(i);
            const isGrabbed = grabbed === i;
            return (
              <img
                key={i}
                data-table-pack={isOpen ? undefined : i}
                src={packThumbs[i]}
                alt=""
                onClick={() => grabPack(i)}
                style={{
                  position: 'absolute',
                  left: `${L.left}%`, top: `${L.top}%`,
                  width: `${L.w}%`,
                  transform: isGrabbed
                    ? 'translate(-50%, -50%) scale(2.6) rotate(0deg)'
                    : `translate(-50%, -50%) rotate(${L.rot}deg)${isOpen ? ' scale(0.94)' : ''}`,
                  ...(isGrabbed ? { left: '50%', top: '42%' } : {}),
                  transition: 'transform 380ms cubic-bezier(0.3, 1.2, 0.4, 1), left 380ms ease, top 380ms ease, filter 300ms',
                  filter: isOpen
                    ? 'grayscale(0.85) brightness(0.45)'
                    : isGrabbed
                      ? 'drop-shadow(0 26px 30px rgba(0,0,0,0.7)) brightness(1.08)'
                      : 'drop-shadow(0 7px 9px rgba(0,0,0,0.6))',
                  zIndex: isGrabbed ? 6 : isOpen ? 1 : 2,
                  borderRadius: 6,
                  touchAction: 'manipulation',
                }}
              />
            );
          })}
          {packs.length > 1 && (
            <button style={{ ...S.skip, position: 'absolute', bottom: '4%', left: '50%', transform: 'translateX(-50%)' }} onClick={ripAll}>
              SKIP TO RESULTS
            </button>
          )}
        </div>
      )}

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
        <div
          style={{ ...S.center, touchAction: 'none' }}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerUp}
          onPointerCancel={onStagePointerUp}
        >
          <div style={S.counter}>
            {packs.length > 1 && `PACK ${packIdx + 1}/${packs.length} · `}
            {idx + 1} / {cards.length}
          </div>
          <div ref={dragEl} style={{ willChange: 'transform', position: 'relative' }}>
          <ConfettiBurst trigger={burst} />
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
              <div style={{ ...S.caption, marginTop: 6 }}>swipe for next card</div>
            </div>
          ) : (
            <div style={S.caption}>swipe or tap to flip</div>
          )}
        </div>
      )}

      {phase === 'takeover' && current && (
        <div style={S.takeover} onClick={() => { setPhase('stack'); advance(); }}>
          <div style={S.oneBanner}>ONE OF ONE</div>
          <LiveCard spec={world.specFor(current)} width={Math.min(330, REVEAL_W)} />
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
                src={cachedSnapshot(world.specFor(best[0]), world.identityKey(best[0]), 540)}
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
  tableWrap: { position: 'relative', flex: 1, overflow: 'hidden' },
  tableBg: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  tableTitle: {
    position: 'absolute', top: '4.5%', left: 0, right: 0, textAlign: 'center',
    fontSize: 15, fontWeight: 900, letterSpacing: 0.5, textShadow: '0 2px 8px rgba(0,0,0,0.8)',
  },
  tableCount: { fontWeight: 700, fontSize: 12, color: '#e8c86a' },
  tableHint: {
    position: 'absolute', top: '11.8%', left: 0, right: 0, textAlign: 'center',
    fontSize: 12, color: 'rgba(244,242,236,0.75)', letterSpacing: 1,
    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
  },
  overlay: { position: 'fixed', inset: 0, zIndex: 55, background: 'radial-gradient(120% 90% at 50% 0%, #16161f 0%, #0a0a0d 70%)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'calc(52px + env(safe-area-inset-bottom))' },
  center: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16 },
  packCounter: { fontSize: 11, letterSpacing: 3, color: '#e8c86a' },
  packWrap: { position: 'relative', width: 250, height: 352, touchAction: 'none' },
  packBody: { position: 'absolute', inset: 0, backgroundSize: 'cover', borderRadius: 8, transition: 'clip-path 80ms linear', boxShadow: '0 24px 60px rgba(0,0,0,0.65)' },
  tearStrip: { position: 'absolute', left: 0, right: 0, top: 0, height: '13%', backgroundSize: 'cover', borderRadius: '8px 8px 0 0', transition: 'transform 120ms linear, opacity 200ms', zIndex: 2 },
  tearHint: { position: 'absolute', top: '4.5%', width: '100%', textAlign: 'center', fontSize: 12, letterSpacing: 1, color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 4px #000' },
  caption: { fontSize: 13, opacity: 0.6, letterSpacing: 1 },
  counter: { fontSize: 12, letterSpacing: 3, opacity: 0.7 },
  skip: { background: 'rgba(255,255,255,0.08)', color: 'rgba(244,242,236,0.7)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 14px', fontSize: 10, letterSpacing: 1, fontWeight: 700 },
  flipScene: { perspective: '1200px', width: REVEAL_W, transition: 'filter 300ms' },
  flipInner: { position: 'relative', width: '100%', transformStyle: 'preserve-3d', transition: 'transform 360ms cubic-bezier(0.2, 0.8, 0.25, 1)' },
  face: { width: '100%', borderRadius: 12, display: 'block', boxShadow: '0 18px 50px rgba(0,0,0,0.6)' },
  takeover: { position: 'fixed', inset: 0, background: '#050507', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 60, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'calc(52px + env(safe-area-inset-bottom))' },
  oneBanner: { fontSize: 26, fontWeight: 900, letterSpacing: 10, color: '#ffd75e', textShadow: '0 0 30px rgba(255, 215, 94, 0.5)' },
  oneSub: { fontSize: 13, opacity: 0.75, letterSpacing: 1 },
  doneStage: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 24, paddingBottom: 12, overflowY: 'auto', textAlign: 'center' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, width: '100%', maxWidth: 360 },
  button: { marginTop: 18, background: '#d4a017', color: '#1a1405', border: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 13, fontWeight: 900, letterSpacing: 1 },
};

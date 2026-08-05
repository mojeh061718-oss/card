/**
 * The rip. Sealed pack → drag to tear the wrapper → swipe through the stack.
 *
 * Escalation is honest: the glow bleeding through a card back is a true
 * function of the card underneath. 1/1s take over the whole app.
 */

import { useMemo, useRef, useState } from 'react';
import { seedFromText, Rng, childSeed } from '../engine/rng';
import { generateLeague } from '../engine/world/teams';
import {
  buildSeries, makePopulation, classifySlots, openPack, renderInputs, rankOf,
  type SeriesDef, type PulledCard,
} from '../engine/cards/series';
import { deriveDna } from '../render/dna';
import { artSeedFor, type CardRenderSpec } from '../render/layers';
import { renderPackWrapper, renderCardBack } from '../render/pack';
import { snapshotCard, LiveCard } from './cardview';

const WORLD_SEED = seedFromText('career-dev');

interface RipWorld {
  series: SeriesDef;
  specFor(pull: PulledCard): CardRenderSpec;
  rip(): PulledCard[];
  heat(pull: PulledCard): number;
}

function buildRipWorld(): RipWorld {
  const fb = generateLeague(WORLD_SEED, 'football', 2027);
  const series = buildSeries(WORLD_SEED, 2027, 'Pinnacle Press', 'Chromium', 'football', fb.players);
  const dna = deriveDna(series.seed, series.line);
  const pop = makePopulation(series);
  const classes = classifySlots(series);
  const rng = Rng.from(childSeed(WORLD_SEED, 'shop-rips'), 'packs');
  return {
    series,
    specFor(pull) {
      const { player, team, card, parallel } = renderInputs(series, pull, fb.players, fb.teams);
      return {
        player, team, dna, parallel,
        serial: parallel.numberedTo !== null ? pull.serial : null,
        seriesName: series.name,
        cardNumber: card.cardNumber,
        isRookie: card.isRookie,
        auto: card.isAuto ? { ink: card.autoInk ?? 'blueSharpie', sticker: card.autoSticker } : null,
        artSeed: artSeedFor(series.seed, pull.cardIndex),
      };
    },
    rip: () => openPack(series, pop, rng, classes, 10, []),
    heat: (pull) => rankOf(series, pull),
  };
}

/** Heat tier → glow color bleeding through the card back. */
function glowFor(heat: number): string | null {
  if (heat >= 11) return '#ffd75e'; // 1/1 territory
  if (heat >= 7) return '#d4a017';  // auto / low-numbered
  if (heat >= 4) return '#a06bff';  // numbered
  if (heat >= 2.2) return '#4f9dde'; // foil / rookie
  return null;
}

type Phase = 'sealed' | 'stack' | 'takeover' | 'done';

export function RipScreen() {
  const world = useMemo(buildRipWorld, []);
  const wrapperUrl = useMemo(() => renderPackWrapper(world.series, 640, 900).toDataURL(), [world]);
  const backUrl = useMemo(() => renderCardBack(world.series, 500).toDataURL(), [world]);

  const [phase, setPhase] = useState<Phase>('sealed');
  const [tear, setTear] = useState(0);
  const [pulls, setPulls] = useState<PulledCard[]>([]);
  const [idx, setIdx] = useState(0);          // next card to reveal
  const [flipped, setFlipped] = useState(false);
  const [stillUrl, setStillUrl] = useState<string | null>(null);
  const tearing = useRef(false);

  const startRip = () => {
    setPulls(world.rip());
    setIdx(0);
    setFlipped(false);
    setStillUrl(null);
  };

  // --- Tear gesture ---
  const onTearMove = (e: React.PointerEvent) => {
    if (!tearing.current) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setTear(t => Math.max(t, p));
    if (p > 0.92) {
      tearing.current = false;
      startRip();
      setTimeout(() => setPhase('stack'), 380);
    }
  };

  const current = idx < pulls.length ? pulls[idx] : null;
  const heat = current ? world.heat(current) : 0;
  const glow = glowFor(heat);
  const isOne = current?.numberedTo === 1;

  const reveal = () => {
    if (!current || flipped) return;
    setStillUrl(snapshotCard(world.specFor(current), 640));
    setFlipped(true);
  };
  const next = () => {
    if (!flipped || !current) return;
    if (isOne) { setPhase('takeover'); return; }
    advance();
  };
  const advance = () => {
    setFlipped(false);
    setStillUrl(null);
    if (idx + 1 >= pulls.length) setPhase('done');
    else setIdx(idx + 1);
  };

  const S = styles;
  return (
    <div style={S.root}>
      {phase === 'sealed' && (
        <div style={S.center}>
          <div style={S.packWrap} onPointerDown={() => { tearing.current = true; }}
            onPointerMove={onTearMove} onPointerUp={() => { tearing.current = false; }}>
            {/* Tear strip: the top of the wrapper, jagged clip, slides off */}
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
          <div style={S.caption}>{world.series.name} — Hobby Pack</div>
        </div>
      )}

      {phase === 'stack' && current && (
        <div style={S.center} onClick={flipped ? next : reveal}>
          <div style={S.counter}>{idx + 1} / {pulls.length}</div>
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
          <div style={S.caption}>{flipped ? 'tap for next card' : 'tap to flip'}</div>
        </div>
      )}

      {phase === 'takeover' && current && (
        <div style={S.takeover} onClick={() => { setPhase('stack'); advance(); }}>
          <div style={S.oneBanner}>ONE OF ONE</div>
          <LiveCard spec={world.specFor(current)} width={300} />
          <div style={S.oneSub}>
            {world.series.name} · Superfractor · #{current.serial}/1
          </div>
          <div style={{ ...S.caption, color: '#ffd75e' }}>tap to continue</div>
        </div>
      )}

      {phase === 'done' && (
        <div style={{ ...S.center, overflowY: 'auto' }}>
          <div style={S.counter}>PACK COMPLETE</div>
          <div style={S.grid}>
            {pulls.map((p, i) => (
              <img key={i} src={snapshotCard(world.specFor(p), 300)} alt=""
                style={{ width: '100%', borderRadius: 8 }} />
            ))}
          </div>
          <button style={S.button} onClick={() => { setPhase('sealed'); setTear(0); }}>
            RIP ANOTHER PACK
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { height: '100dvh', display: 'flex', flexDirection: 'column', background: 'radial-gradient(120% 90% at 50% 0%, #16161f 0%, #0c0c10 70%)' },
  center: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 16 },
  packWrap: { position: 'relative', width: 250, height: 352, touchAction: 'none', cursor: 'grab' },
  packBody: { position: 'absolute', inset: 0, backgroundSize: 'cover', borderRadius: 8, transition: 'clip-path 80ms linear', boxShadow: '0 24px 60px rgba(0,0,0,0.65)' },
  tearStrip: { position: 'absolute', left: 0, right: 0, top: 0, height: '13%', backgroundSize: 'cover', borderRadius: '8px 8px 0 0', transition: 'transform 120ms linear, opacity 200ms', zIndex: 2 },
  tearHint: { position: 'absolute', top: '15%', width: '100%', textAlign: 'center', fontSize: 12, letterSpacing: 1, color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 4px #000' },
  caption: { fontSize: 13, opacity: 0.6, letterSpacing: 1 },
  counter: { fontSize: 13, letterSpacing: 3, opacity: 0.7 },
  flipScene: { perspective: '1200px', width: 260, transition: 'filter 300ms' },
  flipInner: { position: 'relative', width: '100%', transformStyle: 'preserve-3d', transition: 'transform 520ms cubic-bezier(0.2, 0.8, 0.25, 1)' },
  face: { width: '100%', borderRadius: 12, display: 'block', boxShadow: '0 18px 50px rgba(0,0,0,0.6)' },
  takeover: { position: 'fixed', inset: 0, background: '#050507', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 50 },
  oneBanner: { fontSize: 26, fontWeight: 900, letterSpacing: 10, color: '#ffd75e', textShadow: '0 0 30px rgba(255, 215, 94, 0.5)' },
  oneSub: { fontSize: 13, opacity: 0.75, letterSpacing: 1 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, width: '100%', maxWidth: 420 },
  button: { background: '#d4a017', color: '#1a1405', border: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 14, fontWeight: 800, letterSpacing: 1 },
};

/**
 * Dev Lab — the renderer proving ground.
 *
 * Renders a spread of generated cards across the parallel ladder using the
 * single shared GL context (stills via snapshot, plus one live focused card
 * animated with pointer/auto tilt). This is the page Playwright screenshots
 * to hold the art to the "premium, not generic" bar.
 */

import { useEffect, useRef, useState } from 'react';
import { seedFromText, childSeed, Rng } from '../engine/rng';
import { generateLeague, type Sport } from '../engine/world/teams';
import { buildLadder, LADDER_ARCHETYPES, type ParallelDef } from '../engine/cards/parallels';
import { deriveDna } from '../render/dna';
import { renderCardLayers, artSeedFor, type CardRenderSpec } from '../render/layers';
import { createCardGL, type CardGL } from '../render/glcard';
import type { InkKind } from '../render/signature';

const WORLD_SEED = seedFromText('devlab-world-1');
const CARD_W = 300; // gallery still size
const FOCUS_W = 360;

interface GallerySpec {
  label: string;
  spec: CardRenderSpec;
}

function buildSpecs(): GallerySpec[] {
  const football = generateLeague(WORLD_SEED, 'football', 2027);
  const baseball = generateLeague(WORLD_SEED, 'baseball', 2027);
  const seriesSeed = childSeed(WORLD_SEED, 'series:2027:chromium');
  const dnaA = deriveDna(seriesSeed, 'Chromium');
  const dnaB = deriveDna(childSeed(WORLD_SEED, 'series:2027:prizmatic'), 'Prizmatic');
  const ladder = buildLadder(LADDER_ARCHETYPES[0], Rng.from(seriesSeed, 'ladder'));

  const pick = (sport: Sport, i: number) => {
    const lg = sport === 'football' ? football : baseball;
    // Prefer high-talent players — the ones who'd headline a checklist.
    const sorted = [...lg.players].sort((a, b) => b.talent - a.talent);
    const player = sorted[i];
    return { player, team: lg.teams[player.teamId] };
  };

  const P = (i: number): ParallelDef => ladder[Math.min(i, ladder.length - 1)];
  const one = ladder[ladder.length - 1];
  const inks: InkKind[] = ['blueSharpie', 'blackSharpie', 'silverPaint', 'goldPaint'];

  const specs: GallerySpec[] = [];
  const mk = (
    label: string, sport: Sport, playerIdx: number, dna: typeof dnaA,
    parallel: ParallelDef, serial: number | null, rookie: boolean,
    auto: { ink: InkKind; sticker: boolean } | null, artIdx: number,
  ) => {
    const { player, team } = pick(sport, playerIdx);
    specs.push({
      label,
      spec: {
        player, team, dna, parallel, serial,
        seriesName: `2027 ${dna === dnaA ? 'Pinnacle Press Chromium' : 'Apex Prizmatic'}`,
        cardNumber: `${dna === dnaA ? 'PC' : 'AP'}-${100 + playerIdx}`,
        isRookie: rookie,
        auto,
        artSeed: artSeedFor(seriesSeed, artIdx),
      },
    });
  };

  // Showcase every pattern engine across the spread — variety is the point.
  const withPattern = (dna: typeof dnaA, pattern: typeof dnaA.pattern, layout?: typeof dnaA.layout) =>
    ({ ...dna, pattern, ...(layout ? { layout } : {}) });
  mk('Base', 'football', 0, withPattern(dnaA, 'wave'), P(0), null, false, null, 0);
  mk('Base RC', 'football', 1, withPattern(dnaA, 'halftone'), P(0), null, true, null, 1);
  mk('Refractor', 'baseball', 0, withPattern(dnaA, 'pinstripe'), P(1), null, false, null, 2);
  mk('/199', 'football', 2, withPattern(dnaA, 'tessellation'), P(3), 47, false, null, 3);
  mk('/99', 'baseball', 1, withPattern(dnaA, 'circuit'), P(5), 12, true, null, 4);
  mk('/25 Auto', 'football', 3, withPattern(dnaA, 'marble'), P(8), 9, true, { ink: inks[0], sticker: false }, 5);
  mk('/10', 'baseball', 2, withPattern(dnaB, 'rays'), P(9), 3, false, null, 6);
  mk('/5 Auto', 'football', 4, withPattern(dnaB, 'starburst', 'framed'), P(10), 2, true, { ink: inks[3], sticker: true }, 7);
  mk('SUPERFRACTOR 1/1', 'baseball', 0, withPattern(dnaA, 'starburst'), one, 1, true, { ink: inks[1], sticker: false }, 8);
  return specs;
}

export function DevLab() {
  const [stills, setStills] = useState<{ label: string; url: string }[]>([]);
  const [focusIdx, setFocusIdx] = useState(8);
  const focusRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<CardGL | null>(null);
  const specsRef = useRef<GallerySpec[] | null>(null);
  const tiltRef = useRef({ x: 0, y: 0, dragging: false });

  // Build stills once through a scratch GL canvas.
  useEffect(() => {
    const specs = buildSpecs();
    specsRef.current = specs;
    const scratch = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    scratch.width = CARD_W * dpr;
    scratch.height = Math.round((CARD_W / (2.5 / 3.5)) * dpr);
    const gl = createCardGL(scratch);
    const out: { label: string; url: string }[] = [];
    for (const { label, spec } of specs) {
      const layers = renderCardLayers(spec, 600);
      gl.setLayers(layers.print, layers.foilMask);
      gl.draw({
        print: layers.print, foilMask: layers.foilMask,
        finish: spec.parallel.finish, tintHex: spec.parallel.colorHex,
        tiltX: 0.18, tiltY: -0.08, timeSec: 0,
        aspect: layers.heightPx / layers.widthPx,
      });
      out.push({ label, url: scratch.toDataURL('image/png') });
    }
    gl.destroy();
    setStills(out);
  }, []);

  // Live focused card: shared persistent GL canvas + rAF tilt.
  useEffect(() => {
    const canvas = focusRef.current;
    const specs = specsRef.current;
    if (!canvas || !specs) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = FOCUS_W * dpr;
    canvas.height = Math.round((FOCUS_W / (2.5 / 3.5)) * dpr);
    if (!glRef.current) glRef.current = createCardGL(canvas);
    const gl = glRef.current;
    const spec = specs[focusIdx].spec;
    const layers = renderCardLayers(spec, 750);
    gl.setLayers(layers.print, layers.foilMask);

    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = (now - t0) / 1000;
      const auto = tiltRef.current.dragging ? 0 : 1;
      const tx = tiltRef.current.x + auto * Math.sin(t * 0.9) * 0.35;
      const ty = tiltRef.current.y + auto * Math.cos(t * 0.7) * 0.2;
      gl.draw({
        print: layers.print, foilMask: layers.foilMask,
        finish: spec.parallel.finish, tintHex: spec.parallel.colorHex,
        tiltX: tx, tiltY: ty, timeSec: t,
        aspect: layers.heightPx / layers.widthPx,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Gyro on device, pointer fallback everywhere.
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      tiltRef.current.x = Math.max(-1, Math.min(1, e.gamma / 30));
      tiltRef.current.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
      tiltRef.current.dragging = true;
    };
    window.addEventListener('deviceorientation', onOrient);

    const onMove = (e: PointerEvent) => {
      if (!tiltRef.current.dragging) return;
      const r = canvas.getBoundingClientRect();
      tiltRef.current.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      tiltRef.current.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onDown = (e: PointerEvent) => { tiltRef.current.dragging = true; onMove(e); };
    const onUp = () => { tiltRef.current.dragging = false; };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('deviceorientation', onOrient);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [focusIdx, stills.length]);

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, letterSpacing: 2, opacity: 0.8, marginBottom: 4 }}>
        CARDBOARD — RENDER LAB
      </h1>
      <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 16 }}>
        Tap a card to focus it. Drag (or tilt on device) to play the foil.
      </p>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ position: 'sticky', top: 16 }}>
          <canvas
            ref={focusRef}
            data-testid="focus-card"
            style={{
              width: FOCUS_W, borderRadius: 14, touchAction: 'none',
              boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
            }}
          />
          <div style={{ textAlign: 'center', fontSize: 13, marginTop: 8, opacity: 0.8 }}>
            {stills[focusIdx]?.label ?? ''}
          </div>
        </div>
        <div
          data-testid="gallery"
          style={{
            display: 'grid', gap: 14, flex: 1,
            gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_W / 2}px, 1fr))`,
          }}
        >
          {stills.map((s, i) => (
            <figure key={s.label} onClick={() => setFocusIdx(i)} style={{ cursor: 'pointer' }}>
              <img
                src={s.url}
                alt={s.label}
                style={{
                  width: '100%', borderRadius: 10, display: 'block',
                  outline: i === focusIdx ? '2px solid #d4af37' : 'none',
                  boxShadow: '0 10px 28px rgba(0,0,0,0.5)',
                }}
              />
              <figcaption style={{ fontSize: 11, opacity: 0.6, marginTop: 4, textAlign: 'center' }}>
                {s.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}

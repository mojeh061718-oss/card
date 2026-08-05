/**
 * Card front rasterization — the "printing press".
 *
 * Composes the full printed card into two canvases:
 *   - `print`: everything ink — background art, athlete, frame, type, signature
 *   - `foilMask`: grayscale map of where foil lives (R channel) and how hot
 *     it burns (foil regions get the animated GL treatment on top)
 *
 * The GL compositor treats these as "ink over foil board", which is how real
 * chromium cards are physically built.
 */

import type { DesignDna } from './dna';
import type { ParallelDef } from '../engine/cards/parallels';
import type { Team, Player } from '../engine/world/teams';
import { Rng, childSeedN } from '../engine/rng';
import { shade, withAlpha, mixHex, inkOn } from './color';
import { renderAthleteLayer, athleteStyle, posesFor } from './athlete';
import { buildSignature, drawSignature, type InkKind } from './signature';
import type { Condition } from '../engine/condition/condition';
import { drawSkyline, drawBase } from './skyline';
import { INSERT_SETS } from '../engine/cards/series';
import { heroPhoto, tcgScan } from './photodb';
import { renderPokeCard, type PokeCardSpec } from './pokecard';

/**
 * REALISM CONCEPT hero: a real player photo takes the figure's place.
 * Football headshots (transparent PNGs) float over a team-color glow with
 * a ground shadow; baseball headshots (JPEG crops) cover a beveled window
 * with a team-color duotone so mixed sources still read as one set.
 */
/**
 * REALISM CONCEPT photo template — the whole card front is DESIGNED around
 * the imported photo instead of dropping it into the procedural layout.
 * Three pieces: the stage (team-color studio backdrop), the subject (the
 * photo, treated per source: ESPN cutouts vs. MLB studio headshots), and a
 * broadcast-style nameplate lockup. Rookie shields, serial badges, autos,
 * frames and foil all still land on top from the shared pipeline.
 */
function drawPhotoStage(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  primary: string, accent: string, nickname: string, rng: Rng,
): void {
  // Deep team-color studio gradient.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, mixHex(shade(primary, -0.52), '#05060c', 0.35));
  g.addColorStop(0.45, shade(primary, -0.08));
  g.addColorStop(1, mixHex(shade(primary, -0.5), '#04050a', 0.4));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Twin light beams from the top corners converge behind the subject.
  ctx.save();
  ctx.globalAlpha = 0.11;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(w / 2 + side * w * 0.42, -h * 0.05);
    ctx.rotate(side * 0.42);
    const beam = ctx.createLinearGradient(0, 0, 0, h * 0.9);
    beam.addColorStop(0, mixHex(accent, '#ffffff', 0.6));
    beam.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = beam;
    ctx.fillRect(-w * 0.16, 0, w * 0.32, h * 0.9);
    ctx.restore();
  }
  ctx.restore();

  // Fine diagonal pinstripes — print texture, not flat digital fill.
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, w * 0.0022);
  for (let x = -h; x < w + h; x += w * 0.03) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + h * 0.45, h);
    ctx.stroke();
  }
  ctx.restore();

  // Giant vertical team watermark along the left rail.
  ctx.save();
  ctx.translate(w * 0.075, h * 0.06);
  ctx.rotate(Math.PI / 2);
  ctx.font = `900 ${w * 0.155}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.strokeStyle = withAlpha('#ffffff', 0.08);
  ctx.lineWidth = Math.max(1, w * 0.003);
  ctx.strokeText(nickname.toUpperCase(), 0, 0);
  ctx.restore();

  // Stage light where the subject stands.
  const glow = ctx.createRadialGradient(w / 2, h * 0.38, 0, w / 2, h * 0.38, w * 0.66);
  glow.addColorStop(0, withAlpha(mixHex(accent, '#ffffff', 0.55), 0.4));
  glow.addColorStop(0.6, withAlpha(accent, 0.1));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // A few drifting bokeh sparks — arena atmosphere.
  ctx.save();
  for (let i = 0; i < 14; i++) {
    ctx.globalAlpha = 0.05 + rng.float() * 0.09;
    ctx.fillStyle = i % 3 ? '#ffffff' : accent;
    ctx.beginPath();
    ctx.arc(rng.float() * w, rng.float() * h * 0.6, w * (0.004 + rng.float() * 0.012), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Darken the floor so the lockup zone reads.
  const floor = ctx.createLinearGradient(0, h * 0.6, 0, h);
  floor.addColorStop(0, 'rgba(0,0,8,0)');
  floor.addColorStop(1, 'rgba(0,0,8,0.5)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Cutout detection, cached per decoded image. Source doesn't tell the
 * truth (some ESPN "cutouts" ship with a baked backdrop), so sample the
 * downscaled alpha channel instead: a real cutout goes transparent at the
 * corners and rails. Blob-URL images are same-origin, so no tainting.
 */
interface CutoutInfo {
  cut: boolean;
  /** Opaque-content bounding box in natural pixels. */
  bbox: [number, number, number, number];
}
const cutoutCache = new WeakMap<HTMLImageElement, CutoutInfo>();
function cutoutInfo(img: HTMLImageElement): CutoutInfo {
  const hit = cutoutCache.get(img);
  if (hit) return hit;
  const nw = img.naturalWidth, nh = img.naturalHeight;
  let info: CutoutInfo = { cut: false, bbox: [0, 0, nw, nh] };
  try {
    const S = 48;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const cctx = c.getContext('2d')!;
    cctx.drawImage(img, 0, 0, S, S);
    const d = cctx.getImageData(0, 0, S, S).data;
    let clear = 0, minX = S, minY = S, maxX = -1, maxY = -1;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const a = d[(y * S + x) * 4 + 3];
        if (a < 16) { clear++; continue; }
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX >= 0) {
      info = {
        cut: clear >= S * S * 0.09,
        bbox: [
          (minX / S) * nw, (minY / S) * nh,
          ((maxX - minX + 1) / S) * nw, ((maxY - minY + 1) / S) * nh,
        ],
      };
    }
  } catch { /* decode hiccup — treat as opaque */ }
  cutoutCache.set(img, info);
  return info;
}
function isCutout(img: HTMLImageElement): boolean {
  return cutoutInfo(img).cut;
}

function drawPhotoSubject(
  ctx: CanvasRenderingContext2D,
  photo: HTMLImageElement,
  w: number, h: number,
  primary: string, accent: string,
): void {
  if (isCutout(photo)) {
    // Transparent busts stage like a broadcast graphic. Crop to the
    // opaque content and scale so the HEAD owns the middle of the card —
    // shoulders are allowed to bleed off both edges, like real premium
    // photo cards. Bottom edge tucks under the lockup.
    const [bx, by, bw, bh] = cutoutInfo(photo).bbox;
    const scale = Math.min((w * 1.22) / bw, (h * 0.68) / bh);
    const dw = bw * scale, dh = bh * scale;
    const dx = (w - dw) / 2, dy = h * 0.872 - dh;

    const rim = ctx.createRadialGradient(w / 2, dy + dh * 0.5, w * 0.08, w / 2, dy + dh * 0.5, w * 0.62);
    rim.addColorStop(0, withAlpha(mixHex(accent, '#ffffff', 0.5), 0.5));
    rim.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = w * 0.045;
    ctx.shadowOffsetY = h * 0.014;
    ctx.drawImage(photo, bx, by, bw, bh, dx, dy, dw, dh);
    ctx.restore();
    return;
  }

  // Opaque studio photos (MLB headshots, backdropped ESPN shots) fit BY
  // WIDTH — never a face-zooming cover crop — run full-bleed from the top
  // and DISSOLVE into the stage, with a light team-color grade so photo
  // and design read as one printed piece, never a pasted rectangle.
  // 88% width pulls tight studio headshots back a touch; the side margins
  // dissolve into the stage so no hard photo edge ever shows.
  const dw = w * 0.88;
  const scale = dw / photo.naturalWidth;
  const dh = Math.min(photo.naturalHeight * scale, h * 0.7);
  const off = document.createElement('canvas');
  off.width = w; off.height = Math.round(dh);
  const octx = off.getContext('2d')!;
  octx.drawImage(photo, (w - dw) / 2, 0, dw, photo.naturalHeight * scale);

  // Team-color grade: gentle — unify tones without staining skin.
  octx.globalCompositeOperation = 'multiply';
  octx.fillStyle = withAlpha(mixHex(primary, '#ffffff', 0.55), 0.16);
  octx.fillRect(0, 0, w, dh);
  octx.globalCompositeOperation = 'soft-light';
  octx.fillStyle = withAlpha(accent, 0.12);
  octx.fillRect(0, 0, w, dh);
  octx.globalCompositeOperation = 'destination-out';
  // Bottom dissolve, late — the face stays clean, only the chest fades.
  const fade = octx.createLinearGradient(0, dh * 0.76, 0, dh);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  octx.fillStyle = fade;
  octx.fillRect(0, 0, w, dh);
  // Side dissolves blend the margins into the stage.
  for (const [x0, x1] of [[(w - dw) / 2 + w * 0.06, 0], [(w + dw) / 2 - w * 0.06, w]] as const) {
    const sg = octx.createLinearGradient(x0, 0, x1, 0);
    sg.addColorStop(0, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(0,0,0,1)');
    octx.fillStyle = sg;
    octx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), dh);
  }
  // Top corners soften so badges never sit on a hard photo edge.
  const tg = octx.createLinearGradient(0, 0, 0, dh * 0.06);
  tg.addColorStop(0, 'rgba(0,0,0,0.55)');
  tg.addColorStop(1, 'rgba(0,0,0,0)');
  octx.fillStyle = tg;
  octx.fillRect(0, 0, w, dh * 0.06);

  ctx.drawImage(off, 0, 0);
}

function drawPhotoNameplate(
  ctx: CanvasRenderingContext2D,
  fctx: CanvasRenderingContext2D,
  w: number, h: number,
  first: string, last: string, position: string,
  teamLine: string, jersey: number,
  accent: string, foilOnFrame: number,
): void {
  // Angled broadcast band.
  const topL = h * 0.842, topR = h * 0.822, bot = h * 0.936;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, topL);
  ctx.lineTo(w, topR);
  ctx.lineTo(w, bot);
  ctx.lineTo(0, bot);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, topR, 0, bot);
  bg.addColorStop(0, 'rgba(9,10,16,0.96)');
  bg.addColorStop(1, 'rgba(14,16,24,0.96)');
  ctx.fillStyle = bg;
  ctx.fill();
  // Accent blade along the angled top edge.
  ctx.beginPath();
  ctx.moveTo(0, topL);
  ctx.lineTo(w, topR);
  ctx.lineWidth = Math.max(2, h * 0.005);
  ctx.strokeStyle = accent;
  ctx.stroke();

  // Oversized jersey number, right side, ghosted metallic.
  const numText = String(jersey);
  ctx.font = `900 italic ${h * 0.078}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  // Metallic ramp biased bright — a dark accent must still read on the
  // near-black band.
  const numGrad = ctx.createLinearGradient(0, topR, 0, bot);
  numGrad.addColorStop(0, mixHex(accent, '#ffffff', 0.75));
  numGrad.addColorStop(0.55, mixHex(accent, '#ffffff', 0.4));
  numGrad.addColorStop(1, mixHex(accent, '#ffffff', 0.12));
  ctx.fillStyle = numGrad;
  ctx.fillText(numText, w * 0.955, h * 0.884);
  const numW = ctx.measureText(numText).width;

  // Name block, left side. Last name is the hero; fit by shrinking.
  const nameX = w * 0.05;
  const avail = w * 0.9 - numW - nameX;
  ctx.textAlign = 'left';
  ctx.font = `700 ${h * 0.02}px Arial, sans-serif`;
  ctx.fillStyle = withAlpha(mixHex(accent, '#ffffff', 0.4), 0.95);
  ctx.fillText(first.toUpperCase(), nameX, h * 0.856, avail);
  let lastPx = h * 0.042;
  ctx.font = `900 ${lastPx}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  const lw = ctx.measureText(last.toUpperCase()).width;
  if (lw > avail) {
    lastPx = Math.max(12, lastPx * (avail / lw));
    ctx.font = `900 ${lastPx}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  }
  ctx.fillStyle = '#f6f4ee';
  ctx.fillText(last.toUpperCase() || first.toUpperCase(), nameX, h * 0.888, avail);
  ctx.font = `600 ${h * 0.017}px Arial, sans-serif`;
  ctx.fillStyle = 'rgba(244,242,236,0.66)';
  ctx.fillText(`${position}  •  ${teamLine.toUpperCase()}`, nameX, h * 0.919, avail);
  ctx.restore();

  // Foil: the band's blade, the last name, and the number burn.
  fctx.save();
  fctx.beginPath();
  fctx.moveTo(0, topL);
  fctx.lineTo(w, topR);
  fctx.lineWidth = Math.max(2, h * 0.006);
  fctx.strokeStyle = `rgba(255,255,255,${0.85 * Math.max(0.4, foilOnFrame)})`;
  fctx.stroke();
  fctx.font = `900 ${lastPx}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  fctx.textAlign = 'left';
  fctx.textBaseline = 'middle';
  fctx.fillStyle = `rgba(255,255,255,${0.55 * Math.max(0.4, foilOnFrame)})`;
  fctx.fillText(last.toUpperCase() || first.toUpperCase(), w * 0.05, h * 0.888);
  fctx.font = `900 italic ${h * 0.078}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  fctx.textAlign = 'right';
  fctx.fillStyle = 'rgba(255,255,255,0.6)';
  fctx.fillText(String(jersey), w * 0.955, h * 0.884);
  fctx.restore();
}

const insertRunOf = (name: string): number =>
  INSERT_SETS.find(s => s.name === name)?.printRun ?? 199;

/**
 * "Ignition" insert background — a comic-book detonation. Layered jagged
 * bursts from a hot white core through team color out to char, radial speed
 * lines, and a halftone screen: the loud, panel-art cousin of Downtown.
 */
function drawIgnition(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  seed: bigint, primary: string, secondary: string,
): void {
  const rng = new Rng(seed);
  const cx = w * 0.5, cy = h * 0.40;

  // Scorched backdrop.
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.75);
  bg.addColorStop(0, shade(mixHex(primary, '#3a1206', 0.7), 0.05));
  bg.addColorStop(1, '#120608');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Radial speed lines.
  ctx.strokeStyle = withAlpha('#ffd9a0', 0.28);
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2 + rng.float() * 0.1;
    const r0 = h * (0.30 + rng.float() * 0.14);
    const r1 = r0 + h * (0.12 + rng.float() * 0.35);
    ctx.lineWidth = Math.max(1, w * (0.0015 + rng.float() * 0.004));
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }

  // Jagged burst layers, outside in.
  const burst = (radius: number, jag: number, points: number, rot: number, fill: string, outline?: string) => {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 + rot;
      const r = i % 2 === 0 ? radius : radius * (1 - jag) * (0.9 + rng.float() * 0.2);
      const px = cx + Math.cos(a) * r * 1.02;
      const py = cy + Math.sin(a) * r * 0.92; // slightly squashed, panel-style
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = Math.max(2, w * 0.006);
      ctx.stroke();
    }
  };
  burst(h * 0.46, 0.42, 16, 0.12, withAlpha(shade(primary, -0.06), 0.9), 'rgba(16,6,4,0.85)');
  burst(h * 0.36, 0.40, 13, 0.35, mixHex(secondary, '#ff7b2e', 0.55), 'rgba(16,6,4,0.7)');
  burst(h * 0.27, 0.38, 11, 0.62, '#ffb23e');
  burst(h * 0.185, 0.34, 9, 0.95, '#ffe28a');
  burst(h * 0.105, 0.3, 8, 1.4, '#fff8e6');

  // Halftone screen over the corners — printed-comic texture.
  ctx.fillStyle = withAlpha('#1a0a06', 0.5);
  const step = w * 0.02;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const d = Math.hypot(x - cx, y - cy) / (h * 0.62);
      if (d < 0.85) continue;
      const r = Math.min(step * 0.36, step * 0.5 * (d - 0.8));
      ctx.beginPath();
      ctx.arc(x + (Math.floor(y / step) % 2) * step * 0.5, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export const CARD_ASPECT = 2.5 / 3.5;

export interface CardRenderSpec {
  player: Player;
  team: Team;
  dna: DesignDna;
  parallel: ParallelDef;
  serial: number | null;         // stamped "12/99" if numbered
  seriesName: string;            // e.g. "2027 Pinnacle Press Chromium"
  cardNumber: string;            // e.g. "PC-147"
  isRookie: boolean;
  auto: { ink: InkKind; sticker: boolean } | null;
  /** Unique per card-def art variance (pose pick etc.). */
  artSeed: bigint;
  /** Physical copy condition; null renders a factory-fresh proof. */
  condition?: Condition | null;
  /** Named illustrated insert — swaps in a bespoke layout. */
  insertName?: string | null;
  /** TCG concept card — routes to the TCG press instead of the sports one. */
  tcg?: { setKey: string; chase: boolean; poke: PokeCardSpec };
}

export interface CardLayers {
  print: HTMLCanvasElement;
  foilMask: HTMLCanvasElement;
  widthPx: number;
  heightPx: number;
}

// ---------------------------------------------------------------------------
// Background pattern painters (2D). Each fills rect with a design built from
// the team palette + DNA. These are the "printed art" under the foil.
// ---------------------------------------------------------------------------

type Painter = (
  ctx: CanvasRenderingContext2D, w: number, h: number,
  a: string, b: string, dna: DesignDna, rng: Rng,
) => void;

const patternPainters: Record<DesignDna['pattern'], Painter> = {
  rays(ctx, w, h, a, b, dna, rng) {
    const cx = w * (0.3 + rng.float() * 0.4), cy = h * 0.42;
    const n = Math.round(dna.patternScale) + 8;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + dna.patternAngle;
      const a1 = a0 + (Math.PI / n) * (0.6 + rng.float() * 0.5);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, Math.hypot(w, h), a0, a1);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? shade(a, -0.04 * (i % 3)) : mixHex(a, b, 0.18 + 0.08 * (i % 3));
      ctx.fill();
    }
  },
  halftone(ctx, w, h, a, b, dna) {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    const step = w / (dna.patternScale * 2.4);
    ctx.fillStyle = withAlpha(b, 0.5);
    for (let y = 0; y < h + step; y += step) {
      for (let x = 0; x < w + step; x += step) {
        const t = y / h;
        const r = step * 0.42 * (0.15 + 0.85 * t);
        ctx.beginPath();
        ctx.arc(x + (Math.floor(y / step) % 2) * step * 0.5, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
  pinstripe(ctx, w, h, a, b, dna) {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    const step = w / dna.patternScale;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(dna.patternAngle * 0.35);
    ctx.translate(-w / 2, -h / 2);
    ctx.fillStyle = withAlpha(mixHex(a, b, 0.6), 0.6);
    for (let x = -w; x < w * 2; x += step) {
      ctx.fillRect(x, -h, step * 0.24, h * 3);
    }
    ctx.restore();
  },
  tessellation(ctx, w, h, a, b, dna, rng) {
    ctx.fillStyle = shade(a, -0.05);
    ctx.fillRect(0, 0, w, h);
    const s = w / dna.patternScale;
    for (let y = 0; y < h + s; y += s * 0.866) {
      const row = Math.round(y / (s * 0.866));
      for (let x = -s; x < w + s; x += s) {
        const ox = (row % 2) * s * 0.5;
        const up = (Math.floor(x / s) + row) % 2 === 0;
        ctx.beginPath();
        ctx.moveTo(x + ox, up ? y : y + s * 0.866);
        ctx.lineTo(x + ox + s / 2, up ? y + s * 0.866 : y);
        ctx.lineTo(x + ox - s / 2, up ? y + s * 0.866 : y);
        ctx.closePath();
        ctx.fillStyle = withAlpha(mixHex(a, b, rng.float() * 0.4), 0.16 + rng.float() * 0.2);
        ctx.fill();
      }
    }
  },
  wave(ctx, w, h, a, b, dna) {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    const bands = Math.round(dna.patternScale * 0.8) + 4;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      ctx.beginPath();
      ctx.moveTo(0, h * t);
      for (let x = 0; x <= w; x += w / 40) {
        ctx.lineTo(x, h * t + Math.sin((x / w) * Math.PI * 2 + i * 0.8 + dna.patternAngle) * h * 0.05);
      }
      ctx.lineTo(w, h); ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = withAlpha(mixHex(a, b, t * 0.55), 0.22);
      ctx.fill();
    }
  },
  circuit(ctx, w, h, a, b, dna, rng) {
    ctx.fillStyle = shade(a, -0.08);
    ctx.fillRect(0, 0, w, h);
    const s = w / dna.patternScale;
    ctx.strokeStyle = withAlpha(b, 0.35);
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.lineCap = 'round';
    for (let i = 0; i < dna.patternScale * 6; i++) {
      let x = Math.floor(rng.float() * (w / s)) * s;
      let y = Math.floor(rng.float() * (h / s)) * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        if (rng.chance(0.5)) x += (rng.chance(0.5) ? 1 : -1) * s;
        else y += (rng.chance(0.5) ? 1 : -1) * s;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, s * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(b, 0.5);
      ctx.fill();
    }
  },
  marble(ctx, w, h, a, b, _dna, rng) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, shade(a, 0.04));
    g.addColorStop(1, shade(a, -0.1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = withAlpha(mixHex(a, b, 0.6), 0.25);
    for (let i = 0; i < 14; i++) {
      ctx.lineWidth = 1 + rng.float() * 3;
      ctx.beginPath();
      let x = rng.float() * w, y = 0;
      ctx.moveTo(x, y);
      while (y < h) {
        y += h * (0.05 + rng.float() * 0.1);
        x += (rng.float() - 0.5) * w * 0.2;
        ctx.quadraticCurveTo(x + (rng.float() - 0.5) * 30, y - h * 0.05, x, y);
      }
      ctx.stroke();
    }
  },
  velocity(ctx, w, h, a, b, dna, rng) {
    // Optic-style "velocity": ice shards radiating from a hot point, laid
    // over a flat field. Shards are thin quads, not lines, so they read as
    // cracked foil rather than scratches.
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, shade(a, -0.02));
    g.addColorStop(1, shade(mixHex(a, b, 0.35), -0.12));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.5, cy = h * 0.42;
    const shards = Math.round(dna.patternScale * 5) + 40;
    for (let i = 0; i < shards; i++) {
      const ang = rng.float() * Math.PI * 2;
      const r0 = Math.hypot(w, h) * (0.05 + rng.float() * 0.5);
      const len = Math.hypot(w, h) * (0.06 + rng.float() * 0.26);
      const wid = w * (0.002 + rng.float() * 0.007);
      const x0 = cx + Math.cos(ang) * r0, y0 = cy + Math.sin(ang) * r0;
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      const nx = -Math.sin(ang) * wid, ny = Math.cos(ang) * wid;
      ctx.beginPath();
      ctx.moveTo(x0 + nx, y0 + ny);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x0 - nx, y0 - ny);
      ctx.closePath();
      ctx.fillStyle = withAlpha(
        rng.chance(0.45) ? '#ffffff' : mixHex(b, '#ffffff', 0.5),
        0.18 + rng.float() * 0.5,
      );
      ctx.fill();
    }
  },
  starburst(ctx, w, h, a, b, dna, rng) {
    ctx.fillStyle = shade(a, -0.06);
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.4;
    const n = Math.round(dna.patternScale * 4) + 20;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const len = Math.hypot(w, h) * (0.3 + rng.float() * 0.7);
      const wdt = (Math.PI / n) * (0.25 + rng.float() * 0.5);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, len, ang - wdt, ang + wdt);
      ctx.closePath();
      ctx.fillStyle = withAlpha(mixHex(a, b, rng.float() * 0.5), 0.10 + rng.float() * 0.12);
      ctx.fill();
    }
  },
};

// ---------------------------------------------------------------------------

function roundedCardPath(ctx: CanvasRenderingContext2D, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, r);
}

/**
 * Circular team badge — a generated geometric mark rather than a letter.
 * Real cards carry a logo lockup in the corner; a monogram alone reads as a
 * placeholder, so the mark is built from the team's own seed.
 */
function drawTeamBadge(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  primary: string, secondary: string, letter: string, seed: bigint,
): void {
  const rng = new Rng(seed);
  ctx.save();
  // Outer ring.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = shade(primary, -0.2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
  ctx.fillStyle = secondary;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Mark: one of a few franchise-looking devices.
  const kind = rng.int(4);
  ctx.fillStyle = shade(primary, -0.05);
  if (kind === 0) {
    // Chevron stack.
    for (let i = 0; i < 3; i++) {
      const o = r * (0.5 - i * 0.32);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.62, cy + o);
      ctx.lineTo(cx, cy + o - r * 0.42);
      ctx.lineTo(cx + r * 0.62, cy + o);
      ctx.lineTo(cx + r * 0.62, cy + o + r * 0.2);
      ctx.lineTo(cx, cy + o - r * 0.22);
      ctx.lineTo(cx - r * 0.62, cy + o + r * 0.2);
      ctx.closePath();
      ctx.fill();
    }
  } else if (kind === 1) {
    // Diagonal bar sweep.
    ctx.rotate(0);
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - r + i * r * 0.42, cy + r);
      ctx.lineTo(cx - r * 0.4 + i * r * 0.42, cy - r);
      ctx.lineTo(cx - r * 0.16 + i * r * 0.42, cy - r);
      ctx.lineTo(cx - r * 0.76 + i * r * 0.42, cy + r);
      ctx.closePath();
      ctx.fill();
    }
  } else if (kind === 2) {
    // Star.
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? r * 0.72 : r * 0.3;
      const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    // Shield block.
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy - r * 0.55);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.55);
    ctx.lineTo(cx + r * 0.5, cy + r * 0.12);
    ctx.quadraticCurveTo(cx, cy + r * 0.85, cx - r * 0.5, cy + r * 0.12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // Monogram over the mark.
  ctx.font = `900 ${r * 0.92}px "Arial Narrow", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = r * 0.14;
  ctx.strokeStyle = shade(primary, -0.28);
  ctx.strokeText(letter, cx, cy + r * 0.04);
  ctx.fillStyle = inkOn(secondary);
  ctx.fillText(letter, cx, cy + r * 0.04);
  ctx.restore();
}

/**
 * A TCG card whose REAL SCAN has been imported: the scan IS the card.
 * Holos still get foil through the GL compositor, tuned subtle so the
 * authentic artwork carries the frame.
 */
function renderScanCard(
  scan: HTMLImageElement, holo: boolean, widthPx: number,
): CardLayers {
  const w = widthPx;
  const h = Math.round(widthPx / CARD_ASPECT);
  const print = document.createElement('canvas');
  print.width = w; print.height = h;
  const ctx = print.getContext('2d')!;
  const foilMask = document.createElement('canvas');
  foilMask.width = w; foilMask.height = h;
  const fctx = foilMask.getContext('2d')!;
  fctx.fillStyle = '#000';
  fctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, w * 0.045);
  ctx.clip();
  const cover = Math.max(w / scan.naturalWidth, h / scan.naturalHeight);
  const dw = scan.naturalWidth * cover, dh = scan.naturalHeight * cover;
  ctx.drawImage(scan, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.restore();
  if (holo) {
    const fc = fctx as unknown as CanvasRenderingContext2D;
    fctx.save();
    fctx.beginPath();
    fc.roundRect(0, 0, w, h, w * 0.045);
    fctx.clip();
    // A holo has to LOOK like a holo: hot shimmer over the whole card,
    // hotter still across the art window, with diagonal burst streaks the
    // foil shader turns into moving light.
    fctx.fillStyle = 'rgb(95,95,95)';
    fctx.fillRect(0, 0, w, h);
    fctx.fillStyle = 'rgb(215,215,215)';
    fctx.fillRect(w * 0.08, h * 0.1, w * 0.84, h * 0.42);
    fctx.save();
    fc.translate(w / 2, h * 0.3);
    fc.rotate(-0.5);
    fctx.fillStyle = 'rgb(255,255,255)';
    for (let i = -6; i <= 6; i++) {
      fctx.fillRect(i * w * 0.11 - w * 0.012, -h, w * 0.024, h * 2);
    }
    fctx.restore();
    fctx.restore();
  }
  return { print, foilMask, widthPx: w, heightPx: h };
}

/** Render the complete card front at `widthPx` resolution. */
export function renderCardLayers(spec: CardRenderSpec, widthPx = 750): CardLayers {
  if (spec.tcg) {
    // Imported real scan wins; otherwise the procedural TCG concept frame.
    const scan = tcgScan(spec.tcg.setKey, spec.tcg.poke.num);
    const holo = spec.tcg.chase || spec.tcg.poke.rarity === 'holo';
    if (scan) return renderScanCard(scan, holo, widthPx);
    const l = renderPokeCard(spec.tcg.poke, widthPx);
    return { print: l.print, foilMask: l.foilMask, widthPx: l.widthPx, heightPx: l.heightPx };
  }
  const w = widthPx;
  const h = Math.round(widthPx / CARD_ASPECT);
  const { dna, team, player, parallel } = spec;
  const rng = new Rng(spec.artSeed);
  const cornerR = w * dna.cornerFrac;

  const print = document.createElement('canvas');
  print.width = w; print.height = h;
  const ctx = print.getContext('2d')!;

  const foilMask = document.createElement('canvas');
  foilMask.width = w; foilMask.height = h;
  const fctx = foilMask.getContext('2d')!;
  fctx.fillStyle = '#000';
  fctx.fillRect(0, 0, w, h);
  if (spec.condition && (spec.condition.offX !== 0 || spec.condition.offY !== 0)) {
    fctx.save();
    fctx.translate(spec.condition.offX * w, spec.condition.offY * h);
  }

  // Card die-cut clip.
  ctx.save();
  roundedCardPath(ctx, w, h, cornerR);
  ctx.clip();

  // Raw card stock beneath the print: an off-center cut exposes it.
  const cond = spec.condition ?? null;
  ctx.fillStyle = '#d9d5c9';
  ctx.fillRect(0, 0, w, h);
  if (cond && (cond.offX !== 0 || cond.offY !== 0)) {
    ctx.translate(cond.offX * w, cond.offY * h);
  }

  // --- Palette: team colors + series accent shift, parallel tint override ---
  const accentBase = mixHex(team.secondary, team.primary, 0.15);
  const primary = team.primary;
  const accent = parallel.colorHex
    ? mixHex(accentBase, parallel.colorHex, 0.55)
    : accentBase;

  const isDowntown = spec.insertName === 'Downtown';
  const isInsert = !!spec.insertName;
  // REALISM CONCEPT: an imported photo switches the whole front to the
  // photo-first template. Inserts keep their illustrated identity.
  const photo = !isInsert ? heroPhoto(player.sport, `${player.first} ${player.last}`) : null;
  const poses = posesFor(player.sport);
  const pose = poses[Number(spec.artSeed % BigInt(poses.length))];
  const figX = isInsert ? w * 0.04 : w * 0.02;
  const figY = isInsert ? h * 0.045 : h * 0.06;
  const figW = isInsert ? w * 0.92 : w * 0.96;
  const figH = isInsert ? h * 0.84 : h * 0.78;
  // Where the cleats actually land, in card space. Poses differ, so this is
  // measured rather than assumed — otherwise the figure floats.
  const footFrac = Math.max(
    pose.toeNear.y, pose.toeFar.y, pose.ankleNear.y, pose.ankleFar.y,
  );
  const footY = figY + footFrac * figH;


  // --- Background art ---
  if (isDowntown) {
    // Illustrated insert: the city IS the design. No pattern engine, no
    // vignette — a painted skyline the figure stands in front of.
    drawSkyline(ctx, w, h, childSeedN(spec.artSeed, 4242), team.primary, 0.86);
  } else if (isInsert) {
    // Ignition (and future illustrated sets): a bespoke painted panel.
    drawIgnition(ctx, w, h, childSeedN(spec.artSeed, 5151), team.primary, team.secondary);
  } else if (photo) {
    drawPhotoStage(ctx, w, h, primary, accent, team.nickname, rng);
  } else {
    patternPainters[dna.pattern](ctx, w, h, primary, accent, dna, rng);
  }

  // Hero glow: a hot accent core behind the figure lifts the whole card and
  // separates the subject the way studio lighting does on real photography.
  // (The photo stage carries its own lighting.)
  if (!isInsert && !photo) {
  const glow = ctx.createRadialGradient(w / 2, h * 0.40, 0, w / 2, h * 0.40, w * 0.62);
  glow.addColorStop(0, withAlpha(mixHex(accent, '#ffffff', 0.45), 0.5));
  glow.addColorStop(0.55, withAlpha(accent, 0.16));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Depth vignette so the figure pops.
  const vg = ctx.createRadialGradient(w / 2, h * 0.42, w * 0.2, w / 2, h * 0.42, w * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,10,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  }

  // Layout-specific background furniture.
  if (isDowntown) {
    // Plinth sits exactly on the measured foot line so the figure stands.
    drawBase(ctx, w * 0.5, footY, w * 0.3, team.primary);
  } else if (!isInsert && !photo && dna.layout === 'diagonalSplit') {
    ctx.beginPath();
    ctx.moveTo(0, h * 0.78);
    ctx.lineTo(w, h * 0.5);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = withAlpha(shade(primary, -0.16), 0.85);
    ctx.fill();
  } else if (!isInsert && !photo && dna.layout === 'archWindow') {
    // Arch glow behind figure
    ctx.beginPath();
    ctx.moveTo(w * 0.14, h * 0.86);
    ctx.lineTo(w * 0.14, h * 0.34);
    ctx.arc(w * 0.5, h * 0.34, w * 0.36, Math.PI, 0);
    ctx.lineTo(w * 0.86, h * 0.86);
    ctx.closePath();
    ctx.fillStyle = withAlpha(mixHex(primary, accent, 0.35), 0.5);
    ctx.fill();
    ctx.strokeStyle = withAlpha(accent, 0.8);
    ctx.lineWidth = w * 0.008;
    ctx.stroke();
  }

  // --- Foil mask: background burns hot, figure area stays cooler ---
  if (parallel.finish !== 'none') {
    fctx.save();
    roundedCardPath(fctx as unknown as CanvasRenderingContext2D, w, h, cornerR);
    fctx.clip();
    const heat = parallel.finish === 'superfractor' ? 255 : 200;
    fctx.fillStyle = `rgb(${heat},${heat},${heat})`;
    fctx.fillRect(0, 0, w, h);
    fctx.restore();
  } else if (dna.glossyStock) {
    fctx.fillStyle = 'rgb(28,28,28)'; // faint stock sheen
    fctx.fillRect(0, 0, w, h);
  }


  // Opaque photo panels sit UNDER the frame (a framed photo card); cutout
  // busts draw after the frame below, breaking over it like a broadcast
  // graphic. Procedural figures stay under the frame as always.
  if (photo && !isCutout(photo)) {
    drawPhotoSubject(ctx, photo, w, h, team.primary, accent);
  } else if (!photo) {
    const style = athleteStyle(
      player.appearanceSeed, player.jersey, player.sport,
      team.primary, team.secondary, team.nickname,
    );
    renderAthleteLayer(ctx, pose, style, figX, figY, figW, figH, player.appearanceSeed, accent);
  }

  // Figure cools the foil under it (ink blocks foil board).
  if (parallel.finish !== 'none' && parallel.finish !== 'superfractor') {
    fctx.save();
    fctx.globalAlpha = 0.45;
    fctx.fillStyle = '#000';
    fctx.beginPath();
    fctx.ellipse(w * 0.5, h * 0.45, w * 0.3, h * 0.32, 0, 0, Math.PI * 2);
    fctx.fill();
    fctx.restore();
  }

  // --- Frame ---
  const ink = inkOn(primary);
  if (dna.borderFrac > 0 && !isInsert) {
    const bw = w * dna.borderFrac;
    ctx.save();
    roundedCardPath(ctx, w, h, cornerR);
    ctx.lineWidth = bw * 2;
    ctx.strokeStyle = shade(primary, -0.2);
    ctx.stroke();
    // Inner pinline in accent — the detail that reads "premium print".
    ctx.beginPath();
    ctx.roundRect(bw * 1.35, bw * 1.35, w - bw * 2.7, h - bw * 2.7, cornerR * 0.6);
    ctx.lineWidth = Math.max(1.5, bw * 0.16);
    ctx.strokeStyle = withAlpha(accent, 0.9);
    ctx.stroke();
    ctx.restore();
    // Frame gets foil accent per DNA.
    fctx.save();
    roundedCardPath(fctx as unknown as CanvasRenderingContext2D, w, h, cornerR);
    fctx.lineWidth = bw * 2;
    fctx.strokeStyle = `rgba(255,255,255,${0.75 * dna.foilOnFrame})`;
    fctx.stroke();
    fctx.restore();
  }

  // Cutout busts break over the frame — drawn after it on purpose.
  if (photo && isCutout(photo)) {
    drawPhotoSubject(ctx, photo, w, h, team.primary, accent);
  }

  // Font families, parsed once — the DNA stacks carry a leading weight token
  // that has to be stripped before they can be used in a canvas font string.
  const famMatch = dna.displayFont.match(/"[^"]+".*$/)
    ?? [dna.displayFont.replace(/^[\d ]+(italic )?/, '')];
  const famLabel = dna.labelFont.match(/"[^"]+".*$/)
    ?? [dna.labelFont.replace(/^[\d ]+/, '')];

  // --- Insert banner: pill + name, the illustrated sets' signature lockup ---
  if (isInsert) {
    const barY = h * 0.885, barH = h * 0.072;
    ctx.fillStyle = isDowntown ? '#12241c' : '#1c0b06';
    ctx.fillRect(0, barY, w, barH);
    ctx.strokeStyle = withAlpha('#ffffff', 0.5);
    ctx.lineWidth = Math.max(1, w * 0.0035);
    ctx.beginPath();
    ctx.moveTo(0, barY + barH * 0.06);
    ctx.lineTo(w, barY + barH * 0.06);
    ctx.stroke();

    // Insert-name pill on the left.
    const pillW = w * 0.36, pillH = barH * 0.62;
    const pillX = w * 0.035, pillY = barY + (barH - pillH) / 2;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, pillH * 0.28);
    ctx.fillStyle = '#d8d5cc';
    ctx.fill();
    ctx.strokeStyle = '#0d1a14';
    ctx.lineWidth = Math.max(1, w * 0.003);
    ctx.stroke();
    ctx.font = `700 ${pillH * 0.56}px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = isDowntown ? '#12241c' : '#1c0b06';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.insertName!, pillX + pillW / 2, pillY + pillH * 0.54, pillW * 0.9);

    // Serial first — it is fixed-width and must never be crowded out.
    const rightEdge = w * 0.965;
    let textLimit = rightEdge;
    if (spec.serial !== null) {
      const serialText = `${spec.serial}/${insertRunOf(spec.insertName!)}`;
      ctx.font = `900 ${barH * 0.3}px "Courier New", monospace`;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#e8c86a';
      ctx.fillText(serialText, rightEdge, barY + barH * 0.52);
      textLimit = rightEdge - ctx.measureText(serialText).width - w * 0.025;
    }
    // Player + team fill whatever space the serial left behind. The name
    // shrinks to fit — it must never squish or run under the serial.
    ctx.textAlign = 'left';
    const nameX = pillX + pillW + w * 0.03;
    const avail = Math.max(w * 0.1, textLimit - nameX);
    const dtName = `${player.first.toUpperCase()} ${player.last.toUpperCase()}`;
    let dtPx = barH * 0.44;
    ctx.font = `900 ${dtPx}px "Arial Narrow", Arial, sans-serif`;
    const dtMeasured = ctx.measureText(dtName).width;
    if (dtMeasured > avail * 0.72) {
      dtPx = Math.max(9, dtPx * ((avail * 0.72) / dtMeasured));
      ctx.font = `900 ${dtPx}px "Arial Narrow", Arial, sans-serif`;
    }
    ctx.fillStyle = '#f6f4ee';
    const nameW = ctx.measureText(dtName).width;
    ctx.fillText(dtName, nameX, barY + barH * 0.52);
    ctx.font = `700 ${barH * 0.28}px Arial, sans-serif`;
    ctx.fillStyle = withAlpha('#f6f4ee', 0.8);
    ctx.fillText(
      team.nickname, nameX + nameW + w * 0.014, barY + barH * 0.56,
      Math.max(w * 0.04, avail - nameW - w * 0.014),
    );

    // The whole banner and the plinth burn on the foil layer.
    fctx.fillStyle = 'rgba(255,255,255,0.8)';
    fctx.fillRect(0, barY, w, barH);
  }

  // --- Nameplate ---
  const npY = h * 0.855;
  const npH = h * 0.075;
  const displayPx = Math.round(npH * 0.62);
  const labelPx = Math.round(npH * 0.3);
  const nameText = `${player.first.toUpperCase()} ${player.last.toUpperCase()}`;
  if (photo) {
    drawPhotoNameplate(
      ctx, fctx as unknown as CanvasRenderingContext2D, w, h,
      player.first, player.last, player.position,
      `${team.city} ${team.nickname}`, player.jersey,
      accent, dna.foilOnFrame,
    );
  }
  if (!isInsert && !photo) {
  ctx.save();
  switch (dna.nameplate) {
    case 'bar': {
      ctx.fillStyle = withAlpha(shade(primary, -0.22), 0.92);
      ctx.fillRect(0, npY, w, npH);
      ctx.fillStyle = accent;
      ctx.fillRect(0, npY, w * 0.012, npH);
      break;
    }
    case 'chip': {
      const cw = w * 0.72;
      ctx.fillStyle = withAlpha(shade(primary, -0.22), 0.94);
      ctx.beginPath();
      ctx.roundRect((w - cw) / 2, npY, cw, npH, npH * 0.5);
      ctx.fill();
      ctx.strokeStyle = withAlpha(accent, 0.85);
      ctx.lineWidth = Math.max(1.5, w * 0.004);
      ctx.stroke();
      break;
    }
    case 'slant': {
      ctx.beginPath();
      ctx.moveTo(0, npY + npH * 0.25);
      ctx.lineTo(w * 0.8, npY);
      ctx.lineTo(w * 0.78, npY + npH);
      ctx.lineTo(0, npY + npH * 1.1);
      ctx.closePath();
      ctx.fillStyle = withAlpha(shade(primary, -0.22), 0.92);
      ctx.fill();
      break;
    }
    case 'stacked':
    case 'outline':
      break; // text-only treatments
  }
  // Name text. The badge occupies the right edge on left-aligned plates, so
  // the name must never reach it — fit by SHRINKING the font, not by letting
  // canvas maxWidth squish the glyphs sideways.
  ctx.textBaseline = 'middle';
  const centered = dna.nameplate === 'chip' || dna.nameplate === 'stacked';
  ctx.textAlign = centered ? 'center' : 'left';
  const nameX = centered ? w / 2 : w * 0.05;
  const nameAvail = centered ? w * 0.62 : w * 0.76;
  const italic = dna.displayFont.includes('italic') ? 'italic ' : '';
  let fitPx = displayPx;
  ctx.font = `${italic}900 ${fitPx}px ${famMatch[0]}`;
  const measured = ctx.measureText(nameText).width;
  if (measured > nameAvail) {
    fitPx = Math.max(11, Math.floor(displayPx * (nameAvail / measured)));
    ctx.font = `${italic}900 ${fitPx}px ${famMatch[0]}`;
  }
  if (dna.nameplate === 'outline') {
    ctx.lineWidth = Math.max(1.5, fitPx * 0.06);
    ctx.strokeStyle = ink;
    ctx.strokeText(nameText, nameX, npY + npH * 0.42);
    ctx.fillStyle = withAlpha(ink, 0.15);
    ctx.fillText(nameText, nameX, npY + npH * 0.42);
  } else {
    ctx.fillStyle = '#f4f2ec';
    ctx.fillText(nameText, nameX, npY + npH * 0.42);
  }
  // Position • Team line
  ctx.font = `600 ${labelPx}px ${famLabel[0]}`;
  ctx.fillStyle = withAlpha('#f4f2ec', 0.75);
  ctx.fillText(
    `${player.position}  •  ${team.city.toUpperCase()} ${team.nickname.toUpperCase()}`,
    nameX, npY + npH * 0.82, nameAvail,
  );
  ctx.restore();

  // Nameplate foil text accent — same fitted size as the ink pass, or the
  // foil ghost misaligns with the printed name.
  fctx.save();
  const famF = famMatch[0];
  fctx.font = `${italic}900 ${fitPx}px ${famF}`;
  fctx.textBaseline = 'middle';
  fctx.textAlign = centered ? 'center' : 'left';
  fctx.fillStyle = `rgba(255,255,255,${0.5 * dna.foilOnFrame})`;
  fctx.fillText(nameText, nameX, npY + npH * 0.42);
  fctx.restore();
  }

  // --- Rookie shield ---
  if (spec.isRookie) {
    const rs = w * 0.085;
    const rx = w * 0.08, ry = h * 0.075;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(rx, ry - rs * 0.55);
    ctx.lineTo(rx + rs * 0.5, ry - rs * 0.3);
    ctx.lineTo(rx + rs * 0.5, ry + rs * 0.25);
    ctx.quadraticCurveTo(rx + rs * 0.5, ry + rs * 0.62, rx, ry + rs * 0.8);
    ctx.quadraticCurveTo(rx - rs * 0.5, ry + rs * 0.62, rx - rs * 0.5, ry + rs * 0.25);
    ctx.lineTo(rx - rs * 0.5, ry - rs * 0.3);
    ctx.closePath();
    ctx.fillStyle = '#d4af37';
    ctx.fill();
    ctx.strokeStyle = '#8a6d1f';
    ctx.lineWidth = Math.max(1, rs * 0.05);
    ctx.stroke();
    ctx.fillStyle = '#241d05';
    ctx.font = `900 ${rs * 0.42}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RC', rx, ry + rs * 0.1);
    ctx.restore();
    // Shield is foil.
    fctx.save();
    fctx.beginPath();
    fctx.arc(rx, ry + rs * 0.1, rs * 0.75, 0, Math.PI * 2);
    fctx.fillStyle = 'rgba(255,255,255,0.85)';
    fctx.fill();
    fctx.restore();
  }

  // --- Parallel badge: bold, instantly readable tier marker (top-right) ---
  if (parallel.numberedTo !== null && spec.serial !== null) {
    const isOne = parallel.numberedTo === 1;
    const st = `${spec.serial}/${parallel.numberedTo}`;
    const bw2 = w * (isOne ? 0.30 : 0.24);
    const bh2 = h * (isOne ? 0.085 : 0.062);
    const bx = w * 0.94 - bw2, by = h * 0.045;
    const gold = isOne ? '#ffd75e' : '#e8c86a';
    ctx.save();
    ctx.translate(bx + bw2 / 2, by + bh2 / 2);
    ctx.rotate(-0.015 + rng.float() * 0.03); // hand-stamped tilt
    // Plate: near-black with gold keyline; unmistakable at binder size.
    ctx.fillStyle = 'rgba(8, 8, 12, 0.88)';
    ctx.strokeStyle = gold;
    ctx.lineWidth = Math.max(1.5, w * 0.004);
    ctx.beginPath();
    ctx.roundRect(-bw2 / 2, -bh2 / 2, bw2, bh2, bh2 * 0.2);
    ctx.fill();
    ctx.stroke();
    // Serial — the hero of the plate.
    const serPx = bh2 * (isOne ? 0.52 : 0.56);
    ctx.font = `900 ${serPx}px "Arial Narrow", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = gold;
    ctx.fillText(isOne ? '1/1' : st, 0, isOne ? -bh2 * 0.16 : bh2 * (parallel.name ? 0.16 : 0));
    // Tier name in small caps above/below.
    ctx.font = `700 ${bh2 * 0.24}px Arial, sans-serif`;
    ctx.fillStyle = 'rgba(244, 242, 236, 0.85)';
    const label = isOne ? 'ONE OF ONE' : parallel.name.toUpperCase();
    ctx.fillText(label, 0, isOne ? bh2 * 0.28 : -bh2 * 0.26, bw2 * 0.9);
    if (spec.condition?.error === 'doubleStamp') {
      // Factory double-stamp: ghost impression offset below.
      ctx.globalAlpha = 0.45;
      ctx.translate(bw2 * 0.06, bh2 * 0.35);
      ctx.font = `900 ${serPx}px "Arial Narrow", Arial, sans-serif`;
      ctx.fillStyle = gold;
      ctx.fillText(isOne ? '1/1' : st, 0, isOne ? -bh2 * 0.16 : bh2 * 0.16);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // Badge burns on the foil layer.
    fctx.save();
    fctx.translate(bx + bw2 / 2, by + bh2 / 2);
    fctx.fillStyle = 'rgba(255,255,255,0.95)';
    fctx.beginPath();
    fctx.roundRect(-bw2 / 2, -bh2 / 2, bw2, bh2, bh2 * 0.2);
    fctx.fill();
    fctx.restore();
  } else if (parallel.finish !== 'none') {
    // Unnumbered foil tier still announces itself.
    const bh2 = h * 0.042;
    ctx.save();
    ctx.font = `800 ${bh2 * 0.62}px Arial, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(244, 242, 236, 0.9)';
    ctx.strokeStyle = 'rgba(8, 8, 12, 0.6)';
    ctx.lineWidth = bh2 * 0.14;
    const label = parallel.name.toUpperCase();
    ctx.strokeText(label, w * 0.94, h * 0.062);
    ctx.fillText(label, w * 0.94, h * 0.062);
    ctx.restore();
  }

  // --- 1/1 crown frame ---
  if (parallel.numberedTo === 1) {
    ctx.save();
    ctx.strokeStyle = withAlpha('#ffd75e', 0.95);
    ctx.lineWidth = w * 0.008;
    ctx.beginPath();
    ctx.roundRect(w * 0.018, w * 0.018, w - w * 0.036, h - w * 0.036, cornerR * 0.8);
    ctx.stroke();
    ctx.restore();
    fctx.save();
    fctx.strokeStyle = 'rgba(255,255,255,0.9)';
    fctx.lineWidth = w * 0.008;
    fctx.beginPath();
    fctx.roundRect(w * 0.018, w * 0.018, w - w * 0.036, h - w * 0.036, cornerR * 0.8);
    fctx.stroke();
    fctx.restore();
  }

  // --- Autograph ---
  if (spec.auto) {
    const sig = buildSignature(player.signatureSeed, player.first, player.last, player.jersey);
    const sw = w * 0.62, sh = sw * 0.4 * 0.55;
    // Photo cards sign across the jersey, never the face.
    const sx0 = w * 0.19, sy0 = photo ? h * 0.665 : h * 0.615;
    drawSignature(ctx, sig, spec.auto.ink, sx0, sy0, sw, sh, spec.auto.sticker);
  }

  // --- Brand mark + card number ---
  // Framed layouts print the fine text inside the border band (real cards
  // run copyright lines through the border); full-bleed puts it at the foot.
  const bwFine = w * dna.borderFrac;
  const fineY = isInsert ? h * 0.972
    : dna.borderFrac > 0 ? h - bwFine * 0.95 : h * 0.968;
  const finePx = dna.borderFrac > 0
    ? Math.max(9, Math.min(w * 0.024, bwFine * 0.85))
    : Math.round(w * 0.024);
  ctx.save();
  ctx.font = `700 ${finePx}px ${famLabel[0]}`;
  ctx.fillStyle = withAlpha('#f4f2ec', 0.6);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.seriesName.toUpperCase(), w * 0.05, fineY, w * 0.6);
  ctx.textAlign = 'right';
  ctx.fillText(spec.cardNumber, w * 0.95, fineY);
  ctx.restore();

  // --- Team badge: a real logo lockup, not a letter in a circle ---
  // Photo cards wear it as a crest at the top-left (the lockup owns the
  // bottom band); rookies keep the RC shield there instead.
  if (!isInsert && photo && !spec.isRookie) {
    drawTeamBadge(
      ctx, w * 0.085, h * 0.078, w * 0.052,
      team.primary, team.secondary, team.nickname[0], team.logoSeed,
    );
  } else if (!isInsert && !photo) {
    drawTeamBadge(
      ctx,
      dna.nameplate === 'chip' ? w * 0.115 : w * 0.9,
      npY + npH * 0.42, w * 0.05,
      team.primary, team.secondary, team.nickname[0], team.logoSeed,
    );
  }

  // --- Print grain: fine noise so surfaces read as printed stock, not flat ---
  {
    const gs = 96;
    const grain = document.createElement('canvas');
    grain.width = gs; grain.height = gs;
    const gctx = grain.getContext('2d')!;
    const img = gctx.createImageData(gs, gs);
    const grng = new Rng(spec.artSeed ^ 0xfeedn);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 118 + grng.int(20);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    gctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(grain, 'repeat')!;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // --- Die-cut depth: hairline edge + soft inner shadow at the borders ---
  ctx.save();
  roundedCardPath(ctx, w, h, cornerR);
  ctx.clip();
  const innerShadow = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.62, w / 2, h / 2, Math.max(w, h) * 0.78);
  innerShadow.addColorStop(0, 'rgba(0,0,0,0)');
  innerShadow.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = innerShadow;
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  roundedCardPath(ctx, w, h, cornerR);
  ctx.stroke();
  ctx.restore();

  ctx.restore(); // die-cut clip (also drops the off-center translate)

  // ---- Physical wear + factory errors: drawn relative to the DIE CUT ----
  if (cond) {
    const wrng = new Rng(spec.artSeed ^ 0xdefec7n);
    ctx.save();
    roundedCardPath(ctx, w, h, cornerR);
    ctx.clip();
    // Corner wear: pale fray flecks (devastating on dark borders).
    const cornerPts = [[0, 0], [w, 0], [w, h], [0, h]];
    cond.corners.forEach((wear, i) => {
      if (wear < 0.06) return;
      const [cx, cy] = cornerPts[i];
      const n = Math.round(wear * 14);
      for (let k = 0; k < n; k++) {
        const ang = Math.atan2(h / 2 - cy, w / 2 - cx) + (wrng.float() - 0.5) * 1.4;
        const d = wrng.float() * wear * w * 0.05;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d,
          0.7 + wrng.float() * wear * 2.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(226, 221, 208, ${0.5 + wear * 0.4})`;
        ctx.fill();
      }
    });
    // Edge chipping: white flecks along each rim.
    const edgeSpecs: [number, number, number, number][] = [
      [0, 0, w, 0], [w, 0, 0, h], [0, h, w, 0], [0, 0, 0, h],
    ];
    cond.edges.forEach((chip, i) => {
      if (chip < 0.05) return;
      const [ex, ey, dx, dy] = edgeSpecs[i];
      const n = Math.round(chip * 26);
      for (let k = 0; k < n; k++) {
        const t = wrng.float();
        ctx.beginPath();
        ctx.arc(ex + dx * t + (dy ? (i === 1 ? -1 : 1) * wrng.float() * 2 : 0),
          ey + dy * t + (dx ? (i === 2 ? -1 : 1) * wrng.float() * 2 : 0),
          0.5 + wrng.float() * chip * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(230, 226, 214, ${0.45 + chip * 0.4})`;
        ctx.fill();
      }
    });
    // Surface scratches: hairline light strokes.
    for (let k = 0; k < cond.scratches; k++) {
      const x0 = wrng.float() * w, y0 = wrng.float() * h * 0.8;
      const len = w * (0.1 + wrng.float() * 0.25);
      const ang = wrng.float() * Math.PI;
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
      ctx.stroke();
    }
    // Print lines: full-width roller marks.
    for (let k = 0; k < cond.printLines; k++) {
      const y0 = h * (0.15 + wrng.float() * 0.7);
      ctx.fillStyle = 'rgba(30, 26, 40, 0.18)';
      ctx.fillRect(0, y0, w, 1.6);
    }
    // Ink specks.
    for (let k = 0; k < cond.printDots; k++) {
      ctx.beginPath();
      ctx.arc(wrng.float() * w, wrng.float() * h, 1 + wrng.float() * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20, 16, 28, 0.5)';
      ctx.fill();
    }
    // Factory ink smear: a dramatic diagonal band.
    if (cond.error === 'inkSmear') {
      const y0 = h * (0.2 + wrng.float() * 0.5);
      const smear = ctx.createLinearGradient(0, y0, w, y0 + h * 0.08);
      smear.addColorStop(0, 'rgba(18, 14, 26, 0)');
      smear.addColorStop(0.4, 'rgba(18, 14, 26, 0.55)');
      smear.addColorStop(1, 'rgba(18, 14, 26, 0)');
      ctx.fillStyle = smear;
      ctx.fillRect(0, y0 - h * 0.02, w, h * 0.12);
    }
    ctx.restore();
  }
  if (spec.condition && (spec.condition.offX !== 0 || spec.condition.offY !== 0)) {
    fctx.restore();
  }
  // Missing foil error: the board never got its shine.
  if (cond?.error === 'missingFoil') {
    fctx.globalCompositeOperation = 'source-over';
    fctx.fillStyle = '#000';
    fctx.fillRect(0, 0, w, h);
  }
  return { print, foilMask, widthPx: w, heightPx: h };
}

/** Deterministic art seed for a card definition. */
export function artSeedFor(seriesSeed: bigint, cardIndex: number): bigint {
  return childSeedN(seriesSeed, 7000 + cardIndex);
}

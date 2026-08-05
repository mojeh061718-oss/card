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

/** Render the complete card front at `widthPx` resolution. */
export function renderCardLayers(spec: CardRenderSpec, widthPx = 750): CardLayers {
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

  // Card die-cut clip.
  ctx.save();
  roundedCardPath(ctx, w, h, cornerR);
  ctx.clip();

  // --- Palette: team colors + series accent shift, parallel tint override ---
  const accentBase = mixHex(team.secondary, team.primary, 0.15);
  const primary = team.primary;
  const accent = parallel.colorHex
    ? mixHex(accentBase, parallel.colorHex, 0.55)
    : accentBase;

  // --- Background art ---
  patternPainters[dna.pattern](ctx, w, h, primary, accent, dna, rng);

  // Hero glow: a hot accent core behind the figure lifts the whole card and
  // separates the subject the way studio lighting does on real photography.
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

  // Layout-specific background furniture.
  if (dna.layout === 'diagonalSplit') {
    ctx.beginPath();
    ctx.moveTo(0, h * 0.78);
    ctx.lineTo(w, h * 0.5);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = withAlpha(shade(primary, -0.16), 0.85);
    ctx.fill();
  } else if (dna.layout === 'archWindow') {
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

  // --- Athlete ---
  const poses = posesFor(player.sport);
  const pose = poses[Number(spec.artSeed % BigInt(poses.length))];
  const style = athleteStyle(
    player.appearanceSeed, player.jersey, player.sport,
    team.primary, team.secondary, team.nickname,
  );
  const figX = w * 0.02, figY = h * 0.06, figW = w * 0.96, figH = h * 0.78;
  renderAthleteLayer(ctx, pose, style, figX, figY, figW, figH, player.appearanceSeed, accent);

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
  if (dna.borderFrac > 0) {
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

  // --- Nameplate ---
  const npY = h * 0.855;
  const npH = h * 0.075;
  const displayPx = Math.round(npH * 0.62);
  const labelPx = Math.round(npH * 0.3);
  const nameText = `${player.first.toUpperCase()} ${player.last.toUpperCase()}`;
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
  // Name text
  ctx.font = `${dna.displayFont.replace(/^(\d+ ?)(italic ?)?/, (_m, wgt, it) => `${it ?? ''}${wgt}`)}`;
  ctx.font = dna.displayFont.includes('italic')
    ? `italic 900 ${displayPx}px ${dna.displayFont.split('"').slice(1).join('"').replace(/^[^,]*"?/, m => m)}`
    : ctx.font;
  // Simpler robust font assembly:
  const famMatch = dna.displayFont.match(/"[^"]+".*$/) ?? [dna.displayFont.replace(/^[\d ]+(italic )?/, '')];
  ctx.font = `${dna.displayFont.includes('italic') ? 'italic ' : ''}900 ${displayPx}px ${famMatch[0]}`;
  ctx.textBaseline = 'middle';
  const centered = dna.nameplate === 'chip' || dna.nameplate === 'stacked';
  ctx.textAlign = centered ? 'center' : 'left';
  const nameX = centered ? w / 2 : w * 0.05;
  if (dna.nameplate === 'outline') {
    ctx.lineWidth = Math.max(1.5, displayPx * 0.06);
    ctx.strokeStyle = ink;
    ctx.strokeText(nameText, nameX, npY + npH * 0.42, w * 0.9);
    ctx.fillStyle = withAlpha(ink, 0.15);
    ctx.fillText(nameText, nameX, npY + npH * 0.42, w * 0.9);
  } else {
    ctx.fillStyle = '#f4f2ec';
    ctx.fillText(nameText, nameX, npY + npH * 0.42, w * 0.9);
  }
  // Position • Team line
  const famLabel = dna.labelFont.match(/"[^"]+".*$/) ?? [dna.labelFont.replace(/^[\d ]+/, '')];
  ctx.font = `600 ${labelPx}px ${famLabel[0]}`;
  ctx.fillStyle = withAlpha('#f4f2ec', 0.75);
  ctx.fillText(
    `${player.position}  •  ${team.city.toUpperCase()} ${team.nickname.toUpperCase()}`,
    nameX, npY + npH * 0.82, w * 0.9,
  );
  ctx.restore();

  // Nameplate foil text accent
  fctx.save();
  const famF = famMatch[0];
  fctx.font = `${dna.displayFont.includes('italic') ? 'italic ' : ''}900 ${displayPx}px ${famF}`;
  fctx.textBaseline = 'middle';
  fctx.textAlign = centered ? 'center' : 'left';
  fctx.fillStyle = `rgba(255,255,255,${0.5 * dna.foilOnFrame})`;
  fctx.fillText(nameText, nameX, npY + npH * 0.42, w * 0.9);
  fctx.restore();

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
    const sx0 = w * 0.19, sy0 = h * 0.615;
    drawSignature(ctx, sig, spec.auto.ink, sx0, sy0, sw, sh, spec.auto.sticker);
  }

  // --- Brand mark + card number ---
  // Framed layouts print the fine text inside the border band (real cards
  // run copyright lines through the border); full-bleed puts it at the foot.
  const bwFine = w * dna.borderFrac;
  const fineY = dna.borderFrac > 0 ? h - bwFine * 0.95 : h * 0.968;
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

  // --- Team monogram chip beside the nameplate: the authenticity detail ---
  {
    const mr = w * 0.048;
    const mx = dna.nameplate === 'chip' ? w * 0.115 : w * 0.905;
    const my = npY + npH * 0.42;
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fillStyle = shade(team.secondary, -0.05);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, mr * 0.12);
    ctx.strokeStyle = shade(team.primary, -0.18);
    ctx.stroke();
    ctx.font = `900 ${mr * 1.05}px "Arial Narrow", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = inkOn(team.secondary);
    ctx.fillText(team.nickname[0], mx, my + mr * 0.05);
    ctx.restore();
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

  ctx.restore(); // die-cut clip
  return { print, foilMask, widthPx: w, heightPx: h };
}

/** Deterministic art seed for a card definition. */
export function artSeedFor(seriesSeed: bigint, cardIndex: number): bigint {
  return childSeedN(seriesSeed, 7000 + cardIndex);
}

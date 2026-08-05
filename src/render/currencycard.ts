/**
 * Currency Series card renderer — banknote engraving as card design.
 *
 * Every card reads like a piece of engraved money: guilloché lattice
 * bands, ornate double frames with corner rosettes, red serial stamps,
 * and a center vignette per subject class (`type` on the card data):
 * notes, coins, gold, crypto, gems, figures, vaults, and cut signatures
 * (drawn by the same signature engine the sports autos use). Holos burn
 * the guilloché on the foil mask; the chase burns everything.
 */

import { Rng, hashString } from '../engine/rng';
import { shade, withAlpha, mixHex } from './color';
import { buildSignature, drawSignature } from './signature';
import type { PokeCardSpec } from './pokecard';
import { POKE_ASPECT } from './pokecard';

interface Palette { paper: string; ink: string; accent: string; deep: string }

function paletteFor(spec: PokeCardSpec): Palette {
  const n = spec.name.toLowerCase();
  if (spec.type === 'gem') {
    const gem = n.includes('emerald') ? '#1e8a53' : n.includes('sapphire') ? '#1e4f8a'
      : n.includes('ruby') ? '#8a1e2e' : '#7ea7b8';
    return { paper: '#f2efe4', ink: shade(gem, -0.25), accent: gem, deep: shade(gem, -0.5) };
  }
  switch (spec.type) {
    case 'gold': return { paper: '#f5eed8', ink: '#5a4310', accent: '#b8860b', deep: '#3d2c08' };
    case 'crypto': return n.includes('ethereum')
      ? { paper: '#eeecf5', ink: '#3a3560', accent: '#6c63b5', deep: '#232040' }
      : { paper: '#f5ecdc', ink: '#5c3a10', accent: '#e08a1e', deep: '#3a2408' };
    case 'figure': return { paper: '#f0ead8', ink: '#4a3d28', accent: '#8a7444', deep: '#2e2618' };
    case 'signature': return { paper: '#f4eeda', ink: '#3d3424', accent: '#9a7d3a', deep: '#282214' };
    case 'vault': return { paper: '#e9edef', ink: '#33434e', accent: '#5b7686', deep: '#1d262c' };
    case 'coin': return { paper: '#eff0ec', ink: '#43484a', accent: '#7d858a', deep: '#26292b' };
    default: return { paper: '#eef2e6', ink: '#254430', accent: '#3c6e4f', deep: '#142418' };
  }
}

/** Parametric guilloché band — layered sine lattices, the money texture. */
function drawGuilloche(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  color: string, rng: Rng, density = 3,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.lineWidth = Math.max(0.6, w * 0.0012);
  for (let s = 0; s < density; s++) {
    const f1 = 4 + rng.float() * 5, f2 = 9 + rng.float() * 8;
    const a1 = h * (0.22 + rng.float() * 0.2), a2 = h * (0.08 + rng.float() * 0.1);
    const ph = rng.float() * Math.PI * 2;
    ctx.strokeStyle = withAlpha(color, 0.4 - s * 0.09);
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 90; i++) {
        const t = i / 90;
        const px = x + t * w;
        const py = y + h / 2
          + Math.sin(t * Math.PI * 2 * f1 + ph + k * 0.5) * a1
          + Math.sin(t * Math.PI * 2 * f2 + ph * 1.7 + k) * a2;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Corner rosette — concentric petal medallion with the card number. */
function drawRosette(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number,
  pal: Palette, label: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  for (let ring = 0; ring < 2; ring++) {
    const rr = r * (1 - ring * 0.28);
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const rad = rr * (0.82 + 0.18 * Math.cos(a * (10 + ring * 4)));
      const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = withAlpha(pal.ink, 0.8 - ring * 0.3);
    ctx.lineWidth = Math.max(0.8, r * 0.05);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2);
  ctx.fillStyle = pal.paper;
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = Math.max(0.8, r * 0.04);
  ctx.stroke();
  ctx.fillStyle = pal.ink;
  ctx.font = `900 ${r * 0.62}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, r * 0.03);
  ctx.restore();
}

/** Engraving hatch fill inside the current clip. */
function hatch(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  color: string, gap: number, angle: number, alpha: number,
): void {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(angle);
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = Math.max(0.6, gap * 0.22);
  const span = Math.hypot(w, h);
  for (let d = -span / 2; d < span / 2; d += gap) {
    ctx.beginPath();
    ctx.moveTo(-span / 2, d);
    ctx.lineTo(span / 2, d);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVignette(
  ctx: CanvasRenderingContext2D, spec: PokeCardSpec, pal: Palette,
  x: number, y: number, w: number, h: number, rng: Rng,
): void {
  const cx = x + w / 2, cy = y + h / 2;
  const n = spec.name.toLowerCase();
  ctx.save();
  switch (spec.type) {
    case 'coin':
    case 'gold': {
      const isBar = n.includes('bar');
      if (isBar) {
        // Stacked bullion, beveled.
        for (let i = 2; i >= 0; i--) {
          const bw = w * 0.52, bh = h * 0.18;
          const bx = cx - bw / 2 + (i - 1) * w * 0.05, by = cy - bh / 2 + (i - 1) * bh * 0.82;
          const g = ctx.createLinearGradient(bx, by, bx, by + bh);
          g.addColorStop(0, mixHex(pal.accent, '#ffffff', 0.55));
          g.addColorStop(0.5, pal.accent);
          g.addColorStop(1, shade(pal.accent, -0.35));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, bh * 0.18);
          ctx.fill();
          ctx.strokeStyle = shade(pal.accent, -0.5);
          ctx.lineWidth = Math.max(1, w * 0.006);
          ctx.stroke();
        }
        break;
      }
      // A coin: reeded rim, hatched liberty profile.
      const r = Math.min(w, h) * 0.4;
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      g.addColorStop(0, mixHex(pal.accent, '#ffffff', 0.5));
      g.addColorStop(1, shade(pal.accent, -0.25));
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(pal.accent, -0.5);
      ctx.lineWidth = Math.max(1.5, r * 0.04);
      ctx.stroke();
      // Reeding.
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.93, cy + Math.sin(a) * r * 0.93);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.strokeStyle = withAlpha(shade(pal.accent, -0.5), 0.7);
        ctx.lineWidth = Math.max(0.7, r * 0.015);
        ctx.stroke();
      }
      // Profile bust, hatched.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.22, cy + r * 0.52);
      ctx.quadraticCurveTo(cx - r * 0.4, cy + r * 0.1, cx - r * 0.28, cy - r * 0.12);
      ctx.quadraticCurveTo(cx - r * 0.24, cy - r * 0.42, cx + r * 0.04, cy - r * 0.46);
      ctx.quadraticCurveTo(cx + r * 0.3, cy - r * 0.42, cx + r * 0.3, cy - r * 0.14);
      ctx.quadraticCurveTo(cx + r * 0.34, cy + r * 0.02, cx + r * 0.22, cy + r * 0.08);
      ctx.quadraticCurveTo(cx + r * 0.3, cy + r * 0.34, cx + r * 0.12, cy + r * 0.52);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = withAlpha(shade(pal.accent, -0.4), 0.25);
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      hatch(ctx, cx - r, cy - r, r * 2, r * 2, shade(pal.accent, -0.55), r * 0.055, 0.5, 0.55);
      ctx.restore();
      break;
    }
    case 'crypto': {
      const isEth = n.includes('ethereum');
      const r = Math.min(w, h) * 0.38;
      // Circuit traces radiating.
      ctx.strokeStyle = withAlpha(pal.accent, 0.5);
      ctx.lineWidth = Math.max(1, r * 0.02);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.26;
        const x1 = cx + Math.cos(a) * r * 1.06, y1 = cy + Math.sin(a) * r * 1.06;
        const x2 = cx + Math.cos(a) * r * 1.45, y2 = cy + Math.sin(a) * r * 1.45;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x2, y2, r * 0.035, 0, Math.PI * 2);
        ctx.fillStyle = pal.accent;
        ctx.fill();
      }
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
      g.addColorStop(0, mixHex(pal.accent, '#ffffff', 0.45));
      g.addColorStop(1, shade(pal.accent, -0.3));
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(pal.accent, -0.55);
      ctx.lineWidth = Math.max(2, r * 0.06);
      ctx.stroke();
      ctx.fillStyle = pal.paper;
      ctx.font = `900 ${r * 1.15}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = shade(pal.accent, -0.6);
      ctx.lineWidth = r * 0.04;
      const sym = isEth ? 'Ξ' : '₿';
      ctx.strokeText(sym, cx, cy + r * 0.04);
      ctx.fillText(sym, cx, cy + r * 0.04);
      break;
    }
    case 'gem': {
      const r = Math.min(w, h) * 0.4;
      // Faceted brilliant-cut silhouette.
      const top = cy - r * 0.35, girdle = cy - r * 0.05, tip = cy + r * 0.62;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.62, girdle);
      ctx.lineTo(cx - r * 0.34, top);
      ctx.lineTo(cx + r * 0.34, top);
      ctx.lineTo(cx + r * 0.62, girdle);
      ctx.lineTo(cx, tip);
      ctx.closePath();
      const g = ctx.createLinearGradient(cx, top, cx, tip);
      g.addColorStop(0, mixHex(pal.accent, '#ffffff', 0.6));
      g.addColorStop(0.5, pal.accent);
      g.addColorStop(1, shade(pal.accent, -0.4));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(pal.accent, -0.55);
      ctx.lineWidth = Math.max(1.5, r * 0.03);
      ctx.stroke();
      // Facet lines.
      ctx.strokeStyle = withAlpha('#ffffff', 0.75);
      ctx.lineWidth = Math.max(1, r * 0.02);
      for (const [fx, fy] of [[-0.34, 1], [0.34, 1], [0, 1]] as const) {
        ctx.beginPath();
        ctx.moveTo(cx + fx * r, fy === 1 ? top : girdle);
        ctx.lineTo(cx, tip);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.62, girdle);
      ctx.lineTo(cx + r * 0.62, girdle);
      ctx.stroke();
      // Sparkle.
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) {
        const sx = cx + (rng.float() - 0.5) * r, sy = top + rng.float() * r * 0.5;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(rng.float());
        ctx.fillRect(-r * 0.09, -r * 0.015, r * 0.18, r * 0.03);
        ctx.fillRect(-r * 0.015, -r * 0.09, r * 0.03, r * 0.18);
        ctx.restore();
      }
      break;
    }
    case 'figure': {
      // Engraved portrait oval — hatched bust silhouette.
      const rx = w * 0.26, ry = h * 0.4;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = mixHex(pal.paper, pal.accent, 0.12);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = Math.max(1.5, rx * 0.03);
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.94, ry * 0.94, 0, 0, Math.PI * 2);
      ctx.clip();
      hatch(ctx, cx - rx, cy - ry, rx * 2, ry * 2, pal.ink, ry * 0.045, 0, 0.22);
      // Bust: mysterious for Satoshi (hooded), classic otherwise.
      const hooded = n.includes('satoshi');
      ctx.fillStyle = withAlpha(pal.ink, 0.85);
      ctx.beginPath();
      if (hooded) {
        ctx.moveTo(cx - rx * 0.72, cy + ry * 0.95);
        ctx.quadraticCurveTo(cx - rx * 0.8, cy - ry * 0.4, cx, cy - ry * 0.72);
        ctx.quadraticCurveTo(cx + rx * 0.8, cy - ry * 0.4, cx + rx * 0.72, cy + ry * 0.95);
        ctx.closePath();
        ctx.fill();
        // Void where the face would be.
        ctx.fillStyle = mixHex(pal.paper, pal.accent, 0.2);
        ctx.beginPath();
        ctx.ellipse(cx, cy - ry * 0.12, rx * 0.34, ry * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = withAlpha(pal.ink, 0.85);
        ctx.beginPath();
        ctx.ellipse(cx, cy - ry * 0.06, rx * 0.3, ry * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Shoulders + head in profile-ish three-quarter.
        ctx.moveTo(cx - rx * 0.78, cy + ry * 0.95);
        ctx.quadraticCurveTo(cx - rx * 0.5, cy + ry * 0.3, cx - rx * 0.2, cy + ry * 0.26);
        ctx.quadraticCurveTo(cx - rx * 0.36, cy - ry * 0.1, cx - rx * 0.26, cy - ry * 0.34);
        ctx.quadraticCurveTo(cx - rx * 0.1, cy - ry * 0.6, cx + rx * 0.16, cy - ry * 0.52);
        ctx.quadraticCurveTo(cx + rx * 0.4, cy - ry * 0.4, cx + rx * 0.34, cy - ry * 0.08);
        ctx.quadraticCurveTo(cx + rx * 0.3, cy + ry * 0.16, cx + rx * 0.2, cy + ry * 0.26);
        ctx.quadraticCurveTo(cx + rx * 0.55, cy + ry * 0.36, cx + rx * 0.78, cy + ry * 0.95);
        ctx.closePath();
        ctx.fill();
      }
      // Engraving lines over the bust.
      ctx.globalCompositeOperation = 'destination-out';
      hatch(ctx, cx - rx, cy - ry, rx * 2, ry * 2, '#000', ry * 0.06, 0.1, 0.28);
      ctx.restore();
      break;
    }
    case 'signature': {
      // Parchment window + the cut signature itself.
      const pw = w * 0.72, ph2 = h * 0.42;
      const px = cx - pw / 2, py = cy - ph2 / 2;
      ctx.fillStyle = '#efe6c8';
      ctx.strokeStyle = withAlpha(pal.ink, 0.5);
      ctx.lineWidth = Math.max(1, w * 0.004);
      ctx.beginPath();
      // Deckled edge.
      ctx.moveTo(px, py + ph2 * 0.06);
      for (let i = 0; i <= 20; i++) {
        ctx.lineTo(px + (i / 20) * pw, py + Math.sin(i * 1.7) * ph2 * 0.02);
      }
      for (let i = 0; i <= 20; i++) {
        ctx.lineTo(px + pw - Math.sin(i * 1.3) * pw * 0.01, py + (i / 20) * ph2);
      }
      for (let i = 20; i >= 0; i--) {
        ctx.lineTo(px + (i / 20) * pw, py + ph2 - Math.sin(i * 2.1) * ph2 * 0.02);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const [first, ...rest] = spec.name.split(' — ')[0].split(' ');
      const sig = buildSignature(
        hashString(`currency-sig:${spec.name}`), first, rest.join(' '), 0,
      );
      drawSignature(ctx, sig, 'blackSharpie', px + pw * 0.08, py + ph2 * 0.18, pw * 0.84, ph2 * 0.62, false);
      break;
    }
    default: {
      // 'note' and 'vault': a miniature banknote / vault door.
      if (spec.type === 'vault') {
        const r = Math.min(w, h) * 0.38;
        const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
        g.addColorStop(0, mixHex(pal.accent, '#ffffff', 0.4));
        g.addColorStop(1, shade(pal.accent, -0.35));
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = shade(pal.accent, -0.55);
        ctx.lineWidth = Math.max(2, r * 0.06);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r * 0.18, cy + Math.sin(a) * r * 0.18);
          ctx.lineTo(cx + Math.cos(a) * r * 0.52, cy + Math.sin(a) * r * 0.52);
          ctx.lineWidth = Math.max(2, r * 0.07);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.14, 0, Math.PI * 2);
        ctx.fillStyle = shade(pal.accent, -0.55);
        ctx.fill();
        break;
      }
      const bw = w * 0.66, bh = bw * 0.44;
      const bx = cx - bw / 2, by = cy - bh / 2;
      ctx.fillStyle = mixHex(pal.paper, pal.accent, 0.14);
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = Math.max(1.2, bw * 0.008);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.strokeRect(bx + bw * 0.03, by + bh * 0.06, bw * 0.94, bh * 0.88);
      // Portrait oval in the mini note.
      ctx.beginPath();
      ctx.ellipse(cx, cy, bw * 0.1, bh * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, bw * 0.095, bh * 0.3, 0, 0, Math.PI * 2);
      ctx.clip();
      hatch(ctx, cx - bw * 0.1, cy - bh * 0.32, bw * 0.2, bh * 0.64, pal.ink, bh * 0.05, 0, 0.5);
      ctx.restore();
      // Corner denominations on the mini note.
      ctx.fillStyle = pal.ink;
      ctx.font = `900 ${bh * 0.2}px Georgia, serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const denom = spec.name.match(/hundred thousand/i) ? '100K'
        : spec.name.match(/ten thousand/i) ? '10K'
          : spec.name.match(/thousand/i) ? '1000'
            : spec.name.match(/five hundred/i) ? '500'
              : spec.name.match(/hundred/i) ? '100'
                : spec.name.match(/fifty/i) ? '50'
                  : spec.name.match(/twenty/i) ? '20'
                    : spec.name.match(/\bten\b/i) ? '10'
                      : spec.name.match(/five/i) ? '5'
                        : spec.name.match(/two/i) ? '2' : '1';
      ctx.fillText(denom, bx + bw * 0.05, by + bh * 0.1);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(denom, bx + bw * 0.95, by + bh * 0.9);
    }
  }
  ctx.restore();
}

export function renderCurrencyCard(spec: PokeCardSpec, widthPx = 750): {
  print: HTMLCanvasElement; foilMask: HTMLCanvasElement; widthPx: number; heightPx: number;
} {
  const w = widthPx;
  const h = Math.round(w / POKE_ASPECT);
  const rng = new Rng(hashString(`currency:${spec.num}:${spec.name}`));
  const pal = paletteFor(spec);
  const chase = spec.rarity === 'holo' && spec.num > spec.setSize;
  const holo = spec.rarity === 'holo';

  const print = document.createElement('canvas');
  print.width = w; print.height = h;
  const ctx = print.getContext('2d')!;
  const foilMask = document.createElement('canvas');
  foilMask.width = w; foilMask.height = h;
  const fctx = foilMask.getContext('2d')!;
  fctx.fillStyle = '#000';
  fctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, w * 0.045);
  ctx.clip();

  // Paper with aging gradient.
  const pg = ctx.createLinearGradient(0, 0, w, h);
  pg.addColorStop(0, pal.paper);
  pg.addColorStop(1, shade(pal.paper, -0.06));
  ctx.fillStyle = pg;
  ctx.fillRect(0, 0, w, h);

  // Guilloché bands top and bottom.
  drawGuilloche(ctx, w * 0.03, h * 0.03, w * 0.94, h * 0.1, pal.accent, rng);
  drawGuilloche(ctx, w * 0.03, h * 0.87, w * 0.94, h * 0.1, pal.accent, rng);
  // Side lathe rails.
  drawGuilloche(ctx, w * 0.03, h * 0.14, w * 0.07, h * 0.72, pal.accent, rng, 2);
  drawGuilloche(ctx, w * 0.9, h * 0.14, w * 0.07, h * 0.72, pal.accent, rng, 2);

  // Ornate double frame.
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = Math.max(2, w * 0.006);
  ctx.strokeRect(w * 0.03, h * 0.03, w * 0.94, h * 0.94);
  ctx.lineWidth = Math.max(1, w * 0.0025);
  ctx.strokeRect(w * 0.055, h * 0.048, w * 0.89, h * 0.904);

  // Corner rosettes with the number.
  const rr = w * 0.055;
  for (const [rx, ry] of [[w * 0.085, h * 0.075], [w * 0.915, h * 0.075], [w * 0.085, h * 0.925], [w * 0.915, h * 0.925]] as const) {
    drawRosette(ctx, rx, ry, rr, pal, String(spec.num));
  }

  // Title arch.
  ctx.fillStyle = pal.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${w * 0.037}px Georgia, "Times New Roman", serif`;
  ctx.fillText('CURRENCY', w / 2, h * 0.085);
  ctx.font = `600 ${w * 0.018}px Georgia, serif`;
  ctx.fillText('· SERIES ONE ·', w / 2, h * 0.112);

  // Center vignette panel.
  const vx = w * 0.11, vy = h * 0.155, vw = w * 0.78, vh = h * 0.52;
  ctx.fillStyle = mixHex(pal.paper, '#ffffff', 0.35);
  ctx.fillRect(vx, vy, vw, vh);
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = Math.max(1.2, w * 0.003);
  ctx.strokeRect(vx, vy, vw, vh);
  drawGuilloche(ctx, vx, vy + vh - h * 0.05, vw, h * 0.05, pal.accent, rng, 2);
  drawVignette(ctx, spec, pal, vx, vy, vw, vh - h * 0.05, rng);

  // Red serial stamps — the banknote tell.
  const serial = `${String.fromCharCode(65 + (spec.num % 24))}${String(spec.num * 7817 % 100000000).padStart(8, '0')}`;
  ctx.fillStyle = '#a02c22';
  ctx.font = `700 ${w * 0.024}px "Courier New", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(serial, w * 0.13, h * 0.72);
  ctx.textAlign = 'right';
  ctx.fillText(serial, w * 0.87, h * 0.72);

  // Name plate.
  ctx.fillStyle = pal.ink;
  ctx.textAlign = 'center';
  let namePx = w * 0.052;
  ctx.font = `900 ${namePx}px Georgia, "Times New Roman", serif`;
  const nm = spec.name.toUpperCase();
  if (ctx.measureText(nm).width > w * 0.8) {
    namePx *= (w * 0.8) / ctx.measureText(nm).width;
    ctx.font = `900 ${namePx}px Georgia, "Times New Roman", serif`;
  }
  ctx.fillText(nm, w / 2, h * 0.775);
  ctx.font = `600 italic ${w * 0.022}px Georgia, serif`;
  ctx.fillStyle = withAlpha(pal.ink, 0.75);
  const tierLine = chase ? 'REDEMPTION · ONE BITCOIN · VAULTED'
    : holo ? 'PRISM FOIL' : spec.rarity.toUpperCase();
  ctx.fillText(tierLine, w / 2, h * 0.81);

  // Microtext rule + fine print.
  ctx.font = `500 ${w * 0.011}px "Courier New", monospace`;
  ctx.fillStyle = withAlpha(pal.ink, 0.55);
  ctx.fillText('IN CARDBOARD WE TRUST · '.repeat(3), w / 2, h * 0.845);
  ctx.font = `600 ${w * 0.02}px Georgia, serif`;
  ctx.fillStyle = withAlpha(pal.ink, 0.8);
  ctx.fillText(`${spec.setYear} MINT WORKS · ${spec.num}/${spec.setSize}`, w / 2, h * 0.955);

  ctx.restore();

  // Foil: holos burn the guilloché + vignette; the chase burns everything.
  if (holo) {
    fctx.save();
    fctx.beginPath();
    (fctx as unknown as CanvasRenderingContext2D).roundRect(0, 0, w, h, w * 0.045);
    fctx.clip();
    if (chase) {
      fctx.fillStyle = 'rgb(205,205,205)';
      fctx.fillRect(0, 0, w, h);
    } else {
      fctx.fillStyle = 'rgb(80,80,80)';
      fctx.fillRect(0, 0, w, h);
      fctx.fillStyle = 'rgb(200,200,200)';
      fctx.fillRect(vx, vy, vw, vh);
      fctx.fillRect(w * 0.03, h * 0.03, w * 0.94, h * 0.1);
      fctx.fillRect(w * 0.03, h * 0.87, w * 0.94, h * 0.1);
    }
    // The name/serial/fine-print band stays cool so type never washes out.
    fctx.fillStyle = 'rgb(55,55,55)';
    fctx.fillRect(w * 0.06, h * 0.7, w * 0.88, h * 0.16);
    // Sparkle streaks.
    fctx.save();
    (fctx as unknown as CanvasRenderingContext2D).translate(w / 2, h * 0.35);
    (fctx as unknown as CanvasRenderingContext2D).rotate(-0.45);
    fctx.fillStyle = 'rgb(255,255,255)';
    for (let i = -5; i <= 5; i++) {
      fctx.fillRect(i * w * 0.13 - w * 0.01, -h, w * 0.02, h * 2);
    }
    fctx.restore();
    fctx.restore();
  }

  return { print, foilMask, widthPx: w, heightPx: h };
}

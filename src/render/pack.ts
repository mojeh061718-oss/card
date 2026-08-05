/**
 * Pack wrapper + card back rendering. Wrappers are procedurally designed per
 * product (foil crinkle, brand block, sport mark) so every series' wax looks
 * like its own retail object.
 */

import { Rng } from '../engine/rng';
import type { SeriesDef } from '../engine/cards/series';
import { shade, withAlpha, mixHex } from './color';

export function renderPackWrapper(def: SeriesDef, wPx: number, hPx: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = wPx; c.height = hPx;
  const ctx = c.getContext('2d')!;
  const rng = Rng.from(def.seed, 'wrapper');
  const hue = ['#123f77', '#7a0c0c', '#0e5135', '#4b1d78', '#b34700', '#1a1a1e'][rng.int(6)];
  const accent = ['#d9a621', '#e8e3d5', '#78b7e0', '#e0432d', '#c8c8c8'][rng.int(5)];

  // Foil base with vertical crinkle bands.
  const g = ctx.createLinearGradient(0, 0, wPx, 0);
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const l = 0.5 + Math.sin(i * 2.7 + rng.float() * 6) * 0.22;
    g.addColorStop(t, mixHex(shade(hue, l * 0.3 - 0.15), '#ffffff', Math.max(0, l - 0.55)));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, wPx, hPx);

  // Diagonal energy streaks.
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.rotate(-0.35);
  for (let i = -4; i < 14; i++) {
    ctx.fillStyle = i % 2 ? accent : '#ffffff';
    ctx.fillRect(-wPx, i * hPx * 0.12, wPx * 3, hPx * 0.018);
  }
  ctx.restore();

  // Crimped seams top and bottom.
  ctx.fillStyle = withAlpha('#000000', 0.25);
  for (const y of [0, hPx - hPx * 0.055]) {
    ctx.fillRect(0, y, wPx, hPx * 0.055);
    ctx.strokeStyle = withAlpha('#ffffff', 0.25);
    ctx.lineWidth = 1.5;
    for (let x = 0; x < wPx; x += 7) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 3.5, y + hPx * 0.055);
      ctx.stroke();
    }
  }

  // Brand block.
  const cx = wPx / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = withAlpha('#000000', 0.5);
  ctx.font = `900 ${wPx * 0.09}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.lineWidth = wPx * 0.012;
  ctx.strokeText(def.brand.toUpperCase(), cx, hPx * 0.30);
  ctx.fillText(def.brand.toUpperCase(), cx, hPx * 0.30);
  ctx.font = `900 italic ${wPx * 0.16}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.fillStyle = accent;
  ctx.strokeText(def.line.toUpperCase(), cx, hPx * 0.45);
  ctx.fillText(def.line.toUpperCase(), cx, hPx * 0.45);
  ctx.font = `700 ${wPx * 0.05}px Arial, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${def.year} ${def.sport.toUpperCase()}`, cx, hPx * 0.53);

  // Sport ball mark.
  ctx.save();
  ctx.translate(cx, hPx * 0.70);
  if (def.sport === 'football') {
    ctx.rotate(-0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, wPx * 0.16, wPx * 0.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#6b3a1f';
    ctx.fill();
    ctx.strokeStyle = '#f0ede4';
    ctx.lineWidth = wPx * 0.014;
    ctx.beginPath();
    ctx.moveTo(-wPx * 0.06, 0); ctx.lineTo(wPx * 0.06, 0);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, wPx * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = '#f3f1e8';
    ctx.fill();
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = wPx * 0.02;
    ctx.beginPath(); ctx.arc(-wPx * 0.05, 0, wPx * 0.1, -1, 1); ctx.stroke();
    ctx.beginPath(); ctx.arc(wPx * 0.05, 0, wPx * 0.1, Math.PI - 1, Math.PI + 1); ctx.stroke();
  }
  ctx.restore();

  ctx.font = `600 ${wPx * 0.038}px Arial, sans-serif`;
  ctx.fillStyle = withAlpha('#ffffff', 0.85);
  ctx.fillText(`10 CARDS PER PACK`, cx, hPx * 0.87);
  return c;
}

/** Shared card back for a series — brand pattern + logo lockup. */
export function renderCardBack(def: SeriesDef, wPx: number): HTMLCanvasElement {
  const hPx = Math.round(wPx / (2.5 / 3.5));
  const c = document.createElement('canvas');
  c.width = wPx; c.height = hPx;
  const ctx = c.getContext('2d')!;
  const rng = Rng.from(def.seed, 'cardback');
  const base = ['#123055', '#5c1c1c', '#173f2c', '#3b2160'][rng.int(4)];
  ctx.fillStyle = shade(base, -0.06);
  ctx.beginPath();
  ctx.roundRect(0, 0, wPx, hPx, wPx * 0.045);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Diamond lattice.
  ctx.strokeStyle = withAlpha('#ffffff', 0.07);
  ctx.lineWidth = 1.5;
  const s = wPx * 0.09;
  for (let x = -hPx; x < wPx + hPx; x += s) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + hPx, hPx); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - hPx, hPx); ctx.stroke();
  }
  // Center lockup.
  ctx.textAlign = 'center';
  ctx.font = `900 italic ${wPx * 0.13}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.fillStyle = withAlpha('#ffffff', 0.9);
  ctx.fillText(def.line.toUpperCase(), wPx / 2, hPx * 0.5);
  ctx.font = `700 ${wPx * 0.045}px Arial, sans-serif`;
  ctx.fillStyle = withAlpha('#ffffff', 0.5);
  ctx.fillText(def.brand.toUpperCase(), wPx / 2, hPx * 0.56);
  // Inner border.
  ctx.strokeStyle = withAlpha('#ffffff', 0.25);
  ctx.lineWidth = wPx * 0.008;
  ctx.beginPath();
  ctx.roundRect(wPx * 0.04, wPx * 0.04, wPx * 0.92, hPx - wPx * 0.08, wPx * 0.03);
  ctx.stroke();
  ctx.restore();
  return c;
}

/**
 * The break table — a top-down desk scene the rip ceremony happens on.
 *
 * Everything is drawn, nothing is a flat fill: walnut planks with grain
 * and seam shadows, a stitched breaker's mat, soft key lighting from the
 * top, and a box cutter resting where a breaker would drop it. Rendered
 * once per session at device resolution and used as a background.
 */

import { Rng, hashString } from '../engine/rng';

export function renderBreakTable(wPx: number, hPx: number, seedText: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = wPx; c.height = hPx;
  const ctx = c.getContext('2d')!;
  const rng = new Rng(hashString(`table:${seedText}`));

  // --- Walnut desk ---------------------------------------------------------
  const base = ctx.createLinearGradient(0, 0, 0, hPx);
  base.addColorStop(0, '#3b2718');
  base.addColorStop(0.5, '#4a3120');
  base.addColorStop(1, '#33210f');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, wPx, hPx);

  // Planks with grain streaks.
  const plankW = wPx / 5;
  for (let p = 0; p < 5; p++) {
    const x0 = p * plankW;
    const tone = 0.9 + rng.float() * 0.2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, plankW, hPx);
    ctx.clip();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = `rgba(${Math.round(70 * tone)}, ${Math.round(46 * tone)}, ${Math.round(26 * tone)}, 0.55)`;
    ctx.fillRect(x0, 0, plankW, hPx);
    // Grain: long wavering strokes.
    for (let g = 0; g < 26; g++) {
      const gx = x0 + rng.float() * plankW;
      const amp = 2 + rng.float() * 6;
      const ph = rng.float() * Math.PI * 2;
      ctx.strokeStyle = `rgba(${rng.chance(0.5) ? '20,12,6' : '96,66,38'}, ${0.1 + rng.float() * 0.16})`;
      ctx.lineWidth = 0.8 + rng.float() * 1.6;
      ctx.beginPath();
      for (let y = 0; y <= hPx; y += 24) {
        const px = gx + Math.sin(y / 130 + ph) * amp;
        if (y === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
      }
      ctx.stroke();
    }
    // The occasional knot.
    if (rng.chance(0.5)) {
      const kx = x0 + plankW * (0.25 + rng.float() * 0.5);
      const ky = hPx * rng.float();
      for (let r = 5; r > 0; r--) {
        ctx.beginPath();
        ctx.ellipse(kx, ky, r * 3.2, r * 2.1, 0.3, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(24,14,7,${0.12 + (5 - r) * 0.03})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
    ctx.restore();
    // Seam shadow + highlight edge.
    if (p > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fillRect(x0 - 1.5, 0, 3, hPx);
      ctx.fillStyle = 'rgba(255,220,170,0.06)';
      ctx.fillRect(x0 + 1.5, 0, 1.5, hPx);
    }
  }

  // --- Breaker's mat -------------------------------------------------------
  const mx = wPx * 0.055, my = hPx * 0.16, mw = wPx * 0.89, mh = hPx * 0.66;
  const r = wPx * 0.045;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = wPx * 0.03;
  ctx.shadowOffsetY = hPx * 0.008;
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, mh, r);
  const felt = ctx.createLinearGradient(0, my, 0, my + mh);
  felt.addColorStop(0, '#16281f');
  felt.addColorStop(1, '#0e1c15');
  ctx.fillStyle = felt;
  ctx.fill();
  ctx.restore();
  // Felt tooth: fine speckle.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, mh, r);
  ctx.clip();
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(mx + rng.float() * mw, my + rng.float() * mh, 1.4, 1.4);
  }
  // Stitched border.
  ctx.strokeStyle = 'rgba(212,160,23,0.55)';
  ctx.lineWidth = Math.max(1.5, wPx * 0.004);
  ctx.setLineDash([wPx * 0.014, wPx * 0.009]);
  ctx.beginPath();
  ctx.roundRect(mx + wPx * 0.018, my + wPx * 0.018, mw - wPx * 0.036, mh - wPx * 0.036, r * 0.7);
  ctx.stroke();
  ctx.setLineDash([]);
  // Corner brand deboss.
  ctx.font = `800 ${wPx * 0.032}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.textAlign = 'right';
  ctx.fillText('CARDBOARD BREAKS', mx + mw - wPx * 0.04, my + mh - wPx * 0.032);
  ctx.fillStyle = 'rgba(212,160,23,0.16)';
  ctx.fillText('CARDBOARD BREAKS', mx + mw - wPx * 0.04, my + mh - wPx * 0.034);
  ctx.restore();

  // --- Box cutter, resting above the mat ----------------------------------
  ctx.save();
  ctx.translate(wPx * 0.8, hPx * 0.082);
  ctx.rotate(0.22);
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = wPx * 0.012;
  ctx.shadowOffsetY = hPx * 0.004;
  // Handle.
  const hg = ctx.createLinearGradient(0, -wPx * 0.016, 0, wPx * 0.016);
  hg.addColorStop(0, '#e8b23c');
  hg.addColorStop(0.5, '#c78f1a');
  hg.addColorStop(1, '#8f6410');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.roundRect(-wPx * 0.085, -wPx * 0.017, wPx * 0.17, wPx * 0.034, wPx * 0.008);
  ctx.fill();
  // Ridges.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let i = 0; i < 6; i++) ctx.fillRect(-wPx * 0.06 + i * wPx * 0.016, -wPx * 0.013, wPx * 0.005, wPx * 0.026);
  // Blade.
  const bg = ctx.createLinearGradient(0, -wPx * 0.01, 0, wPx * 0.01);
  bg.addColorStop(0, '#f2f2f4');
  bg.addColorStop(0.55, '#b9bcc4');
  bg.addColorStop(1, '#7f838d');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(wPx * 0.085, -wPx * 0.011);
  ctx.lineTo(wPx * 0.135, -wPx * 0.011);
  ctx.lineTo(wPx * 0.152, wPx * 0.011);
  ctx.lineTo(wPx * 0.085, wPx * 0.011);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(wPx * 0.11, 0, wPx * 0.004, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- Lighting: warm key from the top, corner falloff ---------------------
  const key = ctx.createRadialGradient(wPx / 2, hPx * 0.28, wPx * 0.1, wPx / 2, hPx * 0.5, hPx * 0.75);
  key.addColorStop(0, 'rgba(255,225,170,0.1)');
  key.addColorStop(0.55, 'rgba(255,225,170,0.02)');
  key.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = key;
  ctx.fillRect(0, 0, wPx, hPx);

  return c;
}

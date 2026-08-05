/**
 * Graded slab rendering — the trophy object. Acrylic holder + company label
 * band around the card art. Drawn onto a canvas from a pre-rendered card
 * still so slabs work anywhere (binder, reveal, market).
 */

import type { GradingCompany, GradeResult } from '../engine/condition/grading';
import { withAlpha } from './color';

export interface SlabLabel {
  player: string;
  seriesLine: string;   // "2027 Pinnacle Press Chromium"
  tierLine: string;     // "Superfractor 1/1 · Auto"
}

export async function renderSlab(
  cardStillUrl: string,
  company: GradingCompany,
  grade: GradeResult,
  label: SlabLabel,
  wPx = 720,
): Promise<HTMLCanvasElement> {
  const cardW = wPx * 0.82;
  const cardH = cardW / (2.5 / 3.5);
  const labelH = wPx * 0.30;
  const pad = (wPx - cardW) / 2;
  const hPx = labelH + cardH + pad * 2.4;

  const c = document.createElement('canvas');
  c.width = wPx; c.height = hPx;
  const ctx = c.getContext('2d')!;

  // Acrylic body.
  const body = ctx.createLinearGradient(0, 0, wPx, hPx);
  body.addColorStop(0, '#2a2c34');
  body.addColorStop(0.5, '#1b1c22');
  body.addColorStop(1, '#26272f');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(0, 0, wPx, hPx, wPx * 0.05);
  ctx.fill();
  // Edge highlight.
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(2, 2, wPx - 4, hPx - 4, wPx * 0.047);
  ctx.stroke();

  // Label band.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(pad * 0.7, pad * 0.7, wPx - pad * 1.4, labelH, wPx * 0.02);
  ctx.clip();
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(0, 0, wPx, hPx);
  ctx.fillStyle = company.color;
  ctx.fillRect(pad * 0.7, pad * 0.7, wPx - pad * 1.4, labelH * 0.24);
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${labelH * 0.15}px "Arial Narrow", Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(company.name.toUpperCase(), pad * 1.1, pad * 0.7 + labelH * 0.12);
  ctx.textAlign = 'right';
  ctx.font = `600 ${labelH * 0.1}px Arial, sans-serif`;
  ctx.fillText(`CERT ${grade.certNo}`, wPx - pad * 1.1, pad * 0.7 + labelH * 0.12);
  // Card identity.
  ctx.textAlign = 'left';
  ctx.fillStyle = '#16161a';
  ctx.font = `800 ${labelH * 0.16}px Arial, sans-serif`;
  ctx.fillText(label.player.toUpperCase(), pad * 1.1, pad * 0.7 + labelH * 0.44);
  ctx.font = `600 ${labelH * 0.105}px Arial, sans-serif`;
  ctx.fillStyle = 'rgba(22,22,26,0.75)';
  ctx.fillText(label.seriesLine, pad * 1.1, pad * 0.7 + labelH * 0.62);
  ctx.fillText(label.tierLine, pad * 1.1, pad * 0.7 + labelH * 0.78);
  // The number.
  ctx.textAlign = 'right';
  ctx.fillStyle = company.color;
  ctx.font = `900 ${labelH * 0.42}px "Arial Narrow", Arial, sans-serif`;
  ctx.fillText(
    grade.overall === 10 ? '10' : grade.overall.toFixed(1).replace('.0', ''),
    wPx - pad * 1.1, pad * 0.7 + labelH * 0.56,
  );
  ctx.font = `700 ${labelH * 0.085}px Arial, sans-serif`;
  ctx.fillText(
    grade.gem ? company.gemName : gradeWord(grade.overall),
    wPx - pad * 1.1, pad * 0.7 + labelH * 0.84,
  );
  ctx.restore();

  // Subgrades strip (companies that show them).
  if (company.subgrades) {
    const subs = grade.subs;
    const entries: [string, number][] = [
      ['CENT', subs.centering], ['CORN', subs.corners],
      ['EDGE', subs.edges], ['SURF', subs.surface],
    ];
    ctx.font = `700 ${labelH * 0.075}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    entries.forEach(([k, v], i) => {
      const x = pad * 1.4 + i * ((wPx - pad * 2.8) / 3);
      ctx.fillStyle = 'rgba(244,241,232,0.55)';
      ctx.fillText(k, x, pad * 0.7 + labelH * 1.12);
      ctx.fillStyle = '#f4f1e8';
      ctx.font = `900 ${labelH * 0.095}px Arial, sans-serif`;
      ctx.fillText(v.toFixed(1).replace('.0', ''), x, pad * 0.7 + labelH * 1.24);
      ctx.font = `700 ${labelH * 0.075}px Arial, sans-serif`;
    });
  }

  // Card window.
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = cardStillUrl;
  });
  const cy = labelH + pad * (company.subgrades ? 1.7 : 1.3);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = pad * 0.5;
  ctx.drawImage(img, pad, cy, cardW, cardH);
  ctx.restore();
  // Acrylic glare across the window.
  const glare = ctx.createLinearGradient(pad, cy, pad + cardW, cy + cardH);
  glare.addColorStop(0, 'rgba(255,255,255,0.12)');
  glare.addColorStop(0.18, 'rgba(255,255,255,0)');
  glare.addColorStop(0.82, 'rgba(255,255,255,0)');
  glare.addColorStop(1, withAlpha('#ffffff', 0.08));
  ctx.fillStyle = glare;
  ctx.fillRect(pad, cy, cardW, cardH);

  return c;
}

function gradeWord(g: number): string {
  if (g >= 9.5) return 'GEM MINT';
  if (g >= 9) return 'MINT';
  if (g >= 8) return 'NM-MT';
  if (g >= 7) return 'NEAR MINT';
  if (g >= 6) return 'EX-MT';
  if (g >= 5) return 'EXCELLENT';
  return 'VG';
}

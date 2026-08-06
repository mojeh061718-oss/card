/**
 * Sourcing-lead illustrations — the little drawn objects on the HUNT list.
 * Each lot kind gets a real object (a taped-up garage box, an estate crate,
 * a shoebox, a storage tote, a dealer's glass case) painted with the same
 * gradient-and-shadow language as the break table and mailer, so the list
 * reads as things you could pick up, not letter chips.
 */

import { Rng, hashString } from '../engine/rng';

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Loose cards poking out of a container mouth. */
function looseCards(ctx: CanvasRenderingContext2D, cx: number, cy: number, u: number, rng: Rng) {
  for (let i = 0; i < 4; i++) {
    const a = -0.5 + i * 0.26 + (rng.float() - 0.5) * 0.12;
    ctx.save();
    ctx.translate(cx + (i - 1.5) * u * 0.13, cy);
    ctx.rotate(a);
    const cw = u * 0.16, chh = u * 0.22;
    ctx.fillStyle = i % 2 ? '#e8e2d2' : '#d9d2bf';
    ctx.fillRect(-cw / 2, -chh, cw, chh);
    ctx.strokeStyle = 'rgba(60,45,25,0.5)';
    ctx.lineWidth = Math.max(1, u * 0.012);
    ctx.strokeRect(-cw / 2, -chh, cw, chh);
    // tiny picture window
    ctx.fillStyle = ['#7a95b8', '#b87a7a', '#88a878', '#b8a361'][i];
    ctx.fillRect(-cw / 2 + cw * 0.15, -chh + chh * 0.14, cw * 0.7, chh * 0.42);
    ctx.restore();
  }
}

export function renderLotArt(kind: string, px: number, seedText: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const ctx = c.getContext('2d')!;
  const rng = new Rng(hashString(`lot:${kind}:${seedText}`));
  const u = px;

  ctx.save();
  // Soft ground shadow every object sits on.
  const gy = u * 0.86;
  const ground = ctx.createRadialGradient(u / 2, gy, 0, u / 2, gy, u * 0.42);
  ground.addColorStop(0, 'rgba(0,0,0,0.4)');
  ground.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ground;
  ctx.save();
  ctx.translate(u / 2, gy);
  ctx.scale(1, 0.22);
  ctx.translate(-u / 2, -gy);
  ctx.beginPath();
  ctx.arc(u / 2, gy, u * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (kind === 'garageSale' || kind === 'shoebox') {
    // Cardboard box (garage) / shoebox — warm kraft tones, taped or lidded.
    const bw = u * 0.72, bh = u * (kind === 'shoebox' ? 0.42 : 0.52);
    const bx = (u - bw) / 2, by = u * 0.84 - bh;
    const kraft = kind === 'shoebox' ? '#8a6f4d' : '#b08a55';
    const body = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    body.addColorStop(0, kraft);
    body.addColorStop(0.5, `${kind === 'shoebox' ? '#9d8059' : '#c39a61'}`);
    body.addColorStop(1, kraft);
    roundRectPath(ctx, bx, by, bw, bh, u * 0.02);
    ctx.fillStyle = body;
    ctx.fill();
    // Cards spilling from the mouth, behind the front face rim.
    looseCards(ctx, u / 2, by + u * 0.04, u, rng);
    // Open flaps angled out.
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.translate(u / 2 + dir * bw * 0.5, by + u * 0.015);
      ctx.rotate(dir * 0.5);
      const fw = bw * 0.34, fh = u * 0.05;
      const fg = ctx.createLinearGradient(0, -fh, 0, fh);
      fg.addColorStop(0, '#caa268');
      fg.addColorStop(1, '#8f6e40');
      ctx.fillStyle = fg;
      ctx.fillRect(dir === -1 ? -fw : 0, -fh / 2, fw, fh);
      ctx.restore();
    }
    // Front rim highlight.
    ctx.fillStyle = 'rgba(255,235,200,0.35)';
    ctx.fillRect(bx, by, bw, u * 0.015);
    // Side crease + edge shading.
    ctx.fillStyle = 'rgba(60,40,15,0.25)';
    ctx.fillRect(bx + bw * 0.72, by, u * 0.012, bh);
    if (kind === 'shoebox') {
      // Lid ajar on top.
      ctx.save();
      ctx.translate(u / 2, by - u * 0.008);
      ctx.rotate(-0.1);
      const lw = bw * 1.06, lh = u * 0.1;
      const lg = ctx.createLinearGradient(0, -lh, 0, 0);
      lg.addColorStop(0, '#a5855e');
      lg.addColorStop(1, '#77573a');
      ctx.fillStyle = lg;
      roundRectPath(ctx, -lw / 2, -lh, lw, lh, u * 0.015);
      ctx.fill();
      ctx.restore();
    } else {
      // Packing tape + marker scrawl.
      ctx.fillStyle = 'rgba(220,214,190,0.5)';
      ctx.fillRect(bx + bw * 0.12, by + bh * 0.3, bw * 0.76, u * 0.05);
      ctx.fillStyle = 'rgba(40,32,26,0.75)';
      ctx.font = `italic 700 ${u * 0.11}px "Comic Sans MS", "Marker Felt", cursive, sans-serif`;
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(u / 2, by + bh * 0.66);
      ctx.rotate(-0.04);
      ctx.fillText('CARDS', 0, 0);
      ctx.restore();
    }
  } else if (kind === 'estate') {
    // Dark wooden crate with brass corners — old money.
    const bw = u * 0.7, bh = u * 0.5;
    const bx = (u - bw) / 2, by = u * 0.84 - bh;
    const wood = ctx.createLinearGradient(0, by, 0, by + bh);
    wood.addColorStop(0, '#5a3b22');
    wood.addColorStop(1, '#38220f');
    roundRectPath(ctx, bx, by, bw, bh, u * 0.02);
    ctx.fillStyle = wood;
    ctx.fill();
    looseCards(ctx, u / 2, by + u * 0.03, u, rng);
    // Plank lines + grain.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, u * 0.01);
    for (const t of [0.33, 0.66]) {
      ctx.beginPath();
      ctx.moveTo(bx, by + bh * t);
      ctx.lineTo(bx + bw, by + bh * t);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,220,170,0.12)';
    ctx.fillRect(bx, by, bw, u * 0.012);
    // Brass corner plates.
    ctx.fillStyle = '#c9a244';
    for (const [cx2, cy2] of [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]] as const) {
      ctx.save();
      ctx.translate(cx2, cy2);
      ctx.fillRect(-u * 0.045, -u * 0.045, u * 0.09, u * 0.09);
      ctx.restore();
    }
    // Keyhole plate front-center.
    ctx.fillStyle = '#c9a244';
    roundRectPath(ctx, u / 2 - u * 0.05, by + bh * 0.42, u * 0.1, u * 0.12, u * 0.015);
    ctx.fill();
    ctx.fillStyle = '#2a1a0a';
    ctx.beginPath();
    ctx.arc(u / 2, by + bh * 0.48, u * 0.018, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'storageUnit') {
    // Plastic tote — cold blue, ribbed, snapped lid.
    const bw = u * 0.74, bh = u * 0.46;
    const bx = (u - bw) / 2, by = u * 0.84 - bh;
    const tote = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    tote.addColorStop(0, '#31597a');
    tote.addColorStop(0.5, '#457aa3');
    tote.addColorStop(1, '#2c5271');
    roundRectPath(ctx, bx, by, bw, bh, u * 0.03);
    ctx.fillStyle = tote;
    ctx.fill();
    // Ribs.
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, u * 0.014);
    for (let i = 1; i <= 4; i++) {
      const rx = bx + (bw / 5) * i;
      ctx.beginPath();
      ctx.moveTo(rx, by + u * 0.06);
      ctx.lineTo(rx, by + bh - u * 0.03);
      ctx.stroke();
    }
    // Lid with snap handles.
    const lg = ctx.createLinearGradient(0, by - u * 0.1, 0, by + u * 0.02);
    lg.addColorStop(0, '#dfe5ea');
    lg.addColorStop(1, '#9fb0bd');
    roundRectPath(ctx, bx - u * 0.03, by - u * 0.09, bw + u * 0.06, u * 0.11, u * 0.02);
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.fillStyle = '#8fa2b0';
    for (const hx of [bx + u * 0.02, bx + bw - u * 0.1]) {
      roundRectPath(ctx, hx, by - u * 0.035, u * 0.08, u * 0.05, u * 0.01);
      ctx.fill();
    }
  } else {
    // dealerTable (and fallback): glass display case with slabs inside.
    const bw = u * 0.76, bh = u * 0.42;
    const bx = (u - bw) / 2, by = u * 0.84 - bh;
    // Case body.
    const body = ctx.createLinearGradient(0, by, 0, by + bh);
    body.addColorStop(0, '#2a2d33');
    body.addColorStop(1, '#17191d');
    roundRectPath(ctx, bx, by, bw, bh, u * 0.02);
    ctx.fillStyle = body;
    ctx.fill();
    // Glass top, angled sheen.
    const glass = ctx.createLinearGradient(bx, by, bx + bw, by + bh * 0.5);
    glass.addColorStop(0, 'rgba(160,200,230,0.35)');
    glass.addColorStop(0.5, 'rgba(160,200,230,0.12)');
    glass.addColorStop(1, 'rgba(160,200,230,0.28)');
    roundRectPath(ctx, bx + u * 0.02, by + u * 0.02, bw - u * 0.04, bh * 0.52, u * 0.015);
    ctx.fillStyle = glass;
    ctx.fill();
    // Slabbed cards standing in the case.
    for (let i = 0; i < 3; i++) {
      const sx = bx + bw * (0.2 + i * 0.28);
      const sw = u * 0.13, sh = u * 0.18;
      ctx.save();
      ctx.translate(sx, by + bh * 0.5);
      ctx.rotate(-0.06 + i * 0.05);
      ctx.fillStyle = 'rgba(230,238,244,0.85)';
      roundRectPath(ctx, -sw / 2, -sh, sw, sh, u * 0.012);
      ctx.fill();
      ctx.fillStyle = ['#a33f3f', '#3f6ba3', '#3fa35e'][i];
      ctx.fillRect(-sw * 0.32, -sh * 0.72, sw * 0.64, sh * 0.5);
      ctx.fillStyle = '#c9a244';
      ctx.fillRect(-sw / 2, -sh, sw, sh * 0.14);
      ctx.restore();
    }
    // Front lip highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(bx, by + bh * 0.56, bw, u * 0.012);
  }

  // One warm key light over everything.
  const key = ctx.createLinearGradient(0, 0, 0, u);
  key.addColorStop(0, 'rgba(255,230,180,0.1)');
  key.addColorStop(0.6, 'rgba(0,0,0,0)');
  key.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = key;
  ctx.fillRect(0, 0, u, u);
  ctx.restore();
  return c;
}

/**
 * Pack wrapper + card back rendering. Wrappers are procedurally designed per
 * product (foil crinkle, brand block, sport mark) so every series' wax looks
 * like its own retail object.
 */

import { Rng } from '../engine/rng';
import type { SeriesDef } from '../engine/cards/series';
import { shade, withAlpha, mixHex } from './color';
import { tcgScan, heroPhoto } from './photodb';

/**
 * TCG booster wrap composed from the CACHED OFFICIAL SCANS: the featured
 * art is cropped straight out of the real card's art window, so a Base
 * Set booster shows the actual Charizard/Blastoise/Venusaur wrap arts.
 * `variant` rotates the featured card (each pack in a box differs).
 * Falls back to the generic wrapper when no scan is cached yet.
 */
const WRAP_ART: Record<string, { setKey: string; nums: number[]; deep: string; accent: string; title: string }> = {
  'tcg-base': { setKey: 'base', nums: [4, 2, 15], deep: '#0b2d5c', accent: '#ffd75e', title: 'BASE SET' },
  'tcg-151': { setKey: '151', nums: [199, 151, 150], deep: '#5c0b14', accent: '#ffd75e', title: 'POKEMON 151' },
};

function renderTcgWrapper(
  def: SeriesDef, wPx: number, hPx: number, variant: number,
  art: HTMLImageElement, conf: (typeof WRAP_ART)[string],
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = wPx; c.height = hPx;
  const ctx = c.getContext('2d')!;
  const rng = Rng.from(def.seed, `wrap:${variant}`);

  // Mylar base in the set's deep color, with crinkle sheen.
  const g = ctx.createLinearGradient(0, 0, wPx, 0);
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const l = 0.5 + Math.sin(i * 2.7 + rng.float() * 6) * 0.22;
    g.addColorStop(t, mixHex(shade(conf.deep, l * 0.3 - 0.15), '#ffffff', Math.max(0, l - 0.62)));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, wPx, hPx);

  // Specular sweep.
  const sweep = ctx.createLinearGradient(0, 0, wPx, hPx * 0.6);
  sweep.addColorStop(0.42, 'rgba(255,255,255,0)');
  sweep.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  sweep.addColorStop(0.58, 'rgba(255,255,255,0)');
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, wPx, hPx);

  // Featured art: the real card's art window, cover-cropped into a big
  // center panel. Standard frame art window ≈ x 11–89%, y 10.5–46%.
  const ax = art.naturalWidth * 0.115, ay = art.naturalHeight * 0.105;
  const aw = art.naturalWidth * 0.77, ah = art.naturalHeight * 0.355;
  const px = wPx * 0.07, py = hPx * 0.30, pw = wPx * 0.86, ph = hPx * 0.42;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, wPx * 0.03);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = wPx * 0.05;
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();
  ctx.clip();
  const cover = Math.max(pw / aw, ph / ah);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    art, ax, ay, aw, ah,
    px + (pw - aw * cover) / 2, py + (ph - ah * cover) / 2, aw * cover, ah * cover,
  );
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, wPx * 0.03);
  ctx.strokeStyle = conf.accent;
  ctx.lineWidth = Math.max(2, wPx * 0.012);
  ctx.stroke();

  // Brand block above the art.
  ctx.textAlign = 'center';
  ctx.font = `900 italic ${wPx * 0.15}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  const metal = ctx.createLinearGradient(0, hPx * 0.12, 0, hPx * 0.2);
  metal.addColorStop(0, mixHex(conf.accent, '#ffffff', 0.65));
  metal.addColorStop(0.5, conf.accent);
  metal.addColorStop(1, shade(conf.accent, -0.25));
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = wPx * 0.02;
  ctx.fillStyle = metal;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = wPx * 0.012;
  ctx.strokeText(conf.title, wPx / 2, hPx * 0.17);
  ctx.fillText(conf.title, wPx / 2, hPx * 0.17);
  ctx.restore();
  ctx.font = `700 ${wPx * 0.045}px Arial, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('TRADING CARD GAME', wPx / 2, hPx * 0.225);

  // 1st Edition stamp for the vintage wrap.
  if (def.id === 'tcg-base') {
    ctx.save();
    ctx.translate(wPx * 0.14, hPx * 0.78);
    ctx.rotate(-0.12);
    ctx.beginPath();
    ctx.arc(0, 0, wPx * 0.085, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.strokeStyle = conf.accent;
    ctx.lineWidth = wPx * 0.01;
    ctx.stroke();
    ctx.fillStyle = conf.accent;
    ctx.font = `900 ${wPx * 0.055}px Georgia, serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('1', 0, -wPx * 0.005);
    ctx.font = `700 ${wPx * 0.022}px Arial, sans-serif`;
    ctx.fillText('EDITION', 0, wPx * 0.045);
    ctx.restore();
  }

  // Crimped seams.
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

  ctx.font = `600 ${wPx * 0.04}px Arial, sans-serif`;
  ctx.fillStyle = withAlpha('#ffffff', 0.9);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('11 ADDITIONAL TRADING CARDS', wPx / 2, hPx * 0.9);
  return c;
}

export function renderPackWrapper(
  def: SeriesDef, wPx: number, hPx: number, variant = 0,
  cover?: { first: string; last: string; sport: string }[],
): HTMLCanvasElement {
  // A REAL sealed-pack photo (imported into the cache) beats everything:
  // draw it full-bleed and it IS the pack.
  if (def.id.startsWith('tcg-')) {
    const wrapKey = `wrap-${def.id.replace('tcg-', '')}`;
    const real = [variant % 3, 0, 1, 2]
      .map(v => tcgScan(wrapKey, v))
      .find(Boolean);
    if (real) {
      const c0 = document.createElement('canvas');
      c0.width = wPx; c0.height = hPx;
      const cctx = c0.getContext('2d')!;
      cctx.imageSmoothingQuality = 'high';
      const cov = Math.max(wPx / real.naturalWidth, hPx / real.naturalHeight);
      cctx.drawImage(
        real,
        (wPx - real.naturalWidth * cov) / 2, (hPx - real.naturalHeight * cov) / 2,
        real.naturalWidth * cov, real.naturalHeight * cov,
      );
      // Specular sheen so the photo reads as foil in-scene.
      const sh = cctx.createLinearGradient(0, 0, wPx, hPx * 0.6);
      sh.addColorStop(0.42, 'rgba(255,255,255,0)');
      sh.addColorStop(0.5, 'rgba(255,255,255,0.16)');
      sh.addColorStop(0.58, 'rgba(255,255,255,0)');
      cctx.fillStyle = sh;
      cctx.fillRect(0, 0, wPx, hPx);
      return c0;
    }
  }

  // TCG wraps prefer the real scan art when the cache has it.
  const conf = WRAP_ART[def.id];
  if (conf) {
    const num = conf.nums[Math.abs(variant) % conf.nums.length];
    const art = tcgScan(conf.setKey, num) ?? conf.nums.map(n => tcgScan(conf.setKey, n)).find(Boolean);
    if (art) return renderTcgWrapper(def, wPx, hPx, variant, art, conf);
  }
  const c = document.createElement('canvas');
  c.width = wPx; c.height = hPx;
  const ctx = c.getContext('2d')!;
  const rng = Rng.from(def.seed, 'wrapper');
  const hue = ['#123f77', '#7a0c0c', '#0e5135', '#4b1d78', '#b34700', '#1a1a1e'][rng.int(6)];
  const accent = ['#d9a621', '#e8e3d5', '#78b7e0', '#e0432d', '#c8c8c8'][rng.int(5)];
  const cx0 = wPx / 2;

  // Foil base with vertical crinkle bands.
  const g = ctx.createLinearGradient(0, 0, wPx, 0);
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const l = 0.5 + Math.sin(i * 2.7 + rng.float() * 6) * 0.22;
    g.addColorStop(t, mixHex(shade(hue, l * 0.3 - 0.15), '#ffffff', Math.max(0, l - 0.55)));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, wPx, hPx);

  // Specular sweep — the hot mirror band that makes mylar look like mylar.
  const sweep = ctx.createLinearGradient(0, 0, wPx, hPx * 0.6);
  sweep.addColorStop(0, 'rgba(255,255,255,0)');
  sweep.addColorStop(0.42, 'rgba(255,255,255,0)');
  sweep.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  sweep.addColorStop(0.58, 'rgba(255,255,255,0)');
  sweep.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, wPx, hPx);

  // Fine vertical brushing — packaging texture, not decoration.
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  for (let x = 0; x < wPx; x += 5) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, hPx);
    ctx.stroke();
  }
  ctx.restore();

  // =========================================================================
  // Retail composition, reference: modern hobby packs — edge hash stripes,
  // a bright inner art panel with thin white frame lines, TWO cover
  // athletes breaking the frames, a big center product badge, corner
  // league chips, and a bottom callout banner.
  // =========================================================================
  const lightPanel = mixHex(mixHex(hue, '#4fa3e0', 0.35), '#ffffff', 0.5);

  // Edge hash-stripe rails.
  for (const [rx0, rw] of [[0, wPx * 0.075], [wPx * 0.925, wPx * 0.075]] as const) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx0, 0, rw, hPx);
    ctx.clip();
    ctx.translate(rx0 + rw / 2, hPx / 2);
    ctx.rotate(-0.65);
    for (let i = -40; i < 40; i++) {
      ctx.fillStyle = i % 2 ? withAlpha('#ffffff', 0.22) : withAlpha(shade(hue, 0.25), 0.3);
      ctx.fillRect(-hPx, i * hPx * 0.028, hPx * 2, hPx * 0.012);
    }
    ctx.restore();
  }

  // Inner art panel: bright tint, rounded, with DOUBLE thin white frames.
  const px2 = wPx * 0.1, py2 = hPx * 0.155, pw2 = wPx * 0.8, ph2 = hPx * 0.63;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px2, py2, pw2, ph2, wPx * 0.03);
  const panel = ctx.createLinearGradient(0, py2, 0, py2 + ph2);
  panel.addColorStop(0, mixHex(lightPanel, '#ffffff', 0.25));
  panel.addColorStop(1, lightPanel);
  ctx.fillStyle = panel;
  ctx.fill();
  ctx.clip();
  // Soft radial pop behind the athletes.
  const pop = ctx.createRadialGradient(cx0, py2 + ph2 * 0.4, 0, cx0, py2 + ph2 * 0.4, pw2 * 0.65);
  pop.addColorStop(0, withAlpha('#ffffff', 0.55));
  pop.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = pop;
  ctx.fillRect(px2, py2, pw2, ph2);

  // The cover athletes — up to two, flanking, breaking past the frames.
  const photos = (cover ?? [])
    .map(cv => heroPhoto(cv.sport, `${cv.first} ${cv.last}`))
    .filter((p): p is HTMLImageElement => !!p)
    .slice(0, 2);
  ctx.imageSmoothingQuality = 'high';
  photos.forEach((photo, i) => {
    const solo = photos.length === 1;
    // Athletes FILL the panel — scale by height so busts run frame to
    // frame like the reference, overlapping the middle where the badge sits.
    const opaquePhoto = photo.naturalWidth <= photo.naturalHeight;
    const targetH = ph2 * (solo ? 0.96 : opaquePhoto ? 0.72 : 0.9);
    const sc = targetH / photo.naturalHeight;
    const dw = photo.naturalWidth * sc, dh = photo.naturalHeight * sc;
    const anchorX = solo ? cx0 : (i === 0 ? px2 + pw2 * 0.27 : px2 + pw2 * 0.73);
    const anchorY = py2 + ph2 * (solo ? 0.99 : i === 0 ? 1.0 : 0.965);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = wPx * 0.03;
    ctx.shadowOffsetY = hPx * 0.006;
    if (opaquePhoto) {
      // Studio headshot: rounded portrait chip with a bottom fade.
      const cw = dw, ch = dh;
      ctx.beginPath();
      ctx.roundRect(anchorX - cw / 2, anchorY - ch, cw, ch, wPx * 0.02);
      ctx.save();
      ctx.clip();
      ctx.drawImage(photo, anchorX - cw / 2, anchorY - ch, cw, ch);
      const fd = ctx.createLinearGradient(0, anchorY - ch * 0.25, 0, anchorY);
      fd.addColorStop(0, 'rgba(0,0,0,0)');
      fd.addColorStop(1, withAlpha(lightPanel, 0.95));
      ctx.fillStyle = fd;
      ctx.fillRect(anchorX - cw / 2, anchorY - ch, cw, ch);
      ctx.restore();
    } else {
      ctx.drawImage(photo, anchorX - dw / 2, anchorY - dh, dw, dh);
    }
    ctx.restore();
  });
  if (photos.length === 0) {
    // Pre-import: clean embossed monogram inside the panel.
    ctx.font = `900 italic ${pw2 * 0.5}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = withAlpha(shade(hue, -0.2), 0.35);
    ctx.lineWidth = wPx * 0.007;
    ctx.strokeText(def.line[0].toUpperCase(), cx0, py2 + ph2 * 0.44);
    ctx.fillStyle = withAlpha('#ffffff', 0.5);
    ctx.fillText(def.line[0].toUpperCase(), cx0, py2 + ph2 * 0.44);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  // Double white frame lines over everything in the panel zone.
  for (const inset of [0, wPx * 0.018]) {
    ctx.beginPath();
    ctx.roundRect(px2 + inset, py2 + inset, pw2 - inset * 2, ph2 - inset * 2, wPx * 0.028);
    ctx.strokeStyle = withAlpha('#ffffff', inset === 0 ? 0.95 : 0.7);
    ctx.lineWidth = Math.max(1.2, wPx * (inset === 0 ? 0.006 : 0.0035));
    ctx.stroke();
  }

  // Top: brand plate (gold bar) + spec line + corner league chips.
  const plateW = wPx * 0.34, plateH = hPx * 0.036;
  ctx.beginPath();
  ctx.roundRect(cx0 - plateW / 2, hPx * 0.062, plateW, plateH, plateH * 0.25);
  ctx.fillStyle = '#e8c11c';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = `900 ${plateH * 0.62}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1d1405';
  ctx.fillText(def.brand.toUpperCase(), cx0, hPx * 0.062 + plateH * 0.55, plateW * 0.92);
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 ${wPx * 0.042}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.fillStyle = '#ffffff';
  const specLine = def.id.startsWith('tcg-')
    ? `${def.year} TRADING CARDS`
    : `${def.year} ${def.sport === 'football' ? 'FOOTBALL' : 'BASEBALL'} TRADING CARDS`;
  ctx.fillText(specLine, cx0, hPx * 0.128);
  for (const [chipX, label] of [[wPx * 0.12, def.sport === 'football' ? 'FB' : 'BB'], [wPx * 0.88, 'PRO']] as const) {
    const chipR = wPx * 0.048;
    ctx.beginPath();
    ctx.roundRect(chipX - chipR, hPx * 0.052 - chipR, chipR * 2, chipR * 2, chipR * 0.4);
    ctx.fillStyle = 'rgba(8,8,14,0.8)';
    ctx.fill();
    ctx.strokeStyle = withAlpha('#ffffff', 0.6);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.font = `900 ${chipR * 0.72}px Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, chipX, hPx * 0.052 + chipR * 0.06);
    ctx.textBaseline = 'alphabetic';
  }

  // Center product badge — the big rounded plate carrying the line mark.
  const bw3 = wPx * 0.4, bh3 = hPx * 0.19;
  const bx3 = cx0 - bw3 / 2, by3 = py2 + ph2 * 0.5;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = wPx * 0.03;
  ctx.beginPath();
  ctx.roundRect(bx3, by3, bw3, bh3, wPx * 0.035);
  const badge = ctx.createLinearGradient(0, by3, 0, by3 + bh3);
  badge.addColorStop(0, '#15151c');
  badge.addColorStop(1, '#060609');
  ctx.fillStyle = badge;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(bx3, by3, bw3, bh3, wPx * 0.035);
  ctx.strokeStyle = withAlpha('#ffffff', 0.85);
  ctx.lineWidth = Math.max(1.5, wPx * 0.006);
  ctx.stroke();
  ctx.font = `800 ${bh3 * 0.16}px Arial, sans-serif`;
  ctx.fillStyle = withAlpha('#ffffff', 0.85);
  ctx.fillText(def.brand.toUpperCase(), cx0, by3 + bh3 * 0.22, bw3 * 0.85);
  const mark = ctx.createLinearGradient(0, by3 + bh3 * 0.24, 0, by3 + bh3 * 0.78);
  mark.addColorStop(0, '#ffffff');
  mark.addColorStop(0.5, '#c9ccd4');
  mark.addColorStop(1, '#82868f');
  ctx.font = `900 italic ${bh3 * 0.52}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.fillStyle = mark;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = bh3 * 0.03;
  ctx.strokeText(def.line[0].toUpperCase(), cx0, by3 + bh3 * 0.62);
  ctx.fillText(def.line[0].toUpperCase(), cx0, by3 + bh3 * 0.62);
  // Line-name strip along the badge foot.
  ctx.fillStyle = mixHex(accent, '#ffffff', 0.15);
  ctx.fillRect(bx3 + bw3 * 0.06, by3 + bh3 * 0.72, bw3 * 0.88, bh3 * 0.17);
  ctx.font = `900 ${bh3 * 0.12}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.fillStyle = '#0d0d12';
  ctx.fillText(def.line.toUpperCase(), cx0, by3 + bh3 * 0.845, bw3 * 0.8);

  // Card-count badge, bottom right of the panel.
  const cbW = wPx * 0.16, cbH = hPx * 0.085;
  const cbX = px2 + pw2 - cbW * 0.7, cbY = py2 + ph2 - cbH * 0.55;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = wPx * 0.02;
  ctx.beginPath();
  ctx.roundRect(cbX, cbY, cbW, cbH, wPx * 0.02);
  ctx.fillStyle = '#f4f2ec';
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = '#12121a';
  ctx.font = `900 ${cbH * 0.44}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.fillText('10', cbX + cbW / 2, cbY + cbH * 0.44);
  ctx.font = `800 ${cbH * 0.17}px Arial, sans-serif`;
  ctx.fillText('CARDS', cbX + cbW / 2, cbY + cbH * 0.65);
  ctx.fillText('PER PACK', cbX + cbW / 2, cbY + cbH * 0.84);

  // Bottom callout banner.
  const banY = hPx * 0.845, banH = hPx * 0.062;
  ctx.fillStyle = 'rgba(8,8,12,0.92)';
  ctx.fillRect(wPx * 0.06, banY, wPx * 0.88, banH);
  ctx.strokeStyle = withAlpha('#ffffff', 0.3);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(wPx * 0.06, banY, wPx * 0.88, banH);
  ctx.font = `900 ${banH * 0.34}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.fillStyle = '#e8e02c';
  ctx.fillText('LOOK FOR EXCLUSIVE ROOKIES', cx0, banY + banH * 0.42, wPx * 0.8);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('& REFRACTOR PARALLELS!', cx0, banY + banH * 0.8, wPx * 0.8);
  ctx.textAlign = 'center';
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

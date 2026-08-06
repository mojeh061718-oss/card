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
  cover?: { first: string; last: string; sport: string },
): HTMLCanvasElement {
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

  // --- Lockup: brand small, line big and metallic, spec line under -------
  ctx.textAlign = 'center';
  ctx.fillStyle = withAlpha('#ffffff', 0.85);
  ctx.font = `800 ${wPx * 0.055}px Arial, sans-serif`;
  ctx.fillText(def.brand.toUpperCase(), cx0, hPx * 0.135);
  const metal = ctx.createLinearGradient(0, hPx * 0.155, 0, hPx * 0.235);
  metal.addColorStop(0, mixHex(accent, '#ffffff', 0.7));
  metal.addColorStop(0.5, accent);
  metal.addColorStop(1, shade(accent, -0.3));
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = wPx * 0.018;
  ctx.shadowOffsetY = wPx * 0.006;
  ctx.font = `900 italic ${wPx * 0.135}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.fillStyle = metal;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = wPx * 0.01;
  ctx.strokeText(def.line.toUpperCase(), cx0, hPx * 0.215);
  ctx.fillText(def.line.toUpperCase(), cx0, hPx * 0.215);
  ctx.restore();
  ctx.font = `700 ${wPx * 0.04}px Arial, sans-serif`;
  ctx.fillStyle = withAlpha('#ffffff', 0.7);
  ctx.fillText(`${def.year} ${def.sport.toUpperCase()} · PREMIUM TRADING CARDS`, cx0, hPx * 0.262);

  // --- Cover athlete panel — the presentation IS the product -------------
  const px2 = wPx * 0.09, py2 = hPx * 0.315, pw2 = wPx * 0.82, ph2 = hPx * 0.5;
  const photo = cover ? heroPhoto(cover.sport, `${cover.first} ${cover.last}`) : null;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px2, py2, pw2, ph2, wPx * 0.035);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = wPx * 0.04;
  const panel = ctx.createLinearGradient(0, py2, 0, py2 + ph2);
  panel.addColorStop(0, shade(hue, -0.25));
  panel.addColorStop(1, shade(hue, -0.55));
  ctx.fillStyle = panel;
  ctx.fill();
  ctx.restore();
  ctx.clip();
  if (photo) {
    // Stage light behind the athlete.
    const glow = ctx.createRadialGradient(cx0, py2 + ph2 * 0.42, 0, cx0, py2 + ph2 * 0.42, pw2 * 0.6);
    glow.addColorStop(0, withAlpha(mixHex(accent, '#ffffff', 0.5), 0.5));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(px2, py2, pw2, ph2);
    ctx.imageSmoothingQuality = 'high';
    const landscapeCutout = photo.naturalWidth > photo.naturalHeight;
    if (landscapeCutout) {
      // ESPN-style transparent bust: contain-fit, anchored to the panel foot.
      const sc = Math.min((pw2 * 0.96) / photo.naturalWidth, (ph2 * 0.9) / photo.naturalHeight);
      const dw = photo.naturalWidth * sc, dh = photo.naturalHeight * sc;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = wPx * 0.03;
      ctx.drawImage(photo, cx0 - dw / 2, py2 + ph2 - dh, dw, dh);
      ctx.restore();
    } else {
      // Studio headshot: cover-crop, then dissolve into the panel foot.
      const sc = Math.max(pw2 / photo.naturalWidth, ph2 / photo.naturalHeight);
      const dw = photo.naturalWidth * sc, dh = photo.naturalHeight * sc;
      ctx.drawImage(photo, cx0 - dw / 2, py2 + (ph2 - dh) * 0.2, dw, dh);
      const fade = ctx.createLinearGradient(0, py2 + ph2 * 0.72, 0, py2 + ph2);
      fade.addColorStop(0, 'rgba(0,0,0,0)');
      fade.addColorStop(1, withAlpha(shade(hue, -0.55), 0.95));
      ctx.fillStyle = fade;
      ctx.fillRect(px2, py2, pw2, ph2);
    }
  } else {
    // Pre-import: clean embossed monogram — packaging, never a cartoon.
    ctx.font = `900 italic ${pw2 * 0.42}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = withAlpha(accent, 0.35);
    ctx.lineWidth = wPx * 0.006;
    ctx.strokeText(def.line[0].toUpperCase(), cx0, py2 + ph2 * 0.46);
    ctx.fillStyle = withAlpha('#ffffff', 0.06);
    ctx.fillText(def.line[0].toUpperCase(), cx0, py2 + ph2 * 0.46);
    ctx.font = `700 ${wPx * 0.036}px Arial, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = withAlpha('#ffffff', 0.45);
    ctx.fillText('OFFICIAL SERIES', cx0, py2 + ph2 * 0.8);
  }
  ctx.restore();
  // Panel keyline.
  ctx.beginPath();
  ctx.roundRect(px2, py2, pw2, ph2, wPx * 0.035);
  ctx.strokeStyle = withAlpha(accent, 0.9);
  ctx.lineWidth = Math.max(1.5, wPx * 0.008);
  ctx.stroke();

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

  ctx.font = `600 ${wPx * 0.038}px Arial, sans-serif`;
  ctx.fillStyle = withAlpha('#ffffff', 0.85);
  ctx.textAlign = 'center';
  ctx.fillText('10 CARDS PER PACK', cx0, hPx * 0.895);
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

/**
 * Creature TCG concept renderer — PRIVATE CONCEPT, NOT WIRED INTO THE GAME.
 *
 * Draws a classic-90s-style trading card frame (yellow border, beveled art
 * window, attack box, energy dots) around a procedurally drawn ORIGINAL
 * placeholder creature — a seeded mascot-blob with type-driven features.
 * No copyrighted artwork is drawn or bundled; the checklist names come from
 * the concept preset, and the lab can alternatively show real card scans
 * fetched at runtime from a public CDN as plain <img> tags.
 *
 * Output matches the sports press: { print, foilMask } canvases that feed
 * the same WebGL foil compositor, so holo rares shimmer like everything
 * else in the game.
 */

import { Rng } from '../engine/rng';
import { shade, withAlpha, mixHex } from './color';
import { hashString } from '../engine/rng';

export interface PokeCardSpec {
  name: string;
  type: string;          // fire | water | grass | lightning | psychic | fighting | colorless | trainer
  rarity: 'common' | 'uncommon' | 'rare' | 'holo';
  hp: number | null;
  kind: 'creature' | 'trainer' | 'energy' | 'artifact';
  num: number;
  setName: string;
  setSize: number;
  setYear: number;
}

export const POKE_ASPECT = 2.5 / 3.5;

const TYPE_COLORS: Record<string, { main: string; deep: string; glow: string }> = {
  fire:      { main: '#e4633c', deep: '#8a2f16', glow: '#ffc36a' },
  water:     { main: '#4f92d6', deep: '#1c4a86', glow: '#9fd8ff' },
  grass:     { main: '#63bc5a', deep: '#2c6b2b', glow: '#c8f09a' },
  lightning: { main: '#e8c23b', deep: '#8a6d10', glow: '#fff2a8' },
  psychic:   { main: '#a56bc8', deep: '#5a2f7e', glow: '#ecc8ff' },
  fighting:  { main: '#c07a45', deep: '#6e3d1c', glow: '#ffd9a8' },
  colorless: { main: '#b0aa9d', deep: '#5e594f', glow: '#f4efe2' },
  trainer:   { main: '#8f9aa8', deep: '#454e5a', glow: '#dde6f0' },
};

function colorsOf(type: string) {
  return TYPE_COLORS[type] ?? TYPE_COLORS.colorless;
}

/** Small filled energy symbol — a colored orb with a type glyph hint. */
function energyOrb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, type: string): void {
  const c = colorsOf(type);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.15, x, y, r);
  g.addColorStop(0, shade(c.main, 0.18));
  g.addColorStop(1, shade(c.main, -0.12));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.strokeStyle = shade(c.deep, -0.05);
  ctx.stroke();
  // Type glyph, kept abstract.
  ctx.fillStyle = withAlpha('#ffffff', 0.85);
  ctx.beginPath();
  if (type === 'fire') {
    ctx.moveTo(x, y - r * 0.55);
    ctx.quadraticCurveTo(x + r * 0.5, y - r * 0.05, x, y + r * 0.55);
    ctx.quadraticCurveTo(x - r * 0.5, y - r * 0.05, x, y - r * 0.55);
  } else if (type === 'water') {
    ctx.moveTo(x, y - r * 0.55);
    ctx.quadraticCurveTo(x + r * 0.48, y + r * 0.25, x, y + r * 0.55);
    ctx.quadraticCurveTo(x - r * 0.48, y + r * 0.25, x, y - r * 0.55);
  } else if (type === 'grass') {
    ctx.ellipse(x, y, r * 0.5, r * 0.28, -0.7, 0, Math.PI * 2);
  } else if (type === 'lightning') {
    ctx.moveTo(x + r * 0.1, y - r * 0.55);
    ctx.lineTo(x - r * 0.32, y + r * 0.1);
    ctx.lineTo(x - r * 0.02, y + r * 0.1);
    ctx.lineTo(x - r * 0.1, y + r * 0.55);
    ctx.lineTo(x + r * 0.32, y - r * 0.1);
    ctx.lineTo(x + r * 0.02, y - r * 0.1);
  } else if (type === 'psychic') {
    ctx.arc(x, y, r * 0.42, 0.6, Math.PI * 2 + 0.1);
  } else if (type === 'fighting') {
    ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
  } else {
    // colorless star
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? r * 0.52 : r * 0.2;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  if (type === 'psychic') {
    ctx.strokeStyle = withAlpha('#ffffff', 0.85);
    ctx.lineWidth = r * 0.18;
    ctx.stroke();
  } else {
    ctx.fill();
  }
}

/**
 * The placeholder creature: an ORIGINAL seeded mascot — body blob, big
 * eyes, and type-driven appendages. Deliberately its own character, not a
 * copy of anyone's; it exists so the frame reads as a finished card until
 * (or unless) real art is dropped into the window at runtime.
 */
function drawCreature(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number, type: string, seed: bigint,
): void {
  const rng = new Rng(seed);
  const c = colorsOf(type);
  const bodyHue = mixHex(c.main, '#ffffff', rng.float() * 0.18);
  const bodyR = size * (0.3 + rng.float() * 0.05);
  const headR = bodyR * (0.62 + rng.float() * 0.14);
  const headY = cy - bodyR * 0.85;
  const squish = 0.86 + rng.float() * 0.2;

  // Ground shadow.
  ctx.beginPath();
  ctx.ellipse(cx, cy + bodyR * 0.95, bodyR * 1.15, bodyR * 0.22, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10, 8, 20, 0.25)';
  ctx.fill();

  const paint = (path: () => void, base: string) => {
    path();
    const g = ctx.createRadialGradient(
      cx - bodyR * 0.5, headY - headR * 0.4, size * 0.05,
      cx, cy, size * 0.75,
    );
    g.addColorStop(0, shade(base, 0.16));
    g.addColorStop(0.55, base);
    g.addColorStop(1, shade(base, -0.2));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, size * 0.012);
    ctx.strokeStyle = shade(base, -0.38);
    ctx.stroke();
  };

  // Tail / back appendage behind the body.
  if (type === 'fire') {
    // Flame tail.
    const tx = cx + bodyR * 1.15, ty = cy + bodyR * 0.1;
    for (const [s, col] of [[1, c.main], [0.62, c.glow]] as const) {
      ctx.beginPath();
      ctx.moveTo(tx - bodyR * 0.3 * s, ty + bodyR * 0.3 * s);
      ctx.quadraticCurveTo(tx + bodyR * 0.7 * s, ty - bodyR * 0.1 * s, tx + bodyR * 0.25 * s, ty - bodyR * 0.9 * s);
      ctx.quadraticCurveTo(tx + bodyR * 0.05 * s, ty - bodyR * 0.3 * s, tx - bodyR * 0.3 * s, ty + bodyR * 0.3 * s);
      ctx.fillStyle = col;
      ctx.fill();
    }
  } else if (type === 'water') {
    paint(() => {
      ctx.beginPath();
      ctx.ellipse(cx + bodyR * 1.15, cy + bodyR * 0.15, bodyR * 0.5, bodyR * 0.26, 0.6, 0, Math.PI * 2);
    }, shade(bodyHue, -0.05));
  } else if (type === 'lightning') {
    ctx.beginPath();
    const tx = cx + bodyR * 1.05, ty = cy;
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + bodyR * 0.5, ty - bodyR * 0.35);
    ctx.lineTo(tx + bodyR * 0.35, ty - bodyR * 0.1);
    ctx.lineTo(tx + bodyR * 0.85, ty - bodyR * 0.45);
    ctx.lineTo(tx + bodyR * 0.45, ty + bodyR * 0.15);
    ctx.closePath();
    ctx.fillStyle = c.glow;
    ctx.fill();
    ctx.strokeStyle = shade(c.main, -0.25);
    ctx.lineWidth = size * 0.01;
    ctx.stroke();
  } else if (type === 'colorless' || type === 'psychic') {
    paint(() => {
      ctx.beginPath();
      ctx.ellipse(cx + bodyR * 1.1, cy + bodyR * 0.2, bodyR * 0.42, bodyR * 0.2, 0.5, 0, Math.PI * 2);
    }, bodyHue);
  }

  // Body.
  paint(() => {
    ctx.beginPath();
    ctx.ellipse(cx, cy, bodyR * squish, bodyR, 0, 0, Math.PI * 2);
  }, bodyHue);

  // Belly patch.
  ctx.beginPath();
  ctx.ellipse(cx, cy + bodyR * 0.25, bodyR * 0.55 * squish, bodyR * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(mixHex(bodyHue, '#fff8e8', 0.75), 0.9);
  ctx.fill();

  // Feet.
  for (const side of [-1, 1]) {
    paint(() => {
      ctx.beginPath();
      ctx.ellipse(cx + side * bodyR * 0.55, cy + bodyR * 0.85, bodyR * 0.3, bodyR * 0.18, 0, 0, Math.PI * 2);
    }, shade(bodyHue, -0.04));
  }

  // Head.
  paint(() => {
    ctx.beginPath();
    ctx.ellipse(cx, headY, headR * 1.06, headR, 0, 0, Math.PI * 2);
  }, bodyHue);

  // Type appendages on the head.
  if (type === 'grass') {
    // Leaf sprout + frill.
    for (const [ang, len] of [[-0.5, 1], [0.15, 1.25], [0.75, 0.95]] as const) {
      ctx.save();
      ctx.translate(cx, headY - headR * 0.8);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.ellipse(0, -headR * 0.45 * len, headR * 0.16, headR * 0.5 * len, 0, 0, Math.PI * 2);
      ctx.fillStyle = shade(c.main, -0.12);
      ctx.fill();
      ctx.restore();
    }
  } else if (type === 'fire') {
    for (const side of [-1, 0, 1]) {
      ctx.beginPath();
      const bx = cx + side * headR * 0.45;
      ctx.moveTo(bx - headR * 0.16, headY - headR * 0.7);
      ctx.quadraticCurveTo(bx + side * headR * 0.15, headY - headR * 1.5, bx + headR * 0.16, headY - headR * 0.7);
      ctx.closePath();
      ctx.fillStyle = side === 0 ? c.glow : c.main;
      ctx.fill();
    }
  } else if (type === 'lightning') {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      const bx = cx + side * headR * 0.6;
      ctx.moveTo(bx - side * headR * 0.2, headY - headR * 0.55);
      ctx.lineTo(bx + side * headR * 0.18, headY - headR * 1.45);
      ctx.lineTo(bx + side * headR * 0.32, headY - headR * 0.5);
      ctx.closePath();
      ctx.fillStyle = shade(bodyHue, -0.02);
      ctx.fill();
      ctx.strokeStyle = shade(bodyHue, -0.35);
      ctx.lineWidth = size * 0.008;
      ctx.stroke();
      // Dark tip.
      ctx.beginPath();
      ctx.moveTo(bx + side * headR * 0.02, headY - headR * 1.1);
      ctx.lineTo(bx + side * headR * 0.18, headY - headR * 1.45);
      ctx.lineTo(bx + side * headR * 0.26, headY - headR * 1.0);
      ctx.closePath();
      ctx.fillStyle = '#2b2b31';
      ctx.fill();
    }
  } else if (type === 'water') {
    for (const side of [-1, 1]) {
      paint(() => {
        ctx.beginPath();
        ctx.ellipse(cx + side * headR * 0.95, headY - headR * 0.15, headR * 0.3, headR * 0.16, side * 0.5, 0, Math.PI * 2);
      }, shade(bodyHue, -0.05));
    }
  } else if (type === 'psychic') {
    // Aura rings.
    ctx.strokeStyle = withAlpha(c.glow, 0.65);
    ctx.lineWidth = size * 0.012;
    for (const rr of [1.35, 1.6]) {
      ctx.beginPath();
      ctx.ellipse(cx, headY + headR * 0.2, headR * rr, headR * rr * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (type === 'fighting') {
    // Headband.
    ctx.beginPath();
    ctx.rect(cx - headR * 1.02, headY - headR * 0.45, headR * 2.04, headR * 0.28);
    ctx.fillStyle = shade(c.deep, 0.05);
    ctx.fill();
  } else {
    // Colorless: round ears.
    for (const side of [-1, 1]) {
      paint(() => {
        ctx.beginPath();
        ctx.arc(cx + side * headR * 0.62, headY - headR * 0.75, headR * 0.3, 0, Math.PI * 2);
      }, bodyHue);
    }
  }

  // Face: big glossy eyes, tiny mouth, blush.
  const eyeY = headY + headR * 0.02;
  for (const side of [-1, 1]) {
    const ex = cx + side * headR * 0.42;
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, headR * 0.19, headR * 0.24, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#241d20';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + headR * 0.06, eyeY - headR * 0.08, headR * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex - headR * 0.04, eyeY + headR * 0.06, headR * 0.03, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
    // Blush.
    ctx.beginPath();
    ctx.ellipse(ex + side * headR * 0.28, eyeY + headR * 0.3, headR * 0.13, headR * 0.08, 0, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha('#ff8a7a', 0.4);
    ctx.fill();
  }
  ctx.strokeStyle = '#241d20';
  ctx.lineWidth = Math.max(1.2, size * 0.008);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.1, headY + headR * 0.42);
  ctx.quadraticCurveTo(cx, headY + headR * 0.52, cx + headR * 0.12, headY + headR * 0.42);
  ctx.stroke();
}

/** Type-themed backdrop inside the art window. */
function drawHabitat(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  type: string, seed: bigint,
): void {
  const rng = new Rng(seed);
  const c = colorsOf(type);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, mixHex(c.glow, '#ffffff', 0.25));
  g.addColorStop(0.55, c.main);
  g.addColorStop(1, c.deep);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  // Radiating glow behind the subject.
  const rg = ctx.createRadialGradient(x + w / 2, y + h * 0.55, 0, x + w / 2, y + h * 0.55, w * 0.55);
  rg.addColorStop(0, withAlpha('#ffffff', 0.5));
  rg.addColorStop(1, withAlpha('#ffffff', 0));
  ctx.fillStyle = rg;
  ctx.fillRect(x, y, w, h);

  // Ambient specks: embers / bubbles / spores / sparks / stars.
  for (let i = 0; i < 26; i++) {
    const px = x + rng.float() * w;
    const py = y + rng.float() * h;
    const r = w * (0.004 + rng.float() * 0.01);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(rng.chance(0.5) ? '#ffffff' : c.glow, 0.25 + rng.float() * 0.4);
    ctx.fill();
  }
  // Ground band.
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h * 1.02, w * 0.75, h * 0.18, 0, Math.PI, Math.PI * 2);
  ctx.fillStyle = withAlpha(shade(c.deep, -0.08), 0.85);
  ctx.fill();
}

export interface PokeLayers {
  print: HTMLCanvasElement;
  foilMask: HTMLCanvasElement;
  widthPx: number;
  heightPx: number;
}

export function renderPokeCard(spec: PokeCardSpec, widthPx = 660): PokeLayers {
  const w = widthPx;
  const h = Math.round(w / POKE_ASPECT);
  const seed = hashString(`poke:${spec.setName}:${spec.num}:${spec.name}`);
  const c = colorsOf(spec.type);

  const print = document.createElement('canvas');
  print.width = w; print.height = h;
  const ctx = print.getContext('2d')!;
  const foilMask = document.createElement('canvas');
  foilMask.width = w; foilMask.height = h;
  const fctx = foilMask.getContext('2d')!;
  fctx.fillStyle = '#000';
  fctx.fillRect(0, 0, w, h);

  const corner = w * 0.045;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, corner);
  ctx.clip();

  // Classic yellow border with a subtle top-lit gradient.
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#ffd94e');
  bg.addColorStop(1, '#e0ac26');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Inner frame panel in type color, woven texture.
  const bx = w * 0.055, by = w * 0.055;
  const iw = w - bx * 2, ih = h - by * 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(bx, by, iw, ih, corner * 0.5);
  ctx.clip();
  const pg = ctx.createLinearGradient(bx, by, bx + iw, by + ih);
  pg.addColorStop(0, shade(c.main, 0.1));
  pg.addColorStop(1, shade(c.main, -0.12));
  ctx.fillStyle = pg;
  ctx.fillRect(bx, by, iw, ih);
  // Diagonal weave.
  ctx.strokeStyle = withAlpha('#ffffff', 0.07);
  ctx.lineWidth = w * 0.006;
  for (let d = -h; d < w + h; d += w * 0.03) {
    ctx.beginPath();
    ctx.moveTo(bx + d, by);
    ctx.lineTo(bx + d - ih, by + ih);
    ctx.stroke();
  }
  ctx.restore();

  // ---- Header: name + HP ----
  const headY = by + ih * 0.015;
  const nameSize = w * 0.062;
  ctx.textBaseline = 'middle';
  const isCreature = spec.kind === 'creature';
  ctx.font = `700 ${nameSize}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'left';
  const nameX = bx + iw * 0.03;
  const hpText = isCreature && spec.hp ? `${spec.hp} HP` : '';
  ctx.font = `800 ${nameSize * 0.82}px Georgia, serif`;
  const hpW = hpText ? ctx.measureText(hpText).width + w * 0.075 : w * 0.02;
  // Fit the name by shrinking, never squishing.
  let px = nameSize;
  ctx.font = `700 ${px}px Georgia, serif`;
  const availName = iw - (nameX - bx) - hpW - iw * 0.04;
  const m = ctx.measureText(spec.name).width;
  if (m > availName) {
    px = Math.max(11, px * (availName / m));
    ctx.font = `700 ${px}px Georgia, serif`;
  }
  ctx.fillStyle = '#1c1408';
  ctx.fillText(spec.name, nameX, headY + w * 0.045);
  if (hpText) {
    ctx.font = `800 ${nameSize * 0.82}px Georgia, serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#b3121e';
    ctx.fillText(hpText, bx + iw - w * 0.07, headY + w * 0.045);
    energyOrb(ctx, bx + iw - w * 0.036, headY + w * 0.045, w * 0.026, spec.type);
  }

  // ---- Art window ----
  const aw = iw * 0.9;
  const ax = bx + (iw - aw) / 2;
  const ay = by + ih * 0.085;
  const ah = ih * 0.42;
  // Gold bevel.
  ctx.save();
  ctx.translate(ax, ay);
  const bevel = w * 0.012;
  ctx.fillStyle = '#8a6d1f';
  ctx.fillRect(-bevel, -bevel, aw + bevel * 2, ah + bevel * 2);
  const bevelG = ctx.createLinearGradient(0, -bevel, 0, ah + bevel);
  bevelG.addColorStop(0, '#f5e28f');
  bevelG.addColorStop(1, '#9a7a24');
  ctx.strokeStyle = bevelG;
  ctx.lineWidth = bevel;
  ctx.strokeRect(-bevel / 2, -bevel / 2, aw + bevel, ah + bevel);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(ax, ay, aw, ah);
  ctx.clip();
  if (spec.kind === 'energy') {
    drawHabitat(ctx, ax, ay, aw, ah, spec.type, seed);
    energyOrb(ctx, ax + aw / 2, ay + ah / 2, aw * 0.2, spec.type);
  } else if (spec.kind === 'trainer') {
    drawHabitat(ctx, ax, ay, aw, ah, 'trainer', seed);
    // Item glyph: a satchel-ish rounded box with a cross.
    const gx = ax + aw / 2, gy = ay + ah / 2;
    ctx.beginPath();
    ctx.roundRect(gx - aw * 0.13, gy - aw * 0.1, aw * 0.26, aw * 0.2, aw * 0.04);
    ctx.fillStyle = '#e8e3d5';
    ctx.fill();
    ctx.strokeStyle = '#454e5a';
    ctx.lineWidth = w * 0.008;
    ctx.stroke();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(gx - aw * 0.02, gy - aw * 0.06, aw * 0.04, aw * 0.12);
    ctx.fillRect(gx - aw * 0.06, gy - aw * 0.02, aw * 0.12, aw * 0.04);
  } else {
    drawHabitat(ctx, ax, ay, aw, ah, spec.type, seed);
    drawCreature(ctx, ax + aw / 2, ay + ah * 0.62, Math.min(aw, ah) * 1.05, spec.type, seed);
  }
  ctx.restore();

  // Holo rares: the art window burns on the foil layer (classic cosmos
  // holo look via the existing GL finishes).
  if (spec.rarity === 'holo') {
    fctx.fillStyle = 'rgb(235,235,235)';
    fctx.fillRect(ax, ay, aw, ah);
  }

  // ---- Species line ----
  const spY = ay + ah + ih * 0.012;
  ctx.fillStyle = withAlpha('#fff6d8', 0.9);
  ctx.beginPath();
  ctx.roundRect(ax, spY, aw, ih * 0.045, w * 0.01);
  ctx.fill();
  ctx.strokeStyle = '#8a6d1f';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = `italic 600 ${w * 0.026}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#3a2c10';
  const speciesLine = spec.kind === 'creature'
    ? `Basic Creature · ${spec.setName} No. ${spec.num}`
    : spec.kind === 'trainer' ? 'Trainer — play it, then discard it' : 'Basic Energy';
  ctx.fillText(speciesLine, ax + aw / 2, spY + ih * 0.024, aw * 0.94);

  // ---- Attack box ----
  const atY = spY + ih * 0.065;
  const atH = ih * 0.3;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(ax, atY, aw, atH, w * 0.012);
  ctx.fillStyle = withAlpha('#fffdf4', 0.92);
  ctx.fill();
  ctx.strokeStyle = '#b39336';
  ctx.lineWidth = w * 0.004;
  ctx.stroke();
  ctx.clip();

  const rng = new Rng(seed);
  if (spec.kind === 'creature') {
    const verbs = ['Pounce', 'Gnaw', 'Tail Whip', 'Headbutt', 'Rush', 'Tackle'];
    const bigVerbs: Record<string, string[]> = {
      fire: ['Flame Burst', 'Cinder Storm', 'Scorch'],
      water: ['Tidal Slam', 'Bubble Jet', 'Riptide'],
      grass: ['Vine Lash', 'Spore Cloud', 'Leaf Blade'],
      lightning: ['Thunder Jolt', 'Static Arc', 'Volt Crash'],
      psychic: ['Mind Bend', 'Dream Eater', 'Psy Wave'],
      fighting: ['Mega Punch', 'Cross Chop', 'Low Sweep'],
      colorless: ['Body Slam', 'Comet Dash', 'Wild Swing'],
    };
    const attacks = [
      { cost: 1, name: rng.pick(verbs), dmg: 10 + rng.int(2) * 10 },
      { cost: 2 + rng.int(2), name: rng.pick(bigVerbs[spec.type] ?? bigVerbs.colorless), dmg: 30 + rng.int(4) * 10 },
    ];
    let rowY = atY + atH * 0.26;
    for (const atk of attacks) {
      let ox = ax + aw * 0.05;
      for (let i = 0; i < atk.cost; i++) {
        energyOrb(ctx, ox + w * 0.02, rowY, w * 0.022, i === 0 ? spec.type : 'colorless');
        ox += w * 0.052;
      }
      ctx.font = `700 ${w * 0.042}px Georgia, serif`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1c1408';
      ctx.fillText(atk.name, ax + aw * 0.28, rowY, aw * 0.5);
      ctx.font = `800 ${w * 0.05}px Georgia, serif`;
      ctx.textAlign = 'right';
      ctx.fillText(String(atk.dmg), ax + aw * 0.95, rowY);
      rowY += atH * 0.44;
    }
    // Divider.
    ctx.strokeStyle = withAlpha('#8a6d1f', 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax + aw * 0.04, atY + atH * 0.5);
    ctx.lineTo(ax + aw * 0.96, atY + atH * 0.5);
    ctx.stroke();
  } else {
    // Trainer/energy flavor text.
    ctx.font = `italic 500 ${w * 0.032}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#3a3020';
    const flavor = spec.kind === 'trainer'
      ? ['A well-timed item wins games', 'the table judges silently.']
      : ['Raw elemental power,', 'bottled for the road.'];
    ctx.fillText(flavor[0], ax + aw / 2, atY + atH * 0.38, aw * 0.9);
    ctx.fillText(flavor[1], ax + aw / 2, atY + atH * 0.62, aw * 0.9);
  }
  ctx.restore();

  // ---- Bottom row: weakness / resistance / retreat ----
  if (spec.kind === 'creature') {
    const wrY = atY + atH + ih * 0.035;
    ctx.font = `600 ${w * 0.024}px Georgia, serif`;
    ctx.fillStyle = '#2a2110';
    ctx.textAlign = 'left';
    ctx.fillText('weakness', ax, wrY);
    const weakType = spec.type === 'fire' ? 'water' : spec.type === 'water' ? 'lightning'
      : spec.type === 'grass' ? 'fire' : spec.type === 'lightning' ? 'fighting'
      : spec.type === 'fighting' ? 'psychic' : spec.type === 'psychic' ? 'psychic' : 'fighting';
    energyOrb(ctx, ax + w * 0.135, wrY, w * 0.019, weakType);
    ctx.fillText('retreat', ax + aw * 0.62, wrY);
    const retreat = 1 + rng.int(3);
    for (let i = 0; i < retreat; i++) {
      energyOrb(ctx, ax + aw * 0.74 + i * w * 0.045, wrY, w * 0.019, 'colorless');
    }
  }

  // ---- Footer: credit, set number, rarity symbol ----
  const footY = by + ih - ih * 0.022;
  ctx.font = `italic 600 ${w * 0.022}px Georgia, serif`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#3a2c10';
  ctx.fillText(`Illus. Cardboard Press · ${spec.setYear} Concept`, bx + iw * 0.03, footY);
  ctx.textAlign = 'right';
  ctx.font = `700 ${w * 0.024}px Georgia, serif`;
  ctx.fillText(`${spec.num}/${spec.setSize}`, bx + iw - iw * 0.07, footY);
  // Rarity symbol.
  const rx = bx + iw - iw * 0.035, ry = footY;
  ctx.fillStyle = '#1c1408';
  ctx.beginPath();
  if (spec.rarity === 'common') {
    ctx.arc(rx, ry, w * 0.011, 0, Math.PI * 2);
  } else if (spec.rarity === 'uncommon') {
    ctx.moveTo(rx, ry - w * 0.013);
    ctx.lineTo(rx + w * 0.013, ry);
    ctx.lineTo(rx, ry + w * 0.013);
    ctx.lineTo(rx - w * 0.013, ry);
    ctx.closePath();
  } else {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? w * 0.015 : w * 0.006;
      const sx = rx + Math.cos(a) * rad, sy = ry + Math.sin(a) * rad;
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.closePath();
  }
  ctx.fill();

  return { print, foilMask, widthPx: w, heightPx: h };
}

/**
 * Procedural city skyline for Downtown-style inserts.
 *
 * Built as three depth bands — haze, mid, foreground — each drawn from the
 * team's city seed so a franchise's skyline is the same landmark every time
 * it appears. Buildings are flat geometric slabs with window grids and a
 * few silhouette crowns (spire, setback, dome), which is how the illustrated
 * inserts render a city: recognizable shapes, no photographic detail.
 */

import { Rng } from '../engine/rng';
import { shade, withAlpha, mixHex } from './color';

export interface SkylinePalette {
  sky: [string, string];
  haze: string;
  mid: string;
  front: string;
  glass: string;
  accent: string;
}

/** City palettes read as time-of-day; the accent is the team's own color. */
export function skylinePalette(rng: Rng, accent: string): SkylinePalette {
  const moods: SkylinePalette[] = [
    { // warm dusk — the classic Downtown look
      sky: ['#f2e2c8', '#cfe0e6'], haze: '#d9c4a3', mid: '#c9a878',
      front: '#8fb8c4', glass: '#7ba8bd', accent,
    },
    { // cool morning
      sky: ['#dfe9f2', '#f4efe4'], haze: '#b9cddb', mid: '#9db9cc',
      front: '#cbb08a', glass: '#8fb2c9', accent,
    },
    { // golden hour
      sky: ['#f6d9a8', '#e9b98a'], haze: '#dcae7f', mid: '#c08a5c',
      front: '#7fa2b5', glass: '#6f97ab', accent,
    },
  ];
  return rng.pick(moods);
}

type Crown = 'flat' | 'spire' | 'setback' | 'dome' | 'slant';

interface Building {
  x: number; w: number; h: number;
  crown: Crown;
  color: string;
  windows: boolean;
}

function band(
  rng: Rng, count: number, color: string, minH: number, maxH: number,
  windows: boolean,
): Building[] {
  const out: Building[] = [];
  let x = -0.06;
  for (let i = 0; i < count; i++) {
    const w = 0.06 + rng.float() * 0.1;
    out.push({
      x, w,
      h: minH + rng.float() * (maxH - minH),
      crown: rng.pickWeighted<Crown>(
        ['flat', 'spire', 'setback', 'dome', 'slant'],
        [5, 1.4, 2, 0.8, 1.2],
      ),
      color,
      windows,
    });
    x += w * (0.82 + rng.float() * 0.3);
    if (x > 1.06) break;
  }
  return out;
}

function drawBuilding(
  ctx: CanvasRenderingContext2D, b: Building,
  w: number, h: number, groundY: number, glass: string,
): void {
  const bx = b.x * w;
  const bw = b.w * w;
  const topY = groundY - b.h * h;

  ctx.fillStyle = b.color;
  ctx.beginPath();
  switch (b.crown) {
    case 'setback': {
      // Stepped art-deco shoulders.
      const inset = bw * 0.16;
      ctx.moveTo(bx, groundY);
      ctx.lineTo(bx, topY + h * 0.05);
      ctx.lineTo(bx + inset, topY + h * 0.05);
      ctx.lineTo(bx + inset, topY);
      ctx.lineTo(bx + bw - inset, topY);
      ctx.lineTo(bx + bw - inset, topY + h * 0.05);
      ctx.lineTo(bx + bw, topY + h * 0.05);
      ctx.lineTo(bx + bw, groundY);
      break;
    }
    case 'slant':
      ctx.moveTo(bx, groundY);
      ctx.lineTo(bx, topY + h * 0.04);
      ctx.lineTo(bx + bw, topY);
      ctx.lineTo(bx + bw, groundY);
      break;
    case 'dome':
      ctx.moveTo(bx, groundY);
      ctx.lineTo(bx, topY);
      ctx.arc(bx + bw / 2, topY, bw / 2, Math.PI, 0);
      ctx.lineTo(bx + bw, groundY);
      break;
    default:
      ctx.rect(bx, topY, bw, groundY - topY);
  }
  ctx.closePath();
  ctx.fill();

  // Spire mast — the landmark silhouette.
  if (b.crown === 'spire') {
    ctx.fillRect(bx + bw * 0.44, topY - h * 0.09, bw * 0.12, h * 0.09);
    ctx.fillRect(bx + bw * 0.485, topY - h * 0.135, bw * 0.03, h * 0.05);
    // Antenna cross-bracing, the detail that sells a real tower.
    ctx.strokeStyle = withAlpha(shade(b.color, -0.25), 0.8);
    ctx.lineWidth = Math.max(1, w * 0.003);
    ctx.beginPath();
    ctx.moveTo(bx + bw * 0.44, topY);
    ctx.lineTo(bx + bw * 0.56, topY - h * 0.045);
    ctx.moveTo(bx + bw * 0.56, topY);
    ctx.lineTo(bx + bw * 0.44, topY - h * 0.045);
    ctx.stroke();
  }

  if (!b.windows) return;

  // Window grid, clipped to the building footprint.
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx, topY, bw, groundY - topY);
  ctx.clip();
  const cols = Math.max(2, Math.round(bw / (w * 0.016)));
  const colW = bw / cols;
  const rowH = h * 0.022;
  ctx.fillStyle = withAlpha(glass, 0.55);
  for (let c = 0; c < cols; c++) {
    for (let y = topY + rowH * 1.2; y < groundY - rowH; y += rowH * 1.9) {
      ctx.fillRect(bx + c * colW + colW * 0.28, y, colW * 0.44, rowH * 0.9);
    }
  }
  // Vertical mullions read as structure at thumbnail size.
  ctx.strokeStyle = withAlpha(shade(b.color, -0.16), 0.5);
  ctx.lineWidth = Math.max(0.6, w * 0.0016);
  for (let c = 1; c < cols; c++) {
    ctx.beginPath();
    ctx.moveTo(bx + c * colW, topY);
    ctx.lineTo(bx + c * colW, groundY);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Paint sky, clouds and skyline into the rect. `groundFrac` is where the
 * street line sits, as a fraction of height.
 */
export function drawSkyline(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, seed: bigint, accent: string, groundFrac = 0.84,
): void {
  const rng = new Rng(seed);
  const pal = skylinePalette(rng, accent);
  const groundY = h * groundFrac;

  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, pal.sky[0]);
  sky.addColorStop(1, pal.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Soft cumulus behind the towers — the reference cards all have them.
  for (let i = 0; i < 5; i++) {
    const cxp = rng.float() * w;
    const cyp = h * (0.08 + rng.float() * 0.3);
    const cr = w * (0.12 + rng.float() * 0.18);
    const cloud = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, cr);
    cloud.addColorStop(0, withAlpha('#ffffff', 0.85));
    cloud.addColorStop(0.55, withAlpha(mixHex('#ffffff', pal.haze, 0.35), 0.4));
    cloud.addColorStop(1, withAlpha('#ffffff', 0));
    ctx.fillStyle = cloud;
    ctx.beginPath();
    ctx.ellipse(cxp, cyp, cr, cr * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Three depth bands, far to near.
  const bands: [Building[], number][] = [
    [band(rng, 12, pal.haze, 0.24, 0.46, false), 0.45],
    [band(rng, 10, pal.mid, 0.34, 0.62, true), 0.85],
    [band(rng, 8, pal.front, 0.2, 0.44, true), 1],
  ];
  for (const [buildings, alpha] of bands) {
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const b of buildings) drawBuilding(ctx, b, w, h, groundY, pal.glass);
    ctx.restore();
  }

  // One accent tower in the team's color so the city belongs to the franchise.
  const hero = band(rng, 1, mixHex(pal.mid, accent, 0.6), 0.58, 0.74, true)[0];
  hero.x = 0.06 + rng.float() * 0.72;
  hero.crown = 'spire';
  drawBuilding(ctx, hero, w, h, groundY, mixHex(pal.glass, accent, 0.35));

  // Street haze so the figure's feet sit in atmosphere, not on a hard line.
  const street = ctx.createLinearGradient(0, groundY - h * 0.09, 0, groundY + h * 0.06);
  street.addColorStop(0, withAlpha(pal.haze, 0));
  street.addColorStop(1, withAlpha(pal.haze, 0.65));
  ctx.fillStyle = street;
  ctx.fillRect(0, groundY - h * 0.09, w, h * 0.15);
}

/** The ellipse plinth the figure stands on, as in the reference inserts. */
export function drawBase(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rx: number, accent: string,
): void {
  // A light disc of ground haze, not a solid slab — a dark plinth reads as a
  // hole punched through the card rather than something to stand on.
  const tint = mixHex(accent, '#ffffff', 0.72);
  const g = ctx.createRadialGradient(cx, cy, rx * 0.06, cx, cy, rx);
  g.addColorStop(0, withAlpha('#ffffff', 0.85));
  g.addColorStop(0.55, withAlpha(tint, 0.6));
  g.addColorStop(1, withAlpha(tint, 0));
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, rx * 0.19, 0, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  // Rim light along the front edge.
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.9, rx * 0.16, 0, 0.15, Math.PI - 0.15);
  ctx.strokeStyle = withAlpha('#ffffff', 0.6);
  ctx.lineWidth = Math.max(1, rx * 0.014);
  ctx.stroke();
  // Tight contact shadow directly under the cleats.
  ctx.beginPath();
  ctx.ellipse(cx, cy + rx * 0.01, rx * 0.34, rx * 0.055, 0, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(shade(accent, -0.3), 0.34);
  ctx.fill();
}

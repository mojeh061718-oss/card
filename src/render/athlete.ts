/**
 * Athlete figure renderer — stylized poster treatment.
 *
 * Figures are authored as pose keyframes (joint coordinates in a normalized
 * 0..1 box, y-down) and built from tapered muscle VOLUMES rather than
 * uniform tubes — a limb swells over the belly and necks into the joint,
 * which is the difference between an athlete and a mannequin. The torso is
 * a single closed silhouette with deltoids, a waist and hips.
 *
 * The whole figure is then cut out behind a white die-cut keyline, mirroring
 * real card construction: a crisp cutout floated over a printed backdrop.
 *
 * Determinism: everything derives from (appearanceSeed, poseId, team colors).
 */

import { Rng } from '../engine/rng';
import type { Sport } from '../engine/world/teams';
import { shade, withAlpha, mixHex } from './color';
import {
  drawFootballHelmet, drawBattingHelmet, drawCap, drawGlove, drawMitt,
  drawCleat, drawKneePad, drawBand,
} from './equipment';
import {
  volume, limbShade, torsoPath, shoulderPad, neckColumn,
  SPINDLE, TAPER_IN, BELLY, FLAT as FLATW,
} from './anatomy';

interface Pt { x: number; y: number }

export interface PoseSpec {
  id: string;
  sport: Sport;
  /** Which way the figure is "moving" — streaks + shading direction. */
  motion: Pt;
  head: Pt;
  neck: Pt;
  pelvis: Pt;
  shoulderNear: Pt; elbowNear: Pt; wristNear: Pt;
  shoulderFar: Pt; elbowFar: Pt; wristFar: Pt;
  hipNear: Pt; kneeNear: Pt; ankleNear: Pt; toeNear: Pt;
  hipFar: Pt; kneeFar: Pt; ankleFar: Pt; toeFar: Pt;
  /** Prop anchor (ball / bat / glove) + orientation in radians. */
  prop?: { kind: 'football' | 'baseball' | 'bat' | 'glove'; at: Pt; angle: number };
}

const SKIN_TONES = ['#8d5524', '#a9744f', '#c68642', '#e0ac69', '#f1c27d', '#6b4226', '#3b2a1e'];

// ---------------------------------------------------------------------------
// Pose library. Coordinates hand-tuned in a 0..1 box (x right, y down).
// Anatomy sanity: shoulders sit ~0.06 below neck level and ~0.07 either side
// of the spine; hips ~0.045 either side of the pelvis.
// ---------------------------------------------------------------------------

export const POSES: PoseSpec[] = [
  {
    // QB, deep pass. Wide forward stride with the back foot up on its toes;
    // chest twisting downfield; throwing elbow ABOVE the shoulder line with
    // the hand back by the ear; off arm pulled tight to the chest to speed
    // the rotation up.
    id: 'qb-deep', sport: 'football', motion: { x: -0.75, y: -0.12 },
    head: { x: 0.455, y: 0.145 }, neck: { x: 0.475, y: 0.225 }, pelvis: { x: 0.505, y: 0.505 },
    shoulderNear: { x: 0.575, y: 0.285 }, elbowNear: { x: 0.655, y: 0.215 }, wristNear: { x: 0.565, y: 0.125 },
    shoulderFar: { x: 0.395, y: 0.29 }, elbowFar: { x: 0.335, y: 0.375 }, wristFar: { x: 0.45, y: 0.415 },
    hipNear: { x: 0.535, y: 0.505 }, kneeNear: { x: 0.625, y: 0.645 }, ankleNear: { x: 0.665, y: 0.815 }, toeNear: { x: 0.725, y: 0.865 },
    hipFar: { x: 0.472, y: 0.505 }, kneeFar: { x: 0.355, y: 0.635 }, ankleFar: { x: 0.275, y: 0.805 }, toeFar: { x: 0.205, y: 0.845 },
    prop: { kind: 'football', at: { x: 0.585, y: 0.10 }, angle: -1.1 },
  },
  {
    // RB, the hard cut. One leg planted at a severe angle carrying all the
    // weight, the other lifted high into the new direction. Center of
    // gravity low, torso leaning out over the plant. Ball clamped to the
    // ribs, free arm flung out horizontally for balance.
    id: 'rb-cut', sport: 'football', motion: { x: -0.95, y: -0.05 },
    head: { x: 0.395, y: 0.195 }, neck: { x: 0.435, y: 0.275 }, pelvis: { x: 0.525, y: 0.545 },
    shoulderNear: { x: 0.525, y: 0.315 }, elbowNear: { x: 0.495, y: 0.44 }, wristNear: { x: 0.395, y: 0.415 },
    shoulderFar: { x: 0.405, y: 0.32 }, elbowFar: { x: 0.545, y: 0.35 }, wristFar: { x: 0.685, y: 0.315 },
    hipNear: { x: 0.552, y: 0.545 }, kneeNear: { x: 0.665, y: 0.675 }, ankleNear: { x: 0.735, y: 0.835 }, toeNear: { x: 0.795, y: 0.86 },
    hipFar: { x: 0.495, y: 0.55 }, kneeFar: { x: 0.355, y: 0.585 }, ankleFar: { x: 0.30, y: 0.705 }, toeFar: { x: 0.235, y: 0.735 },
    prop: { kind: 'football', at: { x: 0.405, y: 0.40 }, angle: 1.15 },
  },
  {
    // Receiver at full extension for the grab — hands out past the helmet,
    // body stretched, both feet off the turf.
    id: 'wr-catch', sport: 'football', motion: { x: -0.3, y: -0.85 },
    head: { x: 0.50, y: 0.185 }, neck: { x: 0.50, y: 0.265 }, pelvis: { x: 0.50, y: 0.525 },
    shoulderNear: { x: 0.572, y: 0.30 }, elbowNear: { x: 0.62, y: 0.20 }, wristNear: { x: 0.60, y: 0.09 },
    shoulderFar: { x: 0.428, y: 0.30 }, elbowFar: { x: 0.38, y: 0.20 }, wristFar: { x: 0.42, y: 0.09 },
    hipNear: { x: 0.532, y: 0.525 }, kneeNear: { x: 0.60, y: 0.655 }, ankleNear: { x: 0.555, y: 0.79 }, toeNear: { x: 0.59, y: 0.845 },
    hipFar: { x: 0.468, y: 0.525 }, kneeFar: { x: 0.395, y: 0.64 }, ankleFar: { x: 0.43, y: 0.785 }, toeFar: { x: 0.385, y: 0.835 },
    prop: { kind: 'football', at: { x: 0.51, y: 0.055 }, angle: 0.25 },
  },
  {
    // Batter at the contact point. Back foot pivoted with the heel to the
    // sky, front leg completely straight and rigid as a block, hips fully
    // open, back shoulder noticeably lower than the front, both hands
    // driving the barrel through in a hard V.
    id: 'batter-contact', sport: 'baseball', motion: { x: -0.85, y: -0.18 },
    head: { x: 0.435, y: 0.185 }, neck: { x: 0.455, y: 0.265 }, pelvis: { x: 0.50, y: 0.53 },
    shoulderNear: { x: 0.558, y: 0.315 }, elbowNear: { x: 0.605, y: 0.365 }, wristNear: { x: 0.665, y: 0.305 },
    shoulderFar: { x: 0.418, y: 0.285 }, elbowFar: { x: 0.55, y: 0.35 }, wristFar: { x: 0.648, y: 0.31 },
    hipNear: { x: 0.535, y: 0.53 }, kneeNear: { x: 0.625, y: 0.675 }, ankleNear: { x: 0.665, y: 0.80 }, toeNear: { x: 0.615, y: 0.868 },
    hipFar: { x: 0.468, y: 0.53 }, kneeFar: { x: 0.40, y: 0.69 }, ankleFar: { x: 0.355, y: 0.855 }, toeFar: { x: 0.295, y: 0.875 },
    prop: { kind: 'bat', at: { x: 0.672, y: 0.30 }, angle: -0.5 },
  },
  {
    // Pitcher mid-delivery. Front leg braced and planted, back leg trailing
    // far behind with the toe scraping, hips square to the plate while the
    // chest stays closed, throwing forearm laid back near-parallel to the
    // ground, glove tucked hard into the ribcage.
    id: 'pitcher-delivery', sport: 'baseball', motion: { x: -0.8, y: 0.08 },
    head: { x: 0.455, y: 0.165 }, neck: { x: 0.47, y: 0.245 }, pelvis: { x: 0.50, y: 0.515 },
    shoulderNear: { x: 0.572, y: 0.285 }, elbowNear: { x: 0.685, y: 0.265 }, wristNear: { x: 0.795, y: 0.235 },
    shoulderFar: { x: 0.398, y: 0.295 }, elbowFar: { x: 0.365, y: 0.405 }, wristFar: { x: 0.46, y: 0.44 },
    hipNear: { x: 0.535, y: 0.515 }, kneeNear: { x: 0.685, y: 0.60 }, ankleNear: { x: 0.80, y: 0.715 }, toeNear: { x: 0.865, y: 0.755 },
    hipFar: { x: 0.468, y: 0.515 }, kneeFar: { x: 0.365, y: 0.665 }, ankleFar: { x: 0.305, y: 0.835 }, toeFar: { x: 0.245, y: 0.862 },
    prop: { kind: 'baseball', at: { x: 0.828, y: 0.222 }, angle: 0 },
  },
  {
    // Infielder firing across the diamond: crow hop into a sidearm release,
    // glove hand trailing back for counterbalance.
    id: 'fielder-throw', sport: 'baseball', motion: { x: -0.55, y: -0.28 },
    head: { x: 0.475, y: 0.16 }, neck: { x: 0.49, y: 0.24 }, pelvis: { x: 0.50, y: 0.515 },
    shoulderNear: { x: 0.572, y: 0.28 }, elbowNear: { x: 0.655, y: 0.225 }, wristNear: { x: 0.735, y: 0.175 },
    shoulderFar: { x: 0.412, y: 0.285 }, elbowFar: { x: 0.34, y: 0.255 }, wristFar: { x: 0.26, y: 0.19 },
    hipNear: { x: 0.535, y: 0.515 }, kneeNear: { x: 0.60, y: 0.665 }, ankleNear: { x: 0.545, y: 0.835 }, toeNear: { x: 0.60, y: 0.868 },
    hipFar: { x: 0.468, y: 0.515 }, kneeFar: { x: 0.375, y: 0.655 }, ankleFar: { x: 0.335, y: 0.82 }, toeFar: { x: 0.275, y: 0.848 },
    prop: { kind: 'glove', at: { x: 0.245, y: 0.175 }, angle: -0.5 },
  },
];

export function posesFor(sport: Sport): PoseSpec[] {
  return POSES.filter(p => p.sport === sport);
}

// ---------------------------------------------------------------------------
// Figure rendering
// ---------------------------------------------------------------------------

export interface AthleteStyle {
  jersey: string;      // team primary
  trim: string;        // team secondary
  pants: string;
  skin: string;
  jerseyNumber: number;
  sport: Sport;
  /** Nickname wordmark across the chest. */
  wordmark: string;
  pinstripes: boolean; // baseball whites
}

export function athleteStyle(
  appearanceSeed: bigint, jerseyNumber: number, sport: Sport,
  primary: string, secondary: string, wordmark = '',
): AthleteStyle {
  const rng = new Rng(appearanceSeed);
  const pantsWhite = rng.chance(0.5);
  return {
    jersey: primary,
    trim: secondary,
    pants: pantsWhite ? '#e8e6df' : shade(primary, -0.12),
    skin: rng.pick(SKIN_TONES),
    jerseyNumber,
    sport,
    wordmark,
    pinstripes: sport === 'baseball' && pantsWhite && rng.chance(0.5),
  };
}

/**
 * Draw the athlete into `ctx` filling the rect (x, y, w, h).
 * The caller composites this layer over the card background.
 */
export function drawAthlete(
  ctx: CanvasRenderingContext2D,
  pose: PoseSpec,
  style: AthleteStyle,
  x: number, y: number, w: number, h: number,
  appearanceSeed: bigint,
): void {
  const rng = new Rng(appearanceSeed);
  const jx = (rng.float() - 0.5) * 0.01, jy = (rng.float() - 0.5) * 0.01;
  const S = (p: Pt): Pt => ({ x: x + (p.x + jx) * w, y: y + (p.y + jy) * h });
  const P = {
    head: S(pose.head), neck: S(pose.neck), pelvis: S(pose.pelvis),
    sN: S(pose.shoulderNear), eN: S(pose.elbowNear), wN: S(pose.wristNear),
    sF: S(pose.shoulderFar), eF: S(pose.elbowFar), wF: S(pose.wristFar),
    hN: S(pose.hipNear), kN: S(pose.kneeNear), aN: S(pose.ankleNear), tN: S(pose.toeNear),
    hF: S(pose.hipFar), kF: S(pose.kneeFar), aF: S(pose.ankleFar), tF: S(pose.toeFar),
  };
  const u = Math.min(w, h);
  const armW = 0.058 * u, foreW = 0.044 * u, legW = 0.085 * u, calfW = 0.06 * u;
  const skinDark = shade(style.skin, -0.08);
  const jerseyDark = shade(style.jersey, -0.12);
  const pantsDark = shade(style.pants, -0.1);
  const far = (c: string) => shade(c, -0.1);

  // Light comes from the side the figure is moving away from.
  const lightX = -pose.motion.x, lightY = -pose.motion.y;

  // --- FAR limbs (painter's order, and dimmed for depth) ---
  volume(ctx, P.sF, P.eF, armW * 0.95, TAPER_IN, far(jerseyDark), 0.06);
  volume(ctx, P.eF, P.wF, foreW * 0.95, BELLY, far(skinDark), -0.05);
  const farArmAngle = Math.atan2(P.wF.y - P.eF.y, P.wF.x - P.eF.x);
  if (style.sport === 'football') {
    drawGlove(ctx, P.wF.x, P.wF.y, foreW * 1.1, farArmAngle,
      far(shade(style.jersey, -0.18)), far(shade(style.trim, -0.1)));
  } else {
    ctx.beginPath();
    ctx.arc(P.wF.x, P.wF.y, foreW * 0.48, 0, Math.PI * 2);
    ctx.fillStyle = far(skinDark);
    ctx.fill();
  }
  volume(ctx, P.hF, P.kF, legW * 0.98, SPINDLE, far(pantsDark), 0.05);
  volume(ctx, P.kF, P.aF, calfW * 1.0, BELLY, far(pantsDark), -0.04);
  if (style.sport === 'baseball') {
    const midF = { x: (P.kF.x + P.aF.x) / 2, y: (P.kF.y + P.aF.y) / 2 };
    volume(ctx, midF, P.aF, calfW * 0.88, TAPER_IN, far(style.jersey));
  }
  drawCleat(ctx, P.aF.x, P.aF.y, P.tF.x, P.tF.y, calfW * 1.05, '#26262c', far(style.trim));
  if (style.sport === 'football') {
    drawKneePad(ctx, P.kF.x, P.kF.y, legW * 0.82,
      Math.atan2(P.aF.y - P.hF.y, P.aF.x - P.hF.x) + Math.PI / 2,
      far(shade(style.pants, -0.07)));
  }

  // --- Neck, then torso silhouette ---
  neckColumn(ctx, P.neck, { x: P.head.x, y: P.head.y + 0.035 * u }, u, skinDark);

  torsoPath(ctx, P.neck, P.sN, P.sF, P.hN, P.hF, u);
  ctx.fillStyle = style.jersey;
  ctx.fill();

  // Torso detail, clipped to the silhouette.
  ctx.save();
  torsoPath(ctx, P.neck, P.sN, P.sF, P.hN, P.hF, u);
  ctx.clip();

  // Form shading: chest catches light, flanks fall away.
  const shoulderW = Math.hypot(P.sN.x - P.sF.x, P.sN.y - P.sF.y);
  const bodyGrad = ctx.createLinearGradient(
    P.sF.x - shoulderW * 0.5, P.sF.y, P.sN.x + shoulderW * 0.5, P.hN.y,
  );
  bodyGrad.addColorStop(0, withAlpha('#000014', 0.34));
  bodyGrad.addColorStop(0.42, withAlpha('#ffffff', 0.12));
  bodyGrad.addColorStop(1, withAlpha('#000014', 0.3));
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(x, y, w, h);

  // Fabric folds gathering at the waist — cheap, and reads as cloth.
  ctx.strokeStyle = withAlpha(shade(style.jersey, -0.26), 0.4);
  ctx.lineWidth = 0.006 * u;
  const waist = { x: (P.hN.x + P.hF.x) / 2, y: (P.hN.y + P.hF.y) / 2 };
  for (const off of [-0.35, 0, 0.35]) {
    ctx.beginPath();
    ctx.moveTo(waist.x + off * shoulderW * 0.5, waist.y - 0.02 * u);
    ctx.quadraticCurveTo(
      waist.x + off * shoulderW * 0.3, waist.y - 0.075 * u,
      waist.x + off * shoulderW * 0.55, waist.y - 0.12 * u,
    );
    ctx.stroke();
  }

  const lean = Math.atan2(P.pelvis.x - P.neck.x, P.pelvis.y - P.neck.y);
  if (style.pinstripes) {
    ctx.strokeStyle = withAlpha(shade(style.jersey, -0.22), 0.55);
    ctx.lineWidth = 0.005 * u;
    for (let sx = -6; sx <= 6; sx++) {
      const px = P.neck.x + sx * 0.022 * u;
      ctx.beginPath();
      ctx.moveTo(px + Math.tan(lean) * -0.1 * u, P.neck.y - 0.05 * u);
      ctx.lineTo(px + Math.tan(lean) * 0.28 * u, P.pelvis.y + 0.06 * u);
      ctx.stroke();
    }
  } else {
    // Side panels ride the flanks of the spine, not the shoulder joints —
    // in a rotated pose the joints sit inside the body and the stripes would
    // cut straight across the chest.
    const spineTop = { x: (P.sN.x + P.sF.x) / 2, y: (P.sN.y + P.sF.y) / 2 };
    const spineBot = { x: (P.hN.x + P.hF.x) / 2, y: (P.hN.y + P.hF.y) / 2 };
    const sdx = spineBot.x - spineTop.x, sdy = spineBot.y - spineTop.y;
    const slen = Math.hypot(sdx, sdy) || 1;
    const flank = 0.088 * u;
    ctx.strokeStyle = withAlpha(style.trim, 0.85);
    ctx.lineWidth = 0.018 * u;
    for (const side of [1, -1]) {
      const ox = (-sdy / slen) * side * flank;
      const oy = (sdx / slen) * side * flank;
      ctx.beginPath();
      ctx.moveTo(spineTop.x + ox, spineTop.y + oy);
      ctx.lineTo(spineBot.x + ox * 0.78, spineBot.y + oy * 0.78);
      ctx.stroke();
    }
  }

  // Collar + yoke.
  ctx.strokeStyle = style.trim;
  ctx.lineWidth = 0.016 * u;
  ctx.beginPath();
  ctx.moveTo(P.neck.x - 0.045 * u, P.neck.y + 0.008 * u);
  ctx.lineTo(P.neck.x, P.neck.y + 0.05 * u);
  ctx.lineTo(P.neck.x + 0.045 * u, P.neck.y + 0.008 * u);
  ctx.stroke();

  // Wordmark + number on the chest.
  const chest = { x: (P.neck.x + P.pelvis.x) / 2, y: P.neck.y + (P.pelvis.y - P.neck.y) * 0.40 };
  ctx.translate(chest.x, chest.y);
  ctx.rotate(-lean * 0.6);
  if (style.wordmark) {
    const word = style.wordmark.toUpperCase();
    let px = 0.033 * u;
    ctx.font = `700 ${px}px "Arial Narrow", Arial, sans-serif`;
    const maxW = 0.145 * u;
    const measured = ctx.measureText(word).width;
    if (measured > maxW) px *= maxW / measured;
    ctx.font = `700 ${px}px "Arial Narrow", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = px * 0.22;
    ctx.strokeStyle = shade(style.trim, -0.25);
    ctx.strokeText(word, 0, -0.075 * u);
    ctx.fillStyle = style.trim;
    ctx.fillText(word, 0, -0.075 * u);
  }
  const numSize = 0.098 * u;
  ctx.font = `900 ${numSize}px "Arial Narrow", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = numSize * 0.18;
  ctx.strokeStyle = shade(style.trim, -0.24);
  ctx.strokeText(String(style.jerseyNumber), 0, 0.02 * u);
  ctx.fillStyle = style.trim;
  ctx.fillText(String(style.jerseyNumber), 0, 0.02 * u);
  ctx.rotate(lean * 0.6);
  ctx.translate(-chest.x, -chest.y);

  if (style.sport === 'baseball') {
    ctx.strokeStyle = shade(style.trim, -0.15);
    ctx.lineWidth = 0.018 * u;
    ctx.beginPath();
    ctx.moveTo(P.hF.x - 0.02 * u, P.hF.y - 0.005 * u);
    ctx.lineTo(P.hN.x + 0.02 * u, P.hN.y - 0.005 * u);
    ctx.stroke();
  }
  ctx.restore();

  // Shoulder pads sit over the jersey and define the football silhouette.
  if (style.sport === 'football') {
    shoulderPad(ctx, P.sF, P.neck, u, far(shade(style.jersey, -0.08)), 1.05);
    shoulderPad(ctx, P.sN, P.neck, u, shade(style.jersey, 0.05), 1.15);
  }

  // --- NEAR leg ---
  volume(ctx, P.hN, P.kN, legW * 1.06, SPINDLE, style.pants, 0.05);
  limbShade(ctx, P.hN, P.kN, legW * 1.06, lightX, lightY);
  volume(ctx, P.kN, P.aN, calfW * 1.05, BELLY, style.pants, -0.05);
  limbShade(ctx, P.kN, P.aN, calfW * 1.05, lightX, lightY);
  if (style.sport === 'baseball') {
    const mid = { x: (P.kN.x + P.aN.x) / 2, y: (P.kN.y + P.aN.y) / 2 };
    volume(ctx, mid, P.aN, calfW * 0.92, TAPER_IN, style.jersey);
    const quarter = { x: (mid.x + P.kN.x) / 2, y: (mid.y + P.kN.y) / 2 };
    volume(ctx, quarter, mid, calfW * 0.96, FLATW, style.trim);
  }
  drawCleat(ctx, P.aN.x, P.aN.y, P.tN.x, P.tN.y, calfW * 1.15, '#2b2b31', style.trim);
  if (style.sport === 'football') {
    drawKneePad(ctx, P.kN.x, P.kN.y, legW * 0.86,
      Math.atan2(P.aN.y - P.hN.y, P.aN.x - P.hN.x) + Math.PI / 2,
      shade(style.pants, -0.06));
  }

  // --- Head + headgear ---
  const headR = 0.058 * u;
  const dir = pose.motion.x >= 0 ? 1 : -1;
  if (style.sport === 'football') {
    drawFootballHelmet(ctx, P.head.x, P.head.y, headR, dir, style.jersey, style.trim, style.skin);
  } else {
    ctx.beginPath();
    ctx.ellipse(P.head.x, P.head.y, headR * 0.9, headR * 0.98, 0, 0, Math.PI * 2);
    ctx.fillStyle = style.skin;
    ctx.fill();
    // Jawline shadow so the head has a front and a side.
    ctx.beginPath();
    ctx.ellipse(P.head.x - dir * headR * 0.42, P.head.y + headR * 0.16,
      headR * 0.5, headR * 0.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(shade(style.skin, -0.3), 0.35);
    ctx.fill();
    if (pose.prop?.kind === 'bat') {
      drawBattingHelmet(ctx, P.head.x, P.head.y, headR, dir, style.jersey, style.trim, style.skin);
    } else {
      drawCap(ctx, P.head.x, P.head.y, headR, dir, style.jersey, style.trim);
    }
    ctx.fillStyle = 'rgba(27, 16, 8, 0.82)';
    ctx.beginPath();
    ctx.ellipse(P.head.x + dir * headR * 0.44, P.head.y + headR * 0.1, headR * 0.1, headR * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(P.head.x + dir * headR * 0.02, P.head.y + headR * 0.14, headR * 0.09, headR * 0.065, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(24, 20, 16, 0.42)';
    ctx.beginPath();
    ctx.ellipse(P.head.x + dir * headR * 0.44, P.head.y + headR * 0.3, headR * 0.16, headR * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- NEAR arm, over everything ---
  volume(ctx, P.sN, P.eN, armW * 1.06, TAPER_IN, style.jersey, 0.07);
  limbShade(ctx, P.sN, P.eN, armW * 1.06, lightX, lightY);
  // Sleeve cuff.
  const cuffA = { x: P.sN.x + (P.eN.x - P.sN.x) * 0.44, y: P.sN.y + (P.eN.y - P.sN.y) * 0.44 };
  const cuffB = { x: P.sN.x + (P.eN.x - P.sN.x) * 0.56, y: P.sN.y + (P.eN.y - P.sN.y) * 0.56 };
  volume(ctx, cuffA, cuffB, armW * 1.02, FLATW, style.trim);
  volume(ctx, P.eN, P.wN, foreW * 1.02, BELLY, style.skin, -0.06);
  limbShade(ctx, P.eN, P.wN, foreW * 1.02, lightX, lightY);
  const nearArmAngle = Math.atan2(P.wN.y - P.eN.y, P.wN.x - P.eN.x);
  drawBand(
    ctx,
    P.wN.x - Math.cos(nearArmAngle) * foreW * 0.85,
    P.wN.y - Math.sin(nearArmAngle) * foreW * 0.85,
    foreW * 1.05, nearArmAngle + Math.PI / 2, '#f0ede4',
  );
  if (style.sport === 'football') {
    drawGlove(ctx, P.wN.x, P.wN.y, foreW * 1.25, nearArmAngle,
      shade(style.jersey, -0.14), style.trim);
  } else {
    ctx.beginPath();
    ctx.arc(P.wN.x, P.wN.y, foreW * 0.54, 0, Math.PI * 2);
    ctx.fillStyle = style.skin;
    ctx.fill();
  }

  // --- Prop ---
  if (pose.prop) {
    const at = { x: x + pose.prop.at.x * w, y: y + pose.prop.at.y * h };
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(pose.prop.angle);
    switch (pose.prop.kind) {
      case 'football': {
        const rw = 0.062 * u, rh = 0.038 * u;
        ctx.beginPath();
        ctx.ellipse(0, 0, rw, rh, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#6b3a1f';
        ctx.fill();
        ctx.strokeStyle = withAlpha('#3d2113', 0.6);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.strokeStyle = '#f0ede4';
        ctx.lineWidth = rh * 0.13;
        ctx.beginPath();
        ctx.moveTo(-rw * 0.38, 0);
        ctx.lineTo(rw * 0.38, 0);
        ctx.stroke();
        break;
      }
      case 'baseball': {
        const r = 0.026 * u;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = '#f3f1e8';
        ctx.fill();
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = r * 0.2;
        ctx.beginPath();
        ctx.arc(-r * 0.42, 0, r * 0.8, -1, 1);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(r * 0.42, 0, r * 0.8, Math.PI - 1, Math.PI + 1);
        ctx.stroke();
        break;
      }
      case 'bat': {
        const bl = 0.32 * u;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#b98a4a';
        ctx.lineWidth = 0.024 * u;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(bl * 0.35, 0);
        ctx.stroke();
        ctx.lineWidth = 0.042 * u;
        ctx.beginPath();
        ctx.moveTo(bl * 0.35, 0);
        ctx.lineTo(bl, 0);
        ctx.stroke();
        break;
      }
      case 'glove': {
        ctx.rotate(-pose.prop.angle);
        drawMitt(ctx, 0, 0, 0.05 * u, pose.prop.angle);
        break;
      }
    }
    ctx.restore();
  }
}

/**
 * Full figure layer with cel shading + rim light, rendered offscreen and
 * blitted with a cutout drop shadow. Motion streaks go behind the figure.
 */
export function renderAthleteLayer(
  target: CanvasRenderingContext2D,
  pose: PoseSpec,
  style: AthleteStyle,
  x: number, y: number, w: number, h: number,
  appearanceSeed: bigint,
  accent: string,
): void {
  const off = document.createElement('canvas');
  off.width = Math.ceil(w);
  off.height = Math.ceil(h);
  const ctx = off.getContext('2d')!;

  drawAthlete(ctx, pose, style, 0, 0, w, h, appearanceSeed);

  // Cel shading composited into the silhouette.
  ctx.globalCompositeOperation = 'source-atop';
  const mx = pose.motion.x, my = pose.motion.y;
  const len = Math.hypot(mx, my) || 1;
  const lx = -mx / len, ly = -my / len; // light from opposite the motion
  const cx = w / 2, cy = h / 2, r = Math.max(w, h) * 0.62;
  const shadeGrad = ctx.createLinearGradient(cx + lx * r, cy + ly * r, cx - lx * r, cy - ly * r);
  shadeGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
  shadeGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
  shadeGrad.addColorStop(1, 'rgba(0,0,20,0.30)');
  ctx.fillStyle = shadeGrad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  // Motion streaks behind the figure.
  target.save();
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) / 4;
    const sy = y + h * (0.32 + t * 0.34);
    const sx = x + w * 0.5;
    const slen = w * (0.4 + t * 0.2);
    const sgrad = target.createLinearGradient(
      sx - mx * slen, sy - my * slen * 0.4, sx + mx * slen * 0.4, sy + my * slen * 0.15,
    );
    sgrad.addColorStop(0, withAlpha(accent, 0));
    sgrad.addColorStop(1, withAlpha(accent, 0.3 - t * 0.15));
    target.strokeStyle = sgrad;
    target.lineWidth = h * 0.01 * (1 + t);
    target.lineCap = 'round';
    target.beginPath();
    target.moveTo(sx - mx * slen, sy - my * slen * 0.4);
    target.quadraticCurveTo(sx, sy + h * 0.015, sx + mx * slen * 0.35, sy + my * slen * 0.12);
    target.stroke();
  }
  target.restore();

  // Rim light along the lit edge: tinted silhouette minus offset silhouette.
  const rim = document.createElement('canvas');
  rim.width = off.width;
  rim.height = off.height;
  const rctx = rim.getContext('2d')!;
  rctx.drawImage(off, 0, 0);
  rctx.globalCompositeOperation = 'source-in';
  rctx.fillStyle = mixHex(accent, '#ffffff', 0.7);
  rctx.fillRect(0, 0, w, h);
  rctx.globalCompositeOperation = 'destination-out';
  rctx.drawImage(off, lx * w * 0.014, ly * h * 0.014);

  // Die-cut keyline. Premium inserts photoshop a thick WHITE sticker outline
  // around the cutout — it separates the figure from any background far more
  // aggressively than a dark line, and it's the single most recognizable
  // trait of the style. A thin dark line outside it keeps the edge defined.
  const keyline = (radius: number, color: string): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = off.width;
    c.height = off.height;
    const kctx = c.getContext('2d')!;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      kctx.drawImage(off, Math.cos(ang) * radius, Math.sin(ang) * radius);
    }
    kctx.globalCompositeOperation = 'source-in';
    kctx.fillStyle = color;
    kctx.fillRect(0, 0, c.width, c.height);
    return c;
  };
  const kr = Math.max(2, w * 0.0075);
  const outline = keyline(kr * 1.5, 'rgba(18,18,26,0.55)');
  const sticker = keyline(kr, '#f7f5ef');

  // Blit: shadow → dark edge → white sticker → figure → rim.
  target.save();
  target.shadowColor = 'rgba(0,0,0,0.55)';
  target.shadowBlur = Math.max(8, w * 0.04);
  target.shadowOffsetX = w * 0.014 * (mx >= 0 ? -1 : 1);
  target.shadowOffsetY = h * 0.02;
  target.drawImage(outline, x, y);
  target.restore();
  target.drawImage(sticker, x, y);
  target.drawImage(off, x, y);
  target.save();
  target.globalAlpha = 0.65;
  target.globalCompositeOperation = 'lighter';
  target.drawImage(rim, x, y);
  target.restore();
}
